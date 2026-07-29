"use strict";

(() => {
  const Parse = window.XA_PARSE;
  const Math3 = window.XA_MATH;
  const Viewer = window.XA_VIEWER;
  const UI = window.XA_UI;
  const Export = window.XA_EXPORT;

  const state = {
    filename: null,
    header: [],
    originalAtoms: [],
    atoms: [],
    selectedNums: new Set(),
    groupX: new Set(),
    groupY: new Set(),
    groupZ: new Set(),
    searchTerm: "",
    log: [],
    stepCount: 0
  };

  function fmtVec(v) {
    return `${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}`;
  }

  function fmtMatrix(M) {
    return M.map((row) => "  " + row.map((v) => v.toFixed(4).padStart(10)).join(" ")).join("\n");
  }

  function selectionAtoms() {
    return state.atoms.filter((a) => state.selectedNums.has(a.num));
  }

  function selectionLabel() {
    const list = [...state.selectedNums].sort((a, b) => a - b);
    const byNum = new Map(state.atoms.map((a) => [a.num, a]));
    return list.map((n) => (byNum.get(n) ? `${byNum.get(n).element}${n}` : `#${n}`)).join(", ");
  }

  function labelForNums(nums) {
    const byNum = new Map(state.atoms.map((a) => [a.num, a]));
    return [...nums].map((n) => (byNum.get(n) ? `${byNum.get(n).element}${n}` : `#${n}`)).join(", ");
  }

  function pushLog(entry) {
    state.stepCount += 1;
    state.log.push(`[${state.stepCount}] ${entry}`);
    UI.renderLog(state.log);
    document.getElementById("step-badge").textContent =
      `${state.stepCount} step${state.stepCount === 1 ? "" : "s"} applied`;
  }

  function showInversionWarning(message) {
    const banner = document.getElementById("warning-banner");
    banner.textContent = `⚠️ ${message} (click to dismiss)`;
    banner.style.display = "block";
  }

  function hideInversionWarning() {
    document.getElementById("warning-banner").style.display = "none";
  }


  function updateButtonsState() {
    const hasSelection = state.selectedNums.size > 0;
    document.getElementById("btn-assign-x").disabled = !hasSelection;
    document.getElementById("btn-assign-y").disabled = !hasSelection;
    document.getElementById("btn-assign-z").disabled = !hasSelection;

    const anyGroup = state.groupX.size > 0 || state.groupY.size > 0 || state.groupZ.size > 0;
    document.getElementById("btn-run-axes").disabled = !anyGroup;

    document.getElementById("origin-note").textContent = hasSelection
      ? `Will use selected atom(s): ${selectionLabel()}`
      : "No selection — will use the centroid of all atoms.";
  }

  function renderAll(keepView, focusNum) {
    UI.renderAtomList(state.atoms, state.selectedNums, state.searchTerm, toggleSelection, focusNum);
    UI.renderSelectionChips(state.atoms, state.selectedNums, (num) => {
      state.selectedNums.delete(num);
      renderAll(true);
    });
    UI.renderChipsInto("group-x-chips", state.atoms, state.groupX, (num) => { state.groupX.delete(num); renderAll(true); });
    UI.renderChipsInto("group-y-chips", state.atoms, state.groupY, (num) => { state.groupY.delete(num); renderAll(true); });
    UI.renderChipsInto("group-z-chips", state.atoms, state.groupZ, (num) => { state.groupZ.delete(num); renderAll(true); });
    updateButtonsState();
    const showAxes = document.getElementById("axes-toggle").checked;
    Viewer.setAtoms(state.atoms);
    Viewer.render({ selectedNums: state.selectedNums, showAxes, keepView });
  }

  function toggleSelection(num) {
    if (state.selectedNums.has(num)) state.selectedNums.delete(num);
    else state.selectedNums.add(num);
    renderAll(true, num);
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Parse.parseXyz(reader.result, file.name);
      if (parsed.atoms.length === 0) {
        alert("Could not find any atom lines (element x y z) in this file.");
        return;
      }
      state.filename = file.name;
      state.header = parsed.header;
      state.originalAtoms = parsed.atoms;
      state.atoms = parsed.atoms.map((a) => ({ ...a }));
      state.selectedNums = new Set();
      state.groupX = new Set();
      state.groupY = new Set();
      state.groupZ = new Set();
      state.searchTerm = "";
      state.log = [];
      state.stepCount = 0;

      document.getElementById("file-meta").textContent = `${file.name} — ${parsed.atoms.length} atoms`;
      document.getElementById("empty-state").style.display = "none";
      document.getElementById("app-main").style.display = "grid";
      document.getElementById("controls-bar").style.display = "flex";
      document.getElementById("atom-search").value = "";
      document.getElementById("step-badge").textContent = "0 steps applied";
      UI.renderLog([]);
      hideInversionWarning();

      Viewer.load(state.atoms);
      renderAll(false);
    };
    reader.readAsText(file);
  }

  function wireDropzone() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) loadFile(fileInput.files[0]);
    });
    ["dragover", "dragenter"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  function wireControls() {
    document.getElementById("reset-view").addEventListener("click", () => Viewer.resetView());

    const bondSlider = document.getElementById("bond-tolerance");
    bondSlider.addEventListener("input", () => {
      document.getElementById("bond-tolerance-label").textContent = `${bondSlider.value}%`;
      Viewer.setBondTolerance(Number(bondSlider.value));
      renderAll(true);
    });

    document.getElementById("axes-toggle").addEventListener("change", () => renderAll(true));

    document.getElementById("atom-search").addEventListener("input", (e) => {
      state.searchTerm = e.target.value;
      UI.renderAtomList(state.atoms, state.selectedNums, state.searchTerm, toggleSelection);
    });

    document.getElementById("clear-selection").addEventListener("click", () => {
      state.selectedNums = new Set();
      renderAll(true);
    });

    document.getElementById("warning-banner").addEventListener("click", hideInversionWarning);

    Viewer.setAtomClickCallback(toggleSelection);

    UI.setupTabs();
    UI.buildMatrixGrid(Math3.identity());

    document.getElementById("btn-origin").addEventListener("click", () => {
      const sel = selectionAtoms();
      const usedAll = sel.length === 0;
      const basis = usedAll ? state.atoms : sel;
      const origin = Math3.centroid(basis);
      state.atoms = Math3.subtractOrigin(state.atoms, origin);
      pushLog(
        `Set origin from ${usedAll ? "centroid of all atoms" : `selected atom(s) [${selectionLabel()}]`}\n` +
        `  centroid: ${fmtVec(origin)}\n` +
        `  → subtracted from all coordinates`
      );
      renderAll(true);
    });

    function assignGroup(groupKey, axisLabel) {
      if (state.selectedNums.size === 0) return;
      state[groupKey] = new Set(state.selectedNums);
      const assigned = labelForNums(state[groupKey]);
      state.selectedNums = new Set();
      pushLog(`Set ${axisLabel} group: ${assigned}`);
      renderAll(true);
    }
    document.getElementById("btn-assign-x").addEventListener("click", () => assignGroup("groupX", "X"));
    document.getElementById("btn-assign-y").addEventListener("click", () => assignGroup("groupY", "Y"));
    document.getElementById("btn-assign-z").addEventListener("click", () => assignGroup("groupZ", "Z"));

    document.getElementById("btn-clear-groups").addEventListener("click", () => {
      state.groupX = new Set();
      state.groupY = new Set();
      state.groupZ = new Set();
      renderAll(true);
    });

    document.getElementById("btn-run-axes").addEventListener("click", () => {
      const xNums = [...state.groupX];
      const yNums = [...state.groupY];
      const zNums = [...state.groupZ];
      if (xNums.length === 0 && yNums.length === 0 && zNums.length === 0) return;

      const xLabel = xNums.length ? labelForNums(xNums) : null;
      const yLabel = yNums.length ? labelForNums(yNums) : null;
      const zLabel = zNums.length ? labelForNums(zNums) : null;

      const useLeastSquares = document.getElementById("ls-toggle").checked;
      const result = useLeastSquares
        ? Math3.runXyzAlignmentLeastSquares(state.atoms, xNums, yNums, zNums)
        : Math3.runXyzAlignment(state.atoms, xNums, yNums, zNums);
      state.atoms = result.atoms;
      const log = result.log;

      const header = [
        xLabel ? `X ← ${xLabel}` : null,
        yLabel ? `Y ← ${yLabel}` : null,
        zLabel ? `Z ← ${zLabel}` : null
      ].filter(Boolean).join(",  ");

      const methodNote = useLeastSquares
        ? "method: least-squares (Kabsch), all axes fit simultaneously"
        : "method: sequential (xyzalign.py-style), X prioritized over Y over Z";
      const stepsText = log.map((s) => `  · ${s.label} (vector: ${fmtVec(s.vec)})`).join("\n");
      const inversionNote = result.inverted ? "\n  ⚠️ this step inverted the molecule's chirality (determinant = -1)" : "";
      const mirroredNote = result.mirroredGroups
        ? "\n  ⚠️ the chosen X/Y/Z atoms form a left-handed triple - a pure rotation can't map that cleanly onto the right-handed X/Y/Z axes, so the fit above is a poor compromise. Try swapping which atoms are assigned to two of the axes (e.g. X ↔ Y)."
        : "";
      pushLog(`Run alignment [${methodNote}]: ${header}\n${stepsText}${inversionNote}${mirroredNote}`);
      if (result.inverted) {
        showInversionWarning("The sequential alignment inverted the molecule's chirality in at least one intermediate step (determinant = -1). Try the least-squares (Kabsch) toggle, which never does this.");
      }
      if (result.mirroredGroups) {
        showInversionWarning("The X/Y/Z atoms you picked form a left-handed triple, so no pure rotation can fit them cleanly onto the (right-handed) X/Y/Z axes - the result above is a forced compromise, not a bug. Try swapping which atoms are assigned to two of the axes (e.g. X ↔ Y) to make the fit clean.");
      }
      renderAll(true);
    });


    document.getElementById("btn-rotate").addEventListener("click", () => {
      const angles = [
        parseFloat(document.getElementById("rot-x").value) || 0,
        parseFloat(document.getElementById("rot-y").value) || 0,
        parseFloat(document.getElementById("rot-z").value) || 0
      ];
      if (angles.every((a) => a === 0)) return;
      const { atoms: newAtoms, R } = Math3.rotate(state.atoms, angles);
      state.atoms = newAtoms;
      pushLog(
        `Rotate x=${angles[0]}°, y=${angles[1]}°, z=${angles[2]}° (applied in that order)\n` +
        `  rotation matrix:\n${fmtMatrix(R)}`
      );
      if (Math3.det3(R) < 0) {
        showInversionWarning("This rotation inverted the molecule's chirality (determinant = -1) — that shouldn't normally happen for a pure rotation, please double-check the angles.");
      }
      renderAll(true);
    });

    document.getElementById("btn-translate").addEventListener("click", () => {
      const t = [
        parseFloat(document.getElementById("trans-x").value) || 0,
        parseFloat(document.getElementById("trans-y").value) || 0,
        parseFloat(document.getElementById("trans-z").value) || 0
      ];
      if (t.every((v) => v === 0)) return;
      state.atoms = Math3.translate(state.atoms, t);
      pushLog(`Translate by ${fmtVec(t)} Å`);
      renderAll(true);
    });

    document.getElementById("btn-matrix").addEventListener("click", () => {
      const M = UI.readMatrixGrid();
      state.atoms = Math3.applyCustomMatrix(state.atoms, M);
      const det = Math3.det3(M);
      pushLog(`Apply custom matrix (determinant = ${det.toFixed(4)}):\n${fmtMatrix(M)}`);
      if (det < 0) {
        showInversionWarning(`This matrix has determinant ${det.toFixed(4)} (negative) — it includes a reflection/inversion, not just a rotation, so it will flip the molecule's chirality.`);
      }
      renderAll(true);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (state.originalAtoms.length === 0) return;
      state.atoms = state.originalAtoms.map((a) => ({ ...a }));
      state.selectedNums = new Set();
      state.log = [];
      state.stepCount = 0;
      document.getElementById("step-badge").textContent = "0 steps applied";
      UI.renderLog([]);
      hideInversionWarning();
      renderAll(false);
    });

    document.getElementById("export-xyz").addEventListener("click", () => {
      if (state.atoms.length === 0) return;
      Export.exportXyz(state.header, state.atoms, state.filename);
    });

    window.addEventListener("resize", () => Viewer.resize());
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        Viewer.updateBackgroundColor();
        renderAll(true);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    Viewer.init("viewer-3d");
    wireDropzone();
    wireControls();
  });
})();
