/**
 * centerline-pipeline.js
 *
 * 统一的绳结中心线处理管线。
 * 所有绳结类型在变为 TubeGeometry 前，都应通过此管线处理。
 */

import * as THREE from 'three';
import { applyPhysicsConstraints } from './rope-renderer-unified.js';

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function clonePoints(points) {
  return (points || []).map((p) => (p?.isVector3 ? p.clone() : new THREE.Vector3(p?.x || 0, p?.y || 0, p?.z || 0)));
}

/**
 * 对 polyline 点施加随机噪声形变（基于 seed 的确定性随机）
 * deformStrength=0 → 无形变; deformStrength=1 → 最大形变
 */
export function applyDeformation(points, config = {}) {
  const {
    deformStrength = 0,
    rng = null,
    closed = true,
  } = config;

  const strength = clamp01(deformStrength);
  if (strength <= 0 || typeof rng !== 'function') return clonePoints(points);

  const pts = clonePoints(points);
  const n = pts.length;
  if (n < 3) return pts;

  // Use low-frequency, deterministic waves instead of per-point white noise.
  // This keeps deformation visible while avoiding zig-zag artifacts.
  const amp = strength * 0.12;
  const tau = Math.PI * 2;
  const fNx1 = 1 + Math.floor(rng() * 3); // 1..3
  const fNx2 = 2 + Math.floor(rng() * 4); // 2..5
  const fNy1 = 1 + Math.floor(rng() * 3); // 1..3
  const fNy2 = 2 + Math.floor(rng() * 4); // 2..5
  const phNx1 = rng() * tau;
  const phNx2 = rng() * tau;
  const phNy1 = rng() * tau;
  const phNy2 = rng() * tau;

  // Keep a frozen source copy so local frame estimation remains stable.
  const src = pts.map((p) => p.clone());
  const iStart = closed ? 0 : 1;
  const iEnd = closed ? n : (n - 1);

  for (let i = iStart; i < iEnd; i++) {
    const iPrev = closed ? ((i - 1 + n) % n) : (i - 1);
    const iNext = closed ? ((i + 1) % n) : (i + 1);
    if (iPrev < 0 || iNext >= n) continue;

    const prev = src[iPrev];
    const next = src[iNext];
    const tangent = next.clone().sub(prev);
    if (tangent.lengthSq() < 1e-12) continue;
    tangent.normalize();

    const ref = Math.abs(tangent.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const normal = tangent.clone().cross(ref);
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();
    const binormal = tangent.clone().cross(normal).normalize();

    const t = closed ? (i / n) : (i / Math.max(1, n - 1));
    const waveNx = 0.7 * Math.sin(tau * fNx1 * t + phNx1) + 0.3 * Math.sin(tau * fNx2 * t + phNx2);
    const waveNy = 0.7 * Math.cos(tau * fNy1 * t + phNy1) + 0.3 * Math.cos(tau * fNy2 * t + phNy2);
    const nx = waveNx * amp;
    const ny = waveNy * amp;
    pts[i].addScaledVector(normal, nx).addScaledVector(binormal, ny);
  }

  // Light Laplacian smoothing suppresses residual point-to-point jitter.
  const smoothIters = Math.round(2 + 6 * strength);
  const beta = 0.08 + 0.12 * strength;
  for (let it = 0; it < smoothIters; it++) {
    const nextPts = pts.map((p) => p.clone());
    for (let i = iStart; i < iEnd; i++) {
      const iPrev = closed ? ((i - 1 + n) % n) : (i - 1);
      const iNext = closed ? ((i + 1) % n) : (i + 1);
      if (iPrev < 0 || iNext >= n) continue;
      const avg = pts[iPrev].clone().add(pts[i]).add(pts[iNext]).divideScalar(3);
      nextPts[i].lerp(avg, beta);
    }
    for (let i = 0; i < n; i++) pts[i].copy(nextPts[i]);
  }

  return pts;
}

/**
 * 松紧度变换：将 points 向"更像一个均匀大环"的方向推移
 * slackness=0 → 无变化; slackness=1 → 接近圆环（但拓扑不变）
 *
 * @param {THREE.Vector3[]} points - closed polyline（首尾相连）
 * @param {Object} config
 * @param {number} config.slackness
 * @param {number} config.tubeRadius
 * @param {boolean} config.closed
 * @returns {THREE.Vector3[]}
 */
export function applySlackness(points, config = {}) {
  const {
    slackness = 0,
    tubeRadius = 0.07,
    closed = true,
  } = config;

  const s = clamp01(slackness);
  if (s <= 0) return clonePoints(points);

  let pts = clonePoints(points);
  const n = pts.length;
  if (n < 4) return pts;

  // ================================================================
  // 核心策略：把每个点投影到 XY 平面的圆上，只保留少量 Z 高度
  //
  // slackness=0: 完全保持原始形状
  // slackness=1: 所有点投影到一个平坦圆环，Z 几乎为 0
  //              → 看起来就是一个有轻微褶皱的环
  // ================================================================

  // Step 1: 计算质心和 XY 平面的平均半径
  const center = new THREE.Vector3();
  for (const p of pts) center.add(p);
  center.divideScalar(n);

  // 计算每个点在 XY 平面上（相对于质心）的角度和半径
  const polarData = pts.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dz = p.z - center.z;
    const r2d = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return { dx, dy, dz, r2d, angle };
  });

  // 平均 XY 半径
  const avgR2d = polarData.reduce((sum, d) => sum + d.r2d, 0) / n;

  // Step 2: 将每个点向"平坦圆"插值
  // 平坦圆 = 在 XY 平面上均匀分布的圆，Z=0
  // 插值强度随 slackness 增大
  const flattenStrength = s * s;

  pts = pts.map((p, i) => {
    const d = polarData[i];

    // 目标：XY 平面上半径为 avgR2d 的圆上的点
    const targetX = center.x + avgR2d * Math.cos(d.angle);
    const targetY = center.y + avgR2d * Math.sin(d.angle);
    const targetZ = center.z;

    return new THREE.Vector3(
      p.x + (targetX - p.x) * flattenStrength,
      p.y + (targetY - p.y) * flattenStrength,
      p.z + (targetZ - p.z) * flattenStrength * 1.5,
    );
  });

  // Step 3: 少量 Laplacian smoothing 消除锯齿
  // slackness 高时多做几轮，让曲线更平滑
  const iters = Math.round(3 + 15 * s);
  const beta = 0.12 + 0.20 * s;
  for (let it = 0; it < iters; it++) {
    const next = pts.map((p) => p.clone());
    for (let i = 0; i < n; i++) {
      const iPrev = (i - 1 + n) % n;
      const iNext = (i + 1) % n;
      const avg = pts[iPrev].clone().add(pts[i]).add(pts[iNext]).divideScalar(3);
      next[i].lerp(avg, beta);
    }
    pts = next;
  }

  // Step 4: 物理约束（防穿插）
  // 注意：压平后点之间距离变小，需要适当排斥
  const safeTubeRadius = Math.max(1e-5, Number(tubeRadius) || 0.07);
  const physMinDist = safeTubeRadius * (2.0 + 1.5 * s);
  pts = applyPhysicsConstraints(pts, {
    minDistance: physMinDist,
    repulsionStrength: 0.06 + 0.12 * s,
    iterations: Math.round(5 + 15 * s),
    neighborSkip: 8,
    closed: true,
    pinEnds: false,
  });

  return pts;
}

/**
 * 完整的中心线管线入口
 *
 * @param {THREE.Curve} curve
 * @param {Object} config
 * @returns {THREE.CatmullRomCurve3}
 */
export function processCenterline(curve, config = {}) {
  const {
    rng = null,
    deformStrength = 0,
    slackness = 0,
    tubeRadius = 0.07,
    sampleN = 300,
    closed = true,
    knotType = 'unknown',
  } = config;

  if (!curve || typeof curve.getPoints !== 'function') {
    return new THREE.CatmullRomCurve3([], closed, 'centripetal');
  }

  let points = curve.getPoints(Math.max(8, Math.floor(Number(sampleN) || 300)));
  points = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));

  if (points.length < 10) {
    throw new Error(`[pipeline] Too few valid points for ${knotType}`);
  }

  if (clamp01(deformStrength) > 0 && typeof rng === 'function') {
    points = applyDeformation(points, { deformStrength, rng, closed });
  }

  if (clamp01(slackness) > 0) {
    points = applySlackness(points, { slackness, tubeRadius, closed });
  }

  return new THREE.CatmullRomCurve3(points, closed, 'centripetal');
}
