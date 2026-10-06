// VLTV Play - webOS | Catálogo de Filmes e Séries: categorias à esquerda, capas em grade à direita.
// Navegar pelas categorias só move a seleção; a grade só muda quando o usuário aperta OK.
// Categorias e títulos ficam guardados na TV (sync.js): da 2ª abertura em diante a tela já abre cheia
// e o painel é conferido por trás. As capas carregam por prioridade: primeiro as que aparecem na tela.
(function () {
  'use strict';

  var COLUNAS = 8;
  var TAMANHO_LOTE = 48;
  var CAPAS_SIMULTANEAS = 6;       // capas baixando ao mesmo tempo (mais que isso engarrafa a rede da TV)
  var ESPERA_CAPA_MS = 8000;       // capa que não chega em 8 s libera a vaga para a próxima
  var ESPERA_AQUECER_MS = 700;     // parado numa categoria por esse tempo: já prepara ela e as vizinhas
  var ESQUELETOS = 16;

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

  var idAbertura = 0;              // cada abertura da tela tem a sua; respostas atrasadas são ignoradas
  var timerAquecer = null;
  var filaCapas = [];              // capas esperando a vez: { img, url, indice }
  var capasAtivas = 0;

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
    agendarAquecer();
  }

  // Sinaliza qual categoria está aberta na grade (fica marcada enquanto se navega pelas outras).
  function marcarAplicada() {
    if (liAplicada) { liAplicada.classList.remove('aplicada'); }
    liAplicada = itensCats[catAplicada] || null;
    if (liAplicada) { liAplicada.classList.add('aplicada'); }
  }

  // ── Fila de capas (as da tela primeiro) ───────────────────────────
  function linhaAtual() { return Math.floor(itemIdx / COLUNAS); }

  // Quanto menor, mais urgente: a linha da seleção e as de baixo vêm antes das de cima.
  function distancia(indice) {
    var d = Math.floor(indice / COLUNAS) - linhaAtual();
    return d >= 0 ? d : (-d) * 3;
  }

  function bombearCapas() {
    while (capasAtivas < CAPAS_SIMULTANEAS && filaCapas.length > 0) {
      var melhor = 0;
      for (var i = 1; i < filaCapas.length; i++) {
        if (distancia(filaCapas[i].indice) < distancia(filaCapas[melhor].indice)) { melhor = i; }
      }
      iniciarCapa(filaCapas.splice(melhor, 1)[0]);
    }
  }

  function iniciarCapa(pedido) {
    var img = pedido.img;
    var liberada = false;
    function liberar() {
      if (liberada) { return; }
      liberada = true;
      clearTimeout(limite);
      capasAtivas--;
      bombearCapas();
    }
    var limite = setTimeout(liberar, ESPERA_CAPA_MS);
    capasAtivas++;
    img.onload = function () { img.classList.add('ok'); liberar(); };
    img.onerror = function () {
      if (img.parentNode) {
        var capa = img.parentNode;
        capa.removeChild(img);
        capa.textContent = pedido.letra;
      }
      liberar();
    };
    img.src = pedido.url;
  }

  // ── Grade de capas ────────────────────────────────────────────────
  function mostrarEsqueleto() {
    esvaziar(grade);
    celulas = [];
    celulaSel = null;
    filaCapas = [];
    for (var i = 0; i < ESQUELETOS; i++) {
      var li = document.createElement('li');
      li.className = 'celula esqueleto';
      var capa = document.createElement('div');
      capa.className = 'capa';
      var nome = document.createElement('div');
      nome.className = 'celula-nome';
      li.appendChild(capa);
      li.appendChild(nome);
      grade.appendChild(li);
    }
  }

  function criarCelula(item, indice) {
    var li = document.createElement('li');
    li.className = 'celula';

    var capa = document.createElement('div');
    capa.className = 'capa';
    var nomeItem = item.name || '';
    var url = item[cfg.campoCapa];

    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      capa.appendChild(img);
      filaCapas.push({ img: img, url: url, indice: indice, letra: nomeItem.charAt(0).toUpperCase() });
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
      var c = criarCelula(itens[i], i);
      celulas.push(c);
      grade.appendChild(c);
    }
    renderizados = fim;
    bombearCapas();
  }

  function marcarItem() {
    while (renderizados < itens.length && renderizados <= itemIdx + COLUNAS * 3) { renderMais(); }
    if (celulaSel) { celulaSel.classList.remove('sel'); }
    celulaSel = celulas[itemIdx] || null;
    if (celulaSel) {
      celulaSel.classList.add('sel');
      VLTV.rolar(celulaSel);
    }
    bombearCapas();
  }

  function aplicarItens(lista, focar) {
    itens = lista;
    itemIdx = 0;
    renderizados = 0;
    celulas = [];
    celulaSel = null;
    filaCapas = [];
    esvaziar(grade);
    if (lista.length === 0) {
      mensagem(grade, 'Nenhum título nesta categoria.');
      return;
    }
    renderMais();
    marcarItem();
    if (focar) { trocarFoco('grade'); }
  }

  function chaveItens(cat) { return tipo + '|itens|' + cat.category_id; }

  function buscarItens(cat) { return function () { return cfg.itens(cat.category_id); }; }

  function carregarItens(idx, focar) {
    var cat = categorias[idx];
    if (!cat) { return; }
    var id = ++idReq;
    var abertura = idAbertura;
    tituloGrade.textContent = cat.category_name || cfg.titulo;

    itens = [];
    var mostrouEsqueleto = false;
    // Se a lista não estiver guardada, mostra o esqueleto enquanto o painel responde.
    var espera = setTimeout(function () {
      if (id === idReq) { mostrarEsqueleto(); mostrouEsqueleto = true; }
    }, 120);

    VLTV.sync.obter(chaveItens(cat), buscarItens(cat))
      .then(function (r) {
        clearTimeout(espera);
        if (id !== idReq || abertura !== idAbertura) { return; }
        aplicarItens(r.dados, focar);
        // O painel foi conferido por trás: se mudou algo, atualiza (só se o usuário não estiver na grade).
        r.atualizacao.then(function (novo) {
          if (!novo || id !== idReq || abertura !== idAbertura || foco !== 'cat' || catAplicada !== idx) { return; }
          aplicarItens(novo, false);
        });
      })
      .catch(function () {
        clearTimeout(espera);
        if (id !== idReq || abertura !== idAbertura) { return; }
        itens = [];
        mensagem(grade, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  // ── Preparar o que vem a seguir ───────────────────────────────────
  // Parado numa categoria, a TV já baixa (e guarda) a dela e as vizinhas: o OK fica instantâneo.
  function agendarAquecer() {
    clearTimeout(timerAquecer);
    if (categorias.length === 0) { return; }
    var abertura = idAbertura;
    timerAquecer = setTimeout(function () {
      if (abertura !== idAbertura) { return; }
      var ordem = [catIdx, catIdx + 1, catIdx - 1, catIdx + 2];
      var pedidos = [];
      ordem.forEach(function (i) {
        var cat = categorias[i];
        if (cat) { pedidos.push({ chave: chaveItens(cat), buscar: buscarItens(cat) }); }
      });
      VLTV.sync.aquecer(pedidos);
    }, ESPERA_AQUECER_MS);
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
  // Troca a lista de categorias por uma versão nova sem tirar o usuário do lugar.
  function atualizarCategorias(nova) {
    var idDestaque = categorias[catIdx] ? categorias[catIdx].category_id : null;
    var idAberta = categorias[catAplicada] ? categorias[catAplicada].category_id : null;
    categorias = nova;
    renderCategorias();
    var novoDestaque = 0;
    var novaAberta = 0;
    categorias.forEach(function (c, i) {
      if (c.category_id === idDestaque) { novoDestaque = i; }
      if (c.category_id === idAberta) { novaAberta = i; }
    });
    catIdx = novoDestaque;
    catAplicada = novaAberta;
    marcarCategoria();
    marcarAplicada();
  }

  function abrir(tipoNovo, acoesNovas) {
    tipo = tipoNovo;
    cfg = CONFIG[tipo];
    acoes = acoesNovas;
    categorias = [];
    itens = [];
    catIdx = 0;
    catAplicada = -1;
    falhaCategorias = false;
    idReq++;
    var abertura = ++idAbertura;
    clearTimeout(timerAquecer);
    filaCapas = [];

    tituloCats.textContent = cfg.titulo;
    tituloGrade.textContent = '';
    trocarFoco('cat');
    mensagem(listaCats, 'Carregando categorias...');
    mostrarEsqueleto();

    VLTV.sync.obter(tipo + '|cats', cfg.categorias)
      .then(function (r) {
        if (abertura !== idAbertura) { return; }
        categorias = r.dados;
        if (categorias.length === 0) {
          esvaziar(grade);
          mensagem(listaCats, 'Nenhuma categoria encontrada.');
          return;
        }
        renderCategorias();
        marcarCategoria();
        aplicarCategoria(0, false);
        // Categorias novas no painel: só entram se o usuário ainda não saiu do lugar.
        r.atualizacao.then(function (nova) {
          if (!nova || abertura !== idAbertura || foco !== 'cat' || catIdx !== catAplicada) { return; }
          atualizarCategorias(nova);
        });
      })
      .catch(function () {
        if (abertura !== idAbertura) { return; }
        falhaCategorias = true;
        esvaziar(grade);
        mensagem(listaCats, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  function sair() {
    if (acoes) { acoes.sair(); }
  }

  VLTV.catalogo = { abrir: abrir, tecla: tecla };
})();
