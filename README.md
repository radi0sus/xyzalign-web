# xyzalign-web

`xyzalign-web` is a browser-based, interactive port of
[**xyzalign**](https://github.com/radi0sus/xyzalign), a Python 3 script for
aligning, rotating and translating atomic coordinates in xyz files. It keeps
the same underlying math (origin centering, alignment of one or more atoms
to the x-, y- and z-axes, arbitrary rotation, translation, custom rotation
matrices) but replaces the command-line arguments with a 3D viewer, an atom
list, and buttons for every step.

The app runs entirely in the browser. Open `index.html`, load an xyz file,
and align it interactively.

No installation, no Python environment, and no upload to any server are
required — the file is only read locally by the browser.

## Features

- Load an XMol `.xyz` file directly in the browser (drag & drop or file
  picker); the first two header lines (atom count, comment) are kept as-is
  and written back unchanged on export
- Interactive 3D viewer (3Dmol.js) with CPK atom colors, automatically
  detected bonds (adjustable bond-radius tolerance), and click-to-select
  atoms
- **X/Y/Z coordinate axes are shown by default**, anchored at the true
  origin (0, 0, 0) — since the whole point of the tool is to see the
  molecule's orientation *relative to the axes*, they never move or follow
  the selection
- Searchable, sortable atom table synced with the 3D selection
- **Origin** — move the centroid of the selected atom(s), or of all atoms
  if none are selected, to (0, 0, 0)
- **Align to axes** — assign one or more atoms to an X, Y and/or Z group
  (equivalent to the script's `-x`/`-y`/`-z`, each of which can take
  several atoms) and run the alignment in one step. Any combination works
  (X only, X+Y, or X+Y+Z); with more than one atom in a group, the pooled
  centroid of that group is used
- **Rotate** — arbitrary counterclockwise rotation about the x-, y- and
  z-axis, applied in that order
- **Translate** — arbitrary translation in x, y, z (Å)
- **Custom rotation/transformation matrix** — a 3×3 matrix applied directly
  to the coordinates, e.g. for inversion
- A running log of every transformation step, including the exact
  centroid vectors and rotation matrices used — the interactive equivalent
  of the script's `-v` / verbose output
- Export the modified coordinates as `<name>-mod.xyz`, in the same
  fixed-width format the Python script writes
- Light/dark theme via system preference

## Quick start

Download or clone the repository and open:

```
index.html
```

in a modern web browser.

Then drag and drop an xyz file into the drop zone, or click it to browse.
A typical workflow, equivalent to `xyzalign.py`

looks like this in the app:

1. Select atom 1 in the viewer or atom list, click **Set origin from
   selection**.
2. Select atom 2, click **Set X group from selection**.
3. Select atom 3, click **Set Y group from selection**.
4. Select atom 4, click **Set Z group from selection**.
5. Click **Run alignment**.
6. **Download modified XYZ**.

## Supported input files

Only the standard XMol xyz file format is supported: an atom-count line, a
comment line, then one `element x y z` line per atom (cartesian
coordinates, in Å). Both header lines are preserved verbatim and written
back unchanged on export.

## Alignment logic

The alignment math is a direct, line-by-line port of `xyzalign.py`'s
`rotmat_from_vec` / `rotmat_from_ang` / `align_xyz` functions, including
the exact sequence used when more than one axis group is defined: each
axis is aligned in turn using the coordinates already produced by the
previous step, then (if X and Y, or X, Y and Z are all defined) extra
combination passes bring the groups as close as possible to their target
axes simultaneously, followed by a final re-alignment of Y and then X.

As in the original script, a perfect alignment of a "real world" molecule
to all three axes at once is generally impossible — the app tries to get
as close as possible, with priority given to the x-axis, exactly as the
reference implementation does.

## 3Dmol.js citation

This application uses [3Dmol.js](https://3dmol.csb.pitt.edu/) for
molecular visualization.

3Dmol.js is licensed under a permissive BSD-3-Clause license (see
`static/vendor/3dmol.LICENSE`).

Please cite:
> Rego, N. and Koes, D. (2015).
> 3Dmol.js: molecular visualization with WebGL. *Bioinformatics*, 31(8), 1322–1324. <https://academic.oup.com/bioinformatics/article/31/8/1322/213186>

## Known limitations

- Alignment of two vectors that are already exactly antiparallel and both
  lie on a coordinate axis is a numerically unstable edge case inherited
  directly from the reference script's Rodrigues-formula-based approach;
  in practice this only affects already near-perfectly aligned inputs.
- Analysis state (selection, groups, loaded file, transformation log) is
  kept only for the current browser session.
- Very large structures may make bond auto-detection (O(n²) pairwise
  distance check) noticeably slower.
