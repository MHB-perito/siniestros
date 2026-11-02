// Guion de la visita: tipo de siniestro con su checklist (de checklist.md) y contactos de terceros.
// Todo va al PC dentro de notas.txt para que el informe salga con los datos completos.
//   actual.tipo:      clave de TIPOS
//   actual.checklist: { "<punto>": { hecho, detalle } }
//   actual.terceros:  [{ rol, nombre, telefono, vivienda, compania, referencia }]
const Guion = (() => {
  const TIPOS = {
    lluvia: {
      nombre: "Daños por agua — lluvia",
      puntos: [
        "Punto de entrada del agua (cubierta, tejas, fachada, carpintería…)",
        "Estancias y elementos afectados",
        "Fecha de la lluvia / aparición de los daños",
        "Estado de conservación de la cubierta o elemento por el que filtra",
        "Reparaciones o medidas ya hechas por el asegurado",
      ],
    },
    terraza: {
      nombre: "Filtración de terceros — terraza",
      puntos: [
        "Vivienda causante (planta y letra)",
        "Estancia afectada debajo",
        "Acceso a la terraza causante",
        "Terraza original o modificada",
        "Fecha de aparición de los daños",
        "Origen reparado o pendiente",
      ],
    },
    tuberia: {
      nombre: "Filtración de terceros — tubería",
      puntos: [
        "Vivienda causante",
        "Elemento que fuga (desagüe, bajante, flexo, tubería…)",
        "Patrón de las manchas (descendente, activas o secas)",
        "Origen reparado por el causante",
        "Reparación comprobada en la inspección",
      ],
    },
    propia: {
      nombre: "Fuga en instalación propia",
      puntos: [
        "Cómo se localizó el origen (llaves de corte, prueba de estanqueidad, fontanero…)",
        "Elemento que fuga y ubicación",
        "Daños a terceros o al contenido",
        "Quién repara el origen (fontanero propio o de la compañía)",
        "Superficie afectada y partidas",
      ],
    },
    viento: {
      nombre: "Daños por viento",
      puntos: [
        "Elemento dañado, material y anclaje",
        "Fecha en que se detectó el daño",
        "Rachas de viento consultadas en Aemet",
        "Presupuesto aportado o valoración propia",
      ],
    },
    electricos: {
      nombre: "Daños eléctricos",
      puntos: [
        "Fecha y tipo de evento (corte, sobretensión, rayo…)",
        "¿Afectó a los vecinos?",
        "Equipos dañados (tipo, marca, modelo)",
        "Equipos en servicio técnico",
        "Reclamación a la distribuidora y nº de expediente",
        "Cuadro revisado (magnetotérmicos, diferenciales, protector de sobretensiones)",
        "Año de la instalación eléctrica",
        "Facturas o informe técnico de reparabilidad",
      ],
    },
    robo: {
      nombre: "Robo",
      puntos: [
        "Fecha y franja horaria",
        "¿Había alguien en la vivienda?",
        "Acceso: forzado o no, por dónde, daños en cerraduras o ventanas",
        "Objetos robados (marca, modelo, material)",
        "Denuncia (comisaría y si detalla los objetos)",
        "Documentación aportada (facturas, fotos, tasaciones)",
        "Medidas de seguridad (alarma, rejas, puerta de seguridad)",
      ],
    },
    otro: { nombre: "Otro", puntos: [] },
  };
  const ROLES = ["Causante", "Administrador de la comunidad", "Presidente de la comunidad", "Inquilino", "Otro"];
  const CAMPOS = [   // datos de cada tercero
    ["nombre", "Nombre", "text"],
    ["telefono", "Teléfono", "tel"],
    ["vivienda", "Vivienda / dirección (planta, letra…)", "text"],
    ["compania", "Su compañía de seguros", "text"],
    ["referencia", "Nº de póliza o de siniestro", "text"],
  ];

  function el(etiqueta, props = {}, hijos = []) {
    const e = Object.assign(document.createElement(etiqueta), props);
    e.append(...hijos);
    return e;
  }

  // ---------- Tipo y checklist ----------
  $("tipo-siniestro").append(
    el("option", { value: "", textContent: "Elige el tipo…" }),
    ...Object.entries(TIPOS).map(([k, t]) => el("option", { value: k, textContent: t.nombre })),
  );
  $("tipo-siniestro").onchange = () => {
    actual.tipo = $("tipo-siniestro").value;
    tocar();
    pintarChecklist();
  };

  function pintarChecklist() {
    const puntos = TIPOS[actual.tipo]?.puntos || [];
    const marcas = (actual.checklist ||= {});
    const cont = $("checklist");
    cont.innerHTML = "";
    const contar = () => {
      const n = puntos.filter(p => marcas[p]?.hecho).length;
      $("checklist-cuenta").textContent = puntos.length ? `${n} de ${puntos.length} revisados` : "";
    };
    for (const p of puntos) {
      const m = (marcas[p] ||= { hecho: false, detalle: "" });
      const casilla = el("input", { type: "checkbox", checked: m.hecho });
      const detalle = el("input", { value: m.detalle, placeholder: "Detalle (opcional)", hidden: !m.hecho, enterKeyHint: "done" });
      casilla.onchange = () => {
        m.hecho = casilla.checked;
        detalle.hidden = !m.hecho;
        tocar();
        contar();
      };
      detalle.oninput = () => { m.detalle = detalle.value; tocar(); };
      cont.append(el("div", { className: "punto" }, [
        el("label", {}, [casilla, el("span", { textContent: p })]),
        detalle,
      ]));
    }
    contar();
  }

  // ---------- Terceros ----------
  function pintarTerceros() {
    const lista = (actual.terceros ||= []);
    const cont = $("terceros");
    cont.innerHTML = "";
    lista.forEach((t, i) => {
      const rol = el("select", {}, ROLES.map(r => el("option", { value: r, textContent: r, selected: r === t.rol })));
      rol.onchange = () => { t.rol = rol.value; tocar(); };
      const llamar = el("a", { className: "btn-llamar", textContent: "📞 Llamar" });
      const ponerTel = () => {
        const tel = (t.telefono || "").replace(/[^\d+]/g, "");
        llamar.hidden = !tel;
        llamar.href = "tel:" + tel;
      };
      const campos = CAMPOS.map(([clave, texto, tipo]) => {
        const input = el("input", { type: tipo, value: t[clave] || "", placeholder: texto, autocomplete: "off" });
        input.oninput = () => { t[clave] = input.value; tocar(); if (clave === "telefono") ponerTel(); };
        return input;
      });
      ponerTel();
      const quitar = el("button", { className: "btn-peligro", textContent: "Quitar" });
      quitar.onclick = () => {
        if (!confirm(`¿Quitar el contacto${t.nombre ? " de " + t.nombre : ""}?`)) return;
        lista.splice(i, 1);
        tocar();
        pintarTerceros();
      };
      cont.append(el("div", { className: "tercero" }, [
        el("div", { className: "tercero-cab" }, [rol, quitar]),
        ...campos, llamar,
      ]));
    });
  }
  $("btn-tercero").onclick = () => {
    const rol = ["terraza", "tuberia"].includes(actual.tipo) ? "Causante" : ROLES[0];
    (actual.terceros ||= []).push({ rol });
    tocar();
    pintarTerceros();
    const campos = $("terceros").querySelectorAll(".tercero:last-child input");
    campos[0]?.focus();
  };

  function pintar() {
    $("tipo-siniestro").value = actual.tipo || "";
    pintarChecklist();
    pintarTerceros();
  }

  // ---------- Texto para notas.txt ----------
  function texto(s) {
    const partes = [];
    const tipo = TIPOS[s.tipo];
    if (tipo) {
      partes.push(`Tipo de siniestro: ${tipo.nombre}`);
      const filas = tipo.puntos.map(p => {
        const m = s.checklist?.[p];
        if (!m?.hecho) return `[ ] ${p}`;
        return `[x] ${p}${m.detalle?.trim() ? ": " + m.detalle.trim() : ""}`;
      });
      if (filas.length) partes.push("Checklist de la visita:\n" + filas.join("\n"));
    }
    const terceros = (s.terceros || []).filter(t => CAMPOS.some(([c]) => t[c]?.trim()));
    if (terceros.length) {
      partes.push("Terceros implicados:\n" + terceros.map(t =>
        `- ${t.rol || "Tercero"}: ` + CAMPOS.filter(([c]) => t[c]?.trim()).map(([c, n]) => `${n}: ${t[c].trim()}`).join("; ")
      ).join("\n"));
    }
    return partes.join("\n\n");
  }

  const nombreTipo = s => TIPOS[s.tipo]?.nombre || "";

  return { pintar, texto, nombreTipo };
})();
