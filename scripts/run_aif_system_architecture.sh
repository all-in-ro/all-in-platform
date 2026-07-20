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
  if [ -z "${LATEST_PDF:-}" ] || [ ! -f "$LATEST_PDF" ]; then
    echo "HIBA: a generalt PDF nem talalhato." >&2
    exit 3
  fi

  ADMIN_SECRET="${AIF_DOCGEN_ADMIN_SECRET:-${ADMIN_PASSWORD:-}}"
  if [ -z "$ADMIN_SECRET" ]; then
    echo "HIBA: hianyzik az ADMIN_PASSWORD vagy az AIF_DOCGEN_ADMIN_SECRET kornyezeti valtozo." >&2
    echo "A hitelesitett feltoltes nelkul nem keszitunk kamu publikus linket. Abbol mar volt eleg." >&2
    exit 4
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "HIBA: a curl parancs nem erheto el a Render Shellben." >&2
    exit 5
  fi

  TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  BASE_URL="${AIF_PUBLIC_BASE_URL:-${RENDER_EXTERNAL_URL:-https://all-in-platform.onrender.com}}"
  BASE_URL="${BASE_URL%/}"
  UPLOAD_URL="$BASE_URL/api/aif/system-documentation/publish"

  echo
  echo "=== HITELESITETT FELTOLTES A LIVE WEB SERVICE-RE ==="
  echo "Cel: $UPLOAD_URL"

  UPLOAD_RESPONSE="$(curl --fail --silent --show-error \
    --request POST \
    --header "x-admin-secret: $ADMIN_SECRET" \
    --header "x-aif-doc-token: $TOKEN" \
    --header "Content-Type: application/pdf" \
    --data-binary "@$LATEST_PDF" \
    "$UPLOAD_URL")"

  DOWNLOAD_PATH="$(printf '%s' "$UPLOAD_RESPONSE" | node -e '
    let raw="";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const data = JSON.parse(raw || "{}");
      if (!data.ok || !data.downloadUrl) {
        console.error(data.error || "A szerver nem adott letoltesi utvonalat.");
        process.exit(1);
      }
      process.stdout.write(String(data.downloadUrl));
    });
  ')"

  DELETE_PATH="$(printf '%s' "$UPLOAD_RESPONSE" | node -e '
    let raw="";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const data = JSON.parse(raw || "{}");
      process.stdout.write(String(data.deleteUrl || ""));
    });
  ')"

  EXPIRES_AT="$(printf '%s' "$UPLOAD_RESPONSE" | node -e '
    let raw="";
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      const data = JSON.parse(raw || "{}");
      process.stdout.write(String(data.expiresAt || ""));
    });
  ')"

  case "$DOWNLOAD_PATH" in
    http://*|https://*) DOWNLOAD_URL="$DOWNLOAD_PATH" ;;
    *) DOWNLOAD_URL="$BASE_URL$DOWNLOAD_PATH" ;;
  esac

  echo
  echo "=== BIZTONSAGOS LETOLTESI LINK ==="
  echo "$DOWNLOAD_URL"
  echo
  echo "A link az aktiv AllIn admin bejelentkezessel mukodik, es a PDF-et letolteskent kuldi."
  if [ -n "$EXPIRES_AT" ]; then
    echo "Automatikus lejarat: $EXPIRES_AT"
  fi

  if [ -n "$DELETE_PATH" ]; then
    echo
    echo "Kezi torles a letoltes utan:"
    echo "curl -fsS -X DELETE -H \"x-admin-secret: \$ADMIN_PASSWORD\" '$BASE_URL$DELETE_PATH'"
  fi

  echo
  echo "A teljes archiv PDF/MD/JSON tovabbra is itt marad a Shell instance-on: $OUT_DIR"
fi

echo
echo "=== KESZ ==="
