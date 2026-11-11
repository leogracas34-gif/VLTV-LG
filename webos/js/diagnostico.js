// VLTV Play - webOS | Medidor de travadas (só para testes). Ligue em config.js: DIAGNOSTICO_TRAVADAS: true.
// Mostra, em letras amarelas pequenas no canto de cima da tela, as últimas vezes em que o app ficou "preso":
// quanto tempo travou, quanto tempo depois de abrir o app, quanto tempo depois da última tecla e em que tela estava.
// Desligado (false), este arquivo não faz nada.
(function () {
  'use strict';
  if (!(window.VLTV && VLTV.config && VLTV.config.DIAGNOSTICO_TRAVADAS === true)) { return; }

  var LIMITE_MS = 250;      // só conta travada maior que isso
  var MAX_LINHAS = 7;
  var inicio = new Date().getTime();
  var ultimaTecla = 0;
  var ultimo = new Date().getTime();
  var linhas = [];
  var caixa = null;

  function agora() { return new Date().getTime(); }

  function tela() {
    var el = document.querySelector('#app > .tela:not(.escondida)');
    return el ? el.id.replace('tela-', '') : '?';
  }

  function desenhar() {
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.style.cssText = 'position:absolute;top:6px;left:8px;z-index:9999;padding:6px 10px;background:rgba(0,0,0,0.7);color:#ffe14d;font:18px/1.35 monospace;white-space:pre;pointer-events:none;';
      document.body.appendChild(caixa);
    }
    caixa.textContent = 'TRAVADAS (duração | após abrir | após tecla | tela)\n' + (linhas.length ? linhas.join('\n') : '(nenhuma até agora)');
  }

  document.addEventListener('keydown', function () { ultimaTecla = agora(); }, true);

  setInterval(function () {
    var n = agora();
    var atraso = n - ultimo - 100;
    ultimo = n;
    if (atraso >= LIMITE_MS) {
      var apos = ultimaTecla ? ((n - ultimaTecla) / 1000).toFixed(1) + 's' : '-';
      linhas.push((atraso / 1000).toFixed(1) + 's | ' + ((n - inicio) / 1000).toFixed(0) + 's | ' + apos + ' | ' + tela());
      while (linhas.length > MAX_LINHAS) { linhas.shift(); }
      desenhar();
    }
  }, 100);

  setTimeout(desenhar, 1500);
})();
