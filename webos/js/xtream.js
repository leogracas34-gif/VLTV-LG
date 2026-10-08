// VLTV Play - webOS | Login Xtream: testa todos os DNS ao mesmo tempo e usa o primeiro que responder.
(function () {
  'use strict';

  var CH_DNS = 'vltv_dns';
  var CH_USER = 'vltv_user';
  var CH_PASS = 'vltv_pass';
  var CH_MODO = 'vltv_modo';
  var CH_CODIGO = 'vltv_codigo';
  var CH_M3U = 'vltv_m3u';
  var CH_ABA = 'vltv_aba';
  var CH_PAINEL = 'vltv_painel';

  function guardar(chave, valor) {
    try {
      if (valor) { localStorage.setItem(chave, valor); } else { localStorage.removeItem(chave); }
    } catch (e) { /* ignora */ }
  }

  function pegar(chave) {
    try { return localStorage.getItem(chave) || ''; } catch (e) { return ''; }
  }

  // ── Sessão salva no aparelho ──────────────────────────────────────
  // modo: 'usuario' | 'parceiro' | 'xtream' | 'm3u'
  var sessao = {
    ler: function () {
      var modo = pegar(CH_MODO) || 'usuario';
      var s = {
        modo: modo,
        dns: pegar(CH_DNS),
        user: pegar(CH_USER),
        pass: pegar(CH_PASS),
        codigo: pegar(CH_CODIGO),
        m3u: pegar(CH_M3U),
        painel: pegar(CH_PAINEL)
      };
      // Conta do VLTV Play: sempre pelo gateway (apaga qualquer DNS antigo guardado na TV).
      if (modo === 'usuario') { s.dns = VLTV.dns.gateway(); }
      if (modo === 'm3u') { return s.m3u ? s : null; }
      if (modo === 'parceiro' && !s.codigo) { return null; }
      return s.dns && s.user && s.pass ? s : null;
    },
    salvar: function (d) {
      guardar(CH_MODO, d.modo);
      guardar(CH_DNS, d.dns);
      guardar(CH_USER, d.user);
      guardar(CH_PASS, d.pass);
      guardar(CH_CODIGO, d.codigo);
      guardar(CH_M3U, d.m3u);
      guardar(CH_ABA, d.modo);
      if (d.modo !== 'usuario') { guardar(CH_PAINEL, ''); }
    },
    // Nome que o app manda para o backend da VPS (Top 10, créditos): no VLTV Play é um código
    // neutro do painel ("painel:ID"), nunca o DNS real.
    dominio: function () {
      var s = sessao.ler();
      if (!s) { return ''; }
      return s.modo === 'usuario' && s.painel ? 'painel:' + s.painel : s.dns;
    },
    limpar: function () {
      [CH_DNS, CH_USER, CH_PASS, CH_MODO, CH_CODIGO, CH_M3U, CH_PAINEL].forEach(function (c) { guardar(c, ''); });
    },
    // Última aba usada na tela de login (continua salva depois de sair da conta).
    ultimaAba: function () { return pegar(CH_ABA) || 'usuario'; }
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
          return { estado: 'expirado', base: base, info: ui, teste: teste, painel: String(ui.vltv_painel || '') };
        }
        return { estado: 'ok', base: base, info: ui, painel: String(ui.vltv_painel || '') };
      })
      .catch(function () { return { estado: 'erro', base: base }; });
  }

  // ── Login ─────────────────────────────────────────────────────────
  // dnsPreferido (opcional) vai na frente da fila.
  // listaServidores (opcional) substitui a lista da VPS (parceiro e Xtream manual).
  // Resolve com { estado, base, info, teste }.
  function login(user, pass, dnsPreferido, listaServidores) {
    var servidores = Array.isArray(listaServidores) && listaServidores.length > 0
      ? listaServidores.slice()
      : VLTV.dns.lista();

    // Conta do VLTV Play (sem lista própria): só o gateway, ignora DNS antigo salvo na TV.
    if (!(Array.isArray(listaServidores) && listaServidores.length > 0)) { dnsPreferido = null; }

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
            if (res.painel) { guardar(CH_PAINEL, res.painel); }
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
