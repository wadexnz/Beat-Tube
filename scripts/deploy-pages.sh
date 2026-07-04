#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-gh-pages}"
DEPLOY_DIR="$(mktemp -d)"

cleanup() {
  git -C "$PROJECT_ROOT" worktree remove --force "$DEPLOY_DIR" >/dev/null 2>&1 || rm -rf "$DEPLOY_DIR"
}
trap cleanup EXIT

if ! git -C "$PROJECT_ROOT" diff --quiet || ! git -C "$PROJECT_ROOT" diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes. Commit or stash them before deploying." >&2
  git -C "$PROJECT_ROOT" status --short >&2
  exit 1
fi

cd "$PROJECT_ROOT"
bun run build

git fetch "$REMOTE" "$DEPLOY_BRANCH"
git worktree add --detach "$DEPLOY_DIR" FETCH_HEAD >/dev/null
git -C "$DEPLOY_DIR" switch -C "$DEPLOY_BRANCH" >/dev/null

find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$PROJECT_ROOT/dist/." "$DEPLOY_DIR/"
touch "$DEPLOY_DIR/.nojekyll"

git -C "$DEPLOY_DIR" add -A

if git -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "No GitHub Pages changes to deploy."
  exit 0
fi

git -C "$DEPLOY_DIR" commit -m "Deploy GitHub Pages"
git -C "$DEPLOY_DIR" push "$REMOTE" "$DEPLOY_BRANCH"

echo
echo "Published GitHub Pages from $DEPLOY_BRANCH."
