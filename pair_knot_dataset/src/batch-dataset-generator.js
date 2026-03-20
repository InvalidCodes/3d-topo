/**
 * batch-dataset-generator.js
 *
 * 一键批量生成完整 benchmark 数据集。
 * 在浏览器中运行，调用 invariance-renderer.js 进行渲染。
 *
 * 生成规格：
 * - 12 种单环 knot 类型 × 10 个 slackness 变体 × 3 个视角 = 360 单环图
 * - 3 种 link 类型 × 10 个变体 × 3 个视角 = 90 多环图
 * - 100 pairs (50 positive + 50 negative) × 2 张 = 200 pair 图
 * 总计约 650 张图 + 对应 metadata
 */

import { KNOT_TYPE_REGISTRY } from './knot-type-registry.js';
import { renderSingleImage, dataUrlToBlob, downloadDataUrl } from './invariance-renderer.js';
import { generatePositivePair, generateNegativePair, makeRng } from './invariance-generator.js';
import { getBucketTopology, getBucketSaliency, getTrapType } from './difficulty-controller.js';

// ============= 生成规格 =============

const CAMERA_ANGLES = [
  { name: 'iso_fr',  pos: [3.5, 3.5, 5] },   // 拉近 ~30%，crossing 更清晰
  { name: 'front',   pos: [0, 1.5, 6] },
  { name: 'oblique', pos: [2, 6, 3] },
];

// 每种类型的 slackness 采样点（均匀覆盖参数空间，10 级）
const SLACKNESS_LEVELS = [
  { label: 'tight_1',     value: 0.05 },
  { label: 'tight_2',     value: 0.10 },
  { label: 'light_1',     value: 0.18 },
  { label: 'light_2',     value: 0.25 },
  { label: 'medium_1',    value: 0.33 },
  { label: 'medium_2',    value: 0.42 },
  { label: 'loose_1',     value: 0.50 },
  { label: 'loose_2',     value: 0.58 },
  { label: 'very_loose_1', value: 0.68 },
  { label: 'very_loose_2', value: 0.78 },
];

// 限制某些类型的最大 slackness（防止穿模/视觉退化）
const SLACKNESS_CAPS = {
  unknot: 0.30, twisted_ring: 0.30, spiral_disk: 0.20,
  figure8: 0.65, trefoil: 0.70, torus_2_5: 0.75,
  torus_2_7: 0.50, torus_2_9: 0.40,  // 高 crossing 收紧，防止 crossing 模糊
  torus_3_4: 0.50, torus_3_5: 0.40,
  kinky_unknot: 0.50,
  loose_open_knot: 0.95,  // 松散变体：需要高 slackness
};

// 某些类型的 slackness 下界
const SLACKNESS_FLOORS = {
  loose_open_knot: 0.50,  // 至少 0.5 才能体现"松散"
  kinky_unknot: 0.25,     // 太低则 kinky 特征消失，退化成普通环
};

const DEFORM_RANGE = { min: 0.10, max: 0.45 };

// 某些类型需要更高的变形强度才能产生有趣的视觉效果
const DEFORM_FLOORS = {
  unknot: 0.25,         // unknot 需要足够变形才不像完美圆
  twisted_ring: 0.20,   // twisted_ring 需要明显扭转
  kinky_unknot: 0.30,   // kinky_unknot 需要高变形才能产生复杂的 kink
};

const RENDER_OPTIONS = {
  width: 1024,
  height: 1024,
};

// Family map (same as vlm_benchmark.py)
const FAMILY_MAP = {
  unknot: 'UNKNOT', twisted_ring: 'UNKNOT', kinky_unknot: 'UNKNOT',
  spiral_disk: 'UNKNOT',
  trefoil: 'TORUS', loose_open_knot: 'TORUS',
  torus_2_5: 'TORUS', torus_2_7: 'TORUS',
  torus_2_9: 'TORUS', torus_3_4: 'TORUS', torus_3_5: 'TORUS',
  figure8: 'TWIST',
};

// ============= 辅助 =============

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Seeded RNG
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return h >>> 0; };
}
function mulberry32(seed) {
  return () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function localRng(seedStr) { return mulberry32(xmur3(seedStr)()); }

// ============= 主生成函数 =============

/**
 * 生成完整数据集并打包下载（ZIP 或逐个下载）
 * @param {Object} config
 * @param {Function} onProgress - (current, total, message) => void
 * @returns {Promise<Object>} { samples: [], metadata: [] }
 */
export async function generateFullDataset(config = {}, onProgress = () => {}) {
  const {
    seed = 'benchmark-v3',
    variantsPerType = 10,          // 每种类型的 slackness 变体数
    anglesPerVariant = 3,          // 每个变体的相机角度数
    numPairs = 100,                // pair 总数
    renderWidth = 1024,
    renderHeight = 1024,
  } = config;

  const rng = localRng(seed);
  const allFiles = [];       // { filename, blob, metadata }
  const allMetadata = [];

  // ── Step 1: 单环 knots ──
  const knotTypes = Object.entries(KNOT_TYPE_REGISTRY)
    .filter(([_, e]) => !e.isLink)
    .map(([key]) => key);

  const linkTypes = Object.entries(KNOT_TYPE_REGISTRY)
    .filter(([_, e]) => e.isLink)
    .map(([key]) => key);

  const totalSingle = knotTypes.length * variantsPerType * anglesPerVariant;
  const linkVariants = 10;  // 10 变体，提升多环 task 统计效力
  const totalLink = linkTypes.length * linkVariants * anglesPerVariant;
  const totalPair = numPairs * 2;
  const grandTotal = totalSingle + totalLink + totalPair;
  let current = 0;

  onProgress(0, grandTotal, '开始生成单环 knot 数据...');

  for (const knotType of knotTypes) {
    const entry = KNOT_TYPE_REGISTRY[knotType];
    const maxSlack = SLACKNESS_CAPS[knotType] ?? 0.80;
    const levels = SLACKNESS_LEVELS.filter(l => l.value <= maxSlack + 0.05);
    // 确保有足够的变体，不够则补充中间值
    while (levels.length < variantsPerType) {
      const mid = (levels[levels.length - 1].value + levels[0].value) / 2;
      levels.push({ label: `custom_${levels.length}`, value: clamp(mid + rng() * 0.1, 0, maxSlack) });
    }

    for (let v = 0; v < variantsPerType; v++) {
      const minSlack = SLACKNESS_FLOORS[knotType] ?? 0;
      const slackness = clamp(levels[v % levels.length].value, minSlack, maxSlack);
      const deformMin = Math.max(DEFORM_RANGE.min, DEFORM_FLOORS[knotType] ?? 0);
      const deformStrength = clamp(deformMin + rng() * (DEFORM_RANGE.max - deformMin), 0, 1);
      const variantSeed = Math.floor(rng() * 999999);
      const sampleId = `${knotType}_s${slackness.toFixed(2)}_d${deformStrength.toFixed(2)}_v${v}`;

      const images = [];

      for (let a = 0; a < Math.min(anglesPerVariant, CAMERA_ANGLES.length); a++) {
        const angle = CAMERA_ANGLES[a];
        const filename = `${sampleId}_${angle.name}.png`;

        const imageParams = {
          knotType,
          seed: variantSeed,
          deformStrength,
          slackness,
          cameraPosition: angle.pos,
          cameraTarget: [0, 0, 0],
          cameraFov: 45,
          color: `hsl(${(rng() * 360).toFixed(0)}, 70%, 80%)`,
          metalness: 0.10,
          roughness: 0.40,
          tubeRadius: 0.07,
          lightIntensity: 1.2,
          ambientIntensity: 0.9,
          backgroundColor: '#1a2236',
        };

        try {
          const dataUrl = await renderSingleImage(imageParams, {
            width: renderWidth,
            height: renderHeight,
          });
          const blob = dataUrlToBlob(dataUrl);
          allFiles.push({ filename, blob, dataUrl });
          images.push({ filename, cameraAngle: angle.name, cameraPos: angle.pos });
        } catch (err) {
          console.warn(`Render failed: ${filename}`, err);
          images.push({ filename, cameraAngle: angle.name, cameraPos: angle.pos, error: err.message });
        }

        current++;
        onProgress(current, grandTotal, `[${current}/${grandTotal}] ${filename}`);

        // 让浏览器喘口气，避免冻结 UI
        if (current % 3 === 0) await sleep(10);
      }

      // 构建 metadata
      const crossing = entry.crossingNumber ?? 0;
      const trap = getTrapType(knotType, slackness);
      const score = 0.35 * Math.min(crossing / 10, 1) + 0.45 * slackness + 0.20 * (trap ? 0.3 : 0);

      const meta = {
        version: '3.0',
        id: sampleId,
        knotType,
        topologicalId: entry.topologicalId,
        isKnot: entry.isKnot ?? false,
        isUnknot: entry.isUnknot ?? false,
        isDeceptive: entry.isDeceptive ?? false,
        isLink: false,
        numComponents: 1,
        crossingNumber: crossing,
        family: FAMILY_MAP[knotType] || 'OTHER',
        seed: variantSeed,
        slackness,
        deformStrength,
        bucket_topology: getBucketTopology(knotType),
        bucket_saliency: getBucketSaliency(slackness),
        trap_type: trap,
        difficulty_score: Math.round(score * 1000) / 1000,
        difficulty: score < 0.30 ? 'easy' : score < 0.55 ? 'medium' : 'hard',
        images,
      };
      allMetadata.push(meta);
    }
  }

  // ── Step 2: 多环 links ──
  onProgress(current, grandTotal, '开始生成多环 link 数据...');

  for (const knotType of linkTypes) {
    const entry = KNOT_TYPE_REGISTRY[knotType];

    for (let v = 0; v < linkVariants; v++) {
      const slackness = clamp(0.1 + v * 0.07, 0, 0.80);
      const deformStrength = 0.15 + rng() * 0.2;
      const variantSeed = Math.floor(rng() * 999999);
      const sampleId = `${knotType}_v${v}`;
      const chainNumLinks = knotType === 'chain' ? (3 + v) : undefined;
      const images = [];

      for (let a = 0; a < Math.min(anglesPerVariant, CAMERA_ANGLES.length); a++) {
        const angle = CAMERA_ANGLES[a];
        const filename = `${sampleId}_${angle.name}.png`;

        const imageParams = {
          knotType,
          seed: variantSeed,
          deformStrength,
          slackness,
          cameraPosition: angle.pos,
          cameraTarget: [0, 0, 0],
          cameraFov: 45,
          color: `hsl(${(rng() * 360).toFixed(0)}, 70%, 80%)`,
          metalness: 0.10, roughness: 0.40, tubeRadius: 0.07,
          lightIntensity: 1.2, ambientIntensity: 0.9,
          backgroundColor: '#1a2236',
          ...(chainNumLinks ? { numLinks: chainNumLinks } : {}),
        };

        try {
          const dataUrl = await renderSingleImage(imageParams, { width: renderWidth, height: renderHeight });
          allFiles.push({ filename, blob: dataUrlToBlob(dataUrl), dataUrl });
          images.push({ filename, cameraAngle: angle.name, cameraPos: angle.pos });
        } catch (err) {
          console.warn(`Render failed: ${filename}`, err);
          images.push({ filename, cameraAngle: angle.name, cameraPos: angle.pos, error: err.message });
        }

        current++;
        onProgress(current, grandTotal, `[${current}/${grandTotal}] ${filename}`);
        if (current % 3 === 0) await sleep(10);
      }

      const numComp = knotType === 'chain' ? chainNumLinks : (entry.numComponents ?? 2);
      const meta = {
        version: '3.0',
        id: sampleId,
        knotType,
        topologicalId: entry.topologicalId,
        isKnot: false, isUnknot: false,
        isDeceptive: false,
        isLink: true,
        numComponents: numComp,
        crossingNumber: entry.crossingNumber,
        family: 'link',
        seed: variantSeed, slackness, deformStrength,
        bucket_topology: getBucketTopology(knotType),
        bucket_saliency: getBucketSaliency(slackness),
        trap_type: null,
        difficulty_score: 0,
        difficulty: entry.difficulty || 'medium',
        images,
      };
      allMetadata.push(meta);
    }
  }

  // ── Step 3: Pair 数据 ──
  onProgress(current, grandTotal, '开始生成 pair 数据...');
  const pairRng = makeRng(seed + '-pairs');
  const numPos = Math.floor(numPairs / 2);
  const numNeg = numPairs - numPos;
  const pairMetadata = [];

  for (let i = 0; i < numPos + numNeg; i++) {
    const isPositive = i < numPos;
    const difficulty = ['easy', 'medium', 'hard'][i % 3];
    const pair = isPositive
      ? generatePositivePair(pairRng, difficulty)
      : generateNegativePair(pairRng, difficulty);

    const pairId = `pair${String(i + 1).padStart(4, '0')}`;

    for (const [side, imgParams] of [['A', pair.imageA], ['B', pair.imageB]]) {
      const filename = `${pairId}_${side}.png`;
      try {
        const dataUrl = await renderSingleImage(imgParams, { width: renderWidth, height: renderHeight });
        allFiles.push({ filename, blob: dataUrlToBlob(dataUrl), dataUrl });
      } catch (err) {
        console.warn(`Pair render failed: ${filename}`, err);
      }

      current++;
      onProgress(current, grandTotal, `[${current}/${grandTotal}] ${filename}`);
      if (current % 2 === 0) await sleep(10);
    }

    pairMetadata.push({
      version: '3.0',
      id: pairId,
      label_equivalent: pair.label_equivalent,
      topologicalIdA: pair.topologicalIdA,
      topologicalIdB: pair.topologicalIdB,
      difficulty: pair.difficulty,
      difficulty_score: pair.difficulty_score,
      image1: `${pairId}_A.png`,
      image2: `${pairId}_B.png`,
      imageA: pair.imageA,
      imageB: pair.imageB,
    });
  }

  onProgress(grandTotal, grandTotal, '生成完毕！正在准备下载...');

  return {
    files: allFiles,
    singleMetadata: allMetadata,
    pairMetadata,
    stats: {
      totalImages: allFiles.length,
      singleKnots: knotTypes.length * variantsPerType,
      links: linkTypes.length * linkVariants,
      pairs: numPairs,
    },
  };
}

/**
 * 将数据集打包为单个 ZIP 文件下载。
 * 目录结构：
 *   dataset/
 *     singles/
 *       {knotType}/
 *         {id}_metadata.json
 *         {id}_iso_fr.png
 *         {id}_front.png
 *         {id}_oblique.png
 *     links/
 *       {linkType}/
 *         ...
 *     pairs/
 *       {pairId}_metadata.json
 *       {pairId}_A.png
 *       {pairId}_B.png
 *     dataset_metadata.json
 */
export async function downloadDatasetAsZip(dataset, onProgress = () => {}) {
  const { files, singleMetadata, pairMetadata } = dataset;

  // 动态加载 JSZip（CDN）
  onProgress(0, 1, '加载 JSZip 库...');
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  }

  const zip = new window.JSZip();
  const total = files.length + singleMetadata.length + pairMetadata.length + 1;
  let done = 0;

  // 1. 全局 metadata
  const fullMetadata = {
    version: '3.0',
    generatedAt: new Date().toISOString(),
    singles: singleMetadata.filter(m => !m.isLink),
    links: singleMetadata.filter(m => m.isLink),
    pairs: pairMetadata,
    stats: dataset.stats,
  };
  zip.file('dataset/dataset_metadata.json', JSON.stringify(fullMetadata, null, 2));
  done++;
  onProgress(done, total, 'dataset_metadata.json');

  // 2. 单环 metadata + 图片
  const fileMap = new Map(); // filename → blob
  for (const f of files) {
    fileMap.set(f.filename, f.blob);
  }

  for (const meta of singleMetadata) {
    const isLink = meta.isLink;
    const folder = isLink ? `dataset/links/${meta.knotType}` : `dataset/singles/${meta.knotType}`;

    // metadata JSON
    zip.file(`${folder}/${meta.id}_metadata.json`, JSON.stringify(meta, null, 2));
    done++;
    onProgress(done, total, `${meta.id}_metadata.json`);

    // 对应的图片
    for (const img of (meta.images || [])) {
      const blob = fileMap.get(img.filename);
      if (blob) {
        zip.file(`${folder}/${img.filename}`, blob);
        fileMap.delete(img.filename); // 标记已处理
        done++;
        onProgress(done, total, img.filename);
      }
    }
  }

  // 3. Pair metadata + 图片
  for (const meta of pairMetadata) {
    zip.file(`dataset/pairs/${meta.id}_metadata.json`, JSON.stringify(meta, null, 2));
    done++;

    for (const imgName of [meta.image1, meta.image2]) {
      const blob = fileMap.get(imgName);
      if (blob) {
        zip.file(`dataset/pairs/${imgName}`, blob);
        fileMap.delete(imgName);
        done++;
        onProgress(done, total, imgName);
      }
    }
  }

  // 4. 剩余未分类的文件
  for (const [name, blob] of fileMap.entries()) {
    zip.file(`dataset/other/${name}`, blob);
    done++;
    onProgress(done, total, name);
  }

  // 5. 生成 ZIP
  onProgress(done, total, '正在压缩 ZIP 文件（可能需要 30 秒）...');
  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      onProgress(done, total, `压缩中 ${Math.round(meta.percent)}%`);
    }
  );

  // 6. 触发下载
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knot_benchmark_dataset_${new Date().toISOString().slice(0,10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { zipSize: zipBlob.size };
}

export default { generateFullDataset, downloadDatasetAsZip };
