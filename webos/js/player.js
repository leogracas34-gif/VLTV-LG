// VLTV Play - webOS | Player de filmes e episódios (tela cheia).
// - Barra de progresso com avançar/voltar (esquerda/direita), botões na tela e teclas de mídia.
// - Botão "Próximo episódio" estilo Netflix, com os créditos aprendidos pela VPS (igual ao Android).
// - Guarda de onde o usuário parou e retoma dali quando pedido.
// - Tela de pausa estilo Netflix: nome (e T:E do episódio) em cima, logo do título, ícone + tempo + barra embaixo.
// - Menu estilo Netflix (seta para cima ou para baixo, tocando ou pausado): em cima à esquerda voltar / assistir do início /
//   próximo episódio (com o nome embaixo do ícone em foco); em cima à direita o nome e T:E; embaixo pausa, tempo, barra, tempo
//   restante e, abaixo da barra, as combinações de idioma e legenda que o próprio arquivo oferece.
(function () {
  'use strict';

  var TEMPO_CONTROLES_MS = 6000;
  var ATRASO_PAUSA_MS = 5000;       // a tela de pausa (logo + nome) só aparece depois de 5 s pausado, igual à Netflix
  var INTERVALO_SALVAR_MS = 5000;
  var APLICAR_PULO_MS = 700;        // espera o usuário parar de apertar antes de pular de fato
  var REPETIR_PULO_MS = 450;        // apertos dentro deste intervalo aceleram o pulo
  var PULO_LONGO_S = 30;
  var TEMPO_MENU_MS = 9000;         // com o menu aberto (seta para cima/baixo) a barra fica um pouco mais na tela
  var MAX_CHIPS = 4;                // quantas combinações de idioma/legenda aparecem antes do "Outro..."

  // Botão "Próximo episódio" (mesmos valores do PlayerActivity do Android)
  var CREDITOS_PADRAO_S = 50;       // sem dado da VPS: aparece faltando 50s
  var ANTECEDENCIA_S = 10;          // com dado da VPS: aparece 10s antes dos créditos
  var ESPERA_APRENDER_MS = 6000;    // só aprende com o toque de quem esperou o botão

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40,
    PAUSE: 19, PLAY: 415, STOP: 413, VOLTA: 412, AVANCA: 417, AMARELO: 405
  };

  function $(id) { return document.getElementById(id); }

  var video = $('player-video');
  var overlay = $('player-overlay');
  var controles = $('player-controles');
  var elTitulo = $('player-titulo');
  var elProgresso = $('player-progresso');
  var elPrevia = $('player-previa');
  var elTempo = $('player-tempo');
  var elDuracao = $('player-duracao');
  var elAviso = $('player-aviso');
  var cartao = $('player-proximo');
  var elAvisoTemporada = $('pp-temporada');
  var elContagem = $('pp-contagem');
  var elBotaoProximo = $('pp-botao');
  var elProximoTitulo = $('pp-titulo');
  var elProximoFill = $('pp-fill');
  var elIcone = $('player-icone');
  var pausa = $('player-pausa');
  var elPausaNome = $('pa-nome');
  var elPausaEp = $('pa-ep');
  var elPausaLogo = $('pa-logo-img');
  var elPausaTxt = $('pa-logo-txt');
  var botoesAval = Array.prototype.slice.call($('pa-aval').querySelectorAll('.det-aval-btn'));
  var avalFoco = false;      // true quando o usuário subiu (seta para cima) para escolher a avaliação
  var avalPos = 1;

  var itens = [];
  var idx = 0;
  var ativo = false;
  var aoSair = null;
  var idPlay = 0;
  var timerControles = null;
  var timerPulo = null;
  var timerAviso = null;
  var timerProximo = null;
  var timerPausa = null;
  var pausaLiberada = false;  // true depois de ATRASO_PAUSA_MS com o vídeo pausado
  var jaTocou = false;        // só vale como "pausa" depois que o vídeo realmente começou a tocar
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

  // Tempo no formato da Netflix: 01:23 (ou 1:02:03 com horas).
  function formatarNet(segundos) {
    if (!isFinite(segundos) || segundos < 0) { return '00:00'; }
    var s = Math.floor(segundos);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    return (h > 0 ? h + ':' : '') + ('0' + m).slice(-2) + ':' + ('0' + r).slice(-2);
  }

  // Texto do menu no idioma do aplicativo (português por dentro, inglês quando a TV está em inglês).
  function tx(pt, en) {
    return VLTV.idioma && VLTV.idioma.ehIngles && VLTV.idioma.ehIngles() ? en : pt;
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

  // ── Áudio e legenda ───────────────────────────────────────────────
  // Abre com a seta para baixo (ou a tecla amarela). Só mostra o que o vídeo e a TV realmente oferecem.
  var faixasAberto = false;
  var faixasCol = 0;            // 0 = áudio, 1 = legenda
  var faixasPos = [0, 0];
  var faixasLista = [[], []];   // cada item: { id, rotulo, ativa } (na legenda, o item 0 é "Desativada")
  var timerFaixas = null;

  var elFaixas = document.createElement('div');
  elFaixas.id = 'player-faixas';
  elFaixas.className = 'faixas escondida';
  $('tela-player').appendChild(elFaixas);

  var elLegenda = document.createElement('div');
  elLegenda.id = 'player-legenda';
  elLegenda.className = 'legenda-avplay escondida';
  $('tela-player').appendChild(elLegenda);

  function mostrarLegenda(texto) {
    if (!texto) { elLegenda.classList.add('escondida'); elLegenda.textContent = ''; return; }
    elLegenda.textContent = texto;
    elLegenda.classList.remove('escondida');
  }
  function esconderLegenda() { mostrarLegenda(''); }

  // ── Menu estilo Netflix (seta para cima ou para baixo) ────────────
  // Três linhas de foco: 0 = ícones do topo (voltar, assistir do início, próximo), 1 = barra (pausa e pulo), 2 = idioma e legenda.
  var menuModo = false;
  var menuLinha = 1;
  var topoPos = 0;
  var chipPos = 0;
  var chipsLista = [];
  var timerChips = null;

  var SVG_ICONES = {
    voltar: '<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
    inicio: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/><path d="M10 10v6l5-3z"/></svg>',
    proximo: '<svg viewBox="0 0 24 24"><path d="M6 6l8.5 6L6 18V6z"/><rect x="16" y="6" width="2.2" height="12" rx="1"/></svg>',
    engrenagem: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>'
  };

  // Em cima: ícones à esquerda (com o nome do ícone em foco embaixo) e nome + T:E à direita (o bloco que antes ficava só na pausa).
  var elMenu = document.createElement('div');
  elMenu.id = 'player-menu';
  elMenu.className = 'pmenu escondida';
  var elMenuEsq = document.createElement('div');
  elMenuEsq.className = 'pm-esq escondida';
  var elIcones = document.createElement('div');
  elIcones.className = 'pm-icones';
  var elRotulo = document.createElement('div');
  elRotulo.className = 'pm-rotulo';
  elMenuEsq.appendChild(elIcones);
  elMenuEsq.appendChild(elRotulo);
  elMenu.appendChild(elMenuEsq);
  elMenu.appendChild(pausa.querySelector('.pausa-topo'));   // o nome da série e T:E agora aparecem também com o menu aberto
  $('tela-player').appendChild(elMenu);

  // Embaixo da barra: combinações de idioma e legenda.
  var elChips = document.createElement('div');
  elChips.id = 'player-chips';
  elChips.className = 'pm-chips escondida';
  controles.appendChild(elChips);

  function acoesTopo() {
    var a = [
      { id: 'voltar', rotulo: tx('Voltar', 'Back') },
      { id: 'inicio', rotulo: tx('Assistir do início', 'Watch from start') }
    ];
    if (temProximo()) { a.push({ id: 'proximo', rotulo: tx('Próximo episódio', 'Next episode') }); }
    return a;
  }

  // Monta as combinações a partir do que o arquivo realmente oferece (nada de combinação inventada):
  //   cada áudio sozinho (legenda desligada) e cada áudio "com legendas" (legenda em português, ou a que já estiver ligada).
  //   Só um áudio e nenhuma legenda: aparece só ele. No fim, "Outro..." e a engrenagem abrem a lista completa.
  function montarChips() {
    var f = motor.faixas();
    var audios = f.audio;
    var legs = f.legenda;
    var legAtiva = -1;
    legs.forEach(function (x, i) { if (x.ativa) { legAtiva = i; } });
    var legPadrao = legAtiva;
    if (legPadrao < 0) {
      for (var i = 0; i < legs.length; i++) {
        if (/port|^pt|^por/i.test(legs[i].rotulo)) { legPadrao = i; break; }
      }
    }
    if (legPadrao < 0 && legs.length > 0) { legPadrao = 0; }

    var base = audios.length > 0 ? audios : [{ id: null, rotulo: tx('Áudio original', 'Original audio'), ativa: true }];
    var lista = [];
    base.forEach(function (a) {
      var audioOk = a.id === null ? true : !!a.ativa;
      lista.push({ tipo: 'combo', rotulo: a.rotulo, audioId: a.id, audioAtivo: audioOk, legId: null, ativa: audioOk && !f.legendaAtiva });
      if (legPadrao >= 0) {
        lista.push({
          tipo: 'combo', rotulo: a.rotulo + ' ' + tx('com legendas', 'with subtitles'), audioId: a.id, audioAtivo: audioOk,
          legId: legs[legPadrao].id, ativa: audioOk && f.legendaAtiva && legAtiva === legPadrao
        });
      }
    });

    if (lista.length > MAX_CHIPS) {
      var ativo = -1;
      lista.forEach(function (c, i) { if (c.ativa && ativo < 0) { ativo = i; } });
      var corte = lista.slice(0, MAX_CHIPS);
      if (ativo >= MAX_CHIPS) { corte[MAX_CHIPS - 1] = lista[ativo]; }   // a combinação em uso nunca fica de fora
      lista = corte;
    }
    if (audios.length > 1 || legs.length > 0) { lista.push({ tipo: 'outro', rotulo: tx('Outro...', 'Other...') }); }
    lista.push({ tipo: 'eng', rotulo: '' });
    return lista;
  }

  function chipAtivo() {
    var lista = montarChips();
    for (var i = 0; i < lista.length; i++) { if (lista[i].ativa) { return i; } }
    return 0;
  }

  function desenharChips() {
    chipsLista = montarChips();
    chipPos = Math.max(0, Math.min(chipsLista.length - 1, chipPos));
    while (elChips.firstChild) { elChips.removeChild(elChips.firstChild); }
    chipsLista.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'pm-chip' + (c.ativa ? ' ativa' : '') + (c.tipo === 'eng' ? ' pm-eng' : '') + (menuLinha === 2 && chipPos === i ? ' foco' : '');
      if (c.tipo === 'eng') { el.innerHTML = SVG_ICONES.engrenagem; }
      else { el.textContent = (c.ativa ? '\u2713  ' : '') + c.rotulo; }
      el.addEventListener('click', function () { chipPos = i; escolherChip(); });
      elChips.appendChild(el);
    });
  }

  function desenharMenu() {
    var visivel = menuModo && controlesVisiveis();
    // O bloco de cima (nome + T:E) também aparece na tela de pausa, como antes.
    elMenu.classList.toggle('escondida', !(visivel || pausaNaTela()));
    elMenuEsq.classList.toggle('escondida', !visivel);
    elChips.classList.toggle('escondida', !visivel);
    // Fora do foco, o botão de pausa fica só o símbolo (sem o círculo branco), igual à Netflix.
    elIcone.classList.toggle('sem-foco', visivel && menuLinha !== 1);
    if (!visivel) { return; }

    var ac = acoesTopo();
    topoPos = Math.max(0, Math.min(ac.length - 1, topoPos));
    while (elIcones.firstChild) { elIcones.removeChild(elIcones.firstChild); }
    ac.forEach(function (a, i) {
      var b = document.createElement('div');
      b.className = 'pm-ic' + (menuLinha === 0 && topoPos === i ? ' foco' : '');
      b.innerHTML = SVG_ICONES[a.id];
      b.addEventListener('click', function () { topoPos = i; executarTopo(a.id); });
      elIcones.appendChild(b);
    });
    elRotulo.textContent = menuLinha === 0 ? ac[topoPos].rotulo : tx('Opções', 'Options');
    desenharChips();
  }

  function abrirMenu(linha) {
    menuModo = true;
    menuLinha = linha;
    topoPos = 0;
    mostrarControles();
  }

  function fecharMenu() {
    if (!menuModo) { return; }
    menuModo = false;
    menuLinha = 1;
    clearTimeout(timerChips);
    desenharMenu();
  }

  function executarTopo(id) {
    if (id === 'voltar') { sair(); return; }
    if (id === 'inicio') {
      puloAlvo = null;
      inicioPendente = 0;
      if (!motor.buscar(0)) { avisar(tx('Esta TV não conseguiu voltar ao início.', 'This TV could not go back to the start.')); }
      if (motor.pausado()) { motor.play(); }
      fecharMenu();
      mostrarControles();
      return;
    }
    if (id === 'proximo') { abrirProximo(true); }
  }

  function escolherChip() {
    var c = chipsLista[chipPos];
    if (!c) { return; }
    if (c.tipo !== 'combo') { abrirFaixas(); return; }   // "Outro..." e engrenagem abrem a lista completa
    if (c.audioId !== null && !c.audioAtivo) { motor.escolherAudio(c.audioId); }
    motor.escolherLegenda(c.legId);
    clearTimeout(timerChips);
    timerChips = setTimeout(function () { if (menuModo) { desenharMenu(); } }, 450);   // a TV leva um instante para trocar
    mostrarControles();
  }

  function teclaMenu(k) {
    if (k === TECLA.AMARELO) { abrirFaixas(); return true; }

    if (menuLinha === 0) {
      var ac = acoesTopo();
      if (k === TECLA.ESQ) { topoPos = Math.max(0, topoPos - 1); }
      else if (k === TECLA.DIR) { topoPos = Math.min(ac.length - 1, topoPos + 1); }
      else if (k === TECLA.BAIXO) { menuLinha = 1; }
      else if (k === TECLA.ENTER) { executarTopo(ac[topoPos].id); return true; }
    } else if (menuLinha === 1) {
      if (k === TECLA.ESQ) { pular(-10, false); return true; }
      if (k === TECLA.DIR) { pular(10, false); return true; }
      if (k === TECLA.ENTER) {
        if (cartaoVisivel()) { abrirProximo(true); } else { alternarPausa(); }
        return true;
      }
      if (k === TECLA.CIMA) { menuLinha = 0; }
      else if (k === TECLA.BAIXO) { menuLinha = 2; chipPos = chipAtivo(); }
    } else {
      if (k === TECLA.ESQ) { chipPos = Math.max(0, chipPos - 1); }
      else if (k === TECLA.DIR) { chipPos = Math.min(chipsLista.length - 1, chipPos + 1); }
      else if (k === TECLA.CIMA) { menuLinha = 1; }
      else if (k === TECLA.ENTER) { escolherChip(); return true; }
    }
    mostrarControles();
    return true;
  }

  function desenharFaixas() {
    var f = motor.faixas();
    var legendas = [{ id: null, rotulo: 'Desativada', ativa: !f.legendaAtiva }];
    f.legenda.forEach(function (x) { legendas.push(x); });
    faixasLista = [f.audio, f.legenda.length > 0 ? legendas : []];
    faixasPos[0] = Math.max(0, Math.min(faixasLista[0].length - 1, faixasPos[0]));
    faixasPos[1] = Math.max(0, Math.min(faixasLista[1].length - 1, faixasPos[1]));
    if (faixasLista[faixasCol].length === 0 && faixasLista[1 - faixasCol].length > 0) { faixasCol = 1 - faixasCol; }

    while (elFaixas.firstChild) { elFaixas.removeChild(elFaixas.firstChild); }
    var titulo = document.createElement('div');
    titulo.className = 'fx-titulo';
    titulo.textContent = '\u00C1udio e legenda';
    elFaixas.appendChild(titulo);

    if (faixasLista[0].length === 0 && faixasLista[1].length === 0) {
      var vazio = document.createElement('div');
      vazio.className = 'fx-vazio';
      vazio.textContent = 'Este v\u00EDdeo n\u00E3o tem outras faixas de \u00E1udio ou legenda (ou a TV n\u00E3o permite escolher).';
      elFaixas.appendChild(vazio);
      return;
    }

    var colunas = document.createElement('div');
    colunas.className = 'fx-colunas';
    ['\u00C1udio', 'Legenda'].forEach(function (nome, c) {
      var col = document.createElement('div');
      col.className = 'fx-col';
      var h = document.createElement('div');
      h.className = 'fx-nome';
      h.textContent = nome;
      col.appendChild(h);
      if (faixasLista[c].length === 0) {
        var sem = document.createElement('div');
        sem.className = 'fx-item fx-sem';
        sem.textContent = c === 0 ? 'Apenas o \u00E1udio padr\u00E3o' : 'Sem legendas neste v\u00EDdeo';
        col.appendChild(sem);
      }
      faixasLista[c].forEach(function (it, i) {
        var li = document.createElement('div');
        li.className = 'fx-item' + (it.ativa ? ' ativa' : '') + (faixasCol === c && faixasPos[c] === i ? ' sel' : '');
        li.textContent = (it.ativa ? '\u2713  ' : '') + it.rotulo;
        li.addEventListener('mouseenter', function () { faixasCol = c; faixasPos[c] = i; desenharFaixas(); });
        li.addEventListener('click', function () { faixasCol = c; faixasPos[c] = i; escolherFaixa(); });
        col.appendChild(li);
      });
      colunas.appendChild(col);
    });
    elFaixas.appendChild(colunas);
  }

  function abrirFaixas() {
    faixasAberto = true;
    faixasCol = 0;
    faixasPos = [0, 0];
    var f = motor.faixas();
    f.audio.forEach(function (x, i) { if (x.ativa) { faixasPos[0] = i; } });
    desenharFaixas();
    elFaixas.classList.remove('escondida');
    mostrarControles();
  }

  function fecharFaixas() {
    faixasAberto = false;
    clearTimeout(timerFaixas);
    elFaixas.classList.add('escondida');
    atualizarPausa();
  }

  function escolherFaixa() {
    var it = faixasLista[faixasCol][faixasPos[faixasCol]];
    if (!it) { return; }
    if (faixasCol === 0) { motor.escolherAudio(it.id); }
    else { motor.escolherLegenda(it.id); }
    clearTimeout(timerFaixas);
    timerFaixas = setTimeout(function () { if (faixasAberto) { desenharFaixas(); } }, 450);
  }

  function teclaFaixas(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC || k === TECLA.AMARELO || k === TECLA.STOP) { fecharFaixas(); return true; }
    if (k === TECLA.CIMA) { faixasPos[faixasCol] = Math.max(0, faixasPos[faixasCol] - 1); desenharFaixas(); return true; }
    if (k === TECLA.BAIXO) {
      faixasPos[faixasCol] = Math.min(Math.max(0, faixasLista[faixasCol].length - 1), faixasPos[faixasCol] + 1);
      desenharFaixas();
      return true;
    }
    if (k === TECLA.ESQ || k === TECLA.DIR) {
      var outra = 1 - faixasCol;
      if (faixasLista[outra].length > 0) { faixasCol = outra; desenharFaixas(); }
      return true;
    }
    if (k === TECLA.ENTER) { escolherFaixa(); return true; }
    // Teclas de mídia continuam funcionando com o menu aberto.
    if (k === TECLA.PLAY) { if (motor.pausado()) { alternarPausa(); } return true; }
    if (k === TECLA.PAUSE) { if (!motor.pausado()) { alternarPausa(); } return true; }
    return true;
  }

  // ── Barra e botões ────────────────────────────────────────────────
  function atualizarBarra() {
    var d = motor.duracao();
    var t = puloAlvo !== null ? puloAlvo : (motor.tempo());
    var valida = isFinite(d) && d > 0;
    var pct = valida ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
    elProgresso.style.width = pct + '%';
    elPrevia.style.left = pct + '%';
    elPrevia.classList.toggle('escondida', puloAlvo === null);
    elTempo.textContent = formatarNet(t);
    // À direita fica o tempo que FALTA (igual à Netflix), não a duração total.
    elDuracao.textContent = valida ? formatarNet(d - t) : '';
    // Ícone da barra: triângulo com o vídeo pausado, duas barrinhas tocando (igual à Netflix)
    elIcone.classList.toggle('tocando', !motor.pausado());
  }

  // ── Tela de pausa (estilo Netflix) ────────────────────────────────
  // Aparece só com o vídeo pausado e a barra na tela (e sem o menu de áudio/legenda aberto).
  // Avaliação na tela de pausa (mesma gravação da tela de detalhes: tipo + id do título).
  function desenharAval() {
    var it = itens[idx];
    var atual = it && it.logoId ? VLTV.dados.avaliacao(it.logoTipo, it.logoId) : '';
    botoesAval.forEach(function (el, i) {
      el.classList.toggle('ativo', el.getAttribute('data-v') === atual);
      el.classList.toggle('foco', avalFoco && i === avalPos);
    });
  }

  function pausaNaTela() { return !pausa.classList.contains('escondida'); }

  function teclaAval(k) {
    if (k === TECLA.ESQ) { avalPos = Math.max(0, avalPos - 1); }
    else if (k === TECLA.DIR) { avalPos = Math.min(botoesAval.length - 1, avalPos + 1); }
    else if (k === TECLA.ENTER) {
      var it = itens[idx];
      if (it && it.logoId) { VLTV.dados.definirAvaliacao(it.logoTipo, it.logoId, botoesAval[avalPos].getAttribute('data-v')); }
    }
    else { avalFoco = false; }   // baixo, cima ou voltar: sai da avaliação
    desenharAval();
    mostrarControles();
  }

  function atualizarPausa() {
    var pausadoDeVerdade = ativo && jaTocou && motor.pausado() && !faixasAberto;
    if (!pausadoDeVerdade) {
      // Tocando (ou ainda carregando): a tela de pausa some na hora e o contador zera.
      clearTimeout(timerPausa);
      timerPausa = null;
      pausaLiberada = false;
      avalFoco = false;
      pausa.classList.add('escondida');
      desenharMenu();
      return;
    }
    // Pausou: espera ATRASO_PAUSA_MS antes de mostrar a logo (a barra de controles já fica na tela).
    if (!pausaLiberada && timerPausa === null) {
      timerPausa = setTimeout(function () {
        timerPausa = null;
        pausaLiberada = true;
        atualizarPausa();
      }, ATRASO_PAUSA_MS);
    }
    pausa.classList.toggle('escondida', !(pausaLiberada && controlesVisiveis()));
    desenharAval();
    desenharMenu();
  }

  // Prepara os textos e a logo do item que vai tocar. Sem logo (ou sem chave do TMDB), mostra o nome grande.
  function prepararPausa(item) {
    var nome = item.nomeSerie || item.titulo || '';
    elPausaNome.textContent = nome;
    elPausaTxt.textContent = nome;

    if (item.tn !== undefined && item.en !== undefined) {
      var letra = VLTV.idioma && VLTV.idioma.ehIngles && VLTV.idioma.ehIngles() ? 'S' : 'T';
      elPausaEp.textContent = letra + item.tn + ':E' + item.en + (item.epTitulo ? ' \u201C' + item.epTitulo + '\u201D' : '');
      elPausaEp.classList.remove('escondida');
    } else {
      elPausaEp.textContent = '';
      elPausaEp.classList.add('escondida');
    }

    // Enquanto a logo não chega (ou se não existir), o nome em texto grande ocupa o lugar dela.
    elPausaLogo.classList.add('escondida');
    elPausaLogo.removeAttribute('src');
    elPausaTxt.classList.remove('escondida');

    if (!item.logoId || !VLTV.tmdb) { return; }
    var minha = idPlay;
    VLTV.tmdb.logo(item.logoTipo, item.logoId, item.logoNome || nome).then(function (url) {
      if (!url || minha !== idPlay) { return; }
      var img = new Image();
      img.onload = function () {
        if (minha !== idPlay) { return; }
        elPausaLogo.src = url;
        elPausaLogo.classList.remove('escondida');
        elPausaTxt.classList.add('escondida');
      };
      img.src = url;   // se a imagem falhar, fica o nome em texto
    });
  }

  function agendarEsconder() {
    clearTimeout(timerControles);
    // Pausado ou escolhendo botão, a barra continua na tela; tocando, some depois de alguns segundos.
    if (!motor.pausado()) {
      timerControles = setTimeout(function () {
        menuModo = false;   // a barra some e o menu fecha junto
        menuLinha = 1;
        controles.classList.add('escondida');
        ajustarCartao();
        atualizarPausa();
      }, menuModo ? TEMPO_MENU_MS : TEMPO_CONTROLES_MS);
    }
  }

  function mostrarControles() {
    atualizarBarra();
    controles.classList.remove('escondida');
    ajustarCartao();
    atualizarPausa();
    agendarEsconder();
  }

  // O cartão do próximo episódio sobe para não ficar em cima da barra de controles.
  function ajustarCartao() {
    cartao.classList.toggle('com-controles', controlesVisiveis());
    cartao.classList.toggle('com-menu', controlesVisiveis() && menuModo);   // com os chips embaixo da barra, o cartão sobe mais
  }

  // ── Avançar e voltar ──────────────────────────────────────────────
  function podePular() {
    var d = motor.duracao();
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
    if (!motor.buscar(alvo)) { avisar('Esta TV não conseguiu pular neste vídeo.'); }
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
    var base = puloAlvo !== null ? puloAlvo : (motor.tempo());
    puloAlvo = Math.max(0, Math.min(motor.duracao() - 1, base + sentido * passo));
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
    var d = motor.duracao();
    var t = puloAlvo !== null ? puloAlvo : (motor.tempo());
    if (!isFinite(d) || d <= 0 || t < 3) { return; }
    VLTV.dados.salvarProgresso(item.chave, t, d);
  }

  // Pula para o ponto de retomada assim que a TV souber a duração do vídeo.
  function aplicarInicio() {
    if (inicioPendente <= 0) { return; }
    var d = motor.duracao();
    if (!isFinite(d) || d <= 0) { return; }
    var alvo = inicioPendente;
    inicioPendente = 0;
    if (d > alvo + 5) {
      motor.buscar(alvo);
    }
  }

  // ── Créditos aprendidos (VPS) ─────────────────────────────────────
  function dnsAtual() {
    return (VLTV.sessao && VLTV.sessao.dominio()) || '';
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
    var d = motor.duracao();
    var t = puloAlvo !== null ? puloAlvo : (motor.tempo());
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
    if (motor.pausado() || motor.terminou()) { return; }
    var d = motor.duracao();
    var t = puloAlvo !== null ? puloAlvo : (motor.tempo());
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
    if (item && item.chave && isFinite(motor.duracao()) && motor.duracao() > 0 && !porToque) {
      VLTV.dados.salvarProgresso(item.chave, motor.duracao(), motor.duracao());   // assistido até o fim
    }
    carregarItem(idx + 1, 0);
  }

  // ── Reprodução ────────────────────────────────────────────────────
  function montarExtensoes(item) {
    if (item.url) { return ['']; }   // endereço direto (lista M3U)
    var lista = [];
    // 'm3u8' fica por último: só é tentado se o arquivo em si não abrir na TV (vale para painéis que entregam o filme em HLS).
    [item.ext, 'mp4', 'mkv', '', 'm3u8'].forEach(function (e) {
      var ext = e === undefined || e === null ? '' : String(e);
      if (lista.indexOf(ext) === -1) { lista.push(ext); }
    });
    return lista;
  }

  // Lista de endereços possíveis (o motor tenta um por um, depois as bibliotecas e o player da Samsung).
  function enderecos(item) {
    var urls = [];
    montarExtensoes(item).forEach(function (e) {
      var u = item.url ? item.url : VLTV.api.urlVod(item.tipo, item.id, e);
      if (u && urls.indexOf(u) === -1) { urls.push(u); }
    });
    return urls;
  }

  function tentar() {
    mostrarOverlay('Carregando...');
    motor.abrir(enderecos(itens[idx]));
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
    jaTocou = false;
    menuModo = false;
    menuLinha = 1;
    atualizarPausa();

    clearTimeout(timerPulo);
    timerPulo = null;
    puloAlvo = null;
    puloSequencia = 0;
    proximoLancado = false;
    esconderCartao();
    pararTimersProximo();
    iniciarCreditos();
    if (temProximo()) { timerProximo = setInterval(verificarProximo, 1000); }

    fecharFaixas();
    esconderLegenda();
    elTitulo.textContent = itens[idx].titulo || '';
    prepararPausa(itens[idx]);
    elProgresso.style.width = '0%';
    elTempo.textContent = '0:00';
    elDuracao.textContent = '';
    mostrarControles();
    tentar();
  }

  function parar() {
    idPlay++;
    ativo = false;
    jaTocou = false;
    clearTimeout(timerPausa);
    timerPausa = null;
    pausaLiberada = false;
    clearTimeout(timerControles);
    clearTimeout(timerPulo);
    clearTimeout(timerAviso);
    pararTimersProximo();
    puloAlvo = null;
    motor.parar();
    esconderLegenda();
    fecharFaixas();
    esconderOverlay();
    esconderCartao();
    elAviso.classList.add('escondida');
    controles.classList.add('escondida');
    pausa.classList.add('escondida');
    menuModo = false;
    menuLinha = 1;
    clearTimeout(timerChips);
    desenharMenu();
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

  // Eventos do motor (iguais para a TV nativa, bibliotecas e AVPlay da Samsung).
  var motor = VLTV.motor.criar(video, {
    modo: 'vod',
    aoMetadados: aplicarInicio,
    aoPlaying: function () {
      jaTocou = true;
      esconderOverlay();
      aplicarInicio();
      mostrarControles();
    },
    aoEspera: function () { if (ativo) { mostrarOverlay('Carregando...'); } },
    aoBuscou: function () { if (ativo) { esconderOverlay(); } },
    aoPausa: function () { if (ativo) { salvarPosicao(); mostrarControles(); } },
    aoTempo: function () {
      if (!ativo) { return; }
      if (controlesVisiveis()) { atualizarBarra(); }
      var agora = new Date().getTime();
      if (agora - ultimoSalvo > INTERVALO_SALVAR_MS) {
        ultimoSalvo = agora;
        salvarPosicao();
      }
    },
    aoReconectando: function (msg) { if (ativo) { mostrarOverlay(msg); } },
    aoFalha: function (msg) { if (ativo) { mostrarOverlay(msg, 'erro'); } },
    aoLegenda: function (texto) { mostrarLegenda(texto); },
    aoFaixas: function () { if (faixasAberto) { desenharFaixas(); } else if (menuModo) { desenharMenu(); } },
    aoFim: function () {
      if (!ativo) { return; }
      var item = itens[idx];
      if (item && item.chave && isFinite(motor.duracao()) && motor.duracao() > 0) {
        VLTV.dados.salvarProgresso(item.chave, motor.duracao(), motor.duracao());   // marca como assistido
      }
      if (temProximo() && !proximoLancado) { abrirProximo(false); }
      else if (idx + 1 < itens.length && !proximoLancado) { proximoLancado = true; carregarItem(idx + 1, 0); }
      else if (idx + 1 >= itens.length) { sair(); }
    }
  });

  // ── Controle remoto ───────────────────────────────────────────────
  function alternarPausa() {
    if (motor.pausado()) { motor.play(); } else { motor.pause(); }
    mostrarControles();
  }

  function tecla(k) {
    if (faixasAberto) { return teclaFaixas(k); }
    if (avalFoco && (k === TECLA.VOLTAR || k === TECLA.ESC)) { teclaAval(k); return true; }
    // Com o menu aberto, Voltar só fecha o menu (uma segunda vez sai do player).
    if (menuModo && (k === TECLA.VOLTAR || k === TECLA.ESC)) { fecharMenu(); mostrarControles(); return true; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC || k === TECLA.STOP) { sair(); return true; }

    // Teclas de mídia do controle (sempre iguais, em qualquer foco)
    if (k === TECLA.PLAY) { if (motor.pausado()) { alternarPausa(); } return true; }
    if (k === TECLA.PAUSE) { if (!motor.pausado()) { alternarPausa(); } return true; }
    if (avalFoco) { teclaAval(k); return true; }
    if (k === TECLA.VOLTA) { pular(-PULO_LONGO_S, true); return true; }
    if (k === TECLA.AVANCA) { pular(PULO_LONGO_S, true); return true; }

    // Menu estilo Netflix aberto: as setas andam entre topo, barra e idioma/legenda.
    if (menuModo) { return teclaMenu(k); }

    // Esquerda/direita pulam, OK pausa/continua (ou abre o próximo episódio se o cartão estiver na tela).
    if (k === TECLA.ESQ) { pular(-10, false); }
    else if (k === TECLA.DIR) { pular(10, false); }
    else if (k === TECLA.ENTER) {
      // Com o cartão do próximo episódio na tela, OK vai direto para o próximo (igual ao Android).
      if (cartaoVisivel()) { abrirProximo(true); }
      else { alternarPausa(); }
    }
    else if (k === TECLA.AMARELO) { abrirFaixas(); }
    else if (k === TECLA.BAIXO) { abrirMenu(1); }   // seta para baixo: abre o menu (idioma e legenda ficam na linha de baixo)
    else if (k === TECLA.CIMA) {
      // Com a tela de pausa na tela e o título conhecido, a seta para cima vai para a avaliação.
      if (pausaNaTela() && itens[idx] && itens[idx].logoId) { avalFoco = true; desenharAval(); mostrarControles(); }
      else { abrirMenu(1); }   // senão, abre o menu (ícones em cima, nome da série e T:E)
    }
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
