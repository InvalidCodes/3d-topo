#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/dataset"
export OPENAI_API_KEY=""

python "${ROOT_DIR}/vlm_benchmark.py" \
  --data_dir "${DATA_DIR}" \
  --model "gpt-5.2" \
  --tasks all \
  --limit 3 \
  --output "${SCRIPT_DIR}/results.json"