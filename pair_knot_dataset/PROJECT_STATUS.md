# 3D Topology Benchmark — 项目进展总览

> 最后更新：2026-03-15
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

### 2.3 Knot 列 — 渲染 & 数据集 — ~40%

| 子项 | 状态 | 备注 |
|------|------|------|
| Three.js 3D knot 渲染器 | ✅ 完成 | `knot_gallery.html` + 7 个 JS 模块 |
| Gauss code 解析器 | ✅ 完成 | trefoil, figure-8, cinquefoil, torus knots |
| 40+ knot 类型注册表 | ✅ 完成 | `knot-type-registry.js` |
| Difficulty 评分系统 | ✅ 完成 | topology × saliency × trap_type |
| Closed-loop 数据集 | ⚠️ 规模不足 | **71 张 PNG / 10 种 knot**，需扩至 500+ |
| Multi closed-loop (链环) | ⚠️ 有限 | chain, Hopf link 存在，但种类和数量少 |
| Pair 数据集 (拓扑等价) | ⚠️ 部分 | `invariance-generator.js` 可生成，但未大规模产出 |
| Open-loop 数据集 | ❌ 已移除 | 代码已删除 (`physics-rope-engine.js`, `knot-cache.js`) |
| Spiral disk 渲染问题 | ❌ 未解决 | 早期提到的已知 bug |

**当前数据集内容：**
```
dataset/
├── knot_trefoil (3 crossings, slackness 0.70)
├── knot_torus_2_5 (5 crossings, slackness 0.48)
├── knot_torus_2_7 (7 crossings, slackness 0.61/1.00)
├── knot_torus_2_9 (9 crossings, slackness 0.54)
├── knot_chain (multi-component link)
├── knot_loose_open_knot (unknot variant)
└── 每个 knot 8 个视角 × 多个参数变体 = 71 PNG
```

### 2.4 VLM 评测代码 — ~50%

| 子项 | 状态 | 备注 |
|------|------|------|
| `vlm_benchmark.py` (789行) | ✅ 完成 | 15 task 框架，支持 OpenAI API |
| `vlm_eval.py` (307行) | ✅ 完成 | 轻量版，支持 OpenAI + Anthropic |
| 15 题 prompt 定义 | ⚠️ 有缺陷 | 多个 task 的 prompt/label 设计有问题 |
| Difficulty 筛选 | ✅ 完成 | easy/medium/hard 分层 |
| Trap type 分析 | ✅ 完成 | loose_knot, deceptive_unknot, view_collapse |
| 结果解析 & 报告 | ✅ 完成 | accuracy by task/difficulty/trap-type |

**15 个 VLM 任务定义：**

| Task | 类型 | 问题 | 已知问题 |
|------|------|------|----------|
| T01 knotted_direct | single | Knotted or unknotted? | loose_open_knot 误判 |
| T02 knotted_cot | single | Knotted? (chain-of-thought) | 同 T01 |
| T03 crossing_count | single | Crossing 数量 bucket | ❌ Label/prompt mismatch (A/B/C/D 未映射) |
| T04 can_untie | single | 能否解开？ | Cross-task inconsistency |
| T05 confidence | single | 置信度等级 | ❌ GT 是 DEFINITELY_，模型倾向说 PROBABLY_ |
| T06 shape_symmetry | single | 对称性？ | ✅ 效果好 (100%) |
| T07 shape_flat | single | 扁平还是立体？ | 定义模糊 |
| T08 shape_simple | single | 简单还是复杂？ | ❌ 未操作化定义 |
| T09 knot_family | single | 属于哪个 knot 家族？ | ❌ 选项未映射到家族 |
| T10 linked_or_not | multi | 是否链接？ | — |
| T11 hopflink_or_not | multi | 是否 Hopf link？ | — |
| T12 link_components | multi | 几个独立环？ | — |
| T13 same_knot_type | pair | 同一拓扑类型？ | — |
| T14 which_more_complex | pair | 哪个更复杂？ | — |
| T15 same_or_mirror | pair | 相同/镜像/不同？ | — |

### 2.5 VLM 测试结果 — ~10%

仅完成 **GPT-5.2 mini** 的小规模测试（n=3 per task, 27 total）：

| 分类 | Tasks | 准确率 | 分析 |
|------|-------|--------|------|
| **Good** | T06 shape_symmetry | 100% (3/3) | 几何线索明确，模型处理可靠 |
| | T01 knotted_direct | 66.7% (2/3) | unknot/chain 正确，loose_open_knot 失败 |
| | T02 knotted_cot | 66.7% (2/3) | CoT 推理中过度信任 "crossings can slide apart" |
| **Bad** | T03 crossing_count | 0% (0/3) | Label/prompt 不匹配 |
| | T05 confidence | 0% (0/3) | 评估 artifact |
| | T08 shape_simple | 0% (0/3) | 定义不清，模型偏向说 COMPLEX |
| | T09 knot_family | 0% (0/3) | 选项未映射 |
| **Middle** | T04 can_untie | 33.3% (1/3) | chain 的跨任务矛盾 |
| | T07 shape_flat | 33.3% (1/3) | "flat vs deep" 定义模糊 |
| **总体** | 全部 | **33.3% (9/27)** | Easy: 44.4%, Medium: 27.8% |

**尚未测试的模型：** GPT-4o, GPT-5, Claude Sonnet/Opus, Gemini Pro/Ultra, LLaVA, Qwen-VL 等

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

---

## 四、TODO List — 按优先级排列

### P0 — 紧急（本周/下周）

- [ ] **修复 VLM 问题设计缺陷**
  - T03: 修复 crossing count bucket 的 label/prompt 映射（A/B/C/D → 0/1-3/4-6/7+）
  - T05: 重新设计 confidence 评估方式，避免 DEFINITELY vs PROBABLY 的 artifact
  - T08: 给 shape_simple 提供明确的操作化定义和判定标准
  - T09: 将 knot_family 的选项直接映射到具体家族名称
  - T04: 解决与 T01/T02 的跨任务矛盾（chain 类型的 ground truth）

- [ ] **扩大 Knot 数据集**
  - 目标：至少 500 张 closed-loop 图片
  - 覆盖更多 knot 类型（当前 10 种 → 20+ 种）
  - 增加 easy/medium/hard 各难度的均衡分布
  - 增加更多 multi closed-loop（Hopf link, Borromean rings, Solomon's link 等）

### P1 — 重要（2-3周内）

- [ ] **多模型 VLM 大规模测试**
  - GPT-4o / GPT-5 / GPT-5.2
  - Claude Sonnet 4.6 / Claude Opus 4.6
  - Gemini Pro / Gemini Ultra
  - 开源模型：LLaVA, Qwen-VL, InternVL 等
  - 每个 task × 每个 difficulty level 至少 30 个样本

- [ ] **Enclosure (Holes) 列实现**
  - 基于已有定义（"boundary/contour divides inside and outside"）
  - 设计 hole detection 的 3D 场景生成
  - 实现 2D/3D enclosure 判断任务
  - 生成数据集 + VLM 评测 prompt

- [ ] **开始论文撰写**
  - 确定投稿目标（NeurIPS? ICLR? CVPR? ACL?）
  - 撰写 Abstract + Introduction
  - 撰写 Related Work（基于已收集的 38+ 篇文献）
  - 撰写 Taxonomy 章节

### P2 — 中期（4-6周内）

- [ ] **实现 Continuity 列**
  - Maze 可达性场景（3D 迷宫，判断 A→B 是否连通）
  - Möbius strip 相关任务
  - 对应 VLM prompt 设计

- [ ] **实现 Separation 列**
  - Shape/Object 分离检测
  - 判断物体是分离/相切/相交
  - 对应 VLM prompt 设计

- [ ] **实现 Order 列**
  - origami 折叠顺序判断（同面 track, 异面 track）
  - beam string 空间序描述与比较
  - 对应 VLM prompt 设计

- [ ] **整理文献引用**
  - 38+ 篇论文转为 BibTeX 格式
  - 完善 Related Work 章节

- [ ] **设计统一评估框架**
  - 覆盖全部 5 列的 VLM 评估 pipeline
  - 统一的 difficulty control 接口
  - 统一的结果分析和可视化

### P3 — 长期（6-8周内）

- [ ] **Intervention/Planning 任务实现**
  - Pipe connection env（Continuity）
  - One stroke color grouping（Separation）
  - Hanoi Tower（Order）
  - Laser game（Enclosure）
  - Untangle env（Knot）

- [ ] **完成论文全文**
  - Method 章节
  - Experiments & Results 章节
  - Analysis & Discussion
  - 图表和 ablation study

- [ ] **数据集发布准备**
  - 清理和标准化所有数据格式
  - 编写数据集文档
  - 准备开源 release

---

## 五、关键风险 & 建议

### 风险 1：范围过大

**问题**：5 列 × 2 行 = 10 个任务域，全部实现工作量巨大。

**建议**：
- **方案 A（聚焦型）**：先以 Knot 列为核心发一篇 paper，其他 4 列作为 taxonomy 框架展望。这样代码和数据集基本就绪，只需修复问题 + 扩大规模 + 多模型测试。
- **方案 B（全面型）**：5 列全做，每列至少一个 Static Perception 任务。工作量大但 contribution 更完整。
- 推荐 **方案 A** 作为第一篇论文，方案 B 作为后续扩展。

### 风险 2：数据集规模不足

**问题**：当前 71 张图远远不够支撑 benchmark 论文的统计意义。

**建议**：
- 利用已有的 `invariance-generator.js` 批量生成
- 目标至少 500 张（含 pair），理想 1000+
- 确保 easy/medium/hard 各 1/3 均衡

### 风险 3：VLM 评测设计缺陷

**问题**：T03/T05/T08/T09 四个 task 在初测中全部 0%，不是模型差而是 prompt/label 有 bug。

**建议**：
- 这是 **最高优先级**的修复项
- 修复后先用 GPT-4o 小规模验证，确认 prompt 合理再大规模跑

### 风险 4：论文定位不清

**问题**：是投 CV 会议（CVPR/ECCV）、AI 会议（NeurIPS/ICLR）还是 NLP 会议（ACL/EMNLP）？定位影响写作方向。

**建议**：
- 如果强调 **视觉拓扑推理能力评测** → NeurIPS Datasets & Benchmarks track 或 ICLR
- 如果强调 **多模态理解** → CVPR/ECCV
- 尽快确定目标，反推 deadline 排期

### 风险 5：代码未提交

**问题**：Git 状态显示多个文件修改/删除/新增未提交。

**建议**：
- 清理工作区，提交当前稳定状态
- 移除 `script/test.bash` 中暴露的 API key

---

## 六、技术架构

```
pair_knot_dataset/
├── knot_gallery.html          # 主交互式 3D 查看器 + 数据集生成器
├── vlm_benchmark.py           # VLM 15-task 评测脚本 (789行)
├── vlm_eval.py                # 轻量评测脚本 (307行)
├── CURSOR_PROMPT_VLM_EVAL.md  # 评测系统设计规范 (中文)
├── 3d-topology-benchmark.pdf  # 周会 slides (253页)
├── script/
│   ├── test.bash              # 测试运行脚本
│   ├── run.bash               # HTTP server 启动
│   └── results.json           # 测试结果
├── src/
│   ├── unified-gallery.js     # 主 gallery + 数据集生成器 (1986行)
│   ├── difficulty-controller.js  # 难度评分系统 (220行)
│   ├── invariance-generator.js   # Pair 数据集生成 (813行)
│   ├── invariance-renderer.js    # PNG 渲染引擎 (1192行)
│   ├── rope-renderer-unified.js  # 3D 绳索网格生成 (385行)
│   ├── centerline-pipeline.js    # 曲线处理管线 (240行)
│   ├── gauss-code-generator.js   # Gauss code 解析器 (869行)
│   └── knot-type-registry.js     # 拓扑类型定义 (475行)
└── dataset/
    ├── knot_*.json            # 10 个元数据文件
    └── knot_*.png             # 71 张渲染图片
```

**技术栈：**
- 前端渲染：Three.js + ES6 模块 + HTML5 Canvas
- 评测脚本：Python 3 + OpenAI API + Anthropic API
- 数据格式：JSON 元数据 + PNG 图片
