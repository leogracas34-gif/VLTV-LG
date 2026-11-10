// VLTV Play | Tema: fundo do aplicativo e cor dos painéis.
// Escolha em Configurações > Tema do aplicativo. A escolha fica guardada na TV (não some ao limpar o cache).
// "Padrão" é exatamente o visual de sempre: nenhuma regra extra é aplicada. Os outros temas ficam em css/temas.css.
// A cor de destaque (vermelho) continua sendo a do painel ADM; o tema só muda o fundo e os painéis.
// Este arquivo é carregado no <head>, antes da primeira tela aparecer, para o fundo já nascer certo.
window.VLTV = window.VLTV || {};

(function () {
  'use strict';

  var CHAVE = 'vltv_tema';

  // Tema que vale para quem nunca escolheu um tema (instalação nova). Para as festas: 'natal'. Depois do Ano Novo: 'padrao'.
  // Se o tema escrito aqui não existir mais na LISTA abaixo, cai sozinho no 'padrao'.
  var TEMA_INICIAL = 'natal';

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
    } catch (e) { /* TV sem armazenamento: fica no tema inicial */ }
    return achar(TEMA_INICIAL) ? TEMA_INICIAL : 'padrao';
  }

  var atual = ler();

  function aplicar(codigo) {
    try { document.documentElement.setAttribute('data-tema', codigo); } catch (e) { /* ignora */ }
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
