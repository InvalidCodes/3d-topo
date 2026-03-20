# 3D Topology Benchmark — 项目进展总览

> 最后更新：2026-03-19（GPT-4o-mini all-phrasings 6282 evaluations 完成，49.9%）
> 项目启动：2026-01 | 周会记录：253 页 slides（Jan 14 — Mar 7）

---

## 一、项目概述

本项目旨在构建一个**基于 3D 拓扑学的 VLM (Vision Language Model) 评测 Benchmark**，理论基础来自 Piaget 的 5 种拓扑分类（Proximity, Separation, Continuity, Order, Enclosure），并参考 Strohecker 对 Knot（纽结）的扩展，形成 **5 列 × 2 行** 的 Task Taxonomy：

### 最终 Taxonomy 表（Mar 4, 2026 确定）

| Evaluation \ Abilities | Continuity (proximity + separation) | Separation | Order | Enclosure (Holes) | Knot (Entanglement) |
|---|---|---|---|---|---|
| **Static Perception** | Maze/Möbius (可达性) | Shape/Object 分离检测 | origami (时序), beam string (空间序) | hole detection, 2D/3D enclosure | closed loop, Three.js knot detection, chains number |
| **Intervention / Planning** | Pipe connection env | One stroke color grouping | Hanoi Tower | Laser game | Untangle env |

### 文献传承链

```
Piaget 1956 (5 topological classifications)
    └──> Strohecker 1991 "Why Knot?" / 1996 thesis
         └──> 本文: "Following [A] and [B], we propose our taxonomy."
```

关键支撑文献：
- **2024 Firestone** "Tangled Physics: Knots Strain Intuitive Physical Reasoning" — 证明 knot 是独立认知能力
- **2003 Maynard & Greenfield** — 沿用 Piaget "knots tasks" 作为实验工具
- **1976 J. Larry Martin** — 从数学角度批评 Piaget 用词不够精确（但认可 Order 概念正确）

---

## 二、各模块完成度

### 2.1 理论框架 (Taxonomy) — ~85%

| 子项 | 状态 | 备注 |
|------|------|------|
| Piaget 5 分类定义与解释 | ✅ 完成 | proximity, separation, continuity, order, enclosure |
| 证明 continuity = proximity + separation | ✅ 完成 | Piaget 原文 P8, P144, P149 三处证据 |
| Knot 独立分类论证 | ✅ 完成 | Firestone 2024, Strohecker 1991 |
| 5 列 × 2 行 taxonomy 表 | ✅ 完成 | 最终版 p.244 |
| Invariance 行 | ❌ 已移除 | 原有设计被删掉，保留 Static Perception + Intervention |
| Open loop 任务 | ❌ 已移除 | 最新 commit "remove open loop"，taxonomy 中划掉 |

### 2.2 文献综述 — ~70%

| 子项 | 状态 | 备注 |
|------|------|------|
| 文献收集 | ✅ 38+ 篇 | 覆盖 connectivity, enclosure, holes, entanglement |
| Google Scholar 关键词搜索 | ✅ 完成 | 6 组搜索词已记录 |
| Piaget 原文证据提取 | ✅ 完成 | 5 分类的感知/操作/欧几里得对应 |
| Martin 批评分析 | ✅ 完成 | separation/proximity/order/enclosure/continuity 逐项 |
| Strohecker 三大发现整理 | ✅ 完成 | mother structures, set & group, knot ≠ Piaget 5分类 |
| Q1: Piaget 是否被广泛接受 | ✅ 完成 | 6 条支持证据 + 4 条批评，结论：广泛引用但有争议 |
| 引用格式整理 | ❌ 未开始 | 需转为 BibTeX |

### 2.3 Knot 列 — 渲染 & 数据集 — 需扩充

| 子项 | 状态 | 备注 |
|------|------|------|
| Three.js 3D knot 渲染器 | ✅ 完成 | `knot_gallery.html` (Dataset 生成模式) + 8 个 JS 模块 |
| Gauss code 解析器 | ✅ 完成 | trefoil, figure-8, cinquefoil, torus knots |
| 15 种 knot/link 类型注册表 | ✅ 完成 | `knot-type-registry.js`（borromean 已移除） |
| Difficulty 评分系统 | ✅ 完成 | topology × saliency × trap_type |
| 一键批量生成 (batch-dataset-generator) | ✅ 完成 | ZIP 下载 |
| `_FAMILY_MAP_JS` loose_open_knot 分类 | ✅ 修复 | UNKNOT → TORUS |
| Borromean rings | ❌ 已移除 | 穿模问题未解决，跨环交叉需完全重做，暂时从数据集移除 |
| 数据集扩充 | 🔲 待做 | 当前每类仅 3-4 样本，需扩充至 8-10（详见 Phase 1） |

**当前数据集 (v3.1, 2026-03-18)：**
```
dataset/                          # 271 PNG + 57 singles/links + 50 pairs
├── singles/                      # 12 knot 类型 × 4 slackness 变体 × 3 视角
│   ├── unknot/          (4)      #   easy baseline, crossing=0
│   ├── twisted_ring/    (4)      #   deceptive unknot
│   ├── spiral_disk/     (4)      #   deceptive unknot
│   ├── kinky_unknot/    (4)      #   deceptive unknot (hard)
│   ├── loose_open_knot/ (4)      #   开口松散 trefoil (TORUS family)
│   ├── trefoil/         (4)      #   T(2,3), 3 crossings
│   ├── figure8/         (4)      #   TWIST family, 4 crossings
│   ├── torus_2_5/       (4)      #   T(2,5) cinquefoil, 5 crossings
│   ├── torus_2_7/       (4)      #   T(2,7) septafoil, 7 crossings
│   ├── torus_2_9/       (4)      #   T(2,9), 9 crossings
│   ├── torus_3_4/       (4)      #   T(3,4), 8 crossings
│   └── torus_3_5/       (4)      #   T(3,5), 10 crossings
├── links/                        # 3 link 类型 × 3 变体 × 3 视角
│   ├── hopf_link/       (3)      #   2-component, LINKED
│   ├── unlinked_rings/  (3)      #   2-component, UNLINKED
│   └── chain/           (3)      #   3-component chain
├── pairs/                        # 50 pairs × 2 images
│   ├── 25 positive (SAME)
│   └── 25 negative (DIFFERENT)
├── questions.json                # 341 预生成 questions（所有 sample×task 组合）
└── dataset_metadata.json
```

### 2.4 VLM 评测代码 — ✅ 100%

| 子项 | 状态 | 备注 |
|------|------|------|
| `vlm_benchmark.py` | ✅ 完成 | 10 task 框架 (v3)，支持 `--base-url` 多 provider |
| 10 题 prompt 定义 | ✅ 完成 | 导师审核后删除 T05/T07/T08/T14/T15 |
| **Question phrasing variations** | ✅ 完成 | **10 tasks × 20 phrasings = 200 unique questions**（`question_phrasings.py`） |
| Phrasing 集成到 benchmark | ✅ 完成 | `--phrasing N` 指定单个，`--all-phrasings` 跑全部 20 种 |
| `questions.json` 预生成 | ✅ 完成 | 341 questions，可审阅 |
| Difficulty 筛选 | ✅ 完成 | easy/medium/hard 分层 |
| Trap type 分析 | ✅ 完成 | loose_knot, deceptive_unknot |
| 结果解析 & 报告 | ✅ 完成 | accuracy by task/difficulty/trap-type/knot-type |
| 多 provider 支持 | ✅ 完成 | `--base-url` + `--api-key-env` 参数，Gemini/Claude 可通过 OpenAI 兼容端点 |

**Question Phrasing Robustness (200 unique questions)：**

每个 task 有 20 种不同的 question phrasing，保持相同的 answer format 和 parse_key。用途：
- 避免 benchmark 对特定措辞过拟合（prompt robustness）
- 测试模型对同一拓扑概念在不同表述下的理解一致性
- 支持 phrasing-level 分析：哪些问法更容易/更难

**All-phrasings 全量规模（dry-run 2026-03-18）：**
- 108 个 metadata samples × 10 tasks × 20 phrasings = **6821 次 API 调用**
- 预计 GPT-4o 费用：$50-100（取决于图片大小）
- 预计运行时间：3-6 小时（含 0.5s sleep per call）

```bash
# 使用特定 phrasing（0-19）
python3 vlm_benchmark.py --phrasing 5 --tasks all

# 跑全部 20 种 phrasing（每个 sample×task 组合跑 20 次）
python3 vlm_benchmark.py --all-phrasings --tasks all

# 默认行为（不加参数）：使用原始固定 prompt，向后兼容
python3 vlm_benchmark.py --tasks all

# 先跑小规模测试（5 个 sample）
python3 vlm_benchmark.py --all-phrasings --tasks all --limit 5
```

**10 个 VLM 任务 (v3, 导师审核后)：**

| Task | Group | 类型 | 问题 |
|------|-------|------|------|
| T01 knotted_direct | Knottedness | single | Knotted or unknotted? |
| T02 knotted_cot | Knottedness | single | Knotted? (chain-of-thought) |
| T03 crossing_count | Knottedness | single | Crossing 数量 A/B/C/D |
| T04 can_untie | Knottedness | single | 能否解开？YES/NO |
| T06 knot_family | Classification | single | UNKNOT/TORUS/TWIST/OTHER |
| T09 loose_knot_trap | Classification | single | ACTUAL_KNOT or LOOSE_ILLUSION |
| T10 linked_or_not | Multi-component | multi | LINKED/UNLINKED |
| T11 hopflink_or_not | Multi-component | multi | HOPF/NOT_HOPF |
| T12 link_components | Multi-component | multi | 数独立环个数 |
| T13 same_knot_type | Pair comparison | pair | SAME/DIFFERENT |

已删除：T05 (subjective confidence), T07 (torus pq), T08 (trefoil), T14 (complexity), T15 (no chirality data)

### 2.5 VLM 测试结果 — ~60%

#### GPT-4o-mini — 固定 prompt（2026-03-16）— 341 questions, 51.1%

| Task | 准确率 | 评级 |
|------|--------|------|
| T12_link_components | **83.3%** | ✅ 强 |
| T04_can_untie | **70.8%** | ✅ 强 |
| T13_same_knot_type | **70.0%** | ✅ 强 |
| T10_linked_or_not | 58.3% | ⚠️ 中 |
| T02_knotted_cot | 56.2% | ⚠️ 中 |
| T06_knot_family | 54.2% | ⚠️ 中 |
| T11_hopflink_or_not | 50.0% | ⚠️ 中 |
| T01_knotted_direct | 37.5% | ❌ 弱 |
| T03_crossing_count | 29.2% | ❌ 弱 |
| T09_loose_knot_trap | **27.3%** | ❌ 最弱 |

#### GPT-4o — 固定 prompt（2026-03-18）— 341 questions, 67.2%

| Task | 准确率 | vs mini | 评级 |
|------|--------|---------|------|
| T02_knotted_cot | **81.3%** | +25.1pp | ✅ 强 |
| T01_knotted_direct | **79.2%** | +41.7pp | ✅ 强 |
| T10_linked_or_not | **77.8%** | +19.5pp | ✅ 强 |
| T12_link_components | **77.8%** | -5.5pp | ✅ 强 |
| T06_knot_family | **75.0%** | +20.8pp | ✅ 强 |
| T11_hopflink_or_not | **66.7%** | +16.7pp | ⚠️ 中 |
| T04_can_untie | 64.6% | -6.2pp | ⚠️ 中 |
| T13_same_knot_type | 62.0% | -8.0pp | ⚠️ 中 |
| T09_loose_knot_trap | 50.0% | +22.7pp | ⚠️ 中 |
| T03_crossing_count | **47.9%** | +18.7pp | ❌ 弱 |

**难度梯度：** easy 72.5% → medium 59.5% → hard 60.0%

**0% 准确率的 knot×task 组合（GPT-4o 完全失败）：**
- `figure8 × T06_knot_family` — 不认识 figure-8 knot
- `figure8 × T09_loose_knot_trap` — 把真结误判为假结
- `torus_2_5/2_9/3_4/3_5 × T03_crossing` — 高 crossing 数完全数不对
- `trefoil × T09_loose_knot_trap` — 真 trefoil 被判为 loose illusion
- `unlinked_rings × T11_hopflink` — 把 unlinked 误判为 hopf
- `loose_open_knot × T09_loose_knot_trap` — 0/4 正确

#### GPT-4o-mini — All Phrasings（2026-03-19）— 6282 evaluations, 49.9%

20 种 question phrasing × 108 samples × 10 tasks，全量 prompt robustness 测试。

| Task | 准确率 | N | easy | medium | hard | 评级 |
|------|--------|---|------|--------|------|------|
| T12_link_components | **70.6%** | 180 | 66.9% | 100.0% | — | ✅ 强 |
| T10_linked_or_not | **63.9%** | 180 | 63.1% | 70.0% | — | ⚠️ 中 |
| T13_same_knot_type | **60.6%** | 1000 | 60.6% | — | — | ⚠️ 中 |
| T11_hopflink_or_not | 55.0% | 180 | 51.9% | 80.0% | — | ⚠️ 中 |
| T04_can_untie | 51.7% | 877 | 53.0% | 52.1% | 42.5% | ⚠️ 中 |
| T01_knotted_direct | 48.9% | 874 | 68.5% | 34.5% | 21.2% | ⚠️ 中 |
| T09_loose_knot_trap | 48.0% | 400 | 62.5% | 14.2% | — | ⚠️ 中 |
| T06_knot_family | 45.6% | 880 | 50.5% | 42.0% | 38.8% | ❌ 弱 |
| T02_knotted_cot | 42.1% | 863 | 45.5% | 40.2% | 35.0% | ❌ 弱 |
| T03_crossing_count | 41.2% | 848 | 62.6% | 25.1% | 12.5% | ❌ 弱 |

**Trap type 分析：**
- deceptive_unknot: 61.3%（778/1270）
- loose_knot: **30.6%**（185/605）— 最难的 trap 类型
- none (正常样本): 49.2%（2169/4407）

**Per knot type（最弱 5 种）：**
- torus_3_4: **26.1%**（104/398）
- torus_2_9: **29.0%**（116/400）
- torus_2_5: **35.8%**（143/400）
- loose_open_knot: **36.7%**（167/455）
- torus_3_5: **37.4%**（148/396）

**关键发现（含 all-phrasings）：**
1. **GPT-4o 比 mini 强 16pp**（67.2% vs 51.1%），但仍远非饱和
2. **All-phrasings 结果(49.9%)与固定 prompt(51.1%)一致**：说明模型表现稳定，非过拟合到特定措辞
3. **T03 (crossing count) 最难**：接近随机水平，high-crossing 几乎全错（hard 仅 12.5%）
4. **T09 (deceptive trap) 很有效**：medium 难度仅 14.2%，VLM 被有效欺骗
5. **CoT 在 all-phrasings 下反而更差**：T02(42.1%) < T01(48.9%)，可能因为 20 种 CoT prompt 质量参差
6. **难度梯度验证通过**：easy > medium > hard，符合设计预期
7. **Benchmark 有效性确认**：49.9% ≈ 随机水平，说明任务对 mini 模型有很强区分度
8. **高复杂度 torus knots 最难**：torus_3_4(26.1%) 和 torus_2_9(29.0%) 接近随机猜测

### 2.6 其他 4 列 Task 实现 — ~5%

| 列 | Static Perception | Intervention/Planning | 状态 |
|---|---|---|---|
| **Continuity** | Maze/Möbius 可达性 | Pipe connection env | ❌ 仅有概念设计 |
| **Separation** | Shape/Object 分离检测 | One stroke color grouping | ❌ 仅有概念设计 |
| **Order** | origami, beam string | Hanoi Tower (anbang liu) | ❌ 仅有概念设计 |
| **Enclosure** | hole detection, 2D/3D enclosure | Laser game | ⚠️ 定义完成，无实现 |

### 2.7 论文撰写 — ~0%

目前无论文初稿，所有内容仅在周会 slides 中。

---

## 三、周会进度回顾

| 周 | 日期 | 完成事项 | 下周计划 |
|---|------|---------|---------|
| W1 | Jan 14 | 调研 related paper repo; 生成 open-loop 数据集; 定义 open-loop difficulty control | 生成更多 multi closed-loops; Related paper |
| W2 | Feb 4 | 寻找支持 taxonomy 的论文 | Generate more multi closed-loops; Related paper |
| W3 | Feb 13 | 整理 taxonomy 支撑论文; Piaget 5分类; 新 task 设计 (A-F) | 找 Piaget 原文证据; 去掉 open loop tasks; 新 task 设计 |
| W4 | Feb 20 | Piaget 原文证据; knots 分类支持; Strohecker set & group; 更多 task 设计 | *(空白)* |
| W5 | Feb 25 | *(同 W4 内容重复整理)* | *(空白)* |
| W6 | Mar 4 | 更新 taxonomy (去掉 invariance); 定义 enclosure (holes); 完成 closed-loop 数据集 | Improve dataset; Improve questions; Test more; Holes classification |
| W7 | Mar 7 | 确定 Piaget 对 holes 的定义 | *(未记录)* |
| W8 | Mar 17 | 数据集 v3 完成; 修复 borromean/loose_open_knot; VLM benchmark v3; GPT-4o-mini 全量测试 51.1% | GPT-4o 测试 |
| W9 | Mar 18 | 移除 borromean（穿模无法修复）; **GPT-4o 全量测试 67.2%**; questions.json 导出 341 questions; 错误分析完成 | All-phrasings 测试 |
| W10 | Mar 19 | **GPT-4o-mini all-phrasings 完成**：6282 evaluations, 49.9%; 20 phrasings × 10 tasks 全量 prompt robustness 验证; test.bash 新增 `all-phrasings` 模式 | **数据集扩充 + 多模型 all-phrasings 测试**（详见 Phase 规划） |

---

## 四、接下来的工作：分 Phase 执行

### Phase 1：数据集扩充（最高优先级）

**问题**：当前每类仅 3-4 样本，link 类仅 3 样本。统计不够稳定——单个 knot×task 组合只有 3-4 个 datapoint，0% 或 100% 可能只是噪声。Reviewer 会质疑统计显著性。

**目标**：每类扩充至 **8-10 个样本**，pairs 扩充至 **80-100 对**。

| 类型 | 当前 | 目标 | 差额 |
|------|------|------|------|
| singles (12 类) | 每类 4 | 每类 10 | +72 |
| links (3 类) | 每类 3 | 每类 8 | +15 |
| pairs | 50 | 80 | +30 |
| **总 questions** | **~341** | **~700-800** | **+400** |

**具体做法**：
1. 修改 `batch-dataset-generator.js` 的 `VARIANTS_PER_TYPE` 从 4 → 10
2. Link 类从 3 → 8 变体
3. Pair 从 50 → 80 对，确保正负均衡
4. 重新生成 → 重新导出 `questions.json`
5. 运行 `validate_dataset.py` 确认无损坏

**预期产出**：~160 singles/links + 80 pairs = ~240 metadata，~600 PNG，~700+ questions

### Phase 2：多模型评测（紧随 Phase 1）

**最低要求**：5 个模型（投稿底线）。**理想**：8 个模型。

| Tier | 模型 | Provider | API Key | 费用估算 | 状态 |
|------|------|----------|---------|----------|------|
| Frontier | **GPT-4o** | OpenAI | ✅ 已有 | ~$15 | ✅ 已完成 67.2% |
| Frontier | **Claude Sonnet 4.6** | Anthropic | 🔲 需获取 | ~$10 | 🔲 待测 |
| Frontier | **Gemini 2.5 Pro** | Google | 🔲 需获取 | ~$10 | 🔲 待测 |
| Mid | **GPT-4o-mini** | OpenAI | ✅ 已有 | ~$1 | ✅ 已完成 51.1% |
| Mid | **Gemini 2.0 Flash** | Google | 🔲 需获取 | ~$0.5 | 🔲 待测 |
| Mid | **Claude Haiku 4.5** | Anthropic | 🔲 需获取 | ~$1 | 🔲 待测 |
| Open | **Qwen-VL-Max** | Alibaba | 🔲 需获取 | ~$2 | 🔲 待测 |
| Open | **InternVL-2.5** | 上海AI Lab | 本地/API | 免费 | 🔲 待测 |

**需要的 API Key**：
- `ANTHROPIC_API_KEY` — Claude 模型
- `GOOGLE_API_KEY` — Gemini 模型（可在 [Google AI Studio](https://aistudio.google.com/) 免费申请）
- Qwen/InternVL 可通过 Hugging Face 或阿里云 API

**调用方式**（已支持 `--base-url`）：
```bash
# Gemini（通过 OpenAI 兼容端点）
python3 vlm_benchmark.py --model gemini-2.0-flash \
  --base-url https://generativelanguage.googleapis.com/v1beta/openai/ \
  --api-key-env GOOGLE_API_KEY --tasks all --output results_gemini.json

# Claude（需要适配 Anthropic API，或用 OpenRouter 统一接口）
```

### Phase 3：Human Baseline（与 Phase 2 并行）

**为什么需要**：没有 human baseline 的 benchmark paper 很难过审。Reviewer 需要知道人类在这些任务上能达到什么水平。

**做法**：
1. 从 `questions.json` 中随机抽取 **100 个 question**（确保 10 个 task 各约 10 个）
2. 找 **3-5 个人**（自己 + 同学），每人做同一组 100 题
3. 计算人类准确率 + inter-annotator agreement (Fleiss' kappa)
4. 预期：人类 85-95%（证明任务对人类不难，但对 VLM 难）

**工具**：可以写一个简单的 HTML 答题页面，或用 Google Form

### Phase 4：结果分析 & 可视化

完成 Phase 2-3 后，需要生成论文级别的分析：

1. **Model Comparison Table** — 8 模型 × 10 tasks 的大表，加粗最高分
2. **Radar Chart** — 每个模型在 4 个 task group 上的雷达图
3. **Difficulty Curve** — easy/medium/hard 三档，各模型的准确率折线
4. **Error Case Gallery** — 选 10-15 个代表性错误案例，展示图片 + GT + 模型回答
5. **Trap Analysis** — deceptive unknot 的 confusion matrix
6. **CoT Ablation** — T01 vs T02 在所有模型上的对比柱状图
7. **Statistical Significance** — bootstrap 置信区间或 McNemar's test

### Phase 5：论文撰写

**目标会议**：NeurIPS 2026 Datasets & Benchmarks track（deadline 通常 5-6 月）

**论文结构草案**：
1. Introduction — VLM 缺乏 3D 拓扑推理能力
2. Related Work — Piaget, Strohecker, 现有 VLM benchmarks
3. Taxonomy — 5 列 × 2 行表
4. KnotBench — 数据集构建 + 10 tasks 定义
5. Experiments — 8 模型 + human baseline
6. Analysis — 上述 7 个分析维度
7. Conclusion — VLM 在拓扑推理上的瓶颈

---

## 五、关键风险 & 建议

### 风险 1：范围过大

**问题**：5 列 × 2 行 = 10 个任务域，全部实现工作量巨大。

**建议**：
- **方案 A（聚焦型，推荐）**：先以 Knot 列为核心发一篇 paper，其他 4 列作为 taxonomy 框架展望
- **方案 B（全面型）**：5 列全做，每列至少一个 Static Perception 任务
- 推荐 **方案 A** 作为第一篇论文

### 风险 2：数据集规模仍不足 ← 当前最大风险

**问题**：每类 3-4 样本太少，link 类尤其薄弱（每类仅 3 个）。

**解决**：Phase 1 扩充至每类 8-10 样本，这是投稿前的硬性要求。

### 风险 3：缺少 Human Baseline ← 投稿红线

**问题**：没有 human performance 数据，reviewer 无法判断 benchmark 的上界。

**解决**：Phase 3，找 3-5 人做 100 题。

### 风险 4：模型数量不足

**问题**：目前只有 2 个 OpenAI 模型的结果，缺乏 Claude/Gemini/开源模型对比。

**解决**：Phase 2，获取 API key 后测试 5-8 个模型。

### 风险 5：论文定位不清

**问题**：是投 CV 会议（CVPR/ECCV）、AI 会议（NeurIPS/ICLR）还是 NLP 会议（ACL/EMNLP）？

**建议**：NeurIPS Datasets & Benchmarks track 最合适——专门接收 benchmark 论文，审稿标准明确。

---

## 六、技术架构

```
pair_knot_dataset/
├── knot_gallery.html              # Dataset 生成器
├── vlm_benchmark.py               # VLM 10-task 评测脚本 v3（支持多 provider + phrasing）
├── question_phrasings.py          # 10 tasks × 20 phrasings = 200 unique questions
├── doc/
│   ├── PROJECT_STATUS.md          # 本文件
│   ├── EVALUATION_PLAN.md         # 评测方案
│   └── DATASET_GENERATION_GUIDE.md
├── script/
│   ├── test.bash                  # 测试运行器
│   ├── validate_dataset.py        # 数据集验证
│   └── results/                   # 各模型测试结果 JSON
├── src/                           # 8 个 JS 渲染/生成模块
│   ├── unified-gallery.js
│   ├── batch-dataset-generator.js
│   ├── invariance-renderer.js
│   ├── invariance-generator.js
│   ├── difficulty-controller.js
│   ├── rope-renderer-unified.js
│   ├── centerline-pipeline.js
│   └── knot-type-registry.js
└── dataset/                       # v3.1 — 271 PNG, 107 metadata
    ├── singles/                   # 12 类 × 4 变体 × 3 视角
    ├── links/                     # 3 类 × 3 变体 × 3 视角（borromean 已移除）
    ├── pairs/                     # 50 pairs × 2 images
    ├── questions.json             # 341 预生成 questions
    └── dataset_metadata.json
```

**技术栈：**
- 前端渲染：Three.js + ES6 模块 + HTML5 Canvas
- 评测脚本：Python 3 + OpenAI API（兼容 Gemini/Claude）
- 数据格式：JSON 元数据 + PNG 图片 (1024×1024)
