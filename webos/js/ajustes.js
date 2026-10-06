// VLTV Play - webOS | Configurações: informação geral, limpar cache e recarregar o app.
(function () {
  'use strict';

  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, CIMA: 38, BAIXO: 40 };
  var CH_CHAVE = 'vltv_chave_dispositivo';

  function $(id) { return document.getElementById(id); }

  var menu = $('cfg-menu');
  var titulo = $('cfg-titulo');
  var conteudo = $('cfg-conteudo');

  var ITENS = [
    { id: 'info', nome: 'Informação geral' },
    { id: 'cache', nome: 'Limpar cache' },
    { id: 'recarregar', nome: 'Atualizar o aplicativo' }
  ];

  var idx = 0;
  var lis = [];
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
      linha('Status', ativo ? 'Ativo' : 'Expirado', ativo ? 'ok' : 'erro');
      if (info.exp_date) {
        var quando = dataBr(info.exp_date);
        linha('Validade', quando + (dias !== null && dias >= 0 ? ' (' + dias + (dias === 1 ? ' dia' : ' dias') + ')' : ''));
      } else {
        linha('Validade', 'Sem vencimento');
      }
    } else if (sessao && sessao.modo === 'm3u') {
      linha('Status', 'Lista M3U', 'ok');
    } else {
      linha('Status', 'Ativo', 'ok');
    }

    if (sessao && sessao.user) { linha('Usuário', sessao.user); }
    linha('Endereço MAC', mac || 'Indisponível nesta TV');
    linha('Versão do produto', VLTV.config.VERSAO);
    linha('Logos dos títulos (TMDB)', VLTV.tmdb && VLTV.tmdb.ativo() ? 'Ativadas' : 'Chave não configurada no app', VLTV.tmdb && VLTV.tmdb.ativo() ? 'ok' : 'erro');
    linha('Chave do dispositivo', chaveDispositivo());
    if (VLTV.platform && VLTV.platform.descricao) { linha('Aparelho', VLTV.platform.descricao); }
  }

  function desenharDireita() {
    var item = ITENS[idx];
    titulo.textContent = item.nome;
    if (item.id === 'info') {
      esvaziar(conteudo);
      texto('Carregando...');
      lerMac(function () { if (ITENS[idx].id === 'info') { desenharInfo(); } });
    } else if (item.id === 'cache') {
      esvaziar(conteudo);
      texto('Apaga a lista de servidores guardada e os dados temporários. Seu login continua salvo. Pressione OK para limpar.');
    } else {
      esvaziar(conteudo);
      texto('Reinicia o aplicativo e carrega tudo de novo. Pressione OK para atualizar.');
    }
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

  function tecla(k) {
    if (k === TECLA.VOLTAR || k === TECLA.ESC) {
      if (acoes) { acoes.sair(); }
    } else if (k === TECLA.CIMA) {
      if (idx > 0) { idx--; marcar(); }
    } else if (k === TECLA.BAIXO) {
      if (idx < ITENS.length - 1) { idx++; marcar(); }
    } else if (k === TECLA.ENTER) {
      var id = ITENS[idx].id;
      if (id === 'cache') { limparCache(); }
      else if (id === 'recarregar') { recarregar(); }
    } else { return false; }
    return true;
  }

  function abrir(callbacks) {
    acoes = callbacks;
    idx = 0;
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

  VLTV.ajustes = { abrir: abrir, tecla: tecla };
})();
