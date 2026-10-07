// VLTV Play - webOS | Minhas listas: guarda os logins/listas do cliente e deixa trocar de uma para outra
// dentro do app, sem sair da conta. Cada lista guarda o tipo (Usuário, Xtream, código de parceiro ou M3U).
(function () {
  'use strict';

  var CH_LISTAS = 'vltv_listas';
  var CH_ATIVA = 'vltv_lista_ativa';
  var MAX_LISTAS = 20;

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40 };

  // ── Armazenamento ─────────────────────────────────────────────────
  function lerTodas() {
    try {
      var bruto = localStorage.getItem(CH_LISTAS);
      var arr = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function gravarTodas(arr) {
    try { localStorage.setItem(CH_LISTAS, JSON.stringify(arr)); } catch (e) { /* ignora */ }
  }

  function idAtiva() {
    try { return localStorage.getItem(CH_ATIVA) || ''; } catch (e) { return ''; }
  }

  function definirAtiva(id) {
    try {
      if (id) { localStorage.setItem(CH_ATIVA, id); } else { localStorage.removeItem(CH_ATIVA); }
    } catch (e) { /* ignora */ }
  }

  function chaveDe(d) {
    if (d.modo === 'm3u') { return 'm3u|' + d.m3u; }
    if (d.modo === 'parceiro') { return 'parceiro|' + String(d.codigo || '').toUpperCase() + '|' + d.user; }
    if (d.modo === 'xtream') { return 'xtream|' + d.dns + '|' + d.user; }
    return 'usuario|' + d.user;
  }

  // d: { modo, dns, user, pass, codigo, m3u, parceiro }. A lista que acabou de entrar vira a "em uso".
  function registrar(d) {
    var id = chaveDe(d);
    var todas = lerTodas();
    var entrada = {
      id: id,
      modo: d.modo,
      dns: d.dns || '',
      user: d.user || '',
      pass: d.pass || '',
      codigo: d.codigo || '',
      m3u: d.m3u || '',
      parceiro: d.parceiro || '',
      t: new Date().getTime()
    };
    var achou = false;
    for (var i = 0; i < todas.length; i++) {
      if (todas[i].id === id) { todas[i] = entrada; achou = true; }
    }
    if (!achou) { todas.push(entrada); }
    while (todas.length > MAX_LISTAS) {
      var maisAntiga = -1;
      for (var j = 0; j < todas.length; j++) {
        if (todas[j].id !== id && (maisAntiga === -1 || todas[j].t < todas[maisAntiga].t)) { maisAntiga = j; }
      }
      if (maisAntiga === -1) { break; }
      todas.splice(maisAntiga, 1);
    }
    gravarTodas(todas);
    definirAtiva(id);
  }

  function remover(id) {
    gravarTodas(lerTodas().filter(function (e) { return e.id !== id; }));
    if (idAtiva() === id) { definirAtiva(''); }
  }

  function obter(id) {
    var todas = lerTodas();
    for (var i = 0; i < todas.length; i++) { if (todas[i].id === id) { return todas[i]; } }
    return null;
  }

  function host(url) {
    return String(url || '').replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  }

  // Nome e tipo mostrados na tela (o tipo mostra também o DNS, o código de parceiro ou o link da lista).
  function rotulo(e) {
    if (e.modo === 'm3u') {
      var fim = String(e.m3u || '').replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || '';
      var h = host(e.m3u);
      return { titulo: fim && fim !== h ? h + ' / ' + fim : h, tipo: 'Lista M3U  •  link: ' + e.m3u };
    }
    if (e.modo === 'parceiro') {
      return { titulo: e.user + (e.parceiro ? '  •  ' + e.parceiro : ''), tipo: 'Xtream  •  código de parceiro: ' + String(e.codigo || '').toUpperCase() };
    }
    if (e.modo === 'xtream') {
      return { titulo: e.user + '  •  ' + host(e.dns), tipo: 'Xtream  •  DNS: ' + e.dns };
    }
    return { titulo: e.user, tipo: 'Usuário e senha' };
  }

  function grupoDe(e) { return e.modo === 'parceiro' ? 'xtream' : e.modo; }

  // ── Tela "Minhas listas" ──────────────────────────────────────────
  var ABAS = [
    { id: 'todas', nome: 'Todas' },
    { id: 'usuario', nome: 'Usuário' },
    { id: 'xtream', nome: 'Xtream' },
    { id: 'm3u', nome: 'Lista M3U' }
  ];

  function $(id) { return document.getElementById(id); }

  var elAbas = $('listas-abas');
  var elLista = $('listas-lista');
  var elMsg = $('listas-msg');

  var acoes = null;
  var filtro = 0;
  var zona = 'lista';      // 'abas' | 'lista'
  var idx = 0;
  var col = 0;             // 0 = usar a lista, 1 = remover
  var confirmando = '';
  var ocupado = false;
  var linhas = [];         // entradas da aba atual
  var lis = [];

  function esvaziar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } el.scrollTop = 0; }

  function mensagem(texto, tipo) {
    elMsg.textContent = texto || '';
    elMsg.className = 'listas-msg' + (tipo ? ' ' + tipo : '');
  }

  function desenharAbas() {
    esvaziar(elAbas);
    ABAS.forEach(function (a, i) {
      var b = document.createElement('div');
      b.className = 'lst-aba' + (i === filtro ? ' ativa' : '') + (zona === 'abas' && i === filtro ? ' sel' : '');
      b.textContent = a.nome;
      elAbas.appendChild(b);
    });
  }

  function itensDaAba() {
    var id = ABAS[filtro].id;
    return lerTodas().filter(function (e) { return id === 'todas' || grupoDe(e) === id; });
  }

  function desenharLista() {
    esvaziar(elLista);
    lis = [];
    linhas = itensDaAba();
    var ativa = idAtiva();

    linhas.forEach(function (e) {
      var r = rotulo(e);
      var li = document.createElement('li');
      li.className = 'lst-item';

      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = r.titulo;
      var tipo = document.createElement('small');
      tipo.className = 'lst-tipo';
      tipo.textContent = r.tipo;
      nome.appendChild(tipo);
      li.appendChild(nome);

      if (e.id === ativa) {
        var uso = document.createElement('span');
        uso.className = 'lst-uso';
        uso.textContent = 'Em uso';
        li.appendChild(uso);
      }

      var rem = document.createElement('span');
      rem.className = 'lst-rem';
      rem.textContent = confirmando === e.id ? 'Confirmar?' : 'Remover';
      li.appendChild(rem);

      li.addEventListener('click', function () { idx = lis.indexOf(li); col = 0; zona = 'lista'; ativar(); });
      elLista.appendChild(li);
      lis.push(li);
    });

    var add = document.createElement('li');
    add.className = 'lst-add';
    var t = document.createElement('span');
    t.className = 'nome';
    t.textContent = '+  Adicionar nova lista';
    add.appendChild(t);
    add.addEventListener('click', function () { idx = lis.indexOf(add); zona = 'lista'; ativar(); });
    elLista.appendChild(add);
    lis.push(add);

    if (idx > lis.length - 1) { idx = lis.length - 1; }
    marcar();
  }

  function marcar() {
    lis.forEach(function (li, i) {
      var sel = zona === 'lista' && i === idx;
      li.classList.toggle('sel', sel);
      li.classList.toggle('col-rem', sel && col === 1);
    });
    if (zona === 'lista' && lis[idx]) { VLTV.rolar(lis[idx]); }
    desenharAbas();
  }

  function ehLinhaDeLista(i) { return i < linhas.length; }

  function ativar() {
    if (ocupado) { return; }
    if (!ehLinhaDeLista(idx)) {
      var g = ABAS[filtro].id;
      if (acoes) { acoes.adicionar(g === 'todas' ? '' : g); }
      return;
    }
    var e = linhas[idx];
    if (col === 1) {
      var emUso = e.id === idAtiva();
      if (confirmando !== e.id) {
        confirmando = e.id;
        mensagem(emUso ? 'Esta lista está em uso. Aperte OK de novo para remover e sair dela.' : 'Aperte OK de novo para remover esta lista.', '');
        desenharLista();
        return;
      }
      remover(e.id);
      confirmando = '';
      col = 0;
      if (emUso && acoes && acoes.removeuAtiva) { acoes.removeuAtiva(); return; }
      mensagem('Lista removida.', 'ok');
      desenharLista();
      return;
    }
    mensagem('', '');
    if (acoes) { acoes.usar(e); }
  }

  function tecla(k) {
    if (ocupado) { return true; }

    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (acoes) { acoes.sair(); }
      return true;
    }

    if (zona === 'abas') {
      if (k === TECLA.ESQ && filtro > 0) { filtro--; idx = 0; col = 0; confirmando = ''; desenharLista(); }
      else if (k === TECLA.DIR && filtro < ABAS.length - 1) { filtro++; idx = 0; col = 0; confirmando = ''; desenharLista(); }
      else if (k === TECLA.BAIXO || k === TECLA.ENTER) { zona = 'lista'; marcar(); }
      return true;
    }

    if (k === TECLA.CIMA) {
      if (idx === 0) { zona = 'abas'; col = 0; marcar(); } else { idx--; col = 0; confirmando = ''; desenharLista(); }
    } else if (k === TECLA.BAIXO) {
      if (idx < lis.length - 1) { idx++; col = 0; confirmando = ''; desenharLista(); }
    } else if (k === TECLA.DIR) {
      if (ehLinhaDeLista(idx)) { col = 1; marcar(); }
    } else if (k === TECLA.ESQ) {
      if (col === 1) { col = 0; confirmando = ''; desenharLista(); }
    } else if (k === TECLA.ENTER) {
      ativar();
    } else { return false; }
    return true;
  }

  // callbacks: { usar(entrada), adicionar(grupo), sair() }
  function abrir(callbacks, aviso) {
    acoes = callbacks;
    ocupado = false;
    confirmando = '';
    col = 0;
    zona = 'lista';
    // Começa na aba da lista em uso.
    var ativa = obter(idAtiva());
    filtro = 0;
    idx = 0;
    if (ativa) {
      var todas = lerTodas();
      for (var i = 0; i < todas.length; i++) { if (todas[i].id === ativa.id) { idx = i; } }
    }
    mensagem(aviso || '', '');
    desenharLista();
  }

  function ocupar(sim, texto) {
    ocupado = !!sim;
    if (texto !== undefined) { mensagem(texto, ''); }
  }

  VLTV.listas = {
    todas: lerTodas,
    registrar: registrar,
    remover: remover,
    obter: obter,
    idAtiva: idAtiva,
    rotulo: rotulo
  };

  VLTV.listasTela = {
    abrir: abrir,
    tecla: tecla,
    mensagem: mensagem,
    ocupar: ocupar
  };
})();
