const $ = id => document.getElementById(id);

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

function mostrar(vista) {
  for (const v of ["vista-lista", "vista-detalle", "vista-camara", "vista-foto"]) $(v).hidden = v !== vista;
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
    chip(`📷 ${fotos.length}`);
    if (s.notas) chip("📝 Notas");
    if (sinSubir) chip(`${sinSubir} sin pasar al PC`, "pendiente");
    else if (fotos.length) chip("✓ En el PC", "ok");
    li.onclick = () => abrir(s.numero);
    ul.appendChild(li);
  }
}
$("buscar").addEventListener("input", pintarLista);

// ---------- Detalle ----------
async function abrir(numero) {
  actual = await DB.siniestro(numero);
  $("det-numero").textContent = actual.numero;
  $("det-direccion").textContent = actual.direccion;
  $("det-compania").textContent = actual.compania;
  $("det-compania").className = `etiqueta ${actual.compania}`;
  $("det-carpeta").textContent = `Carpeta: Siniestros/${carpeta(actual)}`;
  $("notas").value = actual.notas || "";
  $("estado-notas").textContent = "";
  await pintarGaleria();
  mostrar("vista-detalle");
}

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
  await DB.guardarSiniestro(actual);
}

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
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  $("flash").classList.add("on");
  setTimeout(() => $("flash").classList.remove("on"), 80);
  const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", 0.9));
  await DB.añadirFoto(actual.numero, blob);
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
  for (const f of e.target.files) await DB.añadirFoto(actual.numero, f);
  e.target.value = "";
  await tocar();
  await pintarGaleria();
};

// ---------- Sincronizar con Google Drive ----------
async function sincronizar() {
  await guardarNotas();
  const boton = $("btn-sincronizar");
  const aviso = t => { $("estado-sync").textContent = t; };
  boton.disabled = true;
  try {
    const r = await Drive.sincronizar(actual, carpeta(actual), aviso);
    if (r) {
      await pintarGaleria();
      aviso(`Hecho ✓ ${r.fotos} foto${r.fotos === 1 ? "" : "s"} nueva${r.fotos === 1 ? "" : "s"} y notas en Drive. ` +
        "En unos minutos estarán en la carpeta del PC.");
    }
  } catch (e) {
    aviso("No se pudo sincronizar: " + e.message);
  } finally {
    boton.disabled = false;
  }
}
$("btn-sincronizar").onclick = sincronizar;

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

$("btn-borrar-siniestro").onclick = async () => {
  const n = await DB.contarFotos(editando);
  if (!confirm(`¿Borrar el siniestro ${editando} y sus ${n} fotos de este iPhone?\nNo se puede deshacer.`)) return;
  await DB.borrarSiniestro(editando);
  $("dialogo").close();
  actual = null;
  await pintarLista();
  mostrar("vista-lista");
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
  if (vuelta.error) $("estado-sync").textContent = vuelta.error;
  else sincronizar();
})();
