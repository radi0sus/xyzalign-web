# xyzalign web

`xyzalign web` is a browser-based, interactive port of
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
- **Get XYZ data from clipboard** — paste xyz text directly (`Ctrl+V`/
  `Cmd+V`) into a modal instead of loading a file, for quickly trying out
  coordinates copied from somewhere else
- Interactive 3D viewer (3Dmol.js) with CPK atom colors, automatically
  detected bonds (adjustable bond-radius tolerance), and click-to-select
  atoms
- **X/Y/Z coordinate axes are shown by default**, anchored at the true
  origin (0, 0, 0) — since the whole point of the tool is to see the
  molecule's orientation *relative to the axes*, they never move or follow
  the selection
- Searchable atom table synced with the 3D selection
- **Select all**, **Invert selection**, **Clear selection**, and **element
  pills** (one per element present, e.g. "C", "H", "O" …, colored like
  their CPK atom color) sit in a permanently visible row above the viewer.
  Clicking an element pill selects (or, if already fully selected,
  deselects) every atom of that element at once; a pill fills solid when
  all of its atoms are selected and gets a lighter tint when only some are.
  The selected-atom chips live in their own fixed-height, scrollable strip
  so the 3D viewer never resizes as the selection grows or shrinks
- **Exclude atoms** — remove one or more atoms from view, copy and export
  without deleting them from the working geometry:
  - select atom(s) in the viewer, atom table, or an element pill (use
    **Invert selection** to flip the current pick across all included
    atoms if that's quicker), then click **Exclude selected atom(s)**, or
  - tick/untick the checkbox in the **Excl.** column of the atom table for
    a single atom
  - excluded atoms are struck through and greyed out in the atom table, no
    longer rendered in the 3D view, and left out of **Copy modified XYZ**
    and **Download modified XYZ** (the exported atom count is adjusted
    accordingly)
  - **Include all atoms** (next to the atom search field) undoes every
    exclusion at once
  - excluding/including atoms is recorded in the log, just like any other
    step
  - excluded atoms still move along with every rotation/translation/origin
    step (so their coordinates stay consistent if you include them again
    later) but are ignored when *computing* a centroid or axis alignment;
    if an excluded atom was already part of an **X/Y/Z** group under "2.
    Align to axes", it temporarily disappears from that group's chip list
    and reappears automatically once it's included again
- **Origin** — move the centroid of the selected atom(s), or of all
  included (non-excluded) atoms if none are selected, to (0, 0, 0)
- **Align to axes** — assign one or more atoms to an X, Y and/or Z group
  (equivalent to the script's `-x`/`-y`/`-z`, each of which can take
  several atoms) and run the alignment in one step. Any combination works
  (X only, X+Y, or X+Y+Z); with more than one atom in a group, the pooled
  centroid of that group is used. Two alignment methods are available,
  **least-squares (Kabsch) by default**:
  - the optional **sequential** method, a faithful port of the script's own
    align-then-correct passes (implicitly prioritizes X over Y over Z —
    see [Alignment logic](#alignment-logic) below)
  - the default **least-squares (Kabsch/Wahba) fit**, which finds the
    single rotation that best satisfies all given axis groups
    *simultaneously*, splitting the unavoidable residual error evenly
    across axes instead of dumping it onto whichever axis was aligned
    last. It is also guaranteed to always be a proper rotation (never an
    accidental point-inversion/reflection — see below)
- **Chirality/inversion warning** — every rotation-producing step (the
  sequential axis alignment, manual rotate, and the custom matrix) checks
  its determinant. If a step ever produces an improper transformation
  (determinant < 0 — a reflection/inversion rather than a real rotation),
  a warning banner appears and the transformation log flags exactly which
  step caused it. The least-squares alignment can never trigger this by
  construction.
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

Then drag and drop an xyz file into the drop zone, click it to browse, or
click **Get XYZ data from clipboard** and paste (`Ctrl+V`/`Cmd+V`) xyz text
directly.

A typical workflow, equivalent to `xyzalign.py`, looks like this in the
app:

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

Two alignment methods are available for the X/Y/Z axis groups, selectable
via the **"Use least-squares (Kabsch) fit"** toggle (checked by default).

**Sequential (default, matches `xyzalign.py` exactly)** — a direct,
line-by-line port of `xyzalign.py`'s `rotmat_from_vec` / `rotmat_from_ang`
/ `align_xyz` functions and its exact multi-axis sequence: each axis is
aligned in turn using the coordinates already produced by the previous
step, then (if X and Y, or X, Y and Z are all defined) extra combination
passes bring the groups as close as possible to their target axes
simultaneously, followed by a final re-alignment of Y and then X. As in
the original script, a perfect alignment of a "real world" molecule to
all three axes at once is generally impossible — the app tries to get as
close as possible, but this iterative procedure implicitly **prioritizes
X over Y over Z**: X ends up exactly on its axis, while Y (and Z) only
end up as close as the geometry allows, with whatever residual error is
left over.

**Least-squares (Kabsch/Wahba)** — an alternative that fits every given
axis group with a single rotation chosen to minimize the total squared
angular error across *all* axes at once (the same math used for optimal
structure overlays/RMSD fitting). Unlike the sequential method, it treats
every axis equally: with two non-orthogonal target atoms, for example,
it splits the unavoidable deviation evenly between X and Y instead of
making X perfect at Y's expense. It is also always a proper rotation
(determinant +1) by construction.

That last point matters: the sequential method inherited from
`xyzalign.py` has a genuine edge case where aligning two *exactly*
antiparallel vectors (not lying on a coordinate axis) produces a
point-inversion (determinant −1) rather than a real rotation — silently
flipping the molecule's chirality. This is a known limitation of the
reference script's approach, not something introduced by this port. The
least-squares method does not have this failure mode.

Both methods only affect the axis-group alignment step (`-x`/`-y`/`-z`
and the button under **"2. Align to axes"**); the **Origin** step,
**Rotate**, **Translate** and the **custom matrix** step are unaffected
and identical either way.

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
  The related (and more consequential) case of exactly antiparallel,
  non-axis-aligned vectors producing a chirality-flipping inversion is
  avoided entirely by switching to the least-squares (Kabsch) method.
- Analysis state (selection, groups, loaded file, transformation log) is
  kept only for the current browser session.
- Very large structures may make bond auto-detection (O(n²) pairwise
  distance check) noticeably slower.
