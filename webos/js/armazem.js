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
  function ler(chave) {
    if (memoria[chave]) { return Promise.resolve(memoria[chave]); }
    return abrirBd().then(function (db) {
      if (!db) { return null; }
      return new Promise(function (resolve) {
        try {
          var req = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(chave);
          req.onsuccess = function () {
            var r = req.result;
            if (!r) { resolve(null); return; }
            var reg = { valor: r.valor, t: r.t };
            lembrar(chave, reg);
            resolve(reg);
          };
          req.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
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
        var cursor = loja.index('t').openKeyCursor();
        cursor.onsuccess = function () {
          var c = cursor.result;
          if (!c || sobra <= 0) { return; }
          loja.delete(c.primaryKey);
          sobra--;
          c.continue();
        };
      };
    } catch (e) { /* ignora */ }
  }

  function gravar(chave, valor) {
    var reg = { valor: valor, t: new Date().getTime() };
    lembrar(chave, reg);
    return abrirBd().then(function (db) {
      if (!db) { return; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(LOJA, 'readwrite');
          tx.objectStore(LOJA).put({ chave: chave, valor: valor, t: reg.t });
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

  VLTV.armazem = { ler: ler, gravar: gravar, limpar: limpar };
})();
