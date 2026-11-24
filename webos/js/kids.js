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

  var CHAVE_SET = 'vltv_kids_set1';
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
  var TITULOS = new RegExp('\\b(?:' + [
    'patrulha canina|paw patrol|peppa|bluey|pocoyo|masha|cocomelon|galinha pintadinha|mundo bita|show da luna|pj masks|peixonauta',
    'homem aranha|spider man|aranhaverso|spider verse|vingadores mais poderosos',
    'barbie|monster high|polly pocket|my little pony|hello kitty|moranguinho|ursinhos carinhosos|care bears',
    'harry potter|animais fantasticos|cronicas de narnia|jumanji|percy jackson|shazam',
    'aladdin|wicked|frozen|moana|vaiana|encanto|toy story|carros|cars|shrek|madagascar|kung fu panda|como treinar|ice age|era do gelo',
    'minions|meu malvado favorito|procurando nemo|procurando dory|os incriveis|ratatouille|divertida mente|inside out|coco|luca|red crescer',
    'zootopia|zootropolis|rei leao|lion king|bela e a fera|cinderela|branca de neve|pequena sereia|mulan|pocahontas|tarzan|hercules',
    'rapunzel|enrolados|lilo|stitch|dumbo|bambi|mogli|livro da selva|peter pan|alice no pais|101 dalmatas|aristogatas|dama e o vagabundo',
    'bernardo e bianca|robin hood|corcunda de notre dame|hotel transilvania|trolls|sonic|super mario|angry birds|lego|ferdinando|gato de botas',
    'bob esponja|spongebob|scooby|tom e jerry|tom and jerry|looney|pica pau|mickey|minnie|pateta|pato donald|tio patinhas|ducktales',
    'smurfs|os smurfs|turma da monica|sitio do pica|chaves|chapolin|ursinho pooh|winnie|heidi|miraculous|ladybug|ben 10',
    'padrinhos magicos|jimmy neutron|meninas superpoderosas|hora de aventura|adventure time|steven universe|jovens titas|teen titans go',
    'backyardigans|dora|go diego|clifford|caillou|thomas e seus amigos|fireman sam|pequeno principe|power rangers|transformers',
    'tartarugas ninja|hot wheels|thundercats|he man|pokemon|digimon|yu gi oh|beyblade|cavaleiros do zodiaco|sailor moon',
    'dragon ball|naruto|one piece|my hero academia|boruto|bakugan|inuyasha|doraemon|shin chan|princesa sofia|doutora brinquedos',
    'vampirina|jake e os piratas|escola de monstros|descendentes|high school musical|hannah montana|violetta|patati|xuxa|carrossel|chiquititas',
    'pinoquio|mary poppins|noviça rebelde|matilda|charlie e a fabrica de chocolate|willy wonka|esqueceram de mim|paddington|stuart little',
    'garfield|snoopy|peanuts|despicable me|bee movie|megamente|monstros sa|universidade monstros|vida de inseto|wall e|turning red|raya',
    'irmao urso|space jam|looney tunes|asterix|tintim|fantasia 2000|operacao resgate|liga da justica mirim|os fantasticos'
  ].join('|') + ')\\b', 'i');

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
    for (var p = 1; p <= 6; p++) {
      pedidos.push(API + '/discover/movie?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&include_adult=false&vote_count.gte=40' +
        '&with_genres=' + encodeURIComponent('16|10751') + '&certification_country=US&certification.lte=PG-13&page=' + p);
      pedidos.push(API + '/discover/tv?api_key=' + k + '&language=pt-BR&sort_by=popularity.desc&include_adult=false&vote_count.gte=20' +
        '&with_genres=' + encodeURIComponent('10762|10751|16') + '&page=' + p);
    }
    function fim() {
      carregando = false;
      if (feitos < 4) { return; }   // quase tudo falhou: tenta de novo na próxima vez
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
    if (tipo === 'canais') { saida.push({ category_id: '__kids24__', category_name: 'Desenhos 24 horas' }); }
    else { saida.push({ category_id: '__kids_familia__', category_name: 'Para a família' }); }
    return saida;
  }

  // ── Item ──────────────────────────────────────────────────────────
  function conhecido(nome) {
    if (TITULOS.test(norm(nome))) { return true; }
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
    return conhecido(nome);
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

  VLTV.kids = { categorias: categorias, ok: ok, aquecer: aquecer, ehConhecido: conhecido };
})();
