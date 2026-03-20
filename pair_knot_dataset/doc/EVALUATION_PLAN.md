# 评测实例分配方案（200 instances, 10 tasks）

> 更新：2026-03-16 | 删除 T15 same_or_mirror（无手性数据）

## 总览

| Task | 类型 | 样本数 | 说明 |
|------|------|--------|------|
| **T01** knotted_direct | single | 20 | 直接判断 knotted/unknotted |
| **T02** knotted_cot | single | 20 | CoT 推理后判断 |
| **T03** crossing_count | single | 20 | 计数交叉点 (A/B/C/D) |
| **T04** can_untie | single | 20 | 能否解开变成圆环 |
| **T06** knot_family | single | 20 | 分类 UNKNOT/TORUS/TWIST/OTHER |
| **T09** loose_knot_trap | single | 20 | 真结 vs 伪结陷阱 |
| **T10** linked_or_not | multi | 20 | 多环是否链接 |
| **T11** hopflink_or_not | multi | 20 | 是否 Hopf link |
| **T12** link_components | multi | 20 | 数环的个数 |
| **T13** same_knot_type | pair | 20 | 两图是否同一拓扑类 |
| **总计** | — | **200** | |

已删除的 tasks: T05 (主观), T07 (过细 torus pq), T08 (过细 trefoil), T14 (主观复杂度), T15 (无手性数据)

---

## 单环任务采样策略 (T01-T04, T06, T09)

### 可用数据源

| knotType | 拓扑 | family | crossings | 变体数 | 说明 |
|----------|------|--------|-----------|--------|------|
| unknot | unknot | UNKNOT | 0 | 4 | 基础圆环 |
| twisted_ring | unknot | UNKNOT | 0 | 4 | 扭曲环 (deceptive) |
| spiral_disk | unknot | UNKNOT | 0 | 4 | 螺旋盘 (deceptive) |
| kinky_unknot | unknot | UNKNOT | 0 | 4 | 扭折环 (deceptive, hard) |
| loose_open_knot | trefoil | TORUS | 3 | 4 | 松散开口 trefoil |
| trefoil | trefoil | TORUS | 3 | 4 | 三叶结 |
| figure8 | figure8 | TWIST | 4 | 4 | 八字结 |
| torus_2_5 | T(2,5) | TORUS | 5 | 4 | 五叶结 |
| torus_2_7 | T(2,7) | TORUS | 7 | 4 | 七叶结 |
| torus_2_9 | T(2,9) | TORUS | 9 | 4 | 九叶结 |
| torus_3_4 | T(3,4) | TORUS | 8 | 4 | T(3,4) |
| torus_3_5 | T(3,5) | TORUS | 10 | 4 | T(3,5) |

每类 4 个变体，共 12 × 4 = 48 个 single 样本可用。每个变体有 3 个视角 (iso_fr, front, oblique)，评测使用 iso_fr 视角。

---

### T01 knotted_direct (20 samples)

目标：均衡 KNOTTED / UNKNOTTED，包含 deceptive negatives。

| # | knotType | GT | 难度 | 说明 |
|---|----------|-----|------|------|
| 1 | unknot_v0 | UNKNOTTED | easy | 基础圆环 tight |
| 2 | unknot_v1 | UNKNOTTED | easy | 基础圆环 medium |
| 3 | twisted_ring_v0 | UNKNOTTED | medium | 伪交叉 |
| 4 | twisted_ring_v2 | UNKNOTTED | medium | 伪交叉（高 slackness） |
| 5 | spiral_disk_v1 | UNKNOTTED | medium | 螺旋 |
| 6 | kinky_unknot_v0 | UNKNOTTED | hard | 扭折环 tight |
| 7 | kinky_unknot_v2 | UNKNOTTED | hard | 扭折环 slack |
| 8 | kinky_unknot_v3 | UNKNOTTED | hard | 最高 deform |
| 9 | trefoil_v0 | KNOTTED | easy | 三叶结 tight |
| 10 | trefoil_v2 | KNOTTED | easy | 三叶结 medium |
| 11 | figure8_v0 | KNOTTED | easy | 八字结 tight |
| 12 | figure8_v1 | KNOTTED | easy | 八字结 |
| 13 | torus_2_5_v0 | KNOTTED | medium | 五叶结 |
| 14 | torus_2_5_v2 | KNOTTED | medium | 五叶结 slack |
| 15 | loose_open_knot_v0 | KNOTTED | hard | 松散开口 trefoil |
| 16 | loose_open_knot_v1 | KNOTTED | hard | 松散开口 trefoil |
| 17 | torus_2_7_v0 | KNOTTED | hard | 七叶结 |
| 18 | torus_2_9_v0 | KNOTTED | hard | 九叶结 |
| 19 | torus_3_4_v0 | KNOTTED | hard | T(3,4) |
| 20 | torus_3_5_v0 | KNOTTED | hard | T(3,5) |

**分布**: KNOTTED:12 / UNKNOTTED:8, easy:6 / medium:5 / hard:9

### T02 knotted_cot (20 samples)

与 T01 相同 20 个样本（相同 knot 实例），但使用 CoT prompt。
目的：对比 direct vs CoT 在完全相同输入上的表现差异。

### T03 crossing_count (20 samples)

| # | knotType | GT | crossings | 难度 |
|---|----------|-----|-----------|------|
| 1 | unknot_v0 | A (0) | 0 | easy |
| 2 | unknot_v2 | A (0) | 0 | easy |
| 3 | twisted_ring_v0 | A (0) | 0 | medium |
| 4 | kinky_unknot_v0 | A (0) | 0 | hard |
| 5 | kinky_unknot_v1 | A (0) | 0 | hard |
| 6 | trefoil_v0 | B (1-3) | 3 | easy |
| 7 | trefoil_v1 | B (1-3) | 3 | easy |
| 8 | trefoil_v2 | B (1-3) | 3 | medium |
| 9 | loose_open_knot_v0 | B (1-3) | 3 | hard |
| 10 | loose_open_knot_v2 | B (1-3) | 3 | hard |
| 11 | figure8_v0 | C (4-6) | 4 | easy |
| 12 | figure8_v1 | C (4-6) | 4 | medium |
| 13 | torus_2_5_v0 | C (4-6) | 5 | medium |
| 14 | torus_2_5_v1 | C (4-6) | 5 | medium |
| 15 | torus_2_5_v2 | C (4-6) | 5 | hard |
| 16 | torus_2_7_v0 | D (7+) | 7 | hard |
| 17 | torus_2_7_v1 | D (7+) | 7 | hard |
| 18 | torus_2_9_v0 | D (7+) | 9 | hard |
| 19 | torus_3_4_v0 | D (7+) | 8 | hard |
| 20 | torus_3_5_v0 | D (7+) | 10 | hard |

**分布**: A:5 / B:5 / C:5 / D:5

### T04 can_untie (20 samples)

| # | knotType | GT | 难度 |
|---|----------|-----|------|
| 1 | unknot_v0 | YES | easy |
| 2 | unknot_v1 | YES | easy |
| 3 | unknot_v3 | YES | easy |
| 4 | twisted_ring_v0 | YES | medium |
| 5 | twisted_ring_v1 | YES | medium |
| 6 | spiral_disk_v0 | YES | medium |
| 7 | spiral_disk_v2 | YES | medium |
| 8 | kinky_unknot_v0 | YES | hard |
| 9 | kinky_unknot_v1 | YES | hard |
| 10 | kinky_unknot_v3 | YES | hard |
| 11 | trefoil_v0 | NO | easy |
| 12 | trefoil_v2 | NO | easy |
| 13 | figure8_v0 | NO | easy |
| 14 | figure8_v2 | NO | medium |
| 15 | torus_2_5_v0 | NO | medium |
| 16 | torus_2_5_v1 | NO | medium |
| 17 | torus_2_7_v0 | NO | hard |
| 18 | torus_2_9_v0 | NO | hard |
| 19 | torus_3_4_v0 | NO | hard |
| 20 | torus_3_5_v0 | NO | hard |

**分布**: YES:10 / NO:10

### T06 knot_family (20 samples)

| # | knotType | GT | 难度 |
|---|----------|-----|------|
| 1 | unknot_v0 | UNKNOT | easy |
| 2 | unknot_v2 | UNKNOT | easy |
| 3 | twisted_ring_v0 | UNKNOT | medium |
| 4 | kinky_unknot_v0 | UNKNOT | hard |
| 5 | kinky_unknot_v2 | UNKNOT | hard |
| 6 | trefoil_v0 | TORUS | easy |
| 7 | trefoil_v1 | TORUS | easy |
| 8 | torus_2_5_v0 | TORUS | medium |
| 9 | torus_2_7_v0 | TORUS | hard |
| 10 | loose_open_knot_v0 | TORUS | hard |
| 11 | figure8_v0 | TWIST | easy |
| 12 | figure8_v1 | TWIST | medium |
| 13 | figure8_v2 | TWIST | medium |
| 14 | figure8_v3 | TWIST | hard |
| 15 | spiral_disk_v0 | UNKNOT | medium |
| 16 | torus_2_9_v0 | TORUS | hard |
| 17 | torus_3_4_v0 | TORUS | hard |
| 18 | torus_3_5_v0 | TORUS | hard |
| 19 | loose_open_knot_v2 | TORUS | hard |
| 20 | torus_2_5_v2 | TORUS | hard |

**分布**: UNKNOT:6 / TORUS:9 / TWIST:4 / OTHER:1

### T09 loose_knot_trap (20 samples)

仅限 deceptive unknots 和 actual knots（filter: `is_trap_candidate`）。

| # | knotType | GT | 难度 |
|---|----------|-----|------|
| 1 | twisted_ring_v0 | LOOSE_ILLUSION | medium |
| 2 | twisted_ring_v1 | LOOSE_ILLUSION | medium |
| 3 | twisted_ring_v2 | LOOSE_ILLUSION | medium |
| 4 | spiral_disk_v0 | LOOSE_ILLUSION | medium |
| 5 | spiral_disk_v1 | LOOSE_ILLUSION | medium |
| 6 | spiral_disk_v2 | LOOSE_ILLUSION | hard |
| 7 | kinky_unknot_v0 | LOOSE_ILLUSION | hard |
| 8 | kinky_unknot_v1 | LOOSE_ILLUSION | hard |
| 9 | kinky_unknot_v2 | LOOSE_ILLUSION | hard |
| 10 | kinky_unknot_v3 | LOOSE_ILLUSION | hard |
| 11 | trefoil_v0 | ACTUAL_KNOT | easy |
| 12 | trefoil_v1 | ACTUAL_KNOT | easy |
| 13 | trefoil_v2 | ACTUAL_KNOT | medium |
| 14 | figure8_v0 | ACTUAL_KNOT | easy |
| 15 | figure8_v1 | ACTUAL_KNOT | medium |
| 16 | torus_2_5_v0 | ACTUAL_KNOT | medium |
| 17 | torus_2_5_v1 | ACTUAL_KNOT | medium |
| 18 | loose_open_knot_v0 | ACTUAL_KNOT | hard |
| 19 | torus_2_7_v0 | ACTUAL_KNOT | hard |
| 20 | torus_3_4_v0 | ACTUAL_KNOT | hard |

**分布**: LOOSE_ILLUSION:10 / ACTUAL_KNOT:10

---

## 多环任务采样策略 (T10-T12)

### 可用数据源

| linkType | 组分数 | 链接 | 变体数 | 视角数 |
|----------|--------|------|--------|--------|
| hopf_link | 2 | LINKED | 3 | 3 |
| unlinked_rings | 2 | UNLINKED | 3 | 3 |
| chain | 3 | LINKED | 3 | 3 |
| borromean | 3 | LINKED | 3 | 3 |

共 4 × 3 = 12 个 metadata，每个有 3 视角。多环任务使用**不同视角**作为独立评测实例（不同视角下链接关系的视觉线索差异大），共 12 × 3 = 36 可用实例。

### T10 linked_or_not (20 samples)

| # | linkType_variant | 视角 | GT | 难度 |
|---|-----------------|------|-----|------|
| 1 | hopf_link_v0 | iso_fr | LINKED | easy |
| 2 | hopf_link_v0 | front | LINKED | easy |
| 3 | hopf_link_v1 | iso_fr | LINKED | easy |
| 4 | hopf_link_v1 | oblique | LINKED | medium |
| 5 | hopf_link_v2 | iso_fr | LINKED | medium |
| 6 | chain_v0 | iso_fr | LINKED | medium |
| 7 | chain_v0 | front | LINKED | medium |
| 8 | chain_v1 | iso_fr | LINKED | medium |
| 9 | borromean_v0 | iso_fr | LINKED | hard |
| 10 | borromean_v1 | iso_fr | LINKED | hard |
| 11 | unlinked_rings_v0 | iso_fr | UNLINKED | easy |
| 12 | unlinked_rings_v0 | front | UNLINKED | easy |
| 13 | unlinked_rings_v0 | oblique | UNLINKED | medium |
| 14 | unlinked_rings_v1 | iso_fr | UNLINKED | easy |
| 15 | unlinked_rings_v1 | front | UNLINKED | medium |
| 16 | unlinked_rings_v1 | oblique | UNLINKED | medium |
| 17 | unlinked_rings_v2 | iso_fr | UNLINKED | easy |
| 18 | unlinked_rings_v2 | front | UNLINKED | medium |
| 19 | unlinked_rings_v2 | oblique | UNLINKED | hard |
| 20 | borromean_v2 | iso_fr | LINKED | hard |

**分布**: LINKED:10 / UNLINKED:10

### T11 hopflink_or_not (20 samples)

| # | linkType_variant | 视角 | GT | 难度 |
|---|-----------------|------|-----|------|
| 1 | hopf_link_v0 | iso_fr | HOPF | easy |
| 2 | hopf_link_v0 | front | HOPF | easy |
| 3 | hopf_link_v0 | oblique | HOPF | medium |
| 4 | hopf_link_v1 | iso_fr | HOPF | easy |
| 5 | hopf_link_v1 | front | HOPF | medium |
| 6 | hopf_link_v1 | oblique | HOPF | medium |
| 7 | hopf_link_v2 | iso_fr | HOPF | medium |
| 8 | hopf_link_v2 | front | HOPF | medium |
| 9 | hopf_link_v2 | oblique | HOPF | hard |
| 10 | hopf_link_v0 (flipped) | iso_fr | HOPF | hard |
| 11 | unlinked_rings_v0 | iso_fr | NOT_HOPF | easy |
| 12 | unlinked_rings_v1 | iso_fr | NOT_HOPF | easy |
| 13 | unlinked_rings_v2 | iso_fr | NOT_HOPF | easy |
| 14 | chain_v0 | iso_fr | NOT_HOPF | medium |
| 15 | chain_v1 | iso_fr | NOT_HOPF | medium |
| 16 | chain_v2 | iso_fr | NOT_HOPF | medium |
| 17 | borromean_v0 | iso_fr | NOT_HOPF | hard |
| 18 | borromean_v1 | iso_fr | NOT_HOPF | hard |
| 19 | borromean_v2 | iso_fr | NOT_HOPF | hard |
| 20 | chain_v0 | oblique | NOT_HOPF | hard |

**分布**: HOPF:10 / NOT_HOPF:10

### T12 link_components (20 samples)

| # | linkType_variant | 视角 | GT | 难度 |
|---|-----------------|------|-----|------|
| 1 | hopf_link_v0 | iso_fr | 2 | easy |
| 2 | hopf_link_v0 | front | 2 | easy |
| 3 | hopf_link_v1 | iso_fr | 2 | easy |
| 4 | hopf_link_v2 | iso_fr | 2 | medium |
| 5 | unlinked_rings_v0 | iso_fr | 2 | easy |
| 6 | unlinked_rings_v1 | iso_fr | 2 | easy |
| 7 | unlinked_rings_v2 | iso_fr | 2 | medium |
| 8 | borromean_v0 | iso_fr | 3 | hard |
| 9 | borromean_v0 | front | 3 | hard |
| 10 | borromean_v1 | iso_fr | 3 | hard |
| 11 | borromean_v1 | oblique | 3 | hard |
| 12 | borromean_v2 | iso_fr | 3 | hard |
| 13 | chain_v0 | iso_fr | 3 | medium |
| 14 | chain_v0 | front | 3 | medium |
| 15 | chain_v0 | oblique | 3 | hard |
| 16 | chain_v1 | iso_fr | 3 | medium |
| 17 | chain_v1 | front | 3 | hard |
| 18 | chain_v2 | iso_fr | 3 | medium |
| 19 | unlinked_rings_v0 | oblique | 2 | medium |
| 20 | hopf_link_v1 | oblique | 2 | medium |

**分布**: 2组分:9 / 3组分:11

---

## Pair 任务采样策略 (T13)

### T13 same_knot_type (20 pairs)

从 50 个已生成 pair 中选取 20 个，确保 SAME/DIFFERENT 均衡。

| # | 构成 | GT | 难度 | 说明 |
|---|------|-----|------|------|
| 1 | trefoil_v0 vs trefoil_v1 | SAME | easy | 同类型不同参数 |
| 2 | figure8_v0 vs figure8_v2 | SAME | easy | 同类型不同参数 |
| 3 | unknot_v0 vs unknot_v2 | SAME | easy | 简单环对比 |
| 4 | unknot_v0 vs twisted_ring_v0 | SAME | medium | 同拓扑不同外观 |
| 5 | unknot_v1 vs spiral_disk_v0 | SAME | medium | 同拓扑不同外观 |
| 6 | twisted_ring_v0 vs kinky_unknot_v0 | SAME | hard | 都是 unknot 但差异大 |
| 7 | unknot_v0 vs kinky_unknot_v2 | SAME | hard | 最大视觉差异的 unknot pair |
| 8 | torus_2_5_v0 vs torus_2_5_v1 | SAME | medium | 同类型不同 slackness |
| 9 | torus_2_7_v0 vs torus_2_7_v1 | SAME | hard | 高 crossing 同类对比 |
| 10 | torus_3_4_v0 vs torus_3_4_v1 | SAME | hard | 高复杂度同类对比 |
| 11 | unknot_v0 vs trefoil_v0 | DIFFERENT | easy | 最明显差异 |
| 12 | unknot_v1 vs figure8_v0 | DIFFERENT | easy | 明显不同 |
| 13 | trefoil_v0 vs figure8_v0 | DIFFERENT | easy | 两种不同 knot |
| 14 | torus_2_5_v0 vs figure8_v0 | DIFFERENT | medium | TORUS vs TWIST |
| 15 | trefoil_v0 vs torus_2_7_v0 | DIFFERENT | medium | 同 family 不同类型 |
| 16 | torus_2_5_v0 vs torus_3_4_v0 | DIFFERENT | medium | 同 family 不同类型 |
| 17 | kinky_unknot_v0 vs trefoil_v0 | DIFFERENT | hard | deceptive unknot vs 真结 |
| 18 | kinky_unknot_v2 vs loose_open_knot_v0 | DIFFERENT | hard | 伪结 vs 松散真结 |
| 19 | spiral_disk_v0 vs torus_2_5_v0 | DIFFERENT | hard | deceptive vs real |
| 20 | torus_2_7_v0 vs torus_2_9_v0 | DIFFERENT | hard | 高 crossing 差异小 |

**分布**: SAME:10 / DIFFERENT:10

---

## 难度分布目标

| 难度 | 占比 | 数量 |
|------|------|------|
| easy | ~30% | ~60 |
| medium | ~30% | ~60 |
| hard | ~40% | ~80 |

注：hard 比例略高，因为 benchmark 的核心价值在于测试 VLM 在困难场景下的表现。

## 质量要求

- 每张图 1024×1024 PNG
- 3 个视角 (iso_fr, front, oblique)
- 单环任务评测默认使用 iso_fr 视角
- 多环任务使用不同视角作为独立评测实例
- 无穿模（通过 physics constraints + 跨环 crossing 保证）
- 绳结在画面中占比 > 40%（通过 boundingSphere 缩放保证）
- 所有 metadata 包含 vlm_benchmark.py 需要的全部字段
