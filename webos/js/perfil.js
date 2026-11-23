// VLTV Play - webOS | Tela "Quem está assistindo?" (tela cheia): escolher, criar, editar e apagar perfis.
// Os perfis são os mesmos do celular (a nuvem do VLTV guarda a lista). Perfil infantil tem avatar colorido.
// Vale para a escolha logo depois do login e também para trocar de perfil pelo botão da Home.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40 };
  var MAX_PERFIS = 8;

  var caixa = null;
  var elTitulo = null;
  var elLista = null;
  var elSub = null;
  var elGerenciar = null;
  var perfis = [];
  var cartoes = [];        // botões da grade: um por perfil + o "+" no fim
  var idx = 0;             // item da grade em foco
  var foco = 'grade';      // 'grade' | 'gerenciar'
  var gerenciando = false;
  var trocandoFlag = false;
  var aoFechar = null;
  var listaPendente = null;   // lista nova da nuvem que chegou com o formulário aberto
  var form = null;            // formulário aberto (criar/editar)

  // ── Visual (injetado aqui para não mexer em outros arquivos) ──────
  var CSS = '' +
    '#aviso-perfil{position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 35%,#1b1b22 0%,#0a0a0c 70%);font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;}' +
    '#aviso-perfil.escondida{display:none;}' +
    '#aviso-perfil h2{font-size:64px;font-weight:700;color:#f5f5f7;margin:0 0 60px;letter-spacing:0.5px;}' +
    '#aviso-perfil .perfil-lista{display:flex;flex-wrap:wrap;justify-content:center;max-width:1750px;}' +
    '#aviso-perfil .perfil-card{display:flex;flex-direction:column;align-items:center;width:230px;margin:0 14px 24px;padding:20px 0 16px;' +
    'background:transparent;border:0;border-radius:22px;color:#9c9ca8;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;outline:none;' +
    'transition:transform .15s ease,background .15s ease,color .15s ease;}' +
    '#aviso-perfil .perfil-avatar,.perfil-mini{position:relative;border-radius:50%;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'font-weight:700;color:#fff;box-sizing:border-box;flex:none;background-origin:border-box;text-shadow:0 3px 10px rgba(0,0,0,.28);}' +
    '#aviso-perfil .perfil-avatar{width:160px;height:160px;font-size:80px;border:6px solid transparent;}' +
    '.perfil-avatar img,.perfil-mini img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;}' +
    '#aviso-perfil .perfil-nome{margin-top:20px;font-size:34px;font-weight:700;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '#aviso-perfil .perfil-tag{margin-top:4px;height:28px;font-size:23px;color:#9c9ca8;}' +
    '#aviso-perfil .perfil-card.foco{transform:scale(1.14);background:rgba(255,255,255,0.07);color:#fff;}' +
    '#aviso-perfil .perfil-card.foco .perfil-avatar{border-color:#ff4b55;box-shadow:0 0 36px rgba(229,9,20,0.55);}' +
    '#aviso-perfil .perfil-mais{width:160px;height:160px;border-radius:50%;border:6px dashed #4a4a55;display:flex;align-items:center;justify-content:center;font-size:90px;color:#9c9ca8;box-sizing:border-box;}' +
    '#aviso-perfil .perfil-card.foco .perfil-mais{border-style:solid;border-color:#ff4b55;color:#fff;}' +
    '#aviso-perfil .perfil-lapis{position:absolute;right:2px;bottom:2px;width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.72);border:3px solid #fff;font-size:30px;display:flex;align-items:center;justify-content:center;}' +
    '#aviso-perfil .perfil-gerenciar{margin-top:30px;padding:12px 40px;font-size:28px;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;color:#9c9ca8;background:transparent;border:2px solid #4a4a55;border-radius:14px;outline:none;}' +
    '#aviso-perfil .perfil-gerenciar.foco{color:#fff;border-color:#fff;background:rgba(255,255,255,.1);}' +
    '#aviso-perfil .aviso-sub{position:absolute;bottom:50px;left:0;right:0;text-align:center;font-size:27px;color:#9c9ca8;margin:0;}' +
    /* formulário */
    '#aviso-perfil .perfil-form{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 35%,#1b1b22 0%,#0a0a0c 70%);}' +
    '#aviso-perfil .perfil-form h3{font-size:56px;color:#f5f5f7;margin:0 0 36px;}' +
    '#aviso-perfil .perfil-form .perfil-avatar{width:150px;height:150px;font-size:76px;margin-bottom:30px;}' +
    '#aviso-perfil .pf-campo{width:760px;height:84px;margin:10px 0;font-size:36px;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;font-weight:700;color:#fff;background:#1f1f23;border:3px solid #2e2e34;border-radius:14px;outline:none;box-sizing:border-box;padding:0 28px;text-align:center;}' +
    '#aviso-perfil .pf-campo.foco{border-color:#fff;background:#2a2a30;}' +
    '#aviso-perfil .pf-campo.salvar{background:#e50914;border-color:#e50914;}' +
    '#aviso-perfil .pf-campo.salvar.foco{border-color:#fff;background:#ff4b55;}' +
    '#aviso-perfil .pf-campo.apagar{color:#ff8a92;}' +
    '#aviso-perfil .pf-msg{height:40px;margin-top:10px;font-size:27px;color:#ff8a92;}' +
    /* mini avatar do botão da Home */
    '.perfil-mini{width:58px;height:58px;font-size:30px;margin-right:16px;vertical-align:middle;display:inline-flex;}' +
    /* botão de perfil no canto de cima da Home (ao lado da engrenagem), estilo Netflix */
    '.topo-direita .btn-perfil{display:inline-flex;align-items:center;height:76px;margin-right:20px;padding:0 34px 0 8px;box-sizing:border-box;border-radius:38px;' +
    'background:var(--painel);border:3px solid var(--borda);color:#e8e8ee;font-size:28px;font-weight:700;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;outline:none;}' +
    '.topo-direita .btn-perfil:focus,.topo-direita .btn-perfil:hover{color:#fff;background:var(--destaque);border-color:#fff;box-shadow:0 0 0 8px rgba(var(--destaque-rgb),.5);}' +
    '.btn-perfil #perfil-mini-nome{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.btn-perfil .perfil-mini{border:0;}';

  // Avatares próprios do VLTV (cores e formas, sem personagens): evita problema de direitos autorais nas lojas.
  // O perfil guarda "vltv:<id>" no campo imagem. Sem escolha, o estilo sai do id do perfil.
  var ESTILOS = [
    { id: 'aurora',   nome: 'Aurora',   fundo: 'radial-gradient(circle at 22% 18%,rgba(255,255,255,.38),rgba(255,255,255,0) 46%),linear-gradient(135deg,#7f5af0,#2cb1ff)' },
    { id: 'por-do-sol', nome: 'Pôr do sol', fundo: 'radial-gradient(circle at 50% 112%,#ffd166 0,#ffd166 36%,rgba(255,209,102,0) 37%),linear-gradient(170deg,#ff7e5f,#c94b9c)' },
    { id: 'oceano',   nome: 'Oceano',   fundo: 'radial-gradient(ellipse at 50% 130%,rgba(255,255,255,.28) 0,rgba(255,255,255,.28) 42%,rgba(255,255,255,0) 43%),linear-gradient(160deg,#00c6ff,#0072ff)' },
    { id: 'floresta', nome: 'Floresta', fundo: 'radial-gradient(circle at 80% 15%,rgba(255,255,255,.3),rgba(255,255,255,0) 35%),linear-gradient(150deg,#56ab2f,#0b6e4f)' },
    { id: 'galaxia',  nome: 'Galáxia',  fundo: 'radial-gradient(circle at 20% 25%,rgba(255,255,255,.9) 0,rgba(255,255,255,.9) 1.5%,rgba(255,255,255,0) 2%),radial-gradient(circle at 78% 30%,rgba(255,255,255,.8) 0,rgba(255,255,255,.8) 1.2%,rgba(255,255,255,0) 1.8%),radial-gradient(circle at 60% 78%,rgba(255,255,255,.7) 0,rgba(255,255,255,.7) 1.2%,rgba(255,255,255,0) 1.8%),linear-gradient(145deg,#1e1b4b,#6d28d9)' },
    { id: 'fogo',     nome: 'Fogo',     fundo: 'radial-gradient(circle at 50% 100%,rgba(255,240,150,.55),rgba(255,240,150,0) 55%),linear-gradient(160deg,#ff512f,#dd2476)' },
    { id: 'doce',     nome: 'Doce',     fundo: 'radial-gradient(circle at 25% 20%,rgba(255,255,255,.4),rgba(255,255,255,0) 42%),linear-gradient(135deg,#f093fb,#f5576c)' },
    { id: 'menta',    nome: 'Menta',    fundo: 'radial-gradient(circle at 75% 20%,rgba(255,255,255,.35),rgba(255,255,255,0) 40%),linear-gradient(140deg,#11998e,#38ef7d)' },
    { id: 'ouro',     nome: 'Ouro',     fundo: 'radial-gradient(circle at 30% 20%,rgba(255,255,255,.4),rgba(255,255,255,0) 45%),linear-gradient(145deg,#f6d365,#e08a1e)' },
    { id: 'meia-noite', nome: 'Meia-noite', fundo: 'radial-gradient(circle at 50% 50%,rgba(255,255,255,0) 52%,rgba(255,255,255,.22) 53%,rgba(255,255,255,.22) 56%,rgba(255,255,255,0) 57%),linear-gradient(150deg,#232526,#2b5876)' },
    { id: 'rosa',     nome: 'Rosa',     fundo: 'radial-gradient(circle at 24% 22%,rgba(255,255,255,.38),rgba(255,255,255,0) 44%),linear-gradient(140deg,#ff758c,#ff7eb3)' },
    { id: 'grafite',  nome: 'Grafite',  fundo: 'radial-gradient(circle at 28% 20%,rgba(255,255,255,.22),rgba(255,255,255,0) 45%),linear-gradient(150deg,#485563,#29323c)' }
  ];

  function estiloPorId(id) {
    for (var i = 0; i < ESTILOS.length; i++) { if (ESTILOS[i].id === id) { return i; } }
    return -1;
  }

  // Estilo do perfil: o escolhido ("vltv:<id>") ou, se não escolheu, um que sai do id do perfil.
  function estiloDe(p) {
    var m = /^vltv:(.+)$/.exec(String(p.imagem || ''));
    var i = m ? estiloPorId(m[1]) : -1;
    if (i >= 0) { return i; }
    var h = 0, t = String(p.id || p.nome || '');
    for (var j = 0; j < t.length; j++) { h = (h * 31 + t.charCodeAt(j)) % 9973; }
    return h % ESTILOS.length;
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) { e.className = classe; }
    if (texto !== undefined) { e.textContent = texto; }
    return e;
  }

  // Avatar redondo. mini = true: versão pequena do botão da Home.
  function avatar(p, mini) {
    var av = el('div', mini ? 'perfil-mini' : 'perfil-avatar');
    if (p.kids) {   // perfil infantil: sempre a mesma arte do app do celular (av_infantil)
      av.className += ' kids';
      var k = document.createElement('img');
      k.alt = '';
      k.src = 'img/av_infantil.jpg';
      av.appendChild(k);
      return av;
    }
    av.style.backgroundImage = ESTILOS[estiloDe(p)].fundo;
    av.appendChild(document.createTextNode(String(p.nome || '?').replace(/^\s+/, '').charAt(0).toUpperCase() || '?'));
    if (/^(https?:|data:image)/i.test(String(p.imagem || ''))) {
      var im = document.createElement('img');
      im.alt = '';
      im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
      im.src = p.imagem;
      av.appendChild(im);
    }
    return av;
  }

  function montar() {
    if (caixa) { return; }
    caixa = el('div');
    caixa.id = 'aviso-perfil';
    caixa.className = 'escondida';
    caixa.setAttribute('role', 'dialog');
    caixa.setAttribute('aria-modal', 'true');
    elTitulo = el('h2', '', 'Quem está assistindo?');
    elLista = el('div', 'perfil-lista');
    elGerenciar = el('button', 'perfil-gerenciar', 'Gerenciar perfis');
    elGerenciar.type = 'button';
    elGerenciar.addEventListener('click', alternarGerenciar);
    elSub = el('p', 'aviso-sub');
    caixa.appendChild(elTitulo);
    caixa.appendChild(elLista);
    caixa.appendChild(elGerenciar);
    caixa.appendChild(elSub);
    document.body.appendChild(caixa);
  }

  function aberto() { return !!caixa && !caixa.classList.contains('escondida'); }

  function fechar() {
    if (!aberto()) { return; }
    fecharForm(true);
    caixa.classList.add('escondida');
    var f = aoFechar;
    aoFechar = null;
    if (f) { try { f(); } catch (e) { /* ignora */ } }
  }

  function podeFechar() { return trocandoFlag || !!VLTV.dados.perfilAtual(); }

  // ── Grade de perfis ───────────────────────────────────────────────
  function marcar() {
    cartoes.forEach(function (b, i) { b.classList.toggle('foco', foco === 'grade' && i === idx); });
    elGerenciar.classList.toggle('foco', foco === 'gerenciar');
    var alvo = foco === 'gerenciar' ? elGerenciar : cartoes[idx];
    if (alvo) { alvo.focus(); }
  }

  function textoDica() {
    if (gerenciando) { return 'Escolha um perfil para editar. Voltar sai do modo editar.'; }
    return podeFechar()
      ? 'Use as setas e aperte OK. Voltar fecha sem trocar.'
      : 'Use as setas e aperte OK. Para criar ou editar perfis, use "Gerenciar perfis".';
  }

  function desenhar(selecionado) {
    while (elLista.firstChild) { elLista.removeChild(elLista.firstChild); }
    var atual = VLTV.dados.perfilAtual();
    var sel = 0;
    cartoes = perfis.map(function (p, i) {
      var b = el('button', 'perfil-card');
      b.type = 'button';
      var av = avatar(p, false);
      if (gerenciando) { av.appendChild(el('span', 'perfil-lapis', '✎')); }
      b.appendChild(av);
      b.appendChild(el('div', 'perfil-nome', p.nome));
      b.appendChild(el('div', 'perfil-tag', atual && atual.id === p.id ? 'Perfil atual' : ''));
      b.addEventListener('click', function () { idx = i; foco = 'grade'; ativar(i); });
      elLista.appendChild(b);
      if (selecionado ? selecionado === p.id : (atual && atual.id === p.id)) { sel = i; }
      return b;
    });
    if (perfis.length < MAX_PERFIS) {
      var mais = el('button', 'perfil-card');
      mais.type = 'button';
      mais.appendChild(el('div', 'perfil-mais', '+'));
      mais.appendChild(el('div', 'perfil-nome', 'Adicionar'));
      mais.appendChild(el('div', 'perfil-tag', ''));
      mais.addEventListener('click', function () { idx = perfis.length; foco = 'grade'; ativar(perfis.length); });
      elLista.appendChild(mais);
      cartoes.push(mais);
    }
    idx = Math.min(sel, cartoes.length - 1);
    elGerenciar.textContent = gerenciando ? 'Concluído' : 'Gerenciar perfis';
    elTitulo.textContent = gerenciando ? 'Gerenciar perfis' : 'Quem está assistindo?';
    elSub.textContent = textoDica();
    marcar();
  }

  function alternarGerenciar() {
    gerenciando = !gerenciando;
    var sel = perfis[idx] ? perfis[idx].id : null;
    desenhar(sel);
    foco = 'gerenciar';
    marcar();
  }

  // Entrada no perfil infantil: tela colorida com o avatar e "INFANTIL" (igual à animação do app do celular).
  // A Home já carrega por trás; o toque do controle fica preso até a animação terminar.
  function animarInfantil() {
    var capa = document.createElement('div');
    capa.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:linear-gradient(90deg,#2E7D32,#F57C00,#E91E8C,#3F51B5);opacity:0;transition:opacity .28s ease;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;';
    var img = document.createElement('img');
    img.alt = '';
    img.src = 'img/av_infantil.jpg';
    img.style.cssText = 'width:300px;height:300px;border-radius:18%;object-fit:cover;box-shadow:0 18px 60px rgba(0,0,0,.35);transform:scale(.55);transition:transform .48s cubic-bezier(.34,1.56,.64,1);';
    var txt = document.createElement('div');
    txt.textContent = 'INFANTIL';
    txt.style.cssText = 'margin-top:44px;font-size:60px;font-weight:800;letter-spacing:6px;color:#fff;opacity:0;transition:opacity .25s ease;text-shadow:0 4px 16px rgba(0,0,0,.3);';
    capa.appendChild(img);
    capa.appendChild(txt);
    document.body.appendChild(capa);
    var travar = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('keydown', travar, true);
    setTimeout(function () { capa.style.opacity = '1'; img.style.transform = 'scale(1)'; }, 30);
    setTimeout(function () { txt.style.opacity = '1'; }, 560);
    setTimeout(function () { capa.style.opacity = '0'; }, 1500);
    setTimeout(function () {
      document.removeEventListener('keydown', travar, true);
      if (capa.parentNode) { capa.parentNode.removeChild(capa); }
    }, 1850);
  }

  function escolher(i) {
    var p = perfis[i];
    if (!p) { return; }
    if (p.kids === true) { animarInfantil(); }
    VLTV.nuvem.escolherPerfil(p);
    fechar();
  }

  function ativar(i) {
    if (i >= perfis.length) { abrirForm(null); return; }
    if (gerenciando) { abrirForm(perfis[i]); return; }
    escolher(i);
  }

  // lista: [{ id, nome, imagem, kids }]. trocando = true quando veio da Home ou de Configurações (Voltar fecha sem trocar).
  // depois (opcional): roda quando a janela fecha.
  function abrir(lista, trocando, depois) {
    if (!lista || lista.length === 0) { return; }
    montar();
    perfis = lista.slice(0);
    trocandoFlag = !!trocando;
    aoFechar = depois || null;
    gerenciando = false;
    foco = 'grade';
    listaPendente = null;
    fecharForm(true);
    caixa.classList.remove('escondida');
    desenhar(null);
  }

  // A lista chegou da nuvem com a tela já aberta (mostrada com a lista guardada na TV): redesenha sem perder o item marcado.
  function atualizar(lista) {
    if (!aberto() || !lista || lista.length === 0) { return; }
    if (form) { listaPendente = lista; return; }   // não mexe na tela enquanto o formulário está aberto
    function assinatura(l) { return l.map(function (p) { return p.id + '|' + p.nome + '|' + (p.kids ? 1 : 0); }).join(';'); }
    if (assinatura(lista) === assinatura(perfis)) { return; }
    var sel = perfis[idx] ? perfis[idx].id : null;
    perfis = lista.slice(0);
    desenhar(sel);
  }

  // Abre pela Home ou por Configurações: mostra já a lista guardada na TV e corrige com a da nuvem por trás.
  function abrirTroca(depois) {
    var guardada = VLTV.nuvem.listaGuardada();
    if (guardada.length > 0) {
      abrir(guardada, true, depois);
      VLTV.nuvem.listarPerfis().then(atualizar).catch(function () { /* sem internet: fica a lista guardada */ });
      return;
    }
    VLTV.nuvem.listarPerfis().then(function (lista) {
      abrir(lista.length > 0 ? lista : VLTV.nuvem.padroes(), true, depois);
    }).catch(function () { /* sem internet e sem lista guardada: não abre */ });
  }

  // ── Formulário (criar / editar) ───────────────────────────────────
  function liberar(e) { e.removeAttribute('readonly'); e.blur(); e.focus(); }
  function travar(e) { e.setAttribute('readonly', 'readonly'); }

  function abrirForm(p) {
    var novo = !p;
    var estado = { p: p, novo: novo, kids: novo ? false : p.kids === true, ocupado: false, confirmaApagar: false };
    var raiz = el('div', 'perfil-form');
    var tit = el('h3', '', novo ? 'Novo perfil' : 'Editar perfil');
    var avBox = el('div');
    var campo = document.createElement('input');
    campo.type = 'text';
    campo.className = 'pf-campo';
    campo.maxLength = 40;
    campo.placeholder = 'Nome do perfil';
    campo.value = novo ? '' : p.nome;
    campo.setAttribute('readonly', 'readonly');
    campo.setAttribute('autocomplete', 'off');
    var campos = [campo];
    var btnTipo = null;
    if (novo) {
      btnTipo = el('button', 'pf-campo');
      btnTipo.type = 'button';
      campos.push(btnTipo);
    }
    var btnSalvar = el('button', 'pf-campo salvar', 'Salvar');
    btnSalvar.type = 'button';
    campos.push(btnSalvar);
    var btnApagar = null;
    if (!novo && perfis.length > 1) {
      btnApagar = el('button', 'pf-campo apagar', 'Apagar perfil');
      btnApagar.type = 'button';
      campos.push(btnApagar);
    }
    var btnCancelar = el('button', 'pf-campo', 'Cancelar');
    btnCancelar.type = 'button';
    campos.push(btnCancelar);
    var msg = el('div', 'pf-msg');

    function previa() {
      while (avBox.firstChild) { avBox.removeChild(avBox.firstChild); }
      var nome = campo.value.trim() || (novo ? '?' : p.nome);
      avBox.appendChild(avatar({ id: novo ? nome : p.id, nome: nome, kids: estado.kids, imagem: novo ? '' : p.imagem }, false));
    }
    function textoTipo() { if (btnTipo) { btnTipo.textContent = 'Tipo: ' + (estado.kids ? 'Infantil (só conteúdo infantil)' : 'Normal') + '   ◂ ▸'; } }

    raiz.appendChild(tit);
    raiz.appendChild(avBox);
    campos.forEach(function (c) { raiz.appendChild(c); });
    raiz.appendChild(msg);
    caixa.appendChild(raiz);

    form = { raiz: raiz, campos: campos, i: 0, estado: estado, campo: campo, btnTipo: btnTipo, btnSalvar: btnSalvar, btnApagar: btnApagar, btnCancelar: btnCancelar, msg: msg, previa: previa, textoTipo: textoTipo };
    previa();
    textoTipo();
    campo.addEventListener('input', previa);
    campo.addEventListener('focus', function () { clearTimeout(form && form.timerTrava); });
    campo.addEventListener('blur', function () {
      if (!form || campo.hasAttribute('readonly')) { return; }
      var f = form;
      clearTimeout(f.timerTrava);
      f.timerTrava = setTimeout(function () {
        if (document.activeElement === campo) { return; }
        travar(campo);
        if (form === f && (!document.activeElement || document.activeElement === document.body)) { campo.focus(); }
      }, 50);
    });
    btnSalvar.addEventListener('click', salvarForm);
    btnCancelar.addEventListener('click', function () { fecharForm(false); });
    if (btnTipo) { btnTipo.addEventListener('click', alternarTipo); }
    if (btnApagar) { btnApagar.addEventListener('click', apagarForm); }
    campo.addEventListener('click', function () { form.i = 0; marcarForm(); liberar(campo); });
    marcarForm();
  }

  function marcarForm() {
    if (!form) { return; }
    form.campos.forEach(function (c, i) { c.classList.toggle('foco', i === form.i); });
    var c = form.campos[form.i];
    if (c) { c.focus(); }
  }

  function fecharForm(semRedesenhar) {
    if (!form) { return; }
    clearTimeout(form.timerTrava);
    if (form.raiz.parentNode) { form.raiz.parentNode.removeChild(form.raiz); }
    form = null;
    if (semRedesenhar) { return; }
    if (listaPendente) { var l = listaPendente; listaPendente = null; atualizar(l); }
    foco = 'grade';
    marcar();
  }

  function alternarTipo() {
    if (!form || !form.btnTipo) { return; }
    form.estado.kids = !form.estado.kids;
    form.textoTipo();
    form.previa();
  }

  function mensagemForm(t) { if (form) { form.msg.textContent = t || ''; } }

  function textoErro(e) {
    var m = String((e && e.message) || '');
    if (m === 'existe') { return 'Já existe um perfil com esse nome.'; }
    if (m === 'nome') { return 'Digite um nome para o perfil.'; }
    return 'Sem conexão com o servidor. Tente de novo.';
  }

  function aposSalvar(lista) {
    perfis = lista.slice(0);
    fecharForm(true);
    listaPendente = null;
    foco = 'grade';
    desenhar(null);
  }

  function salvarForm() {
    if (!form || form.estado.ocupado) { return; }
    var f = form;
    var nome = f.campo.value.trim();
    if (!nome) { mensagemForm('Digite um nome para o perfil.'); return; }
    f.estado.ocupado = true;
    mensagemForm('Salvando...');
    var op = f.estado.novo
      ? VLTV.nuvem.criarPerfil(nome, f.estado.kids)
      : (nome === f.estado.p.nome ? Promise.resolve(perfis) : VLTV.nuvem.renomearPerfil(f.estado.p, nome));
    op.then(function (lista) {
      if (form !== f) { return; }
      aposSalvar(lista);
    }).catch(function (e) {
      if (form !== f) { return; }
      f.estado.ocupado = false;
      mensagemForm(textoErro(e));
    });
  }

  function apagarForm() {
    if (!form || form.estado.ocupado || !form.btnApagar) { return; }
    var f = form;
    if (!f.estado.confirmaApagar) {
      f.estado.confirmaApagar = true;
      f.btnApagar.textContent = 'Confirmar: apagar "' + f.estado.p.nome + '"';
      return;
    }
    f.estado.ocupado = true;
    mensagemForm('Apagando...');
    VLTV.nuvem.apagarPerfil(f.estado.p).then(function (lista) {
      if (form !== f) { return; }
      aposSalvar(lista);
    }).catch(function (e) {
      if (form !== f) { return; }
      f.estado.ocupado = false;
      f.estado.confirmaApagar = false;
      f.btnApagar.textContent = 'Apagar perfil';
      mensagemForm(textoErro(e));
    });
  }

  function ativarCampoForm() {
    var f = form;
    var c = f.campos[f.i];
    if (c === f.campo) {
      if (c.hasAttribute('readonly')) { liberar(c); } else { terminarCampo(); }
    } else if (c === f.btnTipo) { alternarTipo(); }
    else if (c === f.btnSalvar) { salvarForm(); }
    else if (c === f.btnApagar) { apagarForm(); }
    else if (c === f.btnCancelar) { fecharForm(false); }
  }

  // Terminou de digitar: volta a ser só-leitura e vai para o próximo item.
  function terminarCampo() {
    travar(form.campo);
    form.i = Math.min(form.i + 1, form.campos.length - 1);
    marcarForm();
  }

  // Retorna true se a tecla foi tratada aqui; false deixa a tecla passar (digitação no campo de nome).
  function teclaForm(k) {
    var f = form;
    var digitando = document.activeElement === f.campo && !f.campo.hasAttribute('readonly');
    if (digitando) {
      if (k === TECLA.ENTER) { terminarCampo(); return true; }
      if (k === TECLA.VOLTAR || k === TECLA.ESC) { travar(f.campo); return true; }
      return false;
    }
    if (k === TECLA.CIMA) { if (f.i > 0) { f.i--; marcarForm(); } return true; }
    if (k === TECLA.BAIXO) { if (f.i < f.campos.length - 1) { f.i++; marcarForm(); } return true; }
    if ((k === TECLA.ESQ || k === TECLA.DIR) && f.campos[f.i] === f.btnTipo) { alternarTipo(); return true; }
    if (k === TECLA.ENTER) { ativarCampoForm(); return true; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { fecharForm(false); return true; }
    return true;
  }

  // ── Teclas ────────────────────────────────────────────────────────
  // true = a tecla foi tratada aqui (o app cancela o padrão); false = deixa passar (digitar o nome do perfil).
  function tecla(k) {
    if (form) { return teclaForm(k); }
    if (foco === 'gerenciar') {
      if (k === TECLA.CIMA) { foco = 'grade'; marcar(); return true; }
      if (k === TECLA.ENTER) { alternarGerenciar(); return true; }
    } else {
      if (k === TECLA.ESQ || k === TECLA.CIMA) { if (idx > 0) { idx--; marcar(); } return true; }
      if (k === TECLA.DIR) { if (idx < cartoes.length - 1) { idx++; marcar(); } return true; }
      if (k === TECLA.BAIXO) { foco = 'gerenciar'; marcar(); return true; }
      if (k === TECLA.ENTER) { ativar(idx); return true; }
    }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (gerenciando) { alternarGerenciar(); foco = 'grade'; marcar(); }
      else if (podeFechar()) { fechar(); }
      return true;
    }
    return true;
  }

  // O CSS do botão da Home também precisa estar na página antes da tela abrir.
  (function injetarCss() {
    var st = document.createElement('style');
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  VLTV.perfil = {
    abrir: abrir, abrirTroca: abrirTroca, atualizar: atualizar, fechar: fechar,
    aberto: aberto, tecla: tecla, avatar: avatar
  };
})();
