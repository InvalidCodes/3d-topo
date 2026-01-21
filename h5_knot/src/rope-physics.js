/**
 * Rope Physics - PBD/Verlet with stable tightening
 * 
 * Stability improvements:
 * - High damping to prevent oscillation
 * - Gradual constraint solving
 * - Separate collision passes
 * - No rest length shrinking during tightening (only endpoint pulling)
 */

const MIN_SEGMENT_LENGTH = 0.001;
const MAX_CORRECTION = 0.08;  // Reduced for stability and to avoid explosive corrections
const COLLISION_FRICTION = 0.6;  // Tangential friction during contacts
const COLLISION_CORR_LIMIT = 0.04;  // Clamp collision push-out per pass

// Spatial hashing for collisions (huge performance win vs O(N^2) checks)
function cellKey(ix, iy, iz) {
  return `${ix},${iy},${iz}`;
}

function buildSpatialHash(particles, cellSize) {
  const inv = 1 / Math.max(1e-8, cellSize);
  const grid = new Map();
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const ix = Math.floor(p.x * inv);
    const iy = Math.floor(p.y * inv);
    const iz = Math.floor(p.z * inv);
    const key = cellKey(ix, iy, iz);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }
  return { grid, inv };
}

function solvePairCollision(system, i, j, minDist, minDist2, maxCorrPerPass) {
  // Avoid immediate neighbors (rope constraints handle them)
  if (j <= i + 4) return;
  const particles = system.particles;
  const pi = particles[i];
  const pj = particles[j];
  if (!pi || !pj) return;

  const dx = pj.x - pi.x;
  const dy = pj.y - pi.y;
  const dz = pj.z - pi.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= minDist2 || d2 < 1e-10) return;

  const wi = pi.invMass;
  const wj = pj.invMass;
  const wsum = wi + wj;
  if (wsum < 1e-8) return;

  const d = Math.sqrt(d2);
  const overlap = minDist - d;
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;

  const corr = Math.min(overlap * 0.8 / wsum, maxCorrPerPass);

  if (wi > 0) {
    pi.x -= nx * corr * wi;
    pi.y -= ny * corr * wi;
    pi.z -= nz * corr * wi;
  }
  if (wj > 0) {
    pj.x += nx * corr * wj;
    pj.y += ny * corr * wj;
    pj.z += nz * corr * wj;
  }

  // Tangential friction
  const rvx = (pi.x - pi.px) - (pj.x - pj.px);
  const rvy = (pi.y - pi.py) - (pj.y - pj.py);
  const rvz = (pi.z - pi.pz) - (pj.z - pj.pz);
  const vn = rvx * nx + rvy * ny + rvz * nz;
  const tx = rvx - vn * nx;
  const ty = rvy - vn * ny;
  const tz = rvz - vn * nz;
  const tMag = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tMag > 1e-8) {
    const fricScale = Math.min(COLLISION_FRICTION * (overlap / minDist), 0.9);
    const damp = (fricScale / Math.max(wsum, 1e-6));
    if (wi > 0) {
      pi.x -= tx * damp * wi;
      pi.y -= ty * damp * wi;
      pi.z -= tz * damp * wi;
    }
    if (wj > 0) {
      pj.x += tx * damp * wj;
      pj.y += ty * damp * wj;
      pj.z += tz * damp * wj;
    }
  }
}

/**
 * Create rope physics system with crossing-aware resampling
 */
export function createRopeSystem(knot, options = {}) {
  const {
    particleSpacing = 0.1,
    radius = 0.04,
  } = options;
  
  const system = {
    particles: [],
    leadRanges: [],
    distConstraints: [],
    bendConstraints: [],
    crossingConstraints: [],
    radius,
    particleSpacing,
    pins: new Map(),
    initialPullAxis: null,
  };
  
  let particleIdx = 0;
  
  for (let leadIdx = 0; leadIdx < knot.leads.length; leadIdx++) {
    const lead = knot.leads[leadIdx];
    const startIdx = particleIdx;
    
    // Get crossing positions on this lead (now properly finds underpass points)
    const crossingParams = getCrossingParams(lead.points, knot.crossings, leadIdx);
    
    // Sample with crossings as exact points
    const sampled = samplePathWithCrossings(lead.points, particleSpacing, crossingParams);
    
    console.log(`Lead ${leadIdx}: ${lead.points.length} polyline pts -> ${sampled.particles.length} particles, ${sampled.crossingIndices.length} crossing particles`);
    
    for (const p of sampled.particles) {
      system.particles.push({
        x: p.x,
        y: p.y,
        z: p.z,
        px: p.x,
        py: p.y,
        pz: p.z,
        invMass: 1.0,
        leadIdx,
        isCrossing: p.isCrossing || false,
        crossingInfo: p.crossingInfo || null,
      });
      particleIdx++;
    }
    
    const endIdx = particleIdx - 1;
    const head = system.particles[startIdx];
    const tail = system.particles[endIdx];
    const h1 = system.particles[Math.min(startIdx + 1, endIdx)];
    const t1 = system.particles[Math.max(endIdx - 1, startIdx)];
    const dx = tail.x - head.x;
    const dy = tail.y - head.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const pullDir = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
    
    const hdx = h1.x - head.x;
    const hdy = h1.y - head.y;
    const hlen = Math.sqrt(hdx * hdx + hdy * hdy);
    const pullDirStart = hlen > 1e-6 ? { x: hdx / hlen, y: hdy / hlen } : null;
    
    const tdx = tail.x - t1.x;
    const tdy = tail.y - t1.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const pullDirEnd = tlen > 1e-6 ? { x: tdx / tlen, y: tdy / tlen } : null;
    
    system.leadRanges.push({ 
      start: startIdx, 
      end: endIdx, 
      leadIdx,
      crossingIndices: sampled.crossingIndices.map(i => i + startIdx),
      pullDir,
      pullDirStart,
      pullDirEnd,
    });
    
    // Distance constraints
    for (let i = startIdx; i < endIdx; i++) {
      const rest = safeDist(system.particles[i], system.particles[i + 1]);
      if (rest > MIN_SEGMENT_LENGTH) {
        system.distConstraints.push({
          i, j: i + 1,
          rest,
          minRest: rest * 0.5,
          lambda: 0,
        });
      }
    }
    
    // Bend constraints
    for (let i = startIdx; i < endIdx - 1; i++) {
      const rest = safeDist(system.particles[i], system.particles[i + 2]);
      if (rest > MIN_SEGMENT_LENGTH) {
        system.bendConstraints.push({ i, j: i + 2, rest });
      }
    }
    
    // Pin endpoints
    if (sampled.particles.length >= 2) {
      if (lead.isClosed) {
        // Closed curve: pick two opposite anchors
        const numParticles = endIdx - startIdx + 1;
        const anchor1 = startIdx;
        const anchor2 = startIdx + Math.floor(numParticles / 2);
        pinParticle(system, anchor1, true);
        pinParticle(system, anchor2, true);
        system.leadRanges[system.leadRanges.length - 1].anchor1 = anchor1;
        system.leadRanges[system.leadRanges.length - 1].anchor2 = anchor2;
      } else {
        pinParticle(system, startIdx, true);
        pinParticle(system, endIdx, true);
      }
    }
  }
  
  // Build crossing constraints with exact particle indices
  buildCrossingConstraints(system, knot);
  
  // Compute initial pull axis
  computeInitialPullAxis(system);
  
  console.log(`Physics system: ${system.particles.length} particles, ${system.crossingConstraints.length} crossing constraints`);
  
  return system;
}

/**
 * Get crossing parameters (arc length positions) on a lead
 * Now properly finds underpass points which have isUnder=true
 */
function getCrossingParams(points, crossings, leadIdx) {
  const result = [];
  
  const arcLengths = [0];
  for (let i = 1; i < points.length; i++) {
    arcLengths.push(arcLengths[i-1] + safeDist(points[i-1], points[i]));
  }
  const totalLen = arcLengths[arcLengths.length - 1];
  
  for (const c of crossings) {
    if (c.overLeadIdx === leadIdx || c.underLeadIdx === leadIdx) {
      const isOver = c.overLeadIdx === leadIdx;

      // Preferred v2: explicit arc-length parameter t in [0,1]
      // This is robust for crossings found via segment intersection (not necessarily at vertex indices).
      const tKey = isOver ? 'overT' : 'underT';
      const tExplicit = c && Number.isFinite(c[tKey]) ? c[tKey] : null;
      if (tExplicit !== null) {
        result.push({
          t: Math.max(0, Math.min(1, tExplicit)),
          isOver,
          crossing: c,
          pointIdx: null,
        });
        continue;
      }

      // Preferred: explicit polyline point indices (stable)
      const idxKey = isOver ? 'overPointIndex' : 'underPointIndex';
      const idxKeyLegacy = isOver ? 'overPointIdx' : 'underPointIdx';
      const pi = Number.isInteger(c[idxKey]) ? c[idxKey] : (Number.isInteger(c[idxKeyLegacy]) ? c[idxKeyLegacy] : null);

      if (pi !== null && pi >= 0 && pi < points.length) {
        const t = totalLen > 0 ? arcLengths[pi] / totalLen : 0;
        result.push({
          t,
          isOver,
          crossing: c,
          pointIdx: pi,
        });
        continue;
      }

      // Fallback: grid-based matching (ASCII-knot style)
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (pt.gridX === c.gridX && pt.gridY === c.gridY) {
          const matchesRole = isOver ? !pt.isUnder : pt.isUnder;
          if (matchesRole) {
            const t = totalLen > 0 ? arcLengths[i] / totalLen : 0;
            result.push({
              t,
              isOver,
              crossing: c,
              pointIdx: i,
            });
            break;
          }
        }
      }
    }
  }
  
  return result.sort((a, b) => a.t - b.t);
}

/**
 * Sample path with crossing points as exact samples
 */
function samplePathWithCrossings(points, spacing, crossingParams) {
  if (points.length < 2) {
    return { 
      particles: points.map(p => ({ x: p.x, y: p.y, z: p.z || 0 })),
      crossingIndices: [],
    };
  }
  
  const arcLengths = [0];
  for (let i = 1; i < points.length; i++) {
    arcLengths.push(arcLengths[i-1] + safeDist(points[i-1], points[i]));
  }
  const totalLen = arcLengths[arcLengths.length - 1];
  
  if (totalLen < MIN_SEGMENT_LENGTH) {
    return { particles: [{ x: points[0].x, y: points[0].y, z: points[0].z || 0 }], crossingIndices: [] };
  }
  
  // Collect all sample positions
  const sampleTs = new Set();
  
  // Regular samples
  const numRegular = Math.max(2, Math.ceil(totalLen / spacing) + 1);
  for (let i = 0; i < numRegular; i++) {
    sampleTs.add(i / (numRegular - 1));
  }
  
  // Add crossing positions
  for (const cp of crossingParams) {
    sampleTs.add(cp.t);
  }
  
  const sortedTs = Array.from(sampleTs).sort((a, b) => a - b);
  const particles = [];
  const crossingIndices = [];
  
  for (const t of sortedTs) {
    const targetLen = t * totalLen;
    
    let segIdx = 0;
    while (segIdx < arcLengths.length - 1 && arcLengths[segIdx + 1] < targetLen) {
      segIdx++;
    }
    
    const segStart = arcLengths[segIdx];
    const segEnd = arcLengths[segIdx + 1] || segStart;
    const segLen = segEnd - segStart;
    const localT = segLen > MIN_SEGMENT_LENGTH ? (targetLen - segStart) / segLen : 0;
    const localTClamped = Math.max(0, Math.min(1, localT));
    
    const p1 = points[segIdx];
    const p2 = points[Math.min(segIdx + 1, points.length - 1)];
    
    const particle = {
      x: p1.x + (p2.x - p1.x) * localTClamped,
      y: p1.y + (p2.y - p1.y) * localTClamped,
      z: (p1.z || 0) + ((p2.z || 0) - (p1.z || 0)) * localTClamped,
    };
    
    // Check if this is a crossing point
    for (const cp of crossingParams) {
      if (Math.abs(cp.t - t) < 0.001) {
        particle.isCrossing = true;
        particle.crossingInfo = cp;
        crossingIndices.push(particles.length);
        break;
      }
    }
    
    particles.push(particle);
  }
  
  return { particles, crossingIndices };
}

function safeDist(a, b) {
  const dx = (b.x || 0) - (a.x || 0);
  const dy = (b.y || 0) - (a.y || 0);
  const dz = (b.z || 0) - (a.z || 0);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(d) ? d : 0;
}

export function pinParticle(system, idx, pinned) {
  if (idx < 0 || idx >= system.particles.length) return;
  
  if (pinned) {
    const p = system.particles[idx];
    p.invMass = 0;
    system.pins.set(idx, { x: p.x, y: p.y, z: p.z });
  } else {
    system.particles[idx].invMass = 1.0;
    system.pins.delete(idx);
  }
}

/**
 * Build crossing constraints with exact particle indices
 */
function buildCrossingConstraints(system, knot) {
  const minZDiff = system.radius * 4;

  function markFrictionZone(overIdx, underIdx) {
    if (overIdx < 0 || underIdx < 0) return;
    system.particles[overIdx].isCrossing = true;
    system.particles[underIdx].isCrossing = true;
    for (let offset = -2; offset <= 2; offset++) {
      const oi = overIdx + offset;
      const ui = underIdx + offset;
      if (oi >= 0 && oi < system.particles.length) system.particles[oi].nearCrossing = true;
      if (ui >= 0 && ui < system.particles.length) system.particles[ui].nearCrossing = true;
    }
  }

  function addConstraint(overIdx, underIdx, crossing) {
    if (overIdx < 0 || underIdx < 0 || overIdx === underIdx) return;
    const exists = system.crossingConstraints.some(c => c.overIdx === overIdx && c.underIdx === underIdx);
    if (exists) return;

    const point = crossing?.point || (Number.isFinite(crossing?.x) && Number.isFinite(crossing?.y) ? { x: crossing.x, y: crossing.y } : null);
    system.crossingConstraints.push({
      overIdx,
      underIdx,
      minZDiff,
      point: point || undefined,
      // A reasonable default target separation in XY (can be tuned)
      targetDist2D: minZDiff * 0.5,
      xyStiffness: 0.2,
      centerAttract: 0.02,
    });
    markFrictionZone(overIdx, underIdx);
  }

  // 1) Preferred: use exact crossingInfo (from samplePathWithCrossings)
  const byCrossing = new Map(); // crossing -> { overIdx, underIdx }
  for (const range of system.leadRanges) {
    for (const idx of range.crossingIndices || []) {
      const p = system.particles[idx];
      if (!p || !p.crossingInfo) continue;
      const cr = p.crossingInfo.crossing;
      if (!cr) continue;
      if (!byCrossing.has(cr)) byCrossing.set(cr, {});
      const entry = byCrossing.get(cr);
      if (p.crossingInfo.isOver) entry.overIdx = idx;
      else entry.underIdx = idx;
    }
  }
  for (const crossing of knot.crossings || []) {
    const entry = byCrossing.get(crossing);
    if (entry && entry.overIdx !== undefined && entry.underIdx !== undefined) {
      addConstraint(entry.overIdx, entry.underIdx, crossing);
    }
  }

  // 2) Fallback: nearest-particle search by crossing center (works for older generators)
  for (const crossing of knot.crossings || []) {
    const already = system.crossingConstraints.some(cc => {
      // best-effort dedupe by center
      if (!crossing || !Number.isFinite(crossing.x) || !Number.isFinite(crossing.y)) return false;
      const over = system.particles[cc.overIdx];
      const under = system.particles[cc.underIdx];
      if (!over || !under) return false;
      const mx = 0.5 * (over.x + under.x);
      const my = 0.5 * (over.y + under.y);
      const dx = mx - crossing.x;
      const dy = my - crossing.y;
      return (dx * dx + dy * dy) < 1e-4;
    });
    if (already) continue;

    if (!Number.isFinite(crossing.x) || !Number.isFinite(crossing.y)) continue;

    let overIdx = -1, underIdx = -1;
    let minOver = Infinity, minUnder = Infinity;

    for (const range of system.leadRanges) {
      if (range.leadIdx !== crossing.overLeadIdx && range.leadIdx !== crossing.underLeadIdx) continue;
      for (let i = range.start; i <= range.end; i++) {
        const p = system.particles[i];
        const dx = p.x - crossing.x;
        const dy = p.y - crossing.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(d)) continue;

        // If crossing is between two leads, prefer role-specific leads
        if (crossing.overLeadIdx !== crossing.underLeadIdx) {
          if (range.leadIdx === crossing.overLeadIdx && d < minOver) { minOver = d; overIdx = i; }
          if (range.leadIdx === crossing.underLeadIdx && d < minUnder) { minUnder = d; underIdx = i; }
        } else {
          // Self-crossing: use z sign as a heuristic
          if (p.z >= 0 && d < minOver) { minOver = d; overIdx = i; }
          if (p.z <= 0 && d < minUnder) { minUnder = d; underIdx = i; }
        }
      }
    }

    if (overIdx >= 0 && underIdx >= 0) {
      addConstraint(overIdx, underIdx, crossing);
    }
  }
}

function computeInitialPullAxis(system) {
  let totalDx = 0, totalDy = 0;
  
  for (const range of system.leadRanges) {
    const head = system.particles[range.start];
    const tail = system.particles[range.end];
    totalDx += tail.x - head.x;
    totalDy += tail.y - head.y;
  }
  
  const len = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
  if (len > 0.01) {
    system.initialPullAxis = { x: totalDx / len, y: totalDy / len };
  } else {
    system.initialPullAxis = { x: 1, y: 0 };
  }
}

/**
 * Physics step with high damping and friction for stability
 */
export function stepPhysics(system, dt, options = {}) {
  const {
    substeps = 16,
    iterations = 25,
    damping = 0.03,
    bendStiffness = 0.5,
    collisionEnabled = true,
    segmentCollisionEnabled = true,
    segmentCollisionStride = 3,
    segmentSegmentCollisionEnabled = true,
    // XPBD distance compliance (0 = hard PBD). Larger => softer, more stable under strong driving.
    distCompliance = 0.0,
  } = options;

  // Expose last timestep info so tightening/driving code can be dt-aware without threading dt everywhere
  system.lastDt = dt;
  system.lastSubsteps = substeps;
  
  // EXTREME damping - rope should barely move on its own
  // This simulates the high internal friction of real rope fibers
  const baseDamping = Math.min(0.95, 0.65 + damping * 2);  // options.damping boosts damping curve
  const crossDamping = Math.min(0.98, baseDamping + 0.05);
  const nearCrossDamping = Math.min(0.97, baseDamping + 0.02);
  const colRadius = Math.max(system.radius * 2.0, system.particleSpacing * 1.4);  // tighter collision radius to avoid big pushes
  const maxCollisionCorr = COLLISION_CORR_LIMIT * (system.particleSpacing / 0.06);
  
  for (let step = 0; step < substeps; step++) {
    const h = Math.max(1e-6, dt / substeps);
    // XPBD lambdas should be reset each timestep/substep (keeps solver stable under changing conditions)
    if (distCompliance > 0) {
      for (const c of system.distConstraints) c.lambda = 0;
    }

    // 1. Verlet integration with EXTREME damping
    for (const p of system.particles) {
      if (p.invMass === 0) continue;
      
      // Calculate velocity
      let vx = p.x - p.px;
      let vy = p.y - p.py;
      let vz = p.z - p.pz;
      
      // Apply extreme damping based on particle type
      let damp = baseDamping;
      if (p.isCrossing) {
        damp = crossDamping;  // crossings almost locked
      } else if (p.nearCrossing) {
        damp = nearCrossDamping;
      }
      
      vx *= (1 - damp);
      vy *= (1 - damp);
      vz *= (1 - damp);
      
      // Very strict velocity limit
      const maxV = 0.01;  // Much slower for stability
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > maxV) {
        const scale = maxV / speed;
        vx *= scale;
        vy *= scale;
        vz *= scale;
      }
      
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      
      p.x += vx;
      p.y += vy;
      p.z += vz;
    }
    
    // 2. Constraint solving with more iterations
    for (let iter = 0; iter < iterations; iter++) {
      // Distance constraints (inextensible rope)
      for (const c of system.distConstraints) {
        if (distCompliance > 0) {
          solveDistanceConstraintXPBD(system.particles, c, h, distCompliance);
        } else {
          solveDistanceConstraint(system.particles, c.i, c.j, c.rest, 1.0);
        }
      }
      
      // Bend constraints
      for (const c of system.bendConstraints) {
        solveDistanceConstraint(system.particles, c.i, c.j, c.rest, bendStiffness);
      }
      
      // Enforce pins
      for (const [idx, target] of system.pins.entries()) {
        const p = system.particles[idx];
        if (p) {
          p.x = target.x;
          p.y = target.y;
          p.z = target.z;
        }
      }
    }
    
    // 3. Collision detection - MANY passes for robust collision
    if (collisionEnabled) {
      for (let pass = 0; pass < 5; pass++) {
        solveParticleCollisions(system, colRadius, maxCollisionCorr);

        if (segmentCollisionEnabled) {
          solvePointSegmentCollisions(system, colRadius, maxCollisionCorr, {
            stride: segmentCollisionStride,
            segStride: 2,
            excludeWindow: 10,
          });
        }

        if (segmentSegmentCollisionEnabled) {
          solveSegmentSegmentCollisions(system, colRadius, maxCollisionCorr, {
            excludeWindow: 3,
          });
        }
        
        // Crossing constraints
        for (const cc of system.crossingConstraints) {
          solveCrossingConstraint(system.particles, cc);
        }
        
        // Re-enforce pins after each collision pass
        for (const [idx, target] of system.pins.entries()) {
          const p = system.particles[idx];
          if (p) {
            p.x = target.x;
            p.y = target.y;
            p.z = target.z;
          }
        }
      }
    }
    
    // 4. Final pin enforcement
    for (const [idx, target] of system.pins.entries()) {
      const p = system.particles[idx];
      if (p) {
        p.x = target.x;
        p.y = target.y;
        p.z = target.z;
        p.px = target.x;
        p.py = target.y;
        p.pz = target.z;
      }
    }
    
    // 5. NaN recovery and stability check
    for (const p of system.particles) {
      if (!Number.isFinite(p.x)) p.x = p.px || 0;
      if (!Number.isFinite(p.y)) p.y = p.py || 0;
      if (!Number.isFinite(p.z)) p.z = p.pz || 0;
      if (!Number.isFinite(p.px)) p.px = p.x;
      if (!Number.isFinite(p.py)) p.py = p.y;
      if (!Number.isFinite(p.pz)) p.pz = p.z;
    }
  }
}

function solveDistanceConstraint(particles, i, j, rest, stiffness) {
  const pi = particles[i];
  const pj = particles[j];
  if (!pi || !pj) return;
  
  const wi = pi.invMass;
  const wj = pj.invMass;
  const wsum = wi + wj;
  if (wsum < 1e-8) return;
  
  const dx = pj.x - pi.x;
  const dy = pj.y - pi.y;
  const dz = pj.z - pi.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  
  if (d2 < MIN_SEGMENT_LENGTH * MIN_SEGMENT_LENGTH) {
    // Particles too close - push them apart slightly
    const push = MIN_SEGMENT_LENGTH * 0.1;
    if (wi > 0) {
      pi.x -= push * 0.5;
      pi.y -= push * 0.5;
    }
    if (wj > 0) {
      pj.x += push * 0.5;
      pj.y += push * 0.5;
    }
    return;
  }
  
  const d = Math.sqrt(d2);
  const C = d - rest;
  
  // Clamp correction to prevent explosion
  const maxCorr = Math.min(MAX_CORRECTION, rest * 0.1);  // Never correct more than 10% of rest length
  const correction = Math.max(-maxCorr, Math.min(maxCorr, stiffness * C));
  const s = correction / (d * wsum);
  
  if (wi > 0) {
    pi.x += dx * s * wi;
    pi.y += dy * s * wi;
    pi.z += dz * s * wi;
  }
  if (wj > 0) {
    pj.x -= dx * s * wj;
    pj.y -= dy * s * wj;
    pj.z -= dz * s * wj;
  }
}

function solveDistanceConstraintXPBD(particles, c, dt, compliance) {
  const pi = particles[c.i];
  const pj = particles[c.j];
  if (!pi || !pj) return;

  const wi = pi.invMass;
  const wj = pj.invMass;
  const wsum = wi + wj;
  if (wsum < 1e-8) return;

  const dx = pj.x - pi.x;
  const dy = pj.y - pi.y;
  const dz = pj.z - pi.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < MIN_SEGMENT_LENGTH * MIN_SEGMENT_LENGTH) return;

  const d = Math.sqrt(d2);
  const C = d - c.rest;
  const nx = dx / d;
  const ny = dy / d;
  const nz = dz / d;

  // XPBD: alpha = compliance / dt^2
  const alpha = Math.max(0, compliance) / (dt * dt);
  const denom = wsum + alpha;

  // deltaLambda = -(C + alpha*lambda) / (wsum + alpha)
  let dLambda = -(C + alpha * (c.lambda || 0)) / denom;

  // Clamp correction to avoid sudden explosions under strong driving / contacts
  const maxCorr = Math.min(MAX_CORRECTION, c.rest * 0.1);
  const maxDL = maxCorr; // since gradient magnitude is 1
  if (dLambda > maxDL) dLambda = maxDL;
  if (dLambda < -maxDL) dLambda = -maxDL;

  c.lambda = (c.lambda || 0) + dLambda;

  if (wi > 0) {
    pi.x -= nx * dLambda * wi;
    pi.y -= ny * dLambda * wi;
    pi.z -= nz * dLambda * wi;
  }
  if (wj > 0) {
    pj.x += nx * dLambda * wj;
    pj.y += ny * dLambda * wj;
    pj.z += nz * dLambda * wj;
  }
}

function solveParticleCollisions(system, minDist, maxCorrPerPass = Infinity) {
  const particles = system.particles;
  const minDist2 = minDist * minDist;

  // Cell size slightly larger than minDist so neighbors fall into nearby buckets.
  const cellSize = Math.max(minDist * 1.1, 1e-4);
  const { grid, inv } = buildSpatialHash(particles, cellSize);

  const neigh = [-1, 0, 1];

  for (let i = 0; i < particles.length; i++) {
    const pi = particles[i];
    const ix = Math.floor(pi.x * inv);
    const iy = Math.floor(pi.y * inv);
    const iz = Math.floor(pi.z * inv);

    for (const dx of neigh) for (const dy of neigh) for (const dz of neigh) {
      const key = cellKey(ix + dx, iy + dy, iz + dz);
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (let bi = 0; bi < bucket.length; bi++) {
        const j = bucket[bi];
        if (j <= i) continue;
        solvePairCollision(system, i, j, minDist, minDist2, maxCorrPerPass);
      }
    }
  }
}

function solveCrossingConstraint(particles, cc) {
  const over = particles[cc.overIdx];
  const under = particles[cc.underIdx];
  if (!over || !under) return;
  
  const zDiff = over.z - under.z;
  
  // Maintain minimum Z separation
  if (zDiff < cc.minZDiff) {
    const correction = (cc.minZDiff - zDiff) * 0.5;
    
    if (over.invMass > 0) {
      over.z += correction * 0.5;
    }
    if (under.invMass > 0) {
      under.z -= correction * 0.5;
    }
  }

  // XY constraint: keep projected XY close (but not identical)
  const dx = over.x - under.x;
  const dy = over.y - under.y;
  const d = Math.sqrt(dx * dx + dy * dy) + 1e-8;

  const minTarget = cc.minZDiff * 0.5; // consistent scale: radius*2
  const target = Math.max(minTarget, Number.isFinite(cc.targetDist2D) ? cc.targetDist2D : minTarget);
  const err = d - target;
  const k = Number.isFinite(cc.xyStiffness) ? cc.xyStiffness : 0.2;
  const corr = (k * err) / d;

  if (over.invMass > 0) {
    over.x -= dx * corr * 0.5;
    over.y -= dy * corr * 0.5;
  }
  if (under.invMass > 0) {
    under.x += dx * corr * 0.5;
    under.y += dy * corr * 0.5;
  }

  // Optional: weakly attract the crossing pair back to the intended center (prevents drift)
  if (cc.point && Number.isFinite(cc.point.x) && Number.isFinite(cc.point.y)) {
    const mx = 0.5 * (over.x + under.x);
    const my = 0.5 * (over.y + under.y);
    const ax = cc.point.x - mx;
    const ay = cc.point.y - my;
    const att = Number.isFinite(cc.centerAttract) ? cc.centerAttract : 0.02;
    if (over.invMass > 0) { over.x += ax * att; over.y += ay * att; }
    if (under.invMass > 0) { under.x += ax * att; under.y += ay * att; }
  }
}

// Closest points between two segments P(s)=p0+s*u, Q(t)=q0+t*v, s,t in [0,1]
// Returns { c1, c2, s, t } where c1 on segment p0->p1, c2 on q0->q1
function closestPointsSegmentSegment(p0, p1, q0, q1) {
  const ux = p1.x - p0.x;
  const uy = p1.y - p0.y;
  const uz = p1.z - p0.z;
  const vx = q1.x - q0.x;
  const vy = q1.y - q0.y;
  const vz = q1.z - q0.z;
  const wx = p0.x - q0.x;
  const wy = p0.y - q0.y;
  const wz = p0.z - q0.z;

  const a = ux * ux + uy * uy + uz * uz; // |u|^2
  const b = ux * vx + uy * vy + uz * vz; // u·v
  const c = vx * vx + vy * vy + vz * vz; // |v|^2
  const d = ux * wx + uy * wy + uz * wz; // u·w
  const e = vx * wx + vy * wy + vz * wz; // v·w

  const EPS = 1e-12;
  let sN, sD = a;
  let tN, tD = c;

  const D = a * c - b * b;

  if (D < EPS) {
    // Almost parallel
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = (b * e - c * d);
    tN = (a * e - b * d);
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }

  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    if ((-d + b) < 0) sN = 0;
    else if ((-d + b) > a) sN = sD;
    else { sN = (-d + b); sD = a; }
  }

  const s = Math.abs(sN) < EPS ? 0 : (sN / sD);
  const t = Math.abs(tN) < EPS ? 0 : (tN / tD);

  const c1 = { x: p0.x + ux * s, y: p0.y + uy * s, z: p0.z + uz * s };
  const c2 = { x: q0.x + vx * t, y: q0.y + vy * t, z: q0.z + vz * t };
  return { c1, c2, s, t };
}

function buildSegmentSpatialHash(system, cellSize) {
  const particles = system.particles;
  const inv = 1 / Math.max(1e-8, cellSize);
  const grid = new Map();
  for (let i = 0; i < particles.length - 1; i++) {
    const a = particles[i];
    const b = particles[i + 1];
    // segments only within same lead
    if (a.leadIdx !== b.leadIdx) continue;
    const mx = 0.5 * (a.x + b.x);
    const my = 0.5 * (a.y + b.y);
    const mz = 0.5 * (a.z + b.z);
    const ix = Math.floor(mx * inv);
    const iy = Math.floor(my * inv);
    const iz = Math.floor(mz * inv);
    const key = cellKey(ix, iy, iz);
    let bucket = grid.get(key);
    if (!bucket) { bucket = []; grid.set(key, bucket); }
    bucket.push(i); // segment index i means (i,i+1)
  }
  return { grid, inv };
}

function solveSegmentSegmentCollisions(system, minDist, maxCorrPerPass = Infinity, options = {}) {
  const {
    pad = 0.0,
    excludeWindow = 3, // exclude nearby segments within same lead (share endpoints / adjacent)
  } = options;

  const particles = system.particles;
  if (particles.length < 4) return;

  const minD = Math.max(1e-6, minDist + pad);
  const minD2 = minD * minD;
  const cellSize = Math.max(minD * 1.2, 1e-4);
  const { grid, inv } = buildSegmentSpatialHash(system, cellSize);
  const neigh = [-1, 0, 1];

  for (let si = 0; si < particles.length - 1; si++) {
    const a0 = particles[si];
    const a1 = particles[si + 1];
    if (a0.leadIdx !== a1.leadIdx) continue;

    const mx = 0.5 * (a0.x + a1.x);
    const my = 0.5 * (a0.y + a1.y);
    const mz = 0.5 * (a0.z + a1.z);
    const ix = Math.floor(mx * inv);
    const iy = Math.floor(my * inv);
    const iz = Math.floor(mz * inv);

    for (const dx of neigh) for (const dy of neigh) for (const dz of neigh) {
      const key = cellKey(ix + dx, iy + dy, iz + dz);
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (let bi = 0; bi < bucket.length; bi++) {
        const sj = bucket[bi];
        if (sj <= si) continue;

        const b0 = particles[sj];
        const b1 = particles[sj + 1];
        if (b0.leadIdx !== b1.leadIdx) continue;

        // If same lead, exclude very near segments (share endpoints / adjacent)
        if (a0.leadIdx === b0.leadIdx && Math.abs(si - sj) <= excludeWindow) continue;

        const wi0 = a0.invMass, wi1 = a1.invMass, wj0 = b0.invMass, wj1 = b1.invMass;
        const wsum = wi0 + wi1 + wj0 + wj1;
        if (wsum < 1e-8) continue;

        const { c1, c2, s, t } = closestPointsSegmentSegment(a0, a1, b0, b1);
        const nx = c1.x - c2.x;
        const ny = c1.y - c2.y;
        const nz = c1.z - c2.z;
        const d2 = nx * nx + ny * ny + nz * nz;
        if (d2 >= minD2 || d2 < 1e-14) continue;

        const d = Math.sqrt(d2);
        const overlap = minD - d;
        const ux = nx / d;
        const uy = ny / d;
        const uz = nz / d;

        // Distribute via barycentric weights at closest points
        const wa0 = wi0 * (1 - s);
        const wa1 = wi1 * s;
        const wb0 = wj0 * (1 - t);
        const wb1 = wj1 * t;
        const wsumLocal = wa0 + wa1 + wb0 + wb1;
        if (wsumLocal < 1e-8) continue;

        const corr = Math.min(overlap * 0.7 / wsumLocal, maxCorrPerPass);

        if (wa0 > 0) { a0.x += ux * corr * wa0; a0.y += uy * corr * wa0; a0.z += uz * corr * wa0; }
        if (wa1 > 0) { a1.x += ux * corr * wa1; a1.y += uy * corr * wa1; a1.z += uz * corr * wa1; }
        if (wb0 > 0) { b0.x -= ux * corr * wb0; b0.y -= uy * corr * wb0; b0.z -= uz * corr * wb0; }
        if (wb1 > 0) { b1.x -= ux * corr * wb1; b1.y -= uy * corr * wb1; b1.z -= uz * corr * wb1; }
      }
    }
  }
}

function closestPointOnSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 < 1e-12) return { x: ax, y: ay, z: az, t: 0 };
  let t = (apx * abx + apy * aby + apz * abz) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, y: ay + aby * t, z: az + abz * t, t };
}

// Low-cost anti-tunneling: point-to-segment collision, stride sampled.
// This catches the common "segment slips between two particles" failure mode.
function solvePointSegmentCollisions(system, minDist, maxCorrPerPass = Infinity, options = {}) {
  const {
    stride = 3,
    segStride = 2,
    excludeWindow = 8,
  } = options;

  const particles = system.particles;
  if (particles.length < 4) return;

  const minDist2 = minDist * minDist;
  const cellSize = Math.max(minDist * 1.1, 1e-4);
  const { grid, inv } = buildSpatialHash(particles, cellSize);
  const neigh = [-1, 0, 1];

  for (let i = 0; i < particles.length; i += Math.max(1, stride)) {
    const p = particles[i];
    const wi = p.invMass;
    if (wi <= 0) continue;

    const ix = Math.floor(p.x * inv);
    const iy = Math.floor(p.y * inv);
    const iz = Math.floor(p.z * inv);

    for (const dx of neigh) for (const dy of neigh) for (const dz of neigh) {
      const key = cellKey(ix + dx, iy + dy, iz + dz);
      const bucket = grid.get(key);
      if (!bucket) continue;

      for (let bi = 0; bi < bucket.length; bi += Math.max(1, segStride)) {
        const j = bucket[bi];
        // Segment is (j, j+1)
        if (j < 0 || j >= particles.length - 1) continue;
        if (Math.abs(i - j) < excludeWindow || Math.abs(i - (j + 1)) < excludeWindow) continue;

        const a = particles[j];
        const b = particles[j + 1];
        const wj = a.invMass;
        const wk = b.invMass;
        const wsum = wi + wj + wk;
        if (wsum < 1e-8) continue;

        const c = closestPointOnSegment(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z);
        const nx = p.x - c.x;
        const ny = p.y - c.y;
        const nz = p.z - c.z;
        const d2 = nx * nx + ny * ny + nz * nz;
        if (d2 >= minDist2 || d2 < 1e-12) continue;

        const d = Math.sqrt(d2);
        const overlap = minDist - d;
        const ux = nx / d;
        const uy = ny / d;
        const uz = nz / d;

        // Distribute correction: push point out, pull segment endpoints slightly
        const corr = Math.min(overlap * 0.6 / wsum, maxCorrPerPass);

        if (wi > 0) {
          p.x += ux * corr * wi;
          p.y += uy * corr * wi;
          p.z += uz * corr * wi;
        }

        // Split segment correction by barycentric t
        const t = c.t;
        const wa = wj * (1 - t);
        const wb = wk * t;
        if (wa > 0) {
          a.x -= ux * corr * wa;
          a.y -= uy * corr * wa;
          a.z -= uz * corr * wa;
        }
        if (wb > 0) {
          b.x -= ux * corr * wb;
          b.y -= uy * corr * wb;
          b.z -= uz * corr * wb;
        }
      }
    }
  }
}

/**
 * Pull endpoints/anchors to tighten the knot
 * Handles both open curves (endpoints) and closed curves (anchor points)
 */
export function pullEndpoints(system, strength) {
  // Make tightening step scale-consistent and frame-rate independent.
  // Pulling pins too far in one frame is a common cause of tunneling/explosions.
  const dt = Number.isFinite(system?.lastDt) ? system.lastDt : 0.016;
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0));
  const spacing = Math.max(1e-6, Number.isFinite(system?.particleSpacing) ? system.particleSpacing : 0.06);
  const radius = Math.max(1e-6, Number.isFinite(system?.radius) ? system.radius : 0.03);

  // Base pull is proportional to spacing (knot scale) and normalized to 60fps.
  // Then clamp to a small fraction of spacing/radius to prevent "teleport pulls".
  let pullAmount = (0.05 * spacing) * (0.2 + s) * (dt / 0.016);
  const maxStep = Math.max(1e-6, Math.min(0.15 * spacing, 0.30 * radius));
  if (pullAmount > maxStep) pullAmount = maxStep;
  const fallbackAxis = system.initialPullAxis || { x: 1, y: 0 };
  
  for (const range of system.leadRanges) {
    // Get the two anchor points (whether closed or open curve)
    let anchor1Idx, anchor2Idx;
    
    if (range.anchor1 !== undefined && range.anchor2 !== undefined) {
      // Use stored anchors (for closed curves)
      anchor1Idx = range.anchor1;
      anchor2Idx = range.anchor2;
    } else {
      // Use start/end (for open curves)
      anchor1Idx = range.start;
      anchor2Idx = range.end;
    }
    
    // Make sure both anchors are pinned
    if (!system.pins.has(anchor1Idx) || !system.pins.has(anchor2Idx)) {
      console.warn('Anchors not pinned:', anchor1Idx, anchor2Idx);
      continue;
    }
    
    const pin1 = system.pins.get(anchor1Idx);
    const pin2 = system.pins.get(anchor2Idx);
    
    // Prefer per-end directions (tangent-like), fall back to anchor axis
    const startDir = range.pullDirStart;
    const endDir = range.pullDirEnd;
    
    if (startDir && endDir) {
      // Pull outwards from each end
      pin1.x -= startDir.x * pullAmount;
      pin1.y -= startDir.y * pullAmount;
      pin2.x += endDir.x * pullAmount;
      pin2.y += endDir.y * pullAmount;
      continue;
    }
    
    // Calculate direction between anchors
    const dx = pin2.x - pin1.x;
    const dy = pin2.y - pin1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    // Use stable axis when anchors get too close to avoid pulling in same direction
    const axis = len > 0.001 
      ? { x: dx / len, y: dy / len }
      : (range.pullDir || fallbackAxis);
    
    // Pull BOTH anchors apart equally in opposite directions
    pin1.x -= axis.x * pullAmount;
    pin1.y -= axis.y * pullAmount;
    pin2.x += axis.x * pullAmount;
    pin2.y += axis.y * pullAmount;
  }
}

export function getEndpoints(system) {
  const endpoints = [];
  for (const range of system.leadRanges) {
    endpoints.push(range.start, range.end);
  }
  return endpoints;
}
