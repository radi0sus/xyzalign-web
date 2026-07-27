"use strict";

window.XA_UI = (() => {
  const Elements = window.XA_ELEMENTS;

  function renderAtomList(atoms, selectedNums, searchTerm, onRowClick) {
    const body = document.getElementById("atom-list-body");
    const term = (searchTerm || "").trim().toLowerCase();

    const filtered = term
      ? atoms.filter((a) => a.element.toLowerCase().includes(term) || String(a.num) === term)
      : atoms;

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="5" class="atom-list-empty">No matching atoms.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map((a) => `
      <tr data-num="${a.num}" class="${selectedNums.has(a.num) ? "selected" : ""}">
        <td>${a.num}</td>
        <td class="el-cell"><span class="el-swatch" style="background:${Elements.getColor(a.element)}"></span>${a.element}</td>
        <td>${a.x.toFixed(4)}</td>
        <td>${a.y.toFixed(4)}</td>
        <td>${a.z.toFixed(4)}</td>
      </tr>
    `).join("");

    body.querySelectorAll("tr[data-num]").forEach((row) => {
      row.addEventListener("click", () => onRowClick(Number(row.dataset.num)));
    });
  }

  function renderChipsInto(containerId, atoms, nums, onRemove) {
    const chipsEl = document.getElementById(containerId);
    const byNum = new Map(atoms.map((a) => [a.num, a]));
    chipsEl.innerHTML = [...nums].map((num) => {
      const a = byNum.get(num);
      const label = a ? `${a.element}${a.num}` : `#${num}`;
      return `<span class="chip" data-num="${num}">${label}<span class="chip-remove" data-remove="${num}">×</span></span>`;
    }).join("");

    chipsEl.querySelectorAll("[data-remove]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onRemove(Number(el.dataset.remove));
      });
    });
  }

  function renderSelectionChips(atoms, selectedNums, onRemove) {
    const row = document.getElementById("selection-row");
    if (selectedNums.size === 0) {
      row.style.display = "none";
      document.getElementById("selection-chips").innerHTML = "";
      return;
    }
    row.style.display = "flex";
    renderChipsInto("selection-chips", atoms, selectedNums, onRemove);
  }

  function buildMatrixGrid(defaultMatrix) {
    const grid = document.getElementById("matrix-grid");
    grid.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.0001";
        input.value = defaultMatrix[i][j];
        input.id = `matrix-${i}-${j}`;
        grid.appendChild(input);
      }
    }
  }

  function readMatrixGrid() {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const el = document.getElementById(`matrix-${i}-${j}`);
        M[i][j] = parseFloat(el.value) || 0;
      }
    }
    return M;
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab-bar .btn-small[data-tab]");
    const panes = { transform: document.getElementById("pane-transform"), log: document.getElementById("pane-log") };
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Object.entries(panes).forEach(([key, el]) => {
          el.style.display = key === btn.dataset.tab ? "" : "none";
        });
      });
    });
  }

  function renderLog(entries) {
    const empty = document.getElementById("log-empty");
    const out = document.getElementById("log-output");
    if (entries.length === 0) {
      empty.style.display = "block";
      out.textContent = "";
      return;
    }
    empty.style.display = "none";
    out.textContent = entries.join("\n\n");
  }

  return { renderAtomList, renderSelectionChips, renderChipsInto, buildMatrixGrid, readMatrixGrid, setupTabs, renderLog };
})();
