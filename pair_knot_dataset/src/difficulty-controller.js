/**
 * Unified Difficulty Controller
 *
 * Provides consistent difficulty scoring across:
 * 1) Single closed-loop knot images
 * 2) Single open-loop knot images
 * 3) Pair images (invariance dataset)
 *
 * Output convention:
 * - difficulty_score: number in [0,1]
 * - difficulty: 'easy' | 'medium' | 'hard'
 * - factors: object of normalized sub-scores (generally [0,1])
 */

import { getCrossingNumber, isDeceptiveKnot, isConfusingPair } from './knot-type-registry.js';

// ============= Helpers =============

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function scoreToLevel(score) {
  const s = clamp(score, 0, 1);
  return s < 0.35 ? 'easy' : (s < 0.65 ? 'medium' : 'hard');
}

/**
 * Compute view angle difficulty from camera position.
 * Top-down (high |y|) or front/back (high |z|) -> easier
 * Oblique angles -> harder
 * @param {number[]} cameraPos [x,y,z]
 * @returns {number} in [0,1]
 */
export function computeViewDifficultyScore(cameraPos) {
  const [x = 0, y = 0, z = 0] = cameraPos || [];
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const ny = y / r;
  const nz = z / r;
  const alignScore = Math.max(Math.abs(ny), Math.abs(nz)); // 1 means aligned to easy axis
  return clamp(1 - alignScore, 0, 1);
}

/**
 * Compute angle difference between two camera positions (0-1).
 * @param {number[]} posA
 * @param {number[]} posB
 */
export function computeViewAngleDiff(posA, posB) {
  const a = posA || [0, 0, 1];
  const b = posB || [0, 0, 1];
  const normA = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) || 1;
  const normB = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2) || 1;
  const dot = (
    (a[0] / normA) * (b[0] / normB) +
    (a[1] / normA) * (b[1] / normB) +
    (a[2] / normA) * (b[2] / normB)
  );
  return Math.acos(clamp(dot, -1, 1)) / Math.PI;
}

// ============= Single Closed-Loop =============

export function computeSingleClosedLoopDifficulty(params) {
  const {
    knotType,
    deformStrength = 0.3,
    cameraPosition = [0, 5, 10],
    tubeRadius = 0.08,
  } = params || {};

  const weights = {
    crossing: 0.25,
    deform: 0.20,
    view: 0.20,
    occlusion: 0.15,
    deceptive: 0.20,
  };

  const crossingNumber = getCrossingNumber(knotType) || 0;
  const crossingScore = clamp(crossingNumber / 10, 0, 1);
  const deformScore = clamp(deformStrength, 0, 1);
  const viewScore = computeViewDifficultyScore(cameraPosition);

  // proxy for "occlusion/visual ambiguity": thicker rope + more crossings => more self-occlusion
  const occlusionScore = clamp((tubeRadius / 0.1) * 0.5 + (crossingNumber / 10) * 0.5, 0, 1);
  const deceptiveScore = isDeceptiveKnot(knotType) ? 1.0 : 0.0;

  const score =
    weights.crossing * crossingScore +
    weights.deform * deformScore +
    weights.view * viewScore +
    weights.occlusion * occlusionScore +
    weights.deceptive * deceptiveScore;

  return {
    difficulty_score: clamp(score, 0, 1),
    difficulty: scoreToLevel(score),
    factors: {
      crossing: crossingScore,
      deform: deformScore,
      view: viewScore,
      occlusion: occlusionScore,
      deceptive: deceptiveScore,
    },
  };
}

// ============= Single Open-Loop =============

export function computeSingleOpenLoopDifficulty(params) {
  const {
    knotType,
    tightness = 0.6,
    knotCount = 1,
    hasKnot = true,
  } = params || {};

  const weights = {
    looseness: 0.35,
    typeComplexity: 0.25,
    knotCount: 0.15,
    deceptiveNoKnot: 0.25,
  };

  // extensible mapping; unknown types fallback to 0.5
  const typeComplexityMap = {
    straight: 0.0,
    loose_coil: 0.3,
    overhand: 0.4,
    figure8: 0.6,
    bowline: 0.7,
    double_overhand: 0.8,
    slip_knot: 0.65,
    square_knot: 0.85,
    fishermans: 0.9,
    clove_hitch: 0.6,
    stevedore: 0.75,
    constrictor: 0.8,
  };

  const t = clamp(Number(tightness), 0, 1);
  const loosenessScore = clamp(1 - t, 0, 1);
  const typeScore = typeComplexityMap[knotType] ?? 0.5;
  const count = Math.max(0, Math.floor(Number.isFinite(knotCount) ? knotCount : 0));
  const countScore = clamp((count - 1) / 2, 0, 1);

  // "no-knot but looks like knot": loose coil + slack is especially deceptive
  const deceptiveNoKnotScore =
    (!hasKnot && knotType === 'loose_coil' && t < 0.4) ? 1.0 :
    (!hasKnot && knotType === 'loose_coil') ? 0.6 : 0.0;

  const score =
    weights.looseness * loosenessScore +
    weights.typeComplexity * typeScore +
    weights.knotCount * countScore +
    weights.deceptiveNoKnot * deceptiveNoKnotScore;

  return {
    difficulty_score: clamp(score, 0, 1),
    difficulty: scoreToLevel(score),
    factors: {
      looseness: loosenessScore,
      typeComplexity: typeScore,
      knotCount: countScore,
      deceptiveNoKnot: deceptiveNoKnotScore,
    },
  };
}

// ============= Pair (Invariance) =============

export function computePairDifficulty(imageA, imageB, isEquivalent, topoA, topoB) {
  if (isEquivalent) return computePositivePairDifficulty(imageA, imageB);
  return computeNegativePairDifficulty(imageA, imageB, topoA, topoB);
}

function computePositivePairDifficulty(paramsA, paramsB) {
  const weights = { viewGap: 0.35, shapeGap: 0.40, maxSingle: 0.25 };

  const viewGap = computeViewAngleDiff(paramsA?.cameraPosition, paramsB?.cameraPosition);
  const deformA = clamp(paramsA?.deformStrength ?? 0.3, 0, 1);
  const deformB = clamp(paramsB?.deformStrength ?? 0.3, 0, 1);
  const deformDiff = Math.abs(deformA - deformB);
  const maxDeform = Math.max(deformA, deformB);
  const shapeGap = deformDiff * 0.6 + maxDeform * 0.4;

  const singleA = computeSingleClosedLoopDifficulty(paramsA || {}).difficulty_score;
  const singleB = computeSingleClosedLoopDifficulty(paramsB || {}).difficulty_score;
  const maxSingle = Math.max(singleA, singleB);

  const score = weights.viewGap * viewGap + weights.shapeGap * shapeGap + weights.maxSingle * maxSingle;
  return {
    difficulty_score: clamp(score, 0, 1),
    difficulty: scoreToLevel(score),
    factors: { viewGap, shapeGap, maxSingle },
  };
}

function computeNegativePairDifficulty(paramsA, paramsB, topoA, topoB) {
  const weights = { visualSimilarity: 0.40, crossingProximity: 0.25, confusing: 0.20, deceptive: 0.15 };

  const viewSim = 1 - computeViewAngleDiff(paramsA?.cameraPosition, paramsB?.cameraPosition);
  const deformA = clamp(paramsA?.deformStrength ?? 0.3, 0, 1);
  const deformB = clamp(paramsB?.deformStrength ?? 0.3, 0, 1);
  const deformSim = 1 - Math.abs(deformA - deformB);
  const visualSimilarity = clamp(viewSim * 0.5 + deformSim * 0.5, 0, 1);

  const crossA = getCrossingNumber(paramsA?.knotType) || 0;
  const crossB = getCrossingNumber(paramsB?.knotType) || 0;
  const crossingProximity = 1 - clamp(Math.abs(crossA - crossB) / 6, 0, 1);

  const confusing = isConfusingPair(paramsA?.knotType, paramsB?.knotType);
  const confusingScore = confusing.isConfusing ? 1.0 : 0.0;

  const hasDeceptive = isDeceptiveKnot(paramsA?.knotType) || isDeceptiveKnot(paramsB?.knotType);
  const deceptiveScore = hasDeceptive ? 1.0 : 0.0;

  const score =
    weights.visualSimilarity * visualSimilarity +
    weights.crossingProximity * crossingProximity +
    weights.confusing * confusingScore +
    weights.deceptive * deceptiveScore;

  return {
    difficulty_score: clamp(score, 0, 1),
    difficulty: scoreToLevel(score),
    factors: {
      visualSimilarity,
      crossingProximity,
      confusing: confusingScore,
      confusingReason: confusing.reason || null,
      deceptive: deceptiveScore,
      topoA: topoA ?? null,
      topoB: topoB ?? null,
    },
  };
}

