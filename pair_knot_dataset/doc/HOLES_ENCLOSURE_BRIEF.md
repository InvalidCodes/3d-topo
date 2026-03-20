# Holes ⊂ Enclosure：论证逻辑链 & 文献清单

## 论证逻辑链

### 问题

Piaget 1956 定义了 **enclosure**（inside/outside/between），但**未定义 holes**。我们需要论证将 holes 归入 Enclosure 列的合理性。

---

### Step 1 — Piaget 定义 enclosure = inside/outside/between 感知

**来源**：Piaget & Inhelder 1956, *The Child's Conception of Space*, Chapter 1, Section 4 "Enclosure / Surrounding"

**原文（完整段落）**：

> "A fourth spatial relationship present in elementary perception is that of enclosure (or surrounding). In an organized series ABC, the element B is perceived as being 'between' A and C which form an enclosure along one dimension. On a surface one element may be perceived as surrounded by others; such as the nose framed by the rest of the face. **In three dimensions enclosure takes the form of the relation of 'insideness', as in the case of an object in a closed box.** But it is clear that although the relationship of 'enclosure' is originally a perceptual given, no sooner do the factors of 'proximity', 'separation' and various types of 'order' become organized, than 'enclosure' undergoes a complex process of evolution, particularly as regards three dimensions."

Piaget 的 enclosure 概念包含三个层次：
- **1D**: between-ness（B 在 A 和 C 之间）
- **2D**: surrounded-ness（鼻子被脸包围）
- **3D**: insideness（物体在盒子里）

Piaget 还举了一个关于 encirclement 的例子：

> "Again, still about the age of one year, when the child attempts to replace a ring which encircles a stick, he contents himself with pushing it against the stick as if encirclement could be brought about simply by contact and did not involve the act of passing the ring over the stick."

这说明 Piaget 的 enclosure 概念不仅是静态的"被包围"，还涉及**拓扑上的穿越关系**（ring 必须"穿过" stick 才能 encircle）。

**Piaget 没说什么**：Piaget 未提及 "holes"。他的 enclosure 讨论聚焦于 inside/outside/between 的感知能力，不涉及 holes 作为拓扑对象的存在。

---

### Step 2 — 拓扑学事实：hole 的数学本质就是创造 inside/outside 边界的结构

**来源**：标准拓扑学教材（非争议性数学事实）

- **Jordan Curve Theorem**：平面上的任何简单闭合曲线将平面分为恰好两个区域——interior (inside) 和 exterior (outside)。这正是 Piaget enclosure 的数学形式化。
- **Betti Number**：拓扑空间的 Betti number B₁ 计算 1 维 holes 的数量。一个 disk 有 B₁=0（无 hole），一个 annulus/ring 有 B₁=1（一个 hole）。
- **关键联系**：hole 在拓扑学中的定义就是**一个闭合边界所创造的 inside/outside 区分**。每多一个 hole，就多一组 inside/outside 边界。

这一步建立了数学层面的等价：**enclosure (inside/outside) 和 holes 是同一拓扑概念的两面**。

---

### Step 3 — Chen 1982/2005：人类视觉系统将 holes 和 inside/outside 作为同一类拓扑不变量感知

**来源 A**：Chen L. 1982. *Topological structure in visual perception*. Science, 218(4573), 699-700.

**原文 abstract**：

> "Three experiments on tachistoscopic perception of visual stimuli demonstrate that the visual system is sensitive to global topological properties. The results indicate that extraction of global topological properties is a basic factor in perceptual organization."

**来源 B**：Chen L. 2005. *The topological approach to perceptual organization*. Visual Cognition, 12(4), 553-637. 以及引用该理论的 Zhou et al. 2021 (JOV).

**原文（完整段落，来自 Zhou et al. 2021 引述 Chen 理论）**：

> "Topological transformations can be imagined as an arbitrary 'rubber-sheet' distortion, in which neither breaks nor fusions can happen, but changes in shape of the 'rubber-sheet' may be. Under this kind of 'rubber-sheet' distortion, **connectivity, the number of holes, and the inside/outside relationship remain invariant**. Hence, they are topological invariants, while local features altered over such shape distortion, such as orientation, size, and shape, are not."

Chen 还论述了 holes 在感知中的基础性作用：

> "Chen and his colleagues' research indicates **the general and abstract nature of holes in the formation of new objects**, independent of detailed geometric or physical properties."

**实验设计中对 topological change 的定义**：

在 Chen 系列实验中，"topological change" 被操作化定义为 holes 数量的变化：
- Solid figure → hollow figure（增加一个 hole）
- Disk → ring（增加一个 hole）
- 一个 hole → 两个 holes

而 "non-topological change" 是不改变 holes 数量的形状变化（如 disk → square）。

**这一步的论证价值**：

Chen 的工作证明了人类视觉系统对三个拓扑不变量敏感：connectivity, number of holes, inside/outside relationship。这三者被**并列罗列为同一类感知能力**——拓扑感知。这意味着感知 holes 和感知 inside/outside 在认知机制上属于同一个系统。

**Chen 没说什么**：Chen 没有论述这三个不变量之间的逻辑派生关系（即没有说 "holes derive from inside/outside" 或反过来）。他将它们作为 co-equal properties 呈现。

---

### Step 4 — Casati & Varzi 1994：holes 的哲学形式化定义本身建立在 enclosure 之上

**来源 A**：Casati R. & Varzi A.C. 1994. *Holes and Other Superficialities*. MIT Press.

**来源 B**：Casati & Varzi. "Holes". Stanford Encyclopedia of Philosophy.

**来源 C**：Casati R. & Varzi A.C. 1996. *Reasoning about Space: The Hole Story*. Logic and Logical Philosophy, 4, 3-39.

**Holes 的本体论特征（SEP 原文）**：

> "Holes are **topologically** assorted. Superficial **hollows** are distinguished from internal **cavities**; straight perforations are distinguished from **knotted tunnels**."

Casati & Varzi 将 holes 分为三类：
- **Hollows** — 表面凹坑（如碗的内部）
- **Tunnels/Perforations** — 贯穿孔（如甜甜圈的孔）
- **Cavities** — 内部空腔（如气泡）

**Holes 与 enclosure 的直接关联（SEP 原文）**：

Casati & Varzi 在构建 holes 形式化理论时，明确定义了 **"spatial enclosure"** 作为辅助拓扑概念（auxiliary topological notion），与 self-connectedness, spatial overlapping, intersection, external connection, interior parthood, tangential enclosure 等概念并列。

**也就是说：要形式化定义 holes，你首先需要定义 enclosure。Holes 的理论基础包含 enclosure。**

**Holes 的五大本体论特征（SEP 原文）**：

1. **Ontological parasitism**: "Holes are always *in* something and cannot exist in isolation." — holes 依赖于 host 存在
2. **Fillability**: "You don't necessarily destroy a hole by filling it up." — 填充不消灭 hole
3. **Locational graciousness**: "When you fill or put something in a hole, the hole does not squeeze to the side; it shares its location with its guest." — hole 与填充物共享位置
4. **Mereological structure**: "Holes have parts and can bear part-whole relations to one another." — holes 有部分-整体结构
5. **Topological assortment**: 不同类型的 holes 存在

**Holes 与 Knots 的连接**：

Casati & Varzi 还指出 holes 可以 "**branching or knotted together**"，直接将 holes 与 knot theory 连接。这对我们的 taxonomy 特别有价值——它说明 Enclosure 列（holes）和 Knot 列虽然分开，但在更深层次有拓扑联系。

**关于感知（SEP 原文）**：

> "Infants and adults are able to perceive, count, and track holes just as easily as they perceive, count, and track paradigm material objects such as cookies and tins."

这与 Chen 的拓扑感知理论相互印证：holes 是人类视觉系统的基础感知对象。

**这一步的论证价值**：

这是整个论证链中**最强的一步**。Casati & Varzi 不是在讨论 Piaget，也不是在讨论感知，而是在做 holes 的哲学形式化——但他们的形式化体系**本身就将 spatial enclosure 作为基础概念**来定义 holes。这直接说明：在最严格的哲学分析中，holes 的定义依赖于 enclosure。

---

### Step 5 — 实验证据：人类感知 hole 的方式 = 判定 enclosed region 的方式

**来源 A**：Nelson R. & Palmer S.E. 2001. *Of Holes and Wholes: The Perception of Surrounded Regions*. Perception, 30(10), 1213-1226.

**原文 abstract**：

> "Fully enclosed regions in a two-dimensional image can often be perceived either as an object in front of a surface or as a hole through a surface."

Nelson & Palmer 发现三类因素决定一个 enclosed region 被感知为 object 还是 hole：
1. **Depth factors** — 表明 enclosed region 位于 surrounding surface 之后
2. **Grouping factors** — 将 enclosed region 与外部区域关联
3. **Figural factors** — 决定 enclosed region 被感知为 figure 还是 ground

**核心洞察**：hole 和 object 都是 **enclosed region** 的两种感知解读。Hole 不是独立于 enclosure 的概念——它是 enclosed region 在特定深度/分组/图形条件下的特殊感知状态。

**来源 B**：Bertamini M. & Croucher C.J. 2003. *The shape of holes*. Cognition, 87(1), 33-54.

**核心发现**：

> "The shape of holes can be recognized as accurately as the shape of objects, yet the area enclosed by a hole is a background region."

这构成了一个 paradox：hole 的区域是 background，而 background 通常被认为没有 shape。那么 hole 的 shape 从哪里来？

Bertamini & Croucher 的回答：

> "The contour bounding a hole is automatically assigned to the **surrounding object**."

即：hole 的形状不来自 hole 本身，而来自**包围（enclosing）它的物体**。观察者判断 convex vertices 时 object 更快，但当同样的 contour 呈现为 hole 时，这个优势反转——说明 hole 的表征与 figure 的表征质性不同，hole 的感知必须通过 enclosing object 中介。

**这一步的论证价值**：

实验层面的双重证据：
- Nelson & Palmer：hole 是 enclosed region 的一种感知模式
- Bertamini：hole 的认知加工依赖于 enclosing object

两者都表明 **holes 的感知机制本质上就是 enclosure 感知的一种形式**。

---

### 结论（我们的论证贡献）

综合以上五步：

| Step | 来源 | 论证 |
|------|------|------|
| 1 | Piaget 1956 | Enclosure = inside/outside/between 的感知能力 |
| 2 | 拓扑学 | Hole 的数学本质 = 创造 inside/outside 边界的结构 |
| 3 | Chen 1982/2005 | 人类视觉系统将 holes 和 inside/outside 作为同一类拓扑不变量感知 |
| 4 | Casati & Varzi 1994 | Holes 的哲学形式化定义本身建立在 spatial enclosure 之上 |
| 5 | Nelson 2001, Bertamini 2003 | 实验证明 hole 感知 = enclosed region 的判定 |

**我们的论证**：

> "Piaget (1956) defined enclosure as the perceptual ability to distinguish inside from outside and to recognize between-ness induced by boundaries. In topology, a hole is precisely the structure that creates and quantifies such inside/outside distinctions — each hole introduces a new boundary separating interior from exterior. Chen (1982, 2005) demonstrated that the human visual system is sensitive to both the number of holes and inside/outside relationships as co-equal topological invariants, suggesting they are processed by the same perceptual mechanism. Casati and Varzi (1994) further established that the formal ontology of holes is built upon the concept of spatial enclosure. Experimental work confirms that perceiving a hole is fundamentally an act of interpreting an enclosed region (Nelson & Palmer, 2001) through its enclosing object (Bertamini & Croucher, 2003). We therefore argue that holes — as topological structures that create, embody, and are defined by inside/outside distinctions — naturally fall under Piaget's enclosure category in our taxonomy."

### 学术诚实声明

| 谁 | 说了什么 | 没说什么 |
|----|---------|---------|
| Piaget | Enclosure = insideness, between-ness, surrounding | 未提及 holes |
| Chen | Holes 和 inside/outside 是同级拓扑不变量 | 未论述二者的派生关系 |
| Casati & Varzi | Holes 的形式化需要 spatial enclosure 概念 | 未引用 Piaget |
| Bertamini | Hole 感知依赖 enclosing object | 未引用 Piaget |
| **我们** | **Holes 是 Piaget enclosure 在拓扑学中的自然量化表达** | **这是我们的 bridging argument** |

---

## 全部参考文献清单

### 核心理论链

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 1 | Piaget & Inhelder 1956. *The Child's Conception of Space* | 定义 5 种拓扑分类（proximity, separation, order, enclosure, continuity）作为儿童空间认知基础 | [Archive](https://archive.org/details/childsconception0000piag_e5l4) |
| 2 | Strohecker 1991. *Why Knot?* (MIT PhD Thesis) | Piaget 的拓扑分类如何进入 knot 思维，knot 是 number + topology 的 "mother structures" 交汇 | [HAL](https://hal.archives-ouvertes.fr/ijn_00911999) |
| 3 | Martin 1976. *An Analysis of Some of Piaget's Topological Tasks from a Mathematical Point of View* | 从数学角度审视 Piaget 用词：接受 Order，批评 Proximity/Continuity 定义模糊 | [NCTM](https://pubs.nctm.org) |

### Chen Lin — 拓扑感知

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 4 | Chen 1982. *Topological structure in visual perception*. Science 218, 699-700 | 首次证明人类视觉系统对全局拓扑性质（connectivity, holes, inside/outside）敏感 | [Science](https://www.science.org/doi/10.1126/science.7134969) |
| 5 | Chen 2005. *The topological approach to perceptual organization*. Visual Cognition 12(4), 553-637 | 系统阐述拓扑感知理论：全局拓扑感知优先于其他特征 | [T&F](https://www.tandfonline.com/doi/abs/10.1080/13506280444000256) |
| 6 | Zhou et al. 2021. *Topological dominance in peripheral vision*. JOV | 周边视觉中拓扑变化检测（含 holes 数量）优于中央视觉 | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8479572/) |
| 7 | 2021. *Late Development of Early Visual Perception: No Topology-Priority Until Age 10* | 拓扑感知优先性在 10 岁前不完全成熟 | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8518037/) |
| 8 | 2025. *Temporal order judgment reveals visual processing priorities for topological structure* | TOJ 范式证明拓扑变化（含 holes）有处理时间优先性 | [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002772500143X) |
| 9 | 1983. *Topological perception: Holes in an experiment* | 对 Chen 1982 的实验方法质疑与讨论 | [Springer](https://link.springer.com/content/pdf/10.3758/BF03202856.pdf) |

### Casati & Varzi — Holes 哲学本体论

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 10 | Casati & Varzi 1994. *Holes and Other Superficialities*. MIT Press | Holes 本体论：三类 holes（hollows/tunnels/cavities），用 spatial enclosure 定义 holes，holes 可 knotted | [MIT Press](https://mitpress.mit.edu/9780262531337/holes-and-other-superficialities/) |
| 11 | Casati & Varzi 1996. *Reasoning about Space: The Hole Story* | Holes 涉及 ontology + mereology + topology + morphology 四领域交叉 | [PDF](http://www.columbia.edu/~av72/papers/Llp_1996.pdf) |
| 12 | Casati & Varzi. *Holes* (Stanford Encyclopedia of Philosophy) | 权威百科：holes 是 topologically assorted，straight perforations vs knotted tunnels | [SEP](https://plato.stanford.edu/entries/holes/) |
| 13 | Casati 2013. *Knowledge of knots: shapes in action* | 评估 "拓扑感知" 研究，讨论 knot 认知的多维度（tying, representation, pictures） | [PDF](https://ceur-ws.org/Vol-1007/invited1.pdf) |

### Holes 视觉感知实验

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 14 | Nelson & Palmer 2001. *Of Holes and Wholes: The Perception of Surrounded Regions*. Perception 30(10) | enclosed region 被感知为 object 或 hole 取决于 depth/grouping/figural factors | [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p3148) |
| 15 | Bertamini & Croucher 2003. *The shape of holes*. Cognition 87(1) | hole 形状通过 enclosing object 间接感知，hole 表征与 figure 表征质性不同 | [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002770200183X) |
| 16 | Bertamini & Helmy 2012. *The shape of a hole and that of the surface-with-hole* | hole 与含 hole 表面的形状感知差异 | [PDF](https://bertamini.org/lab/Publications/BertaminiHelmy2012.pdf) |
| 17 | Nelson et al. 2014. *The Shape of a Hole is Perceived as the Shape of its Interior*. Perception 43(11) | hole 的形状 = 其内部区域的形状 | [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p7629) |
| 18 | 2008. *Holes, objects, and the left hemisphere*. PNAS | 大脑左半球处理 holes 和 objects 有差异 | [PNAS](https://www.pnas.org/doi/10.1073/pnas.0710631105) |

### Holes 空间推理

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 19 | Santos & Cabalar 2007. *Holes, Knots and Shapes: A Spatial Ontology of a Puzzle*. AAAI | 将 holes 和 knots 放在同一空间本体论框架，定义物体穿过 hole 的条件 | [AAAI](https://aaai.org/papers/0025-SS07-05-025-holes-knots-and-shapes-a-spatial-ontology-of-a-puzzle/) |
| 20 | 1993. *Spatial reasoning in a holey world*. Springer LNCS | 带 holes 的 region 需要 23 种拓扑关系（vs 无 hole 的 8 种） | [Springer](https://link.springer.com/chapter/10.1007/3-540-57292-9_70) |
| 21 | 2007. *Spatial Reasoning with a Hole*. U of Maine | 形式化带 hole 的空间推理 | [Springer](https://link.springer.com/chapter/10.1007/978-3-540-74788-8_19) |
| 22 | 2013. *Kinds of Full Physical Containment*. Springer | containment 分类学，区分 hole-containment 和 enclosure-containment | [Springer](https://link.springer.com/chapter/10.1007/978-3-319-01790-7_22) |
| 23 | Casati & Varzi 2004. *Spatial Reasoning and Ontology: Parts, Wholes, and Locations* | Mereotopology 中 contact, connection, boundaries, holes 的形式化 | [Springer](https://link.springer.com/chapter/10.1007/978-1-4020-5587-4_15) |

### Knot 独立分类支撑

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 24 | Firestone 2024. *Tangled Physics: Knots Strain Intuitive Physical Reasoning*. Open Mind | 证明 knot 推理超出人类通用物理推理能力范围，knot 是独立认知维度 | [PDF](https://perception.jhu.edu/files/PDFs/24_Knots/CroomFirestone_Knots_2024_OpenMind.pdf) |
| 25 | 2019. *The knowledge of knots: an interdisciplinary literature review*. Spatial Cognition & Computation 19(4) | Knot 知识跨学科综述，区分 hitches/braids/knots 三种 entanglement | [T&F](https://www.tandfonline.com/doi/full/10.1080/13875868.2019.1667998) |
| 26 | Maynard & Greenfield 2003 | 沿用 Piaget "knots tasks" 作为实验工具，证明范式仍活跃 | — |

### 最新综述

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 27 | Yousif & Brannon 2025. *Perceiving Topological Relations* | 最新综述，基于 Piaget 论证拓扑不变量（holes, connectivity, enclosure）是视觉感知基础 | [PDF](https://samiryanyousif.org/docs/YousifBrannon-'25-SeeingTopo.pdf) |

### Piaget 理论接受度

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 28 | Lovell 1959. *A follow-up study of Piaget & Inhelder*. British J of Educational Psychology | 追随 Piaget，呼吁更多实验验证 | [Wiley](https://bpspsychub.onlinelibrary.wiley.com/doi/abs/10.1111/j.2044-8279.1959.tb01484.x) |
| 29 | Darke 1982. *Review article on topological primacy* | Piaget 的拓扑优先性被 many researchers 支持，但有对立观点 | — |
| 30 | Egenhofer & Shariff 1998 | Motivation 中列出 Piaget 作为 "most fundamental topological properties" 证据 | — |
| 31 | Kapadia 1974 | 反对 Piaget：儿童初始空间概念不一定是拓扑的 | — |
| 32 | Thom 2021 | 儿童空间发展不一定按 topology → projective → Euclidean 固定顺序 | — |

### 其他相关

| # | 文献 | 一句话概括 | Link |
|---|------|---------|------|
| 33 | Strohecker 1996. *Understanding topological relationships through comparisons of similar knots* | 通过比较相似 knots 来理解拓扑关系 | — |
| 34 | *A qualitative spatial representation of string loops as holes* | 将 string loops 表征为 holes 的定性空间方法 | — |
| 35 | *Children's Understanding of Topological Relations* 2024. PMC | 儿童拓扑关系理解的最新研究 | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11964115/) |
| 36 | *Learning topology: engaging spatial cognition through adpositional play*. MIT 2016 | 通过介词游戏发展拓扑空间认知 | [MIT DSpace](https://dspace.mit.edu/handle/1721.1/103425) |
