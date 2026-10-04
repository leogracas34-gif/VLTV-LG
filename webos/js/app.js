// VLTV Play - webOS | Telas e navegação por controle remoto (etapa 3: login, Home, TV ao vivo, filmes e séries).
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
    live: $('tela-live'),
    catalogo: $('tela-catalogo'),
    episodios: $('tela-episodios'),
    player: $('tela-player')
  };
  var telaAtual = 'carregando';

  var campoUsuario = $('campo-usuario');
  var campoSenha = $('campo-senha');
  var btnEntrar = $('btn-entrar');
  var statusLogin = $('login-status');
  var tileLive = $('tile-live');
  var tileFilmes = $('tile-filmes');
  var tileSeries = $('tile-series');
  var tileSair = $('tile-sair');

  var entrando = false;

  // ── Telas ─────────────────────────────────────────────────────────
  function mostrarTela(nome) {
    Object.keys(telas).forEach(function (n) {
      telas[n].classList.toggle('escondida', n !== nome);
    });
    telaAtual = nome;

    if (nome === 'login') { campoUsuario.focus(); }
    if (nome === 'home') { tileLive.focus(); }
  }

  function mensagemLogin(texto, tipo) {
    statusLogin.textContent = texto || '';
    statusLogin.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  function dataVencimento(expDate) {
    if (!expDate || isNaN(parseInt(expDate, 10))) { return 'Sem vencimento'; }
    var d = new Date(parseInt(expDate, 10) * 1000);
    var dia = ('0' + d.getDate()).slice(-2);
    var mes = ('0' + (d.getMonth() + 1)).slice(-2);
    return dia + '/' + mes + '/' + d.getFullYear();
  }

  function mostrarHome(user, info) {
    $('home-usuario').textContent = user;
    $('home-vencimento').textContent = 'Vence em ' + dataVencimento(info && info.exp_date);
    $('home-aparelho').textContent = VLTV.platform.descricao;
    mostrarTela('home');
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
      reproduzir: function (itens, indice) { tocar(itens, indice, 'catalogo'); },
      abrirSerie: function (serie) { abrirEpisodios(serie); }
    });
  }

  function abrirEpisodios(serie) {
    mostrarTela('episodios');
    VLTV.episodios.abrir(serie, {
      sair: function () { mostrarTela('catalogo'); },
      reproduzir: function (itens, indice) { tocar(itens, indice, 'episodios'); }
    });
  }

  // voltarPara: tela que reaparece quando o vídeo termina ou o usuário aperta Voltar.
  function tocar(itens, indice, voltarPara) {
    mostrarTela('player');
    VLTV.player.abrir(itens, indice, function (ultimo) {
      mostrarTela(voltarPara);
      if (voltarPara === 'episodios') { VLTV.episodios.irPara(ultimo); }
    });
  }

  function textoExpirado(teste) {
    return teste
      ? 'Seu teste expirou. Entre em contato com o suporte para assinar o VLTV Play.'
      : 'Sua assinatura expirou. Entre em contato com o suporte para renovar.';
  }

  // ── Login ─────────────────────────────────────────────────────────
  // Trata o resultado do login e leva para a tela certa.
  function tratarResultado(res, user, pass) {
    if (res.estado === 'ok') {
      VLTV.sessao.salvar(res.base, user, pass);
      mostrarHome(user, res.info);
      return;
    }

    VLTV.sessao.limpar();
    campoUsuario.value = user;
    campoSenha.value = '';
    mostrarTela('login');

    if (res.estado === 'expirado') {
      mensagemLogin(textoExpirado(res.teste), 'erro');
    } else if (res.estado === 'invalido') {
      mensagemLogin('Usuário ou senha incorretos.', 'erro');
    } else {
      mensagemLogin('Não foi possível conectar. Verifique a internet da TV e tente de novo.', 'erro');
    }
  }

  function entrar() {
    if (entrando) { return; }

    var user = campoUsuario.value.trim();
    var pass = campoSenha.value;
    if (!user || !pass) {
      mensagemLogin('Digite o usuário e a senha.', 'erro');
      return;
    }

    entrando = true;
    btnEntrar.disabled = true;
    mensagemLogin('Conectando...', '');

    VLTV.dns.atualizar()
      .then(function () { return VLTV.xtream.login(user, pass, null); })
      .then(function (res) { tratarResultado(res, user, pass); })
      .then(function () { entrando = false; btnEntrar.disabled = false; });
  }

  function sair() {
    VLTV.sessao.limpar();
    campoUsuario.value = '';
    campoSenha.value = '';
    mensagemLogin('', '');
    mostrarTela('login');
  }

  // ── Controle remoto ───────────────────────────────────────────────
  function focaveis() {
    return [].slice.call(telas[telaAtual].querySelectorAll('input, button:not([disabled])'));
  }

  function moverFoco(passo) {
    var lista = focaveis();
    if (lista.length === 0) { return; }
    var i = lista.indexOf(document.activeElement);
    var novo = i === -1 ? 0 : Math.max(0, Math.min(lista.length - 1, i + passo));
    lista[novo].focus();
  }

  function fecharApp() {
    // Fecha o app (na TV). No navegador de teste não faz nada.
    try { window.close(); } catch (e) { /* ignora */ }
  }

  var TRATADORES = {
    live: function (k) { return VLTV.live.tecla(k); },
    catalogo: function (k) { return VLTV.catalogo.tecla(k); },
    episodios: function (k) { return VLTV.episodios.tecla(k); },
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
    } else if (telaAtual === 'home' && (k === TECLA_ESQ || k === TECLA_DIR)) {
      e.preventDefault();
      moverFoco(k === TECLA_ESQ ? -1 : 1);
    } else if (telaAtual === 'login' && (k === TECLA_CIMA || k === TECLA_BAIXO)) {
      e.preventDefault();
      moverFoco(k === TECLA_CIMA ? -1 : 1);
    }
    // Enter nos campos fica no padrão da TV: abre o teclado na tela.
  });

  btnEntrar.addEventListener('click', entrar);
  tileLive.addEventListener('click', abrirTvAoVivo);
  tileFilmes.addEventListener('click', function () { abrirCatalogo('filmes'); });
  tileSeries.addEventListener('click', function () { abrirCatalogo('series'); });
  tileSair.addEventListener('click', sair);

  // ── Início ────────────────────────────────────────────────────────
  function iniciar() {
    if (!VLTV.platform.compativel) {
      $('incompativel-msg').textContent = VLTV.platform.motivo;
      mostrarTela('incompativel');
      return;
    }

    var salva = VLTV.sessao.ler();
    if (!salva) {
      VLTV.dns.atualizar();
      mostrarTela('login');
      return;
    }

    // Já tem login salvo: entra direto, testando primeiro o servidor que funcionou da última vez.
    $('carregando-msg').textContent = 'Entrando...';
    VLTV.dns.atualizar()
      .then(function () { return VLTV.xtream.login(salva.user, salva.pass, salva.dns); })
      .then(function (res) {
        if (res.estado === 'erro') {
          // Sem internet: mantém o login salvo e deixa tentar de novo.
          campoUsuario.value = salva.user;
          mostrarTela('login');
          mensagemLogin('Não foi possível conectar. Verifique a internet da TV e tente de novo.', 'erro');
          return;
        }
        tratarResultado(res, salva.user, salva.pass);
      });
  }

  iniciar();
})();
