// VLTV Play - webOS | Perfis: tela "Quem está assistindo?" (tela cheia), menu suspenso da Home (estilo Netflix),
// criar, editar e apagar perfis.
// Os perfis são os mesmos do celular (a nuvem do VLTV guarda a lista). Perfil infantil tem avatar colorido fixo.
// Avatares dos outros perfis: os bichinhos originais do VLTV (js/avatares.js), sem nenhum personagem de filme ou desenho:
// não dá problema de direitos autorais na LG, na Samsung nem na Google Play.
// Sair do perfil infantil pede a senha dos pais (controle parental).
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
  var menu = null;            // menu suspenso da Home aberto: { fundo, caixa, itens, idx, perfis, depois }

  // ── Visual (injetado aqui para não mexer em outros arquivos) ──────
  var CSS = '' +
    '#aviso-perfil{position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 30%,#1d1d26 0%,#0b0b0e 72%);font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0,"calt" 0;text-rendering:optimizeSpeed;}' +
    '#aviso-perfil *{font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0,"calt" 0;}' +
    '#aviso-perfil.escondida{display:none;}' +
    '#aviso-perfil h2{font-size:60px;font-weight:700;color:#f5f5f7;margin:0 0 64px;letter-spacing:1px;}' +
    '#aviso-perfil .perfil-lista{display:flex;flex-wrap:wrap;justify-content:center;max-width:1750px;}' +
    '#aviso-perfil .perfil-card{display:flex;flex-direction:column;align-items:center;width:230px;margin:0 14px 24px;padding:20px 0 16px;' +
    'background:transparent;border:0;border-radius:22px;color:#9c9ca8;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;outline:none;' +
    '}' +
    /* avatar: quadrado de cantos redondos (como na Netflix) */
    '.perfil-avatar,.perfil-mini{position:relative;border-radius:18%;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'font-weight:700;color:#fff;box-sizing:border-box;flex:none;background-origin:border-box;text-shadow:0 3px 10px rgba(0,0,0,.28);}' +
    '#aviso-perfil .perfil-avatar{width:168px;height:168px;font-size:80px;border:6px solid rgba(255,255,255,0.08);}' +
    '.perfil-avatar img,.perfil-mini img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;}' +
    '#aviso-perfil .perfil-nome{margin-top:20px;font-size:34px;font-weight:700;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '#aviso-perfil .perfil-tag{margin-top:4px;height:28px;font-size:23px;color:#9c9ca8;}' +
    '#aviso-perfil .perfil-card.foco{color:#fff;}' +
    '#aviso-perfil .perfil-card.foco .perfil-avatar{border-color:#fff;}' +
    '#aviso-perfil .perfil-card.foco .perfil-nome{color:#fff;}' +
    '#aviso-perfil .perfil-mais{width:168px;height:168px;border-radius:18%;border:6px dashed #4a4a55;display:flex;align-items:center;justify-content:center;font-size:90px;color:#9c9ca8;box-sizing:border-box;}' +
    '#aviso-perfil .perfil-card.foco .perfil-mais{border-style:solid;border-color:#fff;color:#fff;}' +
    '#aviso-perfil .perfil-lapis{position:absolute;right:2px;bottom:2px;width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.72);border:3px solid #fff;font-size:30px;display:flex;align-items:center;justify-content:center;}' +
    '#aviso-perfil .perfil-gerenciar{margin-top:30px;padding:12px 40px;font-size:28px;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;color:#9c9ca8;background:transparent;border:2px solid #4a4a55;border-radius:14px;outline:none;}' +
    '#aviso-perfil .perfil-gerenciar.foco{color:#fff;border-color:#fff;background:rgba(255,255,255,.14);}' +
    '#aviso-perfil .aviso-sub{position:absolute;bottom:50px;left:0;right:0;text-align:center;font-size:27px;color:#9c9ca8;margin:0;}' +
    /* formulário */
    '#aviso-perfil .perfil-form{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 35%,#1b1b22 0%,#0a0a0c 70%);}' +
    '#aviso-perfil .perfil-form h3{font-size:52px;color:#f5f5f7;margin:0 0 22px;}' +
    '#aviso-perfil .perfil-form .perfil-avatar{width:140px;height:140px;font-size:70px;margin-bottom:18px;}' +
    '#aviso-perfil .pf-campo{width:760px;height:78px;margin:8px 0;font-size:34px;font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;font-weight:700;color:#fff;background:#1f1f23;border:3px solid #2e2e34;border-radius:14px;outline:none;box-sizing:border-box;padding:0 28px;text-align:center;}' +
    '#aviso-perfil .pf-campo.foco{border-color:#fff;background:#2a2a30;}' +
    '#aviso-perfil .pf-campo.salvar{background:#e50914;border-color:#e50914;}' +
    '#aviso-perfil .pf-campo.salvar.foco{border-color:#fff;background:#ff4b55;}' +
    '#aviso-perfil .pf-campo.apagar{color:#ff8a92;}' +
    /* faixa com os avatares para escolher */
    '#aviso-perfil .pf-campo.pf-faixa{width:1260px;height:112px;padding:0;display:flex;align-items:center;justify-content:center;}' +
    '#aviso-perfil .pf-av{position:relative;width:78px;height:78px;margin:0 7px;border-radius:18%;overflow:hidden;border:4px solid transparent;box-sizing:border-box;opacity:.55;flex:none;}' +
    '#aviso-perfil .pf-av img{position:absolute;top:0;left:0;width:100%;height:100%;}' +
    '#aviso-perfil .pf-av.sel{opacity:1;border-color:#fff;-webkit-transform:scale(1.18);transform:scale(1.18);}' +
    '#aviso-perfil .pf-seta{display:inline-block;width:0;height:0;border-top:11px solid transparent;border-bottom:11px solid transparent;vertical-align:middle;}' +
    '#aviso-perfil .pf-seta.e{border-right:16px solid currentColor;margin-right:22px;}' +
    '#aviso-perfil .pf-seta.d{border-left:16px solid currentColor;margin-left:22px;}' +
    '#aviso-perfil .pf-msg{height:36px;margin-top:6px;font-size:26px;color:#ff8a92;}' +
    /* botão de perfil no canto de cima da Home (ao lado da engrenagem): só o avatar. A seta aparece com o foco, como na Netflix. */
    '.topo-direita .btn-perfil{position:relative;display:inline-flex;align-items:center;justify-content:center;height:76px;margin-right:14px;padding:0 4px 0 6px;box-sizing:border-box;' +
    'background:transparent;border:0;color:#fff;outline:none;}' +
    '.btn-perfil .perfil-mini{width:68px;height:68px;margin:0;border:4px solid transparent;}' +
    '.btn-perfil .perfil-seta{width:28px;height:28px;margin-left:6px;opacity:0;fill:currentColor;-webkit-transition:opacity .15s ease,-webkit-transform .15s ease;transition:opacity .15s ease,transform .15s ease;}' +
    '.topo-direita .btn-perfil:focus .perfil-mini,.topo-direita .btn-perfil:hover .perfil-mini{border-color:#fff;box-shadow:0 0 0 8px rgba(var(--destaque-rgb),.5);}' +
    '.topo-direita .btn-perfil:focus .perfil-seta,.topo-direita .btn-perfil:hover .perfil-seta,.topo-direita .btn-perfil.aberto .perfil-seta{opacity:1;}' +
    '.topo-direita .btn-perfil.aberto .perfil-seta{-webkit-transform:rotate(180deg);transform:rotate(180deg);}' +
    /* menu suspenso com os perfis */
    '#menu-perfil-fundo{position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;}' +
    '#menu-perfil{position:fixed;top:128px;right:60px;width:480px;padding:14px 0;border-radius:20px;background:#101016;border:2px solid #34343e;' +
    'box-shadow:0 24px 64px rgba(0,0,0,.7);font-family:"Plus Jakarta Sans","LG Smart UI",Arial,sans-serif;font-variant-ligatures:none;}' +
    '#menu-perfil .mp-item{display:flex;align-items:center;width:456px;height:84px;margin:0 12px;padding:0 20px;border-radius:14px;border:0;background:transparent;' +
    'color:#d2d2dc;font-size:32px;font-weight:700;text-align:left;outline:none;font-family:inherit;}' +
    '#menu-perfil .mp-item.foco{background:#fff;color:#0a0a0c;}' +
    '#menu-perfil .mp-item .perfil-mini{width:58px;height:58px;margin-right:22px;}' +
    '#menu-perfil .mp-nome{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '#menu-perfil .mp-tag{margin-left:12px;font-size:22px;font-weight:500;color:#9c9ca8;}' +
    '#menu-perfil .mp-item.foco .mp-tag{color:#555560;}' +
    '#menu-perfil .mp-sep{height:2px;margin:8px 24px;background:#2e2e34;}' +
    '#menu-perfil .mp-ic{display:flex;align-items:center;justify-content:center;width:58px;height:58px;margin-right:22px;font-size:34px;}' +
    /* mini avatar */
    '.perfil-mini{width:58px;height:58px;font-size:30px;vertical-align:middle;display:inline-flex;}';

  // ── Avatares ──────────────────────────────────────────────────────
  // Avatares próprios do VLTV (bichinhos originais, em js/avatares.js). O perfil guarda "vltv:<id>" no campo imagem.
  // Perfil sem escolha (ou que veio do celular com o nome de um avatar antigo) mostra um bichinho que sai do id do perfil.
  // Se o js/avatares.js não carregar, cai nas cores abaixo (só para o app nunca ficar sem avatar).
  var ESTILOS = [
    { id: 'aurora',   fundo: 'radial-gradient(circle at 22% 18%,rgba(255,255,255,.38),rgba(255,255,255,0) 46%),linear-gradient(135deg,#7f5af0,#2cb1ff)' },
    { id: 'por-do-sol', fundo: 'radial-gradient(circle at 50% 112%,#ffd166 0,#ffd166 36%,rgba(255,209,102,0) 37%),linear-gradient(170deg,#ff7e5f,#c94b9c)' },
    { id: 'oceano',   fundo: 'linear-gradient(160deg,#00c6ff,#0072ff)' },
    { id: 'floresta', fundo: 'linear-gradient(150deg,#56ab2f,#0b6e4f)' },
    { id: 'fogo',     fundo: 'linear-gradient(160deg,#ff512f,#dd2476)' },
    { id: 'ouro',     fundo: 'linear-gradient(145deg,#f6d365,#e08a1e)' }
  ];

  function temAvatares() { return !!(VLTV.avatares && VLTV.avatares.lista && VLTV.avatares.lista.length > 0); }

  function estiloFallback(p) {
    var h = 0, t = String(p.id || p.nome || '');
    for (var j = 0; j < t.length; j++) { h = (h * 31 + t.charCodeAt(j)) % 9973; }
    return h % ESTILOS.length;
  }

  var cacheUri = {};
  function uriAvatar(i) {
    if (!cacheUri[i]) { cacheUri[i] = VLTV.avatares.uri(i); }
    return cacheUri[i];
  }

  function idDoAvatar(i) { return 'vltv:' + VLTV.avatares.lista[i].id; }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) { e.className = classe; }
    if (texto !== undefined) { e.textContent = texto; }
    return e;
  }

  // Avatar. mini = true: versão pequena (botão e menu da Home).
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
    if (temAvatares()) {
      var a = document.createElement('img');
      a.alt = '';
      a.src = uriAvatar(VLTV.avatares.indiceDoPerfil(p));
      av.appendChild(a);
    } else {
      av.style.backgroundImage = ESTILOS[estiloFallback(p)].fundo;
      av.appendChild(document.createTextNode(String(p.nome || '?').replace(/^\s+/, '').charAt(0).toUpperCase() || '?'));
    }
    if (/^(https?:|data:image)/i.test(String(p.imagem || ''))) {
      var im = document.createElement('img');
      im.alt = '';
      im.onerror = function () { if (im.parentNode) { im.parentNode.removeChild(im); } };
      im.src = p.imagem;
      av.appendChild(im);
    }
    return av;
  }

  // ── Trava dos pais ────────────────────────────────────────────────
  // Quem está no perfil infantil só sai dele com a senha do controle parental. Se a senha ainda é a de fábrica (0000),
  // pede para criar uma nova antes (senão qualquer criança que viu "0000" uma vez sairia do perfil).
  function emPerfilInfantil() {
    var p = VLTV.dados && VLTV.dados.perfilAtual ? VLTV.dados.perfilAtual() : null;
    return !!(p && p.kids === true);
  }

  function comTrava(pronto, cancelar) {
    var P = VLTV.parental;
    if (!emPerfilInfantil() || !P) { pronto(); return; }
    var seguir = function () { try { P.travar(); } catch (e) { /* ignora */ } pronto(); };
    if (P.senhaPadrao()) { P.criarSenha(seguir, cancelar); return; }
    P.pedirSenha(seguir, { titulo: 'Sair do perfil infantil', sub: 'Digite a senha dos pais.', sempre: true, cancelar: cancelar });
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

  function telaAberta() { return !!caixa && !caixa.classList.contains('escondida'); }
  function menuAberto() { return !!menu; }
  function aberto() { return telaAberta() || menuAberto(); }

  function fecharTela() {
    if (!telaAberta()) { return; }
    fecharForm(true);
    caixa.classList.add('escondida');
    var f = aoFechar;
    aoFechar = null;
    if (f) { try { f(); } catch (e) { /* ignora */ } }
  }

  function fechar() {
    if (menuAberto()) { fecharMenu(); }
    fecharTela();
  }

  function podeFechar() { return trocandoFlag || !!VLTV.dados.perfilAtual(); }

  // ── Grade de perfis ───────────────────────────────────────────────
  function marcar() {
    cartoes.forEach(function (b, i) { b.classList.toggle('foco', foco === 'grade' && i === idx); });
    elGerenciar.classList.toggle('foco', foco === 'gerenciar');
    var alvo = foco === 'gerenciar' ? elGerenciar : cartoes[idx];
    if (alvo) { try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); } }
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
    fecharTela();
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
    if (menuAberto()) { fecharMenu(true); }
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

  function assinatura(l) { return l.map(function (p) { return p.id + '|' + p.nome + '|' + (p.kids ? 1 : 0) + '|' + (p.imagem || ''); }).join(';'); }

  // A lista chegou da nuvem com a tela já aberta (mostrada com a lista guardada na TV): redesenha sem perder o item marcado.
  function atualizar(lista) {
    if (!lista || lista.length === 0) { return; }
    if (menuAberto()) { atualizarMenu(lista); }
    if (!telaAberta()) { return; }
    if (form) { listaPendente = lista; return; }   // não mexe na tela enquanto o formulário está aberto
    if (assinatura(lista) === assinatura(perfis)) { return; }
    var sel = perfis[idx] ? perfis[idx].id : null;
    perfis = lista.slice(0);
    desenhar(sel);
  }

  // Abre pela Configurações: mostra já a lista guardada na TV e corrige com a da nuvem por trás.
  // Quem está no perfil infantil precisa da senha dos pais.
  function abrirTroca(depois) {
    comTrava(function () {
      var guardada = VLTV.nuvem.listaGuardada();
      if (guardada.length > 0) {
        abrir(guardada, true, depois);
        VLTV.nuvem.listarPerfis().then(atualizar).catch(function () { /* sem internet: fica a lista guardada */ });
        return;
      }
      VLTV.nuvem.listarPerfis().then(function (lista) {
        abrir(lista.length > 0 ? lista : VLTV.nuvem.padroes(), true, depois);
      }).catch(function () { /* sem internet e sem lista guardada: não abre */ });
    }, depois);
  }

  // ── Menu suspenso da Home (avatar + seta, como na Netflix) ───────────
  function btnPerfilHome() { return document.getElementById('btn-perfil'); }

  function marcarMenu() {
    if (!menu) { return; }
    menu.itens.forEach(function (it, i) { it.el.classList.toggle('foco', i === menu.idx); });
    var alvo = menu.itens[menu.idx];
    if (alvo) { try { alvo.el.focus({ preventScroll: true }); } catch (e) { alvo.el.focus(); } }
  }

  function desenharMenu(selecionado) {
    while (menu.caixa.firstChild) { menu.caixa.removeChild(menu.caixa.firstChild); }
    menu.itens = [];
    var atual = VLTV.dados.perfilAtual();
    var sel = 0;
    menu.perfis.forEach(function (p, i) {
      var b = el('button', 'mp-item');
      b.type = 'button';
      b.appendChild(avatar(p, true));
      b.appendChild(el('span', 'mp-nome', p.nome));
      if (atual && atual.id === p.id) { b.appendChild(el('span', 'mp-tag', 'Atual')); }
      menu.caixa.appendChild(b);
      menu.itens.push({ el: b, perfil: p });
      if (selecionado ? selecionado === p.id : (atual && atual.id === p.id)) { sel = i; }
    });
    menu.caixa.appendChild(el('div', 'mp-sep'));
    var g = el('button', 'mp-item');
    g.type = 'button';
    g.appendChild(el('span', 'mp-ic', '✎'));
    g.appendChild(el('span', 'mp-nome', 'Gerenciar perfis'));
    menu.caixa.appendChild(g);
    menu.itens.push({ el: g, gerenciar: true });
    menu.itens.forEach(function (it, i) {
      it.el.addEventListener('click', function () { menu.idx = i; marcarMenu(); ativarMenu(i); });
      it.el.addEventListener('mousemove', function (e) {
        if (VLTV.cursor && VLTV.cursor.andou && !VLTV.cursor.andou(e)) { return; }
        if (menu && menu.idx !== i) { menu.idx = i; marcarMenu(); }
      });
    });
    menu.idx = Math.min(sel, menu.itens.length - 1);
    marcarMenu();
  }

  function atualizarMenu(lista) {
    if (!menu || assinatura(lista) === assinatura(menu.perfis)) { return; }
    var it = menu.itens[menu.idx];
    var sel = it && it.perfil ? it.perfil.id : null;
    menu.perfis = lista.slice(0);
    desenharMenu(sel);
  }

  function abrirMenu(depois) {
    if (aberto()) { return; }
    comTrava(function () {
      var lista = VLTV.nuvem.listaGuardada();
      if (lista.length === 0) { lista = VLTV.nuvem.padroes(); }
      montarMenu(lista, depois);
      VLTV.nuvem.listarPerfis().then(atualizar).catch(function () { /* sem internet: fica a lista guardada */ });
    }, depois);
  }

  function montarMenu(lista, depois) {
    var fundo = el('div');
    fundo.id = 'menu-perfil-fundo';
    var cx = el('div');
    cx.id = 'menu-perfil';
    cx.setAttribute('role', 'menu');
    fundo.appendChild(cx);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) { fecharMenu(); } });
    document.body.appendChild(fundo);
    menu = { fundo: fundo, caixa: cx, itens: [], idx: 0, perfis: lista.slice(0), depois: depois || null };
    var b = btnPerfilHome();
    if (b) { b.classList.add('aberto'); }
    desenharMenu(null);
  }

  // semCallback = true: abriu outra coisa por cima (não devolve o foco ao botão).
  function fecharMenu(semCallback) {
    if (!menu) { return; }
    var m = menu;
    menu = null;
    if (m.fundo.parentNode) { m.fundo.parentNode.removeChild(m.fundo); }
    var b = btnPerfilHome();
    if (b) { b.classList.remove('aberto'); }
    if (!semCallback && m.depois) { try { m.depois(); } catch (e) { /* ignora */ } }
  }

  function ativarMenu(i) {
    var it = menu && menu.itens[i];
    if (!it) { return; }
    if (it.gerenciar) {
      var lista = menu.perfis.slice(0);
      var depois = menu.depois;
      fecharMenu(true);
      abrir(lista, true, depois);
      gerenciando = true;
      desenhar(null);
      foco = 'grade';
      marcar();
      return;
    }
    var atual = VLTV.dados.perfilAtual();
    if (atual && atual.id === it.perfil.id) { fecharMenu(); return; }
    if (it.perfil.kids === true) { animarInfantil(); }
    VLTV.nuvem.escolherPerfil(it.perfil);
    fecharMenu();
  }

  function teclaMenu(k) {
    if (k === TECLA.CIMA) { if (menu.idx > 0) { menu.idx--; marcarMenu(); } return true; }
    if (k === TECLA.BAIXO) { if (menu.idx < menu.itens.length - 1) { menu.idx++; marcarMenu(); } return true; }
    if (k === TECLA.ENTER) { ativarMenu(menu.idx); return true; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { fecharMenu(); return true; }
    return true;
  }

  // ── Formulário (criar / editar) ───────────────────────────────────
  function liberar(e) { e.removeAttribute('readonly'); e.blur(); e.focus(); }
  function travar(e) { e.setAttribute('readonly', 'readonly'); }

  // Primeiro bichinho que ainda não é de nenhum perfil (assim cada perfil novo nasce com um avatar diferente).
  function avatarLivre() {
    var total = VLTV.avatares.lista.length;
    var usados = {};
    perfis.forEach(function (p) { if (!p.kids) { usados[VLTV.avatares.indiceDoPerfil(p)] = true; } });
    for (var i = 0; i < total; i++) { if (!usados[i]) { return i; } }
    return 0;
  }

  function abrirForm(p) {
    var novo = !p;
    var comAv = temAvatares();
    var estado = { p: p, novo: novo, kids: novo ? false : p.kids === true, ocupado: false, confirmaApagar: false, av: 0 };
    if (comAv) { estado.av = novo ? avatarLivre() : VLTV.avatares.indiceDoPerfil(p); }
    var imagemOriginal = novo ? '' : String(p.imagem || '');
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
    var faixa = null;
    var thumbs = [];
    if (comAv) {
      faixa = el('div', 'pf-campo pf-faixa');
      VLTV.avatares.lista.forEach(function (a, i) {
        var t = el('div', 'pf-av');
        var im = document.createElement('img');
        im.alt = '';
        im.src = uriAvatar(i);
        t.appendChild(im);
        t.addEventListener('click', function () { if (form) { estado.av = i; form.i = form.campos.indexOf(faixa); marcarForm(); atualizarAvatar(); } });
        faixa.appendChild(t);
        thumbs.push(t);
      });
      campos.push(faixa);
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

    function imagemEscolhida() {
      return (comAv && !estado.kids) ? idDoAvatar(estado.av) : (novo ? '' : imagemOriginal);
    }
    function previa() {
      while (avBox.firstChild) { avBox.removeChild(avBox.firstChild); }
      var nome = campo.value.trim() || (novo ? '?' : p.nome);
      avBox.appendChild(avatar({ id: novo ? nome : p.id, nome: nome, kids: estado.kids, imagem: imagemEscolhida() }, false));
    }
    function atualizarAvatar() {
      thumbs.forEach(function (t, i) { t.classList.toggle('sel', i === estado.av); });
      previa();
    }
    function textoTipo() {
      if (!btnTipo) { return; }
      while (btnTipo.firstChild) { btnTipo.removeChild(btnTipo.firstChild); }
      btnTipo.appendChild(el('span', 'pf-seta e'));
      btnTipo.appendChild(document.createTextNode('Tipo: ' + (estado.kids ? 'Infantil (só conteúdo infantil)' : 'Normal')));
      btnTipo.appendChild(el('span', 'pf-seta d'));
      if (faixa) { faixa.style.display = estado.kids ? 'none' : 'flex'; }   // infantil tem avatar fixo
    }

    raiz.appendChild(tit);
    raiz.appendChild(avBox);
    campos.forEach(function (c) { raiz.appendChild(c); });
    raiz.appendChild(msg);
    caixa.appendChild(raiz);

    form = { raiz: raiz, campos: campos, i: 0, estado: estado, campo: campo, btnTipo: btnTipo, faixa: faixa, btnSalvar: btnSalvar, btnApagar: btnApagar, btnCancelar: btnCancelar,
      msg: msg, previa: previa, textoTipo: textoTipo, atualizarAvatar: atualizarAvatar, imagemEscolhida: imagemEscolhida, imagemOriginal: imagemOriginal };
    if (faixa && estado.kids) { faixa.style.display = 'none'; }
    atualizarAvatar();
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
    form.atualizarAvatar();
  }

  function mudarAvatar(passo) {
    if (!form || !form.faixa) { return; }
    var total = VLTV.avatares.lista.length;
    form.estado.av = (form.estado.av + passo + total) % total;
    form.atualizarAvatar();
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
    var comAv = !!f.faixa && !f.estado.kids;
    var imagem = comAv ? f.imagemEscolhida() : undefined;   // undefined = mantém a imagem que o perfil já tem
    var op;
    if (f.estado.novo) {
      op = VLTV.nuvem.criarPerfil(nome, f.estado.kids, imagem);
    } else if (nome === f.estado.p.nome && (!comAv || imagem === f.imagemOriginal)) {
      op = Promise.resolve(perfis);
    } else {
      op = VLTV.nuvem.renomearPerfil(f.estado.p, nome, imagem);
    }
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
    else if (c === f.faixa) { mudarAvatar(1); }
    else if (c === f.btnSalvar) { salvarForm(); }
    else if (c === f.btnApagar) { apagarForm(); }
    else if (c === f.btnCancelar) { fecharForm(false); }
  }

  // Anda para o campo de cima (-1) ou de baixo (+1), pulando o que está escondido (avatares do perfil infantil).
  function andarForm(passo) {
    var f = form;
    var j = f.i + passo;
    while (j >= 0 && j < f.campos.length && f.campos[j].style.display === 'none') { j += passo; }
    if (j >= 0 && j < f.campos.length) { f.i = j; }
    marcarForm();
  }

  // Terminou de digitar: volta a ser só-leitura e vai para o próximo item.
  function terminarCampo() {
    travar(form.campo);
    andarForm(1);
  }

  // Retorna true se a tecla foi tratada aqui; false deixa a tecla passar (digitação no campo de nome).
  function teclaForm(k) {
    var f = form;
    var digitando = document.activeElement === f.campo && !f.campo.hasAttribute('readonly');
    if (digitando) {
      if (k === TECLA.ENTER) { terminarCampo(); return true; }
      if (k === TECLA.VOLTAR || k === TECLA.ESC) { travar(f.campo); return true; }
      // CIMA/BAIXO chegando aqui significa que o teclado da TV já fechou (Voltar fecha sem avisar a página): sai do campo e anda.
      if (k === TECLA.CIMA || k === TECLA.BAIXO) {
        travar(f.campo);
        andarForm(k === TECLA.CIMA ? -1 : 1);
        return true;
      }
      return false;
    }
    if (k === TECLA.CIMA) { andarForm(-1); return true; }
    if (k === TECLA.BAIXO) { andarForm(1); return true; }
    if ((k === TECLA.ESQ || k === TECLA.DIR) && f.campos[f.i] === f.btnTipo) { alternarTipo(); return true; }
    if ((k === TECLA.ESQ || k === TECLA.DIR) && f.campos[f.i] === f.faixa) { mudarAvatar(k === TECLA.ESQ ? -1 : 1); return true; }
    if (k === TECLA.ENTER) { ativarCampoForm(); return true; }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) { fecharForm(false); return true; }
    return true;
  }

  // ── Teclas ────────────────────────────────────────────────────────
  // true = a tecla foi tratada aqui (o app cancela o padrão); false = deixa passar (digitar o nome do perfil).
  function tecla(k) {
    if (menu) { return teclaMenu(k); }
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
      else if (podeFechar()) { fecharTela(); }
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
    abrir: abrir, abrirTroca: abrirTroca, abrirMenu: abrirMenu, atualizar: atualizar, fechar: fechar,
    aberto: aberto, tecla: tecla, avatar: avatar
  };
})();
