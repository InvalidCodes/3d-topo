/**
 * Knot Type Registry
 * 
 * 统一管理所有绳结类型的拓扑不变量，用于判断拓扑等价性。
 * 
 * 核心概念：
 * - topologicalId: 拓扑等价类的唯一标识（不变量）
 * - 同一 topologicalId 下的所有 generator 生成的绳结都是拓扑等价的
 * - 不同 topologicalId 的绳结一定不等价
 */

// ============= 拓扑等价类定义 =============

/**
 * 拓扑等价类枚举
 * 每个类代表一种独特的拓扑结构
 */
export const TOPOLOGICAL_CLASSES = {
  // === Unknot（平凡结）===
  UNKNOT: 'unknot',                    // 0_1, 可解开
  
  // === Prime Knots（素结）===
  TREFOIL: 'trefoil_3_1',              // 3_1, 三叶结
  FIGURE_EIGHT: 'figure8_4_1',         // 4_1, 八字结
  CINQUEFOIL: 'cinquefoil_5_1',        // 5_1, T(2,5)
  THREE_TWIST: 'three_twist_5_2',      // 5_2
  STEVEDORE: 'stevedore_6_1',          // 6_1
  TORUS_2_7: 'torus_7_1',              // 7_1, T(2,7)
  TORUS_2_9: 'torus_9_1',              // 9_1, T(2,9)
  TORUS_3_4: 'torus_3_4',              // T(3,4), 8 crossings
  TORUS_3_5: 'torus_3_5',              // T(3,5), 10 crossings
  
  // === Links（链环）===
  HOPF_LINK: 'hopf_link',              // 两环相扣
  UNLINKED_2: 'unlinked_2',            // 两环不扣
  CHAIN_N: 'chain',                    // 锁链（n 环）
  BORROMEAN: 'borromean_rings',        // 三环互扣
};

// ============= 绳结类型注册表 =============

/**
 * 完整的绳结类型注册表
 * 
 * 每个条目包含：
 * - topologicalId: 拓扑等价类 ID（关键！决定等价性判断）
 * - crossingNumber: 最小交叉数（拓扑不变量）
 * - family: 绳结族（用于 UI 分类）
 * - generator: 对应的生成器 key（与 unified-gallery.js 中的 PRESETS 对应）
 * - difficulty: 视觉识别难度
 * - isDeceptive: 是否具有欺骗性（视觉复杂但拓扑简单）
 * - isLink: 是否是链环（多组件）
 * - aliases: 别名列表
 * - description: 描述
 */
export const KNOT_TYPE_REGISTRY = {
  // ========================================
  // === 拓扑上等价于 Unknot 的类型 ===
  // ========================================
  
  unknot: {
    topologicalId: TOPOLOGICAL_CLASSES.UNKNOT,
    crossingNumber: 0,
    family: 'unknot',
    generator: 'unknot',
    difficulty: 'easy',
    isDeceptive: false,
    isLink: false,
    aliases: ['circle', '0_1', 'trivial'],
    description: '平凡结（简单圆环）',
  },
  
  twisted_ring: {
    topologicalId: TOPOLOGICAL_CLASSES.UNKNOT,  // 拓扑上仍是 unknot！
    crossingNumber: 0,
    family: 'unknot_variant',
    generator: 'twisted_ring',
    difficulty: 'medium',
    isDeceptive: true,  // 视觉上有"伪交叉"
    isLink: false,
    aliases: ['wavy_ring', 'wobble_ring'],
    description: '扭曲环（视觉有波动但拓扑平凡）',
    visualComplexity: 'medium',
  },
  
  spiral_disk: {
    topologicalId: TOPOLOGICAL_CLASSES.UNKNOT,
    crossingNumber: 0,
    family: 'unknot_variant',
    generator: 'spiral_disk',
    difficulty: 'medium',
    isDeceptive: true,
    isLink: false,
    aliases: ['spiral_loop', 'coil'],
    description: '螺旋环（闭合螺旋，拓扑平凡）',
    visualComplexity: 'medium',
  },
  
  kinky_unknot: {
    topologicalId: TOPOLOGICAL_CLASSES.UNKNOT,
    crossingNumber: 0,
    family: 'unknot_variant',
    generator: 'kinky_unknot',
    difficulty: 'hard',
    isDeceptive: true,  // 高度欺骗性！
    isLink: false,
    aliases: ['messy_unknot', 'fake_knot'],
    description: '扭曲平凡结（视觉极复杂但拓扑平凡，用于测试模型）',
    visualComplexity: 'high',
    isHardNegative: true,  // 标记为"困难负样本"
  },
  
  // ========================================
  // === 真正的 Knots（非平凡结）===
  // ========================================
  
  trefoil: {
    topologicalId: TOPOLOGICAL_CLASSES.TREFOIL,
    crossingNumber: 3,
    family: 'torus_knot',
    generator: 'trefoil',
    difficulty: 'easy',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 2, q: 3 },
    aliases: ['3_1', 'T(2,3)', 'overhand'],
    description: '三叶结（最简单的非平凡结）',
  },
  
  figure8: {
    topologicalId: TOPOLOGICAL_CLASSES.FIGURE_EIGHT,
    crossingNumber: 4,
    family: 'twist_knot',
    generator: 'figure8',
    difficulty: 'easy',
    isDeceptive: false,
    isLink: false,
    aliases: ['4_1', 'figure_eight', 'flemish'],
    description: '八字结（最简单的 twist knot）',
  },
  
  torus_2_5: {
    topologicalId: TOPOLOGICAL_CLASSES.CINQUEFOIL,
    crossingNumber: 5,
    family: 'torus_knot',
    generator: 'torus_2_5',
    difficulty: 'medium',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 2, q: 5 },
    aliases: ['5_1', 'T(2,5)', 'cinquefoil', 'solomon_seal'],
    description: 'T(2,5) 五叶结',
  },
  
  torus_2_7: {
    topologicalId: TOPOLOGICAL_CLASSES.TORUS_2_7,
    crossingNumber: 7,
    family: 'torus_knot',
    generator: 'torus_2_7',
    difficulty: 'hard',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 2, q: 7 },
    aliases: ['7_1', 'T(2,7)', 'septafoil'],
    description: 'T(2,7) 七叶结',
  },
  
  torus_2_9: {
    topologicalId: TOPOLOGICAL_CLASSES.TORUS_2_9,
    crossingNumber: 9,
    family: 'torus_knot',
    generator: 'torus_2_9',
    difficulty: 'hard',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 2, q: 9 },
    aliases: ['9_1', 'T(2,9)'],
    description: 'T(2,9) 九叶结',
  },
  
  torus_3_4: {
    topologicalId: TOPOLOGICAL_CLASSES.TORUS_3_4,
    crossingNumber: 8,
    family: 'torus_knot',
    generator: 'torus_3_4',
    difficulty: 'hard',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 3, q: 4 },
    aliases: ['T(3,4)', '8_19'],
    description: 'T(3,4) 环面结',
  },
  
  torus_3_5: {
    topologicalId: TOPOLOGICAL_CLASSES.TORUS_3_5,
    crossingNumber: 10,
    family: 'torus_knot',
    generator: 'torus_3_5',
    difficulty: 'hard',
    isDeceptive: false,
    isLink: false,
    torusParams: { p: 3, q: 5 },
    aliases: ['T(3,5)', '10_124'],
    description: 'T(3,5) 环面结',
  },
  
  // ========================================
  // === Links（链环，多组件）===
  // ========================================
  
  hopf_link: {
    topologicalId: TOPOLOGICAL_CLASSES.HOPF_LINK,
    crossingNumber: 2,  // 链环的交叉数
    family: 'link',
    generator: 'hopf_link',
    difficulty: 'easy',
    isDeceptive: false,
    isLink: true,
    numComponents: 2,
    aliases: ['2^2_1', 'hopf'],
    description: 'Hopf 链（两环相扣）',
  },
  
  unlinked_rings: {
    topologicalId: TOPOLOGICAL_CLASSES.UNLINKED_2,
    crossingNumber: 0,
    family: 'link',
    generator: 'unlinked_rings',
    difficulty: 'easy',
    isDeceptive: false,
    isLink: true,
    numComponents: 2,
    aliases: ['unlink_2', 'separate_rings'],
    description: '分离环（两环不扣）',
  },
  
  chain: {
    topologicalId: TOPOLOGICAL_CLASSES.CHAIN_N,
    crossingNumber: null,  // 取决于环数
    family: 'link',
    generator: 'chain',
    difficulty: 'medium',
    isDeceptive: false,
    isLink: true,
    numComponents: null,  // 可变
    aliases: ['chain_link'],
    description: '锁链（多环相扣）',
  },
  
  borromean: {
    topologicalId: TOPOLOGICAL_CLASSES.BORROMEAN,
    crossingNumber: 6,
    family: 'link',
    generator: 'borromean',
    difficulty: 'hard',
    isDeceptive: false,
    isLink: true,
    numComponents: 3,
    aliases: ['borromean_rings', '6^3_2'],
    description: 'Borromean 环（三环互扣，任意两环不扣）',
  },
};

// ============= 辅助函数 =============

/**
 * 获取绳结的拓扑 ID
 * @param {string} knotType - 绳结类型 key
 * @returns {string|null} 拓扑 ID
 */
export function getTopologicalId(knotType) {
  const entry = KNOT_TYPE_REGISTRY[knotType];
  return entry ? entry.topologicalId : null;
}

/**
 * 判断两个绳结类型是否拓扑等价
 * @param {string} typeA - 第一个绳结类型 key
 * @param {string} typeB - 第二个绳结类型 key
 * @returns {boolean} 是否等价
 */
export function areTopologicallyEquivalent(typeA, typeB) {
  const idA = getTopologicalId(typeA);
  const idB = getTopologicalId(typeB);
  if (!idA || !idB) {
    console.warn(`Unknown knot type: ${!idA ? typeA : typeB}`);
    return false;
  }
  return idA === idB;
}

/**
 * 获取所有属于同一拓扑类的 generator
 * @param {string} topologicalId - 拓扑 ID
 * @returns {string[]} generator key 列表
 */
export function getGeneratorsForTopologicalClass(topologicalId) {
  const generators = [];
  for (const [key, entry] of Object.entries(KNOT_TYPE_REGISTRY)) {
    if (entry.topologicalId === topologicalId) {
      generators.push(key);
    }
  }
  return generators;
}

/**
 * 获取所有可用的拓扑类 ID
 * @param {Object} options - 过滤选项
 * @param {boolean} options.includeLinks - 是否包含链环
 * @param {boolean} options.includeDeceptive - 是否包含欺骗性类型
 * @returns {string[]} 拓扑 ID 列表
 */
export function getAllTopologicalIds(options = {}) {
  const { includeLinks = false, includeDeceptive = true } = options;
  const ids = new Set();
  
  for (const entry of Object.values(KNOT_TYPE_REGISTRY)) {
    if (!includeLinks && entry.isLink) continue;
    if (!includeDeceptive && entry.isDeceptive) continue;
    ids.add(entry.topologicalId);
  }
  
  return Array.from(ids);
}

/**
 * 获取某个拓扑类的所有 generator（用于随机选择）
 * @param {string} topologicalId 
 * @param {Object} options
 * @returns {Object[]} { key, entry }
 */
export function getGeneratorsByTopologicalId(topologicalId, options = {}) {
  const { excludeDeceptive = false } = options;
  const result = [];
  
  for (const [key, entry] of Object.entries(KNOT_TYPE_REGISTRY)) {
    if (entry.topologicalId !== topologicalId) continue;
    if (excludeDeceptive && entry.isDeceptive) continue;
    result.push({ key, entry });
  }
  
  return result;
}

/**
 * 判断某个类型是否为欺骗性 unknot
 * @param {string} knotType 
 * @returns {boolean}
 */
export function isDeceptiveKnot(knotType) {
  const entry = KNOT_TYPE_REGISTRY[knotType];
  return entry ? (entry.isDeceptive === true) : false;
}

/**
 * 判断某个类型是否为链环
 * @param {string} knotType 
 * @returns {boolean}
 */
export function isLink(knotType) {
  const entry = KNOT_TYPE_REGISTRY[knotType];
  return entry ? (entry.isLink === true) : false;
}

/**
 * 获取绳结的最小交叉数
 * @param {string} knotType 
 * @returns {number|null}
 */
export function getCrossingNumber(knotType) {
  const entry = KNOT_TYPE_REGISTRY[knotType];
  return entry ? entry.crossingNumber : null;
}

/**
 * 获取绳结的难度等级
 * @param {string} knotType 
 * @returns {'easy'|'medium'|'hard'|null}
 */
export function getDifficulty(knotType) {
  const entry = KNOT_TYPE_REGISTRY[knotType];
  return entry ? entry.difficulty : null;
}

// ============= 预定义的混淆组合（Hard Negatives）=============

/**
 * 预定义的"混淆组合"
 * 这些组合在视觉上相似但拓扑不等价，用于生成 Hard Negative Pairs
 */
export const CONFUSING_PAIRS = [
  // 1. Kinky Unknot vs 真正的 Knot（视觉相似但拓扑不同）
  { a: 'kinky_unknot', b: 'trefoil', reason: 'kinky unknot looks complex but is trivial' },
  { a: 'kinky_unknot', b: 'figure8', reason: 'kinky unknot vs figure-8' },
  { a: 'kinky_unknot', b: 'torus_2_5', reason: 'kinky unknot vs cinquefoil' },
  
  // 2. Twisted Ring vs Trefoil（变形后更难区分）
  { a: 'twisted_ring', b: 'trefoil', reason: 'deformed unknot variant vs trefoil' },
  { a: 'spiral_disk', b: 'trefoil', reason: 'spiral unknot vs trefoil' },
  
  // 3. 相邻交叉数的 Torus Knots
  { a: 'trefoil', b: 'torus_2_5', reason: '3 vs 5 crossings, same family' },
  { a: 'torus_2_5', b: 'torus_2_7', reason: '5 vs 7 crossings, same family' },
  { a: 'torus_2_7', b: 'torus_2_9', reason: '7 vs 9 crossings, same family' },
  
  // 4. 不同家族但交叉数接近
  { a: 'trefoil', b: 'figure8', reason: '3 vs 4 crossings, different families' },
  
  // 5. Links 混淆
  { a: 'hopf_link', b: 'unlinked_rings', reason: 'linked vs unlinked (subtle)' },
];

/**
 * 检查两个类型是否是预定义的混淆组合
 * @param {string} typeA 
 * @param {string} typeB 
 * @returns {{ isConfusing: boolean, reason: string|null }}
 */
export function isConfusingPair(typeA, typeB) {
  for (const pair of CONFUSING_PAIRS) {
    if ((pair.a === typeA && pair.b === typeB) ||
        (pair.a === typeB && pair.b === typeA)) {
      return { isConfusing: true, reason: pair.reason };
    }
  }
  return { isConfusing: false, reason: null };
}

// ============= 按难度分组 =============

/**
 * 按难度分组的绳结类型
 * 用于难度分层采样
 */
export const KNOT_TYPES_BY_DIFFICULTY = {
  easy: ['unknot', 'trefoil', 'figure8', 'hopf_link', 'unlinked_rings'],
  medium: ['twisted_ring', 'spiral_disk', 'torus_2_5', 'chain'],
  hard: ['kinky_unknot', 'torus_2_7', 'torus_2_9', 'torus_3_4', 'torus_3_5', 'borromean'],
};

/**
 * 按拓扑类分组（排除 Links）
 */
export const KNOT_ONLY_TYPES = Object.entries(KNOT_TYPE_REGISTRY)
  .filter(([_, entry]) => !entry.isLink)
  .map(([key]) => key);

/**
 * 只包含 Knots 的拓扑类 ID（排除 Links）
 */
export const KNOT_ONLY_TOPOLOGICAL_IDS = getAllTopologicalIds({ includeLinks: false });

// ============= 导出汇总 =============

export default {
  TOPOLOGICAL_CLASSES,
  KNOT_TYPE_REGISTRY,
  CONFUSING_PAIRS,
  KNOT_TYPES_BY_DIFFICULTY,
  KNOT_ONLY_TYPES,
  KNOT_ONLY_TOPOLOGICAL_IDS,
  
  // Functions
  getTopologicalId,
  areTopologicallyEquivalent,
  getGeneratorsForTopologicalClass,
  getAllTopologicalIds,
  getGeneratorsByTopologicalId,
  isDeceptiveKnot,
  isLink,
  getCrossingNumber,
  getDifficulty,
  isConfusingPair,
};
