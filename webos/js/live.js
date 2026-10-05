// VLTV Play - webOS | TV ao vivo: categorias, canais, prévia e tela cheia.
(function () {
  'use strict';

  // Ordem de tentativa do formato do canal (se um falhar, tenta o próximo).
  var EXTENSOES = ['m3u8', 'ts', ''];
  var ESPERA_REPRODUZIR_MS = 12000;
  var ESPERA_CATEGORIA_MS = 350;
  var TAMANHO_LOTE = 150;
  var TEMPO_INFO_MS = 4000;

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40,
    PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428
  };

  function $(id) { return document.getElementById(id); }

  var listaCats = $('live-cats');
  var listaCanais = $('live-canais');
  var tituloCanais = $('live-canais-titulo');
  var painelCats = $('painel-cats');
  var painelCanais = $('painel-canais');
  var caixaPlayer = $('live-player');
  var video = $('live-video');
  var overlay = $('live-overlay');
  var infoCheio = $('live-info-cheio');
  var infoNome = $('live-nome');
  var infoAgora = $('live-agora');
  var infoDesc = $('live-descricao');
  var infoProximos = $('live-proximos');

  // Estado
  var categorias = [];
  var catIdx = 0;
  var itensCats = [];
  var liSelCat = null;

  var canais = [];
  var canalIdx = 0;
  var itensCanais = [];
  var renderizados = 0;
  var liSelCanal = null;
  var liTocando = null;
  var cacheCanais = {};

  var foco = 'cat';              // 'cat' ou 'canais'
  var cheio = false;
  var falhaCategorias = false;
  var focarAoCarregar = false;
  var aoSair = null;

  var tocando = null;            // canal em reprodução
  var listaTocando = null;       // lista de onde o canal saiu
  var idxTocando = 0;
  var extIdx = 0;
  var textoAgora = '';

  var idReqCanais = 0;
  var idPlay = 0;
  var idEpg = 0;
  var timerCat = null;
  var timerEspera = null;
  var timerInfo = null;

  // ── Utilidades de tela ────────────────────────────────────────────
  // Esvazia a lista e volta a rolagem para o topo (senão a lista nova nasce no meio e depois pula).
  function esvaziar(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
    el.scrollTop = 0;
  }

  function mensagemLista(ul, texto) {
    esvaziar(ul);
    var li = document.createElement('li');
    li.className = 'msg';
    li.textContent = texto;
    ul.appendChild(li);
  }

  function atualizarFoco() {
    painelCats.classList.toggle('ativo', foco === 'cat');
    painelCanais.classList.toggle('ativo', foco === 'canais');
  }

  function trocarFoco(novo) {
    foco = novo;
    atualizarFoco();
  }

  function mostrarOverlay(texto, tipo) {
    overlay.textContent = texto;
    overlay.className = 'overlay' + (tipo ? ' ' + tipo : '');
  }

  function esconderOverlay() { overlay.className = 'overlay escondida'; }

  // ── Categorias ────────────────────────────────────────────────────
  function renderCategorias() {
    esvaziar(listaCats);
    itensCats = [];
    liSelCat = null;
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

  // ── Canais ────────────────────────────────────────────────────────
  function criarItemCanal(canal) {
    var li = document.createElement('li');
    if (canal.stream_icon) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () { if (img.parentNode) { img.parentNode.removeChild(img); } };
      img.src = canal.stream_icon;
      li.appendChild(img);
    }
    var nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = canal.name || '';
    li.appendChild(nome);
    if (tocando && tocando.stream_id === canal.stream_id) {
      li.classList.add('tocando');
      liTocando = li;
    }
    return li;
  }

  // Desenha os canais aos poucos (lotes) para listas grandes não travarem a TV.
  function renderMais() {
    var fim = Math.min(canais.length, renderizados + TAMANHO_LOTE);
    for (var i = renderizados; i < fim; i++) {
      var li = criarItemCanal(canais[i]);
      itensCanais.push(li);
      listaCanais.appendChild(li);
    }
    renderizados = fim;
  }

  function marcarCanal() {
    while (renderizados < canais.length && renderizados <= canalIdx + 15) { renderMais(); }
    if (liSelCanal) { liSelCanal.classList.remove('sel'); }
    liSelCanal = itensCanais[canalIdx] || null;
    if (liSelCanal) {
      liSelCanal.classList.add('sel');
      VLTV.rolar(liSelCanal);
    }
  }

  function marcarTocando() {
    if (liTocando) { liTocando.classList.remove('tocando'); liTocando = null; }
    if (tocando && listaTocando === canais && itensCanais[idxTocando]) {
      liTocando = itensCanais[idxTocando];
      liTocando.classList.add('tocando');
    }
  }

  function aplicarCanais(lista, focar) {
    canais = lista;
    canalIdx = 0;
    renderizados = 0;
    itensCanais = [];
    liSelCanal = null;
    liTocando = null;
    esvaziar(listaCanais);
    if (lista.length === 0) {
      mensagemLista(listaCanais, 'Nenhum canal nesta categoria.');
      return;
    }
    renderMais();
    marcarCanal();
    marcarTocando();
    if (focar) { trocarFoco('canais'); }
    // Primeira vez na tela: já começa a tocar o primeiro canal na mini tela.
    // Depois disso, o canal só muda quando o usuário aperta OK em outro.
    if (!tocando) { tocar(lista, 0); }
  }

  function carregarCanais(idx, focar) {
    var cat = categorias[idx];
    if (!cat) { return; }
    var id = ++idReqCanais;
    tituloCanais.textContent = cat.category_name || 'Canais';

    if (cacheCanais[cat.category_id]) {
      aplicarCanais(cacheCanais[cat.category_id], focar);
      return;
    }

    canais = [];
    mensagemLista(listaCanais, 'Carregando canais...');
    VLTV.api.canaisAoVivo(cat.category_id)
      .then(function (lista) {
        if (id !== idReqCanais) { return; }
        cacheCanais[cat.category_id] = lista;
        aplicarCanais(lista, focar);
      })
      .catch(function () {
        if (id !== idReqCanais) { return; }
        canais = [];
        mensagemLista(listaCanais, 'Não foi possível carregar os canais. Pressione OK para tentar de novo.');
      });
  }

  function agendarCategoria() {
    if (timerCat) { clearTimeout(timerCat); }
    timerCat = setTimeout(function () {
      timerCat = null;
      carregarCanais(catIdx, false);
    }, ESPERA_CATEGORIA_MS);
  }

  function irParaCanais() {
    if (timerCat) {
      clearTimeout(timerCat);
      timerCat = null;
      carregarCanais(catIdx, true);
    } else if (canais.length > 0) {
      trocarFoco('canais');
    } else {
      carregarCanais(catIdx, true);
    }
  }

  // ── Guia de programação (EPG) ─────────────────────────────────────
  function linhaEpg(rotulo, p) {
    if (!p || !p.titulo) { return ''; }
    return rotulo + (p.inicio ? ' (' + p.inicio + ') ' : ' ') + p.titulo;
  }

  function mostrarInfoBasica() {
    infoNome.textContent = tocando ? (tocando.name || '') : '';
    infoAgora.textContent = '';
    infoDesc.textContent = '';
    esvaziar(infoProximos);
    textoAgora = '';
  }

  function carregarEpg(canal) {
    var id = ++idEpg;
    if (canal.url) { return; }   // lista M3U: sem guia de programação
    VLTV.api.epgCurto(canal.stream_id, 6)
      .then(function (lista) {
        if (id !== idEpg) { return; }
        var atual = lista[0];
        var agora = linhaEpg('Agora', atual);
        infoAgora.textContent = atual && atual.titulo
          ? 'Agora' + (atual.inicio ? ' (' + atual.inicio + (atual.fim ? ' - ' + atual.fim : '') + ')' : '') + ' ' + atual.titulo
          : 'Sem informação de programação.';
        infoDesc.textContent = atual && atual.descricao ? atual.descricao : '';
        esvaziar(infoProximos);
        lista.slice(1, 5).forEach(function (p) {
          if (!p.titulo) { return; }
          var linha = document.createElement('div');
          var h = document.createElement('span');
          h.className = 'hora-prog';
          h.textContent = p.inicio;
          linha.appendChild(h);
          linha.appendChild(document.createTextNode(p.titulo));
          infoProximos.appendChild(linha);
        });
        textoAgora = agora;
        if (cheio && !infoCheio.classList.contains('escondida')) { desenharInfoCheio(); }
      })
      .catch(function () {
        if (id !== idEpg) { return; }
        infoAgora.textContent = 'Sem informação de programação.';
      });
  }

  // ── Reprodução ────────────────────────────────────────────────────
  function iniciarExtensao() {
    var meu = idPlay;
    clearTimeout(timerEspera);

    // Canal de lista M3U tem endereço próprio: uma tentativa só.
    var tentativas = tocando.url ? [''] : EXTENSOES;
    if (extIdx >= tentativas.length) {
      mostrarOverlay('Canal indisponível no momento.', 'erro');
      return;
    }

    mostrarOverlay('Carregando...');
    video.src = tocando.url ? tocando.url : VLTV.api.urlCanal(tocando.stream_id, EXTENSOES[extIdx]);
    var p = video.play();
    if (p && p.catch) { p.catch(function () { /* o erro chega pelo evento 'error' */ }); }

    timerEspera = setTimeout(function () {
      if (meu === idPlay) { proximaExtensao(); }
    }, ESPERA_REPRODUZIR_MS);
  }

  function proximaExtensao() {
    extIdx++;
    iniciarExtensao();
  }

  function tocar(lista, idx) {
    tocando = lista[idx];
    listaTocando = lista;
    idxTocando = idx;
    extIdx = 0;
    idPlay++;
    mostrarInfoBasica();
    marcarTocando();
    carregarEpg(tocando);
    iniciarExtensao();
  }

  function parar() {
    idPlay++;
    idEpg++;
    clearTimeout(timerEspera);
    clearTimeout(timerInfo);
    tocando = null;
    listaTocando = null;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* ignora */ }
    esconderOverlay();
    marcarTocando();
    mostrarInfoBasica();
  }

  video.addEventListener('playing', function () {
    clearTimeout(timerEspera);
    esconderOverlay();
  });
  video.addEventListener('waiting', function () {
    if (tocando) { mostrarOverlay('Carregando...'); }
  });
  video.addEventListener('error', function () {
    if (tocando) { proximaExtensao(); }
  });

  // ── Tela cheia ────────────────────────────────────────────────────
  function desenharInfoCheio() {
    esvaziar(infoCheio);
    var nome = document.createElement('div');
    nome.className = 'info-nome';
    nome.textContent = tocando ? (tocando.name || '') : '';
    var agora = document.createElement('div');
    agora.className = 'info-linha';
    agora.textContent = textoAgora;
    infoCheio.appendChild(nome);
    infoCheio.appendChild(agora);
  }

  function mostrarInfoCheio() {
    desenharInfoCheio();
    infoCheio.classList.remove('escondida');
    clearTimeout(timerInfo);
    timerInfo = setTimeout(function () { infoCheio.classList.add('escondida'); }, TEMPO_INFO_MS);
  }

  function entrarCheio() {
    cheio = true;
    caixaPlayer.classList.add('cheio');
    mostrarInfoCheio();
  }

  function sairCheio() {
    cheio = false;
    clearTimeout(timerInfo);
    infoCheio.classList.add('escondida');
    caixaPlayer.classList.remove('cheio');
  }

  // Troca de canal em tela cheia (volta ao início/fim da lista de forma circular).
  function trocarCanal(passo) {
    if (!listaTocando || listaTocando.length === 0) { return; }
    var n = listaTocando.length;
    var novo = (idxTocando + passo + n) % n;
    if (listaTocando === canais) {
      canalIdx = novo;
      marcarCanal();
    }
    tocar(listaTocando, novo);
    mostrarInfoCheio();
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function mover(passo) {
    if (canais.length === 0) { return; }
    canalIdx = Math.max(0, Math.min(canais.length - 1, canalIdx + passo));
    marcarCanal();
  }

  function teclaCheio(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { sairCheio(); }
    else if (k === TECLA.ENTER) { mostrarInfoCheio(); }
    else if (k === TECLA.CIMA || k === TECLA.CH_MENOS || k === TECLA.PG_BAIXO) { trocarCanal(-1); }
    else if (k === TECLA.BAIXO || k === TECLA.CH_MAIS || k === TECLA.PG_CIMA) { trocarCanal(1); }
    return true;
  }

  function teclaCategorias(k) {
    if (k === TECLA.CIMA || k === TECLA.BAIXO) {
      var novo = catIdx + (k === TECLA.CIMA ? -1 : 1);
      if (novo >= 0 && novo < categorias.length) {
        catIdx = novo;
        marcarCategoria();
        agendarCategoria();
      }
      return true;
    }
    if (k === TECLA.DIR || k === TECLA.ENTER) {
      if (falhaCategorias) { abrir(aoSair); } else { irParaCanais(); }
      return true;
    }
    return false;
  }

  function teclaCanais(k) {
    if (k === TECLA.ESQ) { trocarFoco('cat'); }
    else if (k === TECLA.CIMA) { mover(-1); }
    else if (k === TECLA.BAIXO) { mover(1); }
    else if (k === TECLA.PG_CIMA || k === TECLA.CH_MAIS) { mover(-8); }
    else if (k === TECLA.PG_BAIXO || k === TECLA.CH_MENOS) { mover(8); }
    else if (k === TECLA.ENTER) {
      var canal = canais[canalIdx];
      if (!canal) { return true; }
      if (tocando && tocando.stream_id === canal.stream_id) { entrarCheio(); }
      else { tocar(canais, canalIdx); }
    } else { return false; }
    return true;
  }

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (cheio) { return teclaCheio(k); }

    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (foco === 'canais') { trocarFoco('cat'); } else { sair(); }
      return true;
    }
    return foco === 'cat' ? teclaCategorias(k) : teclaCanais(k);
  }

  // ── Entrada e saída da tela ───────────────────────────────────────
  function abrir(callbackSair) {
    aoSair = callbackSair;
    cheio = false;
    caixaPlayer.classList.remove('cheio');
    infoCheio.classList.add('escondida');
    falhaCategorias = false;
    categorias = [];
    canais = [];
    catIdx = 0;
    trocarFoco('cat');
    mensagemLista(listaCats, 'Carregando categorias...');
    mensagemLista(listaCanais, '');
    tituloCanais.textContent = 'Canais';

    VLTV.api.categoriasAoVivo()
      .then(function (lista) {
        categorias = lista;
        if (lista.length === 0) {
          mensagemLista(listaCats, 'Nenhuma categoria encontrada.');
          return;
        }
        renderCategorias();
        marcarCategoria();
        carregarCanais(0, false);
      })
      .catch(function () {
        falhaCategorias = true;
        mensagemLista(listaCats, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  function sair() {
    sairCheio();
    parar();
    if (timerCat) { clearTimeout(timerCat); timerCat = null; }
    if (aoSair) { aoSair(); }
  }

  VLTV.live = { abrir: abrir, tecla: tecla };
})();
