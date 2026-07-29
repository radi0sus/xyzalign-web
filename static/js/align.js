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

  function det3(A) {
    return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
      - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
      + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  }

  // Classic cyclic Jacobi rotation sweep for a symmetric 3x3 matrix.
  // Returns eigenvalues (descending) and eigenvectors as columns of `vectors`.
  function jacobiEigenSymmetric3x3(Ain) {
    const a = Ain.map((row) => row.slice());
    const v = identity();
    for (let iter = 0; iter < 100; iter++) {
      const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-14) break;
      for (let p = 0; p < 2; p++) {
        for (let q = p + 1; q < 3; q++) {
          if (Math.abs(a[p][q]) < 1e-15) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const tSign = theta >= 0 ? 1 : -1;
          const t = tSign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          const app = a[p][p], aqq = a[q][q], apq = a[p][q];
          a[p][p] = app - t * apq;
          a[q][q] = aqq + t * apq;
          a[p][q] = 0; a[q][p] = 0;
          for (let k = 0; k < 3; k++) {
            if (k !== p && k !== q) {
              const akp = a[k][p], akq = a[k][q];
              a[k][p] = c * akp - s * akq; a[p][k] = a[k][p];
              a[k][q] = s * akp + c * akq; a[q][k] = a[k][q];
            }
          }
          for (let k = 0; k < 3; k++) {
            const vkp = v[k][p], vkq = v[k][q];
            v[k][p] = c * vkp - s * vkq;
            v[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const eigenvalues = [a[0][0], a[1][1], a[2][2]];
    const idx = [0, 1, 2].sort((i, j) => eigenvalues[j] - eigenvalues[i]);
    const sortedVals = idx.map((i) => eigenvalues[i]);
    const sortedVecs = identity();
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) sortedVecs[row][col] = v[row][idx[col]];
    return { values: sortedVals, vectors: sortedVecs };
  }

  // Fills in missing (null) unit-vector columns so `cols` (length 3, some
  // entries null) becomes a complete orthonormal basis. Used to complete U
  // in the SVD below when B is rank-deficient (e.g. only 1 or 2 atom groups
  // given, so B has rank < 3 and some singular values are ~0).
  function completeOrthonormalBasis(cols) {
    const result = cols.slice();
    const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i++) {
      if (result[i]) continue;
      let found = null;
      for (const cand of candidates) {
        let vec = cand.slice();
        for (let k = 0; k < 3; k++) {
          if (result[k] && k !== i) {
            const dp = vec[0] * result[k][0] + vec[1] * result[k][1] + vec[2] * result[k][2];
            vec = [vec[0] - dp * result[k][0], vec[1] - dp * result[k][1], vec[2] - dp * result[k][2]];
          }
        }
        const n = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
        if (n > 1e-6) { found = vec.map((x) => x / n); break; }
      }
      result[i] = found;
    }
    return result;
  }

  // Minimal 3x3 SVD (B = U * diag(singVals) * V^T), via eigendecomposition
  // of B^T B. Only used internally by the Kabsch solver below, so it doesn't
  // need to handle anything beyond real 3x3 matrices.
  function svd3x3(B) {
    const M = matMul(transpose(B), B);
    const eig = jacobiEigenSymmetric3x3(M);
    const V = eig.vectors;
    const singVals = eig.values.map((x) => Math.sqrt(Math.max(x, 0)));
    const tol = 1e-9 * (singVals[0] || 1);

    let Ucols = [null, null, null];
    for (let i = 0; i < 3; i++) {
      if (singVals[i] > tol) {
        const Vi = [V[0][i], V[1][i], V[2][i]];
        const BVi = [
          B[0][0] * Vi[0] + B[0][1] * Vi[1] + B[0][2] * Vi[2],
          B[1][0] * Vi[0] + B[1][1] * Vi[1] + B[1][2] * Vi[2],
          B[2][0] * Vi[0] + B[2][1] * Vi[1] + B[2][2] * Vi[2]
        ];
        const n = Math.sqrt(BVi[0] * BVi[0] + BVi[1] * BVi[1] + BVi[2] * BVi[2]);
        Ucols[i] = n > 1e-12 ? BVi.map((x) => x / n) : null;
      }
    }
    Ucols = completeOrthonormalBasis(Ucols);
    const U = [
      [Ucols[0][0], Ucols[1][0], Ucols[2][0]],
      [Ucols[0][1], Ucols[1][1], Ucols[2][1]],
      [Ucols[0][2], Ucols[1][2], Ucols[2][2]]
    ];
    return { U, V, singVals };
  }

  // Kabsch / Wahba's-problem solution: the single proper rotation R that
  // minimizes sum_i |R*vectors[i] - targets[i]|^2 (after normalizing every
  // vector to unit length, so only *direction* matters, matching the rest
  // of this module). Unlike the iterative runXyzAlignment sequence, this
  // treats every given axis group equally (no X > Y > Z priority) and can
  // never produce an improper reflection (det(R) is forced to +1).
  function kabschRotation(vectors, targets) {
    const n = vectors.length;
    const P = vectors.map((v) => { const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; });
    const Q = targets.map((v) => { const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; });

    let B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          B[a][b] += Q[i][a] * P[i][b];
        }
      }
    }

    const { U, V } = svd3x3(B);
    const d = det3(U) * det3(V) >= 0 ? 1 : -1;
    const D = [[1, 0, 0], [0, 1, 0], [0, 0, d]];
    return matMul(matMul(U, D), transpose(V));
  }

  // Least-squares alternative to runXyzAlignment(): fits all given X/Y/Z
  // atom groups simultaneously with a single Kabsch-optimal rotation,
  // instead of xyzalign.py's sequential align-then-correct passes.
  function runXyzAlignmentLeastSquares(atoms, xNums = [], yNums = [], zNums = []) {
    function groupOf(arr, nums) {
      return nums.map((n) => arr.find((a) => a.num === n)).filter(Boolean);
    }
    const groups = [];
    if (xNums.length) groups.push({ label: "X", nums: xNums, target: [1, 0, 0] });
    if (yNums.length) groups.push({ label: "Y", nums: yNums, target: [0, 1, 0] });
    if (zNums.length) groups.push({ label: "Z", nums: zNums, target: [0, 0, 1] });
    if (groups.length === 0) return { atoms, log: [], R: identity() };

    const vectors = groups.map((g) => centroid(groupOf(atoms, g.nums)));
    const targets = groups.map((g) => g.target);

    // If all three X/Y/Z groups are given, check whether the chosen atoms
    // form a right-handed triple, like the target axes do. A *proper*
    // rotation (det = +1, which is all this solver ever produces) can
    // only ever map a right-handed set of vectors onto another
    // right-handed set - it can never turn a left-handed one into a
    // right-handed one, that needs a reflection. So if the chosen X/Y/Z
    // atoms happen to form a left-handed triple, no rotation can land all
    // three cleanly on their target axes; the least-squares fit is then
    // forced into a poor, twisted compromise rather than failing loudly.
    let mirroredGroups = false;
    if (groups.length === 3) {
      const [vx, vy, vz] = vectors;
      const triple = vx[0] * (vy[1] * vz[2] - vy[2] * vz[1])
                   - vx[1] * (vy[0] * vz[2] - vy[2] * vz[0])
                   + vx[2] * (vy[0] * vz[1] - vy[1] * vz[0]);
      mirroredGroups = triple < 0;
    }

    const R = kabschRotation(vectors, targets);
    const newAtoms = applyRowMatrix(atoms, transpose(R));
    const log = groups.map((g, i) => ({
      label: `least-squares fit: ${g.label} atom(s) [${g.nums.join(", ")}] → ${g.label}-axis`,
      vec: vectors[i]
    }));
    return { atoms: newAtoms, log, R, mirroredGroups };
  }

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
    let inverted = false;

    function step(v, axis, label) {
      const r = alignToAxis(cur, v, axis);
      cur = r.atoms;
      if (det3(r.R) < 0) inverted = true;
      log.push({ label, vec: v });
    }

    if (hasX) step(centroid(groupOf(cur, xNums)), [1, 0, 0], `align X atom(s) [${xNums.join(", ")}] → X-axis`);
    if (hasY) step(centroid(groupOf(cur, yNums)), [0, 1, 0], `align Y atom(s) [${yNums.join(", ")}] → Y-axis`);
    if (hasZ) step(centroid(groupOf(cur, zNums)), [0, 0, 1], `align Z atom(s) [${zNums.join(", ")}] → Z-axis`);
    if (hasX && hasY && hasZ) {
      const pooled = [...groupOf(cur, xNums), ...groupOf(cur, yNums), ...groupOf(cur, zNums)];
      step(centroid(pooled), [1, 1, 1], "align combined X+Y+Z atoms → (1,1,1)");
    }
    if (hasX && hasY) {
      const pooled = [...groupOf(cur, xNums), ...groupOf(cur, yNums)];
      step(centroid(pooled), [1, 1, 0], "align combined X+Y atoms → (1,1,0)");
    }
    if (hasY) step(centroid(groupOf(cur, yNums)), [0, 1, 0], "re-align Y atom(s) → Y-axis");
    if (hasX) step(centroid(groupOf(cur, xNums)), [1, 0, 0], "re-align X atom(s) → X-axis");

    return { atoms: cur, log, inverted };
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
    translate, alignToAxis, runXyzAlignment, runXyzAlignmentLeastSquares,
    rotate, applyCustomMatrix, transpose, identity, det3, kabschRotation
  };
})();
