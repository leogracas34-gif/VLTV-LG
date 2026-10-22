// VLTV Play - webOS | TV ao vivo: categorias, canais, prévia e tela cheia.
// A primeira categoria é "Favoritos". Cada canal tem uma estrela: seta para a direita chega nela, OK marca/desmarca
// (a tecla amarela do controle faz o mesmo direto).
(function () {
  'use strict';

  // Ordem de tentativa do formato do canal (se um falhar, tenta o próximo).
  var EXT_TS_PRIMEIRO = ['ts', 'm3u8', ''];
  var EXT_HLS_PRIMEIRO = ['m3u8', 'ts', ''];
  var CH_TS_FALHAS = 'vltv_live_ts_falhas_' + ((VLTV.config && VLTV.config.VERSAO) || '');   // vezes seguidas em que o .ts não abriu e o .m3u8 tocou (a cada versão nova do app tenta o .ts de novo)
  var ordemTsPrimeiro = false;                // a ordem usada no canal que está abrindo
  var formatoContado = false;                 // já contou o resultado deste canal (reconexões não contam de novo)

  function lerTsFalhas() {
    try { return parseInt(localStorage.getItem(CH_TS_FALHAS) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function gravarTsFalhas(n) {
    try { localStorage.setItem(CH_TS_FALHAS, String(n)); } catch (e) { /* ignora */ }
  }
  function ordemExtensoes() {
    var pref = String((VLTV.config && VLTV.config.FORMATO_LIVE) || 'ts').toLowerCase();
    ordemTsPrimeiro = pref !== 'm3u8' && lerTsFalhas() < 2;
    return ordemTsPrimeiro ? EXT_TS_PRIMEIRO : EXT_HLS_PRIMEIRO;
  }
  var TAMANHO_LOTE = 150;
  var TEMPO_INFO_MS = 4000;
  var ICONE_ESTRELA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
  var CAT_FAV = { category_id: '__fav__', category_name: 'Favoritos', especial: 'fav' };
  var MSG_SEM_FAV = 'Nenhum canal favorito ainda. Em qualquer canal, aperte → e depois OK na estrela (ou a tecla amarela).';

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40,
    PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428, AMARELO: 405
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
  var infoQualidade = $('live-qualidade');
  var infoAgora = $('live-agora');
  var infoDesc = $('live-descricao');
  var infoProximos = $('live-proximos');

  // Estado
  var categorias = [];
  var catIdx = 0;            // categoria marcada pelo cursor
  var catCarregada = -1;     // categoria cujos canais estão na tela
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
  var focoEstrela = false;       // cursor na estrela do canal (e não no nome)
  var cheio = false;
  var falhaCategorias = false;
  var focarAoCarregar = false;
  var aoSair = null;

  var tocando = null;            // canal em reprodução
  var listaTocando = null;       // lista de onde o canal saiu
  var idxTocando = 0;
  var textoAgora = '';

  var idReqCanais = 0;
  var idEpg = 0;
  var timerEpg = null;
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
    if (foco !== 'canais') { definirEstrela(false); }
    atualizarFoco();
  }

  function definirEstrela(ligada) {
    focoEstrela = ligada;
    if (liSelCanal) { liSelCanal.classList.toggle('foco-estrela', ligada); }
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
      if (c.especial) {
        li.className = 'especial ' + c.especial;
        var icone = document.createElement('span');
        icone.className = 'icone';
        icone.innerHTML = ICONE_ESTRELA;
        li.appendChild(icone);
      }
      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = VLTV.idioma.categoria(c.category_name || '');
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

  // Uma barrinha clara mostra qual categoria está com os canais na tela.
  function marcarCarregada() {
    itensCats.forEach(function (li, i) { li.classList.toggle('carregada', i === catCarregada); });
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
    var estrela = document.createElement('span');
    estrela.className = 'estrela' + (VLTV.dados.ehFavorito('canais', canal.stream_id) ? ' ativa' : '');
    estrela.innerHTML = ICONE_ESTRELA;
    li.appendChild(estrela);
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
    if (liSelCanal) { liSelCanal.classList.remove('sel'); liSelCanal.classList.remove('foco-estrela'); }
    liSelCanal = itensCanais[canalIdx] || null;
    if (liSelCanal) {
      liSelCanal.classList.add('sel');
      if (focoEstrela && foco === 'canais') { liSelCanal.classList.add('foco-estrela'); }
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
    lista = VLTV.parental.filtrarItens(lista, 'canais');
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
    catCarregada = idx;
    marcarCarregada();
    tituloCanais.textContent = VLTV.idioma.categoria(cat.category_name || 'Canais');
    definirEstrela(false);

    if (cat.especial === 'fav') {
      var favs = VLTV.dados.favoritosDe('canais');
      if (favs.length === 0) {
        canais = [];
        itensCanais = [];
        liSelCanal = null;
        mensagemLista(listaCanais, MSG_SEM_FAV);
        return;
      }
      aplicarCanais(favs, focar);
      return;
    }

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

  // Seta para a direita: entra na lista de canais que já está na tela (não troca de categoria nem carrega nada).
  function irParaCanais() {
    if (canais.length === 0) { return; }
    if (catCarregada >= 0) { catIdx = catCarregada; marcarCategoria(); }
    trocarFoco('canais');
  }

  // OK: carrega os canais da categoria marcada, mas o foco continua nas categorias (igual Filmes e Séries).
  // Para navegar pelos canais, o usuário aperta para a direita.
  function escolherCategoria() {
    if (categoriaTrancada(categorias[catIdx])) {
      VLTV.parental.pedirSenha(function () {
        atualizarCadeados();
        carregarCanais(catIdx, false);
      }, { titulo: 'Categoria +18', sub: 'Digite a senha para abrir.' });
      return;
    }
    if (catIdx === catCarregada && canais.length > 0) { return; }   // já está aberta
    carregarCanais(catIdx, false);
  }

  // Voltando para as categorias, o cursor volta para a que está com os canais na tela.
  function voltarParaCategorias() {
    if (catCarregada >= 0) { catIdx = catCarregada; marcarCategoria(); }
    trocarFoco('cat');
  }

  // ── Favoritos (estrela) ───────────────────────────────────────────
  function indiceDoCanal(lista, id) {
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].stream_id) === String(id)) { return i; }
    }
    return -1;
  }

  // Refaz a lista de Favoritos na tela (um canal saiu dela), mantendo o cursor por perto.
  function refazerFavoritos(idxManter) {
    var favs = VLTV.dados.favoritosDe('canais');
    var eraLista = (listaTocando === canais);
    canais = favs;
    renderizados = 0;
    itensCanais = [];
    liSelCanal = null;
    liTocando = null;
    esvaziar(listaCanais);
    if (favs.length === 0) {
      mensagemLista(listaCanais, MSG_SEM_FAV);
      definirEstrela(false);
      if (foco === 'canais') { trocarFoco('cat'); }
      return;
    }
    if (eraLista && tocando) {
      var p = indiceDoCanal(favs, tocando.stream_id);
      if (p !== -1) { listaTocando = favs; idxTocando = p; }
    }
    canalIdx = Math.max(0, Math.min(idxManter, favs.length - 1));
    renderMais();
    marcarCanal();
    marcarTocando();
  }

  function alternarFavoritoCanal() {
    var canal = canais[canalIdx];
    if (!canal) { return; }
    var agora = VLTV.dados.alternarFavorito({
      tipo: 'canais', id: canal.stream_id, nome: canal.name, capa: canal.stream_icon, raw: canal
    });
    var cat = categorias[catCarregada];
    if (cat && cat.especial === 'fav') {
      if (!agora) { refazerFavoritos(canalIdx); }
      return;
    }
    if (liSelCanal) {
      var est = liSelCanal.querySelector('.estrela');
      if (est) { est.classList.toggle('ativa', agora); }
    }
  }

  // ── Guia de programação (EPG) ─────────────────────────────────────
  // Quando o programa não é de hoje, mostra o dia junto da hora ("Amanhã 02:00"), para não parecer horário errado.
  function rotuloDia(p) {
    if (!p || !p.iniTs) { return ''; }
    var ini = new Date(p.iniTs * 1000);
    var hoje = new Date();
    var dias = Math.round((new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime() -
                           new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000);
    if (dias === 0) { return ''; }
    var en = VLTV.idioma.ehIngles();
    if (dias === 1) { return en ? 'Tomorrow ' : 'Amanhã '; }
    if (dias === -1) { return en ? 'Yesterday ' : 'Ontem '; }
    var nomes = en ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return nomes[ini.getDay()] + ' ';
  }

  function linhaEpg(rotulo, p) {
    if (!p || !p.titulo) { return ''; }
    return rotulo + (p.inicio ? ' (' + rotuloDia(p) + p.inicio + ') ' : ' ') + p.titulo;
  }

  function mostrarInfoBasica() {
    infoNome.textContent = tocando ? (tocando.name || '') : '';
    infoAgora.textContent = '';
    infoDesc.textContent = '';
    esvaziar(infoProximos);
    textoAgora = '';
  }

  // Confere o guia de novo na hora em que o programa muda (e a cada minuto, se não souber a hora).
  function agendarEpg(canal, id, ms) {
    clearTimeout(timerEpg);
    timerEpg = setTimeout(function () {
      if (id !== idEpg || tocando !== canal) { return; }
      carregarEpg(canal);
    }, ms);
  }

  function carregarEpg(canal) {
    var id = ++idEpg;
    clearTimeout(timerEpg);
    if (canal.url) { return; }   // lista M3U: sem guia de programação
    VLTV.api.epgCurto(canal.stream_id, 10)
      .then(function (lista) {
        if (id !== idEpg) { return; }
        var sep = VLTV.api.separarEpg(lista, Math.floor(new Date().getTime() / 1000));
        var atual = sep.atual;
        lista = [atual].concat(sep.proximos);
        agendarEpg(canal, id, sep.espera);
        var agora = linhaEpg('Agora', atual);
        infoAgora.textContent = atual && atual.titulo
          ? 'Agora' + (atual.inicio ? ' (' + rotuloDia(atual) + atual.inicio + (atual.fim ? ' - ' + atual.fim : '') + ')' : '') + ' ' + atual.titulo
          : 'Sem informação de programação.';
        infoDesc.textContent = atual && atual.descricao ? atual.descricao : '';
        esvaziar(infoProximos);
        // Preenche a coluna: sem descrição sobra espaço, então cabem mais programas.
        var quantos = atual && atual.descricao ? 5 : 7;
        var traduzir = VLTV.idioma.ehIngles();
        var nomesProx = [];
        lista.slice(1, 1 + quantos).forEach(function (p) {
          if (!p.titulo) { return; }
          var linha = document.createElement('div');
          var h = document.createElement('span');
          h.className = 'hora-prog';
          h.textContent = rotuloDia(p) + p.inicio;
          linha.appendChild(h);
          var tx = document.createTextNode(p.titulo);
          linha.appendChild(tx);
          infoProximos.appendChild(linha);
          nomesProx.push({ p: p, tx: tx });
        });
        textoAgora = agora;
        if (cheio && !infoCheio.classList.contains('escondida')) { desenharInfoCheio(); }

        // Inglês: título e sinopse do programa no TMDB (filmes e séries); o resto fica como o guia mandou.
        if (traduzir) {
          nomesProx.forEach(function (x) {
            VLTV.tmdb.epg(x.p.titulo).then(function (r) {
              if (id !== idEpg || !r || !r.titulo) { return; }
              x.tx.nodeValue = r.titulo;
            });
          });
          if (atual && atual.titulo) {
            VLTV.tmdb.epg(atual.titulo).then(function (r) {
              if (id !== idEpg || !r || !r.titulo) { return; }
              infoAgora.textContent = 'Now' + (atual.inicio ? ' (' + rotuloDia(atual) + atual.inicio + (atual.fim ? ' - ' + atual.fim : '') + ')' : '') + ' ' + r.titulo;
              if (r.sinopse && atual.descricao) { infoDesc.textContent = r.sinopse; }
              textoAgora = linhaEpg('Now', { inicio: atual.inicio, iniTs: atual.iniTs, titulo: r.titulo });
              if (cheio && !infoCheio.classList.contains('escondida')) { desenharInfoCheio(); }
            });
          }
        }
      })
      .catch(function () {
        if (id !== idEpg) { return; }
        infoAgora.textContent = 'Sem informação de programação.';
        agendarEpg(canal, id, 60000);
      });
  }

  // ── Reprodução ────────────────────────────────────────────────────
  // O motor tenta os formatos (ts, m3u8, sem extensão; a ordem vem do config), depois as bibliotecas e o player da Samsung,
  // reconecta sozinho se o canal travar e explica o motivo quando não toca.
  // ── Formato e resolução reais do sinal (para conferir a qualidade na TV) ──
  var textoDaQualidade = '';
  function rotuloResolucao(h) {
    return h >= 2000 ? '4K' : h >= 1000 ? 'Full HD' : h >= 700 ? 'HD' : h > 0 ? 'SD' : '';
  }
  function textoQualidade(t) {
    textoDaQualidade = t;
    if (!infoQualidade) { return; }
    infoQualidade.textContent = t;
    infoQualidade.classList.toggle('escondida', !t);
  }
  function atualizarQualidade() {
    if (!VLTV.config || !VLTV.config.MOSTRAR_QUALIDADE) { return; }
    if (!tocando || !motor.atual) { textoQualidade(''); return; }
    var tipo = motor.atual.tipo;
    var fmt = tipo === 'hls' ? 'HLS' : (tipo === 'ts' || tipo === 'sem-ext') ? 'TS' : String(tipo || '').toUpperCase();
    var w = video.videoWidth, h = video.videoHeight;
    var res = w && h ? w + 'x' + h + (rotuloResolucao(h) ? ' ' + rotuloResolucao(h) : '') : '';
    textoQualidade(fmt + (res ? ' · ' + res : ''));
    if (!infoCheio.classList.contains('escondida')) { desenharInfoCheio(); }
  }
  video.addEventListener('loadedmetadata', atualizarQualidade);
  video.addEventListener('resize', atualizarQualidade);

  // Aprende com o resultado: se o .ts não abriu e o .m3u8 é que tocou 2 vezes seguidas, esta TV passa a começar pelo m3u8.
  function contarFormato() {
    if (formatoContado || !tocando || tocando.url || !ordemTsPrimeiro || !motor.atual) { return; }
    formatoContado = true;
    var tipo = motor.atual.tipo;
    if (tipo === 'ts') { if (lerTsFalhas() !== 0) { gravarTsFalhas(0); } }
    else if (tipo === 'hls') { gravarTsFalhas(lerTsFalhas() + 1); }
  }

  var motor = VLTV.motor.criar(video, {
    modo: 'live',
    aoPlaying: function () {
      esconderOverlay();
      contarFormato();
      setTimeout(atualizarQualidade, 1200);   // a TV leva um instante para informar a resolução real
    },
    aoEspera: function () { if (tocando) { mostrarOverlay('Carregando...'); } },
    aoReconectando: function (msg) { if (tocando) { mostrarOverlay(msg); } },
    aoFalha: function (msg) { if (tocando) { mostrarOverlay(msg, 'erro'); } }
  });

  function iniciarCanal() {
    mostrarOverlay('Carregando...');
    var urls = [];
    if (tocando.url) {
      urls.push(tocando.url);   // canal de lista M3U tem endereço próprio
    } else {
      ordemExtensoes().forEach(function (e) { urls.push(VLTV.api.urlCanal(tocando.stream_id, e)); });
    }
    formatoContado = false;
    textoQualidade('');
    motor.abrir(urls);
  }

  function tocar(lista, idx) {
    tocando = lista[idx];
    listaTocando = lista;
    idxTocando = idx;
    mostrarInfoBasica();
    marcarTocando();
    carregarEpg(tocando);
    iniciarCanal();
  }

  function parar() {
    idEpg++;
    clearTimeout(timerEpg);
    clearTimeout(timerInfo);
    tocando = null;
    listaTocando = null;
    textoQualidade('');
    motor.parar();
    esconderOverlay();
    marcarTocando();
    mostrarInfoBasica();
  }

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
    if (textoDaQualidade) {
      var qual = document.createElement('div');
      qual.className = 'info-linha info-qualidade';
      qual.textContent = textoDaQualidade;
      infoCheio.appendChild(qual);
    }
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
    motor.reposicionar();
    mostrarInfoCheio();
  }

  function sairCheio() {
    cheio = false;
    clearTimeout(timerInfo);
    infoCheio.classList.add('escondida');
    caixaPlayer.classList.remove('cheio');
    motor.reposicionar();
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
      }
      return true;
    }
    if (k === TECLA.DIR) {
      if (falhaCategorias) { abrir(aoSair); } else { irParaCanais(); }
      return true;
    }
    if (k === TECLA.ENTER) {
      if (falhaCategorias) { abrir(aoSair); } else { escolherCategoria(); }
      return true;
    }
    return false;
  }

  function teclaCanais(k) {
    if (k === TECLA.AMARELO) { alternarFavoritoCanal(); return true; }
    if (focoEstrela) {
      if (k === TECLA.ENTER) { alternarFavoritoCanal(); return true; }
      if (k === TECLA.ESQ) { definirEstrela(false); return true; }
      if (k === TECLA.DIR) { return true; }
    } else if (k === TECLA.DIR) {
      if (canais.length > 0) { definirEstrela(true); }
      return true;
    }
    if (k === TECLA.ESQ) { voltarParaCategorias(); }
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
  function indiceCanal(e) {
    var li = filhoDe(listaCanais, e.target);
    return li ? itensCanais.indexOf(li) : -1;
  }

  listaCats.addEventListener('mousemove', function (e) {
    if (cheio || !cursorAndou(e)) { return; }
    var i = indiceCategoria(e);
    if (i < 0 || (foco === 'cat' && i === catIdx)) { return; }
    if (foco !== 'cat') { voltarParaCategorias(); }
    catIdx = i;
    marcarCategoria();
  });
  listaCats.addEventListener('click', function (e) {
    if (cheio) { return; }
    var i = indiceCategoria(e);
    if (i < 0) { return; }
    if (foco !== 'cat') { voltarParaCategorias(); }
    catIdx = i;
    marcarCategoria();
    teclaCategorias(TECLA.ENTER);      // abre a categoria, igual ao OK
  });

  listaCanais.addEventListener('mousemove', function (e) {
    if (cheio || !cursorAndou(e)) { return; }
    var i = indiceCanal(e);
    if (i < 0) { return; }
    var naEstrela = dentroDe(e.target, 'estrela', itensCanais[i]);
    if (foco === 'canais' && i === canalIdx && naEstrela === focoEstrela) { return; }
    if (foco !== 'canais') { irParaCanais(); }
    canalIdx = i;
    marcarCanal();
    definirEstrela(naEstrela);
  });
  listaCanais.addEventListener('click', function (e) {
    if (cheio) { return; }
    var i = indiceCanal(e);
    if (i < 0) { return; }
    var naEstrela = dentroDe(e.target, 'estrela', itensCanais[i]);
    if (foco !== 'canais') { irParaCanais(); }
    canalIdx = i;
    marcarCanal();
    definirEstrela(naEstrela);
    teclaCanais(TECLA.ENTER);          // na estrela: favorita; no canal: toca (ou abre em tela cheia se já está tocando)
  });

  // Roda do controle: arrasta a lista para cima/baixo e o destaque acompanha o cursor.
  function completarCanais() {
    while (renderizados < canais.length && listaCanais.scrollTop + listaCanais.clientHeight > listaCanais.scrollHeight - 700) { renderMais(); }
  }

  VLTV.aoRodar(listaCats, function (sentido, e, forca) {
    if (cheio) { return; }
    VLTV.rolarRoda(listaCats, sentido, forca);
    var li = VLTV.filhoNoPonto(listaCats, e.clientX, e.clientY);
    var i = li ? itensCats.indexOf(li) : -1;
    if (i >= 0 && !(foco === 'cat' && i === catIdx)) {
      if (foco !== 'cat') { voltarParaCategorias(); }
      catIdx = i;
      if (liSelCat) { liSelCat.classList.remove('sel'); }
      liSelCat = itensCats[catIdx];
      if (liSelCat) { liSelCat.classList.add('sel'); }
    }
  });

  VLTV.aoRodar(listaCanais, function (sentido, e, forca) {
    if (cheio || canais.length === 0) { return; }
    if (sentido > 0) { completarCanais(); }
    VLTV.rolarRoda(listaCanais, sentido, forca);
    completarCanais();
    var li = VLTV.filhoNoPonto(listaCanais, e.clientX, e.clientY);
    var i = li ? itensCanais.indexOf(li) : -1;
    if (i >= 0 && !(foco === 'canais' && i === canalIdx && !focoEstrela)) {
      if (foco !== 'canais') { irParaCanais(); }
      canalIdx = i;
      if (liSelCanal) { liSelCanal.classList.remove('sel'); liSelCanal.classList.remove('foco-estrela'); }
      liSelCanal = itensCanais[canalIdx] || null;
      definirEstrela(false);
      if (liSelCanal) { liSelCanal.classList.add('sel'); }
    }
  });

  // Tela cheia: clicar na imagem mostra/esconde as informações (igual ao OK).
  caixaPlayer.addEventListener('click', function () {
    if (cheio) { teclaCheio(TECLA.ENTER); }
    else if (tocando) { entrarCheio(); }
  });

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (cheio) { return teclaCheio(k); }

    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (focoEstrela) { definirEstrela(false); }
      else if (foco === 'canais') { voltarParaCategorias(); }
      else { sair(); }
      return true;
    }
    return foco === 'cat' ? teclaCategorias(k) : teclaCanais(k);
  }

  // ── Entrada e saída da tela ───────────────────────────────────────
  var listaDoCache = '';

  function abrir(callbackSair) {
    aoSair = callbackSair;
    var listaAtual = VLTV.listas.idAtiva();
    if (listaAtual !== listaDoCache) { cacheCanais = {}; listaDoCache = listaAtual; }
    cheio = false;
    caixaPlayer.classList.remove('cheio');
    infoCheio.classList.add('escondida');
    falhaCategorias = false;
    categorias = [];
    canais = [];
    catIdx = 0;
    catCarregada = -1;
    trocarFoco('cat');
    mensagemLista(listaCats, 'Carregando categorias...');
    mensagemLista(listaCanais, '');
    tituloCanais.textContent = 'Canais';

    definirEstrela(false);
    VLTV.api.categoriasAoVivo()
      .then(function (lista) {
        if (lista.length === 0) {
          categorias = [];
          mensagemLista(listaCats, 'Nenhuma categoria encontrada.');
          return;
        }
        categorias = [CAT_FAV].concat(VLTV.parental.filtrarCategorias('canais', lista));
        renderCategorias();
        // Abre em Favoritos se já tem algum canal marcado; senão na primeira categoria de verdade (que não esteja bloqueada).
        var inicio = VLTV.dados.favoritosDe('canais').length > 0 ? 0 : 1;
        while (inicio < categorias.length - 1 && categoriaTrancada(categorias[inicio])) { inicio++; }
        if (categoriaTrancada(categorias[inicio])) { inicio = 0; }
        catIdx = inicio;
        marcarCategoria();
        carregarCanais(inicio, false);
      })
      .catch(function () {
        falhaCategorias = true;
        mensagemLista(listaCats, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  function sair() {
    sairCheio();
    parar();
    if (aoSair) { aoSair(); }
  }

  VLTV.live = { abrir: abrir, tecla: tecla };
})();
