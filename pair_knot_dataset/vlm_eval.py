#!/usr/bin/env python3
"""
vlm_eval.py - VLM topology evaluation script.

Usage:
  python vlm_eval.py --data_dir ./exports --model gpt-4o --output results.json
  python vlm_eval.py --data_dir ./exports --provider anthropic --model claude-3-5-sonnet-20241022 --output results.json

Dependencies:
  pip install openai anthropic
"""

import argparse
import base64
import json
import os
import time
from pathlib import Path

# ============ Prompt Templates ============

PROMPTS = {
    # Task A: core task - knotted or not (direct)
    "knotted_or_not": (
        "Look at this 3D image of a rope. The rope forms a closed loop.\n"
        "Is this rope KNOTTED (tied in a knot that cannot be undone) "
        "or just a simple UNKNOTTED loop?\n\n"
        "Answer with EXACTLY one word on the first line: KNOTTED or UNKNOTTED\n"
        "Then on a new line, describe in one sentence the key visual evidence."
    ),
    # Task A (Chain-of-Thought variant)
    "knotted_cot": (
        "Look at this 3D image of a rope forming a closed loop.\n"
        "Reason step by step:\n"
        "1. Look for places where the rope crosses over or under itself.\n"
        "2. Count how many distinct crossing points you can see.\n"
        "3. Based on the crossings, determine if the rope is truly knotted.\n\n"
        "Final answer (first line, one word): KNOTTED or UNKNOTTED"
    ),
    # Task B: equivalence
    "equivalent_or_not": (
        "Look at these two 3D rope images. Both form closed loops.\n"
        "Are they topologically EQUIVALENT (same knot type, just different shapes/views)?\n"
        "Or are they DIFFERENT knot types?\n\n"
        "Answer with EXACTLY one word on the first line: EQUIVALENT or DIFFERENT\n"
        "Then explain in one sentence."
    ),
    # Task C: type identification
    "identify_type": (
        "Look at this 3D rope image. Which best describes this closed loop?\n"
        "A) Simple loop (unknot - no real knot)\n"
        "B) Trefoil knot (3 crossing points)\n"
        "C) Figure-eight knot (4 crossing points)\n"
        "D) More complex knot (5 or more crossings)\n\n"
        "Answer with ONLY the letter A, B, C, or D."
    ),
}


# ============ API calls ============

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def query_openai(client, model, prompt, image_paths):
    content = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encode_image(p)}"},
        }
        for p in image_paths
    ]
    content.append({"type": "text", "text": prompt})
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_tokens=200,
        temperature=0,
    )
    return resp.choices[0].message.content.strip()


def query_anthropic(client, model, prompt, image_paths):
    content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": encode_image(p),
            },
        }
        for p in image_paths
    ]
    content.append({"type": "text", "text": prompt})
    msg = client.messages.create(
        model=model,
        max_tokens=200,
        messages=[{"role": "user", "content": content}],
    )
    return msg.content[0].text.strip()


def query_vlm(client, model, prompt, image_paths, provider="openai"):
    if provider == "anthropic":
        return query_anthropic(client, model, prompt, image_paths)
    return query_openai(client, model, prompt, image_paths)


# ============ Answer parsing ============

def parse_answer(response, task):
    first = response.split("\n")[0].strip().upper().rstrip(".,!?")
    if task in ("knotted_or_not", "knotted_cot"):
        if "UNKNOTTED" in first:
            return "unknotted"
        if "KNOTTED" in first:
            return "knotted"
        return "unclear"
    if task == "equivalent_or_not":
        if "EQUIVALENT" in first:
            return "equivalent"
        if "DIFFERENT" in first:
            return "different"
        return "unclear"
    if task == "identify_type":
        for letter in "ABCD":
            if first.startswith(letter):
                return letter
        return "unclear"
    return response[:50]


# ============ Ground truth mapping ============

IDENTIFY_TYPE_MAP = {
    "unknot": "A",
    "twisted_ring": "A",
    "kinky_unknot": "A",
    "spiral_disk": "A",
    "trefoil": "B",
    "figure8": "C",
}


def get_ground_truth(metadata, task):
    gt = metadata.get("groundTruth", {})
    if task in ("knotted_or_not", "knotted_cot"):
        return gt.get("task_knotted_or_not", "unknown")
    if task == "identify_type":
        return IDENTIFY_TYPE_MAP.get(metadata.get("knotType", ""), "D")
    return None  # equivalent_or_not needs pair info


# ============ Core evaluation ============

def evaluate_sample(client, model, metadata, data_dir, tasks, provider="openai"):
    images = metadata.get("images", [])
    img_meta = next((i for i in images if "iso_fr" in i["filename"]), images[0] if images else None)
    if not img_meta:
        return None

    img_path = data_dir / img_meta["filename"]
    if not img_path.exists():
        print(f"  [WARN] Image not found: {img_path}")
        return None

    result = {
        "knotType": metadata.get("knotType"),
        "isKnot": metadata.get("isKnot"),
        "slackness": metadata.get("slackness", 0),
        "bucket_topology": metadata.get("bucket_topology"),
        "bucket_saliency": metadata.get("bucket_saliency"),
        "trap_type": metadata.get("trap_type"),
        "difficulty": metadata.get("difficulty"),
        "responses": {},
    }

    for task in tasks:
        prompt = PROMPTS.get(task)
        if not prompt:
            continue
        try:
            raw = query_vlm(client, model, prompt, [str(img_path)], provider)
            parsed = parse_answer(raw, task)
            gt = get_ground_truth(metadata, task)
            correct = (parsed == gt) if gt else None
            result["responses"][task] = {
                "raw": raw,
                "parsed": parsed,
                "gt": gt,
                "correct": correct,
            }
            time.sleep(0.5)
        except Exception as e:  # noqa: BLE001
            print(f"  [ERROR] {task}: {e}")
            result["responses"][task] = {"error": str(e)}

    return result


# ============ Stats ============

def compute_stats(results, tasks):
    stats = {}
    for task in tasks:
        task_res = [r["responses"].get(task) for r in results if task in r.get("responses", {})]
        valid = [r for r in task_res if r and r.get("correct") is not None]
        if not valid:
            continue

        total = len(valid)
        correct = sum(1 for r in valid if r["correct"])

        by_saliency = {"tight": [], "medium": [], "loose": []}
        for r_sample in results:
            sal = r_sample.get("bucket_saliency", "unknown")
            r_task = r_sample.get("responses", {}).get(task)
            if r_task and r_task.get("correct") is not None and sal in by_saliency:
                by_saliency[sal].append(r_task["correct"])

        by_trap = {}
        for r_sample in results:
            trap = r_sample.get("trap_type") or "none"
            r_task = r_sample.get("responses", {}).get(task)
            if r_task and r_task.get("correct") is not None:
                by_trap.setdefault(trap, []).append(r_task["correct"])

        stats[task] = {
            "accuracy": correct / total,
            "total": total,
            "correct": correct,
            "by_saliency": {k: (sum(v) / len(v) if v else None) for k, v in by_saliency.items()},
            "by_trap_type": {k: (sum(v) / len(v) if v else None) for k, v in by_trap.items()},
        }

    return stats


# ============ Main ============

def main():
    parser = argparse.ArgumentParser(description="VLM Knot Topology Evaluation")
    parser.add_argument("--data_dir", default="./exports")
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--provider", default="openai", choices=["openai", "anthropic"])
    parser.add_argument("--tasks", default="knotted_or_not,knotted_cot")
    parser.add_argument("--output", default="results.json")
    args = parser.parse_args()

    if args.provider == "anthropic":
        from anthropic import Anthropic

        client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    else:
        from openai import OpenAI

        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    data_dir = Path(args.data_dir)
    tasks = [t.strip() for t in args.tasks.split(",") if t.strip()]

    metadata_files = sorted(
        list(data_dir.glob("*/metadata.json")) + list(data_dir.glob("*metadata*.json"))
    )
    print(f"Found {len(metadata_files)} samples in {data_dir}")

    all_results = []
    for i, mf in enumerate(metadata_files):
        with open(mf, encoding="utf-8") as f:
            meta = json.load(f)
        print(
            f"[{i + 1}/{len(metadata_files)}] {meta.get('knotType')} "
            f"slack={meta.get('slackness', 0):.2f} trap={meta.get('trap_type')}"
        )
        result = evaluate_sample(client, args.model, meta, mf.parent, tasks, args.provider)
        if result:
            all_results.append(result)

    stats = compute_stats(all_results, tasks)

    output = {
        "model": args.model,
        "provider": args.provider,
        "stats": stats,
        "samples": all_results,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 50)
    print(f"Model: {args.model}")
    for task, stat in stats.items():
        print(f"\n[{task}] Overall accuracy: {stat['accuracy']:.1%} ({stat['correct']}/{stat['total']})")
        print("  By saliency:")
        for k, v in stat["by_saliency"].items():
            print(f"    {k:8s}: {f'{v:.1%}' if v is not None else 'N/A'}")
        print("  By trap type:")
        for k, v in stat["by_trap_type"].items():
            print(f"    {k:25s}: {f'{v:.1%}' if v is not None else 'N/A'}")


if __name__ == "__main__":
    main()

