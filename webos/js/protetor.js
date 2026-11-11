// VLTV Play - webOS | Proteção de tela estilo Netflix.
// Se a TV ficar parada (sem apertar nada) na Home, em Filmes/Séries, nos detalhes, em Configurações, na escolha de lista
// ou no player PAUSADO, começam a passar capas em tela cheia, com a logo do título, os gêneros e uma linha como
// "Estreia em 25 de novembro" ou "Nova temporada: 1º de dezembro". Qualquer tecla do controle fecha e volta para onde estava
// (a tecla que acordou não faz mais nada). Não aparece em TV ao vivo, nem com vídeo tocando, nem em login/licença.
// As capas e os dados vêm do TMDB (em alta na semana, estreias de filmes e séries novas) e ficam guardados na TV por 12 horas.
// Ajustes em config.js: PROTETOR_SEGUNDOS (0 = desligada) e PROTETOR_TAMANHO_FUNDO.
(function () {
  'use strict';

  var API = 'https://api.themoviedb.org/3';
  var CH_CACHE = 'vltv_prot1_';
  var ATUALIZAR_MS = 12 * 3600 * 1000;       // depois disso busca de novo (em segundo plano)
  var VALIDADE_MAX_MS = 7 * 24 * 3600 * 1000; // lista guardada mais velha que isso não é usada
  var TIMEOUT_MS = 8000;
  var TROCA_MS = 9000;                        // tempo de cada capa na tela
  var MIN_ITENS = 4;                          // com menos que isso, não vale a pena mostrar
  var PRE_BUSCA_APOS_S = 15;                  // começa a montar a lista só depois de 15 s parado (não atrapalha a abertura)
  var RETENTAR_MS = 10 * 60 * 1000;           // falhou: tenta de novo em 10 min

  var QTD_EM_ALTA_FILMES = 5;
  var QTD_EM_ALTA_SERIES = 5;
  var QTD_ESTREIA_FILMES = 3;
  var QTD_ESTREIA_SERIES = 3;
  var DIAS_ESTREIA = 60;                      // só mostra estreia que acontece nos próximos 60 dias

  var MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DIAS_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Telas em que a proteção pode aparecer (id da <section>). O player só vale com o vídeo pausado.
  var TELAS_VALIDAS = ['tela-home', 'tela-catalogo', 'tela-detalhes', 'tela-config', 'tela-listas', 'tela-player'];

  function cfg() { return (window.VLTV && VLTV.config) || {}; }
  function agora() { return new Date().getTime(); }

  function segundos() {
    var s = cfg().PROTETOR_SEGUNDOS;
    return (typeof s === 'number' && s >= 0) ? s : 90;
  }

  function chave() {
    var k = cfg().TMDB_API_KEY;
    return (typeof k === 'string' && k.length > 10 && k.indexOf('__') !== 0) ? k : '';
  }

  function idioma() {
    return (window.VLTV && VLTV.idioma && VLTV.idioma.tmdb) ? VLTV.idioma.tmdb() : { lingua: 'pt-BR', regiao: 'BR', logos: 'pt' };
  }

  function emIngles() { return idioma().logos === 'en'; }

  // ── Datas e textos ────────────────────────────────────────────────
  function meiaNoite(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

  // 'AAAA-MM-DD' -> Date local (ou null)
  function lerData(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) { return null; }
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }

  // Quantos dias faltam (negativo = já passou). null se a data não existe.
  function diasAte(s) {
    var d = lerData(s);
    if (!d) { return null; }
    return Math.round((meiaNoite(d) - meiaNoite(new Date())) / 86400000);
  }

  function dataLonga(d) {
    var dia = d.getDate();
    if (emIngles()) { return MESES_EN[d.getMonth()] + ' ' + dia; }
    return (dia === 1 ? '1º' : String(dia)) + ' de ' + MESES_PT[d.getMonth()];
  }

  // "amanhã", "sexta-feira" (dentro de uma semana) ou "25 de novembro"
  function quando(s) {
    var d = lerData(s);
    var n = diasAte(s);
    if (!d || n === null) { return ''; }
    if (n === 0) { return emIngles() ? 'today' : 'hoje'; }
    if (n === 1) { return emIngles() ? 'tomorrow' : 'amanhã'; }
    if (n <= 6) { return (emIngles() ? DIAS_EN : DIAS_PT)[d.getDay()]; }
    return dataLonga(d);
  }

  // Frase de baixo da capa. 'em alta' é o texto padrão quando não há data importante.
  function frase(tipo, j) {
    var en = emIngles();
    var emAlta = en ? 'Trending this week' : 'Em alta esta semana';
    var n, q;

    if (tipo === 'movie') {
      n = diasAte(j.release_date);
      if (n !== null && n >= 0 && n <= DIAS_ESTREIA) {
        q = quando(j.release_date);
        if (n <= 1) { return en ? 'Coming ' + q : 'Estreia ' + q; }
        return n <= 6 ? (en ? 'Coming ' + q : 'Estreia: ' + q) : (en ? 'Coming ' + q : 'Estreia em ' + q);
      }
      if (n !== null && n < 0 && n >= -45) { return en ? 'New movie' : 'Filme novo'; }
      return emAlta;
    }

    var prox = j.next_episode_to_air;
    var ult = j.last_episode_to_air;
    var np = prox && prox.air_date ? diasAte(prox.air_date) : null;
    var nu = ult && ult.air_date ? diasAte(ult.air_date) : null;

    if (prox && np !== null && np >= 0 && np <= DIAS_ESTREIA) {
      q = quando(prox.air_date);
      if (!ult) { return (en ? 'New series: ' : 'Nova série: ') + q; }
      if (prox.episode_number === 1 && prox.season_number > ult.season_number) { return (en ? 'New season: ' : 'Nova temporada: ') + q; }
      return (en ? 'New episode: ' : 'Novo episódio: ') + q;
    }
    if (!ult) {
      var np2 = diasAte(j.first_air_date);
      if (np2 !== null && np2 >= 0 && np2 <= DIAS_ESTREIA) { return (en ? 'New series: ' : 'Nova série: ') + quando(j.first_air_date); }
    }
    if (ult && nu !== null && nu <= 0 && nu >= -30 && ult.season_number > 1 && ult.episode_number <= 3) {
      return en ? 'Watch season ' + ult.season_number + ' now' : 'Assista à temporada ' + ult.season_number + ' agora';
    }
    return emAlta;
  }

  // ── TMDB ──────────────────────────────────────────────────────────
  function pegarJson(caminho) {
    var id = idioma();
    var url = API + caminho + (caminho.indexOf('?') < 0 ? '?' : '&') + 'api_key=' + chave() + '&language=' + id.lingua;
    return VLTV.http.fetchComTimeout(url, TIMEOUT_MS).then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
      return r.json();
    });
  }

  function baseImagem() { return cfg().TMDB_IMAGENS_URL || 'https://image.tmdb.org'; }

  function enderecoFundo(caminho) {
    return baseImagem() + '/t/p/' + (cfg().PROTETOR_TAMANHO_FUNDO || cfg().TMDB_TAMANHO_FUNDO || 'w1280') + caminho;
  }

  function enderecoLogo(caminho) {
    return baseImagem() + '/t/p/' + (cfg().TMDB_TAMANHO_LOGO || 'w500') + caminho;
  }

  function escolherLogo(logos) {
    var id = idioma();
    var i;
    var l = logos || [];
    for (i = 0; i < l.length; i++) {
      if (String(l[i].iso_639_1).toLowerCase() === id.logos && String(l[i].iso_3166_1).toUpperCase() === id.regiao && l[i].file_path) { return l[i].file_path; }
    }
    for (i = 0; i < l.length; i++) { if (String(l[i].iso_639_1).toLowerCase() === id.logos && l[i].file_path) { return l[i].file_path; } }
    for (i = 0; i < l.length; i++) { if (String(l[i].iso_639_1).toLowerCase() === 'en' && l[i].file_path) { return l[i].file_path; } }
    for (i = 0; i < l.length; i++) { if (!l[i].iso_639_1 && l[i].file_path) { return l[i].file_path; } }
    return '';
  }

  // Melhor fundo SEM texto escrito na imagem (idioma nulo); senão o fundo principal.
  function escolherFundo(j) {
    var lista = ((j.images && j.images.backdrops) || []).filter(function (b) {
      return b && b.file_path && !b.iso_639_1 && (b.width || 0) >= 1920;
    });
    lista.sort(function (a, b) { return (b.vote_average || 0) - (a.vote_average || 0); });
    if (lista.length) { return lista[0].file_path; }
    return j.backdrop_path || '';
  }

  // Detalhe de um título (logo, fundo, gêneros e datas numa consulta só). Resolve com o item pronto ou null. Nunca rejeita.
  function detalhe(tipo, id) {
    var langs = emIngles() ? 'en,null' : 'pt,en,null';
    return pegarJson('/' + tipo + '/' + id + '?append_to_response=images&include_image_language=' + langs).then(function (j) {
      if (!j || !j.id) { return null; }
      var fundo = escolherFundo(j);
      if (!fundo) { return null; }
      var logo = escolherLogo(j.images && j.images.logos);
      var generos = (j.genres || []).slice(0, 3).map(function (g) { return g.name; }).filter(function (n) { return !!n; });
      return {
        titulo: j.title || j.name || '',
        fundo: enderecoFundo(fundo),
        logo: logo ? enderecoLogo(logo) : '',
        generos: generos,
        linha: frase(tipo, j)
      };
    }).catch(function () { return null; });
  }

  function filtrarBasico(lista, tipo) {
    return (lista || []).filter(function (r) {
      return r && r.id && r.backdrop_path && !r.adult && (!r.media_type || r.media_type === tipo);
    });
  }

  function primeiros(lista, n) { return lista.slice(0, n); }

  // Monta a lista de títulos (alguns pedidos ao TMDB, no máximo 3 ao mesmo tempo).
  var montando = false;
  var proximaTentativa = 0;

  function montar() {
    if (montando || !chave() || agora() < proximaTentativa) { return Promise.resolve(); }
    montando = true;
    var regiao = idioma().regiao;
    var hoje = new Date();
    var fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + DIAS_ESTREIA);
    function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

    var pedidos = [
      pegarJson('/trending/movie/week').catch(function () { return null; }),
      pegarJson('/trending/tv/week').catch(function () { return null; }),
      pegarJson('/movie/upcoming?region=' + regiao).catch(function () { return null; }),
      pegarJson('/discover/tv?sort_by=popularity.desc&first_air_date.gte=' + iso(hoje) + '&first_air_date.lte=' + iso(fim)).catch(function () { return null; })
    ];

    return Promise.all(pedidos).then(function (r) {
      var emAltaFilmes = filtrarBasico(r[0] && r[0].results, 'movie');
      var emAltaSeries = filtrarBasico(r[1] && r[1].results, 'tv');
      var estreiaFilmes = filtrarBasico(r[2] && r[2].results, 'movie').filter(function (f) {
        var n = diasAte(f.release_date);
        return n !== null && n >= 0 && n <= DIAS_ESTREIA;
      }).sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
      var estreiaSeries = filtrarBasico(r[3] && r[3].results, 'tv');

      var escolhidos = [];
      var vistos = {};
      function juntar(lista, tipo, n) {
        var c = 0;
        for (var i = 0; i < lista.length && c < n; i++) {
          var k = tipo + lista[i].id;
          if (vistos[k]) { continue; }
          vistos[k] = true;
          escolhidos.push({ tipo: tipo, id: lista[i].id });
          c++;
        }
      }
      juntar(estreiaFilmes, 'movie', QTD_ESTREIA_FILMES);
      juntar(estreiaSeries, 'tv', QTD_ESTREIA_SERIES);
      juntar(emAltaFilmes, 'movie', QTD_EM_ALTA_FILMES);
      juntar(emAltaSeries, 'tv', QTD_EM_ALTA_SERIES);

      var itens = [];
      var pos = 0;
      function trabalhador() {
        if (pos >= escolhidos.length) { return Promise.resolve(); }
        var e = escolhidos[pos++];
        return detalhe(e.tipo, e.id).then(function (it) { if (it) { itens.push(it); } return trabalhador(); });
      }
      return Promise.all([trabalhador(), trabalhador(), trabalhador()]).then(function () { return itens; });
    }).then(function (itens) {
      montando = false;
      if (itens.length >= MIN_ITENS) {
        guardar(itens);
        lista = itens;
        proximaTentativa = 0;
      } else {
        proximaTentativa = agora() + RETENTAR_MS;
      }
    }).catch(function () {
      montando = false;
      proximaTentativa = agora() + RETENTAR_MS;
    });
  }

  // ── Lista guardada na TV ──────────────────────────────────────────
  var lista = [];
  var listaDe = 0;     // quando a lista foi montada

  function chaveCache() { return CH_CACHE + idioma().lingua; }

  function guardar(itens) {
    listaDe = agora();
    try { window.localStorage.setItem(chaveCache(), JSON.stringify({ t: listaDe, l: itens })); }
    catch (e) { /* TV sem espaço: segue sem guardar */ }
  }

  function carregarGuardada() {
    try {
      var c = JSON.parse(window.localStorage.getItem(chaveCache()) || 'null');
      if (c && c.l && c.l.length >= MIN_ITENS && agora() - c.t < VALIDADE_MAX_MS) {
        lista = c.l;
        listaDe = c.t;
      }
    } catch (e) { /* ignora */ }
  }

  function precisaAtualizar() { return lista.length < MIN_ITENS || agora() - listaDe > ATUALIZAR_MS; }

  // ── Tela ──────────────────────────────────────────────────────────
  var raiz = null;
  var slides = [];
  var marca = null;
  var ativo = false;
  var sessao = 0;           // cada abertura tem um número; respostas atrasadas de uma abertura antiga são ignoradas
  var timerTroca = null;
  var timerFechar = null;
  var fila = [];
  var vez = 0;              // qual dos dois slides recebe a próxima capa

  function criar(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) { e.className = classe; }
    if (texto) { e.textContent = texto; }
    return e;
  }

  function montarTela() {
    if (raiz) { return; }
    raiz = criar('div', 'escondido');
    raiz.id = 'protetor';
    for (var i = 0; i < 2; i++) {
      var s = criar('div', 'pt-slide');
      var fundo = criar('div', 'pt-fundo');
      var grad = criar('div', 'pt-grad');
      var info = criar('div', 'pt-info');
      var peq = criar('div', 'pt-marca-peq', 'VLTV PLAY');
      var caixa = criar('div', 'pt-caixa-logo');
      var logo = criar('img', 'pt-logo');
      logo.alt = '';
      var tit = criar('div', 'pt-titulo-txt');
      var gen = criar('div', 'pt-generos');
      var lin = criar('div', 'pt-linha');
      caixa.appendChild(logo);
      caixa.appendChild(tit);
      info.appendChild(peq);
      info.appendChild(caixa);
      info.appendChild(gen);
      info.appendChild(lin);
      s.appendChild(fundo);
      s.appendChild(grad);
      s.appendChild(info);
      raiz.appendChild(s);
      slides.push({ el: s, fundo: fundo, logo: logo, titulo: tit, generos: gen, linha: lin });
    }
    marca = criar('div', 'pt-marca', 'VLTV Play');
    raiz.appendChild(marca);
    document.body.appendChild(raiz);
  }

  // Carrega a imagem antes de mostrar (sem imagem quebrada ou capa piscando). Resolve true/false.
  function precarregar(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(false); return; }
      var img = new Image();
      var fim = false;
      function acabou(ok) { if (fim) { return; } fim = true; clearTimeout(t); img.onload = img.onerror = null; resolve(ok); }
      var t = setTimeout(function () { acabou(false); }, 10000);
      img.onload = function () { acabou(true); };
      img.onerror = function () { acabou(false); };
      img.src = url;
    });
  }

  function embaralhar(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = b[i]; b[i] = b[j]; b[j] = t;
    }
    return b;
  }

  function proximoItem() {
    if (!fila.length) { fila = embaralhar(lista); }
    return fila.shift();
  }

  function mostrarProximo(minhaSessao, tentativas) {
    if (!ativo || minhaSessao !== sessao) { return; }
    if (tentativas > 6) { fechar(); return; }       // várias imagens seguidas falharam (sem internet?): desiste e volta
    var it = proximoItem();
    if (!it) { fechar(); return; }

    precarregar(it.fundo).then(function (ok) {
      if (!ativo || minhaSessao !== sessao) { return; }
      if (!ok) { mostrarProximo(minhaSessao, tentativas + 1); return; }
      var passaLogo = it.logo ? precarregar(it.logo) : Promise.resolve(false);
      passaLogo.then(function (logoOk) {
        if (!ativo || minhaSessao !== sessao) { return; }
        var novo = slides[vez];
        var velho = slides[1 - vez];
        vez = 1 - vez;

        novo.fundo.style.backgroundImage = 'url("' + it.fundo + '")';
        if (logoOk) {
          novo.logo.src = it.logo;
          novo.logo.style.display = 'block';
          novo.titulo.style.display = 'none';
        } else {
          novo.logo.removeAttribute('src');
          novo.logo.style.display = 'none';
          novo.titulo.textContent = it.titulo;
          novo.titulo.style.display = 'block';
        }
        novo.generos.textContent = (it.generos || []).join(' • ');
        novo.linha.textContent = it.linha || '';

        novo.el.classList.add('ativo');
        velho.el.classList.remove('ativo');
        if (!raiz.classList.contains('visivel')) {
          raiz.classList.add('visivel');
          setTimeout(function () { if (raiz && minhaSessao === sessao) { raiz.classList.remove('primeiro'); } }, 6000);
        }

        // Libera a imagem da capa que acabou de sair (depois do fade) para não pesar na memória da TV.
        setTimeout(function () {
          if (minhaSessao === sessao && !velho.el.classList.contains('ativo')) { velho.fundo.style.backgroundImage = 'none'; }
        }, 1800);

        clearTimeout(timerTroca);
        timerTroca = setTimeout(function () { mostrarProximo(minhaSessao, 0); }, TROCA_MS);
      });
    });
  }

  function abrir() {
    if (ativo || lista.length < MIN_ITENS) { return; }
    montarTela();
    clearTimeout(timerFechar);
    ativo = true;
    sessao++;
    fila = [];
    raiz.className = 'primeiro';         // tira 'escondido'; 'primeiro' deixa a 1ª capa entrar bem devagar
    // força o navegador a registrar o estado inicial antes de animar a entrada
    void raiz.offsetWidth;
    mostrarProximo(sessao, 0);
  }

  function fechar() {
    if (!ativo) { return; }
    ativo = false;
    sessao++;
    clearTimeout(timerTroca);
    ultima = agora();
    if (raiz) { raiz.classList.remove('visivel'); }
    clearTimeout(timerFechar);
    timerFechar = setTimeout(function () {
      if (ativo || !raiz) { return; }
      raiz.className = 'escondido';
      slides.forEach(function (s) { s.el.classList.remove('ativo'); s.fundo.style.backgroundImage = 'none'; s.logo.removeAttribute('src'); });
    }, 800);
  }

  // ── Quando mostrar ────────────────────────────────────────────────
  var ultima = agora();      // última vez que alguém mexeu no controle

  function telaVisivel() {
    var el = document.querySelector('#app > .tela:not(.escondida)');
    return el ? el.id : '';
  }

  function janelaAberta() {
    return !!document.querySelector('.confirma:not(.escondida), #pin-overlay:not(.escondida), #aviso-sono:not(.escondida), #aviso-lembrete:not(.escondida)');
  }

  // true = a TV está num lugar onde a proteção de tela pode aparecer
  function lugarValido() {
    var id = telaVisivel();
    if (TELAS_VALIDAS.indexOf(id) < 0) { return false; }
    if (janelaAberta()) { return false; }
    if (id === 'tela-player') {
      var p = document.getElementById('player-pausa');     // a tela de pausa só aparece com o vídeo pausado de verdade
      return !!p && !p.classList.contains('escondida');
    }
    return true;
  }

  function tique() {
    if (segundos() === 0 || !chave()) { return; }
    if (ativo) {
      // Apareceu aviso (sono, lembrete, senha) ou a TV saiu do lugar (ex.: lembrete mudou o canal): fecha.
      if (janelaAberta() || TELAS_VALIDAS.indexOf(telaVisivel()) < 0) { fechar(); }
      return;
    }
    if (!lugarValido()) { ultima = agora(); return; }      // o relógio só conta nos lugares onde a proteção pode aparecer
    var parado = (agora() - ultima) / 1000;
    if (parado >= PRE_BUSCA_APOS_S && precisaAtualizar() && !montando) { montar(); }
    if (parado >= segundos() && lista.length >= MIN_ITENS) { abrir(); }
  }

  // ── Atividade do controle ─────────────────────────────────────────
  var mouseX = -1;
  var mouseY = -1;

  function atividade(e) {
    if (ativo) {
      if (e) {
        if (e.preventDefault) { e.preventDefault(); }
        if (e.stopImmediatePropagation) { e.stopImmediatePropagation(); }
        if (e.stopPropagation) { e.stopPropagation(); }
      }
      fechar();
      return;
    }
    ultima = agora();
  }

  document.addEventListener('keydown', atividade, true);
  document.addEventListener('keyup', function (e) { if (ativo && e) { e.preventDefault(); e.stopImmediatePropagation(); } else { ultima = agora(); } }, true);
  document.addEventListener('click', atividade, true);
  document.addEventListener('wheel', atividade, true);
  document.addEventListener('touchstart', atividade, true);
  // Controle com ponteiro (Magic Remote): só um movimento de verdade acorda (tremidinha da mão não).
  document.addEventListener('mousemove', function (e) {
    var x = e.clientX;
    var y = e.clientY;
    var moveu = mouseX < 0 || Math.abs(x - mouseX) > 12 || Math.abs(y - mouseY) > 12;
    if (!moveu) { return; }
    var primeira = mouseX < 0;
    mouseX = x;
    mouseY = y;
    if (primeira && !ativo) { return; }
    atividade(e);
  }, true);

  carregarGuardada();
  setInterval(tique, 2000);

  VLTV.protetor = { aberto: function () { return ativo; }, fechar: fechar };
})();
