#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# VLM Knot Benchmark — Test Runner
#
# Usage:
#   bash script/test.bash                 # smoke test (20 samples, gpt-4o-mini)
#   bash script/test.bash full            # full run (all samples, gpt-4o-mini)
#   bash script/test.bash full gpt-4o     # full run with specific model
#   bash script/test.bash all-phrasings   # all 20 phrasings × all samples (6821 calls)
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/dataset"
PYTHON="/Users/yunfei/miniconda3/bin/python3"
BENCHMARK="${ROOT_DIR}/vlm_benchmark.py"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ── API Key ──────────────────────────────────────────────────
export OPENAI_API_KEY="${}"

# ── Args ─────────────────────────────────────────────────────
MODE="${1:-smoke}"       # smoke | full | dry
MODEL="${2:-gpt-4o-mini}" # cheapest vision model (~$0.5 for full run)

# ── Validate environment ─────────────────────────────────────
echo "════════════════════════════════════════════════════════"
echo "  VLM Knot Benchmark Runner"
echo "════════════════════════════════════════════════════════"
echo "  Mode   : ${MODE}"
echo "  Model  : ${MODEL}"
echo "  Dataset: ${DATA_DIR}"
echo "  Python : ${PYTHON}"
echo "  Time   : ${TIMESTAMP}"
echo "════════════════════════════════════════════════════════"

if [ ! -f "${BENCHMARK}" ]; then
  echo "[ERROR] vlm_benchmark.py not found at ${BENCHMARK}"
  exit 1
fi

if [ ! -d "${DATA_DIR}" ]; then
  echo "[ERROR] Dataset directory not found: ${DATA_DIR}"
  exit 1
fi

# Check python + openai
if ! "${PYTHON}" -c "import openai" 2>/dev/null; then
  echo "[ERROR] openai not installed. Run: ${PYTHON} -m pip install openai"
  exit 1
fi

# Count available data
META_COUNT=$("${PYTHON}" -c "
from pathlib import Path
metas = list(Path('${DATA_DIR}').glob('**/*metadata*.json'))
print(len(metas))
")
echo "  Metadata files: ${META_COUNT}"

# ── Run ──────────────────────────────────────────────────────
RESULTS_DIR="${SCRIPT_DIR}/results"
mkdir -p "${RESULTS_DIR}"

case "${MODE}" in
  dry)
    echo ""
    echo "▶ Dry run — no API calls"
    "${PYTHON}" "${BENCHMARK}" \
      --data_dir "${DATA_DIR}" \
      --tasks all \
      --dry-run
    ;;

  smoke)
    OUTPUT="${RESULTS_DIR}/${MODEL//\//_}_smoke_${TIMESTAMP}.json"
    echo ""
    echo "▶ Smoke test — 20 samples × 10 tasks (covers singles + links + pairs)"
    echo "  Output: ${OUTPUT}"
    echo ""
    "${PYTHON}" "${BENCHMARK}" \
      --data_dir "${DATA_DIR}" \
      --model "${MODEL}" \
      --tasks all \
      --limit 20 \
      --output "${OUTPUT}"

    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  Results saved to: ${OUTPUT}"
    echo "════════════════════════════════════════════════════════"
    ;;

  full)
    OUTPUT="${RESULTS_DIR}/${MODEL//\//_}_full_${TIMESTAMP}.json"
    echo ""
    echo "▶ Full run — ${META_COUNT} samples × 10 tasks"
    echo "  Output: ${OUTPUT}"
    echo "  Estimated cost: ~\$0.5-1.5 (${MODEL})"
    echo ""
    read -r -p "  Continue? [Y/n] " confirm
    if [[ "${confirm}" =~ ^[Nn] ]]; then
      echo "  Aborted."
      exit 0
    fi
    echo ""
    "${PYTHON}" "${BENCHMARK}" \
      --data_dir "${DATA_DIR}" \
      --model "${MODEL}" \
      --tasks all \
      --output "${OUTPUT}"

    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  Results saved to: ${OUTPUT}"
    echo "════════════════════════════════════════════════════════"
    ;;

  all-phrasings)
    OUTPUT="${RESULTS_DIR}/${MODEL//\//_}_allphrasings_${TIMESTAMP}.json"
    echo ""
    echo "▶ All phrasings — ${META_COUNT} samples × 10 tasks × 20 phrasings"
    echo "  Output: ${OUTPUT}"
    echo "  Estimated cost: ~\$1-3 (${MODEL}=gpt-4o-mini) / ~\$50-100 (gpt-4o)"
    echo ""
    read -r -p "  Continue? [Y/n] " confirm
    if [[ "${confirm}" =~ ^[Nn] ]]; then
      echo "  Aborted."
      exit 0
    fi
    echo ""
    "${PYTHON}" "${BENCHMARK}" \
      --data_dir "${DATA_DIR}" \
      --model "${MODEL}" \
      --tasks all \
      --all-phrasings \
      --output "${OUTPUT}"

    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  Results saved to: ${OUTPUT}"
    echo "════════════════════════════════════════════════════════"
    ;;

  *)
    echo "[ERROR] Unknown mode: ${MODE}"
    echo "  Usage: bash script/test.bash [dry|smoke|full|all-phrasings] [model]"
    exit 1
    ;;
esac
