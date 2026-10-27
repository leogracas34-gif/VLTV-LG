// VLTV Play - webOS | Logos de filmes e séries pelo TMDB (mesma lógica da tela de detalhes do Android).
// Pesquisa o título já "varrido" no TMDB, pega a logo em português (pt-BR, depois pt, depois sem idioma)
// e guarda o resultado na TV. Sem chave configurada, ou sem logo, a tela só mostra o nome limpo.
(function () {
  'use strict';

  var API = 'https://api.themoviedb.org/3';
  var TIMEOUT_MS = 6000;
  var VALIDADE_SEM_LOGO_MS = 7 * 24 * 3600 * 1000;   // título sem logo: tenta de novo em 7 dias
  var PREFIXO = 'vltv_logo3_';   // 3: descarta logos antigas, que podiam ser de outro título (o banner usava o id da VPS)
  var PREFIXO_FUNDO = 'vltv_fundo3_';

  var emAndamento = {};   // evita pesquisar o mesmo título duas vezes ao mesmo tempo

  function cfg() { return VLTV.config; }

  function chave() {
    var k = cfg().TMDB_API_KEY;
    return (typeof k === 'string' && k.length > 10 && k.indexOf('__') !== 0) ? k : '';
  }

  function ativo() { return chave() !== ''; }

  function ler(id) {
    try {
      var texto = window.localStorage.getItem(PREFIXO + id);
      return texto ? JSON.parse(texto) : null;
    } catch (e) {
      return null;
    }
  }

  function gravar(id, url) {
    try { window.localStorage.setItem(PREFIXO + id, JSON.stringify({ url: url || '', t: new Date().getTime(), v: 2 })); }
    catch (e) { /* TV sem espaço: segue sem guardar */ }
  }

  function pegarJson(url) {
    return VLTV.http.fetchComTimeout(url, TIMEOUT_MS).then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
      return r.json();
    });
  }

  function enderecoImagem(caminho, tamanho) {
    var base = cfg().TMDB_IMAGENS_URL || 'https://image.tmdb.org';
    return base + '/t/p/' + tamanho + (caminho.charAt(0) === '/' ? caminho : '/' + caminho);
  }

  function endereco(caminho) {
    var base = cfg().TMDB_IMAGENS_URL || 'https://image.tmdb.org';
    return base + '/t/p/' + (cfg().TMDB_TAMANHO_LOGO || 'w500') + (caminho.charAt(0) === '/' ? caminho : '/' + caminho);
  }

  // ── Escolha do título certo ───────────────────────────────────────
  // O TMDB devolve vários títulos parecidos ("Duna" 1984 e 2021, "Lanternas"...). Cada resultado ganha
  // pontos: nome igual ao do painel (100), nome que começa igual (45), ano igual (+60), ano vizinho (+30),
  // ano diferente (-40). Só vale a partir de 90; abaixo disso é melhor mostrar o nome que uma logo errada.
  function norm(texto) {
    var t = String(texto || '').toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* TV sem normalize */ }
    return t.replace(/[^a-z0-9]/g, '');
  }

  function anoDe(r) {
    var d = String(r.release_date || r.first_air_date || '');
    return parseInt(d.slice(0, 4), 10) || 0;
  }

  function pontuar(r, busca) {
    var q = norm(busca.query);
    var nomes = [r.title, r.name, r.original_title, r.original_name].map(norm).filter(function (n) { return n !== ''; });
    var s = 0;
    if (nomes.indexOf(q) !== -1) {
      s = 100;
    } else {
      nomes.forEach(function (n) {
        if (q.length >= 4 && n.length >= 4 && (n.indexOf(q) === 0 || q.indexOf(n) === 0)) { s = Math.max(s, 45); }
      });
    }
    if (busca.ano) {
      var a = anoDe(r);
      if (a) {
        var dif = Math.abs(a - parseInt(busca.ano, 10));
        if (dif === 0) { s += 60; } else if (dif === 1) { s += 30; } else { s -= 40; }
      }
    }
    return s;
  }

  function escolher(resultados, busca) {
    var melhor = null;
    var melhorPontos = -1000;
    for (var i = 0; i < resultados.length && i < 10; i++) {
      var p = pontuar(resultados[i], busca);
      if (p > melhorPontos) { melhorPontos = p; melhor = resultados[i]; }
    }
    return melhorPontos >= 90 ? melhor : null;
  }

  // Resolve com o resultado do TMDB (objeto com id, backdrop_path...) ou null.
  function procurarMelhor(tipoTmdb, busca) {
    var base = API + '/search/' + tipoTmdb + '?api_key=' + chave() +
      '&query=' + encodeURIComponent(busca.query) + '&language=pt-BR&region=BR';   // o painel é em português: a busca continua assim, em qualquer idioma do app

    function pegar(url) {
      return pegarJson(url).then(function (j) { return escolher(j && j.results ? j.results : [], busca); });
    }
    if (!busca.ano) { return pegar(base); }
    var comAno = base + (tipoTmdb === 'tv' ? '&first_air_date_year=' : '&year=') + busca.ano;
    return pegar(comAno).then(function (r) { return r || pegar(base); });
  }

  // Idioma da escolha do usuário (Configurações > Idioma): português do Brasil ou inglês.
  function idiomaTmdb() {
    return (window.VLTV && VLTV.idioma && VLTV.idioma.tmdb) ? VLTV.idioma.tmdb() : { lingua: 'pt-BR', regiao: 'BR', logos: 'pt' };
  }

  function escolherLogo(logos) {
    var i;
    var id = idiomaTmdb();
    for (i = 0; i < logos.length; i++) {
      if (String(logos[i].iso_639_1).toLowerCase() === id.logos && String(logos[i].iso_3166_1).toUpperCase() === id.regiao && logos[i].file_path) { return logos[i].file_path; }
    }
    for (i = 0; i < logos.length; i++) {
      if (String(logos[i].iso_639_1).toLowerCase() === id.logos && logos[i].file_path) { return logos[i].file_path; }
    }
    for (i = 0; i < logos.length; i++) {   // não tem no idioma do app: usa a logo em inglês (a original de muitas séries)
      if (String(logos[i].iso_639_1).toLowerCase() === 'en' && logos[i].file_path) { return logos[i].file_path; }
    }
    for (i = 0; i < logos.length; i++) {
      if ((logos[i].iso_639_1 === null || logos[i].iso_639_1 === undefined) && logos[i].file_path) { return logos[i].file_path; }
    }
    return null;
  }

  function buscarLogo(tipoTmdb, busca) {
    return procurarMelhor(tipoTmdb, busca).then(function (achado) {
      if (achado === null) { return null; }
      var id = achado.id;
      var url = API + '/' + tipoTmdb + '/' + id + '/images?api_key=' + chave() + '&include_image_language=' + (idiomaTmdb().logos === 'en' ? 'en,null' : 'pt-BR,pt,en,null');
      return pegarJson(url).then(function (j) {
        var caminho = j && j.logos ? escolherLogo(j.logos) : null;
        return caminho ? endereco(caminho) : null;
      });
    });
  }

  // ── Título e sinopse pelo TMDB (idioma do app) ──────────────────
  // Inglês: título e sinopse em inglês (o painel manda em português).
  // Português: só serve de reserva para a sinopse quando o painel não mandou nenhuma.
  // O que o TMDB devolve fica guardado na TV: sinopse encontrada nunca é pesquisada de novo.
  var PREFIXO_TXT = 'vltv_txt2_';
  var PREFIXO_TEMP = 'vltv_temp3_';
  var VALIDADE_TXT_MS = 30 * 24 * 3600 * 1000;
  var filaTxt = [];
  var ativasTxt = 0;
  var emAndamentoTxt = {};
  var emAndamentoTemp = {};

  function emIngles() { return idiomaTmdb().lingua.indexOf('en') === 0; }

  function chaveTxt(tipo, id) { return PREFIXO_TXT + idiomaTmdb().lingua + '_' + tipo + '_' + id; }

  // Devolve { titulo, sinopse, tid } já guardado, { vazio: true } se o TMDB não achou (por 7 dias), ou null se vale pesquisar.
  function textosGuardados(tipo, id) {
    try {
      var c = JSON.parse(window.localStorage.getItem(chaveTxt(tipo, id)) || 'null');
      if (!c) { return null; }
      var idade = new Date().getTime() - c.t;
      if (c.vazio) { return idade < VALIDADE_SEM_LOGO_MS ? { vazio: true } : null; }
      if (!c.s && idade > VALIDADE_SEM_LOGO_MS) { return null; }     // sem sinopse: tenta de novo depois de 7 dias
      return { titulo: c.n || '', sinopse: c.s || '', tid: c.i || 0 };
    } catch (e) { return null; }
  }

  function gravarTextos(tipo, id, r) {
    try {
      window.localStorage.setItem(chaveTxt(tipo, id), JSON.stringify(r
        ? { n: r.titulo, s: r.sinopse, i: r.tid, t: new Date().getTime() }
        : { vazio: true, t: new Date().getTime() }));
    } catch (e) { /* TV sem espaço: segue sem guardar */ }
  }

  function bombearTextos() {
    while (ativasTxt < 3 && filaTxt.length > 0) { filaTxt.shift()(); }
  }

  // Resolve com { titulo, sinopse, tid } no idioma do app, ou null. Nunca rejeita.
  function textos(tipo, id, nome) {
    if (!ativo()) { return Promise.resolve(null); }
    var g = textosGuardados(tipo, id);
    if (g) { return Promise.resolve(g.vazio ? null : g); }
    var k = tipo + '_' + id;
    if (emAndamentoTxt[k]) { return emAndamentoTxt[k]; }
    var p = new Promise(function (resolve) {
      filaTxt.push(function () {
        ativasTxt++;
        var tipoTmdb = tipo === 'series' ? 'tv' : 'movie';
        procurarMelhor(tipoTmdb, VLTV.titulo.paraBusca(nome)).then(function (achado) {
          if (!achado) { return null; }
          return pegarJson(API + '/' + tipoTmdb + '/' + achado.id + '?api_key=' + chave() + '&language=' + idiomaTmdb().lingua).then(function (j) {
            var t = j && (j.title || j.name);
            return t ? { titulo: t, sinopse: (j.overview || ''), tid: achado.id } : null;
          });
        }).then(function (r) { gravarTextos(tipo, id, r); return r; })
          .catch(function () { return undefined; })          // falha de rede: não grava, tenta de novo outra hora
          .then(function (r) { ativasTxt--; delete emAndamentoTxt[k]; resolve(r || null); bombearTextos(); });
      });
      bombearTextos();
    });
    emAndamentoTxt[k] = p;
    return p;
  }

  // Episódios de uma temporada pelo TMDB: nome (no idioma do app) e imagem (still) de cada episódio.
  // Resolve com { numeroDoEpisodio: { titulo, imagem } } ou null. Fica guardado na TV.
  function temporada(id, nome, numero) {
    if (!ativo()) { return Promise.resolve(null); }
    var k = PREFIXO_TEMP + idiomaTmdb().lingua + '_' + id + '_' + numero;
    function montar(c) {
      var saida = {};
      for (var n in c) { if (Object.prototype.hasOwnProperty.call(c, n)) { saida[n] = { titulo: c[n][0] || '', imagem: c[n][1] ? enderecoImagem(c[n][1], cfg().TMDB_TAMANHO_EPISODIO || 'w300') : '', sinopse: c[n][2] || '' }; } }
      return saida;
    }
    try {
      var c = JSON.parse(window.localStorage.getItem(k) || 'null');
      if (c && c.e && new Date().getTime() - c.t < VALIDADE_TXT_MS) { return Promise.resolve(montar(c.e)); }
    } catch (e) { /* segue e pesquisa */ }
    if (emAndamentoTemp[k]) { return emAndamentoTemp[k]; }
    var p = textos('series', id, nome).then(function (r) {
      if (!r || !r.tid) { return null; }
      return pegarJson(API + '/tv/' + r.tid + '/season/' + numero + '?api_key=' + chave() + '&language=' + idiomaTmdb().lingua).then(function (j) {
        var e = {};
        var lista = (j && j.episodes) || [];
        for (var i = 0; i < lista.length; i++) {
          var x = lista[i];
          if (x.episode_number !== null && x.episode_number !== undefined) { e[x.episode_number] = [x.name || '', x.still_path || '', x.overview || '']; }
        }
        try { window.localStorage.setItem(k, JSON.stringify({ e: e, t: new Date().getTime() })); } catch (z) { /* sem espaço */ }
        return montar(e);
      });
    }).catch(function () { return null; })
      .then(function (e) { delete emAndamentoTemp[k]; return e; });
    emAndamentoTemp[k] = p;
    return p;
  }

  // Logo guardada na TV (string), '' = já tentamos e não tem, null = nunca tentamos.
  function guardada(tipo, id) {
    var c = ler(tipo + '_' + id);
    if (!c) { return null; }
    if (c.url) { return c.url; }
    if (c.v !== 2) { return null; }   // "sem logo" gravado antes de aceitar logos em inglês: pesquisa de novo
    return (new Date().getTime() - c.t < VALIDADE_SEM_LOGO_MS) ? '' : null;
  }

  // tipo: 'filmes' ou 'series'. id: id do título no painel. nome: nome do painel (pode estar sujo).
  // Resolve com o endereço da logo, ou null. Nunca rejeita.
  function logo(tipo, id, nome) {
    var guard = guardada(tipo, id);
    if (guard !== null) { return Promise.resolve(guard || null); }
    if (!ativo()) { return Promise.resolve(null); }

    var k = tipo + '_' + id;
    if (emAndamento[k]) { return emAndamento[k]; }

    var busca = VLTV.titulo.paraBusca(nome);
    var p = buscarLogo(tipo === 'series' ? 'tv' : 'movie', busca)
      .then(function (url) { gravar(k, url); return url; })
      .catch(function () { return null; })      // falha de rede: não grava, tenta de novo na próxima vez
      .then(function (url) { delete emAndamento[k]; return url; });
    emAndamento[k] = p;
    return p;
  }

  // ── Imagem de fundo (só filmes que o painel não manda com fundo) ───
  function enderecoFundo(caminho) {
    var base = cfg().TMDB_IMAGENS_URL || 'https://image.tmdb.org';
    return base + '/t/p/' + (cfg().TMDB_TAMANHO_FUNDO || 'w1280') + (caminho.charAt(0) === '/' ? caminho : '/' + caminho);
  }

  function fundoGuardado(tipo, id) {
    try {
      var texto = window.localStorage.getItem(PREFIXO_FUNDO + tipo + '_' + id);
      if (!texto) { return null; }
      var c = JSON.parse(texto);
      if (c.url) { return c.url; }
      return (new Date().getTime() - c.t < VALIDADE_SEM_LOGO_MS) ? '' : null;
    } catch (e) { return null; }
  }

  function gravarFundo(k, url) {
    try { window.localStorage.setItem(PREFIXO_FUNDO + k, JSON.stringify({ url: url || '', t: new Date().getTime() })); }
    catch (e) { /* sem espaço: segue sem guardar */ }
  }

  // Resolve com o endereço do fundo (backdrop do TMDB, 1 pesquisa só), ou null. Nunca rejeita.
  function fundo(tipo, id, nome) {
    var guard = fundoGuardado(tipo, id);
    if (guard !== null) { return Promise.resolve(guard || null); }
    if (!ativo()) { return Promise.resolve(null); }

    var busca = VLTV.titulo.paraBusca(nome);
    return procurarMelhor(tipo === 'series' ? 'tv' : 'movie', busca).then(function (achado) {
      var u = achado && achado.backdrop_path ? enderecoFundo(achado.backdrop_path) : null;
      gravarFundo(tipo + '_' + id, u);
      return u;
    }).catch(function () { return null; });
  }

  function fundoPronto(tipo, id) { return fundoGuardado(tipo, id); }

  // ── Vários fundos do mesmo título (fundo que troca devagar, como na Netflix) ───
  var PREFIXO_FUNDOS = 'vltv_fundos1_';
  var MAX_FUNDOS = 6;
  var emAndamentoFundos = {};

  function fundosGuardados(tipo, id) {
    try {
      var c = JSON.parse(window.localStorage.getItem(PREFIXO_FUNDOS + tipo + '_' + id) || 'null');
      if (!c || !c.l) { return null; }
      var validade = c.l.length > 0 ? VALIDADE_TXT_MS : VALIDADE_SEM_LOGO_MS;
      return (new Date().getTime() - c.t < validade) ? c.l : null;
    } catch (e) { return null; }
  }

  // Resolve com uma lista de endereços de fundo (sem texto escrito na imagem, as melhores primeiro).
  // Lista vazia = o TMDB não tem mais fundos. Nunca rejeita. Fica guardada na TV por 30 dias.
  function fundos(tipo, id, nome) {
    var guard = fundosGuardados(tipo, id);
    if (guard) { return Promise.resolve(guard.map(enderecoFundo)); }
    if (!ativo()) { return Promise.resolve([]); }
    var k = tipo + '_' + id;
    if (emAndamentoFundos[k]) { return emAndamentoFundos[k]; }

    var tipoTmdb = tipo === 'series' ? 'tv' : 'movie';
    var p = procurarMelhor(tipoTmdb, VLTV.titulo.paraBusca(nome)).then(function (achado) {
      if (!achado) { return []; }
      var url = API + '/' + tipoTmdb + '/' + achado.id + '/images?api_key=' + chave() + '&include_image_language=null';
      return pegarJson(url).then(function (j) {
        var lista = (j && j.backdrops) ? j.backdrops.slice() : [];
        lista = lista.filter(function (b) { return b && b.file_path && (b.width || 0) >= 1280; });
        lista.sort(function (a, b) { return (b.vote_average || 0) - (a.vote_average || 0); });
        var caminhos = lista.slice(0, MAX_FUNDOS).map(function (b) { return b.file_path; });
        try { window.localStorage.setItem(PREFIXO_FUNDOS + k, JSON.stringify({ l: caminhos, t: new Date().getTime() })); }
        catch (e) { /* sem espaço */ }
        return caminhos.map(enderecoFundo);
      });
    }).catch(function () { return []; })     // falha de rede: não grava, tenta de novo outra hora
      .then(function (l) { delete emAndamentoFundos[k]; return l; });
    emAndamentoFundos[k] = p;
    return p;
  }

  // ── Guia de programação (EPG) no idioma do app ────────────────────
  // O guia chega em português. Em inglês, programa que é filme ou série do TMDB ganha título e sinopse em inglês
  // (só vale quando o nome é igual ao do TMDB). Fica guardado na TV por 30 dias; quem o TMDB não conhece fica como veio.
  var PREFIXO_EPG = 'vltv_epg1_';
  var emAndamentoEpg = {};

  function epgGuardado(titulo) {
    try {
      var c = JSON.parse(window.localStorage.getItem(PREFIXO_EPG + idiomaTmdb().lingua + '_' + norm(titulo)) || 'null');
      if (!c) { return null; }
      if (new Date().getTime() - c.t > (c.n ? VALIDADE_TXT_MS : VALIDADE_SEM_LOGO_MS)) { return null; }
      return c.n ? { titulo: c.n, sinopse: c.s || '' } : { vazio: true };
    } catch (e) { return null; }
  }

  // Resolve com { titulo, sinopse } no idioma do app, ou null (não é filme/série do TMDB). Nunca rejeita.
  function epg(titulo) {
    var nome = String(titulo || '').replace(/^\s+|\s+$/g, '');
    if (!ativo() || nome.length < 2 || !emIngles()) { return Promise.resolve(null); }
    var g = epgGuardado(nome);
    if (g) { return Promise.resolve(g.vazio ? null : g); }
    var k = norm(nome);
    if (emAndamentoEpg[k]) { return emAndamentoEpg[k]; }
    var busca = VLTV.titulo.paraBusca(nome);
    var p = new Promise(function (resolve) {
      filaTxt.push(function () {
        ativasTxt++;
        pegarJson(API + '/search/multi?api_key=' + chave() + '&query=' + encodeURIComponent(busca.query) + '&language=pt-BR&region=BR').then(function (j) {
          var lista = ((j && j.results) || []).filter(function (r) { return r.media_type === 'movie' || r.media_type === 'tv'; });
          var achado = escolher(lista, busca);
          if (!achado) { return null; }
          return pegarJson(API + '/' + achado.media_type + '/' + achado.id + '?api_key=' + chave() + '&language=en-US').then(function (d) {
            var t = d && (d.title || d.name);
            return t ? { titulo: t, sinopse: d.overview || '' } : null;
          });
        }).then(function (r) {
          try {
            window.localStorage.setItem(PREFIXO_EPG + idiomaTmdb().lingua + '_' + k, JSON.stringify(r ? { n: r.titulo, s: r.sinopse, t: new Date().getTime() } : { t: new Date().getTime() }));
          } catch (e) { /* sem espaço */ }
          return r;
        }).catch(function () { return undefined; })
          .then(function (r) { ativasTxt--; delete emAndamentoEpg[k]; resolve(r || null); bombearTextos(); });
      });
      bombearTextos();
    });
    emAndamentoEpg[k] = p;
    return p;
  }

  // Logo, fundo e título direto pelo ID do TMDB (sem procurar pelo nome). tipo: 'filmes' ou 'series'.
  // Resolve com { logo, fundo, titulo } (cada um pode ser null) ou null. Nunca rejeita.
  function imagensPorId(tipo, tid) {
    tid = String(tid || '').replace(/[^0-9]/g, '');
    if (!tid || !ativo()) { return Promise.resolve(null); }
    var tipoTmdb = tipo === 'series' ? 'tv' : 'movie';
    var id = idiomaTmdb();
    var url = API + '/' + tipoTmdb + '/' + tid + '?api_key=' + chave() + '&language=' + id.lingua +
      '&append_to_response=images&include_image_language=' + (id.logos === 'en' ? 'en,null' : 'pt-BR,pt,null');
    return pegarJson(url).then(function (j) {
      if (!j) { return null; }
      var caminhoLogo = j.images && j.images.logos ? escolherLogo(j.images.logos) : null;
      return {
        logo: caminhoLogo ? endereco(caminhoLogo) : null,
        fundo: j.backdrop_path ? enderecoFundo(j.backdrop_path) : null,
        titulo: j.title || j.name || '',
        sinopse: j.overview || ''
      };
    }).catch(function () { return null; });
  }


  // ── Ficha completa do título: criação, elenco, gêneros, classificação etária e semelhantes ──
  // Uma única consulta ao TMDB por título (pelo ID do TMDB quando o painel manda, senão pelo nome).
  // Os nomes de pessoas, a classificação e os gêneros (só o número) não dependem do idioma; os gêneros viram
  // texto no idioma do app na hora de mostrar. A lista de semelhantes vem em português (nome do painel)
  // e com o nome original, para a TV achar o mesmo título no catálogo da conta.
  // Fica guardada na TV por 14 dias.
  var PREFIXO_FICHA = 'vltv_ficha1_';
  var VALIDADE_FICHA_MS = 14 * 24 * 3600 * 1000;
  var MAX_RECS = 40;
  var MAX_ELENCO = 20;
  var emAndamentoFicha = {};

  // Gêneros do TMDB (filmes e séries): [português, inglês]
  var GENEROS = {
    28: ['Ação', 'Action'], 12: ['Aventura', 'Adventure'], 16: ['Animação', 'Animation'], 35: ['Comédia', 'Comedy'],
    80: ['Crime', 'Crime'], 99: ['Documentário', 'Documentary'], 18: ['Drama', 'Drama'], 10751: ['Família', 'Family'],
    14: ['Fantasia', 'Fantasy'], 36: ['História', 'History'], 27: ['Terror', 'Horror'], 10402: ['Música', 'Music'],
    9648: ['Mistério', 'Mystery'], 10749: ['Romance', 'Romance'], 878: ['Ficção científica', 'Science Fiction'],
    10770: ['Cinema TV', 'TV Movie'], 53: ['Suspense', 'Thriller'], 10752: ['Guerra', 'War'], 37: ['Faroeste', 'Western'],
    10759: ['Ação e Aventura', 'Action & Adventure'], 10762: ['Infantil', 'Kids'], 10763: ['Notícias', 'News'],
    10764: ['Reality', 'Reality'], 10765: ['Ficção científica e Fantasia', 'Sci-Fi & Fantasy'], 10766: ['Novela', 'Soap'],
    10767: ['Talk show', 'Talk'], 10768: ['Guerra e Política', 'War & Politics']
  };

  // Nome do gênero no idioma do app (ou em português, se pedir). '' se o número não é conhecido.
  function nomeGenero(id, emPortugues) {
    var g = GENEROS[id];
    if (!g) { return ''; }
    return (emPortugues || !emIngles()) ? g[0] : g[1];
  }

  // Classificação etária brasileira a partir de um texto: '' | 'L' | '10' | '12' | '14' | '16' | '18'.
  // Entende o número brasileiro ("16", "A16", "+18", "L") e os códigos americanos (PG-13, TV-MA...).
  var IDADE_US = { 'G': 'L', 'TV-Y': 'L', 'TV-G': 'L', 'PG': '10', 'TV-Y7': '10', 'TV-Y7-FV': '10', 'TV-PG': '10',
    'PG-13': '14', 'TV-14': '14', 'R': '16', 'TV-MA': '16', 'NC-17': '18', 'X': '18' };

  function idadeDeTexto(texto) {
    var t = String(texto === undefined || texto === null ? '' : texto).replace(/^\s+|\s+$/g, '').toUpperCase();
    if (t === '') { return ''; }
    if (/^(L|LIVRE|AL|ALL|TODOS)$/.test(t)) { return 'L'; }
    if (Object.prototype.hasOwnProperty.call(IDADE_US, t)) { return IDADE_US[t]; }
    var m = /(\d{1,2})/.exec(t);
    if (!m) { return ''; }
    var n = parseInt(m[1], 10);
    if (n === 0) { return 'L'; }
    if (n >= 18) { return '18'; }
    if (n >= 16) { return '16'; }
    if (n >= 14) { return '14'; }
    if (n >= 12) { return '12'; }
    return '10';
  }

  function fichaGuardada(chave) {
    try {
      var c = JSON.parse(window.localStorage.getItem(PREFIXO_FICHA + chave) || 'null');
      if (!c) { return null; }
      var idade = new Date().getTime() - c.t;
      if (c.vazio) { return idade < VALIDADE_SEM_LOGO_MS ? { vazio: true } : null; }
      return (c.f && idade < VALIDADE_FICHA_MS) ? c.f : null;
    } catch (e) { return null; }
  }

  function gravarFicha(chave, f) {
    try { window.localStorage.setItem(PREFIXO_FICHA + chave, JSON.stringify(f ? { f: f, t: new Date().getTime() } : { vazio: true, t: new Date().getTime() })); }
    catch (e) { /* TV sem espaço: segue sem guardar */ }
  }

  function nomesUnicos(lista, max) {
    var saida = [];
    for (var i = 0; i < lista.length && saida.length < max; i++) {
      var n = lista[i] && lista[i].name;
      if (n && saida.indexOf(n) < 0) { saida.push(n); }
    }
    return saida;
  }

  // Certificação do país (BR primeiro, depois US). Devolve { texto, br }.
  function certificacao(tipoTmdb, j) {
    var paises = {};
    var i, k;
    if (tipoTmdb === 'tv') {
      var lista = (j.content_ratings && j.content_ratings.results) || [];
      for (i = 0; i < lista.length; i++) { if (lista[i].rating) { paises[lista[i].iso_3166_1] = lista[i].rating; } }
    } else {
      var rs = (j.release_dates && j.release_dates.results) || [];
      for (i = 0; i < rs.length; i++) {
        var datas = rs[i].release_dates || [];
        for (k = 0; k < datas.length; k++) {
          if (datas[k].certification) { paises[rs[i].iso_3166_1] = datas[k].certification; break; }
        }
      }
    }
    if (idadeDeTexto(paises.BR) !== '') { return { texto: paises.BR, br: true }; }
    if (idadeDeTexto(paises.US) !== '') { return { texto: paises.US, br: false }; }
    return { texto: '', br: false };
  }

  function montarFicha(tipoTmdb, j) {
    var cr = j.credits || {};
    var elenco = (cr.cast || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var direcao = (cr.crew || []).filter(function (p) { return p.job === 'Director'; });
    var cert = certificacao(tipoTmdb, j);

    var recs = [];
    var vistos = {};
    var fontes = [(j.recommendations && j.recommendations.results) || [], (j.similar && j.similar.results) || []];
    fontes.forEach(function (lista) {
      lista.forEach(function (r) {
        if (!r || !r.id || vistos[r.id] || recs.length >= MAX_RECS) { return; }
        vistos[r.id] = true;
        var titulo = r.title || r.name || '';
        var original = r.original_title || r.original_name || '';
        if (!titulo && !original) { return; }
        // [id, título em português, título original, ano, números dos gêneros]
        recs.push([r.id, titulo, original, anoDe(r), r.genre_ids || []]);
      });
    });

    return {
      tid: j.id,
      ano: String(j.release_date || j.first_air_date || '').slice(0, 4),
      temps: j.number_of_seasons || 0,
      duracao: j.runtime || 0,
      criadores: nomesUnicos(j.created_by || [], 4),
      direcao: nomesUnicos(direcao, 3),
      elenco: nomesUnicos(elenco, MAX_ELENCO),
      generos: (j.genres || []).map(function (g) { return g.id; }),
      idade: idadeDeTexto(cert.texto),
      idadeBr: cert.br,
      recs: recs
    };
  }

  // tipo: 'filmes' ou 'series'. id: id do título no painel. nome: nome do painel. tmdbId: ID do TMDB que o painel
  // mandou (opcional). Resolve com a ficha (veja montarFicha) ou null. Nunca rejeita.
  function ficha(tipo, id, nome, tmdbId) {
    var tid = String(tmdbId || '').replace(/[^0-9]/g, '');
    if (tid === '0') { tid = ''; }
    var chave = tipo + '_' + id + (tid ? '_t' + tid : '');
    var g = fichaGuardada(chave);
    if (g) { return Promise.resolve(g.vazio ? null : g); }
    if (!ativo()) { return Promise.resolve(null); }
    if (emAndamentoFicha[chave]) { return emAndamentoFicha[chave]; }

    var tipoTmdb = tipo === 'series' ? 'tv' : 'movie';
    var p = new Promise(function (resolve) {
      // Pelo ID do painel, senão pelo que a TV já descobriu (sinopse/título), senão procura pelo nome.
      var achar;
      if (tid) {
        achar = Promise.resolve(tid);
      } else {
        var t = textosGuardados(tipo, id);
        achar = (t && t.tid) ? Promise.resolve(String(t.tid)) : procurarMelhor(tipoTmdb, VLTV.titulo.paraBusca(nome)).then(function (a) { return a ? String(a.id) : ''; });
      }
      achar.then(function (idTmdb) {
        if (!idTmdb) { return null; }
        var url = API + '/' + tipoTmdb + '/' + idTmdb + '?api_key=' + chaveApi() + '&language=pt-BR' +
          '&append_to_response=credits,recommendations,similar,' + (tipoTmdb === 'tv' ? 'content_ratings' : 'release_dates');
        return pegarJson(url).then(function (j) { return j && j.id ? montarFicha(tipoTmdb, j) : null; });
      }).then(function (f) { gravarFicha(chave, f); return f; })
        .catch(function () { return undefined; })       // falha de rede: não grava, tenta de novo outra hora
        .then(function (f) { delete emAndamentoFicha[chave]; resolve(f || null); });
    });
    emAndamentoFicha[chave] = p;
    return p;
  }


  // Só a classificação etária de um título pelo ID do TMDB (uma consulta pequena), guardada na TV.
  // Resolve com '', 'L', '10'... Nunca rejeita. Usado no selo de cada título semelhante.
  var PREFIXO_IDADE = 'vltv_idade1_';

  function idadePorTid(tipo, tid) {
    tid = String(tid || '').replace(/[^0-9]/g, '');
    if (!tid || !ativo()) { return Promise.resolve(''); }
    var k = PREFIXO_IDADE + tipo + '_' + tid;
    try {
      var c = JSON.parse(window.localStorage.getItem(k) || 'null');
      if (c && (new Date().getTime() - c.t) < (c.c ? VALIDADE_FICHA_MS : VALIDADE_SEM_LOGO_MS)) { return Promise.resolve(c.c || ''); }
    } catch (e) { /* segue e consulta */ }
    var tipoTmdb = tipo === 'series' ? 'tv' : 'movie';
    var url = API + '/' + tipoTmdb + '/' + tid + (tipoTmdb === 'tv' ? '/content_ratings' : '/release_dates') + '?api_key=' + chave();
    return pegarJson(url).then(function (j) {
      var cert = certificacao(tipoTmdb, { content_ratings: j, release_dates: j });
      var cod = idadeDeTexto(cert.texto);
      try { window.localStorage.setItem(k, JSON.stringify({ c: cod, t: new Date().getTime() })); } catch (e) { /* sem espaço */ }
      return cod;
    }).catch(function () { return ''; });
  }

  function chaveApi() { return chave(); }

  VLTV.tmdb = { imagensPorId: imagensPorId, ficha: ficha, idadePorTid: idadePorTid, idadeDeTexto: idadeDeTexto, nomeGenero: nomeGenero, ativo: ativo, textos: textos, textosGuardados: textosGuardados, temporada: temporada, epg: epg, logo: logo, guardada: guardada, fundo: fundo, fundos: fundos, fundoGuardado: fundoPronto };

})();
