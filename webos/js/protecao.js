// VLTV Play - webOS | Proteção contra travamento e aviso de "sem internet".
// 1) Qualquer erro inesperado de JavaScript é capturado aqui: o app não fica parado nem fecha. Se os erros
//    se repetirem muito (loop de erro), o app tenta se recuperar sozinho (reabre o canal) e, em último caso,
//    reinicia (no máximo uma vez a cada 2 minutos, para nunca ficar reiniciando sem parar).
// 2) Se a internet da TV cair, aparece uma faixa avisando; quando voltar, a faixa some e quem estava
//    tocando (canal ao vivo) reabre sozinho.
// Este arquivo precisa ser o primeiro depois do config.js.
window.VLTV = window.VLTV || {};

(function () {
  'use strict';

  var JANELA_ERROS_MS = 10000;      // erros contados nos últimos 10 s
  var LIMITE_RECUPERAR = 6;         // tantos erros na janela: tenta se recuperar
  var LIMITE_REINICIAR = 16;        // tantos erros na janela: reinicia o app
  var INTERVALO_MIN_REINICIO_MS = 120000;
  var CH_REINICIO = 'vltv_ultimo_reinicio_erro';
  var ESPERA_REDE_MS = 4000;

  var erros = [];
  var aoRecuperar = [];
  var aoVoltarRede = [];
  var aoPerderRede = [];
  var ultimaRecuperacao = 0;

  function agora() { return new Date().getTime(); }

  function chamarTodos(lista) {
    lista.slice().forEach(function (f) { try { f(); } catch (e) { /* um tratador com defeito não derruba os outros */ } });
  }

  // ── Faixa de aviso (criada aqui, sem depender do index.html) ──────
  var faixa = null;
  var timerFaixa = null;

  function garantirFaixa() {
    if (faixa || !document.body) { return faixa; }
    faixa = document.createElement('div');
    faixa.id = 'aviso-rede';
    faixa.className = 'aviso-rede escondida';
    document.body.appendChild(faixa);
    return faixa;
  }

  function mostrarFaixa(texto, tipo, duracaoMs) {
    var f = garantirFaixa();
    if (!f) { return; }
    clearTimeout(timerFaixa);
    f.textContent = texto;
    f.className = 'aviso-rede ' + (tipo || '');
    if (duracaoMs) {
      timerFaixa = setTimeout(function () { f.className = 'aviso-rede escondida'; }, duracaoMs);
    }
  }

  function esconderFaixa() {
    if (faixa) { faixa.className = 'aviso-rede escondida'; }
  }

  // ── Erros inesperados ─────────────────────────────────────────────
  function registrarErro(origem, detalhe) {
    var n = agora();
    erros.push(n);
    while (erros.length && n - erros[0] > JANELA_ERROS_MS) { erros.shift(); }
    try { if (window.console && console.error) { console.error('[VLTV]', origem, detalhe); } } catch (e) { /* ignora */ }

    if (erros.length >= LIMITE_REINICIAR) { reiniciarSeguro(); return; }
    if (erros.length >= LIMITE_RECUPERAR && n - ultimaRecuperacao > JANELA_ERROS_MS) {
      ultimaRecuperacao = n;
      mostrarFaixa('Recuperando o aplicativo...', 'aviso', 4000);
      chamarTodos(aoRecuperar);
    }
  }

  function reiniciarSeguro() {
    var ultimo = 0;
    try { ultimo = parseInt(localStorage.getItem(CH_REINICIO) || '0', 10) || 0; } catch (e) { ultimo = 0; }
    if (agora() - ultimo < INTERVALO_MIN_REINICIO_MS) { return; }
    try { localStorage.setItem(CH_REINICIO, String(agora())); } catch (e2) { /* ignora */ }
    erros = [];
    try { window.location.reload(); } catch (e3) { /* ignora */ }
  }

  window.addEventListener('error', function (e) {
    registrarErro('erro', e && (e.message || e.error));
    // Não deixa o navegador da TV tratar o erro por conta própria.
  });
  window.addEventListener('unhandledrejection', function (e) {
    registrarErro('promessa', e && e.reason);
    try { if (e && e.preventDefault) { e.preventDefault(); } } catch (x) { /* ignora */ }
  });

  // ── Internet ──────────────────────────────────────────────────────
  var online = navigator.onLine !== false;

  function mudouRede(agoraOnline) {
    if (agoraOnline === online) { return; }
    online = agoraOnline;
    if (!online) {
      mostrarFaixa('Sem conexão com a internet. Verifique o Wi-Fi ou o cabo da TV.', 'erro');
      chamarTodos(aoPerderRede);
    } else {
      mostrarFaixa('Conexão restaurada.', 'ok', 3000);
      // Dá um instante para a rede da TV estabilizar antes de reabrir o que estava tocando.
      setTimeout(function () { if (online) { chamarTodos(aoVoltarRede); } }, 1200);
    }
  }

  window.addEventListener('offline', function () { mudouRede(false); });
  window.addEventListener('online', function () { mudouRede(true); });
  // Algumas TVs demoram a avisar: confere também de tempos em tempos.
  setInterval(function () { mudouRede(navigator.onLine !== false); }, ESPERA_REDE_MS);

  document.addEventListener('DOMContentLoaded', function () {
    garantirFaixa();
    if (!online) { mostrarFaixa('Sem conexão com a internet. Verifique o Wi-Fi ou o cabo da TV.', 'erro'); }
  });

  VLTV.protecao = {
    online: function () { return online; },
    // Chamados quando os erros se repetem demais (ex.: reabrir o canal).
    aoRecuperar: function (f) { aoRecuperar.push(f); },
    aoVoltarRede: function (f) { aoVoltarRede.push(f); },
    aoPerderRede: function (f) { aoPerderRede.push(f); },
    // Executa uma função sem nunca deixar o erro escapar.
    seguro: function (f, padrao) {
      try { return f(); } catch (e) { registrarErro('seguro', e); return padrao; }
    },
    erro: function (e) { registrarErro('manual', e); }
  };
})();
