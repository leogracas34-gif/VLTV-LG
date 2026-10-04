// VLTV Play - webOS | Login Xtream: testa todos os DNS ao mesmo tempo e usa o primeiro que responder.
(function () {
  'use strict';

  var CH_DNS = 'vltv_dns';
  var CH_USER = 'vltv_user';
  var CH_PASS = 'vltv_pass';

  // ── Sessão salva no aparelho ──────────────────────────────────────
  var sessao = {
    ler: function () {
      try {
        var dns = localStorage.getItem(CH_DNS);
        var user = localStorage.getItem(CH_USER);
        var pass = localStorage.getItem(CH_PASS);
        if (dns && user && pass) { return { dns: dns, user: user, pass: pass }; }
      } catch (e) { /* ignora */ }
      return null;
    },
    salvar: function (dns, user, pass) {
      try {
        localStorage.setItem(CH_DNS, dns);
        localStorage.setItem(CH_USER, user);
        localStorage.setItem(CH_PASS, pass);
      } catch (e) { /* ignora */ }
    },
    limpar: function () {
      try {
        localStorage.removeItem(CH_DNS);
        localStorage.removeItem(CH_USER);
        localStorage.removeItem(CH_PASS);
      } catch (e) { /* ignora */ }
    }
  };

  // ── Teste de um servidor ──────────────────────────────────────────
  // Resolve sempre com { estado, base, info }.
  // estado: 'ok' | 'expirado' | 'invalido' | 'erro'
  function testarServidor(base, user, pass) {
    var url = base + '/player_api.php?username=' + encodeURIComponent(user) +
              '&password=' + encodeURIComponent(pass);

    return VLTV.http.fetchComTimeout(url, VLTV.config.LOGIN_TIMEOUT_MS)
      .then(function (r) {
        if (!r.ok) { return { estado: 'erro', base: base }; }
        return r.text();
      })
      .then(function (corpo) {
        if (typeof corpo !== 'string') { return corpo; }
        var json;
        try { json = JSON.parse(corpo); } catch (e) { return { estado: 'erro', base: base }; }

        var ui = json && json.user_info;
        if (!ui || !json.server_info) { return { estado: 'invalido', base: base }; }
        if (String(ui.auth) === '0') { return { estado: 'invalido', base: base }; }

        var situacao = String(ui.status || '').toLowerCase();
        if (situacao === 'expired' || situacao === 'disabled') {
          var teste = /^(1|true)$/i.test(String(ui.is_trial || ''));
          return { estado: 'expirado', base: base, info: ui, teste: teste };
        }
        return { estado: 'ok', base: base, info: ui };
      })
      .catch(function () { return { estado: 'erro', base: base }; });
  }

  // ── Login ─────────────────────────────────────────────────────────
  // dnsPreferido (opcional) vai na frente da fila.
  // Resolve com { estado, base, info, teste }.
  function login(user, pass, dnsPreferido) {
    var servidores = VLTV.dns.lista();
    if (dnsPreferido) {
      var pref = VLTV.dns.normalizar(dnsPreferido);
      servidores = [pref].concat(servidores.filter(function (s) { return s !== pref; }));
    }

    return new Promise(function (resolve) {
      var pendentes = servidores.length;
      var viuInvalido = false;
      var terminou = false;

      if (pendentes === 0) { resolve({ estado: 'erro' }); return; }

      servidores.forEach(function (base) {
        testarServidor(base, user, pass).then(function (res) {
          if (terminou) { return; }
          if (res.estado === 'ok' || res.estado === 'expirado') {
            terminou = true;
            resolve(res);
            return;
          }
          if (res.estado === 'invalido') { viuInvalido = true; }
          pendentes--;
          if (pendentes === 0) {
            terminou = true;
            resolve({ estado: viuInvalido ? 'invalido' : 'erro' });
          }
        });
      });
    });
  }

  VLTV.sessao = sessao;
  VLTV.xtream = { login: login };
})();
