// VLTV Play - webOS | "Quem está assistindo?": escolha do perfil que vale na TV.
// Os perfis são os do celular (o app Android sobe a lista para a nuvem). Aqui só se escolhe; criar e editar é no celular.
// Janela por cima de tudo, no mesmo estilo dos avisos (Temporizador para dormir).
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40 };

  var caixa = null;
  var elLista = null;
  var elSub = null;
  var botoes = [];
  var perfis = [];
  var idx = 0;
  var podeFechar = false;
  var aoFechar = null;

  function montar() {
    if (caixa) { return; }
    caixa = document.createElement('div');
    caixa.id = 'aviso-perfil';
    caixa.className = 'confirma escondida';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-modal', 'true');
    var cx = document.createElement('div');
    cx.className = 'confirma-caixa';
    var h = document.createElement('h2');
    h.textContent = 'Quem está assistindo?';
    elLista = document.createElement('div');
    elLista.className = 'confirma-botoes';
    elSub = document.createElement('p');
    elSub.className = 'aviso-sub';
    cx.appendChild(h);
    cx.appendChild(elLista);
    cx.appendChild(elSub);
    caixa.appendChild(cx);
    document.body.appendChild(caixa);
  }

  function aberto() { return !!caixa && !caixa.classList.contains('escondida'); }

  function fechar() {
    if (caixa) { caixa.classList.add('escondida'); }
    var f = aoFechar;
    aoFechar = null;
    if (f) { try { f(); } catch (e) { /* ignora */ } }
  }

  function marcar() {
    botoes.forEach(function (b, i) { b.classList.toggle('perigo', i === idx); });
    if (botoes[idx]) { botoes[idx].focus(); }
  }

  function escolher(i) {
    var p = perfis[i];
    if (!p) { return; }
    VLTV.nuvem.escolherPerfil(p);
    fechar();
  }

  // lista: [{ id, nome, imagem, kids }]. trocando = true quando veio de Configurações (Voltar fecha sem trocar).
  // depois (opcional): roda quando a janela fecha.
  function abrir(lista, trocando, depois) {
    if (!lista || lista.length === 0) { return; }
    montar();
    perfis = lista.slice(0);
    podeFechar = !!trocando || !!VLTV.dados.perfilAtual();
    aoFechar = depois || null;
    while (elLista.firstChild) { elLista.removeChild(elLista.firstChild); }
    var atual = VLTV.dados.perfilAtual();
    idx = 0;
    botoes = perfis.map(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao-conf';
      b.textContent = p.nome + (p.kids ? '  (Infantil)' : '') + (atual && atual.id === p.id ? '  ✓' : '');
      b.addEventListener('click', function () { escolher(i); });
      elLista.appendChild(b);
      if (atual && atual.id === p.id) { idx = i; }
      return b;
    });
    elSub.textContent = podeFechar
      ? 'Use as setas para escolher e aperte OK. Voltar fecha sem trocar.'
      : 'Use as setas para escolher e aperte OK. Os perfis são criados no celular.';
    caixa.classList.remove('escondida');
    marcar();
  }

  // Abre a partir de Configurações: busca a lista atual na nuvem.
  function abrirTroca(depois) {
    VLTV.nuvem.listarPerfis().then(function (lista) {
      if (lista.length === 0) { return; }
      abrir(lista, true, depois);
    }).catch(function () { /* sem internet: não abre */ });
  }

  // Teclas enquanto a janela está aberta. A janela fica com todas as teclas.
  function tecla(k) {
    if (k === TECLA.CIMA || k === TECLA.ESQ) { if (idx > 0) { idx--; marcar(); } return true; }
    if (k === TECLA.BAIXO || k === TECLA.DIR) { if (idx < botoes.length - 1) { idx++; marcar(); } return true; }
    if (k === TECLA.ENTER) { escolher(idx); return true; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { if (podeFechar) { fechar(); } return true; }
    return true;
  }

  VLTV.perfil = { abrir: abrir, abrirTroca: abrirTroca, aberto: aberto, tecla: tecla };
})();
