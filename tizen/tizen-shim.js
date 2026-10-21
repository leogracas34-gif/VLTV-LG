// VLTV Play - Samsung (Tizen) | Adaptador: faz o código feito para a LG funcionar na Samsung sem mexer nele.
// Carrega logo depois do platform.js. Fora de uma TV Samsung não faz nada.
(function () {
  'use strict';

  var ua = navigator.userAgent || '';
  if (!/Tizen/i.test(ua) && !window.tizen) { return; }

  var MIN_TIZEN = 4.0;   // Tizen 4.0 = TVs de 2018 em diante (mesma regra de "2018 em diante" da LG)

  function tentar(f) { try { return f(); } catch (e) { return undefined; } }

  // ── 1) Teclas ────────────────────────────────────────────────────────
  // A Samsung só entrega estas teclas depois de pedidas.
  var PEDIR = ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaPlayPause', 'MediaRewind', 'MediaFastForward',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'ChannelUp', 'ChannelDown',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  PEDIR.forEach(function (t) { tentar(function () { window.tizen.tvinputdevice.registerKey(t); }); });

  // Reenvia a tecla com outro código (o app foi escrito com os códigos da LG).
  function reenviar(e, codigo) {
    var novo = document.createEvent('Event');
    novo.initEvent(e.type, true, true);
    Object.defineProperty(novo, 'keyCode', { get: function () { return codigo; } });
    Object.defineProperty(novo, 'which', { get: function () { return codigo; } });
    (document.activeElement || document.body).dispatchEvent(novo);
  }

  // Voltar da Samsung é 10009; o app inteiro espera o código 461 da LG. Troca na entrada, uma vez só.
  function virarVoltar(e) {
    if (e.keyCode !== 10009) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    reenviar(e, 461);
  }
  document.addEventListener('keydown', virarVoltar, true);
  document.addEventListener('keyup', virarVoltar, true);

  // Tecla única de play/pause da Samsung (código 10252): o app só conhece PLAY (415) e PAUSE (19).
  // Com o filme na tela, vira PLAY se estiver parado e PAUSE se estiver tocando.
  function virarPlayPause(e) {
    if (e.keyCode !== 10252) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') { return; }
    var v = document.getElementById('player-video');
    if (!v || v.offsetParent === null) { return; }   // o filme não está na tela: ignora
    reenviar(e, v.paused ? 415 : 19);
  }
  document.addEventListener('keydown', virarPlayPause, true);
  document.addEventListener('keyup', virarPlayPause, true);

  // OK do controle: numa TV de verdade o OK (Enter) clica no botão em foco sozinho. O controle do
  // simulador da Samsung manda uma tecla "de mentira", e o navegador não clica. Aqui, se o app não tratou
  // o OK e ninguém clicou, clica no botão em foco. Na TV real o clique já acontece e isto não faz nada.
  var clicouNoOk = false;
  document.addEventListener('click', function () { clicouNoOk = true; }, true);
  document.addEventListener('keydown', function (e) { if (e.keyCode === 13) { clicouNoOk = false; } }, true);
  window.addEventListener('keydown', function (e) {
    if (e.keyCode !== 13 || e.defaultPrevented) { return; }
    var alvo = document.activeElement;
    if (!alvo || (alvo.tagName !== 'BUTTON' && alvo.tagName !== 'A')) { return; }
    setTimeout(function () {
      if (!clicouNoOk && document.activeElement === alvo && !alvo.disabled) { alvo.click(); }
    }, 50);
  }, false);

  // O app fecha com window.close(); na Samsung o certo é pedir para a TV encerrar o aplicativo.
  window.close = function () {
    tentar(function () { window.tizen.application.getCurrentApplication().exit(); });
  };

  // ── 2) Identidade da TV (o app pergunta o MAC como na LG) ────────────
  // Se a TV não entregar o MAC, usa um código estável feito do DUID (sobrevive a reinstalar o app).
  function hex(n, tam) { var s = (n >>> 0).toString(16); while (s.length < tam) { s = '0' + s; } return s.slice(-tam); }
  function hash(texto, semente) {
    var h = semente >>> 0;
    for (var i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function macDaTv() {
    var mac = tentar(function () { return window.webapis.network.getMac(); });
    if (mac && String(mac).replace(/[^0-9A-Fa-f]/g, '').length === 12) { return String(mac).toUpperCase(); }
    var duid = tentar(function () { return window.webapis.productinfo.getDuid(); });
    if (duid) {
      var h12 = hex(hash(String(duid), 2166136261), 8) + hex(hash(String(duid), 305419896), 4);
      return h12.toUpperCase().replace(/(..)(?=.)/g, '$1:');
    }
    return '';
  }
  function Ponte() { this.onservicecallback = null; }
  Ponte.prototype.call = function () {
    var self = this;
    setTimeout(function () {
      if (self.onservicecallback) { self.onservicecallback(JSON.stringify({ wiredInfo: { macAddress: macDaTv() } })); }
    }, 0);
  };
  window.PalmServiceBridge = Ponte;

  // ── 3) Detecção do aparelho (no lugar da leitura da LG) ──────────────
  var base = (window.VLTV && VLTV.platform) || {};
  var m = /Tizen[ \/]?(\d+(?:\.\d+)?)/i.exec(ua);
  var tizenVer = m ? parseFloat(m[1]) : null;
  var modelo = tentar(function () { return window.webapis.productinfo.getRealModel(); }) ||
    tentar(function () { return window.webapis.productinfo.getModel(); }) || '';
  var ok = tizenVer === null ? true : tizenVer >= MIN_TIZEN;
  var partes = ['Samsung' + (modelo ? ' ' + modelo : '')];
  if (tizenVer !== null) { partes.push('Tizen ' + tizenVer); }
  if (base.chrome) { partes.push('Chrome ' + base.chrome); }
  window.VLTV.platform = {
    ehTV: true,
    ano: null,
    sdk: tizenVer,
    chrome: base.chrome || null,
    marca: 'Samsung',
    modelo: modelo,
    compativel: ok,
    motivo: ok ? '' : 'O VLTV Play funciona em TVs Samsung de 2018 em diante (Tizen ' + MIN_TIZEN + ' ou mais novo). Detectado: Tizen ' + tizenVer + '.',
    descricao: partes.join(' | ')
  };
})();
