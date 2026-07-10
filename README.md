# Beat Tube

Music visualiser built with three js and vite

## Usage
- bun install
- bun run dev

## Deploy to GitHub Pages

The canonical site is served from the user Pages repository:

https://wadexnz.github.io/

Build Beat Tube and publish the generated Vite output:

```sh
bun run deploy:pages
```

The deploy script builds locally, clones `wadexnz/wadexnz.github.io`, copies `dist/` into a temporary worktree, commits it to `master`, and pushes the branch. To deploy to a different repository or branch:

```sh
DEPLOY_REPO=https://github.com/wadexnz/beat-tube.git DEPLOY_BRANCH=gh-pages bun run deploy:pages
```
