// VLTV Play - webOS | Detalhes de filmes e séries (estilo Netflix).
// Tela principal: fundo que troca devagar (imagens do TMDB), título/logo, nota, ano, gêneros, sinopse, elenco e
// um menu vertical (Assistir/Continuar, Assistir desde o início, Episódios e mais, Títulos semelhantes, Minha lista).
// "Episódios e mais" (só séries): temporadas fixas na coluna da esquerda e episódios em lista na direita;
// ao passar do último episódio da temporada, cai no primeiro da próxima e a temporada da esquerda acompanha.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40, PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428 };

  var PASSO_PAGINA_EPS = 5;     // CH+/CH- pulam esta quantidade de episódios
  var MAX_SUG = 14;             // quantas sugestões mostrar
  var MAX_SUG_AMEI = 21;        // quantas mostrar quando o título aberto está com "Amei!"
  var PONTOS_MIN_PAINEL = 6;    // reforço pelo painel: pelo menos dois gêneros em comum (ou gênero + elenco/direção)
  var MIN_SUG_TMDB = 8;         // com menos que isto vindo do TMDB, o painel reforça a lista
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
  var elBtnCred = $('det-btn-cred');
  var elFav = $('det-fav');
  var elEpsTela = $('det-eps-tela');
  var elEpsNome = $('det-eps-nome');
  var elTempsJanela = $('det-temps-janela');
  var elTemps = $('det-temps');
  var elEpsJanela = $('det-eps-janela');
  var elEps = $('det-eps');
  var elAval = $('det-aval');
  var itensAval = Array.prototype.slice.call(elAval.querySelectorAll('.det-aval-btn'));
  var elAvalTopo = $('det-aval-topo');
  var itensAvalTopo = Array.prototype.slice.call(elAvalTopo.querySelectorAll('.det-aval-ic'));
  var avalTopoIdx = 1;
  var elSugTela = $('det-sug-tela');
  var elSugJanela = $('det-sug-janela');
  var elSugLogo = $('det-sug-logo');
  var elSugNome = $('det-sug-nome');
  var elSugMeta = $('det-sug-meta');
  var elSugQtd = $('det-sug-qtd');
  var elCredTela = $('det-cred-tela');
  var elCredLogo = $('det-cred-logo');
  var elCredNome = $('det-cred-nome');
  var elCredMeta = $('det-cred-meta');
  var elCredMenu = $('det-cred-menu');
  var elCredConteudo = $('det-cred-conteudo');
  var elSug = $('det-sug');
  var elIdade = $('det-idade');

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

  var modo = 'principal';   // 'principal' | 'eps' | 'sug' | 'cred'
  var menuIdx = 0;
  var zonaEps = 'eps';      // 'eps' (lista de episódios) | 'temps' (coluna das temporadas) | 'aval' (avaliação)
  var avalIdx = 1;
  var tempIdx = 0;
  var epIdx = 0;
  var sugIdx = 0;
  var credIdx = 0;           // opção marcada em Créditos e mais informações
  var itensCred = [];        // as opções (esquerda)
  var secoesCred = [];       // os blocos de dados (direita), na mesma ordem
  var idSug = 0;             // conta as montagens da lista de semelhantes (resposta antiga do TMDB é ignorada)
  var pediuIndice = false;   // já pediu o índice de títulos para as sugestões (uma vez por título aberto)
  var sugCarregando = false; // esperando o índice chegar para mostrar as sugestões
  var ficha = null;          // dados do TMDB do título aberto (criação, elenco, gêneros, idade, semelhantes) ou null
  var fichaPendente = true;  // ainda esperando o TMDB responder
  var idFicha = 0;           // conta os pedidos ao TMDB (resposta antiga é ignorada)
  var idPedidoPainel = '';   // ID do TMDB que o painel mandou e que já foi pedido
  var semelhantesTmdb = null; // semelhantes do TMDB já achados no catálogo da conta (null = ainda procurando)
  var idSem = 0;             // conta as buscas de semelhantes no catálogo
  var itensTemps = [];
  var itensEps = [];
  var itensSug = [];
  var tidDoTitulo = {};     // 'tipo_id' do painel -> ID do TMDB (para buscar a classificação etária de cada semelhante)
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

  // ── Dados do TMDB (ficha) misturados com o que o painel mandou ────
  // Para criação, elenco e gêneros vale o TMDB (completo, como na Netflix); o painel entra quando o TMDB não tem.
  function listaCriacao() {
    if (ficha) {
      var l = item.tipo === 'series' ? ficha.criadores : ficha.direcao;
      if (l && l.length > 0) { return l; }
    }
    return listaDeNomes(info.director || item.direcao);
  }

  function listaElenco() {
    if (ficha && ficha.elenco && ficha.elenco.length > 0) { return ficha.elenco; }
    return listaDeNomes(info.cast || info.actors || item.elenco);
  }

  function listaGeneros() {
    var l = [];
    if (ficha && ficha.generos && ficha.generos.length > 0) {
      l = ficha.generos.map(function (id) { return VLTV.tmdb.nomeGenero(id); }).filter(function (g) { return g !== ''; });
    }
    if (l.length > 0) { return l; }
    return String(info.genre || item.genero || '').split(/\s*[,\/;|]\s*/).filter(function (g) { return g !== ''; })
      .map(function (g) { return VLTV.idioma.categoria(g); });
  }

  // Idade que o painel mandou (ignora vazio, "0" e "n/a").
  function idadeDoPainel() {
    var raw = item && item.raw ? item.raw : {};
    var fontes = [info.age, info.mpaa_rating, info.age_rating, info.certification, raw.age, raw.mpaa_rating, raw.certification];
    for (var i = 0; i < fontes.length; i++) {
      var v = String(fontes[i] === undefined || fontes[i] === null ? '' : fontes[i]).replace(/^\s+|\s+$/g, '');
      if (v === '' || /^0+$/.test(v) || /^(n\/?a|null|none|undefined)$/i.test(v)) { continue; }
      var cod = VLTV.tmdb.idadeDeTexto(v);
      if (cod !== '') { return cod; }
    }
    return '';
  }

  // Classificação etária do título aberto: { rotulo, classe, texto } ou null.
  // A brasileira do TMDB vale primeiro; depois a do painel; por último a americana do TMDB (convertida).
  function idadeAtual() {
    var cod = '';
    if (ficha && ficha.idade && ficha.idadeBr) { cod = ficha.idade; }
    if (cod === '') { cod = idadeDoPainel(); }
    if (cod === '' && ficha && ficha.idade) { cod = ficha.idade; }
    return dadosIdade(cod);
  }

  function dadosIdade(cod) {
    if (!cod) { return null; }
    if (cod === 'L') { return { rotulo: 'L', classe: 'i-l', texto: 'Livre para todos os públicos' }; }
    return { rotulo: cod, classe: 'i-' + cod, texto: 'Não recomendado para menores de ' + parseInt(cod, 10) + ' anos' };
  }

  // Selo da classificação (quadradinho colorido, igual ao da Netflix). Sem classificação: fica escondido.
  function pintarSelo(el, idade, extra) {
    if (!idade) { el.className = 'idade-sel escondida'; el.textContent = ''; return; }
    el.className = 'idade-sel ' + (extra ? extra + ' ' : '') + idade.classe;
    el.textContent = idade.rotulo;
  }

  // ── Topo: título, nota, ano, gêneros, sinopse, elenco ─────────────
  function renderTopo() {
    var nome = limparTitulo(info.name || item.nome);
    elTitulo.textContent = nome;

    var sinopse = info.plot || info.description || item.sinopse || '';
    elSinopse.textContent = sinopse || 'Sem sinopse disponível.';
    textosEmIngles('topo', !sinopse, function (r) {
      if (r.titulo) { elTitulo.textContent = r.titulo; }
      if (r.sinopse) { elSinopse.textContent = r.sinopse; }
    });

    renderMeta();
  }

  // Linha de ano, gêneros, duração/temporadas, HD e classificação etária, mais criação e elenco.
  // É refeita quando o TMDB responde (não mexe no título nem na sinopse).
  function renderMeta() {
    var nota = parseFloat(String(info.rating || item.nota || '').replace(',', '.'));
    var temNota = !isNaN(nota) && nota > 0;
    elNota.textContent = temNota ? nota.toFixed(1) : '';
    mostrar(elNotaBloco, temNota);

    var dataTxt = info.releasedate || info.releaseDate || info.release_date || item.lancamento || '';
    var m = /(\d{4})/.exec(String(dataTxt));
    var ano = m ? m[1] : (anoDoNome(item.nome) || (ficha && ficha.ano) || '');
    elAno.textContent = ano;
    mostrar(elAno, !!ano);

    var textoDur = '';
    if (item.tipo === 'series') {
      var nTemps = temporadas.length > 0 ? temporadas.length : (ficha ? ficha.temps : 0);
      if (nTemps > 0) { textoDur = nTemps + (nTemps === 1 ? ' temporada' : ' temporadas'); }
    } else {
      textoDur = formatarDuracao(parseInt(info.duration_secs, 10) || segundosDe(info.duration) || ((ficha && ficha.duracao) ? ficha.duracao * 60 : 0));
    }
    elDuracao.textContent = textoDur;
    mostrar(elDuracao, !!textoDur);

    elQual.textContent = /\b(4k|uhd)\b/i.test(item.nome) ? '4K' : 'HD';
    pintarSelo(elIdade, idadeAtual());

    // No máximo 3 gêneros, para a linha não ficar comprida.
    var genero = listaGeneros().slice(0, 3).join('  •  ');
    elGenero.textContent = genero;
    mostrar(elGenero, !!genero);

    renderCreditos();
    atualizarCabecalhos();
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
    linhaCredito('Elenco', listaElenco().slice(0, 4).join(', '));
    linhaCredito(item.tipo === 'series' ? 'Criação' : 'Direção', listaCriacao().slice(0, 2).join(', '));
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
    return [elAvalTopo, elPlay, elReiniciar, elBtnEps, elBtnSug, elFav, elBtnCred].filter(function (el) {
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

  // ── Sugestões: lista vertical, como os episódios ──────────────────
  // ── Semelhantes: pontua cada título da categoria pelo que ele tem em comum com o título aberto ──
  function semAcento(t) {
    return String(t || '').toLowerCase().replace(/[\u0300-\u036f]/g, '');
  }

  function listaNorm(texto, separador) {
    var saida = [];
    String(texto || '').normalize('NFD').split(separador).forEach(function (p) {
      p = semAcento(p).replace(/\s+/g, ' ').trim();
      if (p !== '' && saida.indexOf(p) < 0) { saida.push(p); }
    });
    return saida;
  }

  function anoDoRaw(raw) {
    var m = /(19|20)\d{2}/.exec(String(raw.releaseDate || raw.release_date || raw.releasedate || raw.year || ''));
    return m ? parseInt(m[0], 10) : 0;
  }

  function primeiraPalavra(nome) {
    var ps = semAcento(String(VLTV.titulo.limpar(nome || '')).normalize('NFD')).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
    for (var i = 0; i < ps.length; i++) { if (ps[i].length >= 4) { return ps[i]; } }
    return '';
  }

  function comuns(a, b) {
    var n = 0;
    a.forEach(function (x) { if (b.indexOf(x) >= 0) { n++; } });
    return n;
  }

  function pontosSemelhanca(raw, ref) {
    var pts = 0;
    pts += comuns(listaNorm(raw.genre, /\s*[,\/;|]\s*/), ref.generos) * 3;
    pts += comuns(listaNorm(raw.cast, /\s*,\s*/), ref.elenco) * 2;
    pts += comuns(listaNorm(raw.director, /\s*,\s*/), ref.direcao) * 2;
    if (ref.palavra !== '' && primeiraPalavra(raw.name) === ref.palavra) { pts += 2.5; }
    var ano = anoDoRaw(raw);
    if (ref.ano && ano && Math.abs(ref.ano - ano) <= 2) { pts += 1; }
    var nota = parseFloat(raw.rating);
    if (nota >= 7) { pts += 0.5; }
    // O que o usuário já avaliou pesa: Amei e Gostei sobem na lista.
    var av = VLTV.dados.avaliacao(item.tipo, idDe(raw));
    if (av === 'a') { pts += 2; } else if (av === 'g') { pts += 1; }
    return pts;
  }

  // De onde saem os semelhantes. Se a tela foi aberta de uma categoria de verdade, usa ela. Se veio de
  // Continuar assistindo, Favoritos, Pesquisa, banner ou destaque, a lista é pequena (às vezes só o próprio
  // título): então usa o índice de todos os títulos do painel (da mesma categoria, quando se sabe qual é).
  function reservatorio() {
    if (base.length >= 12) { return base; }
    var todos = [];
    try { todos = VLTV.indice.titulos(item.tipo) || []; } catch (e) { todos = []; }
    if (todos.length === 0) {
      if (!pediuIndice) {
        pediuIndice = true;
        sugCarregando = true;
        var itemMeu = item;
        try {
          VLTV.indice.preparar(item.tipo, true).then(function () {
            if (itemMeu !== item) { return; }
            sugCarregando = false;
            atualizarSugestoes();
          }, function () {
            sugCarregando = false;
            atualizarSugestoes();
          });
        } catch (e2) { sugCarregando = false; }
      }
      return base;
    }
    var cat = item.raw ? item.raw.category_id : undefined;
    if (cat !== undefined && cat !== null && String(cat).indexOf('__') !== 0) {
      var daCategoria = todos.filter(function (r) { return String(r.category_id) === String(cat); });
      if (daCategoria.length >= 12) { return daCategoria; }
    }
    return todos;
  }

  // ── Semelhantes pelo TMDB ─────────────────────────────────────────
  // O TMDB diz quais títulos são parecidos (recomendados e semelhantes, na ordem de relevância). A TV procura
  // cada um deles no catálogo desta conta pelo nome (e ano) e só mostra os que existem aí.
  // Quem não é infantil nunca recebe desenho animado como sugestão.
  function normEsp(t) {
    var x = String(t || '').toLowerCase();
    try { x = x.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* TV sem normalize */ }
    return x.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  // Nome já limpo (sem ano, HD, dublado...) e sem espaços, para comparar títulos.
  function nomeColado(nome) {
    return normEsp(VLTV.titulo.limpar(nome)).replace(/ /g, '');
  }

  function temGeneroInfantil(ids) {
    return !!ids && (ids.indexOf(16) >= 0 || ids.indexOf(10762) >= 0);
  }

  function tmdbIdDoPainel() {
    var raw = item && item.raw ? item.raw : {};
    var fontes = [info.tmdb_id, info.tmdb, info.tmdbid, raw.tmdb_id, raw.tmdb];
    for (var i = 0; i < fontes.length; i++) {
      var n = String(fontes[i] === undefined || fontes[i] === null ? '' : fontes[i]).replace(/[^0-9]/g, '');
      if (n !== '' && n !== '0') { return n; }
    }
    return '';
  }

  // Pede ao TMDB a ficha do título aberto. idPainel: ID do TMDB que o painel mandou ('' = procura pelo nome).
  function pedirFicha(idPainel) {
    var meu = ++idFicha;
    var itemMeu = item;
    fichaPendente = true;
    if (!VLTV.tmdb.ativo()) {
      ficha = null;
      fichaPendente = false;
      ++idSem;
      semelhantesTmdb = [];      // sem TMDB: os semelhantes saem só dos dados do painel
      return;
    }
    VLTV.tmdb.ficha(item.tipo, item.id, item.nome, idPainel).then(function (f) {
      if (meu !== idFicha || itemMeu !== item) { return; }
      ficha = f;
      fichaPendente = false;
      renderMeta();
      if (modo === 'cred') { atualizarCreditosTela(); }
      calcularSemelhantes();
    });
  }

  // O painel mandou o ID do TMDB depois do primeiro pedido (que foi pelo nome): confere se é o mesmo título.
  function conferirIdPainel() {
    var pid = tmdbIdDoPainel();
    if (pid === '' || pid === idPedidoPainel) { return; }
    if (ficha && String(ficha.tid) === pid) { idPedidoPainel = pid; return; }
    idPedidoPainel = pid;
    pedirFicha(pid);
  }

  function calcularSemelhantes() {
    var meu = ++idSem;
    var itemMeu = item;
    function fim(lista) {
      if (meu !== idSem || itemMeu !== item) { return; }
      semelhantesTmdb = lista || [];
      sugCarregando = false;
      atualizarSugestoes();
    }
    if (!ficha || !ficha.recs || ficha.recs.length === 0) { fim([]); return; }
    semelhantesTmdb = null;
    sugCarregando = true;
    var seguir = function () { casarComCatalogo(meu).then(fim, function () { fim([]); }); };
    try { VLTV.indice.preparar(item.tipo, true).then(seguir, seguir); } catch (e) { seguir(); }
  }

  // Procura no catálogo da conta cada título que o TMDB indicou. Poucos por vez, para a TV não travar.
  function casarComCatalogo(meu) {
    return new Promise(function (resolve) {
      var tipo = item.tipo;
      var todos = [];
      var nomes = [];
      try { todos = VLTV.indice.titulos(tipo) || []; nomes = VLTV.indice.nomes(tipo) || []; } catch (e) { todos = []; }
      var total = Math.min(todos.length, nomes.length);
      var refInfantil = temGeneroInfantil(ficha.generos);
      var recs = ficha.recs.filter(function (r) { return refInfantil || !temGeneroInfantil(r[4]); });
      if (total === 0 || recs.length === 0) { resolve([]); return; }

      var meta = MAX_SUG_AMEI + 4;
      var proprio = nomeColado(item.nome);
      var achados = [];
      var ids = {};
      var i = 0;

      function procurar(r) {
        var chaves = [];
        [r[1], r[2]].forEach(function (t) {
          var k = normEsp(t);
          if (k.length >= 2 && chaves.indexOf(k) < 0) { chaves.push(k); }
        });
        for (var c = 0; c < chaves.length; c++) {
          var k = chaves[c];
          var cola = k.replace(/ /g, '');
          var fimK = ' ' + k;
          for (var x = 0; x < total; x++) {
            var n = nomes[x];
            if (!n || n.length < k.length) { continue; }
            if (n !== k && n.indexOf(k + ' ') !== 0 && n.indexOf(fimK + ' ') < 0 && n.slice(-fimK.length) !== fimK) { continue; }
            var cand = todos[x];
            var idc = idDe(cand);
            if (String(idc) === String(item.id) || ids[idc]) { continue; }
            if (VLTV.dados.avaliacao(tipo, idc) === 'n') { continue; }
            var b = VLTV.titulo.paraBusca(cand.name);
            if (normEsp(b.query).replace(/ /g, '') !== cola) { continue; }
            if (cola === proprio) { continue; }                          // outra versão do próprio título
            var ac = parseInt(b.ano, 10) || anoDoRaw(cand);
            if (r[3] && ac && Math.abs(ac - r[3]) > 1) { continue; }    // mesmo nome, outro filme (refilmagem)
            ids[idc] = true;
            tidDoTitulo[tipo + '_' + idc] = r[0];
            return cand;
          }
        }
        return null;
      }

      function passo() {
        if (meu !== idSem) { resolve(null); return; }
        var ate = Math.min(recs.length, i + 3);
        while (i < ate && achados.length < meta) {
          var raw = procurar(recs[i++]);
          if (raw) { achados.push(raw); }
        }
        if (i >= recs.length || achados.length >= meta) { resolve(achados); } else { setTimeout(passo, 0); }
      }
      passo();
    });
  }

  // Reforço quando o TMDB achou poucos no catálogo: títulos do painel que dividem gênero, elenco ou direção.
  // Exige semelhança de verdade (nada de completar a lista com o que vier) e não mistura desenho com série adulta.
  var REGEX_INFANTIL = /anima|anime|infantil|kids|desenho|cartoon|crianc/;

  function semelhantesDoPainel(usados, quantos) {
    var pool = reservatorio();
    var generosRef = listaNorm(info.genre || item.genero, /\s*[,\/;|]\s*/);
    if (ficha && ficha.generos) {
      ficha.generos.forEach(function (id) {
        var g = semAcento(VLTV.tmdb.nomeGenero(id, true)).replace(/\s+/g, ' ').trim();
        if (g !== '' && generosRef.indexOf(g) < 0) { generosRef.push(g); }
      });
    }
    var ref = {
      generos: generosRef,
      elenco: listaNorm(info.cast || info.actors || item.elenco, /\s*,\s*/),
      direcao: listaNorm(info.director || item.direcao, /\s*,\s*/),
      ano: anoDoRaw(info) || anoDoRaw(item.raw || {}),
      palavra: primeiraPalavra(item.nome)
    };
    var refInfantil = (ficha && temGeneroInfantil(ficha.generos)) || REGEX_INFANTIL.test(generosRef.join(' '));
    var proprio = nomeColado(item.nome);
    var candidatos = [];
    for (var k = 0; k < pool.length; k++) {
      var raw = pool[k];
      var idr = String(idDe(raw));
      if (idr === String(item.id) || usados[idr]) { continue; }
      if (VLTV.dados.avaliacao(item.tipo, idDe(raw)) === 'n') { continue; }
      if (!refInfantil && REGEX_INFANTIL.test(semAcento(raw.genre))) { continue; }
      var pts = pontosSemelhanca(raw, ref);
      if (pts < PONTOS_MIN_PAINEL) { continue; }
      if (nomeColado(raw.name) === proprio) { continue; }                // outra versão do próprio título
      candidatos.push({ raw: raw, ordem: k, pts: pts });
    }
    candidatos.sort(function (a, b) { return (b.pts - a.pts) || (a.ordem - b.ordem); });
    return candidatos.slice(0, quantos).map(function (c) { return c.raw; });
  }

  // Títulos semelhantes: primeiro os do TMDB que existem no catálogo da conta, na ordem do TMDB; se forem
  // poucos, reforço pelo painel. Quem marcou "Não é para mim" sai da lista. Amei mostra mais um bloco de capas.
  function escolherSemelhantes() {
    if (semelhantesTmdb === null) { return []; }     // ainda procurando no catálogo
    var minha = VLTV.dados.avaliacao(item.tipo, item.id);
    var limite = minha === 'a' ? MAX_SUG_AMEI : MAX_SUG;
    var lista = [];
    var usados = {};
    semelhantesTmdb.forEach(function (raw) {
      var idr = String(idDe(raw));
      if (usados[idr] || VLTV.dados.avaliacao(item.tipo, idDe(raw)) === 'n') { return; }
      usados[idr] = true;
      lista.push(raw);
    });
    lista = lista.slice(0, limite);
    if (lista.length < MIN_SUG_TMDB) {
      lista = lista.concat(semelhantesDoPainel(usados, limite - lista.length));
    }
    return lista;
  }

  // Refaz a lista sem atrapalhar quem já está navegando nela.
  function atualizarSugestoes() {
    if (modo !== 'sug' || itensSug.length === 0) { renderSugestoes(); }
  }

  // Linha de baixo do título de cada semelhante: nota, ano, classificação etária e gêneros.
  // Devolve o selo da classificação (escondido até a idade ser conhecida).
  function montarMetaSug(meta, raw) {
    function parte(texto) {
      var sp = document.createElement('span');
      sp.className = 'sug-parte';
      sp.textContent = texto;
      meta.appendChild(sp);
    }
    var nota = parseFloat(String(raw.rating || '').replace(',', '.'));
    if (!isNaN(nota) && nota > 0) { parte('\u2605 ' + nota.toFixed(1)); }
    var ano = anoDoRaw(raw);
    if (ano) { parte(String(ano)); }
    var selo = document.createElement('span');
    selo.className = 'idade-sel escondida';
    meta.appendChild(selo);
    var gen = String(raw.genre || '').split(/\s*[,\/;|]\s*/).filter(function (g) { return g !== ''; }).slice(0, 2).join(', ');
    if (gen) { parte(VLTV.idioma.categoria(gen)); }
    return selo;
  }

  function criarLinhaSug(raw) {
    var ehSerie = item.tipo === 'series';
    var nomeItem = raw.name || '';
    var fundo = primeiro(raw.backdrop_path);
    var url = fundo || (ehSerie ? raw.cover : raw.stream_icon) || '';

    var li = document.createElement('li');
    li.className = 'sug-lin';

    var thumb = document.createElement('div');
    thumb.className = 'sug-thumb' + (fundo ? '' : ' poster');
    li._thumb = thumb;
    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      img.onerror = function () {
        if (img.parentNode) { img.parentNode.removeChild(img); }
        thumb.textContent = nomeItem.charAt(0).toUpperCase();
      };
      img.src = url;
      thumb.appendChild(img);
    } else {
      thumb.textContent = nomeItem.charAt(0).toUpperCase();
    }

    var txt = document.createElement('div');
    txt.className = 'sug-txt';
    var tit = document.createElement('div');
    tit.className = 'sug-tit';
    tit.textContent = limparTitulo(nomeItem);
    var meta = document.createElement('div');
    meta.className = 'sug-meta';
    var selo = montarMetaSug(meta, raw);
    var idadePainel = VLTV.tmdb.idadeDeTexto(raw.age || raw.mpaa_rating || raw.certification);
    if (idadePainel !== '' && !/^0+$/.test(String(raw.age || raw.mpaa_rating || raw.certification || '').replace(/\s/g, ''))) { pintarSelo(selo, dadosIdade(idadePainel)); }
    var sin = document.createElement('div');
    sin.className = 'sug-sin';
    sin.textContent = String(raw.plot || raw.description || '');
    txt.appendChild(tit);
    txt.appendChild(meta);
    txt.appendChild(sin);

    li.appendChild(thumb);
    li.appendChild(txt);
    li._tit = tit;
    li._sin = sin;
    li._selo = selo;
    li._semFundo = !fundo;
    return li;
  }

  // TMDB, uma linha por vez: imagem larga para quem veio só com capa, sinopse para quem veio sem, e em inglês
  // o título. Se a lista foi refeita no meio do caminho, para.
  function completarSugestoes(lis, meuId) {
    if (!VLTV.tmdb.ativo()) { return; }
    var ingles = VLTV.idioma.ehIngles();
    var tipo = item.tipo;
    var i = 0;
    function proxima() {
      if (meuId !== idSug || i >= lis.length) { return; }
      var li = lis[i++];
      var raw = li._raw;
      var id = idDe(raw);
      var passoFundo = li._semFundo
        ? VLTV.tmdb.fundo(tipo, id, raw.name).then(function (u) {
            if (meuId !== idSug || !u) { return; }
            var img = document.createElement('img');
            img.alt = '';
            img.onload = function () {
              if (meuId !== idSug) { return; }
              esvaziar(li._thumb);
              li._thumb.classList.remove('poster');
              li._thumb.appendChild(img);
            };
            img.src = u;
          })
        : Promise.resolve();
      var precisaTexto = ingles || !li._sin.textContent;
      passoFundo.then(function () {
        if (!precisaTexto) { return; }
        return VLTV.tmdb.textos(tipo, id, raw.name).then(function (r) {
          if (meuId !== idSug || !r) { return; }
          if (ingles && r.titulo) { li._tit.textContent = r.titulo; }
          if (r.sinopse && (ingles || !li._sin.textContent)) { li._sin.textContent = r.sinopse; }
        });
      }).then(proxima, proxima);
    }
    proxima();
  }

  // Selo de idade de cada linha: usa o ID do TMDB que já se sabe (ou o guardado) e consulta só a classificação.
  function completarIdades(lis, meuId) {
    if (!VLTV.tmdb.ativo()) { return; }
    var tipo = item.tipo;
    var i = 0;
    function proxima() {
      if (meuId !== idSug || i >= lis.length) { return; }
      var li = lis[i++];
      if (li._selo.className.indexOf('escondida') < 0) { proxima(); return; }    // o painel já mandou a idade
      var id = idDe(li._raw);
      var tid = tidDoTitulo[tipo + '_' + id];
      if (!tid) {
        var g = VLTV.tmdb.textosGuardados(tipo, id);
        tid = g && g.tid ? g.tid : 0;
      }
      var passo = tid ? Promise.resolve(tid) : VLTV.tmdb.textos(tipo, id, li._raw.name).then(function (r) { return r && r.tid ? r.tid : 0; });
      passo.then(function (t) {
        if (!t || meuId !== idSug) { return null; }
        return VLTV.tmdb.idadePorTid(tipo, t);
      }).then(function (cod) {
        if (cod && meuId === idSug) { pintarSelo(li._selo, dadosIdade(cod)); }
      }).then(proxima, proxima);
    }
    proxima();
  }

  function renderSugestoes() {
    esvaziar(elSug);
    elSug._y = 0;
    elSug.style.transform = '';
    itensSug = [];
    sugIdx = 0;
    var meuId = ++idSug;

    var lista = escolherSemelhantes();
    elSugQtd.textContent = lista.length > 0 ? lista.length + (lista.length === 1 ? ' título' : ' títulos') : '';

    if (lista.length === 0) {
      mensagem(elSug, (sugCarregando || semelhantesTmdb === null) ? 'Carregando...' : 'Sem sugestões por enquanto.');
      return;
    }
    lista.forEach(function (raw) {
      var li = criarLinhaSug(raw);
      li._raw = raw;
      elSug.appendChild(li);
      itensSug.push(li);
    });
    completarSugestoes(itensSug.slice(), meuId);
    completarIdades(itensSug.slice(), meuId);
  }

  // Lado esquerdo da tela: a logo (ou o nome) do título aberto e a linha de ano, duração/temporadas e classificação.
  function montarCabecalho(lg, nm, mt) {
    var temLogo = !elLogo.classList.contains('escondida') && !!elLogo.getAttribute('src');
    if (temLogo) { lg.src = elLogo.getAttribute('src'); } else { lg.removeAttribute('src'); }
    mostrar(lg, temLogo);
    nm.textContent = elTitulo.textContent || limparTitulo(item.nome);
    mostrar(nm, !temLogo);

    esvaziar(mt);
    var partes = [];
    if (elAno.textContent) { partes.push(elAno.textContent); }
    if (elDuracao.textContent) { partes.push(elDuracao.textContent); }
    partes.forEach(function (texto, i) {
      if (i > 0) {
        var sep = document.createElement('span');
        sep.className = 'sug-sep';
        sep.textContent = '\u00b7';
        mt.appendChild(sep);
      }
      var sp = document.createElement('span');
      sp.textContent = texto;
      mt.appendChild(sp);
    });
    var idade = idadeAtual();
    if (idade) {
      var selo = document.createElement('span');
      pintarSelo(selo, idade, 'idade-cab');
      mt.appendChild(selo);
    }
  }

  // Os dados do TMDB (ou do painel) chegaram com Títulos semelhantes ou Créditos já abertos: refaz o cabeçalho.
  function atualizarCabecalhos() {
    if (!item) { return; }
    if (modo === 'sug') { montarCabecalho(elSugLogo, elSugNome, elSugMeta); }
    else if (modo === 'cred') { montarCabecalho(elCredLogo, elCredNome, elCredMeta); }
  }

  // ── Créditos e mais informações ───────────────────────────────────
  function listaDeNomes(texto) {
    return String(texto || '').split(/\s*,\s*/).filter(function (n) { return n !== ''; });
  }

  // Os quatro blocos de sempre (igual à Netflix): criação (séries) ou direção (filmes), elenco, gêneros e
  // classificação etária. Cada bloco: { rotulo, linhas } ou { rotulo, idade, classe, texto }.
  // Dado que nem o TMDB nem o painel têm aparece como "Não informado" (e "Carregando..." enquanto o TMDB responde).
  function dadosCreditos() {
    var vazio = [fichaPendente ? 'Carregando...' : 'Não informado'];
    var cri = listaCriacao();
    var elenco = listaElenco();
    var generos = listaGeneros();
    var blocos = [
      { rotulo: item.tipo === 'series' ? 'Criação' : 'Direção', linhas: cri.length > 0 ? cri : vazio },
      { rotulo: 'Elenco', linhas: elenco.length > 0 ? elenco : vazio },
      { rotulo: 'Gêneros', linhas: generos.length > 0 ? generos : vazio }
    ];
    var idade = idadeAtual();
    if (idade) {
      blocos.push({ rotulo: 'Classificação etária', idade: idade.rotulo, classe: idade.classe, texto: idade.texto });
    } else {
      blocos.push({ rotulo: 'Classificação etária', linhas: [fichaPendente ? 'Carregando...' : 'Sem classificação'] });
    }
    return blocos;
  }

  function renderCreditosTela() {
    esvaziar(elCredMenu);
    esvaziar(elCredConteudo);
    itensCred = [];
    secoesCred = [];
    var blocos = dadosCreditos();
    if (blocos.length === 0) {
      var vazio = document.createElement('div');
      vazio.className = 'cred-lin';
      vazio.textContent = 'Sem informações disponíveis.';
      elCredConteudo.appendChild(vazio);
      return;
    }
    blocos.forEach(function (b) {
      var li = document.createElement('li');
      li.textContent = b.rotulo;
      elCredMenu.appendChild(li);
      itensCred.push(li);

      var sec = document.createElement('div');
      sec.className = 'cred-sec';
      var tit = document.createElement('div');
      tit.className = 'cred-tit';
      tit.textContent = b.rotulo;
      sec.appendChild(tit);
      if (b.idade) {
        var selo = document.createElement('div');
        selo.className = 'cred-idade ' + b.classe;
        selo.textContent = b.idade;
        sec.appendChild(selo);
        if (b.texto) {
          var tx = document.createElement('div');
          tx.className = 'cred-idade-txt';
          tx.textContent = b.texto;
          sec.appendChild(tx);
        }
      } else {
        b.linhas.forEach(function (l) {
          var d = document.createElement('div');
          d.className = 'cred-lin';
          d.textContent = l;
          sec.appendChild(d);
        });
      }
      elCredConteudo.appendChild(sec);
      secoesCred.push(sec);
    });
    if (credIdx > itensCred.length - 1) { credIdx = Math.max(0, itensCred.length - 1); }
  }

  // Os dados chegaram com a tela já aberta: refaz sem tirar o usuário do lugar.
  function atualizarCreditosTela() {
    if (modo !== 'cred') { return; }
    renderCreditosTela();
    marcarFoco();
  }

  // A coluna da direita anda até o começo do bloco da opção marcada.
  function rolarCreditos() {
    var sec = secoesCred[credIdx];
    var y = sec ? sec.offsetTop : 0;
    elCredConteudo.style.transform = 'translateY(' + (-y) + 'px)';
  }

  function abrirCreditos() {
    credIdx = 0;
    renderCreditosTela();
    montarCabecalho(elCredLogo, elCredNome, elCredMeta);
    trocarModo('cred');
  }

  // ── Foco e rolagem ────────────────────────────────────────────────
  function mostrarModo() {
    mostrar(elPrincipal, modo === 'principal');
    mostrar(elEpsTela, modo === 'eps');
    mostrar(elSugTela, modo === 'sug');
    mostrar(elCredTela, modo === 'cred');
    elGradRolado.className = 'det-grad-rolado' + (modo !== 'principal' ? ' ativo' : '');
  }

  function elementoFoco() {
    if (modo === 'principal') {
      var m = itensMenu()[menuIdx] || null;
      return m === elAvalTopo ? itensAvalTopo[avalTopoIdx] : m;
    }
    if (modo === 'eps') {
      if (zonaEps === 'aval') { return itensAval[avalIdx]; }
      return zonaEps === 'eps' ? itensEps[epIdx] : itensTemps[tempIdx];
    }
    if (modo === 'cred') { return itensCred[credIdx] || null; }
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

  // Tela principal (estilo Netflix): logo, informações e fundo ficam PARADOS.
  // Só a lista de opções sobe dentro da sua janela e o item que sai vai sumindo em cima.
  var menuY = 0;
  function rolarPrincipal() {
    var bloco = elPrincipal.querySelector('.det-bloco');
    var janela = $('det-menu');
    var trilho = $('det-menu-trilho');
    if (!bloco || !janela || !trilho) { return; }
    bloco.style.transform = '';
    // A janela vai do começo do menu até o fim da tela (menos uma margem de 40px)
    var topoJanela = bloco.offsetTop + janela.offsetTop + 8;
    var h = Math.max(160, 1080 - 40 - topoJanela);
    janela.style.height = (h + 14) + 'px';
    var y = menuY;
    if (elFocoAtual && elFocoAtual.offsetHeight) {
      var topo = elFocoAtual.offsetTop;
      var fundo = topo + elFocoAtual.offsetHeight;
      var passo = 86; // altura de um item + espaço, deixa o item anterior aparecendo esmaecido
      if (fundo <= h) { y = 0; }
      else if (fundo > y + h) { y = fundo - h; }
      else if (topo - passo < y) { y = Math.max(0, topo - passo); }
    } else {
      y = 0;
    }
    menuY = y;
    trilho.style.transform = y > 0 ? 'translateY(' + (-y) + 'px)' : '';
    janela.className = 'det-menu' + (y > 0 ? ' rolado' : '');
  }

  function marcarFoco() {
    if (elFocoAtual) { elFocoAtual.classList.remove('foco'); }
    elFocoAtual = elementoFoco() || null;
    if (elFocoAtual) { elFocoAtual.classList.add('foco'); }
    if (modo === 'principal') { rolarPrincipal(); }
    if (!elFocoAtual) { return; }
    if (modo === 'eps') {
      if (zonaEps === 'eps') { rolarLista(elEpsJanela, elEps, elFocoAtual); }
      else if (zonaEps === 'temps') { rolarLista(elTempsJanela, elTemps, elFocoAtual); }
    } else if (modo === 'sug') {
      rolarLista(elSugJanela, elSug, elFocoAtual);
    } else if (modo === 'cred') {
      rolarCreditos();
    }
  }

  function trocarModo(novo) {
    modo = novo;
    mostrarModo();
    marcarFoco();
  }

  // Avaliação do título (Não é para mim / Gostei / Amei!), guardada na TV.
  function atualizarAval() {
    var atual = item ? VLTV.dados.avaliacao(item.tipo, item.id) : '';
    itensAval.concat(itensAvalTopo).forEach(function (el) { el.classList.toggle('ativo', el.getAttribute('data-v') === atual); });
  }

  function alternarAval(topo) {
    var el = topo ? itensAvalTopo[avalTopoIdx] : itensAval[avalIdx];
    if (!el) { return; }
    VLTV.dados.definirAvaliacao(item.tipo, item.id, el.getAttribute('data-v'));
    atualizarAval();
    atualizarSugestoes();
  }

  function abrirEpisodios() {
    if (item.tipo !== 'series') { return; }
    atualizarAval();
    zonaEps = (falha || temporadas.length === 0) ? 'temps' : 'eps';
    trocarModo('eps');
  }

  function abrirSugestoes() {
    sugIdx = 0;
    montarCabecalho(elSugLogo, elSugNome, elSugMeta);
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
    if (el === elAvalTopo) { alternarAval(true); }
    else if (el === elPlay) { tocarPrincipal(false); }
    else if (el === elReiniciar) { tocarPrincipal(true); }
    else if (el === elBtnEps) { abrirEpisodios(); }
    else if (el === elBtnSug) { abrirSugestoes(); }
    else if (el === elBtnCred) { abrirCreditos(); }
    else if (el === elFav) { alternarFav(); }
  }

  function teclaPrincipal(k) {
    var n = itensMenu().length;
    if (itensMenu()[menuIdx] === elAvalTopo && (k === TECLA.ESQ || k === TECLA.DIR)) {
      avalTopoIdx = Math.max(0, Math.min(itensAvalTopo.length - 1, avalTopoIdx + (k === TECLA.ESQ ? -1 : 1)));
    }
    else if (k === TECLA.CIMA) { if (menuIdx > 0) { menuIdx--; } }
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

  function teclaAval(k) {
    if (k === TECLA.ESQ) { if (avalIdx > 0) { avalIdx--; } }
    else if (k === TECLA.DIR) { if (avalIdx < itensAval.length - 1) { avalIdx++; } }
    else if (k === TECLA.BAIXO) { if (itensEps.length > 0) { zonaEps = 'eps'; } else if (itensTemps.length > 0) { zonaEps = 'temps'; } }
    else if (k === TECLA.ENTER) { alternarAval(); }
  }

  function teclaEpisodios(k) {
    var n = itensEps.length;
    if (k === TECLA.CIMA) {
      if (epIdx > 0) { epIdx--; }
      else if (tempIdx > 0) { mudarTemporada(tempIdx - 1, 'ultimo'); }
      else { zonaEps = 'aval'; }
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
    if (k === TECLA.CIMA) { if (sugIdx > 0) { sugIdx--; } }
    else if (k === TECLA.BAIXO) { if (sugIdx < n - 1) { sugIdx++; } }
    else if (k === TECLA.CH_MAIS || k === TECLA.PG_BAIXO) { sugIdx = Math.min(n - 1, sugIdx + PASSO_PAGINA_EPS); }
    else if (k === TECLA.CH_MENOS || k === TECLA.PG_CIMA) { sugIdx = Math.max(0, sugIdx - PASSO_PAGINA_EPS); }
    else if (k === TECLA.ENTER) { if (itensSug[sugIdx]) { abrirSugestao(itensSug[sugIdx]._raw); } }
  }

  function teclaCreditos(k) {
    var n = itensCred.length;
    if (k === TECLA.CIMA) { if (credIdx > 0) { credIdx--; } }
    else if (k === TECLA.BAIXO) { if (credIdx < n - 1) { credIdx++; } }
  }

  function voltar() {
    // Em Episódios, Títulos semelhantes ou Créditos: volta ao menu, no botão que abriu a lista.
    if (modo !== 'principal') {
      var botao = modo === 'eps' ? elBtnEps : (modo === 'sug' ? elBtnSug : elBtnCred);
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
    else if (modo === 'eps') {
      if (zonaEps === 'aval') { teclaAval(k); }
      else if (zonaEps === 'temps') { teclaTemporadas(k); }
      else { teclaEpisodios(k); }
    }
    else if (modo === 'sug') { teclaSugestoes(k); }
    else { teclaCreditos(k); }

    marcarFoco();
    return true;
  }

  // ── Carregamento ──────────────────────────────────────────────────
  function montarSerie(dados) {
    info = dados.info || {};
    conferirIdPainel();
    atualizarSugestoes();
    atualizarCreditosTela();
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
    conferirIdPainel();
    atualizarSugestoes();
    atualizarCreditosTela();
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
    pediuIndice = false;
    sugCarregando = false;
    ficha = null;
    idPedidoPainel = '';
    semelhantesTmdb = null;
    ++idSem;
    pedirFicha('');          // TMDB: criação, elenco, gêneros, classificação e semelhantes (pelo nome; o ID do painel confere depois)
    credIdx = 0;
    menuIdx = 1;   // começa em Assistir/Continuar (a avaliação fica em cima)
    avalTopoIdx = 1;
    zonaEps = 'eps';
    avalIdx = 1;
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
    atualizarAval();
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
      menuIdx = 1;
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
      for (i = 0; i < itensAvalTopo.length; i++) { if (contem(itensAvalTopo[i], t)) { return { menuIdx: m.indexOf(elAvalTopo), sub: i }; } }
      for (i = 0; i < m.length; i++) { if (contem(m[i], t)) { return { menuIdx: i }; } }
    } else if (modo === 'eps') {
      for (i = 0; i < itensAval.length; i++) { if (contem(itensAval[i], t)) { return { aval: i }; } }
      for (i = 0; i < itensTemps.length; i++) { if (contem(itensTemps[i], t)) { return { temp: i }; } }
      for (i = 0; i < itensEps.length; i++) { if (contem(itensEps[i], t)) { return { epIdx: i }; } }
    } else if (modo === 'sug') {
      for (i = 0; i < itensSug.length; i++) { if (contem(itensSug[i], t)) { return { sugIdx: i }; } }
    } else {
      for (i = 0; i < itensCred.length; i++) { if (contem(itensCred[i], t)) { return { credIdx: i }; } }
    }
    return null;
  }

  function mesmoAlvo(a) {
    if (a.sub !== undefined) { return menuIdx === a.menuIdx && avalTopoIdx === a.sub; }
    if (a.menuIdx !== undefined) { return menuIdx === a.menuIdx; }
    if (a.aval !== undefined) { return zonaEps === 'aval' && avalIdx === a.aval; }
    if (a.temp !== undefined) { return true; }       // só passar o cursor na temporada não muda nada
    if (a.epIdx !== undefined) { return zonaEps === 'eps' && epIdx === a.epIdx; }
    if (a.sugIdx !== undefined) { return sugIdx === a.sugIdx; }
    if (a.credIdx !== undefined) { return credIdx === a.credIdx; }
    return true;
  }

  function aplicarAlvo(a) {
    if (a.sub !== undefined) { avalTopoIdx = a.sub; }
    if (a.menuIdx !== undefined) { menuIdx = a.menuIdx; }
    if (a.aval !== undefined) { avalIdx = a.aval; zonaEps = 'aval'; }
    if (a.epIdx !== undefined) { epIdx = a.epIdx; zonaEps = 'eps'; }
    if (a.sugIdx !== undefined) { sugIdx = a.sugIdx; }
    if (a.credIdx !== undefined) { credIdx = a.credIdx; }
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
