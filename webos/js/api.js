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

  // Quando a conta é uma lista M3U, os dados já estão na memória do app.
  function daLista() { return VLTV.m3u.ativo(); }
  function pronto(valor) { return Promise.resolve(valor); }

  // Os títulos do guia (EPG) normalmente vêm em Base64 com texto UTF-8, mas alguns painéis mandam texto puro.
  // Só aceita o resultado da decodificação se ele for texto legível; senão devolve o texto original.
  function legivel(t) { return !!t && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(t); }

  function decodificar(texto) {
    if (!texto) { return ''; }
    texto = String(texto);
    var limpo = texto.replace(/\s+/g, '');
    if (limpo.length % 4 === 0 && /^[A-Za-z0-9+\/]+={0,2}$/.test(limpo)) {
      var d;
      try { d = decodeURIComponent(escape(atob(limpo))); if (legivel(d)) { return d; } } catch (e) { /* tenta simples */ }
      try { d = atob(limpo); if (/^[\x20-\x7E\n\r\t]+$/.test(d)) { return d; } } catch (e2) { /* é texto puro */ }
    }
    return texto;
  }

  function hora(ts) {
    if (!ts) { return ''; }
    var d = new Date(ts * 1000);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // Lê o horário de um programa em segundos (UTC). Aceita segundos, milissegundos ou o texto "AAAA-MM-DD HH:MM:SS".
  // Devolve 0 quando o valor não presta (vazio, lixo, ano 1970).
  function lerTempo(valor, texto) {
    var s = String(valor === undefined || valor === null ? '' : valor).trim();
    if (/^\d{9,13}$/.test(s)) {
      var n = parseInt(s, 10);
      if (n > 99999999999) { n = Math.floor(n / 1000); }   // veio em milissegundos
      if (n > 1000000000) { return n; }
    }
    var t = String(texto === undefined || texto === null ? '' : texto).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t);
    if (m) {
      // Texto do painel: sem fuso, então vale como horário local da TV.
      return Math.floor(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() / 1000);
    }
    return 0;
  }

  var MAX_PROGRAMA_SEG = 12 * 3600;   // programa com mais de 12 h é guia quebrado (ex.: filme das 23:30 às 23:30 do dia seguinte)

  // Limpa o guia que o painel mandou: horários inválidos, programa de duração absurda, repetidos,
  // fora de ordem e sobrepostos. Aplica o ajuste de fuso do config (EPG_AJUSTE_HORAS), se houver.
  function normalizarEpg(itens) {
    var cfg = (window.VLTV && VLTV.config && Number(VLTV.config.EPG_AJUSTE_HORAS)) || 0;
    var ajuste = Math.round(cfg * 3600);
    var lista = [];
    (itens || []).forEach(function (p) {
      if (!p) { return; }
      var ini = lerTempo(p.start_timestamp, p.start);
      var fim = lerTempo(p.stop_timestamp, p.end || p.stop);
      if (!ini) { return; }
      ini += ajuste;
      if (fim) { fim += ajuste; }
      if (fim && (fim <= ini || fim - ini > MAX_PROGRAMA_SEG)) {
        if (fim - ini > MAX_PROGRAMA_SEG) { return; }   // duração impossível: descarta em vez de mostrar errado
        fim = 0;                                         // fim igual ao início: o fim passa a ser o início do próximo
      }
      lista.push({
        titulo: decodificar(p.title),
        descricao: decodificar(p.description),
        iniTs: ini,
        fimTs: fim
      });
    });

    lista.sort(function (a, b) { return a.iniTs - b.iniTs; });

    var limpa = [];
    lista.forEach(function (p) {
      var ant = limpa[limpa.length - 1];
      if (ant && ant.iniTs === p.iniTs) {   // mesmo horário duas vezes: fica o que tem mais informação
        if (!ant.titulo || (p.descricao && !ant.descricao)) { limpa[limpa.length - 1] = p; }
        return;
      }
      if (ant && ant.titulo && ant.titulo === p.titulo && (!ant.fimTs || ant.fimTs >= p.iniTs - 60)) {
        ant.fimTs = p.fimTs || ant.fimTs;    // mesmo programa partido em dois pedaços: junta
        if (!ant.descricao) { ant.descricao = p.descricao; }
        return;
      }
      limpa.push(p);
    });

    limpa.forEach(function (p, i) {
      var prox = limpa[i + 1];
      if (prox && (!p.fimTs || p.fimTs > prox.iniTs)) { p.fimTs = prox.iniTs; }   // não deixa um programa invadir o seguinte
      p.inicio = hora(p.iniTs);
      p.fim = hora(p.fimTs);
    });
    return limpa;
  }

  // Separa o guia em "agora" e "próximos" pelo relógio da TV: o que já terminou sai da lista e só vale como
  // "agora" o programa que já começou. espera = quanto falta (ms) para o guia mudar de programa.
  function separarEpg(lista, agoraSeg) {
    var vivos = (lista || []).filter(function (p) { return !(p.fimTs && p.fimTs <= agoraSeg); });
    var atual = vivos.length > 0 && (!vivos[0].iniTs || vivos[0].iniTs <= agoraSeg) ? vivos[0] : null;
    var resto = atual ? vivos.slice(1) : vivos;
    var proximoTs = 0;
    if (atual && atual.fimTs) { proximoTs = atual.fimTs; }
    else if (resto.length > 0 && resto[0].iniTs) { proximoTs = resto[0].iniTs; }
    var espera = proximoTs ? (proximoTs - agoraSeg + 3) * 1000 : 60000;
    espera = Math.max(15000, Math.min(espera, 300000));
    return { atual: atual, proximos: resto, espera: espera };
  }

  VLTV.api = {
    separarEpg: separarEpg,
    normalizarEpg: normalizarEpg,
    decodificar: decodificar,

    // ── TV ao vivo ──────────────────────────────────────────────────
    // Em lista M3U: false se a lista não tem esse tipo de conteúdo ('ao_vivo', 'filmes' ou 'series').
    temConteudo: function (tipo) {
      return daLista() ? VLTV.m3u.temConteudo(tipo) : true;
    },

    categoriasAoVivo: function () {
      if (daLista()) { return pronto(VLTV.m3u.categorias('ao_vivo')); }
      return chamar('get_live_categories').then(comoLista);
    },

    canaisAoVivo: function (categoriaId) {
      if (daLista()) { return pronto(VLTV.m3u.itens('ao_vivo', categoriaId)); }
      return chamar('get_live_streams', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // Devolve até `limite` programas já limpos: [{ titulo, inicio, fim, iniTs, fimTs, descricao }, ...]
    // Se o painel não devolve nada pelo guia curto, tenta a tabela completa do canal.
    epgCurto: function (streamId, limite) {
      if (daLista()) { return pronto([]); }
      var max = limite || 2;

      function itensDe(dados) {
        return dados && Array.isArray(dados.epg_listings) ? dados.epg_listings : [];
      }

      return chamar('get_short_epg', '&stream_id=' + enc(streamId) + '&limit=' + max)
        .then(function (dados) { return normalizarEpg(itensDe(dados)); })
        .catch(function () { return []; })
        .then(function (lista) {
          var agoraSeg = Math.floor(new Date().getTime() / 1000);
          var util = lista.some(function (p) { return !p.fimTs || p.fimTs > agoraSeg; });
          if (util) { return lista; }
          return chamar('get_simple_data_table', '&stream_id=' + enc(streamId))
            .then(function (dados) {
              var todos = normalizarEpg(itensDe(dados)).filter(function (p) { return !p.fimTs || p.fimTs > agoraSeg; });
              return todos.slice(0, max);
            })
            .catch(function () { return lista; });
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
      if (daLista()) { return pronto(VLTV.m3u.categorias('filmes')); }
      return chamar('get_vod_categories').then(comoLista);
    },

    filmesPorCategoria: function (categoriaId) {
      if (daLista()) { return pronto(VLTV.m3u.itens('filmes', categoriaId)); }
      return chamar('get_vod_streams', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // Detalhes de um filme (sinopse, fundo, gênero, elenco...). Devolve o objeto "info" do painel.
    infoFilme: function (filmeId) {
      if (daLista()) { return pronto({}); }
      return chamar('get_vod_info', '&vod_id=' + enc(filmeId)).then(function (dados) {
        return (dados && dados.info && typeof dados.info === 'object') ? dados.info : {};
      });
    },

    // ── Séries ──────────────────────────────────────────────────────
    categoriasSeries: function () {
      if (daLista()) { return pronto(VLTV.m3u.categorias('series')); }
      return chamar('get_series_categories').then(comoLista);
    },

    seriesPorCategoria: function (categoriaId) {
      if (daLista()) { return pronto(VLTV.m3u.itens('series', categoriaId)); }
      return chamar('get_series', '&category_id=' + enc(categoriaId)).then(comoLista);
    },

    // Devolve { info, temporadas: [{ numero, episodios: [...] }] } com as temporadas em ordem.
    infoSerie: function (serieId) {
      if (daLista()) { return pronto(VLTV.m3u.infoSerie(serieId)); }
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
