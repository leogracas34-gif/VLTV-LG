// VLTV Play - webOS | Logos de filmes e séries pelo TMDB (mesma lógica da tela de detalhes do Android).
// Pesquisa o título já "varrido" no TMDB, pega a logo em português (pt-BR, depois pt, depois sem idioma)
// e guarda o resultado na TV. Sem chave configurada, ou sem logo, a tela só mostra o nome limpo.
(function () {
  'use strict';

  var API = 'https://api.themoviedb.org/3';
  var TIMEOUT_MS = 6000;
  var VALIDADE_SEM_LOGO_MS = 7 * 24 * 3600 * 1000;   // título sem logo: tenta de novo em 7 dias
  var PREFIXO = 'vltv_logo_';

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

  // Primeiro título que o TMDB devolve (com o ano, se houver; sem ele, se com o ano não achou nada).
  function procurar(tipoTmdb, busca) {
    var base = API + '/search/' + tipoTmdb + '?api_key=' + chave() +
      '&query=' + encodeURIComponent(busca.query) + '&language=pt-BR&region=BR';
    var comAno = busca.ano
      ? base + (tipoTmdb === 'tv' ? '&first_air_date_year=' : '&year=') + busca.ano
      : null;

    function primeiro(url) {
      return pegarJson(url).then(function (j) {
        return j && j.results && j.results.length > 0 ? j.results[0].id : null;
      });
    }
    if (!comAno) { return primeiro(base); }
    return primeiro(comAno).then(function (id) { return id !== null ? id : primeiro(base); });
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
    return procurar(tipoTmdb, busca).then(function (id) {
      if (id === null) { return null; }
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

  VLTV.tmdb = { ativo: ativo, logo: logo, guardada: guardada };
})();
