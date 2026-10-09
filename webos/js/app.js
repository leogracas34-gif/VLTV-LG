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
    licenca: $('tela-licenca'),
    login: $('tela-login'),
    home: $('tela-home'),
    listas: $('tela-listas'),
    config: $('tela-config'),
    live: $('tela-live'),
    catalogo: $('tela-catalogo'),
    detalhes: $('tela-detalhes'),
    player: $('tela-player')
  };
  var telaAtual = 'carregando';

  var abas = [].slice.call(document.querySelectorAll('.aba'));
  var grupos = [].slice.call(document.querySelectorAll('#tela-login .campo'));
  var campoServidor = $('campo-servidor');
  var campoUsuario = $('campo-usuario');
  var campoSenha = $('campo-senha');
  var campoM3u = $('campo-m3u');
  var btnEntrar = $('btn-entrar');
  var btnOlho = $('btn-olho');
  var telaConfirma = $('confirma-sair');
  var btnSairNao = $('sair-nao');
  var btnSairSim = $('sair-sim');
  var statusLogin = $('login-status');
  var tileLive = $('tile-live');
  var tileFilmes = $('tile-filmes');
  var tileSeries = $('tile-series');
  var tileSair = $('btn-sair');
  var btnListas = $('btn-listas');
  var btnConfig = $('btn-config');
  var elBanner = $('banner');
  var elHora = $('home-hora');
  var ultimoTile = tileLive;

  var modoAtual = 'usuario';
  var nomeParceiro = '';
  var entrando = false;
  var adicionando = false;   // o login foi aberto por "Adicionar nova lista" (a lista em uso continua valendo)
  var trocando = false;      // trocando de lista

  // ── Telas ─────────────────────────────────────────────────────────
  function mostrarTela(nome) {
    Object.keys(telas).forEach(function (n) {
      telas[n].classList.toggle('escondida', n !== nome);
    });
    telaAtual = nome;
    var faixa = $('faixa-campanha');
    if (faixa) { faixa.style.visibility = nome === 'home' ? 'visible' : 'hidden'; }
    if (nome === 'licenca') { $('lic-btn').focus(); }

    if (nome === 'login') {
      mostrarSenha(false);
      var lista = focaveis();
      (lista[1] || lista[0]).focus();
    }
    if (nome === 'home') { VLTV.parental.travar(); }
    if (nome === 'home') { VLTV.banner.iniciar(); } else { VLTV.banner.parar(); }
    if (nome === 'home') {
      atualizarHora();
      if (ultimoTile.disabled) {
        ultimoTile = [tileLive, tileFilmes, tileSeries].filter(function (t) { return !t.disabled; })[0] || btnListas;
      }
      ultimoTile.focus();
    }
  }

  function mensagemLogin(texto, tipo) {
    statusLogin.textContent = texto || '';
    statusLogin.className = 'status' + (tipo ? ' ' + tipo : '');
  }

  // Mostra só os campos do modo escolhido (Usuário, Xtream ou M3U).
  function definirModo(modo) {
    if (modo === 'parceiro') { modo = 'xtream'; }   // código de parceiro é digitado na aba Xtream
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

  var DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function atualizarHora() {
    var d = new Date();
    elHora.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    // Embaixo da hora: só a data de hoje (os vencimentos aparecem como aviso, quando estiverem perto).
    $('home-vencimento').textContent = DIAS_SEMANA[d.getDay()] + ', ' + ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  setInterval(atualizarHora, 15000);

  function mostrarHome(ctx, info) {
    VLTV.conta = info || null;
    var ehLista = ctx.modo === 'm3u';
    atualizarHora();
    var avisos = VLTV.licenca.avisos(ehLista ? 0 : (info && info.exp_date));
    var elAviso = $('home-aviso');
    elAviso.textContent = avisos.join('  •  ');
    elAviso.classList.toggle('escondida', avisos.length === 0);

    VLTV.parceiroNome = nomeParceiro;

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
      sair: function () { mostrarTela('catalogo'); VLTV.catalogo.atualizarFavoritos(); },
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
    campoServidor.value = ctx.codigo || ctx.servidor || '';
    campoUsuario.value = ctx.user || '';
    campoSenha.value = '';
    campoM3u.value = ctx.m3u || '';
  }

  // Leva para a tela certa depois do login.
  function concluir(res, ctx) {
    if (res.estado === 'ok') {
      nomeParceiro = res.nome || '';
      var dados = {
        modo: ctx.modo,
        dns: res.base || '',
        user: ctx.user || '',
        pass: ctx.pass || '',
        codigo: ctx.codigo || '',
        m3u: ctx.m3u || ''
      };
      VLTV.sessao.salvar(dados);
      if (ctx.modo !== 'm3u') { VLTV.m3u.limpar(); }
      dados.parceiro = nomeParceiro;
      VLTV.listas.registrar(dados);
      adicionando = false;
      mostrarHome(ctx, res.info);
      return;
    }

    // Se o login foi aberto por "Adicionar nova lista", a lista que já estava em uso continua valendo.
    if (!adicionando) {
      VLTV.sessao.limpar();
      VLTV.m3u.limpar();
    }
    preencherCampos(ctx);
    definirModo(ctx.modo);
    mostrarTela('login');
    mensagemLogin(textoErro(res, ctx.modo), 'erro');
  }

  // Na aba Xtream o campo aceita o endereço do servidor (DNS) ou o código de parceiro.
  // Endereço tem ponto, dois pontos ou barra; o que não tem é código de parceiro.
  function ehCodigoParceiro(texto) {
    return !!texto && !/[.:\/]/.test(texto);
  }

  function lerCampos() {
    var ctx = {
      modo: modoAtual,
      codigo: '',
      servidor: campoServidor.value.trim(),
      user: campoUsuario.value.trim(),
      pass: campoSenha.value,
      m3u: campoM3u.value.trim(),
      dnsPreferido: null
    };
    if (ctx.modo === 'xtream' && ehCodigoParceiro(ctx.servidor)) {
      ctx.modo = 'parceiro';
      ctx.codigo = ctx.servidor;
      ctx.servidor = '';
    }
    return ctx;
  }

  function faltaPreencher(c) {
    if (c.modo === 'm3u') { return c.m3u ? '' : 'Digite o endereço da lista.'; }
    if (c.modo === 'xtream' && !c.servidor) { return 'Digite o endereço do servidor ou o código de parceiro.'; }
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

  // ── Minhas listas ─────────────────────────────────────────────────
  function abrirListas(aviso) {
    mostrarTela('listas');
    VLTV.listasTela.abrir({
      usar: usarLista,
      adicionar: adicionarLista,
      // Removeu a lista que estava em uso: encerra a sessão e vai para as outras listas (ou para o login).
      removeuAtiva: function () {
        VLTV.sessao.limpar();
        VLTV.m3u.limpar();
        nomeParceiro = '';
        adicionando = false;
        if (VLTV.listas.todas().length > 0) { abrirListas('Escolha uma lista para entrar.'); } else { mostrarLogin(); }
      },
      sair: function () {
        if (VLTV.sessao.ler()) { mostrarTela('home'); } else { mostrarLogin(); }
      }
    }, aviso);
  }

  function mostrarLogin() {
    preencherCampos({});
    definirModo(VLTV.sessao.ultimaAba());
    mostrarTela('login');
  }

  // "Adicionar nova lista": abre o login na aba escolhida (Usuário, Xtream ou M3U).
  function adicionarLista(grupo) {
    adicionando = !!VLTV.sessao.ler();
    preencherCampos({});
    definirModo(grupo || VLTV.sessao.ultimaAba());
    mostrarTela('login');
    mensagemLogin('', '');
  }

  // Troca para outra lista já salva, sem sair da conta.
  function usarLista(e) {
    if (trocando) { return; }
    var ctx = {
      modo: e.modo,
      user: e.user,
      pass: e.pass,
      codigo: e.codigo,
      servidor: e.dns,
      m3u: e.m3u,
      dnsPreferido: e.dns
    };
    trocando = true;
    VLTV.listasTela.ocupar(true, ctx.modo === 'm3u' ? 'Baixando a lista... isso pode demorar.' : 'Conectando...');
    autenticar(ctx).then(function (res) {
      trocando = false;
      if (res.estado === 'ok') {
        VLTV.listasTela.ocupar(false);
        concluir(res, ctx);
      } else {
        VLTV.listasTela.ocupar(false);
        VLTV.listasTela.mensagem(textoErro(res, ctx.modo), 'erro');
      }
    });
  }

  // Pergunta antes de sair: o botão Sair só abre a janela; quem sai de verdade é sair().
  function confirmando() { return !telaConfirma.classList.contains('escondida'); }
  function pedirConfirmacaoSair() {
    telaConfirma.classList.remove('escondida');
    btnSairNao.focus();
  }
  function fecharConfirmacaoSair() {
    telaConfirma.classList.add('escondida');
    tileSair.focus();
  }
  function teclaConfirma(k) {
    if (k === TECLA_ESQ) { btnSairNao.focus(); return true; }
    if (k === TECLA_DIR) { btnSairSim.focus(); return true; }
    if (k === TECLA_CIMA || k === TECLA_BAIXO) { return true; }
    if (k === TECLA_VOLTAR_WEBOS || k === TECLA_ESC) { fecharConfirmacaoSair(); return true; }
    return false;   // OK: o clique do botão em foco resolve
  }

  function sair() {
    telaConfirma.classList.add('escondida');
    // Sair tira da TV a lista que estava em uso. Se sobrar outra, o app mostra a tela de listas.
    var ativa = VLTV.listas.idAtiva();
    if (ativa) { VLTV.listas.remover(ativa); }
    VLTV.sessao.limpar();
    VLTV.m3u.limpar();
    nomeParceiro = '';
    adicionando = false;
    if (VLTV.listas.todas().length > 0) {
      abrirListas('Escolha uma lista para entrar.');
    } else {
      mostrarLogin();
    }
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

  // Os campos ficam só-leitura: ao chegar neles com as setas o teclado NÃO abre.
  // O OK libera a digitação (e aí a TV abre o teclado). Ao terminar, volta a ser só-leitura.
  function campoDeTexto(el) { return !!el && el.tagName === 'INPUT' && telas.login.contains(el); }

  function liberarDigitacao(el) {
    el.removeAttribute('readonly');
    el.blur();
    el.focus();       // foco de novo, já editável: é isso que faz a TV abrir o teclado
  }

  function travarDigitacao(el) {
    el.setAttribute('readonly', 'readonly');
  }

  // Terminou de digitar (Enter do teclado): vai para o próximo campo, ou entra se for o último.
  function terminarCampo(el) {
    var lista = focaveis().filter(campoDeTexto);
    travarDigitacao(el);
    var i = lista.indexOf(el);
    if (i === -1 || i === lista.length - 1) {
      el.focus();
      entrar();
    } else {
      lista[i + 1].focus();   // só-leitura: o teclado não abre sozinho
    }
  }

  function mostrarSenha(ver) {
    campoSenha.type = ver ? 'text' : 'password';
    $('olho-aberto').classList.toggle('escondida', ver);
    $('olho-fechado').classList.toggle('escondida', !ver);
    btnOlho.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
  }

  [campoServidor, campoUsuario, campoSenha, campoM3u].forEach(function (el) {
    var timerTrava = null;
    // Voltou o foco (é o que acontece ao abrir o teclado): cancela o travamento pendente.
    el.addEventListener('focus', function () { clearTimeout(timerTrava); });
    // Se o teclado fechou sem Enter (voltar), o campo volta a ser só-leitura e mantém o foco.
    el.addEventListener('blur', function () {
      if (el.hasAttribute('readonly')) { return; }
      clearTimeout(timerTrava);
      timerTrava = setTimeout(function () {
        if (document.activeElement === el) { return; }   // o campo já está com o foco de novo: não trava
        travarDigitacao(el);
        if (telaAtual === 'login' && (!document.activeElement || document.activeElement === document.body)) { el.focus(); }
      }, 50);
    });
    // Cursor do controle (Magic Remote): o clique no campo libera a digitação e abre o teclado.
    el.addEventListener('click', function () {
      if (telaAtual === 'login' && el.hasAttribute('readonly')) { liberarDigitacao(el); }
    });
  });
  btnOlho.addEventListener('click', function () { mostrarSenha(campoSenha.type === 'password'); });

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
        btnListas.focus();
      }
    } else if (ativo === elBanner) {
      if (k === TECLA_ESQ) { VLTV.banner.mover(-1); }
      else if (k === TECLA_DIR) { VLTV.banner.mover(1); }
      else if (k === TECLA_CIMA) { btnConfig.focus(); }
      else { ultimoTile.focus(); }
    } else if (ativo === btnConfig && k === TECLA_BAIXO) {
      if (temBanner) { elBanner.focus(); } else { ultimoTile.focus(); }
    } else if ((ativo === tileSair || ativo === btnListas) && k === TECLA_CIMA) {
      ultimoTile.focus();
    } else if (ativo === btnListas && k === TECLA_DIR) {
      tileSair.focus();
    } else if (ativo === tileSair && k === TECLA_ESQ) {
      btnListas.focus();
    }
  }

  var TRATADORES = {
    licenca: function (k) {
      if (k === 13) { verificarLicenca(); return true; }
      return false;
    },
    listas: function (k) { return VLTV.listasTela.tecla(k); },
    config: function (k) { return VLTV.ajustes.tecla(k); },
    live: function (k) { return VLTV.live.tecla(k); },
    catalogo: function (k) { return VLTV.catalogo.tecla(k); },
    detalhes: function (k) { return VLTV.detalhes.tecla(k); },
    player: function (k) { return VLTV.player.tecla(k); }
  };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;

    // A janela da senha fica por cima de tudo e fica com as teclas enquanto está aberta.
    if (VLTV.parental.aberto()) {
      if (VLTV.parental.tecla(k)) { e.preventDefault(); }
      return;
    }

    // Janela "Deseja sair?" fica por cima da Home.
    if (confirmando()) {
      if (teclaConfirma(k)) { e.preventDefault(); }
      return;
    }

    // Estas telas cuidam das próprias teclas.
    var tratador = TRATADORES[telaAtual];
    if (tratador) {
      if (tratador(k)) { e.preventDefault(); }
      return;
    }

    if ((k === TECLA_VOLTAR_WEBOS || k === TECLA_ESC) && telaAtual === 'login' && adicionando) {
      // Estava adicionando uma lista: volta para a tela de listas.
      e.preventDefault();
      adicionando = false;
      abrirListas();
    } else if (k === TECLA_VOLTAR_WEBOS || k === TECLA_ESC) {
      e.preventDefault();
      fecharApp();
    } else if (telaAtual === 'home' && (k === TECLA_ESQ || k === TECLA_DIR || k === TECLA_CIMA || k === TECLA_BAIXO)) {
      e.preventDefault();
      navegarHome(k);
    } else if (telaAtual === 'login') {
      var ativoLogin = document.activeElement;
      // OK num campo: libera a digitação e abre o teclado. Enter do teclado: avança ou entra.
      if (k === 13 && campoDeTexto(ativoLogin)) {
        e.preventDefault();
        if (ativoLogin.hasAttribute('readonly')) { liberarDigitacao(ativoLogin); } else { terminarCampo(ativoLogin); }
        return;
      }
      // Olhinho: fica à direita da senha.
      if (ativoLogin === campoSenha && k === TECLA_DIR && ativoLogin.hasAttribute('readonly') && visivel(btnOlho)) {
        e.preventDefault();
        btnOlho.focus();
        return;
      }
      if (ativoLogin === btnOlho) {
        e.preventDefault();
        if (k === TECLA_ESQ || k === TECLA_CIMA) { campoSenha.focus(); }
        else if (k === TECLA_BAIXO) { btnEntrar.focus(); }
        return;
      }
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
  // Layout da Home decidido uma vez só, antes de aparecer: nada pula de lugar quando o banner chega.
  var bannerAtivo = VLTV.config.BANNER_ATIVO !== false;
  telas.home.classList.toggle('com-banner', bannerAtivo);
  elBanner.classList.toggle('escondida', !bannerAtivo);

  VLTV.banner.configurar(function (tipo, raw, lista) {
    mostrarTela('detalhes');
    VLTV.detalhes.abrir(tipo, raw, lista, {
      sair: function () { mostrarTela('home'); },
      reproduzir: function (itens, indice, inicioSeg) { tocar(itens, indice, 'detalhes', inicioSeg); }
    });
  }, function () { /* o layout é fixo */ });
  elBanner.addEventListener('click', function () { VLTV.banner.abrirAtual(); });
  tileSair.addEventListener('click', pedirConfirmacaoSair);
  btnSairNao.addEventListener('click', fecharConfirmacaoSair);
  btnSairSim.addEventListener('click', sair);
  btnListas.addEventListener('click', function () { abrirListas(); });
  btnConfig.addEventListener('click', abrirConfig);
  [tileLive, tileFilmes, tileSeries].forEach(function (t) {
    t.addEventListener('focus', function () { ultimoTile = t; });
  });

  // ── Início ────────────────────────────────────────────────────────
  function iniciarApp() {
    if (!VLTV.platform.compativel) {
      $('incompativel-msg').textContent = VLTV.platform.motivo;
      mostrarTela('incompativel');
      return;
    }

    var salva = VLTV.sessao.ler();
    definirModo(salva ? salva.modo : VLTV.sessao.ultimaAba());

    if (!salva) {
      VLTV.dns.atualizar();
      if (VLTV.listas.todas().length > 0) { abrirListas('Escolha uma lista para entrar.'); } else { mostrarTela('login'); }
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

  // ── Licença: antes de tudo, a TV confere com a VPS se o teste/ativação está valendo ──
  // Enquanto a tela de ativação está aberta, a TV confere sozinha (a cada 20 s) se o pagamento já foi liberado.
  var pollLicenca = null;
  function pararPollLicenca() {
    if (pollLicenca) { clearInterval(pollLicenca); pollLicenca = null; }
  }
  function liberarApp() {
    pararPollLicenca();
    VLTV.licenca.aplicarVisual();
    iniciarApp();
    VLTV.licenca.mostrarNoLogin();
  }
  function iniciarPollLicenca() {
    pararPollLicenca();
    pollLicenca = setInterval(function () {
      if (telaAtual !== 'licenca') { pararPollLicenca(); return; }
      VLTV.licenca.verificar().then(function (lic) {
        if (telaAtual !== 'licenca') { return; }
        if (lic.estado === 'trial' || lic.estado === 'active') { liberarApp(); }
      });
    }, 20000);
  }

  // Sem valores na tela (regra das lojas): só o código da TV e o endereço do site, onde o cliente vê os planos e paga.
  function mostrarLicenca(lic) {
    var sem = lic.estado === 'erro';
    var bloqueado = lic.estado === 'blocked';
    $('lic-titulo').textContent = bloqueado ? 'Aparelho bloqueado'
      : sem ? 'Sem conexão com o servidor'
      : 'Seu teste grátis terminou';
    $('lic-msg').textContent = bloqueado
      ? 'Este aparelho foi bloqueado. Fale com o suporte informando o código abaixo.'
      : sem ? (lic.texto || 'Conecte a TV à internet e aperte OK para tentar de novo.')
      : 'Para continuar assistindo, ative a licença desta TV.';
    $('lic-codigo-box').classList.toggle('escondida', sem);
    $('lic-codigo').textContent = lic.codigo || '';

    var site = $('lic-site');
    while (site.firstChild) { site.removeChild(site.firstChild); }
    if (!sem && !bloqueado) {
      site.appendChild(document.createTextNode('No celular ou computador, acesse '));
      var link = document.createElement('span');
      link.className = 'lic-site-url';
      link.textContent = lic.pagar_url || 'vltvplay.tech/ativar';
      site.appendChild(link);
      site.appendChild(document.createTextNode(' e informe o código.'));
    }
    $('lic-preco').textContent = '';
    $('lic-btn').textContent = sem ? 'Tentar novamente' : 'Já ativei — verificar';
    mostrarTela('licenca');
    iniciarPollLicenca();
  }

  var verificando = false;
  function verificarLicenca() {
    if (verificando) { return; }
    verificando = true;
    pararPollLicenca();
    $('carregando-msg').textContent = 'Verificando licença...';
    mostrarTela('carregando');
    VLTV.licenca.verificar().then(function (lic) {
      verificando = false;
      if (lic.estado === 'trial' || lic.estado === 'active') {
        liberarApp();
      } else {
        mostrarLicenca(lic);
      }
    });
  }
  $('lic-btn').addEventListener('click', verificarLicenca);

  function iniciar() {
    if (!VLTV.platform.compativel) { iniciarApp(); return; }
    verificarLicenca();
  }

  iniciar();
})();
