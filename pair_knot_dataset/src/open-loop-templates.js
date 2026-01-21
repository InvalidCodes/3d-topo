/**
 * Open Loop Knot Templates (Hand-designed control points)
 *
 * 设计原则：
 * - 每个模板是一条开口绳子的“关键控制点”，用于 CatmullRomCurve3 平滑插值。
 * - 通过 z 轴明确 over/under（z>0 为“上层”，z<0 为“下层”）。
 * - crossings 不是严格拓扑计算，只是给生成器一个“需要拉开深度”的提示。
 *
 * 注意：
 * - `reef_knot` 是双绳结（需要 multi-rope 支持），这里先提供占位模板结构。
 */

export const KNOT_TEMPLATES = {
  straight: {
    name: 'Straight Rope',
    crossingNumber: 0,
    difficulty: 'easy',
    controlPoints: [
      { x: -3.2, y: 0.0, z: 0.0 },
      { x: -1.6, y: 0.2, z: 0.0 },
      { x:  0.0, y: 0.0, z: 0.0 },
      { x:  1.6, y: -0.2, z: 0.0 },
      { x:  3.2, y: 0.0, z: 0.0 },
    ],
    crossings: [],
  },

  // === Basic Knots ===
  overhand: {
    name: 'Overhand Knot',
    crossingNumber: 1,
    difficulty: 'easy',
    // 9 points：一个清晰的环 + 穿越点
    controlPoints: [
      { x: -3.0, y: 0.0, z: 0.0 },   // entry
      { x: -2.0, y: 0.6, z: 0.65 },  // lift up (OVER)
      { x: -0.9, y: 1.0, z: 0.85 },  // top (OVER)
      { x:  0.3, y: 0.8, z: 0.70 },  // coming down (OVER)
      { x:  1.1, y: 0.2, z: -0.60 }, // crossing (UNDER)
      { x:  0.6, y: -0.6, z: -0.55 },// pull through (UNDER)
      { x: -0.2, y: -0.4, z: 0.10 }, // turn back (neutral)
      { x:  1.6, y: 0.0, z: 0.05 },  // align out
      { x:  3.0, y: 0.0, z: 0.0 },   // exit
    ],
    crossings: [
      { overIndex: 2, underIndex: 4 },
    ],
  },

  figure8: {
    name: 'Figure-Eight Knot',
    crossingNumber: 2,
    difficulty: 'easy',
    // 11 points：上环 + 下环 + 中间交叉
    controlPoints: [
      { x: -3.4, y: 0.0, z: 0.0 },    // entry
      { x: -2.2, y: 0.8, z: 0.65 },   // approach upper loop (OVER)
      { x: -0.8, y: 1.35, z: 0.90 },  // upper apex (OVER)
      { x:  0.8, y: 1.05, z: 0.70 },  // descend (OVER)
      { x:  1.7, y: 0.15, z: 0.25 },  // mid (neutral)
      { x:  1.2, y: -0.55, z: -0.55 },// go under (UNDER)
      { x:  0.0, y: -1.25, z: -0.85 },// lower apex (UNDER)
      { x: -1.4, y: -0.95, z: -0.55 },// return (UNDER)
      { x: -0.9, y: 0.05, z: 0.70 },  // re-cross (OVER)
      { x:  1.0, y: 0.0, z: 0.05 },   // align out
      { x:  3.4, y: 0.0, z: 0.0 },    // exit
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
      { overIndex: 8, underIndex: 5 },
    ],
  },

  bowline: {
    name: 'Bowline',
    crossingNumber: 3,
    difficulty: 'medium',
    // 13 points：主环 + “穿出-绕过-回穿”结构（近似 bowline 视觉特征）
    controlPoints: [
      { x: -3.8, y: 0.0, z: 0.0 },    // entry (standing part)
      { x: -2.6, y: 0.3, z: 0.1 },
      { x: -1.6, y: 0.9, z: 0.70 },   // start forming loop (OVER)
      { x: -0.4, y: 1.35, z: 0.90 },  // top of loop (OVER)
      { x:  0.8, y: 1.05, z: 0.65 },  // approach (OVER)
      { x:  1.2, y: 0.2, z: -0.60 },  // under crossing (UNDER)
      { x:  0.4, y: -0.35, z: -0.55 },// rabbit comes out (UNDER)
      { x: -0.3, y: 0.15, z: 0.70 },  // around standing part (OVER)
      { x:  0.6, y: 0.55, z: 0.65 },  // back towards loop (OVER)
      { x:  0.2, y: 0.10, z: -0.60 }, // back through (UNDER)
      { x:  1.4, y: -0.25, z: 0.05 }, // tail aligns
      { x:  2.6, y: 0.00, z: 0.00 },
      { x:  3.8, y: 0.00, z: 0.00 },  // exit
    ],
    crossings: [
      { overIndex: 3, underIndex: 5 },
      { overIndex: 7, underIndex: 9 },
      { overIndex: 2, underIndex: 6 },
    ],
  },

  double_overhand: {
    name: 'Double Overhand',
    crossingNumber: 3,
    difficulty: 'hard',
    // 15 points：在 overhand 基础上增加一次额外缠绕（视觉上更“厚”更复杂）
    controlPoints: [
      { x: -4.0, y: 0.0, z: 0.0 },    // entry
      { x: -3.0, y: 0.6, z: 0.65 },   // over
      { x: -1.8, y: 1.15, z: 0.90 },  // over
      { x: -0.5, y: 1.00, z: 0.70 },  // over
      { x:  0.7, y: 0.55, z: -0.55 }, // start going under (UNDER)
      { x:  1.4, y: 0.05, z: -0.85 }, // under crossing 1 (UNDER)
      { x:  0.9, y: -0.55, z: -0.60 },// under
      { x: -0.1, y: -0.85, z: 0.65 }, // second wrap begins (OVER)
      { x: -0.9, y: -0.45, z: 0.80 }, // over crossing 2 (OVER)
      { x:  0.1, y: -0.05, z: -0.65 },// under crossing 2 (UNDER)
      { x:  1.0, y: -0.25, z: -0.55 },// under
      { x:  1.9, y: 0.10, z: 0.10 },  // align out
      { x:  2.6, y: 0.00, z: 0.05 },
      { x:  3.3, y: 0.00, z: 0.00 },
      { x:  4.0, y: 0.00, z: 0.00 },  // exit
    ],
    crossings: [
      { overIndex: 2, underIndex: 5 },
      { overIndex: 8, underIndex: 9 },
      { overIndex: 7, underIndex: 5 },
    ],
  },

  // ==================== NAUTICAL KNOTS ====================

  clove_hitch: {
    name: 'Clove Hitch',
    category: 'nautical',
    crossingNumber: 2,
    difficulty: 'medium',
    description: 'Quick binding knot, used to secure rope to posts',
    controlPoints: [
      { x: -3.0, y: 0.0, z: 0.0 },
      // First wrap (OVER)
      { x: -1.5, y: 0.8, z: 0.65 },
      { x:  0.0, y: 1.0, z: 0.85 },
      { x:  1.2, y: 0.7, z: 0.65 },
      { x:  1.5, y: 0.0, z: 0.10 },
      // Second wrap (UNDER)
      { x:  1.2, y: -0.7, z: -0.60 },
      { x:  0.0, y: -1.0, z: -0.85 },
      { x: -1.5, y: -0.8, z: -0.65 },
      { x: -1.8, y: 0.0, z: 0.10 },
      { x:  3.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
      { overIndex: 3, underIndex: 7 },
    ],
  },

  sheet_bend: {
    name: 'Sheet Bend',
    category: 'nautical',
    crossingNumber: 2,
    difficulty: 'medium',
    description: 'Joins two ropes of different thickness (single-rope simplified)',
    controlPoints: [
      { x: -3.5, y: 0.0, z: 0.0 },
      // Form a bight (OVER)
      { x: -2.0, y: 0.6, z: 0.65 },
      { x: -1.0, y: 1.0, z: 0.85 },
      { x:  0.0, y: 0.8, z: 0.65 },
      { x:  0.8, y: 0.3, z: 0.20 },
      // Pass through and around (UNDER)
      { x:  1.5, y: -0.3, z: -0.60 },
      { x:  1.8, y: -0.8, z: -0.85 },
      { x:  1.2, y: -1.0, z: -0.70 },
      { x:  0.0, y: -0.6, z: -0.55 },
      { x:  3.5, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
      { overIndex: 3, underIndex: 8 },
    ],
  },

  fishermans: {
    name: "Fisherman's Knot",
    category: 'nautical',
    crossingNumber: 4,
    difficulty: 'hard',
    description: 'Secure join for slippery lines (single-rope simplified)',
    controlPoints: [
      { x: -4.0, y: 0.0, z: 0.0 },
      // First overhand-like bulge (OVER)
      { x: -2.5, y: 0.6, z: 0.70 },
      { x: -1.5, y: 0.8, z: 0.90 },
      { x: -0.5, y: 0.5, z: 0.70 },
      { x:  0.0, y: 0.0, z: 0.10 },
      // Second bulge (UNDER)
      { x:  0.5, y: -0.6, z: -0.70 },
      { x:  1.5, y: -0.8, z: -0.90 },
      { x:  2.5, y: -0.5, z: -0.70 },
      { x:  3.0, y: 0.0, z: 0.10 },
      { x:  4.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
      { overIndex: 3, underIndex: 7 },
      { overIndex: 1, underIndex: 5 },
      { overIndex: 4, underIndex: 8 },
    ],
  },

  // ==================== CLIMBING KNOTS ====================

  figure9: {
    name: 'Figure-Nine Knot',
    category: 'climbing',
    crossingNumber: 3,
    difficulty: 'hard',
    description: 'Larger stopper knot than figure-8',
    controlPoints: [
      { x: -4.0, y: 0.0, z: 0.0 },
      // Extra loop before figure-8 pattern (OVER)
      { x: -2.5, y: 1.2, z: 0.80 },
      { x: -1.0, y: 1.5, z: 1.00 },
      { x:  0.5, y: 1.3, z: 0.85 },
      { x:  1.5, y: 0.8, z: 0.65 },
      { x:  2.0, y: 0.0, z: 0.25 },
      // Lower loop (UNDER)
      { x:  1.5, y: -1.0, z: -0.75 },
      { x:  0.0, y: -1.4, z: -1.00 },
      { x: -1.5, y: -1.1, z: -0.80 },
      { x: -2.0, y: -0.5, z: -0.60 },
      { x: -1.5, y: 0.0, z: 0.10 },
      { x:  4.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 7 },
      { overIndex: 4, underIndex: 9 },
      { overIndex: 3, underIndex: 8 },
    ],
  },

  double_fishermans: {
    name: "Double Fisherman's Knot",
    category: 'climbing',
    crossingNumber: 6,
    difficulty: 'hard',
    description: 'Ultra-secure bend for life-safety applications (single-rope simplified)',
    controlPoints: [
      { x: -5.0, y: 0.0, z: 0.0 },
      // First double overhand-ish (OVER)
      { x: -3.5, y: 0.7, z: 0.70 },
      { x: -2.5, y: 1.0, z: 0.95 },
      { x: -1.5, y: 0.9, z: 0.80 },
      { x: -1.0, y: 0.5, z: 0.65 },
      { x: -0.5, y: 0.0, z: 0.20 },
      { x:  0.0, y: -0.3, z: -0.20 },
      // Second double overhand-ish (UNDER)
      { x:  0.5, y: -0.7, z: -0.70 },
      { x:  1.5, y: -1.0, z: -0.95 },
      { x:  2.5, y: -0.9, z: -0.80 },
      { x:  3.0, y: -0.5, z: -0.65 },
      { x:  3.5, y: 0.0, z: 0.20 },
      { x:  5.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 8 },
      { overIndex: 3, underIndex: 9 },
      { overIndex: 1, underIndex: 7 },
      { overIndex: 4, underIndex: 10 },
      { overIndex: 5, underIndex: 11 },
      { overIndex: 6, underIndex: 7 },
    ],
  },

  // ==================== UTILITY KNOTS ====================

  slip_knot: {
    name: 'Slip Knot',
    category: 'utility',
    crossingNumber: 1,
    difficulty: 'medium',
    description: 'Adjustable loop, quick-release',
    controlPoints: [
      { x: -3.0, y: 0.0, z: 0.0 },
      // Form the loop (OVER)
      { x: -1.5, y: 0.9, z: 0.70 },
      { x:  0.0, y: 1.2, z: 0.90 },
      { x:  1.2, y: 0.9, z: 0.70 },
      { x:  1.8, y: 0.3, z: 0.20 },
      // Create the slip (UNDER)
      { x:  2.0, y: -0.5, z: -0.60 },
      { x:  1.5, y: -1.0, z: -0.85 },
      { x:  0.5, y: -1.1, z: -0.85 },
      { x: -0.5, y: -0.8, z: -0.60 },
      { x: -1.0, y: -0.3, z: -0.55 },
      { x:  3.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
    ],
  },

  stevedore: {
    name: 'Stevedore Knot',
    category: 'utility',
    crossingNumber: 3,
    difficulty: 'hard',
    description: 'Bulky stopper knot, prevents rope slipping through holes',
    controlPoints: [
      { x: -4.0, y: 0.0, z: 0.0 },
      // First loop (OVER)
      { x: -2.5, y: 1.3, z: 0.85 },
      { x: -0.5, y: 1.6, z: 1.05 },
      { x:  1.5, y: 1.3, z: 0.85 },
      { x:  2.5, y: 0.5, z: 0.30 },
      // Second loop (UNDER)
      { x:  2.8, y: -0.5, z: -0.60 },
      { x:  2.0, y: -1.2, z: -0.90 },
      { x:  0.0, y: -1.5, z: -1.05 },
      { x: -2.0, y: -1.2, z: -0.90 },
      { x: -2.8, y: -0.5, z: -0.60 },
      // Exit
      { x: -2.0, y: 0.0, z: 0.10 },
      { x:  4.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 7 },
      { overIndex: 3, underIndex: 8 },
      { overIndex: 1, underIndex: 6 },
    ],
  },

  constrictor: {
    name: 'Constrictor Knot',
    category: 'utility',
    crossingNumber: 2,
    difficulty: 'hard',
    description: 'Semi-permanent binding, extremely tight',
    controlPoints: [
      { x: -3.0, y: 0.0, z: 0.0 },
      // Wrap around (OVER)
      { x: -1.5, y: 0.7, z: 0.70 },
      { x:  0.0, y: 0.9, z: 0.90 },
      { x:  1.0, y: 0.7, z: 0.70 },
      { x:  1.5, y: 0.2, z: 0.15 },
      // Cross over and cinch (UNDER)
      { x:  1.8, y: -0.4, z: -0.60 },
      { x:  1.2, y: -0.9, z: -0.90 },
      { x:  0.0, y: -1.1, z: -0.90 },
      { x: -1.2, y: -0.9, z: -0.90 },
      { x: -1.5, y: -0.4, z: -0.60 },
      { x:  3.0, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 6 },
      { overIndex: 3, underIndex: 9 },
    ],
  },

  // ==================== DECORATIVE (SIMPLIFIED) ====================

  monkeys_fist_simplified: {
    name: "Monkey's Fist (Simplified)",
    category: 'decorative',
    crossingNumber: 6,
    difficulty: 'hard',
    description: 'Weighted throwing knot (simplified 2D projection)',
    controlPoints: [
      { x: -2.5, y: 0.0, z: 0.0 },
      // Upper wraps (OVER)
      { x: -1.5, y: 1.0, z: 0.70 },
      { x: -0.5, y: 1.3, z: 0.90 },
      { x:  0.5, y: 1.2, z: 0.80 },
      { x:  1.2, y: 0.8, z: 0.65 },
      { x:  1.5, y: 0.0, z: 0.20 },
      // Lower wraps (UNDER)
      { x:  1.2, y: -0.8, z: -0.65 },
      { x:  0.5, y: -1.2, z: -0.80 },
      { x: -0.5, y: -1.3, z: -0.90 },
      { x: -1.5, y: -1.0, z: -0.70 },
      // Close
      { x: -1.8, y: -0.3, z: -0.20 },
      { x:  2.5, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 8 },
      { overIndex: 3, underIndex: 9 },
      { overIndex: 4, underIndex: 7 },
      { overIndex: 1, underIndex: 6 },
      { overIndex: 5, underIndex: 10 },
      { overIndex: 2, underIndex: 6 },
    ],
  },

  square_knot: {
    name: 'Square/Reef Knot',
    category: 'utility',
    crossingNumber: 4,
    difficulty: 'hard',
    description: 'Classic binding knot (single-rope simplified)',
    controlPoints: [
      { x: -3.5, y: 0.0, z: 0.0 },
      // Left overhand (OVER)
      { x: -2.0, y: 0.7, z: 0.70 },
      { x: -1.0, y: 0.9, z: 0.85 },
      { x:  0.0, y: 0.6, z: 0.65 },
      { x:  0.5, y: 0.1, z: 0.15 },
      // Cross (UNDER)
      { x:  0.7, y: -0.3, z: -0.60 },
      { x:  1.0, y: -0.7, z: -0.75 },
      { x:  2.0, y: -0.9, z: -0.90 },
      { x:  2.8, y: -0.6, z: -0.65 },
      { x:  3.5, y: 0.0, z: 0.0 },
    ],
    crossings: [
      { overIndex: 2, underIndex: 7 },
      { overIndex: 3, underIndex: 8 },
      { overIndex: 1, underIndex: 6 },
      { overIndex: 4, underIndex: 5 },
    ],
  },

  // === Deceptive Cases ===
  loose_coil: {
    name: 'Loose Coil (NOT a knot)',
    crossingNumber: 0,
    difficulty: 'hard',
    // 11 points：一个松散线圈（用轻微 z 起伏避免完全共面导致的 z-fighting）
    controlPoints: [
      { x: -3.2, y: 0.0,  z: 0.0 },
      { x: -2.2, y: 1.1,  z: 0.06 },
      { x: -0.8, y: 1.45, z: 0.10 },
      { x:  0.8, y: 1.15, z: 0.06 },
      { x:  1.9, y: 0.1,  z: 0.00 },
      { x:  1.2, y: -1.0, z: -0.06 },
      { x:  0.0, y: -1.35,z: -0.10 },
      { x: -1.2, y: -1.0, z: -0.06 },
      { x: -1.6, y: 0.0,  z: 0.02 },
      { x:  0.6, y: 0.2,  z: 0.02 },
      { x:  3.2, y: 0.0,  z: 0.0 },
    ],
    crossings: [],
  },

  // === Multi-rope (placeholder) ===
  reef_knot: {
    name: 'Reef/Square Knot',
    crossingNumber: 4,
    difficulty: 'medium',
    multiRope: true,
    ropes: [
      {
        controlPoints: [
          { x: -3, y: 0.6, z: 0.2 },
          { x: -1, y: 0.8, z: 0.4 },
          { x:  0, y: 0.2, z: -0.2 },
          { x:  1, y: -0.6, z: -0.4 },
          { x:  3, y: -0.5, z: 0.0 },
        ],
      },
      {
        controlPoints: [
          { x: -3, y: -0.6, z: -0.2 },
          { x: -1, y: -0.8, z: -0.4 },
          { x:  0, y: -0.1, z: 0.2 },
          { x:  1, y: 0.7, z: 0.4 },
          { x:  3, y: 0.5, z: 0.0 },
        ],
      },
    ],
    crossings: [],
  },
};

export default { KNOT_TEMPLATES };

