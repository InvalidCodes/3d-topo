# H5 Knot — 3D Rope Physics Simulation

A pure H5/Three.js + PBD physics engine for rope knot simulation. Goal: replicate [blender_knots](https://github.com/johnhw/blender_knots) ASCII parsing and implement realistic tightening.

## Features

- **ASCII Parsing**: Parse blender_knots format ASCII diagrams
- **3D Rendering**: Three.js TubeGeometry for realistic rope visualization
- **PBD Physics**: Position-Based Dynamics with Verlet integration
- **Segment-Segment Collision**: Capsule collision prevents rope interpenetration
- **Crossing Constraints**: Maintains over/under topology during tightening
- **Interactive Endpoints**: Drag endpoints to manipulate ropes

## Preset Knots

- **Reef Knot**: Two ropes, two crossings (over/under alternating)
- **Simple Crossing**: Two ropes, one crossing

## Local Development

```bash
cd /home/ge/Downloads/h5_knot
python3 -m http.server 5173
# Open http://localhost:5173
```

## Dataset 生成（Three.js / H5）

本仓库额外提供一个纯前端的 **knot dataset generator** 页面：批量随机生成 knot（`CurveExtras + TubeGeometry` + `TorusKnot` 曲线族），并导出可复现 JSON（seed + 参数 + 中心线点集 + 变形参数 + 近似自交指标）。

```bash
python3 -m http.server 5173
# Open http://localhost:5173/dataset_generator.html
```

导出的 JSON 适合作为论文 benchmark 的数据生产“配方”，可重复生成 mesh；如果你需要进一步导出 glTF/OBJ 或批量渲染成图片，可以在此基础上加 exporter/离屏渲染。

## Controls

- **Left-click drag**: Rotate 3D view
- **Scroll**: Zoom
- **Drag yellow endpoints**: Move rope ends
- **Tighten button**: Auto-tighten the knot

## Technical Architecture

### ASCII Parser (`ascii-knot-parser.js`)

Parses blender_knots ASCII format:

```
        +--+
>-------|--+
    |   +--------<
    |   |
    |   +-------->
<-------|--+
        +--+
```

Key rules:
- `-` horizontal, `|` vertical line segments
- `+` undirected corner, `/` `\` directed corners  
- `>` `<` `^` `v` arrows (head/tail)
- Empty space between lines = underpass (under another rope)

### Physics Engine (`rope-physics.js`)

PBD/Verlet solver with:

1. **Distance Constraints**: Maintain rope length
2. **Bend Constraints**: Control stiffness
3. **Segment-Segment Collision**: 
   - Compute closest points between line segments
   - Apply correction distributed to 4 endpoint particles
   - Barycentric weighting for smooth response
4. **Crossing Order Constraints**:
   - Inequality constraint: `over.z - under.z >= minZDiff`
   - Prevents topology changes during simulation

### Tightening Strategy

1. **Rest length shrinking**: Gradually reduce constraint distances
2. **Endpoint pulling**: Pull along rope main axis
3. **Substep limiting**: Max displacement per substep < 0.3 * radius

## Code Structure

```
src/
├── app.js              # Main app (Three.js scene + interaction)
├── ascii-knot-parser.js # ASCII parsing + 3D conversion
├── rope-physics.js     # PBD physics engine
└── math.js             # Math utilities
```

## Comparison with blender_knots

| blender_knots | H5 Knot |
|---------------|---------|
| ASCII → Blender curves | ASCII → Three.js TubeGeometry |
| Over/Under Z-shift | Crossing constraints (Z separation) |
| Blender physics | Custom PBD/Verlet |
| Export → MuJoCo | Browser-only |

## Roadmap

- [ ] More knot presets (Bowline, Figure-8, etc.)
- [ ] Full ASCII syntax support
- [ ] Parameter space sampling
- [ ] Gauss code computation
- [ ] Export tightened knot data

## References

- [blender_knots](https://github.com/johnhw/blender_knots)
- [Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)

Level 0 (Easy):
knot types: {unknot, trefoil, figure-8}
Gauss crossings 少（<=4），无遮挡、厚度均匀、视角清晰
Level 1 (Medium):
torus knots 
T(2,q) with q=5,7；twist knots n=2,3…
允许轻度遮挡/材质变化
同一实例多视图一致性评测（invariance）
Level 2 (Hard):
kinky unknots（Gauss code 很长但 type=unknot）
高交叉数 knot（>=7）、接近退化的交叉角度、最小段间距极小、强遮挡/低分辨率
加镜像手性（如果你支持）