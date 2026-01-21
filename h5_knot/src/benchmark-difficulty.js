/**
 * Benchmark Difficulty Classification for 3D Topology Recognition
 * 
 * 难度分层标准 (Difficulty Tier Criteria)
 * 
 * 设计原则：
 * 1. 基于拓扑复杂度 (minimal crossing number C_min)
 * 2. 视觉复杂度 (投影交叉数 C_view)
 * 3. 感知难度 (遮挡、形变)
 * 4. 欺骗性样本 (kinky unknot)
 */

// ============= Knot Type Registry =============
// 标准结类型及其拓扑不变量

export const KNOT_TYPES = {
  // === EASY (0-4 crossings) ===
  'unknot': {
    name: 'Unknot',
    notation: '0₁',
    crossingNumber: 0,
    difficulty: 'easy',
    description: '平凡结，拓扑上等价于圆',
    family: 'trivial',
  },
  'trefoil': {
    name: 'Trefoil Knot',
    notation: '3₁',
    crossingNumber: 3,
    difficulty: 'easy',
    torusParams: { p: 2, q: 3 },
    description: '最简单的非平凡结，T(2,3) 环面结',
    family: 'torus',
  },
  'figure8': {
    name: 'Figure-8 Knot',
    notation: '4₁',
    crossingNumber: 4,
    difficulty: 'easy',
    twistParams: { n: 2 },
    description: '最简单的 twist knot，唯一的 4 交叉素结',
    family: 'twist',
  },

  // === MEDIUM (5-6 crossings) ===
  'cinquefoil': {
    name: 'Cinquefoil Knot',
    notation: '5₁',
    crossingNumber: 5,
    difficulty: 'medium',
    torusParams: { p: 2, q: 5 },
    description: 'T(2,5) 环面结',
    family: 'torus',
  },
  'twist_5_2': {
    name: 'Three-Twist Knot',
    notation: '5₂',
    crossingNumber: 5,
    difficulty: 'medium',
    twistParams: { n: 3 },
    description: 'Twist knot K₃',
    family: 'twist',
  },
  'stevedore': {
    name: 'Stevedore Knot',
    notation: '6₁',
    crossingNumber: 6,
    difficulty: 'medium',
    twistParams: { n: 4 },
    description: 'Twist knot K₄',
    family: 'twist',
  },
  'knot_6_2': {
    name: 'Miller Institute Knot',
    notation: '6₂',
    crossingNumber: 6,
    difficulty: 'medium',
    description: '6 交叉素结',
    family: 'prime',
  },
  'knot_6_3': {
    name: 'Knot 6₃',
    notation: '6₃',
    crossingNumber: 6,
    difficulty: 'medium',
    description: '6 交叉素结',
    family: 'prime',
  },
  'torus_3_4': {
    name: 'Torus Knot (3,4)',
    notation: 'T(3,4)',
    crossingNumber: 8, // Actually (3-1)*(4-1)*2 = 6? Let me verify: min(3*(4-1), 4*(3-1)) = min(9,8) = 8
    difficulty: 'medium', // Medium because it's structured despite crossings
    torusParams: { p: 3, q: 4 },
    description: 'T(3,4) 环面结',
    family: 'torus',
  },

  // === HARD (≥7 crossings or deceptive) ===
  'knot_7_1': {
    name: 'Septafoil Knot',
    notation: '7₁',
    crossingNumber: 7,
    difficulty: 'hard',
    torusParams: { p: 2, q: 7 },
    description: 'T(2,7) 环面结',
    family: 'torus',
  },
  'knot_7_2': {
    name: 'Knot 7₂',
    notation: '7₂',
    crossingNumber: 7,
    difficulty: 'hard',
    twistParams: { n: 5 },
    description: 'Twist knot K₅',
    family: 'twist',
  },
  'torus_2_9': {
    name: 'Torus Knot (2,9)',
    notation: '9₁',
    crossingNumber: 9,
    difficulty: 'hard',
    torusParams: { p: 2, q: 9 },
    description: 'T(2,9) 环面结',
    family: 'torus',
  },
  'torus_3_5': {
    name: 'Torus Knot (3,5)',
    notation: 'T(3,5)',
    crossingNumber: 10, // min(3*4, 5*2) = min(12,10) = 10
    difficulty: 'hard',
    torusParams: { p: 3, q: 5 },
    description: 'T(3,5) 环面结，复杂的高交叉结',
    family: 'torus',
  },
  'kinky_unknot': {
    name: 'Kinky Unknot',
    notation: 'kinky 0₁',
    crossingNumber: 0, // 拓扑上仍是 unknot！
    visualCrossings: '5-12', // 视觉上有很多交叉
    difficulty: 'hard', // 欺骗性高
    description: '带多余交叉的 unknot，测试模型的拓扑理解能力',
    family: 'deceptive',
    isKinky: true,
  },
};

// ============= Difficulty Tier Definitions =============

export const DIFFICULTY_TIERS = {
  easy: {
    level: 0,
    name: 'easy',
    displayName: 'Easy',
    description: 'Simple topology with ≤4 crossings, clear visual structure',
    criteria: {
      crossingNumber: { max: 4 },
      includesUnknot: true,
      knotTypes: ['unknot', 'trefoil', 'figure8'],
      torusQ: { min: 3, max: 3 }, // Only T(2,3)
      twistN: { min: 1, max: 2 }, // Only up to figure-8
    },
    examples: [
      { type: 'unknot', notation: '0₁', crossings: 0 },
      { type: 'trefoil', notation: '3₁', crossings: 3 },
      { type: 'figure8', notation: '4₁', crossings: 4 },
    ],
    colorCode: '#4ade80', // green
  },
  medium: {
    level: 1,
    name: 'medium',
    displayName: 'Medium',
    description: 'Moderate complexity with 5-6 crossings',
    criteria: {
      crossingNumber: { min: 5, max: 6 },
      knotTypes: ['cinquefoil', 'twist_5_2', 'stevedore', 'knot_6_2', 'knot_6_3'],
      torusQ: { min: 5, max: 5 }, // T(2,5) only - NOTE: T(2,6) doesn't exist!
      twistN: { min: 3, max: 4 },
    },
    examples: [
      { type: 'cinquefoil', notation: '5₁', crossings: 5, note: 'T(2,5)' },
      { type: 'twist_5_2', notation: '5₂', crossings: 5 },
      { type: 'stevedore', notation: '6₁', crossings: 6 },
    ],
    colorCode: '#fbbf24', // yellow
    notes: [
      'IMPORTANT: T(2,6) does NOT exist as a knot! gcd(2,6)=2≠1, so it would be a 2-component link.',
      'T(2,q) requires q to be odd for it to be a knot.',
    ],
  },
  hard: {
    level: 2,
    name: 'hard',
    displayName: 'Hard',
    description: 'Complex topology (≥7 crossings) or deceptive samples',
    criteria: {
      crossingNumber: { min: 7 },
      knotTypes: ['knot_7_1', 'knot_7_2', 'torus_2_9', 'torus_3_5', 'kinky_unknot'],
      torusQ: { min: 7 }, // T(2,7), T(2,9), etc.
      twistN: { min: 5 },
      includesKinkyUnknot: true,
      includesStrongOcclusion: true,
    },
    examples: [
      { type: 'knot_7_1', notation: '7₁', crossings: 7, note: 'T(2,7)' },
      { type: 'knot_7_2', notation: '7₂', crossings: 7, note: 'Twist K₅' },
      { type: 'kinky_unknot', notation: 'kinky 0₁', crossings: '0 (topological)', note: '5-12 visual crossings' },
    ],
    colorCode: '#ef4444', // red
    notes: [
      'Kinky unknot is topologically trivial but visually complex - tests true understanding',
      'Strong occlusion refers to rendering configurations with significant self-overlap',
    ],
  },
};

// ============= Torus Knot Validity Check =============

/**
 * Check if T(p,q) is a valid knot (not a link)
 * @param {number} p 
 * @param {number} q 
 * @returns {boolean}
 */
export function isValidTorusKnot(p, q) {
  return gcd(Math.abs(p), Math.abs(q)) === 1;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Get crossing number for torus knot T(p,q)
 * Formula: min(|p|(|q|-1), |q|(|p|-1))
 */
export function torusKnotCrossingNumber(p, q) {
  const absP = Math.abs(p);
  const absQ = Math.abs(q);
  return Math.min(absP * (absQ - 1), absQ * (absP - 1));
}

/**
 * Get valid T(2,q) torus knot options for each difficulty
 */
export function getValidTorusKnots2q() {
  const result = { easy: [], medium: [], hard: [] };
  
  for (let q = 3; q <= 15; q += 2) { // q must be odd for T(2,q) to be a knot
    if (!isValidTorusKnot(2, q)) continue;
    const crossings = torusKnotCrossingNumber(2, q);
    
    if (crossings <= 4) {
      result.easy.push({ p: 2, q, crossings });
    } else if (crossings <= 6) {
      result.medium.push({ p: 2, q, crossings });
    } else {
      result.hard.push({ p: 2, q, crossings });
    }
  }
  
  return result;
}

// ============= Difficulty Assignment =============

/**
 * Compute difficulty level for a knot based on multiple factors
 * 
 * @param {Object} params
 * @param {number} params.crossingNumber - Minimal crossing number (C_min)
 * @param {number} params.viewCrossings - Crossings in current projection (C_view)
 * @param {number} params.minProximityRatio - d_min / (2 * tube_radius)
 * @param {number} params.deformStrength - Applied deformation [0,1]
 * @param {boolean} params.isKinkyUnknot - Is this a kinky unknot?
 * @param {number} params.kinkCount - Number of kinks if kinky unknot
 * @param {boolean} params.hasStrongOcclusion - Rendering has strong self-occlusion?
 * @returns {Object} { level: 0|1|2, name: 'easy'|'medium'|'hard', score: number, breakdown: {...} }
 */
export function computeDifficulty({
  crossingNumber = 0,
  viewCrossings = 0,
  minProximityRatio = Infinity,
  deformStrength = 0,
  isKinkyUnknot = false,
  kinkCount = 0,
  hasStrongOcclusion = false,
}) {
  let score = 0;
  const breakdown = {};
  
  // 1. Topological complexity (C_min)
  if (crossingNumber >= 7) {
    score += 3;
    breakdown.topology = { value: crossingNumber, contribution: 3, reason: '≥7 crossings' };
  } else if (crossingNumber >= 5) {
    score += 2;
    breakdown.topology = { value: crossingNumber, contribution: 2, reason: '5-6 crossings' };
  } else if (crossingNumber >= 3) {
    score += 1;
    breakdown.topology = { value: crossingNumber, contribution: 1, reason: '3-4 crossings' };
  } else {
    breakdown.topology = { value: crossingNumber, contribution: 0, reason: '0-2 crossings' };
  }
  
  // 2. Visual complexity (C_view) - if much higher than C_min
  const viewDelta = viewCrossings - crossingNumber;
  if (viewDelta >= 4 || viewCrossings >= 10) {
    score += 2;
    breakdown.visual = { value: viewCrossings, delta: viewDelta, contribution: 2, reason: 'High view crossings' };
  } else if (viewDelta >= 2 || viewCrossings >= 6) {
    score += 1;
    breakdown.visual = { value: viewCrossings, delta: viewDelta, contribution: 1, reason: 'Moderate view crossings' };
  } else {
    breakdown.visual = { value: viewCrossings, delta: viewDelta, contribution: 0, reason: 'Low view crossings' };
  }
  
  // 3. Perceptual difficulty (proximity)
  const dRatio = Number.isFinite(minProximityRatio) ? minProximityRatio : 999;
  if (dRatio <= 1.2) {
    score += 3;
    breakdown.proximity = { value: dRatio, contribution: 3, reason: 'Very tight (≤1.2x tube)' };
  } else if (dRatio <= 1.5) {
    score += 2;
    breakdown.proximity = { value: dRatio, contribution: 2, reason: 'Tight (1.2-1.5x tube)' };
  } else if (dRatio <= 2.0) {
    score += 1;
    breakdown.proximity = { value: dRatio, contribution: 1, reason: 'Close (1.5-2x tube)' };
  } else {
    breakdown.proximity = { value: dRatio, contribution: 0, reason: 'Well separated' };
  }
  
  // 4. Deformation difficulty
  const d = Math.max(0, Math.min(1, deformStrength));
  if (d >= 0.6) {
    score += 2;
    breakdown.deformation = { value: d, contribution: 2, reason: 'Strong deformation' };
  } else if (d >= 0.3) {
    score += 1;
    breakdown.deformation = { value: d, contribution: 1, reason: 'Moderate deformation' };
  } else {
    breakdown.deformation = { value: d, contribution: 0, reason: 'Minimal deformation' };
  }
  
  // 5. Deceptive samples (kinky unknot)
  if (isKinkyUnknot) {
    if (kinkCount >= 4) {
      score += 3;
      breakdown.kinky = { kinkCount, contribution: 3, reason: 'Highly kinky unknot (4+ kinks)' };
    } else if (kinkCount >= 2) {
      score += 2;
      breakdown.kinky = { kinkCount, contribution: 2, reason: 'Kinky unknot (2-3 kinks)' };
    } else {
      score += 1;
      breakdown.kinky = { kinkCount, contribution: 1, reason: 'Mildly kinky unknot' };
    }
  }
  
  // 6. Strong occlusion
  if (hasStrongOcclusion) {
    score += 1;
    breakdown.occlusion = { contribution: 1, reason: 'Strong self-occlusion' };
  }
  
  // Map score to level
  let level, name;
  if (score >= 5) {
    level = 2;
    name = 'hard';
  } else if (score >= 2) {
    level = 1;
    name = 'medium';
  } else {
    level = 0;
    name = 'easy';
  }
  
  return {
    level,
    name,
    displayName: DIFFICULTY_TIERS[name].displayName,
    score,
    breakdown,
    colorCode: DIFFICULTY_TIERS[name].colorCode,
  };
}

// ============= Benchmark Dataset Configuration =============

/**
 * Recommended distribution for a balanced benchmark dataset
 */
export const RECOMMENDED_DISTRIBUTION = {
  easy: 30,    // 30% easy samples
  medium: 40,  // 40% medium samples  
  hard: 30,    // 30% hard samples
  
  notes: [
    'Medium has slightly higher proportion to ensure good coverage of intermediate cases',
    'Hard includes both high-crossing knots AND deceptive samples (kinky unknots)',
    'Consider also varying viewpoints/projections as an additional difficulty factor',
  ],
};

/**
 * Generate a balanced sample configuration for benchmark
 * @param {number} totalSamples 
 * @param {Object} distribution - { easy: %, medium: %, hard: % }
 */
export function generateBenchmarkConfig(totalSamples, distribution = RECOMMENDED_DISTRIBUTION) {
  const total = distribution.easy + distribution.medium + distribution.hard;
  
  const easyCount = Math.round(totalSamples * distribution.easy / total);
  const mediumCount = Math.round(totalSamples * distribution.medium / total);
  const hardCount = totalSamples - easyCount - mediumCount;
  
  return {
    totalSamples,
    distribution: {
      easy: { count: easyCount, percentage: distribution.easy },
      medium: { count: mediumCount, percentage: distribution.medium },
      hard: { count: hardCount, percentage: distribution.hard },
    },
    knotTypeAllocation: {
      easy: {
        unknot: Math.ceil(easyCount * 0.33),
        trefoil: Math.ceil(easyCount * 0.34),
        figure8: easyCount - Math.ceil(easyCount * 0.33) - Math.ceil(easyCount * 0.34),
      },
      medium: {
        'T(2,5)': Math.ceil(mediumCount * 0.25),
        'twist_5_2': Math.ceil(mediumCount * 0.25),
        'twist_6_1': Math.ceil(mediumCount * 0.25),
        'other_6': mediumCount - 3 * Math.ceil(mediumCount * 0.25),
      },
      hard: {
        'T(2,7)+': Math.ceil(hardCount * 0.35),
        'high_twist': Math.ceil(hardCount * 0.25),
        'kinky_unknot': Math.ceil(hardCount * 0.25),
        'strong_occlusion': hardCount - Math.ceil(hardCount * 0.35) - 2 * Math.ceil(hardCount * 0.25),
      },
    },
  };
}

// ============= Export Summary for Paper =============

/**
 * Generate markdown summary of difficulty criteria for paper
 */
export function getDifficultyCriteriaSummary() {
  return `
## 3D Knot Recognition Benchmark - Difficulty Classification

### Tier Definitions

| Difficulty | Level | C_min Range | Knot Types | Notes |
|------------|-------|-------------|------------|-------|
| **Easy** | 0 | 0-4 | Unknot (0₁), Trefoil (3₁), Figure-8 (4₁) | Clear visual structure |
| **Medium** | 1 | 5-6 | 5₁ (T(2,5)), 5₂, 6₁, 6₂, 6₃ | Moderate complexity |
| **Hard** | 2 | ≥7 or deceptive | 7₁ (T(2,7)), 7₂+, Kinky Unknot | High crossings or misleading |

### Important Notes

1. **T(2,q) Torus Knots**: Only exist when q is ODD (gcd(2,q)=1)
   - T(2,3) = Trefoil ✓
   - T(2,5) = Cinquefoil ✓
   - T(2,6) = 2-component LINK ✗ (not a knot!)
   - T(2,7) = Septafoil ✓

2. **Kinky Unknot**: Topologically trivial (C_min=0) but visually complex
   - Tests model's understanding of topology vs. appearance
   - Recommended: include 10-15% of hard samples as kinky unknots

3. **Difficulty Score Components**:
   - Topological complexity (C_min): 0-3 points
   - Visual complexity (C_view): 0-2 points
   - Proximity difficulty: 0-3 points
   - Deformation: 0-2 points
   - Deceptive (kinky): 0-3 points
   - Occlusion: 0-1 points
   
   Total: Easy < 2, Medium 2-4, Hard ≥ 5

### Recommended Dataset Distribution
- Easy: 30%
- Medium: 40%  
- Hard: 30%
`;
}

export default {
  KNOT_TYPES,
  DIFFICULTY_TIERS,
  isValidTorusKnot,
  torusKnotCrossingNumber,
  getValidTorusKnots2q,
  computeDifficulty,
  RECOMMENDED_DISTRIBUTION,
  generateBenchmarkConfig,
  getDifficultyCriteriaSummary,
};

