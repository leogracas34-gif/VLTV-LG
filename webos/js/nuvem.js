// VLTV Play - webOS | Sincronização entre aparelhos (estilo Netflix) pela VPS.
// Mesmo login + mesmo perfil = mesmo "Continuar assistindo" e mesmos favoritos no celular, na TV Android, na LG e na Samsung.
// É o par do CloudSync.kt do app Android. Rotas do gateway: /conta/perfis, /conta/progresso, /conta/favoritos.
//
// Regras (iguais às do Android):
//  - O id do perfil na nuvem sai do NOME do perfil: "Léo" vira "leo" (perfilId).
//  - Posição e duração em SEGUNDOS. Chaves: 'f' + id (filme), 'e' + id (episódio); favoritos 'f', 's' (série) e 'c' (canal).
//  - Vale sempre o registro com "t" (hora do aparelho) mais novo.
//  - Só funciona em conta do VLTV Play (aba Usuário) e em login com CÓDIGO DE PARCEIRO. Xtream com servidor qualquer e M3U não sincronizam.
//    Parceiro: o gateway confere usuário e senha no painel do parceiro e guarda a conta separada (campo "parceiro" no corpo).
//  - Falhas são silenciosas: sem internet o app funciona como antes.
(function () {
  'use strict';

  var ESPERA_MS = 8000;             // junta várias gravações seguidas num envio só
  var INTERVALO_MIN_MS = 15000;     // não busca na nuvem mais que 1x a cada 15 s
  var SEMENTE_MAX = 400;            // limite do gateway por envio
  var TIMEOUT_MS = 15000;

  var pendentes = {};               // chave -> { rota, item } (o mais novo de cada item vence)
  var timer = null;
  var sincronizando = false;
  var ultimaSync = 0;
  var ultimoPerfil = '';
  var aoMudarCb = null;
  var pausadoAte = 0;               // a VPS recusou o login: não insiste por um tempo (cada recusa conta como "login errado" do IP)
  var PAUSA_RECUSA_MS = 30 * 60 * 1000;
  var CONFERE_SEM_PERFIL_MS = 20000;    // enquanto nenhum perfil foi escolhido: confere a lista de perfis a cada 20 s
  var CONFERE_COM_PERFIL_MS = 120000;   // com perfil escolhido: a cada 2 min (pega perfil apagado ou renomeado no celular)
  var conferindo = false;
  var timerConfere = null;

  // ── Utilidades ────────────────────────────────────────────────────
  function perfilId(nome) {
    var s = String(nome || '').trim();
    try { s = s.normalize('NFD'); } catch (e) { /* TV antiga: segue sem tirar acento */ }
    s = s.replace(/[\u0300-\u036f]+/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return s || 'padrao';
  }

  function cred() {
    if (new Date().getTime() < pausadoAte) { return null; }
    var s = VLTV.sessao.ler();
    if (!s || !s.user || !s.pass) { return null; }
    if (s.modo === 'usuario' || (s.modo === 'parceiro' && s.codigo)) { return s; }
    return null;
  }

  function ativo() { return !!cred(); }

  function perfil() { return VLTV.dados.perfilAtual(); }

  function post(rota, extra) {
    var c = cred();
    if (!c) { return Promise.reject(new Error('sem login')); }
    var corpo = { user: c.user, pass: c.pass };
    if (c.modo === 'parceiro') { corpo.parceiro = c.codigo; }
    for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { corpo[k] = extra[k]; } }
    return VLTV.http.fetchComTimeout(VLTV.dns.gateway() + rota, TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401 || r.status === 429) { pausadoAte = new Date().getTime() + PAUSA_RECUSA_MS; }
        throw new Error('http ' + r.status);
      }
      return r.json();
    }).then(function (j) {
      if (!j || j.ok !== true) { throw new Error('resposta'); }
      return j;
    });
  }

  // "Desde quando" já baixamos, por perfil (hora do SERVIDOR).
  function lerDesde(pid) {
    try {
      var c = cred();
      var t = JSON.parse(localStorage.getItem('vltv_nuvem_' + c.user + '_' + pid) || '{}');
      return { prog: t.prog || 0, fav: t.fav || 0 };
    } catch (e) { return { prog: 0, fav: 0 }; }
  }

  function gravarDesde(pid, d) {
    try {
      var c = cred();
      localStorage.setItem('vltv_nuvem_' + c.user + '_' + pid, JSON.stringify(d));
    } catch (e) { /* ignora */ }
  }

  // ── Envio (fila com espera) ───────────────────────────────────────
  function colocar(rota, item) {
    var p = perfil();
    if (!p || !cred()) { return; }
    pendentes[rota + '|' + p.id + '|' + item.k] = { rota: rota, perfil: p.id, item: item };
    if (!timer) { timer = setTimeout(function () { timer = null; enviarPendentes(); }, ESPERA_MS); }
  }

  // Manda o que está na fila. O que não sair volta para a fila.
  function enviarPendentes() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!cred()) { return Promise.resolve(); }
    var lote = pendentes;
    pendentes = {};
    var grupos = {};
    Object.keys(lote).forEach(function (k) {
      var p = lote[k];
      var g = p.rota + '|' + p.perfil;
      (grupos[g] = grupos[g] || { rota: p.rota, perfil: p.perfil, itens: [], chaves: [] });
      grupos[g].itens.push(p.item);
      grupos[g].chaves.push(k);
    });
    var tarefas = Object.keys(grupos).map(function (g) {
      var gr = grupos[g];
      return post(gr.rota, { perfil: gr.perfil, itens: gr.itens }).catch(function () {
        gr.chaves.forEach(function (k) { if (!pendentes[k]) { pendentes[k] = lote[k]; } });
      });
    });
    return Promise.all(tarefas);
  }

  // Chamado quando o vídeo fecha: não deixa o último progresso esperando.
  function descarregar() { enviarPendentes(); }

  function enviarProgresso(k, pos, dur, fim, meta) {
    if (!ativo() || !perfil() || !k || !isFinite(dur) || dur < 1) { return; }
    var d = Math.floor(dur);
    var item = { k: k, pos: fim ? d : Math.max(0, Math.floor(pos)), dur: d, t: new Date().getTime(), fim: !!fim };
    if (meta) { item.meta = meta; }
    colocar('/conta/progresso', item);
    if (fim) { enviarPendentes(); }
  }

  // k = 'f' + id (filme), 's' + id (série) ou 'c' + id (canal).
  function favorito(k, ativoAgora, meta, t) {
    if (!ativo() || !perfil()) { return; }
    var item = { k: k, t: t || new Date().getTime(), removido: !ativoAgora };
    if (meta) { item.meta = meta; }
    colocar('/conta/favoritos', item);
  }

  // ── Busca (nuvem -> TV) ───────────────────────────────────────────
  function sincronizarProgresso(p) {
    var d = lerDesde(p.id);
    var extra = { perfil: p.id, desde: d.prog };
    if (d.prog === 0) { extra.itens = VLTV.dados.sementeProgresso(SEMENTE_MAX); }   // 1ª vez: sobe o histórico que já existe aqui
    return post('/conta/progresso', extra).then(function (r) {
      var mudou = VLTV.dados.aplicarProgresso(r.itens || []);
      if (r.agora > 0) { var n = lerDesde(p.id); n.prog = r.agora; gravarDesde(p.id, n); }
      return mudou;
    });
  }

  function sincronizarFavoritos(p) {
    var d = lerDesde(p.id);
    var extra = { perfil: p.id, desde: d.fav };
    if (d.fav === 0) { extra.itens = VLTV.dados.sementeFavoritos(SEMENTE_MAX); }
    return post('/conta/favoritos', extra).then(function (r) {
      var mudou = VLTV.dados.aplicarFavoritos(r.itens || []);
      if (r.agora > 0) { var n = lerDesde(p.id); n.fav = r.agora; gravarDesde(p.id, n); }
      return mudou;
    });
  }

  // Manda o que está pendente, baixa o que mudou nos outros aparelhos e aplica aqui.
  function sincronizar(forcar) {
    var p = perfil();
    if (!p || !cred() || sincronizando) { return; }
    var agora = new Date().getTime();
    if (!forcar && p.id === ultimoPerfil && agora - ultimaSync < INTERVALO_MIN_MS) { return; }
    sincronizando = true;
    ultimaSync = agora;
    ultimoPerfil = p.id;
    var mudou = false;
    enviarPendentes()
      .then(function () { return sincronizarProgresso(p); })
      .then(function (m) { if (m) { mudou = true; } return sincronizarFavoritos(p); })
      .then(function (m) { if (m) { mudou = true; } })
      .catch(function () { /* sem internet ou servidor fora: tenta de novo na próxima vez */ })
      .then(function () {
        sincronizando = false;
        if (mudou && aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
      });
  }

  // ── Perfis ────────────────────────────────────────────────────────
  // A lista de perfis do celular fica guardada na TV (por login): a janela "Quem está assistindo?" abre na hora,
  // e a lista nova da nuvem chega por trás e corrige o que mudou.
  function contaUsuario() {
    var s = VLTV.sessao.ler();
    return (s && (s.modo === 'usuario' || (s.modo === 'parceiro' && s.codigo)) && s.user) ? s.user : '';
  }

  function listaGuardada() {
    var u = contaUsuario();
    if (!u) { return []; }
    try {
      var l = JSON.parse(localStorage.getItem('vltv_perfis_lista_' + u) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  function guardarLista(lista) {
    var u = contaUsuario();
    if (!u) { return; }
    try { localStorage.setItem('vltv_perfis_lista_' + u, JSON.stringify(lista)); } catch (e) { /* ignora */ }
  }

  function emVideo() {
    var t = document.getElementById('tela-player');
    return !!t && !t.classList.contains('escondida');
  }

  // Tira os apagados, os sem nome e os repetidos.
  function limparLista(perfis) {
    var vistos = {};
    return (perfis || []).filter(function (p) {
      if (!p || p.removido || !p.id || !p.nome || vistos[p.id]) { return false; }
      vistos[p.id] = true;
      return true;
    });
  }

  // Perfis que o celular (Android) ou esta TV subiram para a nuvem.
  function listarPerfis() {
    return post('/conta/perfis', {}).then(function (r) {
      var lista = limparLista(r.perfis);
      guardarLista(lista);
      return lista;
    });
  }

  // ── Criar / renomear / apagar (a mesma rota do celular: manda "perfis", vale o "atualizado" mais novo) ──
  // Avatar de perfil comum: bichinho original do VLTV ("vltv:<id>", ver js/avatares.js). Antes era 'av_iron_man' (personagem
  // de fora, risco de direitos autorais). O infantil continua 'av_infantil' (arte própria, igual no celular).
  var AVATAR_NORMAL = 'vltv:raposa';
  var AVATAR_KIDS = 'av_infantil';

  function agora() { return new Date().getTime(); }

  // Perfis de fábrica (quando a nuvem ainda não tem nenhum). "virtual" = ainda não foi para a nuvem.
  function padroes() {
    return [
      { id: 'meu-perfil', nome: 'Meu perfil', imagem: AVATAR_NORMAL, kids: false, virtual: true },
      { id: 'infantil', nome: 'Infantil', imagem: AVATAR_KIDS, kids: true, virtual: true }
    ];
  }

  function itemDe(p, t) {
    return { id: p.id, nome: p.nome, imagem: p.imagem || '', kids: p.kids === true, atualizado: t };
  }

  // Se a nuvem ainda está vazia, os perfis de fábrica sobem junto (com hora um pouco mais antiga: o que o usuário fez vale mais).
  function comPadroes(lista, itens, t) {
    if (lista.length > 0) { return itens; }
    return padroes().map(function (p) { return itemDe(p, t - 1); }).concat(itens);
  }

  function salvarPerfis(itens) {
    return post('/conta/perfis', { perfis: itens }).then(function (r) {
      var lista = limparLista(r.perfis);
      guardarLista(lista);
      return lista;
    });
  }

  function nomeValido(nome) { return String(nome || '').trim().slice(0, 40); }

  // imagem (opcional): avatar escolhido ("vltv:<id>"). Perfil infantil sempre usa o avatar infantil.
  function criarPerfil(nome, kids, imagem) {
    nome = nomeValido(nome);
    if (!nome) { return Promise.reject(new Error('nome')); }
    var id = perfilId(nome);
    return listarPerfis().then(function (lista) {
      if (lista.some(function (p) { return p.id === id; })) { throw new Error('existe'); }
      var t = agora();
      var novo = { id: id, nome: nome, imagem: kids ? AVATAR_KIDS : (imagem || AVATAR_NORMAL), kids: !!kids };
      return salvarPerfis(comPadroes(lista, [itemDe(novo, t)], t));
    });
  }

  // O id sai do nome (igual ao celular): renomear cria o id novo e apaga o antigo. O histórico desta TV vai junto.
  // novaImagem (opcional): troca também o avatar. Sem ela, o perfil mantém o que já tinha.
  function renomearPerfil(p, novoNome, novaImagem) {
    novoNome = nomeValido(novoNome);
    if (!novoNome) { return Promise.reject(new Error('nome')); }
    var novoId = perfilId(novoNome);
    var imagem = (novaImagem !== undefined && p.kids !== true) ? novaImagem : p.imagem;
    return listarPerfis().then(function (lista) {
      var t = agora();
      var itens;
      if (novoId === p.id) {
        itens = [itemDe({ id: p.id, nome: novoNome, imagem: imagem, kids: p.kids }, t)];
      } else {
        if (lista.some(function (x) { return x.id === novoId; })) { throw new Error('existe'); }
        itens = [
          itemDe({ id: novoId, nome: novoNome, imagem: imagem, kids: p.kids }, t),
          { id: p.id, nome: '', removido: true, atualizado: t }
        ];
      }
      return salvarPerfis(comPadroes(lista, itens, t)).then(function (nova) {
        var atual = perfil();
        if (novoId !== p.id) { VLTV.dados.migrarPerfil(p.id, novoId); }
        if (atual && atual.id === p.id) {
          VLTV.dados.definirPerfil({ id: novoId, nome: novoNome, imagem: imagem || '', kids: p.kids === true });
          ultimaSync = 0;
          sincronizar(true);
        }
        if (aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
        return nova;
      });
    });
  }

  function apagarPerfil(p) {
    return listarPerfis().then(function (lista) {
      var t = agora();
      return salvarPerfis(comPadroes(lista, [{ id: p.id, nome: '', removido: true, atualizado: t }], t)).then(function (nova) {
        var atual = perfil();
        if (atual && atual.id === p.id) { VLTV.dados.limparPerfil(); }
        if (aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
        return nova;
      });
    });
  }

  function escolherPerfil(p) {
    if (p.virtual) {   // perfil de fábrica: sobe para a nuvem agora (o celular passa a ver também)
      var t = agora();
      salvarPerfis(padroes().map(function (x) { return itemDe(x, t); })).catch(function () { /* tenta de novo na próxima conferência */ });
    }
    VLTV.dados.definirPerfil({ id: p.id, nome: p.nome, imagem: p.imagem || '', kids: p.kids === true });
    ultimaSync = 0;
    sincronizar(true);
    if (aoMudarCb) { try { aoMudarCb(); } catch (e) { /* ignora */ } }
  }

  // Ninguém escolhido ainda: 1 perfil entra sozinho, vários perguntam (a janela some depois da 1ª escolha).
  function escolherOuPerguntar(lista) {
    // Nuvem vazia (ninguém criou perfil ainda): mostra "Meu perfil" e "Infantil" para escolher, editar ou criar outros.
    if (lista.length === 0) { lista = padroes(); }
    // 1 perfil comum entra sozinho (infantil sozinho pergunta, para dar chance de criar o seu).
    if (lista.length === 1 && !lista[0].kids) {
      if (VLTV.perfil && VLTV.perfil.aberto()) { VLTV.perfil.fechar(); }
      escolherPerfil(lista[0]);
      return;
    }
    if (!VLTV.perfil) { return; }
    if (VLTV.perfil.aberto()) { VLTV.perfil.atualizar(lista); }
    else if (!emVideo()) { VLTV.perfil.abrir(lista, false); }
  }

  // Chegou a lista nova da nuvem.
  function aplicarLista(lista) {
    var atual = perfil();
    if (atual) {
      var achado = null;
      lista.forEach(function (p) { if (p.id === atual.id) { achado = p; } });
      if (achado) {
        // Nome, foto ou "infantil" mudou no celular: atualiza aqui sem perguntar nada.
        if (achado.nome !== atual.nome || (achado.imagem || '') !== (atual.imagem || '') || (achado.kids === true) !== (atual.kids === true)) {
          VLTV.dados.definirPerfil({ id: achado.id, nome: achado.nome, imagem: achado.imagem || '', kids: achado.kids === true });
        }
        return;
      }
      // Lista vazia pode ser falha da nuvem: não solta o perfil por causa disso.
      if (lista.length === 0) { return; }
      // O perfil escolhido aqui foi apagado (ou renomeado) no celular: escolhe de novo.
      VLTV.dados.limparPerfil();
    }
    escolherOuPerguntar(lista);
  }

  function conferirPerfis() {
    if (conferindo || !cred()) { return Promise.resolve(); }
    conferindo = true;
    return listarPerfis().then(function (lista) {
      conferindo = false;
      aplicarLista(lista);
    }, function () {
      conferindo = false;   // sem internet ou servidor fora: a próxima conferência tenta de novo
    });
  }

  // Confere de tempos em tempos. Antes só conferia ao abrir a Home: se a internet da TV ainda não tinha voltado, ou o celular
  // ainda não tinha enviado os perfis, nada aparecia até sair e voltar à Home.
  function agendarConferencia() {
    if (timerConfere) { return; }
    timerConfere = setTimeout(function () {
      timerConfere = null;
      conferirPerfis().then(agendarConferencia);
    }, perfil() ? CONFERE_COM_PERFIL_MS : CONFERE_SEM_PERFIL_MS);
  }

  // Ao entrar na Home: se já tem perfil, sincroniza; se não, mostra já a lista guardada (se houver) e confere a nuvem.
  function aoEntrarNaHome() {
    if (!ativo()) { agendarConferencia(); return; }
    if (perfil()) {
      sincronizar(false);
    } else {
      var guardada = listaGuardada();
      if (guardada.length > 1 && VLTV.perfil && !VLTV.perfil.aberto() && !emVideo()) { VLTV.perfil.abrir(guardada, false); }
    }
    conferirPerfis();
    agendarConferencia();
  }

  VLTV.nuvem = {
    perfilId: perfilId,
    ativo: ativo,
    enviarProgresso: enviarProgresso,
    favorito: favorito,
    descarregar: descarregar,
    sincronizar: sincronizar,
    listarPerfis: listarPerfis,
    listaGuardada: listaGuardada,
    padroes: padroes,
    criarPerfil: criarPerfil,
    renomearPerfil: renomearPerfil,
    apagarPerfil: apagarPerfil,
    escolherPerfil: escolherPerfil,
    aoEntrarNaHome: aoEntrarNaHome,
    aoMudar: function (f) { aoMudarCb = f; }
  };
})();
