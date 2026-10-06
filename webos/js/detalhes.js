// VLTV Play - webOS | Detalhes de filmes e séries.
// Mesmo layout do app do celular, em paisagem: fundo com degradê, título, nota/ano, gênero,
// barra de progresso, ASSISTIR/CONTINUAR, Minha Lista, sinopse e abas (Episódios, Sugestões, Detalhes).
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40, PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428 };

  var COL_EPS = 4;              // episódios por linha (grade)
  var LINHAS_PAGINA_EPS = 2;    // CH+/CH- pulam esta quantidade de linhas
  var COL_SUG = 6;              // capas por linha nas sugestões
  var MAX_SUG = 12;             // quantas sugestões mostrar
  var MARGEM_ABAS_PX = 110;     // onde as abas ficam na tela depois de rolar a página
  var RESUME_MIN_FILME_S = 30;  // só oferece "continuar" depois de 30 s assistidos
  var RESUME_MIN_EP_S = 30;

  function $(id) { return document.getElementById(id); }

  var elFundo = $('det-fundo');
  var elGradRolado = $('det-grad-rolado');
  var elFadeTopo = $('det-fade-topo');
  var elPagina = $('det-pagina');
  var elTitulo = $('det-titulo');
  var elLogo = $('det-logo');
  var elNotaBloco = $('det-nota-bloco');
  var elNota = $('det-nota');
  var elAno = $('det-ano');
  var elDuracao = $('det-duracao');
  var elQual = $('det-qual');
  var elGenero = $('det-genero');
  var elProgresso = $('det-progresso');
  var elBarra = $('det-barra-cheia');
  var elRestam = $('det-restam');
  var elPlay = $('det-play');
  var elPlayTxt = $('det-play-txt');
  var elReiniciar = $('det-reiniciar');
  var elFav = $('det-fav');
  var elSinopse = $('det-sinopse');
  var elAbas = $('det-abas');
  var elSecEps = $('det-sec-eps');
  var elTemp = $('det-temp');
  var elEpsJanela = $('det-eps-janela');
  var elEps = $('det-eps');
  var elSecSug = $('det-sec-sug');
  var elSugJanela = $('det-sug-janela');
  var elSug = $('det-sug');
  var elSecDet = $('det-sec-det');
  var elPopup = $('det-popup');
  var elPopupJanela = $('det-popup-janela');
  var elPopupLista = $('det-popup-lista');

  var item = null;          // título aberto: { tipo, id, nome, capa, ... }
  var acoes = null;         // { sair, reproduzir(lista, indice, inicioSeg) }
  var base = [];            // títulos da mesma categoria (para as sugestões)
  var pilha = [];           // títulos abertos antes (ao abrir uma sugestão)
  var info = {};            // detalhes vindos do painel
  var temporadas = [];
  var plano = [];           // todos os episódios em ordem, para tocar em sequência
  var alvo = null;          // o que o botão principal toca: { indice, continuar, pos, dur, rotulo }
  var falha = false;
  var idCarga = 0;
  var idLogo = 0;
  var usandoCapa = false;

  var abas = [];            // [{ id: 'eps' | 'sug' | 'det', el }]
  var abaIdx = 0;
  var zona = 'play';        // 'play' | 'sec' | 'abas' | 'temp' | 'lista'
  var secIdx = 0;
  var tempIdx = 0;
  var epIdx = 0;
  var sugIdx = 0;
  var itensEps = [];
  var itensSug = [];
  var elFocoAtual = null;

  var popupAberto = false;
  var popupIdx = 0;
  var itensPopup = [];

  // ── Utilidades ────────────────────────────────────────────────────
  function esvaziar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  function mostrar(el, sim) { el.classList.toggle('escondida', !sim); }

  function mensagem(ul, texto) {
    esvaziar(ul);
    var li = document.createElement('li');
    li.className = 'msg';
    li.textContent = texto;
    ul.appendChild(li);
  }

  function primeiro(v) {
    if (Array.isArray(v)) { return v.length > 0 ? String(v[0] || '') : ''; }
    return typeof v === 'string' ? v : '';
  }

  // "Reacher 2022 (2022) FULL HD" vira "Reacher" (a vassoura fica em titulo.js).
  function limparTitulo(nome) { return VLTV.titulo.limpar(nome); }

  function anoDoNome(nome) {
    var m = /\((\d{4})\)\s*$/.exec(String(nome || ''));
    return m ? m[1] : '';
  }

  function formatarData(texto) {
    if (!texto) { return ''; }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(texto);
  }

  function segundosDe(valor) {
    if (valor === undefined || valor === null || valor === '') { return 0; }
    var s = String(valor);
    var m = /^(\d+):(\d{2}):(\d{2})$/.exec(s);
    if (m) { return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10); }
    m = /^(\d+):(\d{2})$/.exec(s);
    if (m) { return parseInt(m[1], 10) * 60 + parseInt(m[2], 10); }
    return 0;
  }

  function formatarDuracao(seg) {
    if (!seg || seg < 60) { return ''; }
    var h = Math.floor(seg / 3600);
    var m = Math.floor((seg % 3600) / 60);
    return h > 0 ? h + 'h' + ('0' + m).slice(-2) + 'min' : m + 'min';
  }

  function textoRestam(seg) {
    var h = Math.floor(seg / 3600);
    var m = Math.floor((seg % 3600) / 60);
    if (h === 0 && m === 0) { return 'Restam menos de 1min'; }
    return 'Restam ' + (h > 0 ? h + 'h' + m + 'min' : m + 'min');
  }

  function duracaoEpisodio(ep) {
    var inf = ep.info || {};
    var seg = parseInt(inf.duration_secs, 10) || segundosDe(inf.duration);
    return formatarDuracao(seg);
  }

  // ── Dados do título ───────────────────────────────────────────────
  // raw: item como vem do painel (filme: stream_id/stream_icon; série: series_id/cover).
  function normalizar(tipo, raw) {
    var ehSerie = tipo === 'series';
    return {
      tipo: tipo,
      raw: raw,
      id: ehSerie ? raw.series_id : raw.stream_id,
      nome: raw.name || '',
      capa: (ehSerie ? raw.cover : raw.stream_icon) || '',
      fundo: primeiro(raw.backdrop_path),
      sinopse: raw.plot || '',
      nota: raw.rating || '',
      genero: raw.genre || '',
      lancamento: raw.releaseDate || raw.release_date || raw.releasedate || '',
      elenco: raw.cast || '',
      direcao: raw.director || '',
      ext: raw.container_extension,
      url: raw.url
    };
  }

  function idDe(raw) {
    return item.tipo === 'series' ? raw.series_id : raw.stream_id;
  }

  // Tira da frente o nome da série e o "S01E01": "Reacher 2022 (2022) S01E01" vira "Episódio 1".
  function tituloEpisodio(ep, numero) {
    var t = String(ep.title || '').replace(/^\s+|\s+$/g, '');
    var marca = /^.*?\bS\d+\s*E\d+\b[\s\-–:._]*/i.exec(t);
    if (marca) {
      t = t.slice(marca[0].length);
    } else {
      var serie = String(item.nome || '').replace(/^\s+|\s+$/g, '');
      if (serie && t.toLowerCase().indexOf(serie.toLowerCase()) === 0) { t = t.slice(serie.length); }
    }
    t = t.replace(/^[\s\-–:._]+/, '').replace(/\s+$/, '');
    return t || ('Episódio ' + numero);
  }

  // ── Fundo ─────────────────────────────────────────────────────────
  // O fundo é escolhido UMA vez ao abrir o título (imagem que já veio na lista do painel, ou a capa
  // desfocada) e não troca mais: assim a tela não pisca. A logo do TMDB só substitui o nome.
  var timerFundo = null;

  function mostrarFundo() {
    clearTimeout(timerFundo);
    elFundo.style.opacity = '';
  }

  function definirFundo(url, ehCapa) {
    clearTimeout(timerFundo);
    elFundo.className = 'det-fundo' + (ehCapa ? ' desfocado' : '');
    if (!url) {
      elFundo.removeAttribute('src');
      elFundo.style.visibility = 'hidden';
      return;
    }
    elFundo.style.visibility = 'visible';
    elFundo.style.opacity = '0';          // entra suave quando terminar de carregar
    elFundo.onload = mostrarFundo;
    elFundo.src = url;
    if (elFundo.complete && elFundo.naturalWidth > 0) { mostrarFundo(); }
    timerFundo = setTimeout(mostrarFundo, 2500);   // se demorar muito, mostra mesmo assim
  }

  // Fundo escolhido UMA vez por título (sem trocar depois, então não pisca):
  //  1) imagem de fundo que o painel mandou;
  //  2) filmes sem ela: backdrop do TMDB (já guardado na TV = na hora; senão espera um pouco);
  //  3) se o TMDB não responder a tempo ou falhar: capa do painel desfocada.
  var idFundo = 0;
  function escolherFundo() {
    var meu = ++idFundo;
    if (item.fundo) { definirFundo(item.fundo, false); return; }

    var tmdbOk = item.tipo === 'filmes' && (VLTV.tmdb.ativo() || VLTV.tmdb.fundoGuardado('filmes', item.id));
    if (!tmdbOk) { definirFundo(item.capa, true); return; }

    definirFundo('', false);          // preto enquanto decide
    var decidido = false;
    function usarCapa() {
      if (decidido || meu !== idFundo) { return; }
      decidido = true;
      usandoCapa = true;
      definirFundo(item.capa, true);
    }
    function usarTmdb(url) {
      var img = new Image();
      var tentouDireto = false;
      img.onload = function () {
        if (decidido || meu !== idFundo) { return; }
        decidido = true;
        usandoCapa = true;            // se falhar depois de mostrado, não troca de novo
        definirFundo(url, false);
      };
      img.onerror = function () {
        var cdn = VLTV.config.TMDB_IMAGENS_URL;
        if (!tentouDireto && cdn && url.indexOf(cdn) === 0) {
          tentouDireto = true;
          url = 'https://image.tmdb.org' + url.slice(cdn.length);
          img.src = url;
          return;
        }
        usarCapa();
      };
      img.src = url;
    }

    setTimeout(usarCapa, VLTV.config.TMDB_FUNDO_ESPERA_MS || 1800);
    VLTV.tmdb.fundo('filmes', item.id, item.nome).then(function (url) {
      if (decidido || meu !== idFundo) { return; }
      if (url) { usarTmdb(url); } else { usarCapa(); }
    });
  }

  // Se a imagem de fundo falhar, usa a capa desfocada (ou fica só o preto).
  elFundo.onerror = function () {
    if (!usandoCapa && item && item.capa) {
      usandoCapa = true;
      definirFundo(item.capa, true);
    } else {
      mostrarFundo();
      elFundo.style.visibility = 'hidden';
    }
  };

  // ── Logo no lugar do nome (TMDB) ──────────────────────────────────
  function mostrarNome() {
    elLogo.classList.add('escondida');
    elTitulo.classList.remove('escondida');
  }

  // Mostra a logo se existir; se faltar ou falhar ao carregar, o nome limpo continua na tela.
  function colocarLogo(url, meu) {
    var tentouTmdb = false;
    elLogo.onload = function () {
      if (meu !== idLogo) { return; }
      elLogo.classList.remove('escondida');
      elTitulo.classList.add('escondida');
    };
    elLogo.onerror = function () {
      if (meu !== idLogo) { return; }
      var cdn = VLTV.config.TMDB_IMAGENS_URL;
      if (!tentouTmdb && cdn && url.indexOf(cdn) === 0) {   // a VPS falhou: tenta direto no TMDB
        tentouTmdb = true;
        elLogo.src = 'https://image.tmdb.org' + url.slice(cdn.length);
        return;
      }
      mostrarNome();
    };
    elLogo.src = url;
  }

  function carregarLogo() {
    var meu = ++idLogo;
    mostrarNome();
    elLogo.removeAttribute('src');
    if (!VLTV.tmdb.ativo() && !VLTV.tmdb.guardada(item.tipo, item.id)) { return; }

    VLTV.tmdb.logo(item.tipo, item.id, item.nome).then(function (url) {
      if (meu !== idLogo || !url) { return; }
      colocarLogo(url, meu);
    });
  }

  // ── Topo: título, nota, ano, gênero, sinopse ──────────────────────
  function renderTopo() {
    var nome = limparTitulo(info.name || item.nome);
    elTitulo.textContent = nome;

    var nota = parseFloat(String(info.rating || item.nota || '').replace(',', '.'));
    var temNota = !isNaN(nota) && nota > 0;
    elNota.textContent = temNota ? nota.toFixed(1) : '';
    mostrar(elNotaBloco, temNota);

    var dataTxt = info.releasedate || info.releaseDate || info.release_date || item.lancamento || '';
    var m = /(\d{4})/.exec(String(dataTxt));
    var ano = m ? m[1] : anoDoNome(item.nome);
    elAno.textContent = ano;
    mostrar(elAno, !!ano);

    var textoDur = '';
    if (item.tipo === 'series') {
      if (temporadas.length > 0) {
        textoDur = temporadas.length + (temporadas.length === 1 ? ' temporada' : ' temporadas');
      }
    } else {
      textoDur = formatarDuracao(parseInt(info.duration_secs, 10) || segundosDe(info.duration));
    }
    elDuracao.textContent = textoDur;
    mostrar(elDuracao, !!textoDur);

    elQual.textContent = /\b(4k|uhd)\b/i.test(item.nome) ? '4K' : 'HD';

    var genero = String(info.genre || item.genero || '').replace(/\s*[,\/]\s*/g, '  •  ');
    elGenero.textContent = genero;
    mostrar(elGenero, !!genero);

    var sinopse = info.plot || info.description || item.sinopse || '';
    elSinopse.textContent = sinopse || 'Sem sinopse disponível.';
  }

  // ── Botão principal, barra de progresso e Reiniciar ───────────────
  function calcularAlvoSerie() {
    if (plano.length === 0) { return null; }

    var melhor = null;    // episódio visto por último
    plano.forEach(function (e, i) {
      var p = VLTV.dados.progresso(e.chave);
      if (p && p.t && (!melhor || p.t > melhor.p.t)) { melhor = { i: i, p: p }; }
    });

    if (!melhor) { return { indice: 0, continuar: false, pos: 0, dur: 0, rotulo: '' }; }

    var e = plano[melhor.i];
    if (!melhor.p.fim && melhor.p.pos > RESUME_MIN_EP_S) {
      return {
        indice: melhor.i, continuar: true, pos: melhor.p.pos, dur: melhor.p.dur,
        rotulo: 'T' + e.tn + ':E' + e.en
      };
    }
    // Terminou esse episódio: o botão leva ao próximo (ou ao primeiro, se acabou a série).
    var prox = melhor.i + 1 < plano.length ? melhor.i + 1 : 0;
    var n = plano[prox];
    return { indice: prox, continuar: false, pos: 0, dur: 0, rotulo: 'T' + n.tn + ':E' + n.en };
  }

  function atualizarProgresso() {
    if (item.tipo === 'series') {
      alvo = calcularAlvoSerie();
    } else {
      var p = VLTV.dados.progresso('f' + item.id);
      var cont = !!(p && !p.fim && p.pos > RESUME_MIN_FILME_S && p.dur > 0);
      alvo = { indice: 0, continuar: cont, pos: cont ? p.pos : 0, dur: cont ? p.dur : 0, rotulo: '' };
    }

    var texto = 'ASSISTIR';
    if (alvo && alvo.continuar) { texto = 'CONTINUAR'; }
    if (alvo && alvo.rotulo) { texto += ' ' + alvo.rotulo; }
    elPlayTxt.textContent = texto;
    elPlay.classList.toggle('desab', item.tipo === 'series' && !alvo);

    var mostrarBarra = !!(alvo && alvo.continuar && alvo.dur > 0);
    mostrar(elProgresso, mostrarBarra);
    if (mostrarBarra) {
      elBarra.style.width = Math.min(100, Math.round((alvo.pos / alvo.dur) * 100)) + '%';
      elRestam.textContent = textoRestam(alvo.dur - alvo.pos);
    }
    mostrar(elReiniciar, !!(alvo && alvo.continuar));
  }

  function atualizarFav() {
    elFav.classList.toggle('ativo', VLTV.dados.ehFavorito(item.tipo, item.id));
  }

  // ── Abas ──────────────────────────────────────────────────────────
  function abaAtual() { return abas[abaIdx]; }

  function montarAbas() {
    var def = item.tipo === 'series'
      ? [['eps', 'EPISÓDIOS'], ['sug', 'SUGESTÕES'], ['det', 'DETALHES']]
      : [['sug', 'SUGESTÕES'], ['det', 'DETALHES']];
    esvaziar(elAbas);
    abas = [];
    def.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'det-aba';
      el.textContent = d[1];
      elAbas.appendChild(el);
      abas.push({ id: d[0], el: el });
    });
    abaIdx = 0;
    marcarAbas();
  }

  function marcarAbas() {
    abas.forEach(function (a, i) { a.el.classList.toggle('sel', i === abaIdx); });
  }

  function mostrarSecao() {
    var id = abaAtual().id;
    mostrar(elSecEps, id === 'eps');
    mostrar(elSecSug, id === 'sug');
    mostrar(elSecDet, id === 'det');
  }

  // ── Episódios ─────────────────────────────────────────────────────
  function renderTemporadaBtn() {
    var t = temporadas[tempIdx];
    elTemp.textContent = t ? 'Temporada ' + t.numero : 'Temporada';
  }

  function criarEpisodio(ep, i) {
    var numero = ep.episode_num || (i + 1);
    var inf = ep.info || {};

    var li = document.createElement('li');
    li.className = 'ep';

    var thumb = document.createElement('div');
    thumb.className = 'ep-thumb';
    var url = inf.movie_image || inf.cover_big || '';
    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        thumb.insertBefore(document.createTextNode(String(numero)), thumb.firstChild);
      };
      img.src = url;
      thumb.appendChild(img);
    } else {
      thumb.appendChild(document.createTextNode(String(numero)));
    }

    var p = VLTV.dados.progresso('e' + ep.id);
    var linhaDur = duracaoEpisodio(ep);
    if (p && p.dur > 0) {
      var barra = document.createElement('div');
      barra.className = 'ep-prog';
      var cheia = document.createElement('div');
      cheia.className = 'ep-prog-cheia';
      cheia.style.width = (p.fim ? 100 : Math.min(100, Math.round((p.pos / p.dur) * 100))) + '%';
      barra.appendChild(cheia);
      thumb.appendChild(barra);
      if (p.fim) {
        li.classList.add('fim');
        linhaDur = (linhaDur ? linhaDur + '  •  ' : '') + 'Assistido';
      }
    }

    var selo = document.createElement('div');
    selo.className = 'ep-num';
    selo.textContent = String(numero);
    thumb.appendChild(selo);

    var txt = document.createElement('div');
    txt.className = 'ep-txt';

    var tit = document.createElement('div');
    tit.className = 'ep-tit';
    tit.textContent = tituloEpisodio(ep, numero);
    txt.appendChild(tit);

    if (linhaDur) {
      var dur = document.createElement('div');
      dur.className = 'ep-dur';
      dur.textContent = linhaDur;
      txt.appendChild(dur);
    }

    li.appendChild(thumb);
    li.appendChild(txt);
    return li;
  }

  function renderEpisodios() {
    esvaziar(elEps);
    elEps._y = 0;
    elEps.style.transform = '';
    itensEps = [];
    var t = temporadas[tempIdx];
    if (!t) { return; }
    t.episodios.forEach(function (ep, i) {
      var li = criarEpisodio(ep, i);
      elEps.appendChild(li);
      itensEps.push(li);
    });
  }

  // ── Sugestões (outros títulos da mesma categoria) ─────────────────
  function criarCelula(raw) {
    var ehSerie = item.tipo === 'series';
    var nomeItem = raw.name || '';
    var url = (ehSerie ? raw.cover : raw.stream_icon) || '';

    var li = document.createElement('li');
    li.className = 'celula';

    var capa = document.createElement('div');
    capa.className = 'capa';
    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        capa.textContent = nomeItem.charAt(0).toUpperCase();
      };
      img.src = url;
      capa.appendChild(img);
    } else {
      capa.textContent = nomeItem.charAt(0).toUpperCase();
    }

    var nome = document.createElement('div');
    nome.className = 'celula-nome';
    nome.textContent = VLTV.titulo.limpar(nomeItem);

    li.appendChild(capa);
    li.appendChild(nome);
    return li;
  }

  function renderSugestoes() {
    esvaziar(elSug);
    elSug._y = 0;
    elSug.style.transform = '';
    itensSug = [];
    sugIdx = 0;

    var pos = -1;
    for (var i = 0; i < base.length; i++) {
      if (String(idDe(base[i])) === String(item.id)) { pos = i; break; }
    }
    var lista = [];
    for (var k = 1; k < base.length && lista.length < MAX_SUG; k++) {
      lista.push(base[(pos + k + base.length) % base.length]);
    }

    if (lista.length === 0) {
      mensagem(elSug, 'Sem sugestões por enquanto.');
      return;
    }
    lista.forEach(function (raw) {
      var li = criarCelula(raw);
      li._raw = raw;
      elSug.appendChild(li);
      itensSug.push(li);
    });
  }

  // ── Aba Detalhes ──────────────────────────────────────────────────
  function linha(rotulo, valor) {
    if (!valor) { return; }
    var div = document.createElement('div');
    div.className = 'det-linha';
    var r = document.createElement('span');
    r.className = 'det-rot';
    r.textContent = rotulo + ':';
    var v = document.createElement('span');
    v.className = 'det-val';
    v.textContent = valor;
    div.appendChild(r);
    div.appendChild(v);
    elSecDet.firstChild.appendChild(div);
  }

  function renderDetalhes() {
    esvaziar(elSecDet);
    var caixa = document.createElement('div');
    caixa.className = 'det-info';
    elSecDet.appendChild(caixa);

    var tit = document.createElement('div');
    tit.className = 'det-info-titulo';
    tit.textContent = limparTitulo(info.name || item.nome);
    caixa.appendChild(tit);

    var sin = document.createElement('div');
    sin.className = 'det-info-sin';
    sin.textContent = info.plot || info.description || item.sinopse || 'Sem sinopse disponível.';
    caixa.appendChild(sin);

    var elenco = String(info.cast || info.actors || item.elenco || '');
    if (elenco.length > 220) { elenco = elenco.slice(0, 217) + '...'; }

    var dur = item.tipo === 'series'
      ? (temporadas.length > 0 ? String(temporadas.length) : '')
      : formatarDuracao(parseInt(info.duration_secs, 10) || segundosDe(info.duration));

    linha(item.tipo === 'series' ? 'Temporadas' : 'Duração', dur);
    linha('Data de lançamento', formatarData(info.releasedate || info.releaseDate || info.release_date || item.lancamento));
    linha('Gênero', String(info.genre || item.genero || '').replace(/\s*[,\/]\s*/g, ', '));
    linha('Direção', String(info.director || item.direcao || ''));
    linha('Elenco', elenco);
  }

  // ── Foco e rolagem ────────────────────────────────────────────────
  function botoesSec() {
    var lista = [];
    if (!elReiniciar.classList.contains('escondida')) { lista.push(elReiniciar); }
    lista.push(elFav);
    return lista;
  }

  function elementoFoco() {
    if (zona === 'play') { return elPlay; }
    if (zona === 'sec') { return botoesSec()[secIdx] || null; }
    if (zona === 'abas') { return abaAtual().el; }
    if (zona === 'temp') { return elTemp; }
    if (zona === 'lista') { return abaAtual().id === 'eps' ? itensEps[epIdx] : itensSug[sugIdx]; }
    return null;
  }

  // Mantém o item focado dentro da janela da lista (a lista anda por transform).
  function rolarLista(janela, ul, li) {
    if (!li || !janela.clientHeight) { return; }
    var atual = ul._y || 0;
    var topo = li.offsetTop;
    var fundo = topo + li.offsetHeight;
    var h = janela.clientHeight;
    if (topo < atual) { atual = topo; }
    else if (fundo > atual + h) { atual = fundo - h; }
    atual = Math.max(0, atual);
    ul._y = atual;
    ul.style.transform = 'translateY(' + (-atual) + 'px)';
  }

  // Parte de cima (botões) ou parte de baixo (abas e listas): a página sobe como no celular.
  function atualizarRolagem() {
    var rolar = zona === 'abas' || zona === 'temp' || zona === 'lista';
    var y = rolar ? Math.max(0, elAbas.offsetTop - MARGEM_ABAS_PX) : 0;
    elPagina.style.transform = 'translateY(' + (-y) + 'px)';
    elGradRolado.className = 'det-grad-rolado' + (rolar ? ' ativo' : '');
    elFadeTopo.className = 'det-fade-topo' + (rolar ? ' ativo' : '');
  }

  function marcarFoco() {
    if (elFocoAtual) { elFocoAtual.classList.remove('foco'); }
    elFocoAtual = elementoFoco() || null;
    if (elFocoAtual) { elFocoAtual.classList.add('foco'); }
    atualizarRolagem();
    if (zona === 'lista' && elFocoAtual) {
      if (abaAtual().id === 'eps') { rolarLista(elEpsJanela, elEps, elFocoAtual); }
      else { rolarLista(elSugJanela, elSug, elFocoAtual); }
    }
  }

  // ── Temporadas (janela de escolha) ────────────────────────────────
  function renderPopup() {
    esvaziar(elPopupLista);
    elPopupLista._y = 0;
    elPopupLista.style.transform = '';
    itensPopup = [];
    temporadas.forEach(function (t, i) {
      var li = document.createElement('li');
      li.textContent = 'Temporada ' + t.numero;
      if (i === tempIdx) { li.className = 'atual'; }
      elPopupLista.appendChild(li);
      itensPopup.push(li);
    });
  }

  function marcarPopup() {
    itensPopup.forEach(function (li, i) { li.classList.toggle('sel', i === popupIdx); });
    rolarLista(elPopupJanela, elPopupLista, itensPopup[popupIdx]);
  }

  function abrirPopup() {
    if (temporadas.length === 0) { return; }
    popupAberto = true;
    popupIdx = tempIdx;
    renderPopup();
    mostrar(elPopup, true);
    marcarPopup();
  }

  function fecharPopup() {
    popupAberto = false;
    mostrar(elPopup, false);
  }

  function escolherTemporada(i) {
    tempIdx = i;
    epIdx = 0;
    renderTemporadaBtn();
    renderEpisodios();
    fecharPopup();
    marcarFoco();
  }

  function teclaPopup(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { fecharPopup(); return true; }
    if (k === TECLA.CIMA) { if (popupIdx > 0) { popupIdx--; marcarPopup(); } return true; }
    if (k === TECLA.BAIXO) { if (popupIdx < itensPopup.length - 1) { popupIdx++; marcarPopup(); } return true; }
    if (k === TECLA.ENTER) { escolherTemporada(popupIdx); return true; }
    return k === TECLA.ESQ || k === TECLA.DIR;
  }

  // ── Ações ─────────────────────────────────────────────────────────
  function itemFilme() {
    return {
      titulo: limparTitulo(info.name || item.nome),
      tipo: 'movie',
      id: item.id,
      ext: item.ext || info.container_extension,
      url: item.url,
      chave: 'f' + item.id
    };
  }

  // Filme ou série adulto (ou com classificação 18+) pede a senha antes de assistir.
  function comSenha(depois) {
    VLTV.parental.checarReproducao({ raw: item.raw, info: info, tipo: item.tipo }, depois);
  }

  function tocarPrincipal(doInicio) {
    if (item.tipo === 'series') {
      if (!alvo) { return; }
      comSenha(function () {
        acoes.reproduzir(plano, alvo.indice, (!doInicio && alvo.continuar) ? alvo.pos : 0);
      });
    } else {
      comSenha(function () {
        acoes.reproduzir([itemFilme()], 0, (!doInicio && alvo && alvo.continuar) ? alvo.pos : 0);
      });
    }
  }

  function tocarEpisodio() {
    var t = temporadas[tempIdx];
    if (!t) { return; }
    var i = t.inicio + epIdx;
    var p = plano[i] ? VLTV.dados.progresso(plano[i].chave) : null;
    var inicio = (p && !p.fim && p.pos > RESUME_MIN_FILME_S) ? p.pos : 0;
    comSenha(function () { acoes.reproduzir(plano, i, inicio); });
  }

  function alternarFav() {
    VLTV.dados.alternarFavorito({ tipo: item.tipo, id: item.id, nome: item.nome, capa: item.capa, raw: item.raw });
    atualizarFav();
  }

  function abrirSugestao(raw) {
    pilha.push({ tipo: item.tipo, raw: item.raw });
    carregar(item.tipo, raw);
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function entrarConteudo() {
    var id = abaAtual().id;
    if (id === 'eps') {
      if (temporadas.length > 1 || falha) { zona = 'temp'; }
      else if (itensEps.length > 0) { zona = 'lista'; }
    } else if (id === 'sug') {
      if (itensSug.length > 0) { zona = 'lista'; }
    }
  }

  function teclaSugestoes(k) {
    var n = itensSug.length;
    if (k === TECLA.ESQ) { if (sugIdx % COL_SUG > 0) { sugIdx--; } }
    else if (k === TECLA.DIR) { if (sugIdx < n - 1 && sugIdx % COL_SUG < COL_SUG - 1) { sugIdx++; } }
    else if (k === TECLA.CIMA) { if (sugIdx >= COL_SUG) { sugIdx -= COL_SUG; } else { zona = 'abas'; } }
    else if (k === TECLA.BAIXO) {
      if (sugIdx + COL_SUG < n) { sugIdx += COL_SUG; }
      else if (Math.floor(sugIdx / COL_SUG) < Math.floor((n - 1) / COL_SUG)) { sugIdx = n - 1; }
    }
    else if (k === TECLA.ENTER) { if (itensSug[sugIdx]) { abrirSugestao(itensSug[sugIdx]._raw); } return; }
  }

  function teclaEpisodios(k) {
    var n = itensEps.length;
    if (k === TECLA.ESQ) { if (epIdx % COL_EPS > 0) { epIdx--; } }
    else if (k === TECLA.DIR) { if (epIdx < n - 1 && epIdx % COL_EPS < COL_EPS - 1) { epIdx++; } }
    else if (k === TECLA.CIMA) {
      if (epIdx >= COL_EPS) { epIdx -= COL_EPS; }
      else { zona = (temporadas.length > 1 || falha) ? 'temp' : 'abas'; }
    }
    else if (k === TECLA.BAIXO) {
      if (epIdx + COL_EPS < n) { epIdx += COL_EPS; }
      else if (Math.floor(epIdx / COL_EPS) < Math.floor((n - 1) / COL_EPS)) { epIdx = n - 1; }
    }
    // CH+/CH- (ou PG): pula algumas linhas de uma vez, para séries com muitos episódios.
    else if (k === TECLA.CH_MAIS || k === TECLA.PG_BAIXO) {
      epIdx = Math.min(n - 1, epIdx + COL_EPS * LINHAS_PAGINA_EPS);
    }
    else if (k === TECLA.CH_MENOS || k === TECLA.PG_CIMA) {
      epIdx = Math.max(0, epIdx - COL_EPS * LINHAS_PAGINA_EPS);
    }
    else if (k === TECLA.ENTER) { tocarEpisodio(); }
  }

  function voltar() {
    // Primeiro volta ao topo da página; de lá, sai da tela.
    if (zona === 'abas' || zona === 'temp' || zona === 'lista') {
      zona = 'play';
      marcarFoco();
      return;
    }
    if (pilha.length > 0) {
      var anterior = pilha.pop();
      carregar(anterior.tipo, anterior.raw);
      return;
    }
    acoes.sair();
  }

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (popupAberto) { return teclaPopup(k); }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { voltar(); return true; }
    if (k !== TECLA.CIMA && k !== TECLA.BAIXO && k !== TECLA.ESQ && k !== TECLA.DIR && k !== TECLA.ENTER) {
      return false;
    }

    if (zona === 'play') {
      if (k === TECLA.BAIXO) { zona = 'sec'; secIdx = 0; }
      else if (k === TECLA.ENTER) { tocarPrincipal(false); return true; }
    }
    else if (zona === 'sec') {
      var botoes = botoesSec();
      if (k === TECLA.ESQ) { secIdx = Math.max(0, secIdx - 1); }
      else if (k === TECLA.DIR) { secIdx = Math.min(botoes.length - 1, secIdx + 1); }
      else if (k === TECLA.CIMA) { zona = 'play'; }
      else if (k === TECLA.BAIXO) { zona = 'abas'; }
      else if (k === TECLA.ENTER) {
        if (botoes[secIdx] === elReiniciar) { tocarPrincipal(true); } else { alternarFav(); }
        return true;
      }
    }
    else if (zona === 'abas') {
      if (k === TECLA.ESQ || k === TECLA.DIR) {
        var novo = abaIdx + (k === TECLA.ESQ ? -1 : 1);
        if (novo >= 0 && novo < abas.length) {
          abaIdx = novo;
          marcarAbas();
          mostrarSecao();
        }
      }
      else if (k === TECLA.CIMA) { zona = 'sec'; secIdx = Math.min(secIdx, botoesSec().length - 1); }
      else { entrarConteudo(); }     // baixo ou OK
    }
    else if (zona === 'temp') {
      if (k === TECLA.CIMA) { zona = 'abas'; }
      else if (k === TECLA.BAIXO) { if (itensEps.length > 0) { zona = 'lista'; } }
      else if (k === TECLA.ENTER) {
        if (falha) { carregarInfo(); } else { abrirPopup(); return true; }
      }
    }
    else if (zona === 'lista') {
      if (abaAtual().id === 'eps') { teclaEpisodios(k); } else { teclaSugestoes(k); }
    }

    marcarFoco();
    return true;
  }

  // ── Carregamento ──────────────────────────────────────────────────
  function montarSerie(dados) {
    info = dados.info || {};
    temporadas = dados.temporadas || [];
    plano = [];
    var nomeLimpo = limparTitulo(info.name || item.nome);

    temporadas.forEach(function (t, ti) {
      t.inicio = plano.length;
      t.episodios.forEach(function (ep, pos) {
        var numero = ep.episode_num || (pos + 1);
        var tit = tituloEpisodio(ep, numero);
        plano.push({
          titulo: nomeLimpo + ' - T' + t.numero + ' E' + numero + (tit.indexOf('Episódio ') === 0 ? '' : ' - ' + tit),
          tipo: 'series',
          id: ep.id,
          ext: ep.container_extension,
          url: ep.url,
          chave: 'e' + ep.id,
          temp: ti,
          pos: pos,
          tn: t.numero,
          en: numero
        });
      });
    });
    // Chave da série nos créditos aprendidos: id do 1º episódio da série inteira (igual ao Android).
    plano.forEach(function (p) { p.serie = plano[0].id; });

    renderTopo();
    renderDetalhes();
    atualizarProgresso();

    if (temporadas.length === 0) {
      mensagem(elEps, 'Nenhum episódio disponível.');
      return;
    }

    // Abre já na temporada do episódio que o botão principal toca.
    tempIdx = alvo ? plano[alvo.indice].temp : 0;
    epIdx = alvo ? plano[alvo.indice].pos : 0;
    renderTemporadaBtn();
    renderEpisodios();
    if (zona === 'lista' || zona === 'temp') { marcarFoco(); }
  }

  function montarFilme(dados) {
    info = dados || {};
    renderTopo();
    renderDetalhes();
    atualizarProgresso();
  }

  function carregarInfo() {
    var meu = ++idCarga;
    falha = false;

    if (item.tipo === 'series') {
      mensagem(elEps, 'Carregando...');
      VLTV.api.infoSerie(item.id)
        .then(function (d) {
          if (meu !== idCarga) { return; }
          montarSerie(d);
        })
        .catch(function () {
          if (meu !== idCarga) { return; }
          falha = true;
          mensagem(elEps, 'Não foi possível carregar os episódios. Pressione OK em "Temporada" para tentar de novo.');
        });
    } else {
      VLTV.api.infoFilme(item.id)
        .then(function (d) {
          if (meu !== idCarga) { return; }
          montarFilme(d);
        })
        .catch(function () { /* segue só com os dados do catálogo */ });
    }
  }

  function carregar(tipo, raw) {
    idCarga++;
    item = normalizar(tipo, raw);
    info = {};
    temporadas = [];
    plano = [];
    alvo = null;
    falha = false;
    tempIdx = 0;
    epIdx = 0;
    sugIdx = 0;
    secIdx = 0;
    zona = 'play';
    usandoCapa = !item.fundo;
    popupAberto = false;
    mostrar(elPopup, false);
    itensEps = [];
    esvaziar(elEps);

    escolherFundo();
    renderTopo();
    carregarLogo();
    montarAbas();
    renderDetalhes();
    renderSugestoes();
    renderTemporadaBtn();
    mostrarSecao();
    atualizarProgresso();
    atualizarFav();
    marcarFoco();
    carregarInfo();
  }

  // tipoNovo: 'filmes' ou 'series'. raw: item do catálogo. lista: títulos da mesma categoria.
  // acoesNovas: { sair, reproduzir(lista, indice, inicioSeg) }
  function abrir(tipoNovo, raw, lista, acoesNovas) {
    acoes = acoesNovas;
    base = lista || [];
    pilha = [];
    carregar(tipoNovo, raw);
  }

  // Chamado quando o vídeo termina ou o usuário aperta Voltar no player.
  function voltou(ultimoIndice) {
    atualizarProgresso();
    if (item.tipo === 'series' && plano.length > 0 && plano[ultimoIndice]) {
      var it = plano[ultimoIndice];
      tempIdx = it.temp;
      renderTemporadaBtn();
      renderEpisodios();
      epIdx = it.pos;
      var iEps = -1;
      abas.forEach(function (a, i) { if (a.id === 'eps') { iEps = i; } });
      if (iEps !== -1) { abaIdx = iEps; marcarAbas(); mostrarSecao(); }
      zona = 'lista';
    } else {
      zona = 'play';
    }
    marcarFoco();
  }

  VLTV.detalhes = { abrir: abrir, tecla: tecla, voltou: voltou };
})();
