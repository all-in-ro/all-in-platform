#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"

PUBLISH=0
if [ "${1:-}" = "--publish" ]; then
  PUBLISH=1
  shift
fi

OUT_DIR="${1:-artifacts/system-documentation}"
CACHE_DIR="${AIF_DOCGEN_CACHE_DIR:-/tmp/aif-system-docgen-node}"
PDFKIT_VERSION="${AIF_PDFKIT_VERSION:-0.15.0}"

mkdir -p "$OUT_DIR" "$CACHE_DIR"

echo "=== ALLINFASHION TELJES RENDSZERTERKEP ==="
echo "Projekt: $PWD"
echo "Archiv kimenet: $OUT_DIR"
echo

if NODE_PATH="$CACHE_DIR/node_modules${NODE_PATH:+:$NODE_PATH}" node -e "require('pdfkit');" >/dev/null 2>&1; then
  echo "pdfkit: rendben a cache-ben"
elif node -e "require('pdfkit');" >/dev/null 2>&1; then
  echo "pdfkit: rendben a projektben"
else
  echo "pdfkit nincs telepitve. Ideiglenes, projekten kivuli cache telepitese indul: $CACHE_DIR"
  npm install \
    --prefix "$CACHE_DIR" \
    --no-save \
    --no-audit \
    --no-fund \
    --omit=dev \
    "pdfkit@$PDFKIT_VERSION"
fi

export NODE_PATH="$CACHE_DIR/node_modules${NODE_PATH:+:$NODE_PATH}"

node jobs/aif_generate_system_architecture.cjs \
  --root "$PWD" \
  --out-dir "$OUT_DIR"

LATEST_PDF="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.pdf' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
LATEST_MD="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.md' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
LATEST_JSON="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.json' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"

echo
echo "=== ARCHIV CSOMAG ==="
echo "PDF:  $LATEST_PDF"
echo "MD:   $LATEST_MD"
echo "JSON: $LATEST_JSON"

if [ "$PUBLISH" -eq 1 ]; then
  TOKEN="$(node -e "console.log(require('crypto').randomBytes(18).toString('hex'))")"
  PUBLIC_DIR="dist/system-documentation/$TOKEN"
  PUBLIC_NAME="AllInFashion_teljes_rendszerterkep.pdf"
  mkdir -p "$PUBLIC_DIR"
  cp "$LATEST_PDF" "$PUBLIC_DIR/$PUBLIC_NAME"

  BASE_URL="${AIF_PUBLIC_BASE_URL:-${RENDER_EXTERNAL_URL:-https://all-in-platform.onrender.com}}"
  BASE_URL="${BASE_URL%/}"

  echo
echo "=== IDEIGLENES LETOLTESI LINK ==="
  echo "$BASE_URL/system-documentation/$TOKEN/$PUBLIC_NAME"
  echo
  echo "A PDF letoltese utan torold a publikus masolatot ezzel:"
  echo "rm -rf '$PUBLIC_DIR'"
  echo
  echo "A teljes archiv PDF/MD/JSON tovabbra is itt marad az instance-on: $OUT_DIR"
fi

echo
echo "=== KESZ ==="
