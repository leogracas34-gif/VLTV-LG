// VLTV Play - webOS | Índice de títulos do painel (Filmes e Séries).
// Usa as MESMAS listas por categoria que o Catálogo já guarda na TV (sync.js), então nada é baixado duas vezes.
// Serve para duas coisas:
//   1) Pesquisa (lupa) dentro de Filmes e de Séries;
//   2) Achar no SEU painel o título que o banner da Home mostra. Os destaques vêm da VPS, e o código
//      (id) deles pode não ser o mesmo do painel: por isso o banner procura pelo nome e usa o id do painel.
(function () {
  'use strict';

  var CONCORRENTES = 3;          // categorias baixando ao mesmo tempo
  var MAX_RESULTADOS = 300;

  var FONTES = {
    filmes: {
      campoId: 'stream_id',
      categorias: function () { return VLTV.api.categoriasFilmes(); },
      itens: function (id) { return VLTV.api.filmesPorCategoria(id); }
    },
    series: {
      campoId: 'series_id',
      categorias: function () { return VLTV.api.categoriasSeries(); },
      itens: function (id) { return VLTV.api.seriesPorCategoria(id); }
    }
  };

  var donoAtual = '';
  var estados = {};
  var pausado = false;           // vídeo tocando: o preparo em segundo plano espera, para não competir com a rede
  var aquecidoPara = '';         // conta que já teve o preparo automático agendado

  // Banner e pesquisa nunca mostram conteúdo adulto (mesma regra do controle parental).
  function adulta(nome) {
    return VLTV.parental.ehCategoriaAdulta(nome) || VLTV.parental.ehNomeAdulto(nome);
  }

  function dono() {
    var s = VLTV.sessao.ler();
    return s ? (s.modo + '|' + s.dns + '|' + s.user + '|' + (s.m3u || '')) : '';
  }

  // Cada conta tem o seu índice; trocou de conta, começa do zero.
  function estado(tipo) {
    var d = dono();
    if (d !== donoAtual) { donoAtual = d; estados = {}; }
    if (!estados[tipo]) {
      estados[tipo] = {
        cats: null,
        listas: {},        // category_id -> lista
        unico: [],         // todos os títulos, sem repetir
        nomes: [],         // nome normalizado de cada título (mesma ordem de "unico")
        ids: {},
        feitas: 0,
        total: 0,
        completo: false,
        promessa: null,
        ouvinte: null
      };
    }
    return estados[tipo];
  }

  function norm(texto) {
    var t = String(texto || '').toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* TV sem normalize */ }
    return t.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function categorias(tipo) {
    var e = estado(tipo);
    if (e.cats) { return Promise.resolve(e.cats); }
    return VLTV.sync.obter(tipo + '|cats', FONTES[tipo].categorias).then(function (r) {
      e.cats = (Array.isArray(r.dados) ? r.dados : []).filter(function (c) { return !adulta(c.category_name); });
      return e.cats;
    });
  }

  // Mesma chave do Catálogo: se a categoria já foi aberta lá, vem na hora.
  function listaDe(tipo, cat) {
    var e = estado(tipo);
    var id = cat.category_id;
    if (e.listas[id]) { return Promise.resolve(e.listas[id]); }
    var chave = tipo + '|itens|' + id;
    return VLTV.sync.obter(chave, function () { return FONTES[tipo].itens(id); }).then(function (r) {
      e.listas[id] = Array.isArray(r.dados) ? r.dados : [];
      return e.listas[id];
    });
  }

  // Passa pelas categorias (3 por vez). aoLista(lista, categoria) a cada uma que chega.
  // parar(): se devolver true, para de pegar as próximas.
  // quieto: preparo em segundo plano; espera enquanto um vídeo toca.
  function percorrer(tipo, aoLista, parar, quieto) {
    return categorias(tipo).then(function (cats) {
      return new Promise(function (resolve) {
        var i = 0;
        var ativos = 0;
        var fim = false;
        function terminar() { if (!fim) { fim = true; resolve(); } }
        function proxima() {
          if (fim) { return; }
          if (quieto && pausado) { setTimeout(proxima, 1500); return; }
          if (parar && parar()) { terminar(); return; }
          if (i >= cats.length) { if (ativos === 0) { terminar(); } return; }
          var cat = cats[i++];
          ativos++;
          listaDe(tipo, cat).then(function (l) { return l; }, function () { return []; }).then(function (l) {
            ativos--;
            if (!fim) { aoLista(l, cat); }
            proxima();
          });
        }
        if (cats.length === 0) { terminar(); return; }
        for (var k = 0; k < CONCORRENTES; k++) { proxima(); }
      });
    });
  }

  // ── Pesquisa ──────────────────────────────────────────────────────
  // Começa (uma vez só) a juntar todas as categorias num índice. Pode ser chamada várias vezes.
  function preparar(tipo, quieto) {
    var e = estado(tipo);
    if (e.promessa) { return e.promessa; }
    var campo = FONTES[tipo].campoId;
    e.promessa = categorias(tipo).then(function (cats) {
      e.total = cats.length;
      return percorrer(tipo, function (lista) {
        lista.forEach(function (raw) {
          var id = raw[campo];
          if (id === undefined || id === null || e.ids[id]) { return; }
          e.ids[id] = true;
          e.unico.push(raw);
          e.nomes.push(norm(raw.name));
        });
        e.feitas++;
        if (e.ouvinte) { e.ouvinte(e.feitas, e.total); }
      }, null, !!quieto);
    }).then(function () {
      e.completo = true;
      if (e.ouvinte) { e.ouvinte(e.total, e.total); }
    }, function () {
      e.promessa = null;        // falhou: da próxima vez tenta de novo
      if (e.ouvinte) { e.ouvinte(-1, e.total); }
    });
    return e.promessa;
  }

  // Deixa a pesquisa pronta antes de o usuário pedir: depois que a Home abre, a TV monta sozinha, em
  // segundo plano, o índice de Filmes e depois o de Séries. Quando a lupa é aberta, já está tudo na memória.
  function aquecer() {
    var d = dono();
    if (!d || d === aquecidoPara) { return; }
    aquecidoPara = d;
    setTimeout(function () {
      try {
        preparar('filmes', true).then(function () { return preparar('series', true); });
      } catch (e) { /* a pesquisa tenta de novo quando for aberta */ }
    }, 3000);
  }

  function pausar(sim) { pausado = !!sim; }

  // fn(feitas, total) é chamada quando chega mais uma categoria (-1 = falhou). null para parar de ouvir.
  function ouvir(tipo, fn) { estado(tipo).ouvinte = fn; }

  function progresso(tipo) {
    var e = estado(tipo);
    return { feitas: e.feitas, total: e.total, completo: e.completo };
  }

  // Devolve os títulos que têm TODAS as palavras digitadas (os que começam com a busca vêm primeiro).
  function pesquisar(tipo, texto) {
    var e = estado(tipo);
    var q = norm(texto);
    if (q === '') { return []; }
    var palavras = q.split(' ');
    var comecam = [];
    var contem = [];
    for (var i = 0; i < e.unico.length; i++) {
      var n = e.nomes[i];
      var ok = true;
      for (var p = 0; p < palavras.length; p++) {
        if (n.indexOf(palavras[p]) === -1) { ok = false; break; }
      }
      if (!ok) { continue; }
      if (n.indexOf(q) === 0) { comecam.push(e.unico[i]); } else { contem.push(e.unico[i]); }
      if (comecam.length + contem.length >= MAX_RESULTADOS * 3) { break; }
    }
    return comecam.concat(contem).slice(0, MAX_RESULTADOS);
  }

  // ── Achar no painel o título que veio da VPS ──────────────────────
  // Procura pelo nome (e ano, quando tem). Resolve com { raw, lista } (raw = item do SEU painel, lista = a
  // categoria onde ele está, usada nas sugestões) ou null se este painel não tem o título.
  function achar(tipo, nomeBruto) {
    var campo = FONTES[tipo].campoId;
    var busca = VLTV.titulo.paraBusca(nomeBruto);
    var alvo = norm(busca.query);
    if (alvo === '') { return Promise.resolve(null); }
    var melhor = null;
    var melhorLista = null;
    var melhorPontos = 0;

    function avaliar(lista) {
      for (var i = 0; i < lista.length; i++) {
        var raw = lista[i];
        if (raw[campo] === undefined || raw[campo] === null) { continue; }
        if (norm(raw.name).indexOf(alvo) === -1) { continue; }            // filtro barato
        var b = VLTV.titulo.paraBusca(raw.name);
        if (norm(b.query) !== alvo) { continue; }
        var pontos = (busca.ano && b.ano) ? (String(busca.ano) === String(b.ano) ? 3 : 1) : 2;
        if (pontos > melhorPontos) { melhorPontos = pontos; melhor = raw; melhorLista = lista; }
      }
    }

    return percorrer(tipo, avaliar, function () { return melhorPontos >= 2; }).then(function () {
      return melhor ? { raw: melhor, lista: melhorLista } : null;
    });
  }

  VLTV.indice = { preparar: preparar, aquecer: aquecer, pausar: pausar, ouvir: ouvir, progresso: progresso, pesquisar: pesquisar, achar: achar };
})();
