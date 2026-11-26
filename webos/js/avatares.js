// VLTV Play - webOS | Avatares próprios do VLTV (desenhos originais, em SVG).
// São bichinhos e figuras genéricas, sem nenhum personagem de filme, série ou desenho: não dá problema de direitos autorais
// na LG Content Store, na Samsung Seller Office nem na Google Play.
// O perfil guarda "vltv:<id>" no campo imagem (ex.: "vltv:raposa"). O mesmo desenho existe em PNG (pasta avatares-vltv)
// para o aplicativo do celular usar com o mesmo nome, e assim TV e celular mostram o mesmo avatar.
// Código em ES5 de propósito (TVs LG antigas não entendem seta, let/const nem template string).
(function () {
  'use strict';

  var PRETO = '#1d1b2e';

  function olho(cx, cy, r, pr, dx, dy) {
    dx = dx || 0;
    dy = dy || 0;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff"/>' +
      '<circle cx="' + (cx + dx) + '" cy="' + (cy + dy) + '" r="' + pr + '" fill="' + PRETO + '"/>' +
      '<circle cx="' + (cx + dx + pr * 0.35) + '" cy="' + (cy + dy - pr * 0.35) + '" r="' + (pr * 0.32) + '" fill="#fff"/>';
  }

  function ponto(cx, cy, r, cor) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + cor + '"/>';
  }

  function bochecha(cx, cy) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="11" ry="7" fill="#ff7a8a" opacity="0.55"/>';
  }

  function sorriso(cx, cy, larg, cor) {
    return '<path d="M' + (cx - larg) + ',' + cy + ' Q' + cx + ',' + (cy + larg * 0.9) + ' ' + (cx + larg) + ',' + cy +
      '" fill="none" stroke="' + cor + '" stroke-width="5" stroke-linecap="round"/>';
  }

  // Cada avatar: id (vai no perfil), nome (aparece na escolha), cores do fundo e o desenho (200 x 200).
  var LISTA = [
    { id: 'raposa', nome: 'Raposa', c1: '#2dd4bf', c2: '#0f766e', d: function () {
      return '<polygon points="42,84 52,20 100,60" fill="#e8651a"/><polygon points="158,84 148,20 100,60" fill="#e8651a"/>' +
        '<polygon points="55,70 59,38 84,60" fill="#3b1d12"/><polygon points="145,70 141,38 116,60" fill="#3b1d12"/>' +
        '<path d="M30,96 Q100,36 170,96 Q176,140 100,184 Q24,140 30,96 Z" fill="#f47f24"/>' +
        '<path d="M100,184 Q50,152 32,112 Q76,134 100,128 Q124,134 168,112 Q150,152 100,184 Z" fill="#fff6ea"/>' +
        olho(70, 104, 12, 7, 1, 1) + olho(130, 104, 12, 7, -1, 1) +
        '<ellipse cx="100" cy="170" rx="11" ry="8" fill="#2b1b17"/>' + bochecha(52, 138) + bochecha(148, 138);
    } },
    { id: 'gato', nome: 'Gato', c1: '#a78bfa', c2: '#5b21b6', d: function () {
      return '<polygon points="44,92 40,30 92,62" fill="#8d97a8"/><polygon points="156,92 160,30 108,62" fill="#8d97a8"/>' +
        '<polygon points="54,78 52,46 80,64" fill="#ffb3c1"/><polygon points="146,78 148,46 120,64" fill="#ffb3c1"/>' +
        '<ellipse cx="100" cy="118" rx="68" ry="58" fill="#a9b3c4"/>' +
        '<path d="M88,66 L92,82 M100,64 L100,82 M112,66 L108,82" stroke="#7a8498" stroke-width="5" stroke-linecap="round"/>' +
        '<ellipse cx="100" cy="146" rx="30" ry="22" fill="#e9edf5"/>' +
        olho(70, 112, 13, 8, 1, 1) + olho(130, 112, 13, 8, -1, 1) +
        '<polygon points="92,134 108,134 100,144" fill="#ff7f93"/>' +
        '<path d="M100,144 L100,150 M100,150 Q90,160 82,154 M100,150 Q110,160 118,154" fill="none" stroke="' + PRETO + '" stroke-width="3.5" stroke-linecap="round"/>' +
        '<path d="M58,140 L24,134 M58,150 L26,158 M142,140 L176,134 M142,150 L174,158" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>';
    } },
    { id: 'coruja', nome: 'Coruja', c1: '#fbbf24', c2: '#d97706', d: function () {
      return '<polygon points="46,70 40,24 84,52" fill="#6b4226"/><polygon points="154,70 160,24 116,52" fill="#6b4226"/>' +
        '<ellipse cx="100" cy="116" rx="68" ry="68" fill="#8b5a33"/>' +
        '<ellipse cx="100" cy="142" rx="40" ry="38" fill="#e8c9a0"/>' +
        '<path d="M82,128 Q86,136 90,128 M100,136 Q104,144 108,136 M110,128 Q114,136 118,128" fill="none" stroke="#c49a6c" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="68" cy="98" r="28" fill="#f5e3c4"/><circle cx="132" cy="98" r="28" fill="#f5e3c4"/>' +
        olho(68, 98, 19, 11, 1, 1) + olho(132, 98, 19, 11, -1, 1) +
        '<polygon points="90,114 110,114 100,134" fill="#f59e0b"/>';
    } },
    { id: 'urso', nome: 'Urso', c1: '#fb923c', c2: '#c2410c', d: function () {
      return ponto(54, 56, 22, '#6f4a2e') + ponto(146, 56, 22, '#6f4a2e') + ponto(54, 56, 11, '#d9a679') + ponto(146, 56, 11, '#d9a679') +
        '<ellipse cx="100" cy="112" rx="70" ry="64" fill="#8a5a38"/>' +
        '<ellipse cx="100" cy="134" rx="34" ry="27" fill="#e7c4a0"/>' +
        olho(70, 102, 11, 7, 1, 1) + olho(130, 102, 11, 7, -1, 1) +
        '<ellipse cx="100" cy="124" rx="13" ry="9" fill="#2b1b17"/>' +
        '<path d="M100,133 L100,142 M100,142 Q90,152 82,146 M100,142 Q110,152 118,146" fill="none" stroke="#2b1b17" stroke-width="4" stroke-linecap="round"/>' +
        bochecha(54, 128) + bochecha(146, 128);
    } },
    { id: 'robo', nome: 'Robô', c1: '#38bdf8', c2: '#1d4ed8', d: function () {
      return '<line x1="100" y1="22" x2="100" y2="52" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round"/>' + ponto(100, 20, 9, '#fb7185') +
        '<rect x="28" y="90" width="14" height="40" rx="6" fill="#94a3b8"/><rect x="158" y="90" width="14" height="40" rx="6" fill="#94a3b8"/>' +
        '<rect x="38" y="50" width="124" height="116" rx="28" fill="#e2e8f0"/>' +
        '<rect x="52" y="74" width="96" height="46" rx="22" fill="#0f172a"/>' +
        '<circle cx="78" cy="97" r="11" fill="#22d3ee"/><circle cx="122" cy="97" r="11" fill="#22d3ee"/>' +
        '<circle cx="81" cy="94" r="3.5" fill="#fff"/><circle cx="125" cy="94" r="3.5" fill="#fff"/>' +
        '<rect x="74" y="136" width="52" height="14" rx="7" fill="#94a3b8"/>' +
        '<path d="M86,136 L86,150 M100,136 L100,150 M114,136 L114,150" stroke="#e2e8f0" stroke-width="3"/>';
    } },
    { id: 'astronauta', nome: 'Astronauta', c1: '#312e81', c2: '#6d28d9', d: function () {
      return ponto(30, 36, 2.5, '#fff') + ponto(170, 48, 2, '#fff') + ponto(160, 160, 2.5, '#fff') + ponto(36, 150, 2, '#fff') + ponto(178, 100, 1.8, '#fff') +
        '<circle cx="100" cy="104" r="68" fill="#f1f5f9"/>' +
        '<circle cx="100" cy="104" r="68" fill="none" stroke="#cbd5e1" stroke-width="5"/>' +
        '<rect x="48" y="68" width="104" height="72" rx="34" fill="#1e293b"/>' +
        '<path d="M60,84 Q72,70 96,72" fill="none" stroke="#7dd3fc" stroke-width="6" stroke-linecap="round" opacity="0.9"/>' +
        '<circle cx="124" cy="116" r="9" fill="#38bdf8" opacity="0.35"/>' +
        '<rect x="30" y="94" width="14" height="28" rx="7" fill="#fb7185"/><rect x="156" y="94" width="14" height="28" rx="7" fill="#fb7185"/>';
    } },
    { id: 'dino', nome: 'Dino', c1: '#fde047', c2: '#ca8a04', d: function () {
      return '<polygon points="70,52 82,26 94,52" fill="#fb923c"/><polygon points="94,46 106,18 118,46" fill="#fb923c"/><polygon points="118,52 130,26 142,54" fill="#fb923c"/>' +
        '<path d="M30,112 Q30,52 100,52 Q172,52 172,112 Q172,172 100,172 Q30,172 30,112 Z" fill="#4ade80"/>' +
        '<ellipse cx="100" cy="142" rx="52" ry="30" fill="#bbf7d0"/>' +
        ponto(86, 132, 4.5, '#15803d') + ponto(114, 132, 4.5, '#15803d') +
        olho(68, 98, 13, 8, 1, 1) + olho(132, 98, 13, 8, -1, 1) +
        sorriso(100, 148, 22, '#15803d') +
        ponto(52, 78, 5, '#22c55e') + ponto(150, 74, 6, '#22c55e') + ponto(160, 120, 4, '#22c55e');
    } },
    { id: 'polvo', nome: 'Polvo', c1: '#f472b6', c2: '#be185d', d: function () {
      return '<path d="M42,132 Q30,160 52,176 Q64,184 66,166 Q68,150 70,140 Z" fill="#7c3aed"/>' +
        '<path d="M158,132 Q170,160 148,176 Q136,184 134,166 Q132,150 130,140 Z" fill="#7c3aed"/>' +
        '<path d="M80,140 Q78,168 92,180 Q102,184 100,166 L100,140 Z" fill="#7c3aed"/>' +
        '<path d="M120,140 Q122,168 108,180 Q98,184 100,166 L100,140 Z" fill="#7c3aed"/>' +
        '<path d="M32,108 Q32,36 100,36 Q168,36 168,108 Q168,148 100,152 Q32,148 32,108 Z" fill="#a78bfa"/>' +
        olho(70, 100, 17, 10, 1, 1) + olho(130, 100, 17, 10, -1, 1) +
        sorriso(100, 124, 14, '#4c1d95') + bochecha(48, 124) + bochecha(152, 124) +
        ponto(80, 56, 5, '#c4b5fd') + ponto(100, 50, 4, '#c4b5fd') + ponto(122, 58, 3.5, '#c4b5fd');
    } },
    { id: 'coelho', nome: 'Coelho', c1: '#86efac', c2: '#15803d', d: function () {
      return '<ellipse cx="68" cy="52" rx="19" ry="46" fill="#f8fafc"/><ellipse cx="132" cy="52" rx="19" ry="46" fill="#f8fafc"/>' +
        '<ellipse cx="68" cy="56" rx="9" ry="32" fill="#fbb6c8"/><ellipse cx="132" cy="56" rx="9" ry="32" fill="#fbb6c8"/>' +
        '<ellipse cx="100" cy="126" rx="62" ry="54" fill="#f8fafc"/>' +
        olho(74, 118, 10, 7, 1, 1) + olho(126, 118, 10, 7, -1, 1) +
        '<ellipse cx="100" cy="138" rx="8" ry="6" fill="#f472b6"/>' +
        '<path d="M100,144 L100,150 M100,150 Q90,160 82,154 M100,150 Q110,160 118,154" fill="none" stroke="#94a3b8" stroke-width="3.5" stroke-linecap="round"/>' +
        '<rect x="93" y="154" width="14" height="14" rx="3" fill="#fff" stroke="#cbd5e1" stroke-width="2"/>' +
        bochecha(52, 140) + bochecha(148, 140);
    } },
    { id: 'sapo', nome: 'Sapo', c1: '#fcd34d', c2: '#ea580c', d: function () {
      return '<path d="M26,118 Q26,70 100,70 Q174,70 174,118 Q174,172 100,172 Q26,172 26,118 Z" fill="#4ade80"/>' +
        '<circle cx="64" cy="64" r="28" fill="#4ade80"/><circle cx="136" cy="64" r="28" fill="#4ade80"/>' +
        olho(64, 62, 20, 11, 1, 2) + olho(136, 62, 20, 11, -1, 2) +
        '<path d="M44,124 Q100,172 156,124" fill="none" stroke="#166534" stroke-width="6" stroke-linecap="round"/>' +
        ponto(90, 98, 3.5, '#166534') + ponto(110, 98, 3.5, '#166534') +
        bochecha(46, 134) + bochecha(154, 134) + ponto(60, 148, 4, '#22c55e') + ponto(142, 150, 5, '#22c55e');
    } },
    { id: 'pinguim', nome: 'Pinguim', c1: '#7dd3fc', c2: '#0369a1', d: function () {
      return '<path d="M30,108 Q30,40 100,40 Q170,40 170,108 Q170,176 100,176 Q30,176 30,108 Z" fill="#1e293b"/>' +
        '<path d="M52,104 Q52,70 78,72 Q92,74 100,88 Q108,74 122,72 Q148,70 148,104 Q148,160 100,166 Q52,160 52,104 Z" fill="#f8fafc"/>' +
        olho(78, 102, 11, 7, 1, 1) + olho(122, 102, 11, 7, -1, 1) +
        '<path d="M84,124 Q100,116 116,124 Q108,142 100,142 Q92,142 84,124 Z" fill="#fb923c"/>' +
        bochecha(62, 128) + bochecha(138, 128) +
        '<path d="M86,48 Q100,40 114,48" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/>';
    } },
    { id: 'alien', nome: 'Alien', c1: '#c084fc', c2: '#4c1d95', d: function () {
      return ponto(34, 40, 2.5, '#fff') + ponto(168, 36, 2, '#fff') + ponto(176, 140, 2.5, '#fff') + ponto(26, 148, 2, '#fff') +
        '<line x1="72" y1="46" x2="60" y2="26" stroke="#86efac" stroke-width="5" stroke-linecap="round"/><line x1="128" y1="46" x2="140" y2="26" stroke="#86efac" stroke-width="5" stroke-linecap="round"/>' +
        ponto(58, 23, 7, '#fde047') + ponto(142, 23, 7, '#fde047') +
        '<path d="M100,36 Q172,36 164,112 Q158,176 100,178 Q42,176 36,112 Q28,36 100,36 Z" fill="#86efac"/>' +
        '<path d="M44,92 Q58,84 82,104 Q76,132 52,124 Q40,112 44,92 Z" fill="' + PRETO + '"/>' +
        '<path d="M156,92 Q142,84 118,104 Q124,132 148,124 Q160,112 156,92 Z" fill="' + PRETO + '"/>' +
        ponto(60, 100, 4.5, '#fff') + ponto(140, 100, 4.5, '#fff') +
        '<ellipse cx="92" cy="148" rx="3" ry="2.5" fill="#22c55e"/><ellipse cx="108" cy="148" rx="3" ry="2.5" fill="#22c55e"/>' +
        '<path d="M88,160 Q100,168 112,160" fill="none" stroke="#15803d" stroke-width="4" stroke-linecap="round"/>';
    } }
  ];

  function indiceDe(id) {
    for (var i = 0; i < LISTA.length; i++) { if (LISTA[i].id === id) { return i; } }
    return -1;
  }

  // SVG completo (200 x 200) do avatar de posição i.
  function svg(i) {
    var a = LISTA[i];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">' +
      '<defs><linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a.c1 + '"/><stop offset="1" stop-color="' + a.c2 + '"/></linearGradient></defs>' +
      '<rect width="200" height="200" fill="url(#fundo)"/>' + a.d() + '</svg>';
  }

  // Endereço de imagem (data URI) do avatar: serve direto em <img src>.
  function uri(i) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(i));
  }

  // Avatar que um perfil mostra: o escolhido ("vltv:<id>") ou, sem escolha (ou com nome de avatar de outro app), um que sai do id do perfil.
  // Assim todo perfil sempre tem um desenho próprio, e nunca um personagem de fora.
  function indiceDoPerfil(p) {
    var m = /^vltv:(.+)$/.exec(String((p && p.imagem) || ''));
    var i = m ? indiceDe(m[1]) : -1;
    if (i >= 0) { return i; }
    var h = 0;
    var t = String((p && (p.id || p.nome)) || '');
    for (var j = 0; j < t.length; j++) { h = (h * 31 + t.charCodeAt(j)) % 9973; }
    return h % LISTA.length;
  }

  VLTV.avatares = {
    lista: LISTA,
    total: LISTA.length,
    indiceDe: indiceDe,
    indiceDoPerfil: indiceDoPerfil,
    svg: svg,
    uri: uri,
    idPadrao: LISTA[0].id
  };
})();
