// VLTV Play - webOS | Temporizador para dormir (Configurações > Temporizador para dormir).
// Passado o tempo escolhido, a imagem para e o aplicativo fecha. Um minuto antes aparece um aviso com
// dois botões: "Continuar assistindo" (DESLIGA o temporizador — ele não volta a contar) e "Fechar agora".
// A tecla Voltar do controle também fecha agora.
(function () {
  'use strict';

  var AVISO_S = 60;
  var OPCOES = [0, 15, 30, 45, 60, 90, 120];   // minutos; 0 = desligado

  function $(id) { return document.getElementById(id); }

  var minutos = 0;          // duração escolhida
  var fimMs = 0;            // quando acaba (relógio da TV); 0 = desligado
  var timer = null;
  var aviso = $('aviso-sono');
  var avisoTexto = $('aviso-sono-contagem');
  var avisoBtn = $('aviso-sono-continuar');
  var avisoFechar = $('aviso-sono-fechar');
  var aoDesligar = null;

  function agora() { return new Date().getTime(); }

  function restanteMs() { return fimMs ? Math.max(0, fimMs - agora()) : 0; }

  function avisoAberto() { return !!aviso && !aviso.classList.contains('escondida'); }

  function fecharAviso() { if (aviso) { aviso.classList.add('escondida'); } }

  function pad(n) { return ('0' + n).slice(-2); }

  function horaFim() {
    if (!fimMs) { return ''; }
    var d = new Date(fimMs);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function parar() {
    clearInterval(timer);
    timer = null;
    fimMs = 0;
    fecharAviso();
  }

  function desligarAgora() {
    parar();
    minutos = 0;
    if (aoDesligar) { try { aoDesligar(); } catch (e) { /* ignora */ } }
  }

  function textoContagem(seg) {
    return 'O aplicativo vai fechar em ' + seg + (seg === 1 ? ' segundo.' : ' segundos.');
  }

  function tique() {
    if (!fimMs) { return; }
    var falta = restanteMs();
    if (falta <= 0) { desligarAgora(); return; }
    if (falta <= AVISO_S * 1000 + 500) {
      if (aviso && aviso.classList.contains('escondida')) {
        aviso.classList.remove('escondida');
        if (avisoBtn) { avisoBtn.focus(); }
      }
      if (avisoTexto) { avisoTexto.textContent = textoContagem(Math.ceil(falta / 1000)); }
    }
  }

  function definir(min) {
    parar();
    minutos = min > 0 ? min : 0;
    if (!minutos) { return; }
    fimMs = agora() + minutos * 60000;
    timer = setInterval(tique, 1000);
  }

  // "Continuar assistindo": o cliente respondeu que está assistindo, então o temporizador é DESLIGADO
  // (antes ele recomeçava com o mesmo tempo e ficava marcado em Configurações). Para dormir de novo,
  // é só escolher o tempo outra vez.
  function continuar() {
    parar();
    minutos = 0;
  }

  // Teclas enquanto o aviso está na tela. Devolve true se usou a tecla.
  function tecla(k) {
    // Setas: alternam entre os dois botões.
    if (k === 37 || k === 38 || k === 39 || k === 40) {
      var alvo = (document.activeElement === avisoBtn) ? avisoFechar : avisoBtn;
      if (alvo) { alvo.focus(); }
      return true;
    }
    // OK: faz o que o botão em foco diz (por padrão, "Continuar assistindo").
    if (k === 13) {
      if (document.activeElement === avisoFechar) { desligarAgora(); } else { continuar(); }
      return true;
    }
    // Voltar: fecha agora (o mesmo de antes).
    if (k === 461 || k === 27) { desligarAgora(); return true; }
    return true;   // o aviso fica com todas as teclas
  }

  if (avisoBtn) { avisoBtn.addEventListener('click', continuar); }
  if (avisoFechar) { avisoFechar.addEventListener('click', desligarAgora); }

  VLTV.sono = {
    opcoes: function () { return OPCOES.slice(); },
    minutos: function () { return minutos; },
    definir: definir,
    restanteMs: restanteMs,
    horaFim: horaFim,
    avisoAberto: avisoAberto,
    tecla: tecla,
    aoDesligar: function (f) { aoDesligar = f; }
  };
})();
