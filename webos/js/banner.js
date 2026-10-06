// VLTV Play - webOS | Banner da tela inicial (destaques do dia).
// Mesma fonte do app Android: o backend da VPS (/home = Top 10, /catalog/inicial = títulos prontos).
// Se a VPS não responder, usa os primeiros títulos das categorias do próprio painel.
// A imagem é sempre a CAPA que vem do servidor (nítida, ao lado, e desfocada no fundo): não troca por
// imagem do TMDB, então não pisca.
// O último banner fica guardado na TV: da segunda vez em diante ele aparece na hora, junto com os botões.
(function () {
  'use strict';

  var MAX_SLIDES = 8;
  var TROCA_MS = 8000;
  var TIMEOUT_VPS_MS = 4000;
  var CATEGORIAS_FALLBACK = 3;
  var ESPERA_TMDB_MS = 4000;
  var ESPERA_PRE_RESOLVER_MS = 6000;   // depois que o banner aparece, confere em segundo plano os títulos no seu painel
  var CHAVE_CACHE = 'vltv_banner_cache2';   // 2: o guardado antigo tinha ids da VPS (abria outra série)

  function $(id) { return document.getElementById(id); }

  var elBanner = $('banner');
  var elFundo = $('bn-fundo');
  var elLogo = $('bn-logo');
  var elTitulo = $('bn-titulo');
  var elMeta = $('bn-meta');
  var elPoster = $('bn-poster');
  var elPontos = $('bn-pontos');
  var elConteudo = $('bn-conteudo');
  var elBotaoTxt = $('bn-botao-txt');

  var slides = [];          // { tipo: 'filmes'|'series', raw, nome, capa, etiqueta, nota, ano }
  var atual = 0;
  var timer = null;
  var chaveCarregada = '';
  var pendente = null;      // lista nova (da rede) que entra na próxima troca de slide
  var idCarga = 0;
  var abrirItem = null;     // função: (tipo, raw, lista) -> abre os detalhes
  var onMudou = null;       // avisa o app quando o banner passa a existir ou deixa de existir
  var abrindo = false;      // procurando o título no painel depois do OK
  var timerAviso = null;

  function dnsAtual() {
    var s = VLTV.sessao.ler();
    return s ? s.dns : '';
  }

  function pegarVps(caminho) {
    var base = VLTV.config.VPS_URL;
    if (!base) { return Promise.resolve(null); }
    return VLTV.http.fetchComTimeout(base + caminho, TIMEOUT_VPS_MS)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function arr(v) { return Array.isArray(v) ? v : []; }

  // ── Montagem da lista de destaques ────────────────────────────────
  function idFilme(raw) { return raw.stream_id; }
  function idSerie(raw) { return raw.series_id; }

  function slideDe(tipo, raw, etiqueta) {
    var capa = (tipo === 'series' ? raw.cover : raw.stream_icon) || '';
    if (!capa || !raw.name) { return null; }
    var busca = VLTV.titulo.paraBusca(raw.name);
    var nota = parseFloat(raw.rating);
    return {
      tipo: tipo,
      raw: raw,
      nome: VLTV.titulo.limpar(raw.name),
      capa: capa,
      logo: null,
      fundo: null,
      daVps: false,         // true = veio da VPS: o código (id) pode não ser o do seu painel
      resolvido: false,     // true = já trocado pelo item do seu painel (com o id certo)
      indisponivel: false,  // true = o seu painel não tem este título
      nota: isFinite(nota) && nota > 0 ? nota.toFixed(1) : '',
      ano: busca.ano || ''
    };
  }

  function porVps() {
    var dns = dnsAtual();
    if (!dns) { return Promise.resolve([]); }
    var q = '?domain=' + encodeURIComponent(dns);
    return Promise.all([pegarVps('/home' + q), pegarVps('/catalog/inicial' + q)]).then(function (r) {
      var home = r[0];
      var pacote = r[1];
      if (!home || !pacote || !home.top10) { return []; }

      var filmes = {};
      var series = {};
      arr(pacote.vod_streams).forEach(function (v) { filmes[idFilme(v)] = v; });
      arr(pacote.series_streams).forEach(function (s) { series[idSerie(s)] = s; });

      function ordenar(lista) {
        return arr(lista).slice().sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
      }
      var topF = ordenar(home.top10.filmes);
      var topS = ordenar(home.top10.series);

      var saida = [];
      var n = Math.max(topF.length, topS.length);
      for (var i = 0; i < n && saida.length < MAX_SLIDES; i++) {
        if (topF[i] && filmes[topF[i].stream_id]) {
          saida.push(slideDe('filmes', filmes[topF[i].stream_id], 'TOP 10 FILMES  •  #' + topF[i].rank));
        }
        if (topS[i] && series[topS[i].series_id] && saida.length < MAX_SLIDES) {
          saida.push(slideDe('series', series[topS[i].series_id], 'TOP 10 SÉRIES  •  #' + topS[i].rank));
        }
      }
      return saida.filter(function (s) { return s !== null; }).map(function (s) { s.daVps = true; return s; });
    });
  }

  // Banner e pesquisa nunca mostram conteúdo adulto (mesma regra do controle parental).
  function adulta(nome) {
    return VLTV.parental.ehCategoriaAdulta(nome) || VLTV.parental.ehNomeAdulto(nome);
  }

  // Sem VPS: primeiros títulos com capa das primeiras categorias de filmes e de séries.
  function porPainel() {
    function daCategoria(listaCats, buscar, tipo, etiqueta) {
      var cats = arr(listaCats).filter(function (c) { return !adulta(c.category_name); }).slice(0, CATEGORIAS_FALLBACK);
      return Promise.all(cats.map(function (c) {
        return buscar(c.category_id).then(arr).catch(function () { return []; });
      })).then(function (listas) {
        var itens = [];
        listas.forEach(function (l) {
          l.filter(function (x) { return !adulta(x.name); }).slice(0, 3).forEach(function (x) {
            var s = slideDe(tipo, x, etiqueta);
            if (s) { itens.push(s); }
          });
        });
        return itens;
      });
    }
    return Promise.all([
      VLTV.api.categoriasFilmes().catch(function () { return []; }),
      VLTV.api.categoriasSeries().catch(function () { return []; })
    ]).then(function (c) {
      return Promise.all([
        daCategoria(c[0], VLTV.api.filmesPorCategoria, 'filmes', 'FILME EM DESTAQUE'),
        daCategoria(c[1], VLTV.api.seriesPorCategoria, 'series', 'SÉRIE EM DESTAQUE')
      ]);
    }).then(function (r) {
      var saida = [];
      var n = Math.max(r[0].length, r[1].length);
      for (var i = 0; i < n && saida.length < MAX_SLIDES; i++) {
        if (r[0][i]) { saida.push(r[0][i]); }
        if (r[1][i] && saida.length < MAX_SLIDES) { saida.push(r[1][i]); }
      }
      return saida;
    });
  }

  // ── Logo e fundo do TMDB ──────────────────────────────────────────
  function carregarImagem(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      var img = new Image();
      img.onload = function () { resolve(url); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  // Preenche slide.logo e slide.fundo (só com imagens que carregaram de verdade). Nunca rejeita.
  function preparar(s) {
    var idBruto = s.tipo === 'series' ? s.raw.series_id : s.raw.stream_id;
    // Id da VPS não é o do painel: usa uma chave própria para não misturar logos de títulos diferentes.
    var id = (s.daVps && !s.resolvido) ? 'vps' + idBruto : idBruto;
    var logo = VLTV.tmdb.logo(s.tipo, id, s.raw.name).then(carregarImagem).then(function (u) { s.logo = u; });
    var fundo = VLTV.tmdb.fundo(s.tipo, id, s.raw.name).then(carregarImagem).then(function (u) { s.fundo = u; });
    return Promise.all([logo, fundo]).catch(function () { return null; });
  }

  // ── Tela ──────────────────────────────────────────────────────────
  function desenharPontos() {
    while (elPontos.firstChild) { elPontos.removeChild(elPontos.firstChild); }
    slides.forEach(function (sl, i) {
      if (sl.indisponivel) { return; }
      var p = document.createElement('span');
      p.className = 'bn-ponto' + (i === atual ? ' sel' : '');
      elPontos.appendChild(p);
    });
  }

  // Desenha um destaque: fundo (TMDB nítido ou capa desfocada), logo (ou nome) e dados.
  // Qualquer erro aqui nunca deixa o banner pela metade: mantém o que já estava na tela.
  function desenhar(s) {
    try { desenharSlide(s); } catch (e) { /* ignora */ }
  }

  function desenharSlide(s) {
    elBanner.classList.toggle('com-fundo', !!s.fundo);
    elFundo.classList.toggle('desfocado', !s.fundo);
    elFundo.style.backgroundImage = 'url("' + (s.fundo || s.capa).replace(/"/g, '%22') + '")';
    elPoster.onerror = function () { elPoster.style.visibility = 'hidden'; };
    elPoster.style.visibility = 'visible';
    elPoster.src = s.capa;

    elTitulo.textContent = s.nome;
    elLogo.onload = null;
    elLogo.onerror = function () { elLogo.classList.add('escondida'); elTitulo.classList.remove('escondida'); };
    if (s.logo) {
      elLogo.classList.remove('escondida');
      elTitulo.classList.add('escondida');
      elLogo.src = s.logo;
    } else {
      elLogo.classList.add('escondida');
      elLogo.removeAttribute('src');
      elTitulo.classList.remove('escondida');
    }

    var meta = [];
    if (s.nota) { meta.push('★ ' + s.nota); }
    if (s.ano) { meta.push(s.ano); }
    meta.push(s.tipo === 'series' ? 'Série' : 'Filme');
    elMeta.textContent = meta.join('   •   ');
    desenharPontos();
  }

  function mostrarSlide(i, passo) {
    if (slides.length === 0) { return; }
    atual = (i + slides.length) % slides.length;
    // Pula os títulos que o seu painel não tem (se todos faltarem, mostra mesmo assim).
    var passoReal = passo || 1;
    for (var t = 0; t < slides.length && slides[atual].indisponivel; t++) {
      atual = (atual + passoReal + slides.length) % slides.length;
    }
    var s = slides[atual];

    elConteudo.classList.add('troca');
    setTimeout(function () {
      if (slides[atual] !== s) { return; }
      desenhar(s);
      elConteudo.classList.remove('troca');
    }, 180);
  }

  function reiniciarTimer() {
    clearInterval(timer);
    timer = null;
    if (slides.length > 1) {
      timer = setInterval(function () {
        if (pendente) {
          slides = pendente;
          pendente = null;
          atual = -1;
          var meuId = idCarga;
          setTimeout(function () { if (meuId === idCarga) { preResolver(meuId); } }, 1500);
        }
        mostrarSlide(atual + 1, 1);
      }, TROCA_MS);
    }
  }

  function mover(passo) {
    if (slides.length < 2) { return; }
    mostrarSlide(atual + passo, passo);
    reiniciarTimer();
  }

  // ── Achar o título no SEU painel ──────────────────────────────────
  // Os destaques vêm da VPS e o id deles pode ser de outro painel: abrir direto mostrava OUTRA série.
  // Aqui o título é procurado pelo nome no painel da conta e o item do painel (com o id certo) é que abre.
  // Resolve com { ok: true|false, lista } (ok false = este painel não tem o título).
  function resolverSlide(s) {
    if (!s.daVps || s.resolvido || VLTV.m3u.ativo()) { return Promise.resolve({ ok: true, lista: null }); }
    return VLTV.indice.achar(s.tipo, s.raw.name).then(function (r) {
      if (!r) { s.indisponivel = true; return { ok: false, lista: null }; }
      s.raw = r.raw;
      s.resolvido = true;
      s.indisponivel = false;
      return { ok: true, lista: r.lista };
    }, function () {
      return { ok: true, lista: null };     // não deu para conferir (rede): abre como veio
    });
  }

  function avisar(texto) {
    clearTimeout(timerAviso);
    var original = meta0;
    elMeta.textContent = texto;
    timerAviso = setTimeout(function () { elMeta.textContent = original; }, 3000);
  }
  var meta0 = '';

  function abrirAtual() {
    var s = slides[atual];
    if (!s || !abrirItem || abrindo) { return; }
    abrindo = true;
    var textoBotao = elBotaoTxt.textContent;
    elBotaoTxt.textContent = 'ABRINDO...';
    var meu = idCarga;

    resolverSlide(s).then(function (r) {
      abrindo = false;
      elBotaoTxt.textContent = textoBotao;
      if (meu !== idCarga || slides[atual] !== s) { return; }
      if (!r.ok) {
        meta0 = elMeta.textContent;
        avisar('Este título não está disponível no seu servidor');
        gravarCache(chaveCarregada, slides);
        desenharPontos();
        return;
      }
      if (s.resolvido) { gravarCache(chaveCarregada, slides); }
      var mesmos = slides.filter(function (x) {
        return x.tipo === s.tipo && !x.indisponivel && (x.resolvido || !x.daVps);
      }).map(function (x) { return x.raw; });
      abrirItem(s.tipo, s.raw, r.lista || mesmos);
    });
  }

  // Em segundo plano, confere um por um os destaques no painel: quando o usuário apertar OK, já está pronto.
  function preResolver(meu) {
    var fila = slides.filter(function (x) { return x.daVps && !x.resolvido && !x.indisponivel; });
    if (fila.length === 0 || VLTV.m3u.ativo()) { return; }
    function proximo() {
      if (meu !== idCarga) { return; }
      var s = fila.shift();
      if (!s) { gravarCache(chaveCarregada, slides); return; }
      if (s.resolvido || s.indisponivel) { proximo(); return; }
      resolverSlide(s).then(function () { setTimeout(proximo, 300); });
    }
    proximo();
  }

  // ── Guardado na TV ────────────────────────────────────────────────
  function lerCache(chave) {
    try {
      var bruto = localStorage.getItem(CHAVE_CACHE);
      if (!bruto) { return []; }
      var c = JSON.parse(bruto);
      return c && c.chave === chave && Array.isArray(c.slides) ? c.slides : [];
    } catch (e) { return []; }
  }

  function gravarCache(chave, lista) {
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ chave: chave, slides: lista })); } catch (e) { /* ignora */ }
  }

  // A lista nova aproveita o que já foi conferido no painel (para não procurar tudo de novo).
  function herdar(nova, antigos) {
    var mapa = {};
    antigos.forEach(function (a) { if (a.resolvido) { mapa[a.tipo + '|' + a.nome] = a; } });
    nova.forEach(function (n) {
      var a = mapa[n.tipo + '|' + n.nome];
      if (a && n.daVps) { n.raw = a.raw; n.resolvido = true; }
    });
  }

  // Mostra a lista agora (sem esperar nada) e liga a troca automática.
  function mostrar(lista) {
    slides = lista;
    atual = 0;
    elBanner.classList.remove('vazio');
    elConteudo.classList.remove('troca');
    desenhar(slides[0]);
    reiniciarTimer();
    if (onMudou) { onMudou(true); }
    var meu = idCarga;
    setTimeout(function () { if (meu === idCarga) { preResolver(meu); } }, ESPERA_PRE_RESOLVER_MS);
  }

  // ── Interface pública ─────────────────────────────────────────────
  // forcar: recarrega mesmo que já tenha carregado para esta conta.
  function carregar(forcar) {
    if (VLTV.config.BANNER_ATIVO === false) { return; }

    var s = VLTV.sessao.ler();
    var chave = s ? (s.modo + '|' + s.dns + '|' + s.user + '|' + s.m3u) : '';
    if (!forcar && chave === chaveCarregada && slides.length > 0) { return; }
    chaveCarregada = chave;

    var meu = ++idCarga;
    slides = [];
    pendente = null;
    clearInterval(timer);
    timer = null;
    elBanner.classList.add('vazio');
    if (onMudou) { onMudou(false); }

    // 1) O que ficou guardado da última vez aparece na hora.
    var guardado = lerCache(chave);
    if (guardado.length > 0) { mostrar(guardado); }

    // 2) A rede busca a lista de hoje. Se já há banner na tela, a lista nova só entra na próxima troca de slide.
    var inicio = VLTV.m3u.ativo() ? porPainel() : porVps().then(function (l) { return l.length >= 3 ? l : porPainel(); });
    inicio.catch(function () { return []; }).then(function (lista) {
      if (meu !== idCarga || lista.length === 0) { return; }
      herdar(lista, guardado);
      // Logo e fundo do TMDB de cada destaque chegam ANTES de entrarem na tela, para não trocar de
      // imagem na frente do usuário. Se demorar, entra sem eles.
      return Promise.race([
        Promise.all(lista.map(preparar)),
        new Promise(function (resolve) { setTimeout(resolve, ESPERA_TMDB_MS); })
      ]).then(function () { return lista; });
    }).then(function (lista) {
      if (!lista || meu !== idCarga) { return; }
      gravarCache(chave, lista);
      if (slides.length === 0) { mostrar(lista); } else { pendente = lista; }
    });
  }

  function iniciar() { if (slides.length > 1) { reiniciarTimer(); } }
  function parar() { clearInterval(timer); timer = null; }
  function visivel() { return slides.length > 0; }

  function configurar(abrir, mudou) { abrirItem = abrir; onMudou = mudou; }

  VLTV.banner = {
    configurar: configurar,
    carregar: carregar,
    iniciar: iniciar,
    parar: parar,
    mover: mover,
    abrirAtual: abrirAtual,
    visivel: visivel
  };
})();
