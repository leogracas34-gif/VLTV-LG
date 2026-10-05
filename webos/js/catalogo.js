// VLTV Play - webOS | Catálogo de Filmes e Séries: categorias à esquerda, capas em grade à direita.
// Navegar pelas categorias só move a seleção; a grade só muda quando o usuário aperta OK.
(function () {
  'use strict';

  var COLUNAS = 8;
  var TAMANHO_LOTE = 48;

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40
  };

  function $(id) { return document.getElementById(id); }

  var tituloCats = $('cat-titulo-cats');
  var listaCats = $('cat-cats');
  var tituloGrade = $('cat-grade-titulo');
  var grade = $('cat-grade');
  var painelCats = $('cat-painel-cats');
  var painelGrade = $('cat-painel-grade');

  var CONFIG = {
    filmes: {
      titulo: 'Filmes',
      categorias: function () { return VLTV.api.categoriasFilmes(); },
      itens: function (id) { return VLTV.api.filmesPorCategoria(id); },
      campoCapa: 'stream_icon'
    },
    series: {
      titulo: 'Séries',
      categorias: function () { return VLTV.api.categoriasSeries(); },
      itens: function (id) { return VLTV.api.seriesPorCategoria(id); },
      campoCapa: 'cover'
    }
  };

  var tipo = 'filmes';
  var cfg = CONFIG.filmes;
  var acoes = null;

  var categorias = [];
  var catIdx = 0;            // categoria destacada (move com cima/baixo)
  var catAplicada = -1;      // categoria cujos títulos estão na grade
  var itensCats = [];
  var liSelCat = null;
  var liAplicada = null;

  var itens = [];
  var itemIdx = 0;
  var celulas = [];
  var renderizados = 0;
  var celulaSel = null;
  var cache = {};

  var foco = 'cat';
  var falhaCategorias = false;
  var idReq = 0;

  // ── Utilidades ────────────────────────────────────────────────────
  // Esvazia a lista e volta a rolagem para o topo (senão a lista nova nasce no meio e depois pula).
  function esvaziar(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
    el.scrollTop = 0;
  }

  function mensagem(el, texto) {
    esvaziar(el);
    var li = document.createElement('li');
    li.className = 'msg';
    li.textContent = texto;
    el.appendChild(li);
  }

  function trocarFoco(novo) {
    foco = novo;
    painelCats.classList.toggle('ativo', foco === 'cat');
    painelGrade.classList.toggle('ativo', foco === 'grade');
  }

  // ── Categorias ────────────────────────────────────────────────────
  function renderCategorias() {
    esvaziar(listaCats);
    itensCats = [];
    liSelCat = null;
    liAplicada = null;
    categorias.forEach(function (c) {
      var li = document.createElement('li');
      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = c.category_name || '';
      li.appendChild(nome);
      listaCats.appendChild(li);
      itensCats.push(li);
    });
  }

  function marcarCategoria() {
    if (liSelCat) { liSelCat.classList.remove('sel'); }
    liSelCat = itensCats[catIdx] || null;
    if (liSelCat) {
      liSelCat.classList.add('sel');
      VLTV.rolar(liSelCat);
    }
  }

  // Sinaliza qual categoria está aberta na grade (fica marcada enquanto se navega pelas outras).
  function marcarAplicada() {
    if (liAplicada) { liAplicada.classList.remove('aplicada'); }
    liAplicada = itensCats[catAplicada] || null;
    if (liAplicada) { liAplicada.classList.add('aplicada'); }
  }

  // ── Grade de capas ────────────────────────────────────────────────
  function criarCelula(item) {
    var li = document.createElement('li');
    li.className = 'celula';

    var capa = document.createElement('div');
    capa.className = 'capa';
    var nomeItem = item.name || '';
    var url = item[cfg.campoCapa];

    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        capa.textContent = nomeItem.charAt(0).toUpperCase();
      };
      img.src = url;
      capa.appendChild(img);
    } else {
      capa.textContent = nomeItem.charAt(0).toUpperCase();
    }

    var nome = document.createElement('div');
    nome.className = 'celula-nome';
    nome.textContent = VLTV.titulo.limpar(nomeItem);

    li.appendChild(capa);
    li.appendChild(nome);
    return li;
  }

  // Desenha em lotes: categorias com milhares de títulos não travam a TV.
  function renderMais() {
    var fim = Math.min(itens.length, renderizados + TAMANHO_LOTE);
    for (var i = renderizados; i < fim; i++) {
      var c = criarCelula(itens[i]);
      celulas.push(c);
      grade.appendChild(c);
    }
    renderizados = fim;
  }

  function marcarItem() {
    while (renderizados < itens.length && renderizados <= itemIdx + COLUNAS * 3) { renderMais(); }
    if (celulaSel) { celulaSel.classList.remove('sel'); }
    celulaSel = celulas[itemIdx] || null;
    if (celulaSel) {
      celulaSel.classList.add('sel');
      VLTV.rolar(celulaSel);
    }
  }

  function aplicarItens(lista, focar) {
    itens = lista;
    itemIdx = 0;
    renderizados = 0;
    celulas = [];
    celulaSel = null;
    esvaziar(grade);
    if (lista.length === 0) {
      mensagem(grade, 'Nenhum título nesta categoria.');
      return;
    }
    renderMais();
    marcarItem();
    if (focar) { trocarFoco('grade'); }
  }

  function carregarItens(idx, focar) {
    var cat = categorias[idx];
    if (!cat) { return; }
    var id = ++idReq;
    tituloGrade.textContent = cat.category_name || cfg.titulo;

    if (cache[cat.category_id]) {
      aplicarItens(cache[cat.category_id], focar);
      return;
    }

    itens = [];
    mensagem(grade, 'Carregando...');
    cfg.itens(cat.category_id)
      .then(function (lista) {
        if (id !== idReq) { return; }
        cache[cat.category_id] = lista;
        aplicarItens(lista, focar);
      })
      .catch(function () {
        if (id !== idReq) { return; }
        itens = [];
        mensagem(grade, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  // Abre na grade a categoria destacada.
  function aplicarCategoria(idx, focar) {
    catAplicada = idx;
    marcarAplicada();
    carregarItens(idx, focar);
  }

  function irParaGrade() {
    if (catIdx === catAplicada && itens.length > 0) {
      trocarFoco('grade');     // já é a categoria da grade: só entra nela
    } else {
      aplicarCategoria(catIdx, true);
    }
  }

  // Passa para a grade sem mexer nela; o destaque volta para a categoria que está aberta.
  function entrarNaGradeAberta() {
    catIdx = catAplicada;
    marcarCategoria();
    trocarFoco('grade');
  }

  // Volta para a lista de categorias, destacando a categoria que está na grade.
  function voltarParaCategorias() {
    if (catAplicada >= 0) { catIdx = catAplicada; }
    marcarCategoria();
    trocarFoco('cat');
  }

  // ── Escolher um título ────────────────────────────────────────────
  function escolher() {
    var item = itens[itemIdx];
    if (!item) { return; }
    acoes.abrirDetalhes(tipo, item, itens);
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function moverItem(passo) {
    var novo = itemIdx + passo;
    if (novo < 0) { return; }
    if (novo >= itens.length) {
      // Descendo: se ainda há uma linha abaixo, vai para o último título.
      var linhaAtual = Math.floor(itemIdx / COLUNAS);
      var ultimaLinha = Math.floor((itens.length - 1) / COLUNAS);
      if (passo === COLUNAS && linhaAtual < ultimaLinha) { novo = itens.length - 1; } else { return; }
    }
    itemIdx = novo;
    marcarItem();
  }

  function teclaCategorias(k) {
    if (k === TECLA.CIMA || k === TECLA.BAIXO) {
      var novo = catIdx + (k === TECLA.CIMA ? -1 : 1);
      if (novo >= 0 && novo < categorias.length) {
        catIdx = novo;
        marcarCategoria();      // só move o destaque: a grade ao lado não muda
      }
      return true;
    }
    if (k === TECLA.ENTER) {
      // Só o OK abre a categoria destacada na grade.
      if (falhaCategorias) { abrir(tipo, acoes); } else { irParaGrade(); }
      return true;
    }
    if (k === TECLA.DIR) {
      // Direita só entra na grade que já está aberta: não troca de categoria.
      if (catAplicada >= 0 && itens.length > 0) { entrarNaGradeAberta(); }
      return true;
    }
    return false;
  }

  function teclaGrade(k) {
    if (k === TECLA.ESQ) {
      if (itemIdx % COLUNAS === 0 || itens.length === 0) { voltarParaCategorias(); } else { moverItem(-1); }
    }
    else if (k === TECLA.DIR) { moverItem(1); }
    else if (k === TECLA.CIMA) { moverItem(-COLUNAS); }
    else if (k === TECLA.BAIXO) { moverItem(COLUNAS); }
    else if (k === TECLA.ENTER) {
      if (itens.length === 0) { carregarItens(catAplicada, true); } else { escolher(); }
    }
    else { return false; }
    return true;
  }

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (foco === 'grade') { voltarParaCategorias(); } else { sair(); }
      return true;
    }
    return foco === 'cat' ? teclaCategorias(k) : teclaGrade(k);
  }

  // ── Entrada e saída da tela ───────────────────────────────────────
  // tipoNovo: 'filmes' ou 'series'.
  // acoesNovas: { sair, abrirDetalhes(tipo, item, listaDaCategoria) }
  function abrir(tipoNovo, acoesNovas) {
    tipo = tipoNovo;
    cfg = CONFIG[tipo];
    acoes = acoesNovas;
    cache = {};
    categorias = [];
    itens = [];
    catIdx = 0;
    catAplicada = -1;
    falhaCategorias = false;
    idReq++;

    tituloCats.textContent = cfg.titulo;
    tituloGrade.textContent = '';
    trocarFoco('cat');
    mensagem(listaCats, 'Carregando categorias...');
    esvaziar(grade);

    cfg.categorias()
      .then(function (lista) {
        categorias = lista;
        if (lista.length === 0) {
          mensagem(listaCats, 'Nenhuma categoria encontrada.');
          return;
        }
        renderCategorias();
        marcarCategoria();
        aplicarCategoria(0, false);
      })
      .catch(function () {
        falhaCategorias = true;
        mensagem(listaCats, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  function sair() {
    if (acoes) { acoes.sair(); }
  }

  VLTV.catalogo = { abrir: abrir, tecla: tecla };
})();
