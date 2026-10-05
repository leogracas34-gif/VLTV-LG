// VLTV Play - webOS | Lista de DNS vinda da VPS.
// Ordem de prioridade: lista baixada agora -> última lista salva no aparelho -> lista de emergência.
(function () {
  'use strict';

  var CHAVE_CACHE = 'vltv_dns_lista';
  var listaAtual = null;

  // fetch com tempo limite (aborta se o servidor não responder).
  function fetchComTimeout(url, ms) {
    // AbortController só existe no Chrome 66+ (webOS 5). Em TV mais antiga,
    // o tempo limite é feito com uma corrida entre o fetch e um temporizador.
    var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer;
    var limite = new Promise(function (_, rejeitar) {
      timer = setTimeout(function () {
        if (controle) { controle.abort(); }
        rejeitar(new Error('tempo esgotado'));
      }, ms);
    });
    var opcoes = { cache: 'no-store' };
    if (controle) { opcoes.signal = controle.signal; }
    return Promise.race([fetch(url, opcoes), limite]).then(
      function (r) { clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); throw e; }
    );
  }

  function normalizar(url) {
    var u = String(url || '').trim();
    if (!u) { return ''; }
    if (!/^https?:\/\//i.test(u)) { u = 'http://' + u; }
    return u.replace(/\/+$/, '');
  }

  function limparLista(arr) {
    var vistos = {};
    var saida = [];
    for (var i = 0; i < arr.length; i++) {
      var u = normalizar(arr[i]);
      if (u && !vistos[u]) { vistos[u] = true; saida.push(u); }
    }
    return saida;
  }

  // Aceita {"dns":[...]}, {"servers":[...]} ou {"servidores":[{"laminas":[{"dns":[...]}]}]}.
  function lerJson(obj) {
    var arr = obj && (obj.dns || obj.servers);
    if (Array.isArray(arr)) { return limparLista(arr); }
    if (obj && Array.isArray(obj.servidores)) {
      var todos = [];
      obj.servidores.forEach(function (s) {
        (s.laminas || []).forEach(function (l) {
          (l.dns || []).forEach(function (d) { todos.push(d); });
        });
      });
      return limparLista(todos);
    }
    return [];
  }

  function lerCache() {
    try {
      var bruto = localStorage.getItem(CHAVE_CACHE);
      if (!bruto) { return []; }
      var arr = JSON.parse(bruto);
      return Array.isArray(arr) ? limparLista(arr) : [];
    } catch (e) { return []; }
  }

  function salvarCache(lista) {
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(lista)); } catch (e) { /* ignora */ }
  }

  // Baixa a lista mais recente da VPS. Nunca falha: se der erro, usa cache ou emergência.
  function atualizar() {
    var cfg = VLTV.config;
    return fetchComTimeout(cfg.DNS_CONFIG_URL, cfg.DNS_CONFIG_TIMEOUT_MS)
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.json();
      })
      .then(function (json) {
        var lista = lerJson(json);
        if (lista.length === 0) { throw new Error('lista vazia'); }
        salvarCache(lista);
        listaAtual = lista;
        return lista;
      })
      .catch(function () {
        var cache = lerCache();
        listaAtual = cache.length > 0 ? cache : limparLista(cfg.DNS_FALLBACK);
        return listaAtual;
      });
  }

  function lista() {
    if (listaAtual && listaAtual.length > 0) { return listaAtual.slice(); }
    var cache = lerCache();
    return cache.length > 0 ? cache : limparLista(VLTV.config.DNS_FALLBACK);
  }

  VLTV.http = { fetchComTimeout: fetchComTimeout };
  VLTV.dns = { atualizar: atualizar, lista: lista, normalizar: normalizar };
})();
