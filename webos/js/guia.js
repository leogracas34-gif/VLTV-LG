// VLTV Play - webOS | Guia de programação em grade (estilo guia de TV) e lembretes de programa.
// O guia abre por cima da TV ao vivo e mostra os canais da lista aberta, com a programação em colunas de tempo.
//  - ← → andam pelos programas do canal; ↑ ↓ trocam de canal (PG/CH+/CH- andam de 8 em 8);
//  - OK em programa que já está no ar: assiste o canal; OK em programa futuro: cria/remove o LEMBRETE;
//  - Voltar fecha o guia.
// Lembrete: um minuto antes do programa aparece um aviso com contagem; na hora a TV muda sozinha para o canal
// (OK vai na hora, Voltar cancela). Os lembretes ficam guardados na TV.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40, PG_CIMA: 33, PG_BAIXO: 34,
                CH_MAIS: 427, CH_MENOS: 428, VOLTA: 412, AVANCA: 417 };

  var LINHAS = 7;                 // canais visíveis ao mesmo tempo
  var JANELA_S = 3 * 3600;        // 3 horas na tela
  var PASSO_S = 1800;             // a janela anda de 30 em 30 minutos
  var TTL_EPG_MS = 10 * 60 * 1000;
  var MAX_PARALELO = 3;
  var AVISO_ANTES_S = 60;         // o lembrete avisa 1 minuto antes
  var PERDIDO_S = 120;            // lembrete que passou mais que isso (TV desligada, etc.) é descartado
  var CH_LEMBRETES = 'vltv_lembretes_';

  function $(id) { return document.getElementById(id); }
  function agoraS() { return Math.floor(new Date().getTime() / 1000); }
  function pad(n) { return ('0' + n).slice(-2); }
  function hhmm(ts) { var d = new Date(ts * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function piso(ts) { return Math.floor(ts / PASSO_S) * PASSO_S; }

  var ICONE_SINO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.4 2.4 0 0 0 2.4-2.4H9.6A2.4 2.4 0 0 0 12 22zm7-6.2V11c0-3.3-1.8-6-4.8-6.8V3.5a2.2 2.2 0 0 0-4.4 0v.7C6.8 5 5 7.7 5 11v4.8l-2 2V19h18v-1.2z"/></svg>';

  // ── Lembretes guardados na TV ─────────────────────────────────────
  function dono() {
    var s = null;
    try { s = VLTV.sessao.ler(); } catch (e) { s = null; }
    return s ? (s.modo === 'm3u' ? 'm3u' : (s.user || 'padrao')) : 'padrao';
  }
  function chaveLembretes() { return CH_LEMBRETES + dono(); }

  function lerLembretes() {
    try {
      var t = localStorage.getItem(chaveLembretes());
      var l = t ? JSON.parse(t) : [];
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  function gravarLembretes(l) {
    try { localStorage.setItem(chaveLembretes(), JSON.stringify(l)); } catch (e) { /* ignora */ }
  }
  function idLembrete(canal, iniTs) { return String(canal.stream_id) + '_' + iniTs; }
  function temLembrete(canal, iniTs) {
    var id = idLembrete(canal, iniTs);
    return lerLembretes().some(function (x) { return x.id === id; });
  }
  function canalEnxuto(c) {
    return { stream_id: c.stream_id, name: c.name, stream_icon: c.stream_icon, url: c.url, num: c.num, category_id: c.category_id };
  }
  // Devolve true se criou, false se removeu.
  function alternarLembrete(canal, prog) {
    var l = lerLembretes();
    var id = idLembrete(canal, prog.iniTs);
    var i = -1;
    l.forEach(function (x, k) { if (x.id === id) { i = k; } });
    if (i !== -1) { l.splice(i, 1); gravarLembretes(l); return false; }
    l.push({ id: id, canal: canalEnxuto(canal), titulo: prog.titulo, iniTs: prog.iniTs, fimTs: prog.fimTs || 0 });
    if (l.length > 60) { l.shift(); }
    gravarLembretes(l);
    return true;
  }

  // ── Dados do guia (por canal) ─────────────────────────────────────
  var epg = {};          // stream_id -> { lista, quando, carregando }
  var fila = [];
  var ativas = 0;

  function chaveEpg(c) { return dono() + ':' + c.stream_id; }

  function pedirEpg(canal, aoChegar) {
    var k = chaveEpg(canal);
    var e = epg[k];
    var fresco = e && e.lista && (new Date().getTime() - e.quando) < TTL_EPG_MS;
    if (fresco || (e && e.carregando)) { return; }
    epg[k] = { lista: e ? e.lista : null, quando: e ? e.quando : 0, carregando: true };
    fila.push({ canal: canal, k: k, aoChegar: aoChegar });
    andarFila();
  }

  function andarFila() {
    while (ativas < MAX_PARALELO && fila.length > 0) {
      (function (item) {
        ativas++;
        var feito = false;
        function fim(lista) {
          if (feito) { return; }
          feito = true;
          ativas--;
          epg[item.k] = { lista: lista, quando: new Date().getTime(), carregando: false };
          try { item.aoChegar(item.canal); } catch (e) { if (VLTV.protecao) { VLTV.protecao.erro(e); } }
          andarFila();
        }
        if (item.canal.url) { fim([]); return; }   // lista M3U não tem guia de programação
        VLTV.api.epgCurto(item.canal.stream_id, 16).then(function (l) { fim(l || []); }, function () { fim([]); });
      })(fila.shift());
    }
  }

  function programasDe(canal) {
    var e = epg[chaveEpg(canal)];
    return e && e.lista ? e.lista : null;
  }
  function fimDe(p) { return p.fimTs || (p.iniTs + 3600); }

  // ── Estado da tela ────────────────────────────────────────────────
  var raiz = $('guia');
  var canais = [];
  var linha = 0;           // canal marcado
  var topo = 0;            // primeiro canal visível
  var t0 = 0;              // começo da janela (segundos)
  var tCur = 0;            // instante que o cursor "persegue" ao subir/descer
  var pi = -1;             // programa marcado (índice no guia do canal); -1 = sem programa
  var aberto = false;
  var acoes = null;
  var tituloCat = '';
  var msgTemp = '';
  var timerMsg = null;
  var timerRelogio = null;
  var els = {};

  function t1() { return t0 + JANELA_S; }

  function criar() {
    if (els.raiz) { return; }
    els.raiz = raiz;
    while (raiz.firstChild) { raiz.removeChild(raiz.firstChild); }
    function div(cls, pai) { var d = document.createElement('div'); d.className = cls; (pai || raiz).appendChild(d); return d; }
    var topoEl = div('g-topo');
    els.titulo = div('g-titulo', topoEl);
    els.titulo.textContent = 'Guia de programação';
    els.cat = div('g-cat', topoEl);
    els.hora = div('g-hora', topoEl);
    var tempo = div('g-tempo');
    div('g-tempo-esq', tempo);
    els.tempo = div('g-tempo-dir', tempo);
    els.linhas = div('g-linhas');
    els.det = div('g-detalhe');
    els.detTitulo = div('g-det-titulo', els.det);
    els.detMeta = div('g-det-meta', els.det);
    els.detDesc = div('g-det-desc', els.det);
    els.dica = div('g-dica');
    els.dica.textContent = '◄ ► programas   ▲ ▼ canais   OK: assistir ou criar lembrete   Voltar: fechar';
  }

  function desenharTempo() {
    while (els.tempo.firstChild) { els.tempo.removeChild(els.tempo.firstChild); }
    for (var s = 0; s < JANELA_S; s += PASSO_S) {
      var d = document.createElement('div');
      d.className = 'g-marca';
      d.style.left = (s / JANELA_S * 100) + '%';
      d.style.width = (PASSO_S / JANELA_S * 100) + '%';
      d.textContent = hhmm(t0 + s);
      els.tempo.appendChild(d);
    }
  }

  function numeroDe(c, i) {
    var n = parseInt(c.num, 10);
    return n > 0 ? n : i + 1;
  }

  function desenharLinha(i) {
    var canal = canais[i];
    var el = document.createElement('div');
    el.className = 'g-linha' + (i === linha ? ' sel' : '');

    var cn = document.createElement('div');
    cn.className = 'g-canal';
    var num = document.createElement('span');
    num.className = 'g-num';
    num.textContent = numeroDe(canal, i);
    var nome = document.createElement('span');
    nome.className = 'g-nome';
    nome.textContent = canal.name || '';
    cn.appendChild(num);
    cn.appendChild(nome);
    el.appendChild(cn);

    var grade = document.createElement('div');
    grade.className = 'g-grade';
    el.appendChild(grade);

    var lista = programasDe(canal);
    var cont = 0;
    if (lista) {
      lista.forEach(function (p, k) {
        var ini = p.iniTs;
        var fim = fimDe(p);
        if (fim <= t0 || ini >= t1()) { return; }
        var a = Math.max(ini, t0);
        var b = Math.min(fim, t1());
        var c = document.createElement('div');
        var agora = agoraS();
        c.className = 'g-prog' + (ini <= agora && fim > agora ? ' no-ar' : '') + (i === linha && k === pi ? ' sel' : '');
        c.style.left = ((a - t0) / JANELA_S * 100) + '%';
        c.style.width = ((b - a) / JANELA_S * 100) + '%';
        var tx = document.createElement('span');
        tx.className = 'g-prog-tx';
        tx.textContent = (ini < t0 ? '‹ ' : '') + (p.titulo || 'Sem título');
        c.appendChild(tx);
        if (ini > agora && temLembrete(canal, ini)) {
          var sino = document.createElement('span');
          sino.className = 'g-sino';
          sino.innerHTML = ICONE_SINO;
          c.appendChild(sino);
        }
        grade.appendChild(c);
        cont++;
      });
    }
    if (cont === 0) {
      var v = document.createElement('div');
      v.className = 'g-prog g-vazio' + (i === linha ? ' sel' : '');
      v.style.left = '0';
      v.style.width = '100%';
      var carregando = !lista;
      v.textContent = carregando ? 'Carregando...' : 'Sem informação de programação.';
      grade.appendChild(v);
    }

    // Linha vermelha "agora"
    var ag = agoraS();
    if (ag >= t0 && ag < t1()) {
      var marca = document.createElement('div');
      marca.className = 'g-agora';
      marca.style.left = ((ag - t0) / JANELA_S * 100) + '%';
      grade.appendChild(marca);
    }
    return el;
  }

  function desenharLinhas() {
    while (els.linhas.firstChild) { els.linhas.removeChild(els.linhas.firstChild); }
    for (var i = topo; i < Math.min(canais.length, topo + LINHAS); i++) { els.linhas.appendChild(desenharLinha(i)); }
  }

  function desenharDetalhe() {
    var canal = canais[linha];
    var p = programaMarcado();
    els.detTitulo.textContent = p ? (p.titulo || 'Sem título') : (canal ? (canal.name || '') : '');
    var meta = '';
    var acao = '';
    if (canal && p) {
      var agora = agoraS();
      meta = (canal.name || '') + '  •  ' + hhmm(p.iniTs) + (p.fimTs ? ' - ' + hhmm(p.fimTs) : '');
      if (p.iniTs <= agora && fimDe(p) > agora) { acao = 'OK: assistir agora'; }
      else if (p.iniTs > agora) { acao = temLembrete(canal, p.iniTs) ? 'OK: remover o lembrete' : 'OK: lembrar e mudar de canal quando começar'; }
      else { acao = 'Programa já terminou'; }
    } else if (canal) {
      meta = 'OK: assistir este canal';
    }
    els.detMeta.textContent = msgTemp || (meta + (acao ? '  •  ' + acao : ''));
    els.detMeta.className = 'g-det-meta' + (msgTemp ? ' aviso' : '');
    els.detDesc.textContent = p && p.descricao ? p.descricao : '';
  }

  function desenharHora() {
    var d = new Date();
    els.hora.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function desenhar() {
    desenharTempo();
    desenharLinhas();
    desenharDetalhe();
    desenharHora();
  }

  function carregarVisiveis() {
    for (var i = topo; i < Math.min(canais.length, topo + LINHAS + 1); i++) {
      pedirEpg(canais[i], aoChegarEpg);
    }
  }

  function aoChegarEpg(canal) {
    if (!aberto) { return; }
    var i = canais.indexOf(canal);
    if (i < 0) { return; }
    if (i === linha && pi === -1) { escolherPrograma(); }
    if (i >= topo && i < topo + LINHAS) {
      desenharLinhas();
      desenharDetalhe();
    }
  }

  // ── Programa sob o cursor ─────────────────────────────────────────
  function programaMarcado() {
    var l = canais[linha] ? programasDe(canais[linha]) : null;
    return l && pi >= 0 && l[pi] ? l[pi] : null;
  }

  // Escolhe, no canal marcado, o programa que cobre o instante tCur (ou o mais próximo depois dele).
  function escolherPrograma() {
    var l = canais[linha] ? programasDe(canais[linha]) : null;
    pi = -1;
    if (!l) { return; }
    var melhor = -1;
    for (var k = 0; k < l.length; k++) {
      if (l[k].iniTs <= tCur && fimDe(l[k]) > tCur) { melhor = k; break; }
      if (l[k].iniTs > tCur && fimDe(l[k]) > t0 && l[k].iniTs < t1() && melhor === -1) { melhor = k; }
    }
    pi = melhor;
  }

  function garantirVisivel(p) {
    if (!p) { return; }
    var minimo = piso(agoraS());
    if (p.iniTs >= t1()) { t0 = Math.max(minimo, piso(p.iniTs)); }
    else if (fimDe(p) <= t0) { t0 = Math.max(minimo, piso(p.iniTs)); }
  }

  function mover(dl) {
    var n = Math.max(0, Math.min(canais.length - 1, linha + dl));
    if (n === linha) { return; }
    linha = n;
    if (linha < topo) { topo = linha; }
    if (linha >= topo + LINHAS) { topo = linha - LINHAS + 1; }
    escolherPrograma();
    carregarVisiveis();
    desenhar();
  }

  function andarPrograma(passo) {
    var l = canais[linha] ? programasDe(canais[linha]) : null;
    if (!l || l.length === 0) { return; }
    var n = pi === -1 ? 0 : pi + passo;
    // Pula programas que já terminaram.
    while (n >= 0 && n < l.length && fimDe(l[n]) <= piso(agoraS())) { n += passo; }
    if (n < 0 || n >= l.length) { return; }
    pi = n;
    tCur = Math.max(l[n].iniTs, t0);
    garantirVisivel(l[n]);
    tCur = Math.max(l[n].iniTs, t0);
    carregarVisiveis();
    desenhar();
  }

  function andarJanela(passos) {
    var novo = Math.max(piso(agoraS()), t0 + passos * PASSO_S);
    if (novo === t0) { return; }
    t0 = novo;
    tCur = Math.max(tCur, t0);
    escolherPrograma();
    desenhar();
  }

  function avisar(texto) {
    msgTemp = texto;
    clearTimeout(timerMsg);
    timerMsg = setTimeout(function () { msgTemp = ''; if (aberto) { desenharDetalhe(); } }, 4000);
    desenharDetalhe();
  }

  function confirmar() {
    var canal = canais[linha];
    if (!canal) { return; }
    var p = programaMarcado();
    var agora = agoraS();
    if (!p || (p.iniTs <= agora && fimDe(p) > agora)) {
      var cb = acoes && acoes.assistir;
      fechar();
      if (cb) { cb(canal); }
      return;
    }
    if (p.iniTs > agora) {
      var criou = alternarLembrete(canal, p);
      avisar(criou ? 'Lembrete criado: a TV muda para este canal às ' + hhmm(p.iniTs) + '.' : 'Lembrete removido.');
      desenharLinhas();
    }
  }

  // ── Abrir e fechar ────────────────────────────────────────────────
  // lista: canais da categoria aberta; idx: canal que está marcado; ac: { assistir(canal), fechou() }; titulo: nome da categoria.
  function abrir(lista, idx, ac, titulo) {
    if (!raiz || !lista || lista.length === 0) { return false; }
    criar();
    canais = lista;
    acoes = ac || null;
    tituloCat = titulo || '';
    linha = Math.max(0, Math.min(lista.length - 1, idx || 0));
    topo = Math.max(0, Math.min(linha, Math.max(0, lista.length - LINHAS)));
    if (linha >= topo + LINHAS) { topo = linha - LINHAS + 1; }
    t0 = piso(agoraS());
    tCur = agoraS();
    msgTemp = '';
    pi = -1;
    aberto = true;
    els.cat.textContent = tituloCat;
    raiz.classList.remove('escondida');
    escolherPrograma();
    carregarVisiveis();
    desenhar();
    clearInterval(timerRelogio);
    timerRelogio = setInterval(function () {
      if (!aberto) { return; }
      // Passou da meia hora: a janela acompanha o relógio.
      if (piso(agoraS()) > t0) { t0 = piso(agoraS()); tCur = Math.max(tCur, t0); escolherPrograma(); }
      desenhar();
    }, 30000);
    return true;
  }

  function fechar() {
    if (!aberto) { return; }
    aberto = false;
    clearInterval(timerRelogio);
    clearTimeout(timerMsg);
    raiz.classList.add('escondida');
    var cb = acoes && acoes.fechou;
    if (cb) { cb(); }
  }

  function tecla(k) {
    if (!aberto) { return false; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { fechar(); }
    else if (k === TECLA.CIMA) { mover(-1); }
    else if (k === TECLA.BAIXO) { mover(1); }
    else if (k === TECLA.ESQ) { andarPrograma(-1); }
    else if (k === TECLA.DIR) { andarPrograma(1); }
    else if (k === TECLA.PG_CIMA || k === TECLA.CH_MAIS) { mover(-LINHAS); }
    else if (k === TECLA.PG_BAIXO || k === TECLA.CH_MENOS) { mover(LINHAS); }
    else if (k === TECLA.VOLTA) { andarJanela(-6); }
    else if (k === TECLA.AVANCA) { andarJanela(6); }
    else if (k === TECLA.ENTER) { confirmar(); }
    return true;   // com o guia aberto, ele fica com todas as teclas
  }

  // ── Lembrete: aviso 1 minuto antes e troca automática ─────────────
  var avisoEl = $('aviso-lembrete');
  var avisoTitulo = $('aviso-lembrete-titulo');
  var avisoTexto = $('aviso-lembrete-texto');
  var avisoBtn = $('aviso-lembrete-ir');
  var atual = null;            // lembrete que está na tela
  var cfg = { ir: null, podeMostrar: null, podeAuto: null };

  function lembreteAberto() { return !!avisoEl && !avisoEl.classList.contains('escondida'); }

  function removerLembrete(id) {
    gravarLembretes(lerLembretes().filter(function (x) { return x.id !== id; }));
  }

  function fecharLembrete(remover) {
    if (avisoEl) { avisoEl.classList.add('escondida'); }
    if (atual && remover) { removerLembrete(atual.id); }
    atual = null;
  }

  function irAgora() {
    var l = atual;
    if (!l) { return; }
    fecharLembrete(true);
    if (cfg.ir) { cfg.ir(l.canal); }
  }

  function verificar() {
    if (cfg.podeMostrar && !cfg.podeMostrar()) { return; }
    var agora = agoraS();
    var lista = lerLembretes();
    var proximo = null;
    var mudou = false;
    lista = lista.filter(function (x) {
      if (x.iniTs - agora < -PERDIDO_S) { mudou = true; return false; }   // passou e a TV não estava com o app aberto
      return true;
    });
    if (mudou) { gravarLembretes(lista); }
    lista.forEach(function (x) {
      if (x.iniTs - agora <= AVISO_ANTES_S && (!proximo || x.iniTs < proximo.iniTs)) { proximo = x; }
    });
    if (!proximo) { return; }
    if (!atual || atual.id !== proximo.id) {
      atual = proximo;
      if (avisoTitulo) { avisoTitulo.textContent = 'Seu programa vai começar'; }
      avisoEl.classList.remove('escondida');
      if (avisoBtn) { avisoBtn.focus(); }
    }
    var falta = proximo.iniTs - agora;
    var auto = !cfg.podeAuto || cfg.podeAuto();
    var nome = (proximo.titulo || '') + ' - ' + (proximo.canal.name || '');
    if (avisoTexto) {
      avisoTexto.textContent = nome + (falta > 0
        ? (auto ? '\nComeça em ' + falta + ' segundos. A TV muda de canal sozinha.' : '\nComeça em ' + falta + ' segundos.')
        : (auto ? '\nComeçou! Mudando de canal...' : '\nJá começou.'));
    }
    if (falta <= 0 && auto) { irAgora(); }
  }

  function teclaLembrete(k) {
    if (k === TECLA.ENTER) { irAgora(); }
    else if (k === TECLA.VOLTAR || k === TECLA.ESC) { fecharLembrete(true); }
    return true;
  }

  if (avisoBtn) { avisoBtn.addEventListener('click', irAgora); }
  setInterval(function () { if (VLTV.protecao) { VLTV.protecao.seguro(verificar); } else { verificar(); } }, 3000);

  VLTV.guia = {
    abrir: abrir,
    fechar: fechar,
    aberto: function () { return aberto; },
    tecla: tecla,
    lembreteAberto: lembreteAberto,
    teclaLembrete: teclaLembrete,
    configurar: function (c) { cfg = { ir: c.ir, podeMostrar: c.podeMostrar, podeAuto: c.podeAuto }; },
    numeroDe: numeroDe
  };
})();
