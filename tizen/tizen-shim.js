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

  // Voltar da Samsung é 10009; o app inteiro espera o código 461 da LG. Troca na entrada, uma vez só.
  function virarVoltar(e) {
    if (e.keyCode !== 10009) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    var novo = document.createEvent('Event');
    novo.initEvent(e.type, true, true);
    Object.defineProperty(novo, 'keyCode', { get: function () { return 461; } });
    Object.defineProperty(novo, 'which', { get: function () { return 461; } });
    (document.activeElement || document.body).dispatchEvent(novo);
  }
  document.addEventListener('keydown', virarVoltar, true);
  document.addEventListener('keyup', virarVoltar, true);

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
    modelo: modelo,
    compativel: ok,
    motivo: ok ? '' : 'O VLTV Play funciona em TVs Samsung de 2018 em diante (Tizen ' + MIN_TIZEN + ' ou mais novo). Detectado: Tizen ' + tizenVer + '.',
    descricao: partes.join(' | ')
  };
})();
