/**
 * Multi-knot open rope support
 *
 * 设计目标：
 * - 在一根开绳上放置 2-3 个结（不同类型/不同 tightness），并用直线段连接。
 * - 使用轻量的“非邻域排斥”来减少自交/贴面重叠（z-fighting）。
 *
 * 注意：
 * - 这不是严格的物理仿真，只是用于生成更像真实绳结的可视化数据。
 */

import * as THREE from 'three';
import { generateOpenKnot } from './open-loop-generator.js';

export const MULTI_KNOT_CONFIGS = {
  double_overhand_real: {
    name: 'Two Overhand Knots',
    knots: [
      { type: 'overhand', position: 0.25, tightness: 0.7 },
      { type: 'overhand', position: 0.75, tightness: 0.6 },
    ],
    totalLength: 12,
  },

  mixed_knots: {
    name: 'Overhand + Figure-8',
    knots: [
      { type: 'overhand', position: 0.3, tightness: 0.8 },
      { type: 'figure8', position: 0.7, tightness: 0.5 },
    ],
    totalLength: 14,
  },

  triple_knots: {
    name: 'Three Knots',
    knots: [
      { type: 'overhand', position: 0.2, tightness: 0.7 },
      { type: 'figure8', position: 0.5, tightness: 0.6 },
      { type: 'overhand', position: 0.8, tightness: 0.5 },
    ],
    totalLength: 18,
  },
};

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) {
  const seedFn = xmur3(String(seedStr || 'multi-knot'));
  return mulberry32(seedFn());
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function trimEnds(points, frac = 0.16) {
  const pts = points || [];
  if (pts.length < 10) return pts.slice();
  const k = Math.max(0, Math.min(Math.floor(pts.length * frac), Math.floor(pts.length / 3)));
  return pts.slice(k, pts.length - k);
}

function bbox(points) {
  const b = new THREE.Box3();
  for (const p of points) b.expandByPoint(p);
  return b;
}

function resamplePolyline(points, targetCount) {
  const pts = points || [];
  const N = Math.max(2, Math.floor(targetCount || 240));
  if (pts.length <= 1) return pts.slice();

  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = arc[arc.length - 1];
  if (total < 1e-9) return [pts[0].clone(), pts[pts.length - 1].clone()];

  const out = [];
  let seg = 0;
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * total;
    while (seg < arc.length - 2 && arc[seg + 1] < s) seg++;
    const s0 = arc[seg], s1 = arc[seg + 1];
    const t = (s1 - s0) > 1e-9 ? (s - s0) / (s1 - s0) : 0;
    out.push(pts[seg].clone().lerp(pts[seg + 1], t));
  }
  return out;
}

function concatNoDuplicate(out, pts) {
  if (!out.length) return pts.slice();
  if (!pts.length) return out.slice();
  const res = out.slice();
  const a = res[res.length - 1];
  const b = pts[0];
  if (a.distanceToSquared(b) < 1e-12) res.pop();
  res.push(...pts);
  return res;
}

function makeStraightSegment(x0, x1, { rng, amp = 0.06, stepsPerUnit = 14 } = {}) {
  const span = x1 - x0;
  const n = Math.max(2, Math.floor(Math.abs(span) * stepsPerUnit));
  const phaseY = (rng ? rng() : 0.5) * Math.PI * 2;
  const phaseZ = (rng ? rng() : 0.5) * Math.PI * 2;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + span * t;
    const e = t * (1 - t); // 0 at ends
    const y = amp * e * Math.sin(2 * Math.PI * t + phaseY);
    const z = amp * e * Math.cos(2 * Math.PI * t + phaseZ);
    out.push(new THREE.Vector3(x, y, z));
  }
  return out;
}

/**
 * Stronger collision detection with multiple iterations (V2).
 *
 * 说明：
 * - 使用更大的 neighborSkip（25）减少对局部曲率的干扰。
 * - 保留 z 轴结构：pushDir.z *= 0.3（Z 修正减少 70%）。
 *
 * @param {THREE.Vector3[]} points
 * @param {number} tubeRadius
 * @param {number} iterations
 * @returns {THREE.Vector3[]}
 */
export function avoidSelfIntersectionV2(points, tubeRadius = 0.04, iterations = 5) {
  const pts = (points || []).map(p => p.clone());
  if (pts.length < 8) return pts;

  const r = Number.isFinite(tubeRadius) ? Math.max(0.005, tubeRadius) : 0.04;
  const minDist = r * 3.5;
  const minDist2 = minDist * minDist;

  const neighSkip = 25;
  const n = pts.length;

  for (let iter = 0; iter < Math.max(1, Math.floor(iterations)); iter++) {
    let hasCollision = false;

    for (let i = 0; i < n; i++) {
      const pi = pts[i];
      for (let j = i + neighSkip; j < n; j++) {
        const pj = pts[j];
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const dz = pj.z - pi.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minDist2 || d2 <= 1e-6) continue;

        const dist = Math.sqrt(d2);
        if (dist <= 1e-6) continue;
        hasCollision = true;

        const pushDir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
        pushDir.z *= 0.3; // preserve over/under structure

        const pushAmount = (minDist - dist) * 0.7;

        // Weighted push: keep rope ends more stable
        const weight_i = i / Math.max(1, n - 1);
        const weight_j = j / Math.max(1, n - 1);

        pi.addScaledVector(pushDir, -pushAmount * (1 - weight_i) * 0.5);
        pj.addScaledVector(pushDir,  pushAmount * weight_j * 0.5);
      }
    }

    if (!hasCollision) {
      // eslint-disable-next-line no-console
      console.log(`[Collision][Multi] Resolved in ${iter + 1} iterations`);
      break;
    }
  }

  return pts;
}

/**
 * Generate a multi-knot rope path (Vector3[]).
 *
 * @param {keyof MULTI_KNOT_CONFIGS} configName
 * @param {string|number} seed
 * @returns {THREE.Vector3[]}
 */
export function generateMultiKnotPath(configName, seed, options = {}) {
  const config = MULTI_KNOT_CONFIGS[configName];
  if (!config) throw new Error(`Unknown multi-knot config: "${configName}"`);

  const totalLength = Math.max(6, Number(config.totalLength || 12));
  const rng = makeRng(`${seed ?? 'seed'}|multi|${configName}`);

  const knotsSorted = (config.knots || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  if (knotsSorted.length === 0) {
    return makeStraightSegment(-totalLength / 2, totalLength / 2, { rng, amp: 0.04 });
  }

  // 1) Generate each knot path + bbox width
  const knotPaths = knotsSorted.map((k, i) => {
    const tight = clamp(Number(k.tightness ?? 0.7), 0, 1);
    const tubeRadiusHint = Number.isFinite(options?.tubeRadius) ? options.tubeRadius : 0.04;
    let path = generateOpenKnot(
      k.type || 'overhand',
      tight,
      `${seed ?? 'seed'}|${configName}|knot${i}`,
      { tubeRadius: tubeRadiusHint }
    );
    path = trimEnds(path, 0.18);
    path = resamplePolyline(path, 220);

    const b = new THREE.Box3().setFromPoints(path);
    const width = Math.max(0.5, b.max.x - b.min.x);

    return {
      path,
      position: clamp(Number(k.position ?? 0.5), 0.05, 0.95),
      width,
      tightness: tight,
    };
  });

  // 2) Place knots with guaranteed spacing (center positions)
  const startX = -totalLength / 2;
  const endX = totalLength / 2;
  let cursor = startX; // right edge of placed content so far
  const placedKnots = [];

  for (const kp of knotPaths) {
    const targetCenter = kp.position * totalLength - totalLength / 2;
    const gap = kp.width * 0.3; // 30% gap
    const minCenter = cursor + gap + kp.width / 2;
    const centerX = Math.max(targetCenter, minCenter);
    placedKnots.push({ ...kp, centerX });
    cursor = centerX + kp.width / 2;
  }

  // 3) Assemble rope
  let all = [];
  let currentX = startX;

  for (const kp of placedKnots) {
    const leftEdge = kp.centerX - kp.width / 2;

    // Straight segment before knot (no wiggle to reduce collisions)
    if (leftEdge - currentX > 0.5) {
      const numPts = Math.floor((leftEdge - currentX) * 15);
      for (let j = 0; j <= numPts; j++) {
        const x = THREE.MathUtils.lerp(currentX, leftEdge, j / Math.max(1, numPts));
        all.push(new THREE.Vector3(x, 0, 0));
      }
    }

    // Knot translated to centerX
    for (const p of kp.path) {
      all.push(p.clone().add(new THREE.Vector3(kp.centerX, 0, 0)));
    }

    currentX = kp.centerX + kp.width / 2;
  }

  // Final straight segment
  if (endX - currentX > 0.5) {
    const numPts = Math.floor((endX - currentX) * 15);
    for (let j = 0; j <= numPts; j++) {
      const x = THREE.MathUtils.lerp(currentX, endX, j / Math.max(1, numPts));
      all.push(new THREE.Vector3(x, 0, 0));
    }
  }

  // 4) Global collision detection (5 iterations)
  all = resamplePolyline(all, 520);
  all = avoidSelfIntersectionV2(all, Number.isFinite(options?.tubeRadius) ? options.tubeRadius : 0.04, 5);
  all = resamplePolyline(all, 340);

  // Center X
  const bAll = bbox(all);
  const center = bAll.getCenter(new THREE.Vector3());
  const shift = new THREE.Vector3(center.x, 0, 0);
  return all.map(p => p.clone().sub(shift));
}

export default {
  MULTI_KNOT_CONFIGS,
  generateMultiKnotPath,
  avoidSelfIntersectionV2,
};

