// VLTV Play - webOS | Catálogo de Filmes e Séries: categorias à esquerda, capas em grade à direita.
// Navegar pelas categorias só move a seleção; a grade só muda quando o usuário aperta OK.
// No topo da lista de categorias ficam "Pesquisar" (lupa) e "Favoritos" (tudo que foi marcado em MINHA LISTA).
// Categorias e títulos ficam guardados na TV (sync.js): da 2ª abertura em diante a tela já abre cheia
// e o painel é conferido por trás. As capas carregam por prioridade: primeiro as que aparecem na tela.
(function () {
  'use strict';

  var COLUNAS = 6;   // 6 por linha, capas grandes que preenchem a largura do painel (6 x 220 = 1320 de 1338 úteis)
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
  var caixaBusca = $('cat-busca-caixa');
  var elBusca = $('cat-busca');
  var statusBusca = $('cat-busca-status');

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

  var ESPERA_BUSCA_MS = 120;       // espera o usuário parar de digitar para pesquisar
  var ICONE_LUPA = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg>';
  var ICONE_ESTRELA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
  var CAT_BUSCA = { category_id: '__busca__', category_name: 'Pesquisar', especial: 'busca' };
  var CAT_FAV = { category_id: '__fav__', category_name: 'Favoritos', especial: 'fav' };

  function comEspeciais(lista) { return [CAT_BUSCA, CAT_FAV].concat(lista || []); }

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

  var foco = 'cat';              // 'cat' | 'grade' | 'busca' (caixa de pesquisa)
  var modoBusca = false;         // a grade está mostrando resultados de pesquisa
  var timerBusca = null;
  var msgVazio = 'Nenhum título nesta categoria.';
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
    painelGrade.classList.toggle('ativo', foco === 'grade' || foco === 'busca');
    caixaBusca.classList.toggle('foco', foco === 'busca');
    if (foco !== 'busca') { try { elBusca.blur(); } catch (e) { /* ignora */ } }
  }

  // ── Categorias ────────────────────────────────────────────────────
  function renderCategorias() {
    esvaziar(listaCats);
    itensCats = [];
    liSelCat = null;
    liAplicada = null;
    categorias.forEach(function (c) {
      var li = document.createElement('li');
      if (c.especial) {
        li.className = 'especial ' + c.especial;
        var icone = document.createElement('span');
        icone.className = 'icone';
        icone.innerHTML = c.especial === 'busca' ? ICONE_LUPA : ICONE_ESTRELA;
        li.appendChild(icone);
      }
      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = c.category_name || '';
      li.appendChild(nome);
      if (c.adulta) {
        var cad = document.createElement('span');
        cad.className = 'cadeado';
        cad.innerHTML = VLTV.parental.ICONE_CADEADO;
        li.appendChild(cad);
        if (VLTV.parental.bloqueando()) { li.classList.add('adulta'); }
      }
      listaCats.appendChild(li);
      itensCats.push(li);
    });
  }

  // Depois de digitar a senha, os cadeados somem.
  function atualizarCadeados() {
    itensCats.forEach(function (li, i) {
      li.classList.toggle('adulta', !!(categorias[i] && categorias[i].adulta && VLTV.parental.bloqueando()));
    });
  }

  function categoriaTrancada(c) { return !!(c && c.adulta && VLTV.parental.bloqueando()); }

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
    lista = VLTV.parental.filtrarItens(lista, tipo);
    itens = lista;
    itemIdx = 0;
    renderizados = 0;
    celulas = [];
    celulaSel = null;
    filaCapas = [];
    esvaziar(grade);
    if (lista.length === 0) {
      mensagem(grade, msgVazio);
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

    if (cat.especial === 'fav') {
      msgVazio = 'Nenhum favorito ainda. Abra um título e escolha MINHA LISTA para ele aparecer aqui.';
      aplicarItens(VLTV.dados.favoritosDe(tipo), focar);
      return;
    }
    msgVazio = 'Nenhum título nesta categoria.';

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
        if (cat && !cat.especial) { pedidos.push({ chave: chaveItens(cat), buscar: buscarItens(cat) }); }
      });
      VLTV.sync.aquecer(pedidos);
    }, ESPERA_AQUECER_MS);
  }

  // Abre na grade a categoria destacada.
  function aplicarCategoria(idx, focar) {
    catAplicada = idx;
    marcarAplicada();
    if (categorias[idx] && categorias[idx].especial === 'busca') {
      abrirBusca(focar);
      return;
    }
    fecharBusca();
    carregarItens(idx, focar);
  }

  // ── Pesquisa (lupa) ───────────────────────────────────────────────
  function palavraTipo() { return tipo === 'filmes' ? 'filme' : 'série'; }

  function fecharBusca() {
    modoBusca = false;
    clearTimeout(timerBusca);
    VLTV.indice.ouvir(tipo, null);
    caixaBusca.classList.add('escondida');
    statusBusca.classList.add('escondida');
  }

  function atualizarStatusBusca(feitas, total) {
    // Carregar em segundo plano é silencioso: o usuário não vê "carregando catálogo" nem contagem.
    // Só avisa se a conexão falhou de vez (os resultados podem estar incompletos).
    if (feitas < 0) {
      statusBusca.textContent = 'Sem conexão com o catálogo. Alguns títulos podem não aparecer.';
      statusBusca.classList.remove('escondida');
    } else {
      statusBusca.classList.add('escondida');
    }
  }

  function executarBusca() {
    if (!modoBusca) { return; }
    var texto = elBusca.value.replace(/^\s+|\s+$/g, '');
    tituloGrade.textContent = 'Pesquisar ' + (tipo === 'filmes' ? 'filmes' : 'séries');
    var prog = VLTV.indice.progresso(tipo);
    if (texto === '') {
      msgVazio = 'Digite o nome de ' + (tipo === 'filmes' ? 'um filme' : 'uma série') + ' para pesquisar.';
      aplicarItens([], false);
      return;
    }
    var achados = VLTV.indice.pesquisar(tipo, texto);
    msgVazio = prog.completo ? ('Nenhum ' + palavraTipo() + ' encontrado para "' + texto + '".') : ('Nenhum ' + palavraTipo() + ' encontrado até agora para "' + texto + '".');
    aplicarItens(achados, false);
  }

  function agendarBusca() {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(executarBusca, ESPERA_BUSCA_MS);
  }

  function abrirBusca(focar) {
    modoBusca = true;
    idReq++;                       // respostas atrasadas de categorias não podem sobrescrever a pesquisa
    caixaBusca.classList.remove('escondida');
    atualizarStatusBusca(VLTV.indice.progresso(tipo).feitas, VLTV.indice.progresso(tipo).total || 1);
    VLTV.indice.ouvir(tipo, function (feitas, total) {
      atualizarStatusBusca(feitas, total);
      if (foco === 'busca') { agendarBusca(); }     // chegou mais catálogo: atualiza os resultados enquanto digita
    });
    VLTV.indice.preparar(tipo);
    executarBusca();
    if (focar) { focarBusca(); }
  }

  function focarBusca() {
    trocarFoco('busca');
    try { elBusca.focus(); } catch (e) { /* ignora */ }
  }

  function irParaGrade() {
    var c = categorias[catIdx];
    if (c && c.especial === 'busca') {
      if (modoBusca && catIdx === catAplicada) { focarBusca(); } else { aplicarCategoria(catIdx, true); }
      return;
    }
    if (catIdx === catAplicada && itens.length > 0) {
      trocarFoco('grade');     // já é a categoria da grade: só entra nela
    } else {
      aplicarCategoria(catIdx, true);
    }
  }

  // OK na categoria: mostra os títulos na grade, mas o foco continua na lista de categorias.
  // Para navegar pelos títulos, o usuário aperta para a direita.
  function abrirSemFoco() {
    var c = categorias[catIdx];
    if (c && c.especial === 'busca') { irParaGrade(); return; }   // Pesquisar: OK leva para a caixa de busca
    if (catIdx === catAplicada && itens.length > 0) { return; }   // já está aberta
    aplicarCategoria(catIdx, false);
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
      if (falhaCategorias) { abrir(tipo, acoes); }
      else if (categoriaTrancada(categorias[catIdx])) {
        VLTV.parental.pedirSenha(function () { atualizarCadeados(); abrirSemFoco(); },
          { titulo: 'Categoria +18', sub: 'Digite a senha para abrir.' });
      } else { abrirSemFoco(); }
      return true;
    }
    if (k === TECLA.DIR) {
      // Direita só entra na grade que já está aberta: não troca de categoria.
      if (modoBusca) {
        catIdx = catAplicada;
        marcarCategoria();
        if (itens.length > 0) { trocarFoco('grade'); } else { focarBusca(); }
      } else if (catAplicada >= 0 && itens.length > 0) { entrarNaGradeAberta(); }
      return true;
    }
    return false;
  }

  function teclaGrade(k) {
    if (k === TECLA.ESQ) {
      if (itemIdx % COLUNAS === 0 || itens.length === 0) { voltarParaCategorias(); } else { moverItem(-1); }
    }
    else if (k === TECLA.DIR) { moverItem(1); }
    else if (k === TECLA.CIMA) {
      if (modoBusca && itemIdx < COLUNAS) { focarBusca(); } else { moverItem(-COLUNAS); }
    }
    else if (k === TECLA.BAIXO) { moverItem(COLUNAS); }
    else if (k === TECLA.ENTER) {
      if (itens.length === 0) { if (!modoBusca) { carregarItens(catAplicada, true); } } else { escolher(); }
    }
    else { return false; }
    return true;
  }

  // Na caixa de pesquisa: OK abre o teclado da TV (deixa a TV cuidar), as letras pesquisam sozinhas.
  function teclaBusca(k) {
    if (k === TECLA.BAIXO) {
      if (itens.length > 0) { trocarFoco('grade'); }
      return true;
    }
    if (k === TECLA.ESQ) { voltarParaCategorias(); return true; }
    if (k === TECLA.CIMA) { return true; }
    return false;     // OK e as demais teclas seguem para o teclado da TV
  }

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (foco === 'grade' || foco === 'busca') { voltarParaCategorias(); } else { sair(); }
      return true;
    }
    if (foco === 'cat') { return teclaCategorias(k); }
    if (foco === 'busca') { return teclaBusca(k); }
    return teclaGrade(k);
  }

  // ── Cursor do controle (Magic Remote) ────────────────────────────
  // Passar o cursor destaca o item (igual às setas) e o clique faz o mesmo que o OK.
  // Só reage se o cursor andou de verdade: a lista rolando sozinha embaixo dele não muda a seleção.
  function cursorAndou(e) { return VLTV.cursor.andou(e); }
  // Acha o filho direto de "pai" que contém o elemento tocado.
  function filhoDe(pai, el) {
    while (el && el.parentNode !== pai) { el = el.parentNode; }
    return el || null;
  }
  function dentroDe(el, classe, limite) {
    while (el && el !== limite) {
      if (el.classList && el.classList.contains(classe)) { return true; }
      el = el.parentNode;
    }
    return false;
  }

  function indiceCategoria(e) {
    var li = filhoDe(listaCats, e.target);
    return li ? itensCats.indexOf(li) : -1;
  }
  function indiceCelula(e) {
    var li = filhoDe(grade, e.target);
    return li ? celulas.indexOf(li) : -1;
  }

  listaCats.addEventListener('mousemove', function (e) {
    if (!cursorAndou(e)) { return; }
    var i = indiceCategoria(e);
    if (i < 0 || (foco === 'cat' && i === catIdx)) { return; }
    if (foco !== 'cat') { trocarFoco('cat'); }
    catIdx = i;
    marcarCategoria();
  });
  listaCats.addEventListener('click', function (e) {
    var i = indiceCategoria(e);
    if (i < 0) { return; }
    if (foco !== 'cat') { trocarFoco('cat'); }
    catIdx = i;
    marcarCategoria();
    teclaCategorias(TECLA.ENTER);      // abre a categoria, igual ao OK
  });

  grade.addEventListener('mousemove', function (e) {
    if (!cursorAndou(e)) { return; }
    var i = indiceCelula(e);
    if (i < 0 || (foco === 'grade' && i === itemIdx)) { return; }
    if (foco !== 'grade') { trocarFoco('grade'); }
    itemIdx = i;
    marcarItem();
  });
  grade.addEventListener('click', function (e) {
    var i = indiceCelula(e);
    if (i < 0) { return; }
    if (foco !== 'grade') { trocarFoco('grade'); }
    itemIdx = i;
    marcarItem();
    escolher();                        // abre os detalhes, igual ao OK
  });

  // Roda do controle: arrasta a lista/grade para cima ou para baixo e o destaque acompanha o cursor.
  function completarGrade() {
    while (renderizados < itens.length && grade.scrollTop + grade.clientHeight > grade.scrollHeight - 900) { renderMais(); }
  }

  VLTV.aoRodar(listaCats, function (sentido, e, forca) {
    VLTV.rolarRoda(listaCats, sentido, forca);
    var li = VLTV.filhoNoPonto(listaCats, e.clientX, e.clientY);
    var i = li ? itensCats.indexOf(li) : -1;
    if (i < 0 || (foco === 'cat' && i === catIdx)) { return; }
    if (foco !== 'cat') { trocarFoco('cat'); }
    catIdx = i;
    if (liSelCat) { liSelCat.classList.remove('sel'); }
    liSelCat = itensCats[catIdx];
    if (liSelCat) { liSelCat.classList.add('sel'); }
    agendarAquecer();
  });

  VLTV.aoRodar(grade, function (sentido, e, forca) {
    if (celulas.length === 0) { return; }
    if (sentido > 0) { completarGrade(); }
    VLTV.rolarRoda(grade, sentido, forca);
    completarGrade();
    var li = VLTV.filhoNoPonto(grade, e.clientX, e.clientY);
    var i = li ? celulas.indexOf(li) : -1;
    if (i >= 0 && !(foco === 'grade' && i === itemIdx)) {
      if (foco !== 'grade') { trocarFoco('grade'); }
      itemIdx = i;
      if (celulaSel) { celulaSel.classList.remove('sel'); }
      celulaSel = celulas[itemIdx];
      if (celulaSel) { celulaSel.classList.add('sel'); }
    }
    bombearCapas();      // as capas da parte que apareceu passam na frente da fila
  });

  // Clicar na caixa de pesquisa abre o teclado da TV.
  caixaBusca.addEventListener('click', function () { focarBusca(); });

  elBusca.addEventListener('input', agendarBusca);

  // Ao voltar dos detalhes: se a grade é a de Favoritos, atualiza (o título pode ter saído da lista).
  function atualizarFavoritos() {
    var c = categorias[catAplicada];
    if (!c || c.especial !== 'fav') { return; }
    var antigo = itemIdx;
    aplicarItens(VLTV.dados.favoritosDe(tipo), false);
    if (itens.length > 0) {
      itemIdx = Math.min(antigo, itens.length - 1);
      marcarItem();
    }
  }

  // ── Entrada e saída da tela ───────────────────────────────────────
  // tipoNovo: 'filmes' ou 'series'.
  // acoesNovas: { sair, abrirDetalhes(tipo, item, listaDaCategoria) }
  // Troca a lista de categorias por uma versão nova sem tirar o usuário do lugar.
  function atualizarCategorias(nova) {
    var idDestaque = categorias[catIdx] ? categorias[catIdx].category_id : null;
    var idAberta = categorias[catAplicada] ? categorias[catAplicada].category_id : null;
    categorias = comEspeciais(VLTV.parental.filtrarCategorias(tipo, nova));
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
    fecharBusca();
    elBusca.value = '';
    msgVazio = 'Nenhum título nesta categoria.';
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
        categorias = comEspeciais(VLTV.parental.filtrarCategorias(tipo, r.dados));
        renderCategorias();
        // Abre em Favoritos se já tem algum; senão na primeira categoria de verdade (que não esteja bloqueada).
        var inicio = VLTV.dados.favoritosDe(tipo).length > 0 ? 1 : (categorias.length > 2 ? 2 : 1);
        while (inicio < categorias.length - 1 && categoriaTrancada(categorias[inicio])) { inicio++; }
        if (categoriaTrancada(categorias[inicio])) { inicio = 1; }
        catIdx = inicio;
        marcarCategoria();
        aplicarCategoria(inicio, false);
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
    fecharBusca();
    if (acoes) { acoes.sair(); }
  }

  VLTV.catalogo = { abrir: abrir, tecla: tecla, atualizarFavoritos: atualizarFavoritos };
})();
