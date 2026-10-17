// VLTV Play | Motor de reprodução (LG e Samsung).
// Em vez de só jogar o endereço na tag <video>, tenta vários caminhos até um funcionar:
//   1) "nativo": a própria TV decodifica (mais leve, é o que sempre foi usado);
//   2) "hls":    biblioteca hls.js  (listas .m3u8 que a TV não abre sozinha);
//   3) "mpegts": biblioteca mpegts.js (TV ao vivo em .ts / MPEG-TS);
//   4) "avplay": player nativo da Samsung (AVPlay) - só existe em TV Samsung.
// Também: reconecta sozinho se o canal/filme travar, explica o motivo quando não toca
// e lista as faixas de áudio e legenda quando o vídeo tem mais de uma.
//
// Uso:  var motor = VLTV.motor.criar(videoEl, { modo: 'live' | 'vod', aoPlaying: fn, ... });
//       motor.abrir([url1, url2, ...], segundoInicial);   motor.parar();
(function () {
  'use strict';

  // ── Compatibilidade com TVs de 2018 (webOS 4 = Chrome 53, Tizen 4 = Chrome 56) ──────────────────
  // As bibliotecas de vídeo usam alguns recursos de navegador que só existem no Chrome 54+.
  // Estes "tapa-buracos" só entram quando a TV não tem o recurso.
  if (typeof window.globalThis === 'undefined') { window.globalThis = window; }
  if (!Object.entries) {
    Object.entries = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); };
  }
  if (!Object.values) {
    Object.values = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  }
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (tam, pad) {
      var t = String(this);
      var p = pad === undefined ? ' ' : String(pad);
      while (t.length < tam && p) { t = p + t; }
      return t.length > tam && p.length > 1 ? t.slice(t.length - tam) : t;
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (tam, pad) {
      var t = String(this);
      var p = pad === undefined ? ' ' : String(pad);
      while (t.length < tam && p) { t = t + p; }
      return t.slice(0, Math.max(tam, this.length));
    };
  }
  if (window.Promise && !Promise.prototype.finally) {
    Promise.prototype.finally = function (f) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(f()).then(function () { return v; }); },
        function (e) { return P.resolve(f()).then(function () { throw e; }); }
      );
    };
  }

  var CAMINHO_HLS = 'js/lib/hls.min.js';
  var CAMINHO_MPEGTS = 'js/lib/mpegts.js';
  var CH_MEMORIA = 'vltv_motor';

  // Servidor IPTV costuma demorar para começar a mandar o vídeo (principalmente via gateway/proxy).
  // Antes: 12s/20s por formato, então 3 formatos = ~36s e a mensagem "servidor demorou demais".
  var ESPERA_MS = { live: 20000, vod: 35000, avplay: 15000 };
  var ESPERA_EXTRA_MS = 20000;                    // +tempo se a TV já recebeu dados (servidor lento, mas respondendo)
  var TRAVOU_MS = { live: 20000, vod: 40000 };   // parado por tanto tempo = reconecta
  var MAX_RECONEXOES = { live: 8, vod: 4 };
  var ESTAVEL_MS = 30000;                         // tocando tanto tempo sem problema zera as reconexões

  function agora() { return new Date().getTime(); }
  function tentar(f, padrao) { try { return f(); } catch (e) { return padrao; } }
  function cfg() { return (window.VLTV && VLTV.config) || {}; }
  // MOTOR_AVANCADO = false (padrão): comportamento idêntico ao app antigo (só a tag <video>, mesmas esperas,
  // sem bibliotecas, sem AVPlay, sem vigia de reconexão). true liga hls.js, mpegts.js, AVPlay e reconexão.
  function avancado() { return !!cfg().MOTOR_AVANCADO; }
  // DIAGNOSTICO = true: a mensagem de erro mostra o que foi tentado (ex.: m3u8: formato | ts: tempo).
  function diagnostico() { return !!cfg().DIAGNOSTICO; }
  var ESPERA_SIMPLES_MS = { live: 12000, vod: 20000 };   // mesmas esperas da versão antiga

  // ── Memória: se a TV não abre um tipo de endereço sozinha, não perde tempo tentando de novo ─────
  var memoria = tentar(function () { return JSON.parse(localStorage.getItem(CH_MEMORIA) || '{}'); }, {}) || {};
  if (!memoria.semNativo) { memoria.semNativo = {}; }
  function gravarMemoria() { tentar(function () { localStorage.setItem(CH_MEMORIA, JSON.stringify(memoria)); }); }

  // ── Carregar as bibliotecas só quando precisar (deixa o app abrir mais rápido) ─────────────────
  var scripts = {};
  function carregarScript(src, pronto) {
    var s = scripts[src];
    if (s === true) { pronto(true); return; }
    if (s === false) { pronto(false); return; }
    if (s) { s.push(pronto); return; }
    scripts[src] = [pronto];
    var el = document.createElement('script');
    function fim(ok) {
      var fila = scripts[src];
      scripts[src] = ok;
      fila.forEach(function (f) { f(ok); });
    }
    el.onload = function () { fim(true); };
    el.onerror = function () { fim(false); };
    el.src = src;
    document.getElementsByTagName('head')[0].appendChild(el);
  }

  function hlsPronto(cb) {
    carregarScript(CAMINHO_HLS, function (ok) {
      cb(ok && window.Hls && tentar(function () { return window.Hls.isSupported(); }, false));
    });
  }
  function mpegtsPronto(cb) {
    carregarScript(CAMINHO_MPEGTS, function (ok) {
      cb(ok && window.mpegts && tentar(function () { return window.mpegts.getFeatureList().mseLivePlayback; }, false));
    });
  }

  function avplayApi() {
    var a = window.webapis && window.webapis.avplay;
    return a && typeof a.open === 'function' ? a : null;
  }

  // ── Tipo do endereço ───────────────────────────────────────────────
  function tipoDaUrl(url) {
    var limpa = String(url || '').split('#')[0].split('?')[0].toLowerCase();
    if (/\.m3u8?$/.test(limpa)) { return 'hls'; }
    if (/\.(ts|mpegts|mts|m2ts)$/.test(limpa)) { return 'ts'; }
    if (/\.(mp4|m4v|mov)$/.test(limpa)) { return 'mp4'; }
    if (/\.mkv$/.test(limpa)) { return 'mkv'; }
    if (/\.[a-z0-9]{2,4}$/.test(limpa.split('/').pop() || '')) { return 'arquivo'; }
    return 'sem-ext';
  }

  // Monta a fila de tentativas, da mais leve para a mais pesada.
  function montarPlano(urls, modo) {
    var plano = [];
    var vistos = {};
    function add(estrategia, url) {
      var k = estrategia + '|' + url;
      if (vistos[k]) { return; }
      vistos[k] = true;
      plano.push({ estrategia: estrategia, url: url, tipo: tipoDaUrl(url) });
    }
    if (!avancado()) {
      urls.forEach(function (u) { add('nativo', u); });
      return plano;
    }
    var nativos = [];
    var bibliotecas = [];
    var avplays = [];
    urls.forEach(function (u) {
      nativos.push({ e: 'nativo', u: u });
      var t = tipoDaUrl(u);
      if (t === 'hls') { bibliotecas.push({ e: 'hls', u: u }); }
      else if (t === 'ts') { bibliotecas.push({ e: 'mpegts', u: u }); }
      else if (t === 'sem-ext' && modo === 'live') {
        // Sem extensão, o servidor costuma entregar MPEG-TS (ou, às vezes, HLS).
        bibliotecas.push({ e: 'mpegts', u: u });
        bibliotecas.push({ e: 'hls', u: u });
      }
      if (avplayApi()) { avplays.push({ e: 'avplay', u: u }); }
    });

    // TV que já mostrou não abrir esse tipo sozinha: as bibliotecas passam na frente do "nativo".
    var nativosOk = [];
    var nativosRuins = [];
    nativos.forEach(function (x) {
      var t = tipoDaUrl(x.u);
      var chave = t === 'sem-ext' ? 'ts' : t;
      ((memoria.semNativo[chave] || 0) >= 2 ? nativosRuins : nativosOk).push(x);
    });

    var ordem = [];
    if (cfg().AVPLAY_PRIMEIRO && avplays.length) { ordem = ordem.concat(avplays); avplays = []; }
    ordem = ordem.concat(nativosOk, bibliotecas, nativosRuins, avplays);
    // O formato que funcionou da última vez passa na frente (evita testar formato por formato a cada canal).
    var venceu = memoria.venceu && memoria.venceu[modo];
    if (venceu) {
      var f = [];
      var r = [];
      ordem.forEach(function (x) {
        ((x.e === venceu.estrategia && tipoDaUrl(x.u) === venceu.tipo) ? f : r).push(x);
      });
      ordem = f.concat(r);
    }
    ordem.forEach(function (x) { add(x.e, x.u); });
    return plano;
  }

  // ── Nomes de idioma ────────────────────────────────────────────────
  var IDIOMAS = {
    por: 'Português', pt: 'Português', 'pt-br': 'Português (Brasil)', ptbr: 'Português (Brasil)', pob: 'Português (Brasil)',
    eng: 'Inglês', en: 'Inglês', spa: 'Espanhol', es: 'Espanhol', fra: 'Francês', fre: 'Francês', fr: 'Francês',
    ita: 'Italiano', it: 'Italiano', deu: 'Alemão', ger: 'Alemão', de: 'Alemão', jpn: 'Japonês', ja: 'Japonês',
    kor: 'Coreano', ko: 'Coreano', zho: 'Chinês', chi: 'Chinês', zh: 'Chinês', rus: 'Russo', ru: 'Russo',
    und: 'Desconhecido'
  };
  function rotuloFaixa(lang, nome, i, extra) {
    var l = String(lang || '').toLowerCase();
    var base = IDIOMAS[l] || (nome && String(nome)) || (l ? l.toUpperCase() : 'Faixa ' + (i + 1));
    return extra ? base + ' (' + extra + ')' : base;
  }

  // ── Motivo da falha, em português simples ───────────────────────────
  function mensagemDaFalha(erros) {
    var http = 0;
    var formato = false;
    var rede = false;
    var soTempo = erros.length > 0;
    var codec = false;
    erros.forEach(function (e) {
      if (e.tipo !== 'tempo') { soTempo = false; }
      if (e.http && !http) { http = e.http; }
      if (e.tipo === 'formato') { formato = true; }
      if (e.tipo === 'decodificacao') { codec = true; }
      if (e.tipo === 'rede') { rede = true; }
    });
    if (http === 401 || http === 403) { return 'O servidor recusou o acesso (erro ' + http + '). Confira se o plano está ativo.'; }
    if (http === 404) { return 'Este conteúdo não foi encontrado no servidor (erro 404).'; }
    if (http >= 500) { return 'O servidor está com problema (erro ' + http + '). Tente de novo em instantes.'; }
    if (http) { return 'O servidor respondeu com erro ' + http + '.'; }
    if (codec) { return 'A TV não conseguiu decodificar este vídeo ou o áudio dele (ex.: DTS).'; }
    if (soTempo) { return 'O servidor demorou demais para responder. Tente de novo.'; }
    if (rede) { return 'Sem resposta do servidor. Confira a internet da TV.'; }
    if (formato) { return 'Não foi possível reproduzir: formato não aceito pela TV ou conteúdo indisponível no servidor.'; }
    return 'Não foi possível reproduzir este vídeo.';
  }

  // Pergunta só o código de resposta do servidor (pede 1 byte e cancela). Se a TV/servidor não deixar, devolve 0.
  function sondar(url, pronto) {
    var feito = false;
    function fim(c) { if (!feito) { feito = true; pronto(c); } }
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = 4000;
      x.setRequestHeader('Range', 'bytes=0-0');
      x.onreadystatechange = function () {
        if (x.readyState >= 2) {
          var c = x.status || 0;
          fim(c);                                   // antes do abort (o abort também dispara este evento)
          tentar(function () { x.abort(); });
        }
      };
      x.onerror = function () { fim(0); };
      x.ontimeout = function () { fim(0); };
      x.send();
      setTimeout(function () { fim(0); }, 4500);
    } catch (e) { fim(0); }
  }

  // ───────────────────────────────────────────────────────────────────
  function Motor(video, cb) {
    this.video = video;
    this.cb = cb || {};
    this.modo = this.cb.modo === 'vod' ? 'vod' : 'live';
    this.plano = [];
    this.pos = -1;
    this.erros = [];
    this.descartadas = {};
    this.idTent = 0;
    this.atual = null;          // tentativa em andamento
    this.confirmada = false;    // a tentativa atual já mostrou imagem?
    this.nativoFalhou = {};     // por tipo, nesta abertura
    this.hls = null;
    this.mpegts = null;
    this.avp = null;
    this.avpPausado = false;
    this.avpTempoMs = 0;
    this.avpDuracaoMs = 0;
    this.legendaAvp = false;
    this.recuperacoes = 0;
    this.urls = [];
    this.retomarEm = 0;
    this.reconexoes = 0;
    this.timerEspera = null;
    this.timerVigia = null;
    this.timerReconectar = null;
    this.timerRect = null;
    this.ultimoTempo = -1;
    this.ultimoMovimento = 0;
    this.inicioEstavel = 0;
    this.rectAnterior = '';
    this.ativo = false;
    this.ligarVideo();
  }

  var P = Motor.prototype;

  P.ligarVideo = function () {
    var self = this;
    var v = this.video;
    function emitir(nome) { return function () { if (self.cb[nome] && self.atual && self.atual.estrategia !== 'avplay') { self.cb[nome](); } }; }
    v.addEventListener('playing', function () { if (self.ativo && self.atual && self.atual.estrategia !== 'avplay') { self.aoTocar(); } });
    v.addEventListener('waiting', emitir('aoEspera'));
    v.addEventListener('pause', emitir('aoPausa'));
    v.addEventListener('seeked', emitir('aoBuscou'));
    v.addEventListener('timeupdate', emitir('aoTempo'));
    v.addEventListener('loadedmetadata', function () { self.aoMetadados(); });
    v.addEventListener('durationchange', function () { self.aoMetadados(); });
    v.addEventListener('ended', function () {
      // Canal ao vivo nunca "termina": se a transmissão fechou, abre de novo.
      if (self.modo === 'live' && self.ativo && self.confirmada && self.atual && self.atual.estrategia !== 'avplay') { self.reconectar('erro'); return; }
      if (self.ativo && self.atual && self.atual.estrategia !== 'avplay' && self.cb.aoFim) { self.cb.aoFim(); }
    });
    v.addEventListener('error', function () {
      if (!self.ativo || !self.atual || self.atual.estrategia !== 'nativo') { return; }
      // Evento atrasado de uma tentativa que já foi trocada (src removido/mudado): ignora.
      var srcAtual = v.getAttribute('src') || '';
      if (!srcAtual || srcAtual !== self.atual.url) { return; }
      var cod = v.error ? v.error.code : 0;
      self.aoErro({ estrategia: 'nativo', tipo: cod === 3 ? 'decodificacao' : (cod === 2 ? 'rede' : 'formato'), codigo: cod });
    });
  };

  // ── Abrir / parar ──────────────────────────────────────────────────
  // urls: endereços possíveis do mesmo conteúdo, do mais provável ao menos. inicioSeg: onde começar (filmes).
  P.abrir = function (urls, inicioSeg, reabertura) {
    this.parar(true);
    if (!reabertura) { this.reabertas = 0; }
    this.ativo = true;
    this.urls = (urls || []).filter(function (u) { return !!u; });
    this.plano = montarPlano(this.urls, this.modo);
    this.pos = -1;
    this.erros = [];
    this.descartadas = {};
    this.nativoFalhou = {};
    this.reconexoes = 0;
    this.retomarEm = 0;
    this.proxima();
  };

  P.parar = function (mantemAtivo) {
    this.idTent++;
    if (!mantemAtivo) { this.ativo = false; }
    clearTimeout(this.timerEspera);
    clearTimeout(this.timerReconectar);
    clearInterval(this.timerVigia);
    this.timerVigia = null;
    this.limparEngine();
    this.atual = null;
    this.confirmada = false;
    this.avpPausado = false;
    this.avpTempoMs = 0;
    this.avpDuracaoMs = 0;
    this.camadaAvplay(false);
    var v = this.video;
    tentar(function () { v.pause(); v.removeAttribute('src'); v.load(); });
  };

  P.limparEngine = function () {
    var self = this;
    if (this.hls) {
      var h = this.hls;
      this.hls = null;
      tentar(function () { h.destroy(); });
    }
    if (this.mpegts) {
      var m = this.mpegts;
      this.mpegts = null;
      tentar(function () { m.pause(); });
      tentar(function () { m.unload(); });
      tentar(function () { m.detachMediaElement(); });
      tentar(function () { m.destroy(); });
    }
    if (this.avp) {
      var a = this.avp;
      this.avp = null;
      tentar(function () { a.stop(); });
      tentar(function () { a.close(); });
    }
    this.recuperacoes = 0;
    void self;
  };

  // ── Fila de tentativas ─────────────────────────────────────────────
  P.proxima = function () {
    if (!this.ativo) { return; }
    this.pos++;
    while (this.pos < this.plano.length && this.descartadas[this.plano[this.pos].url]) { this.pos++; }

    if (this.pos >= this.plano.length) { this.falhar(); return; }

    var t = this.plano[this.pos];
    // Se todas as tentativas "nativas" só ficaram sem resposta (servidor parado), as outras também ficariam.
    if (t.estrategia !== 'nativo' && this.erros.length > 0) {
      var todasTempo = this.erros.every(function (e) { return e.tipo === 'tempo'; });
      if (todasTempo) { this.falhar(); return; }
    }
    this.iniciar(t);
  };

  P.falhar = function () {
    this.ativo = false;
    var self = this;
    this.limparEngine();
    this.camadaAvplay(false);
    tentar(function () { self.video.pause(); self.video.removeAttribute('src'); self.video.load(); });

    // Canal ao vivo que não abriu (fonte do provedor caiu por um instante): tenta abrir de novo, até 3 vezes, 4 s entre elas.
    // Erro de acesso do servidor (401, 403, 404...) não melhora tentando de novo: esse mostra o motivo na hora.
    var acesso = this.erros.some(function (e) { return e.http && e.http >= 400 && e.http < 500; });
    if (this.modo === 'live' && !acesso && (this.reabertas || 0) < 3 && this.urls.length) {
      var urlsNovas = this.urls;
      this.reabertas = (this.reabertas || 0) + 1;
      var meuId = ++this.idTent;
      if (this.cb.aoReconectando) { this.cb.aoReconectando('Reconectando... (' + this.reabertas + ')'); }
      clearTimeout(this.timerReconectar);
      this.timerReconectar = setTimeout(function () {
        if (self.idTent !== meuId || self.ativo) { return; }   // o usuário já abriu outra coisa
        self.abrir(urlsNovas, 0, true);
      }, 4000);
      return;
    }

    function avisar() {
      var msg = mensagemDaFalha(self.erros);
      if (diagnostico() && self.erros.length) {
        var rastro = self.erros.map(function (e) {
          return (e.estrategia || '?') + ':' + (e.http ? 'HTTP ' + e.http : (e.tipo || '?'));
        }).join(' | ');
        msg += ' [' + rastro + ']';
      }
      if (self.cb.aoFalha) { self.cb.aoFalha(msg); }
    }
    // A tag <video> não diz o código HTTP. Se nenhum caminho soube o motivo, pergunta ao servidor
    // (conteúdo bloqueado, plano vencido e arquivo inexistente ficam bem diferentes para o cliente).
    var sabeMotivo = this.erros.some(function (e) { return !!e.http; });
    if (sabeMotivo || this.erros.length === 0 || !this.urls.length || !diagnostico()) { avisar(); return; }
    var meu = this.idTent;
    sondar(this.urls[0], function (codigo) {
      if (meu !== self.idTent || self.ativo) { return; }   // o usuário já abriu outra coisa
      if (codigo >= 400) { self.erros.push({ estrategia: 'sonda', tipo: 'rede', http: codigo }); }
      avisar();
    });
  };

  P.iniciar = function (t) {
    var self = this;
    var meu = ++this.idTent;
    this.atual = t;
    this.confirmada = false;
    clearTimeout(this.timerEspera);
    this.limparEngine();
    this.camadaAvplay(false);

    var espera = t.estrategia === 'avplay' ? ESPERA_MS.avplay : (avancado() ? ESPERA_MS[this.modo] : ESPERA_SIMPLES_MS[this.modo]);
    function armarEspera(ms, jaProrrogou) {
      self.timerEspera = setTimeout(function () {
        if (meu !== self.idTent) { return; }
        // A TV já recebeu dados (servidor lento, mas respondendo): dá mais um tempo antes de trocar de formato.
        if (!jaProrrogou && self.recebendoDados(t)) { armarEspera(ESPERA_EXTRA_MS, true); return; }
        self.aoErro({ estrategia: t.estrategia, tipo: 'tempo' });
      }, ms);
    }
    armarEspera(espera, false);

    var v = this.video;
    if (t.estrategia === 'nativo') {
      v.src = t.url;
      var p = tentar(function () { return v.play(); });
      if (p && p.catch) { p.catch(function () { /* o erro chega pelo evento 'error' */ }); }
    } else if (t.estrategia === 'hls') {
      this.iniciarHls(t, meu);
    } else if (t.estrategia === 'mpegts') {
      this.iniciarMpegts(t, meu);
    } else if (t.estrategia === 'avplay') {
      this.iniciarAvplay(t, meu);
    }
  };

  // true se a tag <video> já recebeu pelo menos os metadados/dados desta tentativa.
  P.recebendoDados = function (t) {
    if (t.estrategia === 'avplay') { return false; }
    var v = this.video;
    return tentar(function () { return v.readyState >= 1 || (v.buffered && v.buffered.length > 0); }, false);
  };

  // Falha da tentativa atual: anota o motivo e segue para a próxima (ou reconecta, se já estava tocando).
  P.aoErro = function (erro) {
    if (!this.ativo || !this.atual) { return; }
    var t = this.atual;
    erro.estrategia = erro.estrategia || t.estrategia;
    if (this.confirmada) { this.reconectar('erro'); return; }

    clearTimeout(this.timerEspera);
    this.erros.push(erro);
    if (t.estrategia === 'nativo' && (erro.tipo === 'formato' || erro.tipo === 'decodificacao')) {
      var ch = t.tipo === 'sem-ext' ? 'ts' : t.tipo;
      this.nativoFalhou[ch] = true;
    }
    // O servidor respondeu com erro de verdade: não adianta tentar este endereço por outro caminho.
    if (erro.http && erro.http >= 400) { this.descartadas[t.url] = true; }
    this.idTent++;
    this.limparEngine();
    // Fecha a conexão da tentativa que desistiu. Sem isso a tag <video> continua pedindo o canal em segundo plano
    // e muitos servidores IPTV (limite de 1 conexão por usuário) atrasam ou recusam a próxima tentativa.
    if (t.estrategia === 'nativo') {
      var vv = this.video;
      tentar(function () { vv.pause(); vv.removeAttribute('src'); vv.load(); });
    }
    this.proxima();
  };

  // A imagem apareceu: esta tentativa venceu.
  P.aoTocar = function () {
    if (!this.ativo || !this.atual) { return; }
    if (!this.confirmada) {
      this.confirmada = true;
      clearTimeout(this.timerEspera);
      this.registrarVitoria();
      this.iniciarVigia();
      if (this.retomarEm > 0) { this.aplicarRetomada(); }
    }
    this.inicioEstavel = this.inicioEstavel || agora();
    if (this.cb.aoPlaying) { this.cb.aoPlaying(); }
  };

  P.registrarVitoria = function () {
    var t = this.atual;
    if (!t) { return; }
    var ch = t.tipo === 'sem-ext' ? 'ts' : t.tipo;
    if (t.estrategia === 'nativo') {
      if (memoria.semNativo[ch]) { memoria.semNativo[ch] = 0; gravarMemoria(); }
    } else if (this.nativoFalhou[ch]) {
      memoria.semNativo[ch] = (memoria.semNativo[ch] || 0) + 1;
      gravarMemoria();
    }
    this.estrategiaVencedora = t.estrategia;
    // Guarda o que funcionou (por modo: canal ao vivo / filme) para tentar primeiro na próxima vez.
    if (!memoria.venceu) { memoria.venceu = {}; }
    memoria.venceu[this.modo] = { estrategia: t.estrategia, tipo: t.tipo };
    gravarMemoria();
  };

  P.estrategia = function () { return this.atual ? this.atual.estrategia : ''; };

  P.aoMetadados = function () {
    if (this.cb.aoMetadados && this.atual && this.atual.estrategia !== 'avplay') { this.cb.aoMetadados(); }
    if (this.retomarEm > 0 && this.confirmada) { this.aplicarRetomada(); }
  };

  // ── Reconexão (canal ou filme que travou / caiu) ────────────────────
  P.iniciarVigia = function () {
    var self = this;
    clearInterval(this.timerVigia);
    // Canal ao vivo sempre reconecta sozinho quando a imagem para (mesmo com o motor simples). Filmes só no motor avançado.
    if (!avancado() && this.modo !== 'live') { return; }
    this.ultimoTempo = -1;
    this.ultimoMovimento = agora();
    this.timerVigia = setInterval(function () { self.vigiar(); }, 1000);
  };

  P.vigiar = function () {
    if (!this.ativo || !this.confirmada) { return; }
    var t = this.tempo();
    var n = agora();
    if (this.pausado() || this.terminou()) { this.ultimoMovimento = n; this.ultimoTempo = t; return; }
    if (Math.abs(t - this.ultimoTempo) > 0.05) {
      this.ultimoTempo = t;
      this.ultimoMovimento = n;
      if (this.reconexoes > 0 && this.inicioEstavel && n - this.inicioEstavel > ESTAVEL_MS) { this.reconexoes = 0; }
      return;
    }
    if (n - this.ultimoMovimento > TRAVOU_MS[this.modo]) { this.reconectar('travou'); }
  };

  P.reconectar = function (motivo) {
    var self = this;
    if (!this.ativo || !this.atual) { return; }
    if (this.reconexoes >= MAX_RECONEXOES[this.modo]) {
      this.erros.push({ estrategia: this.atual.estrategia, tipo: motivo === 'erro' ? 'rede' : 'tempo' });
      this.falhar();
      return;
    }
    this.reconexoes++;
    var t = this.atual;
    var pos = this.modo === 'vod' ? this.tempo() : 0;
    this.retomarEm = pos > 3 ? pos : 0;
    this.confirmada = false;
    this.inicioEstavel = 0;
    clearInterval(this.timerVigia);
    this.timerVigia = null;
    this.idTent++;
    clearTimeout(this.timerEspera);
    this.limparEngine();
    if (this.cb.aoReconectando) { this.cb.aoReconectando('Reconectando... (' + this.reconexoes + ')'); }
    var espera = Math.min(1000 * this.reconexoes, 4000);
    clearTimeout(this.timerReconectar);
    this.timerReconectar = setTimeout(function () {
      if (!self.ativo) { return; }
      self.iniciar(t);
    }, espera);
  };

  P.aplicarRetomada = function () {
    var alvo = this.retomarEm;
    var d = this.duracao();
    if (alvo <= 0 || !isFinite(d) || d <= 0) { return; }
    this.retomarEm = 0;
    if (d > alvo + 5) { this.buscar(alvo); }
  };

  // ── hls.js ─────────────────────────────────────────────────────────
  P.iniciarHls = function (t, meu) {
    var self = this;
    hlsPronto(function (ok) {
      if (meu !== self.idTent) { return; }
      if (!ok) { self.aoErro({ estrategia: 'hls', tipo: 'formato', motivo: 'biblioteca' }); return; }
      var Hls = window.Hls;
      var h;
      try {
        h = new Hls({
          enableWorker: false,            // worker em blob falha em app local de TV
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 12,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 3
        });
      } catch (e) { self.aoErro({ estrategia: 'hls', tipo: 'formato' }); return; }
      self.hls = h;
      h.on(Hls.Events.MEDIA_ATTACHED, function () { h.loadSource(t.url); });
      h.on(Hls.Events.MANIFEST_PARSED, function () {
        if (meu !== self.idTent) { return; }
        var p = tentar(function () { return self.video.play(); });
        if (p && p.catch) { p.catch(function () { /* ignora */ }); }
        if (self.cb.aoFaixas) { self.cb.aoFaixas(); }
      });
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, function () { if (self.cb.aoFaixas) { self.cb.aoFaixas(); } });
      h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, function () { if (self.cb.aoFaixas) { self.cb.aoFaixas(); } });
      h.on(Hls.Events.ERROR, function (ev, dados) {
        if (meu !== self.idTent || !dados || !dados.fatal) { return; }
        if (dados.type === Hls.ErrorTypes.MEDIA_ERROR && self.recuperacoes < 2) {
          self.recuperacoes++;
          tentar(function () { h.recoverMediaError(); });
          return;
        }
        var codigo = dados.response && dados.response.code ? dados.response.code : 0;
        var tipo = dados.type === Hls.ErrorTypes.MEDIA_ERROR ? 'decodificacao' : 'rede';
        if (dados.details === 'manifestParsingError' || dados.details === 'manifestIncompatibleCodecsError') { tipo = 'formato'; }
        self.aoErro({ estrategia: 'hls', tipo: tipo, http: codigo, detalhe: dados.details });
      });
      h.attachMedia(self.video);
    });
  };

  // ── mpegts.js ──────────────────────────────────────────────────────
  P.iniciarMpegts = function (t, meu) {
    var self = this;
    mpegtsPronto(function (ok) {
      if (meu !== self.idTent) { return; }
      if (!ok) { self.aoErro({ estrategia: 'mpegts', tipo: 'formato', motivo: 'biblioteca' }); return; }
      var M = window.mpegts;
      var p;
      try {
        p = M.createPlayer(
          { type: 'mpegts', isLive: self.modo === 'live', url: t.url, cors: true },
          {
            enableWorker: false,
            lazyLoad: false,
            liveBufferLatencyChasing: self.modo === 'live',
            liveBufferLatencyMaxLatency: 12,
            liveBufferLatencyMinRemain: 3,
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 30,
            autoCleanupMinBackwardDuration: 15
          }
        );
      } catch (e) { self.aoErro({ estrategia: 'mpegts', tipo: 'formato' }); return; }
      self.mpegts = p;
      p.on(M.Events.ERROR, function (tipoErro, detalhe, info) {
        if (meu !== self.idTent) { return; }
        var codigo = info && info.code ? info.code : 0;
        var tipo = 'rede';
        if (tipoErro === M.ErrorTypes.MEDIA_ERROR) {
          tipo = /Codec|Format/i.test(String(detalhe)) ? 'formato' : 'decodificacao';
        } else if (/Http|Network|Eof|Timeout/i.test(String(detalhe)) === false && tipoErro !== M.ErrorTypes.NETWORK_ERROR) {
          tipo = 'formato';
        }
        self.aoErro({ estrategia: 'mpegts', tipo: tipo, http: codigo >= 400 ? codigo : 0, detalhe: detalhe });
      });
      tentar(function () { p.attachMediaElement(self.video); });
      tentar(function () { p.load(); });
      var pr = tentar(function () { return p.play(); });
      if (pr && pr.catch) { pr.catch(function () { /* ignora */ }); }
    });
  };

  // ── AVPlay (Samsung) ───────────────────────────────────────────────
  var elementoAvplay = null;
  function garantirObjetoAvplay() {
    if (elementoAvplay) { return; }
    // A Samsung manda criar este elemento para o player nativo aparecer na página.
    elementoAvplay = document.createElement('object');
    elementoAvplay.type = 'application/avplayer';
    elementoAvplay.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;z-index:0;pointer-events:none;';
    document.body.insertBefore(elementoAvplay, document.body.firstChild);
  }

  // O vídeo do AVPlay aparece ATRÁS da página; por isso o fundo da página fica transparente enquanto ele toca.
  P.camadaAvplay = function (ligada) {
    var raiz = document.documentElement;
    if (ligada) { raiz.classList.add('avplay-ativo'); } else { raiz.classList.remove('avplay-ativo'); }
    this.video.style.visibility = ligada ? 'hidden' : '';
    clearInterval(this.timerRect);
    this.timerRect = null;
    this.rectAnterior = '';
    if (ligada) {
      var self = this;
      this.timerRect = setInterval(function () { self.reposicionar(); }, 400);
    }
  };

  P.reposicionar = function () {
    var a = this.avp;
    if (!a) { return; }
    var r = this.video.getBoundingClientRect();
    var larg = document.documentElement.clientWidth || 1920;
    var f = 1920 / larg;
    var x = Math.round(r.left * f);
    var y = Math.round(r.top * f);
    var w = Math.round(r.width * f);
    var h = Math.round(r.height * f);
    var chave = x + ',' + y + ',' + w + ',' + h;
    if (chave === this.rectAnterior || w <= 0 || h <= 0) { return; }
    this.rectAnterior = chave;
    tentar(function () { a.setDisplayRect(x, y, w, h); });
  };

  P.iniciarAvplay = function (t, meu) {
    var self = this;
    var A = avplayApi();
    if (!A) { this.aoErro({ estrategia: 'avplay', tipo: 'formato' }); return; }
    garantirObjetoAvplay();
    var v = this.video;
    // Libera o decodificador da tag <video> antes de o AVPlay assumir.
    tentar(function () { v.pause(); v.removeAttribute('src'); v.load(); });
    tentar(function () { A.stop(); });
    tentar(function () { A.close(); });

    try {
      A.open(t.url);
    } catch (e) { this.aoErro({ estrategia: 'avplay', tipo: 'formato' }); return; }
    this.avp = A;
    this.avpPausado = false;
    this.avpTempoMs = 0;
    this.avpDuracaoMs = 0;
    this.legendaAvp = false;

    function classificar(nome) {
      var n = String(nome || '');
      if (/NOT_SUPPORTED|INVALID_STATE_VIDEO|CODEC/i.test(n)) { return /CODEC/i.test(n) ? 'decodificacao' : 'formato'; }
      if (/CONNECTION|NETWORK|TIMEOUT|AUTHORIZATION|URI/i.test(n)) { return 'rede'; }
      return 'formato';
    }

    tentar(function () {
      A.setListener({
        onbufferingstart: function () { if (meu === self.idTent && self.cb.aoEspera) { self.cb.aoEspera(); } },
        onbufferingprogress: function () { /* sem uso */ },
        onbufferingcomplete: function () {
          if (meu !== self.idTent) { return; }
          if (self.confirmada && self.cb.aoPlaying) { self.cb.aoPlaying(); }
        },
        oncurrentplaytime: function (ms) {
          if (meu !== self.idTent) { return; }
          self.avpTempoMs = ms;
          if (self.cb.aoTempo) { self.cb.aoTempo(); }
        },
        onstreamcompleted: function () {
          if (meu !== self.idTent) { return; }
          if (self.cb.aoFim) { self.cb.aoFim(); }
        },
        onerror: function (tipo) {
          if (meu !== self.idTent) { return; }
          self.aoErro({ estrategia: 'avplay', tipo: classificar(tipo), detalhe: tipo });
        },
        onevent: function () { /* sem uso */ },
        onsubtitlechange: function (duracao, texto) {
          if (meu !== self.idTent) { return; }
          if (self.cb.aoLegenda) { self.cb.aoLegenda(self.legendaAvp ? String(texto || '') : '', duracao); }
        },
        ondrmevent: function () { /* sem uso */ }
      });
    });

    this.camadaAvplay(true);
    this.reposicionar();
    tentar(function () { A.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); });
    tentar(function () { A.setSilentSubtitle(true); });
    if (this.modo === 'live') {
      tentar(function () { A.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 3); });
    }

    try {
      A.prepareAsync(function () {
        if (meu !== self.idTent) { return; }
        self.avpDuracaoMs = tentar(function () { return A.getDuration(); }, 0) || 0;
        tentar(function () { A.play(); });
        self.avpPausado = false;
        self.aoTocar();
        if (self.cb.aoMetadados) { self.cb.aoMetadados(); }
        if (self.cb.aoFaixas) { self.cb.aoFaixas(); }
      }, function (erro) {
        if (meu !== self.idTent) { return; }
        self.aoErro({ estrategia: 'avplay', tipo: classificar(erro && erro.name ? erro.name : erro), detalhe: erro });
      });
    } catch (e) { this.aoErro({ estrategia: 'avplay', tipo: 'formato' }); }
  };

  // ── Controles (iguais para qualquer caminho) ───────────────────────
  P.emAvplay = function () { return !!this.avp && !!this.atual && this.atual.estrategia === 'avplay'; };

  P.tempo = function () {
    if (this.emAvplay()) { return this.avpTempoMs / 1000; }
    return this.video.currentTime || 0;
  };

  P.duracao = function () {
    if (this.emAvplay()) { return this.avpDuracaoMs > 0 ? this.avpDuracaoMs / 1000 : NaN; }
    return this.video.duration;
  };

  P.pausado = function () {
    if (this.emAvplay()) { return this.avpPausado; }
    return this.video.paused;
  };

  P.terminou = function () {
    if (this.emAvplay()) { return false; }
    return this.video.ended;
  };

  P.play = function () {
    if (this.emAvplay()) {
      var a = this.avp;
      tentar(function () { a.play(); });
      this.avpPausado = false;
      if (this.cb.aoPlaying) { this.cb.aoPlaying(); }
      return;
    }
    var p = tentar(function () { return this.video.play(); }.bind(this));
    if (p && p.catch) { p.catch(function () { /* ignora */ }); }
  };

  P.pause = function () {
    if (this.emAvplay()) {
      var a = this.avp;
      tentar(function () { a.pause(); });
      this.avpPausado = true;
      if (this.cb.aoPausa) { this.cb.aoPausa(); }
      return;
    }
    this.video.pause();
  };

  // Devolve false se a TV não conseguiu pular.
  P.buscar = function (segundos) {
    if (this.emAvplay()) {
      var a = this.avp;
      var self = this;
      var ok = true;
      try {
        a.seekTo(Math.floor(segundos * 1000), function () {
          self.avpTempoMs = Math.floor(segundos * 1000);
          if (self.cb.aoBuscou) { self.cb.aoBuscou(); }
        }, function () { /* ignora */ });
      } catch (e) { ok = false; }
      return ok;
    }
    try { this.video.currentTime = segundos; return true; } catch (e) { return false; }
  };

  // ── Áudio e legenda ────────────────────────────────────────────────
  // Devolve { audio: [{id, rotulo, ativa}], legenda: [{id, rotulo, ativa}], legendaAtiva: bool }.
  P.faixas = function () {
    var r = { audio: [], legenda: [], legendaAtiva: false };
    var self = this;
    var v = this.video;

    if (this.emAvplay()) {
      var a = this.avp;
      var total = tentar(function () { return a.getTotalTrackInfo(); }, []) || [];
      var atuais = tentar(function () { return a.getCurrentStreamInfo(); }, []) || [];
      var ativas = {};
      atuais.forEach(function (x) { ativas[x.type + ':' + x.index] = true; });
      var nA = 0;
      var nT = 0;
      total.forEach(function (x) {
        var extra = tentar(function () { return JSON.parse(x.extra_info || '{}'); }, {}) || {};
        if (x.type === 'AUDIO') {
          var canais = extra.channels ? (extra.channels > 2 ? (extra.channels - 1) + '.1' : (extra.channels === 1 ? 'mono' : 'estéreo')) : '';
          r.audio.push({ id: String(x.index), rotulo: rotuloFaixa(extra.language, '', nA, canais), ativa: !!ativas['AUDIO:' + x.index] });
          nA++;
        } else if (x.type === 'TEXT') {
          r.legenda.push({ id: String(x.index), rotulo: rotuloFaixa(extra.language, '', nT, ''), ativa: self.legendaAvp && !!ativas['TEXT:' + x.index] });
          nT++;
        }
      });
      r.legendaAtiva = this.legendaAvp;
      return r;
    }

    if (this.hls) {
      var h = this.hls;
      (h.audioTracks || []).forEach(function (x, i) {
        r.audio.push({ id: String(i), rotulo: rotuloFaixa(x.lang, x.name, i, ''), ativa: h.audioTrack === i });
      });
      (h.subtitleTracks || []).forEach(function (x, i) {
        var on = h.subtitleTrack === i;
        r.legenda.push({ id: String(i), rotulo: rotuloFaixa(x.lang, x.name, i, ''), ativa: on });
        if (on) { r.legendaAtiva = true; }
      });
      return r;
    }

    // Tag <video> nativa: só aparece se a TV expõe as faixas.
    var at = v.audioTracks;
    if (at && at.length > 1) {
      for (var i = 0; i < at.length; i++) {
        r.audio.push({ id: String(i), rotulo: rotuloFaixa(at[i].language, at[i].label, i, ''), ativa: !!at[i].enabled });
      }
    }
    var tt = v.textTracks;
    if (tt && tt.length) {
      var n = 0;
      for (var j = 0; j < tt.length; j++) {
        if (tt[j].kind !== 'subtitles' && tt[j].kind !== 'captions') { continue; }
        var lig = tt[j].mode === 'showing';
        r.legenda.push({ id: String(j), rotulo: rotuloFaixa(tt[j].language, tt[j].label, n, ''), ativa: lig });
        if (lig) { r.legendaAtiva = true; }
        n++;
      }
    }
    return r;
  };

  P.escolherAudio = function (id) {
    var i = parseInt(id, 10);
    if (this.emAvplay()) {
      var a = this.avp;
      tentar(function () { a.setSelectTrack('AUDIO', i); });
    } else if (this.hls) {
      this.hls.audioTrack = i;
    } else {
      var at = this.video.audioTracks;
      if (at) { for (var k = 0; k < at.length; k++) { at[k].enabled = (k === i); } }
    }
  };

  // id = null desliga a legenda.
  P.escolherLegenda = function (id) {
    var i = id === null || id === undefined ? -1 : parseInt(id, 10);
    if (this.emAvplay()) {
      var a = this.avp;
      if (i < 0) {
        this.legendaAvp = false;
        if (this.cb.aoLegenda) { this.cb.aoLegenda('', 0); }
      } else {
        tentar(function () { a.setSelectTrack('TEXT', i); });
        this.legendaAvp = true;
      }
    } else if (this.hls) {
      this.hls.subtitleTrack = i;
      this.hls.subtitleDisplay = i >= 0;
    } else {
      var tt = this.video.textTracks;
      if (tt) { for (var k = 0; k < tt.length; k++) { tt[k].mode = (k === i) ? 'showing' : 'disabled'; } }
    }
  };

  window.VLTV = window.VLTV || {};
  VLTV.motor = {
    // opcoes: { modo, aoPlaying, aoEspera, aoPausa, aoTempo, aoMetadados, aoBuscou, aoFim, aoFalha(msg),
    //           aoReconectando(msg), aoLegenda(texto), aoFaixas }
    criar: function (video, opcoes) { return new Motor(video, opcoes); },
    mensagemDaFalha: mensagemDaFalha,
    tipoDaUrl: tipoDaUrl
  };
})();
