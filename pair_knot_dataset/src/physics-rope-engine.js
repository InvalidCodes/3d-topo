/**
 * Physics Rope Engine (Rapier.js)
 *
 * Goal:
 * - Provide a real physics-driven rope made of multiple rigid bodies + joints.
 * - Let callers "grab" / "pull" segments to tie knots procedurally.
 * - Export rope centerline points for Three.js rendering (TubeGeometry).
 *
 * Notes:
 * - This module provides the physics rope primitive. It does NOT (yet) implement
 *   high-level knot-tying scripts (e.g. "tie overhand"). Those should be built
 *   on top of `grab()/setKinematicTarget()/release()` and `step()/settle()`.
 * - Rapier self-collision filtering for adjacent segments is non-trivial without
 *   custom filters. We keep defaults conservative (small radius, damping) and
 *   expose tuning knobs; for higher fidelity, add contact filtering later.
 */

import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.12.0';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function v3(x = 0, y = 0, z = 0) { return { x, y, z }; }

function sleep(ms) {
  const t = Number(ms) || 0;
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, t)));
}

function toRapierV3(p) {
  if (!p) return v3(0, 0, 0);
  // Accept {x,y,z} or [x,y,z]
  if (Array.isArray(p)) return v3(p[0] || 0, p[1] || 0, p[2] || 0);
  return v3(p.x || 0, p.y || 0, p.z || 0);
}

function add(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
function mul(a, s) { return v3(a.x * s, a.y * s, a.z * s); }

function length(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function normalize(a) {
  const l = length(a);
  return l > 1e-9 ? mul(a, 1 / l) : v3(1, 0, 0);
}

function jointDataBall(R, anchorA, anchorB) {
  // Compatibility shim: Rapier uses "spherical" in newer docs, "ball" in some versions.
  if (R?.JointData?.spherical) return R.JointData.spherical(anchorA, anchorB);
  if (R?.JointData?.ball) return R.JointData.ball(anchorA, anchorB);
  if (R?.JointData?.ballJoint) return R.JointData.ballJoint(anchorA, anchorB);
  throw new Error('Rapier JointData ball/spherical joint not found (API mismatch).');
}

/**
 * A physics rope built from capsules + spherical joints.
 */
export class PhysicsRope {
  constructor(config = {}) {
    this.segmentCount = Math.max(2, Math.floor(config.segments ?? 50));
    this.segmentLength = Math.max(0.01, Number(config.segmentLength ?? 0.10));
    this.radius = Math.max(0.002, Number(config.radius ?? 0.03));

    // Dynamics tuning
    this.gravity = toRapierV3(config.gravity ?? { x: 0, y: -9.81, z: 0 });
    this.linearDamping = clamp(Number(config.damping ?? 5), 0, 50);
    this.angularDamping = clamp(Number(config.angularDamping ?? 5), 0, 50);

    // Rope stability: CCD helps prevent tunneling at higher velocities.
    this.enableCCD = config.enableCCD !== false;

    // Pin endpoints (common for tying)
    this.pinStart = config.pinStart ?? false;
    this.pinEnd = config.pinEnd ?? false;

    // Internal state
    this._inited = false;
    this.world = null;
    this.bodies = [];
    this.colliders = [];
    this.joints = [];
    this._grabbed = new Map(); // idx -> { prevType }
  }

  async init() {
    if (this._inited) return;
    await RAPIER.init();

    this.world = new RAPIER.World(this.gravity);
    this.bodies = [];
    this.colliders = [];
    this.joints = [];

    // Create rope segments aligned along +X.
    for (let i = 0; i < this.segmentCount; i++) {
      const x = i * this.segmentLength;

      const isPinnedStart = this.pinStart && i === 0;
      const isPinnedEnd = this.pinEnd && i === this.segmentCount - 1;

      const bodyDesc = (isPinnedStart || isPinnedEnd)
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.dynamic();

      bodyDesc.setTranslation(x, 0, 0);

      const body = this.world.createRigidBody(bodyDesc);
      body.setLinearDamping(this.linearDamping);
      body.setAngularDamping(this.angularDamping);
      if (this.enableCCD) body.enableCcd(true);

      // Capsule aligned with local Y axis by default in Rapier; we want along X.
      // Use a rotation around Z by 90 degrees so capsule axis maps to X.
      const half = this.segmentLength * 0.5;
      const colliderDesc = RAPIER.ColliderDesc.capsule(half, this.radius)
        .setFriction(0.8)      // 摩擦力（防止滑动）
        .setRestitution(0.1)   // 弹性（轻微反弹）
        .setDensity(1.2)       // 密度（影响重量）
        .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) }); // quat for 90deg around Z

      const collider = this.world.createCollider(colliderDesc, body);
      this.bodies.push(body);
      this.colliders.push(collider);
    }

    // Connect segments with spherical joints at the ends.
    for (let i = 0; i < this.segmentCount - 1; i++) {
      const a = this.bodies[i];
      const b = this.bodies[i + 1];
      const anchorA = v3(+this.segmentLength / 2, 0, 0);
      const anchorB = v3(-this.segmentLength / 2, 0, 0);
      const jd = jointDataBall(RAPIER, anchorA, anchorB);
      const joint = this.world.createImpulseJoint(jd, a, b, true);
      this.joints.push(joint);
    }

    this._inited = true;
  }

  setGravity(g) {
    this.gravity = toRapierV3(g);
    if (this.world) this.world.gravity = this.gravity;
  }

  /**
   * Advance physics by one step.
   * Note: rapier3d-compat uses `world.timestep = dt` in many versions.
   */
  step(dt = 1 / 60) {
    if (!this.world) throw new Error('PhysicsRope: init() must be awaited before step().');
    const d = Number(dt) || (1 / 60);
    if ('timestep' in this.world) this.world.timestep = d;
    // Some versions use integrationParameters.dt
    if (this.world.integrationParameters && 'dt' in this.world.integrationParameters) {
      this.world.integrationParameters.dt = d;
    }
    this.world.step();
  }

  /**
   * Convenience: step multiple times until the rope settles.
   * This checks body sleep state (if available); otherwise runs fixed steps.
   */
  settle({ maxSteps = 900, dt = 1 / 60, sleepEps = 0.02 } = {}) {
    if (!this.world) throw new Error('PhysicsRope: init() must be awaited before settle().');
    const steps = Math.max(1, Math.floor(maxSteps));
    const eps = Math.max(0, Number(sleepEps) || 0);

    for (let i = 0; i < steps; i++) {
      this.step(dt);
      // If all bodies are sleeping (or near-zero velocity), stop early.
      let awake = 0;
      for (const b of this.bodies) {
        const lv = b.linvel?.() ?? v3(0, 0, 0);
        const av = b.angvel?.() ?? v3(0, 0, 0);
        const speed = Math.max(length(lv), length(av));
        if (speed > eps) { awake++; break; }
      }
      if (awake === 0) break;
    }
  }

  /**
   * Quick stability check (for scripted tying loops).
   */
  isStable({ sleepEps = 0.02 } = {}) {
    const eps = Math.max(0, Number(sleepEps) || 0);
    for (const b of this.bodies) {
      const lv = b.linvel?.() ?? v3(0, 0, 0);
      const av = b.angvel?.() ?? v3(0, 0, 0);
      const speed = Math.max(length(lv), length(av));
      if (speed > eps) return false;
    }
    return true;
  }

  /**
   * Make a segment kinematic so it can be moved by setting a target.
   * Returns a handle id (the index).
   */
  grab(index) {
    const idx = Math.max(0, Math.min(this.bodies.length - 1, Math.floor(index)));
    const body = this.bodies[idx];
    if (!body) throw new Error('PhysicsRope.grab: invalid index');
    if (this._grabbed.has(idx)) return idx;

    // Store previous type by probing isKinematic/isDynamic if available.
    const prev = { wasKinematic: body.isKinematic?.() ?? false };
    // Switch to kinematic position-based
    const pos = body.translation();
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z)
    );
    rb.setLinearDamping(this.linearDamping);
    rb.setAngularDamping(this.angularDamping);
    if (this.enableCCD) rb.enableCcd(true);

    // Move collider from old body to new body (Rapier doesn't support reparenting directly).
    // We recreate a collider with the same shape params.
    const oldCol = this.colliders[idx];
    const half = this.segmentLength * 0.5;
    const colDesc = RAPIER.ColliderDesc.capsule(half, this.radius)
      .setFriction(0.8)
      .setRestitution(0.1)
      .setDensity(1.2)
      .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });

    // Remove old collider/body
    if (oldCol) this.world.removeCollider(oldCol, true);
    this.world.removeRigidBody(body);

    const newCol = this.world.createCollider(colDesc, rb);
    this.bodies[idx] = rb;
    this.colliders[idx] = newCol;

    // NOTE: Joints become invalid when bodies are replaced. For simplicity,
    // grabbing is intended for endpoints (or you can rebuild joints).
    // We'll rebuild joints fully.
    this._rebuildJoints();

    this._grabbed.set(idx, prev);
    return idx;
  }

  setKinematicTarget(index, target) {
    const idx = Math.max(0, Math.min(this.bodies.length - 1, Math.floor(index)));
    const body = this.bodies[idx];
    if (!body) throw new Error('PhysicsRope.setKinematicTarget: invalid index');
    const t = toRapierV3(target);
    if (body.setNextKinematicTranslation) {
      body.setNextKinematicTranslation(t);
    } else if (body.setTranslation) {
      body.setTranslation(t, true);
    } else {
      throw new Error('PhysicsRope: cannot set kinematic target (API mismatch).');
    }
  }

  release(index) {
    const idx = Math.max(0, Math.min(this.bodies.length - 1, Math.floor(index)));
    if (!this._grabbed.has(idx)) return;
    // Convert grabbed body back to dynamic by replacing it (same as grab).
    const body = this.bodies[idx];
    const pos = body.translation();
    const rb = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
    );
    rb.setLinearDamping(this.linearDamping);
    rb.setAngularDamping(this.angularDamping);
    if (this.enableCCD) rb.enableCcd(true);

    const oldCol = this.colliders[idx];
    const half = this.segmentLength * 0.5;
    const colDesc = RAPIER.ColliderDesc.capsule(half, this.radius)
      .setFriction(0.8)
      .setRestitution(0.1)
      .setDensity(1.2)
      .setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) });

    if (oldCol) this.world.removeCollider(oldCol, true);
    this.world.removeRigidBody(body);

    const newCol = this.world.createCollider(colDesc, rb);
    this.bodies[idx] = rb;
    this.colliders[idx] = newCol;

    this._rebuildJoints();
    this._grabbed.delete(idx);
  }

  /**
   * Returns rope centerline points as plain {x,y,z} objects (no THREE dependency).
   */
  getPoints() {
    return this.bodies.map((b) => {
      const p = b.translation();
      return v3(p.x, p.y, p.z);
    });
  }

  /**
   * Convenience: get an endpoint position.
   */
  getEndPoints() {
    const a = this.bodies[0]?.translation?.() ?? v3(0, 0, 0);
    const b = this.bodies[this.bodies.length - 1]?.translation?.() ?? v3(0, 0, 0);
    return { start: v3(a.x, a.y, a.z), end: v3(b.x, b.y, b.z) };
  }

  /**
   * Clean up rapier objects.
   */
  dispose() {
    if (!this.world) return;
    for (const j of this.joints) this.world.removeImpulseJoint(j, true);
    for (const c of this.colliders) this.world.removeCollider(c, true);
    for (const b of this.bodies) this.world.removeRigidBody(b);
    this.joints = [];
    this.colliders = [];
    this.bodies = [];
    this.world = null;
    this._inited = false;
    this._grabbed.clear();
  }

  // --- internal ---
  _rebuildJoints() {
    // Remove old joints
    for (const j of this.joints) this.world.removeImpulseJoint(j, true);
    this.joints = [];
    for (let i = 0; i < this.segmentCount - 1; i++) {
      const a = this.bodies[i];
      const b = this.bodies[i + 1];
      const anchorA = v3(+this.segmentLength / 2, 0, 0);
      const anchorB = v3(-this.segmentLength / 2, 0, 0);
      const jd = jointDataBall(RAPIER, anchorA, anchorB);
      const joint = this.world.createImpulseJoint(jd, a, b, true);
      this.joints.push(joint);
    }
  }
}

function applyForceCompat(body, force, wakeUp = true) {
  const f = toRapierV3(force);
  if (!body) return;
  // Rapier compat: prefer addForce; fallback to applyImpulse.
  if (typeof body.addForce === 'function') {
    body.addForce(f, wakeUp);
    return;
  }
  if (typeof body.applyImpulse === 'function') {
    // Impulse approximation (force * dt is handled by caller by repeating).
    body.applyImpulse(f, wakeUp);
  }
}

/**
 * Knot-tying scripts driven by physics actions.
 *
 * This is intentionally heuristic: the goal is a visually plausible knot with
 * collision, gravity and tension—not a guaranteed knot-tying robot planner.
 */
export class KnotTyer {
  constructor(rope) {
    this.rope = rope;
  }

  async _stepMany(steps, { dt = 1 / 60, yieldMs = 0 } = {}) {
    const s = Math.max(1, Math.floor(steps));
    for (let i = 0; i < s; i++) {
      this.rope.step(dt);
      if (yieldMs > 0 && (i % 2 === 0)) await sleep(yieldMs);
    }
  }

  async _applyForceOverSteps(indices, force, steps, { dt = 1 / 60, yieldMs = 0 } = {}) {
    const idxs = (indices || []).filter((i) => Number.isFinite(i));
    const s = Math.max(1, Math.floor(steps));
    for (let k = 0; k < s; k++) {
      for (const i of idxs) applyForceCompat(this.rope.bodies[i], force, true);
      this.rope.step(dt);
      if (yieldMs > 0 && (k % 2 === 0)) await sleep(yieldMs);
    }
  }

  // 打 overhand 结的物理过程（heuristic）
  async tieOverhandKnot(options = {}) {
    const {
      dt = 1 / 60,
      realtime = false,
      yieldMs = 8,
      liftForce = 10,
      threadForce = { x: -14, y: 1.5, z: 10 },
      tightenForce = 28,
      compressFactor = 0.75, // pull endpoints closer to create slack
    } = options;

    await this.rope.init();
    const bodies = this.rope.bodies;
    const n = bodies.length;
    if (n < 20) throw new Error('tieOverhandKnot: rope needs >= 20 segments');

    const yMs = realtime ? yieldMs : 0;

    // 1) Grab endpoints (kinematic) to "fix" them.
    const sIdx = this.rope.grab(0);
    const eIdx = this.rope.grab(n - 1);

    const a0 = this.rope.bodies[sIdx].translation();
    const b0 = this.rope.bodies[eIdx].translation();

    // 2) Create slack by compressing endpoints towards center.
    const midX = (a0.x + b0.x) * 0.5;
    const targetA = v3(midX - (midX - a0.x) * compressFactor, a0.y, a0.z);
    const targetB = v3(midX + (b0.x - midX) * compressFactor, b0.y, b0.z);

    const compressSteps = 50;
    for (let i = 0; i < compressSteps; i++) {
      const t = (i + 1) / compressSteps;
      const pa = v3(a0.x + (targetA.x - a0.x) * t, 0, 0);
      const pb = v3(b0.x + (targetB.x - b0.x) * t, 0, 0);
      this.rope.setKinematicTarget(sIdx, pa);
      this.rope.setKinematicTarget(eIdx, pb);
      this.rope.step(dt);
      if (yMs > 0 && (i % 2 === 0)) await sleep(yMs);
    }

    // 3) Lift middle to form a loop.
    const mid = Math.floor(n / 2);
    const liftIdx = [];
    for (let i = mid - 6; i <= mid + 6; i++) if (i >= 1 && i <= n - 2) liftIdx.push(i);
    await this._applyForceOverSteps(liftIdx, { x: 0, y: liftForce, z: 2.0 }, 80, { dt, yieldMs: yMs });

    // 4) Thread the tail through: push last segments sideways + forward.
    const tailIdx = [];
    for (let i = n - 14; i < n - 2; i++) tailIdx.push(i);
    await this._applyForceOverSteps(tailIdx, threadForce, 120, { dt, yieldMs: yMs });

    // 5) Tighten by pulling near-end segments in opposite directions.
    const leftPull = [2, 3, 4, 5].filter(i => i < n);
    const rightPull = [n - 6, n - 5, n - 4, n - 3].filter(i => i >= 0);
    await this._applyForceOverSteps(leftPull, { x: -tightenForce, y: 0, z: 0 }, 80, { dt, yieldMs: yMs });
    await this._applyForceOverSteps(rightPull, { x: +tightenForce, y: 0, z: 0 }, 80, { dt, yieldMs: yMs });

    // 6) Let it settle while keeping endpoints pinned.
    for (let i = 0; i < 300; i++) {
      // keep endpoints at last targets
      this.rope.setKinematicTarget(sIdx, targetA);
      this.rope.setKinematicTarget(eIdx, targetB);
      this.rope.step(dt);
      if (this.rope.isStable({ sleepEps: 0.03 })) break;
      if (yMs > 0 && (i % 2 === 0)) await sleep(yMs);
    }

    // 7) Release endpoints and settle again.
    this.rope.release(sIdx);
    this.rope.release(eIdx);
    this.rope.settle({ maxSteps: 600, dt, sleepEps: 0.03 });
  }

  // 打 Figure-8 结（占位：需要更复杂的“二次穿越”脚本）
  async tieFigure8Knot() {
    throw new Error('tieFigure8Knot: not implemented yet (needs a two-pass threading script).');
  }
}

/**
 * A very small helper to run a scripted motion:
 * - grab endpoints
 * - move them along two paths (arrays of {x,y,z})
 * - simulate while moving
 * - release and settle
 */
export async function simulateRopeWithEndpointPaths({
  rope,
  startPath,
  endPath,
  stepsPerKeyframe = 8,
  dt = 1 / 60,
  settleSteps = 600,
} = {}) {
  if (!rope) throw new Error('simulateRopeWithEndpointPaths: missing rope');
  await rope.init();

  const sIdx = rope.grab(0);
  const eIdx = rope.grab(rope.segmentCount - 1);

  const sp = (startPath || []).map(toRapierV3);
  const ep = (endPath || []).map(toRapierV3);
  const K = Math.min(sp.length, ep.length);
  const subSteps = Math.max(1, Math.floor(stepsPerKeyframe));

  for (let k = 0; k < K; k++) {
    const a = sp[k];
    const b = ep[k];
    for (let s = 0; s < subSteps; s++) {
      rope.setKinematicTarget(sIdx, a);
      rope.setKinematicTarget(eIdx, b);
      rope.step(dt);
    }
  }

  rope.release(sIdx);
  rope.release(eIdx);
  rope.settle({ maxSteps: settleSteps, dt });

  return rope.getPoints();
}

export default {
  PhysicsRope,
  KnotTyer,
  simulateRopeWithEndpointPaths,
};

