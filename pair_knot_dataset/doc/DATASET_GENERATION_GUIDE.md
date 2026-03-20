# 数据集生成指南

## 目标规格

| 维度 | 目标 |
|------|------|
| 单图样本 | 每种 knot 类型 × 5 参数变体 × 3 视角 = ~240 张 |
| Pair 样本 | 100 pairs (50 positive + 50 negative) × 2 张 = 200 张 |
| 多环样本 | 每种 link 类型 × 5 变体 × 3 视角 = ~60 张 |
| **总计** | **~500 张图片** |

## 类型覆盖

### 单环 Knots (T01-T09)

| 类型 | 难度 | 变体数 | 说明 |
|------|------|--------|------|
| unknot | easy | 5 | 平凡圆环 |
| twisted_ring | medium | 5 | 扭曲环（deceptive unknot） |
| spiral_disk | medium | 5 | 螺旋环（deceptive unknot） |
| kinky_unknot | hard | 5 | 随机扭曲平凡结（hard negative） |
| trefoil | easy | 5 | 三叶结 T(2,3) |
| figure8 | easy | 5 | 八字结 |
| torus_2_5 | medium | 5 | 五叶结 T(2,5) |
| torus_2_7 | hard | 5 | T(2,7) |
| torus_2_9 | hard | 5 | T(2,9) |
| torus_3_4 | hard | 5 | T(3,4) |
| torus_3_5 | hard | 5 | T(3,5) |

### 多环 Links (T10-T12)

| 类型 | 难度 | 变体数 | 说明 |
|------|------|--------|------|
| hopf_link | easy | 5 | 两环相扣 |
| unlinked_rings | easy | 5 | 两环不扣 |
| chain | medium | 5 | 锁链 (3 环) |
| borromean | hard | 5 | Borromean 环 |

### Pair 数据集 (T13-T15)

| 类别 | 数量 | 说明 |
|------|------|------|
| Positive easy | 17 | 同类型、相似参数 |
| Positive medium | 17 | 同拓扑类、不同参数 |
| Positive hard | 16 | 同拓扑类、不同生成器 (如 unknot vs kinky_unknot) |
| Negative easy | 17 | 交叉数差异大 (unknot vs torus_2_9) |
| Negative medium | 17 | 随机不同拓扑类 |
| Negative hard | 16 | 混淆组合 (kinky_unknot vs trefoil) |

## 生成步骤

### Step 1: 在浏览器中生成

```bash
# 启动 HTTP server
python3 -m http.server 8080

# 浏览器打开 http://localhost:8080/knot_gallery.html
# 切换到 "Dataset Generation" 模式
```

### Step 2: 单图批量导出

在浏览器控制台中：

```javascript
import { generateSingleImageDataset } from './src/invariance-generator.js';

const dataset = generateSingleImageDataset({
  samplesPerType: 5,
  seed: 'benchmark-v2',
  includeLinks: true,
});

// 查看分布
console.log(dataset.statistics);

// 逐个渲染（需要 invariance-renderer）
// renderer.renderAndExportAll(dataset.samples);
```

### Step 3: Pair 批量导出

```javascript
import { generateInvarianceDataset } from './src/invariance-generator.js';

const pairDataset = generateInvarianceDataset({
  numPairs: 100,
  positiveRatio: 0.5,
  seed: 'pairs-v2',
  difficultyDistribution: { easy: 0.34, medium: 0.33, hard: 0.33 },
  includeDeceptive: true,
});

console.log(pairDataset.statistics);
```

### Step 4: 验证

```bash
python script/validate_dataset.py --data_dir ./dataset
```

### Step 5: Dry-run benchmark

```bash
python vlm_benchmark.py --data_dir ./dataset --tasks all --dry-run
```

## 质量检查清单

- [ ] 每种 knot 类型至少 5 个样本
- [ ] difficulty 分布：easy/medium/hard 各约 1/3
- [ ] 所有 metadata 包含 `isKnot`, `isUnknot`, `isDeceptive`, `isLink` 字段
- [ ] 链环类型包含 `numComponents` 字段
- [ ] 所有图片文件存在且可读
- [ ] validate_dataset.py 0 issues
- [ ] dry-run 所有 15 个 task 的 ground truth 非 None
- [ ] T10-T12 有足够的 link 样本 (≥ 10)
- [ ] T13-T15 有足够的 pair 样本 (≥ 30)
- [ ] 不包含 `loose_open_knot`（已从 taxonomy 移除）
- [ ] 无暴露的 API key

## 已知问题

1. **现有数据集 chain 缺少 `isLink` 字段** — 需重新生成
2. **trefoil 缺少 oblique 视角图片** — 需补充
3. **无 pair 数据** — 需通过 invariance-generator 生成
4. **数据集规模太小** (71 张 → 需要 500+)
