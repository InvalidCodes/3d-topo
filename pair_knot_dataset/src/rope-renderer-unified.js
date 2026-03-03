/**
 * Rope Renderer (Unified)
 *
 * A small, reusable helper for rendering rope-like meshes using Three.js TubeGeometry,
 * plus utilities to optimize and sanity-check curve centerlines.
 *
 * Design goals:
 * - Keep defaults aligned with a "high quality" intent, but with the explicit
 *   defaults requested by the user of this module.
 * - Provide lightweight self-intersection proximity detection for non-neighbor points.
 * - Provide CatmullRomCurve3 smoothing + resampling utility.
 */

import * as THREE from 'three';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Apply simple physics-style constraints to reduce obvious interpenetrations:
 * - Iterate non-neighbor point pairs
 * - If distance < minDistance => apply repulsion
 *
 * This is NOT a full physics engine. It's a cheap "push-apart" relaxation pass.
 *
 * @param {THREE.Vector3[]} points
 * @param {Object} [config]
 * @param {number} [config.minDistance=0.04]
 * @param {number} [config.repulsionStrength=0.1]
 * @param {number} [config.iterations=15]
 * @param {number} [config.neighborSkip=8] - treat indices within this window as neighbors (ignored)
 * @param {boolean} [config.closed=false] - if true, neighbor check wraps around
 * @param {boolean} [config.pinEnds=true] - keep endpoints fixed for open curves
 * @returns {THREE.Vector3[]}
 */
export function applyPhysicsConstraints(points, config = {}) {
  const ptsIn = (points || []).map(p => (p?.isVector3 ? p.clone() : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0)));
  const n = ptsIn.length;
  if (n < 4) return ptsIn;

  const {
    minDistance = 0.04,
    repulsionStrength = 0.1,
    iterations = 15,
    neighborSkip = 8,
    closed = false,
    pinEnds = true,
  } = config;

  const minD = Math.max(0, Number(minDistance) || 0);
  if (minD <= 1e-9) return ptsIn;

  const iters = Math.max(1, Math.floor(Number(iterations) || 1));
  const k = clamp(Number(repulsionStrength) ?? 0.1, 0, 1);
  const skip = Math.max(1, Math.floor(Number(neighborSkip) || 1));

  const eps = 1e-9;
  const minD2 = minD * minD;
  const tmp = new THREE.Vector3();

  const isNeighbor = (i, j) => {
    const dj = Math.abs(j - i);
    if (!closed) return dj <= skip;
    const wrapDj = Math.min(dj, n - dj);
    return wrapDj <= skip;
  };

  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (isNeighbor(i, j)) continue;

        const a = ptsIn[i];
        const b = ptsIn[j];
        tmp.copy(a).sub(b);
        const d2 = tmp.lengthSq();
        if (d2 >= minD2) continue;

        const d = Math.sqrt(Math.max(eps, d2));
        // push amount grows as points get closer
        const push = (minD - d) * k;
        tmp.multiplyScalar(1 / d); // normalize

        const wA = (pinEnds && !closed && i === 0) ? 0 : 1;
        const wB = (pinEnds && !closed && j === n - 1) ? 0 : 1;
        const wSum = wA + wB;
        if (wSum <= 1e-9) continue;

        // Split push between endpoints (if pinned, the other side takes more).
        const aScale = (wA / wSum) * push;
        const bScale = (wB / wSum) * push;

        a.addScaledVector(tmp, +aScale);
        b.addScaledVector(tmp, -bScale);
      }
    }

    // Light smoothing to avoid high-frequency jitter from repulsion, while preserving ends.
    if (n >= 5) {
      const next = ptsIn.map(p => p.clone());
      for (let i = 0; i < n; i++) {
        if (pinEnds && !closed && (i === 0 || i === n - 1)) continue;
        const i0 = (i - 1 + n) % n;
        const i1 = i;
        const i2 = (i + 1) % n;
        if (!closed && (i0 < 0 || i2 >= n)) continue;
        // 3-point Laplacian smoothing (small step)
        next[i]
          .copy(ptsIn[i1])
          .lerp(new THREE.Vector3().copy(ptsIn[i0]).add(ptsIn[i2]).multiplyScalar(0.5), 0.15);
      }
      for (let i = 0; i < n; i++) ptsIn[i].copy(next[i]);
    }
  }

  return ptsIn;
}

/**
 * Uniformly resample a polyline by arc-length.
 * @param {THREE.Vector3[]} points
 * @param {number} targetCount
 * @returns {THREE.Vector3[]}
 */
function resamplePolyline(points, targetCount) {
  const pts = points || [];
  const N = Math.max(2, Math.floor(targetCount || 200));
  if (pts.length <= 1) return pts.map(p => p.clone?.() ?? new THREE.Vector3(p.x, p.y, p.z));

  const p0 = pts.map(p => (p?.isVector3 ? p : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0)));

  const arc = [0];
  for (let i = 1; i < p0.length; i++) {
    arc.push(arc[i - 1] + p0[i].distanceTo(p0[i - 1]));
  }
  const total = arc[arc.length - 1];
  if (total < 1e-9) return [p0[0].clone(), p0[p0.length - 1].clone()];

  const out = [];
  let seg = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * total;
    while (seg < arc.length - 2 && arc[seg + 1] < s) seg++;
    const s0 = arc[seg], s1 = arc[seg + 1];
    const t = (s1 - s0) > 1e-9 ? (s - s0) / (s1 - s0) : 0;
    out.push(p0[seg].clone().lerp(p0[seg + 1], t));
  }
  return out;
}

/**
 * Optimize a set of points into a smooth centerline:
 * - CatmullRomCurve3 smoothing
 * - resample to targetSegments points (arc-length uniform)
 *
 * @param {THREE.Vector3[]} points
 * @param {number} targetSegments - target point count (not TubeGeometry segments)
 * @param {Object} [options]
 * @param {'centripetal'|'chordal'|'catmullrom'} [options.curveType='centripetal']
 * @param {number} [options.tension=0.45] - only used when curveType='catmullrom'
 * @param {number} [options.internalSamplesFactor=2.0]
 * @returns {THREE.Vector3[]}
 */
export function optimizeCurve(points, targetSegments = 240, options = {}) {
  const {
    curveType = 'centripetal',
    tension = 0.45,
    internalSamplesFactor = 2.0,
  } = options;

  const pts = (points || []).map(p => (p?.isVector3 ? p : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0)));
  if (pts.length < 2) return pts;

  // Smooth (parameter-space) then resample (arc-length) for more uniform spacing.
  const curve = new THREE.CatmullRomCurve3(
    pts,
    false,
    curveType,
    curveType === 'catmullrom' ? tension : undefined
  );

  const internalSamples = Math.max(50, Math.floor(targetSegments * clamp(Number(internalSamplesFactor) || 2.0, 1.0, 6.0)));
  const dense = curve.getPoints(internalSamples);
  return resamplePolyline(dense, targetSegments);
}

/**
 * Detect if the curve/points contain near self-intersections (proximity) between non-neighbor points.
 *
 * Notes:
 * - This is not a strict self-intersection test; it's a conservative minimum-distance probe.
 * - By default we skip a neighborhood of indices to avoid flagging local curvature.
 *
 * @param {THREE.Curve|THREE.Vector3[]} curveOrPoints
 * @param {number} [minDistance=0.05]
 * @param {Object} [options]
 * @param {number} [options.sampleCount=240] - used when input is a Curve
 * @param {number} [options.neighborSkip=30] - ignore pairs with |i-j| < neighborSkip
 * @param {boolean} [options.autoScale=false] - if true and input is points array, returns scaledPoints
 * @param {number} [options.maxScale=3.0]
 * @returns {{ hasIntersection: boolean, minDist: number, suggestedScale?: number, appliedScale?: number, scaledPoints?: THREE.Vector3[] }}
 */
export function checkSelfIntersection(curveOrPoints, minDistance = 0.05, options = {}) {
  const {
    sampleCount = 240,
    neighborSkip = 30,
    autoScale = false,
    maxScale = 3.0,
  } = options;

  const minD = Math.max(0, Number(minDistance) || 0);

  let pts;
  if (Array.isArray(curveOrPoints)) {
    pts = curveOrPoints.map(p => (p?.isVector3 ? p : new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0)));
  } else if (curveOrPoints && typeof curveOrPoints.getPoints === 'function') {
    pts = curveOrPoints.getPoints(Math.max(50, Math.floor(sampleCount)));
  } else {
    return { hasIntersection: false, minDist: Infinity };
  }

  const n = pts.length;
  if (n < 4) return { hasIntersection: false, minDist: Infinity };

  const skip = Math.max(1, Math.floor(neighborSkip));
  let minDistFound = Infinity;

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    for (let j = i + skip; j < n; j++) {
      const d = a.distanceTo(pts[j]);
      if (d < minDistFound) minDistFound = d;
    }
  }

  const hasIntersection = Number.isFinite(minDistFound) && minDistFound < minD;
  if (!hasIntersection) return { hasIntersection: false, minDist: minDistFound };

  // Suggest scaling up to satisfy minDistance. (Scaling centerline up increases pairwise distances.)
  const suggestedScaleRaw = minDistFound > 1e-9 ? (minD / minDistFound) : maxScale;
  const suggestedScale = clamp(suggestedScaleRaw, 1.0, Number(maxScale) || 3.0);

  if (autoScale && Array.isArray(curveOrPoints)) {
    const scaledPoints = pts.map(p => p.clone().multiplyScalar(suggestedScale));
    return {
      hasIntersection: true,
      minDist: minDistFound,
      suggestedScale,
      appliedScale: suggestedScale,
      scaledPoints,
    };
  }

  return { hasIntersection: true, minDist: minDistFound, suggestedScale };
}

/**
 * Create a rope mesh from a THREE.Curve.
 *
 * Defaults: requested "high quality" style
 * - radius: 0.02
 * - tubularSegments: 300
 * - radialSegments: 16
 * - material: roughness 0.7, metalness 0.1
 *
 * Optional safety:
 * - If autoScaleOnIntersection=true and curve is CatmullRomCurve3, this function can rebuild
 *   a scaled curve when near self-intersections are detected.
 *
 * @param {THREE.Curve} curve
 * @param {Object} [config]
 * @param {number} [config.radius=0.02]
 * @param {number} [config.tubularSegments=300]
 * @param {number} [config.radialSegments=16]
 * @param {string|number} [config.color='#ffffff']
 * @param {number} [config.roughness=0.7]
 * @param {number} [config.metalness=0.1]
 * @param {boolean} [config.autoScaleOnIntersection=false]
 * @param {number} [config.minDistance=0.05]
 * @returns {THREE.Mesh}
 */
export function createRopeMesh(curve, {
  radius = 0.02,
  tubularSegments = 300,
  radialSegments = 16,
  closed = false,
  color = '#ffffff',
  roughness = 0.7,
  metalness = 0.1,
  autoScaleOnIntersection = false,
  minDistance = 0.05,
  physics = {},
} = {}) {
  if (!curve || typeof curve.getPoint !== 'function') {
    throw new Error('createRopeMesh(curve, config): "curve" must be a THREE.Curve-like object.');
  }

  let usedCurve = curve;
  let intersection;

  // Check self-proximity on a sampled polyline.
  intersection = checkSelfIntersection(usedCurve, minDistance, {
    sampleCount: Math.max(80, Math.floor(tubularSegments * 0.8)),
    neighborSkip: 30,
    autoScale: false,
  });

  if (intersection.hasIntersection) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Rope] Near self-intersection detected: minDist=${intersection.minDist.toFixed(5)} < ${minDistance}.`,
      intersection.suggestedScale ? `suggestedScale=${intersection.suggestedScale.toFixed(3)}` : ''
    );
  }

  if (autoScaleOnIntersection && intersection?.hasIntersection && intersection?.suggestedScale && usedCurve?.isCatmullRomCurve3) {
    // Rebuild curve by scaling its control points (safe + deterministic).
    const scaledPts = (usedCurve.points || []).map(p => p.clone().multiplyScalar(intersection.suggestedScale));
    usedCurve = new THREE.CatmullRomCurve3(scaledPts, usedCurve.closed, usedCurve.curveType || 'centripetal', usedCurve.tension);
  }

  // --- Physics constraints (push-apart relaxation) ---
  // Sample points, push apart close non-neighbors, then rebuild a smooth curve.
  const sampleN = Math.max(20, Math.floor(tubularSegments));
  let pts = usedCurve.getPoints(sampleN);
  const physCfg = {
    minDistance: Math.max(0, (Number(radius) || 0.02) * 2),
    repulsionStrength: 0.1,
    iterations: 15,
    closed: Boolean(closed),
    ...physics,
  };
  pts = applyPhysicsConstraints(pts, physCfg);
  const smoothCurve = new THREE.CatmullRomCurve3(pts, Boolean(closed), 'centripetal');

  const geometry = new THREE.TubeGeometry(
    smoothCurve,
    Math.max(10, Math.floor(tubularSegments)),
    Math.max(0.0001, Number(radius) || 0.02),
    Math.max(3, Math.floor(radialSegments)),
    Boolean(closed)
  );

  // Update intersection info after constraints (more meaningful for diagnostics).
  intersection = checkSelfIntersection(smoothCurve, minDistance, {
    sampleCount: Math.max(80, Math.floor(tubularSegments * 0.8)),
    neighborSkip: 30,
    autoScale: false,
  });

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: clamp(Number(roughness) ?? 0.7, 0, 1),
    metalness: clamp(Number(metalness) ?? 0.1, 0, 1),
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = mesh.userData || {};
  mesh.userData.rope = {
    curve: smoothCurve,
    intersection,
    config: { radius, tubularSegments, radialSegments, closed, color, roughness, metalness, autoScaleOnIntersection, minDistance, physics: physCfg },
  };
  return mesh;
}

export default {
  createRopeMesh,
  checkSelfIntersection,
  optimizeCurve,
  applyPhysicsConstraints,
};

