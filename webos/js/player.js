// VLTV Play - webOS | Player de filmes e episódios (tela cheia).
// - Barra de progresso com avançar/voltar (esquerda/direita), botões na tela e teclas de mídia.
// - Botão "Próximo episódio" estilo Netflix, com os créditos aprendidos pela VPS (igual ao Android).
// - Guarda de onde o usuário parou e retoma dali quando pedido.
(function () {
  'use strict';

  var ESPERA_REPRODUZIR_MS = 20000;
  var TEMPO_CONTROLES_MS = 6000;
  var INTERVALO_SALVAR_MS = 5000;
  var APLICAR_PULO_MS = 700;        // espera o usuário parar de apertar antes de pular de fato
  var REPETIR_PULO_MS = 450;        // apertos dentro deste intervalo aceleram o pulo
  var PULO_LONGO_S = 30;

  // Botão "Próximo episódio" (mesmos valores do PlayerActivity do Android)
  var CREDITOS_PADRAO_S = 50;       // sem dado da VPS: aparece faltando 50s
  var ANTECEDENCIA_S = 10;          // com dado da VPS: aparece 10s antes dos créditos
  var ESPERA_APRENDER_MS = 6000;    // só aprende com o toque de quem esperou o botão

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
  var elPrevia = $('player-previa');
  var elTempo = $('player-tempo');
  var elEstado = $('player-estado');
  var elDuracao = $('player-duracao');
  var elAviso = $('player-aviso');
  var cartao = $('player-proximo');
  var elAvisoTemporada = $('pp-temporada');
  var elContagem = $('pp-contagem');
  var elBotaoProximo = $('pp-botao');
  var elProximoTitulo = $('pp-titulo');
  var elProximoFill = $('pp-fill');

  var itens = [];
  var idx = 0;
  var extensoes = [];
  var extIdx = 0;
  var ativo = false;
  var aoSair = null;
  var idPlay = 0;
  var timerEspera = null;
  var timerControles = null;
  var timerPulo = null;
  var timerAviso = null;
  var timerProximo = null;
  var inicioPendente = 0;   // segundos: ponto onde o vídeo deve começar
  var ultimoSalvo = 0;

  // Avançar/voltar acumulando apertos
  var puloAlvo = null;      // segundos; null = nenhum pulo pendente
  var puloUltimoMs = 0;
  var puloSequencia = 0;

  // Próximo episódio / créditos
  var contagemAtiva = false;
  var proximoLancado = false;
  var botaoDesdeMs = 0;
  var creditosRestante = null;   // segundos que faltavam quando os créditos começaram (null = ninguém ensinou)
  var creditosEnviados = false;
  var serieChave = 0;

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

  function avisar(texto) {
    elAviso.textContent = texto;
    elAviso.classList.remove('escondida');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { elAviso.classList.add('escondida'); }, 2200);
  }

  function ehSerie(i) { var it = itens[i]; return !!it && it.tipo === 'series'; }

  function temProximo() {
    return ehSerie(idx) && idx + 1 < itens.length && ehSerie(idx + 1);
  }

  function controlesVisiveis() { return !controles.classList.contains('escondida'); }

  function cartaoVisivel() { return !cartao.classList.contains('escondida'); }

  // ── Barra e botões ────────────────────────────────────────────────
  function atualizarBarra() {
    var d = video.duration;
    var t = puloAlvo !== null ? puloAlvo : (video.currentTime || 0);
    var valida = isFinite(d) && d > 0;
    var pct = valida ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
    elProgresso.style.width = pct + '%';
    elPrevia.style.left = pct + '%';
    elPrevia.classList.toggle('escondida', puloAlvo === null);
    elTempo.textContent = formatar(t);
    elDuracao.textContent = valida ? formatar(d) : '';
    elEstado.textContent = puloAlvo !== null ? 'Ir para ' + formatar(t) : (video.paused ? 'Pausado' : '');
  }

  function agendarEsconder() {
    clearTimeout(timerControles);
    // Pausado ou escolhendo botão, a barra continua na tela; tocando, some depois de alguns segundos.
    if (!video.paused) {
      timerControles = setTimeout(function () {
        controles.classList.add('escondida');
        ajustarCartao();
      }, TEMPO_CONTROLES_MS);
    }
  }

  function mostrarControles() {
    atualizarBarra();
    controles.classList.remove('escondida');
    ajustarCartao();
    agendarEsconder();
  }

  // O cartão do próximo episódio sobe para não ficar em cima da barra de controles.
  function ajustarCartao() {
    cartao.classList.toggle('com-controles', controlesVisiveis());
  }

  // ── Avançar e voltar ──────────────────────────────────────────────
  function podePular() {
    var d = video.duration;
    return isFinite(d) && d > 0;
  }

  function passoAtual() {
    // Apertar várias vezes seguidas (ou segurar a tecla) aumenta o pulo: 10, 10, 10, 20, 30, 60...
    if (puloSequencia < 3) { return 10; }
    if (puloSequencia < 5) { return 20; }
    if (puloSequencia < 8) { return 30; }
    return 60;
  }

  function aplicarPulo() {
    clearTimeout(timerPulo);
    timerPulo = null;
    if (puloAlvo === null) { return; }
    var alvo = puloAlvo;
    puloAlvo = null;
    puloSequencia = 0;
    try {
      video.currentTime = alvo;
    } catch (e) {
      avisar('Esta TV não conseguiu pular neste vídeo.');
    }
    atualizarBarra();
  }

  // segundos: positivo avança, negativo volta. fixo = true usa o valor exato (teclas de mídia).
  function pular(segundos, fixo) {
    if (!podePular()) { avisar('Aguarde o vídeo carregar...'); mostrarControles(); return; }
    var agora = new Date().getTime();
    if (agora - puloUltimoMs > REPETIR_PULO_MS) { puloSequencia = 0; }
    puloUltimoMs = agora;
    var sentido = segundos < 0 ? -1 : 1;
    var passo = fixo ? Math.abs(segundos) : passoAtual();
    puloSequencia++;
    var base = puloAlvo !== null ? puloAlvo : (video.currentTime || 0);
    puloAlvo = Math.max(0, Math.min(video.duration - 1, base + sentido * passo));
    mostrarControles();
    clearTimeout(timerPulo);
    timerPulo = setTimeout(aplicarPulo, APLICAR_PULO_MS);
  }

  // ── Progresso salvo ───────────────────────────────────────────────
  function salvarPosicao() {
    var item = itens[idx];
    if (!item || !item.chave) { return; }
    // Enquanto o ponto de retomada não foi aplicado, não grava (evitaria apagar o progresso).
    if (inicioPendente > 0) { return; }
    var d = video.duration;
    var t = puloAlvo !== null ? puloAlvo : (video.currentTime || 0);
    if (!isFinite(d) || d <= 0 || t < 3) { return; }
    VLTV.dados.salvarProgresso(item.chave, t, d);
  }

  // Pula para o ponto de retomada assim que a TV souber a duração do vídeo.
  function aplicarInicio() {
    if (inicioPendente <= 0) { return; }
    var d = video.duration;
    if (!isFinite(d) || d <= 0) { return; }
    var alvo = inicioPendente;
    inicioPendente = 0;
    if (d > alvo + 5) {
      try { video.currentTime = alvo; } catch (e) { /* ignora */ }
    }
  }

  // ── Créditos aprendidos (VPS) ─────────────────────────────────────
  function dnsAtual() {
    var s = VLTV.sessao && VLTV.sessao.ler();
    return s && s.dns ? s.dns : '';
  }

  // Chamado a cada episódio novo: só vale para série com id estável (o 1º episódio da série inteira).
  function iniciarCreditos() {
    creditosRestante = null;
    creditosEnviados = false;
    serieChave = 0;
    var item = itens[idx];
    if (!item || item.tipo !== 'series' || !item.serie) { return; }
    serieChave = item.serie;

    // 1) cópia local (instantânea)
    creditosRestante = VLTV.creditos.lerLocal(serieChave);

    // 2) VPS em segundo plano: o valor dela é a mediana de todos os clientes e sobrescreve a cópia local
    var minha = idPlay;
    var chave = serieChave;
    VLTV.creditos.buscar(dnsAtual(), chave).then(function (seg) {
      if (seg !== null && minha === idPlay && chave === serieChave) {
        creditosRestante = seg;
        VLTV.creditos.gravarLocal(chave, seg);
      }
    });
  }

  // Aprende o ponto dos créditos com um sinal confiável do cliente:
  //  - toque no botão "Próximo episódio" (só vale se o botão já estava na tela há 6s ou mais);
  //  - sair pelo "voltar" na reta final (75%+ assistido, 20s a 10min restantes).
  // Não aprende quando o próximo episódio abre sozinho.
  function aprenderCreditos(toqueNoBotao) {
    if (!serieChave || creditosEnviados || proximoLancado) { return; }
    var d = video.duration;
    var t = puloAlvo !== null ? puloAlvo : (video.currentTime || 0);
    if (!isFinite(d) || d <= 0 || t < 0) { return; }
    var restante = Math.floor(d - t);

    if (toqueNoBotao) {
      var esperou = botaoDesdeMs !== 0 && (new Date().getTime() - botaoDesdeMs) >= ESPERA_APRENDER_MS;
      if (!esperou) { return; }
    } else {
      var progresso = t / d;
      if (restante < 20 || restante > VLTV.creditos.MAX_S || progresso < 0.75) { return; }
    }
    if (!VLTV.creditos.valido(restante)) { return; }

    creditosEnviados = true;
    creditosRestante = restante;
    VLTV.creditos.gravarLocal(serieChave, restante);
    VLTV.creditos.enviar(dnsAtual(), serieChave, restante);
  }

  // ── Próximo episódio ──────────────────────────────────────────────
  function limiarBotao() {
    return creditosRestante === null ? CREDITOS_PADRAO_S : creditosRestante + ANTECEDENCIA_S;
  }

  // Quantos episódios faltam na temporada atual (contando o que está passando) e qual é a próxima temporada.
  function avisoTemporada() {
    var atual = itens[idx];
    if (!atual || atual.tn === undefined) { return ''; }
    var restantes = 0;
    var i = idx;
    while (i < itens.length && itens[i].tn === atual.tn) { restantes++; i++; }
    var proxTemp = null;
    for (var j = idx + 1; j < itens.length; j++) {
      if (itens[j].tn !== atual.tn) { proxTemp = itens[j].tn; break; }
    }
    if (proxTemp === null) { return ''; }
    if (restantes === 1) { return 'Último episódio da temporada — a seguir: Temporada ' + proxTemp; }
    if (restantes >= 2 && restantes <= 3) { return 'Faltam ' + restantes + ' episódios para a próxima temporada'; }
    return '';
  }

  function textoContagem(seg) {
    if (seg > 60) {
      return 'Próximo episódio em ' + Math.floor(seg / 60) + ':' + ('0' + (seg % 60)).slice(-2);
    }
    return 'Próximo episódio em ' + seg + 's';
  }

  function esconderCartao() {
    cartao.classList.add('escondida');
    elAvisoTemporada.classList.add('escondida');
    contagemAtiva = false;
    botaoDesdeMs = 0;
  }

  function mostrarCartao() {
    var prox = itens[idx + 1];
    elProximoTitulo.textContent = prox ? (prox.titulo || '') : '';
    var aviso = avisoTemporada();
    elAvisoTemporada.textContent = aviso;
    elAvisoTemporada.classList.toggle('escondida', !aviso);
    cartao.classList.remove('escondida');
    ajustarCartao();
    botaoDesdeMs = new Date().getTime();
  }

  // Roda a cada segundo, só enquanto há próximo episódio.
  function verificarProximo() {
    if (!ativo || proximoLancado || !temProximo()) { return; }
    if (video.paused || video.ended) { return; }
    var d = video.duration;
    var t = puloAlvo !== null ? puloAlvo : (video.currentTime || 0);
    if (!isFinite(d) || d <= 0) { return; }

    var restante = Math.floor(d - t);
    var limiar = limiarBotao();

    if (restante <= limiar) {
      if (!contagemAtiva) {
        contagemAtiva = true;
        mostrarCartao();
      }
      var seg = Math.max(0, restante);
      elContagem.textContent = textoContagem(seg);
      var pct = Math.max(0, Math.min(100, (1 - seg / limiar) * 100));
      elProximoFill.style.width = pct + '%';
      if (restante <= 0) { abrirProximo(false); }
    } else if (contagemAtiva) {
      esconderCartao();
    }
  }

  function abrirProximo(porToque) {
    if (proximoLancado || !temProximo()) { return; }
    if (porToque) { aprenderCreditos(true); }
    proximoLancado = true;
    esconderCartao();
    salvarPosicao();
    var item = itens[idx];
    if (item && item.chave && isFinite(video.duration) && video.duration > 0 && !porToque) {
      VLTV.dados.salvarProgresso(item.chave, video.duration, video.duration);   // assistido até o fim
    }
    carregarItem(idx + 1, 0);
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

  function pararTimersProximo() {
    clearInterval(timerProximo);
    timerProximo = null;
  }

  // inicioSeg: ponto (em segundos) onde começar. Só vale para o primeiro item.
  function carregarItem(i, inicioSeg) {
    idx = i;
    idPlay++;
    inicioPendente = inicioSeg > 0 ? inicioSeg : 0;
    ultimoSalvo = 0;
    extensoes = montarExtensoes(itens[idx]);
    extIdx = 0;

    clearTimeout(timerPulo);
    timerPulo = null;
    puloAlvo = null;
    puloSequencia = 0;
    proximoLancado = false;
    esconderCartao();
    pararTimersProximo();
    iniciarCreditos();
    if (temProximo()) { timerProximo = setInterval(verificarProximo, 1000); }

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
    clearTimeout(timerPulo);
    clearTimeout(timerAviso);
    pararTimersProximo();
    puloAlvo = null;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e) { /* ignora */ }
    esconderOverlay();
    esconderCartao();
    elAviso.classList.add('escondida');
    controles.classList.add('escondida');
  }

  function sair() {
    var ultimo = idx;
    if (ativo) {
      aprenderCreditos(false);
      salvarPosicao();
    }
    parar();
    if (aoSair) { aoSair(ultimo); }
  }

  video.addEventListener('loadedmetadata', aplicarInicio);
  video.addEventListener('durationchange', aplicarInicio);
  video.addEventListener('playing', function () {
    clearTimeout(timerEspera);
    esconderOverlay();
    aplicarInicio();
    mostrarControles();
  });
  video.addEventListener('waiting', function () {
    if (ativo) { mostrarOverlay('Carregando...'); }
  });
  video.addEventListener('seeked', function () {
    if (ativo) { esconderOverlay(); }
  });
  video.addEventListener('pause', function () {
    if (ativo) { salvarPosicao(); mostrarControles(); }
  });
  video.addEventListener('timeupdate', function () {
    if (!ativo) { return; }
    if (controlesVisiveis()) { atualizarBarra(); }
    var agora = new Date().getTime();
    if (agora - ultimoSalvo > INTERVALO_SALVAR_MS) {
      ultimoSalvo = agora;
      salvarPosicao();
    }
  });
  video.addEventListener('error', function () {
    if (ativo) { extIdx++; tentar(); }
  });
  video.addEventListener('ended', function () {
    if (!ativo) { return; }
    var item = itens[idx];
    if (item && item.chave && isFinite(video.duration) && video.duration > 0) {
      VLTV.dados.salvarProgresso(item.chave, video.duration, video.duration);   // marca como assistido
    }
    if (temProximo() && !proximoLancado) { abrirProximo(false); }
    else if (idx + 1 < itens.length && !proximoLancado) { proximoLancado = true; carregarItem(idx + 1, 0); }
    else if (idx + 1 >= itens.length) { sair(); }
  });

  // ── Controle remoto ───────────────────────────────────────────────
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
    if (k === TECLA.VOLTAR || k === TECLA.ESC || k === TECLA.STOP) { sair(); return true; }

    // Teclas de mídia do controle (sempre iguais, em qualquer foco)
    if (k === TECLA.PLAY) { if (video.paused) { alternarPausa(); } return true; }
    if (k === TECLA.PAUSE) { if (!video.paused) { alternarPausa(); } return true; }
    if (k === TECLA.VOLTA) { pular(-PULO_LONGO_S, true); return true; }
    if (k === TECLA.AVANCA) { pular(PULO_LONGO_S, true); return true; }

    // Esquerda/direita pulam, OK pausa/continua (ou abre o próximo episódio se o cartão estiver na tela).
    if (k === TECLA.ESQ) { pular(-10, false); }
    else if (k === TECLA.DIR) { pular(10, false); }
    else if (k === TECLA.ENTER) {
      // Com o cartão do próximo episódio na tela, OK vai direto para o próximo (igual ao Android).
      if (cartaoVisivel()) { abrirProximo(true); }
      else { alternarPausa(); }
    }
    else if (k === TECLA.BAIXO || k === TECLA.CIMA) { mostrarControles(); }
    return true;
  }

  // lista: [{ titulo, tipo: 'movie' | 'series', id, ext, url, chave, serie, tn }].
  // callbackSair recebe o índice do último item tocado.
  // inicioSeg (opcional): segundo onde o primeiro item deve começar.
  function abrir(lista, indice, callbackSair, inicioSeg) {
    itens = lista;
    aoSair = callbackSair;
    ativo = true;
    carregarItem(indice, inicioSeg || 0);
  }

  VLTV.player = { abrir: abrir, tecla: tecla };
})();
