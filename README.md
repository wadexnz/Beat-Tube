# Beat Tube

Music visualiser built with three js and vite

## Usage
- bun install
- bun run dev

## Deploy to GitHub Pages

The visualiser is served from this repository's `gh-pages` branch:

https://wadexnz.github.io/Beat-Tube/

Build Beat Tube and publish the generated Vite output:

```sh
bun run deploy:pages
```

The deploy script builds locally, clones `wadexnz/Beat-Tube` at `gh-pages`,
replaces that branch's generated files with `dist/`, and pushes it. It does not
update the personal homepage in `wadexnz/wadexnz.github.io`. Vite's base path is
`/Beat-Tube/`, including audio, scripts, styles and scene textures.

For the initial move, deploy and verify `/Beat-Tube/` before publishing the
landing page at the root. This replaces the old project-site redirect to `/`.
Future visualiser deployments remain independent of the homepage.

Check deployment behaviour without contacting GitHub:

```sh
bun test scripts/deploy-pages.test.js
```

The tests use isolated Git configuration and disposable local repositories;
only the frontend build is stubbed.
