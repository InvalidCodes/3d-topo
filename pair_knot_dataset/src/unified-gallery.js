/**
 * Unified Gallery & Dataset Generator
 * 
 * 整合早期「画廊渲染」与「数据集生成」逻辑
 * 保持图一的优质渲染效果
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CurveExtras from 'three/addons/curves/CurveExtras.js';
import { computeGaussCodeBestProjection } from './gauss-code-generator.js';
import { generateOpenKnot } from './open-loop-generator.js';
import { generateMultiKnotPath } from './open-loop-multi-knot.js';
import { computeSingleClosedLoopDifficulty, computeSingleOpenLoopDifficulty } from './difficulty-controller.js';

const Curves = CurveExtras.Curves || CurveExtras;

// ============= Seeded RNG =============
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
  const seedFn = xmur3(seedStr || 'seed');
  return mulberry32(seedFn());
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function parsePositiveInt(value, fallback, { min = 1, max = 100000 } = {}) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function parseNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ============= Curve Classes =============

class TorusKnotCurve extends THREE.Curve {
  constructor({ p = 2, q = 3, R = 1.0, r = 0.4 } = {}) {
    super();
    this.p = p; this.q = q; this.R = R; this.r = r;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const phi = t * Math.PI * 2;
    const { p, q, R, r } = this;
    // Use q for winding around tube, p for winding around center
    const radial = R + r * Math.cos(q * phi);
    return optionalTarget.set(
      radial * Math.cos(p * phi),
      radial * Math.sin(p * phi),
      r * Math.sin(q * phi)
    );
  }
}

class CircleCurve extends THREE.Curve {
  constructor({ radius = 1.0, center = new THREE.Vector3(0, 0, 0), normal = new THREE.Vector3(0, 0, 1) } = {}) {
    super();
    this.radius = radius;
    this.center = center.clone();
    this.normal = normal.clone().normalize();
    const tmp = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.u = new THREE.Vector3().crossVectors(this.normal, tmp).normalize();
    this.v = new THREE.Vector3().crossVectors(this.normal, this.u).normalize();
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return optionalTarget
      .copy(this.center)
      .addScaledVector(this.u, this.radius * Math.cos(a))
      .addScaledVector(this.v, this.radius * Math.sin(a));
  }
}

class TwistedRingCurve extends THREE.Curve {
  constructor({ R = 1.0, twist = 3, wobble = 0.22, height = 0.35 } = {}) {
    super();
    this.R = R; this.twist = twist; this.wobble = wobble; this.height = height;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const k = this.twist;
    const rr = this.R * (1 + this.wobble * Math.sin(k * a));
    const z = this.height * Math.cos(k * a);
    return optionalTarget.set(rr * Math.cos(a), rr * Math.sin(a), z);
  }
}

// SpiralLoopCurve - CLOSED spiral loop with physical clearance (no self-intersection for TubeGeometry)
// Design goal: a single closed rope (unknot) that "looks like a spiral" but respects thickness:
// - adjacent turns separated by >= ~2*tubeRadius (radial gap)
// - layers separated by >= ~2*tubeRadius (pitch in Z)
// - connector routed OUTSIDE the spiral envelope (no cutting through)
function minNonNeighborDistanceVec3(points, neighborSkip = 6, { closed = true } = {}) {
  const n = points.length;
  if (n < neighborSkip * 2 + 2) return Infinity;
  let minD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    for (let j = i + 1; j < n; j++) {
      const dj = j - i;
      if (closed) {
        const wrapDj = Math.min(dj, n - dj);
        if (wrapDj <= neighborSkip) continue;
      } else {
        if (dj <= neighborSkip) continue;
      }
      const b = points[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
  }
  return Math.sqrt(minD2);
}

// SpiralLoopCurve - PHYSICAL CLOSED LOOP (No Self-Intersection)
// Strategy: spiral outward/upward, then continue a helical arc that dives BELOW the spiral and comes back to start.
class SpiralLoopCurve extends THREE.Curve {
  constructor({
    turns = 3,
    pitch = 0.2,
    innerRadius = 0.7,
    radialGap = 0.3,
    tubeRadius = 0.24,
  } = {}) {
    super();
    this.turns = Math.max(1, turns);
    this.tubeRadius = Math.max(0.01, tubeRadius);

    // Enforce physical clearance: keep centerline gaps > rope diameter (more conservative)
    const minClearance = this.tubeRadius * 2.8;
    this.radialGap = Math.max(radialGap, minClearance);
    this.pitch = Math.max(pitch, minClearance);
    this.innerRadius = Math.max(innerRadius, this.tubeRadius * 3.5);

    // Spiral end state
    this.endR = this.innerRadius + this.turns * this.radialGap;
    this.endZ = this.turns * this.pitch;
    this.endAngle = this.turns * Math.PI * 2;

    // Return path: add one more turn while diving below z=0
    this.returnEndAngle = this.endAngle + Math.PI * 2; // one extra full turn
    this.returnMidZ = -(this.tubeRadius * 3.5); // dip well below first layer for clearance

    // Phase distribution (forward spiral / return helix)
    this.tForward = 0.65;
    this.tReturn = 0.35;
  }

  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const target = optionalTarget;
    const smooth = (x) => {
      const y = clamp(x, 0, 1);
      return y * y * (3 - 2 * y);
    };

    if (t <= this.tForward) {
      // === PHASE 1: Spiral Outward & Upward ===
      const localT = t / this.tForward;
      const angle = localT * this.turns * Math.PI * 2;
      const r = this.innerRadius + localT * this.turns * this.radialGap;
      const z = localT * this.turns * this.pitch;
      return target.set(r * Math.cos(angle), r * Math.sin(angle), z);
    }

    // === PHASE 2: Helical Arc Return (wrap underneath) ===
    const u = (t - this.tForward) / this.tReturn; // 0..1
    // Two-stage easing: first half descend and start shrinking radius, second half rise to z=0 and finish shrinking
    if (u < 0.5) {
      const k = smooth(u * 2); // 0..1
      const angle = this.endAngle + (this.returnEndAngle - this.endAngle) * 0.5 * k;
      const rStart = this.endR;
      const rMid = (this.endR + this.innerRadius) * 0.5;
      const r = rStart + (rMid - rStart) * k;
      const z = this.endZ + (this.returnMidZ - this.endZ) * k;
      return target.set(r * Math.cos(angle), r * Math.sin(angle), z);
    } else {
      const k = smooth((u - 0.5) * 2); // 0..1
      const angle = this.endAngle + (this.returnEndAngle - this.endAngle) * (0.5 + 0.5 * k);
      const rMid = (this.endR + this.innerRadius) * 0.5;
      const r = rMid + (this.innerRadius - rMid) * k;
      const z = this.returnMidZ + (0 - this.returnMidZ) * k; // rise back to z=0
      return target.set(r * Math.cos(angle), r * Math.sin(angle), z);
    }
  }
}

class PlanarWobbleCircleCurve extends THREE.Curve {
  constructor({ radius = 1.0, center = new THREE.Vector3(0,0,0), normal = new THREE.Vector3(0,0,1), waves = 3, amp = 0.06, phase = 0 } = {}) {
    super();
    this.radius = radius;
    this.center = center.clone();
    this.normal = normal.clone().normalize();
    this.waves = waves; this.amp = amp; this.phase = phase;
    const tmp = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.u = new THREE.Vector3().crossVectors(this.normal, tmp).normalize();
    this.v = new THREE.Vector3().crossVectors(this.normal, this.u).normalize();
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const r = this.radius * (1 + this.amp * Math.sin(this.waves * a + this.phase));
    return optionalTarget
      .copy(this.center)
      .addScaledVector(this.u, r * Math.cos(a))
      .addScaledVector(this.v, r * Math.sin(a));
  }
}

// Kinky Unknot - looks complex but is topologically trivial
class KinkyUnknotCurve extends THREE.Curve {
  constructor({ k = 4, baseRadius = 1.0, kinkAmplitude = 0.25, seed = 12345 } = {}) {
    super();
    this.k = Math.max(2, Math.floor(k));
    this.baseRadius = baseRadius;
    this.kinkAmplitude = kinkAmplitude;
    this.rng = mulberry32(seed);
    // Pre-generate kink parameters
    this.kinks = [];
    for (let i = 0; i < this.k; i++) {
      this.kinks.push({
        phase: this.rng() * Math.PI * 2,
        sigma: 0.06 + this.rng() * 0.04,
        bulgePhase: this.rng() * Math.PI * 2,
      });
    }
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    const r = this.baseRadius;
    let x = r * Math.cos(angle);
    let y = r * Math.sin(angle);
    let z = 0;
    
    for (let i = 0; i < this.k; i++) {
      const kinkCenter = (i + 0.5) / this.k;
      const dist = Math.abs(((t - kinkCenter + 0.5) % 1) - 0.5);
      const envelope = Math.exp(-dist * dist / (this.kinks[i].sigma * this.kinks[i].sigma));
      const bp = this.kinks[i].bulgePhase;
      
      x += this.kinkAmplitude * envelope * Math.sin(angle * 3 + bp) * 0.5;
      y += this.kinkAmplitude * envelope * Math.cos(angle * 2 + bp) * 0.5;
      z += this.kinkAmplitude * 1.2 * envelope * Math.sin(angle * 4 + i + bp);
    }
    
    return optionalTarget.set(x, y, z);
  }
}

// ============= Preset Definitions =============

const PRESETS = {
  // Basic Knots
  unknot: { name: 'Unknot', kind: 'curve', make: () => new CircleCurve({ radius: 1.0 }), difficulty: 'easy', crossings: 0 },
  trefoil: { name: 'Trefoil', kind: 'torus', p: 2, q: 3, R: 1.0, r: 0.4, difficulty: 'easy', crossings: 3 },
  figure8: { name: 'Figure-8', kind: 'curveExtras', extrasName: 'FigureEightPolynomialKnot', fallback: () => new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.35 }), difficulty: 'easy', crossings: 4 },
  
  // Open Loop (open-ended rope)
  open_straight: { name: 'Open Straight Rope', kind: 'openLoop', openType: 'straight', difficulty: 'easy', crossings: 0, isOpen: true },
  open_overhand: { name: 'Open Overhand Knot', kind: 'openLoop', openType: 'overhand', difficulty: 'easy', crossings: 1, isOpen: true },
  open_figure8: { name: 'Open Figure-8 Knot', kind: 'openLoop', openType: 'figure8', difficulty: 'medium', crossings: 2, isOpen: true },
  open_double: { name: 'Open Double Overhand', kind: 'openLoop', openType: 'double_overhand', difficulty: 'hard', crossings: 3, isOpen: true },
  open_loose_loop: { name: 'Open Deceptive Loop', kind: 'openLoop', openType: 'loose_coil', difficulty: 'hard', crossings: 0, isOpen: true, isDeceptive: true },
  open_bowline: { name: 'Open Bowline', kind: 'openLoop', openType: 'bowline', difficulty: 'medium', crossings: 3, isOpen: true },
  open_multi_two_overhands: { name: 'Multi: Two Overhands', kind: 'openLoopMulti', configName: 'double_overhand_real', difficulty: 'hard', crossings: 2, isOpen: true },
  open_multi_mixed: { name: 'Multi: Overhand + Figure-8', kind: 'openLoopMulti', configName: 'mixed_knots', difficulty: 'hard', crossings: 3, isOpen: true },
  open_multi_triple: { name: 'Multi: Three Knots', kind: 'openLoopMulti', configName: 'triple_knots', difficulty: 'hard', crossings: 4, isOpen: true },
  
  // Torus Knots - with slimmer r values
  torus_2_5: { name: 'T(2,5) Cinquefoil', kind: 'torus', p: 2, q: 5, R: 1.0, r: 0.38, difficulty: 'medium', crossings: 5 },
  torus_2_7: { name: 'T(2,7) Septafoil', kind: 'torus', p: 2, q: 7, R: 1.0, r: 0.35, difficulty: 'hard', crossings: 7 },
  torus_2_9: { name: 'T(2,9)', kind: 'torus', p: 2, q: 9, R: 1.0, r: 0.32, difficulty: 'hard', crossings: 9 },
  torus_3_4: { name: 'T(3,4)', kind: 'torus', p: 3, q: 4, R: 1.0, r: 0.35, difficulty: 'hard', crossings: 8 },
  torus_3_5: { name: 'T(3,5)', kind: 'torus', p: 3, q: 5, R: 1.0, r: 0.32, difficulty: 'hard', crossings: 10 },
  torusKnot_random: { name: 'Random Torus', kind: 'torusRandom', difficulty: 'mixed' },
  
  // Unknot Variants
  twisted_ring: { name: 'Twisted Ring', kind: 'curve', make: (rng) => new TwistedRingCurve({ R: 1.0, twist: 2 + Math.floor((rng?.() || 0.5) * 5), wobble: 0.18 + (rng?.() || 0.5) * 0.18, height: 0.3 + (rng?.() || 0.5) * 0.25 }), difficulty: 'easy', crossings: 0, isUnknot: true },
  spiral_disk: { name: 'Spiral Loop', kind: 'spiralLoop', difficulty: 'medium', crossings: 0, isUnknot: true },
  kinky_unknot: { name: 'Kinky Unknot', kind: 'kinky', difficulty: 'hard', crossings: 0, isUnknot: true, isDeceptive: true },
  
  // Links
  hopf_link: { name: 'Hopf Link', kind: 'hopfReal', difficulty: 'easy', isLink: true },
  unlinked_rings: { name: 'Unlinked Rings', kind: 'hopfUnlinked', difficulty: 'easy', isLink: true },
  chain: { name: 'Chain', kind: 'chain', difficulty: 'medium', isLink: true },
  borromean: { name: 'Borromean Rings', kind: 'borromean', difficulty: 'hard', isLink: true },
  
  // Benchmark
  benchmark_easy: { name: 'Benchmark Easy', kind: 'benchmark', level: 0 },
  benchmark_medium: { name: 'Benchmark Medium', kind: 'benchmark', level: 1 },
  benchmark_hard: { name: 'Benchmark Hard', kind: 'benchmark', level: 2 },
  benchmark_mix: { name: 'Benchmark Mix', kind: 'benchmarkMix' },
  
  // All
  all: { name: 'All Types', kind: 'all' },
};

// ============= Geometry Builders =============

function tubeQualityParams(q) {
  if (q === 'high') return { tubularSegments: 280, radialSegments: 18 };
  if (q === 'mid') return { tubularSegments: 200, radialSegments: 14 };
  return { tubularSegments: 120, radialSegments: 10 };
}

function mergeBufferGeometries(geoms) {
  const valid = geoms.filter(Boolean);
  if (!valid.length) return null;
  const out = new THREE.BufferGeometry();
  const attrs = Object.keys(valid[0].attributes);
  for (const a of attrs) {
    const arrays = valid.map(g => g.attributes[a].array);
    const itemSize = valid[0].attributes[a].itemSize;
    const totalLen = arrays.reduce((s, arr) => s + arr.length, 0);
    const merged = new arrays[0].constructor(totalLen);
    let off = 0;
    for (const arr of arrays) { merged.set(arr, off); off += arr.length; }
    out.setAttribute(a, new THREE.BufferAttribute(merged, itemSize));
  }
  const hasIndex = valid.every(g => g.index?.array);
  if (hasIndex) {
    const indexArrays = valid.map(g => g.index.array);
    const total = indexArrays.reduce((s, arr) => s + arr.length, 0);
    const mergedIndex = new indexArrays[0].constructor(total);
    let vertexOffset = 0, off = 0;
    for (let gi = 0; gi < valid.length; gi++) {
      const g = valid[gi], idx = g.index.array;
      for (let j = 0; j < idx.length; j++) mergedIndex[off + j] = idx[j] + vertexOffset;
      off += idx.length;
      vertexOffset += g.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
  }
  out.computeVertexNormals();
  return out;
}

function estimateAndNormalizeTube({ makeCurve, closed = true, quality = 'mid', radius = 0.24, targetOuterRadius = 1.25 }) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const curve = makeCurve();
  const thin = new THREE.TubeGeometry(curve, tubularSegments, 0.01, radialSegments, closed);
  thin.computeBoundingSphere();
  const sNorm = thin.boundingSphere?.radius > 1e-6 ? (targetOuterRadius / thin.boundingSphere.radius) : 1.0;
  thin.dispose();
  const baseRadius = radius / sNorm;
  const geom = new THREE.TubeGeometry(curve, tubularSegments, baseRadius, radialSegments, closed);
  geom.scale(sNorm, sNorm, sNorm);
  geom.computeVertexNormals();
  geom.center();
  geom.computeBoundingSphere();
  return geom;
}

// Build Hopf Link (两环相扣)
function buildRealHopfLinkGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const ampA = rng ? 0.04 + rng() * 0.08 : 0.06;
  const ampB = rng ? 0.04 + rng() * 0.08 : 0.06;
  const wavesA = rng ? 2 + Math.floor(rng() * 4) : 3;
  const wavesB = rng ? 2 + Math.floor(rng() * 4) : 3;
  const phaseA = rng ? rng() * Math.PI * 2 : 0;
  const phaseB = rng ? rng() * Math.PI * 2 : 0;

  const R = 1.5;
  const tubeRadius = radius * 0.9;

  const curveA = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: wavesA, amp: ampA, phase: phaseA });
  const curveB = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, -2, 0), normal: new THREE.Vector3(1, 0, 0), waves: wavesB, amp: ampB, phase: phaseB });

  const a = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, radialSegments, true);
  const b = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, radialSegments, true);

  // Colors
  const colorsA = new Float32Array(a.attributes.position.count * 3);
  for (let i = 0; i < a.attributes.position.count; i++) { colorsA[i*3] = 1.0; colorsA[i*3+1] = 0.85; colorsA[i*3+2] = 0.85; }
  a.setAttribute('color', new THREE.BufferAttribute(colorsA, 3));

  const colorsB = new Float32Array(b.attributes.position.count * 3);
  for (let i = 0; i < b.attributes.position.count; i++) { colorsB[i*3] = 0.85; colorsB[i*3+1] = 0.9; colorsB[i*3+2] = 1.0; }
  b.setAttribute('color', new THREE.BufferAttribute(colorsB, 3));

  const merged = mergeBufferGeometries([a, b]);
  a.dispose(); b.dispose();
  merged.center();
  merged.computeBoundingSphere();
  const scale = 1.35 / (merged.boundingSphere.radius || 1);
  merged.scale(scale, scale, scale);
  merged.computeBoundingSphere();
  return merged;
}

// Build Unlinked Rings
function buildUnlinkedRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const ampA = rng ? 0.08 + rng() * 0.1 : 0.1;
  const ampB = rng ? 0.08 + rng() * 0.1 : 0.1;
  const R = 1.0;

  const curveA = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: 3, amp: ampA });
  const offsetX = rng ? 2.2 + rng() * 0.5 : 2.5;
  const curveB = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(offsetX, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: 3, amp: ampB });

  const tubeRadius = radius * 0.8;
  const a = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, radialSegments, true);
  const b = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, radialSegments, true);

  const colorsA = new Float32Array(a.attributes.position.count * 3);
  for (let i = 0; i < a.attributes.position.count; i++) { colorsA[i*3] = 1.0; colorsA[i*3+1] = 0.95; colorsA[i*3+2] = 0.95; }
  a.setAttribute('color', new THREE.BufferAttribute(colorsA, 3));

  const colorsB = new Float32Array(b.attributes.position.count * 3);
  for (let i = 0; i < b.attributes.position.count; i++) { colorsB[i*3] = 0.9; colorsB[i*3+1] = 0.85; colorsB[i*3+2] = 0.85; }
  b.setAttribute('color', new THREE.BufferAttribute(colorsB, 3));

  const merged = mergeBufferGeometries([a, b]);
  a.dispose(); b.dispose();
  merged.center();
  merged.computeBoundingSphere();
  const scale = 1.35 / (merged.boundingSphere.radius || 1);
  merged.scale(scale, scale, scale);
  return merged;
}

// Build Chain
function randomIntInclusive(rng, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor((rng ? rng() : Math.random()) * (hi - lo + 1));
}
function randomChoice(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor((rng ? rng() : Math.random()) * arr.length))];
}
function shuffleInPlace(arr, rng) {
  const r = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function randomSplitTotal(total, { minPart = 2, maxPart = 4, maxParts = 4 } = {}, rng) {
  const r = rng || Math.random;
  const T = Math.max(1, Math.floor(total));
  const minP = Math.max(1, Math.floor(minPart));
  const maxP = Math.max(minP, Math.floor(maxPart));
  const maxK = Math.max(1, Math.floor(maxParts));

  // Decide number of parts (at least 1; prefer 2+ when possible)
  const maxPossibleParts = Math.min(maxK, Math.max(1, Math.floor(T / minP)));
  const k = T >= minP * 2 ? randomIntInclusive(r, 2, maxPossibleParts) : 1;

  const parts = [];
  let remaining = T;
  for (let i = 0; i < k; i++) {
    const partsLeft = k - i - 1;
    const minRemainForRest = partsLeft * minP;
    const maxThis = Math.min(maxP, remaining - minRemainForRest);
    const minThis = Math.max(1, Math.min(minP, maxThis));
    const size = i === k - 1 ? remaining : (minThis + Math.floor(r() * (maxThis - minThis + 1)));
    parts.push(size);
    remaining -= size;
  }

  // If we were forced into 1 part, still return a single segment
  if (parts.reduce((s, x) => s + x, 0) !== T) return [T];
  return parts;
}

function generateDiverseChainLayout({
  rng,
  numLinks,
  R,
  tubeRadius,
  effectiveStep,
  linkOffsetY,
} = {}) {
  const r = rng || Math.random;
  const n = Math.max(2, Math.floor(numLinks || 4));

  // === 1) Random split into segments ===
  const parts = randomSplitTotal(n, { minPart: 2, maxPart: 4, maxParts: 4 }, r);
  const segments = [];
  let cursor = 0;
  for (const sz of parts) {
    const nodes = [];
    for (let i = 0; i < sz; i++) nodes.push(cursor++);
    segments.push({ nodes, size: sz });
  }

  // === 2) Segment internal pattern (graph) ===
  const allEdges = [];
  const addEdge = (a, b) => {
    if (a === b) return;
    const x = Math.min(a, b), y = Math.max(a, b);
    allEdges.push([x, y]);
  };

  for (const seg of segments) {
    const nodes = seg.nodes.slice();
    shuffleInPlace(nodes, r);
    const sz = nodes.length;
    const pattern = randomChoice(r, ['linear', 'linear', 'branch', 'loop_back']); // weight linear a bit
    seg.pattern = pattern;

    if (pattern === 'loop_back' && sz >= 3) {
      // cycle
      for (let i = 0; i < sz; i++) addEdge(nodes[i], nodes[(i + 1) % sz]);
    } else if (pattern === 'branch' && sz >= 4) {
      // small Y/tree inside segment
      const hub = nodes[0];
      addEdge(hub, nodes[1]);
      addEdge(hub, nodes[2]);
      // chain the rest off one branch to keep graph sane
      let prev = nodes[1];
      for (let i = 3; i < sz; i++) { addEdge(prev, nodes[i]); prev = nodes[i]; }
    } else {
      // linear
      for (let i = 0; i < sz - 1; i++) addEdge(nodes[i], nodes[i + 1]);
    }
  }

  // === 3) Connect segments with diverse topology ===
  if (segments.length > 1) {
    const topology = randomChoice(r, ['sequential', 'tree', 'random_graph', 'has_cycle']);
    const segCount = segments.length;

    const pickNodeFromSeg = (si) => {
      const nodes = segments[si].nodes;
      return nodes[Math.floor(r() * nodes.length)];
    };

    // Build a spanning tree over segments first (ensures connectivity)
    const parents = new Array(segCount).fill(-1);
    for (let i = 1; i < segCount; i++) {
      const p = topology === 'sequential' ? (i - 1) : Math.floor(r() * i);
      parents[i] = p;
      addEdge(pickNodeFromSeg(i), pickNodeFromSeg(p));
    }

    // Add extra inter-segment connections (1..3)
    const extra = randomIntInclusive(r, 1, Math.min(3, segCount));
    const addRandomInterEdge = () => {
      let a = Math.floor(r() * segCount);
      let b = Math.floor(r() * segCount);
      if (a === b) b = (b + 1) % segCount;
      addEdge(pickNodeFromSeg(a), pickNodeFromSeg(b));
    };

    if (topology === 'random_graph') {
      for (let i = 0; i < extra; i++) addRandomInterEdge();
    } else if (topology === 'has_cycle') {
      // ensure at least one cycle
      addRandomInterEdge();
      if (r() < 0.6) for (let i = 0; i < extra; i++) addRandomInterEdge();
    } else if (topology === 'tree') {
      // tree: maybe add 0-1 extra for mild redundancy
      if (r() < 0.35) addRandomInterEdge();
    }
  }

  // Dedup edges
  const dedup = new Map();
  for (const [a, b] of allEdges) dedup.set(`${a},${b}`, [a, b]);
  const edges = Array.from(dedup.values());

  // === 4) Embed graph into 3D: assign center + normal per ring ===
  const centers = Array.from({ length: n }, () => new THREE.Vector3());
  const normals = Array.from({ length: n }, () => new THREE.Vector3(0, 0, 1));
  const placed = new Array(n).fill(false);
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }

  const basisAxes = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const pickPerpAxis = (nrm) => {
    const nn = nrm.clone().normalize();
    const candidates = basisAxes
      .map(a => ({ a, d: Math.abs(a.dot(nn)) }))
      .sort((p, q) => p.d - q.d)
      .filter(p => p.d < 0.35);
    return (candidates.length ? randomChoice(r, candidates).a : randomChoice(r, basisAxes)).clone().normalize();
  };

  const linkSepBase = Math.max(0.9 * R, Math.abs(effectiveStep) || (1.2 * R));
  const jitter = 0.18 * R;
  const zJitter = 0.12 * R;
  const offsetMag = Math.max(0.0, Math.min(2.5 * R, Math.abs(linkOffsetY))) * 0.15;

  // Root
  centers[0].set(0, 0, 0);
  normals[0].copy(new THREE.Vector3(0, 0, 1));
  placed[0] = true;

  const queue = [0];
  while (queue.length) {
    const u = queue.shift();
    const nu = normals[u].clone().normalize();
    for (const v of adj[u]) {
      if (placed[v]) continue;

      const nv = pickPerpAxis(nu);
      let t = new THREE.Vector3().crossVectors(nu, nv);
      if (t.lengthSq() < 1e-6) t = pickPerpAxis(nu).cross(nu);
      t.normalize();

      // Main placement along t, with small extra offsets so it doesn't look like a straight chain
      const sep = linkSepBase * (0.85 + 0.35 * r());
      const c = centers[u].clone()
        .addScaledVector(t, sep)
        .addScaledVector(nu, (r() - 0.5) * zJitter)
        .addScaledVector(nv, (r() - 0.5) * zJitter);

      // Borrow UI "linkOffsetY" as a subtle extra offset along nu to preserve intuitive control
      c.addScaledVector(nu, (r() - 0.5) * offsetMag);

      centers[v].copy(c);
      normals[v].copy(nv);
      placed[v] = true;
      queue.push(v);
    }
  }

  // Any isolated nodes (shouldn't happen, but be safe)
  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    centers[i].set((r() - 0.5) * 2.0, (r() - 0.5) * 2.0, (r() - 0.5) * 2.0);
    normals[i].copy(pickPerpAxis(new THREE.Vector3(0, 0, 1)));
  }

  // === 5) Repulsion pass to reduce ugly overlaps ===
  const minCenterDist = Math.max(0.85 * R, R + tubeRadius * 2.2);
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = centers[i].clone().sub(centers[j]);
        const dist = d.length();
        if (dist < 1e-6) {
          centers[i].x += (r() - 0.5) * 0.01;
          centers[j].y += (r() - 0.5) * 0.01;
          continue;
        }
        const target = minCenterDist * (0.95 + 0.25 * r());
        if (dist < target) {
          const push = (target - dist) / target;
          d.multiplyScalar((push * 0.55));
          centers[i].add(d);
          centers[j].sub(d);
        }
      }
    }
  }

  // Add final gentle jitter so different segments don't look grid-aligned
  for (let i = 0; i < n; i++) {
    centers[i].add(new THREE.Vector3((r() - 0.5) * jitter, (r() - 0.5) * jitter, (r() - 0.5) * jitter));
  }

  return { centers, normals };
}

function buildChainGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  const parseVal = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };
  const parseIntVal = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseInt(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  const R = parseVal('chainR', 1.5);
  const numLinks = parseIntVal('chainNumLinks', rng ? 3 + Math.floor(rng() * 4) : 4);
  const linkOffsetY = parseVal('chainOffsetY', -2.0);
  const chainStep = parseVal('chainSpacing', 0) * R;
  const effectiveStep = Math.abs(chainStep) < 0.01 ? Math.abs(linkOffsetY) : chainStep;

  const tubeRadius = radius * 0.9;
  const geoms = [];

  const { centers, normals } = generateDiverseChainLayout({
    rng,
    numLinks,
    R,
    tubeRadius,
    effectiveStep,
    linkOffsetY,
  });

  for (let i = 0; i < numLinks; i++) {
    const center = centers[i];
    const normal = normals[i];

    // Per-ring variation
    const ringR = rng ? (R * (0.92 + rng() * 0.16)) : R;
    const amp = rng ? 0.035 + rng() * 0.06 : 0.05;
    const waves = rng ? 2 + Math.floor(rng() * 5) : 3;
    const phase = rng ? rng() * Math.PI * 2 : 0;

    const curve = new PlanarWobbleCircleCurve({ radius: ringR, center, normal, waves, amp, phase });
    const g = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);

    const colors = new Float32Array(g.attributes.position.count * 3);
    const hue = (i / Math.max(1, numLinks)) * 0.85;
    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
    for (let j = 0; j < g.attributes.position.count; j++) {
      colors[j * 3] = color.r; colors[j * 3 + 1] = color.g; colors[j * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  const merged = mergeBufferGeometries(geoms);
  geoms.forEach(g => g.dispose());
  merged.center();
  merged.computeBoundingSphere();
  const scale = 1.8 / (merged.boundingSphere.radius || 1);
  merged.scale(scale, scale, scale);
  return merged;
}

// Build Borromean Rings
function buildBorromeanRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  const parseVal = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  const R = parseVal('borromeanR', 1.5);
  const ratio = parseVal('borromeanRatio', 1.6);
  const yellowY = parseVal('borromeanYellowY', 0);
  const blueY = parseVal('borromeanBlueY', 0);

  const tubeRadius = radius * 0.85;
  const a = R * ratio, b = R;

  const ringColors = [
    new THREE.Color(0.95, 0.25, 0.25),
    new THREE.Color(0.95, 0.85, 0.15),
    new THREE.Color(0.25, 0.45, 0.95),
  ];

  class EllipseCurve3D extends THREE.Curve {
    constructor({ a, b, center, xAxis, yAxis }) {
      super();
      this.a = a; this.b = b;
      this.center = center;
      this.xAxis = xAxis.clone().normalize();
      this.yAxis = yAxis.clone().normalize();
    }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const angle = t * Math.PI * 2;
      return optionalTarget.set(0, 0, 0)
        .addScaledVector(this.center, 1)
        .addScaledVector(this.xAxis, this.a * Math.cos(angle))
        .addScaledVector(this.yAxis, this.b * Math.sin(angle));
    }
  }

  const configs = [
    { center: new THREE.Vector3(0, 0, 0), xAxis: new THREE.Vector3(1, 0, 0), yAxis: new THREE.Vector3(0, 1, 0) },
    { center: new THREE.Vector3(0, yellowY, 0), xAxis: new THREE.Vector3(0, 1, 0), yAxis: new THREE.Vector3(0, 0, 1) },
    { center: new THREE.Vector3(0, blueY, 0), xAxis: new THREE.Vector3(1, 0, 0), yAxis: new THREE.Vector3(0, 0, 1) },
  ];

  const geoms = [];
  for (let i = 0; i < 3; i++) {
    const curve = new EllipseCurve3D({ a, b, ...configs[i] });
    const g = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const c = ringColors[i];
    for (let j = 0; j < g.attributes.position.count; j++) {
      colors[j*3] = c.r; colors[j*3+1] = c.g; colors[j*3+2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  const merged = mergeBufferGeometries(geoms);
  geoms.forEach(g => g.dispose());
  merged.center();
  merged.computeBoundingSphere();
  const scale = 1.8 / (merged.boundingSphere.radius || 1);
  merged.scale(scale, scale, scale);
  return merged;
}

// Build Kinky Unknot
function buildKinkyUnknotGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  const parseVal = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };
  const parseIntVal = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const v = parseInt(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  // Add randomness for diversity
  const baseK = parseIntVal('kinkCount', 4);
  const baseAmp = parseVal('kinkAmplitude', 0.25);
  
  // Random variation
  const k = rng ? Math.max(2, baseK + Math.floor((rng() - 0.5) * 4)) : baseK;
  const kinkAmp = rng ? baseAmp * (0.7 + rng() * 0.6) : baseAmp;
  const seed = rng ? Math.floor(rng() * 100000) : 12345;

  const curve = new KinkyUnknotCurve({ k, baseRadius: 1.0, kinkAmplitude: kinkAmp, seed });
  const geom = new THREE.TubeGeometry(curve, Math.floor(tubularSegments * 1.5), radius, radialSegments, true);
  geom.computeVertexNormals();
  geom.center();
  geom.computeBoundingSphere();
  const scale = 1.35 / (geom.boundingSphere.radius || 1);
  geom.scale(scale, scale, scale);
  
  // Apply random rotation for diversity
  if (rng) {
    const rx = rng() * Math.PI * 2;
    const ry = rng() * Math.PI * 2;
    const rz = rng() * Math.PI * 2;
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
    geom.applyMatrix4(rotMatrix);
  }
  
  return geom;
}

// ============= Main Build Function =============

// Deform geometry along normals for more visual diversity
function deformAlongNormal(geometry, { amp = 0.02, freq = 3.0, phase = 0.0 }) {
  geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normal, i).normalize();
    const s = Math.sin(freq * (v.x + v.y + v.z) + phase);
    v.addScaledVector(n, amp * s);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// Apply random transform to geometry
function applyRandomTransform(geometry, rng) {
  // Random rotation
  const rx = rng() * Math.PI * 2;
  const ry = rng() * Math.PI * 2;
  const rz = rng() * Math.PI * 2;
  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  geometry.applyMatrix4(rotMatrix);
  
  // Random anisotropic scale (subtle)
  const sx = 0.85 + rng() * 0.3;
  const sy = 0.85 + rng() * 0.3;
  const sz = 0.85 + rng() * 0.3;
  geometry.scale(sx, sy, sz);
  
  geometry.computeVertexNormals();
  geometry.center();
}

// Apply random rotation only (no anisotropic scale) - better for "physical rope" look
function applyRandomRotation(geometry, rng) {
  const rx = rng() * Math.PI * 2;
  const ry = rng() * Math.PI * 2;
  const rz = rng() * Math.PI * 2;
  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  geometry.applyMatrix4(rotMatrix);
  geometry.computeVertexNormals();
  geometry.center();
}

function adaptiveOpenLoopTubeRadius({ knotType, tightness, fallbackRadius }) {
  const t = clamp(Number(tightness ?? 0.6), 0, 1);
  const knotComplexity = {
    straight: 1,
    loose_coil: 1,
    overhand: 2,
    figure8: 3,
    bowline: 3,
    double_overhand: 4,
    slip_knot: 3,
    square_knot: 4,
    clove_hitch: 3,
    stevedore: 4,
    sheet_bend: 3,
    fishermans: 4,
    figure9: 3,
    double_fishermans: 4,
    constrictor: 4,
    monkeys_fist_simplified: 4,
  };
  const complexity = knotComplexity[String(knotType || 'overhand')] || 2;
  const complexity01 = clamp((complexity - 1) / 4, 0, 1);
  const baseTubeRadius = THREE.MathUtils.lerp(0.035, 0.020, complexity01);
  const tightnessFactor = THREE.MathUtils.lerp(0.6, 1.0, t);
  const adaptive = baseTubeRadius * tightnessFactor;
  const fb = Number.isFinite(fallbackRadius) ? fallbackRadius : adaptive;
  // Honor user-chosen smaller radius; otherwise use adaptive (thin) radius.
  return Math.min(fb, adaptive);
}

function buildGeometryForPreset(presetId, { rng, quality = 'mid', radius = 0.24, applyDeform = true } = {}) {
  const p = PRESETS[presetId];
  if (!p || p.kind === 'all') return null;

  // Reduce tube radius for better aesthetics
  const tubeRadius = radius * 0.85;

  if (p.kind === 'hopfReal') {
    const geom = buildRealHopfLinkGeometry({ rng, quality, radius: tubeRadius });
    if (applyDeform && rng) applyRandomTransform(geom, rng);
    return geom;
  }
  if (p.kind === 'hopfUnlinked') {
    const geom = buildUnlinkedRingsGeometry({ rng, quality, radius: tubeRadius });
    if (applyDeform && rng) applyRandomTransform(geom, rng);
    return geom;
  }
  if (p.kind === 'chain') {
    const geom = buildChainGeometry({ rng, quality, radius: tubeRadius });
    if (applyDeform && rng) applyRandomTransform(geom, rng);
    return geom;
  }
  if (p.kind === 'borromean') {
    const geom = buildBorromeanRingsGeometry({ rng, quality, radius: tubeRadius });
    if (applyDeform && rng) applyRandomTransform(geom, rng);
    return geom;
  }
  if (p.kind === 'kinky') {
    return buildKinkyUnknotGeometry({ rng, quality, radius: tubeRadius });
  }

  if (p.kind === 'openLoop') {
    const parseUI = (id, fallback) => {
      const el = document.getElementById(id);
      if (!el) return fallback;
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : fallback;
    };
    const baseTightness = clamp(parseUI('openTightness', 0.6), 0, 1);
    const tightness = rng ? clamp(baseTightness + (rng() - 0.5) * 0.06, 0, 1) : baseTightness;
    const openSeed = rng ? `${presetId}|${Math.floor(rng() * 1e9)}` : `${presetId}|${Math.random()}`;

    const openTubeRadius = adaptiveOpenLoopTubeRadius({ knotType: p.openType, tightness, fallbackRadius: tubeRadius });

    const makeCurve = () => {
      const pts = generateOpenKnot(p.openType || 'straight', tightness, openSeed, { tubeRadius: openTubeRadius });
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };

    // Open ropes tend to be longer; use a slightly larger target radius.
    const geom = estimateAndNormalizeTube({ makeCurve, closed: false, quality, radius: tubeRadius, targetOuterRadius: 1.55 });
    // Physical-style: no anisotropic scaling / no normal deformation. Only rotate.
    if (rng) applyRandomRotation(geom, rng);
    return geom;
  }

  if (p.kind === 'openLoopMulti') {
    const makeCurve = () => {
      // Multi configs have per-knot tightness; use fallback radius only.
      const openTubeRadius = adaptiveOpenLoopTubeRadius({ knotType: 'double_overhand', tightness: 0.7, fallbackRadius: tubeRadius });
      const pts = generateMultiKnotPath(
        p.configName,
        rng ? `${presetId}|${Math.floor(rng() * 1e9)}` : `${presetId}|seed`,
        { tubeRadius: openTubeRadius }
      );
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };
    const geom = estimateAndNormalizeTube({ makeCurve, closed: false, quality, radius: tubeRadius, targetOuterRadius: 1.65 });
    if (rng) applyRandomRotation(geom, rng);
    return geom;
  }

  if (p.kind === 'torus') {
    // Use preset's r value or calculate based on q for slimmer knots
    const torusR = p.R || 1.0;
    const torusMinorR = p.r || Math.max(0.25, 0.45 - p.q * 0.02);
    const makeCurve = () => new TorusKnotCurve({ p: p.p, q: p.q, R: torusR, r: torusMinorR });
    const geom = estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius: tubeRadius, targetOuterRadius: 1.35 });
    if (applyDeform && rng) {
      applyRandomTransform(geom, rng);
      if (rng() > 0.3) {
        deformAlongNormal(geom, { amp: tubeRadius * 0.15 * rng(), freq: 2 + rng() * 4, phase: rng() * Math.PI * 2 });
      }
    }
    return geom;
  }

  if (p.kind === 'torusRandom') {
    let pp, qq;
    do {
      pp = 2 + Math.floor((rng?.() || Math.random()) * 4);
      qq = 3 + Math.floor((rng?.() || Math.random()) * 8);
    } while (gcd(pp, qq) !== 1 || pp >= qq);
    const torusMinorR = Math.max(0.25, 0.45 - qq * 0.015);
    const makeCurve = () => new TorusKnotCurve({ p: pp, q: qq, R: 1.0, r: torusMinorR });
    const geom = estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius: tubeRadius, targetOuterRadius: 1.35 });
    if (applyDeform && rng) {
      applyRandomTransform(geom, rng);
      if (rng() > 0.3) {
        deformAlongNormal(geom, { amp: tubeRadius * 0.15 * rng(), freq: 2 + rng() * 4, phase: rng() * Math.PI * 2 });
      }
    }
    return geom;
  }

  if (p.kind === 'curveExtras') {
    const hasCurve = Curves && typeof Curves[p.extrasName] === 'function';
    const makeCurve = hasCurve ? () => new Curves[p.extrasName]() : p.fallback;
    const geom = estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius: tubeRadius, targetOuterRadius: 1.35 });
    if (applyDeform && rng) {
      applyRandomTransform(geom, rng);
    }
    return geom;
  }

  if (p.kind === 'curve') {
    const makeCurve = () => p.make(rng);
    const geom = estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius: tubeRadius, targetOuterRadius: 1.35 });
    if (applyDeform && rng) {
      applyRandomTransform(geom, rng);
    }
    return geom;
  }

  if (p.kind === 'spiralLoop') {
    // Read UI values if available, or use random values
    const parseUI = (id, fallback) => {
      const el = document.getElementById(id);
      if (el) {
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? v : fallback;
      }
      return fallback;
    };
    const parseUIInt = (id, fallback) => {
      const el = document.getElementById(id);
      if (el) {
        const v = parseInt(el.value);
        return Number.isFinite(v) ? v : fallback;
      }
      return fallback;
    };
    
    const baseTurns = parseUIInt('spiralTurns', 3);
    const basePitch = parseUI('spiralPitch', 0.15);
    const baseGap = parseUI('spiralGap', 0.25);
    const baseComplexity = parseUIInt('spiralConnector', 1);
    
    // Add some variation if rng available
    const turns = rng ? Math.max(1, baseTurns + Math.floor((rng() - 0.5) * 2)) : baseTurns;
    const pitch = rng ? basePitch * (0.7 + rng() * 0.6) : basePitch;
    const radialGap = rng ? baseGap * (0.7 + rng() * 0.6) : baseGap;

    // Physical rope: enforce minimum clearance based on tubeRadius
    const makeCurve = () => new SpiralLoopCurve({
      turns,
      pitch,
      radialGap,
      tubeRadius,
    });

    // For Spiral Loop, we do NOT scale or deform it after creation, as it ruins the physical gap.
    const { tubularSegments, radialSegments } = tubeQualityParams(quality);
    const curve = makeCurve();
    // Use high tubular segments to make the piecewise parametric centerline look smooth
    const geom = new THREE.TubeGeometry(curve, Math.max(280, tubularSegments), tubeRadius, radialSegments, true);
    geom.center();
    return geom;
  }

  if (p.kind === 'benchmark') {
    const level = p.level;
    const easyPresets = ['unknot', 'trefoil', 'figure8'];
    const mediumPresets = ['torus_2_5', 'twisted_ring', 'spiral_disk'];
    const hardPresets = ['torus_2_7', 'torus_2_9', 'kinky_unknot', 'torus_3_4', 'torus_3_5'];
    
    let pool;
    if (level === 0) pool = easyPresets;
    else if (level === 1) pool = mediumPresets;
    else pool = hardPresets;
    
    const chosenId = pick(rng || Math.random, pool);
    return buildGeometryForPreset(chosenId, { rng, quality, radius, applyDeform });
  }

  if (p.kind === 'benchmarkMix') {
    const easyPct = parseNumber(document.getElementById('easyPct')?.value, 33, { min: 0, max: 100 });
    const mediumPct = parseNumber(document.getElementById('mediumPct')?.value, 34, { min: 0, max: 100 });
    const total = easyPct + mediumPct + 100 - easyPct - mediumPct;
    const r = (rng?.() || Math.random()) * total;
    
    let level;
    if (r < easyPct) level = 0;
    else if (r < easyPct + mediumPct) level = 1;
    else level = 2;
    
    return buildGeometryForPreset(level === 0 ? 'benchmark_easy' : (level === 1 ? 'benchmark_medium' : 'benchmark_hard'), { rng, quality, radius, applyDeform });
  }

  // Fallback
  return estimateAndNormalizeTube({ makeCurve: () => new CircleCurve({ radius: 1.0 }), closed: true, quality, radius: tubeRadius, targetOuterRadius: 1.35 });
}

// ============= Three.js Scene =============

const viewEl = document.getElementById('view');
const statusEl = document.getElementById('status');

let scene, camera, renderer, controls;
let root = new THREE.Group();
let current = { meshes: [], geometries: [] };

function setStatus({ title, three, presetName, count }) {
  statusEl.innerHTML = `
    <div><b>状态</b>：${title || '-'}</div>
    <div><b>Three</b>：${three || '-'}</div>
    <div><b>预设</b>：${presetName || '-'}</div>
    <div><b>实例</b>：${typeof count === 'number' ? count : '-'}</div>
  `;
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2236);

  const w = viewEl.clientWidth;
  const h = viewEl.clientHeight;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 500);
  camera.position.set(0, 3.2, 6.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  viewEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0, 0);

  // Enhanced lighting (from simple gallery)
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemi);
  
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(10, 18, 10);
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(-10, 5, -10);
  scene.add(fill);

  const grid = new THREE.GridHelper(120, 60, 0x2a335a, 0x1a2040);
  grid.position.y = -1.2;
  scene.add(grid);

  scene.add(root);

  window.addEventListener('resize', () => {
    const ww = viewEl.clientWidth;
    const hh = viewEl.clientHeight;
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
    renderer.setSize(ww, hh);
  });

  setStatus({ title: '已初始化', three: `${THREE.REVISION}`, presetName: '-', count: 0 });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function disposeCurrent() {
  for (const m of current.meshes) {
    root.remove(m);
    if (m.material) m.material.dispose();
  }
  for (const g of current.geometries) g.dispose();
  current = { meshes: [], geometries: [] };
}

function randomBright(rng) {
  const h = rng();
  const s = 0.72 + 0.22 * rng();
  const l = 0.62 + 0.18 * rng();
  return new THREE.Color().setHSL(h, s, l);
}

function placeMatrix(m, x, y, z, rx, ry, rz, s) {
  const pos = new THREE.Vector3(x, y, z);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const scl = new THREE.Vector3(s, s, s);
  m.compose(pos, quat, scl);
}

function computeSpacingFromGeometry({ geometry, layout, globalScale }) {
  geometry.computeBoundingSphere();
  const r = (geometry.boundingSphere?.radius || 1) * globalScale;
  const maxR = r * 1.25;
  const minGrid = layout === 'field' ? 10.0 : 7.0;
  const base = 2 * maxR * 1.55 + 2.0;
  const baseSpacing = Math.max(minGrid, base);
  const jitter = layout === 'jitter' ? baseSpacing * 0.22 : (layout === 'field' ? baseSpacing * 0.55 : 0.0);
  return { baseSpacing, jitter };
}

function layoutPosition({ i, count, cols, rng, baseSpacing, jitter }) {
  const colsEff = Math.max(1, Math.min(cols, count));
  const row = Math.floor(i / colsEff);
  const col = i % colsEff;
  const rowsEff = Math.ceil(count / colsEff);
  const x = (col - (colsEff - 1) * 0.5) * baseSpacing + (rng() - 0.5) * jitter;
  const z = (row - (rowsEff - 1) * 0.5) * baseSpacing + (rng() - 0.5) * jitter;
  return { x, z };
}

function buildInstancedMesh(geometry, { count, cols, rng, layout, globalScale, instanceOffset = 0, totalCount = 0, spacing }) {
  if (!geometry.attributes.color) {
    const colors = new Float32Array(geometry.attributes.position.count * 3).fill(1.0);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.15,
    vertexColors: true,
    emissive: new THREE.Color(0x111111),
    emissiveIntensity: 0.2,
  });
  
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

  const m = new THREE.Matrix4();
  const tmpColor = new THREE.Color();
  const finalTotal = totalCount || count;
  const { baseSpacing, jitter } = spacing || computeSpacingFromGeometry({ geometry, layout, globalScale });

  for (let i = 0; i < count; i++) {
    const globalIdx = instanceOffset + i;
    const { x, z } = finalTotal === 1 ? { x: 0, z: 0 } : layoutPosition({ i: globalIdx, count: finalTotal, cols, rng, baseSpacing, jitter });
    
    const rx = rng() * Math.PI * 2;
    const ry = rng() * Math.PI * 2;
    const rz = rng() * Math.PI * 2;
    const s = globalScale * (0.8 + rng() * 0.4);
    
    placeMatrix(m, x, 0, z, rx, ry, rz, s);
    mesh.setMatrixAt(i, m);
    tmpColor.copy(randomBright(rng));
    mesh.setColorAt(i, tmpColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function fitCameraToContent({ geometry, count, cols, layout, globalScale, spacing }) {
  const colsEff = Math.max(1, Math.min(cols, count));
  const rowsEff = Math.max(1, Math.ceil(count / colsEff));
  const { baseSpacing } = spacing || computeSpacingFromGeometry({ geometry, layout, globalScale });

  geometry.computeBoundingSphere();
  const rObj = (geometry.boundingSphere?.radius || 1) * globalScale * 1.05;
  const w = (colsEff - 1) * baseSpacing + 2 * rObj;
  const d = (rowsEff - 1) * baseSpacing + 2 * rObj;
  const rScene = 0.5 * Math.sqrt(w * w + d * d);

  const fov = (camera.fov * Math.PI) / 180;
  const dist = (rScene / Math.tan(fov / 2)) * 1.08;

  controls.target.set(0, 0, 0);
  camera.position.set(0, Math.max(1.8, rScene * 0.65), dist);
  camera.near = Math.max(0.01, dist / 200);
  camera.far = dist * 50;
  camera.updateProjectionMatrix();
  controls.update();
}

function regenerate() {
  const seedStr = document.getElementById('seed')?.value || 'knot-gallery-v1';
  const rng = makeRng(seedStr);

  const presetId = document.getElementById('preset')?.value || 'trefoil';
  const presetName = PRESETS[presetId]?.name || presetId;

  const count = parsePositiveInt(document.getElementById('count')?.value, 16, { min: 1, max: 500 });
  const cols = parsePositiveInt(document.getElementById('cols')?.value, 4, { min: 1, max: 50 });
  const quality = document.getElementById('quality')?.value || 'mid';
  const layout = document.getElementById('layout')?.value || 'grid';
  const radius = parseNumber(document.getElementById('radius')?.value, 0.24, { min: 0.02, max: 0.6 });
  const globalScale = parseNumber(document.getElementById('scale')?.value, 1.0, { min: 0.3, max: 3.0 });

  disposeCurrent();

  try {
    if (presetId === 'all') {
      // Build all types
      const allKeys = Object.keys(PRESETS).filter(k => k !== 'all' && !k.startsWith('benchmark'));
      const perType = Math.max(1, Math.floor(count / allKeys.length));
      let total = 0;
      
      const firstGeom = buildGeometryForPreset(allKeys[0], { rng, quality, radius });
      const spacing = firstGeom ? computeSpacingFromGeometry({ geometry: firstGeom, layout: 'grid', globalScale }) : { baseSpacing: 9.0, jitter: 0.0 };
      if (firstGeom) firstGeom.dispose();

      for (const k of allKeys) {
        const n = Math.min(perType, count - total);
        if (n <= 0) break;
        
        const geometry = buildGeometryForPreset(k, { rng, quality, radius });
        if (!geometry) continue;
        
        const mesh = buildInstancedMesh(geometry, { count: n, cols: Math.min(cols, n), rng, layout: 'grid', globalScale, instanceOffset: total, totalCount: count, spacing });
        root.add(mesh);
        current.meshes.push(mesh);
        current.geometries.push(geometry);
        total += n;
      }

      setStatus({ title: '已生成 (All Types)', three: `${THREE.REVISION}`, presetName: 'All Types', count: total });
      return;
    }

    // Single preset type
    const VARIATION_COUNT = count === 1 ? 1 : Math.min(12, Math.max(3, Math.floor(count / 2)));
    const perVar = Math.ceil(count / VARIATION_COUNT);
    let totalCreated = 0;

    const firstGeom = buildGeometryForPreset(presetId, { rng, quality, radius });
    const spacing = computeSpacingFromGeometry({ geometry: firstGeom, layout, globalScale });
    firstGeom.dispose();

    for (let v = 0; v < VARIATION_COUNT; v++) {
      const numForThisVar = Math.min(perVar, count - totalCreated);
      if (numForThisVar <= 0) break;

      const geometry = buildGeometryForPreset(presetId, { rng, quality, radius });
      if (!geometry) continue;

      const mesh = buildInstancedMesh(geometry, { count: numForThisVar, cols, rng, layout, globalScale, instanceOffset: totalCreated, totalCount: count, spacing });
      root.add(mesh);
      current.meshes.push(mesh);
      current.geometries.push(geometry);
      totalCreated += numForThisVar;

      if (v === 0) {
        fitCameraToContent({ geometry, count, cols, layout, globalScale, spacing });
      }
    }

    setStatus({ title: '已生成', three: `${THREE.REVISION}`, presetName, count });
  } catch (e) {
    console.error(e);
    setStatus({ title: '生成失败', three: `${THREE.REVISION}`, presetName: '-', count: 0 });
  }
}

// ============= Export JSON =============

function exportDataset() {
  const seedStr = document.getElementById('seed')?.value || 'knot-gallery-v1';
  const presetId = document.getElementById('preset')?.value || 'trefoil';
  const count = parsePositiveInt(document.getElementById('count')?.value, 16, { min: 1, max: 500 });
  const deformStrength = clamp(parseNumber(document.getElementById('deform')?.value, 0.25, { min: 0, max: 1 }), 0, 1);
  const tubeRadius = parseNumber(document.getElementById('radius')?.value, 0.24, { min: 0.02, max: 0.6 });
  const cameraPosition = camera ? [camera.position.x, camera.position.y, camera.position.z] : [0, 3.2, 6.2];
  const openTightness = clamp(parseNumber(document.getElementById('openTightness')?.value, 0.6, { min: 0, max: 1 }), 0, 1);
  
  const dataset = {
    version: 1,
    createdAt: new Date().toISOString(),
    seed: seedStr,
    preset: presetId,
    presetInfo: PRESETS[presetId] || {},
    count,
    samples: [],
  };

  // Generate sample metadata
  const rng = makeRng(seedStr);
  const openMultiKnotCount = {
    double_overhand_real: 2,
    mixed_knots: 2,
    triple_knots: 3,
  };
  for (let i = 0; i < count; i++) {
    const presetInfo = PRESETS[presetId] || {};
    let unified = null;

    if (presetInfo.kind === 'openLoop' || presetInfo.kind === 'openLoopMulti') {
      const openType = presetInfo.openType || presetInfo.configName || 'unknown';
      const hasKnot =
        presetInfo.kind === 'openLoopMulti' ? true :
        (presetInfo.openType === 'straight' ? false :
          (presetInfo.openType === 'loose_coil' ? false : true));

      const knotCount =
        presetInfo.kind === 'openLoopMulti'
          ? (openMultiKnotCount[presetInfo.configName] ?? 2)
          : (hasKnot ? 1 : 0);

      unified = computeSingleOpenLoopDifficulty({
        knotType: presetInfo.openType || 'unknown',
        tightness: openTightness,
        knotCount,
        hasKnot,
      });
    } else {
      unified = computeSingleClosedLoopDifficulty({
        knotType: presetId,
        deformStrength,
        cameraPosition,
        tubeRadius,
      });
    }

    dataset.samples.push({
      id: `sample_${String(i).padStart(5, '0')}`,
      preset: presetId,
      difficulty: unified?.difficulty || (PRESETS[presetId]?.difficulty || 'unknown'),
      difficulty_score: unified ? Number(unified.difficulty_score.toFixed(3)) : null,
      difficulty_factors: unified?.factors || null,
      crossings: PRESETS[presetId]?.crossings ?? null,
      isUnknot: PRESETS[presetId]?.isUnknot || false,
      isLink: PRESETS[presetId]?.isLink || false,
      isDeceptive: PRESETS[presetId]?.isDeceptive || false,
    });
  }

  const text = JSON.stringify(dataset, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knot_dataset_${seedStr}_${presetId}_N${count}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============= Event Listeners =============

document.getElementById('btnGenerate')?.addEventListener('click', regenerate);
document.getElementById('btnExport')?.addEventListener('click', exportDataset);

// Slider auto-regenerate
['chainR', 'chainNumLinks', 'chainOffsetY', 'chainSpacing', 'borromeanR', 'borromeanRatio', 'borromeanYellowY', 'borromeanBlueY', 'kinkCount', 'kinkAmplitude', 'openTightness'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', regenerate);
});

// ============= Initialize =============

initThree();
animate();
regenerate();

