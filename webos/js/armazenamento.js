// VLTV Play - webOS | Progresso de reprodução (continuar de onde parou) e favoritos (Minha Lista).
// Tudo fica guardado na própria TV, separado por usuário.
(function () {
  'use strict';

  var MAX_PROGRESSO = 500;      // quantos títulos/episódios lembrar
  var FIM_PERCENTUAL = 0.95;    // a partir daqui o título conta como assistido

  function dono() {
    var s = VLTV.sessao.ler();
    if (!s) { return 'padrao'; }
    return s.modo === 'm3u' ? 'm3u' : (s.user || 'padrao');
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

  function salvarProgresso(id, pos, dur) {
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

  VLTV.dados = {
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
