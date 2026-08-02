"use strict";

/*
  XMol .xyz parsing/export. Mirrors xyzalign.py's I/O behavior:
  - first two lines of the file are kept verbatim as a "head" block and
    written back unchanged on export (atom count + comment line)
  - atom numbering starts at 1 (atom 1 = first data line), matching the
    Python script's `xyz_df.index += 1`
  - export uses the same fixed-width layout as the Python script's
    np.savetxt fmt='%-2s  %12.8f  %12.8f  %12.8f'
  - output filename is <original-basename>-mod.xyz
*/
window.XA_PARSE = (() => {
  function parseXyz(text, filename) {
    const rawLines = text.split(/\r\n|\r|\n/);
    const header = rawLines.slice(0, 2);

    const atoms = [];
    for (let i = 2; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const [element, x, y, z] = parts;
      const num = atoms.length + 1;
      atoms.push({
        index: num - 1, // 0-based, for viewer/bond-detection use
        num,            // 1-based, matches xyzalign.py atom numbering
        element,
        x: parseFloat(x),
        y: parseFloat(y),
        z: parseFloat(z)
      });
    }

    return { header, atoms, filename };
  }

  // mimics numpy's "%12.8f" formatting
  function formatFixed(value) {
    const fixed = value.toFixed(8);
    return fixed.length < 12 ? " ".repeat(12 - fixed.length) + fixed : fixed;
  }

  function buildXyzText(header, atoms) {
    // Line 1 is always the atom count; recomputed from the atoms actually
    // being written so excluded atoms (which never reach this function)
    // don't leave a stale count behind. Line 2 (comment) is kept verbatim.
    const lines = [String(atoms.length), header[1] !== undefined ? header[1] : ""];
    for (const a of atoms) {
      lines.push(`${a.element.padEnd(2)}  ${formatFixed(a.x)}  ${formatFixed(a.y)}  ${formatFixed(a.z)}`);
    }
    return lines.join("\n") + "\n";
  }

  function outFilename(filename) {
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return base + "-mod.xyz";
  }

  return { parseXyz, buildXyzText, outFilename };
})();
