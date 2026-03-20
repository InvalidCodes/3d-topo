 /**
 * Invariance Renderer
 * 
 * 负责渲染单张绳结图片并导出 PNG。
 * 复用 unified-gallery.js 中的几何构建逻辑。
 */

import * as THREE from 'three';
import * as CurveExtras from 'three/addons/curves/CurveExtras.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { processCenterline } from './centerline-pipeline.js';
import { getCrossingNumber } from './knot-type-registry.js';

const Curves = CurveExtras.Curves || CurveExtras;

// 缓存 PMREM 环境贴图，避免重复生成
let cachedEnvMap = null;
let cachedPmremGenerator = null;

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
  const seedFn = xmur3(String(seedStr || 'render-seed'));
  return mulberry32(seedFn());
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ============= Curve Classes =============

class TorusKnotCurve extends THREE.Curve {
  constructor({ p = 2, q = 3, R = 1.0, r = 0.4 } = {}) {
    super();
    this.p = p; this.q = q; this.R = R; this.r = r;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const phi = t * Math.PI * 2;
    const { p, q, R, r } = this;
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
    this.returnMidZ = -(this.tubeRadius * 5.5); // dip well below first layer for clearance

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

class KinkyUnknotCurve extends THREE.Curve {
  constructor({ k = 4, baseRadius = 1.0, kinkAmplitude = 0.25, seed = 12345 } = {}) {
    super();
    this.k = Math.max(2, Math.floor(k));
    this.baseRadius = baseRadius;
    this.kinkAmplitude = kinkAmplitude;
    this.rng = mulberry32(seed);
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

// ============= Geometry Building =============

function tubeQualityParams(quality) {
  if (quality === 'high') return { tubularSegments: 280, radialSegments: 18 };
  if (quality === 'mid') return { tubularSegments: 200, radialSegments: 14 };
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
  geom.center();
  geom.computeBoundingSphere();
  // TubeGeometry 自带连续法线，避免重新 computeVertexNormals 造成接缝裂缝
  if (geom.attributes.normal) geom.normalizeNormals();
  return geom;
}

function deformAlongNormal(geometry, { amp = 0.02, freq = 3.0, phase = 0.0 }) {
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

function applyRandomTransform(geometry, rng) {
  const rx = rng() * Math.PI * 2;
  const ry = rng() * Math.PI * 2;
  const rz = rng() * Math.PI * 2;
  const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  geometry.applyMatrix4(rotMatrix);
  
  // 保留 TubeGeometry 的缝合法线，仅归一化
  if (geometry.attributes.normal) geometry.normalizeNormals();
  geometry.center();
}

// ============= Knot Type Builders =============

function buildHopfLinkGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.5;
  const tubeRadius = radius * 0.9;

  const curveA = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: 3, amp: 0.06 });
  const curveB = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, -2, 0), normal: new THREE.Vector3(1, 0, 0), waves: 3, amp: 0.06 });

  const a = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, radialSegments, true);
  const b = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, radialSegments, true);

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

function buildUnlinkedRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.0;

  const curveA = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: 3, amp: 0.1 });
  const curveB = new PlanarWobbleCircleCurve({ radius: R, center: new THREE.Vector3(2.5, 0, 0), normal: new THREE.Vector3(0, 0, 1), waves: 3, amp: 0.1 });

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

function chainRandomIntInclusive(rng, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor((rng ? rng() : Math.random()) * (hi - lo + 1));
}
function chainRandomChoice(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor((rng ? rng() : Math.random()) * arr.length))];
}
function chainShuffleInPlace(arr, rng) {
  const r = rng || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function chainRandomSplitTotal(total, { minPart = 2, maxPart = 4, maxParts = 4 } = {}, rng) {
  const r = rng || Math.random;
  const T = Math.max(1, Math.floor(total));
  const minP = Math.max(1, Math.floor(minPart));
  const maxP = Math.max(minP, Math.floor(maxPart));
  const maxK = Math.max(1, Math.floor(maxParts));

  const maxPossibleParts = Math.min(maxK, Math.max(1, Math.floor(T / minP)));
  const k = T >= minP * 2 ? chainRandomIntInclusive(r, 2, maxPossibleParts) : 1;

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
  if (parts.reduce((s, x) => s + x, 0) !== T) return [T];
  return parts;
}

function chainGenerateDiverseLayout({
  rng,
  numLinks,
  R,
  tubeRadius,
  effectiveStep,
  linkOffsetY,
} = {}) {
  const r = rng || Math.random;
  const n = Math.max(2, Math.floor(numLinks || 4));

  const parts = chainRandomSplitTotal(n, { minPart: 2, maxPart: 4, maxParts: 4 }, r);
  const segments = [];
  let cursor = 0;
  for (const sz of parts) {
    const nodes = [];
    for (let i = 0; i < sz; i++) nodes.push(cursor++);
    segments.push({ nodes, size: sz });
  }

  const allEdges = [];
  const addEdge = (a, b) => {
    if (a === b) return;
    const x = Math.min(a, b), y = Math.max(a, b);
    allEdges.push([x, y]);
  };

  for (const seg of segments) {
    const nodes = seg.nodes.slice();
    chainShuffleInPlace(nodes, r);
    const sz = nodes.length;
    const pattern = chainRandomChoice(r, ['linear', 'linear', 'branch', 'loop_back']);
    seg.pattern = pattern;

    if (pattern === 'loop_back' && sz >= 3) {
      for (let i = 0; i < sz; i++) addEdge(nodes[i], nodes[(i + 1) % sz]);
    } else if (pattern === 'branch' && sz >= 4) {
      const hub = nodes[0];
      addEdge(hub, nodes[1]);
      addEdge(hub, nodes[2]);
      let prev = nodes[1];
      for (let i = 3; i < sz; i++) { addEdge(prev, nodes[i]); prev = nodes[i]; }
    } else {
      for (let i = 0; i < sz - 1; i++) addEdge(nodes[i], nodes[i + 1]);
    }
  }

  if (segments.length > 1) {
    const topology = chainRandomChoice(r, ['sequential', 'tree', 'random_graph', 'has_cycle']);
    const segCount = segments.length;
    const pickNodeFromSeg = (si) => {
      const nodes = segments[si].nodes;
      return nodes[Math.floor(r() * nodes.length)];
    };

    for (let i = 1; i < segCount; i++) {
      const p = topology === 'sequential' ? (i - 1) : Math.floor(r() * i);
      addEdge(pickNodeFromSeg(i), pickNodeFromSeg(p));
    }

    const extra = chainRandomIntInclusive(r, 1, Math.min(3, segCount));
    const addRandomInterEdge = () => {
      let a = Math.floor(r() * segCount);
      let b = Math.floor(r() * segCount);
      if (a === b) b = (b + 1) % segCount;
      addEdge(pickNodeFromSeg(a), pickNodeFromSeg(b));
    };

    if (topology === 'random_graph') {
      for (let i = 0; i < extra; i++) addRandomInterEdge();
    } else if (topology === 'has_cycle') {
      addRandomInterEdge();
      if (r() < 0.6) for (let i = 0; i < extra; i++) addRandomInterEdge();
    } else if (topology === 'tree') {
      if (r() < 0.35) addRandomInterEdge();
    }
  }

  const dedup = new Map();
  for (const [a, b] of allEdges) dedup.set(`${a},${b}`, [a, b]);
  const edges = Array.from(dedup.values());

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
    return (candidates.length ? chainRandomChoice(r, candidates).a : chainRandomChoice(r, basisAxes)).clone().normalize();
  };

  const linkSepBase = Math.max(0.9 * R, Math.abs(effectiveStep) || (1.2 * R));
  const jitter = 0.18 * R;
  const zJitter = 0.12 * R;
  const offsetMag = Math.max(0.0, Math.min(2.5 * R, Math.abs(linkOffsetY))) * 0.15;

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

      const sep = linkSepBase * (0.85 + 0.35 * r());
      const c = centers[u].clone()
        .addScaledVector(t, sep)
        .addScaledVector(nu, (r() - 0.5) * zJitter)
        .addScaledVector(nv, (r() - 0.5) * zJitter);
      c.addScaledVector(nu, (r() - 0.5) * offsetMag);

      centers[v].copy(c);
      normals[v].copy(nv);
      placed[v] = true;
      queue.push(v);
    }
  }

  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    centers[i].set((r() - 0.5) * 2.0, (r() - 0.5) * 2.0, (r() - 0.5) * 2.0);
    normals[i].copy(pickPerpAxis(new THREE.Vector3(0, 0, 1)));
  }

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
  for (let i = 0; i < n; i++) {
    centers[i].add(new THREE.Vector3((r() - 0.5) * jitter, (r() - 0.5) * jitter, (r() - 0.5) * jitter));
  }

  return { centers, normals };
}

function buildChainGeometry({ rng, quality = 'mid', radius = 0.24, numLinks = 4 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.5;
  const linkOffsetY = -2.0;
  const effectiveStep = Math.abs(linkOffsetY);
  const tubeRadius = radius * 0.9;

  const geoms = [];
  const { centers, normals } = chainGenerateDiverseLayout({
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

function buildBorromeanRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  // =====================================================================
  // Borromean Rings — 经典三角排列 + 精确交叉点 Gaussian bump
  //
  // 构造方法：
  //   1. 三个圆心排成等边三角形（经典 Venn diagram 排列）
  //   2. 所有圆在同一 XY 平面，半径 R，圆心间距 = sep
  //   3. 精确计算每对圆的两个交叉点角度
  //   4. 在交叉点处沿 Z 方向加 Gaussian bump（over/under）
  //   5. 循环符号：A over B, B over C, C over A → Borromean 拓扑
  //
  // 这保证：任意两环的交叉交替 over/under（不互锁），
  //         但三环整体互锁（Borromean link）
  // =====================================================================
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.0;          // 圆半径
  const sep = 0.7;        // 圆心到三角形中心的距离（< R 才能相交）
  const bumpH = 0.30;     // over/under bump 高度（>> tube radius 防穿模）
  const bumpW = 0.35;     // bump 宽度（弧度）
  const tubeR = 0.055;    // 管壁半径

  const ringColors = [
    new THREE.Color(0.95, 0.25, 0.25),  // 红
    new THREE.Color(0.95, 0.85, 0.15),  // 黄
    new THREE.Color(0.25, 0.45, 0.95),  // 蓝
  ];

  // 三角形顶点（圆心位置）
  const centers = [
    [0, -sep, 0],                                     // A — 底部
    [sep * Math.sqrt(3) / 2, sep / 2, 0],             // B — 右上
    [-sep * Math.sqrt(3) / 2, sep / 2, 0],            // C — 左上
  ];

  // 对每个圆，计算它与另外两个圆的交叉点角度和 over/under 符号
  function computeCrossings(myIdx) {
    const crossings = [];
    const [cx, cy] = [centers[myIdx][0], centers[myIdx][1]];

    for (let other = 0; other < 3; other++) {
      if (other === myIdx) continue;
      const [ox, oy] = [centers[other][0], centers[other][1]];
      const dx = ox - cx, dy = oy - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 2 * R || d < 1e-6) continue;

      // 从本圆圆心指向对方圆心的角度
      const baseAngle = Math.atan2(dy, dx);
      // 交叉弦的半角
      const halfAngle = Math.acos(d / (2 * R));
      // 两个交叉点的角度
      const a1 = baseAngle + halfAngle;
      const a2 = baseAngle - halfAngle;

      // 循环 over/under 符号：
      //   A(0) over B(1)  →  (0,1): +1 at first crossing, -1 at second
      //   B(1) over C(2)  →  (1,2): +1 at first, -1 at second
      //   C(2) over A(0)  →  (2,0): +1 at first, -1 at second
      const overFirst = ((myIdx + 1) % 3 === other) ? 1 : -1;
      crossings.push({ angle: a1, sign: overFirst });
      crossings.push({ angle: a2, sign: -overFirst });
    }
    return crossings;
  }

  class BorromeanCircleCurve extends THREE.Curve {
    constructor(ringIndex) {
      super();
      this.cx = centers[ringIndex][0];
      this.cy = centers[ringIndex][1];
      this.crossings = computeCrossings(ringIndex);
    }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const angle = t * Math.PI * 2;
      const v = optionalTarget || new THREE.Vector3();

      // 基础圆在 XY 平面
      const x = this.cx + R * Math.cos(angle);
      const y = this.cy + R * Math.sin(angle);

      // 在每个交叉点附近加 Gaussian bump（Z 方向）
      let z = 0;
      for (const cr of this.crossings) {
        let da = angle - cr.angle;
        // 归一化到 [-π, π]
        da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
        z += cr.sign * bumpH * Math.exp(-(da * da) / (2 * bumpW * bumpW));
      }
      return v.set(x, y, z);
    }
  }

  const geoms = [];
  for (let i = 0; i < 3; i++) {
    const curve = new BorromeanCircleCurve(i);
    const segments = Math.max(tubularSegments, 256);
    const g = new THREE.TubeGeometry(curve, segments, tubeR, radialSegments, true);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const c = ringColors[i];
    for (let j = 0; j < g.attributes.position.count; j++) {
      colors[j * 3] = c.r; colors[j * 3 + 1] = c.g; colors[j * 3 + 2] = c.b;
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

function buildKinkyUnknotGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  const k = rng ? 3 + Math.floor(rng() * 4) : 4;
  const kinkAmp = rng ? 0.2 + rng() * 0.15 : 0.25;
  const seed = rng ? Math.floor(rng() * 100000) : 12345;

  const curve = new KinkyUnknotCurve({ k, baseRadius: 1.0, kinkAmplitude: kinkAmp, seed });
  const geom = new THREE.TubeGeometry(curve, Math.floor(tubularSegments * 1.5), radius, radialSegments, true);
  geom.computeVertexNormals();
  geom.center();
  geom.computeBoundingSphere();
  const scale = 1.35 / (geom.boundingSphere.radius || 1);
  geom.scale(scale, scale, scale);
  
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

/**
 * 根据绳结类型构建几何体
 * @param {string} knotType - 绳结类型 key
 * @param {Object} options - 构建选项
 * @returns {THREE.BufferGeometry}
 */
export function buildGeometryForKnotType(knotType, options = {}) {
  const {
    rng = null,
    quality = 'high',
    radius = 0.15,
    deformStrength = 0.3,
    slackness = 0,
    anisotropicScale = [1, 1, 1],
  } = options;
  
  const localRng = rng || makeRng(String(Date.now()));

  // 目标：归一化后管壁半径 = targetOuterRadius × TUBE_RATIO
  // 自适应：低 crossing 用粗绳使 crossing 明显，高 crossing 稍细避免自遮挡
  const crossingNum = getCrossingNumber(knotType) || 0;
  const TUBE_RATIO = crossingNum <= 4 ? 0.07 : (crossingNum <= 7 ? 0.055 : 0.045);

  const buildProcessedTube = (rawCurve, { closed = true, targetOuterRadius = 1.35, sampleN = 300 } = {}) => {
    // 1. 先采样曲线，估算原始尺寸，计算自适应 tubeRadius
    const samplePts = rawCurve.getPoints ? rawCurve.getPoints(100) : [];
    let curveRadius = 1.0;
    if (samplePts.length > 2) {
      const box = new THREE.Box3();
      samplePts.forEach(p => box.expandByPoint(p));
      const size = new THREE.Vector3();
      box.getSize(size);
      curveRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1.0;
    }
    // tubeRadius 与曲线尺寸成正比，归一化后 = targetOuterRadius × TUBE_RATIO
    const tubeRadius = curveRadius * TUBE_RATIO;

    const processedCurve = processCenterline(rawCurve, {
      rng: localRng,
      deformStrength,
      slackness,
      tubeRadius,
      sampleN,
      closed,
      knotType,
    });

    const { tubularSegments, radialSegments } = tubeQualityParams(quality);
    const geom = new THREE.TubeGeometry(processedCurve, tubularSegments, tubeRadius, radialSegments, closed);
    geom.center();
    geom.computeBoundingSphere();
    const sNorm = geom.boundingSphere?.radius > 1e-6 ? (targetOuterRadius / geom.boundingSphere.radius) : 1.0;
    geom.scale(sNorm, sNorm, sNorm);
    geom.computeBoundingSphere();
    if (geom.attributes.normal) geom.normalizeNormals();
    return geom;
  };
  
  let geometry = null;
  
  switch (knotType) {
    case 'unknot':
      // ====================================================
      // Unknot：拓扑上可解开，但视觉上应有 apparent crossings
      //
      // 策略：用 KinkyUnknotCurve（低配版）
      //   - 产生局部扭结（视觉上看起来有 crossings）
      //   - 但拓扑上始终是 unknot（所有 kink 可连续变形解开）
      //   - 不同 kink 数量控制视觉复杂度
      //
      // 30%: 低复杂度（2 个 kink，简单但仍有交叉）
      // 40%: 中复杂度（3-4 个 kink，看起来可能打了结）
      // 30%: 高复杂度（5-6 个 kink，很容易误判为 knotted）
      // ====================================================
      {
        const v = localRng();
        const seed = Math.floor(localRng() * 100000);
        let kinkCount, kinkAmp;
        if (v < 0.3) {
          kinkCount = 2;
          kinkAmp = 0.15 + localRng() * 0.10;  // 0.15-0.25
        } else if (v < 0.7) {
          kinkCount = 3 + Math.floor(localRng() * 2); // 3-4
          kinkAmp = 0.20 + localRng() * 0.10;  // 0.20-0.30
        } else {
          kinkCount = 5 + Math.floor(localRng() * 2); // 5-6
          kinkAmp = 0.25 + localRng() * 0.10;  // 0.25-0.35
        }
        const unknotCurve = new KinkyUnknotCurve({
          k: kinkCount,
          baseRadius: 1.0,
          kinkAmplitude: kinkAmp,
          seed,
        });
        geometry = buildProcessedTube(unknotCurve, { closed: true, targetOuterRadius: 1.35, sampleN: 400 });
      }
      break;
      
    case 'twisted_ring':
      geometry = buildProcessedTube(
        new TwistedRingCurve({
          R: 1.0,
          twist: 2 + Math.floor(localRng() * 5),
          wobble: 0.18 + localRng() * 0.18,
          height: 0.3 + localRng() * 0.25,
        }),
        { closed: true, targetOuterRadius: 1.35, sampleN: 300 }
      );
      break;
      
    case 'spiral_disk':
      // Spiral Loop 用固定 tubeRadius（不走 buildProcessedTube 的自适应流程）
      {
        const { tubularSegments, radialSegments } = tubeQualityParams(quality);
        const spiralTubeRadius = 0.06; // 固定管壁粗细
        const curve = new SpiralLoopCurve({
          tubeRadius: spiralTubeRadius,
          turns: 2.0 + localRng() * 1.2,          // 2.0 - 3.2 圈
          pitch: 0.12 + localRng() * 0.10,        // 会被 clamp 到 >= 2.8*tubeRadius
          innerRadius: 0.55,
          radialGap: 0.22 + localRng() * 0.12,    // 会被 clamp 到 >= 2.8*tubeRadius
        });
        geometry = new THREE.TubeGeometry(
          curve,
          Math.max(280, tubularSegments),
          spiralTubeRadius,
          radialSegments,
          true
        );
        geometry.center();
      }
      break;
      
    case 'kinky_unknot':
      geometry = buildKinkyUnknotGeometry({ rng: localRng, quality, radius: 0.06 });
      break;
      
    case 'trefoil':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 2, q: 3, R: 1.0, r: 0.55 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;

    case 'loose_open_knot':
      // ====================================================
      // 松散开口结：取 trefoil 的 ~82% 弧段，两端加开放尾巴
      // 关键：**不走 processCenterline**！slackness 会抹平交叉
      // ====================================================
      {
        const { tubularSegments: ts, radialSegments: rs } = tubeQualityParams(quality);
        const baseCurve = new TorusKnotCurve({ p: 2, q: 3, R: 1.0, r: 0.50 });
        const sampleN = 420;
        let ringPts = baseCurve.getPoints(sampleN);
        ringPts = ringPts.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));

        // 从随机位置截取 ~82% 弧段，形成开口
        const start = Math.floor(localRng() * ringPts.length * 0.35);
        const span = Math.max(80, Math.floor(ringPts.length * 0.82));
        let corePts = [];
        for (let i = 0; i <= span; i++) {
          corePts.push(ringPts[(start + i) % ringPts.length].clone());
        }

        // 略微压扁 Z + 添加变形
        const s = clamp(slackness, 0, 1);
        const d = clamp(deformStrength, 0, 1);
        const zScale = clamp(1.0 - 0.72 * s, 0.18, 1.0);
        const deformAmp = d * (0.05 + 0.09 * (1 - 0.5 * s));
        const tau = Math.PI * 2;
        const ph1 = localRng() * tau, ph2 = localRng() * tau, ph3 = localRng() * tau;
        for (let i = 0; i < corePts.length; i++) {
          const t = i / Math.max(1, corePts.length - 1);
          const w = Math.exp(-((t - 0.5) ** 2) / 0.07);
          corePts[i].multiplyScalar(1 + (0.03 + 0.18 * s) * w);
          corePts[i].z *= zScale;
          if (deformAmp > 1e-6) {
            corePts[i].x += deformAmp * (0.65 * Math.sin(tau * (1.6 + 0.8 * s) * t + ph1) + 0.35 * Math.cos(tau * 3.1 * t + ph2));
            corePts[i].y += deformAmp * (0.60 * Math.cos(tau * (1.2 + 0.6 * d) * t + ph2) + 0.40 * Math.sin(tau * 2.7 * t + ph1));
            corePts[i].z += deformAmp * 0.7 * 0.75 * Math.sin(tau * (1.0 + 0.7 * s) * t + ph3);
          }
        }

        // 两端加开放尾巴
        const headDir = corePts[0].clone().sub(corePts[1]).normalize();
        const tailDir = corePts[corePts.length - 1].clone().sub(corePts[corePts.length - 2]).normalize();
        const tailLenA = 0.70 + 0.55 * s + localRng() * 0.35;
        const tailLenB = 0.75 + 0.60 * s + localRng() * 0.35;
        const liftZ = 1.0 - 0.6 * s;
        const liftA = new THREE.Vector3(-0.10, 0.18, 0.08 * liftZ);
        const liftB = new THREE.Vector3(0.12, -0.15, -0.10 * liftZ);

        const h0 = corePts[0].clone();
        const h1 = h0.clone().addScaledVector(headDir, tailLenA * 0.7).addScaledVector(liftA, 0.6);
        const h2 = h0.clone().addScaledVector(headDir, tailLenA * 1.5).add(liftA);
        const t0 = corePts[corePts.length - 1].clone();
        const t1 = t0.clone().addScaledVector(tailDir, tailLenB * 0.7).addScaledVector(liftB, 0.6);
        const t2 = t0.clone().addScaledVector(tailDir, tailLenB * 1.5).add(liftB);
        corePts = [h2, h1, ...corePts, t1, t2];

        // 平滑曲线
        let openCurve = new THREE.CatmullRomCurve3(corePts, false, 'centripetal');
        let smoothPts = openCurve.getPoints(Math.max(260, ts));
        smoothPts = smoothPts.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
        if (smoothPts.length >= 20) {
          const iters = Math.round(4 + 8 * s + 4 * d);
          const beta = 0.12 + 0.10 * s;
          for (let it = 0; it < iters; it++) {
            const next = smoothPts.map(p => p.clone());
            for (let i = 1; i < smoothPts.length - 1; i++) {
              const avg = smoothPts[i - 1].clone().add(smoothPts[i]).add(smoothPts[i + 1]).divideScalar(3);
              next[i].lerp(avg, beta);
            }
            smoothPts = next;
          }
          openCurve = new THREE.CatmullRomCurve3(smoothPts, false, 'centripetal');
        }

        // 估算曲线尺寸，计算管壁半径
        const estPts = openCurve.getPoints(100);
        const estBox = new THREE.Box3();
        estPts.forEach(p => estBox.expandByPoint(p));
        const estSize = new THREE.Vector3(); estBox.getSize(estSize);
        const curveR = Math.max(estSize.x, estSize.y, estSize.z) * 0.5 || 1.0;
        const looseTubeR = curveR * TUBE_RATIO;

        geometry = new THREE.TubeGeometry(openCurve, Math.max(ts, 300), looseTubeR, rs, false);
        geometry.center();
        geometry.computeBoundingSphere();
        const sNorm = geometry.boundingSphere?.radius > 1e-6
          ? (1.35 / geometry.boundingSphere.radius) : 1.0;
        geometry.scale(sNorm, sNorm, sNorm);
        geometry.computeBoundingSphere();
        if (geometry.attributes.normal) geometry.normalizeNormals();
      }
      break;
      
    case 'figure8': {
      const hasCurve = Curves && typeof Curves['FigureEightPolynomialKnot'] === 'function';
      const rawCurve = hasCurve
        ? new Curves['FigureEightPolynomialKnot']()
        : new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.45 });
      geometry = buildProcessedTube(rawCurve, { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;
    }

    case 'torus_2_5':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 2, q: 5, R: 1.0, r: 0.50 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;

    case 'torus_2_7':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 2, q: 7, R: 1.0, r: 0.45 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;

    case 'torus_2_9':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 2, q: 9, R: 1.0, r: 0.42 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;

    case 'torus_3_4':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.45 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;

    case 'torus_3_5':
      geometry = buildProcessedTube(new TorusKnotCurve({ p: 3, q: 5, R: 1.0, r: 0.40 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
      break;
      
    case 'hopf_link':
      geometry = buildHopfLinkGeometry({ rng: localRng, quality, radius: 0.12 });
      break;

    case 'unlinked_rings':
      geometry = buildUnlinkedRingsGeometry({ rng: localRng, quality, radius: 0.12 });
      break;

    case 'chain':
      geometry = buildChainGeometry({ rng: localRng, quality, radius: 0.10, numLinks: options.numLinks || 4 });
      break;

    case 'borromean':
      geometry = buildBorromeanRingsGeometry({ rng: localRng, quality, radius: 0.08 });
      break;
      
    default:
      // Fallback to circle
      geometry = buildProcessedTube(new CircleCurve({ radius: 1.0 }), { closed: true, targetOuterRadius: 1.35, sampleN: 300 });
  }
  
// 不对管壁做法线扰动，保持管径绝对均匀
// 不做各向异性缩放，保持圆截面
  
  // Random rotation for diversity
  if (geometry && rng) {
    applyRandomTransform(geometry, localRng);
  }
  
  return geometry;
}

// ============= Scene & Renderer =============

/**
 * 创建独立的渲染场景
 * 复刻 knot_gallery.html 的高质量渲染效果
 */
export function createRenderScene(options = {}) {
  const {
    width = 2048,
    height = 2048,
    backgroundColor = '#1a2236',
    antialias = true,
  } = options;
  
  // Scene - 使用 knot_gallery.html 的背景色
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);
  
  // Camera - 调整位置以获得更好的视角
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
  camera.position.set(0, 2.5, 5.5);
  camera.lookAt(0, 0, 0);
  
  // Renderer - 高质量渲染设置
  const renderer = new THREE.WebGLRenderer({
    antialias,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  
  // 输出色彩空间 - 关键设置
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  // 色调映射 - 使渲染更真实
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  
  // 启用阴影
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // 生成 PMREM 环境贴图 - 这是金属材质看起来真实的关键！
  if (!cachedPmremGenerator) {
    cachedPmremGenerator = new THREE.PMREMGenerator(renderer);
    cachedPmremGenerator.compileEquirectangularShader();
  }
  
  if (!cachedEnvMap) {
    const roomEnv = new RoomEnvironment();
    cachedEnvMap = cachedPmremGenerator.fromScene(roomEnv).texture;
    roomEnv.dispose();
  }
  
  // 设置场景环境贴图
  scene.environment = cachedEnvMap;
  
  return { scene, camera, renderer };
}

/**
 * 设置场景光照 - 高质量光照设置，支持阴影
 */
export function setupLighting(scene, options = {}) {
  const {
    intensity = 1.5,
    ambient = 1.0,
    enableShadows = true,
  } = options;
  
  // Clear existing lights
  const lightsToRemove = [];
  scene.traverse(obj => {
    if (obj.isLight) lightsToRemove.push(obj);
  });
  lightsToRemove.forEach(light => scene.remove(light));
  
  // Ambient - 环境光（配合 RoomEnvironment 使用，降低强度）
  const ambientLight = new THREE.AmbientLight(0xffffff, ambient * 0.6);
  scene.add(ambientLight);
  
  // Hemisphere light - 天空/地面渐变
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(hemi);
  
  // Main directional light - 主光源（投射阴影）
  const dir = new THREE.DirectionalLight(0xffffff, intensity);
  dir.position.set(10, 18, 10);
  if (enableShadows) {
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -10;
    dir.shadow.camera.right = 10;
    dir.shadow.camera.top = 10;
    dir.shadow.camera.bottom = -10;
    dir.shadow.bias = -0.001;
  }
  scene.add(dir);
  
  // Fill light - 补光（不投射阴影）
  const fill = new THREE.DirectionalLight(0xffffff, intensity * 0.4);
  fill.position.set(-10, 5, -10);
  scene.add(fill);
  
  // Rim light - 轮廓光（增加立体感）
  const rim = new THREE.DirectionalLight(0xffffff, intensity * 0.25);
  rim.position.set(0, -5, -10);
  scene.add(rim);
}

/**
 * 检测 crossing 区域并加深"下方"绳段的顶点颜色，提供 over/under 深度线索。
 * 在 TubeGeometry 上操作：按 tubular ring 分组，找到空间上接近但曲线上远离的 ring 对，
 * 将 Z 值较低（"下方"）的 ring 顶点颜色乘以 darkenFactor。
 *
 * @param {THREE.BufferGeometry} geometry - TubeGeometry (需要已有 color attribute)
 * @param {number} tubularSegments - 沿曲线的分段数
 * @param {number} radialSegments - 管壁圆周分段数
 * @param {number} tubeRadius - 管壁半径
 */
function applyCrossingDepthShading(geometry, tubularSegments, radialSegments, tubeRadius) {
  const posAttr = geometry.attributes.position;
  const colorAttr = geometry.attributes.color;
  if (!posAttr || !colorAttr) return;

  const radsPerRing = radialSegments + 1;
  const numRings = tubularSegments + 1;

  // 计算每个 ring 的中心点
  const ringCenters = [];
  for (let i = 0; i < numRings; i++) {
    const cx = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (let j = 0; j < radsPerRing; j++) {
      const idx = i * radsPerRing + j;
      if (idx < posAttr.count) {
        cx.x += posAttr.getX(idx);
        cx.y += posAttr.getY(idx);
        cx.z += posAttr.getZ(idx);
        count++;
      }
    }
    if (count > 0) cx.divideScalar(count);
    ringCenters.push(cx);
  }

  // 找交叉区域：空间距离 < threshold 但曲线上距离 > minArcSep 的 ring 对
  const crossingThreshold = tubeRadius * 5.0;
  const minArcSep = Math.max(12, Math.floor(numRings * 0.08));
  const darkenFactor = 0.55; // "下方"绳段变暗到原来的 55%
  const fadeRings = 4; // 渐变范围

  // 标记每个 ring 是否需要变暗（以及变暗程度）
  const ringDarken = new Float32Array(numRings).fill(1.0); // 1.0 = no change

  for (let i = 0; i < numRings; i++) {
    for (let k = i + minArcSep; k < numRings; k++) {
      const dist = ringCenters[i].distanceTo(ringCenters[k]);
      if (dist < crossingThreshold) {
        // Z 较低的是 "under" strand
        const underIdx = ringCenters[i].z < ringCenters[k].z ? i : k;
        // 对 under ring 及周围几个 ring 应用变暗
        for (let d = -fadeRings; d <= fadeRings; d++) {
          const ri = underIdx + d;
          if (ri >= 0 && ri < numRings) {
            const fade = 1.0 - (1.0 - darkenFactor) * Math.max(0, 1 - Math.abs(d) / fadeRings);
            ringDarken[ri] = Math.min(ringDarken[ri], fade);
          }
        }
      }
    }
  }

  // 应用变暗到顶点颜色
  for (let i = 0; i < numRings; i++) {
    if (ringDarken[i] < 0.999) {
      const factor = ringDarken[i];
      for (let j = 0; j < radsPerRing; j++) {
        const idx = i * radsPerRing + j;
        if (idx < colorAttr.count) {
          colorAttr.setXYZ(idx,
            colorAttr.getX(idx) * factor,
            colorAttr.getY(idx) * factor,
            colorAttr.getZ(idx) * factor
          );
        }
      }
    }
  }
  colorAttr.needsUpdate = true;
}

/**
 * 为几何体添加顶点颜色（如果没有的话）
 * 这是 knot_gallery.html 渲染效果的关键
 */
function ensureVertexColors(geometry, baseColor = null) {
  if (!geometry.attributes.color) {
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    
    if (baseColor) {
      const c = new THREE.Color(baseColor);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    } else {
      // 默认白色，让材质颜色显示
      colors.fill(1.0);
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geometry;
}

/**
 * 生成高质量材质 - 复刻 knot_gallery.html 的渲染效果
 * 关键：使用 vertexColors: true，让顶点颜色生效
 * 配合 RoomEnvironment PMREM 实现真实金属反射
 */
function createHighQualityMaterial(color, options = {}) {
  const {
    metalness = 0.2,
    roughness = 0.3,
  } = options;
  
  // 使用白色基底 + vertexColors，配合 PMREM 环境贴图
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,  // 白色基底，让顶点颜色生效
    roughness,
    metalness,
    vertexColors: true,  // 总是启用顶点颜色
    // 环境贴图强度 - 增强反射效果
    envMapIntensity: 1.0,
    // 添加发光效果增强视觉效果
    emissive: new THREE.Color(0x0a0a0a),
    emissiveIntensity: 0.15,
  });
}

/**
 * 渲染单张图片
 * @param {Object} imageParams - 图片参数（来自 invariance-generator.js）
 * @returns {Promise<string>} Data URL (PNG)
 */
export async function renderSingleImage(imageParams, options = {}) {
  const {
    width = 2048,
    height = 2048,
  } = options;
  
  const rng = makeRng(String(imageParams.seed));
  
  // Create scene - 使用 knot_gallery.html 风格的背景色
  const { scene, camera, renderer } = createRenderScene({
    width,
    height,
    backgroundColor: imageParams.backgroundColor || '#1a2236',
  });
  
  // Setup camera - 更合适的视角
  if (imageParams.cameraPosition) {
    camera.position.set(...imageParams.cameraPosition);
  }
  if (imageParams.cameraTarget) {
    camera.lookAt(...imageParams.cameraTarget);
  }
  if (imageParams.cameraFov) {
    camera.fov = imageParams.cameraFov;
    camera.updateProjectionMatrix();
  }
  
  // Setup lighting - 增强光照
  setupLighting(scene, {
    intensity: imageParams.lightIntensity || 1.5,
    ambient: imageParams.ambientIntensity || 1.2,
  });
  
  // Build geometry
  const geometry = buildGeometryForKnotType(imageParams.knotType, {
    rng,
    quality: 'high',
    radius: imageParams.tubeRadius || 0.18,
    deformStrength: imageParams.deformStrength || 0.3,
    slackness: imageParams.slackness || 0,
    anisotropicScale: imageParams.anisotropicScale || [1, 1, 1],
    numLinks: imageParams.numLinks,
  });
  
  // 确保几何体有顶点颜色 - 这是 knot_gallery.html 渲染效果的关键
  ensureVertexColors(geometry, imageParams.color || '#72e6ff');

  // Crossing 深度着色：检测 over/under 区域，加深"下方"绳段
  {
    const { tubularSegments, radialSegments } = tubeQualityParams('high');
    const cn = getCrossingNumber(imageParams.knotType) || 0;
    const tubeRatio = cn <= 4 ? 0.07 : (cn <= 7 ? 0.055 : 0.045);
    applyCrossingDepthShading(geometry, tubularSegments, radialSegments, tubeRatio);
  }

  // Create high-quality material - 复刻 knot_gallery.html 的效果
  const material = createHighQualityMaterial(
    imageParams.color || '#72e6ff',
    {
      metalness: imageParams.metalness ?? 0.15,
      roughness: imageParams.roughness ?? 0.35,
    }
  );
  
  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);

  // 居中并统一缩放：确保绳结在画面中足够大且不出框
  geometry.computeBoundingSphere();
  const bsRadius = geometry.boundingSphere?.radius || 1;
  const TARGET_VISUAL_RADIUS = 1.8; // 目标包围球半径
  if (bsRadius > 1e-6) {
    const uniformScale = TARGET_VISUAL_RADIUS / bsRadius;
    mesh.scale.setScalar(uniformScale);
  }

  scene.add(mesh);
  
  // Render
  renderer.render(scene, camera);
  
  // Get data URL
  const dataUrl = renderer.domElement.toDataURL('image/png');
  
  // Cleanup
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  
  return dataUrl;
}

/**
 * 批量渲染 Pair
 * @param {Object} pair - PairRecord
 * @param {Object} options
 * @returns {Promise<{ imageA: string, imageB: string }>} Data URLs
 */
export async function renderPair(pair, options = {}) {
  const imageA = await renderSingleImage(pair.imageA, options);
  const imageB = await renderSingleImage(pair.imageB, options);
  return { imageA, imageB };
}

/**
 * 将 Data URL 转换为 Blob
 */
export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * 触发文件下载
 */
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 清理 PMREM 缓存（在不再需要渲染时调用）
 */
export function disposeEnvironmentCache() {
  if (cachedEnvMap) {
    cachedEnvMap.dispose();
    cachedEnvMap = null;
  }
  if (cachedPmremGenerator) {
    cachedPmremGenerator.dispose();
    cachedPmremGenerator = null;
  }
}

// ============= 导出 =============

export default {
  buildGeometryForKnotType,
  createRenderScene,
  setupLighting,
  renderSingleImage,
  renderPair,
  dataUrlToBlob,
  downloadDataUrl,
  disposeEnvironmentCache,
};
