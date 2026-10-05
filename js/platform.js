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

  VLTV.platform = detectar();
})();
