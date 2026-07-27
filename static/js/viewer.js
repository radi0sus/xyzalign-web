"use strict";

/*
  3Dmol.js wrapper, adapted from the advanced-orca-orb / modeviz viewer.js
  lineage. Two deliberate differences from that template, both specific
  to an alignment tool:

  - The X/Y/Z axis arrows are shown by DEFAULT (not an opt-in toggle),
    since without them there is no way to tell the molecule's current
    orientation relative to the coordinate axes after a rotation - which
    is the entire point of this tool. The toggle still exists for anyone
    who wants an unobstructed view, but starts checked.
  - The axes are anchored at the true coordinate origin (0,0,0), not at
    the molecule's centroid or the last-selected atom. What matters here
    is the molecule's position/orientation *relative to the axes*, so the
    axes must sit at a fixed, meaningful point (the origin the transforms
    actually operate against) rather than following the selection.
*/
window.XA_VIEWER = (() => {
  const Elements = window.XA_ELEMENTS;

  const SELECT_COLOR = "#00d4ff";
  const AXIS_COLORS = { x: "#e6483c", y: "#2fae4e", z: "#2f8fe6" };
  const AXIS_LENGTH = 2.2;
  const AXIS_RADIUS = 0.045;

  let viewer = null;
  let model = null;
  let atoms = [];
  let bonds = [];
  let bondTolerancePct = 8;
  let hasZoomed = false;
  let onAtomClick = null;

  function addAxesArrows() {
    const origin = { x: 0, y: 0, z: 0 };
    const dirs = {
      x: { x: 1, y: 0, z: 0 },
      y: { x: 0, y: 1, z: 0 },
      z: { x: 0, y: 0, z: 1 }
    };
    for (const key of Object.keys(dirs)) {
      const dir = dirs[key];
      const end = {
        x: origin.x + dir.x * AXIS_LENGTH,
        y: origin.y + dir.y * AXIS_LENGTH,
        z: origin.z + dir.z * AXIS_LENGTH
      };
      viewer.addArrow({
        start: origin, end, radius: AXIS_RADIUS, radiusRatio: 2.4, mid: 0.82,
        color: AXIS_COLORS[key]
      });
      viewer.addLabel(key.toUpperCase(), {
        position: end, fontColor: AXIS_COLORS[key], font: "sans-serif",
        fontSize: 22, showBackground: false, inFront: true
      });
    }
  }

  function init(containerId) {
    const el = document.getElementById(containerId);
    const css = getComputedStyle(document.documentElement);
    let bg = css.getPropertyValue("--viewer-bg").trim() || "#1a1a1a";
    if (bg.startsWith("#")) bg = "0x" + bg.slice(1);
    viewer = $3Dmol.createViewer(el, { backgroundColor: bg, antialias: true });
  }

  function setAtomClickCallback(fn) {
    onAtomClick = fn;
  }

  function load(geometryAtoms) {
    atoms = geometryAtoms || [];
    bonds = Elements.findBonds(atoms, bondTolerancePct);
    hasZoomed = false;
  }

  // Pushes updated coordinates (after a transform) into the viewer without
  // resetting the camera/zoom - unlike load(), which is only for a brand
  // new file.
  function setAtoms(geometryAtoms) {
    atoms = geometryAtoms || [];
    bonds = Elements.findBonds(atoms, bondTolerancePct);
  }

  function setBondTolerance(pct) {
    bondTolerancePct = pct;
    if (atoms.length > 0) bonds = Elements.findBonds(atoms, bondTolerancePct);
  }

  function resize() {
    if (!viewer) return;
    if (typeof viewer.resize === "function") viewer.resize();
    viewer.render();
  }

  function updateBackgroundColor() {
    if (!viewer) return;
    const css = getComputedStyle(document.documentElement);
    let bg = css.getPropertyValue("--viewer-bg").trim() || "#1a1a1a";
    if (bg.startsWith("#")) bg = "0x" + bg.slice(1);
    viewer.setBackgroundColor(bg);
    viewer.render();
  }

  function render({ selectedNums = new Set(), showAxes = true, keepView = true } = {}) {
    if (!viewer || atoms.length === 0) return;

    viewer.removeAllModels();
    viewer.removeAllShapes();
    viewer.removeAllLabels();

    const xyzLines = [atoms.length.toString(), "xyzalign-web"];
    for (const a of atoms) xyzLines.push(`${a.element} ${a.x} ${a.y} ${a.z}`);
    model = viewer.addModel(xyzLines.join("\n"), "xyz");

    const elements = [...new Set(atoms.map((a) => a.element))];
    for (const el of elements) {
      model.setStyle({ elem: el }, { sphere: { radius: 0.28, color: Elements.getColor(el) } });
    }

    for (const a of atoms) {
      if (!selectedNums.has(a.num)) continue;
      viewer.addSphere({ center: { x: a.x, y: a.y, z: a.z }, radius: 0.5, color: SELECT_COLOR, opacity: 0.5 });
      viewer.addSphere({ center: { x: a.x, y: a.y, z: a.z }, radius: 0.54, color: SELECT_COLOR, wireframe: true, opacity: 0.9 });
    }

    for (const bond of bonds) {
      const a = atoms[bond.i];
      const b = atoms[bond.j];
      if (!a || !b) continue;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      viewer.addCylinder({ start: { x: a.x, y: a.y, z: a.z }, end: mid, radius: 0.07, color: Elements.getColor(a.element), fromCap: 1, toCap: 0 });
      viewer.addCylinder({ start: { x: b.x, y: b.y, z: b.z }, end: mid, radius: 0.07, color: Elements.getColor(b.element), fromCap: 1, toCap: 0 });
    }

    if (showAxes) addAxesArrows();

    model.setClickable({}, true, (atom) => {
      if (!atom) return;
      const atomObj = atoms[atom.index];
      if (!atomObj) return;
      if (onAtomClick) onAtomClick(atomObj.num);
    });

    if (!hasZoomed) {
      viewer.zoomTo();
      viewer.zoom(0.8);
      hasZoomed = true;
    } else if (!keepView) {
      viewer.zoomTo();
      viewer.zoom(0.8);
    }

    viewer.render();
    renderLegend(elements);
  }

  function renderLegend(elements) {
    const el = document.getElementById("viewer-legend");
    if (!el) return;
    const priority = { H: 0, C: 1 };
    const sorted = [...elements].sort((a, b) => {
      const pa = priority[a] ?? 2;
      const pb = priority[b] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
    el.innerHTML = sorted
      .map((s) => `<div class="viewer-legend-item"><span class="viewer-legend-swatch" style="background:${Elements.getColor(s)}"></span><span>${s}</span></div>`)
      .join("");
  }

  function resetView() {
    if (!viewer) return;
    viewer.zoomTo();
    viewer.zoom(0.8);
    viewer.render();
  }

  return { init, load, setAtoms, render, resize, resetView, setAtomClickCallback, setBondTolerance, updateBackgroundColor };
})();
