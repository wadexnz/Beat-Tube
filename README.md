# Beat Tube

Music visualiser built with three js and vite

## Usage
- bun install
- bun run dev

## Deploy to GitHub Pages

The live site is served from this repository's `gh-pages` branch:

https://wadexnz.github.io/Beat-Tube/

Build Beat Tube and publish the generated Vite output to `gh-pages`:

```sh
bun run deploy:pages
```

The deploy script builds locally, copies `dist/` into a temporary worktree, commits it to `gh-pages`, and pushes the branch. To deploy to a different remote or branch:

```sh
DEPLOY_REMOTE=origin DEPLOY_BRANCH=gh-pages bun run deploy:pages
```
