// VLTV Play - webOS | Detecta o modelo/ano da TV e decide se é compatível.
// Usa o PalmSystem (interno do webOS) e o User-Agent, sem biblioteca extra.
(function () {
  'use strict';

  function lerDeviceInfo() {
    try {
      if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        return JSON.parse(window.PalmSystem.deviceInfo);
      }
    } catch (e) { /* segue sem deviceInfo */ }
    return null;
  }

  function numero(texto, regex) {
    var m = regex.exec(texto || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function detectar() {
    var cfg = VLTV.config;
    var ua = navigator.userAgent || '';
    var info = lerDeviceInfo();

    var ehTV = !!window.PalmSystem || /Web0S|webOS/i.test(ua);
    var ano = numero(ua, /webOS\.TV-(\d{4})/i);
    var chrome = numero(ua, /Chrome\/(\d+)/i);
    var sdk = info ? numero(String(info.sdkVersion || ''), /^(\d+)/) : null;
    var modelo = info && info.modelName ? String(info.modelName) : '';

    var compativel = true;
    var motivo = '';

    if (ehTV) {
      // Ordem: ano da TV, depois versão do webOS, depois versão do navegador.
      if (ano !== null) {
        compativel = ano >= cfg.MIN_WEBOS_YEAR;
      } else if (sdk !== null) {
        compativel = sdk >= cfg.MIN_WEBOS_SDK;
      } else if (chrome !== null) {
        compativel = chrome >= cfg.MIN_CHROME;
      }
      if (!compativel) {
        motivo = 'O VLTV Play funciona em TVs LG de ' + cfg.MIN_WEBOS_YEAR +
                 ' em diante (webOS ' + cfg.MIN_WEBOS_SDK + ' ou mais novo). ' +
                 'Detectado: ano ' + (ano !== null ? ano : '?') +
                 ', webOS ' + (sdk !== null ? sdk : '?') +
                 ', Chrome ' + (chrome !== null ? chrome : '?') + '.';
      }
    }

    var partes = [];
    if (!ehTV) {
      partes.push('Navegador (modo de teste)');
    } else {
      partes.push(modelo || 'TV LG');
      if (sdk !== null) { partes.push('webOS ' + sdk); }
      if (ano !== null) { partes.push(String(ano)); }
      if (chrome !== null) { partes.push('Chrome ' + chrome); }
    }

    return {
      ehTV: ehTV,
      ano: ano,
      sdk: sdk,
      chrome: chrome,
      modelo: modelo,
      compativel: compativel,
      motivo: motivo,
      descricao: partes.join(' | ')
    };
  }

  // Rola o item para dentro da área visível (scrollIntoView com opções só existe no Chrome 61+).
  VLTV.rolar = function (el) {
    if (!el) { return; }
    if (el.scrollIntoViewIfNeeded) { el.scrollIntoViewIfNeeded(false); }
    else { el.scrollIntoView(false); }
  };

  // ── Cursor e roda do controle (Magic Remote) ─────────────────────
  // VLTV.cursor.andou(e): o cursor andou de verdade? Ignora o tremido da mão, a lista rolando por baixo
  // dele e o leve movimento que o controle faz ao apertar um botão (ex.: Voltar com o cursor sobre uma capa).
  var LIMIAR_CURSOR_PX = 10;
  var QUIETO_APOS_TECLA_MS = 600;
  var cursorRefX = -1000;
  var cursorRefY = -1000;
  var cursorQuietoAte = 0;
  document.addEventListener('keydown', function () {
    cursorQuietoAte = new Date().getTime() + QUIETO_APOS_TECLA_MS;
  }, true);

  VLTV.cursor = {
    andou: function (e) {
      if (new Date().getTime() < cursorQuietoAte) { return false; }
      var dx = e.clientX - cursorRefX;
      var dy = e.clientY - cursorRefY;
      if (dx * dx + dy * dy < LIMIAR_CURSOR_PX * LIMIAR_CURSOR_PX) { return false; }
      cursorRefX = e.clientX;
      cursorRefY = e.clientY;
      return true;
    }
  };

  // Roda do controle: chama tratador(sentido, e), sentido = +1 (para baixo) ou -1 (para cima).
  VLTV.aoRodar = function (el, tratador) {
    el.addEventListener('wheel', function (e) {
      var d = e.deltaY;
      if (!d && e.wheelDelta) { d = -e.wheelDelta; }
      if (!d) { return; }
      e.preventDefault();
      tratador(d > 0 ? 1 : -1, e, Math.abs(d));
    }, false);
  };

  // Rola uma lista (overflow hidden) com a roda. Devolve true se andou.
  VLTV.rolarRoda = function (lista, sentido, intensidade) {
    var passo = Math.max(90, Math.min(240, intensidade || 120));
    var antes = lista.scrollTop;
    lista.scrollTop = antes + sentido * passo;
    return lista.scrollTop !== antes;
  };

  // Elemento (filho direto de "pai") que está sob o ponto da tela, ou null.
  VLTV.filhoNoPonto = function (pai, x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el.parentNode !== pai) { el = el.parentNode; }
    return el || null;
  };

  VLTV.platform = detectar();
})();
