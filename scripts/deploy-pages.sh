#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Canonical site lives at https://wadexnz.github.io/ (the user Pages repo).
DEPLOY_REPO="${DEPLOY_REPO:-https://github.com/wadexnz/wadexnz.github.io.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
DEPLOY_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$DEPLOY_DIR"
}
trap cleanup EXIT

if ! git -C "$PROJECT_ROOT" diff --quiet || ! git -C "$PROJECT_ROOT" diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes. Commit or stash them before deploying." >&2
  git -C "$PROJECT_ROOT" status --short >&2
  exit 1
fi

cd "$PROJECT_ROOT"
bun run build

git clone --branch "$DEPLOY_BRANCH" --single-branch "$DEPLOY_REPO" "$DEPLOY_DIR"

# Replace everything except the .git dir with the fresh build.
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$PROJECT_ROOT/dist/." "$DEPLOY_DIR/"
touch "$DEPLOY_DIR/.nojekyll"

git -C "$DEPLOY_DIR" add -A

if git -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "No GitHub Pages changes to deploy."
  exit 0
fi

git -C "$DEPLOY_DIR" commit -m "Deploy Beat-Tube"
git -C "$DEPLOY_DIR" push origin "$DEPLOY_BRANCH"

echo
echo "Published to $DEPLOY_REPO ($DEPLOY_BRANCH) -> https://wadexnz.github.io/"
