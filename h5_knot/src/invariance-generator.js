/**
 * Invariance Generator
 * 
 * 生成用于测试拓扑不变性的 Pair 数据集。
 * 
 * 核心功能：
 * 1. 生成 Positive Pairs（拓扑等价）
 * 2. 生成 Negative Pairs（拓扑不等价）
 * 3. 计算 difficulty_score 和 similarity_score
 * 4. 支持难度分层采样
 */

import {
  KNOT_TYPE_REGISTRY,
  TOPOLOGICAL_CLASSES,
  CONFUSING_PAIRS,
  KNOT_TYPES_BY_DIFFICULTY,
  KNOT_ONLY_TOPOLOGICAL_IDS,
  getTopologicalId,
  areTopologicallyEquivalent,
  getGeneratorsByTopologicalId,
  isDeceptiveKnot,
  isLink,
  getCrossingNumber,
  isConfusingPair,
} from './knot-type-registry.js';
import { KNOWN_GAUSS_CODES } from './gauss-code-generator.js';

// ============= Seeded RNG =============

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

export function makeRng(seedStr) {
  const seedFn = xmur3(String(seedStr || 'invariance-seed'));
  return mulberry32(seedFn());
}

// ============= 辅助函数 =============

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 针对特定 knot 类型收紧形变，避免尖刺/穿模
function clampDeformByKnotType(knotType, deform) {
  const caps = {
    figure8: 0.20,       // 降低 figure-8 形变，避免毛刺
    spiral_disk: 0.28,
    twisted_ring: 0.40,
  };
  const cap = caps[knotType];
  return cap !== undefined ? Math.min(deform, cap) : deform;
}

function pick(rng, arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function pickExcluding(rng, arr, exclude) {
  const filtered = arr.filter(item => item !== exclude);
  if (filtered.length === 0) return pick(rng, arr);
  return pick(rng, filtered);
}

function shuffleArray(rng, arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

// ============= 颜色与材质（固定） =============

// 颜色/材质：随机糖果色 + 固定材质，避免干扰拓扑判断
const PASTEL_COLORS = [
  '#ffd5e5', '#d5f4ff', '#fff4d5', '#e5d5ff',
  '#d5ffe5', '#ffe5d5', '#f4d5ff', '#d5fff4',
  '#e8e8f5', '#f3e2ff'
];
const FIXED_BACKGROUND = '#1a2236';     // 深灰背景
const FIXED_METALNESS = 0.10;           // 塑胶/橡胶质感
const FIXED_ROUGHNESS = 0.40;
const FIXED_TUBE_RADIUS = 0.07;         // 统一粗细，进一步变细以减少穿模
const FIXED_LIGHT_INTENSITY = 1.2;
const FIXED_AMBIENT_INTENSITY = 0.9;

// ============= 相机工具 =============

/**
 * 生成随机相机位置（球坐标）
 */
function randomCameraPosition(rng, options = {}) {
  const {
    minRadius = 10.0,         // 拉远相机距离，避免出框
    maxRadius = 14.0,
    minPhi = 0.2,             // 避免正上方
    maxPhi = Math.PI - 0.2,   // 避免正下方
  } = options;
  
  const radius = randRange(rng, minRadius, maxRadius);
  const theta = rng() * Math.PI * 2;  // 水平角度
  const phi = randRange(rng, minPhi, maxPhi);  // 垂直角度
  
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return [x, y, z];
}

/**
 * 计算两个相机位置的视角差异（0-1）
 */
function computeViewAngleDiff(posA, posB) {
  // 计算两个方向向量的夹角
  const normA = Math.sqrt(posA[0]**2 + posA[1]**2 + posA[2]**2) || 1;
  const normB = Math.sqrt(posB[0]**2 + posB[1]**2 + posB[2]**2) || 1;
  
  const dotProduct = (
    (posA[0] / normA) * (posB[0] / normB) +
    (posA[1] / normA) * (posB[1] / normB) +
    (posA[2] / normA) * (posB[2] / normB)
  );
  
  // 夹角（0 到 π）
  const angle = Math.acos(clamp(dotProduct, -1, 1));
  
  // 归一化到 0-1（π 为最大差异）
  return angle / Math.PI;
}

// ============= Image Params 生成 =============

/**
 * @typedef {Object} ImageParams
 * @property {string} knotType - 绳结类型 key
 * @property {number} seed - RNG seed
 * @property {number} deformStrength - 变形强度 (0-1)
 * @property {number[]} cameraPosition - 相机位置 [x, y, z]
 * @property {number[]} cameraTarget - 相机目标 [x, y, z]
 * @property {number} cameraFov - 相机视场角
 * @property {string} color - 颜色 (hex) 固定
 * @property {number} metalness - 金属度 (0-1) 固定
 * @property {number} roughness - 粗糙度 (0-1) 固定
 * @property {number} tubeRadius - 管道半径 固定
 * @property {number} lightIntensity - 光照强度 固定
 * @property {number} ambientIntensity - 环境光强度 固定
 * @property {string} backgroundColor - 背景色 (hex) 固定
 * @property {string} gaussCode - 预期的 Gauss Code（若已知，否则空字符串）
 */
// 根据 knotType/topoId 选择已知 Gauss Code；未知则返回空字符串
function resolveGaussCode(knotType) {
  if (!knotType) return '';
  const id = getTopologicalId(knotType);
  // 明确映射
  const map = {
    trefoil: KNOWN_GAUSS_CODES.trefoil,
    figure8: KNOWN_GAUSS_CODES.figure8,
    torus_2_5: KNOWN_GAUSS_CODES.cinquefoil, // cinquefoil 5_1
    cinquefoil: KNOWN_GAUSS_CODES.cinquefoil,
    unknot: '0',
  };
  // 直接按 key 命中
  if (map[knotType]) return map[knotType];
  // 按 topologicalId 尝试
  const topoMap = {
    [TOPOLOGICAL_CLASSES.TREFOIL]: KNOWN_GAUSS_CODES.trefoil,
    [TOPOLOGICAL_CLASSES.FIGURE8]: KNOWN_GAUSS_CODES.figure8,
    [TOPOLOGICAL_CLASSES.CINQUEFOIL_5_1]: KNOWN_GAUSS_CODES.cinquefoil,
    [TOPOLOGICAL_CLASSES.UNKNOT]: '0',
  };
  if (topoMap[id]) return topoMap[id];
  return '';
}

/**
 * 生成随机的 ImageParams
 * @param {Function} rng - 随机数生成器
 * @param {string} knotType - 绳结类型 key
 * @param {Object} constraints - 约束条件
 * @returns {ImageParams}
 */
export function generateRandomImageParams(rng, knotType, constraints = {}) {
  const {
    deformRange = [0.1, 0.5],   // 上限收紧，减少过度扰动导致的穿模
    fovRange = [35, 55],
  } = constraints;
  
  const seed = Math.floor(rng() * 1000000);
    
    return {
    knotType,
    seed,
    
    // Geometry Deformation（核心随机因素）
    deformStrength: clampDeformByKnotType(
      knotType,
      randRange(rng, deformRange[0], deformRange[1])
    ),
    
    // Camera（保持完全随机视角）
    cameraPosition: randomCameraPosition(rng),
    cameraTarget: [0, 0, 0],
    cameraFov: randRange(rng, fovRange[0], fovRange[1]),
    
    // Material & Lighting（固定，去除干扰）
    color: pick(rng, PASTEL_COLORS),
    metalness: FIXED_METALNESS,
    roughness: FIXED_ROUGHNESS,
    tubeRadius: FIXED_TUBE_RADIUS,
    lightIntensity: FIXED_LIGHT_INTENSITY,
    ambientIntensity: FIXED_AMBIENT_INTENSITY,
      
    // Background（固定）
    backgroundColor: FIXED_BACKGROUND,

    // Gauss Code（若已知则填充）
    gaussCode: resolveGaussCode(knotType),
    };
  }

  /**
 * 生成"相似"的 ImageParams（用于 Easy Pairs）
 * 基于参考参数，只做微小调整
 */
export function generateSimilarImageParams(rng, knotType, referenceParams, similarity = 0.8) {
  const blend = (a, b, t) => a + (b - a) * t;
  const diff = 1 - similarity;
  
  // 基于参考参数，但保持固定材质与粗细
  const newParams = generateRandomImageParams(rng, knotType);
    
    return {
    ...newParams,
    knotType,
    
    // 混合：保持大部分相似
    deformStrength: blend(referenceParams.deformStrength, newParams.deformStrength, diff),
    
    // 相机位置：只做小幅调整
    cameraPosition: referenceParams.cameraPosition.map((v, i) => 
      v + (newParams.cameraPosition[i] - v) * diff * 0.5
    ),
    cameraFov: blend(referenceParams.cameraFov, newParams.cameraFov, diff * 0.3),
    
    // 材质/颜色/粗细全部固定
    color: pick(rng, PASTEL_COLORS),
    metalness: FIXED_METALNESS,
    roughness: FIXED_ROUGHNESS,
    tubeRadius: FIXED_TUBE_RADIUS,
    backgroundColor: FIXED_BACKGROUND,

    // Gauss Code（若已知则填充）
    gaussCode: resolveGaussCode(knotType),
  };
}

// 确保正负样本的形变差异至少达到阈值
function ensureDeformGap(paramsA, paramsB, rng, minGap = 0.18) {
  let attempts = 0;
  while (Math.abs(paramsA.deformStrength - paramsB.deformStrength) < minGap && attempts < 5) {
    // 随机重新抽样 B 的形变
    paramsB.deformStrength = randRange(rng, 0.1, 0.8);
    attempts++;
  }
}

// ============= Pair 生成 =============

/**
 * @typedef {Object} PairRecord
 * @property {string} pairId
 * @property {ImageParams} imageA
 * @property {ImageParams} imageB
 * @property {boolean} label_equivalent
 * @property {string} topologicalIdA
 * @property {string} topologicalIdB
 * @property {number} difficulty_score
 * @property {number} similarity_score
 * @property {Object} difficulty_factors
 * @property {string} imagePathA
 * @property {string} imagePathB
 */

/**
 * 生成 Positive Pair（拓扑等价）
 * @param {Function} rng 
 * @param {'easy'|'medium'|'hard'} targetDifficulty 
 * @param {Object} options
 * @returns {PairRecord}
 */
export function generatePositivePair(rng, targetDifficulty = 'medium', options = {}) {
  const {
    allowedTypes = null,  // 如果指定，只从这些类型中选择
    includeDeceptive = true,
  } = options;
  
  // 1. 选择一个拓扑类
  let availableTopoIds = KNOT_ONLY_TOPOLOGICAL_IDS;
  
  // 2. 获取该拓扑类下的所有 generator
  const topologicalId = pick(rng, availableTopoIds);
  let generators = getGeneratorsByTopologicalId(topologicalId);
  
  // 如果有类型限制，过滤
  if (allowedTypes) {
    generators = generators.filter(g => allowedTypes.includes(g.key));
  }
  
  // 如果不包含欺骗性类型，过滤
  if (!includeDeceptive) {
    generators = generators.filter(g => !g.entry.isDeceptive);
  }
  
  if (generators.length === 0) {
    // Fallback：使用 unknot
    generators = getGeneratorsByTopologicalId(TOPOLOGICAL_CLASSES.UNKNOT);
  }
  
  // 3. 根据难度决定如何选择两个 generator
  let knotTypeA, knotTypeB;
  
  if (targetDifficulty === 'easy') {
    // Easy：使用同一个 generator，参数相似
    const gen = pick(rng, generators);
    knotTypeA = gen.key;
    knotTypeB = gen.key;
  } else if (targetDifficulty === 'hard') {
    // Hard：尽量使用不同的 generator（如果可用）
    if (generators.length >= 2) {
      const shuffled = shuffleArray(rng, generators);
      knotTypeA = shuffled[0].key;
      knotTypeB = shuffled[1].key;
    } else {
      // 只有一个 generator，增加变形差异
      knotTypeA = generators[0].key;
      knotTypeB = generators[0].key;
    }
  } else {
    // Medium：随机选择
    knotTypeA = pick(rng, generators).key;
    knotTypeB = pick(rng, generators).key;
  }
  
  // 4. 生成 ImageParams
  let imageA, imageB;
  
  if (targetDifficulty === 'easy') {
    // Easy：参数相似
    imageA = generateRandomImageParams(rng, knotTypeA);
    imageB = generateSimilarImageParams(rng, knotTypeB, imageA, 0.75);
  } else if (targetDifficulty === 'hard') {
    // Hard：参数差异大
    imageA = generateRandomImageParams(rng, knotTypeA, {
      deformRange: [0.1, 0.4],
    });
    imageB = generateRandomImageParams(rng, knotTypeB, {
      deformRange: [0.5, 0.8],
    });
        } else {
    // Medium：随机
    imageA = generateRandomImageParams(rng, knotTypeA);
    imageB = generateRandomImageParams(rng, knotTypeB);
  }
  // 强制形变差异和不同 seed
  ensureDeformGap(imageA, imageB, rng, 0.18);
  if (imageA.seed === imageB.seed) imageB.seed += 1;
  
  // 5. 计算评分
  const scores = computePairScores(imageA, imageB, true, topologicalId, topologicalId);
  
  return {
    pairId: '',  // 稍后填充
    imageA,
    imageB,
    label_equivalent: true,
    topologicalIdA: topologicalId,
    topologicalIdB: topologicalId,
    difficulty_score: scores.difficulty,
    similarity_score: scores.similarity,
    difficulty_factors: scores.factors,
    imagePathA: '',
    imagePathB: '',
  };
}

/**
 * 生成 Negative Pair（拓扑不等价）
 * @param {Function} rng 
 * @param {'easy'|'medium'|'hard'} targetDifficulty 
 * @param {Object} options
 * @returns {PairRecord}
 */
export function generateNegativePair(rng, targetDifficulty = 'medium', options = {}) {
  const {
    allowedTypes = null,
    includeDeceptive = true,
  } = options;
  
  let knotTypeA, knotTypeB;
  let topologicalIdA, topologicalIdB;
  
  if (targetDifficulty === 'hard' && includeDeceptive) {
    // Hard：优先使用预定义的混淆组合
    const confusingPair = pick(rng, CONFUSING_PAIRS);
    if (confusingPair && rng() < 0.7) {
      knotTypeA = confusingPair.a;
      knotTypeB = confusingPair.b;
      topologicalIdA = getTopologicalId(knotTypeA);
      topologicalIdB = getTopologicalId(knotTypeB);
    }
  }
  
  // 如果没有选择混淆组合，随机选择两个不同的拓扑类
  if (!knotTypeA || !knotTypeB) {
    let availableTopoIds = [...KNOT_ONLY_TOPOLOGICAL_IDS];
    
    if (targetDifficulty === 'easy') {
      // Easy：选择交叉数差异大的
      // 策略：一个 unknot，一个高交叉数
      topologicalIdA = TOPOLOGICAL_CLASSES.UNKNOT;
      topologicalIdB = pick(rng, [
        TOPOLOGICAL_CLASSES.TORUS_2_7,
        TOPOLOGICAL_CLASSES.TORUS_2_9,
        TOPOLOGICAL_CLASSES.TORUS_3_5,
      ]);
    } else if (targetDifficulty === 'medium') {
      // Medium：随机选择两个不同的
      topologicalIdA = pick(rng, availableTopoIds);
      topologicalIdB = pickExcluding(rng, availableTopoIds, topologicalIdA);
  } else {
      // Hard：选择交叉数接近的
      const closeTopoIds = [
        [TOPOLOGICAL_CLASSES.TREFOIL, TOPOLOGICAL_CLASSES.FIGURE_EIGHT],  // 3 vs 4
        [TOPOLOGICAL_CLASSES.CINQUEFOIL, TOPOLOGICAL_CLASSES.TORUS_2_7],  // 5 vs 7
        [TOPOLOGICAL_CLASSES.UNKNOT, TOPOLOGICAL_CLASSES.TREFOIL],        // 欺骗性 unknot vs trefoil
      ];
      const selectedPair = pick(rng, closeTopoIds);
      topologicalIdA = selectedPair[0];
      topologicalIdB = selectedPair[1];
    }
    
    // 从拓扑类中选择具体的 generator
    const gensA = getGeneratorsByTopologicalId(topologicalIdA, { excludeDeceptive: !includeDeceptive });
    const gensB = getGeneratorsByTopologicalId(topologicalIdB, { excludeDeceptive: !includeDeceptive });
    
    knotTypeA = (gensA.length > 0 ? pick(rng, gensA) : { key: 'unknot' }).key;
    knotTypeB = (gensB.length > 0 ? pick(rng, gensB) : { key: 'trefoil' }).key;
    
    topologicalIdA = getTopologicalId(knotTypeA);
    topologicalIdB = getTopologicalId(knotTypeB);
    }
    
  // 生成 ImageParams
  let imageA, imageB;
  
  if (targetDifficulty === 'easy') {
    // Easy：视觉差异大
    imageA = generateRandomImageParams(rng, knotTypeA);
    imageB = generateRandomImageParams(rng, knotTypeB);
  } else if (targetDifficulty === 'hard') {
    // Hard：视觉尽量相似
    imageA = generateRandomImageParams(rng, knotTypeA);
    imageB = generateSimilarImageParams(rng, knotTypeB, imageA, 0.6);
  } else {
    // Medium：随机
    imageA = generateRandomImageParams(rng, knotTypeA);
    imageB = generateRandomImageParams(rng, knotTypeB);
    }
    
  // 计算评分
  const scores = computePairScores(imageA, imageB, false, topologicalIdA, topologicalIdB);

  return { 
    pairId: '',
    imageA,
    imageB,
    label_equivalent: false,
    topologicalIdA,
    topologicalIdB,
    difficulty_score: scores.difficulty,
    similarity_score: scores.similarity,
    difficulty_factors: scores.factors,
    imagePathA: '',
    imagePathB: '',
  };
}

// ============= Scoring =============

/**
 * 计算 Pair 的 difficulty_score 和 similarity_score
 */
function computePairScores(paramsA, paramsB, isEquivalent, topoIdA, topoIdB) {
  // 1. 计算 similarity_score（基于参数差异）
  const similarity = computeVisualSimilarity(paramsA, paramsB);
    
  // 2. 计算 difficulty_score
  let difficulty;
  const factors = {};
  
  if (isEquivalent) {
    // Equivalent Pairs：越不像越难
    difficulty = computeEquivalentDifficulty(paramsA, paramsB, factors);
      } else {
    // Non-Equivalent Pairs：越像越难
    difficulty = computeNonEquivalentDifficulty(paramsA, paramsB, topoIdA, topoIdB, factors);
  }

  return {
    difficulty: clamp(difficulty, 0, 1),
    similarity: clamp(similarity, 0, 1),
    factors,
  };
}

/**
 * 计算视觉相似度（0-1，越高越相似）
 * 仅关注形变 + 视角，不考虑颜色/材质/光照
 */
function computeVisualSimilarity(paramsA, paramsB) {
  const viewSim = 1 - computeViewAngleDiff(paramsA.cameraPosition, paramsB.cameraPosition);
  const deformSim = 1 - Math.abs(paramsA.deformStrength - paramsB.deformStrength);
  // 仅两项：视角 + 形变
  return clamp(0.55 * viewSim + 0.45 * deformSim, 0, 1);
  }

  /**
 * 计算 Equivalent Pair 的难度（0-1）
 * 两张图越不像，难度越高
 */
function computeEquivalentDifficulty(paramsA, paramsB, factors) {
  let score = 0;
  const weights = {
    deformDiff: 0.6,
    viewAngleDiff: 0.4,
  };
  
  // 变形差异
  const deformDiff = Math.abs(paramsA.deformStrength - paramsB.deformStrength);
  const maxDeform = Math.max(paramsA.deformStrength, paramsB.deformStrength);
  const deformScore = deformDiff * 0.5 + maxDeform * 0.5;
  score += weights.deformDiff * deformScore;
  factors.deformDiff = deformDiff;
  factors.maxDeform = maxDeform;
  
  // 视角差异
  const viewAngle = computeViewAngleDiff(paramsA.cameraPosition, paramsB.cameraPosition);
  score += weights.viewAngleDiff * viewAngle;
  factors.viewAngleDiff = viewAngle;
  
  return score;
  }

  /**
 * 计算 Non-Equivalent Pair 的难度（0-1）
 * 两张图越像，难度越高
 */
function computeNonEquivalentDifficulty(paramsA, paramsB, topoIdA, topoIdB, factors) {
  let score = 0;
  const weights = {
    crossingDiff: 0.3,
    visualSimilarity: 0.5,   // 视觉越像越难
    isConfusingPair: 0.15,
    deceptiveInvolved: 0.05,
  };
  
  // 交叉数差异：越接近越难
  const crossA = getCrossingNumber(paramsA.knotType) || 0;
  const crossB = getCrossingNumber(paramsB.knotType) || 0;
  const crossingDiff = Math.abs(crossA - crossB);
  const crossingScore = 1 - clamp(crossingDiff / 8, 0, 1);  // 差 8+ 交叉 -> easy
  score += weights.crossingDiff * crossingScore;
  factors.crossingDiff = crossingDiff;
  factors.crossingScore = crossingScore;
  
  // 视觉相似度：越高越难
  const visualSim = computeVisualSimilarity(paramsA, paramsB);
  score += weights.visualSimilarity * visualSim;
  factors.visualSimilarity = visualSim;
  
  // 是否是预定义的混淆组合
  const confusing = isConfusingPair(paramsA.knotType, paramsB.knotType);
  score += weights.isConfusingPair * (confusing.isConfusing ? 1 : 0);
  factors.isConfusingPair = confusing.isConfusing;
  factors.confusingReason = confusing.reason;
  
  // 是否涉及欺骗性类型
  const hasDeceptive = isDeceptiveKnot(paramsA.knotType) || isDeceptiveKnot(paramsB.knotType);
  score += weights.deceptiveInvolved * (hasDeceptive ? 1 : 0);
  factors.hasDeceptive = hasDeceptive;
  
  return score;
}

// ============= 批量生成 =============

/**
 * @typedef {Object} DatasetConfig
 * @property {number} numPairs - 总 pair 数
 * @property {number} positiveRatio - positive pairs 占比 (0-1)
 * @property {string} seed - 随机种子
 * @property {Object} difficultyDistribution - 难度分布 { easy, medium, hard }
 * @property {boolean} includeDeceptive - 是否包含欺骗性类型
 * @property {string[]} allowedTypes - 允许的绳结类型（null 表示全部）
 */

/**
 * 根据难度分布采样难度级别
 */
function sampleDifficulty(rng, distribution) {
  const { easy = 0.33, medium = 0.34, hard = 0.33 } = distribution;
  const total = easy + medium + hard;
  const r = rng() * total;
  
  if (r < easy) return 'easy';
  if (r < easy + medium) return 'medium';
  return 'hard';
  }

  /**
 * 生成完整的 Invariance 数据集
 * @param {DatasetConfig} config
 * @returns {Object} { pairs: PairRecord[], statistics: Object }
 */
export function generateInvarianceDataset(config) {
  const {
    numPairs = 20,
    positiveRatio = 0.5,
    seed = 'invariance-v1',
    difficultyDistribution = { easy: 0.33, medium: 0.34, hard: 0.33 },
    includeDeceptive = true,
    allowedTypes = null,
  } = config;
  
  const rng = makeRng(seed);
  
  const numPositive = Math.round(numPairs * positiveRatio);
  const numNegative = numPairs - numPositive;
  
    const pairs = [];
  const statistics = {
    total: numPairs,
    positive: numPositive,
    negative: numNegative,
    byDifficulty: { easy: 0, medium: 0, hard: 0 },
    byKnotType: {},
    byTopologicalId: {},
  };
        
  // 生成 Positive Pairs
  for (let i = 0; i < numPositive; i++) {
    const difficulty = sampleDifficulty(rng, difficultyDistribution);
    const pair = generatePositivePair(rng, difficulty, { allowedTypes, includeDeceptive });
    pairs.push(pair);
    
    // 统计
    statistics.byDifficulty[difficulty]++;
    statistics.byKnotType[pair.imageA.knotType] = (statistics.byKnotType[pair.imageA.knotType] || 0) + 1;
    statistics.byKnotType[pair.imageB.knotType] = (statistics.byKnotType[pair.imageB.knotType] || 0) + 1;
    statistics.byTopologicalId[pair.topologicalIdA] = (statistics.byTopologicalId[pair.topologicalIdA] || 0) + 1;
  }
  
  // 生成 Negative Pairs
  for (let i = 0; i < numNegative; i++) {
    const difficulty = sampleDifficulty(rng, difficultyDistribution);
    const pair = generateNegativePair(rng, difficulty, { allowedTypes, includeDeceptive });
    pairs.push(pair);
    
    // 统计
    statistics.byDifficulty[difficulty]++;
    statistics.byKnotType[pair.imageA.knotType] = (statistics.byKnotType[pair.imageA.knotType] || 0) + 1;
    statistics.byKnotType[pair.imageB.knotType] = (statistics.byKnotType[pair.imageB.knotType] || 0) + 1;
    statistics.byTopologicalId[pair.topologicalIdA] = (statistics.byTopologicalId[pair.topologicalIdA] || 0) + 1;
    statistics.byTopologicalId[pair.topologicalIdB] = (statistics.byTopologicalId[pair.topologicalIdB] || 0) + 1;
  }
  
  // 打乱顺序
  const shuffledPairs = shuffleArray(rng, pairs);
    
  // 分配 pairId 和文件路径
  shuffledPairs.forEach((pair, index) => {
    const pairId = `pair${String(index + 1).padStart(4, '0')}`;
    pair.pairId = pairId;
    pair.imagePathA = `${pairId}_1.png`;
    pair.imagePathB = `${pairId}_2.png`;
    });
    
  return {
    pairs: shuffledPairs,
    statistics,
    config: {
      numPairs,
      positiveRatio,
      seed,
      difficultyDistribution,
      includeDeceptive,
      allowedTypes,
      generatedAt: new Date().toISOString(),
      },
    };
}

/**
 * 将数据集转换为 JSONL 格式
 * @param {PairRecord[]} pairs 
 * @returns {string} JSONL 字符串
 */
export function pairsToJsonl(pairs) {
  return pairs.map(pair => JSON.stringify(pair)).join('\n');
}

/**
 * 导出数据集元信息（用于生成 metadata.json）
 */
export function generateDatasetMetadata(dataset) {
  return {
    version: '1.0.0',
    name: 'Knot Invariance Dataset',
    description: '用于测试模型拓扑不变性理解能力的图像对数据集',
    ...dataset.config,
    statistics: dataset.statistics,
    schema: {
      pairId: 'string - 唯一标识符',
      imageA: 'ImageParams - 图片 A 的生成参数',
      imageB: 'ImageParams - 图片 B 的生成参数',
      label_equivalent: 'boolean - 是否拓扑等价（核心标签）',
      topologicalIdA: 'string - 图片 A 的拓扑类 ID',
      topologicalIdB: 'string - 图片 B 的拓扑类 ID',
      difficulty_score: 'number [0-1] - 任务难度',
      similarity_score: 'number [0-1] - 视觉相似度',
      difficulty_factors: 'object - 难度计算的详细因素',
      imagePathA: 'string - 图片 A 的文件名',
      imagePathB: 'string - 图片 B 的文件名',
    },
  };
}

// ============= 导出 =============

export default {
  makeRng,
  generateRandomImageParams,
  generateSimilarImageParams,
  generatePositivePair,
  generateNegativePair,
  generateInvarianceDataset,
  pairsToJsonl,
  generateDatasetMetadata,
};
