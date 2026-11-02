// Sincronización con Google Drive.
// Sube las fotos a Ordenadores → PC → Escritorio → Siniestros → <nº>_<dirección>/fotos/
// y las notas a .../<nº>_<dirección>/notas.txt. Drive para ordenadores lo baja solo al PC.
//
// El permiso se pide redirigiendo a Google (no con ventana emergente): en la app instalada
// del iPhone las ventanas emergentes no vuelven bien a la app.
const Drive = (() => {
  const CLIENT_ID = "701090775615-s11036kuu6s9b8qodnndlj1nqa3fs79f.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive";
  const API = "https://www.googleapis.com/drive/v3";
  const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";
  const CARPETA = "application/vnd.google-apps.folder";
  const REDIRECT = new URL("./", location.href).href;   // https://mhb-perito.github.io/siniestros/

  // localStorage puede fallar (modo privado); entonces simplemente no se recuerda nada.
  const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const quitar = k => { try { localStorage.removeItem(k); } catch {} };

  function token() {
    const t = leer("drive_token");
    return t && t.expira > Date.now() + 60000 ? t.valor : null;
  }

  // Va a Google a pedir permiso; al volver, la app retoma la sincronización de `numero`.
  function pedirPermiso(numero) {
    const estado = Math.random().toString(36).slice(2);
    guardar("drive_estado", estado);
    guardar("drive_pendiente", numero);
    const p = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "token",
      scope: SCOPE, state: estado, include_granted_scopes: "true", prompt: "select_account",
    });
    location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  }

  // Al arrancar: si venimos de Google, guarda el permiso y devuelve el nº pendiente.
  function volverDeGoogle() {
    if (!location.hash.includes("state=")) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", REDIRECT);
    const pendiente = leer("drive_pendiente");
    const esperado = leer("drive_estado");
    quitar("drive_pendiente");
    quitar("drive_estado");
    if (p.get("state") !== esperado) return null;
    if (p.get("error")) return { numero: pendiente, error: "No se dio permiso a Google Drive." };
    guardar("drive_token", {
      valor: p.get("access_token"),
      expira: Date.now() + Number(p.get("expires_in") || 3600) * 1000,
    });
    return { numero: pendiente };
  }

  class SinPermiso extends Error {}

  async function llamar(url, opciones = {}) {
    const r = await fetch(url, {
      ...opciones,
      headers: { ...(opciones.headers || {}), Authorization: "Bearer " + token() },
    });
    if (r.status === 401) { quitar("drive_token"); throw new SinPermiso(); }
    if (!r.ok) throw new Error(`Google Drive respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  const comillas = s => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function buscar(q, campos = "id,name,parents") {
    const p = new URLSearchParams({ q: q + " and trashed = false", fields: `files(${campos})`, pageSize: "100" });
    return (await llamar(`${API}/files?${p}`)).files;
  }

  async function crearCarpeta(nombre, padre) {
    return llamar(`${API}/files?fields=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
    });
  }

  async function carpetaHija(nombre, padre) {
    const hay = await buscar(`name = '${comillas(nombre)}' and mimeType = '${CARPETA}' and '${padre}' in parents`);
    return hay[0] || crearCarpeta(nombre, padre);
  }

  // La carpeta Siniestros buena es la que cuelga de Escritorio (copia del PC), no otra con el mismo nombre.
  async function carpetaSiniestros() {
    const guardada = leer("drive_siniestros");
    if (guardada) {
      const f = await llamar(`${API}/files/${guardada}?fields=trashed`).catch(e => {
        if (e instanceof SinPermiso) throw e;
        return null;
      });
      if (f && !f.trashed) return guardada;
    }
    const candidatas = await buscar(`name = 'Siniestros' and mimeType = '${CARPETA}'`);
    for (const c of candidatas) {
      if (!c.parents) continue;
      const padre = await llamar(`${API}/files/${c.parents[0]}?fields=name`);
      if (["Escritorio", "Desktop"].includes(padre.name)) {
        guardar("drive_siniestros", c.id);
        return c.id;
      }
    }
    // Probablemente es otra cuenta: se olvida el permiso para poder elegir otra al reintentar.
    quitar("drive_token");
    throw new Error("No encuentro en este Google Drive la carpeta Siniestros del Escritorio del PC. " +
      "Vuelve a pulsar «Sincronizar» y elige la cuenta de Google que tiene la copia del PC.");
  }

  // Usa la carpeta del siniestro si ya existe en el PC (aunque la dirección esté escrita distinta).
  async function carpetaDelSiniestro(raiz, nombre, numero) {
    const exacta = await buscar(`name = '${comillas(nombre)}' and mimeType = '${CARPETA}' and '${raiz}' in parents`);
    if (exacta[0]) return exacta[0].id;
    const parecidas = await buscar(`name contains '${comillas(numero)}' and mimeType = '${CARPETA}' and '${raiz}' in parents`);
    const mismaId = parecidas.find(c => c.name.startsWith(numero + "_"));
    return mismaId ? mismaId.id : (await crearCarpeta(nombre, raiz)).id;
  }

  async function subir(meta, contenido, tipo, idExistente) {
    const corte = "siniestros" + Math.random().toString(36).slice(2);
    const cuerpo = new Blob([
      `--${corte}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${corte}\r\nContent-Type: ${tipo}\r\n\r\n`, contenido, `\r\n--${corte}--`,
    ]);
    const url = idExistente
      ? `${SUBIDA}/${idExistente}?uploadType=multipart&fields=id`
      : `${SUBIDA}?uploadType=multipart&fields=id`;
    return llamar(url, {
      method: idExistente ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${corte}` },
      body: cuerpo,
    });
  }

  const dos = n => String(n).padStart(2, "0");
  function nombreFoto(f) {
    const d = new Date(f.fecha);
    const ext = { "image/png": "png", "image/heic": "heic", "image/webp": "webp" }[f.blob.type] || "jpg";
    return `foto_${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_` +
      `${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}_${f.id}.${ext}`;
  }

  // Sube las fotos pendientes del siniestro `s` y los `textos` ({ "notas.txt": "…" }), que se
  // sobrescriben. aviso(texto) va contando el progreso.
  // Si no hay permiso, se va a Google y la sincronización sigue al volver.
  async function sincronizar(s, nombreCarpeta, textos, aviso) {
    if (!navigator.onLine) throw new Error("No hay conexión a internet.");
    if (!token()) return pedirPermiso(s.numero);
    try {
      aviso("Buscando la carpeta en Drive…");
      const raiz = await carpetaSiniestros();
      const carpeta = await carpetaDelSiniestro(raiz, nombreCarpeta, s.numero);

      const pendientes = (await DB.fotos(s.numero)).filter(f => !f.subida);
      if (pendientes.length) {
        const fotos = await carpetaHija("fotos", carpeta);
        let n = 0;
        for (const f of pendientes) {
          aviso(`Subiendo foto ${++n} de ${pendientes.length}…`);
          await subir({ name: nombreFoto(f), parents: [fotos.id] }, f.blob, f.blob.type || "image/jpeg");
          await DB.guardarFoto({ ...f, subida: true });
        }
      }

      for (const [nombre, contenido] of Object.entries(textos)) {
        aviso(`Subiendo ${nombre}…`);
        const hay = await buscar(`name = '${nombre}' and '${carpeta}' in parents`, "id");
        const texto = new Blob([contenido], { type: "text/plain;charset=utf-8" });
        if (hay[0]) await subir({}, texto, "text/plain; charset=UTF-8", hay[0].id);
        else await subir({ name: nombre, parents: [carpeta] }, texto, "text/plain; charset=UTF-8");
      }

      return { fotos: pendientes.length };
    } catch (e) {
      if (e instanceof SinPermiso) return pedirPermiso(s.numero);
      throw e;
    }
  }

  return { sincronizar, volverDeGoogle };
})();
