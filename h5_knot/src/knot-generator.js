/**
 * Procedural Knot Generator
 * 
 * Generates knot shapes using parametric equations
 * No ASCII parsing needed - pure mathematical generation
 */

// ============ RNG (for dataset reproducibility) ============

function mulberry32(seed) {
  let a = (seed >>> 0) || 0x12345678;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : (x > 1 ? 1 : x);
}

/**
 * Generate Figure-8 Knot (single rope, 2 crossings)
 * 
 * This is the classic figure-eight knot topology
 */
export function generateFigure8Knot(options = {}) {
  const {
    numPoints = 80,
    scale = 0.8,
    zScale = 0.25,
  } = options;
  
  const base = [];
  
  // Figure-8 knot parametric equations
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    
    // Classic figure-8 knot parametric curve
    const x = (2 + Math.cos(2 * t)) * Math.cos(3 * t);
    const y = (2 + Math.cos(2 * t)) * Math.sin(3 * t);
    const z = Math.sin(4 * t);
    
    base.push({
      x: x * scale * 0.3,
      y: y * scale * 0.3,
      z: z * zScale,
    });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.8 * scale, tailPoints: 22 });
  // Find crossings on FINAL polyline (with tails), so indices/arc-params match physics sampling
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: 'figure8',
      points,
      isClosed: false,
    }],
    crossings,
  };
}

/**
 * Generate Trefoil Knot (single rope, 3 crossings)
 */
export function generateTrefoilKnot(options = {}) {
  const {
    numPoints = 100,
    scale = 0.8,
    zScale = 0.3,
  } = options;
  
  const base = [];
  
  // Trefoil knot parametric equations
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    
    const x = Math.sin(t) + 2 * Math.sin(2 * t);
    const y = Math.cos(t) - 2 * Math.cos(2 * t);
    const z = -Math.sin(3 * t);
    
    base.push({
      x: x * scale * 0.25,
      y: y * scale * 0.25,
      z: z * zScale,
    });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.6 * scale, tailPoints: 20 });
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: 'trefoil',
      points,
      isClosed: false,
    }],
    crossings,
  };
}

/**
 * Generate Reef Knot (two ropes intertwined, 2 crossings each direction)
 */
export function generateReefKnot(options = {}) {
  const {
    scale = 0.8,
    zSeparation = 0.15,
  } = options;
  
  // Reef knot: two ropes crossing each other
  // Rope 1: horizontal with two bumps (goes under then over)
  // Rope 2: vertical U-shape (goes over then under)
  
  const rope1 = [];
  const rope2 = [];
  
  // Rope 1: Horizontal rope with over/under at crossings
  const r1Points = [
    { x: -1.5, y: 0, z: 0 },
    { x: -0.8, y: 0, z: 0 },
    { x: -0.3, y: 0, z: -zSeparation },  // Under first crossing
    { x: 0.3, y: 0, z: -zSeparation },   // Under first crossing
    { x: 0.5, y: 0, z: 0 },
    { x: 0.8, y: 0, z: zSeparation },    // Over second crossing
    { x: 1.2, y: 0, z: zSeparation },    // Over second crossing
    { x: 1.5, y: 0, z: 0 },
    { x: 2.0, y: 0, z: 0 },
  ];
  
  // Rope 2: Vertical U-shape with over/under at crossings
  const r2Points = [
    { x: 0, y: -1.2, z: 0 },
    { x: 0, y: -0.6, z: 0 },
    { x: 0, y: -0.2, z: zSeparation },   // Over first crossing
    { x: 0, y: 0.2, z: zSeparation },    // Over first crossing (same rope 1 crossing)
    { x: 0, y: 0.5, z: 0 },
    { x: 0.3, y: 0.8, z: 0 },
    { x: 0.6, y: 0.9, z: 0 },
    { x: 0.9, y: 0.8, z: 0 },
    { x: 1.0, y: 0.5, z: 0 },
    { x: 1.0, y: 0.2, z: -zSeparation }, // Under second crossing
    { x: 1.0, y: -0.2, z: -zSeparation },
    { x: 1.0, y: -0.6, z: 0 },
    { x: 1.0, y: -1.2, z: 0 },
  ];
  
  // Scale points
  for (const p of r1Points) {
    rope1.push({ x: p.x * scale, y: p.y * scale, z: p.z });
  }
  for (const p of r2Points) {
    rope2.push({ x: p.x * scale, y: p.y * scale, z: p.z });
  }
  
  // Crossings
  const crossings = [
    { overLeadIdx: 1, underLeadIdx: 0, x: 0, y: 0 },
    { overLeadIdx: 0, underLeadIdx: 1, x: 1.0 * scale, y: 0 },
  ];
  
  return {
    leads: [
      { name: 'rope1', points: rope1, isClosed: false },
      { name: 'rope2', points: rope2, isClosed: false },
    ],
    crossings,
  };
}

/**
 * Generate Simple Overhand Knot
 */
export function generateOverhandKnot(options = {}) {
  const {
    numPoints = 60,
    scale = 0.6,
    zScale = 0.2,
  } = options;
  
  const points = [];
  
  // Simple overhand: a loop with one crossing
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints);
    
    // Parametric curve for overhand
    let x, y, z;
    
    if (t < 0.2) {
      // Entry straight
      x = -1.5 + t * 5;
      y = 0;
      z = 0;
    } else if (t < 0.5) {
      // Loop up
      const lt = (t - 0.2) / 0.3;
      const angle = lt * Math.PI;
      x = 0.5 * Math.cos(angle);
      y = 0.5 + 0.5 * Math.sin(angle);
      z = lt * zScale * 2;
    } else if (t < 0.7) {
      // Cross over
      const lt = (t - 0.5) / 0.2;
      x = -0.5 + lt * 1.0;
      y = 0.5 - lt * 0.5;
      z = zScale * 2 - lt * zScale * 4; // Go under
    } else {
      // Exit straight
      const lt = (t - 0.7) / 0.3;
      x = 0.5 + lt * 1.0;
      y = 0;
      z = -zScale * 2 + lt * zScale * 2;
    }
    
    points.push({
      x: x * scale,
      y: y * scale,
      z: z,
    });
  }
  
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: 'overhand',
      points,
      isClosed: false,
    }],
    crossings,
  };
}

/**
 * Find crossings in a self-intersecting curve
 */
function findCrossings(points, options = {}) {
  const {
    leadIdx = 0,
    excludeWindow = 6,
    eps = 1e-9,
    dedupeDist = 0.02,
    maxCrossings = Infinity,
  } = options;

  if (!Array.isArray(points) || points.length < 4) return [];

  // Precompute 3D arc-length for stable crossing parametrization (t in [0,1])
  const arc = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    const dz = (b.z || 0) - (a.z || 0);
    arc[i] = arc[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const totalLen = arc[arc.length - 1] || 1;

  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  function segIntersect2D(a, b, c, d) {
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const cx = c.x, cy = c.y, dx = d.x, dy = d.y;

    const abx = bx - ax, aby = by - ay;
    const cdx = dx - cx, cdy = dy - cy;
    const acx = cx - ax, acy = cy - ay;

    const denom = abx * cdy - aby * cdx;
    if (Math.abs(denom) < eps) return null; // parallel or nearly parallel

    // Solve: a + s*(b-a) = c + t*(d-c)
    const s = (acx * cdy - acy * cdx) / denom;
    const t = (acx * aby - acy * abx) / denom;
    if (s <= 0 + 1e-6 || s >= 1 - 1e-6) return null;
    if (t <= 0 + 1e-6 || t >= 1 - 1e-6) return null;

    const ix = ax + s * abx;
    const iy = ay + s * aby;
    return { s, t, x: ix, y: iy };
  }

  function arcT(segStartIdx, frac) {
    const a = points[segStartIdx];
    const b = points[segStartIdx + 1];
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    const dz = (b.z || 0) - (a.z || 0);
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const s = arc[segStartIdx] + frac * segLen;
    return clamp01(s / totalLen);
  }

  function zAt(segStartIdx, frac) {
    const a = points[segStartIdx];
    const b = points[segStartIdx + 1];
    const za = Number.isFinite(a.z) ? a.z : 0;
    const zb = Number.isFinite(b.z) ? b.z : 0;
    return za + frac * (zb - za);
  }

  const crossings = [];
  const dedupeDist2 = dedupeDist * dedupeDist;

  // O(N^2) is ok at your current point counts (<= ~250). For bigger, we can add sweep/hash later.
  for (let i = 0; i < points.length - 3; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;

    // Skip degenerate segments
    const ab2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (ab2 < 1e-12) continue;

    for (let j = i + 2; j < points.length - 1; j++) {
      // exclude adjacent / near-adjacent segments to avoid “almost intersection” noise
      if (Math.abs(j - i) <= excludeWindow) continue;

      const c = points[j];
      const d = points[j + 1];
      if (!c || !d) continue;

      const cd2 = (d.x - c.x) ** 2 + (d.y - c.y) ** 2;
      if (cd2 < 1e-12) continue;

      // Quick reject by bounding boxes
      const minAx = Math.min(a.x, b.x), maxAx = Math.max(a.x, b.x);
      const minAy = Math.min(a.y, b.y), maxAy = Math.max(a.y, b.y);
      const minCx = Math.min(c.x, d.x), maxCx = Math.max(c.x, d.x);
      const minCy = Math.min(c.y, d.y), maxCy = Math.max(c.y, d.y);
      if (maxAx < minCx || maxCx < minAx || maxAy < minCy || maxCy < minAy) continue;

      // Robust-ish orientation test as additional quick reject
      const o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
      const o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
      const o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
      const o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
      if (!((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))) continue;
      if (!((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) continue;

      const hit = segIntersect2D(a, b, c, d);
      if (!hit) continue;

      // Dedupe by intersection position (avoid multi-detect due to near-parallel numerical issues)
      let dup = false;
      for (const ex of crossings) {
        const dx = ex.x - hit.x;
        const dy = ex.y - hit.y;
        if (dx * dx + dy * dy < dedupeDist2) { dup = true; break; }
      }
      if (dup) continue;

      const zi = zAt(i, hit.s);
      const zj = zAt(j, hit.t);
      const iIsOver = zi >= zj;

      // Note: for self-crossing, over/under are two passes on the same lead.
      // We store arc-params (overT/underT) so physics can resample and attach crossingInfo precisely.
      const overSeg = iIsOver ? i : j;
      const underSeg = iIsOver ? j : i;
      const overFrac = iIsOver ? hit.s : hit.t;
      const underFrac = iIsOver ? hit.t : hit.s;

      crossings.push({
        overLeadIdx: leadIdx,
        underLeadIdx: leadIdx,
        x: hit.x,
        y: hit.y,
        point: { x: hit.x, y: hit.y },
        overT: arcT(overSeg, overFrac),
        underT: arcT(underSeg, underFrac),
      });

      if (crossings.length >= maxCrossings) return crossings;
    }
  }

  return crossings;
}

function openWithTailsFromClosedLoop(points, options = {}) {
  const { tailLength = 1.2, tailPoints = 16 } = options;
  if (points.length < 3) return points.slice();
  
  // Remove duplicate end if closed via param sampling (t=0 and t=2π).
  const out = points.slice();
  const first = out[0];
  const last = out[out.length - 1];
  const dx0 = first.x - last.x;
  const dy0 = first.y - last.y;
  const dz0 = (first.z || 0) - (last.z || 0);
  if (Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0) < 1e-6) {
    out.pop();
  }
  
  if (out.length < 3) return out;
  
  // Tail directions based on the chord across the cut (last -> first),
  // blended with a radial outward direction to avoid tails shooting into the knot.
  const a = out[0];
  const b = out[out.length - 1];
  const chordX = a.x - b.x;
  const chordY = a.y - b.y;
  const chordLen = Math.sqrt(chordX * chordX + chordY * chordY);
  
  let cx = 0, cy = 0;
  for (const p of out) {
    cx += p.x;
    cy += p.y;
  }
  cx /= out.length;
  cy /= out.length;
  
  function norm2(x, y) {
    const l = Math.sqrt(x * x + y * y);
    return l > 1e-8 ? { x: x / l, y: y / l } : null;
  }
  
  const chordDir = chordLen > 1e-8 ? { x: chordX / chordLen, y: chordY / chordLen } : { x: 1, y: 0 };
  const ra = norm2(a.x - cx, a.y - cy) || chordDir;
  const rb = norm2(b.x - cx, b.y - cy) || { x: -chordDir.x, y: -chordDir.y };
  
  const startDir = norm2(chordDir.x * 0.75 + ra.x * 0.25, chordDir.y * 0.75 + ra.y * 0.25) || chordDir;
  const endDir = norm2((-chordDir.x) * 0.75 + rb.x * 0.25, (-chordDir.y) * 0.75 + rb.y * 0.25) || { x: -chordDir.x, y: -chordDir.y };
  
  const startTail = [];
  for (let i = tailPoints; i >= 1; i--) {
    const t = (i / tailPoints) * tailLength;
    startTail.push({
      x: a.x + startDir.x * t,
      y: a.y + startDir.y * t,
      z: a.z,
    });
  }
  
  const endTail = [];
  for (let i = 1; i <= tailPoints; i++) {
    const t = (i / tailPoints) * tailLength;
    endTail.push({
      x: b.x + endDir.x * t,
      y: b.y + endDir.y * t,
      z: b.z,
    });
  }
  
  return [...startTail, ...out, ...endTail];
}

/**
 * Apply small but controllable deformations to a base curve for dataset diversity.
 * The goal is "many variants" while keeping it tighten-able and numerically stable.
 */
export function deformCurve(points, options = {}) {
  const {
    seed = null,
    noiseAmp = 0.0,
    noiseFreqs = [1, 2, 3],
    rotate = true,
    anisotropicScale = true,
    localStretch = true,
  } = options;

  const rng = mulberry32(Number.isFinite(seed) ? seed : (Date.now() >>> 0));
  const out = (points || []).map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
  if (out.length < 2) return out;

  // Random rotation (Euler)
  let cx = 1, sx = 0, cy = 1, sy = 0, cz = 1, sz = 0;
  if (rotate) {
    const ax = (rng() * 2 - 1) * Math.PI;
    const ay = (rng() * 2 - 1) * Math.PI;
    const az = (rng() * 2 - 1) * Math.PI;
    cx = Math.cos(ax); sx = Math.sin(ax);
    cy = Math.cos(ay); sy = Math.sin(ay);
    cz = Math.cos(az); sz = Math.sin(az);
  }

  // Anisotropic scaling
  let sx0 = 1, sy0 = 1, sz0 = 1;
  if (anisotropicScale) {
    sx0 = 0.75 + rng() * 0.6;
    sy0 = 0.75 + rng() * 0.6;
    sz0 = 0.75 + rng() * 0.6;
  }

  // Low-frequency sinusoidal displacement along arc index
  const amps = [];
  for (let k = 0; k < noiseFreqs.length; k++) {
    amps.push({
      fx: noiseFreqs[k],
      fy: noiseFreqs[k] + 0.5,
      fz: noiseFreqs[k] + 0.25,
      phx: rng() * 2 * Math.PI,
      phy: rng() * 2 * Math.PI,
      phz: rng() * 2 * Math.PI,
      ax: (rng() * 2 - 1) * (noiseAmp / noiseFreqs.length),
      ay: (rng() * 2 - 1) * (noiseAmp / noiseFreqs.length),
      az: (rng() * 2 - 1) * (noiseAmp / noiseFreqs.length),
    });
  }

  function rotApply(p) {
    // Rz * Ry * Rx
    let x = p.x, y = p.y, z = p.z;
    // Rx
    let y1 = y * cx - z * sx;
    let z1 = y * sx + z * cx;
    let x1 = x;
    // Ry
    let z2 = z1 * cy - x1 * sy;
    let x2 = z1 * sy + x1 * cy;
    let y2 = y1;
    // Rz
    let x3 = x2 * cz - y2 * sz;
    let y3 = x2 * sz + y2 * cz;
    let z3 = z2;
    return { x: x3, y: y3, z: z3 };
  }

  for (let i = 0; i < out.length; i++) {
    const s = out.length > 1 ? (i / (out.length - 1)) : 0;
    let p = out[i];

    // noise
    if (noiseAmp > 0) {
      let nx = 0, ny = 0, nz = 0;
      for (const a of amps) {
        nx += a.ax * Math.sin(2 * Math.PI * a.fx * s + a.phx);
        ny += a.ay * Math.sin(2 * Math.PI * a.fy * s + a.phy);
        nz += a.az * Math.sin(2 * Math.PI * a.fz * s + a.phz);
      }
      p = { x: p.x + nx, y: p.y + ny, z: p.z + nz };
    }

    // rotation + scale
    const r = rotate ? rotApply(p) : p;
    out[i].x = r.x * sx0;
    out[i].y = r.y * sy0;
    out[i].z = r.z * sz0;
  }

  if (localStretch && out.length >= 8) {
    // Small tangent-direction stretch/compress over a random interval (kept subtle)
    const n = out.length;
    const a = 2 + Math.floor(rng() * Math.max(1, n - 6));
    const b = Math.min(n - 3, a + 2 + Math.floor(rng() * 8));
    const k = (rng() * 2 - 1) * 0.12; // stretch factor (small)
    for (let i = a; i <= b; i++) {
      const p0 = out[Math.max(0, i - 1)];
      const p1 = out[Math.min(n - 1, i + 1)];
      let tx = p1.x - p0.x;
      let ty = p1.y - p0.y;
      let tz = p1.z - p0.z;
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      out[i].x += tx * k;
      out[i].y += ty * k;
      out[i].z += tz * k;
    }
  }

  // If last is a duplicate closure point, re-sync it to first after deformation.
  const first = out[0];
  const last = out[out.length - 1];
  const dx0 = first.x - last.x;
  const dy0 = first.y - last.y;
  const dz0 = first.z - last.z;
  if (Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0) < 1e-8) {
    out[out.length - 1] = { x: first.x, y: first.y, z: first.z };
  }

  return out;
}

function cutClosedLoop(points, cutIndex) {
  if (!Array.isArray(points) || points.length < 4) return (points || []).slice();
  const out = points.slice();
  // Remove duplicate closure point if present
  const a = out[0];
  const b = out[out.length - 1];
  const dx0 = a.x - b.x;
  const dy0 = a.y - b.y;
  const dz0 = (a.z || 0) - (b.z || 0);
  if (Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0) < 1e-8) out.pop();
  if (out.length < 3) return out;
  const k = Math.max(0, Math.min(out.length - 1, Math.floor(cutIndex || 0)));
  return [...out.slice(k), ...out.slice(0, k)];
}

/**
 * Turn a closed loop into an open rope by cutting at a chosen index and adding two tails.
 * Tails are mostly along tangents, blended with radial-outward directions to avoid shooting into the knot core.
 */
export function cutClosedCurveToOpenWithTails(points, options = {}) {
  const {
    cutIndex = 0,
    tailLength = 1.6,
    tailPoints = 20,
  } = options;

  const out = cutClosedLoop(points, cutIndex);
  if (out.length < 3) return out;

  // Compute centroid in XY for outward bias
  let cx = 0, cy = 0;
  for (const p of out) { cx += p.x; cy += p.y; }
  cx /= out.length; cy /= out.length;

  function norm2(x, y) {
    const l = Math.sqrt(x * x + y * y);
    return l > 1e-8 ? { x: x / l, y: y / l } : null;
  }

  const a = out[0];
  const a1 = out[1];
  const b = out[out.length - 1];
  const b1 = out[out.length - 2];

  const ta = norm2(a.x - a1.x, a.y - a1.y) || { x: 1, y: 0 }; // extend outwards from start
  const tb = norm2(b.x - b1.x, b.y - b1.y) || { x: 1, y: 0 }; // extend outwards from end
  const ra = norm2(a.x - cx, a.y - cy) || ta;
  const rb = norm2(b.x - cx, b.y - cy) || tb;

  const startDir = norm2(ta.x * 0.8 + ra.x * 0.2, ta.y * 0.8 + ra.y * 0.2) || ta;
  const endDir = norm2(tb.x * 0.8 + rb.x * 0.2, tb.y * 0.8 + rb.y * 0.2) || tb;

  const startTail = [];
  for (let i = tailPoints; i >= 1; i--) {
    const t = (i / tailPoints) * tailLength;
    startTail.push({ x: a.x + startDir.x * t, y: a.y + startDir.y * t, z: a.z || 0 });
  }

  const endTail = [];
  for (let i = 1; i <= tailPoints; i++) {
    const t = (i / tailPoints) * tailLength;
    endTail.push({ x: b.x + endDir.x * t, y: b.y + endDir.y * t, z: b.z || 0 });
  }

  return [...startTail, ...out, ...endTail];
}

// ============ Random Knot Generation ============

/**
 * Known valid Lissajous parameters that produce non-trivial knots
 * Lissajous Knot: x=sin(nx*t+φx), y=sin(ny*t+φy), z=sin(nz*t+φz)
 */
const LISSAJOUS_PARAMS = [
  { nx: 2, ny: 3, nz: 5, phiX: 0, phiY: 0.3, phiZ: 0.7, name: '5₂ knot' },
  { nx: 2, ny: 3, nz: 7, phiX: 0, phiY: 0.2, phiZ: 0.8, name: '7₂ knot' },
  { nx: 3, ny: 4, nz: 5, phiX: 0, phiY: 0.5, phiZ: 0.3, name: 'Complex I' },
  { nx: 2, ny: 5, nz: 3, phiX: 0.1, phiY: 0.4, phiZ: 0.6, name: 'Twisted' },
  { nx: 3, ny: 2, nz: 7, phiX: 0.2, phiY: 0.1, phiZ: 0.5, name: 'Asymmetric' },
  { nx: 4, ny: 3, nz: 5, phiX: 0, phiY: 0.6, phiZ: 0.4, name: 'Complex II' },
  { nx: 2, ny: 5, nz: 7, phiX: 0.1, phiY: 0.3, phiZ: 0.9, name: 'High crossing' },
  { nx: 3, ny: 5, nz: 7, phiX: 0.2, phiY: 0.4, phiZ: 0.1, name: 'Complex III' },
  { nx: 2, ny: 3, nz: 3, phiX: 0.1, phiY: 0.5, phiZ: 0.9, name: 'Simple Lissajous' },
  { nx: 4, ny: 5, nz: 7, phiX: 0.15, phiY: 0.35, phiZ: 0.55, name: 'Dense' },
];

/**
 * Known valid Torus knot parameters (p, q must be coprime)
 * Torus Knot: winds p times around and q times through the torus
 * 
 * IMPORTANT: T(p,q) only exists as a KNOT when gcd(p,q) = 1
 *            Otherwise it's a multi-component LINK
 * 
 * Crossing number formula: min(p(q-1), q(p-1))
 * For T(2,q): crossing number = q (when q is odd, gcd(2,q)=1)
 */
const TORUS_PARAMS = [
  // === EASY (≤4 crossings) ===
  { p: 2, q: 3, name: 'Trefoil (2,3)', crossings: 3, difficulty: 'easy' },
  
  // === MEDIUM (5-6 crossings) ===
  { p: 2, q: 5, name: 'Cinquefoil (2,5)', crossings: 5, difficulty: 'medium' },
  // NOTE: T(2,6) does NOT exist - gcd(2,6)=2, it would be a 2-component link!
  
  // === HARD (≥7 crossings) ===
  { p: 2, q: 7, name: '7₁ knot (2,7)', crossings: 7, difficulty: 'hard' },
  { p: 2, q: 9, name: '9₁ knot (2,9)', crossings: 9, difficulty: 'hard' },
  { p: 2, q: 11, name: '11₁ knot (2,11)', crossings: 11, difficulty: 'hard' },
  { p: 3, q: 4, name: 'Torus (3,4)', crossings: 8, difficulty: 'hard' },
  { p: 3, q: 5, name: 'Torus (3,5)', crossings: 10, difficulty: 'hard' },
  { p: 3, q: 7, name: 'Torus (3,7)', crossings: 14, difficulty: 'hard' },
  { p: 4, q: 5, name: 'Torus (4,5)', crossings: 16, difficulty: 'hard' },
  // NOTE: T(5,6) - gcd(5,6)=1 ✓
  { p: 5, q: 6, name: 'Torus (5,6)', crossings: 20, difficulty: 'hard' },
  // NOTE: T(3,8) - gcd(3,8)=1 ✓
  { p: 3, q: 8, name: 'Torus (3,8)', crossings: 16, difficulty: 'hard' },
];

/**
 * Generate a Lissajous knot with specific or random parameters
 */
export function generateLissajousKnot(options = {}) {
  const {
    numPoints = 150,
    scale = 0.6,
    zScale = 0.4,
    params = null,
  } = options;
  
  // Pick random parameters or use provided
  const p = params || LISSAJOUS_PARAMS[Math.floor(Math.random() * LISSAJOUS_PARAMS.length)];
  
  const base = [];
  
  // Lissajous curve parametric equations
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    
    const x = Math.sin(p.nx * t + p.phiX * Math.PI);
    const y = Math.sin(p.ny * t + p.phiY * Math.PI);
    const z = Math.sin(p.nz * t + p.phiZ * Math.PI);
    
    base.push({
      x: x * scale,
      y: y * scale,
      z: z * zScale,
    });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.6 * scale, tailPoints: 20 });
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: `lissajous_${p.nx}_${p.ny}_${p.nz}`,
      points,
      isClosed: false,
    }],
    crossings,
    equation: `Lissajous Knot`,
    knotName: p.name || `Lissajous (${p.nx},${p.ny},${p.nz})`,
    params: {
      type: 'lissajous',
      nx: p.nx,
      ny: p.ny,
      nz: p.nz,
      phiX: p.phiX,
      phiY: p.phiY,
      phiZ: p.phiZ,
    },
  };
}

/**
 * Generate a Torus knot with specific or random parameters
 */
export function generateTorusKnot(options = {}) {
  const {
    numPoints = 180,
    scale = 0.5,
    R = 1.0,  // Major radius
    r = 0.4,  // Minor radius
    params = null,
  } = options;
  
  // Pick random parameters or use provided
  const tp = params || TORUS_PARAMS[Math.floor(Math.random() * TORUS_PARAMS.length)];
  const { p, q } = tp;
  
  const base = [];
  
  // Torus knot parametric equations
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    
    const x = (R + r * Math.cos(q * t)) * Math.cos(p * t);
    const y = (R + r * Math.cos(q * t)) * Math.sin(p * t);
    const z = r * Math.sin(q * t);
    
    base.push({
      x: x * scale,
      y: y * scale,
      z: z * scale,
    });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.6 * scale, tailPoints: 20 });
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: `torus_${p}_${q}`,
      points,
      isClosed: false,
    }],
    crossings,
    equation: `Torus Knot`,
    knotName: tp.name || `Torus (${p},${q})`,
    params: {
      type: 'torus',
      p,
      q,
      R,
      r,
    },
  };
}

/**
 * Generate a completely random knot
 * Randomly chooses between Lissajous and Torus knots
 */
export function generateRandomKnot(options = {}) {
  const {
    numPoints = 150,
    scale = 0.6,
  } = options;
  
  // 50% chance Lissajous, 50% chance Torus
  const useLissajous = Math.random() < 0.5;
  
  if (useLissajous) {
    return generateLissajousKnot({ numPoints, scale, zScale: 0.4 });
  } else {
    return generateTorusKnot({ numPoints, scale });
  }
}

/**
 * Generate random Lissajous knot with completely random parameters
 * For more variety in benchmark generation
 */
export function generateRandomLissajousKnot(options = {}) {
  const {
    numPoints = 150,
    scale = 0.6,
    zScale = 0.4,
  } = options;
  
  // Generate random parameters that are likely to produce interesting knots
  const nx = 2 + Math.floor(Math.random() * 4);  // 2-5
  const ny = 2 + Math.floor(Math.random() * 5);  // 2-6
  const nz = 3 + Math.floor(Math.random() * 6);  // 3-8
  const phiX = Math.random() * 0.5;
  const phiY = Math.random() * 0.8;
  const phiZ = Math.random();
  
  const params = {
    nx, ny, nz, phiX, phiY, phiZ,
    name: `Random Lissajous`
  };
  
  return generateLissajousKnot({ numPoints, scale, zScale, params });
}

/**
 * Generate random Torus knot with random coprime parameters
 */
export function generateRandomTorusKnot(options = {}) {
  const {
    numPoints = 180,
    scale = 0.5,
  } = options;
  
  // Generate coprime p and q
  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }
  
  let p, q;
  do {
    p = 2 + Math.floor(Math.random() * 5);  // 2-6
    q = 3 + Math.floor(Math.random() * 7);  // 3-9
  } while (gcd(p, q) !== 1 || p >= q);
  
  const params = {
    p, q,
    name: `Random Torus (${p},${q})`
  };
  
  return generateTorusKnot({ numPoints, scale, params });
}

/**
 * Route A: Random (Three.js-like) Deformed TorusKnot, then cut open with tails.
 * - Geometry-driven generation (stable, batchable)
 * - Projection crossings extracted by real segment intersections (usable as labels)
 * - Reject overly complex samples by crossing count
 */
export function generateRandomDeformedTorusKnot(options = {}) {
  const {
    numPoints = 220,
    scale = 0.55,
    R = 1.0,
    r = 0.42,
    // dataset safety knobs
    maxCrossings = 25,
    minCrossings = 3,
    maxAttempts = 24,
    // deformation knobs (noiseAmp should be modest; recommend <= 2~4 * particleSpacing)
    noiseAmp = null,
    tailLength = 1.8,
    tailPoints = 22,
    seed = null,
  } = options;

  const baseSeed = Number.isFinite(seed) ? seed : (Date.now() >>> 0);
  const rng = mulberry32(baseSeed);

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // choose coprime p,q but keep them modest to avoid extreme crossings
    let p, q;
    do {
      p = 2 + Math.floor(rng() * 5);  // 2..6
      q = 3 + Math.floor(rng() * 7);  // 3..9
    } while (gcd(p, q) !== 1 || p >= q);

    // build closed torus knot base (include duplicate end)
    const base = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * 2 * Math.PI;
      const x = (R + r * Math.cos(q * t)) * Math.cos(p * t);
      const y = (R + r * Math.cos(q * t)) * Math.sin(p * t);
      const z = r * Math.sin(q * t);
      base.push({ x: x * scale, y: y * scale, z: z * scale });
    }

    // estimate spacing to auto-pick a safe deformation amplitude
    let avgSeg = 0;
    for (let i = 0; i < Math.min(64, base.length - 1); i++) {
      const a = base[i], b = base[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      avgSeg += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    avgSeg /= Math.min(64, base.length - 1);
    const safeNoise = Math.max(0, Math.min(4.0 * avgSeg, 0.35 * scale));
    const amp = noiseAmp === null ? (1.5 * avgSeg) : Math.max(0, Math.min(noiseAmp, safeNoise));

    const deformSeed = (baseSeed + attempt * 977) >>> 0;
    const deformed = deformCurve(base, {
      seed: deformSeed,
      noiseAmp: amp,
      noiseFreqs: [1, 2, 3],
      rotate: true,
      anisotropicScale: true,
      localStretch: true,
    });

    const cutIndex = Math.floor(rng() * Math.max(1, deformed.length - 1));
    const points = cutClosedCurveToOpenWithTails(deformed, {
      cutIndex,
      tailLength: tailLength * scale,
      tailPoints,
    });

    const crossings = findCrossings(points, { maxCrossings: maxCrossings + 1, excludeWindow: 8, dedupeDist: 0.02 });
    if (crossings.length > maxCrossings) continue;
    if (crossings.length < minCrossings) continue;

    return {
      leads: [{ name: `deformed_torus_${p}_${q}`, points, isClosed: false }],
      crossings,
      equation: `Deformed Torus Knot`,
      knotName: `Deformed Torus (${p},${q})`,
      params: {
        type: 'deformedTorus',
        p, q, R, r,
        seed: baseSeed,
        attempt,
        noiseAmp: amp,
        cutIndex,
        maxCrossings,
      },
    };
  }

  // Fallback: plain random torus (still open with tails + crossings)
  return generateRandomTorusKnot({ numPoints, scale });
}

/**
 * Get all available predefined knot parameters for UI
 */
export function getAvailableKnotParams() {
  return {
    lissajous: LISSAJOUS_PARAMS.map((p, i) => ({
      id: `lissajous_${i}`,
      label: p.name || `Lissajous (${p.nx}, ${p.ny}, ${p.nz})`,
      params: p,
    })),
    torus: TORUS_PARAMS.map((p, i) => ({
      id: `torus_${i}`,
      label: p.name || `Torus (${p.p}, ${p.q})`,
      params: p,
    })),
  };
}

// ============ Benchmark Difficulty Classification ============

/**
 * Difficulty tier definitions for benchmark dataset generation
 * 
 * EASY (≤4 crossings):
 *   - Unknot (0₁): 0 crossings
 *   - Trefoil (3₁) = T(2,3): 3 crossings
 *   - Figure-8 (4₁): 4 crossings
 * 
 * MEDIUM (5-6 crossings):
 *   - Cinquefoil (5₁) = T(2,5): 5 crossings
 *   - 5₂ (twist knot): 5 crossings
 *   - 6₁, 6₂, 6₃: 6 crossings
 *   - NOTE: T(2,6) does NOT exist as a knot! gcd(2,6)=2≠1
 * 
 * HARD (≥7 crossings + deceptive):
 *   - 7₁ = T(2,7): 7 crossings
 *   - 7₂ and higher twist knots
 *   - T(2,9), T(3,5), etc.
 *   - Kinky unknot (topologically trivial but visually complex)
 */
export const DIFFICULTY_TIERS = {
  easy: {
    level: 0,
    crossingRange: [0, 4],
    knotTypes: [
      { type: 'unknot', crossings: 0, generator: 'generateCircle' },
      { type: 'trefoil', crossings: 3, torusParams: { p: 2, q: 3 } },
      { type: 'figure8', crossings: 4, generator: 'generateFigure8Knot' },
    ],
  },
  medium: {
    level: 1,
    crossingRange: [5, 6],
    knotTypes: [
      { type: 'cinquefoil', crossings: 5, torusParams: { p: 2, q: 5 } },
      { type: 'twist_5_2', crossings: 5, lissajousIdx: 0 }, // 5₂
      { type: '6_1', crossings: 6, lissajousIdx: 1 }, // Stevedore
    ],
    // IMPORTANT: No T(2,6)! It doesn't exist as a knot.
  },
  hard: {
    level: 2,
    crossingRange: [7, Infinity],
    knotTypes: [
      { type: 'septafoil', crossings: 7, torusParams: { p: 2, q: 7 } },
      { type: 'torus_2_9', crossings: 9, torusParams: { p: 2, q: 9 } },
      { type: 'torus_3_5', crossings: 10, torusParams: { p: 3, q: 5 } },
      { type: 'kinky_unknot', crossings: 0, visualCrossings: '5-12', isDeceptive: true },
    ],
    includesKinkyUnknot: true,
  },
};

/**
 * Generate a knot by difficulty level
 * @param {'easy' | 'medium' | 'hard'} difficulty
 * @param {Object} options
 * @returns {Object} Knot with leads, crossings, and metadata
 */
export function generateKnotByDifficulty(difficulty = 'easy', options = {}) {
  const {
    numPoints = 150,
    scale = 0.6,
    seed = null,
  } = options;
  
  const rng = mulberry32(Number.isFinite(seed) ? seed : (Date.now() >>> 0));
  
  const tier = DIFFICULTY_TIERS[difficulty] || DIFFICULTY_TIERS.easy;
  const knotType = tier.knotTypes[Math.floor(rng() * tier.knotTypes.length)];
  
  let result;
  
  if (knotType.type === 'unknot') {
    // Generate simple circle (unknot)
    result = generateUnknotCircle({ numPoints, scale });
  } else if (knotType.type === 'figure8') {
    result = generateFigure8Knot({ numPoints, scale });
  } else if (knotType.type === 'trefoil') {
    result = generateTrefoilKnot({ numPoints, scale });
  } else if (knotType.type === 'kinky_unknot') {
    // Kinky unknot: looks complex but is topologically trivial
    result = generateKinkyUnknot({ 
      numPoints, 
      scale, 
      kinks: 3 + Math.floor(rng() * 4), // 3-6 kinks
      seed: seed || Date.now(),
    });
  } else if (knotType.torusParams) {
    result = generateTorusKnot({ 
      numPoints, 
      scale, 
      params: knotType.torusParams 
    });
  } else if (typeof knotType.lissajousIdx === 'number') {
    result = generateLissajousKnot({ 
      numPoints, 
      scale, 
      params: LISSAJOUS_PARAMS[knotType.lissajousIdx] 
    });
  } else {
    // Fallback to torus knot
    result = generateTorusKnot({ numPoints, scale });
  }
  
  // Add difficulty metadata
  result.difficulty = {
    level: tier.level,
    name: difficulty,
    crossingNumber: knotType.crossings,
    knotType: knotType.type,
    isDeceptive: knotType.isDeceptive || false,
  };
  
  return result;
}

/**
 * Generate a simple circle (unknot) - 0 crossings
 */
export function generateUnknotCircle(options = {}) {
  const {
    numPoints = 100,
    scale = 0.8,
    radius = 1.0,
  } = options;
  
  const base = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const t = (i / numPoints) * 2 * Math.PI;
    const x = radius * Math.cos(t);
    const y = radius * Math.sin(t);
    const z = 0;
    
    base.push({ x: x * scale, y: y * scale, z });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.6 * scale, tailPoints: 20 });
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: 'unknot',
      points,
      isClosed: false,
    }],
    crossings,
    equation: 'Circle',
    knotName: 'Unknot (0₁)',
    params: { type: 'unknot', radius },
  };
}

/**
 * Generate a "kinky" unknot - topologically trivial but visually complex
 * This is a hard negative sample for benchmark: looks like a knot but isn't!
 * 
 * @param {Object} options
 * @param {number} options.kinks - Number of extra "kink" loops (3-8)
 * @param {number} options.seed - Random seed for reproducibility
 */
export function generateKinkyUnknot(options = {}) {
  const {
    numPoints = 200,
    scale = 0.7,
    kinks = 4,
    kinkAmplitude = 0.25,
    seed = null,
  } = options;
  
  const rng = mulberry32(Number.isFinite(seed) ? seed : (Date.now() >>> 0));
  const k = Math.max(2, Math.min(8, kinks));
  
  const base = [];
  const radius = 1.0;
  
  // Create a circle with k "kinks" - local perturbations that look like crossings
  // but don't actually create topological crossings
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = t * 2 * Math.PI;
    
    // Base circle
    let x = radius * Math.cos(angle);
    let y = radius * Math.sin(angle);
    let z = 0;
    
    // Add kinks: each kink is a local "bulge" that goes out of plane
    // but returns, not creating actual crossings
    for (let ki = 0; ki < k; ki++) {
      const kinkCenter = (ki + 0.5) / k;
      const kinkPhase = kinkCenter * 2 * Math.PI;
      
      // Gaussian envelope centered at kink position
      const dist = Math.abs(((t - kinkCenter + 0.5) % 1) - 0.5);
      const sigma = 0.08 + rng() * 0.04;
      const envelope = Math.exp(-dist * dist / (sigma * sigma));
      
      // Kink is an out-of-plane bulge
      const bulgePhase = ki * 1.3 + rng() * 0.5;
      const bulgeX = kinkAmplitude * envelope * Math.sin(angle * 3 + bulgePhase);
      const bulgeY = kinkAmplitude * envelope * Math.cos(angle * 2 + bulgePhase);
      const bulgeZ = kinkAmplitude * 1.5 * envelope * Math.sin(angle * 4 + ki + rng());
      
      x += bulgeX * Math.cos(kinkPhase);
      y += bulgeY * Math.sin(kinkPhase);
      z += bulgeZ;
    }
    
    base.push({ x: x * scale, y: y * scale, z: z * scale });
  }
  
  const points = openWithTailsFromClosedLoop(base, { tailLength: 1.6 * scale, tailPoints: 20 });
  const crossings = findCrossings(points);
  
  return {
    leads: [{
      name: 'kinky_unknot',
      points,
      isClosed: false,
    }],
    crossings,
    equation: 'Kinky Unknot',
    knotName: `Kinky Unknot (${k} kinks)`,
    params: {
      type: 'kinky_unknot',
      kinks: k,
      kinkAmplitude,
      seed,
    },
    // IMPORTANT: Topologically still an unknot!
    isTopologicallyUnknot: true,
    visualCrossingCount: crossings.length,
  };
}

/**
 * Get torus knots filtered by difficulty
 */
export function getTorusKnotsByDifficulty(difficulty = 'all') {
  if (difficulty === 'all') return TORUS_PARAMS;
  return TORUS_PARAMS.filter(p => p.difficulty === difficulty);
}

/**
 * Validate that a T(p,q) torus knot is valid (coprime p,q)
 */
export function isValidTorusKnot(p, q) {
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  return gcd(Math.abs(p), Math.abs(q)) === 1;
}

/**
 * Center a knot around origin
 */
export function centerKnot(knot) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const lead of knot.leads) {
    for (const p of lead.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  
  for (const lead of knot.leads) {
    for (const p of lead.points) {
      p.x -= cx;
      p.y -= cy;
    }
  }
  
  for (const c of knot.crossings) {
    c.x -= cx;
    c.y -= cy;
  }
  
  return knot;
}
