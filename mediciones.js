// Mediciones para reparar: estancias con sus elementos (techo 10 m², paredes 25 m²…).
// Se guardan en actual.mediciones; las genéricas (sin estancia) en actual.medicionesGenericas.
// Pasan al PC dentro de notas.txt para valorar el informe con el baremo de la compañía.
const Mediciones = (() => {
  const UNIDADES = ["m²", "ml", "ud"];
  const ELEMENTOS = {   // elemento → unidad por defecto
    "Techo": "m²", "Paredes": "m²", "Suelo": "m²", "Alicatado": "m²", "Falso techo": "m²",
    "Rodapié": "ml", "Mueble de cocina": "ml", "Encimera": "ml",
    "Puerta": "ud", "Ventana": "ud", "Armario": "ud",
  };
  const POR_DEFECTO = ["Techo", "Paredes", "Suelo"];

  const lista = () => (actual.mediciones ||= []);
  const genericas = () => (actual.medicionesGenericas ||= []);
  const num = t => parseFloat(String(t || "").replace(",", ".")) || 0;
  const bonito = n => String(Math.round(n * 100) / 100).replace(".", ",");

  function el(etiqueta, props = {}, hijos = []) {
    const e = Object.assign(document.createElement(etiqueta), props);
    e.append(...hijos);
    return e;
  }

  // Suma cada elemento de todas las estancias (Techo: 4 + 15 = 19 m²).
  function totales(s) {
    const t = {};
    for (const est of s.mediciones || []) for (const m of est.elementos) {
      if (!num(m.cantidad)) continue;
      const clave = `${m.nombre}|${m.unidad}`;
      t[clave] = (t[clave] || 0) + num(m.cantidad);
    }
    return Object.entries(t).map(([k, v]) => { const [nombre, unidad] = k.split("|"); return { nombre, unidad, total: v }; });
  }

  function pintarResumen() {
    const filas = (actual.mediciones || []).length > 1 ? totales(actual) : [];
    const cont = $("resumen-partidas");
    cont.innerHTML = "";
    cont.className = filas.length ? "resumen-partidas" : "";
    if (!filas.length) return;
    cont.append(el("b", { textContent: "Total por elemento (todas las estancias)" }),
      ...filas.map(t => el("div", {}, [el("span", { textContent: t.nombre }), el("span", { textContent: `${bonito(t.total)} ${t.unidad}` })])));
  }

  function pintarGenericas() {
    const cont = $("mediciones-genericas");
    cont.innerHTML = "";
    genericas().forEach((m, j) => {
      const nombre = el("input", { className: "nombre", value: m.nombre || "", placeholder: "Pintura techos, alicatado…", autocomplete: "off" });
      nombre.oninput = () => { m.nombre = nombre.value; tocar(); };
      const cantidad = el("input", { value: m.cantidad || "", inputMode: "decimal", placeholder: "0" });
      cantidad.oninput = () => { m.cantidad = cantidad.value.trim(); tocar(); };
      const unidad = el("select", {}, UNIDADES.map(u => el("option", { value: u, textContent: u, selected: u === m.unidad })));
      unidad.onchange = () => { m.unidad = unidad.value; tocar(); };
      const quitar = el("button", { className: "quitar", textContent: "✕", ariaLabel: "Quitar medición" });
      quitar.onclick = () => { genericas().splice(j, 1); tocar(); pintarGenericas(); };
      cont.append(el("div", { className: "medida generica" }, [nombre, cantidad, unidad, quitar]));
    });
  }
  $("btn-generica").onclick = () => {
    genericas().push({ nombre: "", cantidad: "", unidad: "m²" });
    tocar();
    pintarGenericas();
    $("mediciones-genericas").querySelector(".medida:last-child input")?.focus();
  };

  function pintar() {
    pintarGenericas();
    pintarResumen();
    const cont = $("mediciones");
    cont.innerHTML = "";
    lista().forEach((est, i) => {
      const filas = est.elementos.map((m, j) => {
        const cantidad = el("input", { value: m.cantidad || "", inputMode: "decimal", placeholder: "0" });
        cantidad.oninput = () => { m.cantidad = cantidad.value.trim(); tocar(); pintarResumen(); };
        const unidad = el("select", {}, UNIDADES.map(u => el("option", { value: u, textContent: u, selected: u === m.unidad })));
        unidad.onchange = () => { m.unidad = unidad.value; tocar(); pintarResumen(); };
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

  const conDato = s => [
    ...(s.mediciones || []).flatMap(e => e.elementos.filter(m => num(m.cantidad))),
    ...(s.medicionesGenericas || []).filter(m => m.nombre?.trim() && num(m.cantidad)),
  ];
  const hayAlgo = s => conDato(s).length > 0;
  const resumen = s => { const n = conDato(s).length; return n ? `(${n})` : ""; };

  // Texto para notas.txt
  function texto(s) {
    const partes = [];
    const estancias = (s.mediciones || []).map(est => {
      const filas = est.elementos.filter(m => num(m.cantidad)).map(m => `  - ${m.nombre}: ${m.cantidad} ${m.unidad}`);
      return filas.length ? `${est.estancia}:\n${filas.join("\n")}` : "";
    }).filter(Boolean);
    if (estancias.length) partes.push("Mediciones por estancias:\n" + estancias.join("\n"));
    const gen = (s.medicionesGenericas || []).filter(m => m.nombre?.trim() && num(m.cantidad));
    if (gen.length) partes.push("Mediciones genéricas:\n" + gen.map(m => `- ${m.nombre.trim()}: ${m.cantidad} ${m.unidad}`).join("\n"));
    const tot = totales(s);
    if (tot.length && (s.mediciones || []).length > 1)
      partes.push("Total por elemento (suma de estancias):\n" + tot.map(t => `- ${t.nombre}: ${bonito(t.total)} ${t.unidad}`).join("\n"));
    return partes.join("\n\n");
  }

  return { pintar, hayAlgo, resumen, texto };
})();
