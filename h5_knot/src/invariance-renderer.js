 /**
 * Invariance Renderer
 * 
 * 负责渲染单张绳结图片并导出 PNG。
 * 复用 unified-gallery.js 中的几何构建逻辑。
 */

import * as THREE from 'three';
import * as CurveExtras from 'three/addons/curves/CurveExtras.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
    turns = 2,
    pitch = 0.15,
    innerRadius = 0.3,
    radialGap = 0.25,
    connectorComplexity = 1,
  } = {}) {
    super();
    this.turns = Math.max(1, turns);
    this.pitch = pitch;
    this.innerRadius = innerRadius;
    this.radialGap = radialGap;
    this.connectorComplexity = connectorComplexity;
    this.spiralFrac = 0.85;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const spiralFrac = this.spiralFrac;
    const connectorFrac = 1 - spiralFrac;
    
    if (t < spiralFrac) {
      const localT = t / spiralFrac;
      const angle = localT * this.turns * Math.PI * 2;
      const r = this.innerRadius + localT * this.turns * this.radialGap;
      const z = localT * this.turns * this.pitch;
      return optionalTarget.set(r * Math.cos(angle), r * Math.sin(angle), z);
    } else {
      const localT = (t - spiralFrac) / connectorFrac;
      const endAngle = this.turns * Math.PI * 2;
      const endR = this.innerRadius + this.turns * this.radialGap;
      const endZ = this.turns * this.pitch;
      const endX = endR * Math.cos(endAngle);
      const endY = endR * Math.sin(endAngle);
      const startX = this.innerRadius;
      const startY = 0;
      const startZ = 0;
      
      if (this.connectorComplexity === 0) {
        const smoothT = localT * localT * (3 - 2 * localT);
        return optionalTarget.set(
          endX + (startX - endX) * smoothT,
          endY + (startY - endY) * smoothT,
          endZ + (startZ - endZ) * smoothT
        );
      } else {
        const midAngle = endAngle / 2;
        const midR = (endR + this.innerRadius) / 2 + this.radialGap * 0.5;
        const midZ = endZ * 0.5 + this.pitch * this.connectorComplexity;
        const t2 = localT * localT;
        const t3 = t2 * localT;
        const mt = 1 - localT;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const midX = midR * Math.cos(midAngle);
        const midY = midR * Math.sin(midAngle);
        const x = mt3 * endX + 3 * mt2 * localT * midX + 3 * mt * t2 * (startX + midX) / 2 + t3 * startX;
        const y = mt3 * endY + 3 * mt2 * localT * midY + 3 * mt * t2 * (startY + midY) / 2 + t3 * startY;
        const z = mt3 * endZ + 3 * mt2 * localT * midZ + 3 * mt * t2 * midZ * 0.3 + t3 * startZ;
        return optionalTarget.set(x, y, z);
      }
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

function buildChainGeometry({ rng, quality = 'mid', radius = 0.24, numLinks = 4 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.5;
  const linkOffsetY = -2.0;
  const effectiveStep = Math.abs(linkOffsetY);
  const tubeRadius = radius * 0.9;
  const geoms = [];

  for (let i = 0; i < numLinks; i++) {
    const isEven = i % 2 === 0;
    const baseY = -i * effectiveStep;
    
    let center, normal;
    if (isEven) {
      center = new THREE.Vector3(0, baseY, 0);
      normal = new THREE.Vector3(0, 0, 1);
    } else {
      center = new THREE.Vector3(0, baseY + linkOffsetY + effectiveStep, 0);
      normal = new THREE.Vector3(1, 0, 0);
    }

    const curve = new PlanarWobbleCircleCurve({ radius: R, center, normal, waves: 3, amp: 0.05 });
    const g = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);

    const colors = new Float32Array(g.attributes.position.count * 3);
    const hue = (i / numLinks) * 0.8;
    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
    for (let j = 0; j < g.attributes.position.count; j++) {
      colors[j*3] = color.r; colors[j*3+1] = color.g; colors[j*3+2] = color.b;
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
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const R = 1.5;
  const ratio = 1.6;
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
    { center: new THREE.Vector3(0, 0, 0), xAxis: new THREE.Vector3(0, 1, 0), yAxis: new THREE.Vector3(0, 0, 1) },
    { center: new THREE.Vector3(0, 0, 0), xAxis: new THREE.Vector3(1, 0, 0), yAxis: new THREE.Vector3(0, 0, 1) },
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
    anisotropicScale = [1, 1, 1],
  } = options;
  
  const localRng = rng || makeRng(String(Date.now()));
  const tubeRadius = radius * 0.85;
  
  let geometry = null;
  
  switch (knotType) {
    case 'unknot':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new CircleCurve({ radius: 1.0 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'twisted_ring':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TwistedRingCurve({
          R: 1.0,
          twist: 2 + Math.floor(localRng() * 5),
          wobble: 0.18 + localRng() * 0.18,
          height: 0.3 + localRng() * 0.25,
        }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'spiral_disk':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new SpiralLoopCurve({
          // 保守参数，避免自交：较小圈数、较大间距、简单连接
          turns: 1.6 + localRng() * 0.8,          // 约 1.6 - 2.4 圈
          pitch: 0.12 + localRng() * 0.08,        // 垂向间距
          innerRadius: 0.35,
          radialGap: 0.28 + localRng() * 0.08,    // 水平间距更大
          connectorComplexity: 0,                 // 直连，最不易自交
        }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'kinky_unknot':
      geometry = buildKinkyUnknotGeometry({ rng: localRng, quality, radius: tubeRadius });
      break;
      
    case 'trefoil':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 2, q: 3, R: 1.0, r: 0.4 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'figure8': {
      const hasCurve = Curves && typeof Curves['FigureEightPolynomialKnot'] === 'function';
      const makeCurve = hasCurve
        ? () => new Curves['FigureEightPolynomialKnot']()
        : () => new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.35 });
      geometry = estimateAndNormalizeTube({
        makeCurve,
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
    }
      
    case 'torus_2_5':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 2, q: 5, R: 1.0, r: 0.38 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'torus_2_7':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 2, q: 7, R: 1.0, r: 0.35 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'torus_2_9':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 2, q: 9, R: 1.0, r: 0.32 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'torus_3_4':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.35 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'torus_3_5':
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new TorusKnotCurve({ p: 3, q: 5, R: 1.0, r: 0.32 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
      break;
      
    case 'hopf_link':
      geometry = buildHopfLinkGeometry({ rng: localRng, quality, radius: tubeRadius });
      break;
      
    case 'unlinked_rings':
      geometry = buildUnlinkedRingsGeometry({ rng: localRng, quality, radius: tubeRadius });
      break;
      
    case 'chain':
      geometry = buildChainGeometry({ rng: localRng, quality, radius: tubeRadius, numLinks: 4 });
      break;
      
    case 'borromean':
      geometry = buildBorromeanRingsGeometry({ rng: localRng, quality, radius: tubeRadius });
      break;
      
    default:
      // Fallback to circle
      geometry = estimateAndNormalizeTube({
        makeCurve: () => new CircleCurve({ radius: 1.0 }),
        closed: true,
        quality,
        radius: tubeRadius,
        targetOuterRadius: 1.35,
      });
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
    anisotropicScale: imageParams.anisotropicScale || [1, 1, 1],
  });
  
  // 确保几何体有顶点颜色 - 这是 knot_gallery.html 渲染效果的关键
  ensureVertexColors(geometry, imageParams.color || '#72e6ff');
  
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
  
  // 居中并统一缩放到目标包围球（保持各向同性，禁止额外随机缩放）
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius || 1;
  const targetRadius = 1.8;
  const scale = targetRadius / radius;
  mesh.scale.setScalar(scale); // 仅等比缩放
  // 强制保持单位各向同性（禁止 anisotropicScale）
  mesh.scale.set(1, 1, 1);
  
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
