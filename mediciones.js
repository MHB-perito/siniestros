// Mediciones para reparar: estancias con sus elementos (techo 10 m², paredes 25 m²…).
// Se guardan en actual.mediciones y se pasan al PC como mediciones.txt.
const Mediciones = (() => {
  const ESTANCIAS = ["Salón", "Comedor", "Cocina", "Baño", "Aseo", "Dormitorio", "Dormitorio principal",
    "Pasillo", "Recibidor", "Terraza", "Lavadero", "Garaje", "Trastero", "Fachada", "Cubierta", "Zonas comunes"];
  const UNIDADES = ["m²", "ml", "ud"];
  const ELEMENTOS = {   // elemento → unidad por defecto
    "Techo": "m²", "Paredes": "m²", "Suelo": "m²", "Alicatado": "m²", "Falso techo": "m²",
    "Rodapié": "ml", "Mueble de cocina": "ml", "Encimera": "ml",
    "Puerta": "ud", "Ventana": "ud", "Armario": "ud",
  };
  const POR_DEFECTO = ["Techo", "Paredes", "Suelo"];

  $("estancias").innerHTML = ESTANCIAS.map(e => `<option value="${e}">`).join("");

  const lista = () => (actual.mediciones ||= []);

  function el(etiqueta, props = {}, hijos = []) {
    const e = Object.assign(document.createElement(etiqueta), props);
    e.append(...hijos);
    return e;
  }

  function pintar() {
    const cont = $("mediciones");
    cont.innerHTML = "";
    $("mediciones-vacio").hidden = lista().length > 0;
    lista().forEach((est, i) => {
      const filas = est.elementos.map((m, j) => {
        const cantidad = el("input", { value: m.cantidad || "", inputMode: "decimal", placeholder: "0" });
        cantidad.oninput = () => { m.cantidad = cantidad.value.trim(); tocar(); };
        const unidad = el("select", {}, UNIDADES.map(u => el("option", { value: u, textContent: u, selected: u === m.unidad })));
        unidad.onchange = () => { m.unidad = unidad.value; tocar(); };
        const quitar = el("button", { className: "quitar", textContent: "✕", ariaLabel: "Quitar " + m.nombre });
        quitar.onclick = () => { est.elementos.splice(j, 1); tocar(); pintar(); };
        return el("div", { className: "medida" }, [el("span", { textContent: m.nombre }), cantidad, unidad, quitar]);
      });

      const añadir = el("select", { className: "añadir-elemento" }, [
        el("option", { value: "", textContent: "+ Añadir elemento…" }),
        ...Object.keys(ELEMENTOS).filter(n => !est.elementos.some(m => m.nombre === n))
          .map(n => el("option", { value: n, textContent: n })),
        el("option", { value: "*", textContent: "Otro (escribirlo)…" }),
      ]);
      añadir.onchange = () => {
        let nombre = añadir.value;
        if (nombre === "*") nombre = (prompt("¿Qué elemento?") || "").trim();
        if (!nombre) { añadir.value = ""; return; }
        est.elementos.push({ nombre, cantidad: "", unidad: ELEMENTOS[nombre] || "m²" });
        tocar();
        pintar();
      };

      const borrar = el("button", { className: "btn-peligro", textContent: "Quitar" });
      borrar.onclick = () => {
        if (!confirm(`¿Quitar ${est.estancia} y sus mediciones?`)) return;
        lista().splice(i, 1);
        tocar();
        pintar();
      };

      cont.append(el("div", { className: "estancia" }, [
        el("div", { className: "estancia-cab" }, [el("h4", { textContent: est.estancia }), borrar]),
        ...filas, añadir,
      ]));
    });
  }

  $("form-estancia").onsubmit = e => {
    e.preventDefault();
    const nombre = $("nueva-estancia").value.trim();
    if (!nombre) return;
    const n = lista().filter(x => x.estancia.replace(/ \d+$/, "") === nombre).length;
    lista().push({
      estancia: n ? `${nombre} ${n + 1}` : nombre,   // dos dormitorios → «Dormitorio 2»
      elementos: POR_DEFECTO.map(x => ({ nombre: x, cantidad: "", unidad: ELEMENTOS[x] })),
    });
    $("nueva-estancia").value = "";
    $("nueva-estancia").blur();
    tocar();
    pintar();
  };

  // Texto para mediciones.txt (solo lo que tiene cantidad).
  function texto(s) {
    return (s.mediciones || [])
      .map(est => {
        const filas = est.elementos.filter(m => m.cantidad).map(m => `  - ${m.nombre}: ${m.cantidad} ${m.unidad}`);
        return filas.length ? `${est.estancia}\n${filas.join("\n")}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return { pintar, texto };
})();
