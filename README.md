# Beat Tube

A personal experiment in audio-reactive graphics, built with TypeScript,
Three.js and Web Audio. Started in 2022 and developed intermittently, it is a
place to play with music, shaders and 3D scenes—not a supported production
product.

[Try the visualiser](https://wadexnz.github.io/Beat-Tube/)

## What’s here

- Different visual scenes exploring how audio levels and onsets can drive
  motion, colour and geometry.
- Custom GLSL shaders alongside Three.js scene rendering.
- Audio from a local file, the bundled preview track, or screen/tab audio
  sharing where the browser supports it. Use the side arrows to switch scenes.

Later features and refinements include work with AI coding agents.

## Generated preview assets

The preview music and tunnel texture were created for this project with
AI-assisted source scripts, without third-party recordings, samples,
photographs or reference images:

- **Signal Path** (`audio/signal-path.mp3`): a 67-second, 120 BPM stereo
  instrumental. Sine-wave harmonics and seeded noise generate the instruments
  and drums; note patterns, arrangement, echoes and fades are in
  `scripts/generate-preview.js`.
- **Basalt texture** (`public/img/basalt-generated.png`): a 1024 × 1024
  greyscale texture. Periodic Voronoi distances, coordinate warping and seeded
  grain generate the repeating stone pattern in `scripts/generate-texture.js`.

Regenerate with Bun, FFmpeg (including libmp3lame) and ImageMagick installed:

```sh
bun scripts/generate-preview.js
bun scripts/generate-texture.js
```

The checked-in outputs do not require these tools at runtime. These replace
the previous Bensound track and stone image in the current source tree;
older Git revisions and deployments may still contain the earlier assets.
This provenance description does not grant a repository-wide licence.

## Status and limitations

This is a hobby project with rough edges, shared for experimentation rather
than as a finished application. System-audio sharing depends on the browser
and operating system, and rendering performance varies by device.

Automated coverage currently focuses on the deployment script, not audio
handling or visual behaviour. There is no claim of broad browser, mobile or
VR compatibility.

## Usage

With [Bun](https://bun.sh/) installed:

```sh
bun install
bun run dev
```

Open the development server’s `/Beat-Tube/` path. To build the static site:

```sh
bun run build
```

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

Check deployment behaviour without contacting GitHub:

```sh
bun test scripts/deploy-pages.test.js
```

The tests use isolated Git configuration and disposable local repositories;
only the frontend build is stubbed.
