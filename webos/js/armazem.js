// VLTV Play - webOS | Armazém de dados dentro da TV (IndexedDB).
// Guarda listas grandes (categorias e títulos) para o app abrir já com tudo na tela.
// Se a TV não deixar usar o IndexedDB, funciona só na memória (e o app segue normal).
(function () {
  'use strict';

  var NOME_BD = 'vltv_cache';
  var LOJA = 'itens';
  var MAX_REGISTROS = 300;       // acima disso os mais antigos saem
  var MAX_NA_MEMORIA = 8;        // listas mantidas na memória para abrir na hora

  var bd = null;
  var abrindo = null;
  var memoria = {};
  var ordemMemoria = [];
  var gravacoes = 0;

  function abrirBd() {
    if (bd) { return Promise.resolve(bd); }
    if (abrindo) { return abrindo; }
    abrindo = new Promise(function (resolve) {
      try {
        var req = window.indexedDB.open(NOME_BD, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(LOJA)) {
            db.createObjectStore(LOJA, { keyPath: 'chave' }).createIndex('t', 't');
          }
        };
        req.onsuccess = function () {
          bd = req.result;
          bd.onclose = function () { bd = null; abrindo = null; };
          resolve(bd);
        };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) {
        resolve(null);
      }
    });
    return abrindo;
  }

  function lembrar(chave, reg) {
    if (!memoria[chave]) { ordemMemoria.push(chave); }
    memoria[chave] = reg;
    while (ordemMemoria.length > MAX_NA_MEMORIA) { delete memoria[ordemMemoria.shift()]; }
  }

  // Resolve com { valor, t } ou null.
  // semLembrar = true: não deixa o resultado na memória (usado nos pedaços do índice de pesquisa, para não expulsar as listas do Catálogo).
  function ler(chave, semLembrar) {
    if (memoria[chave]) { return Promise.resolve(memoria[chave]); }
    return abrirBd().then(function (db) {
      if (!db) { return null; }
      return new Promise(function (resolve) {
        try {
          var req = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave);
          req.onsuccess = function () {
            var r = req.result;
            if (!r) { resolve(null); return; }
            var v = r.valor;
            if (VLTV.marcar) { VLTV.marcar('idb-ler ' + String(chave).slice(-22)); }
            // fmt 1 = guardado como texto: ler texto é rápido; ler milhares de objetos do IndexedDB travava a TV por 1 a 2 s.
            if (r.fmt === 1) {
              try { v = JSON.parse(v); } catch (e2) { resolve(null); return; }
              if (VLTV.marcar) { VLTV.marcar('idb-texto ' + String(chave).slice(-22)); }
            }
            var reg = { valor: v, t: r.t };
            if (!semLembrar) { lembrar(chave, reg); }
            resolve(reg);
          };
          req.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  // true se a chave já está guardada. Confere sem abrir (e sem ler) a lista.
  function existe(chave) {
    if (memoria[chave]) { return Promise.resolve(true); }
    return abrirBd().then(function (db) {
      if (!db) { return false; }
      return new Promise(function (resolve) {
        try {
          var req = db.transaction(LOJA, 'readonly').objectStore(LOJA).count(IDBKeyRange.only(chave));
          req.onsuccess = function () { resolve(req.result > 0); };
          req.onerror = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  // Remove os registros mais antigos quando passa do limite.
  function podar(db) {
    try {
      var loja = db.transaction(LOJA, 'readwrite').objectStore(LOJA);
      var contagem = loja.count();
      contagem.onsuccess = function () {
        var sobra = contagem.result - MAX_REGISTROS;
        if (sobra <= 0) { return; }
        var cursor = loja.index('t').openKeyCursor();   // do mais antigo para o mais novo
        cursor.onsuccess = function () {
          var c = cursor.result;
          if (!c || sobra <= 0) { return; }
          // O índice de pesquisa (vltv_idx2_) nunca é apagado pela limpeza automática: ele fica guardado de vez.
          if (String(c.primaryKey).indexOf('vltv_idx2_') === -1) { loja.delete(c.primaryKey); sobra--; }
          c.continue();
        };
      };
    } catch (e) { /* ignora */ }
  }

  function gravar(chave, valor, semLembrar) {
    var reg = { valor: valor, t: new Date().getTime() };
    if (!semLembrar) { lembrar(chave, reg); }
    return abrirBd().then(function (db) {
      if (!db) { return; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(LOJA, 'readwrite');
          var texto = null;
          try { texto = JSON.stringify(valor); } catch (e3) { texto = null; }
          tx.objectStore(LOJA).put(texto === null ? { chave: chave, valor: valor, t: reg.t } : { chave: chave, valor: texto, t: reg.t, fmt: 1 });
          if (VLTV.marcar) { VLTV.marcar('idb-gravar ' + String(chave).slice(-22)); }
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };   // sem espaço: segue sem guardar
        } catch (e) {
          resolve();
        }
      }).then(function () {
        gravacoes++;
        if (gravacoes % 20 === 0) { podar(db); }
      });
    });
  }

  // Apaga tudo (Configurações > Limpar dados do catálogo).
  function limpar() {
    memoria = {};
    ordemMemoria = [];
    return abrirBd().then(function (db) {
      if (!db) { return; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(LOJA, 'readwrite');
          tx.objectStore(LOJA).clear();
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) {
          resolve();
        }
      });
    });
  }

  VLTV.armazem = { ler: ler, existe: existe, gravar: gravar, limpar: limpar };
})();
