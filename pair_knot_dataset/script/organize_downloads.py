#!/usr/bin/env python3
"""
organize_downloads.py - 把浏览器下载的散落文件整理到正确目录结构。

Usage:
  python script/organize_downloads.py --src ~/Downloads --dst ./dataset_organized

会创建如下结构:
  dataset_organized/
    singles/
      trefoil/
        trefoil_s0.10_d0.30_v0_metadata.json
        trefoil_s0.10_d0.30_v0_iso_fr.png
        ...
    links/
      hopf_link/
        ...
    pairs/
      pair0001_metadata.json
      pair0001_A.png
      pair0001_B.png
      ...
"""

import argparse
import json
import shutil
from pathlib import Path


KNOT_TYPES = {
    'unknot', 'twisted_ring', 'spiral_disk', 'kinky_unknot',
    'trefoil', 'figure8', 'torus_2_5', 'torus_2_7', 'torus_2_9',
    'torus_3_4', 'torus_3_5',
}
LINK_TYPES = {'hopf_link', 'unlinked_rings', 'chain', 'borromean'}


def detect_knot_type(filename: str) -> str | None:
    """从文件名推断 knot type."""
    name = filename.lower()
    # 优先匹配长名字（避免 torus_2_5 被 torus 误匹配）
    for kt in sorted(KNOT_TYPES | LINK_TYPES, key=len, reverse=True):
        if kt in name:
            return kt
    return None


def is_pair_file(filename: str) -> bool:
    return filename.startswith('pair') or '_pair' in filename


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True, help='源目录（如 ~/Downloads）')
    parser.add_argument('--dst', default='./dataset_organized', help='目标目录')
    parser.add_argument('--move', action='store_true', help='移动而非复制')
    args = parser.parse_args()

    src = Path(args.src).expanduser()
    dst = Path(args.dst)

    if not src.exists():
        print(f'ERROR: src not found: {src}')
        return

    # 收集相关文件
    files = []
    for ext in ('*.png', '*.json'):
        files.extend(src.glob(ext))

    print(f'Found {len(files)} files in {src}')

    organized = 0
    skipped = 0

    for f in sorted(files):
        name = f.name

        if is_pair_file(name):
            target_dir = dst / 'pairs'
        else:
            kt = detect_knot_type(name)
            if kt is None:
                if 'dataset_metadata' in name:
                    target_dir = dst
                else:
                    print(f'  SKIP (unknown type): {name}')
                    skipped += 1
                    continue

            elif kt in LINK_TYPES:
                target_dir = dst / 'links' / kt
            else:
                target_dir = dst / 'singles' / kt

        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name

        if target.exists():
            print(f'  SKIP (exists): {name}')
            skipped += 1
            continue

        if args.move:
            shutil.move(str(f), str(target))
        else:
            shutil.copy2(str(f), str(target))

        organized += 1

    print(f'\nDone: organized={organized}, skipped={skipped}')
    print(f'Output: {dst}')

    # 验证
    meta_count = len(list(dst.rglob('*metadata*.json')))
    img_count = len(list(dst.rglob('*.png')))
    print(f'Metadata files: {meta_count}')
    print(f'Image files: {img_count}')


if __name__ == '__main__':
    main()
