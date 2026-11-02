// Base de datos local del iPhone (IndexedDB). Nada sale del teléfono hasta "Sincronizar".
//   siniestros: { numero, compania, direccion, notas, creado, actualizado }
//   fotos:      { id, numero, blob, fecha, subida }
const DB = (() => {
  let conexion;

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((ok, mal) => {
      const req = indexedDB.open("siniestros", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("siniestros", { keyPath: "numero" });
        const fotos = db.createObjectStore("fotos", { keyPath: "id", autoIncrement: true });
        fotos.createIndex("numero", "numero");
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

  return {
    siniestros: () => op("siniestros", "readonly", tx => tx.objectStore("siniestros").getAll()),
    siniestro: numero => op("siniestros", "readonly", tx => tx.objectStore("siniestros").get(numero)),
    guardarSiniestro: s => op("siniestros", "readwrite", tx => tx.objectStore("siniestros").put(s)),

    // Cambiar el nº de siniestro mueve también sus fotos.
    renombrarSiniestro: (anterior, s) => op(["siniestros", "fotos"], "readwrite", tx => {
      tx.objectStore("siniestros").delete(anterior);
      tx.objectStore("siniestros").put(s);
      const idx = tx.objectStore("fotos").index("numero");
      idx.openCursor(IDBKeyRange.only(anterior)).onsuccess = e => {
        const c = e.target.result;
        if (!c) return;
        c.update({ ...c.value, numero: s.numero, subida: false });
        c.continue();
      };
    }),

    borrarSiniestro: numero => op(["siniestros", "fotos"], "readwrite", tx => {
      tx.objectStore("siniestros").delete(numero);
      tx.objectStore("fotos").index("numero").openCursor(IDBKeyRange.only(numero)).onsuccess = e => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); }
      };
    }),

    fotos: numero => op("fotos", "readonly", tx => tx.objectStore("fotos").index("numero").getAll(numero)),
    contarFotos: numero => op("fotos", "readonly", tx => tx.objectStore("fotos").index("numero").count(numero)),
    añadirFoto: (numero, blob) => op("fotos", "readwrite",
      tx => tx.objectStore("fotos").add({ numero, blob, fecha: Date.now(), subida: false })),
    guardarFoto: f => op("fotos", "readwrite", tx => tx.objectStore("fotos").put(f)),
    borrarFoto: id => op("fotos", "readwrite", tx => tx.objectStore("fotos").delete(id)),
  };
})();
