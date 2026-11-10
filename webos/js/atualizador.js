// VLTV Play | Atualizador temporário (enquanto a LG/Samsung não aprovam o app).
//
// COMO FUNCIONA
//  1) Ao abrir, o app consulta VPS/versao.json (limite de 3 s). Se a versão for maior, mostra um pop-up.
//  2) "Atualizar agora" baixa um único arquivo (pacote.json) com todo o código do app, confere e guarda na TV.
//  3) Na próxima abertura, este arquivo (que roda no <head>, antes de tudo) vê o pacote guardado e monta o app
//     com ele. O endereço do app NÃO muda, então listas, login e favoritos continuam na TV.
//  4) Rede de segurança: se o app novo der erro logo ao abrir, a TV descarta o pacote e volta para a versão
//     que veio instalada. A VPS fora do ar nunca impede o app de abrir.
//
// PARA A LOJA (LG/Samsung): deixe ATIVO = false. Com ele desligado, este arquivo não faz NADA (não consulta a VPS,
// não baixa código). O repositório de testes é o único com ATIVO = true.
//
// ES5 de propósito (TVs LG antigas usam Chrome 53).
window.VLTV = window.VLTV || {};

(function () {
  'use strict';

  // ── Ajustes (o publicar.py confere VERSAO_APK com config.js e appinfo.json) ──
  var ATIVO = true;                                   // true só no repositório de testes
  var VERSAO_APK = '1.4.5';                           // versão do que está instalado na TV
  var URL_BASE = 'https://vltvplay.tech/apptv/';      // pasta na VPS (termina com /)
  var TIMEOUT_VERSAO_MS = 3000;                       // consulta da versão: não segura o app
  var TIMEOUT_PACOTE_MS = 60000;                      // download do pacote
  var VERIFICAR_A_CADA_MS = 6 * 3600 * 1000;          // reconsulta se o app ficar aberto por muito tempo

  var CH_PACOTE = 'vltv_pacote_remoto';
  var CH_TENTATIVAS = 'vltv_pacote_tentativas';
  var CH_RECUSADA = 'vltv_pacote_recusada';           // versão que o cliente já disse "Depois"

  function plataforma() { return window.tizen ? 'samsung' : 'lg'; }
  function guardar(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function ler(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function apagar(k) { try { window.localStorage.removeItem(k); } catch (e) { /* nada */ } }

  // "1.4.10" > "1.4.9": compara número por número.
  function maior(a, b) {
    var x = String(a).split('.'), y = String(b).split('.'), i, n, m;
    for (i = 0; i < Math.max(x.length, y.length); i++) {
      n = parseInt(x[i] || '0', 10); m = parseInt(y[i] || '0', 10);
      if (n !== m) { return n > m; }
    }
    return false;
  }

  // Soma de conferência (FNV-1a 32 bits) igual à do publicar.py: pega pacote cortado ou corrompido.
  function hash(texto) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // ═══ PARTE 1: monta o app com o pacote guardado (roda no <head>, antes dos outros scripts) ═══
  if (ATIVO && !window.__VLTV_REMOTO) {
    try {
      var bruto = ler(CH_PACOTE);
      if (bruto) {
        var pac = JSON.parse(bruto);
        var tent = parseInt(ler(CH_TENTATIVAS) || '0', 10);
        if (!pac || !pac.html || !maior(pac.versao, VERSAO_APK)) {
          // Pacote velho (o app instalado já é igual ou mais novo): limpa.
          apagar(CH_PACOTE); apagar(CH_TENTATIVAS);
        } else if (tent >= 3) {
          // Abriu 3 vezes seguidas sem se confirmar: o pacote está com defeito. Volta para a versão instalada.
          apagar(CH_PACOTE); apagar(CH_TENTATIVAS);
        } else {
          guardar(CH_TENTATIVAS, String(tent + 1));
          document.open();
          document.write(pac.html);
          document.close();
          return;   // o app novo (com este mesmo arquivo dentro) assume daqui; este contexto para
        }
      }
    } catch (e) {
      apagar(CH_PACOTE); apagar(CH_TENTATIVAS);
    }
  }

  // ═══ PARTE 2: confirmação de que o app novo abriu bem ═══
  // Se passar 10 s sem erro de JavaScript, zera o contador de tentativas.
  var houveErro = false;
  if (ATIVO) {
    window.addEventListener('error', function () { houveErro = true; });
    setTimeout(function () { if (!houveErro) { apagar(CH_TENTATIVAS); } }, 10000);
  }

  // ═══ PARTE 3: verificação e pop-up ═══
  var aviso = null, btnSim = null, btnNao = null, msgEl = null, tituloEl = null, subEl = null;
  var focoAntes = null, versaoNova = null, baixando = false, estado = 'fechado';

  function $(id) { return document.getElementById(id); }

  function pedir(url, timeout, aoOk, aoErro) {
    var x = new XMLHttpRequest(), fim = false;
    function falha(m) { if (!fim) { fim = true; aoErro(m); } }
    try {
      x.open('GET', url, true);
      x.timeout = timeout;
      x.onload = function () {
        if (fim) { return; }
        if (x.status >= 200 && x.status < 300) { fim = true; aoOk(x.responseText); } else { falha('http ' + x.status); }
      };
      x.onerror = function () { falha('rede'); };
      x.ontimeout = function () { falha('tempo'); };
      x.send();
    } catch (e) { falha('erro'); }
  }

  function montarPopup() {
    if (aviso) { return; }
    aviso = document.createElement('div');
    aviso.id = 'aviso-atualizacao';
    aviso.className = 'confirma escondida';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-modal', 'true');
    aviso.innerHTML =
      '<div class="confirma-caixa">' +
      '<h2 id="atz-titulo">Nova versão disponível</h2>' +
      '<p id="atz-msg"></p>' +
      '<div class="confirma-botoes">' +
      '<button id="atz-nao" type="button" class="botao-conf">Depois</button>' +
      '<button id="atz-sim" type="button" class="botao-conf perigo">Atualizar agora</button>' +
      '</div>' +
      '<p id="atz-sub" class="aviso-sub">Use as setas para escolher e aperte OK.</p>' +
      '</div>';
    document.body.appendChild(aviso);
    tituloEl = $('atz-titulo'); msgEl = $('atz-msg'); subEl = $('atz-sub');
    btnSim = $('atz-sim'); btnNao = $('atz-nao');
    btnSim.addEventListener('click', atualizar);
    btnNao.addEventListener('click', function () {
      if (baixando) { return; }
      if (versaoNova) { guardar(CH_RECUSADA, versaoNova); }   // não pergunta de novo a mesma versão neste ciclo
      fechar();
    });
  }

  function abrir(info) {
    montarPopup();
    versaoNova = info.versao;
    estado = 'pergunta';
    tituloEl.textContent = 'Nova versão disponível';
    var txt = 'Versão ' + info.versao + ' (a sua é a ' + VERSAO_APK + ').';
    if (info.notas) { txt += ' ' + info.notas; }
    msgEl.textContent = txt;
    subEl.textContent = 'Use as setas para escolher e aperte OK.';
    btnSim.style.display = ''; btnNao.style.display = '';
    btnSim.textContent = 'Atualizar agora'; btnNao.textContent = 'Depois';
    focoAntes = document.activeElement;
    aviso.classList.remove('escondida');
    btnSim.focus();
  }

  function fechar() {
    if (!aviso) { return; }
    aviso.classList.add('escondida');
    estado = 'fechado';
    if (focoAntes && focoAntes.focus && document.body.contains(focoAntes)) { focoAntes.focus(); }
    focoAntes = null;
  }

  function mostrarFim(titulo, msg, botao) {
    estado = 'fim';
    tituloEl.textContent = titulo; msgEl.textContent = msg; subEl.textContent = '';
    btnSim.style.display = 'none'; btnNao.style.display = '';
    btnNao.textContent = botao || 'OK';
    btnNao.focus();
  }

  function atualizar() {
    if (baixando || !versaoNova) { return; }
    baixando = true;
    estado = 'baixando';
    tituloEl.textContent = 'Atualizando...';
    msgEl.textContent = 'Baixando a nova versão. Não desligue a TV.';
    subEl.textContent = '';
    btnSim.style.display = 'none'; btnNao.style.display = 'none';

    var pasta = URL_BASE + plataforma() + '/';
    pedir(pasta + 'pacote.json?v=' + encodeURIComponent(versaoNova), TIMEOUT_PACOTE_MS, function (texto) {
      baixando = false;
      var pac;
      try { pac = JSON.parse(texto); } catch (e) { pac = null; }
      if (!pac || !pac.html || pac.versao !== versaoNova || hash(pac.html) !== pac.hash) {
        mostrarFim('Não foi possível atualizar', 'O arquivo veio incompleto. Tente de novo mais tarde.');
        return;
      }
      apagar(CH_TENTATIVAS);
      if (!guardar(CH_PACOTE, texto)) {
        mostrarFim('Não foi possível atualizar', 'Sem espaço para guardar a atualização na TV.');
        return;
      }
      apagar(CH_RECUSADA);
      tituloEl.textContent = 'Atualizado!';
      msgEl.textContent = 'Abrindo a versão ' + versaoNova + '...';
      setTimeout(function () { window.location.reload(); }, 800);
    }, function () {
      baixando = false;
      mostrarFim('Sem conexão', 'Não foi possível baixar a atualização agora. Tente de novo mais tarde.');
    });
  }

  function naHome() {
    var h = $('tela-home');
    return !!h && h.className.indexOf('escondida') === -1;
  }

  function verificar() {
    if (!ATIVO || baixando || estado !== 'fechado') { return; }
    pedir(URL_BASE + plataforma() + '/versao.json?t=' + new Date().getTime(), TIMEOUT_VERSAO_MS, function (texto) {
      var info;
      try { info = JSON.parse(texto); } catch (e) { return; }
      if (!info || !info.versao) { return; }
      // Compara com o que está RODANDO agora (o app instalado ou o pacote já aplicado).
      var rodando = (VLTV.config && VLTV.config.VERSAO) || VERSAO_APK;
      if (!maior(info.versao, rodando)) { return; }
      if (ler(CH_RECUSADA) === info.versao) { return; }
      // Só interrompe na Home (nunca no meio de um filme ou canal). Fora dela, tenta de novo em 1 minuto.
      if (!naHome()) { setTimeout(verificar, 60000); return; }
      abrir(info);
    }, function () { /* VPS fora do ar ou sem internet: segue sem avisar */ });
  }

  // Teclas do controle enquanto o pop-up está aberto. Devolve true se usou a tecla.
  function tecla(k) {
    if (estado === 'fechado' || !aviso) { return false; }
    if (estado === 'baixando') { return true; }                      // segura tudo enquanto baixa
    if (k === 37 && btnNao.style.display !== 'none') { btnNao.focus(); return true; }
    if (k === 39 && btnSim.style.display !== 'none') { btnSim.focus(); return true; }
    if (k === 38 || k === 40) { return true; }
    if (k === 461 || k === 27 || k === 10009) { btnNao.click(); return true; }   // Voltar (LG, ESC, Samsung)
    return false;                                                    // OK: o clique do botão em foco resolve
  }

  VLTV.atualizador = {
    ativo: function () { return ATIVO; },
    aberto: function () { return estado !== 'fechado'; },
    tecla: tecla,
    verificar: verificar,
    versaoApk: function () { return VERSAO_APK; }
  };

  // Só consulta depois que a página terminou de carregar e o app teve tempo de abrir a Home.
  if (ATIVO) {
    window.addEventListener('load', function () {
      setTimeout(verificar, 4000);
      setInterval(verificar, VERIFICAR_A_CADA_MS);
    });
  }
})();
