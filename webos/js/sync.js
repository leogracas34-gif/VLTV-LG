// VLTV Play - webOS | Sincronização do catálogo com a TV ("mostra o que já tem e atualiza por trás").
// 1ª vez: busca no painel e guarda na TV. Das próximas: mostra o guardado na hora e confere o
// painel em segundo plano; se algo mudou, o novo fica guardado e é aplicado sem atrapalhar o uso.
// Contas de lista M3U já estão na memória do app, então não usam este cache.
(function () {
  'use strict';

  var VALIDADE_PADRAO_MS = 10 * 60 * 1000;   // dentro desse tempo não precisa conferir o painel de novo

  var emVoo = {};          // buscas em andamento (a mesma busca nunca roda duas vezes)
  var fila = [];           // pré-carregamentos pendentes
  var rodandoFila = false;
  var pausado = false;     // vídeo em tela cheia tocando: o preparo em segundo plano anda bem devagar (ou espera, se a chave mandar)
  var RITMO_VIDEO_MS = 4000;  // um passo a cada 4 s enquanto o vídeo toca

  function esperaTotalNoVideo() { return !!(VLTV.config && VLTV.config.SEGUNDO_PLANO_DURANTE_VIDEO === false); }

  function validade() {
    var v = VLTV.config.CACHE_VALIDADE_MS;
    return typeof v === 'number' ? v : VALIDADE_PADRAO_MS;
  }

  // Cada conta tem o seu cache (painel + usuário).
  function dono() {
    var s = VLTV.sessao.ler();
    if (!s || s.modo === 'm3u') { return null; }
    return (s.dns || '') + '|' + (s.user || '');
  }

  // Compara duas listas sem transformar a lista inteira em texto (isso travava a TV por mais de 1 s em listas grandes).
  // Listas pequenas: compara tudo. Listas grandes: tamanho + cerca de 40 títulos espalhados + o último.
  // Se uma diferença escapar, nada se perde: a lista nova já foi guardada e aparece na próxima abertura.
  function igual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) { return false; }
    if (a.length !== b.length) { return false; }
    var n = a.length;
    if (n === 0) { return true; }
    try {
      if (n <= 60) { return JSON.stringify(a) === JSON.stringify(b); }
      var passo = Math.floor(n / 40);
      for (var i = 0; i < n; i += passo) {
        if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { return false; }
      }
      return JSON.stringify(a[n - 1]) === JSON.stringify(b[n - 1]);
    } catch (e) {
      return false;
    }
  }

  function buscarUmaVez(k, buscar) {
    if (emVoo[k]) { return emVoo[k]; }
    var p = buscar().then(function (dados) {
      delete emVoo[k];
      return dados;
    }, function (erro) {
      delete emVoo[k];
      throw erro;
    });
    emVoo[k] = p;
    return p;
  }

  function guardar(k, dados) {
    // Lista vazia quase sempre é erro do painel: não vale a pena guardar.
    if (Array.isArray(dados) && dados.length === 0) { return; }
    VLTV.armazem.gravar(k, dados);
  }

  // Resolve com { dados, doCache, atualizacao }.
  //   dados:      o que já dá para mostrar.
  //   doCache:    true se veio guardado na TV.
  //   atualizacao: Promise que resolve com a lista nova SÓ se o painel trouxe algo diferente (senão null).
  // Rejeita se não havia nada guardado e o painel falhou.
  function obter(chave, buscar) {
    var d = dono();
    if (d === null) {
      return buscar().then(function (dados) {
        return { dados: dados, doCache: false, atualizacao: Promise.resolve(null) };
      });
    }
    var k = d + '|' + chave;

    return VLTV.armazem.ler(k).then(function (reg) {
      if (reg && reg.valor) {
        var fresco = (new Date().getTime() - reg.t) < validade();
        var atualizacao = fresco
          ? Promise.resolve(null)
          : buscarUmaVez(k, function () { return VLTV.api.quieto(buscar); }).then(function (novo) {
              guardar(k, novo);
              return (Array.isArray(novo) && novo.length > 0 && !igual(reg.valor, novo)) ? novo : null;
            }).catch(function () { return null; });
        return { dados: reg.valor, doCache: true, atualizacao: atualizacao };
      }
      return buscarUmaVez(k, buscar).then(function (dados) {
        guardar(k, dados);
        return { dados: dados, doCache: false, atualizacao: Promise.resolve(null) };
      });
    });
  }

  // Pré-carrega em segundo plano (uma por vez) o que provavelmente será aberto em seguida.
  // pedidos: [{ chave, buscar }]. Uma nova chamada troca a fila inteira pela nova.
  function aquecer(pedidos) {
    var d = dono();
    if (d === null) { return; }
    fila = pedidos.map(function (p) { return { k: d + '|' + p.chave, buscar: p.buscar, quieto: !!p.quieto }; });
    if (!rodandoFila) { rodar(); }
  }

  function rodar() {
    var proximo = fila.shift();
    if (!proximo) { rodandoFila = false; return; }
    rodandoFila = true;
    // Preparo em segundo plano (quieto): anda com o controle em uso, mas recua se a TV travar; só espera de vez durante vídeo.
    if (proximo.quieto && ((pausado && esperaTotalNoVideo()) || (VLTV.segundoPlanoLivre && !VLTV.segundoPlanoLivre(true)))) {
      fila.unshift(proximo);
      setTimeout(rodar, 400);
      return;
    }
    VLTV.armazem.existe(proximo.k).then(function (jaTem) {
      if (jaTem) { return; }                          // já está guardado (confere sem abrir a lista, que travava a TV)
      var buscarFundo = proximo.quieto ? function () { return VLTV.api.quieto(proximo.buscar); } : proximo.buscar;
      return buscarUmaVez(proximo.k, buscarFundo).then(function (dados) { guardar(proximo.k, dados); });
    }).catch(function () { /* sem problema: abre normal quando o usuário pedir */ })
      .then(function () { setTimeout(rodar, pausado && proximo.quieto ? RITMO_VIDEO_MS : 150); });
  }

  function pausar(sim) { pausado = !!sim; }

  VLTV.sync = { obter: obter, aquecer: aquecer, pausar: pausar };
})();
