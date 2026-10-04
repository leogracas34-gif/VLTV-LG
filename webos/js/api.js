// VLTV Play - webOS | Chamadas ao painel Xtream (usa o servidor que funcionou no login).
(function () {
  'use strict';

  var TIMEOUT_MS = 20000;

  function enc(texto) { return encodeURIComponent(texto); }

  function chamar(acao, extra) {
    var s = VLTV.sessao.ler();
    if (!s) { return Promise.reject(new Error('sem sessão')); }

    var url = s.dns + '/player_api.php?username=' + enc(s.user) +
              '&password=' + enc(s.pass) + '&action=' + acao + (extra || '');

    return VLTV.http.fetchComTimeout(url, TIMEOUT_MS).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    });
  }

  function comoLista(dados) { return Array.isArray(dados) ? dados : []; }

  // Os títulos do guia (EPG) vêm em Base64 com texto UTF-8.
  function decodificar(texto) {
    if (!texto) { return ''; }
    try { return decodeURIComponent(escape(atob(texto))); } catch (e) { /* tenta simples */ }
    try { return atob(texto); } catch (e2) { return ''; }
  }

  function hora(timestamp) {
    var n = parseInt(timestamp, 10);
    if (isNaN(n)) { return ''; }
    var d = new Date(n * 1000);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  VLTV.api = {
    // ── TV ao vivo ──────────────────────────────────────────────────
    categoriasAoVivo: function () {
      return chamar('get_live_categories').then(comoLista);
    },

    canaisAoVivo: function (categoriaId) {
      return chamar('get_live_streams', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // Devolve até 2 programas: [{ titulo, inicio }, ...]
    epgCurto: function (streamId) {
      return chamar('get_short_epg', '&stream_id=' + enc(streamId) + '&limit=2').then(function (dados) {
        var itens = dados && Array.isArray(dados.epg_listings) ? dados.epg_listings : [];
        return itens.map(function (p) {
          return { titulo: decodificar(p.title), inicio: hora(p.start_timestamp) };
        });
      });
    },

    // ext: 'm3u8', 'ts' ou '' (sem extensão)
    urlCanal: function (streamId, ext) {
      var s = VLTV.sessao.ler();
      if (!s) { return ''; }
      return s.dns + '/live/' + enc(s.user) + '/' + enc(s.pass) + '/' + streamId + (ext ? '.' + ext : '');
    },

    // ── Filmes ──────────────────────────────────────────────────────
    categoriasFilmes: function () {
      return chamar('get_vod_categories').then(comoLista);
    },

    filmesPorCategoria: function (categoriaId) {
      return chamar('get_vod_streams', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // ── Séries ──────────────────────────────────────────────────────
    categoriasSeries: function () {
      return chamar('get_series_categories').then(comoLista);
    },

    seriesPorCategoria: function (categoriaId) {
      return chamar('get_series', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // Devolve { info, temporadas: [{ numero, episodios: [...] }] } com as temporadas em ordem.
    infoSerie: function (serieId) {
      return chamar('get_series_info', '&series_id=' + enc(serieId)).then(function (dados) {
        var info = (dados && dados.info) || {};
        var bruto = (dados && dados.episodes) || {};
        var porTemporada = {};

        if (Array.isArray(bruto)) {
          bruto.forEach(function (ep) {
            var n = String(ep.season || 1);
            (porTemporada[n] = porTemporada[n] || []).push(ep);
          });
        } else {
          Object.keys(bruto).forEach(function (n) {
            porTemporada[n] = Array.isArray(bruto[n]) ? bruto[n] : [];
          });
        }

        var temporadas = Object.keys(porTemporada)
          .sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); })
          .map(function (n) {
            var eps = porTemporada[n].slice().sort(function (a, b) {
              return (parseInt(a.episode_num, 10) || 0) - (parseInt(b.episode_num, 10) || 0);
            });
            return { numero: n, episodios: eps };
          })
          .filter(function (t) { return t.episodios.length > 0; });

        return { info: info, temporadas: temporadas };
      });
    },

    // tipo: 'movie' (filme) ou 'series' (episódio). ext: extensão do arquivo ('mp4', 'mkv'...).
    urlVod: function (tipo, id, ext) {
      var s = VLTV.sessao.ler();
      if (!s) { return ''; }
      return s.dns + '/' + tipo + '/' + enc(s.user) + '/' + enc(s.pass) + '/' + id + (ext ? '.' + ext : '');
    }
  };
})();
