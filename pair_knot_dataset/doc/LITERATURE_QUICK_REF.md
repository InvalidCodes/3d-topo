# Holes ⊂ Enclosure — 文献速查表

---

## 核心论证链（2步完成逻辑闭环）

### A: [Piaget & Inhelder 1956](https://archive.org/details/childsconception0000piag_e5l4) *The Child's Conception of Space*, Ch.1 §4

> "In three dimensions enclosure takes the form of the relation of **'insideness'**, as in the case of an object in a closed box."

Piaget 定义 enclosure = 感知 **inside/outside/between** 的能力，是5种拓扑基元之一

### B: [Hatcher 2002 *Algebraic Topology*](https://pi.math.cornell.edu/~hatcher/AT/AT.pdf), Ch.2 p.100

> "This spherical cycle detects the presence of a 'hole' in X₃, **the missing interior** of the sphere. However, since this hole is **enclosed** by a sphere rather than a circle, it is of a different sort from the holes detected by H₁"

标准代数拓扑教材**直接用 "enclosed" 和 "missing interior" 定义 hole** → hole = enclosed 结构

### C: [Hatcher 2002](https://pi.math.cornell.edu/~hatcher/AT/AT.pdf), §2.B p.169 (Jordan Curve Theorem)

> "A subspace of S² homeomorphic to S¹ **separates S² into two complementary components**"

闭合边界 → **interior + exterior**，这正是 enclosure 的数学形式化（1887年 Camille Jordan 提出的经典定理）

### 逻辑闭环

```
A (Piaget): enclosure = inside/outside
B (Hatcher): hole = "the missing interior", "enclosed" by boundary
C (Jordan Curve Thm): 闭合边界 → interior + exterior

∴ hole 就是 enclosure 结构本身 → hole detection 测的就是 enclosure
```

---

## 补充支撑文献（非必须，但可加强论证）

| # | 文献 | 一句话 | 与核心链的关系 | Link |
|---|------|------|------------|------|
| 1 | Chen 2005. *The topological approach to perceptual organization*. Visual Cognition 12(4) | 系统阐述拓扑感知理论 | 补充实验证据（非闭环必须） | [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1080/13506280444000256) |
| 2 | Zhou et al. 2021. *Topological dominance in peripheral vision*. JOV | 引述 Chen 理论："connectivity, the number of holes, and the inside/outside relationship remain invariant" | **三者并列的原文出处**（非 Chen 1982 原文） | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8479572/) |
| 3 | Nelson & Palmer 2001. *Of Holes and Wholes*. Perception 30(10) | hole 和 object 都是 enclosed region 的两种感知解读 | 实验证据：hole感知 = enclosure感知 | [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p3148) |
| 4 | Bertamini & Croucher 2003. *The shape of holes*. Cognition 87(1) | hole 的形状通过 enclosing object 间接感知 | 实验证据：hole认知依赖 enclosing object | [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S001002770200183X) |
| 5 | Casati & Varzi 1994. *Holes and Other Superficialities*. MIT Press | holes 本体论：hollows/tunnels/cavities 三类，holes 可以 knotted | 哲学旁证（非核心链） | [MIT Press](https://mitpress.mit.edu/9780262531337/holes-and-other-superficialities/) |

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
| Hatcher 2002 | Hole = "the missing interior", "enclosed by a sphere" | 未提及 Piaget，这是数学教材 |
| **我们** | **Holes 是 Piaget enclosure 在拓扑学中的自然操作化** | **这是我们的 bridging argument** |

> 论文中应写 "we argue that..." 而非 "it has been shown that..."

---

## 核心论证链中引用的教材信息

| 教材 | 作者 | 出版信息 | 性质 | 引用量 | 获取方式 |
|------|------|--------|------|------|--------|
| ***Algebraic Topology*** | Allen Hatcher (Cornell University) | Cambridge University Press, 2002. ISBN 978-0-521-79540-1 | 研究生代数拓扑标准教材，全球广泛使用 | Google Scholar 20,000+ | **免费公开**：https://pi.math.cornell.edu/~hatcher/AT/AT.pdf |
| ***Topology*** (2nd ed.) | James R. Munkres (MIT) | Prentice Hall / Pearson, 2000. ISBN 978-0-13-181629-9 | 本科/研究生点集拓扑标准教材，全球广泛使用 | Google Scholar 18,000+ | 付费：[Pearson](https://www.pearson.com/en-us/subject-catalog/p/topology-classic-version/P200000006299/9780137848669) |

### 核心引用段落

**Hatcher p.100**（Chapter 2 "The Idea of Homology"）— 直接用 "enclosed" 和 "missing interior" 描述 hole：

> "This spherical cycle detects the presence of a 'hole' in X₃, **the missing interior** of the sphere. However, since this hole is **enclosed** by a sphere rather than a circle, it is of a different sort from the holes detected by H₁"

> "by filling in the 2-cell A we have reduced the number of 'holes' in our space from three to two"

**Hatcher p.169**（Section 2.B "Classical Applications"）— Jordan Curve Theorem：

> "A subspace of S² homeomorphic to S¹ **separates** S² **into two complementary components**"

即：一条简单闭合曲线将平面/球面分为恰好两个区域（interior + exterior）。这是1887年由 Camille Jordan 提出的经典拓扑定理。

**Munkres §63**（Chapter 10）— Jordan Curve Theorem 的另一经典证明来源。标准表述（nLab）：

> "divides the plane into two disjoint subsets... **a bounded region inside the curve, and an unbounded region outside of it**, each of which has the original curve as its boundary"

---

## 已排除 / 需修正的文献

| 文献 | 问题 |
|------|------|
| Chen 1982 abstract | 只说 "global topological properties"，**没有提到 holes 或 inside/outside**。三者并列的表述来自 Chen 2005 / Zhou et al. 2021 |
| Casati & Varzi SEP "Holes" 词条 | 作者就是 Casati & Varzi 本人，不是独立佐证；搜索 "enclosure" 无结果 |
| Yousif & Brannon 2025. *Perceiving Topological Relations* | 研究的是 network topology（T-junction/cross/loop），不是 Piaget 的 enclosure 或 3D holes |
