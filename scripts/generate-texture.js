import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, write } from 'bun'

// Tileable basalt-like cells, generated from periodic distances and noise.
// No photographs, reference images or model output are used.
// Run: bun scripts/generate-texture.js (requires ImageMagick).
const size = 1024
let seed = 20261102
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

const stones = []
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    stones.push({
      x: (x + 0.15 + random() * 0.7) * size / 8,
      y: (y + 0.15 + random() * 0.7) * size / 8,
      shade: 135 + random() * 35,
    })
  }
}
const pixels = Buffer.alloc(size * size * 3)
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    // Periodic warping roughens the cracks without introducing tile seams.
    const u = 2 * Math.PI * x / size
    const v = 2 * Math.PI * y / size
    const px = (x + 5 * Math.sin(v * 13 + Math.sin(u * 5)) + size) % size
    const py = (y + 5 * Math.sin(u * 11 + Math.sin(v * 7)) + size) % size
    let nearest = Infinity
    let second = Infinity
    let shade = 0
    for (const stone of stones) {
      const dx = Math.abs(px - stone.x)
      const dy = Math.abs(py - stone.y)
      const distance = Math.hypot(Math.min(dx, size - dx), Math.min(dy, size - dy))
      if (distance < nearest) {
        second = nearest
        nearest = distance
        shade = stone.shade
      }
      else if (distance < second) {
        second = distance
      }
    }
    const edge = Math.min((second - nearest) / 9, 1)
    const bevel = edge * edge * (3 - 2 * edge)
    const grain = (random() - 0.5) * 13
      + 5 * Math.sin(u * 31 + v * 23)
      + 3 * Math.sin(u * 79 - v * 61)
    const value = Math.round(65 + (shade - 65) * bevel + grain)
    const offset = (y * size + x) * 3
    pixels.fill(value, offset, offset + 3)
  }
}

const temporary = mkdtempSync(join(tmpdir(), 'beat-tube-texture-'))
try {
  const input = join(temporary, 'basalt.ppm')
  await write(input, Buffer.concat([Buffer.from(`P6\n${size} ${size}\n255\n`), pixels]))
  const result = spawnSync(['magick', input, '-strip', '-define', 'png:color-type=2', join(import.meta.dir, '../public/img/basalt-generated.png')])
  if (result.exitCode !== 0)
    throw new Error(result.stderr.toString())
  console.log(`Generated periodic basalt texture: ${size} × ${size}, no source images`)
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
