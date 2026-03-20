#!/usr/bin/env python3
"""
validate_dataset.py - 验证数据集 metadata 完整性和 ground truth 一致性。
在批量生成图片前运行此脚本，提前发现问题。

Usage:
  python script/validate_dataset.py --data_dir ./dataset
"""

import json
import sys
from pathlib import Path
from collections import Counter

# 从 vlm_benchmark 复用 ground truth 逻辑
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vlm_benchmark import (
    get_ground_truth, compute_difficulty, sample_applicable,
    TASKS, _FAMILY_MAP, _LINK_TYPES, _EXCLUDED_TYPES,
)

REQUIRED_FIELDS = [
    "knotType", "topologicalId", "isKnot", "isUnknot", "isDeceptive",
    "crossingNumber", "slackness", "images",
]
LINK_REQUIRED_FIELDS = ["numComponents"]

KNOWN_KNOT_TYPES = set(_FAMILY_MAP.keys()) | _LINK_TYPES


def validate_metadata(meta_path: Path, metadata: dict) -> list[str]:
    """Validate a single metadata file. Returns list of issues."""
    issues = []
    kt = metadata.get("knotType", "")

    # Skip excluded types
    if kt in _EXCLUDED_TYPES:
        return [f"SKIP: excluded type '{kt}'"]

    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in metadata:
            issues.append(f"MISSING field: {field}")

    # Check known type
    if kt and kt not in KNOWN_KNOT_TYPES:
        issues.append(f"UNKNOWN knotType: '{kt}'")

    # Link-specific checks
    if kt in _LINK_TYPES:
        if not metadata.get("isLink", False):
            issues.append(f"INCONSISTENT: knotType='{kt}' but isLink is not True")
        for field in LINK_REQUIRED_FIELDS:
            if field not in metadata:
                issues.append(f"MISSING link field: {field}")

    # Check isKnot consistency
    is_knot = metadata.get("isKnot")
    unknot_types = {"unknot", "twisted_ring", "spiral_disk", "kinky_unknot"}
    if kt in unknot_types and is_knot is True:
        issues.append(f"INCONSISTENT: knotType='{kt}' should have isKnot=false")
    knot_types = {"trefoil", "figure8", "torus_2_5", "torus_2_7", "torus_2_9", "torus_3_4", "torus_3_5"}
    if kt in knot_types and is_knot is not True:
        issues.append(f"INCONSISTENT: knotType='{kt}' should have isKnot=true")

    # Check images exist
    images = metadata.get("images", [])
    if not images:
        issues.append("NO images listed")
    else:
        for img in images:
            name = img.get("filename") if isinstance(img, dict) else img
            if name:
                img_path = meta_path.parent / name
                if not img_path.exists():
                    issues.append(f"MISSING image: {name}")

    # Check ground truth is computable for all applicable tasks
    for task_id in TASKS:
        if sample_applicable(metadata, task_id):
            gt = get_ground_truth(metadata, task_id)
            if gt is None:
                issues.append(f"GT=None for applicable task {task_id}")

    return issues


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Validate dataset metadata")
    parser.add_argument("--data_dir", default="./dataset")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    meta_files = sorted(
        list(data_dir.glob("**/metadata*.json")) +
        list(data_dir.glob("**/*metadata*.json"))
    )
    # Deduplicate
    seen = set()
    unique = []
    for p in meta_files:
        k = str(p.resolve())
        if k not in seen:
            seen.add(k)
            unique.append(p)
    meta_files = unique

    print(f"Found {len(meta_files)} metadata files in {data_dir}\n")

    total_issues = 0
    total_ok = 0
    total_skipped = 0
    type_counter = Counter()
    difficulty_counter = Counter()
    task_coverage = Counter()

    for meta_path in meta_files:
        try:
            with open(meta_path, "r") as f:
                metadata = json.load(f)
        except Exception as e:
            print(f"  ERROR loading {meta_path}: {e}")
            total_issues += 1
            continue

        issues = validate_metadata(meta_path, metadata)
        kt = metadata.get("knotType", "unknown")
        type_counter[kt] += 1

        if issues and issues[0].startswith("SKIP:"):
            total_skipped += 1
            continue

        diff = compute_difficulty(metadata)
        difficulty_counter[diff["level"]] += 1

        # Count task coverage
        for task_id in TASKS:
            if sample_applicable(metadata, task_id):
                task_coverage[task_id] += 1

        if issues:
            print(f"  [{kt}] {meta_path.name}")
            for issue in issues:
                print(f"    - {issue}")
            total_issues += len(issues)
        else:
            total_ok += 1

    # Summary
    print(f"\n{'=' * 60}")
    print(f"VALIDATION SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total files:   {len(meta_files)}")
    print(f"  OK:            {total_ok}")
    print(f"  Skipped:       {total_skipped}")
    print(f"  Issues found:  {total_issues}")

    print(f"\n-- Knot Type Distribution --")
    for kt, count in sorted(type_counter.items(), key=lambda x: -x[1]):
        print(f"  {kt:25s}: {count}")

    print(f"\n-- Difficulty Distribution --")
    for level in ("easy", "medium", "hard"):
        print(f"  {level:10s}: {difficulty_counter[level]}")

    print(f"\n-- Task Coverage (samples per task) --")
    for task_id in TASKS:
        count = task_coverage.get(task_id, 0)
        flag = " ⚠️ LOW" if count < 3 else ""
        print(f"  {task_id:30s}: {count}{flag}")

    if total_issues > 0:
        print(f"\n⚠  {total_issues} issues found. Fix before running benchmark.")
        return 1
    else:
        print(f"\n✓  All metadata validated successfully.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
