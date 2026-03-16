# 3D Topology Benchmark — 文献综述整理

> 整理日期：2026-03-15
> 用途：支撑论文 Taxonomy 设计，特别是 Holes ⊂ Enclosure 的论证

---

## 一、核心文献链 (Piaget → Strohecker → 本文)

### 1.1 Piaget & Inhelder 1956

- **Title**: The Child's Conception of Space
- **Publisher**: Routledge & Kegan Paul, London (原版法语 1948)
- **核心贡献**: 定义了 5 种拓扑空间关系作为儿童空间认知的基础
  - **Proximity** — closeness groups elements before any metric distance exists
  - **Separation** — distinguishing adjacent elements as distinct units
  - **Order** — the "before/after" arrangement along a path or sequence
  - **Enclosure / Surrounding** — between-ness and inside/outside induced by boundaries
  - **Continuity** — an unbroken whole: no gaps, no tears under deformation
- **关于 Enclosure 的原文**: "In three dimensions enclosure takes the form of the relation of 'insideness', as in the case of an object in a closed box."
- **关于 Continuity 的原文 (P149)**: "the development of the idea of continuity... reconciles the opposing notions of proximity and separation within a global, unified concept of continuity"
- **关于 Knots**: Piaget 将 knots 归入 Enclosure/Surrounding，不是 Order
- **注意**: Piaget **未定义 holes**，仅定义了 enclosure (inside/outside)
- **引用量**: 10,000+ on Google Scholar
- **Link**: [Internet Archive](https://archive.org/details/childsconception0000piag_e5l4)

### 1.2 Strohecker 1991 / 1996

- **Title (1991)**: Why Knot? (PhD Thesis, MIT Media Lab)
- **Title (1996)**: Understanding Topological Relationships through Comparisons of Similar Knots
- **核心贡献**:
  1. Knot 是 Piaget "mother structures" (number + topology) 的交汇点
  2. 除了 Piaget 5 种拓扑分类，儿童还运用 **set & group** 概念
  3. Piaget 从 knot 领域提取的原则适用于其他领域（通用性）
- **关键引文**: "Piaget and Inhelder describe the epistemological structures of topology (such as proximity, continuity, connection, and separation), order (such as seriation), and classification, which in combination contribute to the emergence of mathematical thinking. The thesis shows how these deep structures enter into thinking about knots."
- **Link**: [HAL Archives](https://hal.archives-ouvertes.fr/ijn_00911999)

### 1.3 Martin 1976

- **Title**: An Analysis of Some of Piaget's Topological Tasks from a Mathematical Point of View
- **Journal**: Journal for Research in Mathematics Education
- **核心贡献**: 从数学角度审视 Piaget 的拓扑分类
  - Separation: 提出应叫 "disjoint" 而非 "separation"
  - Proximity: 批评 Piaget 定义不够清晰
  - Order: 接受 Piaget 的定义为正确
  - Enclosure: 几乎没有批评
  - Continuity: 批评概念模糊，但未提供替代定义
- **关键引文**: "Notions of proximity and separation complement one another in their development."
- **引用量**: 47 citations
- **Link**: [JSTOR](https://pubs.nctm.org)

---

## 二、Holes 与 Enclosure 关系的支撑文献

### 2.1 拓扑感知方向（Chen Lin 系列）

#### Chen L. 1982
- **Title**: Topological structure in visual perception
- **Journal**: Science, 218(4573), 699-700
- **核心贡献**: 首次证明人类视觉系统对全局拓扑性质敏感
- **原文 Abstract**: "Three experiments on tachistoscopic perception of visual stimuli demonstrate that the visual system is sensitive to global topological properties. The results indicate that extraction of global topological properties is a basic factor in perceptual organization."
- **关键列举**: 将 **connectivity, number of holes, inside/outside relationship** 并列为拓扑变换下的不变量
- **注意**: 这三者被并列罗列，Chen **没有论述**它们之间的逻辑派生关系
- **对本文的价值**: 证明 "number of holes" 和 "inside/outside" 在感知层面属于同一类能力（拓扑感知），可以支撑将 holes 归入 Piaget 的 enclosure
- **Link**: [Science](https://www.science.org/doi/10.1126/science.7134969) | [PubMed](https://pubmed.ncbi.nlm.nih.gov/7134969/)

#### Chen L. 2005
- **Title**: The topological approach to perceptual organization
- **Journal**: Visual Cognition, 12(4), 553-637
- **核心贡献**: 系统阐述拓扑感知理论
  - 视觉形式感知的 primitives 是不同结构稳定性层次的几何不变量
  - 全局拓扑感知优先于其他特征属性的感知
- **关键原文**: "Under this kind of 'rubber-sheet' distortion, connectivity, the number of holes, and the inside/outside relationship remain invariant."
- **对本文的价值**: 进一步强化了 holes 与 inside/outside 在拓扑感知中的同级地位
- **Link**: [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1080/13506280444000256)

#### 相关实验论文

| 论文 | 年份 | 核心发现 | Link |
|------|------|---------|------|
| "Topological perception: Holes in an experiment" | 1983 | 对 Chen 1982 的质疑和后续讨论 | [Springer](https://link.springer.com/content/pdf/10.3758/BF03202856.pdf) |
| "Holes in illusory conjunctions" | - | Holes 在错觉性结合中的表现 | [Springer](https://link.springer.com/article/10.3758/BF03214340) |
| "Topological dominance in peripheral vision" | 2021 | 周边视觉中拓扑变化检测（包括 holes 数量变化）优于中央视觉 | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8479572/) |
| "Late Development of Early Visual Perception: No Topology-Priority in Peripheral Vision Until Age 10" | 2021 | 拓扑感知优先性在10岁前不完全成熟 | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8518037/) |
| "Temporal order judgment reveals visual processing priorities for topological structure" | 2025 | TOJ 范式证明拓扑变化（含 holes）有处理优先性 | [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002772500143X) |

### 2.2 Holes 哲学本体论方向（Casati & Varzi 系列）

#### Casati & Varzi 1994
- **Title**: Holes and Other Superficialities
- **Publisher**: MIT Press (Bradford Books)
- **核心贡献**:
  - Holes 的本体论：holes 确实存在，是 immaterial bodies
  - 三种 holes 分类：**hollows（凹坑）, tunnels（隧道）, cavities（空腔）**
  - 定义了 **spatial enclosure** 作为 holes 理论的辅助拓扑概念
  - 指出 holes 可以 "branching or **knotted** together"（直接连接 holes 与 knots）
  - Holes 是 ontologically parasitic（依赖于 host 存在）
  - Holes 是 fillable, mereologically structured, topologically assorted
- **对本文的价值**: **最直接的支撑** —— Casati & Varzi 自己就用 enclosure 来定义 holes 的形式化理论
- **Link**: [MIT Press](https://mitpress.mit.edu/9780262531337/holes-and-other-superficialities/)

#### Casati & Varzi 1996
- **Title**: Reasoning about Space: The Hole Story
- **Journal**: Logic and Logical Philosophy, 4, 3-39
- **核心贡献**: Holes 涉及四个领域的交叉：
  - Ontology: holes are parasitic entities
  - Mereology: holes bear part-whole relations
  - **Topology**: holes are one-piece things located at surfaces of hosts
  - Morphology: holes are fillable
- **Link**: [Columbia PDF](http://www.columbia.edu/~av72/papers/Llp_1996.pdf)

#### Stanford Encyclopedia of Philosophy — Holes
- **Author**: Casati & Varzi (maintained entry)
- **关键引文**: "Holes are **topologically** assorted. Superficial hollows are distinguished from internal cavities; straight perforations are distinguished from **knotted tunnels**."
- **对本文的价值**: 权威哲学百科确认 holes 是拓扑概念，且 holes 可以 knotted
- **Link**: [SEP](https://plato.stanford.edu/entries/holes/)

#### Casati 2013
- **Title**: Knowledge of knots: shapes in action
- **Venue**: Shapes 2.0 Conference, Rio de Janeiro
- **核心贡献**: 评估"拓扑感知"研究结果；讨论 knot 认知的多个维度（tying, representation, pictures, autonomous agents）
- **关键引文**: "Looking beyond knots, people have some sub-personal and personal access to topological equivalences presented visually... But people do not have access to relatively simple topological equivalences."
- **Link**: [CEUR-WS PDF](https://ceur-ws.org/Vol-1007/invited1.pdf)

### 2.3 Holes 视觉感知实验方向

#### Nelson & Palmer 2001
- **Title**: Of Holes and Wholes: The Perception of Surrounded Regions
- **Journal**: Perception, 30(10), 1213-1226
- **核心贡献**: enclosed region 可被感知为 object (figure) 或 hole (ground)
  - 三类因素决定感知结果：depth factors, grouping factors, figural factors
  - 本质上是 inside/outside 的判定问题
- **对本文的价值**: 实验证明 hole 感知 = enclosed region 的 figure/ground 判定 → 直接对应 Piaget 的 enclosure
- **Link**: [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p3148) | [PubMed](https://pubmed.ncbi.nlm.nih.gov/11721823/)

#### Bertamini & Croucher 2003
- **Title**: The shape of holes
- **Journal**: Cognition, 87(1), 33-54
- **核心贡献**: Hole 的形状通过包围它的物体的形状间接感知；hole 的认知表征与同轮廓 figure 的表征质性不同
- **关键发现**: "The shape of a hole is known indirectly via the shape of the object enclosing it"
- **对本文的价值**: Holes 的感知依赖于 **enclosing object** → holes 在认知上是 enclosure 的衍生
- **Link**: [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002770200183X) | [PDF](https://www.bertamini.org/lab/Publications/BertaminiCroucher2003.pdf)

#### Bertamini & Helmy 2012
- **Title**: The shape of a hole and that of the surface-with-hole
- **Link**: [PDF](https://bertamini.org/lab/Publications/BertaminiHelmy2012.pdf)

#### Nelson, Reiss, Gong, Conklin, Parker & Palmer 2014
- **Title**: The Shape of a Hole is Perceived as the Shape of its Interior
- **Journal**: Perception, 43(11)
- **Link**: [SAGE](https://journals.sagepub.com/doi/10.1068/p7629)

#### Holes, Objects, and the Left Hemisphere 2008
- **Journal**: PNAS
- **核心贡献**: 大脑左半球在处理 holes 和 objects 时的差异
- **Link**: [PNAS](https://www.pnas.org/doi/10.1073/pnas.0710631105)

### 2.4 Holes 与空间推理方向

#### Santos & Cabalar 2007
- **Title**: Holes, Knots and Shapes: A Spatial Ontology of a Puzzle
- **Venue**: AAAI Spring Symposium: Logical Formalizations of Commonsense Reasoning
- **核心贡献**:
  - 提出了包含 holes, rigid objects, strings 的空间本体论
  - 定义了物体穿过 holes 的充分条件
  - 使用 Fisherman's Folly 谜题作为动机示例
  - 三种 holes：cavities, hollows, perforating holes (tunnels)
- **对本文的价值**: **直接将 holes 和 knots 放在同一个空间本体论框架中**
- **Link**: [AAAI](https://aaai.org/papers/0025-SS07-05-025-holes-knots-and-shapes-a-spatial-ontology-of-a-puzzle/) | [PDF](https://www.dc.fi.udc.es/~cabalar/KnotsAAAI_commonSenseLetter.pdf)

#### Casati & Varzi 2004 (Spatial Reasoning and Ontology)
- **Title**: Spatial Reasoning and Ontology: Parts, Wholes, and Locations
- **Publisher**: Springer
- **核心贡献**: 空间推理中的 mereotopology，含 contact, connection, boundaries, interiors, holes 的形式化
- **Link**: [Springer](https://link.springer.com/chapter/10.1007/978-1-4020-5587-4_15)

#### "Spatial Reasoning in a Holey World" 1993
- **Publisher**: Springer LNCS
- **核心贡献**: 带 holes 的 region 的拓扑关系推理需要比无 holes 的 region 更复杂的框架（23种拓扑关系 vs. 8种）
- **Link**: [Springer](https://link.springer.com/chapter/10.1007/3-540-57292-9_70)

#### "Spatial Reasoning with a Hole" 2007
- **Authors**: University of Maine
- **核心贡献**: 形式化带 hole 的空间推理
- **Link**: [Springer](https://link.springer.com/chapter/10.1007/978-3-540-74788-8_19)

#### "Kinds of Full Physical Containment" 2013
- **Publisher**: Springer
- **核心贡献**: containment (包含) 的分类学，区分 material container vs. void, detachable vs. attached
  - "Being inside a hole is different from, but associated with, being surrounded by a material container"
- **对本文的价值**: 明确区分了 hole-containment 和 enclosure-containment 的异同
- **Link**: [Springer](https://link.springer.com/chapter/10.1007/978-3-319-01790-7_22)

### 2.5 最新综述

#### Yousif & Brannon 2025
- **Title**: Perceiving Topological Relations
- **核心贡献**: 最新综述，建立在 Piaget 基础上，论证拓扑不变量（包括 holes, connectivity, enclosure）是视觉感知的基础
- **对本文的价值**: 2025 年的综述直接将 Piaget 的拓扑发展理论与当代 holes 感知研究连接
- **Link**: [PDF](https://samiryanyousif.org/docs/YousifBrannon-'25-SeeingTopo.pdf)

---

## 三、Knot 独立分类支撑文献

### 3.1 Firestone 2024
- **Title**: Tangled Physics: Knots Strain Intuitive Physical Reasoning
- **Journal**: Open Mind: Discoveries in Cognitive Science (高质量期刊)
- **Author**: Chaz Firestone (Associate Professor, Johns Hopkins University)
- **核心贡献**: 证明 knot 推理**超出**人类通用物理推理能力的范围
- **关键引文**: "knots do not belong to the same class of phenomena that humans can readily and accurately reason about — in line with our interest in them as a case study of everyday physical phenomena that fall outside the scope of domain-general physical reasoning capacities."
- **对本文的价值**: 支撑 knot 作为独立于其他拓扑能力的第5列
- **Link**: [JHU PDF](https://perception.jhu.edu/files/PDFs/24_Knots/CroomFirestone_Knots_2024_OpenMind.pdf)

### 3.2 "The knowledge of knots: an interdisciplinary literature review" 2019
- **Journal**: Spatial Cognition & Computation, 19(4)
- **核心贡献**: knot 知识的跨学科综述，区分三种 string entanglements: **hitches, braids, knots**
- **Link**: [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/13875868.2019.1667998)

### 3.3 Maynard & Greenfield 2003
- **核心贡献**: 沿用 Piaget "knots tasks" 作为实验工具，证明该范式在现代发展心理学研究中仍然活跃

---

## 四、Piaget 理论接受度相关文献

### 支持 Piaget 的文献

| # | 论文 | 年份 | 要点 |
|---|------|------|------|
| 1 | Lovell - Follow-up study (British Journal of Psychology) | 1959 | 明确追随 Piaget，呼吁更多实验 |
| 2 | Darke - Review article on topological primacy | 1982 | Piaget 被 many researchers 支持 |
| 3 | Egenhofer & Shariff | 1998 | 在 motivation 中列出 Piaget 作为 "most fundamental topological properties" 的证据 |
| 4 | Maynard & Greenfield | 2003 | 沿用 Piaget knot tasks |
| 5 | 2014 psychology paper | 2014 | 引用此书为 seminar work |

### 批评 Piaget 的文献

| # | 论文 | 年份 | 要点 |
|---|------|------|------|
| 1 | Kapadia | 1974 | 反对 Piaget & Inhelder，认为儿童初始空间概念不是拓扑的 |
| 2 | Martin | 1976 | 从数学角度批评 Piaget 用词不精确 |
| 3 | Gravemeijer & Terwel | 2000 | (具体观点待补) |
| 4 | Thom | 2021 | 儿童空间概念发展不一定按 topology → projective → Euclidean 的固定顺序 |

---

## 五、其他已收集但待深入阅读的文献

（来自 slides p.174 的 38 篇文献表格，按主题分类）

### Connectivity 相关
1. A vocabulary of topological and containment relations for a practical biological ontology
2. Formalising bio-spatial knowledge
3. Taxonomies of logically defined qualitative spatial relations
4. Spatial reasoning and ontology: Parts, wholes, and locations
5. Network analysis and entanglement
6. Spatial entities
7. "Qualitative Spatial Representation and Reasoning" Cohn Renz 2006
8. A taxonomy on geometric and topological models

### Enclosure 相关
9. Entanglement classification from a topological perspective
10. Holes, Knots and Shapes: A Spatial Ontology of a Puzzle (Santos & Cabalar 2007)
11. Grid homology for knots and links
12. Knots and links in spatial graphs: a survey
13. Knots and links in spatial graphs

### Holes 相关
14. An investigation of actions, change, space within a hole-loop dichotomy
15. Kinds of full physical containment

### Entanglement 相关
16. Investigation of Misconceptions and Mental Models of Mathematics Major Students About Topological Concepts

### 发展心理学相关
17. Topological schemas of cognitive maps and spatial learning
18. Spatial reasoning in a holey world
19. A critical examination of Piaget-Inhelder's view on topology
20. An analysis of some of Piaget's topological tasks from a mathematical point of view
21. The development of spatial cognition: On topological and Euclidean representation
22. A test with selected topological properties of Piaget's hypothesis
23. Geometry and spatial reasoning
24. Development of spatial recognition in preschool children
25. Spatial concepts and young children
26. Early Child mathematical learning
27. A follow-up study of Piaget and Inhelder on the child's conception of space
28. Primitive Concepts of the Natural World
29. Analysis of the development of children's spatial reference systems
30. Framing holes within a loop hierarchy
31. Understanding topological relationships through comparisons of similar knots
32. Spatial information theory meets spatial thinking: is topology the Rosetta Stone of spatio-temporal Cognition?
33. From natural geometry to spatial cognition
34. The knowledge of knots: an interdisciplinary literature review
35. An investigation of actions, change, space within a hole-loop dichotomy
36. A qualitative spatial representation of string loops as holes

---

## 六、论证路线总结

### 最终论证逻辑（Holes ⊂ Enclosure）

```
A. 数学层面（拓扑学事实）：
   Hole = 创造 inside/outside 边界的拓扑结构 (Jordan Curve Theorem)

B. 感知层面（Chen 1982/2005）：
   Chen 将 "number of holes" 和 "inside/outside relationship"
   并列为人类视觉系统敏感的核心拓扑不变量
   → 两者在感知机制上属于同一类能力

C. 哲学层面（Casati & Varzi 1994）：
   Casati & Varzi 在 holes 的形式化理论中，
   明确使用 "spatial enclosure" 作为辅助拓扑概念来定义 holes
   → Holes 的定义本身依赖 enclosure 概念

D. 实验层面（Nelson & Palmer 2001, Bertamini 2003）：
   Hole 的感知 = enclosed region 的 figure/ground 判定
   Hole 的形状 = enclosing object 的形状的间接反映
   → Holes 的认知加工依赖于 enclosure 感知

E. 发展层面（Piaget 1956）：
   Piaget 定义 enclosure = 感知 inside/outside/between 的能力

结论（本文的论证贡献）：
   Piaget 的 enclosure 概念在拓扑学中的自然量化指标就是 holes
   (holes 数量、holes 类型、holes 的 inside/outside 判定)
   因此将 holes 归入 Enclosure 列是有充分理论依据的
```

### 需要注意的学术诚实问题

1. **Piaget 本人未讨论 holes** — 不能声称 "Piaget defined holes"
2. **Chen 将 holes 和 inside/outside 并列，但未论述二者的派生关系** — 不能声称 "Chen proved holes derive from enclosure"
3. **Casati & Varzi 用 enclosure 定义 holes** — 这是最直接的支撑，但他们的工作是哲学本体论，不是心理学
4. **从 Piaget enclosure → holes 的映射是本文的学术贡献** — 应在论文中明确标示为 "we argue that..." 而非 "it has been shown that..."
