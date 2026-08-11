"use strict";

/* Parsers for XMol XYZ, MDL V2000 MOL/SDF, and Sybyl MOL2 coordinate files. */
window.XA_PARSE = (() => {
  function parseXyz(text, filename) {
    const rawLines = String(text).split(/\r\n|\r|\n/);
    const header = rawLines.slice(0, 2);
    const atoms = [];
    for (let i = 2; i < rawLines.length; i++) {
      const parts = rawLines[i].trim().split(/\s+/);
      if (parts.length < 4) continue;
      const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const num = atoms.length + 1;
      atoms.push({ index: num - 1, num, element: parts[0], x, y, z });
    }
    return { header, atoms, filename, warnings: [] };
  }

  function parseFixedNumber(line, start, end) {
    const value = Number(line.slice(start, end).trim());
    return Number.isFinite(value) ? value : null;
  }

  // Parse one MDL MOL block. Bond records are deliberately ignored: xyzalign
  // detects bonds from covalent radii in the same way for every input format.
  function parseMol(text, filename) {
    const allLines = String(text).split(/\r\n|\r|\n/);
    const records = String(text).split(/\r\n|\r|\n/).reduce((out, line) => {
      if (line.trim() === "$$$$") out.push([]); else out[out.length - 1].push(line);
      return out;
    }, [[]]).filter(block => block.some(line => line.trim()));
    const warnings = [];
    if (records.length > 1) warnings.push(`SDF contains ${records.length} records; only the first record was loaded.`);
    const lines = records[0] || allLines;
    if (lines.some(line => /V3000/.test(line))) {
      return { header: lines.slice(0, 2), atoms: [], filename, warnings, error: "V3000 MOL files are not supported; please provide a V2000 MOL/SDF file." };
    }
    if (lines.length < 4) return { header: lines.slice(0, 2), atoms: [], filename, warnings, error: "MOL file is too short to contain a V2000 counts line." };
    const counts = lines[3];
    const atomCount = parseInt(counts.slice(0, 3).trim(), 10);
    if (!Number.isInteger(atomCount) || atomCount < 1) {
      return { header: lines.slice(0, 2), atoms: [], filename, warnings, error: "Could not read the V2000 atom count from the counts line." };
    }
    const atoms = [];
    for (let i = 0; i < atomCount; i++) {
      const line = lines[4 + i] || "";
      let x = parseFixedNumber(line, 0, 10), y = parseFixedNumber(line, 10, 20), z = parseFixedNumber(line, 20, 30);
      const fields = line.trim().split(/\s+/);
      // Fixed-width is authoritative only for a complete MDL atom line;
      // compact whitespace-separated examples use the fallback layout.
      const fixedLooksValid = line.length >= 34 && line.slice(0, 30).trim() && line.slice(31, 34).trim();
      if (!fixedLooksValid || x === null || y === null || z === null || fields.length < 4) {
        x = Number(fields[0]); y = Number(fields[1]); z = Number(fields[2]);
      }
      const fixedElement = line.slice(31, 34).trim();
      const element = (/^[A-Za-z]{1,3}$/.test(fixedElement) ? fixedElement : (fields[3] || "")).trim();
      if (!element || ![x, y, z].every(Number.isFinite)) {
        return { header: lines.slice(0, 2), atoms: [], filename, warnings, error: `Invalid atom line ${i + 1} in the MOL block.` };
      }
      const num = atoms.length + 1;
      atoms.push({ index: num - 1, num, element, x, y, z });
    }
    if (atoms.length && atoms.every(a => Math.abs(a.z) <= 1e-8)) {
      warnings.push("This MOL/SDF contains only 2D coordinates (all z ≈ 0); alignment on flat 2D data is not meaningful.");
    }
    return { header: [String(atoms.length), lines[0] || ""], atoms, filename, warnings };
  }

  // Parse the first Sybyl MOL2 molecule. Connectivity is intentionally ignored;
  // xyzalign re-derives bonds from coordinates and covalent radii.
  function parseMol2(text, filename = "") {
    const lines = String(text).split(/\r\n|\r|\n/);
    const moleculeStarts = [];
    lines.forEach((line, i) => { if (/^\s*@<TRIPOS>MOLECULE\s*$/i.test(line)) moleculeStarts.push(i); });
    const warnings = [];
    if (!moleculeStarts.length) return { header: [], atoms: [], filename, warnings, error: "Could not find a TRIPOS MOLECULE section." };
    if (moleculeStarts.length > 1) warnings.push(`MOL2 contains ${moleculeStarts.length} molecules; only the first molecule was loaded.`);
    const start = moleculeStarts[0];
    const end = moleculeStarts[1] === undefined ? lines.length : moleculeStarts[1];
    const block = lines.slice(start, end);
    let moleculeName = "";
    let atomCount = null;
    let moleculeSection = false, atomSection = false;
    const atomLines = [];
    for (let i = 0; i < block.length; i++) {
      const line = block[i];
      const marker = line.match(/^\s*@<TRIPOS>(\S+)/i);
      if (marker) {
        moleculeSection = marker[1].toUpperCase() === "MOLECULE";
        atomSection = marker[1].toUpperCase() === "ATOM";
        continue;
      }
      if (moleculeSection && !moleculeName && line.trim()) { moleculeName = line.trim(); continue; }
      if (moleculeSection && atomCount === null && line.trim()) {
        const n = parseInt(line.trim().split(/\s+/)[0], 10);
        if (Number.isInteger(n)) atomCount = n;
        moleculeSection = false;
        continue;
      }
      if (atomSection && line.trim() && !line.trim().startsWith("#")) atomLines.push(line);
    }
    if (!Number.isInteger(atomCount) || atomCount < 1) return { header: [moleculeName], atoms: [], filename, warnings, error: "Could not read the MOL2 atom count from the MOLECULE section." };
    const atoms = [], unresolved = [];
    const known = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Th Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn".split(/\s+/));
    function guessElement(name) {
      const cleaned = String(name || "").replace(/^[^A-Za-z]*/, "");
      const two = cleaned.slice(0, 2).toLowerCase();
      const one = cleaned.slice(0, 1).toUpperCase();
      for (const symbol of known) if (symbol.toLowerCase() === two) return symbol;
      return one;
    }
    function elementFromType(type, name) {
      const raw = String(type || "").trim();
      const base = raw.split(".")[0];
      const normalized = base[0] ? base[0].toUpperCase() + base.slice(1).toLowerCase() : "";
      if (known.has(normalized)) return normalized;
      if (/^(Du|LP|Any|Hal|Het)$/i.test(raw) || !known.has(normalized)) {
        const guessed = guessElement(name);
        if (known.has(guessed)) { unresolved.push(`${name || "atom"} (${raw || "missing type"})`); return guessed; }
        unresolved.push(`${name || "atom"} (${raw || "missing type"})`);
        return "X";
      }
      return normalized;
    }
    for (let i = 0; i < Math.min(atomCount, atomLines.length); i++) {
      const fields = atomLines[i].trim().split(/\s+/);
      const x = Number(fields[2]), y = Number(fields[3]), z = Number(fields[4]);
      if (fields.length < 6 || ![x, y, z].every(Number.isFinite)) return { header: [moleculeName], atoms: [], filename, warnings, error: `Invalid atom line ${i + 1} in the MOL2 block.` };
      const element = elementFromType(fields[5], fields[1]);
      atoms.push({ index: i, num: i + 1, element, x, y, z });
    }
    if (atoms.length !== atomCount) return { header: [moleculeName], atoms: [], filename, warnings, error: `MOL2 declares ${atomCount} atoms but only ${atoms.length} valid atom records were found.` };
    if (unresolved.length) warnings.push(`Could not confidently assign elements for ${unresolved.length} MOL2 atom(s); best-effort atom-name guesses were used.`);
    if (atoms.length && atoms.every(a => Math.abs(a.z) <= 1e-8)) warnings.push("This MOL2 contains only 2D coordinates (all z ≈ 0); alignment on flat 2D data is not meaningful.");
    return { header: [String(atoms.length), moleculeName], atoms, filename, warnings };
  }

  function parseAuto(text, filename = "") {
    const lower = String(filename).toLowerCase();
    const source = String(text);
    const looksMol2 = /\.mol2$/.test(lower) || /^\s*@<TRIPOS>MOLECULE\s*$/im.test(source);
    if (looksMol2) return parseMol2(source, filename);
    const looksMol = /\.(mol|sdf)$/.test(lower) || source.split(/\r\n|\r|\n/).slice(0, 12).some(line => /V2000|V3000/.test(line));
    return looksMol ? parseMol(source, filename) : parseXyz(source, filename);
  }

  function formatFixed(value) {
    const fixed = value.toFixed(8);
    return fixed.length < 12 ? " ".repeat(12 - fixed.length) + fixed : fixed;
  }
  function buildXyzText(header, atoms) {
    const lines = [String(atoms.length), header[1] !== undefined ? header[1] : ""];
    for (const a of atoms) lines.push(`${a.element.padEnd(2)}  ${formatFixed(a.x)}  ${formatFixed(a.y)}  ${formatFixed(a.z)}`);
    return lines.join("\n") + "\n";
  }
  function outFilename(filename) {
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return base + "-mod.xyz";
  }
  return { parseXyz, parseMol, parseSdf: parseMol, parseMol2, parseAuto, buildXyzText, outFilename };
})();
