// VLTV Play - webOS | Perfil infantil: decide, pelo CONTEÚDO, o que uma criança pode ver.
//
// Regras (nesta ordem):
//  1. Adulto (marcado pelo painel, nome ou categoria adulta) nunca aparece.
//  2. Categoria só de criança ("Infantil", "Desenhos", "Kids", "Cartoon"...) é confiável: mostra tudo dela,
//     menos animação de adulto (South Park, Rick e Morty...) e canais de esporte/HBO.
//  3. Qualquer outra categoria (Disney+, Animes, Ação, Marvel...) só mostra o título que for conhecido como infantil:
//     lista de franquias conhecidas + títulos infantis/família do TMDB (baixados uma vez e guardados 14 dias).
//  4. "Para a família" (Filmes/Séries) e "Desenhos 24 horas" (Canais) juntam, de todas as categorias, o que passou na regra 3.
(function () {
  'use strict';

  var CHAVE_SET = 'vltv_kids_set2';
  var CHAVE_CLS = 'vltv_kids_cls1';
  var VALIDADE_MS = 14 * 24 * 3600 * 1000;
  var API = 'https://api.themoviedb.org/3';

  // Categoria feita só para criança.
  var CAT_KIDS = /kids|infantil|infantis|crian[cç]|desenho|cartoon|toon|nick|gloob|baby|junior|pixar|turma da m[oô]nica|mickey|anima[cç]/i;
  // Categoria de nome "misto" (aparece na lista, mas os títulos são conferidos um a um).
  var CAT_MISTA = /disney|dreamworks|anime|marvel|fam[ií]lia|familia|fantasia|aventura/i;
  // Nunca é para criança, mesmo com nome parecido (ex.: canais "DISNEY+ | HBO MAX" são esporte/PPV).
  var CAT_NEGA = /hbo|\bmax\b|esporte|sport|futebol|ppv|premiere|combate|telecine|adult|xxx|\+\s?18|18\s?\+|\bufc\b|\bnba\b|\bnfl\b|bbb|reality|novela|noticia|pay.?per.?view/i;

  // Animação/série feita para adultos (aparece em categorias de animação, mas não é para criança).
  var ADULTO_ANIM = /south park|rick (and|e) morty|family guy|familia da pesada|american dad|bojack|big mouth|\barcher\b|futurama|king of the hill|bob s burgers|harley quinn|invincible|castlevania|\barcane\b|love death|hazbin|helluva|final space|solar opposites|paradise pd|disenchantment|tuca (and|e) bertie|f is for family|beavis|ren (and|e) stimpy|sausage party|fritz the cat|aqua teen|metalocalypse|robot chicken|drawn together|blood of zeus|vox machina|cyberpunk|devilman|berserk|attack on titan|ataque dos titas|death note|tokyo ghoul|jujutsu|chainsaw|demon slayer|hellsing|elfen|gantz|high school of the dead|ecchi|hentai|nsfw/i;

  // Franquias e títulos infantis/família conhecidos (cobre o que o TMDB pode não trazer, e funciona sem internet).
  // Franquias de nome próprio (basta o nome conter).
  var TITULOS = new RegExp('(?:^| )(?:' + [
    'patrulha canina|paw patrol|peppa|bluey|pocoyo|cocomelon|galinha pintadinha|mundo bita|show da luna|pj masks|peixonauta',
    'homem aranha|spider man|aranhaverso|spider verse|vingadores mais poderosos',
    'barbie|monster high|polly pocket|my little pony|hello kitty|moranguinho|ursinhos carinhosos|care bears',
    'harry potter|animais fantasticos|cronicas de narnia|jumanji|percy jackson',
    'toy story|kung fu panda|como treinar|ice age|era do gelo|meu malvado favorito|despicable me|procurando nemo|procurando dory',
    'os incriveis|ratatouille|divertida mente|inside out|rei leao|lion king|bela e a fera|branca de neve|pequena sereia',
    'livro da selva|peter pan|101 dalmatas|aristogatas|dama e o vagabundo|bernardo e bianca|corcunda de notre dame|hotel transilvania',
    'super mario|angry birds|bob esponja|spongebob|scooby|tom e jerry|tom and jerry|looney tunes|pica pau|mickey|minnie|pateta|pato donald|tio patinhas|ducktales',
    'smurfs|turma da monica|sitio do pica|ursinho pooh|winnie|miraculous|ladybug|ben 10|padrinhos magicos|jimmy neutron',
    'meninas superpoderosas|hora de aventura|adventure time|steven universe|jovens titas|teen titans go|backyardigans|thomas e seus amigos',
    'power rangers|tartarugas ninja|hot wheels|thundercats|pokemon|digimon|yu gi oh|beyblade|cavaleiros do zodiaco|sailor moon',
    'dragon ball|naruto|one piece|my hero academia|boruto|bakugan|inuyasha|doraemon|shin chan|princesa sofia|doutora brinquedos',
    'vampirina|jake e os piratas|escola de monstros|high school musical|hannah montana|patati patata|carrossel|chiquititas',
    'mary poppins|noviça rebelde|charlie e a fabrica de chocolate|willy wonka|esqueceram de mim|paddington|stuart little',
    'monstros sa|universidade monstros|vida de inseto|turning red|space jam|fantasia 2000|liga da justica mirim|kung fu panda|os smurfs',
    'lego ninjago|lego star wars|lego batman|lego movie|lego city|lego friends|lego marvel'
  ].join('|') + ')(?: |$)', 'i');

  // Títulos de uma palavra só (ou curtos): só valem se o nome for exatamente este (com número ou subtítulo depois),
  // para "Carros Usados", "O Jogo das Chaves" e "Cinderela Pop" não entrarem.
  var TITULOS_EXATOS = new RegExp('^(?:o |a |os |as |um |uma )?(?:' + [
    'aladdin|wicked|frozen|moana|vaiana|encanto|carros|cars|shrek|madagascar|minions|coco|luca|red crescer|zootopia|zootropolis',
    'cinderela|mulan|pocahontas|tarzan|hercules|rapunzel|enrolados|tangled|valente|brave|lilo e stitch|stitch|dumbo|bambi|mogli',
    'trolls|sonic|ferdinando|gato de botas|smurfs|chaves|chapolin|heidi|dora|clifford|caillou|transformers|matilda|garfield|snoopy',
    'raya|wall e|megamente|asterix|tintim|masha|barbie|shazam|descendentes|violetta|xuxa|pinoquio|robin hood|alice no pais das maravilhas',
    'a pequena sereia|o rei leao|a bela e a fera|o corcunda de notre dame|dinossauro|operacao resgate'
  ].join('|') + ')(?: [0-9]+| [ivx]+)?(?: (?:o|a|os|as|um|uma|e|do|da|dos|das|no|na|em|para|de) .*)?$', 'i');

  var conjunto = null;      // { 'titulo normalizado': 1 } vindo do TMDB
  var carregando = false;
  var memo = {};            // 'tipo|id|cat' -> true/false (evita refazer a conta por título)
  var confiaveis = {};      // 'tipo|category_id' -> true (categoria só de criança)
  var nomesCat = {};        // 'tipo|category_id' -> nome da categoria

  function norm(t) {
    var s = String(t || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* TV sem normalize */ }
    return s.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  // Nome do item sem tags/ano/entre parênteses, só para comparar com o TMDB.
  function nomeCurto(nome) {
    var s = String(nome || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/^\s*(BR|SP|PT|PTBR|LEG|DUB)\s*[:\-–]\s+/i, '');
    s = s.replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|dublado|legendado|dual|nacional|leg|dub)\b/gi, ' ');
    s = s.replace(/\bS\d{1,2}\s?E\d{1,3}\b|\bT\d{1,2}\b|\btemporada\s*\d+\b/gi, ' ');
    s = s.replace(/\b(19|20)\d{2}\b/g, ' ');
    return norm(s);
  }

  // ── Títulos do TMDB (infantil e família) ──────────────────────────
  function lerGuardado() {
    try {
      var o = JSON.parse(window.localStorage.getItem(CHAVE_SET) || 'null');
      if (!o || !o.t || !o.l || new Date().getTime() - o.t > VALIDADE_MS) { return null; }
      var c = {};
      o.l.split('|').forEach(function (n) { if (n) { c[n] = 1; } });
      return c;
    } catch (e) { return null; }
  }

  function chaveTmdb() {
    var k = VLTV.config && VLTV.config.TMDB_API_KEY;
    return (typeof k === 'string' && k.length > 10 && k.indexOf('__') !== 0) ? k : '';
  }

  // Baixa (em segundo plano, uma página por vez) os títulos populares de animação/família/infantil. Só uma vez a cada 14 dias.
  function aquecer() {
    if (conjunto || carregando) { return; }
    var g = lerGuardado();
    if (g) { conjunto = g; memo = {}; return; }
    var k = chaveTmdb();
    if (!k || !VLTV.http) { return; }
    carregando = true;
    var novo = {};
    var pedidos = [];
    var feitos = 0;
    var p;
    for (p = 1; p <= 8; p++) {
      pedidos.push(API + '/discover/movie?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&include_adult=false&vote_count.gte=40' +
        '&with_genres=' + encodeURIComponent('16|10751') + '&certification_country=US&certification.lte=PG-13&page=' + p);
      pedidos.push(API + '/discover/tv?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&include_adult=false&vote_count.gte=20' +
        '&with_genres=' + encodeURIComponent('10762|10751|16') + '&page=' + p);
    }
    // O que está no Disney+ (Brasil) em animação, família e infantil: Disney tem muita série/filme infantil com nome que o painel escreve diferente.
    for (p = 1; p <= 8; p++) {
      pedidos.push(API + '/discover/tv?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&with_watch_providers=337&watch_region=BR' +
        '&with_genres=' + encodeURIComponent('10762|10751|16') + '&page=' + p);
      pedidos.push(API + '/discover/movie?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&include_adult=false&with_watch_providers=337&watch_region=BR' +
        '&with_genres=' + encodeURIComponent('10751|16') + '&certification_country=US&certification.lte=PG&page=' + p);
    }
    function fim() {
      carregando = false;
      if (feitos < 8) { return; }   // quase tudo falhou: tenta de novo na próxima vez
      conjunto = novo;
      memo = {};
      try { window.localStorage.setItem(CHAVE_SET, JSON.stringify({ t: new Date().getTime(), l: Object.keys(novo).join('|') })); } catch (e) { /* ignora */ }
    }
    function proximo() {
      if (pedidos.length === 0) { fim(); return; }
      var url = pedidos.shift();
      VLTV.http.fetchComTimeout(url, 8000).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        ((j && j.results) || []).forEach(function (x) {
          [x.title, x.original_title, x.name, x.original_name].forEach(function (t) {
            var n = norm(t);
            if (n.length >= 4 && !ADULTO_ANIM.test(n)) { novo[n] = 1; }
          });
        });
        feitos++;
      }, function () { /* pula esta página */ }).then(function () { setTimeout(proximo, 400); });
    }
    setTimeout(proximo, 2500);
  }

  // ── Conferência título a título no TMDB (para categorias "mistas", como Disney+) ─────────────
  // O TMDB diz o gênero de cada título: Família / Infantil / Animação (sem ser de adulto) = pode. Resultado guardado na TV.
  var cls = null;           // { 'nome curto': 1 (infantil) | 0 (não) }
  var salvarTimer = null;
  var fila = [];
  var ativas = 0;
  var emFila = {};
  var esperando = null;
  var GENEROS_NAO = { 80: 1, 27: 1, 53: 1, 9648: 1, 10768: 1, 10766: 1, 37: 1, 10752: 1 };   // crime, terror, suspense, mistério, política, novela, faroeste, guerra

  function carregarCls() {
    if (cls) { return cls; }
    try { cls = JSON.parse(window.localStorage.getItem(CHAVE_CLS) || 'null') || {}; } catch (e) { cls = {}; }
    return cls;
  }

  function salvarCls() {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(function () {
      try { window.localStorage.setItem(CHAVE_CLS, JSON.stringify(cls)); } catch (e) { /* sem espaço */ }
    }, 1500);
  }

  function infantilPorGeneros(ids, r) {
    var g = {};
    (ids || []).forEach(function (i) { g[i] = 1; });
    var n = norm(r.title || r.name || r.original_title || r.original_name);
    if (ADULTO_ANIM.test(n)) { return 0; }
    var ruim = false;
    Object.keys(GENEROS_NAO).forEach(function (k) { if (g[k]) { ruim = true; } });
    if (ruim) { return 0; }
    if (g[10762] || g[10751]) { return 1; }
    if (g[16] && !g[18]) { return 1; }   // animação sem drama pesado
    return 0;
  }

  function classificarUm(tipo, nome, fim) {
    var busca = VLTV.titulo.paraBusca(nome);
    var tt = tipo === 'series' ? 'tv' : 'movie';
    var url = API + '/search/' + tt + '?api_key=' + chaveTmdb() + '&language=pt-BR&include_adult=false&query=' + encodeURIComponent(busca.query) +
      (busca.ano ? (tt === 'tv' ? '&first_air_date_year=' : '&year=') + busca.ano : '');
    VLTV.http.fetchComTimeout(url, 8000).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) { fim(null); return; }               // falha de rede: tenta de novo outra hora
      var lista = j.results || [];
      var q = norm(busca.query);
      var achado = null;
      for (var i = 0; i < lista.length && i < 5 && !achado; i++) {
        var x = lista[i];
        if ([x.title, x.name, x.original_title, x.original_name].map(norm).indexOf(q) !== -1) { achado = x; }
      }
      if (!achado && lista.length > 0 && !busca.ano) { achado = lista[0]; }
      fim(achado ? infantilPorGeneros(achado.genre_ids, achado) : 0);
    }, function () { fim(null); });
  }

  function bombear() {
    while (ativas < 6 && fila.length > 0) {
      (function (it) {
        ativas++;
        classificarUm(it.tipo, it.nome, function (v) {
          ativas--;
          delete emFila[it.chave];
          if (v !== null) { cls[it.chave] = v; salvarCls(); memo = {}; }
          if (ativas === 0 && fila.length === 0 && esperando) { esperando(); }
          bombear();
        });
      })(fila.shift());
    }
  }

  // Lista de uma categoria "mista": confere no TMDB os títulos ainda desconhecidos e espera até `ms` pelo resultado.
  // O que não terminar a tempo continua em segundo plano (vale na próxima vez que abrir).
  function preparar(lista, tipo, ms) {
    if (!Array.isArray(lista) || !chaveTmdb() || !VLTV.http) { return Promise.resolve(lista); }
    carregarCls();
    lista.forEach(function (raw) {
      if (!raw || VLTV.parental.itemAdulto(raw, tipo)) { return; }
      var n = nomeCurto(raw.name);
      if (n.length < 2 || cls[n] !== undefined || emFila[n] || conhecido(raw.name) || ADULTO_ANIM.test(n)) { return; }
      emFila[n] = 1;
      fila.push({ chave: n, tipo: tipo, nome: raw.name });
    });
    if (fila.length === 0 && ativas === 0) { return Promise.resolve(lista); }
    return new Promise(function (resolve) {
      var feito = false;
      function sai() { if (feito) { return; } feito = true; esperando = null; resolve(lista); }
      esperando = sai;
      setTimeout(sai, ms || 8000);
      bombear();
    });
  }

  function confiavel(tipo, id) { return !!confiaveis[tipo + '|' + id]; }

  // ── Categorias ────────────────────────────────────────────────────
  function categorias(tipo, lista) {
    var saida = [];
    (Array.isArray(lista) ? lista : []).forEach(function (c) {
      if (!c) { return; }
      var n = String(c.category_name || '');
      var id = tipo + '|' + c.category_id;
      nomesCat[id] = n;
      if (CAT_NEGA.test(n)) { return; }
      if (CAT_KIDS.test(n)) { confiaveis[id] = true; saida.push(c); return; }
      if (CAT_MISTA.test(n)) { saida.push(c); }
    });
    if (tipo === 'canais') { saida.push({ category_id: '__kids24__', category_name: 'DESENHOS 24 HORAS' }); }
    else { saida.push({ category_id: '__kids_familia__', category_name: 'PARA A FAMÍLIA' }); }
    return saida;
  }

  // ── Item ──────────────────────────────────────────────────────────
  function conhecido(nome) {
    var bruto = norm(nome);
    if (TITULOS_EXATOS.test(bruto)) { return true; }
    if (TITULOS.test(bruto)) { return true; }
    if (conjunto) {
      var n = nomeCurto(nome);
      if (n.length >= 4 && conjunto[n]) { return true; }
    }
    return false;
  }

  function calcular(raw, tipo) {
    var nome = String(raw.name || '');
    if (ADULTO_ANIM.test(norm(nome))) { return false; }
    var idc = tipo + '|' + raw.category_id;
    var catNome = nomesCat[idc] || '';
    if (catNome && CAT_NEGA.test(catNome)) { return false; }
    if (tipo === 'canais') {
      if (/esporte|sport|espn|futebol|ppv|premiere|combate|hbo|\bmax\b|telecine|\bufc\b/i.test(nome)) { return false; }
      if (confiaveis[idc]) { return true; }
      return VLTV.parental.ehNomeInfantil(nome);
    }
    if (confiaveis[idc]) { return true; }
    if (conhecido(nome)) { return true; }
    return carregarCls()[nomeCurto(nome)] === 1;
  }

  function ok(raw, tipo) {
    if (!raw) { return false; }
    if (VLTV.parental.itemAdulto(raw, tipo)) { return false; }
    var id = raw.stream_id !== undefined ? raw.stream_id : (raw.series_id !== undefined ? raw.series_id : raw.id);
    if (id === undefined || id === null) { return calcular(raw, tipo); }
    var k = tipo + '|' + id + '|' + raw.category_id;
    var v = memo[k];
    if (v === undefined) { v = calcular(raw, tipo); memo[k] = v; }
    return v;
  }

  VLTV.kids = { categorias: categorias, ok: ok, aquecer: aquecer, ehConhecido: conhecido, preparar: preparar, confiavel: confiavel };
})();
