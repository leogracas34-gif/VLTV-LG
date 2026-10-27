// VLTV Play - webOS | Detalhes de filmes e séries (estilo Netflix).
// Tela principal: fundo que troca devagar (imagens do TMDB), título/logo, nota, ano, gêneros, sinopse, elenco e
// um menu vertical (Assistir/Continuar, Assistir desde o início, Episódios e mais, Títulos semelhantes, Minha lista).
// "Episódios e mais" (só séries): temporadas fixas na coluna da esquerda e episódios em lista na direita;
// ao passar do último episódio da temporada, cai no primeiro da próxima e a temporada da esquerda acompanha.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40, PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428 };

  var PASSO_PAGINA_EPS = 5;     // CH+/CH- pulam esta quantidade de episódios
  var COL_SUG = 7;              // capas por linha nos títulos semelhantes
  var MAX_SUG = 14;             // quantas sugestões mostrar
  var RESUME_MIN_FILME_S = 30;  // só oferece "continuar" depois de 30 s assistidos
  var RESUME_MIN_EP_S = 30;
  var INTERVALO_FUNDO_MS = 9000; // de quanto em quanto tempo o fundo troca de imagem

  function $(id) { return document.getElementById(id); }

  var elTela = $('tela-detalhes');
  var camadas = [$('det-fundo'), $('det-fundo2')];   // duas camadas: uma entra enquanto a outra sai
  var elGradRolado = $('det-grad-rolado');
  var elPrincipal = $('det-principal');
  var elTitulo = $('det-titulo');
  var elLogo = $('det-logo');
  var elNotaBloco = $('det-nota-bloco');
  var elNota = $('det-nota');
  var elAno = $('det-ano');
  var elDuracao = $('det-duracao');
  var elQual = $('det-qual');
  var elGenero = $('det-genero');
  var elSinopse = $('det-sinopse');
  var elCreditos = $('det-creditos');
  var elPlay = $('det-play');
  var elPlayTxt = $('det-play-txt');
  var elProgresso = $('det-progresso');
  var elBarra = $('det-barra-cheia');
  var elRestam = $('det-restam');
  var elReiniciar = $('det-reiniciar');
  var elBtnEps = $('det-btn-eps');
  var elBtnSug = $('det-btn-sug');
  var elFav = $('det-fav');
  var elEpsTela = $('det-eps-tela');
  var elEpsNome = $('det-eps-nome');
  var elTempsJanela = $('det-temps-janela');
  var elTemps = $('det-temps');
  var elEpsJanela = $('det-eps-janela');
  var elEps = $('det-eps');
  var elSugTela = $('det-sug-tela');
  var elSugJanela = $('det-sug-janela');
  var elSug = $('det-sug');

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

  var modo = 'principal';   // 'principal' | 'eps' | 'sug'
  var menuIdx = 0;
  var zonaEps = 'eps';      // 'eps' (lista de episódios) | 'temps' (coluna das temporadas)
  var tempIdx = 0;
  var epIdx = 0;
  var sugIdx = 0;
  var itensTemps = [];
  var itensEps = [];
  var itensSug = [];
  var elFocoAtual = null;

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

  // Nome que vai para o player: em inglês, o título do TMDB (já guardado na TV); senão o nome limpo do painel.
  function nomeDoPlayer() {
    if (VLTV.idioma.ehIngles()) {
      if (!tituloEn && item) {
        var g = VLTV.tmdb.textosGuardados(item.tipo, item.id);
        if (g && g.titulo) { tituloEn = g.titulo; }
      }
      if (tituloEn) { return tituloEn; }
    }
    return limparTitulo(info.name || item.nome);
  }

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
  // Primeira imagem escolhida UMA vez por título (a que veio no painel, o backdrop do TMDB ou a capa desfocada).
  // Com o TMDB ligado, depois de alguns segundos o fundo passa a trocar devagar entre outras imagens do mesmo
  // título (sem texto escrito), cada uma com um zoom lento. Não gasta conexão do cliente: são só imagens.
  var timerFundo = null;
  var camAtiva = 0;
  var listaFundos = [];
  var fundoIdx = 0;
  var timerTroca = null;
  var idTroca = 0;

  function definirFundo(url, ehCapa) {
    clearTimeout(timerFundo);
    var c = camadas[camAtiva];
    var o = camadas[1 - camAtiva];
    o.className = 'det-fundo';
    o.onload = null;
    c.className = 'det-fundo' + (ehCapa ? ' desfocado' : '');
    if (!url) {
      c.removeAttribute('src');
      c.style.visibility = 'hidden';
      return;
    }
    function pronto() {
      clearTimeout(timerFundo);
      c.classList.add('visivel');
      if (!ehCapa) { c.classList.add('zoom'); }
    }
    c.style.visibility = 'visible';
    c.onload = pronto;
    c.src = url;
    if (c.complete && c.naturalWidth > 0) { pronto(); }
    timerFundo = setTimeout(pronto, 2500);   // se demorar muito, mostra mesmo assim
  }

  function pararTroca() {
    clearTimeout(timerTroca);
    idTroca++;
    listaFundos = [];
  }

  function agendarTroca(meu) {
    clearTimeout(timerTroca);
    timerTroca = setTimeout(function () { proximoFundo(meu); }, INTERVALO_FUNDO_MS);
  }

  function proximoFundo(meu) {
    if (meu !== idTroca || listaFundos.length < 2) { return; }
    if (elTela.classList.contains('escondida')) { agendarTroca(meu); return; }   // vídeo tocando: espera
    var url = listaFundos[fundoIdx % listaFundos.length];
    fundoIdx++;
    var img = new Image();
    img.onload = function () {
      if (meu !== idTroca) { return; }
      var velha = camadas[camAtiva];
      var nova = camadas[1 - camAtiva];
      nova.onload = null;
      nova.className = 'det-fundo';
      nova.style.visibility = 'visible';
      nova.src = url;
      void nova.offsetWidth;                       // reinicia a transição e o zoom
      nova.classList.add('visivel');
      nova.classList.add('zoom');
      velha.classList.remove('visivel');
      camAtiva = 1 - camAtiva;
      setTimeout(function () {
        if (meu === idTroca && velha !== camadas[camAtiva]) { velha.classList.remove('zoom'); }
      }, 2000);
      agendarTroca(meu);
    };
    img.onerror = function () { if (meu === idTroca) { agendarTroca(meu); } };   // pula essa imagem
    img.src = url;
  }

  // urlAtual: o fundo que já está na tela (entra no rodízio). Só roda com o TMDB ligado.
  function iniciarTroca(urlAtual) {
    var meu = ++idTroca;
    clearTimeout(timerTroca);
    if (!VLTV.tmdb.ativo() || !item) { return; }
    VLTV.tmdb.fundos(item.tipo, item.id, item.nome).then(function (urls) {
      if (meu !== idTroca || !urls || urls.length === 0) { return; }
      var fim = String(urlAtual || '').split('/').pop();
      var outros = urls.filter(function (u) { return !fim || u.split('/').pop() !== fim; });
      if (outros.length === 0) { return; }
      listaFundos = urlAtual ? [urlAtual].concat(outros) : outros;
      fundoIdx = urlAtual ? 1 : 0;
      agendarTroca(meu);
    });
  }

  // Fundo escolhido UMA vez por título (sem trocar de repente, então não pisca):
  //  1) imagem de fundo que o painel mandou;
  //  2) filmes e séries sem ela: backdrop do TMDB (já guardado na TV = na hora; senão espera um pouco);
  //  3) se o TMDB não responder a tempo ou falhar: capa do painel desfocada.
  var idFundo = 0;
  function escolherFundo() {
    var meu = ++idFundo;
    if (item.fundo) { definirFundo(item.fundo, false); iniciarTroca(item.fundo); return; }

    var tmdbOk = VLTV.tmdb.ativo() || VLTV.tmdb.fundoGuardado(item.tipo, item.id);
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
        iniciarTroca(url);
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
    VLTV.tmdb.fundo(item.tipo, item.id, item.nome).then(function (url) {
      if (decidido || meu !== idFundo) { return; }
      if (url) { usarTmdb(url); } else { usarCapa(); }
    });
  }

  // Se a imagem de fundo falhar, usa a capa desfocada (ou fica só o preto).
  function aoFalharFundo(c) {
    return function () {
      if (c !== camadas[camAtiva]) { return; }
      if (!usandoCapa && item && item.capa) {
        usandoCapa = true;
        definirFundo(item.capa, true);
      } else {
        c.classList.add('visivel');
        c.style.visibility = 'hidden';
      }
    };
  }
  camadas[0].onerror = aoFalharFundo(camadas[0]);
  camadas[1].onerror = aoFalharFundo(camadas[1]);

  // ── Logo no lugar do nome (TMDB) ──────────────────────────────────
  var timerNome = 0;   // se a logo demorar, mostra o nome depois desse tempo
  function mostrarNome() {
    clearTimeout(timerNome);
    elTitulo.style.visibility = '';
    elLogo.classList.add('escondida');
    elTitulo.classList.remove('escondida');
  }

  // Mostra a logo se existir; se faltar ou falhar ao carregar, o nome limpo continua na tela.
  function colocarLogo(url, meu) {
    var tentouTmdb = false;
    elLogo.onload = function () {
      if (meu !== idLogo) { return; }
      clearTimeout(timerNome);
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

  // Sem piscar: se a logo já é conhecida (ou ainda vai ser procurada), o nome em texto fica escondido
  // até a logo aparecer. O nome só aparece se o título não tem logo ou se a logo falhar/demorar demais.
  function carregarLogo() {
    var meu = ++idLogo;
    clearTimeout(timerNome);
    elLogo.classList.add('escondida');
    elLogo.removeAttribute('src');
    elTitulo.classList.remove('escondida');
    elTitulo.style.visibility = '';

    var guard = VLTV.tmdb.guardada(item.tipo, item.id);   // endereço da logo, '' = não tem, null = nunca procurou
    if (!VLTV.tmdb.ativo() && !guard) { return; }
    if (guard === '') { return; }                          // já sabemos que não tem logo: só o nome

    elTitulo.style.visibility = 'hidden';                  // some o texto (o espaço continua reservado)
    timerNome = setTimeout(function () {
      if (meu === idLogo) { mostrarNome(); }
    }, guard ? 2500 : 1500);

    VLTV.tmdb.logo(item.tipo, item.id, item.nome).then(function (url) {
      if (meu !== idLogo) { return; }
      if (!url) { mostrarNome(); return; }
      colocarLogo(url, meu);
    });
  }

  var idsTxt = { topo: 0, info: 0 };
  var basePlano = '';      // nome da série usado no começo do título de cada episódio do plano
  // O título em inglês chegou depois de o plano ser montado: troca o começo do nome dos episódios.
  function trocarBasePlano(novo) {
    if (!basePlano || basePlano === novo) { return; }
    var velho = basePlano + ' - T';
    plano.forEach(function (e) {
      if (e.titulo && e.titulo.indexOf(velho) === 0) { e.titulo = novo + ' - T' + e.titulo.slice(velho.length); }
    });
    basePlano = novo;
  }
  var tituloEn = '';       // título em inglês do TMDB (usado no nome dos episódios que vão para o player)
  // TMDB: em inglês troca título e sinopse pelos de lá (o painel manda em português). Em qualquer idioma,
  // se o painel não mandou sinopse (semSinopse), busca a sinopse no TMDB; ela fica guardada na TV.
  function textosEmIngles(onde, semSinopse, aplicar) {
    var ingles = VLTV.idioma.ehIngles();
    var meu = ++idsTxt[onde];   // sempre conta: uma resposta antiga do TMDB nunca cobre a sinopse que o painel mandou depois
    if (!ingles && !semSinopse) { return; }
    VLTV.tmdb.textos(item.tipo, item.id, item.nome).then(function (r) {
      if (meu !== idsTxt[onde] || !r) { return; }
      if (ingles && r.titulo) {
        tituloEn = r.titulo;
        trocarBasePlano(r.titulo);
      }
      aplicar(ingles ? r : { titulo: '', sinopse: r.sinopse });
    });
  }

  // ── Topo: título, nota, ano, gêneros, sinopse, elenco ─────────────
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

    // No máximo 3 gêneros, para a linha não ficar comprida.
    var generos = String(info.genre || item.genero || '').split(/\s*[,\/]\s*/).filter(function (g) { return g !== ''; }).slice(0, 3);
    var genero = VLTV.idioma.categoria(generos.join('  •  '));
    elGenero.textContent = genero;
    mostrar(elGenero, !!genero);

    var sinopse = info.plot || info.description || item.sinopse || '';
    elSinopse.textContent = sinopse || 'Sem sinopse disponível.';
    textosEmIngles('topo', !sinopse, function (r) {
      if (r.titulo) { elTitulo.textContent = r.titulo; }
      if (r.sinopse) { elSinopse.textContent = r.sinopse; }
    });

    renderCreditos();
  }

  function linhaCredito(rotulo, valor) {
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
    elCreditos.appendChild(div);
  }

  // Primeiros nomes de uma lista separada por vírgula.
  function primeirosNomes(texto, quantos) {
    return String(texto || '').split(/\s*,\s*/).filter(function (n) { return n !== ''; }).slice(0, quantos).join(', ');
  }

  function renderCreditos() {
    esvaziar(elCreditos);
    linhaCredito('Elenco', primeirosNomes(info.cast || info.actors || item.elenco, 4));
    linhaCredito('Direção', primeirosNomes(info.director || item.direcao, 2));
  }

  // ── Botão principal, barra de progresso e Assistir desde o início ─
  function calcularAlvoSerie() {
    if (plano.length === 0) { return null; }

    var melhor = null;    // episódio visto por último
    plano.forEach(function (e, i) {
      var p = VLTV.dados.progresso(e.chave);
      if (p && p.t && (!melhor || p.t > melhor.p.t)) { melhor = { i: i, p: p }; }
    });

    if (!melhor) { return { indice: 0, continuar: false, pos: 0, dur: 0, rotulo: 'T' + plano[0].tn + ': Ep. ' + plano[0].en }; }

    var e = plano[melhor.i];
    if (!melhor.p.fim && melhor.p.pos > RESUME_MIN_EP_S) {
      return {
        indice: melhor.i, continuar: true, pos: melhor.p.pos, dur: melhor.p.dur,
        rotulo: 'T' + e.tn + ': Ep. ' + e.en
      };
    }
    // Terminou esse episódio: o botão leva ao próximo (ou ao primeiro, se acabou a série).
    var prox = melhor.i + 1 < plano.length ? melhor.i + 1 : 0;
    var n = plano[prox];
    return { indice: prox, continuar: false, pos: 0, dur: 0, rotulo: 'T' + n.tn + ': Ep. ' + n.en };
  }

  function atualizarProgresso() {
    if (item.tipo === 'series') {
      alvo = calcularAlvoSerie();
    } else {
      var p = VLTV.dados.progresso('f' + item.id);
      var cont = !!(p && !p.fim && p.pos > RESUME_MIN_FILME_S && p.dur > 0);
      alvo = { indice: 0, continuar: cont, pos: cont ? p.pos : 0, dur: cont ? p.dur : 0, rotulo: '' };
    }

    var texto = (alvo && alvo.continuar) ? 'Continuar' : 'Assistir';
    if (alvo && alvo.rotulo) { texto += ' ' + alvo.rotulo; }
    elPlayTxt.textContent = texto;
    elPlay.classList.toggle('desab', item.tipo === 'series' && !alvo);

    var mostrarBarra = !!(alvo && alvo.continuar && alvo.dur > 0);
    mostrar(elProgresso, mostrarBarra);
    if (mostrarBarra) {
      elBarra.style.width = Math.min(100, Math.round((alvo.pos / alvo.dur) * 100)) + '%';
      elRestam.textContent = textoRestam(alvo.dur - alvo.pos);
    } else {
      elRestam.textContent = '';
    }
    mostrar(elReiniciar, !!(alvo && alvo.continuar));
    mostrar(elBtnEps, item.tipo === 'series');
    var n = itensMenu().length;
    if (menuIdx > n - 1) { menuIdx = Math.max(0, n - 1); }
  }

  function atualizarFav() {
    elFav.classList.toggle('ativo', VLTV.dados.ehFavorito(item.tipo, item.id));
  }

  function itensMenu() {
    return [elPlay, elReiniciar, elBtnEps, elBtnSug, elFav].filter(function (el) {
      return !el.classList.contains('escondida');
    });
  }

  // ── Temporadas e episódios ────────────────────────────────────────
  function renderTemporadas() {
    esvaziar(elTemps);
    elTemps._y = 0;
    elTemps.style.transform = '';
    itensTemps = [];
    temporadas.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = 'Temporada ' + t.numero;
      elTemps.appendChild(li);
      itensTemps.push(li);
    });
    marcarTemporadaAtual();
  }

  function marcarTemporadaAtual() {
    itensTemps.forEach(function (li, i) { li.classList.toggle('sel', i === tempIdx); });
  }

  function criarEpisodio(ep, i) {
    var numero = ep.episode_num || (i + 1);
    var inf = ep.info || {};

    var li = document.createElement('li');
    li.className = 'ep';

    var num = document.createElement('div');
    num.className = 'ep-n';
    num.textContent = String(numero);

    var thumb = document.createElement('div');
    thumb.className = 'ep-thumb';
    var url = inf.movie_image || inf.cover_big || '';
    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        if (li._tmdbImg) { imagemEpisodio(li, li._tmdbImg); }
      };
      img.src = url;
      thumb.appendChild(img);
    }
    li._thumb = thumb;

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

    var txt = document.createElement('div');
    txt.className = 'ep-txt';

    var linha1 = document.createElement('div');
    linha1.className = 'ep-linha1';
    var tit = document.createElement('div');
    tit.className = 'ep-tit';
    tit.textContent = tituloEpisodio(ep, numero);
    linha1.appendChild(tit);
    if (linhaDur) {
      var dur = document.createElement('div');
      dur.className = 'ep-dur';
      dur.textContent = linhaDur;
      linha1.appendChild(dur);
    }
    txt.appendChild(linha1);

    var sin = document.createElement('div');
    sin.className = 'ep-sin';
    sin.textContent = String(inf.plot || inf.description || '');
    txt.appendChild(sin);

    li.appendChild(num);
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
    completarEpisodios(t);
  }

  // Coloca a imagem do TMDB no quadrado do episódio que não tem imagem (ou cuja imagem não carregou).
  function imagemEpisodio(li, url) {
    var thumb = li && li._thumb;
    if (!thumb || !url || thumb.querySelector('img')) { return; }
    var img = document.createElement('img');
    img.alt = '';
    img.onerror = function () { if (img.parentNode) { img.parentNode.removeChild(img); } };
    img.src = url;
    thumb.insertBefore(img, thumb.firstChild);
  }

  // TMDB: imagem de cada episódio que veio sem imagem do painel; sinopse quando o painel não mandou; em inglês
  // também o nome do episódio (e o nome que vai para o player). Em português só completa nomes genéricos ("Episódio 3").
  function completarEpisodios(t) {
    if (item.tipo !== 'series' || !VLTV.tmdb.ativo()) { return; }
    var ingles = VLTV.idioma.ehIngles();
    var lis = itensEps;
    VLTV.tmdb.temporada(item.id, item.nome, t.numero).then(function (mapa) {
      if (!mapa || temporadas[tempIdx] !== t || lis !== itensEps) { return; }
      var baseNome = nomeDoPlayer();
      t.episodios.forEach(function (ep, i) {
        var numero = ep.episode_num || (i + 1);
        var m = mapa[numero];
        var li = lis[i];
        if (!m || !li) { return; }
        if (m.imagem) { li._tmdbImg = m.imagem; imagemEpisodio(li, m.imagem); }
        var elSin = li.querySelector('.ep-sin');
        if (m.sinopse && elSin && !elSin.textContent) { elSin.textContent = m.sinopse; }
        if (!m.titulo) { return; }
        var generico = tituloEpisodio(ep, numero) === 'Episódio ' + numero;
        if (!ingles && !generico) { return; }
        var el = li.querySelector('.ep-tit');
        if (el) { el.textContent = m.titulo; }
        var pl = plano[t.inicio + i];
        if (pl) { pl.titulo = baseNome + ' - T' + t.numero + ' E' + numero + ' - ' + m.titulo; }
      });
    });
  }

  // Troca de temporada (a coluna da esquerda acompanha). posicao: número do episódio na lista, ou 'ultimo'.
  function mudarTemporada(i, posicao) {
    tempIdx = i;
    marcarTemporadaAtual();
    renderEpisodios();
    epIdx = posicao === 'ultimo' ? Math.max(0, itensEps.length - 1) : (posicao || 0);
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
      if (VLTV.idioma.ehIngles() && VLTV.tmdb.ativo()) {
        VLTV.tmdb.textos(item.tipo, idDe(raw), raw.name).then(function (r) {
          var el = r && r.titulo ? li.querySelector('.celula-nome') : null;
          if (el) { el.textContent = r.titulo; }
        });
      }
    });
  }

  // ── Foco e rolagem ────────────────────────────────────────────────
  function mostrarModo() {
    mostrar(elPrincipal, modo === 'principal');
    mostrar(elEpsTela, modo === 'eps');
    mostrar(elSugTela, modo === 'sug');
    elGradRolado.className = 'det-grad-rolado' + (modo !== 'principal' ? ' ativo' : '');
  }

  function elementoFoco() {
    if (modo === 'principal') { return itensMenu()[menuIdx] || null; }
    if (modo === 'eps') { return zonaEps === 'eps' ? itensEps[epIdx] : itensTemps[tempIdx]; }
    return itensSug[sugIdx] || null;
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

  function marcarFoco() {
    if (elFocoAtual) { elFocoAtual.classList.remove('foco'); }
    elFocoAtual = elementoFoco() || null;
    if (elFocoAtual) { elFocoAtual.classList.add('foco'); }
    if (!elFocoAtual) { return; }
    if (modo === 'eps') {
      if (zonaEps === 'eps') { rolarLista(elEpsJanela, elEps, elFocoAtual); }
      else { rolarLista(elTempsJanela, elTemps, elFocoAtual); }
    } else if (modo === 'sug') {
      rolarLista(elSugJanela, elSug, elFocoAtual);
    }
  }

  function trocarModo(novo) {
    modo = novo;
    mostrarModo();
    marcarFoco();
  }

  function abrirEpisodios() {
    if (item.tipo !== 'series') { return; }
    zonaEps = (falha || temporadas.length === 0) ? 'temps' : 'eps';
    trocarModo('eps');
  }

  function abrirSugestoes() {
    sugIdx = 0;
    trocarModo('sug');
  }

  // ── Ações ─────────────────────────────────────────────────────────
  function itemFilme() {
    return {
      titulo: nomeDoPlayer(),
      tipo: 'movie',
      id: item.id,
      ext: item.ext || info.container_extension,
      url: item.url,
      chave: 'f' + item.id,
      // Para a tela de pausa do player: logo do título (mesma logo e mesmo cache desta tela de detalhes)
      logoTipo: item.tipo, logoId: item.id, logoNome: item.nome
    };
  }

  // Filme ou série adulto (ou com classificação 18+) pede a senha antes de assistir.
  function comSenha(depois) {
    VLTV.parental.checarReproducao({ raw: item.raw, info: info, tipo: item.tipo }, depois);
  }

  // Guarda o título na aba "Continuar assistindo" das telas de Filmes e Séries (só aparece se houver o que continuar).
  function marcarContinuar() {
    VLTV.dados.registrarContinuar({
      tipo: item.tipo, id: item.id, nome: item.nome, capa: item.capa, raw: item.raw,
      chaves: item.tipo === 'series' ? plano.map(function (e) { return e.chave; }) : null
    });
  }

  function tocarPrincipal(doInicio) {
    if (item.tipo === 'series') {
      if (!alvo) { return; }
      comSenha(function () {
        marcarContinuar();
        acoes.reproduzir(plano, alvo.indice, (!doInicio && alvo.continuar) ? alvo.pos : 0);
      });
    } else {
      comSenha(function () {
        marcarContinuar();
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
    comSenha(function () { marcarContinuar(); acoes.reproduzir(plano, i, inicio); });
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
  function ativarMenu() {
    var el = itensMenu()[menuIdx];
    if (el === elPlay) { tocarPrincipal(false); }
    else if (el === elReiniciar) { tocarPrincipal(true); }
    else if (el === elBtnEps) { abrirEpisodios(); }
    else if (el === elBtnSug) { abrirSugestoes(); }
    else if (el === elFav) { alternarFav(); }
  }

  function teclaPrincipal(k) {
    var n = itensMenu().length;
    if (k === TECLA.CIMA) { if (menuIdx > 0) { menuIdx--; } }
    else if (k === TECLA.BAIXO) { if (menuIdx < n - 1) { menuIdx++; } }
    else if (k === TECLA.ENTER) { ativarMenu(); }
  }

  function teclaTemporadas(k) {
    if (k === TECLA.CIMA || k === TECLA.BAIXO) {
      var novo = tempIdx + (k === TECLA.CIMA ? -1 : 1);
      if (novo >= 0 && novo < temporadas.length) { mudarTemporada(novo, 0); }
    }
    else if (k === TECLA.DIR || k === TECLA.ENTER) {
      if (falha) { carregarInfo(); }
      else if (itensEps.length > 0) { zonaEps = 'eps'; }
    }
  }

  function teclaEpisodios(k) {
    var n = itensEps.length;
    if (k === TECLA.CIMA) {
      if (epIdx > 0) { epIdx--; }
      else if (tempIdx > 0) { mudarTemporada(tempIdx - 1, 'ultimo'); }
    }
    else if (k === TECLA.BAIXO) {
      // Último episódio da temporada: cai no primeiro da próxima, e a temporada da esquerda desce junto.
      if (epIdx < n - 1) { epIdx++; }
      else if (tempIdx < temporadas.length - 1) { mudarTemporada(tempIdx + 1, 0); }
    }
    else if (k === TECLA.ESQ) { if (itensTemps.length > 0) { zonaEps = 'temps'; } }
    else if (k === TECLA.CH_MAIS || k === TECLA.PG_BAIXO) { epIdx = Math.min(n - 1, epIdx + PASSO_PAGINA_EPS); }
    else if (k === TECLA.CH_MENOS || k === TECLA.PG_CIMA) { epIdx = Math.max(0, epIdx - PASSO_PAGINA_EPS); }
    else if (k === TECLA.ENTER) { tocarEpisodio(); }
  }

  function teclaSugestoes(k) {
    var n = itensSug.length;
    if (k === TECLA.ESQ) { if (sugIdx % COL_SUG > 0) { sugIdx--; } }
    else if (k === TECLA.DIR) { if (sugIdx < n - 1 && sugIdx % COL_SUG < COL_SUG - 1) { sugIdx++; } }
    else if (k === TECLA.CIMA) { if (sugIdx >= COL_SUG) { sugIdx -= COL_SUG; } }
    else if (k === TECLA.BAIXO) {
      if (sugIdx + COL_SUG < n) { sugIdx += COL_SUG; }
      else if (Math.floor(sugIdx / COL_SUG) < Math.floor((n - 1) / COL_SUG)) { sugIdx = n - 1; }
    }
    else if (k === TECLA.CH_MAIS || k === TECLA.PG_BAIXO) { sugIdx = Math.min(n - 1, sugIdx + COL_SUG * 2); }
    else if (k === TECLA.CH_MENOS || k === TECLA.PG_CIMA) { sugIdx = Math.max(0, sugIdx - COL_SUG * 2); }
    else if (k === TECLA.ENTER) { if (itensSug[sugIdx]) { abrirSugestao(itensSug[sugIdx]._raw); } }
  }

  function voltar() {
    // Em Episódios ou Títulos semelhantes: volta ao menu, no botão que abriu a lista.
    if (modo !== 'principal') {
      var botao = modo === 'eps' ? elBtnEps : elBtnSug;
      menuIdx = Math.max(0, itensMenu().indexOf(botao));
      trocarModo('principal');
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
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { voltar(); return true; }
    var seta = k === TECLA.CIMA || k === TECLA.BAIXO || k === TECLA.ESQ || k === TECLA.DIR || k === TECLA.ENTER;
    var pagina = k === TECLA.PG_CIMA || k === TECLA.PG_BAIXO || k === TECLA.CH_MAIS || k === TECLA.CH_MENOS;
    if (!seta && !(pagina && modo !== 'principal')) { return false; }

    if (modo === 'principal') { teclaPrincipal(k); }
    else if (modo === 'eps') { if (zonaEps === 'temps') { teclaTemporadas(k); } else { teclaEpisodios(k); } }
    else { teclaSugestoes(k); }

    marcarFoco();
    return true;
  }

  // ── Carregamento ──────────────────────────────────────────────────
  function montarSerie(dados) {
    info = dados.info || {};
    temporadas = dados.temporadas || [];
    plano = [];
    var nomeLimpo = nomeDoPlayer();
    basePlano = nomeLimpo;

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
          en: numero,
          // Para a tela de pausa do player: nome da série, nome do episódio e logo (id da SÉRIE no painel, não do episódio)
          nomeSerie: nomeLimpo,
          epTitulo: tit.indexOf('Episódio ') === 0 ? '' : tit,
          logoTipo: item.tipo, logoId: item.id, logoNome: item.nome
        });
      });
    });
    // Chave da série nos créditos aprendidos: id do 1º episódio da série inteira (igual ao Android).
    plano.forEach(function (p) { p.serie = plano[0].id; });

    renderTopo();
    atualizarProgresso();

    if (temporadas.length === 0) {
      itensTemps = [];
      itensEps = [];
      mensagem(elTemps, 'Nenhum episódio disponível.');
      esvaziar(elEps);
      return;
    }

    // Abre já na temporada do episódio que o botão principal toca.
    tempIdx = alvo ? plano[alvo.indice].temp : 0;
    renderTemporadas();
    renderEpisodios();
    epIdx = alvo ? plano[alvo.indice].pos : 0;
    if (modo === 'eps') { zonaEps = 'eps'; }
    marcarFoco();
  }

  function montarFilme(dados) {
    info = dados || {};
    renderTopo();
    atualizarProgresso();
  }

  function carregarInfo() {
    var meu = ++idCarga;
    falha = false;

    if (item.tipo === 'series') {
      itensTemps = [];
      itensEps = [];
      mensagem(elTemps, 'Carregando...');
      esvaziar(elEps);
      VLTV.api.infoSerie(item.id)
        .then(function (d) {
          if (meu !== idCarga) { return; }
          montarSerie(d);
        })
        .catch(function () {
          if (meu !== idCarga) { return; }
          falha = true;
          mensagem(elTemps, 'Não foi possível carregar os episódios. Aperte OK para tentar de novo.');
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
    tituloEn = '';
    basePlano = '';
    info = {};
    temporadas = [];
    plano = [];
    alvo = null;
    falha = false;
    tempIdx = 0;
    epIdx = 0;
    sugIdx = 0;
    menuIdx = 0;
    zonaEps = 'eps';
    modo = 'principal';
    usandoCapa = !item.fundo;
    itensTemps = [];
    itensEps = [];
    esvaziar(elTemps);
    esvaziar(elEps);
    elEpsNome.textContent = limparTitulo(item.nome);

    pararTroca();
    escolherFundo();
    renderTopo();
    carregarLogo();
    renderSugestoes();
    mostrarModo();
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
      // Volta para a lista de episódios, no que estava tocando.
      var it = plano[ultimoIndice];
      tempIdx = it.temp;
      marcarTemporadaAtual();
      renderEpisodios();
      epIdx = it.pos;
      zonaEps = 'eps';
      trocarModo('eps');
    } else {
      menuIdx = 0;
      trocarModo('principal');
    }
  }

  // ── Cursor e roda do controle (Magic Remote) ─────────────────────
  // Passar o cursor destaca (acende) o item, igual às setas; o clique faz o mesmo que o OK
  // (numa temporada, o clique troca a lista de episódios); a roda sobe/desce como as setas.
  function contem(el, alvoEl) { return !!el && !!alvoEl && (el === alvoEl || el.contains(alvoEl)); }

  // O que está sob o cursor: { menuIdx } | { temp } | { epIdx } | { sugIdx } ou null.
  function alvoDoCursor(t) {
    var i;
    if (modo === 'principal') {
      var m = itensMenu();
      for (i = 0; i < m.length; i++) { if (contem(m[i], t)) { return { menuIdx: i }; } }
    } else if (modo === 'eps') {
      for (i = 0; i < itensTemps.length; i++) { if (contem(itensTemps[i], t)) { return { temp: i }; } }
      for (i = 0; i < itensEps.length; i++) { if (contem(itensEps[i], t)) { return { epIdx: i }; } }
    } else {
      for (i = 0; i < itensSug.length; i++) { if (contem(itensSug[i], t)) { return { sugIdx: i }; } }
    }
    return null;
  }

  function mesmoAlvo(a) {
    if (a.menuIdx !== undefined) { return menuIdx === a.menuIdx; }
    if (a.temp !== undefined) { return true; }       // só passar o cursor na temporada não muda nada
    if (a.epIdx !== undefined) { return zonaEps === 'eps' && epIdx === a.epIdx; }
    if (a.sugIdx !== undefined) { return sugIdx === a.sugIdx; }
    return true;
  }

  function aplicarAlvo(a) {
    if (a.menuIdx !== undefined) { menuIdx = a.menuIdx; }
    if (a.epIdx !== undefined) { epIdx = a.epIdx; zonaEps = 'eps'; }
    if (a.sugIdx !== undefined) { sugIdx = a.sugIdx; }
    marcarFoco();
  }

  elTela.addEventListener('mousemove', function (e) {
    if (!item || !VLTV.cursor.andou(e)) { return; }
    var a = alvoDoCursor(e.target);
    if (!a || mesmoAlvo(a)) { return; }
    aplicarAlvo(a);
  });

  elTela.addEventListener('click', function (e) {
    if (!item) { return; }
    var a = alvoDoCursor(e.target);
    if (!a) { return; }
    if (a.temp !== undefined) {
      if (a.temp !== tempIdx) { mudarTemporada(a.temp, 0); }
      zonaEps = itensEps.length > 0 ? 'eps' : 'temps';
      marcarFoco();
      return;
    }
    if (!mesmoAlvo(a)) { aplicarAlvo(a); }
    tecla(TECLA.ENTER);                                   // o resto: igual ao OK
  });

  // Roda: sobe/desce como as setas (no máximo uma vez a cada 110 ms, para não correr demais).
  var ultimaRoda = 0;
  VLTV.aoRodar(elTela, function (sentido) {
    var agora = new Date().getTime();
    if (agora - ultimaRoda < 110) { return; }
    ultimaRoda = agora;
    tecla(sentido > 0 ? TECLA.BAIXO : TECLA.CIMA);
  });

  VLTV.detalhes = { abrir: abrir, tecla: tecla, voltou: voltou };
})();
