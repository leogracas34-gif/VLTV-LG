// VLTV Play - webOS | Créditos aprendidos (mesma ideia do PlayerActivity do Android).
// Guarda quantos segundos faltavam para o fim do episódio quando os créditos começam, por série.
// O valor é compartilhado com os outros clientes pela VPS (mediana das marcações) e também fica
// salvo na própria TV, então o próximo episódio da mesma série já abre com o botão no lugar certo.
(function () {
  'use strict';

  var MIN_S = 10;     // faixa aceita: 10s a 10min (igual ao backend)
  var MAX_S = 600;
  var TEMPO_LIMITE_MS = 6000;

  function chaveLocal(serie) { return 'vltv_creditos_seg_' + serie; }

  function valido(n) {
    return typeof n === 'number' && isFinite(n) && n >= MIN_S && n <= MAX_S;
  }

  // Aceita um número puro, texto numérico ou um objeto com o número em algum campo conhecido.
  function extrair(json) {
    if (typeof json === 'string') { json = parseFloat(json); }
    if (typeof json === 'number') { return valido(Math.round(json)) ? Math.round(json) : null; }
    if (!json || typeof json !== 'object') { return null; }
    var campos = ['remaining_sec', 'restante', 'restanteSeg', 'restante_seg', 'segundos', 'seconds', 'creditos',
      'credits', 'creditos_seg', 'value', 'valor', 'mediana', 'median'];
    for (var i = 0; i < campos.length; i++) {
      var v = json[campos[i]];
      if (typeof v === 'string') { v = parseFloat(v); }
      if (typeof v === 'number' && valido(Math.round(v))) { return Math.round(v); }
    }
    if (json.data) { return extrair(json.data); }
    return null;
  }

  function lerLocal(serie) {
    try {
      var v = parseInt(window.localStorage.getItem(chaveLocal(serie)), 10);
      return valido(v) ? v : null;
    } catch (e) { return null; }
  }

  function gravarLocal(serie, seg) {
    try { window.localStorage.setItem(chaveLocal(serie), String(seg)); } catch (e) { /* ignora */ }
  }

  // Resolve com o número de segundos (ou null). Nunca rejeita.
  function buscar(dns, serie) {
    var base = VLTV.config.VPS_URL;
    if (!base || !dns || !serie) { return Promise.resolve(null); }
    var url = base + '/credits?domain=' + encodeURIComponent(dns) + '&series=' + encodeURIComponent(serie);
    return VLTV.http.fetchComTimeout(url, TEMPO_LIMITE_MS)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) { return extrair(json); })
      .catch(function () { return null; });
  }

  // Envia a marcação para a VPS. Falha em silêncio (a cópia local já foi gravada).
  function enviar(dns, serie, seg) {
    var base = VLTV.config.VPS_URL;
    if (!base || !dns || !serie || !valido(seg)) { return; }
    try {
      fetch(base + '/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-key': VLTV.config.VPS_APP_KEY },
        body: JSON.stringify({ domain: dns, series: serie, remaining_sec: seg })
      }).catch(function () { /* ignora */ });
    } catch (e) { /* ignora */ }
  }

  VLTV.creditos = {
    MIN_S: MIN_S,
    MAX_S: MAX_S,
    valido: valido,
    lerLocal: lerLocal,
    gravarLocal: gravarLocal,
    buscar: buscar,
    enviar: enviar
  };
})();
