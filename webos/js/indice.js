// VLTV Play - webOS | Índice de títulos do painel (Filmes e Séries).
// Usa as MESMAS listas por categoria que o Catálogo já guarda na TV (sync.js), então nada é baixado duas vezes.
// Serve para duas coisas:
//   1) Pesquisa (lupa) dentro de Filmes e de Séries;
//   2) Achar no SEU painel o título que o banner da Home mostra. Os destaques vêm da VPS, e o código
//      (id) deles pode não ser o mesmo do painel: por isso o banner procura pelo nome e usa o id do painel.
(function () {
  'use strict';

  var CONCORRENTES = 4;          // categorias baixando ao mesmo tempo
  var ESPERA_RETENTATIVA_MS = 3000;   // categoria que falhou: tenta de novo depois de 3 s, 6 s e 9 s
  var RETENTATIVAS = 3;
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
        feitasPor: {},     // category_id -> true (categorias já juntadas no índice)
        total: 0,
        completo: false,
        promessa: null,
        ouvinte: null,
        pelaVps: false,    // índice completo veio da VPS (guardado na TV)
        versao: ''
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
      var cats = (Array.isArray(r.dados) ? r.dados : []).filter(function (c) { return !adulta(c.category_name); });
      // Lista de categorias vazia quase sempre é falha do painel: não guarda, para tentar de novo.
      if (cats.length === 0) { throw new Error('sem categorias'); }
      e.cats = cats;
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

  // Passa pelas categorias (4 por vez). aoLista(lista, categoria) a cada uma que chega.
  // parar(): se devolver true, para de pegar as próximas.
  // quieto: preparo em segundo plano; espera enquanto um vídeo toca.
  // apenas: só estas categorias (usado para tentar de novo as que falharam).
  // Resolve com as categorias que falharam (a lista delas NÃO é chamada em aoLista).
  function percorrer(tipo, aoLista, parar, quieto, apenas) {
    return categorias(tipo).then(function (todas) {
      var cats = apenas || todas;
      return new Promise(function (resolve) {
        var i = 0;
        var ativos = 0;
        var fim = false;
        var falhas = [];
        function terminar() { if (!fim) { fim = true; resolve(falhas); } }
        function proxima() {
          if (fim) { return; }
          if (quieto && pausado) { setTimeout(proxima, 1500); return; }
          if (parar && parar()) { terminar(); return; }
          if (i >= cats.length) { if (ativos === 0) { terminar(); } return; }
          var cat = cats[i++];
          ativos++;
          listaDe(tipo, cat).then(function (l) {
            ativos--;
            if (!fim) { aoLista(l, cat); }
            proxima();
          }, function () {
            ativos--;
            falhas.push(cat);
            proxima();
          });
        }
        if (cats.length === 0) { terminar(); return; }
        for (var k = 0; k < CONCORRENTES; k++) { proxima(); }
      });
    });
  }

  // ── Índice completo vindo da VPS ──────────────────────────────────
  // A VPS monta o catálogo inteiro (todas as categorias, sem repetir) e a TV guarda no armazenamento dela.
  // Nas próximas vezes a pesquisa abre na hora com o que está guardado e a TV só pergunta se mudou (versão).
  var ESPERA_VPS_MS = 4000;      // VPS ainda montando o índice: pergunta de novo a cada 4 s
  var MAX_ESPERAS_VPS = 60;      // até ~4 minutos
  var TEMPO_DOWNLOAD_MS = 180000;

  function chaveArmazem(tipo) { return dono() + '|vltv_idx2_' + tipo; }

  function usaVps() {
    var s = VLTV.sessao.ler();
    return !!s && s.modo !== 'm3u' && !VLTV.m3u.ativo();
  }

  function aplicarIndice(e, itens, nomes) {
    var campo = null;
    var unico = [];
    var nms = [];
    var ids = {};
    for (var i = 0; i < itens.length; i++) {
      var raw = itens[i];
      if (campo === null) { campo = raw.series_id !== undefined && raw.stream_id === undefined ? 'series_id' : 'stream_id'; }
      var id = raw[campo];
      if (id === undefined || id === null || ids[id]) { continue; }
      if (raw.cn && adulta(raw.cn)) { continue; }
      ids[id] = true;
      unico.push(raw);
      nms.push(nomes && nomes.length === itens.length ? nomes[i] : norm(raw.name));
    }
    e.unico = unico; e.nomes = nms; e.ids = ids;
  }

  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  function consultarVps(tipo, e, versao, tentativa) {
    var s = VLTV.sessao.ler();
    if (!s) { return Promise.resolve({ estado: 'erro' }); }
    var url = s.dns + '/player_api.php?username=' + encodeURIComponent(s.user) + '&password=' + encodeURIComponent(s.pass) +
      '&action=vltv_indice&tipo=' + tipo + (versao ? '&v=' + encodeURIComponent(versao) : '');
    return VLTV.http.fetchComTimeout(url, TEMPO_DOWNLOAD_MS).then(function (r) {
      if (!r.ok) { return { estado: r.status === 404 ? 'antigo' : 'erro' }; }
      return r.json();
    }).then(function (j) {
      if (j && j.estado) { return j; }
      if (!j || j.ok !== true) { return { estado: 'antigo' }; }   // gateway sem o índice (ainda não atualizado)
      if (j.pronto === false) {
        if (tentativa >= MAX_ESPERAS_VPS) { return { estado: 'erro' }; }
        return esperar(ESPERA_VPS_MS).then(function () { return consultarVps(tipo, e, versao, tentativa + 1); });
      }
      return { estado: 'ok', dados: j };
    }, function () { return { estado: 'erro' }; });
  }

  // Resolve true se há índice utilizável (guardado ou novo); false se precisa do caminho por categorias.
  function viaVps(tipo, quieto) {
    var e = estado(tipo);
    var k = chaveArmazem(tipo);
    return VLTV.armazem.ler(k).then(function (reg) {
      var v = reg && reg.valor;
      var temLocal = !!(v && Array.isArray(v.itens) && v.itens.length);
      if (temLocal) {
        aplicarIndice(e, v.itens, v.nomes);
        e.versao = v.v || '';
        e.pelaVps = true;
        e.completo = true;
        e.total = 1;
        if (e.ouvinte) { e.ouvinte(1, 1); }
      }
      // Guardado há menos de 30 min: nem pergunta à VPS (ligar e desligar a TV não baixa nada).
      var recente = temLocal && reg.t && (new Date().getTime() - reg.t) < 30 * 60 * 1000;
      function quando() {
        if (recente) { return Promise.resolve({ estado: 'recente' }); }
        if (quieto && pausado) { return esperar(1500).then(quando); }
        return consultarVps(tipo, e, temLocal ? e.versao : '', 0);
      }
      return quando().then(function (r) {
        if (r.estado !== 'ok') { return temLocal; }
        var d = r.dados;
        if (d.mudou === false) {
          if (d.completo === false) { e.completo = false; e.promessa = null; }   // VPS ainda sem tudo: pergunta de novo depois
          return true;
        }
        if (!Array.isArray(d.itens) || d.itens.length === 0) { return temLocal; }
        aplicarIndice(e, d.itens, null);
        e.versao = d.v || '';
        e.pelaVps = true;
        e.total = 1;
        e.completo = d.completo !== false;
        if (!e.completo) { e.promessa = null; }                     // incompleto: a próxima pesquisa pergunta de novo
        VLTV.armazem.gravar(k, { v: e.versao, itens: d.itens, nomes: e.nomes.length === d.itens.length ? e.nomes : null });
        if (e.ouvinte) { e.ouvinte(1, 1); }
        return true;
      });
    });
  }

  // ── Pesquisa ──────────────────────────────────────────────────────
  // Começa (uma vez só) a montar o índice. Pode ser chamada várias vezes.
  function preparar(tipo, quieto) {
    var e = estado(tipo);
    if (e.promessa) { return e.promessa; }
    if (!usaVps()) { return porCategoria(tipo, quieto); }
    e.promessa = viaVps(tipo, quieto).then(function (ok) {
      if (ok) { return; }
      e.promessa = null;
      return porCategoria(tipo, quieto);      // gateway ainda sem o índice: usa as categorias, como antes
    }, function () {
      e.promessa = null;
      return porCategoria(tipo, quieto);
    });
    return e.promessa;
  }

  // Caminho por categorias (listas M3U e gateway sem o índice).
  function porCategoria(tipo, quieto) {
    var e = estado(tipo);
    var campo = FONTES[tipo].campoId;
    var incompleto = false;
    function juntar(lista, cat) {
      lista.forEach(function (raw) {
        var id = raw[campo];
        if (id === undefined || id === null || e.ids[id]) { return; }
        e.ids[id] = true;
        e.unico.push(raw);
        e.nomes.push(norm(raw.name));
      });
      if (!e.feitasPor[cat.category_id]) { e.feitasPor[cat.category_id] = true; e.feitas++; }
      if (e.ouvinte) { e.ouvinte(e.feitas, e.total); }
    }
    // Categoria que falhou (rede, tempo esgotado) é tentada de novo; o índice só fica "completo" com todas elas.
    function rodada(pendentes, tentativa) {
      return percorrer(tipo, juntar, null, !!quieto, pendentes).then(function (falhas) {
        if (falhas.length === 0) { return; }
        if (tentativa >= RETENTATIVAS) { incompleto = true; return; }
        return new Promise(function (ok) { setTimeout(ok, ESPERA_RETENTATIVA_MS * (tentativa + 1)); })
          .then(function () { return rodada(falhas, tentativa + 1); });
      });
    }
    e.promessa = categorias(tipo).then(function (cats) {
      e.total = cats.length;
      return rodada(cats, 0);
    }).then(function () {
      if (incompleto) {
        e.promessa = null;        // faltou categoria: a próxima pesquisa tenta só as que faltam
        if (e.ouvinte) { e.ouvinte(-1, e.total); }
        return;
      }
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

    var e = estado(tipo);
    if (e.pelaVps && e.unico.length) {
      avaliar(e.unico);
      if (!melhor) { return Promise.resolve(null); }
      var catId = melhor.category_id;
      melhorLista = e.unico.filter(function (x) { return x.category_id === catId; });
      return Promise.resolve({ raw: melhor, lista: melhorLista });
    }
    return percorrer(tipo, avaliar, function () { return melhorPontos >= 2; }).then(function () {
      return melhor ? { raw: melhor, lista: melhorLista } : null;
    });
  }

  VLTV.indice = { preparar: preparar, aquecer: aquecer, pausar: pausar, ouvir: ouvir, progresso: progresso, pesquisar: pesquisar, achar: achar };
})();
