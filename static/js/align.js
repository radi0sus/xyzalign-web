"use strict";

/*
  Direct port of the linear algebra in xyzalign.py. Kept as a faithful
  line-by-line translation (rather than a "cleaner" reformulation) so
  the numeric behavior - including its quirks, e.g. the always-1.0
  NP0/NP0^2 terms in rotmat_from_vec - matches the reference script
  exactly.

  A note on transposes, since it's easy to get handedness wrong here:
  numpy's np.dot(coord, M) with coord as an (N,3) array of row vectors
  computes, for each row, row @ M - i.e. newRow[j] = sum_k row[k]*M[k][j].
  align_xyz() and the -r/--rotate step in the Python script both call
  np.dot(coord, rotmatrix.T), so applyRowMatrix() below is always given
  the already-transposed matrix for those two operations. The -m/--matrix
  step, however, uses np.dot(coord, rot_matrix) directly - no transpose -
  so the user-supplied 3x3 matrix is passed into applyRowMatrix() as-is.
*/
window.XA_MATH = (() => {
  function norm(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function matMul(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j];
        R[i][j] = s;
      }
    }
    return R;
  }

  function transpose(A) {
    return [
      [A[0][0], A[1][0], A[2][0]],
      [A[0][1], A[1][1], A[2][1]],
      [A[0][2], A[1][2], A[2][2]]
    ];
  }

  function identity() {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  // port of rotmat_from_vec(vec1, vec2)
  function rotmatFromVec(vec1In, vec2In) {
    const vec1 = vec1In.slice();
    // "replaces 0 with 1e-12 in vec1" workaround for atoms already on-axis
    for (let i = 0; i < 3; i++) if (vec1[i] === 0) vec1[i] = 1e-12;

    const n1 = norm(vec1);
    const n2 = norm(vec2In);
    const a = vec1.map((v) => v / n1);
    const b = vec2In.map((v) => v / n2);

    const C = cross(a, b);
    const D = dot(a, b);
    const NP0 = norm(a); // always 1.0, a is already unit-length - kept for fidelity

    const cIsZero = C.every((v) => v === 0);
    if (!cIsZero) {
      const Z = [[0, -C[2], C[1]], [C[2], 0, -C[0]], [-C[1], C[0], 0]];
      const normC2 = C[0] * C[0] + C[1] * C[1] + C[2] * C[2];
      const F = (1 - D) / normC2;
      const Z2 = matMul(Z, Z);
      const ZZ = Z2.map((row) => row.map((v) => v * F));
      const I = identity();
      const R = I.map((row, i) => row.map((v, j) => v + Z[i][j] + ZZ[i][j]));
      const NP0sq = NP0 * NP0;
      return R.map((row) => row.map((v) => v / NP0sq));
    } else {
      const nb = norm(b);
      const scale = Math.sign(D) * (nb / NP0);
      return identity().map((row) => row.map((v) => v * scale));
    }
  }

  // port of rotmat_from_ang([thetaX, thetaY, thetaZ]) in degrees
  function rotmatFromAng(thetaDeg) {
    const theta = thetaDeg.map((t) => (t * Math.PI) / 180);
    const cx = Math.cos(theta[0]), cy = Math.cos(theta[1]), cz = Math.cos(theta[2]);
    const sx = Math.sin(theta[0]), sy = Math.sin(theta[1]), sz = Math.sin(theta[2]);
    const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
    const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
    return matMul(matMul(Rx, Ry), Rz);
  }

  // newRow[j] = sum_k row[k]*M[k][j]  (numpy row @ M semantics)
  function applyRowMatrix(atoms, M) {
    return atoms.map((a) => {
      const row = [a.x, a.y, a.z];
      const newRow = [0, 0, 0];
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += row[k] * M[k][j];
        newRow[j] = s;
      }
      return { ...a, x: newRow[0], y: newRow[1], z: newRow[2] };
    });
  }

  function centroid(atomsSubset) {
    const n = atomsSubset.length;
    const s = [0, 0, 0];
    for (const a of atomsSubset) { s[0] += a.x; s[1] += a.y; s[2] += a.z; }
    return [s[0] / n, s[1] / n, s[2] / n];
  }

  function subtractOrigin(atoms, origin) {
    return atoms.map((a) => ({ ...a, x: a.x - origin[0], y: a.y - origin[1], z: a.z - origin[2] }));
  }

  function translate(atoms, t) {
    return atoms.map((a) => ({ ...a, x: a.x + t[0], y: a.y + t[1], z: a.z + t[2] }));
  }

  // align the centroid vector of the selection onto `axis` (e.g. [1,0,0])
  function alignToAxis(atoms, vec1, axis) {
    const R = rotmatFromVec(vec1, axis);
    return { atoms: applyRowMatrix(atoms, transpose(R)), R };
  }

  // General port of the -x/-y/-z (+combo) sequence in xyzalign.py, for
  // arbitrary-size atom groups (one or more atoms per axis), e.g. the
  // equivalent of `xyzalign.py file.xyz -o 1 -x 2 -y 3 -z 4` or
  // `-x 2 3 -y 4 5 6`. xNums/yNums/zNums are arrays of atom .num values;
  // any of them may be empty/omitted (matches the script's independent
  // `if args.x:` / `if args.y:` / `if args.z:` checks). Every step re-reads
  // atom positions from the coordinates produced by the previous step -
  // this is what the reference script does, and it's why running x, then
  // y, then (if both given) a combo pass etc. converges instead of each
  // axis undoing the previous one.
  function runXyzAlignment(atoms, xNums = [], yNums = [], zNums = []) {
    const hasX = xNums.length > 0;
    const hasY = yNums.length > 0;
    const hasZ = zNums.length > 0;

    function groupOf(arr, nums) {
      return nums.map((n) => arr.find((a) => a.num === n)).filter(Boolean);
    }

    let cur = atoms;
    const log = [];

    if (hasX) {
      const v = centroid(groupOf(cur, xNums));
      cur = alignToAxis(cur, v, [1, 0, 0]).atoms;
      log.push({ label: `align X atom(s) [${xNums.join(", ")}] → X-axis`, vec: v });
    }
    if (hasY) {
      const v = centroid(groupOf(cur, yNums));
      cur = alignToAxis(cur, v, [0, 1, 0]).atoms;
      log.push({ label: `align Y atom(s) [${yNums.join(", ")}] → Y-axis`, vec: v });
    }
    if (hasZ) {
      const v = centroid(groupOf(cur, zNums));
      cur = alignToAxis(cur, v, [0, 0, 1]).atoms;
      log.push({ label: `align Z atom(s) [${zNums.join(", ")}] → Z-axis`, vec: v });
    }
    if (hasX && hasY && hasZ) {
      const pooled = [...groupOf(cur, xNums), ...groupOf(cur, yNums), ...groupOf(cur, zNums)];
      const v = centroid(pooled);
      cur = alignToAxis(cur, v, [1, 1, 1]).atoms;
      log.push({ label: "align combined X+Y+Z atoms → (1,1,1)", vec: v });
    }
    if (hasX && hasY) {
      const pooled = [...groupOf(cur, xNums), ...groupOf(cur, yNums)];
      const v = centroid(pooled);
      cur = alignToAxis(cur, v, [1, 1, 0]).atoms;
      log.push({ label: "align combined X+Y atoms → (1,1,0)", vec: v });
    }
    if (hasY) {
      const v = centroid(groupOf(cur, yNums));
      cur = alignToAxis(cur, v, [0, 1, 0]).atoms;
      log.push({ label: "re-align Y atom(s) → Y-axis", vec: v });
    }
    if (hasX) {
      const v = centroid(groupOf(cur, xNums));
      cur = alignToAxis(cur, v, [1, 0, 0]).atoms;
      log.push({ label: "re-align X atom(s) → X-axis", vec: v });
    }

    return { atoms: cur, log };
  }


  function rotate(atoms, thetaDeg) {
    const R = rotmatFromAng(thetaDeg);
    return { atoms: applyRowMatrix(atoms, transpose(R)), R };
  }

  // user-supplied 3x3 matrix, applied directly (no transpose) - matches -m
  function applyCustomMatrix(atoms, M) {
    return applyRowMatrix(atoms, M);
  }

  return {
    rotmatFromVec, rotmatFromAng, applyRowMatrix, centroid, subtractOrigin,
    translate, alignToAxis, runXyzAlignment, rotate, applyCustomMatrix, transpose, identity
  };
})();
