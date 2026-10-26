// VLTV Play - webOS | Destaque da semana: um segundo banner na Home, ao lado do banner de destaques.
// Ligado: o banner de destaques encolhe e este aparece à direita. Desligado: a Home fica como sempre foi.
// Quem manda é o painel (campos destaque_ativo, destaque_tipo e destaque_nome em /lg/config).
// Só o NOME do título é enviado: o app procura o título no painel da conta (com o id certo) e abre os detalhes.
// O fundo vem sozinho do TMDB; se o TMDB não achar, vale a imagem própria (campo destaque_imagem: endereço do JPEG).
// Se o título não existir no painel da conta, o destaque simplesmente não aparece.
// O último destaque fica guardado na TV: da segunda vez em diante a Home já abre no layout certo, sem pular.
(function () {
  'use strict';

  var CHAVE_CACHE = 'vltv_destaque_cache1';
  var CHAVE_CFG = 'vltv_destaque_cfg1';          // última configuração que o painel mandou
  var VALIDADE_CACHE_MS = 12 * 3600 * 1000;      // depois disso confere o título de novo (mostrando o guardado enquanto isso)
  var ESPERA_TMDB_MS = 3500;

  function $(id) { return document.getElementById(id); }

  var elTela = $('tela-home');
  var elCard = $('destaque');
  var elFundo = $('ds-fundo');
  var elLogo = $('ds-logo');
  var elTitulo = $('ds-titulo');
  var elMeta = $('ds-meta');
  var elSinopse = $('ds-sinopse');
  var elBotaoTxt = $('ds-botao-txt');
  var elConteudo = $('ds-conteudo');

  var elDiag = $('ds-diag');

  // Só aparece com DESTAQUE_DIAGNOSTICO = true no config.js (para descobrir por que o destaque não aparece).
  function diag(texto) {
    if (!elDiag) { return; }
    var ligado = !!(VLTV.config && VLTV.config.DESTAQUE_DIAGNOSTICO);
    elDiag.textContent = ligado ? ('Destaque: ' + texto + '  (v' + VLTV.config.VERSAO + ')') : '';
    elDiag.classList.toggle('escondida', !ligado);
  }

  var item = null;          // { chave, tipo, nomeCfg, raw, nome, capa, logo, fundo, nota, ano, nomeEn, t }
  var lista = null;         // categoria do título (só quando acabou de ser procurado)
  var abrirItem = null;
  var idCarga = 0;
  var abrindo = false;
  var mostrando = false;

  // ── Configuração (painel > último valor do painel > config.js) ─────
  function verdadeiro(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

  function tipoCerto(t) {
    t = String(t || '').toLowerCase();
    return (t === 'series' || t === 'serie' || t === 'série' || t === 'séries') ? 'series' : 'filmes';
  }

  function lerCfgGuardada() {
    try {
      var b = localStorage.getItem(CHAVE_CFG);
      return b ? JSON.parse(b) : null;
    } catch (e) { return null; }
  }

  function guardarCfg(c) {
    try { localStorage.setItem(CHAVE_CFG, JSON.stringify(c)); } catch (e) { /* ignora */ }
  }

  // Imagem própria: endereço completo (https://...) ou caminho da VPS (/arquivo.jpg).
  function enderecoImagem(u) {
    if (!u) { return ''; }
    if (/^https?:\/\//i.test(u)) { return u; }
    if (u.charAt(0) === '/') { return ((VLTV.config && VLTV.config.LICENCA_URL) || '') + u; }
    return '';
  }

  function configEfetiva() {
    var cfg = VLTV.config || {};
    var local = cfg.DESTAQUE_SEMANA || {};
    var v = VLTV.visual || {};
    var c, fonte = 'padrão';
    if (v.destaque_ativo !== undefined && v.destaque_ativo !== null) {
      fonte = 'painel';
      c = { ativo: verdadeiro(v.destaque_ativo), tipo: tipoCerto(v.destaque_tipo), nome: String(v.destaque_nome || ''), imagem: String(v.destaque_imagem || ''), tmdb: String(v.destaque_tmdb || ''), sinopse: String(v.destaque_sinopse || '') };
      guardarCfg(c);
    } else {
      var g = lerCfgGuardada();
      if (g) { fonte = 'guardada na TV (o painel não respondeu)'; }
      c = g || { ativo: !!local.ativo, tipo: tipoCerto(local.tipo), nome: String(local.nome || ''), imagem: String(local.imagem || ''), tmdb: String(local.tmdb || ''), sinopse: String(local.sinopse || '') };
    }
    c.nome = c.nome.replace(/^\s+|\s+$/g, '');
    c.sinopse = String(c.sinopse || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 500);
    c.tmdb = String(c.tmdb || '').replace(/[^0-9]/g, '');
    c.imagem = enderecoImagem((c.imagem || '').replace(/^\s+|\s+$/g, ''));
    c.fonte = fonte;
    c.desligadoPor = !c.ativo ? 'desligado' : c.nome === '' ? 'sem nome' : cfg.BANNER_ATIVO === false ? 'banner desligado no config' : '';
    c.ativo = !!c.ativo && c.nome !== '' && cfg.BANNER_ATIVO !== false;
    return c;
  }

  function chaveSessao() {
    var s = VLTV.sessao && VLTV.sessao.ler();
    return s ? (s.modo + '|' + s.dns + '|' + s.user + '|' + s.m3u) : '';
  }

  // ── Guardado na TV ────────────────────────────────────────────────
  function lerCache(chave, c) {
    try {
      var b = localStorage.getItem(CHAVE_CACHE);
      if (!b) { return null; }
      var x = JSON.parse(b);
      if (!x || x.chave !== chave || x.tipo !== c.tipo || x.nomeCfg !== c.nome || (x.imagemCfg || '') !== c.imagem || (x.tmdbCfg || '') !== c.tmdb || (x.sinopseCfg || '') !== c.sinopse || !x.raw) { return null; }
      return x;
    } catch (e) { return null; }
  }

  function gravarCache(x) {
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(x)); } catch (e) { /* ignora */ }
  }

  // ── Tela ──────────────────────────────────────────────────────────
  function aplicarLayout(ligado) {
    mostrando = ligado;
    elTela.classList.toggle('com-destaque', ligado);
    elCard.classList.toggle('escondida', !ligado);
  }

  function esconder() {
    idCarga++;
    item = null;
    lista = null;
    aplicarLayout(false);
  }

  function desenhar() {
    try {
      var s = item;
      elCard.classList.toggle('com-fundo', !!s.fundo);
      elFundo.classList.toggle('desfocado', !s.fundo);
      elFundo.style.backgroundImage = 'url("' + (s.fundo || s.capa || '').replace(/"/g, '%22') + '")';

      elTitulo.textContent = (VLTV.idioma.ehIngles() && s.nomeEn) || s.nome;
      elLogo.onerror = function () { elLogo.classList.add('escondida'); elTitulo.classList.remove('escondida'); };
      if (s.logo) {
        elLogo.classList.remove('escondida');
        elTitulo.classList.add('escondida');
        elLogo.src = s.logo;
      } else {
        elLogo.classList.add('escondida');
        elLogo.removeAttribute('src');
        elTitulo.classList.remove('escondida');
      }

      var meta = [];
      if (s.nota) { meta.push('★ ' + s.nota); }
      if (s.ano) { meta.push(s.ano); }
      meta.push(s.tipo === 'series' ? 'Série' : 'Filme');
      elMeta.textContent = meta.join('   •   ');
      var sin = s.sinopseCfg || s.sinopseTmdb || s.plano || '';
      elSinopse.textContent = sin;
      elSinopse.classList.toggle('escondida', sin === '');
    } catch (e) { /* mantém o que já estava na tela */ }
  }

  // ── Procurar o título no painel da conta ──────────────────────────
  function carregarImagem(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      var img = new Image();
      img.onload = function () { resolve(url); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function montar(chave, c, r) {
    var raw = r.raw;
    var capa = (c.tipo === 'series' ? raw.cover : raw.stream_icon) || '';
    var busca = VLTV.titulo.paraBusca(raw.name || c.nome);
    var nota = parseFloat(raw.rating);
    return {
      chave: chave,
      tipo: c.tipo,
      nomeCfg: c.nome,
      imagemCfg: c.imagem,
      tmdbCfg: c.tmdb,
      sinopseCfg: c.sinopse,
      sinopseTmdb: '',
      plano: String(raw.plot || ''),
      raw: raw,
      nome: VLTV.titulo.limpar(raw.name || c.nome),
      capa: capa,
      logo: null,
      fundo: null,
      nomeEn: '',
      nota: isFinite(nota) && nota > 0 ? nota.toFixed(1) : '',
      ano: busca.ano || '',
      t: new Date().getTime()
    };
  }

  function preparar(s) {
    var id = s.tipo === 'series' ? s.raw.series_id : s.raw.stream_id;
    // Com o ID do TMDB: logo, fundo e título vêm direto do título certo. Sem ID (ou se falhar): procura pelo nome.
    var porId = s.tmdbCfg ? VLTV.tmdb.imagensPorId(s.tipo, s.tmdbCfg) : Promise.resolve(null);
    return porId.then(function (r) { return preparaResto(s, id, r); });
  }

  function preparaResto(s, id, r) {
    var logo = (r && r.logo ? Promise.resolve(r.logo) : VLTV.tmdb.logo(s.tipo, id, s.raw.name)).then(carregarImagem).then(function (u) { s.logo = u; });
    // Fundo do TMDB; se não achar (ou não carregar), usa a imagem própria do painel.
    var fundo = (r && r.fundo ? Promise.resolve(r.fundo) : VLTV.tmdb.fundo(s.tipo, id, s.raw.name)).then(carregarImagem).then(function (u) {
      if (u) { s.fundo = u; return null; }
      return carregarImagem(s.imagemCfg).then(function (p) { s.fundo = p; });
    });
    // Título em inglês e sinopse do TMDB (a sinopse só vale se você não digitou uma no painel).
    var txt = (r && r.titulo ? Promise.resolve(r) : VLTV.tmdb.textos(s.tipo, id, s.raw.name)).then(function (t) {
      if (!t) { return; }
      if (VLTV.idioma.ehIngles() && t.titulo) { s.nomeEn = t.titulo; }
      if (t.sinopse) { s.sinopseTmdb = t.sinopse; }
    });
    return Promise.all([logo, fundo, txt]).catch(function () { return null; });
  }

  function procurar(chave, c, meu) {
    var achou;
    try { achou = VLTV.indice.achar(c.tipo, c.nome); } catch (e) { achou = Promise.resolve(undefined); }
    achou.then(function (r) {
      if (meu !== idCarga) { return; }
      if (r === null) { esconder(); diag('o título "' + c.nome + '" não foi achado na lista desta conta (confira o nome e o tipo)'); return; }   // a conta não tem este título
      return r;
    }, function () { return undefined; }).then(function (r) {
      if (!r || meu !== idCarga) { return; }
      var novo = montar(chave, c, r);
      if (!novo.capa) { esconder(); diag('o título foi achado, mas está sem capa na lista'); return; }
      return Promise.race([
        preparar(novo),
        new Promise(function (resolve) { setTimeout(resolve, ESPERA_TMDB_MS); })
      ]).then(function () {
        if (meu !== idCarga) { return; }
        item = novo;
        lista = r.lista || null;
        gravarCache(novo);
        desenhar();
        aplicarLayout(true);
        diag('OK, aparecendo');
      });
    });
  }

  // ── Interface pública ─────────────────────────────────────────────
  // Chamada ao entrar na Home e quando o painel manda a configuração. Pode ser chamada quantas vezes precisar.
  function atualizar() {
    var c = configEfetiva();
    var chave = chaveSessao();
    if (!c.ativo) { esconder(); diag('não ligado (' + c.desligadoPor + '; config vinda de: ' + c.fonte + ')'); return; }
    if (chave === '') { esconder(); diag('aguardando o login'); return; }

    // Já está na tela com o título certo: nada a fazer.
    if (item && item.chave === chave && item.tipo === c.tipo && item.nomeCfg === c.nome && (item.imagemCfg || '') === c.imagem && (item.tmdbCfg || '') === c.tmdb && (item.sinopseCfg || '') === c.sinopse && mostrando) { return; }

    var meu = ++idCarga;
    diag('procurando "' + c.nome + '" na lista...');
    var g = lerCache(chave, c);
    if (g) {
      item = g;
      lista = null;
      desenhar();
      aplicarLayout(true);
      // Guardado ainda novo: não precisa conferir de novo.
      if (new Date().getTime() - (g.t || 0) < VALIDADE_CACHE_MS) { return; }
      procurar(chave, c, meu);
      return;
    }
    // Sem guardado: só aparece quando o título for achado no painel (evita caixa vazia).
    item = null;
    lista = null;
    aplicarLayout(false);
    procurar(chave, c, meu);
  }

  function abrir() {
    var s = item;
    if (!s || !abrirItem || abrindo) { return; }
    abrindo = true;
    var texto = elBotaoTxt.textContent;
    elBotaoTxt.textContent = 'ABRINDO...';
    // Dá um instante para o aviso aparecer e abre os detalhes (as sugestões usam a categoria, se já se sabe qual é).
    setTimeout(function () {
      abrindo = false;
      elBotaoTxt.textContent = texto;
      abrirItem(s.tipo, s.raw, lista || [s.raw]);
    }, 50);
  }

  function visivel() { return mostrando; }
  function configurar(abrirFn) { abrirItem = abrirFn; }

  VLTV.destaque = { configurar: configurar, atualizar: atualizar, abrir: abrir, visivel: visivel };
})();
