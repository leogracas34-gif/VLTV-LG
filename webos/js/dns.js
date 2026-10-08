// VLTV Play - webOS | Endereço do servidor (gateway).
// O app não conhece mais nenhum DNS de servidor: só o endereço do gateway da VPS.
(function () {
  'use strict';

  // fetch com tempo limite (aborta se o servidor não responder).
  function fetchComTimeout(url, ms, opcoesExtras) {
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
    if (opcoesExtras) { for (var k in opcoesExtras) { opcoes[k] = opcoesExtras[k]; } }
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

  function gateway() { return normalizar(VLTV.config.GATEWAY_URL); }

  // Lista antiga de DNS que versões anteriores guardavam na TV: apaga, não é mais usada.
  try { localStorage.removeItem('vltv_dns_lista'); } catch (e) { /* ignora */ }

  // Mantida para o resto do app: agora a "lista" é só o gateway.
  function atualizar() { return Promise.resolve([gateway()]); }
  function lista() { return [gateway()]; }

  VLTV.http = { fetchComTimeout: fetchComTimeout };
  VLTV.dns = { atualizar: atualizar, lista: lista, normalizar: normalizar, gateway: gateway };
})();
