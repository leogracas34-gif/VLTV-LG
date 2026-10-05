// VLTV Play - webOS | Lista M3U: baixa, lê e separa em TV ao vivo, filmes e séries.
(function () {
  'use strict';

  // Episódio de série no nome: "Nome da Série S01E03".
  var REGEX_EPISODIO = /^(.*?)[\s._-]*S(\d{1,3})\s*[._-]?\s*E(\d{1,4})/i;
  var REGEX_ARQUIVO = /\.(mp4|mkv|avi|mov|wmv|flv|mpg|mpeg)(\?|$)/i;

  var dados = null;

  function atributos(linha) {
    var attrs = {};
    var re = /([\w-]+)="([^"]*)"/g;
    var m;
    while ((m = re.exec(linha)) !== null) { attrs[m[1].toLowerCase()] = m[2]; }
    return attrs;
  }

  function classificar(item) {
    var ehArquivo = REGEX_ARQUIVO.test(item.url);
    if (/\/series\//i.test(item.url) || (ehArquivo && REGEX_EPISODIO.test(item.name))) { return 'series'; }
    if (/\/movie\//i.test(item.url) || ehArquivo) { return 'filmes'; }
    return 'ao_vivo';
  }

  // Grupo de categorias, na ordem em que aparecem na lista.
  function novoGrupo() { return { cats: [], porCat: {}, indice: {} }; }

  function categoriaDe(grupo, nome) {
    if (grupo.indice[nome] === undefined) {
      var id = 'g' + grupo.cats.length;
      grupo.indice[nome] = id;
      grupo.cats.push({ category_id: id, category_name: nome });
      grupo.porCat[id] = [];
    }
    return grupo.indice[nome];
  }

  function parsear(texto) {
    var linhas = texto.split(/\r?\n/);
    var resultado = {
      ao_vivo: novoGrupo(),
      filmes: novoGrupo(),
      series: novoGrupo(),
      mapaSeries: {},
      total: 0
    };
    var proximoId = 1;
    var atual = null;

    for (var i = 0; i < linhas.length; i++) {
      var linha = linhas[i].trim();
      if (!linha) { continue; }

      if (linha.indexOf('#EXTINF') === 0) {
        var attrs = atributos(linha);
        var semAttrs = linha.replace(/="[^"]*"/g, '=""');
        var nome = semAttrs.substring(semAttrs.lastIndexOf(',') + 1).trim() || attrs['tvg-name'] || 'Sem nome';
        atual = { name: nome, logo: attrs['tvg-logo'] || '', grupo: attrs['group-title'] || 'Sem grupo' };
      } else if (linha.charAt(0) !== '#' && atual) {
        atual.url = linha;
        adicionar(resultado, atual, proximoId++);
        atual = null;
      }
    }
    return resultado;
  }

  function adicionar(r, item, id) {
    var tipo = classificar(item);
    r.total++;

    if (tipo === 'ao_vivo') {
      var catL = categoriaDe(r.ao_vivo, item.grupo);
      r.ao_vivo.porCat[catL].push({ stream_id: id, name: item.name, stream_icon: item.logo, url: item.url });
      return;
    }

    if (tipo === 'filmes') {
      var catF = categoriaDe(r.filmes, item.grupo);
      r.filmes.porCat[catF].push({ stream_id: id, name: item.name, stream_icon: item.logo, container_extension: '', url: item.url });
      return;
    }

    // Série: agrupa os episódios pelo nome da série.
    var m = REGEX_EPISODIO.exec(item.name);
    var nomeSerie = (m && m[1].trim()) || item.name;
    var temporada = m ? String(parseInt(m[2], 10)) : '1';
    var numero = m ? parseInt(m[3], 10) : 1;
    var chave = item.grupo + '||' + nomeSerie;

    var serie = r.mapaSeries[chave];
    if (!serie) {
      var catS = categoriaDe(r.series, item.grupo);
      serie = { series_id: 's' + id, name: nomeSerie, cover: item.logo, plot: '', temporadas: {} };
      r.mapaSeries[chave] = serie;
      r.mapaSeries[serie.series_id] = serie;
      r.series.porCat[catS].push(serie);
    }
    (serie.temporadas[temporada] = serie.temporadas[temporada] || []).push({
      id: id, title: item.name, episode_num: numero, container_extension: '', season: temporada, url: item.url
    });
  }

  // Resolve com os dados; rejeita com Error('rede' | 'tamanho' | 'vazia').
  function carregar(url) {
    var cfg = VLTV.config;
    return VLTV.http.fetchComTimeout(url, cfg.M3U_TIMEOUT_MS)
      .then(function (r) {
        if (!r.ok) { throw new Error('rede'); }
        return r.text();
      }, function () { throw new Error('rede'); })
      .then(function (texto) {
        if (texto.length > cfg.M3U_MAX_BYTES) { throw new Error('tamanho'); }
        var r = parsear(texto);
        if (r.total === 0) { throw new Error('vazia'); }
        dados = r;
        return r;
      });
  }

  function limpar() { dados = null; }

  function ativo() { return dados !== null; }

  // Séries no formato que a tela de episódios espera.
  function infoSerie(id) {
    var serie = dados && dados.mapaSeries[id];
    if (!serie) { return { info: {}, temporadas: [] }; }
    var temporadas = Object.keys(serie.temporadas)
      .sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); })
      .map(function (n) {
        var eps = serie.temporadas[n].slice().sort(function (a, b) { return a.episode_num - b.episode_num; });
        return { numero: n, episodios: eps };
      });
    return { info: {}, temporadas: temporadas };
  }

  function categorias(tipo) { return dados ? dados[tipo].cats : []; }

  function itens(tipo, categoriaId) { return dados ? (dados[tipo].porCat[categoriaId] || []) : []; }

  function temConteudo(tipo) { return !!dados && dados[tipo].cats.length > 0; }

  VLTV.m3u = {
    carregar: carregar,
    limpar: limpar,
    ativo: ativo,
    infoSerie: infoSerie,
    categorias: categorias,
    itens: itens,
    temConteudo: temConteudo,
    total: function () { return dados ? dados.total : 0; }
  };
})();
