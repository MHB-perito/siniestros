// Base de datos local del iPhone (IndexedDB). Nada sale del teléfono hasta "Sincronizar".
//   siniestros: { numero, compania, direccion, notas, fechaVisita, mediciones, creado, actualizado }
//     mediciones: [{ estancia, elementos: [{ nombre, cantidad, unidad }] }]
//   fotos:      { id, numero, blob, fecha, subida }
//   croquis:    { id, numero, blob, fecha }   (solo para Miguel; no se sincroniza)

const $ = id => document.getElementById(id);   // atajo que usan todos los scripts

const DB = (() => {
  let conexion;
  const CON_FOTOS = ["fotos", "croquis"];   // almacenes que cuelgan de un siniestro

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((ok, mal) => {
      const req = indexedDB.open("siniestros", 2);
      req.onupgradeneeded = e => {
        const db = req.result;
        if (e.oldVersion < 1) db.createObjectStore("siniestros", { keyPath: "numero" });
        for (const nombre of CON_FOTOS) {
          if (db.objectStoreNames.contains(nombre)) continue;
          db.createObjectStore(nombre, { keyPath: "id", autoIncrement: true }).createIndex("numero", "numero");
        }
      };
      req.onsuccess = () => { conexion = req.result; ok(conexion); };
      req.onerror = () => mal(req.error);
    });
  }

  async function op(almacen, modo, fn) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const tx = db.transaction(almacen, modo);
      const res = fn(tx);
      tx.oncomplete = () => ok(res && "result" in res ? res.result : res);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    });
  }

  // Recorre las fotos y croquis de un siniestro.
  function cadaHijo(tx, numero, fn) {
    for (const nombre of CON_FOTOS) {
      tx.objectStore(nombre).index("numero").openCursor(IDBKeyRange.only(numero)).onsuccess = e => {
        const c = e.target.result;
        if (!c) return;
        fn(c, nombre);
        c.continue();
      };
    }
  }

  const todo = ["siniestros", ...CON_FOTOS];

  return {
    siniestros: () => op("siniestros", "readonly", tx => tx.objectStore("siniestros").getAll()),
    siniestro: numero => op("siniestros", "readonly", tx => tx.objectStore("siniestros").get(numero)),
    guardarSiniestro: s => op("siniestros", "readwrite", tx => tx.objectStore("siniestros").put(s)),

    // Cambiar el nº de siniestro mueve también sus fotos y croquis.
    renombrarSiniestro: (anterior, s) => op(todo, "readwrite", tx => {
      tx.objectStore("siniestros").delete(anterior);
      tx.objectStore("siniestros").put(s);
      cadaHijo(tx, anterior, (c, nombre) =>
        c.update({ ...c.value, numero: s.numero, ...(nombre === "fotos" ? { subida: false } : {}) }));
    }),

    borrarSiniestro: numero => op(todo, "readwrite", tx => {
      tx.objectStore("siniestros").delete(numero);
      cadaHijo(tx, numero, c => c.delete());
    }),

    fotos: numero => op("fotos", "readonly", tx => tx.objectStore("fotos").index("numero").getAll(numero)),
    contarFotos: numero => op("fotos", "readonly", tx => tx.objectStore("fotos").index("numero").count(numero)),
    añadirFoto: (numero, blob) => op("fotos", "readwrite",
      tx => tx.objectStore("fotos").add({ numero, blob, fecha: Date.now(), subida: false })),
    guardarFoto: f => op("fotos", "readwrite", tx => tx.objectStore("fotos").put(f)),
    borrarFoto: id => op("fotos", "readwrite", tx => tx.objectStore("fotos").delete(id)),

    croquis: numero => op("croquis", "readonly", tx => tx.objectStore("croquis").index("numero").getAll(numero)),
    guardarCroquis: c => op("croquis", "readwrite", tx => tx.objectStore("croquis").put(c)),
    borrarCroquis: id => op("croquis", "readwrite", tx => tx.objectStore("croquis").delete(id)),
  };
})();
