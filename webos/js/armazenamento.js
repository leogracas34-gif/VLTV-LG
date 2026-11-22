// VLTV Play - webOS | Progresso de reprodução (continuar de onde parou) e favoritos (Minha Lista).
// Tudo fica guardado na própria TV, separado por usuário.
(function () {
  'use strict';

  var MAX_PROGRESSO = 500;      // quantos títulos/episódios lembrar
  var FIM_PERCENTUAL = 0.95;    // a partir daqui o título conta como assistido

  function usuario() {
    var s = VLTV.sessao.ler();
    if (!s) { return 'padrao'; }
    return s.modo === 'm3u' ? 'm3u' : (s.user || 'padrao');
  }

  // ── Perfil (o mesmo do celular) ───────────────────────────────────
  // Escolhido na tela "Quem está assistindo?". Com perfil, progresso, favoritos e "continuar assistindo" ficam
  // separados por perfil (chave usuário + perfil), igual ao app do celular. Sem perfil, tudo como sempre foi (só por usuário).
  var perfilMemo = { u: null, v: null };

  function perfilAtual() {
    var s = VLTV.sessao.ler();
    if (!s || s.modo !== 'usuario') { return null; }
    var u = usuario();
    if (perfilMemo.u === u) { return perfilMemo.v; }
    var v = null;
    try { v = JSON.parse(window.localStorage.getItem('vltv_perfil_' + u) || 'null'); } catch (e) { v = null; }
    if (!v || !v.id) { v = null; }
    perfilMemo = { u: u, v: v };
    return v;
  }

  function dono() {
    var u = usuario();
    var p = perfilAtual();
    return p ? u + '__' + p.id : u;
  }

  // Na 1ª escolha de perfil nesta TV, o que já estava guardado (por usuário) vira do perfil escolhido. Só acontece uma vez.
  function migrarLegado(u, pid) {
    try {
      if (window.localStorage.getItem('vltv_migrou_' + u)) { return; }
      ['prog', 'fav', 'cont', 'aval'].forEach(function (n) {
        var antigo = window.localStorage.getItem('vltv_' + n + '_' + u);
        var novo = 'vltv_' + n + '_' + u + '__' + pid;
        if (antigo !== null && window.localStorage.getItem(novo) === null) { window.localStorage.setItem(novo, antigo); }
      });
      window.localStorage.setItem('vltv_migrou_' + u, pid);
    } catch (e) { /* ignora */ }
  }

  function definirPerfil(p) {
    var u = usuario();
    try { window.localStorage.setItem('vltv_perfil_' + u, JSON.stringify(p)); } catch (e) { /* ignora */ }
    perfilMemo = { u: null, v: null };
    migrarLegado(u, p.id);
  }

  function chave(nome) { return 'vltv_' + nome + '_' + dono(); }

  function ler(nomeChave, padrao) {
    try {
      var texto = window.localStorage.getItem(nomeChave);
      return texto ? JSON.parse(texto) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravar(nomeChave, valor) {
    try { window.localStorage.setItem(nomeChave, JSON.stringify(valor)); } catch (e) { /* ignora */ }
  }

  // ── Progresso ─────────────────────────────────────────────────────
  // chave do título: 'f' + id (filme) ou 'e' + id (episódio).
  // Guarda { pos, dur, t, fim } com pos e dur em segundos e t = quando foi visto por último.
  function progresso(id) {
    var todos = ler(chave('prog'), {});
    return todos[id] || null;
  }

  function podar(todos) {
    var ids = Object.keys(todos);
    if (ids.length <= MAX_PROGRESSO) { return; }
    ids.sort(function (a, b) { return (todos[a].t || 0) - (todos[b].t || 0); });
    for (var i = 0; i < ids.length - MAX_PROGRESSO; i++) { delete todos[ids[i]]; }
  }

  function salvarProgresso(id, pos, dur, itemPlayer) {
    if (!id || !isFinite(pos) || !isFinite(dur) || dur <= 0) { return; }
    var todos = ler(chave('prog'), {});
    var fim = pos / dur >= FIM_PERCENTUAL;
    todos[id] = {
      pos: fim ? 0 : Math.floor(pos),
      dur: Math.floor(dur),
      t: new Date().getTime(),
      fim: fim
    };
    podar(todos);
    gravar(chave('prog'), todos);
    // Sincroniza com os outros aparelhos (celular <-> TV) pela VPS.
    if (VLTV.nuvem) { VLTV.nuvem.enviarProgresso(id, pos, dur, fim, metaDoItem(id, itemPlayer) || metaDeChave(id)); }
  }

  // ── Favoritos (Minha Lista) ───────────────────────────────────────
  // Cada favorito: { tipo: 'filmes' | 'series' | 'canais', id, nome, capa, raw }
  // "raw" é o item do painel (só os campos úteis): com ele o favorito abre direto, sem buscar de novo.
  var CAMPOS_RAW = ['stream_id', 'series_id', 'name', 'stream_icon', 'cover', 'container_extension', 'rating',
                    'plot', 'genre', 'releaseDate', 'release_date', 'releasedate', 'backdrop_path', 'cast',
                    'director', 'category_id', 'url', 'num', 'epg_channel_id', 'is_adult'];

  function enxugar(raw) {
    if (!raw || typeof raw !== 'object') { return null; }
    var saida = {};
    CAMPOS_RAW.forEach(function (c) { if (raw[c] !== undefined && raw[c] !== null) { saida[c] = raw[c]; } });
    return saida;
  }

  function favoritos() { return ler(chave('fav'), []); }

  function indiceFavorito(lista, tipo, id) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].tipo === tipo && String(lista[i].id) === String(id)) { return i; }
    }
    return -1;
  }

  function ehFavorito(tipo, id) { return indiceFavorito(favoritos(), tipo, id) !== -1; }

  // Item do painel de um favorito (os antigos, sem "raw", são remontados com o que foi guardado).
  function rawDe(f) {
    if (f.raw) { return f.raw; }
    if (f.tipo === 'series') { return { series_id: f.id, name: f.nome, cover: f.capa }; }
    return { stream_id: f.id, name: f.nome, stream_icon: f.capa };
  }

  // Favoritos de um tipo, do mais novo para o mais antigo: lista de itens do painel.
  function favoritosDe(tipo) {
    return favoritos().filter(function (f) { return f.tipo === tipo; }).reverse().map(rawDe);
  }

  // Devolve o novo estado: true = acabou de entrar na lista, false = saiu da lista.
  function alternarFavorito(fav) {
    var lista = favoritos();
    var i = indiceFavorito(lista, fav.tipo, fav.id);
    var agora;
    if (i === -1) {
      lista.push({ tipo: fav.tipo, id: fav.id, nome: fav.nome, capa: fav.capa, raw: enxugar(fav.raw) });
      agora = true;
    } else {
      lista.splice(i, 1);
      agora = false;
    }
    gravar(chave('fav'), lista);
    var pf = prefixoFav(fav.tipo);
    if (pf) {
      var tm = new Date().getTime();
      marcarFavT(pf + fav.id, tm);
      if (VLTV.nuvem) { VLTV.nuvem.favorito(pf + fav.id, agora, metaFav({ tipo: fav.tipo, id: fav.id, nome: fav.nome, capa: fav.capa, raw: fav.raw }), tm); }
    }
    return agora;
  }

  // ── Continuar assistindo ──────────────────────────────────────────
  // Mesmo padrão dos favoritos: guarda o item do painel ("raw") para abrir direto, sem buscar de novo.
  // O registro é feito quando o usuário dá o play (tela de detalhes); quem decide se ainda tem o que
  // continuar é o progresso salvo (o mesmo que a tela de detalhes usa para o botão CONTINUAR).
  var MAX_CONTINUAR = 60;
  var MIN_RETOMAR_S = 30;       // igual à tela de detalhes: só conta como "em andamento" depois de 30 s

  function listaContinuar() { return ler(chave('cont'), []); }

  // reg: { tipo: 'filmes' | 'series', id, nome, capa, raw, chaves }
  // chaves (só séries): chave de todos os episódios, em ordem ('e' + id), para achar o último visto.
  function registrarContinuar(reg) {
    if (!reg || (reg.tipo !== 'filmes' && reg.tipo !== 'series')) { return; }
    if (reg.id === undefined || reg.id === null) { return; }
    var lista = listaContinuar();
    var i = indiceFavorito(lista, reg.tipo, reg.id);
    if (i !== -1) { lista.splice(i, 1); }
    lista.push({
      tipo: reg.tipo, id: reg.id, nome: reg.nome, capa: reg.capa,
      raw: enxugar(reg.raw), chaves: reg.tipo === 'series' ? (reg.chaves || []) : null
    });
    while (lista.length > MAX_CONTINUAR) { lista.shift(); }
    gravar(chave('cont'), lista);
  }

  // Títulos de um tipo que ainda têm algo para continuar, do visto por último para o mais antigo:
  // lista de itens do painel (igual favoritosDe).
  //  - filme: parou no meio (nem começou, nem terminou);
  //  - série: o último episódio visto parou no meio, ou terminou e ainda existe um próximo episódio.
  function continuarDe(tipo) {
    var prog = ler(chave('prog'), {});     // lê o progresso uma vez só (séries podem ter centenas de episódios)
    var achados = [];
    listaContinuar().forEach(function (f) {
      if (f.tipo !== tipo) { return; }
      var quando = 0;
      if (tipo === 'filmes') {
        var p = prog['f' + f.id];
        if (!p || p.fim || !(p.pos > MIN_RETOMAR_S) || !(p.dur > 0)) { return; }
        quando = p.t || 0;
      } else {
        var chaves = Array.isArray(f.chaves) ? f.chaves : [];
        var melhor = -1;
        chaves.forEach(function (c, i) {
          var pe = prog[c];
          if (pe && pe.t && (melhor === -1 || pe.t > prog[chaves[melhor]].t)) { melhor = i; }
        });
        if (melhor === -1) { return; }
        var ult = prog[chaves[melhor]];
        var emAndamento = !ult.fim && ult.pos > MIN_RETOMAR_S;
        if (!emAndamento && !(ult.fim && melhor + 1 < chaves.length)) { return; }
        quando = ult.t || 0;
      }
      achados.push({ t: quando, raw: rawDe(f) });
    });
    achados.sort(function (a, b) { return b.t - a.t; });
    return achados.map(function (a) { return a.raw; });
  }

  // ── Avaliação (Não é para mim / Gostei / Amei!) ──────────────────
  // Guardada por título: { 'series:123': 'n' | 'g' | 'a' }. Escolher a mesma opção de novo remove a avaliação.
  function avaliacao(tipo, id) {
    var todas = ler(chave('aval'), {});
    return todas[tipo + ':' + id] || '';
  }

  function definirAvaliacao(tipo, id, valor) {
    var todas = ler(chave('aval'), {});
    var k = tipo + ':' + id;
    if (!valor || todas[k] === valor) { delete todas[k]; } else { todas[k] = valor; }
    gravar(chave('aval'), todas);
    return todas[k] || '';
  }


  // ── Sincronização com a nuvem (ver nuvem.js) ──────────────────────
  // Tipo do favorito <-> prefixo da chave na nuvem: filme 'f', série 's', canal 'c'.
  function prefixoFav(tipo) { return tipo === 'filmes' ? 'f' : tipo === 'series' ? 's' : tipo === 'canais' ? 'c' : ''; }
  function tipoDoPrefixo(p) { return p === 'f' ? 'filmes' : p === 's' ? 'series' : p === 'c' ? 'canais' : ''; }

  function marcarFavT(k, t) {
    var m = ler(chave('favt'), {});
    m[k] = t;
    gravar(chave('favt'), m);
  }

  // Dados que viajam junto com o favorito, para o outro aparelho conseguir montar o card.
  function metaFav(f) {
    var nome = String(f.nome || '').slice(0, 200);
    var capa = String(f.capa || '').slice(0, 400);
    if (f.tipo === 'canais') {
      var r = f.raw || {};
      return { n: nome, i: capa, e: String(r.epg_channel_id || '').slice(0, 200), c: String(r.category_id === undefined || r.category_id === null ? '' : r.category_id).slice(0, 60), id: Number(f.id) || 0 };
    }
    return { n: nome, i: capa };
  }

  function capaDoContinuar(tipo, id) {
    var lista = listaContinuar();
    var i = indiceFavorito(lista, tipo, id);
    return i === -1 ? '' : (lista[i].capa || '');
  }

  // Meta do progresso a partir do item que o player está tocando.
  function metaDoItem(chaveTitulo, item) {
    if (!item) { return null; }
    if (chaveTitulo.charAt(0) === 'f') {
      var n = item.logoNome || item.titulo;
      return n ? { n: String(n).slice(0, 300), i: String(capaDoContinuar('filmes', item.id) || '').slice(0, 400), s: false } : null;
    }
    var ns = item.nomeSerie;
    if (!ns || !item.logoId) { return null; }
    return { n: String(ns).slice(0, 300), i: String(capaDoContinuar('series', item.logoId) || '').slice(0, 400), s: true, sid: Number(item.logoId) || item.logoId };
  }

  // Meta do progresso a partir de "Continuar assistindo" (usado ao subir o histórico que já existia).
  function metaDeChave(k) {
    var lista = listaContinuar();
    var id = k.substring(1);
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      if (k.charAt(0) === 'f' && f.tipo === 'filmes' && String(f.id) === id) { return { n: f.nome, i: f.capa || '', s: false }; }
      if (k.charAt(0) === 'e' && f.tipo === 'series' && Array.isArray(f.chaves) && f.chaves.indexOf(k) !== -1) {
        return { n: f.nome, i: f.capa || '', s: true, sid: Number(f.id) || f.id };
      }
    }
    return null;
  }

  // Histórico que já existe nesta TV (só o que tem nome para mostrar no outro aparelho).
  function sementeProgresso(max) {
    var prog = ler(chave('prog'), {});
    var ks = Object.keys(prog).sort(function (a, b) { return (prog[b].t || 0) - (prog[a].t || 0); }).slice(0, max);
    var saida = [];
    ks.forEach(function (k) {
      var p = prog[k];
      var meta = metaDeChave(k);
      if (!meta || !p || !(p.dur > 0) || !p.t) { return; }
      saida.push({ k: k, pos: p.fim ? p.dur : (p.pos || 0), dur: p.dur, t: p.t, fim: !!p.fim, meta: meta });
    });
    return saida;
  }

  // Favoritos que já existem nesta TV. t antigo (1) quando não se sabe quando mudou: uma remoção feita em outro aparelho vence.
  function sementeFavoritos(max) {
    var tm = ler(chave('favt'), {});
    var saida = [];
    favoritos().slice(-max).forEach(function (f) {
      var pf = prefixoFav(f.tipo);
      if (!pf) { return; }
      var k = pf + f.id;
      saida.push({ k: k, t: tm[k] || 1, removido: false, meta: metaFav(f) });
    });
    return saida;
  }

  // Garante o card em "Continuar assistindo" para um título que veio de outro aparelho (só se ainda não existe).
  function garantirContinuar(cont, k, meta) {
    var id = k.substring(1);
    var num = Number(id);
    var idv = isFinite(num) ? num : id;
    if (k.charAt(0) === 'f') {
      if (indiceFavorito(cont, 'filmes', id) !== -1) { return false; }
      cont.push({ tipo: 'filmes', id: idv, nome: meta.n, capa: meta.i || '', raw: null, chaves: null });
    } else {
      if (!meta.sid) { return false; }   // sem o id da série não dá para abrir (app do celular antigo)
      var i = indiceFavorito(cont, 'series', meta.sid);
      if (i !== -1) {
        if (Array.isArray(cont[i].chaves) && cont[i].chaves.indexOf(k) === -1) { cont[i].chaves.push(k); return true; }
        return false;
      }
      cont.push({ tipo: 'series', id: meta.sid, nome: meta.n, capa: meta.i || '', raw: null, chaves: [k] });
    }
    while (cont.length > MAX_CONTINUAR) { cont.shift(); }
    return true;
  }

  // Aplica o progresso que veio de outros aparelhos. Vale o registro mais novo. Devolve true se algo mudou aqui.
  function aplicarProgresso(itens) {
    var prog = ler(chave('prog'), {});
    var cont = null;
    var mudou = false;
    var mudouCont = false;
    itens.forEach(function (it) {
      var k = String(it.k || '');
      if (k.length < 2 || (k.charAt(0) !== 'f' && k.charAt(0) !== 'e')) { return; }
      var t = it.t || 0;
      var local = prog[k];
      if (local && (local.t || 0) >= t) { return; }      // o daqui é igual ou mais novo
      if (it.removido) { if (local) { delete prog[k]; mudou = true; } return; }
      var dur = Math.floor(it.dur || 0);
      if (!(dur > 0)) { return; }
      var fim = it.fim === true;
      prog[k] = { pos: fim ? 0 : Math.floor(it.pos || 0), dur: dur, t: t, fim: fim };
      mudou = true;
      if (!fim && it.meta && it.meta.n) {
        if (cont === null) { cont = listaContinuar(); }
        if (garantirContinuar(cont, k, it.meta)) { mudouCont = true; }
      }
    });
    if (mudou) { podar(prog); gravar(chave('prog'), prog); }
    if (mudouCont) { gravar(chave('cont'), cont); }
    return mudou;
  }

  // Aplica favoritos que vieram de outros aparelhos. Vale a mudança mais nova. Devolve true se a lista mudou.
  function aplicarFavoritos(itens) {
    var lista = favoritos();
    var tm = ler(chave('favt'), {});
    var mudou = false;
    itens.forEach(function (it) {
      var k = String(it.k || '');
      if (k.length < 2) { return; }
      var tipo = tipoDoPrefixo(k.charAt(0));
      if (!tipo) { return; }
      var id = k.substring(1);
      var t = it.t || 0;
      if (t <= (tm[k] || 0)) { return; }                 // a mudança daqui é igual ou mais nova
      var i = indiceFavorito(lista, tipo, id);
      if (it.removido) {
        if (i !== -1) { lista.splice(i, 1); mudou = true; }
      } else if (i === -1) {
        var m = it.meta || {};
        if (!m.n) { return; }                            // sem nome não dá para mostrar o card
        var num = Number(id);
        var idv = isFinite(num) ? num : id;
        var raw = null;
        if (tipo === 'canais') { raw = { stream_id: idv, name: m.n, stream_icon: m.i || '', epg_channel_id: m.e || '', category_id: m.c || '' }; }
        lista.push({ tipo: tipo, id: idv, nome: m.n, capa: m.i || '', raw: raw });
        mudou = true;
      }
      tm[k] = t;
    });
    gravar(chave('fav'), lista);
    gravar(chave('favt'), tm);
    return mudou;
  }

  VLTV.dados = {
    perfilAtual: perfilAtual,
    definirPerfil: definirPerfil,
    sementeProgresso: sementeProgresso,
    sementeFavoritos: sementeFavoritos,
    aplicarProgresso: aplicarProgresso,
    aplicarFavoritos: aplicarFavoritos,
    avaliacao: avaliacao,
    definirAvaliacao: definirAvaliacao,
    progresso: progresso,
    registrarContinuar: registrarContinuar,
    continuarDe: continuarDe,
    salvarProgresso: salvarProgresso,
    favoritos: favoritos,
    favoritosDe: favoritosDe,
    ehFavorito: ehFavorito,
    alternarFavorito: alternarFavorito
  };
})();
