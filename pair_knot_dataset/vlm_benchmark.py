#!/usr/bin/env python3
"""
vlm_benchmark.py - Knot topology VLM benchmark (v3).

10 tasks across 4 groups:
  - Group 1 (T01-T04): Knottedness — is it a knot?
  - Group 2 (T06, T09): Classification — what kind / deceptive?
  - Group 3 (T10-T12): Multi-component — links and chains
  - Group 4 (T13): Pair comparison — two images

Removed by mentor review: T05 (subjective confidence), T07 (too specific torus pq),
T08 (too specific trefoil), T14 (subjective complexity comparison),
T15 (no chirality data in dataset, B class empty).

Usage:
  python vlm_benchmark.py --data_dir ./dataset --tasks all --limit 5
  python vlm_benchmark.py --data_dir ./dataset --tasks T01_knotted_direct --difficulty hard

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
import re
import sys
import time
from pathlib import Path
from typing import Any

from openai import OpenAI

from question_phrasings import PHRASINGS, ANSWER_FORMATS, build_prompt, num_phrasings


# ═══════════════════════════════════════════════════════════════════
# TASK DEFINITIONS — 10 active tasks (T05/T07/T08/T14/T15 removed)
# ═══════════════════════════════════════════════════════════════════

TASKS = {

    # ── Group 1: Knottedness (5 tasks) ────────────────────────────

    "T01_knotted_direct": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "A knotted loop has places where the rope clearly crosses over and under "
            "itself in an interlocking pattern that cannot be untangled without cutting.\n"
            "An unknotted loop may look wavy or twisted but has no true over-under crossings.\n\n"
            "Is this rope KNOTTED or UNKNOTTED?\n\n"
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
            "Final answer on the LAST line: one word only — KNOTTED or UNKNOTTED"
        ),
        "parse_key": "KNOTTED|UNKNOTTED",
        "answer_fn": "is_knotted",
        "parse_mode": "last_line",
    },

    "T03_crossing_count": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Count the places where one section of rope passes over or under another.\n"
            "A crossing is where you can see one strand going OVER while another goes UNDER.\n"
            "Note: a trefoil knot has 3 crossings, and complex knots can have 7-10+.\n\n"
            "Choose one:\n"
            "  A) 0 crossings — simple loop, no over-under patterns\n"
            "  B) 3-4 crossings — simple knot (e.g. trefoil, figure-eight)\n"
            "  C) 5-7 crossings — moderately complex knot\n"
            "  D) 8 or more crossings — very complex knot\n\n"
            "Answer with the letter only: A, B, C, or D."
        ),
        "parse_key": "A|B|C|D",
        "answer_fn": "crossing_bucket",
    },

    "T04_can_untie": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Could this loop be smoothly deformed into a perfect flat circle "
            "WITHOUT cutting the rope?\n\n"
            "Answer with one word only: YES or NO."
        ),
        "parse_key": "YES|NO",
        "answer_fn": "can_untie",
    },

    # T05_confidence — REMOVED (mentor: subjective, can't ground truth confidence level)

    # ── Group 2: Classification (2 tasks) ─────────────────────────

    "T06_knot_family": {
        "applicable": "single",
        "prompt": (
            "Look at this 3D image of a closed rope loop.\n"
            "Which knot family does it most likely belong to?\n\n"
            "Choose one:\n"
            "  UNKNOT — a simple loop with no genuine over-under crossings; "
            "may appear wavy or twisted but can be smoothed into a circle\n"
            "  TORUS — a torus knot (e.g. trefoil, cinquefoil); "
            "has 3 or more lobes arranged symmetrically like a clover or star, "
            "with a repeating over-under weaving pattern\n"
            "  TWIST — a twist knot (e.g. figure-eight); "
            "forms a flattened pretzel shape with a central twist region "
            "where strands cross back and forth\n"
            "  OTHER — none of the above, or too complex to tell\n\n"
            "Answer with one word only: UNKNOT, TORUS, TWIST, or OTHER."
        ),
        "parse_key": "UNKNOT|TORUS|TWIST|OTHER",
        "answer_fn": "knot_family",
    },

    # T07_torus_pq — REMOVED (mentor: too specific, requires mathematical knowledge)
    # T08_trefoil_or_not — REMOVED (mentor: too specific, testing name recognition not topology)

    "T09_loose_knot_trap": {
        "applicable": "single",
        "filter_fn": "is_trap_candidate",
        "prompt": (
            "Look at this 3D image of a closed rope loop that appears complex.\n"
            "Examine the crossings carefully: does the rope form genuine "
            "over-under interlocking crossings that prevent unknotting, "
            "or could every apparent crossing be removed by sliding the rope?\n\n"
            "A real knot has strands that lock around each other.\n"
            "A loose illusion has strands that merely overlap without locking.\n\n"
            "Answer: ACTUAL_KNOT if it is truly knotted, "
            "LOOSE_ILLUSION if it only looks knotted but is actually unknotted."
        ),
        "parse_key": "ACTUAL_KNOT|LOOSE_ILLUSION",
        "answer_fn": "is_actual_knot",
    },

    # ── Group 3: Multi-component (3 tasks) ────────────────────────

    "T10_linked_or_not": {
        "applicable": "multi",
        "prompt": (
            "You are shown an image containing multiple closed rope loops.\n"
            "Are any of the loops linked together (i.e., cannot be separated "
            "without cutting)?\n\n"
            "Answer with one word only: LINKED or UNLINKED."
        ),
        "parse_key": "LINKED|UNLINKED",
        "answer_fn": "is_linked",
    },

    "T11_hopflink_or_not": {
        "applicable": "multi",
        "prompt": (
            "You are shown an image containing closed rope loops.\n"
            "A Hopf link is the simplest 2-component link: exactly two rings, "
            "each passing through the other exactly once.\n\n"
            "Important: chain links (3+ rings in a row), Borromean rings "
            "(3 rings mutually interlocked), and unlinked rings are NOT Hopf links.\n\n"
            "Is this a Hopf link?\n"
            "Answer with one word only: HOPF or NOT_HOPF."
        ),
        "parse_key": "HOPF|NOT_HOPF",
        "answer_fn": "is_hopf",
    },

    "T12_link_components": {
        "applicable": "multi",
        "prompt": (
            "You are shown an image containing multiple closed rope loops.\n"
            "How many separate loop components are present?\n\n"
            "Answer with a single integer (e.g., 2, 3, 4)."
        ),
        "parse_key": "INTEGER",
        "answer_fn": "num_components",
    },

    # ── Group 4: Pair comparison (1 task) ─────────────────────────

    "T13_same_knot_type": {
        "applicable": "pair",
        "prompt": (
            "You are shown Image 1 and Image 2, each showing a closed rope loop.\n"
            "Are they the SAME knot type (topologically equivalent — "
            "one could be continuously deformed into the other without cutting), "
            "or DIFFERENT knot types?\n\n"
            "Answer with one word only: SAME or DIFFERENT."
        ),
        "parse_key": "SAME|DIFFERENT",
        "answer_fn": "label_equivalent",
    },

    # T14_which_more_complex — REMOVED (mentor: subjective, "more complex" not well-defined)
    # T15_same_or_mirror — REMOVED (mentor: no chirality data in dataset, B class empty)
}

# Verify: 10 active tasks
assert len(TASKS) == 10, f"Expected 10 tasks, got {len(TASKS)}"


# ═══════════════════════════════════════════════════════════════════
# DIFFICULTY COMPUTATION
# ═══════════════════════════════════════════════════════════════════

def compute_difficulty(metadata: dict[str, Any]) -> dict[str, Any]:
    """Compute difficulty score (0-1) and level from metadata."""
    crossing = _safe_float(metadata.get("crossingNumber",
                           metadata.get("crossing_number", 0)))
    slackness = max(0.0, min(1.0, _safe_float(metadata.get("slackness", 0))))
    trap = metadata.get("trap_type")
    is_deceptive = metadata.get("isDeceptive", False)

    score_topology = min(crossing / 10.0, 1.0)
    score_saliency = slackness
    score_trap = 0.3 if (trap or is_deceptive) else 0.0

    difficulty = 0.35 * score_topology + 0.45 * score_saliency + 0.20 * score_trap

    if difficulty < 0.30:
        level = "easy"
    elif difficulty < 0.60:
        level = "medium"
    else:
        level = "hard"

    return {"score": round(difficulty, 3), "level": level}


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ═══════════════════════════════════════════════════════════════════
# ANSWER PARSING — robust extraction from VLM responses
# ═══════════════════════════════════════════════════════════════════

def parse_answer(raw: str, task_id: str) -> str:
    """Extract the answer keyword from VLM response."""
    if not raw or not raw.strip():
        return "unclear"

    task = TASKS.get(task_id, {})
    parse_key = task.get("parse_key", "")
    parse_mode = task.get("parse_mode", "first_line")

    # Special: integer parsing for T12
    if parse_key == "INTEGER":
        return _parse_integer(raw)

    keys = [k for k in parse_key.split("|") if k]
    if not keys:
        return "unclear"

    # Pick the right line
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
    if not lines:
        return "unclear"

    target_line = lines[-1] if parse_mode == "last_line" else lines[0]

    # Normalize: uppercase, strip common prefixes/suffixes
    normalized = target_line.upper()
    normalized = re.sub(r'^(ANSWER|RESPONSE|MY ANSWER|FINAL ANSWER)\s*[:：]\s*', '', normalized)
    normalized = normalized.strip("`\"'[]{}()<>.,;:!?* ")

    # Direct match: exact key in normalized line
    for key in keys:
        if normalized == key:
            return key

    # Starts-with match
    for key in keys:
        if normalized.startswith(key):
            return key

    # Contains match (for responses like "The answer is KNOTTED")
    for key in keys:
        # Use word boundary to avoid partial matches
        pattern = r'\b' + re.escape(key) + r'\b'
        if re.search(pattern, normalized):
            return key

    # Letter match for A/B/C/D tasks: handle "B)" or "B." or "Option B"
    if all(len(k) <= 2 for k in keys):
        first_char = normalized.lstrip("OPTION ")[0:1] if normalized else ""
        for key in keys:
            if first_char == key:
                return key

    # T05 special: accept direction even if confidence level differs
    # (handled in scoring, not parsing)

    return "unclear"


def _parse_integer(raw: str) -> str:
    """Extract first integer from response."""
    lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
    for line in lines:
        nums = re.findall(r'\b(\d+)\b', line)
        if nums:
            return nums[0]
    return "unclear"


# ═══════════════════════════════════════════════════════════════════
# GROUND TRUTH — derive correct answer from metadata
# ═══════════════════════════════════════════════════════════════════

# Knot type → family mapping
_FAMILY_MAP = {
    "unknot": "UNKNOT", "twisted_ring": "UNKNOT", "kinky_unknot": "UNKNOT",
    "spiral_disk": "UNKNOT",
    "trefoil": "TORUS", "loose_open_knot": "TORUS",  # loose_open_knot is a loose trefoil
    "torus_2_5": "TORUS", "torus_2_7": "TORUS",
    "torus_2_9": "TORUS", "torus_3_4": "TORUS", "torus_3_5": "TORUS",
    "figure8": "TWIST",
}

# Knot type → torus (p,q) label
_TORUS_PQ_MAP = {
    "trefoil": "A",      # T(2,3)
    "torus_2_5": "B",    # T(2,5)
    "torus_2_7": "C",    # T(2,7)
    "torus_3_4": "D",    # T(3,4)
    "torus_3_5": "E",    # T(3,5)
}

# Symmetric knot types (have rotational symmetry)
_SYMMETRIC_TYPES = {
    "unknot", "trefoil", "torus_2_5", "torus_2_7", "torus_2_9",
    "torus_3_4", "torus_3_5",
}

# Deceptive unknot types (look knotted but are unknotted)
_DECEPTIVE_TYPES = {"twisted_ring", "spiral_disk", "kinky_unknot"}


def get_ground_truth(metadata: dict, task_id: str) -> str | None:
    """Derive ground truth answer from metadata for a given task."""
    kt = metadata.get("knotType", "")
    is_knot = metadata.get("isKnot", False)
    is_unknot = metadata.get("isUnknot", True)
    is_link = metadata.get("isLink", False)
    is_deceptive = metadata.get("isDeceptive", False)
    crossing = metadata.get("crossingNumber") or 0
    slackness = _safe_float(metadata.get("slackness", 0))
    trap_type = metadata.get("trap_type")

    # ── Group 1: Knottedness ──

    if task_id in ("T01_knotted_direct", "T02_knotted_cot"):
        return "KNOTTED" if is_knot else "UNKNOTTED"

    if task_id == "T03_crossing_count":
        c = int(crossing) if crossing else 0
        if c == 0:
            return "A"
        if c <= 4:
            return "B"
        if c <= 7:
            return "C"
        return "D"

    if task_id == "T04_can_untie":
        return "YES" if not is_knot else "NO"

    # T05 removed

    # ── Group 2: Classification ──

    if task_id == "T06_knot_family":
        return _FAMILY_MAP.get(kt, "OTHER")

    # T07, T08 removed

    if task_id == "T09_loose_knot_trap":
        # Deceptive unknots → LOOSE_ILLUSION; actual knots → ACTUAL_KNOT
        if kt in _DECEPTIVE_TYPES or (is_deceptive and not is_knot):
            return "LOOSE_ILLUSION"
        return "ACTUAL_KNOT"

    # ── Group 3: Multi-component ──

    if task_id == "T10_linked_or_not":
        if not is_link:
            return "UNLINKED"
        return "UNLINKED" if kt == "unlinked_rings" else "LINKED"

    if task_id == "T11_hopflink_or_not":
        return "HOPF" if kt == "hopf_link" else "NOT_HOPF"

    if task_id == "T12_link_components":
        num = metadata.get("numComponents")
        if num is None:
            # Infer from type
            if kt == "hopf_link" or kt == "unlinked_rings":
                num = 2
            elif kt == "borromean":
                num = 3
            elif kt == "chain":
                num = metadata.get("chainLinks", 3)
            elif is_link:
                num = 2
            else:
                num = 1
        return str(int(num))

    # ── Group 4: Pair comparison ──

    if task_id == "T13_same_knot_type":
        equiv = metadata.get("label_equivalent", False)
        return "SAME" if equiv else "DIFFERENT"

    # T14, T15 removed

    return None


# ═══════════════════════════════════════════════════════════════════
# SCORING — more nuanced than exact match for some tasks
# ═══════════════════════════════════════════════════════════════════

def score_answer(parsed: str, gt: str, task_id: str) -> dict[str, Any]:
    """
    Score a parsed answer against ground truth.
    Returns {correct: bool, partial: bool, detail: str}.
    """
    if gt is None or parsed == "unclear":
        return {"correct": False, "partial": False, "detail": "missing"}

    # T12: integer comparison
    if task_id == "T12_link_components":
        try:
            return {
                "correct": int(parsed) == int(gt),
                "partial": abs(int(parsed) - int(gt)) == 1,
                "detail": f"pred={parsed},gt={gt}",
            }
        except ValueError:
            return {"correct": False, "partial": False, "detail": "parse_fail"}

    # Default: exact match
    return {
        "correct": parsed == gt,
        "partial": False,
        "detail": "exact" if parsed == gt else f"pred={parsed},gt={gt}",
    }


# ═══════════════════════════════════════════════════════════════════
# SAMPLE FILTERING — which samples apply to which tasks
# ═══════════════════════════════════════════════════════════════════

_LINK_TYPES = {"hopf_link", "unlinked_rings", "chain", "borromean"}
_KNOWN_KNOT_TYPES = set(_FAMILY_MAP.keys()) | _LINK_TYPES
_EXCLUDED_TYPES: set[str] = set()  # No excluded types currently


def sample_applicable(metadata: dict, task_id: str) -> bool:
    """Check if this sample should be tested with this task."""
    task = TASKS.get(task_id)
    if not task:
        return False

    applicable = task["applicable"]
    kt = metadata.get("knotType", "")
    # Detect links: explicit flag OR known link type
    is_link = metadata.get("isLink", False) or (kt in _LINK_TYPES)
    is_knot = metadata.get("isKnot", False)
    is_deceptive = metadata.get("isDeceptive", False)

    # Skip excluded/unknown types
    if kt in _EXCLUDED_TYPES:
        return False

    # Basic type filtering
    if applicable == "single" and is_link:
        return False
    if applicable == "multi" and not is_link:
        return False
    if applicable == "pair" and "label_equivalent" not in metadata:
        return False

    # Task-specific filters
    filter_fn = task.get("filter_fn")

    if filter_fn == "is_torus_knot":
        # T07: only show to torus knots (and a few non-torus for F option)
        family = _FAMILY_MAP.get(kt, "OTHER")
        return family == "TORUS" or (is_knot and family != "TORUS")

    if filter_fn == "is_trap_candidate":
        # T09: only types relevant to the loose-knot trap scenario:
        # deceptive unknots + low-crossing knots that could be confused
        _T09_RELEVANT_KNOTS = {"trefoil", "figure8", "loose_open_knot"}
        return is_deceptive or kt in _T09_RELEVANT_KNOTS

    return True


# ═══════════════════════════════════════════════════════════════════
# VLM API INTERACTION
# ═══════════════════════════════════════════════════════════════════

def encode_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def ask_vlm(client: OpenAI, model: str, prompt: str, image_paths: list[str]) -> str:
    """Send image(s) + prompt to VLM and return raw text response."""
    content: list[dict[str, Any]] = []
    for i, path in enumerate(image_paths):
        if len(image_paths) > 1:
            content.append({"type": "text", "text": f"[Image {i + 1}]"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{encode_image(path)}",
                    "detail": "high",
                },
            }
        )
    content.append({"type": "text", "text": prompt})

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_completion_tokens=200,
        temperature=0,
    )
    text = response.choices[0].message.content
    return (text or "").strip()


# ═══════════════════════════════════════════════════════════════════
# IMAGE PATH RESOLUTION
# ═══════════════════════════════════════════════════════════════════

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
    """Select one image for single-image tasks. Prefer iso_fr angle."""
    images = metadata.get("images", [])
    if isinstance(images, list) and images:
        names = [n for n in (_extract_image_name(i) for i in images) if n]
        if names:
            # Prefer isometric front-right view — most informative angle
            preferred = next((n for n in names if "iso_fr" in n), None)
            if not preferred:
                preferred = next((n for n in names if "front" in n), names[0])
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
    """Select two images for pair comparison tasks."""
    paired_keys = [
        ("image1", "image2"), ("image_1", "image_2"),
        ("img1", "img2"), ("left_image", "right_image"),
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


# ═══════════════════════════════════════════════════════════════════
# REPORT GENERATION
# ═══════════════════════════════════════════════════════════════════

def print_report(results: list[dict[str, Any]]) -> None:
    """Print accuracy report grouped by task, difficulty, and trap type."""
    print("\n" + "=" * 70)
    print("VLM BENCHMARK RESULTS")
    print("=" * 70)

    if not results:
        print("\nNo valid results to report.")
        return

    # Overall stats
    total = len(results)
    correct = sum(1 for r in results if r.get("correct"))
    print(f"\nOverall: {correct}/{total} = {correct/total:.1%}")

    # By task
    by_task: dict[str, list[dict]] = {}
    for r in results:
        by_task.setdefault(r["task"], []).append(r)

    for task_id in TASKS:
        task_results = by_task.get(task_id, [])
        if not task_results:
            continue

        n = len(task_results)
        c = sum(1 for r in task_results if r.get("correct"))
        acc = c / n if n > 0 else 0.0
        print(f"\n[{task_id}] {acc:.1%} ({c}/{n})")

        # By difficulty
        for level in ("easy", "medium", "hard"):
            level_results = [r for r in task_results if r.get("difficulty_level") == level]
            if level_results:
                lc = sum(1 for r in level_results if r.get("correct"))
                ln = len(level_results)
                print(f"  {level:8s}: {lc/ln:.1%} ({lc}/{ln})")

    # Trap type analysis
    print("\n-- Trap Type Analysis --")
    trap_stats: dict[str, dict[str, int]] = {}
    for r in results:
        trap = r.get("trap_type") or "none"
        trap_stats.setdefault(trap, {"total": 0, "correct": 0})
        trap_stats[trap]["total"] += 1
        if r.get("correct"):
            trap_stats[trap]["correct"] += 1

    for trap, stats in sorted(trap_stats.items()):
        n = stats["total"]
        acc = stats["correct"] / n if n > 0 else 0.0
        print(f"  {trap:25s}: {acc:.1%} ({stats['correct']}/{n})")

    # Knot type breakdown
    print("\n-- Per Knot Type --")
    by_knot: dict[str, dict[str, int]] = {}
    for r in results:
        kt = r.get("knot_type") or "pair"
        by_knot.setdefault(kt, {"total": 0, "correct": 0})
        by_knot[kt]["total"] += 1
        if r.get("correct"):
            by_knot[kt]["correct"] += 1

    for kt, stats in sorted(by_knot.items(), key=lambda x: x[0] or ""):
        n = stats["total"]
        acc = stats["correct"] / n if n > 0 else 0.0
        print(f"  {kt:25s}: {acc:.1%} ({stats['correct']}/{n})")


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def _task_list_from_arg(tasks_arg: str) -> list[str]:
    if tasks_arg.strip().lower() == "all":
        return list(TASKS.keys())
    return [t.strip() for t in tasks_arg.split(",") if t.strip()]


def _find_metadata_files(data_dir: Path) -> list[Path]:
    candidates = (
        list(data_dir.glob("**/metadata*.json")) +
        list(data_dir.glob("**/*metadata*.json"))
    )
    unique_paths: list[Path] = []
    seen: set[str] = set()
    for path in sorted(candidates):
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            unique_paths.append(path)
    return unique_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="VLM Knot Topology Benchmark v2")
    parser.add_argument("--data_dir", default="./dataset",
                        help="Directory containing images and metadata")
    parser.add_argument("--tasks", default="all",
                        help="Comma-separated task IDs or 'all'")
    parser.add_argument("--model", default="gpt-4o",
                        help="VLM model name (default: gpt-4o)")
    parser.add_argument("--output", default="results.json",
                        help="Output JSON path")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max metadata samples to evaluate")
    parser.add_argument("--difficulty", default=None,
                        choices=["easy", "medium", "hard"],
                        help="Filter by difficulty level")
    parser.add_argument("--phrasing", type=int, default=None,
                        help="Use a specific phrasing index (0-19). "
                             "If omitted, uses the original fixed prompt.")
    parser.add_argument("--all-phrasings", action="store_true",
                        help="Run all 20 phrasings per task (generates 200 unique questions)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan without calling API")
    args = parser.parse_args()

    # API key check (skip for dry-run)
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not args.dry_run:
        print("[ERROR] OPENAI_API_KEY is not set.")
        sys.exit(1)

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"[ERROR] data_dir does not exist: {data_dir}")
        sys.exit(1)

    client = OpenAI(api_key=api_key or "dry-run", timeout=60.0) if not args.dry_run else None
    task_ids = _task_list_from_arg(args.tasks)
    valid_task_ids = [t for t in task_ids if t in TASKS]
    for t in task_ids:
        if t not in TASKS:
            print(f"[WARN] Unknown task: {t}")
    if not valid_task_ids:
        print("[ERROR] No valid tasks selected.")
        sys.exit(1)

    meta_files = _find_metadata_files(data_dir)
    print(f"Found {len(meta_files)} metadata files in {data_dir}")
    if not meta_files:
        print("[WARN] No metadata files found.")

    all_results: list[dict[str, Any]] = []
    scanned = 0

    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as exc:
            print(f"[WARN] Failed to load {meta_path}: {exc}")
            continue

        diff_info = compute_difficulty(metadata)
        if args.difficulty and diff_info["level"] != args.difficulty:
            continue

        scanned += 1
        sample_name = str(
            metadata.get("id") or metadata.get("sample_id") or meta_path.stem
        )
        single_image = _pick_single_image(metadata, meta_path)
        pair_images = _pick_pair_images(metadata, meta_path)

        for task_id in valid_task_ids:
            if not sample_applicable(metadata, task_id):
                continue

            task = TASKS[task_id]
            input_type = task["applicable"]

            image_paths: list[Path] = []
            if input_type in ("single", "multi"):
                if not single_image:
                    continue
                image_paths = [single_image]
            elif input_type == "pair":
                if len(pair_images) != 2:
                    continue
                image_paths = pair_images
            else:
                continue

            gt = get_ground_truth(metadata, task_id)

            # Determine which phrasing(s) to use
            if args.all_phrasings:
                phrasing_indices = list(range(num_phrasings(task_id)))
            elif args.phrasing is not None:
                phrasing_indices = [args.phrasing]
            else:
                phrasing_indices = [None]  # None = use original fixed prompt

            for pidx in phrasing_indices:
                # Build the prompt
                if pidx is not None:
                    prompt = build_prompt(task_id, pidx)
                    question_id = f"{task_id}_Q{pidx + 1:02d}"
                else:
                    prompt = task["prompt"]
                    question_id = f"{task_id}_Q00"

                if args.dry_run:
                    print(f"  [DRY] {question_id} | sample={sample_name} | "
                          f"gt={gt} | images={[p.name for p in image_paths]}")
                    continue

                try:
                    raw = ask_vlm(client, args.model, prompt,
                                 [str(p) for p in image_paths])
                    parsed = parse_answer(raw, task_id)
                    scoring = score_answer(parsed, gt, task_id)

                    result = {
                        "task": task_id,
                        "question_id": question_id,
                        "phrasing_index": pidx,
                        "sample_id": sample_name,
                        "metadata_path": str(meta_path),
                        "input_type": input_type,
                        "image_paths": [str(p) for p in image_paths],
                        "knot_type": metadata.get("knotType"),
                        "topological_id": metadata.get("topologicalId"),
                        "crossing_number": metadata.get("crossingNumber"),
                        "slackness": metadata.get("slackness", 0),
                        "difficulty_score": diff_info["score"],
                        "difficulty_level": diff_info["level"],
                        "trap_type": metadata.get("trap_type"),
                        "is_deceptive": metadata.get("isDeceptive", False),
                        "ground_truth": gt,
                        "vlm_answer": parsed,
                        "vlm_raw": raw,
                        "prompt_used": prompt,
                        "correct": scoring["correct"],
                        "partial": scoring.get("partial", False),
                        "score_detail": scoring.get("detail", ""),
                    }
                    all_results.append(result)

                    icon = "+" if scoring["correct"] else ("~" if scoring.get("partial") else "-")
                    print(
                        f"[{icon}] {question_id} | {sample_name} | "
                        f"gt={gt} | ans={parsed} | {diff_info['level']}",
                        flush=True,
                    )
                    time.sleep(0.5)
                except Exception as exc:
                    print(f"[ERROR] {question_id} on {sample_name}: {exc}", flush=True)

        if args.limit and scanned >= args.limit:
            break

    if not args.dry_run:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"\nSaved {len(all_results)} results to {args.output}")
        print_report(all_results)
    else:
        print(f"\n[DRY RUN] Would evaluate {scanned} samples × {len(valid_task_ids)} tasks")


if __name__ == "__main__":
    main()
