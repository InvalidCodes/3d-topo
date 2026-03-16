# Holes ⊂ Enclosure — 文献速查表

---

## 核心论证链（3步完成逻辑闭环）

|  | 论点 | 来源 |  | Link |
|------|------|------|------|------|
| 1 | Enclosure = inside/outside | Piaget & Inhelder 1956. *The Child's Conception of Space* | Piaget 定义 enclosure 为感知 inside/outside/between 的能力，是5种拓扑基元之一 | https://archive.org/details/childsconception0000piag_e5l4 |
| 2 | Hole = 创造 inside/outside 边界的拓扑结构 | Hatcher 2002. *Algebraic Topology*, Ch.2 (homology) + §2.B (Jordan Curve Thm) | 数学事实：hole由闭合边界的interior/exterior区分定义，每多一个hole就多一组inside/outside边界 | https://pi.math.cornell.edu/~hatcher/AT/AT.pdf |
| 2' | （同上，Jordan Curve Theorem 的经典来源） | Munkres 2000. *Topology* (2nd ed.), Ch.10 §63 | Jordan Curve Theorem：简单闭合曲线将平面分为恰好两个区域（interior + exterior） | https://www.pearson.com/en-us/subject-catalog/p/topology-classic-version/P200000006299/9780137848669 |
| 3 | 人类视觉系统对 holes 和 inside/outside 同等敏感 | Chen 1982. *Topological structure in visual perception*. Science 218, 699-700 | 首次证明人类视觉系统对 connectivity, number of holes, inside/outside relationship 三个拓扑不变量敏感 | [Science](https://www.science.org/doi/10.1126/science.7134969) |

**结论**：Piaget的enclosure（Step 1）在数学上就是hole创造的inside/outside结构（Step 2），Chen实验证明人类确实将两者作为同一类拓扑能力感知（Step 3）。因此把 hole detection 归入 Enclosure 列是 operationalization 决策，有数学和实验支撑。

---

## 补充支撑文献

| # | 文献 | 一句话 | 与核心链的关系 | Link |
|---|------|------|------------|------|
| 1 | Chen 2005. *The topological approach to perceptual organization*. Visual Cognition 12(4) | 系统阐述拓扑感知理论，将 holes 与 inside/outside 并列为同级不变量 | Step 3 的扩展版 | [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1080/13506280444000256) |
| 2 | Nelson & Palmer 2001. *Of Holes and Wholes*. Perception 30(10) | hole 和 object 都是 enclosed region 的两种感知解读 | 实验证据：hole感知 = enclosure感知 | [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p3148) |
| 3 | Bertamini & Croucher 2003. *The shape of holes*. Cognition 87(1) | hole 的形状通过 enclosing object 间接感知 | 实验证据：hole认知依赖enclosing object | [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002770200183X) |
| 4 | Casati & Varzi 1994. *Holes and Other Superficialities*. MIT Press | holes 本体论：hollows/tunnels/cavities 三类，holes 可以 knotted | 哲学旁证（非核心链） | [MIT Press](https://mitpress.mit.edu/9780262531337/holes-and-other-superficialities/) |
| 5 | Casati & Varzi 1996. *Reasoning about Space: The Hole Story* | holes 的 mereotopology 形式化 | 哲学旁证（非核心链） | [PDF](http://www.columbia.edu/~av72/papers/Llp_1996.pdf) |

---

## Knot 独立分类支撑

| # | 文献 | 一句话 | Link |
|---|------|------|------|
| 1 | Strohecker 1991. *Why Knot?* (MIT PhD Thesis) | Piaget 的拓扑分类如何进入 knot 思维 | [HAL](https://hal.archives-ouvertes.fr/ijn_00911999) |
| 2 | Firestone 2024. *Tangled Physics*. Open Mind | knot 推理超出人类通用物理推理能力，是独立认知维度 | [PDF](https://perception.jhu.edu/files/PDFs/24_Knots/CroomFirestone_Knots_2024_OpenMind.pdf) |

---

## 学术诚实备注

| 谁 | 说了什么 | 没说什么 |
|----|---------|---------|
| Piaget 1956 | Enclosure = insideness, between-ness, surrounding | **未提及 holes** |
| Hatcher / Munkres | Holes 由 homology/Jordan Curve Theorem 定义 | 未提及 Piaget |
| Chen 1982 | Holes 和 inside/outside 是同级拓扑不变量 | 未论述二者的派生关系，未引 Piaget |
| **我们** | **Holes 是 Piaget enclosure 在拓扑学中的自然操作化** | **这是我们的 bridging argument** |

> 论文中应写 "we argue that..." 而非 "it has been shown that..."

---

## 已排除 / 需修正的文献

| 文献 | 问题 |
|------|------|
| Casati & Varzi SEP "Holes" 词条 | 作者就是 Casati & Varzi 本人，不是独立佐证；搜索"enclosure"无结果 |
| Yousif & Brannon 2025. *Perceiving Topological Relations* | 研究的是 network topology（T-junction/cross/loop），不是 Piaget 的 enclosure 或 3D holes |
