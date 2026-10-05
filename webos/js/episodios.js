// VLTV Play - webOS | Detalhes da série: temporadas e episódios.
(function () {
  'use strict';

  var TECLA = {
    ENTER: 13, ESC: 27, VOLTAR: 461,
    ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40,
    PG_CIMA: 33, PG_BAIXO: 34, CH_MAIS: 427, CH_MENOS: 428
  };

  function $(id) { return document.getElementById(id); }

  var elCapa = $('ep-capa');
  var elTitulo = $('ep-titulo');
  var elSinopse = $('ep-sinopse');
  var listaTemps = $('ep-temporadas');
  var listaEps = $('ep-lista');
  var tituloEps = $('ep-eps-titulo');
  var painelTemps = $('ep-painel-temp');
  var painelEps = $('ep-painel-eps');

  var serie = null;
  var acoes = null;
  var temporadas = [];
  var plano = [];            // todos os episódios em ordem, para tocar em sequência
  var tempIdx = 0;
  var epIdx = 0;
  var itensTemps = [];
  var itensEps = [];
  var liSelTemp = null;
  var liSelEp = null;
  var foco = 'temp';
  var falha = false;

  function esvaziar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  function mensagem(el, texto) {
    esvaziar(el);
    var li = document.createElement('li');
    li.className = 'msg';
    li.textContent = texto;
    el.appendChild(li);
  }

  function trocarFoco(novo) {
    foco = novo;
    painelTemps.classList.toggle('ativo', foco === 'temp');
    painelEps.classList.toggle('ativo', foco === 'eps');
  }

  // ── Listas ────────────────────────────────────────────────────────
  function renderTemporadas() {
    esvaziar(listaTemps);
    itensTemps = [];
    liSelTemp = null;
    temporadas.forEach(function (t) {
      var li = document.createElement('li');
      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = 'Temporada ' + t.numero;
      li.appendChild(nome);
      listaTemps.appendChild(li);
      itensTemps.push(li);
    });
  }

  function marcarTemporada() {
    if (liSelTemp) { liSelTemp.classList.remove('sel'); }
    liSelTemp = itensTemps[tempIdx] || null;
    if (liSelTemp) {
      liSelTemp.classList.add('sel');
      liSelTemp.scrollIntoView({ block: 'nearest' });
    }
  }

  function renderEpisodios() {
    esvaziar(listaEps);
    itensEps = [];
    liSelEp = null;
    var t = temporadas[tempIdx];
    tituloEps.textContent = t ? 'Temporada ' + t.numero : 'Episódios';
    if (!t) { return; }

    t.episodios.forEach(function (ep, i) {
      var li = document.createElement('li');
      var nome = document.createElement('span');
      nome.className = 'nome';
      var numero = ep.episode_num || (i + 1);
      nome.textContent = numero + '. ' + (ep.title || ('Episódio ' + numero));
      li.appendChild(nome);
      listaEps.appendChild(li);
      itensEps.push(li);
    });
    epIdx = 0;
    marcarEpisodio();
  }

  function marcarEpisodio() {
    if (liSelEp) { liSelEp.classList.remove('sel'); }
    liSelEp = itensEps[epIdx] || null;
    if (liSelEp) {
      liSelEp.classList.add('sel');
      liSelEp.scrollIntoView({ block: 'nearest' });
    }
  }

  // ── Dados ─────────────────────────────────────────────────────────
  function montar(dados) {
    temporadas = dados.temporadas;
    plano = [];

    temporadas.forEach(function (t, ti) {
      t.inicio = plano.length;
      t.episodios.forEach(function (ep, pos) {
        var numero = ep.episode_num || (pos + 1);
        plano.push({
          titulo: serie.nome + ' - T' + t.numero + ' E' + numero + (ep.title ? ' - ' + ep.title : ''),
          tipo: 'series',
          id: ep.id,
          ext: ep.container_extension,
          url: ep.url,
          temp: ti,
          pos: pos
        });
      });
    });

    var info = dados.info || {};
    if (!elSinopse.textContent && info.plot) { elSinopse.textContent = info.plot; }
    if (!elCapa.getAttribute('src') && info.cover) { elCapa.src = info.cover; }

    if (temporadas.length === 0) {
      mensagem(listaTemps, 'Nenhum episódio disponível.');
      mensagem(listaEps, '');
      return;
    }

    renderTemporadas();
    tempIdx = 0;
    marcarTemporada();
    renderEpisodios();
  }

  function carregar() {
    falha = false;
    mensagem(listaTemps, 'Carregando...');
    esvaziar(listaEps);
    VLTV.api.infoSerie(serie.id)
      .then(montar)
      .catch(function () {
        falha = true;
        mensagem(listaTemps, 'Não foi possível carregar. Pressione OK para tentar de novo.');
      });
  }

  // Depois de assistir, volta a lista para o episódio que estava tocando.
  function irPara(indicePlano) {
    var item = plano[indicePlano];
    if (!item) { return; }
    tempIdx = item.temp;
    marcarTemporada();
    renderEpisodios();
    epIdx = item.pos;
    marcarEpisodio();
    trocarFoco('eps');
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function teclaTemporadas(k) {
    if (k === TECLA.CIMA || k === TECLA.BAIXO) {
      var novo = tempIdx + (k === TECLA.CIMA ? -1 : 1);
      if (novo >= 0 && novo < temporadas.length) {
        tempIdx = novo;
        marcarTemporada();
        renderEpisodios();
      }
      return true;
    }
    if (k === TECLA.DIR || k === TECLA.ENTER) {
      if (falha) { carregar(); }
      else if (itensEps.length > 0) { trocarFoco('eps'); }
      return true;
    }
    return false;
  }

  function moverEp(passo) {
    if (itensEps.length === 0) { return; }
    epIdx = Math.max(0, Math.min(itensEps.length - 1, epIdx + passo));
    marcarEpisodio();
  }

  function teclaEpisodios(k) {
    if (k === TECLA.ESQ) { trocarFoco('temp'); }
    else if (k === TECLA.CIMA) { moverEp(-1); }
    else if (k === TECLA.BAIXO) { moverEp(1); }
    else if (k === TECLA.PG_CIMA || k === TECLA.CH_MAIS) { moverEp(-8); }
    else if (k === TECLA.PG_BAIXO || k === TECLA.CH_MENOS) { moverEp(8); }
    else if (k === TECLA.ENTER) {
      var t = temporadas[tempIdx];
      if (t) { acoes.reproduzir(plano, t.inicio + epIdx); }
    } else { return false; }
    return true;
  }

  // Devolve true se a tecla foi usada por esta tela.
  function tecla(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (foco === 'eps') { trocarFoco('temp'); } else { acoes.sair(); }
      return true;
    }
    return foco === 'temp' ? teclaTemporadas(k) : teclaEpisodios(k);
  }

  // serieNova: { id, nome, capa, sinopse }. acoesNovas: { sair, reproduzir(lista, indice) }
  function abrir(serieNova, acoesNovas) {
    serie = serieNova;
    acoes = acoesNovas;
    temporadas = [];
    plano = [];
    tempIdx = 0;
    epIdx = 0;

    elTitulo.textContent = serie.nome;
    elSinopse.textContent = serie.sinopse || '';
    elCapa.removeAttribute('src');
    if (serie.capa) { elCapa.src = serie.capa; }
    trocarFoco('temp');
    carregar();
  }

  VLTV.episodios = { abrir: abrir, tecla: tecla, irPara: irPara };
})();
