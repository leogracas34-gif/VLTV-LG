// VLTV Play - webOS | Player de filmes e episódios (tela cheia, com barra de progresso).
(function () {
  'use strict';

  var ESPERA_REPRODUZIR_MS = 20000;
  var TEMPO_CONTROLES_MS = 4000;
  var PULO_CURTO_S = 10;
  var PULO_LONGO_S = 30;

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40,
    PAUSE: 19, PLAY: 415, STOP: 413, VOLTA: 412, AVANCA: 417
  };

  function $(id) { return document.getElementById(id); }

  var video = $('player-video');
  var overlay = $('player-overlay');
  var controles = $('player-controles');
  var elTitulo = $('player-titulo');
  var elProgresso = $('player-progresso');
  var elTempo = $('player-tempo');
  var elEstado = $('player-estado');
  var elDuracao = $('player-duracao');

  var itens = [];
  var idx = 0;
  var extensoes = [];
  var extIdx = 0;
  var ativo = false;
  var aoSair = null;
  var idPlay = 0;
  var timerEspera = null;
  var timerControles = null;

  // ── Utilidades ────────────────────────────────────────────────────
  function formatar(segundos) {
    if (!isFinite(segundos) || segundos < 0) { return '0:00'; }
    var s = Math.floor(segundos);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    var mm = h > 0 ? ('0' + m).slice(-2) : String(m);
    return (h > 0 ? h + ':' : '') + mm + ':' + ('0' + r).slice(-2);
  }

  function mostrarOverlay(texto, tipo) {
    overlay.textContent = texto;
    overlay.className = 'overlay' + (tipo ? ' ' + tipo : '');
  }

  function esconderOverlay() { overlay.className = 'overlay escondida'; }

  function atualizarBarra() {
    var d = video.duration;
    var t = video.currentTime || 0;
    var pct = isFinite(d) && d > 0 ? Math.min(100, (t / d) * 100) : 0;
    elProgresso.style.width = pct + '%';
    elTempo.textContent = formatar(t);
    elDuracao.textContent = isFinite(d) ? formatar(d) : '';
    elEstado.textContent = video.paused ? 'Pausado' : '';
  }

  function mostrarControles() {
    atualizarBarra();
    controles.classList.remove('escondida');
    clearTimeout(timerControles);
    // Em pausa a barra fica na tela; tocando, some depois de alguns segundos.
    if (!video.paused) {
      timerControles = setTimeout(function () { controles.classList.add('escondida'); }, TEMPO_CONTROLES_MS);
    }
  }

  // ── Reprodução ────────────────────────────────────────────────────
  function montarExtensoes(item) {
    if (item.url) { return ['']; }   // endereço direto (lista M3U)
    var lista = [];
    [item.ext, 'mp4', 'mkv', ''].forEach(function (e) {
      var ext = e === undefined || e === null ? '' : String(e);
      if (lista.indexOf(ext) === -1) { lista.push(ext); }
    });
    return lista;
  }

  function tentar() {
    var meu = idPlay;
    clearTimeout(timerEspera);

    if (extIdx >= extensoes.length) {
      mostrarOverlay('Não foi possível reproduzir este vídeo.', 'erro');
      return;
    }

    mostrarOverlay('Carregando...');
    var item = itens[idx];
    video.src = item.url ? item.url : VLTV.api.urlVod(item.tipo, item.id, extensoes[extIdx]);
    var p = video.play();
    if (p && p.catch) { p.catch(function () { /* o erro chega pelo evento 'error' */ }); }

    timerEspera = setTimeout(function () {
      if (meu === idPlay) { extIdx++; tentar(); }
    }, ESPERA_REPRODUZIR_MS);
  }

  function carregarItem(i) {
    idx = i;
    idPlay++;
    extensoes = montarExtensoes(itens[idx]);
    extIdx = 0;
    elTitulo.textContent = itens[idx].titulo || '';
    elProgresso.style.width = '0%';
    elTempo.textContent = '0:00';
    elDuracao.textContent = '';
    mostrarControles();
    tentar();
  }

  function parar() {
    idPlay++;
    ativo = false;
    clearTimeout(timerEspera);
    clearTimeout(timerControles);
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* ignora */ }
    esconderOverlay();
    controles.classList.add('escondida');
  }

  function sair() {
    var ultimo = idx;
    parar();
    if (aoSair) { aoSair(ultimo); }
  }

  video.addEventListener('playing', function () {
    clearTimeout(timerEspera);
    esconderOverlay();
    mostrarControles();
  });
  video.addEventListener('waiting', function () {
    if (ativo) { mostrarOverlay('Carregando...'); }
  });
  video.addEventListener('pause', function () { if (ativo) { mostrarControles(); } });
  video.addEventListener('timeupdate', function () {
    if (ativo && !controles.classList.contains('escondida')) { atualizarBarra(); }
  });
  video.addEventListener('error', function () {
    if (ativo) { extIdx++; tentar(); }
  });
  video.addEventListener('ended', function () {
    if (!ativo) { return; }
    if (idx + 1 < itens.length) { carregarItem(idx + 1); } else { sair(); }
  });

  // ── Controle remoto ───────────────────────────────────────────────
  function pular(segundos) {
    var d = video.duration;
    if (!isFinite(d) || d <= 0) { return; }
    video.currentTime = Math.max(0, Math.min(d - 1, (video.currentTime || 0) + segundos));
    mostrarControles();
  }

  function alternarPausa() {
    if (video.paused) {
      var p = video.play();
      if (p && p.catch) { p.catch(function () { /* ignora */ }); }
    } else {
      video.pause();
    }
    mostrarControles();
  }

  function tecla(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC || k === TECLA.STOP) { sair(); }
    else if (k === TECLA.ENTER) { alternarPausa(); }
    else if (k === TECLA.PLAY) { if (video.paused) { alternarPausa(); } }
    else if (k === TECLA.PAUSE) { if (!video.paused) { alternarPausa(); } }
    else if (k === TECLA.ESQ) { pular(-PULO_CURTO_S); }
    else if (k === TECLA.DIR) { pular(PULO_CURTO_S); }
    else if (k === TECLA.VOLTA) { pular(-PULO_LONGO_S); }
    else if (k === TECLA.AVANCA) { pular(PULO_LONGO_S); }
    else if (k === TECLA.CIMA || k === TECLA.BAIXO) { mostrarControles(); }
    return true;
  }

  // lista: [{ titulo, tipo: 'movie' | 'series', id, ext }]. callbackSair recebe o índice do último item tocado.
  function abrir(lista, indice, callbackSair) {
    itens = lista;
    aoSair = callbackSair;
    ativo = true;
    carregarItem(indice);
  }

  VLTV.player = { abrir: abrir, tecla: tecla };
})();
