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
    excludedNums: new Set(),
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

  // Atoms that are currently visible (i.e. not excluded). Excluded atoms
  // still live in state.atoms and move along with every transform, they're
  // just hidden from the viewer, the atom-list selection, copy and export.
  function visibleAtoms(list) {
    return list.filter((a) => !state.excludedNums.has(a.num));
  }

  // Atoms for the 3D viewer need an .index that matches their position in
  // the array actually handed to the viewer (bond-detection and click
  // mapping both rely on that), so excluded atoms are dropped and the
  // remaining ones are re-indexed here rather than in state.atoms itself.
  function viewerAtoms() {
    return visibleAtoms(state.atoms).map((a, i) => ({ ...a, index: i }));
  }

  // Axis-group / origin computations should ignore excluded members, but
  // the underlying group Sets are left untouched so members reappear if
  // the atom is included again later.
  function activeNums(numSet) {
    return [...numSet].filter((n) => !state.excludedNums.has(n));
  }

  // One entry per distinct element among the currently visible atoms, in
  // the same H-then-C-then-alphabetical order the viewer legend uses, each
  // carrying the atom .num values it covers - used to drive the element
  // selection pills.
  function elementGroupsFrom(atomList) {
    const priority = { H: 0, C: 1 };
    const map = new Map();
    for (const a of atomList) {
      if (!map.has(a.element)) map.set(a.element, []);
      map.get(a.element).push(a.num);
    }
    return [...map.entries()]
      .sort(([ea], [eb]) => {
        const pa = priority[ea] ?? 2, pb = priority[eb] ?? 2;
        if (pa !== pb) return pa - pb;
        return ea.localeCompare(eb);
      })
      .map(([element, nums]) => ({ element, nums }));
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
    document.getElementById("exclude-selection").disabled = !hasSelection;
    document.getElementById("invert-selection").disabled = !hasSelection;
    document.getElementById("clear-selection").disabled = !hasSelection;
    document.getElementById("select-all").disabled = visibleAtoms(state.atoms).length === 0;

    const anyGroup = activeNums(state.groupX).length > 0 || activeNums(state.groupY).length > 0 || activeNums(state.groupZ).length > 0;
    document.getElementById("btn-run-axes").disabled = !anyGroup;

    document.getElementById("origin-note").textContent = hasSelection
      ? `Will use selected atom(s): ${selectionLabel()}`
      : state.excludedNums.size > 0
        ? "No selection — will use the centroid of all included (non-excluded) atoms."
        : "No selection — will use the centroid of all atoms.";

    const excludeCountEl = document.getElementById("exclude-count");
    if (excludeCountEl) {
      excludeCountEl.textContent = state.excludedNums.size > 0
        ? `${state.excludedNums.size} excluded`
        : "";
    }
    document.getElementById("btn-reset-exclusions").disabled = state.excludedNums.size === 0;
  }

  function renderAll(keepView, focusNum) {
    UI.renderAtomList(state.atoms, state.selectedNums, state.excludedNums, state.searchTerm, toggleSelection, onExcludeToggle, focusNum);
    UI.renderSelectionChips(state.atoms, state.selectedNums, (num) => {
      state.selectedNums.delete(num);
      renderAll(true);
    });
    UI.renderElementPills("element-pills", elementGroupsFrom(visibleAtoms(state.atoms)), state.selectedNums, onElementPillClick);
    // Group chip display only shows currently non-excluded members; the
    // underlying Sets keep every member so they reappear once included again.
    UI.renderChipsInto("group-x-chips", state.atoms, new Set(activeNums(state.groupX)), (num) => { state.groupX.delete(num); renderAll(true); });
    UI.renderChipsInto("group-y-chips", state.atoms, new Set(activeNums(state.groupY)), (num) => { state.groupY.delete(num); renderAll(true); });
    UI.renderChipsInto("group-z-chips", state.atoms, new Set(activeNums(state.groupZ)), (num) => { state.groupZ.delete(num); renderAll(true); });
    updateButtonsState();
    const showAxes = document.getElementById("axes-toggle").checked;
    Viewer.setAtoms(viewerAtoms());
    Viewer.render({ selectedNums: state.selectedNums, showAxes, keepView });
  }

  function toggleSelection(num) {
    if (state.selectedNums.has(num)) state.selectedNums.delete(num);
    else state.selectedNums.add(num);
    renderAll(true, num);
  }

  // Clicking an element pill toggles all (visible) atoms of that element in
  // or out of the selection together: fully selected -> deselect all of
  // them, otherwise -> select all of them (on top of whatever else is
  // already selected).
  function onElementPillClick(element) {
    const nums = visibleAtoms(state.atoms).filter((a) => a.element === element).map((a) => a.num);
    if (nums.length === 0) return;
    const allSelected = nums.every((n) => state.selectedNums.has(n));
    if (allSelected) nums.forEach((n) => state.selectedNums.delete(n));
    else nums.forEach((n) => state.selectedNums.add(n));
    renderAll(true);
  }

  function excludeNums(nums) {
    const toExclude = [...nums].filter((n) => !state.excludedNums.has(n));
    if (toExclude.length === 0) return;
    const label = labelForNums(toExclude);
    toExclude.forEach((n) => {
      state.excludedNums.add(n);
      state.selectedNums.delete(n);
    });
    pushLog(`Exclude atom(s): ${label}`);
    renderAll(true);
  }

  function includeNums(nums) {
    const toInclude = [...nums].filter((n) => state.excludedNums.has(n));
    if (toInclude.length === 0) return;
    const label = labelForNums(toInclude);
    toInclude.forEach((n) => state.excludedNums.delete(n));
    pushLog(`Include atom(s) again (undo exclude): ${label}`);
    renderAll(true);
  }

  function onExcludeToggle(num, excluded) {
    if (excluded) excludeNums([num]);
    else includeNums([num]);
  }

  function applyParsed(parsed, sourceName) {
    if (parsed.error) {
      showInversionWarning(parsed.error);
      return false;
    }
    if (parsed.atoms.length === 0) {
      showInversionWarning("Could not find any atom lines (element x y z) in this data.");
      return false;
    }
    state.filename = sourceName;
    state.header = parsed.header;
    state.originalAtoms = parsed.atoms;
    state.atoms = parsed.atoms.map((a) => ({ ...a }));
    state.selectedNums = new Set();
    state.excludedNums = new Set();
    state.groupX = new Set();
    state.groupY = new Set();
    state.groupZ = new Set();
    state.searchTerm = "";
    state.log = [];
    state.stepCount = 0;

    document.getElementById("file-meta").textContent = `${sourceName} — ${parsed.atoms.length} atoms`;
    document.getElementById("empty-state").style.display = "none";
    document.getElementById("app-main").style.display = "grid";
    document.getElementById("controls-bar").style.display = "flex";
    document.getElementById("atom-search").value = "";
    document.getElementById("step-badge").textContent = "0 steps applied";
    UI.renderLog([]);
    hideInversionWarning();
    if (parsed.warnings && parsed.warnings.length) showInversionWarning(parsed.warnings.join(" "));

    Viewer.load(viewerAtoms());
    renderAll(false);
    return true;
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Parse.parseAuto(reader.result, file.name);
      applyParsed(parsed, file.name);
    };
    reader.readAsText(file);
  }

  function loadPastedText(text) {
    const parsed = Parse.parseAuto(text, "");
    return applyParsed(parsed, "Pasted from clipboard");
  }

  function wireDropzone() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) loadFile(fileInput.files[0]);
    });

    // Header dropzone: keep its own visual feedback, and stop the event from
    // also bubbling up to the page-wide handlers below (avoids loadFile firing twice).
    ["dragover", "dragenter"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove("dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    // Whole-page dropzone: lets the user drop a file anywhere in the window,
    // not just on the header dropzone, while the click-to-browse menu still works.
    const overlay = document.getElementById("page-dropzone-overlay");
    let dragDepth = 0;

    const hasFiles = (e) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      overlay.classList.add("active");
    });
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.classList.remove("active");
    });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      overlay.classList.remove("active");
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });
  }

  function wirePasteModal() {
    const modal = document.getElementById("paste-modal");
    const textarea = document.getElementById("paste-textarea");
    const openBtn = document.getElementById("btn-paste-clipboard");
    const cancelBtn = document.getElementById("paste-cancel");
    const confirmBtn = document.getElementById("paste-confirm");

    function openModal() {
      textarea.value = "";
      modal.style.display = "flex";
      textarea.focus();
    }
    function closeModal() {
      modal.style.display = "none";
      textarea.value = "";
    }

    openBtn.addEventListener("click", openModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.style.display === "flex") closeModal();
    });

    // As soon as a paste lands in the textarea, parse it immediately —
    // no extra click needed, but the "Load" button remains as a fallback
    // for manually typed/edited content.
    textarea.addEventListener("paste", () => {
      setTimeout(() => {
        if (textarea.value.trim() && loadPastedText(textarea.value)) closeModal();
      }, 0);
    });

    confirmBtn.addEventListener("click", () => {
      if (textarea.value.trim() && loadPastedText(textarea.value)) closeModal();
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
      UI.renderAtomList(state.atoms, state.selectedNums, state.excludedNums, state.searchTerm, toggleSelection, onExcludeToggle);
    });

    document.getElementById("select-all").addEventListener("click", () => {
      const nums = visibleAtoms(state.atoms).map((a) => a.num);
      if (nums.length === 0) return;
      state.selectedNums = new Set(nums);
      renderAll(true);
    });

    document.getElementById("clear-selection").addEventListener("click", () => {
      state.selectedNums = new Set();
      renderAll(true);
    });

    document.getElementById("invert-selection").addEventListener("click", () => {
      // Invert only across currently visible (non-excluded) atoms - excluded
      // atoms can't be selected, so they must never end up in the result.
      const allVisibleNums = visibleAtoms(state.atoms).map((a) => a.num);
      state.selectedNums = new Set(allVisibleNums.filter((n) => !state.selectedNums.has(n)));
      renderAll(true);
    });

    document.getElementById("exclude-selection").addEventListener("click", () => {
      if (state.selectedNums.size === 0) return;
      excludeNums([...state.selectedNums]);
    });

    document.getElementById("btn-reset-exclusions").addEventListener("click", () => {
      if (state.excludedNums.size === 0) return;
      const label = labelForNums([...state.excludedNums]);
      state.excludedNums = new Set();
      pushLog(`Include all atoms again (undo all exclusions): ${label}`);
      renderAll(true);
    });

    document.getElementById("warning-banner").addEventListener("click", hideInversionWarning);

    Viewer.setAtomClickCallback(toggleSelection);

    UI.setupTabs();
    UI.buildMatrixGrid(Math3.identity());

    document.getElementById("btn-origin").addEventListener("click", () => {
      const sel = selectionAtoms();
      const usedAll = sel.length === 0;
      const basis = usedAll ? visibleAtoms(state.atoms) : sel;
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
      const xNums = activeNums(state.groupX);
      const yNums = activeNums(state.groupY);
      const zNums = activeNums(state.groupZ);
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
      state.excludedNums = new Set();
      state.log = [];
      state.stepCount = 0;
      document.getElementById("step-badge").textContent = "0 steps applied";
      UI.renderLog([]);
      hideInversionWarning();
      renderAll(false);
    });

    document.getElementById("copy-xyz").addEventListener("click", async () => {
      if (state.atoms.length === 0) return;
      const toCopy = visibleAtoms(state.atoms);
      if (toCopy.length === 0) { alert("All atoms are currently excluded — nothing to copy."); return; }
      const btn = document.getElementById("copy-xyz");
      const original = btn.textContent;
      const { ok } = await Export.copyXyz(state.header, toCopy);
      btn.textContent = ok ? "Copied!" : "Copy failed";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1400);
    });

    document.getElementById("export-xyz").addEventListener("click", () => {
      if (state.atoms.length === 0) return;
      const toExport = visibleAtoms(state.atoms);
      if (toExport.length === 0) { alert("All atoms are currently excluded — nothing to export."); return; }
      Export.exportXyz(state.header, toExport, state.filename);
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
    wirePasteModal();
  });
})();
