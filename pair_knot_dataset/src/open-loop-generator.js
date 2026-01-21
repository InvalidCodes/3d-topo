/**
 * Open-ended rope knot generator (open loop / open chain).
 *
 * 目标：
 * - 生成适用于 three.js `TubeGeometry` / `CatmullRomCurve3` 的中心线点集（THREE.Vector3[]）
 * - 提供统一标签：是否有“结”、结的数量、tightness 分级等
 *
 * 说明：
 * - 这里的 “has_knot / knot_count” 指任务语义（绳子上是否打了结、结的个数），
 *   而不是严格的拓扑不变量（开绳在拓扑上总是可拉直）。
 * - “crossings” 的字面数量在 3D/投影下并不稳定，因此不作为标签输出。
 */

import * as THREE from 'three';
import { KNOT_TEMPLATES } from './open-loop-templates.js';
import { MULTI_KNOT_CONFIGS } from './open-loop-multi-knot.js';

// ============= Seeded RNG (keep consistent with the repo) =============
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
  const seedFn = xmur3(String(seedStr || 'open-loop-seed'));
  return mulberry32(seedFn());
}

// ============= Math helpers =============
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function rotateYZ(y, z, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { y: y * c - z * s, z: y * s + z * c };
}

// ============= Geometry helpers =============
function toVec3(p) {
  return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

function copyVec3Array(points) {
  return (points || []).map(toVec3);
}

function resamplePolyline(points, targetCount) {
  const pts = points || [];
  const N = Math.max(2, Math.floor(targetCount || 220));
  if (pts.length <= 1) return pts.slice();

  const arc = [0];
  for (let i = 1; i < pts.length; i++) {
    arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
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

function centerPolyline(points) {
  if (!points.length) return [];
  const box = new THREE.Box3();
  for (const p of points) box.expandByPoint(p);
  const c = box.getCenter(new THREE.Vector3());
  return points.map(p => p.clone().sub(c));
}

/**
 * Ultra-robust collision detection with multiple iterations.
 *
 * 目标：尽可能消除中心线非邻域点的贴面/重叠（z-fighting），尤其是 tight 配置下。
 * 关键点：
 * - minDist = tubeRadius * 4.5（更保守的安全距离）
 * - skipNeighbors = 30（更大邻域跳过，减少破坏局部形状）
 * - z 轴结构保留：pushDir.z 根据 zPreservation 自适应衰减
 */
function avoidSelfIntersectionV2(points, tubeRadius = 0.025, iterations = 5) {
  const pts = (points || []).map(p => p.clone());
  if (pts.length < 10) return pts;

  const r = Number.isFinite(tubeRadius) ? Math.max(0.003, tubeRadius) : 0.025;
  const minDist = r * 4.5;
  const minDist2 = minDist * minDist;
  const skipNeighbors = 30;
  const n = pts.length;

  // eslint-disable-next-line no-console
  console.log(`[Collision] Starting detection: ${n} points, minDist=${minDist.toFixed(4)}`);

  for (let iter = 0; iter < Math.max(1, Math.floor(iterations)); iter++) {
    let collisionCount = 0;

    for (let i = 0; i < n; i++) {
      const pi = pts[i];
      for (let j = i + skipNeighbors; j < n; j++) {
        const pj = pts[j];
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const dz = pj.z - pi.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minDist2 || d2 <= 1e-6) continue;

        const dist = Math.sqrt(d2);
        if (dist <= 1e-6) continue;

        collisionCount++;

        // Calculate push direction
        const pushDir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);

        // Preserve Z-axis structure: adaptively reduce Z correction
        const zPreservation = Math.abs(dz) / (dist + 0.01); // 0..~1
        pushDir.z *= THREE.MathUtils.lerp(0.2, 0.5, clamp(zPreservation, 0, 1));

        const pushAmount = (minDist - dist) * 0.8;

        // Weighted push based on position in curve
        const weight_i = 1 - (i / Math.max(1, n - 1));
        const weight_j = j / Math.max(1, n - 1);

        pi.addScaledVector(pushDir, -pushAmount * weight_i * 0.5);
        pj.addScaledVector(pushDir,  pushAmount * weight_j * 0.5);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[Collision] Iteration ${iter + 1}: ${collisionCount} collisions fixed`);

    if (collisionCount === 0) {
      // eslint-disable-next-line no-console
      console.log(`[Collision] ✓ Resolved in ${iter + 1} iterations`);
      break;
    }
  }

  return pts;
}

/**
 * Secondary smoothing pass to remove artifacts from collision resolution.
 * 5-point weighted average, then blend with original (40%) to preserve shape.
 */
function smoothCurve(points, iterations = 2) {
  let pts = (points || []).map(p => p.clone());
  if (pts.length < 5) return pts;

  for (let iter = 0; iter < Math.max(1, Math.floor(iterations)); iter++) {
    const smoothed = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p.clone();

      const weights = [0.1, 0.2, 0.4, 0.2, 0.1];
      const avg = new THREE.Vector3();
      for (let offset = -2; offset <= 2; offset++) {
        const idx = Math.max(0, Math.min(pts.length - 1, i + offset));
        avg.add(pts[idx].clone().multiplyScalar(weights[offset + 2]));
      }
      return p.clone().lerp(avg, 0.4);
    });
    pts = smoothed;
  }

  return pts;
}

function addLeads(controlPoints, leadLen) {
  const cps = controlPoints.slice();
  if (cps.length < 2) return cps;

  const a0 = cps[0].clone();
  const a1 = cps[1].clone();
  const b0 = cps[cps.length - 1].clone();
  const b1 = cps[cps.length - 2].clone();

  const dirStart = a0.clone().sub(a1);
  if (dirStart.lengthSq() < 1e-9) dirStart.set(-1, 0, 0);
  dirStart.normalize();
  const dirEnd = b0.clone().sub(b1);
  if (dirEnd.lengthSq() < 1e-9) dirEnd.set(1, 0, 0);
  dirEnd.normalize();

  // Two extra points each side help TubeGeometry end caps look cleaner.
  const s2 = a0.clone().addScaledVector(dirStart, leadLen * 0.65);
  const s1 = a0.clone().addScaledVector(dirStart, leadLen * 1.2);
  s2.y *= 0.2; s2.z *= 0.2;
  s1.y = 0; s1.z = 0;

  const e2 = b0.clone().addScaledVector(dirEnd, leadLen * 0.65);
  const e1 = b0.clone().addScaledVector(dirEnd, leadLen * 1.2);
  e2.y *= 0.2; e2.z *= 0.2;
  e1.y = 0; e1.z = 0;

  return [s1, s2, ...cps, e2, e1];
}

function applyCrossingDepth(points, crossings, depth) {
  const pts = points.map(p => p.clone());
  const D = Math.max(0, depth);
  if (!crossings || crossings.length === 0 || D <= 1e-6) return pts;

  const bump = (idx, sign) => {
    for (let k = -2; k <= 2; k++) {
      const i = idx + k;
      if (i < 0 || i >= pts.length) continue;
      const w = Math.exp(-(k * k) / 2.2);
      pts[i].z += sign * D * w;
    }
  };

  for (const c of crossings) {
    if (!Number.isFinite(c.overIndex) || !Number.isFinite(c.underIndex)) continue;
    bump(Math.floor(c.overIndex), +1);
    bump(Math.floor(c.underIndex), -1);
  }

  return pts;
}

function applyTightnessAndVariation(controlPoints, { tightness, rng, crossings }) {
  const t = clamp(tightness, 0, 1);
  const cps = controlPoints.map(p => p.clone());

  // === KEY: make loose knots MUCH looser ===
  // 目标：tightness 很低时“几乎是个圈”，且更扁平（更少 3D 结构）。
  // 注意：渲染阶段会对整体进行归一化缩放，因此这里的 “scale” 主要改变
  // - 结核心 vs 绳头的相对比例
  // - 形状的紧凑度/松散度
  const scale = lerp(3.5, 0.7, t) * (0.97 + 0.06 * rng());
  const zFlat = lerp(0.3, 1.3, t) * (0.97 + 0.06 * rng()); // loose flatter, tight more 3D

  // Extra anisotropy for realism: loose is a bit more “open”, tight a bit more compact.
  const xScale = scale * lerp(1.12, 0.92, t);
  const yScale = scale * lerp(1.18, 0.90, t);
  const zScale = scale * zFlat;

  for (const p of cps) {
    p.x *= xScale;
    p.y *= yScale;
    p.z *= zScale;
  }

  // Strengthen over/under separation around declared crossings.
  // 目标：在 tight 情况下也能保持明显分层，减少 z-fighting。
  // depth 会同时把 over 往上推、under 往下拉，实际分层增量约为 ~2*depth。
  // loose 时需要更扁平，因此让 depth 也随 zFlat 缩小；tight 时强化分层。
  const depth = lerp(0.20, 0.65, t) * zFlat;
  let out = applyCrossingDepth(cps, crossings, depth);

  // Small global rotation (kept subtle to preserve recognizability)
  const rx = (rng() - 0.5) * 0.22;
  const ry = (rng() - 0.5) * 0.22;
  const rz = (rng() - 0.5) * 0.18;
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  out = out.map(p => p.clone().applyMatrix4(rot));

  // Keep endpoints close to z=0/y=0 for a “rope ends” look.
  if (out.length >= 2) {
    out[0].y = 0; out[0].z = 0;
    out[out.length - 1].y = 0; out[out.length - 1].z = 0;
    out[1].y *= 0.6; out[1].z *= 0.6;
    out[out.length - 2].y *= 0.6; out[out.length - 2].z *= 0.6;
  }

  return out;
}

// ============= Public API =============
/**
 * Generate open-ended rope knot as a polyline (Vector3[]).
 *
 * @param {'straight'|'overhand'|'figure8'|'overhand_x2'|'loose_loop'} type
 * @param {number} tightness 0..1 (0=loose, 1=tight)
 * @param {string|number} seed
 * @returns {THREE.Vector3[]} points
 */
export function generateOpenKnot(type, tightness, seed, options = {}) {
  const t = clamp(Number(tightness ?? 0.6), 0, 1);
  const kindRaw = String(type || 'straight');

  // Backward-compatible aliases (old API -> new templates)
  const alias = {
    loose_loop: 'loose_coil',
    overhand_x2: 'double_overhand',
    double: 'double_overhand',
  };
  const kind = alias[kindRaw] || kindRaw;

  const rng = makeRng(`${seed ?? 'seed'}|${kind}|t=${t.toFixed(3)}`);

  const tpl = KNOT_TEMPLATES[kind] || KNOT_TEMPLATES.straight;
  if (tpl.multiRope) {
    // 未来：multi-rope support
    throw new Error(`Template "${kind}" requires multi-rope support (not implemented yet)`);
  }

  const base = copyVec3Array(tpl.controlPoints);
  const cps = applyTightnessAndVariation(base, { tightness: t, rng, crossings: tpl.crossings || [] });

  // Leads: loose -> longer tails
  const leadLen = lerp(2.6, 1.5, t) * (0.95 + 0.10 * rng());
  const cpsWithLeads = addLeads(cps, leadLen);

  // Curve sampling (smooth and stable)
  // loose: lower tension to avoid over-curving; tight: slightly higher tension to keep shape crisp
  const tension = lerp(0.30, 0.50, t);
  const curve = new THREE.CatmullRomCurve3(cpsWithLeads, false, 'catmullrom', tension);
  const pts = curve.getPoints(420);

  // Resample -> collision resolve -> resample -> center
  let out = resamplePolyline(pts, 420);
  const tubeRadiusHint = Number.isFinite(options?.tubeRadius) ? options.tubeRadius : 0.025;

  // Two-stage: collision -> smoothing
  out = avoidSelfIntersectionV2(out, tubeRadiusHint, 5);
  out = smoothCurve(out, 2);

  // Keep endpoints stable (rope ends)
  if (out.length >= 2) {
    out[0].y = 0; out[0].z = 0;
    out[out.length - 1].y = 0; out[out.length - 1].z = 0;
  }

  out = resamplePolyline(out, 240);

  // Final validation
  let finalCollisions = 0;
  const finalMinDist = tubeRadiusHint * 4.5;
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 30; j < out.length; j++) {
      if (out[i].distanceTo(out[j]) < finalMinDist) finalCollisions++;
    }
  }
  if (finalCollisions > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[Collision] ⚠️ ${finalCollisions} collisions remain after max iterations`);
  }

  return centerPolyline(out);
}

/**
 * Labels for open rope knots.
 *
 * @param {'straight'|'overhand'|'figure8'|'overhand_x2'|'loose_loop'} type
 * @param {number} tightness 0..1
 */
export function getOpenKnotLabels(type, tightness) {
  const t = clamp(Number(tightness ?? 0.5), 0, 1);
  let tightness_level = 'medium';
  if (t >= 0.85) tightness_level = 'tight';
  else if (t >= 0.60) tightness_level = 'medium';
  else if (t >= 0.35) tightness_level = 'loose';
  else tightness_level = 'slack';

  const kindRaw = String(type || 'straight');
  const alias = {
    loose_loop: 'loose_coil',
    overhand_x2: 'double_overhand',
    double: 'double_overhand',
  };
  const kind = alias[kindRaw] || kindRaw;

  // Multi-knot configs: label as "has knot" with knot_count = config length.
  if (MULTI_KNOT_CONFIGS && MULTI_KNOT_CONFIGS[kind]) {
    const kCount = Array.isArray(MULTI_KNOT_CONFIGS[kind].knots) ? MULTI_KNOT_CONFIGS[kind].knots.length : 2;
    return {
      has_knot: true,
      knot_count: Math.max(1, kCount),
      knot_type: kind,
      tightness_level: 'medium', // multi config has per-knot tightness; keep neutral
      can_be_straightened: true,
    };
  }

  // Prefer template metadata when available (more robust as we add more knot types)
  const tpl = KNOT_TEMPLATES?.[kind];
  const hasKnot = tpl ? ((tpl.crossingNumber || 0) > 0) : (kind !== 'straight' && kind !== 'loose_coil');
  const knotCount = hasKnot ? 1 : 0;

  return {
    has_knot: hasKnot,
    knot_count: knotCount,
    knot_type: kind,
    tightness_level,
    can_be_straightened: true, // always true for open-ended ropes
  };
}

export default {
  generateOpenKnot,
  getOpenKnotLabels,
};

