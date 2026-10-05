// VLTV Play - webOS | Progresso de reprodução (continuar de onde parou) e favoritos (Minha Lista).
// Tudo fica guardado na própria TV, separado por usuário.
(function () {
  'use strict';

  var MAX_PROGRESSO = 500;      // quantos títulos/episódios lembrar
  var FIM_PERCENTUAL = 0.95;    // a partir daqui o título conta como assistido

  function dono() {
    var s = VLTV.sessao.ler();
    if (!s) { return 'padrao'; }
    return s.modo === 'm3u' ? 'm3u' : (s.user || 'padrao');
  }

  function chave(nome) { return 'vltv_' + nome + '_' + dono(); }

  function ler(nomeChave, padrao) {
    try {
      var texto = window.localStorage.getItem(nomeChave);
      return texto ? JSON.parse(texto) : padrao;
    } catch (e) {
      return padrao;
    }
  }

  function gravar(nomeChave, valor) {
    try { window.localStorage.setItem(nomeChave, JSON.stringify(valor)); } catch (e) { /* ignora */ }
  }

  // ── Progresso ─────────────────────────────────────────────────────
  // chave do título: 'f' + id (filme) ou 'e' + id (episódio).
  // Guarda { pos, dur, t, fim } com pos e dur em segundos e t = quando foi visto por último.
  function progresso(id) {
    var todos = ler(chave('prog'), {});
    return todos[id] || null;
  }

  function podar(todos) {
    var ids = Object.keys(todos);
    if (ids.length <= MAX_PROGRESSO) { return; }
    ids.sort(function (a, b) { return (todos[a].t || 0) - (todos[b].t || 0); });
    for (var i = 0; i < ids.length - MAX_PROGRESSO; i++) { delete todos[ids[i]]; }
  }

  function salvarProgresso(id, pos, dur) {
    if (!id || !isFinite(pos) || !isFinite(dur) || dur <= 0) { return; }
    var todos = ler(chave('prog'), {});
    var fim = pos / dur >= FIM_PERCENTUAL;
    todos[id] = {
      pos: fim ? 0 : Math.floor(pos),
      dur: Math.floor(dur),
      t: new Date().getTime(),
      fim: fim
    };
    podar(todos);
    gravar(chave('prog'), todos);
  }

  // ── Favoritos (Minha Lista) ───────────────────────────────────────
  // Cada favorito: { tipo: 'filmes' | 'series', id, nome, capa }
  function favoritos() { return ler(chave('fav'), []); }

  function indiceFavorito(lista, tipo, id) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].tipo === tipo && String(lista[i].id) === String(id)) { return i; }
    }
    return -1;
  }

  function ehFavorito(tipo, id) { return indiceFavorito(favoritos(), tipo, id) !== -1; }

  // Devolve o novo estado: true = acabou de entrar na lista, false = saiu da lista.
  function alternarFavorito(fav) {
    var lista = favoritos();
    var i = indiceFavorito(lista, fav.tipo, fav.id);
    var agora;
    if (i === -1) {
      lista.push({ tipo: fav.tipo, id: fav.id, nome: fav.nome, capa: fav.capa });
      agora = true;
    } else {
      lista.splice(i, 1);
      agora = false;
    }
    gravar(chave('fav'), lista);
    return agora;
  }

  VLTV.dados = {
    progresso: progresso,
    salvarProgresso: salvarProgresso,
    favoritos: favoritos,
    ehFavorito: ehFavorito,
    alternarFavorito: alternarFavorito
  };
})();
