/**
 * Open Loop Dataset Generator (Static Perception)
 *
 * 输出 samples（不包含图片二进制），由 UI 层负责逐张渲染并打包 ZIP。
 */

import { getOpenKnotLabels } from './open-loop-generator.js';
import { computeSingleOpenLoopDifficulty } from './difficulty-controller.js';

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

function makeRng(seedStr) {
  const seedFn = xmur3(String(seedStr || 'open-loop-dataset'));
  return mulberry32(seedFn());
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pickWeighted(rng, items) {
  const valid = items.filter(it => (it && Number.isFinite(it.w) && it.w > 0));
  const total = valid.reduce((s, it) => s + it.w, 0);
  if (total <= 0 || valid.length === 0) return items[0]?.v ?? null;
  let r = rng() * total;
  for (const it of valid) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return valid[valid.length - 1].v;
}

function pad3(n) { return String(n).padStart(3, '0'); }

function computeDifficulty(type, tightness, labelsFull) {
  return computeSingleOpenLoopDifficulty({
    knotType: type,
    tightness,
    knotCount: labelsFull?.knot_count ?? 0,
    hasKnot: !!labelsFull?.has_knot,
  });
}

function makeQaPairs(labels) {
  const has = labels.has_knot ? 'yes' : 'no';
  const k = String(labels.knot_count);
  const tightLevel = labels.tightness_level; // tight|medium|loose|slack
  return [
    { q: 'Does this rope contain any knot?', a: has },
    { q: 'How many knots are in this rope?', a: k },
    // 二分类答案：tight / loose
    { q: 'Is this knot tied tightly or loosely?', a: (tightLevel === 'tight' || tightLevel === 'medium') ? 'tight' : 'loose' },
  ];
}

/**
 * @typedef {Object} OpenLoopDatasetConfig
 * @property {string} seed
 * @property {number} numImages
 * @property {number} tightnessMin
 * @property {number} tightnessMax
 * @property {Object} typeWeights - { straight, overhand, figure8, bowline, double_overhand, loose_coil }
 */

export function generateOpenLoopDataset(config) {
  const seed = String(config?.seed || 'open-loop-v1');
  const rng = makeRng(seed);

  const numImages = Math.max(1, Math.min(5000, Math.floor(config?.numImages ?? 100)));
  const tMin = clamp(Number(config?.tightnessMin ?? 0.1), 0, 1);
  const tMax = clamp(Number(config?.tightnessMax ?? 0.9), 0, 1);
  const lo = Math.min(tMin, tMax);
  const hi = Math.max(tMin, tMax);

  const w = config?.typeWeights || {};
  const typeWeights = [
    { v: 'straight', w: Number(w.straight ?? 1) },
    { v: 'loose_coil', w: Number(w.loose_coil ?? 1) },
    { v: 'overhand', w: Number(w.overhand ?? 2) },
    { v: 'figure8', w: Number(w.figure8 ?? 2) },
    { v: 'bowline', w: Number(w.bowline ?? 1) },
    { v: 'double_overhand', w: Number(w.double_overhand ?? 1) },
  ];

  const samples = [];
  const stats = {
    total: numImages,
    byType: { straight: 0, overhand: 0, figure8: 0, bowline: 0, double_overhand: 0, loose_coil: 0 },
    byDifficulty: { easy: 0, medium: 0, hard: 0 },
  };

  for (let i = 1; i <= numImages; i++) {
    const knot_type = pickWeighted(rng, typeWeights) || 'straight';
    const tightness = lo + (hi - lo) * rng();
    const labelsFull = getOpenKnotLabels(knot_type, tightness);

    // 题目要求 labels 里只放 3 个字段（示例中没 tightness_level/knot_type）
    const labels = {
      has_knot: labelsFull.has_knot,
      knot_count: labelsFull.knot_count,
      can_be_straightened: true,
    };

    const diff = computeDifficulty(knot_type, tightness, labelsFull);
    const difficulty = diff.difficulty;
    const difficulty_score = Number(diff.difficulty_score.toFixed(3));
    const image_id = `open_${pad3(i)}`;
    const image_path = `images/${image_id}.png`;

    const rec = {
      image_id,
      image_path,
      knot_type,
      tightness: Number(tightness.toFixed(2)),
      tightness_level: labelsFull.tightness_level,
      labels,
      difficulty,
      difficulty_score,
      difficulty_factors: diff.factors,
      qa_pairs: makeQaPairs(labelsFull),
      // 渲染时用（UI 会传给 renderer），不影响 benchmark schema
      _render: {
        seed: `${seed}|${image_id}`,
      },
    };

    samples.push(rec);
    if (stats.byType[knot_type] !== undefined) stats.byType[knot_type]++;
    stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;
  }

  return {
    samples,
    statistics: stats,
    config: {
      seed,
      numImages,
      tightnessMin: lo,
      tightnessMax: hi,
      typeWeights: Object.fromEntries(typeWeights.map(x => [x.v, x.w])),
      generatedAt: new Date().toISOString(),
    },
  };
}

export function samplesToJsonl(samples) {
  return (samples || []).map(s => {
    const { _render, ...publicRec } = s; // 不导出内部字段
    return JSON.stringify(publicRec);
  }).join('\n');
}

export function generateDatasetMetadata(dataset) {
  return {
    version: '1.0.0',
    name: 'Open Loop Knot Perception Dataset',
    description: 'Open-ended rope images for VLM benchmark: knot presence / count / tightness perception.',
    ...dataset.config,
    statistics: dataset.statistics,
    schema: {
      image_id: 'string',
      image_path: 'string',
      knot_type: 'string',
      tightness: 'number [0-1]',
      tightness_level: "string: 'tight'|'medium'|'loose'|'slack'",
      labels: {
        has_knot: 'boolean',
        knot_count: 'number',
        can_be_straightened: 'boolean (always true)',
      },
      difficulty: "string: 'easy'|'medium'|'hard'",
      difficulty_score: 'number [0-1] - unified difficulty score',
      difficulty_factors: 'object - unified difficulty factors',
      qa_pairs: 'array<{q:string,a:string}>',
    },
  };
}

export default {
  generateOpenLoopDataset,
  samplesToJsonl,
  generateDatasetMetadata,
};

