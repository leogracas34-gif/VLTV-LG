// VLTV Play - webOS | Detecta o modelo/ano da TV e decide se é compatível.
// Usa o PalmSystem (interno do webOS) e o User-Agent, sem biblioteca extra.
(function () {
  'use strict';

  function lerDeviceInfo() {
    try {
      if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        return JSON.parse(window.PalmSystem.deviceInfo);
      }
    } catch (e) { /* segue sem deviceInfo */ }
    return null;
  }

  function numero(texto, regex) {
    var m = regex.exec(texto || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function detectar() {
    var cfg = VLTV.config;
    var ua = navigator.userAgent || '';
    var info = lerDeviceInfo();

    var ehTV = !!window.PalmSystem || /Web0S|webOS/i.test(ua);
    var ano = numero(ua, /webOS\.TV-(\d{4})/i);
    var chrome = numero(ua, /Chrome\/(\d+)/i);
    var sdk = info ? numero(String(info.sdkVersion || ''), /^(\d+)/) : null;
    var modelo = info && info.modelName ? String(info.modelName) : '';

    var compativel = true;
    var motivo = '';

    if (ehTV) {
      // Ordem: ano da TV, depois versão do webOS, depois versão do navegador.
      if (ano !== null) {
        compativel = ano >= cfg.MIN_WEBOS_YEAR;
      } else if (sdk !== null) {
        compativel = sdk >= cfg.MIN_WEBOS_SDK;
      } else if (chrome !== null) {
        compativel = chrome >= cfg.MIN_CHROME;
      }
      if (!compativel) {
        motivo = 'O VLTV Play funciona em TVs LG de ' + cfg.MIN_WEBOS_YEAR +
                 ' em diante (webOS ' + cfg.MIN_WEBOS_SDK + ' ou mais novo). ' +
                 'Detectado: ano ' + (ano !== null ? ano : '?') +
                 ', webOS ' + (sdk !== null ? sdk : '?') +
                 ', Chrome ' + (chrome !== null ? chrome : '?') + '.';
      }
    }

    var partes = [];
    if (!ehTV) {
      partes.push('Navegador (modo de teste)');
    } else {
      partes.push(modelo || 'TV LG');
      if (sdk !== null) { partes.push('webOS ' + sdk); }
      if (ano !== null) { partes.push(String(ano)); }
      if (chrome !== null) { partes.push('Chrome ' + chrome); }
    }

    return {
      ehTV: ehTV,
      ano: ano,
      sdk: sdk,
      chrome: chrome,
      marca: ehTV ? 'LG' : '',
      modelo: modelo,
      compativel: compativel,
      motivo: motivo,
      descricao: partes.join(' | ')
    };
  }

  // Rola o item para dentro da área visível (scrollIntoView com opções só existe no Chrome 61+).
  VLTV.rolar = function (el) {
    if (!el) { return; }
    if (el.scrollIntoViewIfNeeded) { el.scrollIntoViewIfNeeded(false); }
    else { el.scrollIntoView(false); }
  };

  // ── Cursor e roda do controle (Magic Remote) ─────────────────────
  // VLTV.cursor.andou(e): o cursor andou de verdade? Ignora o tremido da mão, a lista rolando por baixo
  // dele e o leve movimento que o controle faz ao apertar um botão (ex.: Voltar com o cursor sobre uma capa).
  // Depois de apertar qualquer tecla, o app entra em "modo teclado": o cursor só volta a mandar no foco
  // quando se afasta bem do ponto onde estava quando a tecla foi apertada.
  var LIMIAR_CURSOR_PX = 10;
  var LIMIAR_APOS_TECLA_PX = 40;
  var QUIETO_APOS_TECLA_MS = 800;
  var cursorRefX = -1000;
  var cursorRefY = -1000;
  var cursorUltimoX = -1000;
  var cursorUltimoY = -1000;
  var cursorQuietoAte = 0;
  var modoTeclado = false;

  // Guarda sempre a última posição do cursor, mesmo nos movimentos que o app ignora.
  document.addEventListener('mousemove', function (e) {
    cursorUltimoX = e.clientX;
    cursorUltimoY = e.clientY;
  }, true);

  document.addEventListener('keydown', function () {
    cursorQuietoAte = new Date().getTime() + QUIETO_APOS_TECLA_MS;
    cursorRefX = cursorUltimoX;
    cursorRefY = cursorUltimoY;
    modoTeclado = true;
  }, true);

  // Última vez que o usuário mexeu no controle (tecla, cursor, roda ou clique).
  // O trabalho pesado em segundo plano (índice da pesquisa, canais) só anda quando o controle está parado.
  var ultimaAtividadeMs = 0;
  function marcarAtividade() { ultimaAtividadeMs = new Date().getTime(); }
  document.addEventListener('keydown', marcarAtividade, true);
  document.addEventListener('mousemove', marcarAtividade, true);
  document.addEventListener('wheel', marcarAtividade, true);
  document.addEventListener('click', marcarAtividade, true);
  VLTV.ociosoHa = function (ms) { return (new Date().getTime() - ultimaAtividadeMs) >= ms; };

  // Detector de travada: se o app ficou "preso" (o relógio atrasou), o trabalho em segundo plano recua por 2 s.
  // Assim ele continua andando enquanto você usa o controle, mas sai da frente sozinho quando a TV está sofrendo.
  // O recuo cresce quando as travadas se repetem (2 s, 4 s, 8 s... até 30 s) e volta a 2 s depois de 30 s sem travar.
  // Antes era sempre 2 s: o trabalho voltava a cada 2 s e travava a TV de novo, em ciclo.
  var recuarAteMs = 0;
  var ultimoTickMs = 0;
  var recuoAtualMs = 2000;
  var ultimaTravadaMs = 0;
  setInterval(function () {
    var n = new Date().getTime();
    if (ultimoTickMs && (n - ultimoTickMs) > 450) {
      recuoAtualMs = (n - ultimaTravadaMs) < 30000 ? Math.min(recuoAtualMs * 2, 30000) : 2000;
      ultimaTravadaMs = n;
      recuarAteMs = n + recuoAtualMs;
    }
    ultimoTickMs = n;
  }, 250);

  // leve = true: passo pequeno (lista de uma categoria), anda mesmo com o controle em uso, só com uma folguinha entre teclas.
  // leve = false: passo pesado (índice inteiro da pesquisa), só anda com o controle realmente parado.
  // Logo que o app abre (TV acabou de ligar, vinha do YouTube...) a TV ainda está ocupada abrindo o próprio app.
  // Nesse começo nenhum trabalho em segundo plano anda: o controle responde de imediato.
  var inicioAppMs = new Date().getTime();

  VLTV.segundoPlanoLivre = function (leve) {
    var n = new Date().getTime();
    var graca = (VLTV.config && typeof VLTV.config.GRACA_INICIAL_MS === 'number') ? VLTV.config.GRACA_INICIAL_MS : 8000;
    if (n - inicioAppMs < graca) { return false; }
    if (n < recuarAteMs) { return false; }
    var cfg = VLTV.config || {};
    var minimo = leve ? (cfg.OCIOSO_LEVE_MS || 600) : (cfg.OCIOSO_MS || 3000);
    return (n - ultimaAtividadeMs) >= minimo;
  };

  // Roda fn() só quando o controle estiver parado (leve = true: folga curta; false: folga longa).
  // Usado para o trabalho que não dá para dividir em pedaços, como ler (JSON.parse) uma lista grande que acabou de chegar:
  // a TV baixa a lista em qualquer momento, mas só a "abre" quando você solta o controle.
  // Se o controle nunca parar, roda mesmo assim depois de esperaMaxMs (padrão 60 s).
  VLTV.quandoLivre = function (leve, fn, esperaMaxMs) {
    var limite = new Date().getTime() + (esperaMaxMs || 60000);
    (function tentar() {
      if (VLTV.segundoPlanoLivre(leve) || new Date().getTime() >= limite) { fn(); return; }
      setTimeout(tentar, 400);
    })();
  };

  // Fila do trabalho pesado em segundo plano (preparo de canais, filmes, séries e pesquisa).
  // Roda UMA tarefa por vez, só com o controle parado, e deixa uma folga entre uma e outra.
  // Antes, três preparos começavam juntos 1,5 s, 2,5 s e 3 s depois da Home e a TV travava.
  var filaFundo = [];
  var rodandoFundo = false;
  var FOLGA_ENTRE_TAREFAS_MS = 1500;
  function andarFundo() {
    if (filaFundo.length === 0) { rodandoFundo = false; return; }
    rodandoFundo = true;
    if (!VLTV.segundoPlanoLivre(false)) { setTimeout(andarFundo, 500); return; }
    var tarefa = filaFundo.shift();
    try { tarefa(); } catch (e) { /* o preparo nunca pode atrapalhar o app */ }
    setTimeout(andarFundo, FOLGA_ENTRE_TAREFAS_MS);
  }
  VLTV.emSegundoPlano = function (tarefa) {
    filaFundo.push(tarefa);
    if (!rodandoFundo) { setTimeout(andarFundo, 500); rodandoFundo = true; }
  };

  VLTV.cursor = {
    andou: function (e) {
      if (new Date().getTime() < cursorQuietoAte) { return false; }
      var dx = e.clientX - cursorRefX;
      var dy = e.clientY - cursorRefY;
      var limiar = modoTeclado ? LIMIAR_APOS_TECLA_PX : LIMIAR_CURSOR_PX;
      if (dx * dx + dy * dy < limiar * limiar) { return false; }
      cursorRefX = e.clientX;
      cursorRefY = e.clientY;
      modoTeclado = false;
      return true;
    }
  };

  // Roda do controle: chama tratador(sentido, e), sentido = +1 (para baixo) ou -1 (para cima).
  VLTV.aoRodar = function (el, tratador) {
    el.addEventListener('wheel', function (e) {
      var d = e.deltaY;
      if (!d && e.wheelDelta) { d = -e.wheelDelta; }
      if (!d) { return; }
      e.preventDefault();
      tratador(d > 0 ? 1 : -1, e, Math.abs(d));
    }, false);
  };

  // Rola uma lista (overflow hidden) com a roda. Devolve true se andou.
  VLTV.rolarRoda = function (lista, sentido, intensidade) {
    var passo = Math.max(90, Math.min(240, intensidade || 120));
    var antes = lista.scrollTop;
    lista.scrollTop = antes + sentido * passo;
    return lista.scrollTop !== antes;
  };

  // Elemento (filho direto de "pai") que está sob o ponto da tela, ou null.
  VLTV.filhoNoPonto = function (pai, x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el.parentNode !== pai) { el = el.parentNode; }
    return el || null;
  };

  VLTV.platform = detectar();
})();
