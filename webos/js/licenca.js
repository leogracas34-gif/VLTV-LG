// VLTV Play - webOS | Licença: teste grátis de 7 dias por TV e ativação anual.
// A TV se apresenta à VPS (/lg/register) e recebe o estado: trial | active | expired | blocked.
(function () {
  'use strict';

  var CH_ID = 'vltv_dev_id';
  var CH_CACHE = 'vltv_licenca';
  var TOLERANCIA_OFFLINE_S = 3 * 86400;   // sem internet: vale o último estado por até 3 dias

  var estadoAtual = null;

  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  function agoraS() { return Math.floor(new Date().getTime() / 1000); }

  function lerMac(pronto) {
    var terminou = false;
    function fim(v) { if (terminou) { return; } terminou = true; pronto(v || ''); }
    setTimeout(function () { fim(''); }, 2500);
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

  function aleatorio(n) {
    var a = '0123456789ABCDEF', s = '';
    try {
      var b = new Uint8Array(n);
      (window.crypto || window.msCrypto).getRandomValues(b);
      for (var i = 0; i < n; i++) { s += a[b[i] % 16]; }
      return s;
    } catch (e) { /* segue */ }
    for (var j = 0; j < n; j++) { s += a[Math.floor(Math.random() * 16)]; }
    return s;
  }

  // Identidade da TV: fica guardada; se a TV informa o MAC, ele é a base (sobrevive a reinstalar o app).
  function identidade(pronto) {
    lerMac(function (mac) {
      var limpo = mac.replace(/[^0-9A-F]/g, '');
      var id = ler(CH_ID);
      if (!id) {
        id = limpo.length === 12 ? 'mac-' + limpo : 'uid-' + aleatorio(24);
        gravar(CH_ID, id);
      }
      pronto({ id: id, mac: limpo.length === 12 ? limpo : '' });
    });
  }

  function cache() {
    try { return JSON.parse(ler(CH_CACHE) || 'null'); } catch (e) { return null; }
  }

  function chamar(metodo, caminho, corpo, token) {
    var cfg = VLTV.config;
    var url = cfg.LICENCA_URL + caminho;
    var opcoes = { method: metodo, headers: {} };
    if (corpo) { opcoes.headers['Content-Type'] = 'application/json'; opcoes.body = JSON.stringify(corpo); }
    if (token) { opcoes.headers['Authorization'] = 'Bearer ' + token; }
    var temporizador;
    var limite = new Promise(function (_, rej) { temporizador = setTimeout(function () { rej(new Error('tempo')); }, 9000); });
    return Promise.race([fetch(url, opcoes), limite]).then(function (r) {
      clearTimeout(temporizador);
      return r.json().then(function (j) { return { status: r.status, json: j }; }, function () { return { status: r.status, json: {} }; });
    });
  }

  function guardar(j, id) {
    estadoAtual = { estado: j.estado, codigo: j.codigo, dias: j.dias, expira_em: j.expira_em, pagar_url: j.pagar_url };
    gravar(CH_CACHE, JSON.stringify({ e: estadoAtual, token: j.token, id: id, em: agoraS() }));
  }

  // Resolve { estado: 'trial'|'active'|'expired'|'blocked'|'erro', codigo, dias, pagar_url }
  function verificar() {
    return new Promise(function (resolve) {
      identidade(function (ident) {
        var c = cache();

        function offline() {
          // Sem resposta do servidor: confia no último estado por pouco tempo, para não travar quem está sem internet.
          if (c && c.e && c.id === ident.id) {
            var idade = agoraS() - c.em;
            var venceu = c.e.expira_em && c.e.expira_em < agoraS();
            if (idade < TOLERANCIA_OFFLINE_S && !venceu && (c.e.estado === 'trial' || c.e.estado === 'active')) {
              estadoAtual = c.e;
              resolve(c.e);
              return;
            }
          }
          resolve({ estado: 'erro' });
        }

        function registrar() {
          chamar('POST', '/lg/register', { device_id: ident.id, mac: ident.mac, model: (VLTV.platform && VLTV.platform.modelo) || '', version: VLTV.config.VERSAO })
            .then(function (r) {
              if (r.status === 200 && r.json && r.json.estado) { guardar(r.json, ident.id); resolve(estadoAtual); return; }
              if (r.status >= 500 || r.status === 0) { offline(); return; }
              resolve({ estado: 'erro', texto: r.json && r.json.error });
            })
            .catch(offline);
        }

        if (c && c.token && c.id === ident.id) {
          chamar('GET', '/lg/status', null, c.token).then(function (r) {
            if (r.status === 200 && r.json && r.json.estado) { guardar(r.json, ident.id); resolve(estadoAtual); }
            else if (r.status === 401 || r.status === 404) { registrar(); }   // token vencido: se apresenta de novo
            else { offline(); }
          }).catch(offline);
        } else {
          registrar();
        }
      });
    });
  }

  // ── Visual remoto (cores, logo, campanha) ──
  function aplicarVisual() {
    chamar('GET', '/lg/config').then(function (r) {
      if (r.status !== 200) { return; }
      var v = r.json || {};
      var raiz = document.documentElement;
      function cor(x) { return /^#[0-9A-Fa-f]{3,8}$/.test(x || ''); }
      if (cor(v.cor_destaque)) { raiz.style.setProperty('--destaque', v.cor_destaque); raiz.style.setProperty('--destaque-claro', v.cor_destaque); }
      if (cor(v.cor_fundo)) { raiz.style.setProperty('--fundo', v.cor_fundo); }
      VLTV.visual = v;
      var faixa = document.getElementById('faixa-campanha');
      if (faixa) {
        var ate = v.aviso_ate ? new Date(v.aviso_ate + 'T23:59:59') : null;
        var vale = v.aviso_texto && (!ate || ate.getTime() >= new Date().getTime());
        faixa.textContent = vale ? ((v.aviso_titulo ? v.aviso_titulo + ' — ' : '') + v.aviso_texto) : '';
        faixa.style.background = cor(v.aviso_cor) ? v.aviso_cor : '';
        faixa.classList.toggle('escondida', !vale);
      }
    }).catch(function () { /* sem visual remoto: fica o padrão */ });
  }

  function dataBr(s) {
    var d = new Date(s * 1000);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }

  // Ex.: "Teste grátis: 5 dias (até 12/10/2026)" ou "Ativa até 07/10/2027"
  function textoCurto() {
    var e = estadoAtual;
    if (!e) { return ''; }
    if (e.estado === 'active') { return 'Ativa até ' + dataBr(e.expira_em); }
    return 'Teste grátis: ' + e.dias + (e.dias === 1 ? ' dia' : ' dias') + ' (até ' + dataBr(e.expira_em) + ')';
  }

  // Linha pequena na tela de login: o código da TV e a situação da licença.
  function mostrarNoLogin() {
    var el = document.getElementById('login-licenca');
    if (!el || !estadoAtual) { return; }
    el.textContent = 'Código da TV: ' + estadoAtual.codigo + '  •  ' + textoCurto();
  }

  VLTV.licenca = {
    textoCurto: textoCurto,
    mostrarNoLogin: mostrarNoLogin,
    verificar: verificar,
    estado: function () { return estadoAtual; },
    aplicarVisual: aplicarVisual
  };
})();
