// VLTV Play - webOS | "Vassoura" de nomes: tira do nome do painel o que não faz parte do título
// (ano, HD, Full HD, legendado, dublado, S01E01, [colchetes], (parênteses)...).
// Mesma ideia do TituloCleaner do app Android, mas sem apagar números que fazem parte do título
// (ex.: "Blade Runner 2049", "1917").
(function () {
  'use strict';

  // Mesma lista do TituloCleaner do app Android (mais alguns termos de arquivos de filme).
  // São removidas em qualquer lugar do nome, mesmo coladas por ponto, hífen ou barra:
  // "Filme.1080p.Dublado" e "Filme-HD" também ficam limpos.
  var TAGS = [
    'FULL HD', 'FULL-HD', 'FULLHD', 'FHD', 'HD', '4K', '8K', 'UHD', 'HDR', 'HDR10', 'DV',
    '720P', '1080P', '2160P', '480P',
    'H264', 'H265', 'H.264', 'H.265', 'X264', 'X265', 'HEVC', 'AVC',
    'BLURAY', 'BLU-RAY', 'BDRIP', 'REMUX', 'REPACK', 'UNCUT',
    'WEB-DL', 'WEBDL', 'WEBRIP', 'BRRIP', 'DVDRIP', 'DVDSCR', 'AVI', 'MKV', 'MP4',
    'HDTV', 'HDCAM', 'HDRIP', 'SCREENER',
    'DUAL', 'DUAL AUDIO', 'DUAL-AUDIO', '5.1', '2.0', 'AAC', 'AC3', 'LATINO', 'MULTI',
    'LEG', 'LEGENDADO', 'LEGENDADA', 'SUBTITLED', 'SUBS',
    'DUB', 'DUBLADO', 'DUBLADA', 'DUBBED',
    'NACIONAL', 'PT-BR', 'PTBR',
    'CINEMA', 'LANÇAMENTO', 'LANCAMENTO', 'EXCLUSIVO', 'COMPLETE',
    'TEMPORADA', 'SEASON'
  ];

  // Palavras que também são palavras de verdade ("Web of Lies"): só saem se NÃO forem a primeira do nome.
  var TAGS_FRACAS = ['WEB', 'TS', 'TC', 'DV', 'SUB', 'SUBS', 'AUDIO', 'MULTI', 'ESP', 'ITA', 'SP', 'BR', 'AVC', 'CAM', 'COMPLETE', 'COMPLETO', 'EXTENDED', 'UNCUT', 'PROPER', 'SD', 'R5'];

  var LETRAS = 'A-Za-z0-9ÇçÀ-ÿ';

  function escapar(t) { return t.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&'); }

  // Palavra inteira (sem lookbehind: webOS 4 usa Chrome 53). O separador da frente é devolvido ao texto.
  var REGEX_TAGS = new RegExp(
    '(^|[^' + LETRAS + '])(' +
    TAGS.slice().sort(function (x, y) { return y.length - x.length; }).map(escapar).join('|') +
    ')(?=$|[^' + LETRAS + '])', 'gi');

  var REGEX_TAGS_FRACAS = new RegExp(
    '([^' + LETRAS + '])(' + TAGS_FRACAS.map(escapar).join('|') + ')(?=$|[^' + LETRAS + '])', 'gi');

  // Resoluções coladas ("1080p", "HD1080", "1920x1080").
  var REGEX_RESOLUCAO = new RegExp('(^|[^' + LETRAS + '])(\\d{3,4}p|hd\\d{3,4}|\\d{3,4}x\\d{3,4})(?=$|[^' + LETRAS + '])', 'gi');

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

    texto = texto.replace(/[|_]/g, ' ');
    // Nome de arquivo ("Filme.Nome.1080p.Dublado"): os pontos fazem o papel de espaço.
    if (!/\s/.test(texto) && (texto.match(/\./g) || []).length >= 2) { texto = texto.replace(/\./g, ' '); }

    // Mesma ideia com hífen ("Filme-Nome-HD"). Nomes normais com um hífen só ("Spider-Man") não mudam.
    if (!/\s/.test(texto) && (texto.match(/-/g) || []).length >= 2) { texto = texto.replace(/-/g, ' '); }

    // Prefixo de idioma do painel: "BR: Duna", "SP - Duna".
    texto = texto.replace(/^\s*(BR|SP|PT|PTBR|LEG|DUB)\s*[:\-–]\s+/i, '');

    var antes = texto;
    for (var vez = 0; vez < 3; vez++) {
      texto = texto.replace(REGEX_TAGS, '$1 ').replace(REGEX_TAGS_FRACAS, '$1 ').replace(REGEX_RESOLUCAO, '$1 ');
    }
    var tirouTag = texto !== antes;
    texto = texto.replace(/\s[.:,;]+(?=\s|$)/g, ' ');

    var palavras = texto.split(/\s+/).filter(function (p) { return p.length > 0; });

    var mantidas = [];
    palavras.forEach(function (p) {
      var limpa = semPontas(p);
      if (REGEX_TEMPORADA.test(limpa)) { return; }
      mantidas.push(p);
    });

    // "Filme - L" / "Filme | D" (marca de legendado/dublado): sai. Sem separador, só se já havia outra tag.
    if (mantidas.length > 1 && /^[LD]$/i.test(semPontas(mantidas[mantidas.length - 1]))) {
      var anterior = mantidas[mantidas.length - 2];
      if (semPontas(anterior) === '' || tirouTag) { mantidas.pop(); }
    }

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
