// VLTV Play - webOS | Medidor de travadas (só para testes). Ligue em config.js: DIAGNOSTICO_TRAVADAS: true.
// Mostra, em letras amarelas pequenas no canto de cima da tela, as últimas vezes em que o app ficou "preso":
// quanto tempo travou, quanto tempo depois de abrir o app, quanto tempo depois da última tecla, em que tela estava
// e a CAUSA: o que o app tinha acabado de fazer. Além das marcas dos módulos (idb-ler, json...), este medidor
// vigia as funções que rodam sozinhas (tm = temporizador, pr = resposta de busca/leitura, iv = repetição, raf = animação)
// e mostra o começo do código de qualquer uma que passe de 200 ms, ou quanto a tecla demorou para ser tratada.
// Desligado (false), este arquivo não faz nada.
(function () {
  'use strict';
  if (!(window.VLTV && VLTV.config && VLTV.config.DIAGNOSTICO_TRAVADAS === true)) { return; }

  var LIMITE_MS = 250;      // só conta travada maior que isso
  var LIMITE_CB_MS = 200;   // função que roda sozinha e passa disso aparece na causa
  var MAX_LINHAS = 7;
  var inicio = new Date().getTime();
  var ultimaTecla = 0;
  var ultimo = new Date().getTime();
  var linhas = [];
  var marcas = [];          // o que o app terminou de fazer há pouco: { t, nome, dur }
  var caixa = null;

  // Originais guardados ANTES de vigiar (o medidor não vigia a si mesmo).
  var stOrig = window.setTimeout;
  var siOrig = window.setInterval;
  var rafOrig = window.requestAnimationFrame;
  var thenOrig = Promise.prototype.then;

  function agora() { return new Date().getTime(); }

  function guardarMarca(nome, dur) {
    marcas.push({ t: agora(), nome: String(nome), dur: dur || 0 });
    while (marcas.length > 60) { marcas.shift(); }
  }

  // Os módulos chamam VLTV.marcar('nome') quando terminam algo pesado; a travada mostra o que terminou junto dela.
  VLTV.marcar = function (nome) { guardarMarca(nome, 0); };

  function causa(fim, atraso) {
    var de = fim - atraso - 400;
    var achadas = [];
    for (var i = 0; i < marcas.length; i++) {
      if (marcas[i].t >= de && marcas[i].t <= fim + 50) { achadas.push(marcas[i]); }
    }
    if (!achadas.length) { return '?'; }
    achadas.sort(function (a, b) { return b.dur - a.dur; });
    var nomes = [];
    for (var k = 0; k < achadas.length && nomes.length < 3; k++) {
      if (nomes.indexOf(achadas[k].nome) === -1) { nomes.push(achadas[k].nome); }
    }
    return nomes.join(' + ');
  }

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
    caixa.textContent = 'TRAVADAS (duração | após abrir | após tecla | tela | causa)\n' + (linhas.length ? linhas.join('\n') : '(nenhuma até agora)');
  }

  document.addEventListener('keydown', function (e) {
    var t0 = agora();
    var cod = e && e.keyCode;
    ultimaTecla = t0;
    // Quando este temporizador roda, a tecla já foi tratada: a diferença é o tempo que o app levou com ela.
    stOrig.call(window, function () {
      var d = agora() - t0;
      if (d >= LIMITE_CB_MS) { guardarMarca('tecla ' + cod + ' tratada em ' + d + 'ms', d); }
    }, 0);
  }, true);

  siOrig.call(window, function () {
    var n = agora();
    var atraso = n - ultimo - 100;
    ultimo = n;
    if (atraso >= LIMITE_MS) {
      var apos = ultimaTecla ? ((n - ultimaTecla) / 1000).toFixed(1) + 's' : '-';
      linhas.push((atraso / 1000).toFixed(1) + 's | ' + ((n - inicio) / 1000).toFixed(0) + 's | ' + apos + ' | ' + tela() + ' | ' + causa(n, atraso));
      while (linhas.length > MAX_LINHAS) { linhas.shift(); }
      desenhar();
    }
  }, 100);

  stOrig.call(window, desenhar, 1500);

  // ── Vigia das funções que rodam sozinhas ──────────────────────────
  function trecho(f) {
    var s = '';
    try { s = Function.prototype.toString.call(f); } catch (e) { s = '?'; }
    s = s.replace(/\s+/g, ' ');
    var i = s.indexOf('{');
    if (i >= 0) { s = s.slice(i + 1); }
    return s.replace(/^\s+/, '').slice(0, 34);
  }

  function envolver(f, tipo) {
    if (typeof f !== 'function' || f.__vltvDiag) { return f; }
    var w = function () {
      var t0 = agora();
      try {
        return f.apply(this, arguments);
      } finally {
        var d = agora() - t0;
        if (d >= LIMITE_CB_MS) { guardarMarca(tipo + ' ' + d + 'ms {' + trecho(f), d); }
      }
    };
    w.__vltvDiag = true;
    return w;
  }

  try {
    window.setTimeout = function (f) {
      var a = Array.prototype.slice.call(arguments);
      a[0] = envolver(f, 'tm');
      return stOrig.apply(window, a);
    };
    window.setInterval = function (f) {
      var a = Array.prototype.slice.call(arguments);
      a[0] = envolver(f, 'iv');
      return siOrig.apply(window, a);
    };
    if (rafOrig) {
      window.requestAnimationFrame = function (f) { return rafOrig.call(window, envolver(f, 'raf')); };
    }
    Promise.prototype.then = function (a, b) { return thenOrig.call(this, envolver(a, 'pr'), envolver(b, 'pr')); };
  } catch (e) { /* sem vigia: o medidor segue só com as marcas */ }
})();
