/**
 * Open Loop Renderer
 *
 * 渲染 open-ended rope（开绳）图片，输出 PNG DataURL。
 * 复用 invariance-renderer.js 的场景/光照风格，但几何体来自 open-loop-generator.js。
 */

import * as THREE from 'three';
import { generateOpenKnot } from './open-loop-generator.js';
import { MULTI_KNOT_CONFIGS, generateMultiKnotPath } from './open-loop-multi-knot.js';
import { createRenderScene, setupLighting, dataUrlToBlob } from './invariance-renderer.js';

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
  const seedFn = xmur3(String(seedStr || 'open-loop-render'));
  return mulberry32(seedFn());
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function tubeQualityParams(quality) {
  // thinner rope doesn't need very high radial segments; keep it efficient and crisp
  if (quality === 'high') return { tubularSegments: 250, radialSegments: 12 };
  if (quality === 'mid') return { tubularSegments: 150, radialSegments: 8 };
  return { tubularSegments: 80, radialSegments: 6 };
}

function estimateAndNormalizeTube({ makeCurve, closed = false, quality = 'high', radius = 0.08, targetOuterRadius = 1.8 }) {
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
  if (geom.attributes.normal) geom.normalizeNormals();
  return geom;
}

function ensureVertexColors(geometry, baseColor) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(baseColor || '#72e6ff');
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function randomCameraPosition(rng, options = {}) {
  const {
    minRadius = 10.0,
    maxRadius = 14.0,
    minPhi = 0.25,
    maxPhi = Math.PI - 0.25,
  } = options;

  const radius = minRadius + (maxRadius - minRadius) * rng();
  const theta = rng() * Math.PI * 2;
  const phi = minPhi + (maxPhi - minPhi) * rng();

  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return [x, y, z];
}

/**
 * Render a single open-loop image.
 *
 * @param {Object} params
 * @param {'straight'|'overhand'|'figure8'|'bowline'|'double_overhand'|'loose_coil'|'overhand_x2'|'loose_loop'} params.knot_type
 * @param {number} params.tightness 0..1
 * @param {string|number} params.seed
 * @param {string} [params.color]
 * @param {string} [params.backgroundColor]
 * @param {number} [params.tubeRadius]
 * @param {number[]} [params.cameraPosition]
 * @param {number[]} [params.cameraTarget]
 * @param {number} [params.cameraFov]
 * @returns {Promise<string>} PNG dataUrl
 */
export async function renderOpenLoopImage(params, options = {}) {
  const {
    width = 1024,
    height = 1024,
    quality = 'high',
  } = options;

  const knotType = params?.knot_type || 'straight';
  const tightness = clamp(Number(params?.tightness ?? 0.6), 0, 1);
  const seed = String(params?.seed ?? 'open-loop');

  const rng = makeRng(seed);

  const { scene, camera, renderer } = createRenderScene({
    width,
    height,
    backgroundColor: params?.backgroundColor || '#1a2236',
  });

  // Camera
  if (params?.cameraPosition) camera.position.set(...params.cameraPosition);
  else camera.position.set(...randomCameraPosition(rng));
  if (params?.cameraTarget) camera.lookAt(...params.cameraTarget);
  else camera.lookAt(0, 0, 0);
  if (params?.cameraFov) {
    camera.fov = params.cameraFov;
    camera.updateProjectionMatrix();
  }

  // Lighting
  setupLighting(scene, {
    intensity: 1.35,
    ambient: 1.1,
  });

  // Geometry
  // Rope thickness is adaptive: more complex knots + looser knots => thinner rope (to reveal structure).
  // Caller can still override via params.tubeRadius if needed.
  const knotComplexity = {
    straight: 1,
    loose_coil: 1,
    overhand: 2,
    figure8: 3,
    bowline: 3,
    double_overhand: 4,
    slip_knot: 3,
    // placeholders for future templates
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

  // Multi-knot configs: estimate complexity from components.
  let effectiveType = knotType;
  let effectiveTightness = tightness;
  if (MULTI_KNOT_CONFIGS[knotType]) {
    const ks = MULTI_KNOT_CONFIGS[knotType].knots || [];
    const avgT = ks.length ? ks.reduce((s, k) => s + clamp(Number(k.tightness ?? 0.7), 0, 1), 0) / ks.length : 0.7;
    effectiveTightness = avgT;
    // treat as more complex than any single component
    const maxC = ks.length ? Math.max(...ks.map(k => knotComplexity[k.type] || 2)) : 3;
    knotComplexity[knotType] = Math.min(5, maxC + Math.max(0, ks.length - 1));
    effectiveType = knotType;
  }

  const complexity = knotComplexity[effectiveType] || 2;
  const complexity01 = clamp((complexity - 1) / 4, 0, 1);

  // CRITICAL: much thinner base radius (simple -> complex)
  const baseTubeRadius = THREE.MathUtils.lerp(0.035, 0.020, complexity01);
  // loose -> even thinner
  const tightnessFactor = THREE.MathUtils.lerp(0.6, 1.0, clamp(effectiveTightness, 0, 1));
  const adaptiveTubeRadius = baseTubeRadius * tightnessFactor;

  const tubeRadius = Number.isFinite(params?.tubeRadius) ? params.tubeRadius : adaptiveTubeRadius;
  // eslint-disable-next-line no-console
  console.log(`[Render] ${knotType}: radius=${tubeRadius.toFixed(4)}, complexity=${complexity}, tightness=${effectiveTightness.toFixed(2)}`);
  const geom = estimateAndNormalizeTube({
    makeCurve: () => {
      const pts = MULTI_KNOT_CONFIGS[knotType]
        ? generateMultiKnotPath(knotType, seed, { tubeRadius })
        : generateOpenKnot(knotType, tightness, seed, { tubeRadius });
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    },
    closed: false,
    quality,
    radius: tubeRadius,
    targetOuterRadius: 1.9,
  });

  ensureVertexColors(geom, params?.color || '#72e6ff');

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.12,
    vertexColors: true,
    emissive: new THREE.Color(0x0a0a0a),
    emissiveIntensity: 0.15,
  });

  const mesh = new THREE.Mesh(geom, material);
  scene.add(mesh);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');

  // Cleanup
  geom.dispose();
  material.dispose();
  renderer.dispose();

  return dataUrl;
}

export { dataUrlToBlob };

export default {
  renderOpenLoopImage,
  dataUrlToBlob,
};

