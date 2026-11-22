// VLTV Play - webOS | Sincronização entre aparelhos (estilo Netflix) pela VPS.
// Mesmo login + mesmo perfil = mesmo "Continuar assistindo" e mesmos favoritos no celular, na TV Android, na LG e na Samsung.
// É o par do CloudSync.kt do app Android. Rotas do gateway: /conta/perfis, /conta/progresso, /conta/favoritos.
//
// Regras (iguais às do Android):
//  - O id do perfil na nuvem sai do NOME do perfil: "Léo" vira "leo" (perfilId).
//  - Posição e duração em SEGUNDOS. Chaves: 'f' + id (filme), 'e' + id (episódio); favoritos 'f', 's' (série) e 'c' (canal).
//  - Vale sempre o registro com "t" (hora do aparelho) mais novo.
//  - Só funciona em conta do VLTV Play (modo 'usuario'). Falhas são silenciosas: sem internet o app funciona como antes.
(function () {
  'use strict';

  var ESPERA_MS = 8000;             // junta várias gravações seguidas num envio só
  var INTERVALO_MIN_MS = 15000;     // não busca na nuvem mais que 1x a cada 15 s
  var SEMENTE_MAX = 400;            // limite do gateway por envio
  var TIMEOUT_MS = 15000;

  var pendentes = {};               // chave -> { rota, item } (o mais novo de cada item vence)
  var timer = null;
  var sincronizando = false;
  var ultimaSync = 0;
  var ultimoPerfil = '';
  var aoMudarCb = null;
  var pausadoAte = 0;               // a VPS recusou o login: não insiste por um tempo (cada recusa conta como "login errado" do IP)
  var PAUSA_RECUSA_MS = 30 * 60 * 1000;

  // ── Utilidades ────────────────────────────────────────────────────
  function perfilId(nome) {
    var s = String(nome || '').trim();
    try { s = s.normalize('NFD'); } catch (e) { /* TV antiga: segue sem tirar acento */ }
    s = s.replace(/[\u0300-\u036f]+/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return s || 'padrao';
  }

  function cred() {
    if (new Date().getTime() < pausadoAte) { return null; }
    var s = VLTV.sessao.ler();
    if (!s || s.modo !== 'usuario' || !s.user || !s.pass) { return null; }
    return s;
  }

  function ativo() { return !!cred(); }

  function perfil() { return VLTV.dados.perfilAtual(); }

  function post(rota, extra) {
    var c = cred();
    if (!c) { return Promise.reject(new Error('sem login')); }
    var corpo = { user: c.user, pass: c.pass };
    for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { corpo[k] = extra[k]; } }
    return VLTV.http.fetchComTimeout(VLTV.dns.gateway() + rota, TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401 || r.status === 429) { pausadoAte = new Date().getTime() + PAUSA_RECUSA_MS; }
        throw new Error('http ' + r.status);
      }
      return r.json();
    }).then(function (j) {
      if (!j || j.ok !== true) { throw new Error('resposta'); }
      return j;
    });
  }

  // "Desde quando" já baixamos, por perfil (hora do SERVIDOR).
  function lerDesde(pid) {
    try {
      var c = cred();
      var t = JSON.parse(localStorage.getItem('vltv_nuvem_' + c.user + '_' + pid) || '{}');
      return { prog: t.prog || 0, fav: t.fav || 0 };
    } catch (e) { return { prog: 0, fav: 0 }; }
  }

  function gravarDesde(pid, d) {
    try {
      var c = cred();
      localStorage.setItem('vltv_nuvem_' + c.user + '_' + pid, JSON.stringify(d));
    } catch (e) { /* ignora */ }
  }

  // ── Envio (fila com espera) ───────────────────────────────────────
  function colocar(rota, item) {
    var p = perfil();
    if (!p || !cred()) { return; }
    pendentes[rota + '|' + p.id + '|' + item.k] = { rota: rota, perfil: p.id, item: item };
    if (!timer) { timer = setTimeout(function () { timer = null; enviarPendentes(); }, ESPERA_MS); }
  }

  // Manda o que está na fila. O que não sair volta para a fila.
  function enviarPendentes() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!cred()) { return Promise.resolve(); }
    var lote = pendentes;
    pendentes = {};
    var grupos = {};
    Object.keys(lote).forEach(function (k) {
      var p = lote[k];
      var g = p.rota + '|' + p.perfil;
      (grupos[g] = grupos[g] || { rota: p.rota, perfil: p.perfil, itens: [], chaves: [] });
      grupos[g].itens.push(p.item);
      grupos[g].chaves.push(k);
    });
    var tarefas = Object.keys(grupos).map(function (g) {
      var gr = grupos[g];
      return post(gr.rota, { perfil: gr.perfil, itens: gr.itens }).catch(function () {
        gr.chaves.forEach(function (k) { if (!pendentes[k]) { pendentes[k] = lote[k]; } });
      });
    });
    return Promise.all(tarefas);
  }

  // Chamado quando o vídeo fecha: não deixa o último progresso esperando.
  function descarregar() { enviarPendentes(); }

  function enviarProgresso(k, pos, dur, fim, meta) {
    if (!ativo() || !perfil() || !k || !isFinite(dur) || dur < 1) { return; }
    var d = Math.floor(dur);
    var item = { k: k, pos: fim ? d : Math.max(0, Math.floor(pos)), dur: d, t: new Date().getTime(), fim: !!fim };
    if (meta) { item.meta = meta; }
    colocar('/conta/progresso', item);
    if (fim) { enviarPendentes(); }
  }

  // k = 'f' + id (filme), 's' + id (série) ou 'c' + id (canal).
  function favorito(k, ativoAgora, meta, t) {
    if (!ativo() || !perfil()) { return; }
    var item = { k: k, t: t || new Date().getTime(), removido: !ativoAgora };
    if (meta) { item.meta = meta; }
    colocar('/conta/favoritos', item);
  }

  // ── Busca (nuvem -> TV) ───────────────────────────────────────────
  function sincronizarProgresso(p) {
    var d = lerDesde(p.id);
    var extra = { perfil: p.id, desde: d.prog };
    if (d.prog === 0) { extra.itens = VLTV.dados.sementeProgresso(SEMENTE_MAX); }   // 1ª vez: sobe o histórico que já existe aqui
    return post('/conta/progresso', extra).then(function (r) {
      var mudou = VLTV.dados.aplicarProgresso(r.itens || []);
      if (r.agora > 0) { var n = lerDesde(p.id); n.prog = r.agora; gravarDesde(p.id, n); }
      return mudou;
    });
  }

  function sincronizarFavoritos(p) {
    var d = lerDesde(p.id);
    var extra = { perfil: p.id, desde: d.fav };
    if (d.fav === 0) { extra.itens = VLTV.dados.sementeFavoritos(SEMENTE_MAX); }
    return post('/conta/favoritos', extra).then(function (r) {
      var mudou = VLTV.dados.aplicarFavoritos(r.itens || []);
      if (r.agora > 0) { var n = lerDesde(p.id); n.fav = r.agora; gravarDesde(p.id, n); }
      return mudou;
    });
  }

  // Manda o que está pendente, baixa o que mudou nos outros aparelhos e aplica aqui.
  function sincronizar(forcar) {
    var p = perfil();
    if (!p || !cred() || sincronizando) { return; }
    var agora = new Date().getTime();
    if (!forcar && p.id === ultimoPerfil && agora - ultimaSync < INTERVALO_MIN_MS) { return; }
    sincronizando = true;
    ultimaSync = agora;
    ultimoPerfil = p.id;
    var mudou = false;
    enviarPendentes()
      .then(function () { return sincronizarProgresso(p); })
      .then(function (m) { if (m) { mudou = true; } return sincronizarFavoritos(p); })
      .then(function (m) { if (m) { mudou = true; } })
      .catch(function () { /* sem internet ou servidor fora: tenta de novo na próxima vez */ })
      .then(function () {
        sincronizando = false;
        if (mudou && aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
      });
  }

  // ── Perfis ────────────────────────────────────────────────────────
  // Perfis que o celular (Android) subiu para a nuvem, sem os apagados.
  function listarPerfis() {
    return post('/conta/perfis', {}).then(function (r) {
      return (r.perfis || []).filter(function (p) { return p && !p.removido && p.id && p.nome; });
    });
  }

  function escolherPerfil(p) {
    VLTV.dados.definirPerfil({ id: p.id, nome: p.nome, imagem: p.imagem || '', kids: p.kids === true });
    ultimaSync = 0;
    sincronizar(true);
    if (aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
  }

  // Ao entrar na Home: se já tem perfil, sincroniza; se não, escolhe (1 perfil entra sozinho, vários perguntam).
  function aoEntrarNaHome() {
    if (!ativo()) { return; }
    if (perfil()) { sincronizar(false); return; }
    listarPerfis().then(function (lista) {
      if (perfil() || lista.length === 0) { return; }   // ninguém criou perfil no celular ainda: nada para sincronizar
      if (lista.length === 1) { escolherPerfil(lista[0]); return; }
      if (VLTV.perfil) { VLTV.perfil.abrir(lista, false); }
    }).catch(function () { /* sem internet: tenta na próxima vez que entrar na Home */ });
  }

  VLTV.nuvem = {
    perfilId: perfilId,
    ativo: ativo,
    enviarProgresso: enviarProgresso,
    favorito: favorito,
    descarregar: descarregar,
    sincronizar: sincronizar,
    listarPerfis: listarPerfis,
    escolherPerfil: escolherPerfil,
    aoEntrarNaHome: aoEntrarNaHome,
    aoMudar: function (f) { aoMudarCb = f; }
  };
})();
