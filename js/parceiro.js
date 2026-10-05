// VLTV Play - webOS | Código de parceiro: pergunta à VPS quais DNS pertencem àquele parceiro.
(function () {
  'use strict';

  function limparCodigo(texto) {
    return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Resolve com { estado, nome, dns }.
  // estado: 'ok' | 'codigo_invalido' | 'suspenso' | 'limite' | 'rede'
  function resolver(codigo) {
    var cfg = VLTV.config;
    var limpo = limparCodigo(codigo);
    if (!limpo) { return Promise.resolve({ estado: 'codigo_invalido' }); }

    var url = cfg.PARCEIRO_URL + '?codigo=' + encodeURIComponent(limpo);

    return VLTV.http.fetchComTimeout(url, cfg.PARCEIRO_TIMEOUT_MS)
      .then(function (r) {
        if (r.status === 404) { return { estado: 'codigo_invalido' }; }
        if (r.status === 403) { return { estado: 'suspenso' }; }
        if (r.status === 429) { return { estado: 'limite' }; }
        if (!r.ok) { return { estado: 'rede' }; }

        return r.json().then(function (json) {
          var lista = json && json.ok && Array.isArray(json.dns)
            ? json.dns.map(VLTV.dns.normalizar).filter(Boolean)
            : [];
          if (lista.length === 0) { return { estado: 'rede' }; }
          return { estado: 'ok', nome: String(json.nome || ''), dns: lista };
        });
      })
      .catch(function () { return { estado: 'rede' }; });
  }

  VLTV.parceiro = { resolver: resolver, limpar: limparCodigo };
})();
