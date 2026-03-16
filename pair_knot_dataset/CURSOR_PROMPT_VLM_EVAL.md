# 任务：为绳结拓扑 Benchmark 创建 VLM 评测系统

## 你需要做什么

新建一个文件 `vlm_benchmark.py`，实现以下功能：
1. 读取图片 + metadata
2. 把图片和问题发给 GPT-4o
3. 解析答案，和正确答案对比
4. 输出每类问题的准确率报告

---

## 问题设计（共 5 个 Task）

每张图/每对图对应不同的 Task，按难度递增：

```python
TASKS = {

  # ── 单张图 ──────────────────────────────────────────────

  "T1_knotted": {
    "prompt": (
      "Look at this 3D image of a closed rope loop.\n"
      "Is this rope KNOTTED (tied in a knot that cannot be undone without cutting) "
      "or UNKNOTTED (a simple loop with no knot)?\n\n"
      "Reply with exactly one word on the first line: KNOTTED or UNKNOTTED\n"
      "Then one sentence explaining what visual feature led to your answer."
    ),
    "input": "single",           # 单张图
    "answer_field": "is_knotted" # metadata 里的正确答案字段
  },

  "T2_linked": {
    "prompt": (
      "Look at this 3D image showing one or more rope loops.\n"
      "Are any two rope components LINKED (interlocked so they cannot be separated) "
      "or are all components UNLINKED (can be pulled apart without cutting)?\n\n"
      "Reply with exactly one word on the first line: LINKED or UNLINKED\n"
      "Then one sentence explaining your reasoning."
    ),
    "input": "single",
    "answer_field": "is_linked"
  },

  "T3_splittable": {
    "prompt": (
      "Look at this 3D image of linked rope loops.\n"
      "Can this link be SPLIT — meaning: is there a plane or sphere that separates "
      "the components into two non-empty groups without cutting any rope?\n"
      "Or is it NON-SPLITTABLE?\n\n"
      "Reply with exactly one word on the first line: SPLITTABLE or NON-SPLITTABLE\n"
      "Then one sentence explaining your reasoning."
    ),
    "input": "single",
    "answer_field": "is_splittable"
  },

  "T4_identify": {
    "prompt": (
      "Look at this 3D image of a knotted rope. Which best describes this knot?\n"
      "A) Trefoil knot — 3 crossings, symmetric three-leaf shape\n"
      "B) Figure-eight knot — 4 crossings, figure-8 shape\n"
      "C) Torus knot with 5+ crossings\n"
      "D) Other / cannot determine\n\n"
      "Reply with exactly one letter on the first line: A, B, C, or D\n"
      "Then one sentence explaining what visual features you used."
    ),
    "input": "single",
    "answer_field": "knot_type_label"  # A/B/C/D
  },

  # ── 图对（两张图对比）────────────────────────────────────

  "T5_equivalent": {
    "prompt": (
      "Look at these two 3D images of rope loops (Image 1 and Image 2).\n"
      "Are they topologically EQUIVALENT — meaning they are the same knot type, "
      "just shown from different angles or with different shapes?\n"
      "Or are they DIFFERENT knot types?\n\n"
      "Reply with exactly one word on the first line: EQUIVALENT or DIFFERENT\n"
      "Then one sentence explaining your reasoning."
    ),
    "input": "pair",             # 两张图
    "answer_field": "label_equivalent"
  },
}
```

---

## 难度系统

按图片的 metadata 里的字段计算难度分：

```python
def compute_difficulty(metadata):
    """
    根据 metadata 计算单张图的难度分 (0~1)
    参考图示：img_difficulty = w1*norm(c_view) + w2*occlusion + w3*clamp(1/d_min_ratio)
    
    metadata 字段说明：
    - crossing_number: 该结的最小交叉数 (c_min)
    - slackness: 松紧度 (0=紧, 1=松)
    - bucket_saliency: 'tight'|'medium'|'loose'
    - trap_type: None | 'loose_knot' | 'deceptive_unknot'
    """
    c_min = metadata.get("crossingNumber") or metadata.get("crossing_number") or 0
    slackness = metadata.get("slackness", 0)
    trap = metadata.get("trap_type")
    
    # c_min 归一化 (最大按 10 crossings 算)
    score_topology = min(c_min / 10.0, 1.0)
    
    # slackness 越高，crossing 越不明显，越难
    score_saliency = slackness
    
    # 认知陷阱额外加难度
    score_trap = 0.3 if trap else 0.0
    
    # 加权
    difficulty = 0.35 * score_topology + 0.45 * score_saliency + 0.20 * score_trap
    
    # 分级
    if difficulty < 0.30:
        level = "easy"
    elif difficulty < 0.60:
        level = "medium"
    else:
        level = "hard"
    
    return {"score": round(difficulty, 3), "level": level}
```

---

## 完整脚本结构

```python
#!/usr/bin/env python3
"""
vlm_benchmark.py — 绳结拓扑 VLM 评测脚本

用法:
  # 测试单个样本（调试用）
  python vlm_benchmark.py --data_dir ./exports --tasks T1_knotted --limit 5

  # 批量测试所有 Task
  python vlm_benchmark.py --data_dir ./exports --tasks all --output results.json

  # 只测难的样本
  python vlm_benchmark.py --data_dir ./exports --tasks T1_knotted --difficulty hard

依赖: pip install openai
需要环境变量: OPENAI_API_KEY
"""

import base64, json, os, argparse, time, sys
from pathlib import Path
from openai import OpenAI

# ── 上面定义的 TASKS 和 compute_difficulty 放在这里 ──

# ── API 调用 ──────────────────────────────────────────────

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def ask_vlm(client, model, prompt, image_paths):
    """发送图片+问题给 VLM，返回原始回答文字"""
    content = []
    for i, path in enumerate(image_paths):
        if len(image_paths) > 1:
            # 多图时加标签
            content.append({"type": "text", "text": f"Image {i+1}:"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encode_image(path)}"}
        })
    content.append({"type": "text", "text": prompt})
    
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_tokens=150,
        temperature=0,   # 必须为 0，确保可复现
    )
    return response.choices[0].message.content.strip()

# ── 答案解析 ──────────────────────────────────────────────

def parse_answer(raw_response, task_id):
    """从 VLM 回答里提取关键词"""
    first_line = raw_response.split("\n")[0].strip().upper()
    
    if task_id in ("T1_knotted",):
        if "UNKNOTTED" in first_line: return "unknotted"
        if "KNOTTED" in first_line: return "knotted"
    
    elif task_id == "T2_linked":
        if "UNLINKED" in first_line: return "unlinked"
        if "LINKED" in first_line: return "linked"
    
    elif task_id == "T3_splittable":
        if "NON-SPLITTABLE" in first_line or "NON_SPLITTABLE" in first_line: return "non_splittable"
        if "SPLITTABLE" in first_line: return "splittable"
    
    elif task_id == "T4_identify":
        for letter in ["A", "B", "C", "D"]:
            if first_line.startswith(letter): return letter
    
    elif task_id == "T5_equivalent":
        if "EQUIVALENT" in first_line: return "equivalent"
        if "DIFFERENT" in first_line: return "different"
    
    return "unclear"  # 无法解析

# ── Ground Truth 提取 ──────────────────────────────────────

def get_ground_truth(metadata, task_id):
    """从 metadata.json 里取出正确答案"""
    
    if task_id == "T1_knotted":
        # metadata 里 isKnot: true/false
        is_knot = metadata.get("isKnot", False)
        return "knotted" if is_knot else "unknotted"
    
    elif task_id == "T2_linked":
        is_link = metadata.get("isLink", False) or metadata.get("groundTruth", {}).get("is_linked", False)
        return "linked" if is_link else "unlinked"
    
    elif task_id == "T3_splittable":
        # unlinked_rings 是 splittable，其他 links 不是
        knot_type = metadata.get("knotType", "")
        splittable = knot_type in ("unlinked_rings",)
        return "splittable" if splittable else "non_splittable"
    
    elif task_id == "T4_identify":
        knot_type = metadata.get("knotType", "")
        mapping = {
            "trefoil": "A",
            "figure8": "B",
            "torus_2_5": "C", "torus_2_7": "C", "torus_2_9": "C", "torus_3_4": "C", "torus_3_5": "C",
        }
        return mapping.get(knot_type, "D")
    
    elif task_id == "T5_equivalent":
        # pair metadata 里有 label_equivalent: true/false
        equiv = metadata.get("label_equivalent", False)
        return "equivalent" if equiv else "different"
    
    return None

# ── 统计报告 ──────────────────────────────────────────────

def print_report(results):
    """打印准确率报告"""
    print("\n" + "="*60)
    print("VLM BENCHMARK RESULTS")
    print("="*60)
    
    # 按 task 分组统计
    by_task = {}
    for r in results:
        task = r["task"]
        if task not in by_task:
            by_task[task] = {"total": 0, "correct": 0, "by_difficulty": {}}
        
        by_task[task]["total"] += 1
        if r.get("correct"):
            by_task[task]["correct"] += 1
        
        # 按难度分组
        diff = r.get("difficulty_level", "unknown")
        d = by_task[task]["by_difficulty"]
        if diff not in d:
            d[diff] = {"total": 0, "correct": 0}
        d[diff]["total"] += 1
        if r.get("correct"):
            d[diff]["correct"] += 1
    
    for task, stats in by_task.items():
        total = stats["total"]
        correct = stats["correct"]
        acc = correct / total if total > 0 else 0
        print(f"\n[{task}]  Accuracy: {acc:.1%}  ({correct}/{total})")
        
        # 按难度显示
        for level in ["easy", "medium", "hard"]:
            d = stats["by_difficulty"].get(level, {})
            if d.get("total", 0) > 0:
                d_acc = d["correct"] / d["total"]
                print(f"  {level:8s}: {d_acc:.1%}  ({d['correct']}/{d['total']})")
    
    # 特别关注：trap_type 分析
    print("\n── Trap Type Analysis ──")
    trap_stats = {}
    for r in results:
        trap = r.get("trap_type") or "none"
        if trap not in trap_stats:
            trap_stats[trap] = {"total": 0, "correct": 0}
        trap_stats[trap]["total"] += 1
        if r.get("correct"):
            trap_stats[trap]["correct"] += 1
    
    for trap, stats in trap_stats.items():
        acc = stats["correct"] / stats["total"] if stats["total"] > 0 else 0
        print(f"  {trap:25s}: {acc:.1%}  ({stats['correct']}/{stats['total']})")

# ── 主函数 ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", default="./exports", help="包含图片和 metadata.json 的目录")
    parser.add_argument("--tasks", default="T1_knotted", help="逗号分隔的 task 列表，或 'all'")
    parser.add_argument("--model", default="gpt-4o", help="VLM 模型")
    parser.add_argument("--output", default="results.json", help="结果输出文件")
    parser.add_argument("--limit", type=int, default=None, help="最多测试几个样本（调试用）")
    parser.add_argument("--difficulty", default=None, choices=["easy","medium","hard"], help="只测指定难度")
    args = parser.parse_args()
    
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    data_dir = Path(args.data_dir)
    
    # 选择要跑的 tasks
    task_ids = list(TASKS.keys()) if args.tasks == "all" else args.tasks.split(",")
    
    # 找所有 metadata 文件
    meta_files = sorted(data_dir.glob("**/metadata*.json"))
    print(f"Found {len(meta_files)} samples in {data_dir}")
    
    all_results = []
    count = 0
    
    for meta_path in meta_files:
        with open(meta_path) as f:
            metadata = json.load(f)
        
        # 计算难度
        diff_info = compute_difficulty(metadata)
        
        # 难度过滤
        if args.difficulty and diff_info["level"] != args.difficulty:
            continue
        
        # 找图片（优先用 iso_fr 视角）
        images = metadata.get("images", [])
        img_meta = next((i for i in images if "iso_fr" in i.get("filename","")), 
                        images[0] if images else None)
        if not img_meta:
            continue
        
        img_path = meta_path.parent / img_meta["filename"]
        if not img_path.exists():
            print(f"  [WARN] 图片不存在: {img_path}")
            continue
        
        # 对每个 task 测试
        for task_id in task_ids:
            if task_id not in TASKS:
                print(f"  [WARN] 未知 task: {task_id}")
                continue
            
            task = TASKS[task_id]
            
            # pair task 需要两张图，单图 task 只需要一张
            if task["input"] == "pair":
                # pair metadata 格式不同，跳过（单独处理）
                continue
            
            # 发给 VLM
            try:
                raw = ask_vlm(client, args.model, task["prompt"], [str(img_path)])
                parsed = parse_answer(raw, task_id)
                gt = get_ground_truth(metadata, task_id)
                correct = (parsed == gt) if gt is not None else None
                
                result = {
                    "task": task_id,
                    "knot_type": metadata.get("knotType"),
                    "slackness": metadata.get("slackness", 0),
                    "difficulty_score": diff_info["score"],
                    "difficulty_level": diff_info["level"],
                    "trap_type": metadata.get("trap_type"),
                    "ground_truth": gt,
                    "vlm_answer": parsed,
                    "vlm_raw": raw,
                    "correct": correct,
                }
                all_results.append(result)
                
                status = "✓" if correct else ("?" if correct is None else "✗")
                print(f"  [{status}] {task_id} | {metadata.get('knotType')} | slack={metadata.get('slackness',0):.2f} | gt={gt} | ans={parsed}")
                
                time.sleep(0.5)  # 限速
                
            except Exception as e:
                print(f"  [ERROR] {task_id}: {e}")
        
        count += 1
        if args.limit and count >= args.limit:
            break
    
    # 保存结果
    with open(args.output, "w") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {len(all_results)} results to {args.output}")
    
    # 打印报告
    print_report(all_results)

if __name__ == "__main__":
    main()
```

---

## 给 Cursor 的指令

请按照上面的结构，创建文件 `vlm_benchmark.py`。

要求：
1. 把 TASKS、compute_difficulty、parse_answer、get_ground_truth、print_report、main 都完整实现
2. 不要省略任何函数，每个都要有实际代码
3. 在文件顶部加上使用说明（参考上面的 docstring）
4. 确保 `temperature=0`（不能改）
5. 确保答案解析只取第一行的第一个关键词（不能用模糊匹配）

完成后告诉我：这个文件可以用以下命令测试：
```bash
export OPENAI_API_KEY="your-key-here"
python vlm_benchmark.py --data_dir ./exports --tasks T1_knotted --limit 3
```
