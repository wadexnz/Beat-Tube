# Beat Tube

Music visualiser built with three js and vite

## Usage
- bun install
- bun run dev

## Deploy to GitHub Pages

The live site is served from `wadexnz/wadexnz.github.io` as static files at the repository root.

Build Beat Tube and copy the generated Vite output into a sibling deployment checkout:

```sh
bun run deploy:pages
```

By default the script uses `../wadexnz.github.io`, cloning `https://github.com/wadexnz/wadexnz.github.io.git` there if needed. To use a different checkout path:

```sh
bun run deploy:pages -- /path/to/wadexnz.github.io
```

The script does not commit or push. After reviewing the deployment checkout, publish with:

```sh
git -C ../wadexnz.github.io add index.html assets img
git -C ../wadexnz.github.io commit -m "Update Beat Tube build"
git -C ../wadexnz.github.io push
```
