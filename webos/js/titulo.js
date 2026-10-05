// VLTV Play - webOS | "Vassoura" de nomes: tira do nome do painel o que não faz parte do título
// (ano, HD, Full HD, legendado, dublado, S01E01, [colchetes], (parênteses)...).
// Mesma ideia do TituloCleaner do app Android, mas sem apagar números que fazem parte do título
// (ex.: "Blade Runner 2049", "1917").
(function () {
  'use strict';

  // Palavras soltas que são "sujeira" (comparadas em maiúsculas, sem pontuação nas pontas).
  var TAGS = [
    'FHD', 'HD', 'SD', '4K', '8K', 'UHD', 'HDR', '720P', '1080P', '2160P',
    'H264', 'H265', 'X264', 'X265', 'HEVC', 'BLURAY', 'REMUX', 'REPACK',
    'WEBDL', 'WEBRIP', 'WEB', 'BRRIP', 'DVDRIP', 'AVI', 'MKV', 'MP4',
    'HDTV', 'HDCAM', 'CAM', 'TS', 'TC', 'R5', 'SCREENER', 'DUAL', 'AUDIO', 'AAC', 'LATINO',
    'LEG', 'LEGENDADO', 'SUBTITLED', 'DUB', 'DUBLADO', 'DUBBED',
    'NACIONAL', 'BR', 'SP', 'ITA', 'ESP', 'PTBR',
    'CINEMA', 'LANÇAMENTO', 'LANCAMENTO', 'EXCLUSIVO', 'COMPLETO', 'COMPLETE',
    'TEMPORADA', 'SEASON'
  ];

  var MAPA_TAGS = {};
  TAGS.forEach(function (t) { MAPA_TAGS[t] = true; });

  // Sujeira com mais de uma palavra ou com pontuação: trocada por espaço antes de separar as palavras.
  var REGEX_COMPOSTAS = /(^|\s)(FULL[\s-]?HD|DUAL[\s-]?AUDIO|BLU[\s-]?RAY|WEB[\s-]?DL|PT[\s-]?BR|H\.26[45]|5\.1|2\.0)(?=$|\s)/gi;
  var REGEX_TEMPORADA = /^(S\d{1,2}(E\d{1,3})?|E\d{1,3}|EP\d{1,3})$/i;
  var REGEX_ANO = /^(19|20)\d{2}$/;

  function ehAno(token) {
    var n = parseInt(token, 10);
    return REGEX_ANO.test(token) && n >= 1900 && n <= new Date().getFullYear() + 2;
  }

  // Pontuação nas pontas da palavra ("LEG.", "BR:", "HD,") não atrapalha a comparação.
  function semPontas(t) { return t.replace(/^[^A-Za-z0-9ÇçÀ-ÿ]+|[^A-Za-z0-9ÇçÀ-ÿ]+$/g, ''); }

  // Devolve { titulo, ano }.
  function analisar(nomeOriginal) {
    var original = String(nomeOriginal || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    var ano = '';

    // Ano entre parênteses/colchetes vira "ano"; o resto desses grupos é descartado.
    var texto = original.replace(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, function (_, dentro) {
      var m = /\b((19|20)\d{2})\b/.exec(dentro);
      if (m && ehAno(m[1]) && !ano) { ano = m[1]; }
      return ' ';
    });

    texto = texto.replace(/[|_]/g, ' ').replace(REGEX_COMPOSTAS, '$1 ');
    var palavras = texto.split(/\s+/).filter(function (p) { return p.length > 0; });

    var mantidas = [];
    palavras.forEach(function (p) {
      var limpa = semPontas(p);
      var maiuscula = limpa.toUpperCase();
      if (MAPA_TAGS[maiuscula] || REGEX_TEMPORADA.test(limpa)) { return; }
      mantidas.push(p);
    });

    // Separadores soltos nas pontas ("Título - HD" deixa um "-" sobrando) saem junto.
    function aparar() {
      while (mantidas.length > 0 && semPontas(mantidas[mantidas.length - 1]) === '') { mantidas.pop(); }
      while (mantidas.length > 0 && semPontas(mantidas[0]) === '') { mantidas.shift(); }
    }
    aparar();

    // Ano solto no fim do nome ("Reacher 2022"): sai, mas só se sobrar algum título.
    while (mantidas.length > 1 && ehAno(semPontas(mantidas[mantidas.length - 1]))) {
      var a = semPontas(mantidas.pop());
      if (!ano) { ano = a; }
      aparar();
    }

    var titulo = mantidas.join(' ')
      .replace(/^[\s\-–—:.,]+|[\s\-–—:.,]+$/g, '')
      .replace(/\s+-\s*$/, '');
    if (!titulo) { titulo = original; }
    return { titulo: titulo, ano: ano };
  }

  // Nome para mostrar na tela.
  function limpar(nome) { return analisar(nome).titulo; }

  // Nome e ano para pesquisar no TMDB.
  function paraBusca(nome) {
    var r = analisar(nome);
    return { query: r.titulo, ano: r.ano };
  }

  VLTV.titulo = { limpar: limpar, paraBusca: paraBusca };
})();
