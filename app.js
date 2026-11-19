let actual = null;          // siniestro abierto
let editando = null;        // nº del siniestro que se edita en el diálogo (null = nuevo)
let stream = null;          // cámara
let fotoAbierta = null;
const urls = [];            // miniaturas, para liberarlas al salir

// Igual que limpiar() de scripts/carpeta_siniestro.py: quita lo que Windows no admite.
function limpiar(texto) {
  return texto.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
}
const carpeta = s => `${limpiar(s.numero)}_${limpiar(s.direccion)}`;

// Fechas: se guardan como "2026-11-02" (lo que da <input type="date">) y se enseñan como 02/11/2026.
const dos = n => String(n).padStart(2, "0");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
const fechaBonita = f => f ? f.split("-").reverse().join("/") : "";

// ---------- Fotos más ligeras ----------
// Toda foto (cámara, cámara iPhone o galería) se reduce antes de guardarla: lado largo de 2000 px
// y JPEG al 80 %. Pasa de 3-6 MB a unos 400-700 KB y sigue viéndose nítida en el informe.
const LADO_MAX = 2000;
const CALIDAD = 0.8;
async function aligerar(origen) {
  let img, url;
  if (origen instanceof Blob) {
    url = URL.createObjectURL(origen);
    img = new Image();
    img.src = url;
    try { await img.decode(); }
    catch { URL.revokeObjectURL(url); return origen; }   // formato que Safari no sabe leer: se guarda tal cual
  } else img = origen;                                    // <video> de la cámara de la app
  const w = img.naturalWidth || img.videoWidth, h = img.naturalHeight || img.videoHeight;
  const k = Math.min(1, LADO_MAX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  if (url) URL.revokeObjectURL(url);
  const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", CALIDAD));
  c.width = c.height = 0;   // libera memoria en el iPhone
  return blob && (!(origen instanceof Blob) || blob.size < origen.size) ? blob : origen;
}

// Guarda varias fotos del móvil (cámara iPhone o galería) ya aligeradas.
async function guardarArchivos(archivos) {
  const lista = [...archivos];
  for (let i = 0; i < lista.length; i++) {
    $("estado-fotos").textContent = `Guardando foto ${i + 1} de ${lista.length}…`;
    await DB.añadirFoto(actual.numero, await aligerar(lista[i]));
  }
  $("estado-fotos").textContent = lista.length > 1 ? `${lista.length} fotos añadidas ✓` : "";
  await tocar();
  await pintarGaleria();
}

function mostrar(vista) {
  for (const v of ["vista-lista", "vista-detalle", "vista-camara", "vista-foto", "vista-croquis"]) $(v).hidden = v !== vista;
  window.scrollTo(0, 0);
}

// ---------- Lista ----------
// Para buscar sin importar mayúsculas ni tildes.
const normal = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let pintando = 0;   // al teclear rápido, solo vale la última búsqueda
async function pintarLista() {
  const yo = ++pintando;
  const todos = (await DB.siniestros()).sort((a, b) => b.actualizado - a.actualizado);
  const busca = normal($("buscar").value.trim());
  const vistos = todos.filter(s => normal(`${s.numero} ${s.direccion} ${s.compania}`).includes(busca));
  const fotosDe = {};
  for (const s of vistos) fotosDe[s.numero] = await DB.fotos(s.numero);
  if (yo !== pintando) return;
  $("resumen").textContent = `${todos.length} siniestro${todos.length === 1 ? "" : "s"} en este iPhone`;

  const ul = $("lista");
  ul.innerHTML = "";
  $("lista-vacia").hidden = vistos.length > 0;
  $("lista-vacia").textContent = todos.length
    ? "Ningún siniestro coincide con la búsqueda."
    : "Aún no hay siniestros. Pulsa «+ Nuevo» para crear uno.";

  for (const s of vistos) {
    const fotos = fotosDe[s.numero];
    const sinSubir = fotos.filter(f => !f.subida).length;
    const li = document.createElement("li");
    li.className = s.compania;
    li.innerHTML = `<div class="fila"><span class="num"></span><span class="etiqueta ${s.compania}"></span></div>
      <div class="dir"></div><div class="meta"></div>`;
    li.querySelector(".num").textContent = s.numero;
    li.querySelector(".etiqueta").textContent = s.compania;
    li.querySelector(".dir").textContent = s.direccion;
    const chip = (texto, clase = "") => {
      const c = document.createElement("span");
      c.className = `chip ${clase}`;
      c.textContent = texto;
      li.querySelector(".meta").appendChild(c);
    };
    if (s.fechaVisita) chip(`📅 ${fechaBonita(s.fechaVisita)}`);
    if (s.modalidad) chip(s.modalidad);
    if (Guion.nombreTipo(s)) chip(Guion.nombreTipo(s));
    chip(`📷 ${fotos.length}`);
    if (s.notas) chip("📝 Notas");
    const ei = s.estadoInforme || {};
    if (ei.nDudas && !ei.respondidas) chip(`❓ ${ei.nDudas} duda${ei.nDudas === 1 ? "" : "s"} del PC`, "dudas");
    else if (ei.fase === "hecho") chip("✅ Informe hecho", "ok");
    else if (s.informePedido) chip(`📄 Informe pedido ${fechaBonita(new Date(s.informePedido).toISOString().slice(0, 10))}`, "informe");
    if (Mediciones.hayAlgo(s)) chip("📏 Mediciones");
    if (sinSubir) chip(`${sinSubir} sin pasar al PC`, "pendiente");
    else if (fotos.length) chip("✓ En el PC", "ok");
    const papelera = document.createElement("button");
    papelera.className = "papelera";
    papelera.setAttribute("aria-label", `Borrar el siniestro ${s.numero}`);
    papelera.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>`;
    papelera.onclick = e => { e.stopPropagation(); borrarSiniestro(s.numero); };
    li.querySelector(".meta").appendChild(papelera);
    li.onclick = () => abrir(s.numero);
    ul.appendChild(li);
  }
  revisarInformes(todos);
}

// En la lista: pregunta a Drive cómo van los informes pedidos (como mucho una vez por minuto).
let ultimaRevision = 0;
async function revisarInformes(todos) {
  if (!Drive.hayPermiso() || Date.now() - ultimaRevision < 60000) return;
  ultimaRevision = Date.now();
  let cambio = false;
  for (const s of todos.filter(x => x.informePedido && x.estadoInforme?.fase !== "hecho")) {
    try {
      const e = await Drive.estadoInforme(s, carpeta(s));
      if (!e) return;
      // Se relee justo antes de guardar para no pisar lo que se haya cambiado mientras tanto.
      if (actual?.numero === s.numero) continue;   // el abierto ya se comprueba solo
      const fresco = await DB.siniestro(s.numero);
      if (!fresco) continue;
      const nuevo = resumirEstado(e);
      const { comprobado: _a, ...n1 } = nuevo, { comprobado: _b, ...n0 } = fresco.estadoInforme || {};
      if (JSON.stringify(n1) !== JSON.stringify(n0)) {
        await DB.guardarSiniestro({ ...fresco, estadoInforme: nuevo });
        cambio = true;
      }
    } catch {}
  }
  if (cambio && !$("vista-lista").hidden) pintarLista();
}
const resumirEstado = e => ({
  fase: e.fase, nDudas: e.dudas.length, respondidas: e.respondidas, word: e.word?.enlace || "", comprobado: Date.now(),
});
$("buscar").addEventListener("input", pintarLista);

// ---------- Detalle ----------
async function abrir(numero) {
  actual = await DB.siniestro(numero);
  $("det-numero").textContent = actual.numero;
  $("det-direccion").textContent = actual.direccion;
  $("det-compania").textContent = actual.compania;
  $("det-compania").className = `etiqueta ${actual.compania}`;
  $("det-carpeta").textContent = `Carpeta: Siniestros/${carpeta(actual)}`;
  $("det-fecha").value = actual.fechaVisita || "";
  $("det-modalidad").value = actual.modalidad || "";
  $("estado-fotos").textContent = "";
  $("notas").value = actual.notas || "";
  $("estado-notas").textContent = "";
  await pintarGaleria();
  Guion.pintar();
  Mediciones.pintar();
  await Croquis.pintar();
  const nc = (await DB.croquis(numero)).length;
  $("resumen-croquis").textContent = nc ? `(${nc})` : "";
  resumenes();
  ultimoEstado = null;
  pintarInforme();
  mostrar("vista-detalle");
  if (actual.informePedido && actual.estadoInforme?.fase !== "hecho") comprobarInforme(false);
}

// (Se sigue llamando fechaVisita por dentro para no perder lo ya guardado; en pantalla es «Fecha de inspección».)
$("det-fecha").onchange = async () => {
  actual.fechaVisita = $("det-fecha").value;
  await tocar();
};
$("det-modalidad").onchange = async () => {
  actual.modalidad = $("det-modalidad").value;
  await tocar();
};

async function pintarGaleria() {
  urls.splice(0).forEach(URL.revokeObjectURL);
  const fotos = (await DB.fotos(actual.numero)).sort((a, b) => a.fecha - b.fecha);
  $("num-fotos").textContent = fotos.length ? `(${fotos.length})` : "";
  const sinSubir = fotos.filter(f => !f.subida).length;
  $("estado-sync").textContent = sinSubir ? `${sinSubir} foto${sinSubir === 1 ? "" : "s"} sin pasar al PC.` : "";
  const g = $("galeria");
  g.innerHTML = "";
  for (const f of fotos) {
    const url = URL.createObjectURL(f.blob);
    urls.push(url);
    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    img.onclick = () => verFoto(f, url);
    g.appendChild(img);
  }
}

async function tocar() {
  actual.actualizado = Date.now();
  resumenes();
  await DB.guardarSiniestro(actual);
}

// Lo que se ve en la cabecera de cada bloque aunque esté plegado.
function resumenes() {
  if (!actual) return;
  const n = (actual.terceros || []).filter(t => t.nombre?.trim() || t.telefono?.trim()).length;
  $("resumen-terceros").textContent = n ? `(${n})` : "";
  $("resumen-notas").textContent = actual.notas?.trim() ? "✓" : "";
  $("resumen-mediciones").textContent = Mediciones.resumen(actual);
}

// Bloques plegables: el iPhone recuerda cuáles dejaste abiertos.
document.querySelectorAll(".seccion").forEach(d => {
  const clave = "seccion-" + d.dataset.seccion;
  try { const v = localStorage.getItem(clave); if (v !== null) d.open = v === "1"; } catch {}
  d.addEventListener("toggle", () => { try { localStorage.setItem(clave, d.open ? "1" : "0"); } catch {} });
});

// Las notas se guardan solas mientras se escribe.
let temporizador;
$("notas").addEventListener("input", () => {
  $("estado-notas").textContent = "Guardando…";
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarNotas, 600);
});
async function guardarNotas() {
  clearTimeout(temporizador);
  if (!actual || actual.notas === $("notas").value) return;
  actual.notas = $("notas").value;
  // Si no se ha puesto otra, la fecha de inspección es el día en que se empiezan las notas.
  if (!actual.fechaVisita && actual.notas.trim()) $("det-fecha").value = actual.fechaVisita = hoy();
  await tocar();
  $("estado-notas").textContent = "Guardado en el iPhone ✓";
}

$("btn-volver").onclick = async () => {
  await guardarNotas();
  actual = null;
  urls.splice(0).forEach(URL.revokeObjectURL);
  await pintarLista();
  mostrar("vista-lista");
};

// ---------- Cámara dentro de la app ----------
$("btn-camara").onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 4032 }, height: { ideal: 3024 } },
      audio: false,
    });
  } catch (e) {
    alert("No se pudo abrir la cámara. Revisa el permiso de cámara para esta app o usa «Cámara iPhone».\n\n" + e.message);
    return;
  }
  $("video").srcObject = stream;
  $("camara-contador").textContent = "0";
  mostrar("vista-camara");
};

$("btn-disparar").onclick = async () => {
  const v = $("video");
  if (!v.videoWidth) return;
  $("flash").classList.add("on");
  setTimeout(() => $("flash").classList.remove("on"), 80);
  await DB.añadirFoto(actual.numero, await aligerar(v));
  $("camara-contador").textContent = String(+$("camara-contador").textContent + 1);
};

$("btn-cerrar-camara").onclick = async () => {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  await tocar();
  await pintarGaleria();
  mostrar("vista-detalle");
};

// Cámara nativa del iPhone (más calidad, enfoque y flash). La foto tampoco va al carrete.
$("input-foto").onchange = async e => {
  const archivos = [...e.target.files];
  e.target.value = "";
  await guardarArchivos(archivos);
};

// Fotos que ya están en la galería del iPhone (por ejemplo, las que manda el asegurado).
// Se copian a la app; las originales siguen en la galería.
$("input-galeria").onchange = async e => {
  const archivos = [...e.target.files];
  e.target.value = "";
  await guardarArchivos(archivos);
};

// ---------- Sincronizar con Google Drive ----------
// conInforme: además deja en la carpeta PEDIR_INFORME.txt para que el PC haga el informe.
async function sincronizar(conInforme = false) {
  await guardarNotas();
  const botones = [$("btn-sincronizar"), $("btn-informe")];
  const aviso = t => { $("estado-sync").textContent = t; };
  botones.forEach(b => b.disabled = true);
  // Por si hay que ir a Google a dar permiso: al volver se sigue pidiendo el informe.
  try { conInforme ? localStorage.setItem("pedir-informe", actual.numero) : localStorage.removeItem("pedir-informe"); } catch {}
  try {
    const notas = [
      [actual.fechaVisita ? `Fecha de inspección: ${fechaBonita(actual.fechaVisita)}` : "",
       actual.modalidad ? `Tipo de inspección: ${actual.modalidad}` +
         (actual.modalidad === "Se contacta" ? " (sin visita; informe con las fotos que aporta el asegurado)" : "") : "",
      ].filter(Boolean).join("\n"),
      Guion.texto(actual),
      Mediciones.texto(actual),
      actual.notas?.trim() ? `Notas:\n${actual.notas.trim()}` : "",
    ].filter(Boolean).join("\n\n") + "\n";
    const textos = { "notas.txt": notas };
    if (conInforme) {
      const total = (await DB.fotos(actual.numero)).length;
      const ahora = new Date();
      textos["PEDIR_INFORME.txt"] = [
        `Informe pedido desde el iPhone el ${ahora.toLocaleString("es-ES")}.`,
        `Siniestro: ${actual.numero}`,
        `Compañía: ${actual.compania}`,
        `Dirección: ${actual.direccion}`,
        `Tipo de inspección: ${actual.modalidad || "sin indicar"}`,
        `Fotos enviadas desde la app: ${total}`,
        "",
        "Haz el informe ya, sin esperar a las fotos: el perito las añade por su cuenta.",
      ].join("\n") + "\n";
    }
    const r = await Drive.sincronizar(actual, carpeta(actual), textos, aviso);
    if (r) {
      try { localStorage.removeItem("pedir-informe"); } catch {}
      await pintarGaleria();
      const fotos = `${r.fotos} foto${r.fotos === 1 ? "" : "s"} nueva${r.fotos === 1 ? "" : "s"}`;
      if (conInforme) {
        actual.informePedido = Date.now();
        actual.estadoInforme = { fase: "pedido", nDudas: 0, respondidas: false, word: "" };
        actual.borradorRespuestas = {};
        await tocar();
        ultimoEstado = null;
        pintarInforme();
        aviso(`Informe pedido ✓ (${fotos} y notas en Drive). El PC lo empezará en unos minutos; ` +
          "si tiene dudas te preguntará en la app de Claude.");
      } else {
        aviso(`Hecho ✓ ${fotos} y notas en Drive. En unos minutos estarán en la carpeta del PC.`);
      }
    }
  } catch (e) {
    aviso("No se pudo sincronizar: " + e.message);
  } finally {
    botones.forEach(b => b.disabled = false);
  }
}
$("btn-sincronizar").onclick = () => sincronizar(false);
$("btn-informe").onclick = () => {
  const faltan = [];
  if (!actual.modalidad) faltan.push("el tipo de inspección");
  if (!actual.tipo) faltan.push("el tipo de siniestro");
  const aviso = faltan.length ? `\n\nFalta ${faltan.join(" y ")}; el PC te lo preguntará.` : "";
  const ya = actual.informePedido ? "\n\nYa lo pediste antes: se hará de nuevo con los datos actuales." : "";
  if (confirm(`¿Pedir al PC el informe del siniestro ${actual.numero}?${aviso}${ya}`)) sincronizar(true);
};

// ---------- Estado del informe y dudas del PC ----------
let ultimoEstado = null;   // lo último leído de Drive para el siniestro abierto (con el texto de las dudas)

function pintarInforme() {
  const e = actual.estadoInforme;
  const caja = $("informe");
  caja.hidden = !actual.informePedido && !e?.fase;
  if (caja.hidden) return;
  const dudas = ultimoEstado?.dudas || [];
  const pendientes = dudas.length > 0 && !ultimoEstado.respondidas;
  caja.className = "informe" + (pendientes || (e?.nDudas && !e.respondidas) ? " dudas-pendientes" : e?.fase === "hecho" ? " hecho" : "");
  let titulo, detalle = "";
  if (pendientes) {
    titulo = `❓ El PC tiene ${dudas.length} duda${dudas.length === 1 ? "" : "s"}`;
    detalle = "Contesta aquí y pulsa «Enviar respuestas al PC». Lo que no sepas, déjalo en blanco.";
  } else if (e?.nDudas && !e.respondidas) {
    titulo = `❓ El PC tiene ${e.nDudas} duda${e.nDudas === 1 ? "" : "s"}`;
    detalle = "Pulsa «Comprobar» para verlas.";
  } else if (e?.fase === "hecho") {
    titulo = "✅ Informe hecho";
    detalle = "Está en la carpeta del siniestro del PC. No se ha enviado nada por correo.";
  } else if (e?.nDudas && e.respondidas) {
    titulo = "📨 Respuestas enviadas";
    detalle = "El PC seguirá con el informe en unos minutos.";
  } else if (e?.fase === "curso") {
    titulo = "⏳ El PC está haciendo el informe";
    detalle = "Si tiene dudas aparecerán aquí. Pulsa «Comprobar» de vez en cuando.";
  } else if (e?.fase === "pedido") {
    titulo = "📄 Informe pedido";
    detalle = "Esperando a que el PC lo recoja (suele tardar 5-15 minutos).";
  } else {
    titulo = "📄 Informe pedido";
    detalle = "Pulsa «Comprobar» para ver cómo va.";
  }
  if (e?.comprobado) detalle += ` Comprobado a las ${new Date(e.comprobado).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`;
  $("informe-estado").textContent = titulo;
  $("informe-detalle").textContent = detalle;
  const enlace = ultimoEstado?.word?.enlace || e?.word;
  $("btn-word").hidden = !(e?.fase === "hecho" && enlace);
  if (enlace) $("btn-word").href = enlace;
  pintarDudas(pendientes ? dudas : []);
}

function pintarDudas(dudas) {
  $("form-dudas").hidden = !dudas.length;
  const cont = $("lista-dudas");
  cont.innerHTML = "";
  const borrador = (actual.borradorRespuestas ||= {});
  for (const d of dudas) {
    const caja = document.createElement("div");
    caja.className = "duda";
    const p = document.createElement("p");
    p.textContent = d.pregunta;
    const texto = document.createElement("textarea");
    texto.rows = 2;
    texto.placeholder = "Tu respuesta…";
    texto.value = borrador[d.id] || "";
    texto.oninput = () => { borrador[d.id] = texto.value; tocar(); marcar(); };
    caja.append(p);
    const botones = [];
    if (Array.isArray(d.opciones) && d.opciones.length) {
      const fila = document.createElement("div");
      fila.className = "opciones";
      for (const o of d.opciones) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = o;
        b.onclick = () => { texto.value = borrador[d.id] = o; tocar(); marcar(); };
        botones.push(b);
        fila.append(b);
      }
      caja.append(fila);
    }
    const marcar = () => botones.forEach(b => b.classList.toggle("elegida", b.textContent === texto.value));
    marcar();
    caja.append(texto);
    cont.append(caja);
  }
}

// interactivo: el usuario pulsó «Comprobar» (si hace falta, se va a Google a dar permiso).
async function comprobarInforme(interactivo) {
  const numero = actual.numero;
  if (!Drive.hayPermiso()) {
    if (!interactivo) return;
    try { localStorage.setItem("tras-google", "comprobar"); } catch {}
    return Drive.pedirPermiso(numero);
  }
  $("btn-comprobar").disabled = true;
  if (interactivo) $("informe-detalle").textContent = "Comprobando en Drive…";
  try {
    const e = await Drive.estadoInforme(actual, carpeta(actual));
    if (actual?.numero !== numero) return;
    if (!e) {
      if (interactivo) { try { localStorage.setItem("tras-google", "comprobar"); } catch {} Drive.pedirPermiso(numero); }
      return;
    }
    ultimoEstado = e;
    actual.estadoInforme = resumirEstado(e);
    await tocar();
    pintarInforme();
  } catch (err) {
    if (interactivo) $("informe-detalle").textContent = "No se pudo comprobar: " + err.message;
  } finally {
    $("btn-comprobar").disabled = false;
  }
}
$("btn-comprobar").onclick = () => comprobarInforme(true);

$("form-dudas").onsubmit = async ev => {
  ev.preventDefault();
  const dudas = ultimoEstado?.dudas || [];
  const borrador = actual.borradorRespuestas || {};
  const respuestas = dudas.map(d => ({ id: d.id, pregunta: d.pregunta, respuesta: (borrador[d.id] || "").trim() }));
  if (!respuestas.some(r => r.respuesta)) { alert("No has contestado ninguna duda."); return; }
  const vacias = respuestas.filter(r => !r.respuesta).length;
  if (vacias && !confirm(`Hay ${vacias} duda${vacias === 1 ? "" : "s"} sin contestar. ¿Enviar igualmente?`)) return;
  const boton = $("btn-responder");
  boton.disabled = true;
  try {
    if (!Drive.hayPermiso()) { try { localStorage.setItem("tras-google", "responder"); } catch {} }
    const ok = await Drive.responder(actual, carpeta(actual), respuestas);
    if (!ok) return;   // se ha ido a Google; al volver se envían solas
    try { localStorage.removeItem("tras-google"); } catch {}
    ultimoEstado = { ...ultimoEstado, respondidas: true };
    actual.estadoInforme = { ...resumirEstado(ultimoEstado), comprobado: Date.now() };
    actual.borradorRespuestas = {};
    await tocar();
    pintarInforme();
  } catch (err) {
    $("informe-detalle").textContent = "No se pudieron enviar: " + err.message;
  } finally {
    boton.disabled = false;
  }
};

// ---------- Visor ----------
function verFoto(f, url) {
  fotoAbierta = f;
  $("foto-grande").src = url;
  mostrar("vista-foto");
}
$("btn-cerrar-foto").onclick = () => mostrar("vista-detalle");
$("btn-borrar-foto").onclick = async () => {
  if (!confirm("¿Borrar esta foto?")) return;
  await DB.borrarFoto(fotoAbierta.id);
  await pintarGaleria();
  mostrar("vista-detalle");
};

// ---------- Nuevo / editar ----------
function abrirDialogo(s) {
  editando = s ? s.numero : null;
  $("dialogo-titulo").textContent = s ? "Editar siniestro" : "Nuevo siniestro";
  $("f-numero").value = s ? s.numero : "";
  $("f-compania").value = s ? s.compania : "Zurich";
  $("f-direccion").value = s ? s.direccion : "";
  $("f-error").textContent = "";
  $("btn-borrar-siniestro").hidden = !s;
  $("dialogo").showModal();
}
$("btn-nuevo").onclick = () => abrirDialogo(null);
$("btn-editar").onclick = () => abrirDialogo(actual);
$("btn-cancelar").onclick = () => $("dialogo").close();

$("formulario").onsubmit = async e => {
  e.preventDefault();
  const numero = limpiar($("f-numero").value);
  const direccion = limpiar($("f-direccion").value);
  if (!numero || !direccion) {
    $("f-error").textContent = "Faltan el nº de siniestro o la dirección.";
    return;
  }
  if (numero !== editando && await DB.siniestro(numero)) {
    $("f-error").textContent = "Ya existe un siniestro con ese número.";
    return;
  }
  const previo = editando ? await DB.siniestro(editando) : null;
  const s = {
    ...(previo || { notas: "", creado: Date.now() }),
    numero, direccion, compania: $("f-compania").value, actualizado: Date.now(),
  };
  if (previo && numero !== editando) await DB.renombrarSiniestro(editando, s);
  else await DB.guardarSiniestro(s);
  $("dialogo").close();
  await abrir(numero);
};

// Borra del iPhone el siniestro con sus fotos, notas, mediciones y croquis (lo que ya está en el PC se queda).
async function borrarSiniestro(numero) {
  const fotos = await DB.fotos(numero);
  const sinSubir = fotos.filter(f => !f.subida).length;
  const aviso = sinSubir ? `\n\n⚠️ ${sinSubir} foto${sinSubir === 1 ? "" : "s"} aún no se ha${sinSubir === 1 ? "" : "n"} pasado al PC y se perderá${sinSubir === 1 ? "" : "n"}.` : "";
  if (!confirm(`¿Borrar el siniestro ${numero} y sus ${fotos.length} fotos de este iPhone?\nNo se puede deshacer.${aviso}`)) return false;
  await DB.borrarSiniestro(numero);
  actual = null;
  await pintarLista();
  mostrar("vista-lista");
  return true;
}

$("btn-borrar-siniestro").onclick = async () => {
  if (await borrarSiniestro(editando)) $("dialogo").close();
};

// ---------- Arranque ----------
// Pide al navegador que no borre los datos por falta de espacio.
navigator.storage?.persist?.();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
window.addEventListener("pagehide", guardarNotas);
document.addEventListener("visibilitychange", () => { if (document.hidden) guardarNotas(); });

(async () => {
  await pintarLista();
  // Si volvemos de dar permiso en Google, seguimos con la sincronización que se quedó a medias.
  const vuelta = Drive.volverDeGoogle();
  if (!vuelta?.numero || !await DB.siniestro(vuelta.numero)) return;
  await abrir(vuelta.numero);
  let conInforme = false, tras = null;
  try {
    conInforme = localStorage.getItem("pedir-informe") === vuelta.numero;
    tras = localStorage.getItem("tras-google");
    localStorage.removeItem("tras-google");
  } catch {}
  if (vuelta.error) $("estado-sync").textContent = vuelta.error;
  else if (tras === "comprobar") comprobarInforme(true);
  else if (tras === "responder") {
    await comprobarInforme(true);
    if (!$("form-dudas").hidden) $("form-dudas").requestSubmit();
  }
  else sincronizar(conInforme);
})();
