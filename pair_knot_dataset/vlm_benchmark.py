#!/usr/bin/env python3
"""
vlm_benchmark.py - Knot topology VLM benchmark script.

Usage:
  # Debug on a few single-image samples
  python vlm_benchmark.py --data_dir ./exports --tasks T1_knotted --limit 5

  # Run all tasks
  python vlm_benchmark.py --data_dir ./exports --tasks all --output results.json

  # Evaluate only hard samples
  python vlm_benchmark.py --data_dir ./exports --tasks T1_knotted --difficulty hard

Dependencies:
  pip install openai

Required env var:
  OPENAI_API_KEY
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from openai import OpenAI


TASKS = {

    # ──────────────────────────────────────────────────────────
    # 第一组：最核心问题 — 是结还是环？（5个，从直接到迂回）
    # ──────────────────────────────────────────────────────────

    "T01_knotted_direct": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Is this rope KNOTTED (tied in a knot that cannot be undone without cutting) "
            "or UNKNOTTED (a simple loop with no knot)?\n\n"
            "First line: one word only — KNOTTED or UNKNOTTED\n"
            "Second line: one sentence describing the key visual evidence."
        ),
        "parse_key": "KNOTTED|UNKNOTTED",
        "answer_fn": "is_knotted",
    },

    "T02_knotted_cot": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop. Reason step by step:\n"
            "1. How many places does the rope cross over or under itself?\n"
            "2. If you could grab both sides of a crossing, could you slide them apart?\n"
            "3. Based on this, is the rope truly knotted or just tangled-looking?\n\n"
            "First line: one word only — KNOTTED or UNKNOTTED"
        ),
        "parse_key": "KNOTTED|UNKNOTTED",
        "answer_fn": "is_knotted",
    },

    "T03_crossing_count": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Count the number of crossings — places where the rope passes over or under itself.\n\n"
            "First line: one choice only —\n"
            "A) 0 crossings (simple loop)\n"
            "B) 1–3 crossings\n"
            "C) 4–6 crossings\n"
            "D) 7 or more crossings\n\n"
            "First line: the letter A, B, C, or D only."
        ),
        "parse_key": "A|B|C|D",
        "answer_fn": "crossing_bucket",   # 见 get_ground_truth()
    },

    "T04_can_untie": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "If you could manipulate this rope freely without cutting it, "
            "could you reshape it into a perfect flat circle?\n\n"
            "First line: one word only — YES or NO\n"
            "Second line: one sentence explaining your reasoning."
        ),
        "parse_key": "YES|NO",
        "answer_fn": "can_untie",    # unknot → YES, knot → NO
    },

    "T05_confidence": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Is this rope knotted or unknotted, and how confident are you?\n\n"
            "First line must be EXACTLY one of these four options:\n"
            "DEFINITELY_KNOTTED\n"
            "PROBABLY_KNOTTED\n"
            "PROBABLY_UNKNOTTED\n"
            "DEFINITELY_UNKNOTTED\n\n"
            "First line: one of the four options above only."
        ),
        "parse_key": "DEFINITELY_KNOTTED|PROBABLY_KNOTTED|PROBABLY_UNKNOTTED|DEFINITELY_UNKNOTTED",
        "answer_fn": "is_knotted_confidence",   # 见 get_ground_truth()
    },

    # ──────────────────────────────────────────────────────────
    # 第二组：形状性质 — 关于 loop 视觉特征（4个）
    # ──────────────────────────────────────────────────────────

    "T06_shape_symmetry": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Does this rope form a shape with obvious rotational symmetry "
            "(e.g., the same pattern repeating 2, 3, or more times around a center)?\n\n"
            "First line: one word only — SYMMETRIC or ASYMMETRIC"
        ),
        "parse_key": "SYMMETRIC|ASYMMETRIC",
        "answer_fn": "is_symmetric",   # torus knots → SYMMETRIC, others → depends
    },

    "T07_shape_flat": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Does the rope lie mostly FLAT (close to a single plane), "
            "or does it have significant 3D DEPTH (extends clearly in three dimensions)?\n\n"
            "First line: one word only — FLAT or DEEP"
        ),
        "parse_key": "FLAT|DEEP",
        "answer_fn": "is_flat",   # high slackness → FLAT, low slackness → DEEP
    },

    "T08_shape_simple": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Does the rope form a SIMPLE shape (roughly circular or oval, easy to follow), "
            "or a COMPLEX shape (tangled, hard to trace the full path)?\n\n"
            "First line: one word only — SIMPLE or COMPLEX"
        ),
        "parse_key": "SIMPLE|COMPLEX",
        "answer_fn": "is_simple",  # unknot/high-slack → SIMPLE, tight knot → COMPLEX
    },

    "T09_knot_family": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a knotted rope.\n"
            "Which best describes what you see?\n\n"
            "A) A simple loop — no real crossings, rope forms an oval or circle\n"
            "B) A trefoil knot — 3 crossings, three-lobed symmetric shape\n"
            "C) A figure-eight knot — 4 crossings, figure-8 or pretzel shape\n"
            "D) A more complex knot — 5 or more crossings\n\n"
            "First line: the letter A, B, C, or D only."
        ),
        "parse_key": "A|B|C|D",
        "answer_fn": "knot_family_label",
    },

    # ──────────────────────────────────────────────────────────
    # 第三组：多环问题 — 仅用于 link 类型样本（3个）
    # ──────────────────────────────────────────────────────────

    "T10_linked": {
        "applicable": "multi",
        "prompt": (
            "Look at this 3D image showing multiple rope loops.\n"
            "Are any two loops LINKED (interlocked so they cannot be separated without cutting) "
            "or are all loops UNLINKED (can be pulled apart freely)?\n\n"
            "First line: one word only — LINKED or UNLINKED"
        ),
        "parse_key": "LINKED|UNLINKED",
        "answer_fn": "is_linked",
    },

    "T11_count_loops": {
        "applicable": "multi",
        "prompt": (
            "Look at this 3D image of rope loops.\n"
            "How many separate rope loops can you count?\n\n"
            "First line: one choice only —\n"
            "A) 1 loop\n"
            "B) 2 loops\n"
            "C) 3 loops\n"
            "D) 4 or more loops\n\n"
            "First line: the letter A, B, C, or D only."
        ),
        "parse_key": "A|B|C|D",
        "answer_fn": "num_loops_label",
    },

    "T12_splittable": {
        "applicable": "multi",
        "prompt": (
            "Look at this 3D image of multiple rope loops.\n"
            "Can these loops be SPLIT into two groups by an imaginary flat plane, "
            "with no rope cut and no loop passing through the plane?\n"
            "(Example: two separate rings sitting side by side = SPLITTABLE)\n\n"
            "First line: one word only — SPLITTABLE or NON-SPLITTABLE"
        ),
        "parse_key": "SPLITTABLE|NON-SPLITTABLE",
        "answer_fn": "is_splittable",
    },

    # ──────────────────────────────────────────────────────────
    # 第四组：配对对比 — 两张图对比（3个）
    # ──────────────────────────────────────────────────────────

    "T13_same_type": {
        "applicable": "pair",
        "prompt": (
            "You are shown Image 1 and Image 2, each showing a closed rope loop.\n"
            "Are these two ropes the SAME knot type (topologically equivalent — "
            "one could be reshaped into the other without cutting), "
            "or are they DIFFERENT knot types?\n\n"
            "First line: one word only — SAME or DIFFERENT"
        ),
        "parse_key": "SAME|DIFFERENT",
        "answer_fn": "label_equivalent",
    },

    "T14_which_harder": {
        "applicable": "pair",
        "prompt": (
            "You are shown Image 1 and Image 2, each showing a closed rope loop.\n"
            "Which rope appears MORE COMPLEX or harder to untangle visually?\n\n"
            "First line: one word only — IMAGE1 or IMAGE2 or EQUAL"
        ),
        "parse_key": "IMAGE1|IMAGE2|EQUAL",
        "answer_fn": "which_harder",   # 基于 difficulty_score 比较
    },

    "T15_same_or_mirror": {
        "applicable": "pair",
        "prompt": (
            "You are shown Image 1 and Image 2, each showing a closed rope loop.\n"
            "They might be:\n"
            "A) The same knot type, same handedness (identical topology)\n"
            "B) Mirror images of each other (same knot, opposite handedness)\n"
            "C) Completely different knot types\n\n"
            "First line: the letter A, B, or C only."
        ),
        "parse_key": "A|B|C",
        "answer_fn": "mirror_label",   # 需要 metadata 里有手性信息
    },
}


def compute_difficulty(metadata: dict[str, Any]) -> dict[str, Any]:
    """
    Compute a difficulty score (0-1) and level from metadata.
    """
    c_min = metadata.get("crossingNumber")
    if c_min is None:
        c_min = metadata.get("crossing_number", 0)
    try:
        c_min_value = float(c_min)
    except (TypeError, ValueError):
        c_min_value = 0.0

    try:
        slackness = float(metadata.get("slackness", 0))
    except (TypeError, ValueError):
        slackness = 0.0
    slackness = max(0.0, min(1.0, slackness))

    trap = metadata.get("trap_type")

    score_topology = min(c_min_value / 10.0, 1.0)
    score_saliency = slackness
    score_trap = 0.3 if trap else 0.0

    difficulty = 0.35 * score_topology + 0.45 * score_saliency + 0.20 * score_trap

    if difficulty < 0.30:
        level = "easy"
    elif difficulty < 0.60:
        level = "medium"
    else:
        level = "hard"

    return {"score": round(difficulty, 3), "level": level}


def encode_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def ask_vlm(client: OpenAI, model: str, prompt: str, image_paths: list[str]) -> str:
    """Send image(s) + prompt to VLM and return raw text response."""
    content: list[dict[str, Any]] = []
    for i, path in enumerate(image_paths):
        if len(image_paths) > 1:
            content.append({"type": "text", "text": f"Image {i + 1}:"})
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{encode_image(path)}"},
            }
        )
    content.append({"type": "text", "text": prompt})

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_completion_tokens=150,
        temperature=0,
    )
    text = response.choices[0].message.content
    return (text or "").strip()


def _first_keyword(raw_response: str) -> str:
    first_line = (raw_response or "").splitlines()[0].strip() if raw_response else ""
    if not first_line:
        return ""

    token = first_line.split()[0]
    token = token.strip("`\"'[]{}()<>.,;:!?")
    token = token.rstrip(").,;:!?")
    return token.upper()


def parse_answer(raw: str, task_id: str) -> str:
    """从 VLM 回答的第一行提取关键词"""
    first_line = (raw or "").splitlines()[0].strip().upper()
    # 去掉标点
    first_word = first_line.split()[0].strip(".,;:!?\"'()[]") if first_line else ""

    task = TASKS.get(task_id, {})
    keys = task.get("parse_key", "").split("|")

    for key in keys:
        if first_word == key or first_line.startswith(key):
            return key

    return "unclear"


def _as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"1", "true", "yes", "y", "linked", "knotted", "equivalent", "splittable"}:
            return True
        if v in {
            "0",
            "false",
            "no",
            "n",
            "unlinked",
            "unknotted",
            "different",
            "non-splittable",
            "non_splittable",
        }:
            return False
    return None


def get_ground_truth(metadata: dict, task_id: str):
    """从 metadata.json 提取每个 task 的正确答案"""

    kt = metadata.get("knotType", "")
    is_knot = metadata.get("isKnot", False)
    is_link = metadata.get("isLink", False)
    crossing = metadata.get("crossingNumber") or 0
    slackness = metadata.get("slackness", 0)

    if task_id == "T01_knotted_direct":
        return "KNOTTED" if is_knot else "UNKNOTTED"

    if task_id == "T02_knotted_cot":
        return "KNOTTED" if is_knot else "UNKNOTTED"

    if task_id == "T03_crossing_count":
        c = crossing or 0
        if c == 0: return "A"
        if c <= 3: return "B"
        if c <= 6: return "C"
        return "D"

    if task_id == "T04_can_untie":
        # unknot 可以解开，knot 不能
        return "YES" if not is_knot else "NO"

    if task_id == "T05_confidence":
        # 高 slackness 的结 → 视觉上模糊，ground truth 仍然确定，但我们
        # 期待 VLM 在高 slackness 时回答 PROBABLY 而不是 DEFINITELY
        return "DEFINITELY_KNOTTED" if is_knot else "DEFINITELY_UNKNOTTED"

    if task_id == "T06_shape_symmetry":
        # torus knots 有旋转对称性
        symmetric_types = {"trefoil", "torus_2_5", "torus_2_7", "torus_2_9",
                           "torus_3_4", "torus_3_5", "unknot"}
        return "SYMMETRIC" if kt in symmetric_types else "ASYMMETRIC"

    if task_id == "T07_shape_flat":
        # slackness > 0.6 时绳子被压平
        return "FLAT" if slackness > 0.6 else "DEEP"

    if task_id == "T08_shape_simple":
        # unknot 或高 slackness 的结看起来简单
        if not is_knot:
            return "SIMPLE"
        return "SIMPLE" if slackness > 0.7 else "COMPLEX"

    if task_id == "T09_knot_family":
        mapping = {
            "unknot": "A", "twisted_ring": "A", "kinky_unknot": "A", "spiral_disk": "A",
            "trefoil": "B",
            "figure8": "C",
        }
        return mapping.get(kt, "D")  # 其他复杂结 → D

    if task_id == "T10_linked":
        # isLink 且不是 unlinked_rings → LINKED
        if not is_link:
            return "UNLINKED"
        return "UNLINKED" if kt == "unlinked_rings" else "LINKED"

    if task_id == "T11_count_loops":
        num = metadata.get("numComponents") or (2 if is_link else 1)
        if num == 1: return "A"
        if num == 2: return "B"
        if num == 3: return "C"
        return "D"

    if task_id == "T12_splittable":
        return "SPLITTABLE" if kt == "unlinked_rings" else "NON-SPLITTABLE"

    if task_id == "T13_same_type":
        equiv = metadata.get("label_equivalent", False)
        return "SAME" if equiv else "DIFFERENT"

    if task_id == "T14_which_harder":
        # 需要 pair metadata，这里留给 pair 处理逻辑
        score_a = metadata.get("difficulty_score_a", 0)
        score_b = metadata.get("difficulty_score_b", 0)
        if abs(score_a - score_b) < 0.1:
            return "EQUAL"
        return "IMAGE1" if score_a > score_b else "IMAGE2"

    if task_id == "T15_same_or_mirror":
        # 需要手性信息，暂时用 equivalent 字段代替
        equiv = metadata.get("label_equivalent", False)
        return "A" if equiv else "C"

    return None


def sample_applicable(metadata: dict, task_id: str) -> bool:
    """判断这个样本是否应该被这个 task 测试"""
    task = TASKS.get(task_id)
    if not task:
        return False

    applicable = task["applicable"]
    is_link = metadata.get("isLink", False)

    if applicable == "single":
        return not is_link          # 非多环样本

    if applicable == "multi":
        return bool(is_link)        # 只有多环样本

    if applicable == "pair":
        return "label_equivalent" in metadata   # 有配对标签的样本

    return False


def print_report(results: list[dict[str, Any]]) -> None:
    """Print accuracy report grouped by task and difficulty."""
    print("\n" + "=" * 60)
    print("VLM BENCHMARK RESULTS")
    print("=" * 60)

    if not results:
        print("\nNo valid results to report.")
        return

    by_task: dict[str, dict[str, Any]] = {}
    for r in results:
        task = r["task"]
        if task not in by_task:
            by_task[task] = {
                "total": 0,
                "correct": 0,
                "by_difficulty": {},
            }

        by_task[task]["total"] += 1
        if r.get("correct"):
            by_task[task]["correct"] += 1

        diff = r.get("difficulty_level", "unknown")
        diff_stats = by_task[task]["by_difficulty"]
        if diff not in diff_stats:
            diff_stats[diff] = {"total": 0, "correct": 0}
        diff_stats[diff]["total"] += 1
        if r.get("correct"):
            diff_stats[diff]["correct"] += 1

    for task, stats in by_task.items():
        total = stats["total"]
        correct = stats["correct"]
        acc = correct / total if total > 0 else 0.0
        print(f"\n[{task}] Accuracy: {acc:.1%} ({correct}/{total})")

        for level in ["easy", "medium", "hard", "unknown"]:
            d = stats["by_difficulty"].get(level, {})
            if d.get("total", 0) > 0:
                d_acc = d["correct"] / d["total"]
                print(f"  {level:8s}: {d_acc:.1%} ({d['correct']}/{d['total']})")

    print("\n-- Trap Type Analysis --")
    trap_stats: dict[str, dict[str, int]] = {}
    for r in results:
        trap = r.get("trap_type") or "none"
        trap_stats.setdefault(trap, {"total": 0, "correct": 0})
        trap_stats[trap]["total"] += 1
        if r.get("correct"):
            trap_stats[trap]["correct"] += 1

    for trap, stats in trap_stats.items():
        total = stats["total"]
        acc = stats["correct"] / total if total > 0 else 0.0
        print(f"  {trap:25s}: {acc:.1%} ({stats['correct']}/{total})")


def _extract_image_name(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        for key in ("filename", "path", "file", "image", "image_path"):
            v = value.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _resolve_image_path(meta_path: Path, image_name: str) -> Path | None:
    image_path = Path(image_name)
    if image_path.is_absolute():
        return image_path if image_path.exists() else None

    candidate = (meta_path.parent / image_name).resolve()
    if candidate.exists():
        return candidate

    nested_candidate = (meta_path.parent / "images" / image_name).resolve()
    if nested_candidate.exists():
        return nested_candidate

    return None


def _pick_single_image(metadata: dict[str, Any], meta_path: Path) -> Path | None:
    images = metadata.get("images", [])
    if isinstance(images, list) and images:
        names = [n for n in (_extract_image_name(i) for i in images) if n]
        if names:
            preferred = next((n for n in names if "iso_fr" in n), names[0])
            path = _resolve_image_path(meta_path, preferred)
            if path:
                return path

    for key in ("image", "image_path", "filename"):
        name = _extract_image_name(metadata.get(key))
        if name:
            path = _resolve_image_path(meta_path, name)
            if path:
                return path

    return None


def _pick_pair_images(metadata: dict[str, Any], meta_path: Path) -> list[Path]:
    paired_keys = [
        ("image1", "image2"),
        ("image_1", "image_2"),
        ("img1", "img2"),
        ("left_image", "right_image"),
    ]
    for k1, k2 in paired_keys:
        n1 = _extract_image_name(metadata.get(k1))
        n2 = _extract_image_name(metadata.get(k2))
        if n1 and n2:
            p1 = _resolve_image_path(meta_path, n1)
            p2 = _resolve_image_path(meta_path, n2)
            if p1 and p2:
                return [p1, p2]

    for key in ("pair_images", "pairImages", "image_pair", "imagePair"):
        values = metadata.get(key)
        if isinstance(values, list) and len(values) >= 2:
            names = [n for n in (_extract_image_name(v) for v in values) if n]
            if len(names) >= 2:
                p1 = _resolve_image_path(meta_path, names[0])
                p2 = _resolve_image_path(meta_path, names[1])
                if p1 and p2:
                    return [p1, p2]

    if "label_equivalent" in metadata:
        images = metadata.get("images")
        if isinstance(images, list) and len(images) >= 2:
            names = [n for n in (_extract_image_name(v) for v in images) if n]
            if len(names) >= 2:
                p1 = _resolve_image_path(meta_path, names[0])
                p2 = _resolve_image_path(meta_path, names[1])
                if p1 and p2:
                    return [p1, p2]

    return []


def _task_list_from_arg(tasks_arg: str) -> list[str]:
    if tasks_arg.strip().lower() == "all":
        return list(TASKS.keys())
    return [t.strip() for t in tasks_arg.split(",") if t.strip()]


def _find_metadata_files(data_dir: Path) -> list[Path]:
    candidates = list(data_dir.glob("**/metadata*.json")) + list(data_dir.glob("**/*metadata*.json"))
    unique_paths: list[Path] = []
    seen: set[str] = set()
    for path in sorted(candidates):
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        unique_paths.append(path)
    return unique_paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", default="./exports", help="Directory containing images and metadata")
    parser.add_argument("--tasks", default="T01_knotted_direct", help="Comma-separated task list or 'all'")
    parser.add_argument("--model", default="gpt-5.2", help="VLM model name")
    parser.add_argument("--output", default="results.json", help="Output JSON file path")
    parser.add_argument("--limit", type=int, default=None, help="Maximum metadata samples to test")
    parser.add_argument(
        "--difficulty",
        default=None,
        choices=["easy", "medium", "hard"],
        help="Only evaluate samples in a specific difficulty level",
    )
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("[ERROR] OPENAI_API_KEY is not set.")
        sys.exit(1)

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"[ERROR] data_dir does not exist: {data_dir}")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    task_ids = _task_list_from_arg(args.tasks)
    valid_task_ids = [t for t in task_ids if t in TASKS]
    invalid_task_ids = [t for t in task_ids if t not in TASKS]
    for task_id in invalid_task_ids:
        print(f"[WARN] Unknown task id: {task_id}")
    if not valid_task_ids:
        print("[ERROR] No valid tasks selected.")
        sys.exit(1)

    meta_files = _find_metadata_files(data_dir)
    print(f"Found {len(meta_files)} metadata files in {data_dir}")
    if not meta_files:
        print(
            "[WARN] No metadata files found. Expected names like "
            "'metadata.json' or '*_metadata.json'."
        )

    all_results: list[dict[str, Any]] = []
    scanned = 0

    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Failed to load {meta_path}: {exc}")
            continue

        diff_info = compute_difficulty(metadata)
        if args.difficulty and diff_info["level"] != args.difficulty:
            continue

        scanned += 1
        sample_name = str(metadata.get("id") or metadata.get("sample_id") or meta_path.parent.name)
        single_image = _pick_single_image(metadata, meta_path)
        pair_images = _pick_pair_images(metadata, meta_path)
        warned_single_missing = False
        warned_pair_missing = False

        for task_id in valid_task_ids:
            if not sample_applicable(metadata, task_id):
                continue

            task = TASKS[task_id]
            input_type = "pair" if task.get("applicable") == "pair" else "single"

            image_paths: list[Path] = []
            if input_type == "single":
                if not single_image:
                    if not warned_single_missing:
                        print(
                            f"[WARN] Skip sample={sample_name}: no existing image file found "
                            f"for metadata {meta_path.name}"
                        )
                        warned_single_missing = True
                    continue
                image_paths = [single_image]
            elif input_type == "pair":
                if len(pair_images) != 2:
                    if not warned_pair_missing:
                        print(
                            f"[WARN] Skip sample={sample_name}: no valid image pair found "
                            f"for metadata {meta_path.name}"
                        )
                        warned_pair_missing = True
                    continue
                image_paths = pair_images
            else:
                continue

            try:
                raw = ask_vlm(client, args.model, task["prompt"], [str(p) for p in image_paths])
                parsed = parse_answer(raw, task_id)
                gt = get_ground_truth(metadata, task_id)
                correct = (parsed == gt) if gt is not None else None

                result = {
                    "task": task_id,
                    "sample_id": sample_name,
                    "metadata_path": str(meta_path),
                    "input_type": input_type,
                    "image_paths": [str(p) for p in image_paths],
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

                status = "?" if correct is None else ("+" if correct else "-")
                print(
                    f"[{status}] {task_id} | sample={sample_name} | "
                    f"gt={gt} | ans={parsed} | difficulty={diff_info['level']}"
                )
                time.sleep(0.5)
            except Exception as exc:  # noqa: BLE001
                print(f"[ERROR] {task_id} on {sample_name}: {exc}")

        if args.limit and scanned >= args.limit:
            break

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {len(all_results)} results to {args.output}")

    print_report(all_results)


if __name__ == "__main__":
    main()
