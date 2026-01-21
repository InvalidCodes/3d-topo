import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CurveExtras from 'three/addons/curves/CurveExtras.js';

// CurveExtras 在不同 three 版本里导出形态略有差异：
// - 有的版本是导出一个 Curves 对象：{ Curves: { TrefoilKnot, ... } }
// - 有的版本是直接导出各个 Curve 类
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
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
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

// ============= Curves / Presets =============
class TorusKnotCurve extends THREE.Curve {
  constructor({ p = 2, q = 3, R = 1.0, r = 0.35 } = {}) {
    super();
    this.p = p;
    this.q = q;
    this.R = R;
    this.r = r;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const phi = t * Math.PI * 2;
    const { p, q, R, r } = this;
    const cq = Math.cos(q * phi);
    const sq = Math.sin(q * phi);
    const cp = Math.cos(p * phi);
    const sp = Math.sin(p * phi);
    const radial = R + r * cq;
    return optionalTarget.set(radial * cp, radial * sp, r * sq);
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
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return optionalTarget
      .copy(this.center)
      .addScaledVector(this.u, this.radius * ca)
      .addScaledVector(this.v, this.radius * sa);
  }
}

// “扭来扭去的环”：本质还是一个环，但在半径/高度上做周期扰动（看起来会扭曲/波浪）。
class TwistedRingCurve extends THREE.Curve {
  constructor({ R = 1.0, twist = 3, wobble = 0.22, height = 0.35 } = {}) {
    super();
    this.R = R;
    this.twist = twist;
    this.wobble = wobble;
    this.height = height;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const k = this.twist;
    const rr = this.R * (1 + this.wobble * Math.sin(k * a));
    const z = this.height * Math.cos(k * a);
    return optionalTarget.set(rr * Math.cos(a), rr * Math.sin(a), z);
  }
}

class WavyRingCurve extends THREE.Curve {
  constructor({ R = 1.0, waves = 7, amp = 0.22 } = {}) {
    super();
    this.R = R;
    this.waves = waves;
    this.amp = amp;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const w = this.waves;
    const radial = this.R + this.amp * Math.sin(w * a);
    const z = this.amp * Math.cos(w * a) * 0.8;
    return optionalTarget.set(radial * Math.cos(a), radial * Math.sin(a), z);
  }
}

// 平面内“轻微变形”的圆：保持在同一平面里（不会像 TwistedRing 那样离平面“抬起来”导致穿模风险陡增）
class PlanarWobbleCircleCurve extends THREE.Curve {
  constructor({
    radius = 1.0,
    center = new THREE.Vector3(0, 0, 0),
    normal = new THREE.Vector3(0, 0, 1),
    waves = 3,
    amp = 0.06,
    phase = 0.0,
  } = {}) {
    super();
    this.radius = radius;
    this.center = center.clone();
    this.normal = normal.clone().normalize();
    this.waves = waves;
    this.amp = amp;
    this.phase = phase;
    const tmp = Math.abs(this.normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.u = new THREE.Vector3().crossVectors(this.normal, tmp).normalize();
    this.v = new THREE.Vector3().crossVectors(this.normal, this.u).normalize();
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const r = this.radius * (1 + this.amp * Math.sin(this.waves * a + this.phase));
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return optionalTarget
      .copy(this.center)
      .addScaledVector(this.u, r * ca)
      .addScaledVector(this.v, r * sa);
  }
}

// “盘状螺旋”：类似图二左下那种“盘起来的环”
class SpiralDiskCurve extends THREE.Curve {
  constructor({ turns = 3.5, R0 = 0.15, R1 = 1.25, zAmp = 0.08 } = {}) {
    super();
    this.turns = turns;
    this.R0 = R0;
    this.R1 = R1;
    this.zAmp = zAmp;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const a = t * Math.PI * 2 * this.turns;
    const r = this.R0 + (this.R1 - this.R0) * t;
    const z = this.zAmp * Math.sin(a * 0.65);
    return optionalTarget.set(r * Math.cos(a), r * Math.sin(a), z);
  }
}

function hasCurveExtras(name) {
  return Curves && typeof Curves[name] === 'function';
}
function makeCurveExtras(name) {
  const C = Curves[name];
  return new C();
}

// 精简到“图二那几类”：
// - 环、三叶结、8字结、扭曲环、盘状螺旋、两环相扣、两环不相扣、锁链
const PRESETS = [
  { id: 'ring', name: '环（Ring）', kind: 'curve', make: () => new CircleCurve({ radius: 1.0 }) },
  { id: 'twisted_ring', name: '扭曲环（Twisted Ring）', kind: 'curve', make: () => new TwistedRingCurve({ R: 1.0, twist: 3, wobble: 0.22, height: 0.35 }) },
  { id: 'spiral_disk', name: '盘状螺旋（Spiral Disk）', kind: 'curve', make: () => new SpiralDiskCurve({ turns: 3.6, R0: 0.12, R1: 1.35, zAmp: 0.07 }) },

  // 三叶结：优先用 CurveExtras，缺失则用 torus-knot 替代
  { id: 'trefoil', name: '三叶结（Trefoil）', kind: 'preferExtras', extrasName: 'TrefoilKnot', fallback: () => new TorusKnotCurve({ p: 2, q: 3, R: 1.0, r: 0.35 }) },
  { id: 'figure8', name: '8字结（Figure-8）', kind: 'preferExtras', extrasName: 'FigureEightPolynomialKnot', fallback: () => new TorusKnotCurve({ p: 3, q: 4, R: 1.0, r: 0.33 }) },

  // "两环相扣"：真正的 Hopf link（物理意义上穿过对方的洞）
  { id: 'hopf_link_real', name: '两环相扣（Hopf Link）', kind: 'hopfReal' },

  // "两环不相扣"：两个独立的环，不穿模也不相扣
  { id: 'hopf_link_unlinked', name: '两环不相扣（Unlinked）', kind: 'hopfUnlinked' },

  // "锁链"：一环扣一环的链条
  { id: 'chain', name: '锁链（Chain Link）', kind: 'chain' },

  // "Borromean Rings"：三个环互相穿越，但任意两个不相扣
  { id: 'borromean', name: 'Borromean Rings（博罗米恩环）', kind: 'borromean' },

  // "全部种类"：混合展示（仍保留，方便一键生成图二）
  { id: 'all', name: '全部种类（All）', kind: 'all' },
];

function getUsablePresets() {
  const usable = [];
  for (const p of PRESETS) {
    usable.push(p);
  }
  return usable;
}

function tubeQualityParams(q) {
  // tubularSegments 越高越细；radialSegments 影响截面圆的细分
  if (q === 'high') return { tubularSegments: 280, radialSegments: 18 };
  if (q === 'mid') return { tubularSegments: 200, radialSegments: 14 };
  return { tubularSegments: 120, radialSegments: 10 };
}

function mergeBufferGeometries(geoms) {
  // 只处理“同属性集合”的 BufferGeometry；本项目里只会用于 TubeGeometry（position/normal/uv）
  const valid = geoms.filter(Boolean);
  if (!valid.length) return null;
  const out = new THREE.BufferGeometry();
  const attrs = Object.keys(valid[0].attributes);
  for (const a of attrs) {
    const arrays = valid.map((g) => g.attributes[a].array);
    const itemSize = valid[0].attributes[a].itemSize;
    const totalLen = arrays.reduce((s, arr) => s + arr.length, 0);
    const merged = new arrays[0].constructor(totalLen);
    let off = 0;
    for (const arr of arrays) {
      merged.set(arr, off);
      off += arr.length;
    }
    out.setAttribute(a, new THREE.BufferAttribute(merged, itemSize));
  }
  // index
  const hasIndex = valid.every((g) => g.index && g.index.array);
  if (hasIndex) {
    const indexArrays = valid.map((g) => g.index.array);
    const IndexCtor = indexArrays[0].constructor;
    const total = indexArrays.reduce((s, arr) => s + arr.length, 0);
    const mergedIndex = new IndexCtor(total);
    let vertexOffset = 0;
    let off = 0;
    for (let gi = 0; gi < valid.length; gi++) {
      const g = valid[gi];
      const idx = g.index.array;
      for (let j = 0; j < idx.length; j++) mergedIndex[off + j] = idx[j] + vertexOffset;
      off += idx.length;
      vertexOffset += g.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
  }
  out.computeVertexNormals();
  return out;
}

function estimateAndNormalizeTube({ makeCurve, closed = true, quality = 'mid', radius = 0.24, targetOuterRadius = 1.25, center = true }) {
  // 先用很细的 tube 估计大小，再用 sNorm 做归一化；最终 tube 粗细仍等于 radius
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  const curve = makeCurve();

  const thin = new THREE.TubeGeometry(curve, tubularSegments, 0.01, radialSegments, closed);
  thin.computeBoundingSphere();
  const bs = thin.boundingSphere;
  const sNorm = bs && bs.radius > 1e-6 ? (targetOuterRadius / bs.radius) : 1.0;
  thin.dispose();

  const baseRadius = radius / sNorm;
  const geom = new THREE.TubeGeometry(curve, tubularSegments, baseRadius, radialSegments, closed);
  geom.scale(sNorm, sNorm, sNorm);
  geom.computeVertexNormals();
  if (center) geom.center();
  geom.computeBoundingSphere();
  return geom;
}

// ========== 真正的 Hopf Link（两环相扣）==========
// 基于用户实测的完美参数：R=1.5, 偏移 (X=0, Y=-2, Z=0)
function buildRealHopfLinkGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);

  // 平面内轻微变形参数（保持拓扑不变）
  const ampMax = 0.12;
  const ampA = rng ? Math.min(ampMax, 0.04 + rng() * 0.08) : 0.08;
  const ampB = rng ? Math.min(ampMax, 0.04 + rng() * 0.08) : 0.08;
  const wavesA = rng ? 2 + Math.floor(rng() * 5) : 3;
  const wavesB = rng ? 2 + Math.floor(rng() * 5) : 3;
  const phaseA = rng ? rng() * Math.PI * 2 : 0;
  const phaseB = rng ? rng() * Math.PI * 2 : 0;

  const R = 1.5; // 环半径（和用户测试一致）
  const tubeRadius = radius * 0.9;

  // 用户实测的完美偏移参数
  const perfectOffsetY = -2.0;

  // A：XY 平面的圆，圆心在原点
  const curveA = new PlanarWobbleCircleCurve({
    radius: R,
    center: new THREE.Vector3(0, 0, 0),
    normal: new THREE.Vector3(0, 0, 1),
    waves: wavesA,
    amp: ampA,
    phase: phaseA,
  });

  // B：YZ 平面的圆，应用完美偏移 (0, -2, 0)
  const curveB = new PlanarWobbleCircleCurve({
    radius: R,
    center: new THREE.Vector3(0, perfectOffsetY, 0),
    normal: new THREE.Vector3(1, 0, 0),
    waves: wavesB,
    amp: ampB,
    phase: phaseB,
  });

  // 直接生成 tube，保持相对位置（不做单独归一化）
  const a = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, radialSegments, true);
  const b = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, radialSegments, true);

  // 为两个环着不同的颜色
  const posA = a.attributes.position;
  const colorsA = new Float32Array(posA.count * 3);
  for (let i = 0; i < posA.count; i++) {
    colorsA[i * 3] = 1.0; colorsA[i * 3 + 1] = 0.85; colorsA[i * 3 + 2] = 0.85;
  }
  a.setAttribute('color', new THREE.BufferAttribute(colorsA, 3));

  const posB = b.attributes.position;
  const colorsB = new Float32Array(posB.count * 3);
  for (let i = 0; i < posB.count; i++) {
    colorsB[i * 3] = 0.85; colorsB[i * 3 + 1] = 0.9; colorsB[i * 3 + 2] = 1.0;
  }
  b.setAttribute('color', new THREE.BufferAttribute(colorsB, 3));

  const merged = mergeBufferGeometries([a, b]);
  a.dispose();
  b.dispose();

  // 整体居中
  merged.center();
  merged.computeBoundingSphere();

  // 整体缩放到目标尺寸
  const bs = merged.boundingSphere;
  const targetRadius = 1.35;
  const scale = targetRadius / (bs.radius || 1);
  merged.scale(scale, scale, scale);
  merged.computeBoundingSphere();

  return merged;
}

// ========== 两环不相扣 ==========
// 两个独立的环，分开摆放，不穿模也不相扣
function buildUnlinkedRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);

  // 平面内轻微变形参数
  const ampMax = 0.18;
  const ampA = rng ? Math.min(ampMax, 0.08 + rng() * 0.1) : 0.12;
  const ampB = rng ? Math.min(ampMax, 0.08 + rng() * 0.1) : 0.12;
  const wavesA = rng ? 2 + Math.floor(rng() * 5) : 3;
  const wavesB = rng ? 2 + Math.floor(rng() * 5) : 3;
  const phaseA = rng ? rng() * Math.PI * 2 : 0;
  const phaseB = rng ? rng() * Math.PI * 2 : 0;

  const R = 1.0;

  // A：XY 平面的圆，圆心在原点
  const curveA = new PlanarWobbleCircleCurve({
    radius: R,
    center: new THREE.Vector3(0, 0, 0),
    normal: new THREE.Vector3(0, 0, 1),
    waves: wavesA,
    amp: ampA,
    phase: phaseA,
  });

  // B：也在 XY 平面，但圆心偏移到旁边（不穿过 A 的洞）
  const offsetX = rng ? 2.2 + rng() * 0.5 : 2.5;
  const curveB = new PlanarWobbleCircleCurve({
    radius: R,
    center: new THREE.Vector3(offsetX, 0, 0),
    normal: new THREE.Vector3(0, 0, 1),
    waves: wavesB,
    amp: ampB,
    phase: phaseB,
  });

  const tubeRadius = radius * 0.8;
  const a = new THREE.TubeGeometry(curveA, tubularSegments, tubeRadius, radialSegments, true);
  const b = new THREE.TubeGeometry(curveB, tubularSegments, tubeRadius, radialSegments, true);

  // 着色
  const posA = a.attributes.position;
  const colorsA = new Float32Array(posA.count * 3);
  for (let i = 0; i < posA.count; i++) {
    colorsA[i * 3] = 1.0; colorsA[i * 3 + 1] = 0.95; colorsA[i * 3 + 2] = 0.95;
  }
  a.setAttribute('color', new THREE.BufferAttribute(colorsA, 3));

  const posB = b.attributes.position;
  const colorsB = new Float32Array(posB.count * 3);
  for (let i = 0; i < posB.count; i++) {
    colorsB[i * 3] = 0.9; colorsB[i * 3 + 1] = 0.85; colorsB[i * 3 + 2] = 0.85;
  }
  b.setAttribute('color', new THREE.BufferAttribute(colorsB, 3));

  const merged = mergeBufferGeometries([a, b]);
  a.dispose();
  b.dispose();

  merged.center();
  merged.computeBoundingSphere();

  // 整体缩放
  const bs = merged.boundingSphere;
  const targetRadius = 1.35;
  const scale = targetRadius / (bs.radius || 1);
  merged.scale(scale, scale, scale);
  merged.computeBoundingSphere();

  return merged;
}

// ========== 锁链（链条，一环扣一环） ==========
// 支持从界面读取调试参数，让用户手动调整找到完美相扣的位置
function buildChainGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  // 尝试从界面读取调试参数，如果没有则用默认值
  const chainREl = document.getElementById('chainR');
  const chainNumLinksEl = document.getElementById('chainNumLinks');
  const chainOffsetXEl = document.getElementById('chainOffsetX');
  const chainOffsetYEl = document.getElementById('chainOffsetY');
  const chainOffsetZEl = document.getElementById('chainOffsetZ');
  const chainSpacingEl = document.getElementById('chainSpacing');

  // 注意：不能用 || 因为 0 是 falsy，会被忽略
  const parseVal = (el, fallback) => {
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };
  const parseIntVal = (el, fallback) => {
    if (!el) return fallback;
    const v = parseInt(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  const R = parseVal(chainREl, 1.5);
  const numLinks = parseIntVal(chainNumLinksEl, rng ? 3 + Math.floor(rng() * 4) : 4);
  // 奇数环相对于"前一个偶数环"的偏移（用于相扣）
  const linkOffsetX = parseVal(chainOffsetXEl, 0);
  const linkOffsetY = parseVal(chainOffsetYEl, -2.0);
  const linkOffsetZ = parseVal(chainOffsetZEl, 0);
  // 链条延伸步长（每个环沿 Y 轴递减多少）
  const chainStep = parseVal(chainSpacingEl, 0) * R;
  // 如果 chainStep=0，使用默认步长让环可见
  const effectiveStep = Math.abs(chainStep) < 0.01 ? Math.abs(linkOffsetY) : chainStep;

  const tubeRadius = radius * 0.9;

  const geoms = [];
  for (let i = 0; i < numLinks; i++) {
    const isEven = i % 2 === 0;
    
    // 链条沿 Y 轴向下延伸：每个环的基准 Y 位置
    const baseY = -i * effectiveStep;
    
    let center, normal;
    if (isEven) {
      // 偶数环：XY 平面（法线 Z）
      center = new THREE.Vector3(0, baseY, 0);
      normal = new THREE.Vector3(0, 0, 1);
    } else {
      // 奇数环：YZ 平面（法线 X），相对于"同一高度的偶数环"应用偏移
      // 这样奇数环会穿过前一个偶数环的洞
      center = new THREE.Vector3(linkOffsetX, baseY + linkOffsetY + effectiveStep, linkOffsetZ);
      normal = new THREE.Vector3(1, 0, 0);
    }

    // 平面内轻微波动（不抬离平面，保持孔洞）
    const amp = rng ? 0.04 + rng() * 0.06 : 0.06;
    const waves = rng ? 2 + Math.floor(rng() * 4) : 3;
    const phase = rng ? rng() * Math.PI * 2 : 0;

    const curve = new PlanarWobbleCircleCurve({
      radius: R,
      center,
      normal,
      waves,
      amp,
      phase,
    });

    // 不对单个环做归一化，保持相对位置
    const g = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);

    // 颜色：根据环的索引循环变化，方便观察
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // 使用 HSL 颜色，色相随索引变化
    const hue = (i / numLinks) * 0.8; // 0 ~ 0.8 避免红色重复
    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
    for (let j = 0; j < pos.count; j++) {
      colors[j * 3] = color.r;
      colors[j * 3 + 1] = color.g;
      colors[j * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  const merged = mergeBufferGeometries(geoms);
  geoms.forEach((g) => g.dispose());

  // 整体居中 + 统一缩放
  merged.center();
  merged.computeBoundingSphere();
  const bs = merged.boundingSphere;
  const targetRadius = 1.8;
  const scale = targetRadius / (bs.radius || 1);
  merged.scale(scale, scale, scale);
  merged.computeBoundingSphere();

  return merged;
}

// ========== Borromean Rings（博罗米恩环）==========
// 三个环互相穿越，但任意两个不相扣
// 固定红环在原点 XY 平面，黄环和蓝环可调整偏移
function buildBorromeanRingsGeometry({ rng, quality = 'mid', radius = 0.24 } = {}) {
  const { tubularSegments, radialSegments } = tubeQualityParams(quality);
  
  const parseVal = (el, fallback) => {
    if (!el) return fallback;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : fallback;
  };

  // 基础参数
  const R = parseVal(document.getElementById('borromeanR'), 1.5);
  const ratio = parseVal(document.getElementById('borromeanRatio'), 1.6);
  
  // 黄环偏移（YZ 平面）
  const yellowX = parseVal(document.getElementById('borromeanYellowX'), 0);
  const yellowY = parseVal(document.getElementById('borromeanYellowY'), 0);
  const yellowZ = parseVal(document.getElementById('borromeanYellowZ'), 0);
  
  // 蓝环偏移（XZ 平面）
  const blueX = parseVal(document.getElementById('borromeanBlueX'), 0);
  const blueY = parseVal(document.getElementById('borromeanBlueY'), 0);
  const blueZ = parseVal(document.getElementById('borromeanBlueZ'), 0);
  
  const tubeRadius = radius * 0.85;
  
  // 椭圆参数
  const a = R * ratio;     // 长轴
  const b = R;             // 短轴
  
  // 三个环的颜色：红、黄、蓝（经典配色）
  const ringColors = [
    new THREE.Color(0.95, 0.25, 0.25),   // 红
    new THREE.Color(0.95, 0.85, 0.15),   // 黄
    new THREE.Color(0.25, 0.45, 0.95),   // 蓝
  ];
  
  // 3D 椭圆曲线类
  class EllipseCurve3D extends THREE.Curve {
    constructor({ a, b, center, xAxis, yAxis }) {
      super();
      this.a = a;
      this.b = b;
      this.center = center;
      this.xAxis = xAxis.clone().normalize();
      this.yAxis = yAxis.clone().normalize();
    }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const angle = t * Math.PI * 2;
      const x = this.a * Math.cos(angle);
      const y = this.b * Math.sin(angle);
      return optionalTarget.set(0, 0, 0)
        .addScaledVector(this.center, 1)
        .addScaledVector(this.xAxis, x)
        .addScaledVector(this.yAxis, y);
    }
  }
  
  // 三个环的配置：
  // - 红环：固定在 XY 平面，圆心在原点
  // - 黄环：YZ 平面，可调整偏移
  // - 蓝环：XZ 平面，可调整偏移
  const configs = [
    // 红环：XY 平面（固定）
    { 
      center: new THREE.Vector3(0, 0, 0), 
      xAxis: new THREE.Vector3(1, 0, 0), 
      yAxis: new THREE.Vector3(0, 1, 0) 
    },
    // 黄环：YZ 平面，可调整偏移
    { 
      center: new THREE.Vector3(yellowX, yellowY, yellowZ), 
      xAxis: new THREE.Vector3(0, 1, 0), 
      yAxis: new THREE.Vector3(0, 0, 1) 
    },
    // 蓝环：XZ 平面，可调整偏移
    { 
      center: new THREE.Vector3(blueX, blueY, blueZ), 
      xAxis: new THREE.Vector3(1, 0, 0), 
      yAxis: new THREE.Vector3(0, 0, 1) 
    },
  ];
  
  const geoms = [];
  
  for (let i = 0; i < 3; i++) {
    const cfg = configs[i];
    
    const curve = new EllipseCurve3D({
      a, b,
      center: cfg.center,
      xAxis: cfg.xAxis,
      yAxis: cfg.yAxis,
    });
    
    const g = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);
    
    // 设置顶点颜色
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = ringColors[i];
    for (let j = 0; j < pos.count; j++) {
      colors[j * 3] = color.r;
      colors[j * 3 + 1] = color.g;
      colors[j * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }
  
  const merged = mergeBufferGeometries(geoms);
  geoms.forEach((g) => g.dispose());
  
  // 居中 + 缩放
  merged.center();
  merged.computeBoundingSphere();
  const bs = merged.boundingSphere;
  const targetRadius = 1.8;
  const scale = targetRadius / (bs.radius || 1);
  merged.scale(scale, scale, scale);
  merged.computeBoundingSphere();
  
  return merged;
}

function buildGeometryForPreset(presetId, { rng, quality = 'mid', radius = 0.24 } = {}) {
  const presets = getUsablePresets();
  const p = presets.find((x) => x.id === presetId) || presets[0];

  if (p.id === 'all') return null;

  if (p.kind === 'hopfReal') {
    return buildRealHopfLinkGeometry({ rng, quality, radius });
  }

  if (p.kind === 'hopfUnlinked') {
    return buildUnlinkedRingsGeometry({ rng, quality, radius });
  }

  if (p.kind === 'chain') {
    return buildChainGeometry({ rng, quality, radius });
  }

  if (p.kind === 'borromean') {
    return buildBorromeanRingsGeometry({ rng, quality, radius });
  }

  if (p.kind === 'preferExtras') {
    // 拓扑不变（Trefoil 还是 Trefoil），但通过 CurveExtras 构造函数（如果支持参数）或缩放来实现变体
    const makeCurve = () => (hasCurveExtras(p.extrasName) ? makeCurveExtras(p.extrasName) : p.fallback());
    const geom = estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius, targetOuterRadius: 1.35 });
    // 对基础几何体进行微小的非均匀缩放，制造“变体”感
    if (rng) {
      geom.scale(0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.9 + rng() * 0.2);
    }
    return geom;
  }

  if (p.kind === 'curve') {
    // 螺旋盘、扭曲环等自带参数的随机化
    let makeCurve;
    if (p.id === 'twisted_ring' && rng) {
      makeCurve = () => new TwistedRingCurve({ 
        R: 1.0, 
        twist: 2 + Math.floor(rng() * 5), 
        wobble: 0.1 + rng() * 0.3, 
        height: 0.2 + rng() * 0.4 
      });
    } else if (p.id === 'spiral_disk' && rng) {
      makeCurve = () => new SpiralDiskCurve({ 
        turns: 2.5 + rng() * 2, 
        R0: 0.1 + rng() * 0.1, 
        R1: 1.2 + rng() * 0.3, 
        zAmp: 0.05 + rng() * 0.1 
      });
    } else {
      makeCurve = () => p.make();
    }
    return estimateAndNormalizeTube({ makeCurve, closed: true, quality, radius, targetOuterRadius: 1.35 });
  }

  throw new Error(`Unknown preset: ${presetId}`);
}

function buildAllGeometries({ quality = 'low', radius = 0.22 } = {}) {
  // “all” 模式：每个预设生成一个 geometry，然后实例按种类分批（多 InstancedMesh）
  const presets = getUsablePresets().filter((p) => p.id !== 'all');
  const map = new Map();
  for (const p of presets) {
    let geom;
    try {
      geom = buildGeometryForPreset(p.id, { quality, radius });
    } catch {
      continue;
    }
    map.set(p.id, { preset: p, geometry: geom });
  }
  return map;
}

// ============= Three Scene =============
const viewEl = document.getElementById('view');
const statusEl = document.getElementById('status');
const seedEl = document.getElementById('seed');
const presetEl = document.getElementById('preset');
const countEl = document.getElementById('count');
const colsEl = document.getElementById('cols');
const qualityEl = document.getElementById('quality');
const layoutEl = document.getElementById('layout');
const radiusEl = document.getElementById('radius');
const scaleEl = document.getElementById('scale');
const btnGenerate = document.getElementById('btnGenerate');

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
  // 稍微调亮背景色，避免对比度过低导致颜色发闷
  scene.background = new THREE.Color(0x1a2236);

  const w = viewEl.clientWidth;
  const h = viewEl.clientHeight;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 500);
  camera.position.set(0, 3.2, 6.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
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

  // 强补光：仿照 dataset_generator 的彩色质感
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

  setStatus({
    title: '已初始化',
    three: `${THREE.REVISION} (three@0.160.0 importmap)`,
    presetName: '-',
    count: 0,
  });
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
  // 更亮、更“糖果色”，避免发灰/发黑
  const h = rng();
  const s = 0.72 + 0.22 * rng();
  const l = 0.62 + 0.18 * rng();
  const c = new THREE.Color().setHSL(h, s, l);
  return c;
}

function placeMatrix(m, x, y, z, rx, ry, rz, s) {
  const pos = new THREE.Vector3(x, y, z);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const scl = new THREE.Vector3(s, s, s);
  m.compose(pos, quat, scl);
}

function computeSpacingFromGeometry({ geometry, layout, globalScale }) {
  geometry.computeBoundingSphere();
  const r = (geometry.boundingSphere ? geometry.boundingSphere.radius : 1) * globalScale;
  // 预留：实例里还会随机缩放到 1.2 倍左右，这里直接把“最大”考虑进去
  const maxR = r * 1.25;
  const minGrid = layout === 'field' ? 10.0 : 7.0;
  const base = 2 * maxR * 1.55 + 2.0; // 直径 * 系数 + 额外空隙
  const baseSpacing = Math.max(minGrid, base);
  const jitter =
    layout === 'jitter' ? baseSpacing * 0.22 :
    layout === 'field' ? baseSpacing * 0.55 :
    0.0;
  return { baseSpacing, jitter };
}

function layoutPosition({ i, count, cols, rng, baseSpacing, jitter }) {
  const colsEff = Math.max(1, Math.min(cols, count));
  const rowsEff = Math.max(1, Math.ceil(count / colsEff));
  const row = Math.floor(i / colsEff);
  const col = i % colsEff;

  // 以整体网格中心对齐原点（x/z 都居中）
  const x = (col - (colsEff - 1) * 0.5) * baseSpacing + (rng() - 0.5) * jitter;
  const z = (row - (rowsEff - 1) * 0.5) * baseSpacing + (rng() - 0.5) * jitter;
  return { x, z };
}

function buildInstancedMesh(geometry, { count, cols, rng, layout, globalScale, instanceOffset = 0, totalCount = 0, spacing }) {
  // 如果几何体没有顶点颜色，我们给它补上纯白，防止 vertexColors: true 导致变黑
  if (!geometry.attributes.color) {
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3).fill(1.0);
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
    // 全局索引，用于 layout 计算以保持网格对齐
    const globalIdx = instanceOffset + i;
    const { x, z } =
      finalTotal === 1
        ? { x: 0, z: 0 }
        : layoutPosition({ i: globalIdx, count: finalTotal, cols, rng, baseSpacing, jitter });
    
    const y = 0;
    // 增加随机旋转
    const rx = rng() * Math.PI * 2; 
    const ry = rng() * Math.PI * 2;
    const rz = rng() * Math.PI * 2;
    // 增加随机缩放变体
    const s = globalScale * (0.8 + rng() * 0.4);
    
    placeMatrix(m, x, y, z, rx, ry, rz, s);
    mesh.setMatrixAt(i, m);

    tmpColor.copy(randomBright(rng));
    mesh.setColorAt(i, tmpColor);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function fitCameraToContent({ geometry, count, cols, layout, globalScale, spacing }) {
  // 让内容尽量居中且不超屏幕
  const colsEff = Math.max(1, Math.min(cols, count));
  const rowsEff = Math.max(1, Math.ceil(count / colsEff));
  const { baseSpacing } = spacing || computeSpacingFromGeometry({ geometry, layout, globalScale });

  geometry.computeBoundingSphere();
  const rObj = (geometry.boundingSphere ? geometry.boundingSphere.radius : 1) * globalScale * 1.05;
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
  const seed = String(seedEl.value || 'knot-gallery-v1');
  const rng = makeRng(seed);

  const usablePresets = getUsablePresets();
  const presetId = presetEl.value || usablePresets[0].id;
  const presetName = (usablePresets.find((p) => p.id === presetId) || usablePresets[0]).name;

  const count = parsePositiveInt(countEl.value, 1, { min: 1, max: 5000 });
  const cols = parsePositiveInt(colsEl.value, 6, { min: 1, max: 200 });
  const quality = qualityEl.value || 'low';
  const layout = layoutEl.value || 'grid';
  const radius = parseNumber(radiusEl.value, 0.24, { min: 0.02, max: 0.6 });
  const globalScale = parseNumber(scaleEl.value, 1.0, { min: 0.3, max: 3.0 });

  disposeCurrent();

  try {
    if (presetId === 'all') {
      const byPreset = buildAllGeometries({ quality, radius });
      if (byPreset.size === 0) {
        // ... (错误处理保持不变)
        return;
      }
      // ... (All 模式暂时保持简单，或也可按需增加变体)
      const keys = Array.from(byPreset.keys());
      const perType = Math.max(1, Math.floor(count / keys.length));
      let total = 0;
      let offsetZ = 0;
      // All 模式：先用第一种 geometry 估算 spacing，保证行间距也足够大
      const firstGeom = byPreset.values().next().value?.geometry;
      const spacing = firstGeom ? computeSpacingFromGeometry({ geometry: firstGeom, layout: 'grid', globalScale }) : { baseSpacing: 9.0, jitter: 0.0 };
      for (const k of keys) {
        const item = byPreset.get(k);
        const n = Math.min(perType, count - total);
        if (n <= 0) break;
        const mesh = buildInstancedMesh(item.geometry, {
          count: n,
          cols: Math.min(cols, n),
          rng,
          layout: 'grid',
          globalScale,
          spacing,
        });
        mesh.position.z += offsetZ;
        offsetZ += spacing.baseSpacing;
        root.add(mesh);
        current.meshes.push(mesh);
        current.geometries.push(item.geometry);
        total += n;
      }
      // ... 
      return;
    }

    // 单一预设模式：生成多个变体几何体，让成群的实例看起来不同
    const VARIATION_COUNT = count === 1 ? 1 : Math.min(12, Math.max(3, Math.floor(count / 2)));
    const perVar = Math.ceil(count / VARIATION_COUNT);
    let totalCreated = 0;

    // 用第一个变体计算 spacing，后续所有变体共享同一 spacing（保证网格对齐且间距统一）
    const firstGeometryForSpacing = buildGeometryForPreset(presetId, { rng, quality, radius });
    const spacing = computeSpacingFromGeometry({ geometry: firstGeometryForSpacing, layout, globalScale });
    firstGeometryForSpacing.dispose();

    for (let v = 0; v < VARIATION_COUNT; v++) {
      const numForThisVar = Math.min(perVar, count - totalCreated);
      if (numForThisVar <= 0) break;

      // 为每个变体传入种子 rng，生成不同的形体
      const geometry = buildGeometryForPreset(presetId, { rng, quality, radius });
      
      // 注意：这里的 layoutPosition 需要知道全局的 i，以保持网格整齐
      const mesh = buildInstancedMesh(geometry, { 
        count: numForThisVar, 
        cols, 
        rng, 
        layout, 
        globalScale,
        instanceOffset: totalCreated, // 新增参数，确保实例摆放在全局网格的正确位置
        totalCount: count,
        spacing,
      });
      
      root.add(mesh);
      current.meshes.push(mesh);
      current.geometries.push(geometry);
      totalCreated += numForThisVar;

      if (v === 0) {
        // 仅以第一个变体为准进行相机取景
        fitCameraToContent({ geometry, count, cols, layout, globalScale, spacing });
      }
    }

    setStatus({
      title: '已生成 (含形体变体)',
      three: `${THREE.REVISION}`,
      presetName,
      count,
    });
  } catch (e) {
    // ...
  }
}

function initUI() {
  const usablePresets = getUsablePresets();
  presetEl.innerHTML = usablePresets.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  // 默认就是单品展示：三叶结更符合图二的"典型类"
  const prefer = usablePresets.find((p) => p.id === 'trefoil') || usablePresets[0];
  presetEl.value = prefer.id;

  btnGenerate.addEventListener('click', regenerate);
  presetEl.addEventListener('change', regenerate);
  
  // 链条调试滑块：实时预览
  const chainSliderIds = ['chainR', 'chainNumLinks', 'chainOffsetX', 'chainOffsetY', 'chainOffsetZ', 'chainSpacing'];
  const chainValIds = ['chainRVal', 'chainNumLinksVal', 'chainOffsetXVal', 'chainOffsetYVal', 'chainOffsetZVal', 'chainSpacingVal'];
  const chainFixed = [1, 0, 2, 2, 2, 2];
  
  chainSliderIds.forEach((id, i) => {
    const slider = document.getElementById(id);
    const valSpan = document.getElementById(chainValIds[i]);
    if (slider) {
      // 更新显示值
      const updateDisplay = () => {
        if (valSpan) {
          valSpan.textContent = parseFloat(slider.value).toFixed(chainFixed[i]);
        }
      };
      updateDisplay();
      
      // 监听变化：更新显示 + 重新生成
      slider.addEventListener('input', () => {
        updateDisplay();
        regenerate();
      });
    }
  });
  
  // Borromean Rings 调试滑块：实时预览
  const borromeanSliderIds = [
    'borromeanR', 'borromeanRatio',
    'borromeanYellowX', 'borromeanYellowY', 'borromeanYellowZ',
    'borromeanBlueX', 'borromeanBlueY', 'borromeanBlueZ'
  ];
  const borromeanValIds = [
    'borromeanRVal', 'borromeanRatioVal',
    'borromeanYellowXVal', 'borromeanYellowYVal', 'borromeanYellowZVal',
    'borromeanBlueXVal', 'borromeanBlueYVal', 'borromeanBlueZVal'
  ];
  const borromeanFixed = [2, 2, 2, 2, 2, 2, 2, 2];
  
  borromeanSliderIds.forEach((id, i) => {
    const slider = document.getElementById(id);
    const valSpan = document.getElementById(borromeanValIds[i]);
    if (slider) {
      const updateDisplay = () => {
        if (valSpan) {
          valSpan.textContent = parseFloat(slider.value).toFixed(borromeanFixed[i]);
        }
      };
      updateDisplay();
      
      slider.addEventListener('input', () => {
        updateDisplay();
        regenerate();
      });
    }
  });
  
  // 显示/隐藏调试面板（链条 & Borromean）
  const chainDebugBox = document.getElementById('chainDebugBox');
  const borromeanDebugBox = document.getElementById('borromeanDebugBox');
  const syncDebugBoxes = () => {
    const preset = presetEl.value;
    if (chainDebugBox) chainDebugBox.style.display = preset === 'chain' ? 'block' : 'none';
    if (borromeanDebugBox) borromeanDebugBox.style.display = preset === 'borromean' ? 'block' : 'none';
  };
  presetEl.addEventListener('change', syncDebugBoxes);
  syncDebugBoxes();
}

initThree();
initUI();
animate();
regenerate();


