// VLTV Play - webOS | Telas e navegação por controle remoto (login, catálogo, detalhes e player).
(function () {
  'use strict';

  var TECLA_VOLTAR_WEBOS = 461;
  var TECLA_ESC = 27;
  var TECLA_ESQ = 37;
  var TECLA_CIMA = 38;
  var TECLA_DIR = 39;
  var TECLA_BAIXO = 40;

  function $(id) { return document.getElementById(id); }

  var telas = {
    carregando: $('tela-carregando'),
    incompativel: $('tela-incompativel'),
    login: $('tela-login'),
    home: $('tela-home'),
    config: $('tela-config'),
    live: $('tela-live'),
    catalogo: $('tela-catalogo'),
    detalhes: $('tela-detalhes'),
    player: $('tela-player')
  };
  var telaAtual = 'carregando';

  var abas = [].slice.call(document.querySelectorAll('.aba'));
  var grupos = [].slice.call(document.querySelectorAll('#tela-login .campo'));
  var campoCodigo = $('campo-codigo');
  var campoServidor = $('campo-servidor');
  var campoUsuario = $('campo-usuario');
  var campoSenha = $('campo-senha');
  var campoM3u = $('campo-m3u');
  var btnEntrar = $('btn-entrar');
  var statusLogin = $('login-status');
  var tileLive = $('tile-live');
  var tileFilmes = $('tile-filmes');
  var tileSeries = $('tile-series');
  var tileSair = $('btn-sair');
  var btnConfig = $('btn-config');
  var elBanner = $('banner');
  var elHora = $('home-hora');
  var ultimoTile = tileLive;

  var modoAtual = 'usuario';
  var nomeParceiro = '';
  var entrando = false;

  // ── Telas ─────────────────────────────────────────────────────────
  function mostrarTela(nome) {
    Object.keys(telas).forEach(function (n) {
      telas[n].classList.toggle('escondida', n !== nome);
    });
    telaAtual = nome;

    if (nome === 'login') {
      var lista = focaveis();
      (lista[1] || lista[0]).focus();
    }
    if (nome === 'home') { VLTV.banner.iniciar(); } else { VLTV.banner.parar(); }
    if (nome === 'home') {
      atualizarHora();
      if (ultimoTile.disabled) {
        ultimoTile = [tileLive, tileFilmes, tileSeries].filter(function (t) { return !t.disabled; })[0] || tileSair;
      }
      ultimoTile.focus();
    }
  }

  function mensagemLogin(texto, tipo) {
    statusLogin.textContent = texto || '';
    statusLogin.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  // Mostra só os campos do modo escolhido (Usuário, Parceiro, Xtream ou M3U).
  function definirModo(modo) {
    modoAtual = modo;
    abas.forEach(function (a) {
      a.classList.toggle('ativa', a.getAttribute('data-modo') === modo);
    });
    grupos.forEach(function (g) {
      var modos = g.getAttribute('data-modos').split(' ');
      g.classList.toggle('escondida', modos.indexOf(modo) === -1);
    });
    mensagemLogin('', '');
  }

  function dataVencimento(expDate) {
    if (!expDate || isNaN(parseInt(expDate, 10))) { return 'Sem vencimento'; }
    var d = new Date(parseInt(expDate, 10) * 1000);
    var dia = ('0' + d.getDate()).slice(-2);
    var mes = ('0' + (d.getMonth() + 1)).slice(-2);
    return dia + '/' + mes + '/' + d.getFullYear();
  }

  function atualizarHora() {
    var d = new Date();
    elHora.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  setInterval(atualizarHora, 15000);

  function mostrarHome(ctx, info) {
    VLTV.conta = info || null;
    var ehLista = ctx.modo === 'm3u';
    $('home-usuario').textContent = ehLista ? 'Lista M3U' : ctx.user;
    $('home-vencimento').textContent = ehLista
      ? VLTV.m3u.total() + ' itens'
      : 'Vence em ' + dataVencimento(info && info.exp_date);

    var rodape = [];
    if (nomeParceiro) { rodape.push('Parceiro: ' + nomeParceiro); }
    rodape.push(VLTV.platform.descricao);
    $('home-aparelho').textContent = rodape.join(' | ');

    // Lista M3U pode não ter todos os tipos de conteúdo.
    [[tileLive, 'ao_vivo'], [tileFilmes, 'filmes'], [tileSeries, 'series']].forEach(function (par) {
      var tem = VLTV.api.temConteudo(par[1]);
      var sub = par[0].querySelector('.tile-sub');
      par[0].disabled = !tem;
      sub.textContent = tem ? sub.getAttribute('data-sub') : 'Não há na lista';
    });

    VLTV.banner.carregar(false);
    mostrarTela('home');
  }

  function abrirConfig() {
    mostrarTela('config');
    VLTV.ajustes.abrir({ sair: function () { mostrarTela('home'); } });
  }

  function abrirTvAoVivo() {
    mostrarTela('live');
    VLTV.live.abrir(function () { mostrarTela('home'); });
  }

  // Filmes e Séries usam a mesma tela de catálogo.
  function abrirCatalogo(tipo) {
    mostrarTela('catalogo');
    VLTV.catalogo.abrir(tipo, {
      sair: function () { mostrarTela('home'); },
      abrirDetalhes: function (tipoItem, item, listaDaCategoria) {
        abrirDetalhes(tipoItem, item, listaDaCategoria);
      }
    });
  }

  // Detalhes de um filme ou série (mesma tela para os dois).
  function abrirDetalhes(tipo, item, lista) {
    mostrarTela('detalhes');
    VLTV.detalhes.abrir(tipo, item, lista, {
      sair: function () { mostrarTela('catalogo'); },
      reproduzir: function (itens, indice, inicioSeg) { tocar(itens, indice, 'detalhes', inicioSeg); }
    });
  }

  // voltarPara: tela que reaparece quando o vídeo termina ou o usuário aperta Voltar.
  // inicioSeg: segundo onde o vídeo começa (para continuar de onde parou).
  function tocar(itens, indice, voltarPara, inicioSeg) {
    mostrarTela('player');
    VLTV.player.abrir(itens, indice, function (ultimo) {
      mostrarTela(voltarPara);
      if (voltarPara === 'detalhes') { VLTV.detalhes.voltou(ultimo); }
    }, inicioSeg || 0);
  }

  // ── Mensagens ─────────────────────────────────────────────────────
  function textoExpirado(teste) {
    return teste
      ? 'Seu teste expirou. Entre em contato com o suporte para assinar o VLTV Play.'
      : 'Sua assinatura expirou. Entre em contato com o suporte para renovar.';
  }

  function textoErro(res, modo) {
    switch (res.estado) {
      case 'expirado': return textoExpirado(res.teste);
      case 'invalido': return 'Usuário ou senha incorretos.';
      case 'codigo_invalido': return 'Código de parceiro inválido. Confira com o seu provedor.';
      case 'suspenso': return 'Este código de parceiro está suspenso. Fale com o seu provedor.';
      case 'limite': return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
      case 'm3u_grande': return 'A lista é grande demais para esta TV. Use uma lista menor.';
      case 'm3u_vazia': return 'Nenhum canal, filme ou série encontrado nessa lista.';
      default:
        return modo === 'm3u'
          ? 'Não foi possível baixar a lista. Confira o endereço e a internet da TV.'
          : 'Não foi possível conectar. Verifique a internet da TV e tente de novo.';
    }
  }

  // ── Login ─────────────────────────────────────────────────────────
  // ctx: { modo, user, pass, codigo, servidor, m3u, dnsPreferido }
  // Resolve com { estado, base, info, teste, nome }.
  function autenticar(ctx) {
    if (ctx.modo === 'm3u') {
      return VLTV.m3u.carregar(ctx.m3u).then(
        function () { return { estado: 'ok' }; },
        function (erro) {
          var motivo = erro && erro.message;
          return { estado: motivo === 'tamanho' ? 'm3u_grande' : motivo === 'vazia' ? 'm3u_vazia' : 'erro' };
        }
      );
    }

    if (ctx.modo === 'parceiro') {
      return VLTV.parceiro.resolver(ctx.codigo).then(function (p) {
        if (p.estado === 'ok') {
          return VLTV.xtream.login(ctx.user, ctx.pass, ctx.dnsPreferido, p.dns).then(function (r) {
            r.nome = p.nome;
            return r;
          });
        }
        // Sem resposta da VPS: tenta o servidor que funcionou da última vez.
        if (p.estado === 'rede' && ctx.dnsPreferido) {
          return VLTV.xtream.login(ctx.user, ctx.pass, ctx.dnsPreferido, [ctx.dnsPreferido]);
        }
        return { estado: p.estado === 'rede' ? 'erro' : p.estado };
      });
    }

    if (ctx.modo === 'xtream') {
      return VLTV.xtream.login(ctx.user, ctx.pass, ctx.dnsPreferido, [VLTV.dns.normalizar(ctx.servidor)]);
    }

    // Usuário e senha do VLTV Play: DNS vem da VPS.
    return VLTV.dns.atualizar().then(function () {
      return VLTV.xtream.login(ctx.user, ctx.pass, ctx.dnsPreferido || null);
    });
  }

  function preencherCampos(ctx) {
    campoCodigo.value = ctx.codigo || '';
    campoServidor.value = ctx.servidor || '';
    campoUsuario.value = ctx.user || '';
    campoSenha.value = '';
    campoM3u.value = ctx.m3u || '';
  }

  // Leva para a tela certa depois do login.
  function concluir(res, ctx) {
    if (res.estado === 'ok') {
      nomeParceiro = res.nome || '';
      VLTV.sessao.salvar({
        modo: ctx.modo,
        dns: res.base || '',
        user: ctx.user || '',
        pass: ctx.pass || '',
        codigo: ctx.codigo || '',
        m3u: ctx.m3u || ''
      });
      mostrarHome(ctx, res.info);
      return;
    }

    VLTV.sessao.limpar();
    VLTV.m3u.limpar();
    preencherCampos(ctx);
    definirModo(ctx.modo);
    mostrarTela('login');
    mensagemLogin(textoErro(res, ctx.modo), 'erro');
  }

  function lerCampos() {
    return {
      modo: modoAtual,
      codigo: campoCodigo.value.trim(),
      servidor: campoServidor.value.trim(),
      user: campoUsuario.value.trim(),
      pass: campoSenha.value,
      m3u: campoM3u.value.trim(),
      dnsPreferido: null
    };
  }

  function faltaPreencher(c) {
    if (c.modo === 'm3u') { return c.m3u ? '' : 'Digite o endereço da lista.'; }
    if (c.modo === 'parceiro' && !c.codigo) { return 'Digite o código de parceiro.'; }
    if (c.modo === 'xtream' && !c.servidor) { return 'Digite o endereço do servidor.'; }
    return c.user && c.pass ? '' : 'Digite o usuário e a senha.';
  }

  function entrar() {
    if (entrando) { return; }

    var ctx = lerCampos();
    var aviso = faltaPreencher(ctx);
    if (aviso) { mensagemLogin(aviso, 'erro'); return; }

    entrando = true;
    btnEntrar.disabled = true;
    mensagemLogin(ctx.modo === 'm3u' ? 'Baixando a lista... isso pode demorar.' : 'Conectando...', '');

    autenticar(ctx)
      .then(function (res) { concluir(res, ctx); })
      .then(function () { entrando = false; btnEntrar.disabled = false; });
  }

  function sair() {
    VLTV.sessao.limpar();
    VLTV.m3u.limpar();
    nomeParceiro = '';
    preencherCampos({});
    definirModo(VLTV.sessao.ultimaAba());
    mostrarTela('login');
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function visivel(el) { return !el.closest('.escondida'); }

  // Na tela de login: aba escolhida, campos visíveis e botão Entrar.
  function focaveis() {
    if (telaAtual === 'login') {
      var ativa = abas.filter(function (a) { return a.classList.contains('ativa'); })[0] || abas[0];
      var campos = [].slice.call(telas.login.querySelectorAll('input')).filter(visivel);
      return [ativa].concat(campos, [btnEntrar]);
    }
    return [].slice.call(telas[telaAtual].querySelectorAll('input, button:not([disabled])'));
  }

  function moverFoco(passo) {
    var lista = focaveis();
    if (lista.length === 0) { return; }
    var i = lista.indexOf(document.activeElement);
    var novo = i === -1 ? 0 : Math.max(0, Math.min(lista.length - 1, i + passo));
    lista[novo].focus();
  }

  function moverAba(passo) {
    var i = abas.indexOf(document.activeElement);
    var novo = Math.max(0, Math.min(abas.length - 1, i + passo));
    abas[novo].focus();   // ao receber o foco, a aba vira a escolhida
  }

  function fecharApp() {
    // Fecha o app (na TV). No navegador de teste não faz nada.
    try { window.close(); } catch (e) { /* ignora */ }
  }

  // Home: três cartões grandes no meio, engrenagem em cima e "Sair" embaixo.
  function navegarHome(k) {
    var tiles = [tileLive, tileFilmes, tileSeries].filter(function (t) { return !t.disabled; });
    var ativo = document.activeElement;
    var i = tiles.indexOf(ativo);

    var temBanner = VLTV.banner.visivel();
    if (i !== -1) {
      if (k === TECLA_ESQ || k === TECLA_DIR) {
        var novo = Math.max(0, Math.min(tiles.length - 1, i + (k === TECLA_ESQ ? -1 : 1)));
        ultimoTile = tiles[novo];
        ultimoTile.focus();
      } else if (k === TECLA_CIMA) {
        if (temBanner) { elBanner.focus(); } else { btnConfig.focus(); }
      } else {
        tileSair.focus();
      }
    } else if (ativo === elBanner) {
      if (k === TECLA_ESQ) { VLTV.banner.mover(-1); }
      else if (k === TECLA_DIR) { VLTV.banner.mover(1); }
      else if (k === TECLA_CIMA) { btnConfig.focus(); }
      else { ultimoTile.focus(); }
    } else if (ativo === btnConfig && k === TECLA_BAIXO) {
      if (temBanner) { elBanner.focus(); } else { ultimoTile.focus(); }
    } else if (ativo === tileSair && k === TECLA_CIMA) {
      ultimoTile.focus();
    }
  }

  var TRATADORES = {
    config: function (k) { return VLTV.ajustes.tecla(k); },
    live: function (k) { return VLTV.live.tecla(k); },
    catalogo: function (k) { return VLTV.catalogo.tecla(k); },
    detalhes: function (k) { return VLTV.detalhes.tecla(k); },
    player: function (k) { return VLTV.player.tecla(k); }
  };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;

    // Estas telas cuidam das próprias teclas.
    var tratador = TRATADORES[telaAtual];
    if (tratador) {
      if (tratador(k)) { e.preventDefault(); }
      return;
    }

    if (k === TECLA_VOLTAR_WEBOS || k === TECLA_ESC) {
      e.preventDefault();
      fecharApp();
    } else if (telaAtual === 'home' && (k === TECLA_ESQ || k === TECLA_DIR || k === TECLA_CIMA || k === TECLA_BAIXO)) {
      e.preventDefault();
      navegarHome(k);
    } else if (telaAtual === 'login') {
      var naAba = abas.indexOf(document.activeElement) !== -1;
      if (naAba && (k === TECLA_ESQ || k === TECLA_DIR)) {
        e.preventDefault();
        moverAba(k === TECLA_ESQ ? -1 : 1);
      } else if (k === TECLA_CIMA || k === TECLA_BAIXO) {
        e.preventDefault();
        moverFoco(k === TECLA_CIMA ? -1 : 1);
      }
    }
    // Enter nos campos fica no padrão da TV: abre o teclado na tela.
  });

  abas.forEach(function (aba) {
    aba.addEventListener('focus', function () { definirModo(aba.getAttribute('data-modo')); });
    aba.addEventListener('click', function () { definirModo(aba.getAttribute('data-modo')); moverFoco(1); });
  });
  btnEntrar.addEventListener('click', entrar);
  tileLive.addEventListener('click', abrirTvAoVivo);
  tileFilmes.addEventListener('click', function () { abrirCatalogo('filmes'); });
  tileSeries.addEventListener('click', function () { abrirCatalogo('series'); });
  VLTV.banner.configurar(function (tipo, raw, lista) {
    mostrarTela('detalhes');
    VLTV.detalhes.abrir(tipo, raw, lista, {
      sair: function () { mostrarTela('home'); },
      reproduzir: function (itens, indice, inicioSeg) { tocar(itens, indice, 'detalhes', inicioSeg); }
    });
  }, function (existe) { telas.home.classList.toggle('com-banner', existe); });
  elBanner.addEventListener('click', function () { VLTV.banner.abrirAtual(); });
  tileSair.addEventListener('click', sair);
  btnConfig.addEventListener('click', abrirConfig);
  [tileLive, tileFilmes, tileSeries].forEach(function (t) {
    t.addEventListener('focus', function () { ultimoTile = t; });
  });

  // ── Início ────────────────────────────────────────────────────────
  function iniciar() {
    if (!VLTV.platform.compativel) {
      $('incompativel-msg').textContent = VLTV.platform.motivo;
      mostrarTela('incompativel');
      return;
    }

    var salva = VLTV.sessao.ler();
    definirModo(salva ? salva.modo : VLTV.sessao.ultimaAba());

    if (!salva) {
      VLTV.dns.atualizar();
      mostrarTela('login');
      return;
    }

    // Já tem login salvo: entra direto. O servidor que funcionou da última vez é testado primeiro.
    var ctx = {
      modo: salva.modo,
      user: salva.user,
      pass: salva.pass,
      codigo: salva.codigo,
      servidor: salva.dns,
      m3u: salva.m3u,
      dnsPreferido: salva.dns
    };

    $('carregando-msg').textContent = ctx.modo === 'm3u' ? 'Carregando a lista...' : 'Entrando...';
    autenticar(ctx).then(function (res) {
      if (res.estado === 'erro') {
        // Sem internet: mantém o login salvo e deixa tentar de novo.
        preencherCampos(ctx);
        mostrarTela('login');
        mensagemLogin(textoErro(res, ctx.modo), 'erro');
        return;
      }
      concluir(res, ctx);
    });
  }

  iniciar();
})();
