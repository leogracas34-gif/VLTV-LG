// VLTV Play | Tema: fundo do aplicativo e cor dos painéis.
// Escolha em Configurações > Tema do aplicativo. A escolha fica guardada na TV (não some ao limpar o cache).
// "Padrão" é exatamente o visual de sempre: nenhuma regra extra é aplicada. Os outros temas ficam em css/temas.css.
// A cor de destaque (vermelho) continua sendo a do painel ADM; o tema só muda o fundo e os painéis.
// Este arquivo é carregado no <head>, antes da primeira tela aparecer, para o fundo já nascer certo.
window.VLTV = window.VLTV || {};

(function () {
  'use strict';

  var CHAVE = 'vltv_tema';

  // previa: [cor do brilho 1, cor do brilho 2, topo, base, painel] (só para a miniatura em Configurações).
  // Os valores de verdade estão em css/temas.css; mantenha as duas listas parecidas.
  var LISTA = [
    { codigo: 'padrao',     nome: 'Padrão',      previa: ['229,9,20',    '70,90,200',  '#101018', '#09090d', '#141416'] },
    { codigo: 'meia-noite', nome: 'Meia-noite',  previa: ['37,99,235',   '14,165,233', '#0b1020', '#070a14', '#101524'] },
    { codigo: 'violeta',    nome: 'Violeta',     previa: ['139,92,246',  '236,72,153', '#120d1f', '#0a0710', '#17121f'] },
    { codigo: 'esmeralda',  nome: 'Esmeralda',   previa: ['16,185,129',  '20,184,166', '#07140f', '#050b09', '#0f1814'] },
    { codigo: 'por-do-sol', nome: 'Pôr do sol',  previa: ['249,115,22',  '236,72,153', '#1a0f0c', '#0d0707', '#1c1412'] },
    { codigo: 'grafite',    nome: 'Grafite',     previa: ['255,255,255', '148,163,184', '#16161a', '#0c0c0e', '#1a1a1e'] },
    { codigo: 'preto',      nome: 'Preto total', previa: ['0,0,0',       '0,0,0',      '#000000', '#000000', '#0a0a0a'] },
    { codigo: 'natal',      nome: 'Natal',       previa: ['220,38,38',   '22,163,74',  '#1a0a0c', '#0a0f0b', '#1c1214'] }
  ];

  function achar(codigo) {
    for (var i = 0; i < LISTA.length; i++) {
      if (LISTA[i].codigo === codigo) { return LISTA[i]; }
    }
    return null;
  }

  function ler() {
    try {
      var v = window.localStorage.getItem(CHAVE);
      if (achar(v)) { return v; }
    } catch (e) { /* TV sem armazenamento: fica no padrão */ }
    return 'padrao';
  }

  var atual = ler();

  // ── Natal: neve caindo e pisca-pisca no topo (só existem enquanto o tema Natal está escolhido) ──
  // Tudo anima só com transform/opacity (leve para a TV) e fica abaixo do player, dos pop-ups e dos avisos (z-index 40).
  var natalEl = null;

  function montarNatal() {
    if (natalEl || !document.body) { return; }
    var sem = 7, i, x, y, tam, dur, atraso, cor, ang, html = '';
    function rnd() { sem = (sem * 9301 + 49297) % 233280; return sem / 233280; }   // sorteio fixo: igual em toda TV

    // flocos de neve
    for (i = 0; i < 26; i++) {
      tam = 4 + Math.round(rnd() * 6);
      dur = 11 + Math.round(rnd() * 12);
      atraso = -Math.round(rnd() * dur);
      html += '<i class="natal-floco natal-floco-' + (i % 2 ? 'b' : 'a') + '" style="left:' + Math.round(rnd() * 100) + '%;' +
        'width:' + tam + 'px;height:' + tam + 'px;opacity:' + (0.5 + rnd() * 0.45).toFixed(2) + ';' +
        'animation-duration:' + dur + 's;animation-delay:' + atraso + 's"></i>';
    }

    // fio de luzes com lâmpadas (duas turmas piscando em revezamento) e algumas bolas penduradas
    var cores = ['#ef4444', '#facc15', '#22c55e', '#60a5fa'];
    var fio = 'M0,6', grupoA = '', grupoB = '', bolas = '';
    for (i = 0; i < 32; i++) {
      x = i * 60;
      fio += ' Q' + (x + 30) + ',30 ' + (x + 60) + ',6';
      for (y = 0; y < 2; y++) {
        cor = cores[(i * 2 + y) % 4];
        ang = '<ellipse cx="' + (x + 15 + y * 30) + '" cy="20" rx="9" ry="11" fill="' + cor + '" opacity="0.28"/>' +
          '<rect x="' + (x + 12 + y * 30) + '" y="11" width="6" height="4" rx="1" fill="#1f2937"/>' +
          '<ellipse cx="' + (x + 15 + y * 30) + '" cy="20" rx="4.5" ry="6.5" fill="' + cor + '"/>';
        if ((i * 2 + y) % 2) { grupoB += ang; } else { grupoA += ang; }
      }
    }
    var posBolas = [4, 9, 14, 19, 24, 28];
    for (i = 0; i < posBolas.length; i++) {
      x = posBolas[i] * 60 + 30;
      cor = i % 2 ? '#fbbf24' : '#dc2626';
      bolas += '<line x1="' + x + '" y1="18" x2="' + x + '" y2="34" stroke="#9ca3af" stroke-width="1.5"/>' +
        '<rect x="' + (x - 4) + '" y="32" width="8" height="5" rx="1" fill="#d1d5db"/>' +
        '<circle cx="' + x + '" cy="46" r="10" fill="' + cor + '"/>' +
        '<ellipse cx="' + (x - 3.5) + '" cy="42" rx="3" ry="4" fill="#fff" opacity="0.35"/>';
    }
    html += '<svg class="natal-luzes" width="1920" height="60" viewBox="0 0 1920 60" preserveAspectRatio="none">' +
      '<path d="' + fio + '" fill="none" stroke="#111827" stroke-width="2.5"/>' +
      '<g class="natal-pisca-a">' + grupoA + '</g><g class="natal-pisca-b">' + grupoB + '</g>' + bolas + '</svg>';

    natalEl = document.createElement('div');
    natalEl.id = 'natal-enfeites';
    natalEl.setAttribute('aria-hidden', 'true');
    natalEl.innerHTML = html;
    document.body.appendChild(natalEl);
  }

  function natal(ligar) {
    try {
      if (ligar) {
        if (document.body) { montarNatal(); }
        else { document.addEventListener('DOMContentLoaded', function () { if (atual === 'natal') { montarNatal(); } }); }
      } else if (natalEl) {
        if (natalEl.parentNode) { natalEl.parentNode.removeChild(natalEl); }
        natalEl = null;
      }
    } catch (e) { /* sem enfeites: o tema continua valendo */ }
  }

  function aplicar(codigo) {
    try { document.documentElement.setAttribute('data-tema', codigo); } catch (e) { /* ignora */ }
    natal(codigo === 'natal');
  }

  function definir(codigo) {
    if (!achar(codigo)) { return; }
    atual = codigo;
    try { window.localStorage.setItem(CHAVE, codigo); } catch (e) { /* ignora */ }
    aplicar(codigo);
  }

  // Miniatura do tema (um quadradinho com o fundo e o painel), para a lista de Configurações.
  function amostra(codigo) {
    var t = achar(codigo) || LISTA[0];
    var p = t.previa;
    var el = document.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'display:inline-block;position:relative;flex:none;width:64px;height:46px;margin-right:24px;border-radius:8px;overflow:hidden;' +
      'box-shadow:0 0 0 2px rgba(255,255,255,0.25);background:' +
      'radial-gradient(circle at 15% 10%, rgba(' + p[0] + ',0.85), rgba(' + p[0] + ',0) 70%),' +
      'radial-gradient(circle at 100% 110%, rgba(' + p[1] + ',0.7), rgba(' + p[1] + ',0) 70%),' +
      'linear-gradient(180deg,' + p[2] + ',' + p[3] + ');';
    var painel = document.createElement('span');
    painel.style.cssText = 'position:absolute;right:7px;bottom:7px;width:26px;height:18px;border-radius:4px;' +
      'border:2px solid rgba(255,255,255,0.35);background:' + p[4] + ';';
    el.appendChild(painel);
    return el;
  }

  aplicar(atual);

  VLTV.tema = {
    codigo: function () { return atual; },
    lista: function () { return LISTA.slice(); },
    definir: definir,
    amostra: amostra
  };
})();
