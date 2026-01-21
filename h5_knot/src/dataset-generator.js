import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CurveExtras from 'three/addons/curves/CurveExtras.js';
import { computeGaussCodeBestProjection } from './gauss-code-generator.js';

// CurveExtras 在不同 three 版本里导出形态略有差异：
// - 有的版本是导出一个 Curves 对象：{ Curves: { TrefoilKnot, ... } }
// - 有的版本是直接导出各个 Curve 类
// 这里做一个兼容层，避免命名导入导致模块直接加载失败（页面看起来“什么也没有”）。
const Curves = CurveExtras.Curves || CurveExtras;

// ============= Deterministic RNG (seeded) =============
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
  const seedFn = xmur3(seedStr);
  return mulberry32(seedFn());
}

function randRange(rng, a, b) {
  return a + (b - a) * rng();
}

function randInt(rng, a, bInclusive) {
  return Math.floor(randRange(rng, a, bInclusive + 1));
}

function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

// ============= Curve Families =============

class TorusKnotCurve extends THREE.Curve {
  constructor({ p = 2, q = 3, R = 1.0, r = 0.35 } = {}) {
    super();
    this.p = p;
    this.q = q;
    this.R = R;
    this.r = r;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    // Standard torus-knot centerline on a torus:
    // x = (R + r*cos(q*phi)) * cos(p*phi)
    // y = (R + r*cos(q*phi)) * sin(p*phi)
    // z = r * sin(q*phi)
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
    // Build an orthonormal basis (u,v) on the plane.
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

// ============= Twisted Ring (unknot with visual twists) =============
class TwistedRingCurve extends THREE.Curve {
  constructor({ radius = 1.0, twists = 2, amplitude = 0.15 } = {}) {
    super();
    this.radius = radius;
    this.twists = twists;       // Number of up-down oscillations
    this.amplitude = amplitude; // Z amplitude of twist
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const phi = t * Math.PI * 2;
    const r = this.radius;
    const z = this.amplitude * Math.sin(this.twists * phi);
    return optionalTarget.set(
      r * Math.cos(phi),
      r * Math.sin(phi),
      z
    );
  }
}

// ============= Spiral Loop (closed spiral - unknot) =============
// A tube spirals outward for `turns` revolutions, then connects back via a connector curve
class SpiralLoopCurve extends THREE.Curve {
  constructor({
    turns = 2,           // Number of spiral turns (1, 2, 4, 8...)
    pitch = 0.15,        // Z height per turn (layer separation)
    innerRadius = 0.3,   // Starting radius
    radialGap = 0.25,    // Gap between adjacent turns
    connectorComplexity = 0, // 0=direct, 1=S-curve, 2=double-S
  } = {}) {
    super();
    this.turns = Math.max(1, turns);
    this.pitch = pitch;
    this.innerRadius = innerRadius;
    this.radialGap = radialGap;
    this.connectorComplexity = connectorComplexity;
    // Spiral fraction: how much of t is used for spiral vs connector
    this.spiralFrac = 0.85;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const spiralFrac = this.spiralFrac;
    const connectorFrac = 1 - spiralFrac;
    
    if (t < spiralFrac) {
      // Spiral outward
      const localT = t / spiralFrac; // 0 to 1 within spiral
      const angle = localT * this.turns * Math.PI * 2;
      const r = this.innerRadius + localT * this.turns * this.radialGap;
      const z = localT * this.turns * this.pitch;
      return optionalTarget.set(r * Math.cos(angle), r * Math.sin(angle), z);
    } else {
      // Connector: return from outer edge back to start
      const localT = (t - spiralFrac) / connectorFrac; // 0 to 1 within connector
      
      // End point of spiral
      const endAngle = this.turns * Math.PI * 2;
      const endR = this.innerRadius + this.turns * this.radialGap;
      const endZ = this.turns * this.pitch;
      const endX = endR * Math.cos(endAngle);
      const endY = endR * Math.sin(endAngle);
      
      // Start point (where spiral begins)
      const startX = this.innerRadius;
      const startY = 0;
      const startZ = 0;
      
      // Connector path based on complexity
      if (this.connectorComplexity === 0) {
        // Direct line (with smooth Z transition)
        const smoothT = localT * localT * (3 - 2 * localT); // smoothstep
        return optionalTarget.set(
          endX + (startX - endX) * smoothT,
          endY + (startY - endY) * smoothT,
          endZ + (startZ - endZ) * smoothT
        );
      } else {
        // S-curve connector: goes up/out then back down
        const midAngle = endAngle / 2;
        const midR = (endR + this.innerRadius) / 2 + this.radialGap * 0.5;
        const midZ = endZ * 0.5 + this.pitch * this.connectorComplexity;
        
        // Cubic Bezier-like blend
        const t2 = localT * localT;
        const t3 = t2 * localT;
        const mt = 1 - localT;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        
        // Control points: end -> mid -> start
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

// ============= Torus Knot T(p,q) Family =============
// Standard torus knot - trefoil is T(2,3), extends to T(2,5), T(2,7), etc.
class TorusKnotPQCurve extends THREE.Curve {
  constructor({ p = 2, q = 3, R = 1.0, r = 0.4 } = {}) {
    super();
    this.p = p;  // winds around torus tube p times
    this.q = q;  // winds around torus center q times
    this.R = R;  // major radius
    this.r = r;  // tube radius
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
  // Minimal crossing number for torus knot T(p,q) = min(p,q) * (max(p,q) - 1)
  static crossingNumber(p, q) {
    const minPQ = Math.min(Math.abs(p), Math.abs(q));
    const maxPQ = Math.max(Math.abs(p), Math.abs(q));
    return minPQ * (maxPQ - 1);
  }
  getCrossingNumber() {
    return TorusKnotPQCurve.crossingNumber(this.p, this.q);
  }
}

// ============= Twist Knot Family (Figure-8 generalization) =============
// Figure-8 is the simplest twist knot. Parameter n controls complexity.
// Twist knots: n=1 -> trefoil-like, n=2 -> figure-8, n=3 -> 5_2, etc.
class TwistKnotCurve extends THREE.Curve {
  constructor({ n = 2, scale = 1.0, twistTightness = 0.3 } = {}) {
    super();
    this.n = Math.max(1, Math.floor(n)); // number of half-twists
    this.scale = scale;
    this.twistTightness = twistTightness;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const tau = t * Math.PI * 2;
    const n = this.n;
    const s = this.scale;
    const tight = this.twistTightness;
    
    // Base figure-8 shape with n half-twists in the loop
    // Parametric formula for twist knots
    const twistFreq = n + 1;
    const baseRadius = 0.8 * s;
    const loopRadius = 0.35 * s;
    
    // Main loop follows a twisted path
    const x = baseRadius * Math.sin(tau) + loopRadius * Math.sin(twistFreq * tau) * tight;
    const y = baseRadius * Math.sin(2 * tau) * 0.5;
    const z = loopRadius * Math.cos(twistFreq * tau) * (1 - tight * 0.5) + 
              0.2 * s * Math.sin(3 * tau);
    
    return optionalTarget.set(x, y, z);
  }
  // Crossing number for twist knot with n half-twists
  getCrossingNumber() {
    return this.n + 2; // Approximate: figure-8 (n=2) has 4 crossings
  }
}

// ============= Kinky Unknot (hard negative - looks complex but is unknot) =============
// Insert k local "kinks" (self-approaching loops) that don't create actual crossings
class KinkyUnknotCurve extends THREE.Curve {
  constructor({
    k = 3,              // number of kinks
    baseRadius = 1.0,
    kinkAmplitude = 0.25,
    kinkTightness = 0.15, // how close the kink segments get
  } = {}) {
    super();
    this.k = Math.max(1, Math.floor(k));
    this.baseRadius = baseRadius;
    this.kinkAmplitude = kinkAmplitude;
    this.kinkTightness = kinkTightness;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const tau = t * Math.PI * 2;
    const k = this.k;
    const r = this.baseRadius;
    const amp = this.kinkAmplitude;
    const tight = this.kinkTightness;
    
    // Base circle
    let x = r * Math.cos(tau);
    let y = r * Math.sin(tau);
    let z = 0;
    
    // Add k kinks: local perturbations that look like crossings
    // Each kink is a local "loop" that goes out and comes back
    for (let i = 0; i < k; i++) {
      const kinkCenter = (i + 0.5) / k; // Position of kink on the curve
      const kinkPhase = kinkCenter * Math.PI * 2;
      
      // Gaussian-like envelope centered at kink position
      const dist = Math.abs(((t - kinkCenter + 0.5) % 1) - 0.5);
      const envelope = Math.exp(-dist * dist / (tight * tight));
      
      // Kink displacement: radial bulge + Z oscillation
      const bulgeDir = Math.sin((i + 1) * tau * 2);
      x += amp * envelope * bulgeDir * Math.cos(kinkPhase);
      y += amp * envelope * bulgeDir * Math.sin(kinkPhase);
      z += amp * 0.8 * envelope * Math.cos((i + 1) * tau * 3 + i);
    }
    
    return optionalTarget.set(x, y, z);
  }
}

// ============= Lissajous Knot Family =============
// Parametric knots from Lissajous curves - can create various knot types
class LissajousKnotCurve extends THREE.Curve {
  constructor({
    nx = 2, ny = 3, nz = 5,
    phaseX = 0, phaseY = 0.5, phaseZ = 0.7,
    scale = 1.0
  } = {}) {
    super();
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.phaseX = phaseX;
    this.phaseY = phaseY;
    this.phaseZ = phaseZ;
    this.scale = scale;
  }
  getPoint(t, optionalTarget = new THREE.Vector3()) {
    const tau = t * Math.PI * 2;
    const s = this.scale;
    return optionalTarget.set(
      s * Math.cos(this.nx * tau + this.phaseX * Math.PI),
      s * Math.cos(this.ny * tau + this.phaseY * Math.PI),
      s * Math.cos(this.nz * tau + this.phaseZ * Math.PI)
    );
  }
}

function listCurveExtras() {
  const names = Object.keys(Curves || {}).filter((k) => typeof Curves[k] === 'function');
  // Prefer knots and closed-ish curves first; fallback to whatever exists.
  const preferred = names.filter((n) => /Knot|Curve/i.test(n));
  return preferred.length ? preferred : names;
}

function safeNewCurveExtras(name) {
  const C = Curves[name];
  // Most CurveExtras classes can be constructed with no args.
  // Some might take a scale or similar; we keep it simple and catch failures.
  return new C();
}

// ============= Geometry perturbation & metrics =============

function deformAlongNormal(geometry, { amp = 0.02, freq = 3.0, phase = 0.0 }) {
  // Light deformation: offset vertices along their normals by a smooth periodic function.
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

function sampleCenterline(curve, n = 256) {
  const pts = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / n;
    curve.getPoint(t, tmp);
    pts.push([tmp.x, tmp.y, tmp.z]);
  }
  return pts;
}

function minNonNeighborDistance(points, neighborSkip = 6, { closed = true } = {}) {
  // points: Array<[x,y,z]>
  // If closed=true, wrap-around neighbors are also skipped by distance in index space.
  const n = points.length;
  if (n < neighborSkip * 2 + 2) return Infinity;
  let minD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const [ax, ay, az] = points[i];
    for (let j = i + 1; j < n; j++) {
      const dj = j - i;
      if (closed) {
        const wrapDj = Math.min(dj, n - dj);
        if (wrapDj <= neighborSkip) continue;
      } else {
        if (dj <= neighborSkip) continue;
      }
      const [bx, by, bz] = points[j];
      const dx = ax - bx;
      const dy = ay - by;
      const dz = az - bz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minD2) minD2 = d2;
    }
  }
  return Math.sqrt(minD2);
}

// ============= Scene setup =============

const viewEl = document.getElementById('view');
const statusEl = document.getElementById('status');
const seedEl = document.getElementById('seed');
const countEl = document.getElementById('count');
const colsEl = document.getElementById('cols');
const familyEl = document.getElementById('family');
const qualityEl = document.getElementById('quality');
const ropeModeEl = document.getElementById('ropeMode');
const knotCountEl = document.getElementById('knotCount');
const knotSpacingEl = document.getElementById('knotSpacing');
const knotArcFracEl = document.getElementById('knotArcFrac');
const transitionLenEl = document.getElementById('transitionLen');
const topologyEl = document.getElementById('topology');
const closedComponentsEl = document.getElementById('closedComponents');
const numLoopsEl = document.getElementById('numLoops');
const loopSpacingEl = document.getElementById('loopSpacing');
const numRopesEl = document.getElementById('numRopes');
const entangleModeEl = document.getElementById('entangleMode');
const ropeKnottedProbEl = document.getElementById('ropeKnottedProb');
const maxLocalKnotsEl = document.getElementById('maxLocalKnots');
const openProbEl = document.getElementById('openProb');
const deformEl = document.getElementById('deform');
const btnGenerate = document.getElementById('btnGenerate');
const btnExport = document.getElementById('btnExport');

// New family-specific UI elements
const easyPctEl = document.getElementById('easyPct');
const mediumPctEl = document.getElementById('mediumPct');
const hardPctEl = document.getElementById('hardPct');
const qMinEl = document.getElementById('qMin');
const qMaxEl = document.getElementById('qMax');
const twistNMinEl = document.getElementById('twistNMin');
const twistNMaxEl = document.getElementById('twistNMax');
const spiralTurnsEl = document.getElementById('spiralTurns');
const spiralPitchEl = document.getElementById('spiralPitch');
const spiralGapEl = document.getElementById('spiralGap');
const spiralConnectorEl = document.getElementById('spiralConnector');
const ringTwistsEl = document.getElementById('ringTwists');
const ringAmplitudeEl = document.getElementById('ringAmplitude');
const kinkCountUIEl = document.getElementById('kinkCount');
const kinkAmplitudeEl = document.getElementById('kinkAmplitude');
const kinkTightnessEl = document.getElementById('kinkTightness');
const lissNxEl = document.getElementById('lissNx');
const lissNyEl = document.getElementById('lissNy');
const lissNzEl = document.getElementById('lissNz');

let scene, camera, renderer, controls;
let root = new THREE.Group();
let lastDataset = null;

function setStatus({ title, three, count, curveCount, extra = '' }) {
  statusEl.innerHTML = `
    <div><b>状态</b>：${title || '-'}</div>
    <div><b>Three</b>：${three || '-'}</div>
    <div><b>样本</b>：${typeof count === 'number' ? count : '-'}</div>
    <div><b>CurveExtras</b>：${typeof curveCount === 'number' ? curveCount : '-'}</div>
    ${extra ? `<div><b>提示</b>：${extra}</div>` : ''}
  `;
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1220);

  const w = viewEl.clientWidth;
  const h = viewEl.clientHeight;
  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 200);
  camera.position.set(0, 6.5, 10.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  viewEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(6, 10, 4);
  scene.add(dir);

  const grid = new THREE.GridHelper(40, 40, 0x2a335a, 0x1a2040);
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
    count: 0,
    curveCount: listCurveExtras().length,
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ============= Dataset generation =============

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

function decideTopology(rng, mode, openProb) {
  if (mode === 'open') return 'open';
  if (mode === 'closed') return 'closed';
  const p = Math.max(0, Math.min(1, openProb));
  return rng() < p ? 'open' : 'closed';
}

function hermite(p0, m0, p1, m1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return new THREE.Vector3()
    .addScaledVector(p0, h00)
    .addScaledVector(m0, h10)
    .addScaledVector(p1, h01)
    .addScaledVector(m1, h11);
}

function sampleCurvePoints(curve, n) {
  const pts = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    curve.getPoint(i / n, tmp);
    pts.push(tmp.clone());
  }
  return pts;
}

function buildMultiKnotOpenCurve(rng, baseCurves, {
  knotCount = 2,
  knotSpacing = 2.5,
  knotArcFrac = 0.75,
  transitionLen = 0.7,
  sampleN = 520,
  pointsPerKnot = 260,
  endStraight = 2.2,
} = {}) {
  // 分段拼接：straight -> knot arc -> transition-to-axis -> spacer -> ... -> straight
  const xAxis = new THREE.Vector3(1, 0, 0);
  const all = [];
  const knotsMeta = [];

  const pushStraight = (len, steps = 18) => {
    const start = all.length ? new THREE.Vector3(...all[all.length - 1]) : new THREE.Vector3(0, 0, 0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      all.push([start.x + len * t, 0, 0]);
    }
  };

  // 起始直线
  pushStraight(endStraight, 20);

  for (let ki = 0; ki < knotCount; ki++) {
    const base = pick(rng, baseCurves);
    const curve = base.curve;

    // 1) 从闭合曲线取一段弧段（结片段）
    const pts = sampleCurvePoints(curve, sampleN);
    const segLen = Math.max(8, Math.min(sampleN - 4, Math.floor(sampleN * Math.max(0.2, Math.min(1, knotArcFrac)))));
    const cutIndex = randInt(rng, 0, sampleN - 1);

    const seg = [];
    for (let i = 0; i < segLen; i++) seg.push(pts[(cutIndex + i) % sampleN].clone());

    // 2) 对齐：把 seg[0] 平移到原点，并旋转让起始切向对齐 +X
    const p0 = seg[0].clone();
    for (const p of seg) p.sub(p0);
    const t0 = seg[1].clone().sub(seg[0]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(t0, xAxis);
    for (const p of seg) p.applyQuaternion(q);

    // 3) 重新采样/平滑：用 CatmullRom 让片段更均匀
    const knotCurve = new THREE.CatmullRomCurve3(seg, false, 'catmullrom', 0.25);
    const knotPts = [];
    for (let i = 0; i < pointsPerKnot; i++) {
      const v = knotCurve.getPoint(i / (pointsPerKnot - 1));
      knotPts.push(v);
    }

    // 4) 拼接到全局点列（以当前末端为起点）
    const start = new THREE.Vector3(...all[all.length - 1]);
    for (let i = 1; i < knotPts.length; i++) {
      const v = knotPts[i];
      all.push([start.x + v.x, v.y, v.z]);
    }

    // 5) 过渡段：把结的末端平滑拉回到 x 轴（y=z=0），便于继续直线/下一个结
    const end = new THREE.Vector3(...all[all.length - 1]);
    const prev = new THREE.Vector3(...all[Math.max(0, all.length - 2)]);
    const tanEnd = end.clone().sub(prev).normalize();
    const p1 = new THREE.Vector3(end.x + transitionLen, 0, 0);
    const m0 = tanEnd.clone().multiplyScalar(transitionLen * 0.7);
    const m1 = xAxis.clone().multiplyScalar(transitionLen * 0.7);
    const steps = 10;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const v = hermite(end, m0, p1, m1, t);
      all.push([v.x, v.y, v.z]);
    }

    // 结间直线间隔
    if (ki !== knotCount - 1) pushStraight(knotSpacing, 14);

    knotsMeta.push({
      family: base.family,
      curveName: base.curveName || null,
      params: base.params || null,
      cutIndex,
      sampleN,
      arcFrac: knotArcFrac,
    });
  }

  // 末端直线
  pushStraight(endStraight, 20);

  const curve = new THREE.CatmullRomCurve3(all.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.25);
  return { curve, knotsMeta };
}

function buildStraightOpenCurve({ length = 8.5, samples = 60, z = 0, y = 0 } = {}) {
  const pts = [];
  const half = length / 2;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = -half + length * t;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
}

function weaveEntangleTwoOpenCurves(curveA, curveB, { amp = 0.25, cycles = 1.0, n = 220 } = {}) {
  // 纯几何构造一个“互缠”段：保持两端固定（sin 在端点为 0），中段做相反相位摆动。
  // 注意：这是 benchmark 的 by-construction ground truth，不追求严格拓扑完备性。
  const ptsA = [];
  const ptsB = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    curveA.getPoint(t, a);
    curveB.getPoint(t, b);
    const s = Math.sin(2 * Math.PI * cycles * t); // endpoints -> 0
    ptsA.push(new THREE.Vector3(a.x, a.y + amp * s, a.z + amp * s * 0.15));
    ptsB.push(new THREE.Vector3(b.x, b.y - amp * s, b.z - amp * s * 0.15));
  }
  return {
    curveA: new THREE.CatmullRomCurve3(ptsA, false, 'catmullrom', 0.25),
    curveB: new THREE.CatmullRomCurve3(ptsB, false, 'catmullrom', 0.25),
  };
}

function buildMultiRopesOpenByConstruction(rng, familyMode, {
  numRopes = 2,
  entangleMode = 'none',
  ropeKnottedProb = 0.5,
  maxLocalKnots = 2,
} = {}) {
  const n = Math.max(2, Math.min(6, Math.floor(numRopes)));
  const prob = Math.max(0, Math.min(1, Number(ropeKnottedProb) || 0));
  const kMax = Math.max(0, Math.min(6, Math.floor(maxLocalKnots)));

  const curves = [];
  const ropesLabels = [];
  const ropeRecipes = [];

  // 让不同 rope 在 z 上分离，默认可分离
  const z0 = -0.8 * (n - 1);
  const dz = 1.6;

  for (let i = 0; i < n; i++) {
    const z = z0 + i * dz;
    const isKnotted = rng() < prob && kMax > 0;
    const k = isKnotted ? randInt(rng, 1, kMax) : 0;

    if (k === 0) {
      curves.push(buildStraightOpenCurve({ z }));
      ropesLabels.push({ is_knotted_open: false, num_local_knots: 0 });
      ropeRecipes.push({ kind: 'straight', z });
      continue;
    }

    // 用现有“多结 open”构造每根 rope（k 个局部结）
    const pool = Math.max(3, Math.min(10, k * 2));
    const baseCurves = [];
    for (let j = 0; j < pool; j++) {
      let fam = familyMode;
      if (familyMode === 'mix') fam = rng() < 0.65 ? 'curveExtras' : 'torusKnot';
      if (familyMode === 'unknot') fam = 'unknot';

      let c = null;
      const baseMeta = { family: fam };
      if (fam === 'unknot') {
        c = new CircleCurve({ radius: randRange(rng, 0.9, 1.2) });
        baseMeta.curveName = 'Circle';
      } else if (fam === 'curveExtras') {
        const names = listCurveExtras();
        let pickedName = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          const name = pick(rng, names);
          try {
            c = safeNewCurveExtras(name);
            pickedName = name;
            break;
          } catch (e) {}
        }
        if (c) baseMeta.curveName = pickedName;
      }
      if (!c) {
        let p = randInt(rng, 2, 9);
        let q = randInt(rng, 2, 9);
        for (let t = 0; t < 10 && gcd(p, q) !== 1; t++) {
          p = randInt(rng, 2, 9);
          q = randInt(rng, 2, 9);
        }
        const R = randRange(rng, 0.85, 1.35);
        const rr = randRange(rng, 0.25, 0.65) * R;
        c = new TorusKnotCurve({ p, q, R, r: rr });
        baseMeta.family = 'torusKnot';
        baseMeta.params = { p, q, R, r: rr };
      }
      baseCurves.push({ ...baseMeta, curve: c });
    }

    const built = buildMultiKnotOpenCurve(rng, baseCurves, {
      knotCount: k,
      knotSpacing: randRange(rng, 1.6, 3.2),
      knotArcFrac: randRange(rng, 0.55, 0.9),
      transitionLen: randRange(rng, 0.5, 1.0),
    });

    // 把整根 rope 平移到对应 z
    const pts = sampleCurvePoints(built.curve, 260).map((v) => v.clone().add(new THREE.Vector3(0, 0, z)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    curves.push(curve);
    ropesLabels.push({ is_knotted_open: true, num_local_knots: k });
    ropeRecipes.push({ kind: 'multiKnot', z, knotCount: k, knots: built.knotsMeta });
  }

  const nonseparablePairs = [];
  if (entangleMode === 'onePair' && n >= 2) {
    // 选一对 rope 做互缠（默认 0,1；也可随机）
    const a = 0;
    const b = 1;
    const woven = weaveEntangleTwoOpenCurves(curves[a], curves[b], { amp: 0.35, cycles: 1.0, n: 240 });
    curves[a] = woven.curveA;
    curves[b] = woven.curveB;
    nonseparablePairs.push([a, b]);
  }

  return { curves, ropesLabels, ropeRecipes, nonseparablePairs };
}

function makeOpenCurveFromClosedCenterline(rng, closedCurve, { sampleN = 420, gapMin = 8, gapMax = 26 } = {}) {
  // 方案1（推荐）：在“中心线/曲线层”剪开闭环，得到 open-ended rope。
  const pts = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < sampleN; i++) {
    const t = i / sampleN;
    closedCurve.getPoint(t, tmp);
    pts.push(tmp.clone());
  }
  const cutIndex = randInt(rng, 0, sampleN - 1);
  const gap = Math.max(gapMin, Math.min(gapMax, randInt(rng, gapMin, gapMax)));

  const reordered = [];
  for (let i = 0; i < sampleN; i++) reordered.push(pts[(cutIndex + i) % sampleN]);
  const openPts = reordered.slice(0, Math.max(2, sampleN - gap));

  const openCurve = new THREE.CatmullRomCurve3(openPts, false, 'catmullrom', 0.3);
  return {
    openCurve,
    cut: { cutIndex, sampleN, gap },
  };
}

function qualityToSegments(quality) {
  if (quality === 'low') return { tubularSegments: 120, radialSegments: 8 };
  if (quality === 'high') return { tubularSegments: 320, radialSegments: 16 };
  return { tubularSegments: 200, radialSegments: 12 };
}

function makeFixedMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    metalness: 0.08,
    roughness: 0.6,
  });
}

function makeMaterial(rng) {
  const hue = randRange(rng, 0.0, 1.0);
  const col = new THREE.Color().setHSL(hue, 0.65, 0.55);
  return new THREE.MeshStandardMaterial({
    color: col,
    metalness: 0.1,
    roughness: 0.55,
  });
}

// ============= Difficulty Level System =============
// Computes difficulty based on multiple metrics for benchmark paper

/**
 * Compute comprehensive difficulty metrics
 * @param {Object} params
 * @param {number} params.crossingNumber - Minimal crossing number of the knot type (C_min)
 * @param {number} params.viewCrossings - Number of crossings in the current view/projection (C_view)
 * @param {number} params.minNonNeighborDist - Minimum non-neighbor segment distance (d_min)
 * @param {number} params.tubeRadius - Tube radius for ratio computation
 * @param {number} params.deformStrength - Applied deformation strength
 * @param {string} params.knotType - Type identifier for special handling
 * @returns {Object} { level: 0|1|2, levelName: string, metrics: {...} }
 */
function computeDifficultyMetrics({
  crossingNumber = 0,
  viewCrossings = 0,
  minNonNeighborDist = Infinity,
  tubeRadius = 0.08,
  deformStrength = 0,
  knotType = 'unknown',
  isKinkyUnknot = false,
  kinkCount = 0,
}) {
  const d = Math.max(0, Math.min(1, deformStrength));
  const dMin = Number.isFinite(minNonNeighborDist) ? minNonNeighborDist : 999;
  const dMinRatio = dMin / (2 * tubeRadius);
  const cMin = crossingNumber || 0;
  const cView = viewCrossings || 0;

  // Difficulty scoring
  let score = 0;
  
  // Crossing number contribution (topological complexity)
  if (cMin >= 7) score += 3;
  else if (cMin >= 5) score += 2;
  else if (cMin >= 3) score += 1;
  
  // View crossings (visual complexity)
  if (cView >= 8) score += 2;
  else if (cView >= 5) score += 1;
  
  // Proximity difficulty (perceptual)
  if (dMinRatio <= 1.15) score += 3;
  else if (dMinRatio <= 1.45) score += 2;
  else if (dMinRatio <= 2.0) score += 1;
  
  // Deformation difficulty
  if (d >= 0.55) score += 2;
  else if (d >= 0.3) score += 1;
  
  // Kinky unknot is especially hard (looks complex but is unknot)
  if (isKinkyUnknot && kinkCount >= 3) score += 2;
  else if (isKinkyUnknot && kinkCount >= 2) score += 1;

  // Map to levels
  let level, levelName;
  if (score >= 5) {
    level = 2;
    levelName = 'hard';
  } else if (score >= 2) {
    level = 1;
    levelName = 'medium';
  } else {
    level = 0;
    levelName = 'easy';
  }

  return {
    level,
    levelName,
    score,
    metrics: {
      C_min: cMin,
      C_view: cView,
      d_min: dMin,
      d_min_ratio: dMinRatio,
      deform_strength: d,
      is_kinky_unknot: isKinkyUnknot,
      kink_count: kinkCount,
    },
  };
}

function computeDifficultyBucket({ deformStrength, minNonNeighborDistOverTube, crossingNumber = 0, isKinkyUnknot = false, kinkCount = 0 }) {
  // Simplified bucket for backward compatibility
  const result = computeDifficultyMetrics({
    crossingNumber,
    minNonNeighborDist: minNonNeighborDistOverTube * 0.16, // approximate tube radius
    tubeRadius: 0.08,
    deformStrength,
    isKinkyUnknot,
    kinkCount,
  });
  return result.levelName;
}

function shuffleInPlace(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function createEndpointMarkers({ head, tail, color = 0xffd200, radius = 0.05 }) {
  const geo = new THREE.SphereGeometry(radius, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color });
  const headMesh = new THREE.Mesh(geo, mat);
  const tailMesh = new THREE.Mesh(geo, mat);
  headMesh.position.set(head[0], head[1], head[2]);
  tailMesh.position.set(tail[0], tail[1], tail[2]);
  return [headMesh, tailMesh];
}

function randomTransform(rng) {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(randRange(rng, 0, Math.PI), randRange(rng, 0, Math.PI), randRange(rng, 0, Math.PI))
  );
  const s = new THREE.Vector3(randRange(rng, 0.75, 1.45), randRange(rng, 0.75, 1.45), randRange(rng, 0.65, 1.35));
  return { quaternion: q, scale: s };
}

function buildMultiLoopByConstruction(rng, { mode, numLoops, loopSpacing }) {
  // 工程化策略：不做通用拓扑求解；直接“按构造”生成，并输出 linking_pairs 真值。
  // mode:
  // - unlinked: 所有环远离、同向 => 可分离
  // - hopf_pairs: 将环随机两两配对，每对做 Hopf link；不同对之间拉远 => 只产生这些 linking_pairs
  const n = Math.max(2, Math.min(8, Math.floor(numLoops)));
  const spacing = Math.max(0.5, Math.min(10, Number(loopSpacing) || 3.0));

  const curves = [];
  const componentRecipe = [];
  const linkingPairs = [];

  const baseRadius = randRange(rng, 0.85, 1.15);
  const far = 4.5 * spacing;

  if (mode === 'unlinked') {
    for (let i = 0; i < n; i++) {
      const center = new THREE.Vector3(i * spacing, 0, 0);
      const normal = new THREE.Vector3(0, 0, 1);
      curves.push(new CircleCurve({ radius: baseRadius, center, normal }));
      componentRecipe.push({ type: 'unknot', curve: 'Circle', params: { radius: baseRadius, center: [center.x, 0, 0], normal: [0, 0, 1] } });
    }
    return { curves, componentRecipe, linkingPairs };
  }

  // hopf_pairs
  const ids = shuffleInPlace(rng, Array.from({ length: n }, (_, i) => i));
  const pairs = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);

  // Place each pair in its own "island" to avoid unintended extra linkings.
  // Hopf construction: two circles in perpendicular planes with small offset.
  const pairIslands = pairs.length;
  const islandSpacing = far;
  const centers = new Array(n).fill(null);
  const normals = new Array(n).fill(null);

  for (let pi = 0; pi < pairIslands; pi++) {
    const [a, b] = pairs[pi];
    const baseX = pi * islandSpacing;
    const r = baseRadius;
    // circle a: plane normal z, centered at origin of island
    centers[a] = new THREE.Vector3(baseX, 0, 0);
    normals[a] = new THREE.Vector3(0, 0, 1);
    // circle b: plane normal x, slightly offset along x so they don't intersect
    centers[b] = new THREE.Vector3(baseX + 0.55 * r, 0, 0);
    normals[b] = new THREE.Vector3(1, 0, 0);
    linkingPairs.push([a, b]);
  }

  // If odd loop remains, place it far away (unlinked)
  for (let i = 0; i < n; i++) {
    if (!centers[i]) {
      const baseX = pairIslands * islandSpacing + (i - pairIslands * 2) * spacing;
      centers[i] = new THREE.Vector3(baseX, 0, 0);
      normals[i] = new THREE.Vector3(0, 0, 1);
    }
  }

  // Build curves in index order (0..n-1), so linking_pairs uses same indices.
  for (let i = 0; i < n; i++) {
    const c = centers[i];
    const nn = normals[i];
    curves.push(new CircleCurve({ radius: baseRadius, center: c, normal: nn }));
    componentRecipe.push({ type: 'unknot', curve: 'Circle', params: { radius: baseRadius, center: [c.x, c.y, c.z], normal: [nn.x, nn.y, nn.z] } });
  }

  return { curves, componentRecipe, linkingPairs };
}

function generateOneSample({ rng, familyMode, segments, deformStrength, topologyMode, openProb, closedComponentsMode, benchmarkLevel = null }) {
  let family = familyMode;
  
  // Handle benchmark mode: pick family based on difficulty level
  if (familyMode === 'benchmark' && benchmarkLevel !== null) {
    if (benchmarkLevel === 0) {
      // Easy: unknot, trefoil, figure-8
      const easyOptions = ['unknot', 'trefoil', 'figure8'];
      family = pick(rng, easyOptions);
    } else if (benchmarkLevel === 1) {
      // Medium: T(2,5-7), twist n=2-3
      const mediumOptions = ['torusKnot2q_medium', 'twistKnot_medium'];
      family = pick(rng, mediumOptions);
    } else {
      // Hard: kinky unknot, high crossing knots
      const hardOptions = ['kinkyUnknot', 'torusKnot2q_hard', 'twistKnot_hard'];
      family = pick(rng, hardOptions);
    }
  } else if (familyMode === 'mix') {
    // Original mix behavior with extended options
    const mixOptions = ['curveExtras', 'torusKnot', 'torusKnot2q', 'twistKnot', 'spiralLoop', 'twistedRing'];
    family = pick(rng, mixOptions);
  }

  const tubeRadius = randRange(rng, 0.05, 0.12);
  const ropeMode = (ropeModeEl && ropeModeEl.value) || 'single';
  const topology = ropeMode === 'multi' || ropeMode === 'multiRope' ? 'open' : decideTopology(rng, topologyMode, openProb);
  const isClosed = topology === 'closed';

  let meta = { family };
  let crossingNumber = 0;
  let isKinkyUnknot = false;
  let actualKinkCount = 0;
  const componentCurves = [];
  const componentRecipe = [];

  // Closed multi-loop buckets (by construction): unlinked2 / hopf
  let multiLoopInfo = null;
  if (ropeMode === 'single' && isClosed && closedComponentsMode && closedComponentsMode !== 'single') {
    const numLoops = parsePositiveInt(numLoopsEl && numLoopsEl.value, 2, { min: 2, max: 8 });
    const loopSpacing = parseNumber(loopSpacingEl && loopSpacingEl.value, 3.0, { min: 0, max: 10 });
    const built = buildMultiLoopByConstruction(rng, { mode: closedComponentsMode, numLoops, loopSpacing });
    componentCurves.push(...built.curves);
    componentRecipe.push(...built.componentRecipe);
    multiLoopInfo = { mode: closedComponentsMode, numLoops, loopSpacing, linkingPairs: built.linkingPairs };
    meta.family = 'multiLoop';
    meta.closedComponents = closedComponentsMode;
  } else {
    // Single component curve selection
    let curve = null;
    
    // === UNKNOT / CIRCLE ===
    if (familyMode === 'unknot' || family === 'unknot') {
      curve = new CircleCurve({ radius: 1.0, center: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 0, 1) });
      meta.family = 'unknot';
      meta.knotType = 'unknot';
      crossingNumber = 0;
    }
    
    // === TREFOIL (T(2,3)) ===
    else if (family === 'trefoil') {
      curve = new TorusKnotPQCurve({ p: 2, q: 3, R: 1.0, r: 0.4 });
      meta.family = 'torusKnot';
      meta.knotType = 'trefoil';
      meta.params = { p: 2, q: 3, R: 1.0, r: 0.4 };
      crossingNumber = 3;
    }
    
    // === FIGURE-8 (simplest twist knot) ===
    else if (family === 'figure8') {
      curve = new TwistKnotCurve({ n: 2, scale: 1.0 });
      meta.family = 'twistKnot';
      meta.knotType = 'figure8';
      meta.params = { n: 2 };
      crossingNumber = 4;
    }
    
    // === TORUS KNOT T(2,q) SERIES ===
    else if (family === 'torusKnot2q' || family === 'torusKnot2q_medium' || family === 'torusKnot2q_hard') {
      let qMin = parsePositiveInt(qMinEl && qMinEl.value, 3, { min: 3, max: 15 });
      let qMax = parsePositiveInt(qMaxEl && qMaxEl.value, 9, { min: 3, max: 15 });
      
      if (family === 'torusKnot2q_medium') {
        qMin = 5; qMax = 7;
      } else if (family === 'torusKnot2q_hard') {
        qMin = 9; qMax = 13;
      }
      
      // q must be odd and coprime with 2
      const validQs = [];
      for (let q = qMin; q <= qMax; q += 2) {
        if (gcd(2, q) === 1) validQs.push(q);
      }
      const q = validQs.length > 0 ? pick(rng, validQs) : 3;
      
      curve = new TorusKnotPQCurve({ p: 2, q, R: 1.0, r: 0.4 });
      meta.family = 'torusKnot';
      meta.knotType = `T(2,${q})`;
      meta.params = { p: 2, q, R: 1.0, r: 0.4 };
      crossingNumber = TorusKnotPQCurve.crossingNumber(2, q);
    }
    
    // === TWIST KNOT FAMILY ===
    else if (family === 'twistKnot' || family === 'twistKnot_medium' || family === 'twistKnot_hard') {
      let nMin = parsePositiveInt(twistNMinEl && twistNMinEl.value, 1, { min: 1, max: 8 });
      let nMax = parsePositiveInt(twistNMaxEl && twistNMaxEl.value, 5, { min: 1, max: 8 });
      
      if (family === 'twistKnot_medium') {
        nMin = 2; nMax = 3;
      } else if (family === 'twistKnot_hard') {
        nMin = 4; nMax = 7;
      }
      
      const n = randInt(rng, nMin, nMax);
      curve = new TwistKnotCurve({ n, scale: 1.0, twistTightness: randRange(rng, 0.25, 0.4) });
      meta.family = 'twistKnot';
      meta.knotType = n === 2 ? 'figure8' : `twist_${n}`;
      meta.params = { n };
      crossingNumber = n + 2;
    }
    
    // === SPIRAL LOOP (closed spiral - unknot) ===
    else if (family === 'spiralLoop') {
      const turns = parsePositiveInt(spiralTurnsEl && spiralTurnsEl.value, 3, { min: 1, max: 8 });
      const pitch = parseNumber(spiralPitchEl && spiralPitchEl.value, 0.12, { min: 0, max: 0.5 });
      const radialGap = parseNumber(spiralGapEl && spiralGapEl.value, 0.2, { min: 0.1, max: 0.5 });
      const connectorComplexity = parsePositiveInt(spiralConnectorEl && spiralConnectorEl.value, 1, { min: 0, max: 2 });
      
      curve = new SpiralLoopCurve({ turns, pitch, innerRadius: 0.3, radialGap, connectorComplexity });
      meta.family = 'spiralLoop';
      meta.knotType = 'unknot'; // Topologically unknot
      meta.params = { turns, pitch, radialGap, connectorComplexity };
      crossingNumber = 0; // It's an unknot
    }
    
    // === TWISTED RING (unknot with visual twists) ===
    else if (family === 'twistedRing') {
      const twists = parsePositiveInt(ringTwistsEl && ringTwistsEl.value, 3, { min: 1, max: 8 });
      const amplitude = parseNumber(ringAmplitudeEl && ringAmplitudeEl.value, 0.15, { min: 0.05, max: 0.4 });
      
      curve = new TwistedRingCurve({ radius: 1.0, twists, amplitude });
      meta.family = 'twistedRing';
      meta.knotType = 'unknot';
      meta.params = { twists, amplitude };
      crossingNumber = 0;
    }
    
    // === KINKY UNKNOT (hard negative) ===
    else if (family === 'kinkyUnknot') {
      const k = parsePositiveInt(kinkCountUIEl && kinkCountUIEl.value, 4, { min: 1, max: 8 });
      const kinkAmp = parseNumber(kinkAmplitudeEl && kinkAmplitudeEl.value, 0.25, { min: 0.1, max: 0.5 });
      const kinkTight = parseNumber(kinkTightnessEl && kinkTightnessEl.value, 0.12, { min: 0.05, max: 0.3 });
      
      curve = new KinkyUnknotCurve({ k, baseRadius: 1.0, kinkAmplitude: kinkAmp, kinkTightness: kinkTight });
      meta.family = 'kinkyUnknot';
      meta.knotType = 'unknot';
      meta.params = { k, kinkAmplitude: kinkAmp, kinkTightness: kinkTight };
      crossingNumber = 0; // Topologically unknot despite visual complexity
      isKinkyUnknot = true;
      actualKinkCount = k;
    }
    
    // === LISSAJOUS KNOT ===
    else if (family === 'lissajous') {
      const nx = parsePositiveInt(lissNxEl && lissNxEl.value, 2, { min: 1, max: 5 });
      const ny = parsePositiveInt(lissNyEl && lissNyEl.value, 3, { min: 1, max: 7 });
      const nz = parsePositiveInt(lissNzEl && lissNzEl.value, 5, { min: 1, max: 9 });
      
      curve = new LissajousKnotCurve({
        nx, ny, nz,
        phaseX: randRange(rng, 0, 1),
        phaseY: randRange(rng, 0, 1),
        phaseZ: randRange(rng, 0, 1),
        scale: 1.0
      });
      meta.family = 'lissajous';
      meta.knotType = `lissajous_${nx}_${ny}_${nz}`;
      meta.params = { nx, ny, nz };
      // Lissajous knot crossing number is complex to compute
      crossingNumber = Math.min(nx * ny, ny * nz, nx * nz);
    }
    
    // === CURVE EXTRAS (original) ===
    else if (family === 'curveExtras') {
      const names = listCurveExtras();
      let pickedName = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const name = pick(rng, names);
        try {
          curve = safeNewCurveExtras(name);
          pickedName = name;
          break;
        } catch (e) {
          // ignore and retry
        }
      }
      if (!curve) {
        family = 'torusKnot';
        meta.family = 'torusKnot';
      } else {
        meta.curveName = pickedName;
        meta.knotType = pickedName;
        // Try to extract crossing number from name
        if (/trefoil/i.test(pickedName)) crossingNumber = 3;
        else if (/cinquefoil/i.test(pickedName)) crossingNumber = 5;
        else crossingNumber = 3; // default estimate
      }
    }
    
    // === TORUS KNOT (original general) ===
    if (family === 'torusKnot' && !curve) {
      let p = randInt(rng, 2, 9);
      let q = randInt(rng, 2, 9);
      for (let i = 0; i < 10 && gcd(p, q) !== 1; i++) {
        p = randInt(rng, 2, 9);
        q = randInt(rng, 2, 9);
      }
      const R = randRange(rng, 0.85, 1.35);
      const rr = randRange(rng, 0.25, 0.65) * R;
      curve = new TorusKnotPQCurve({ p, q, R, r: rr });
      meta.params = { p, q, R, r: rr };
      meta.knotType = `T(${p},${q})`;
      crossingNumber = TorusKnotPQCurve.crossingNumber(p, q);
    }

    // Fallback: if still no curve, use circle
    if (!curve) {
      curve = new CircleCurve({ radius: 1.0 });
      meta.family = 'unknot';
      meta.knotType = 'unknot';
      crossingNumber = 0;
    }

    componentCurves.push(curve);
    componentRecipe.push({
      type: meta.family === 'unknot' || meta.knotType === 'unknot' ? 'unknot' : 'knot',
      curve: meta.curveName ? `CurveExtras.${meta.curveName}` : meta.family,
      knotType: meta.knotType || null,
      params: meta.params || null,
      crossingNumber,
    });
  }
  
  meta.crossingNumber = crossingNumber;
  meta.isKinkyUnknot = isKinkyUnknot;
  meta.kinkCount = actualKinkCount;

  // Determine final curves to sweep (single / multi-loop / multi-knot(open))
  let usedCurves = componentCurves.map((c) => ({ curve: c, isClosed }));
  let openInfo = null;
  let multiRopeInfo = null;

  if (ropeMode === 'multi') {
    // 多结模式：强制 open-ended，且用“分段拼接”的中心线生成整条绳（单组件）
    const knotCount = parsePositiveInt(knotCountEl && knotCountEl.value, 2, { min: 1, max: 8 });
    const knotSpacing = parseNumber(knotSpacingEl && knotSpacingEl.value, 2.5, { min: 0, max: 10 });
    const knotArcFrac = parseNumber(knotArcFracEl && knotArcFracEl.value, 0.75, { min: 0.2, max: 1 });
    const transitionLen = parseNumber(transitionLenEl && transitionLenEl.value, 0.7, { min: 0, max: 5 });

    const baseCurves = [];
    const pool = Math.max(3, Math.min(10, knotCount * 2));
    for (let i = 0; i < pool; i++) {
      let fam = familyMode;
      if (familyMode === 'mix') fam = rng() < 0.65 ? 'curveExtras' : 'torusKnot';
      if (familyMode === 'unknot') fam = 'unknot';

      let c = null;
      const baseMeta = { family: fam };
      if (fam === 'unknot') {
        c = new CircleCurve({ radius: randRange(rng, 0.9, 1.2) });
        baseMeta.curveName = 'Circle';
      } else if (fam === 'curveExtras') {
        const names = listCurveExtras();
        let pickedName = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          const name = pick(rng, names);
          try {
            c = safeNewCurveExtras(name);
            pickedName = name;
            break;
          } catch (e) {}
        }
        if (c) baseMeta.curveName = pickedName;
      }
      if (!c) {
        let p = randInt(rng, 2, 9);
        let q = randInt(rng, 2, 9);
        for (let j = 0; j < 10 && gcd(p, q) !== 1; j++) {
          p = randInt(rng, 2, 9);
          q = randInt(rng, 2, 9);
        }
        const R = randRange(rng, 0.85, 1.35);
        const rr = randRange(rng, 0.25, 0.65) * R;
        c = new TorusKnotCurve({ p, q, R, r: rr });
        baseMeta.family = 'torusKnot';
        baseMeta.params = { p, q, R, r: rr };
      }
      baseCurves.push({ ...baseMeta, curve: c });
    }

    const built = buildMultiKnotOpenCurve(rng, baseCurves, {
      knotCount,
      knotSpacing,
      knotArcFrac,
      transitionLen,
    });
    usedCurves = [{ curve: built.curve, isClosed: false }];
    meta.multiKnot = {
      ropeMode: 'multi',
      knotCount,
      knotSpacing,
      knotArcFrac,
      transitionLen,
      knots: built.knotsMeta,
    };
  } else if (ropeMode === 'multiRope') {
    const numRopes = parsePositiveInt(numRopesEl && numRopesEl.value, 2, { min: 2, max: 6 });
    const entangleMode = (entangleModeEl && entangleModeEl.value) || 'none';
    const ropeKnottedProb = parseNumber(ropeKnottedProbEl && ropeKnottedProbEl.value, 0.5, { min: 0, max: 1 });
    const maxLocalKnots = parsePositiveInt(maxLocalKnotsEl && maxLocalKnotsEl.value, 2, { min: 0, max: 6 });

    const built = buildMultiRopesOpenByConstruction(rng, familyMode, {
      numRopes,
      entangleMode,
      ropeKnottedProb,
      maxLocalKnots,
    });
    usedCurves = built.curves.map((c) => ({ curve: c, isClosed: false }));
    multiRopeInfo = {
      ropeMode: 'multiRope',
      numRopes,
      entangleMode,
      ropeKnottedProb,
      maxLocalKnots,
      ropes: built.ropeRecipes,
      nonseparablePairs: built.nonseparablePairs,
      ropesLabels: built.ropesLabels,
    };
    meta.multiRope = multiRopeInfo;
  } else if (!isClosed) {
    // Single component open: cut from closed curve
    const base = componentCurves[0];
    openInfo = makeOpenCurveFromClosedCenterline(rng, base, { sampleN: 420, gapMin: 8, gapMax: 26 });
    usedCurves = [{ curve: openInfo.openCurve, isClosed: false }];
  } else {
    // closed: keep usedCurves as-is (single or multi-loop)
    usedCurves = componentCurves.map((c) => ({ curve: c, isClosed: true }));
  }

  // Normalize overall scale so the grid is stable across families.
  const bbox = new THREE.Box3();
  const tmp = new THREE.Vector3();
  const centerlines = [];
  for (let ci = 0; ci < usedCurves.length; ci++) {
    const cl = sampleCenterline(usedCurves[ci].curve, 256);
    centerlines.push(cl);
    for (const [x, y, z] of cl) bbox.expandByPoint(tmp.set(x, y, z));
  }
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const normalizeScale = 1.9 / maxDim;

  // Create meshes (1 per component)
  const meshes = [];
  const deform = (() => {
    const strength = Math.max(0, Math.min(1, deformStrength));
    if (strength <= 1e-6) return null;
    const amp = strength * tubeRadius * randRange(rng, 0.6, 1.4);
    const freq = randRange(rng, 2.0, 6.5);
    const phase = randRange(rng, 0, Math.PI * 2);
    return { amp, freq, phase };
  })();

  const compColors = [0x72e6ff, 0xffd08a, 0xff8a8a, 0x8aff8a];
  for (let ci = 0; ci < usedCurves.length; ci++) {
    const geometry = new THREE.TubeGeometry(
      usedCurves[ci].curve,
      segments.tubularSegments,
      tubeRadius,
      segments.radialSegments,
      usedCurves[ci].isClosed
    );
    if (deform) deformAlongNormal(geometry, deform);
    const material = usedCurves.length > 1 ? makeFixedMaterial(compColors[ci % compColors.length]) : makeMaterial(rng);
    meshes.push(new THREE.Mesh(geometry, material));
  }

  // Apply transforms at mesh-level (keeps exported centerline in local curve space + separate transform).
  const t = randomTransform(rng);
  for (const mesh of meshes) {
    mesh.scale.setScalar(normalizeScale);
    mesh.quaternion.copy(t.quaternion);
    mesh.scale.multiply(t.scale);
  }

  // Metrics computed in local curve space (before mesh transforms), so it's comparable across samples.
  let minD = Infinity;
  for (let ci = 0; ci < centerlines.length; ci++) {
    const d = minNonNeighborDistance(centerlines[ci], 6, { closed: usedCurves[ci].isClosed });
    if (d < minD) minD = d;
  }
  if (!Number.isFinite(minD)) minD = Infinity;
  meta.tube = {
    radius: tubeRadius,
    tubularSegments: segments.tubularSegments,
    radialSegments: segments.radialSegments,
    closed: isClosed,
  };
  const primaryCenterline = centerlines[0];
  const endpoints = isClosed
    ? null
    : {
        head: primaryCenterline[0],
        tail: primaryCenterline[primaryCenterline.length - 1],
      };

  meta.topology = { type: isClosed ? 'closed' : 'open', endpoints, cut: openInfo ? openInfo.cut : null };
  meta.transform = {
    // position will be filled by grid placement
    position: [0, 0, 0],
    quaternion: [t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w],
    scale: [meshes[0].scale.x, meshes[0].scale.y, meshes[0].scale.z],
    normalizeScale,
  };
  meta.deform = deform;

  // Compute Gauss code for each component centerline (must be done before labels)
  const gaussCodes = centerlines.map((pts, i) => {
    const isCurClosed = usedCurves[i]?.isClosed ?? isClosed;
    // Convert [x,y,z] array format to {x,y,z} object format if needed
    const normalizedPts = pts.map(p => Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p);
    const result = computeGaussCodeBestProjection(normalizedPts, {
      closed: isCurClosed,
      neighborSkip: 3,
      minSegmentDistance: 4,
    });
    return {
      component: i,
      gaussCode: result.gaussCode,
      gaussTokens: result.gaussTokens,
      numCrossings: result.numCrossings,
      projectionAxis: result.projectionAxis || 'z',
      crossings: result.crossings,
    };
  });

  // Benchmark-ready schema with comprehensive difficulty metrics
  const minRatio = minD / (2 * tubeRadius);
  
  // Get view crossings from Gauss code computation
  const viewCrossings = gaussCodes[0]?.numCrossings || 0;
  
  // Compute comprehensive difficulty
  const difficultyResult = computeDifficultyMetrics({
    crossingNumber: meta.crossingNumber || 0,
    viewCrossings,
    minNonNeighborDist: minD,
    tubeRadius,
    deformStrength: Math.max(0, Math.min(1, deformStrength)),
    knotType: meta.knotType || 'unknown',
    isKinkyUnknot: meta.isKinkyUnknot || false,
    kinkCount: meta.kinkCount || 0,
  });

  const numLoops = isClosed ? usedCurves.length : 0;
  const hasLinking = !!(multiLoopInfo && multiLoopInfo.linkingPairs && multiLoopInfo.linkingPairs.length);
  // Extract primary Gauss code info (first component)
  const primaryGauss = gaussCodes[0] || { gaussCode: '', numCrossings: 0 };

  // Determine if it's actually a knot (topologically)
  const isTopologicallyUnknot = meta.knotType === 'unknot' || 
    meta.family === 'unknot' || 
    meta.family === 'spiralLoop' || 
    meta.family === 'twistedRing' || 
    meta.family === 'kinkyUnknot';

  const labels = {
    topology: isClosed ? 'closed' : 'open',
    rope_mode: ropeMode,
    num_ropes: ropeMode === 'multiRope' ? (multiRopeInfo?.numRopes || usedCurves.length) : 1,
    num_loops: numLoops || null,
    has_linking: isClosed && usedCurves.length > 1 ? hasLinking : null,
    linking_pairs: isClosed && usedCurves.length > 1 ? (multiLoopInfo ? multiLoopInfo.linkingPairs : []) : null,
    is_separable: isClosed && usedCurves.length > 1 ? !hasLinking : null,
    
    // Knot classification (precise)
    is_unknot: isClosed && usedCurves.length === 1 ? isTopologicallyUnknot : null,
    is_knot: isClosed && usedCurves.length === 1 ? !isTopologicallyUnknot : null,
    knot_type: meta.knotType || null,
    knot_family: meta.family || null,
    
    // Crossing numbers
    // - crossing_number_view: 当前选定投影下得到的“结图(diagram)”交叉数（不是不变量）
    // - crossing_number_min: 理论/已知结族的最小交叉数 C_min（不变量；仅当 knot_type/族被正确标注时才可信）
    crossing_number_min: meta.crossingNumber || 0,  // C_min: theoretical minimum (invariant for known families)
    crossing_number_view: viewCrossings,            // C_view: crossings in the chosen projection/diagram
    
    // Torus knot specific
    torus_pq: meta.params && typeof meta.params.p === 'number' ? [meta.params.p, meta.params.q] : null,
    
    // Twist knot specific
    twist_n: meta.params && typeof meta.params.n === 'number' ? meta.params.n : null,
    
    // Kinky unknot specific (hard negative)
    is_kinky_unknot: meta.isKinkyUnknot || false,
    kink_count: meta.kinkCount || 0,
    
    // Spiral loop specific
    spiral_turns: meta.params && typeof meta.params.turns === 'number' ? meta.params.turns : null,
    
    // Open-ended rope labels
    is_knotted_open: !isClosed ? (ropeMode === 'multi' ? true : !isTopologicallyUnknot) : null,
    num_local_knots: !isClosed ? (ropeMode === 'multi' ? meta.multiKnot?.knotCount || 0 : (!isTopologicallyUnknot ? 1 : 0)) : null,
    
    // Multi-rope labels
    ropes: ropeMode === 'multiRope' ? (multiRopeInfo?.ropesLabels || []) : null,
    nonseparable_pairs: ropeMode === 'multiRope' ? (multiRopeInfo?.nonseparablePairs || []) : null,
    
    // Difficulty system
    difficulty_level: difficultyResult.level,         // 0, 1, 2
    difficulty_name: difficultyResult.levelName,      // easy, medium, hard
    difficulty_score: difficultyResult.score,         // numeric score
    difficulty_metrics: difficultyResult.metrics,     // detailed metrics
    
    // Gauss code info (diagram-dependent)
    // 注意：Gauss code 来自某个投影下的结图；不同投影 / Reidemeister move 会改变它。
    gauss_code: primaryGauss.gaussCode,
    gauss_tokens: primaryGauss.gaussTokens || [],
    // Back-compat alias (prefer `crossing_number_view`)
    num_crossings: primaryGauss.numCrossings,
  };

  const observations = {
    centerlines: centerlines.map((pts, i) => ({
      component: i,
      closed: usedCurves[i]?.isClosed ?? isClosed,
      points: pts,
    })),
    gaussCodes,
  };

  const metrics = {
    minNonNeighborDist: minD,
    minNonNeighborDistOverTube: minRatio,
  };

  const recipe = {
    family: meta.family,
    curveName: meta.curveName || null,
    params: meta.params || null,
    components: closedComponentsMode || 'single',
    componentRecipe,
    multiLoop: multiLoopInfo,
    tube: meta.tube,
    deform: meta.deform,
    transform: meta.transform,
    topology: meta.topology,
    multiKnot: meta.multiKnot || null,
    multiRope: multiRopeInfo,
  };

  // Optional visualization helpers (markers)
  const markers = [];
  if (!isClosed && endpoints) {
    const [h, t2] = createEndpointMarkers({ head: endpoints.head, tail: endpoints.tail, color: 0xffff00, radius: 0.05 });
    markers.push(h, t2);
  }

  return { meshes, markers, sample: { ...meta, recipe, observations, labels, metrics } };
}

function clearRoot() {
  // Dispose old meshes to avoid GPU leaks.
  const toDispose = [];
  root.traverse((obj) => {
    if (obj.isMesh) toDispose.push(obj);
  });
  for (const m of toDispose) {
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  root.clear();
}

function generateDataset() {
  const seedStr = String(seedEl.value || 'knot-dataset-v1');
  const rng = makeRng(seedStr);
  const count = parsePositiveInt(countEl.value, 64, { min: 1, max: 500 });
  const cols = parsePositiveInt(colsEl.value, 8, { min: 1, max: 50 });
  const familyMode = familyEl.value || 'mix';
  const segments = qualityToSegments(qualityEl.value || 'mid');
  // 默认按 closed-loop 生成；只有用户显式选择 open 或 mix 才剪开
  const topologyMode = (topologyEl && topologyEl.value) || 'closed';
  const closedComponentsMode = (closedComponentsEl && closedComponentsEl.value) || 'single';
  const openProb = parseNumber(openProbEl && openProbEl.value, 0.5, { min: 0, max: 1 });
  const deformStrength = parseNumber(deformEl.value, 0.25, { min: 0, max: 1 });

  // Benchmark difficulty distribution
  const easyPct = parseNumber(easyPctEl && easyPctEl.value, 33, { min: 0, max: 100 });
  const mediumPct = parseNumber(mediumPctEl && mediumPctEl.value, 34, { min: 0, max: 100 });
  const hardPct = parseNumber(hardPctEl && hardPctEl.value, 33, { min: 0, max: 100 });
  const totalPct = easyPct + mediumPct + hardPct;
  
  // Compute counts for each difficulty level (benchmark mode only)
  let easyCount = 0, mediumCount = 0, hardCount = 0;
  if (familyMode === 'benchmark' && totalPct > 0) {
    easyCount = Math.round(count * easyPct / totalPct);
    mediumCount = Math.round(count * mediumPct / totalPct);
    hardCount = count - easyCount - mediumCount;
  }

  clearRoot();

  const spacing = 2.45; // world spacing per cell; meshes are normalized internally.
  const rows = Math.ceil(count / cols);
  const originX = -((cols - 1) * spacing) / 2;
  const originZ = -((rows - 1) * spacing) / 2;

  const samples = [];
  let openCount = 0;
  let multiLoopCount = 0;
  let linkedCount = 0;
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
  
  // For benchmark mode, create shuffled difficulty assignment
  let benchmarkLevels = null;
  if (familyMode === 'benchmark') {
    benchmarkLevels = [];
    for (let i = 0; i < easyCount; i++) benchmarkLevels.push(0);
    for (let i = 0; i < mediumCount; i++) benchmarkLevels.push(1);
    for (let i = 0; i < hardCount; i++) benchmarkLevels.push(2);
    shuffleInPlace(rng, benchmarkLevels);
  }
  
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    // Determine benchmark level for this sample
    const benchmarkLevel = benchmarkLevels ? benchmarkLevels[i] : null;
    
    const { meshes, markers, sample } = generateOneSample({ 
      rng, familyMode, segments, deformStrength, topologyMode, openProb, closedComponentsMode,
      benchmarkLevel 
    });
    const x = originX + col * spacing;
    const z = originZ + row * spacing;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    for (const m of meshes) group.add(m);
    for (const mm of markers) group.add(mm);
    sample.id = `knot_${String(i).padStart(5, '0')}`;
    sample.transform.position = [x, 0, z];
    sample.recipe.transform.position = [x, 0, z];
    if (sample.topology?.type === 'open') openCount++;
    if (sample.labels?.num_loops && sample.labels.num_loops > 1) {
      multiLoopCount++;
      if (sample.labels.has_linking) linkedCount++;
    }
    // Track difficulty distribution
    if (sample.labels?.difficulty_name) {
      difficultyCounts[sample.labels.difficulty_name]++;
    }
    samples.push(sample);
    root.add(group);
  }

  // Collect knot type statistics
  const knotTypeStats = {};
  for (const s of samples) {
    const kt = s.labels?.knot_type || 'unknown';
    knotTypeStats[kt] = (knotTypeStats[kt] || 0) + 1;
  }

  lastDataset = {
    version: 2,
    createdAt: new Date().toISOString(),
    seed: seedStr,
    three: {
      revision: THREE.REVISION,
      importmap: 'three@0.160.0 (cdn.jsdelivr.net)',
    },
    generator: {
      familyMode,
      topologyMode,
      closedComponentsMode,
      openProb,
      count,
      cols,
      segments,
      deformStrength,
    },
    statistics: {
      difficulty_distribution: difficultyCounts,
      knot_type_distribution: knotTypeStats,
      open_count: openCount,
      closed_count: count - openCount,
      multi_loop_count: multiLoopCount,
      linked_count: linkedCount,
    },
    samples,
  };

  const diffStats = `Easy=${difficultyCounts.easy}, Med=${difficultyCounts.medium}, Hard=${difficultyCounts.hard}`;
  setStatus({
    title: `已生成（seed="${seedStr}"）`,
    three: `${THREE.REVISION}`,
    count,
    curveCount: listCurveExtras().length,
    extra: `family=${familyMode}，difficulty: [${diffStats}]，topology=${topologyMode}（open=${openCount}），deform=${deformStrength.toFixed(2)}`,
  });
}

function downloadJson(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

btnGenerate.addEventListener('click', () => {
  try {
    generateDataset();
  } catch (e) {
    console.error(e);
    setStatus({
      title: '生成失败（看控制台）',
      three: `${THREE.REVISION}`,
      count: 0,
      curveCount: listCurveExtras().length,
      extra: String(e?.message || e),
    });
  }
});

btnExport.addEventListener('click', () => {
  if (!lastDataset) {
    setStatus({
      title: '先生成再导出',
      three: `${THREE.REVISION}`,
      count: 0,
      curveCount: listCurveExtras().length,
    });
    return;
  }
  const safeSeed = String(lastDataset.seed).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'seed';
  downloadJson(lastDataset, `knot_dataset_${safeSeed}_N${lastDataset.samples.length}.json`);
});

// Boot
initThree();
animate();


