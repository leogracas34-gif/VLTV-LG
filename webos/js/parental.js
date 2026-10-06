// VLTV Play - webOS | Controle parental: senha de 4 dígitos (padrão 0000), pergunta secreta para recuperar
// a senha e bloqueio de conteúdo adulto (canais, filmes e séries).
//
// Como o bloqueio funciona:
//  - Categorias adultas (pelo nome) ficam com cadeado e pedem a senha para abrir (ou somem, no modo "Ocultar").
//  - Títulos e canais adultos (marcados como adultos pelo painel, com nome adulto ou de categoria adulta)
//    não aparecem nas listas enquanto o conteúdo estiver bloqueado.
//  - Filmes com classificação 18+ pedem a senha na hora de assistir.
//  - Depois de digitar a senha o conteúdo fica liberado até voltar para a tela inicial (ou fechar o app).
//  - Banner da Home e pesquisa NUNCA mostram conteúdo adulto.
(function () {
  'use strict';

  var CHAVE = 'vltv_parental';
  var TECLA = { ENTER: 13, ESC: 27, VOLTAR: 461, ESQ: 37, CIMA: 38, DIR: 39, BAIXO: 40 };

  var PERGUNTAS = [
    'Qual o nome do seu primeiro animal de estimação?',
    'Em que cidade você nasceu?',
    'Qual o nome da sua primeira escola?',
    'Qual o nome da sua melhor amiga ou do seu melhor amigo de infância?',
    'Qual o seu filme favorito?'
  ];

  var ICONE_CADEADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';

  // ── Detecção de conteúdo adulto ───────────────────────────────────
  var REGEX_CATEGORIA = /(^|[^a-z])(adult[oa]?s?|xxx|porn[oô]?|hentai|nsfw|er[oó]tic[oa]s?|sexy|sexo|sensual|playboy)([^a-z]|$)|\+\s?18|18\s?\+|\b18\s?anos/i;
  var REGEX_TITULO = /(^|[^a-z])(xxx|porn[oô]?|hentai|nsfw)([^a-z]|$)|\+\s?18|18\s?\+|[\[\(]\s?adult[oa]?\s?[\]\)]/i;
  var REGEX_IDADE = /(^|\D)18(\D|$)|nc-?17|^x$|r-?18|a-?18|\+\s?18/i;

  function ehCategoriaAdulta(nome) { return REGEX_CATEGORIA.test(String(nome || '')); }
  function ehNomeAdulto(nome) { return REGEX_TITULO.test(String(nome || '')); }

  function idadeAdulta(info) {
    if (!info || typeof info !== 'object') { return false; }
    var txt = String(info.age || info.mpaa_rating || info.age_rating || info.certification || '').toUpperCase();
    return txt !== '' && REGEX_IDADE.test(txt);
  }

  // category_id das categorias adultas já vistas: 'tipo|id' -> true
  var adultas = {};

  // ── Estado guardado ───────────────────────────────────────────────
  var estado = null;
  var liberado = false;

  function padrao() { return { ativo: true, modo: 'senha', pin: null, perg: null, resp: null }; }

  function ler() {
    if (estado) { return estado; }
    var e = padrao();
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        var o = JSON.parse(bruto);
        if (o && typeof o === 'object') {
          e.ativo = o.ativo !== false;
          e.modo = o.modo === 'ocultar' ? 'ocultar' : 'senha';
          e.pin = o.pin || null;
          e.perg = typeof o.perg === 'number' ? o.perg : null;
          e.resp = o.resp || null;
        }
      }
    } catch (err) { /* usa o padrão */ }
    estado = e;
    return e;
  }

  function gravar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(ler())); } catch (e) { /* ignora */ }
  }

  // Hash simples (FNV-1a): a senha não fica escrita às claras na TV.
  function hash(texto) {
    var h = 2166136261;
    var t = 'vltv|' + texto;
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return String(h);
  }

  function normalizarResposta(t) {
    var s = String(t || '').toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* TV sem normalize */ }
    return s.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function verificar(pin) {
    var e = ler();
    if (e.pin === null) { return pin === '0000'; }
    return hash(pin) === e.pin;
  }

  function verificarResposta(texto) {
    var e = ler();
    return !!e.resp && hash(normalizarResposta(texto)) === e.resp;
  }

  function ativo() { return ler().ativo; }
  function modo() { return ler().modo; }
  function senhaPadrao() { return ler().pin === null; }
  function temPergunta() { var e = ler(); return e.perg !== null && !!e.resp; }
  function perguntaAtual() { var e = ler(); return e.perg !== null ? PERGUNTAS[e.perg] || '' : ''; }

  function definirAtivo(v) { ler().ativo = !!v; gravar(); }
  function definirModo(m) { ler().modo = m === 'ocultar' ? 'ocultar' : 'senha'; gravar(); }

  function bloqueando() { return ler().ativo && !liberado; }
  function liberar() { liberado = true; }
  function travar() { liberado = false; }

  // ── Filtros usados pelas telas ────────────────────────────────────
  // Marca as categorias adultas (adulta: true) e, no modo "Ocultar", tira elas da lista enquanto bloqueado.
  function filtrarCategorias(tipo, lista) {
    var saida = [];
    (Array.isArray(lista) ? lista : []).forEach(function (c) {
      if (c && ehCategoriaAdulta(c.category_name)) {
        adultas[tipo + '|' + c.category_id] = true;
        if (ler().ativo && ler().modo === 'ocultar' && !liberado) { return; }
        var copia = {};
        Object.keys(c).forEach(function (k) { copia[k] = c[k]; });
        copia.adulta = true;
        saida.push(copia);
      } else {
        saida.push(c);
      }
    });
    return saida;
  }

  function itemAdulto(raw, tipo) {
    if (!raw) { return false; }
    var v = String(raw.is_adult === undefined || raw.is_adult === null ? '' : raw.is_adult);
    if (v === '1' || v.toLowerCase() === 'true') { return true; }
    if (ehNomeAdulto(raw.name)) { return true; }
    if (raw.category_id !== undefined && raw.category_id !== null) {
      var tipos = tipo ? [tipo] : ['filmes', 'series', 'canais'];
      for (var i = 0; i < tipos.length; i++) {
        if (adultas[tipos[i] + '|' + raw.category_id]) { return true; }
      }
    }
    return false;
  }

  // Tira os itens adultos da lista enquanto o conteúdo estiver bloqueado.
  function filtrarItens(lista, tipo) {
    if (!bloqueando() || !Array.isArray(lista)) { return lista; }
    return lista.filter(function (x) { return !itemAdulto(x, tipo); });
  }

  // Antes de assistir: filme/série/canal adulto ou com classificação 18+ pede a senha.
  // ctx: { raw, info, tipo }. Chama pronto() quando pode assistir.
  function checarReproducao(ctx, pronto) {
    if (!bloqueando()) { pronto(); return; }
    if (itemAdulto(ctx && ctx.raw, ctx && ctx.tipo) || idadeAdulta(ctx && ctx.info)) {
      pedirSenha(pronto, { titulo: 'Conteúdo +18', sub: 'Digite a senha para assistir.' });
      return;
    }
    pronto();
  }

  // ── Janela de senha ───────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  var overlay = $('pin-overlay');
  var elTitulo = $('pin-titulo');
  var elSub = $('pin-sub');
  var elPontos = $('pin-pontos');
  var elTeclado = $('pin-teclado');
  var elEsqueci = $('pin-esqueci');
  var elForm = $('pin-form');
  var elPerg = $('pin-perg');
  var elResp = $('pin-resp');
  var elBtnOk = $('pin-btn-ok');
  var elBtnCancelar = $('pin-btn-cancelar');
  var elMsg = $('pin-msg');

  var TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'apagar', '0', 'cancelar'];
  var teclasEl = [];

  var aberto = false;
  var fase = '';            // 'pedir' | 'novo1' | 'novo2' | 'perg' | 'rec'
  var digitos = '';
  var pinNovo = '';
  var qIdx = 0;             // pergunta escolhida ao criar a senha
  var linha = 0;
  var coluna = 0;
  var zona = 'teclado';     // 'teclado' | 'esqueci' | 'form'
  var formIdx = 0;
  var formItens = [];
  var aoConcluir = null;
  var aoCancelar = null;
  var opcoesAtuais = {};

  function montarTeclado() {
    TECLAS.forEach(function (t) {
      var b = document.createElement('div');
      b.className = 'pin-tecla' + (t === 'apagar' || t === 'cancelar' ? ' pin-tecla-acao' : '');
      b.textContent = t === 'apagar' ? 'Apagar' : t === 'cancelar' ? 'Cancelar' : t;
      b.addEventListener('click', function () { apertar(t); });
      elTeclado.appendChild(b);
      teclasEl.push(b);
    });
  }
  montarTeclado();

  function mensagem(texto) { elMsg.textContent = texto || ''; }

  function desenharPontos() {
    var spans = elPontos.children;
    for (var i = 0; i < spans.length; i++) { spans[i].classList.toggle('cheio', i < digitos.length); }
  }

  function marcarFoco() {
    teclasEl.forEach(function (b, i) {
      b.classList.toggle('foco', zona === 'teclado' && i === linha * 3 + coluna);
    });
    elEsqueci.classList.toggle('foco', zona === 'esqueci');
    formItens.forEach(function (f, i) { f.el.classList.toggle('foco', zona === 'form' && i === formIdx); });
    if (zona === 'form' && formItens[formIdx] && formItens[formIdx].tipo === 'texto') {
      try { elResp.focus(); } catch (e) { /* ignora */ }
    } else {
      try { elResp.blur(); } catch (e2) { /* ignora */ }
    }
  }

  function mostrarTeclado(titulo, sub, comEsqueci) {
    elTitulo.textContent = titulo;
    elSub.textContent = sub || '';
    elPontos.classList.remove('escondida');
    elTeclado.classList.remove('escondida');
    elEsqueci.classList.toggle('escondida', !comEsqueci);
    elForm.classList.add('escondida');
    formItens = [];
    digitos = '';
    desenharPontos();
    zona = 'teclado';
    linha = 0;
    coluna = 0;
    marcarFoco();
  }

  function mostrarForm(titulo, sub, modoPergunta) {
    elTitulo.textContent = titulo;
    elSub.textContent = sub || '';
    elPontos.classList.add('escondida');
    elTeclado.classList.add('escondida');
    elEsqueci.classList.add('escondida');
    elForm.classList.remove('escondida');
    elResp.value = '';
    formItens = [];
    if (modoPergunta === 'escolher') {
      elPerg.textContent = '◀  ' + PERGUNTAS[qIdx] + '  ▶';
      formItens.push({ el: elPerg, tipo: 'pergunta' });
      elBtnOk.textContent = 'Salvar';
    } else {
      elPerg.textContent = perguntaAtual();
      formItens.push({ el: elPerg, tipo: 'fixa' });
      elBtnOk.textContent = 'Confirmar';
    }
    formItens.push({ el: elResp, tipo: 'texto' });
    formItens.push({ el: elBtnOk, tipo: 'ok' });
    formItens.push({ el: elBtnCancelar, tipo: 'cancelar' });
    zona = 'form';
    formIdx = 1;
    marcarFoco();
  }

  function abrirOverlay() {
    aberto = true;
    overlay.classList.remove('escondida');
    mensagem('');
  }

  function fechar() {
    aberto = false;
    overlay.classList.add('escondida');
    try { elResp.blur(); } catch (e) { /* ignora */ }
    digitos = '';
    pinNovo = '';
  }

  function cancelar() {
    var cb = aoCancelar;
    fechar();
    aoConcluir = null;
    aoCancelar = null;
    if (cb) { cb(); }
  }

  function terminarComSucesso() {
    var cb = aoConcluir;
    fechar();
    aoConcluir = null;
    aoCancelar = null;
    if (cb) { cb(); }
  }

  // ── Fluxos ────────────────────────────────────────────────────────
  // Pede a senha. op: { titulo, sub, sempre, cancelar }.
  function pedirSenha(pronto, op) {
    op = op || {};
    if (liberado && ler().ativo && !op.sempre) { pronto(); return; }
    opcoesAtuais = op;
    aoConcluir = function () { liberar(); pronto(); };
    aoCancelar = op.cancelar || null;
    fase = 'pedir';
    abrirOverlay();
    mostrarTeclado(op.titulo || 'Conteúdo protegido', op.sub || 'Digite a senha de 4 dígitos.', temPergunta());
  }

  // Criar (ou trocar) a senha e a pergunta secreta. fim(): chamado quando termina.
  function criarSenha(fim, cancelarFn) {
    aoConcluir = fim || null;
    aoCancelar = cancelarFn || null;
    fase = 'novo1';
    qIdx = 0;
    abrirOverlay();
    mostrarTeclado('Criar nova senha', 'Digite 4 números.', false);
  }

  function iniciarRecuperacao() {
    fase = 'rec';
    mensagem('');
    mostrarForm('Recuperar senha', 'Responda a pergunta secreta.', 'fixa');
  }

  function aposPin() {
    if (fase === 'pedir') {
      if (verificar(digitos)) { terminarComSucesso(); return; }
      mensagem('Senha incorreta.');
      digitos = '';
      desenharPontos();
      return;
    }
    if (fase === 'novo1') {
      if (digitos === '0000') {
        mensagem('Escolha uma senha diferente de 0000.');
        digitos = '';
        desenharPontos();
        return;
      }
      pinNovo = digitos;
      fase = 'novo2';
      mostrarTeclado('Confirmar senha', 'Digite a mesma senha de novo.', false);
      return;
    }
    if (fase === 'novo2') {
      if (digitos === pinNovo) {
        fase = 'perg';
        mensagem('');
        mostrarForm('Pergunta secreta', 'Ajuda a recuperar a senha se você esquecer.', 'escolher');
        return;
      }
      fase = 'novo1';
      pinNovo = '';
      mostrarTeclado('Criar nova senha', 'Digite 4 números.', false);
      mensagem('As senhas não conferem. Tente de novo.');
    }
  }

  function digitar(d) {
    if (digitos.length >= 4) { return; }
    mensagem('');
    digitos += d;
    desenharPontos();
    if (digitos.length === 4) { setTimeout(aposPin, 120); }
  }

  function apertar(t) {
    if (t === 'apagar') { digitos = digitos.slice(0, -1); desenharPontos(); mensagem(''); }
    else if (t === 'cancelar') { cancelar(); }
    else { digitar(t); }
  }

  function trocarPergunta(passo) {
    qIdx = (qIdx + passo + PERGUNTAS.length) % PERGUNTAS.length;
    elPerg.textContent = '◀  ' + PERGUNTAS[qIdx] + '  ▶';
  }

  function confirmarForm() {
    var resposta = elResp.value;
    if (normalizarResposta(resposta).length < 2) { mensagem('Digite a resposta.'); return; }
    if (fase === 'perg') {
      var e = ler();
      e.pin = hash(pinNovo);
      e.perg = qIdx;
      e.resp = hash(normalizarResposta(resposta));
      gravar();
      terminarComSucesso();
      return;
    }
    if (fase === 'rec') {
      if (verificarResposta(resposta)) {
        mensagem('');
        var fim = aoConcluir;
        var canc = aoCancelar;
        // Resposta certa: cria uma nova senha e, ao terminar, segue como se tivesse digitado a senha.
        criarSenha(fim, canc);
        return;
      }
      mensagem('Resposta incorreta.');
    }
  }

  function aplicarFormItem(f) {
    if (f.tipo === 'ok') { confirmarForm(); }
    else if (f.tipo === 'cancelar') { cancelar(); }
  }

  elEsqueci.addEventListener('click', iniciarRecuperacao);
  elBtnOk.addEventListener('click', confirmarForm);
  elBtnCancelar.addEventListener('click', cancelar);

  // ── Teclas ────────────────────────────────────────────────────────
  // Devolve true se a tecla foi usada (o app então não faz mais nada com ela).
  function tecla(k) {
    if (!aberto) { return false; }

    if (k === TECLA.VOLTAR || k === TECLA.ESC) { cancelar(); return true; }

    if (zona === 'form') {
      var f = formItens[formIdx];
      var digitandoTexto = f && f.tipo === 'texto';
      if (k === TECLA.CIMA) { formIdx = Math.max(0, formIdx - 1); marcarFoco(); return true; }
      if (k === TECLA.BAIXO) { formIdx = Math.min(formItens.length - 1, formIdx + 1); marcarFoco(); return true; }
      if (digitandoTexto) { return false; }     // OK abre o teclado da TV; as letras vão para o campo
      if (f && f.tipo === 'pergunta') {
        if (k === TECLA.ESQ) { trocarPergunta(-1); return true; }
        if (k === TECLA.DIR || k === TECLA.ENTER) { trocarPergunta(1); return true; }
      }
      if (k === TECLA.ENTER && f) { aplicarFormItem(f); return true; }
      return true;
    }

    if (zona === 'esqueci') {
      if (k === TECLA.CIMA) { zona = 'teclado'; linha = 3; coluna = 1; marcarFoco(); }
      else if (k === TECLA.ENTER) { iniciarRecuperacao(); }
      return true;
    }

    // Teclado numérico
    if ((k >= 48 && k <= 57) || (k >= 96 && k <= 105)) {
      digitar(String(k >= 96 ? k - 96 : k - 48));
      return true;
    }
    if (k === TECLA.ESQ) { coluna = Math.max(0, coluna - 1); }
    else if (k === TECLA.DIR) { coluna = Math.min(2, coluna + 1); }
    else if (k === TECLA.CIMA) { linha = Math.max(0, linha - 1); }
    else if (k === TECLA.BAIXO) {
      if (linha === 3 && !elEsqueci.classList.contains('escondida')) { zona = 'esqueci'; }
      else { linha = Math.min(3, linha + 1); }
    }
    else if (k === TECLA.ENTER) { apertar(TECLAS[linha * 3 + coluna]); return true; }
    else { return true; }
    marcarFoco();
    return true;
  }

  VLTV.parental = {
    PERGUNTAS: PERGUNTAS,
    ICONE_CADEADO: ICONE_CADEADO,
    ativo: ativo,
    modo: modo,
    senhaPadrao: senhaPadrao,
    temPergunta: temPergunta,
    definirAtivo: definirAtivo,
    definirModo: definirModo,
    bloqueando: bloqueando,
    liberar: liberar,
    travar: travar,
    ehCategoriaAdulta: ehCategoriaAdulta,
    ehNomeAdulto: ehNomeAdulto,
    filtrarCategorias: filtrarCategorias,
    filtrarItens: filtrarItens,
    itemAdulto: itemAdulto,
    checarReproducao: checarReproducao,
    pedirSenha: pedirSenha,
    criarSenha: criarSenha,
    aberto: function () { return aberto; },
    tecla: tecla
  };
})();
