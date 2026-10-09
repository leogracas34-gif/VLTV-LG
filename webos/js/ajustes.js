// VLTV Play - webOS | Configurações: informação geral, controle parental, limpar cache, atualizar e sobre o app.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40 };
  var CH_CHAVE = 'vltv_chave_dispositivo';

  function $(id) { return document.getElementById(id); }

  var menu = $('cfg-menu');
  var titulo = $('cfg-titulo');
  var conteudo = $('cfg-conteudo');

  var ITENS = [
    { id: 'info', nome: 'Informação geral' },
    { id: 'parental', nome: 'Controle parental' },
    { id: 'cache', nome: 'Limpar cache' },
    { id: 'recarregar', nome: 'Atualizar o aplicativo' },
    { id: 'sobre', nome: 'Sobre o aplicativo' }
  ];

  var idx = 0;
  var lis = [];
  var foco = 'menu';       // 'menu' (lista da esquerda) | 'dir' (opções do Controle parental)
  var dirIdx = 0;
  var dirItens = [];
  var acoes = null;
  var mac = '';
  var macCarregado = false;

  function esvaziar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  // ── Endereço MAC (serviço interno da LG; pode não estar liberado em todas as TVs) ──
  function lerMac(pronto) {
    if (macCarregado) { pronto(); return; }
    var terminou = false;
    function fim(valor) {
      if (terminou) { return; }
      terminou = true;
      mac = valor || '';
      macCarregado = true;
      pronto();
    }
    setTimeout(function () { fim(''); }, 3000);
    try {
      var ponte = new window.PalmServiceBridge();
      ponte.onservicecallback = function (msg) {
        try {
          var r = JSON.parse(msg);
          var m = (r.wiredInfo && r.wiredInfo.macAddress) || (r.wifiInfo && r.wifiInfo.macAddress) || '';
          fim(String(m).toUpperCase());
        } catch (e) { fim(''); }
      };
      ponte.call('luna://com.webos.service.connectionmanager/getinfo', '{}');
    } catch (e) { fim(''); }
  }

  // ── Chave do dispositivo: 6 dígitos estáveis (do MAC, ou sorteada e guardada) ──
  function chaveDispositivo() {
    var base = mac.replace(/[^0-9A-F]/g, '');
    var n;
    if (base) {
      n = 7;
      for (var i = 0; i < base.length; i++) { n = (n * 31 + base.charCodeAt(i)) % 1000000; }
    } else {
      try { n = parseInt(localStorage.getItem(CH_CHAVE), 10); } catch (e) { n = NaN; }
      if (isNaN(n)) {
        n = Math.floor(Math.random() * 900000) + 100000;
        try { localStorage.setItem(CH_CHAVE, String(n)); } catch (e2) { /* ignora */ }
      }
    }
    var t = ('00000' + n).slice(-6);
    return t.slice(0, 3) + ' ' + t.slice(3);
  }

  function dataBr(exp) {
    var n = parseInt(exp, 10);
    if (isNaN(n)) { return ''; }
    var d = new Date(n * 1000);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }

  function diasRestantes(exp) {
    var n = parseInt(exp, 10);
    if (isNaN(n)) { return null; }
    return Math.ceil((n * 1000 - new Date().getTime()) / 86400000);
  }

  // ── Telas da direita ──────────────────────────────────────────────
  function linha(rotulo, valor, classe) {
    var l = document.createElement('div');
    l.className = 'cfg-linha';
    var a = document.createElement('span');
    a.className = 'cfg-rotulo';
    a.textContent = rotulo;
    var b = document.createElement('span');
    b.className = 'cfg-valor' + (classe ? ' ' + classe : '');
    b.textContent = valor;
    l.appendChild(a);
    l.appendChild(b);
    conteudo.appendChild(l);
  }

  function texto(t) {
    var p = document.createElement('div');
    p.className = 'cfg-texto';
    p.textContent = t;
    conteudo.appendChild(p);
  }

  function desenharInfo() {
    esvaziar(conteudo);
    var info = VLTV.conta || null;
    var sessao = VLTV.sessao.ler();

    if (info && info.exp_date !== undefined) {
      var dias = diasRestantes(info.exp_date);
      var ativo = String(info.status || 'Active').toLowerCase() === 'active' && (dias === null || dias >= 0);
      linha('Canais, filmes e séries', ativo ? 'Ativo' : 'Expirado', ativo ? 'ok' : 'erro');
      if (info.exp_date) {
        var quando = dataBr(info.exp_date);
        linha('Plano de canais, filmes e séries vence em', quando + (dias !== null && dias >= 0 ? ' (' + dias + (dias === 1 ? ' dia' : ' dias') + ')' : ''));
      } else {
        linha('Plano de canais, filmes e séries vence em', 'Sem vencimento');
      }
    } else if (sessao && sessao.modo === 'm3u') {
      linha('Canais, filmes e séries', 'Lista M3U', 'ok');
    } else {
      linha('Canais, filmes e séries', 'Ativo', 'ok');
    }

    if (VLTV.parceiroNome) { linha('Parceiro', VLTV.parceiroNome); }
    if (sessao && sessao.user) { linha('Usuário', sessao.user); }
    linha('Endereço MAC', mac || 'Indisponível nesta TV');
    linha('Versão do produto', VLTV.config.VERSAO);
    linha('Chave do dispositivo', chaveDispositivo());
    if (VLTV.platform && VLTV.platform.descricao) { linha('Aparelho', VLTV.platform.descricao); }

    // Licença da TV (teste grátis ou ativa), logo abaixo do aparelho
    var lic = VLTV.licenca && VLTV.licenca.estado();
    if (lic) {
      linha('Código da TV (ativação)', lic.codigo);
      linha('Licença do aplicativo', VLTV.licenca.textoCurto(), lic.estado === 'active' ? 'ok' : '');
    }
  }

  function desenharDireita() {
    var item = ITENS[idx];
    titulo.textContent = item.nome;
    if (item.id === 'info') {
      esvaziar(conteudo);
      texto('Carregando...');
      lerMac(function () { if (ITENS[idx].id === 'info') { desenharInfo(); } });
    } else if (item.id === 'parental') {
      if (foco === 'dir') { desenharParental(); }
      else {
        esvaziar(conteudo);
        texto('Bloqueia canais, filmes e séries adultos (+18) com uma senha de 4 dígitos. A senha padrão é 0000: crie a sua e escolha uma pergunta secreta para recuperar. Pressione OK para abrir (pede a senha).');
      }
    } else if (item.id === 'cache') {
      desenharCache();
    } else if (item.id === 'recarregar') {
      desenharAtualizar();
    } else {
      desenharSobre();
    }
  }

  // ── Limpar cache ──
  function desenharCache() {
    esvaziar(conteudo);
    linha('O que será apagado', 'Lista de servidores, banner e logos guardados');
    linha('O que continua salvo', 'Login, favoritos e "continuar assistindo"');
    linha('Depois de limpar', 'O aplicativo reinicia sozinho');
    texto('Use quando algo estiver desatualizado ou lento. Pressione OK para limpar.');
  }

  // ── Atualizar o aplicativo ──
  function desenharAtualizar() {
    esvaziar(conteudo);
    linha('Versão instalada', VLTV.config.VERSAO);
    var lic = VLTV.licenca && VLTV.licenca.estado();
    if (lic) { linha('Licença do aplicativo', VLTV.licenca.textoCurto(), lic.estado === 'active' ? 'ok' : ''); }
    linha('Seu login e seus favoritos', 'Continuam salvos', 'ok');
    texto('Reinicia o aplicativo e carrega tudo de novo (lista, categorias e licença). Novas versões do aplicativo chegam pela loja de aplicativos da LG. Pressione OK para atualizar.');
  }

  // ── Sobre o aplicativo ──
  function desenharSobre() {
    esvaziar(conteudo);
    var cfg = VLTV.config;
    linha('Aplicativo', 'VLTV Play');
    linha('Tipo', 'Reprodutor de mídia');
    linha('Versão', cfg.VERSAO);
    var lic = VLTV.licenca && VLTV.licenca.estado();
    if (lic) {
      linha('Código da TV', lic.codigo);
      linha('Licença', VLTV.licenca.textoCurto(), lic.estado === 'active' ? 'ok' : '');
    }
    if (VLTV.platform && VLTV.platform.descricao) { linha('Aparelho', VLTV.platform.descricao); }
    if (cfg.SUPORTE) { linha('Suporte', cfg.SUPORTE); }
    texto('O VLTV Play é um reprodutor de mídia. Ele não inclui nenhum canal, filme, série ou lista: o conteúdo vem do serviço que você contratou por conta própria, e o aplicativo apenas reproduz.');
  }

  // ── Controle parental ─────────────────────────────────────────────
  function linhaOpcao(rotulo, valor, classe, selecionada) {
    var l = document.createElement('div');
    l.className = 'cfg-linha' + (selecionada ? ' sel' : '');
    var a = document.createElement('span');
    a.className = 'cfg-rotulo';
    a.textContent = rotulo;
    var b = document.createElement('span');
    b.className = 'cfg-valor' + (classe ? ' ' + classe : '');
    b.textContent = valor;
    l.appendChild(a);
    l.appendChild(b);
    conteudo.appendChild(l);
  }

  function desenharParental() {
    var P = VLTV.parental;
    dirItens = [
      {
        rotulo: 'Bloqueio de conteúdo adulto',
        valor: P.ativo() ? 'Ativado' : 'Desativado',
        classe: P.ativo() ? 'ok' : 'erro',
        acao: function () { P.definirAtivo(!P.ativo()); }
      },
      {
        rotulo: 'Conteúdo bloqueado',
        valor: P.modo() === 'ocultar' ? 'Ocultar' : 'Pedir senha',
        classe: '',
        acao: function () { P.definirModo(P.modo() === 'ocultar' ? 'senha' : 'ocultar'); }
      },
      {
        rotulo: 'Senha',
        valor: P.senhaPadrao() ? 'Padrão (0000) - alterar' : 'Personalizada - alterar',
        classe: P.senhaPadrao() ? 'erro' : 'ok',
        acao: criarNovaSenha
      },
      {
        rotulo: 'Pergunta secreta',
        valor: P.temPergunta() ? 'Definida - alterar' : 'Não definida - criar',
        classe: P.temPergunta() ? 'ok' : 'erro',
        acao: criarNovaSenha
      }
    ];
    if (dirIdx > dirItens.length - 1) { dirIdx = dirItens.length - 1; }
    esvaziar(conteudo);
    dirItens.forEach(function (it, i) { linhaOpcao(it.rotulo, it.valor, it.classe, i === dirIdx); });
    texto(P.senhaPadrao()
      ? 'Você ainda usa a senha padrão (0000). Crie a sua para proteger de verdade.'
      : 'Com o bloqueio ativado, categorias, canais e filmes adultos pedem a senha (ou ficam ocultos). Depois de digitada, a senha libera o conteúdo até voltar para a tela inicial.');
  }

  function criarNovaSenha() {
    VLTV.parental.criarSenha(function () { desenharParental(); }, function () { desenharParental(); });
  }

  function abrirParental() {
    VLTV.parental.pedirSenha(function () {
      foco = 'dir';
      dirIdx = 0;
      desenharParental();
    }, { titulo: 'Controle parental', sub: 'Digite a senha para abrir.', sempre: true });
  }

  function marcar() {
    lis.forEach(function (li, i) { li.classList.toggle('sel', i === idx); });
    desenharDireita();
  }

  // ── Ações ─────────────────────────────────────────────────────────
  // Apaga o que é só cópia (lista de DNS, banner, logos e o catálogo guardado na TV).
  // Favoritos, progresso e "continuar assistindo" NÃO são apagados.
  function limparCache() {
    try {
      var apagar = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k === 'vltv_dns_lista' || k === 'vltv_banner_cache' || k.indexOf('vltv_logo_') === 0)) { apagar.push(k); }
      }
      apagar.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignora */ }
    esvaziar(conteudo);
    texto('Limpando...');
    VLTV.armazem.limpar().then(function () {
      esvaziar(conteudo);
      texto('Cache limpo. Reiniciando o aplicativo...');
      setTimeout(function () { window.location.reload(); }, 900);
    });
  }

  function recarregar() {
    esvaziar(conteudo);
    texto('Atualizando...');
    setTimeout(function () { window.location.reload(); }, 400);
  }

  function teclaDireita(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC || k === TECLA.ESQ) {
      foco = 'menu';
      desenharDireita();
    } else if (k === TECLA.CIMA) {
      if (dirIdx > 0) { dirIdx--; desenharParental(); }
    } else if (k === TECLA.BAIXO) {
      if (dirIdx < dirItens.length - 1) { dirIdx++; desenharParental(); }
    } else if (k === TECLA.ENTER) {
      var it = dirItens[dirIdx];
      if (it) { it.acao(); desenharParental(); }
    } else { return false; }
    return true;
  }

  function tecla(k) {
    if (foco === 'dir') { return teclaDireita(k); }
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (acoes) { acoes.sair(); }
    } else if (k === TECLA.CIMA) {
      if (idx > 0) { idx--; marcar(); }
    } else if (k === TECLA.BAIXO) {
      if (idx < ITENS.length - 1) { idx++; marcar(); }
    } else if (k === TECLA.ENTER || k === TECLA.DIR) {
      var id = ITENS[idx].id;
      if (id === 'parental') { abrirParental(); }
      else if (k === TECLA.DIR) { return true; }
      else if (id === 'cache') { limparCache(); }
      else if (id === 'recarregar') { recarregar(); }
    } else { return false; }
    return true;
  }

  function abrir(callbacks) {
    acoes = callbacks;
    idx = 0;
    foco = 'menu';
    esvaziar(menu);
    lis = ITENS.map(function (item) {
      var li = document.createElement('li');
      var nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = item.nome;
      li.appendChild(nome);
      menu.appendChild(li);
      return li;
    });
    marcar();
  }

  // ── Cursor do controle (Magic Remote) ────────────────────────────
  // Passar o cursor destaca o item (igual às setas) e o clique faz o mesmo que o OK.
  // Só reage se o cursor andou de verdade: a lista rolando sozinha embaixo dele não muda a seleção.
  function cursorAndou(e) { return VLTV.cursor.andou(e); }
  // Acha o filho direto de "pai" que contém o elemento tocado.
  function filhoDe(pai, el) {
    while (el && el.parentNode !== pai) { el = el.parentNode; }
    return el || null;
  }
  function dentroDe(el, classe, limite) {
    while (el && el !== limite) {
      if (el.classList && el.classList.contains(classe)) { return true; }
      el = el.parentNode;
    }
    return false;
  }

  function indiceMenu(e) {
    var li = filhoDe(menu, e.target);
    return li ? lis.indexOf(li) : -1;
  }

  // Linha de opção do Controle parental sob o cursor (só vale com a janela da direita aberta).
  function indiceOpcao(e) {
    if (foco !== 'dir') { return -1; }
    var l = filhoDe(conteudo, e.target);
    if (!l || !l.classList.contains('cfg-linha')) { return -1; }
    var i = Array.prototype.indexOf.call(conteudo.children, l);
    return i < dirItens.length ? i : -1;
  }

  menu.addEventListener('mousemove', function (e) {
    if (!cursorAndou(e)) { return; }
    var i = indiceMenu(e);
    if (i < 0 || (i === idx && foco === 'menu')) { return; }
    idx = i;
    foco = 'menu';
    marcar();
  });
  menu.addEventListener('click', function (e) {
    var i = indiceMenu(e);
    if (i < 0) { return; }
    idx = i;
    foco = 'menu';
    marcar();
    tecla(TECLA.ENTER);       // mesmo efeito do OK no item
  });

  conteudo.addEventListener('mousemove', function (e) {
    if (!cursorAndou(e)) { return; }
    var i = indiceOpcao(e);
    if (i < 0 || i === dirIdx) { return; }
    dirIdx = i;
    desenharParental();
  });
  conteudo.addEventListener('click', function (e) {
    var i = indiceOpcao(e);
    if (i >= 0) {
      dirIdx = i;
      teclaDireita(TECLA.ENTER);
    } else if (foco === 'menu' && ITENS[idx].id === 'parental') {
      abrirParental();        // clicar no texto do Controle parental também pede a senha
    }
  });

  VLTV.ajustes = { abrir: abrir, tecla: tecla };
})();
