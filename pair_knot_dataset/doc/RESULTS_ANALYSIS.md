# GPT-4o-mini Full Run — Results Analysis

> 日期：2026-03-17
> 数据文件：`script/results/gpt-4o-mini_full_20260316_223255.json`
> 模型：**gpt-4o-mini**（非 GPT-4o，注意区分）
> 样本总数：370 条（10 tasks × ~37-50 samples）

---

## 一、总体结果

| 指标 | 值 |
|------|-----|
| 总样本 | 370 |
| 正确 | 189 |
| **总体准确率** | **51.1%** |
| Unclear 率 | 0.0%（解析完全成功）|

总体准确率 51.1% 略高于随机猜测（二分类随机 50%，多分类更低），说明模型有一定的拓扑感知能力，但整体表现非常弱。

---

## 二、Per-Task 准确率

| Task | 描述 | 正确/总数 | 准确率 | 评级 |
|------|------|-----------|--------|------|
| T12_link_components | 数独立环个数 | 10/12 | **83.3%** | ✅ 强 |
| T04_can_untie | 能否解开？YES/NO | 34/48 | **70.8%** | ✅ 强 |
| T13_same_knot_type | SAME/DIFFERENT pair | 35/50 | **70.0%** | ✅ 强 |
| T10_linked_or_not | LINKED/UNLINKED | 7/12 | 58.3% | ⚠️ 中 |
| T06_knot_family | UNKNOT/TORUS/TWIST/OTHER | 26/48 | 54.2% | ⚠️ 中 |
| T11_hopflink_or_not | HOPF/NOT_HOPF | 6/12 | 50.0% | ⚠️ 中 |
| T02_knotted_cot | Knotted? (CoT) | 27/48 | 56.2% | ⚠️ 中 |
| T01_knotted_direct | Knotted or unknotted? | 18/48 | 37.5% | ❌ 弱 |
| T03_crossing_count | Crossing 数量 A/B/C/D | 14/48 | 29.2% | ❌ 弱 |
| T09_loose_knot_trap | ACTUAL_KNOT or LOOSE_ILLUSION | 12/44 | **27.3%** | ❌ 最弱 |

**观察**：
- 计数类任务（T12）和比较类任务（T13）表现最好——可能利用了视觉特征相似度而非真正的拓扑推理。
- 最难的两个 task（T09、T03）都要求模型区分外观相似但拓扑不同的情况，正是 benchmark 的核心难点。

---

## 三、CoT 效果分析

| Task | 准确率 |
|------|--------|
| T01（直接回答）| 37.5% |
| T02（Chain-of-Thought）| 56.2% |
| **提升** | **+18.7pp** |

CoT 显著改善了复杂 knot 的识别：

| Knot 类型 | T01 | T02 | 改变 |
|-----------|-----|-----|------|
| unknot | 4/4 | 4/4 | — |
| kinky_unknot | 4/4 | 4/4 | — |
| twisted_ring | 4/4 | 4/4 | — |
| spiral_disk | 4/4 | 4/4 | — |
| torus_2_5 | 0/4 | 2/4 | +50% |
| torus_2_7 | 0/4 | 2/4 | +50% |
| torus_2_9 | 0/4 | 2/4 | +50% |
| torus_3_4 | 0/4 | 3/4 | +75% |
| torus_3_5 | 0/4 | 2/4 | +50% |
| trefoil | 0/4 | **0/4** | — |
| figure8 | 1/4 | **0/4** | -25% |
| loose_open_knot | 1/4 | **0/4** | -25% |

**关键发现**：
- CoT 对 torus knots 有帮助，但对 trefoil、figure8 完全无效甚至有害。
- trefoil（最经典的 knot）在两种模式下都是 0/4，说明模型无法识别3-crossing 结构。
- 无 CoT 时，模型只能区分 unknot-family vs 复杂 knot，精度随 knot 复杂度下降。

---

## 四、难度梯度分析

| 难度 | 正确/总数 | 准确率 |
|------|-----------|--------|
| Easy | 120/205 | **58.5%** |
| Medium | 63/141 | 44.7% |
| Hard | 6/24 | **25.0%** |

难度梯度符合预期，验证了 difficulty_score 系统的有效性。Hard 样本准确率仅 25%，接近随机（4选1 = 25%）。

---

## 五、Per-Knot-Type 准确率

| Knot 类型 | 正确/总数 | 准确率 | 备注 |
|-----------|-----------|--------|------|
| hopf_link | 8/9 | **88.9%** | 易识别，结构独特 |
| unknown (pairs) | 35/50 | **70.0%** | T13 pair 比较 |
| unlinked_rings | 7/9 | **77.8%** | 无 crossing，易判断 |
| kinky_unknot | 16/24 | 66.7% | 模型正确识别为 unknot-family |
| twisted_ring | 16/24 | 66.7% | 同上 |
| borromean | 6/9 | 66.7% | |
| spiral_disk | 15/24 | 62.5% | |
| unknot | 11/20 | 55.0% | |
| torus_2_5 | 12/24 | 50.0% | |
| loose_open_knot | 10/24 | 41.7% | 模型对开口结的理解混乱 |
| torus_2_7 | 10/24 | 41.7% | |
| trefoil | 9/24 | 37.5% | 经典结，表现最差之一 |
| torus_2_9 | 9/24 | 37.5% | |
| torus_3_4 | 9/24 | 37.5% | |
| torus_3_5 | 7/24 | 29.2% | |
| figure8 | 7/24 | **29.2%** | twist knot，最难识别 |
| chain | 2/9 | **22.2%** | 最差 |

**观察**：
- 模型擅长识别 link 类型（hopf, unlinked），可能利用的是分量数量而非拓扑结构。
- figure8 knot（4 crossings，TWIST family）是准确率最低的真结类型。
- chain（链状结构）的失败说明模型无法理解多分量的有序连接拓扑。

---

## 六、Trap Type 分析

| Trap 类型 | 正确/总数 | 准确率 | 含义 |
|-----------|-----------|--------|------|
| deceptive_unknot | 47/72 | **65.3%** | 外观像结但实为 unknot |
| none | 128/256 | 50.0% | 普通样本 |
| loose_knot | 14/42 | **33.3%** | 外观松散像非结但实为真结 |

**关键发现**：
- 模型对 deceptive_unknot（看起来是结但实为 unknot）的识别好于随机，说明能感知某些视觉混淆特征。
- loose_knot trap 是最大弱点：模型在看到松散 knot 时倾向于判断为非结，准确率 33%。

---

## 七、T09 (loose_knot_trap) 深度分析 — 严重偏差

T09 是整个 benchmark 中最糟糕的任务，准确率仅 27.3%，且暴露了一个**严重的模型偏差**：

| Knot 类型 | GT | 所有预测 | 正确率 |
|-----------|-----|----------|--------|
| kinky_unknot | LOOSE_ILLUSION | 全4个 LOOSE_ILLUSION | ✅ 4/4 |
| spiral_disk | LOOSE_ILLUSION | 全4个 LOOSE_ILLUSION | ✅ 4/4 |
| twisted_ring | LOOSE_ILLUSION | 全4个 LOOSE_ILLUSION | ✅ 4/4 |
| trefoil | ACTUAL_KNOT | 全4个 LOOSE_ILLUSION | ❌ 0/4 |
| figure8 | ACTUAL_KNOT | 全4个 LOOSE_ILLUSION | ❌ 0/4 |
| loose_open_knot | ACTUAL_KNOT | 全4个 LOOSE_ILLUSION | ❌ 0/4 |
| torus_2_5 ~ torus_3_5 | ACTUAL_KNOT | 全部 LOOSE_ILLUSION | ❌ 0/32 |

**结论**：模型在 T09 上的策略是**无差别预测 LOOSE_ILLUSION**。它偶然正确识别了 unknot-family，但对所有真结（32 个样本）全部预测错误。这不是真正的拓扑感知，而是对 3D 渲染视觉风格的偏见（松散/弯曲 = 非结）。

---

## 八、T03 (crossing_count) 深度分析 — 系统性低估

T03 准确率 29.2%，混淆矩阵：

| GT \ Pred | A (0) | B (3) | C (5) |
|-----------|-------|-------|-------|
| **A (0 crossings)** | 2 | 14 | 0 |
| **B (3 crossings)** | 0 | 8 | 0 |
| **C (5 crossings)** | 0 | 4 | 4 |
| **D (7+ crossings)** | 0 | 9 | 7 |

**关键发现**：
1. 模型从不预测 D（7+ crossings），即使真实 crossing number 高达 10。
2. 对 unknot（0 crossing）几乎都预测为 B（3），说明模型无法理解 0 crossing 的概念。
3. 对 trefoil（3 crossings）完全正确（4/4），对 torus_2_5（5 crossings）大部分正确（3/4）。
4. 越复杂的结，crossing 数越被低估（都归为 B 或 C）。

---

## 九、T06 (knot_family) 深度分析 — TORUS 偏差

| Knot 类型 | GT | 准确率 | 典型错误预测 |
|-----------|-----|--------|-------------|
| torus_2_7 | TORUS | **100%** | — |
| torus_2_9 | TORUS | 75% | TWIST |
| torus_2_5 | TORUS | 75% | UNKNOT |
| kinky_unknot | UNKNOT | 75% | TORUS |
| torus_3_4 | TORUS | 75% | UNKNOT |
| trefoil | TORUS | 50% | TWIST, OTHER |
| torus_3_5 | TORUS | 50% | OTHER, UNKNOT |
| twisted_ring | UNKNOT | 50% | TORUS |
| figure8 | TWIST | **25%** | TORUS, OTHER |
| loose_open_knot | TORUS | **25%** | TWIST, UNKNOT |
| unknot | UNKNOT | **25%** | OTHER, TWIST |
| spiral_disk | UNKNOT | **25%** | TORUS |

**发现**：
- 模型对 TORUS 有强烈偏向，许多 non-TORUS 结都被归为 TORUS。
- figure8（TWIST family）几乎从未被正确分类为 TWIST。
- 最简单的 unknot 只有 25% 正确率，模型对"无结"的概念识别也不稳定。

---

## 十、总结与 Benchmark 价值评估

### 10.1 GPT-4o-mini 的主要弱点（按重要性）

1. **无法感知 loose knot** — T09 接近 0%，对真实 knot 完全无差别判断为非结
2. **crossing 数量系统性低估** — T03 对 0 和高 crossing 都低估
3. **trefoil 识别失败** — 最经典 knot 在直接和 CoT 模式下都是 0/4
4. **TORUS 偏见** — T06 倾向把一切复杂结归为 TORUS
5. **chain link 计数失败** — 多分量有序链状结构理解差

### 10.2 GPT-4o-mini 的相对强项

1. **link 数量计数**（T12）— 83.3%，数 Borromean/Hopf/chain 分量
2. **can_untie 判断**（T04）— 70.8%，利用视觉结构判断可解性
3. **pair 比较**（T13）— 70.0%，视觉相似度而非深度拓扑推理
4. **CoT 效果显著** — 对 torus knots 提升约 50%，值得在 GPT-4o 上验证

### 10.3 对 Benchmark 设计的验证

- ✅ **难度梯度有效**：easy→medium→hard 准确率从 58.5% 降至 25.0%
- ✅ **Trap 设计有效**：loose_knot trap 成功令模型出错（33.3%）
- ✅ **解析率 100%**：所有 370 个 VLM 输出均可被正确解析，prompt 设计成功
- ⚠️ **T09 设计需审视**：模型产生退化策略（全预测 LOOSE_ILLUSION），考虑调整类别平衡

---

## 十一、下一步建议

| 优先级 | 行动 | 理由 |
|--------|------|------|
| P0 | 用 **GPT-4o**（非 mini）重跑全量 | mini 能力不足，结果太弱，不具代表性 |
| P0 | 用 **Claude Sonnet 4.6** 跑全量 | 对比实验，验证是否普遍规律 |
| P1 | T09 类别平衡检查 | 44 样本中 12 个 ACTUAL_KNOT vs 32 LOOSE_ILLUSION，严重不平衡 |
| P1 | 分析 CoT 原始推理文本 | 看 trefoil 0% 的错误推理链，找论文论据 |
| P2 | Gemini 2.5 Pro / Flash | 补充 Google 模型对比 |
| P2 | 增加 chain link 变体 | 目前仅 3 个，增至 6+ 提高统计意义 |
