#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_REPO="${1:-${DEPLOY_REPO:-"$PROJECT_ROOT/../wadexnz.github.io"}}"
DEPLOY_REPO_URL="${DEPLOY_REPO_URL:-https://github.com/wadexnz/wadexnz.github.io.git}"

if [[ ! -d "$DEPLOY_REPO" ]]; then
  echo "Deployment repo not found at $DEPLOY_REPO"
  echo "Cloning $DEPLOY_REPO_URL ..."
  git clone "$DEPLOY_REPO_URL" "$DEPLOY_REPO"
elif [[ ! -d "$DEPLOY_REPO/.git" ]]; then
  echo "Error: $DEPLOY_REPO exists but is not a git checkout." >&2
  exit 1
fi

if [[ "${DEPLOY_ALLOW_DIRTY:-0}" != "1" ]]; then
  if ! git -C "$DEPLOY_REPO" diff --quiet \
    || ! git -C "$DEPLOY_REPO" diff --cached --quiet \
    || [[ -n "$(git -C "$DEPLOY_REPO" ls-files --others --exclude-standard)" ]]; then
    echo "Error: deployment repo has uncommitted changes." >&2
    echo "Commit/stash them first, or rerun with DEPLOY_ALLOW_DIRTY=1 if you intend to overwrite generated files." >&2
    git -C "$DEPLOY_REPO" status --short >&2
    exit 1
  fi
fi

cd "$PROJECT_ROOT"
bun run build

# Vite emits hashed assets, so clear the generated asset directory before copying
# the new build. Leave unrelated root files alone.
rm -rf "$DEPLOY_REPO/assets"
rm -f "$DEPLOY_REPO/index.html"
cp -R "$PROJECT_ROOT/dist/." "$DEPLOY_REPO/"

echo
echo "Build copied to: $DEPLOY_REPO"
echo "Review and publish with:"
echo "  git -C \"$DEPLOY_REPO\" status"
echo "  git -C \"$DEPLOY_REPO\" add index.html assets img"
echo "  git -C \"$DEPLOY_REPO\" commit -m \"Update Beat Tube build\""
echo "  git -C \"$DEPLOY_REPO\" push"
echo
git -C "$DEPLOY_REPO" status --short
