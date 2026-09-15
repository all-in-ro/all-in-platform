#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/all-in-ro/all-in-platform.git"
REMOTE="origin"
BRANCH="main"
MODE="${1:-push}"

cd "$(git rev-parse --show-toplevel)"

echo "========================================"
echo "AllInFashion GitHub push"
echo "========================================"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "❌ GITHUB_TOKEN nincs elérhető a környezetben."
  echo "Render Environment-ben legyen beállítva, majd új deploy/shell szükséges."
  exit 1
fi

echo "✅ GITHUB_TOKEN elérhető"

# Git identity
git config user.name "all-in-ro"
git config user.email "office@smartrophy.ro"

# Origin helyreállítása, de token SOHA nem kerül az URL-be.
if git remote get-url "$REMOTE" >/dev/null 2>&1; then
  CURRENT_URL="$(git remote get-url "$REMOTE")"

  if [ "$CURRENT_URL" != "$REPO_URL" ]; then
    echo "ℹ️ origin URL javítása"
    git remote set-url "$REMOTE" "$REPO_URL"
  fi
else
  echo "ℹ️ origin remote létrehozása"
  git remote add "$REMOTE" "$REPO_URL"
fi

# Ideiglenes askpass. A token nincs beleírva a fájlba,
# futáskor az ENV-ből olvassa.
ASKPASS="$(mktemp)"

cleanup() {
  rm -f "$ASKPASS"
}

trap cleanup EXIT

cat > "$ASKPASS" <<'EOF'
#!/bin/sh

case "$1" in
  *Username*|*username*)
    printf '%s\n' "${GITHUB_USER:-all-in-ro}"
    ;;
  *Password*|*password*)
    printf '%s\n' "$GITHUB_TOKEN"
    ;;
  *)
    printf '\n'
    ;;
esac
EOF

chmod 700 "$ASKPASS"

export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

echo
echo "=== REMOTE ==="
git remote -v

echo
echo "=== FETCH $REMOTE/$BRANCH ==="

git \
  -c credential.helper= \
  fetch "$REMOTE" "$BRANCH"

echo
echo "=== CURRENT ==="
echo "HEAD:        $(git rev-parse HEAD)"
echo "origin/main: $(git rev-parse "$REMOTE/$BRANCH")"

echo
echo "=== SAFETY CHECK ==="

if git merge-base --is-ancestor "$REMOTE/$BRANCH" HEAD; then
  echo "✅ origin/main a jelenlegi HEAD őse"
else
  echo "❌ origin/main nincs a HEAD mögött."
  echo "Nem pusholok rá vakon."
  echo
  git log \
    --oneline \
    --decorate \
    --graph \
    --max-count=20 \
    HEAD "$REMOTE/$BRANCH"
  exit 1
fi

if [ "$MODE" = "--check" ] || [ "$MODE" = "check" ]; then
  echo
  echo "✅ GitHub kapcsolat és jogosultság rendben"
  echo "CHECK mód: push nem történt."
  exit 0
fi

if [ "$MODE" != "push" ] && [ "$MODE" != "--push" ]; then
  echo "❌ Ismeretlen mód: $MODE"
  echo "Használat:"
  echo "  bash scripts/git-push-main.sh --check"
  echo "  bash scripts/git-push-main.sh"
  exit 1
fi

echo
echo "=== PUSH HEAD -> main ==="

git \
  -c credential.helper= \
  push "$REMOTE" HEAD:"$BRANCH"

echo
echo "========================================"
echo "✅ PUSH SIKERES"
echo "========================================"
echo "Commit: $(git rev-parse HEAD)"
