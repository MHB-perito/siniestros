// Pizarra para croquis. Solo para Miguel: se guardan en el iPhone y no se sincronizan.
const Croquis = (() => {
  const lienzo = $("lienzo");
  const ctx = lienzo.getContext("2d");
  const FONDO = "#ffffff";
  let abierto = null;     // croquis que se edita (null = nuevo)
  let color = "#16202c";
  let grosor = 6;
  let goma = false;
  let historial = [];     // para «Deshacer»
  let trazo = null;
  const urls = [];

  function preparar(imagen) {
    const r = window.devicePixelRatio || 1;
    const caja = lienzo.getBoundingClientRect();
    lienzo.width = Math.round(caja.width * r);
    lienzo.height = Math.round(caja.height * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.fillStyle = FONDO;
    ctx.fillRect(0, 0, caja.width, caja.height);
    if (imagen) {   // al reabrir un croquis se dibuja encima, encajado sin deformar
      const k = Math.min(caja.width / imagen.width, caja.height / imagen.height);
      ctx.drawImage(imagen, (caja.width - imagen.width * k) / 2, (caja.height - imagen.height * k) / 2,
        imagen.width * k, imagen.height * k);
    }
    historial = [];
  }

  const foto = () => ctx.getImageData(0, 0, lienzo.width, lienzo.height);

  lienzo.addEventListener("pointerdown", e => {
    lienzo.setPointerCapture(e.pointerId);
    if (historial.length > 30) historial.shift();
    historial.push(foto());
    trazo = { x: e.offsetX, y: e.offsetY };
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = goma ? FONDO : color;
    ctx.lineWidth = goma ? grosor * 4 : grosor;
    ctx.beginPath();
    ctx.moveTo(trazo.x, trazo.y);
    ctx.lineTo(trazo.x + 0.01, trazo.y);   // un toque deja un punto
    ctx.stroke();
  });
  lienzo.addEventListener("pointermove", e => {
    if (!trazo) return;
    ctx.beginPath();
    ctx.moveTo(trazo.x, trazo.y);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    trazo = { x: e.offsetX, y: e.offsetY };
  });
  for (const fin of ["pointerup", "pointercancel"]) lienzo.addEventListener(fin, () => { trazo = null; });

  document.querySelectorAll("#vista-croquis .color").forEach(b => b.onclick = () => {
    color = b.dataset.color;
    goma = false;
    document.querySelectorAll("#vista-croquis .color, #cq-goma").forEach(x => x.classList.toggle("activo", x === b));
  });
  document.querySelectorAll("#vista-croquis [data-grosor]").forEach(b => b.onclick = () => {
    grosor = +b.dataset.grosor;
    document.querySelectorAll("#vista-croquis [data-grosor]").forEach(x => x.classList.toggle("activo", x === b));
  });
  $("cq-goma").onclick = () => {
    goma = !goma;
    $("cq-goma").classList.toggle("activo", goma);
  };

  $("cq-deshacer").onclick = () => { if (historial.length) ctx.putImageData(historial.pop(), 0, 0); };
  $("cq-limpiar").onclick = () => {
    historial.push(foto());
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FONDO;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.restore();
  };

  async function abrir(c) {
    abierto = c;
    $("cq-borrar").hidden = !c;
    mostrar("vista-croquis");
    let imagen = null;
    if (c) {
      imagen = new Image();
      imagen.src = URL.createObjectURL(c.blob);
      await imagen.decode().catch(() => {});
      URL.revokeObjectURL(imagen.src);
    }
    preparar(imagen);
  }

  async function cerrar() {
    await pintar();
    mostrar("vista-detalle");
    $("btn-nuevo-croquis").scrollIntoView({ block: "center" });
  }

  $("cq-cerrar").onclick = () => {
    if (historial.length && !confirm("¿Salir sin guardar el croquis?")) return;
    cerrar();
  };
  $("cq-guardar").onclick = async () => {
    const blob = await new Promise(ok => lienzo.toBlob(ok, "image/png"));
    await DB.guardarCroquis({ ...(abierto || { numero: actual.numero }), blob, fecha: Date.now() });
    await tocar();
    cerrar();
  };
  $("cq-borrar").onclick = async () => {
    if (!confirm("¿Borrar este croquis?")) return;
    await DB.borrarCroquis(abierto.id);
    cerrar();
  };
  $("btn-nuevo-croquis").onclick = () => abrir(null);

  async function pintar() {
    urls.splice(0).forEach(URL.revokeObjectURL);
    const todos = (await DB.croquis(actual.numero)).sort((a, b) => a.fecha - b.fecha);
    const g = $("lista-croquis");
    g.innerHTML = "";
    for (const c of todos) {
      const url = URL.createObjectURL(c.blob);
      urls.push(url);
      const img = document.createElement("img");
      img.src = url;
      img.onclick = () => abrir(c);
      g.appendChild(img);
    }
  }

  return { pintar };
})();
