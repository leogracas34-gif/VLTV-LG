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
    try { window.localStorage.setItem(PREFIXO + id, JSON.stringify({ url: url || '', t: new Date().getTime() })); }
    catch (e) { /* TV sem espaço: segue sem guardar */ }
  }

  function pegarJson(url) {
    return VLTV.http.fetchComTimeout(url, TIMEOUT_MS).then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
      return r.json();
    });
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
      '&query=' + encodeURIComponent(busca.query) + '&language=pt-BR&region=BR';

    function pegar(url) {
      return pegarJson(url).then(function (j) { return escolher(j && j.results ? j.results : [], busca); });
    }
    if (!busca.ano) { return pegar(base); }
    var comAno = base + (tipoTmdb === 'tv' ? '&first_air_date_year=' : '&year=') + busca.ano;
    return pegar(comAno).then(function (r) { return r || pegar(base); });
  }

  function escolherLogo(logos) {
    var i;
    for (i = 0; i < logos.length; i++) {
      if (String(logos[i].iso_639_1).toLowerCase() === 'pt' && String(logos[i].iso_3166_1).toUpperCase() === 'BR' && logos[i].file_path) { return logos[i].file_path; }
    }
    for (i = 0; i < logos.length; i++) {
      if (String(logos[i].iso_639_1).toLowerCase() === 'pt' && logos[i].file_path) { return logos[i].file_path; }
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
      var url = API + '/' + tipoTmdb + '/' + id + '/images?api_key=' + chave() + '&include_image_language=pt-BR,pt,null';
      return pegarJson(url).then(function (j) {
        var caminho = j && j.logos ? escolherLogo(j.logos) : null;
        return caminho ? endereco(caminho) : null;
      });
    });
  }

  // Logo guardada na TV (string), '' = já tentamos e não tem, null = nunca tentamos.
  function guardada(tipo, id) {
    var c = ler(tipo + '_' + id);
    if (!c) { return null; }
    if (c.url) { return c.url; }
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

  VLTV.tmdb = { ativo: ativo, logo: logo, guardada: guardada, fundo: fundo, fundoGuardado: fundoPronto };

})();
