// VLTV Play - webOS | Sincronização do catálogo com a TV ("mostra o que já tem e atualiza por trás").
// 1ª vez: busca no painel e guarda na TV. Das próximas: mostra o guardado na hora e confere o
// painel em segundo plano; se algo mudou, o novo fica guardado e é aplicado sem atrapalhar o uso.
// Contas de lista M3U já estão na memória do app, então não usam este cache.
(function () {
  'use strict';

  var VALIDADE_PADRAO_MS = 10 * 60 * 1000;   // dentro desse tempo não precisa conferir o painel de novo
  var LIMITE_COMPARACAO = 8000;              // listas maiores comparam só tamanho e pontas

  var emVoo = {};          // buscas em andamento (a mesma busca nunca roda duas vezes)
  var fila = [];           // pré-carregamentos pendentes
  var rodandoFila = false;

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

  function igual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) { return false; }
    if (a.length !== b.length) { return false; }
    if (a.length === 0) { return true; }
    try {
      if (a.length > LIMITE_COMPARACAO) {
        var ult = a.length - 1;
        return JSON.stringify(a[0]) === JSON.stringify(b[0]) && JSON.stringify(a[ult]) === JSON.stringify(b[ult]);
      }
      return JSON.stringify(a) === JSON.stringify(b);
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
          : buscarUmaVez(k, buscar).then(function (novo) {
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
    fila = pedidos.map(function (p) { return { k: d + '|' + p.chave, buscar: p.buscar }; });
    if (!rodandoFila) { rodar(); }
  }

  function rodar() {
    var proximo = fila.shift();
    if (!proximo) { rodandoFila = false; return; }
    rodandoFila = true;
    VLTV.armazem.ler(proximo.k).then(function (reg) {
      if (reg && reg.valor) { return; }               // já está guardado
      return buscarUmaVez(proximo.k, proximo.buscar).then(function (dados) { guardar(proximo.k, dados); });
    }).catch(function () { /* sem problema: abre normal quando o usuário pedir */ })
      .then(function () { setTimeout(rodar, 150); });
  }

  VLTV.sync = { obter: obter, aquecer: aquecer };
})();
