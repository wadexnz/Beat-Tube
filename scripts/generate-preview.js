import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync, write } from 'bun'

// "Signal Path": a 120 BPM, 32-bar instrumental written for Beat Tube.
// All sounds are synthesized here; no recordings, samples or model are used.
// Run with Bun and FFmpeg installed: bun scripts/generate-preview.js
const rate = 44100
const beat = 0.5
const length = Math.ceil((32 * 4 * beat + 3) * rate)
const left = new Float32Array(length)
const right = new Float32Array(length)
let seed = 20261101
function noise() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 2147483648 - 1
}

function add(start, duration, sample, pan = 0) {
  const offset = Math.round(start * rate)
  const count = Math.min(Math.round(duration * rate), length - offset)
  const l = Math.sqrt((1 - pan) / 2)
  const r = Math.sqrt((1 + pan) / 2)
  for (let i = 0; i < count; i++) {
    const value = sample(i / rate, i / count)
    left[offset + i] += value * l
    right[offset + i] += value * r
  }
}

function tone(start, midi, duration, volume, pan, kind) {
  const frequency = 440 * 2 ** ((midi - 69) / 12)
  add(start, duration, (t, progress) => {
    const phase = 2 * Math.PI * frequency * t
    const attack = Math.min(t / (kind === 'pad' ? 0.18 : 0.008), 1)
    const release = Math.min((duration - t) / 0.1, 1)
    const decay = kind === 'pad' ? 1 : Math.exp(-progress * 3.5)
    const wave = Math.sin(phase)
      + 0.24 * Math.sin(phase * 2 + 0.15 * Math.sin(t * 7))
      + 0.09 * Math.sin(phase * 3)
    return wave * attack * release * decay * volume
  }, pan)
}

// D minor 9, G 6, E minor 7, A minor 7. New note/rhythm patterns, not a cover.
const chords = [[50, 57, 60, 64], [55, 59, 62, 64], [52, 59, 62, 67], [57, 60, 64, 67]]
const roots = [38, 43, 40, 45]
const arp = [0, 2, 1, 3, 2, 0, 3, 1]
const melody = [74, 77, 76, 81, 79, 76, 72, 74]

for (let bar = 0; bar < 32; bar++) {
  const start = bar * 4 * beat
  const chordIndex = Math.floor(bar / 2) % chords.length
  const chord = chords[chordIndex]
  const breakdown = bar >= 12 && bar < 16
  const full = (bar >= 4 && bar < 12) || (bar >= 16 && bar < 28)

  chord.forEach((note, i) => tone(start, note + 12, 2.5, 0.035, (i - 1.5) / 2, 'pad'))
  if (bar < 30) {
    for (let step = 0; step < 8; step++) {
      if (breakdown && step % 2)
        continue
      tone(start + step * beat / 2, chord[arp[(step + bar % 2) % 8]] + 24, 0.36, full ? 0.075 : 0.05, step % 2 ? 0.45 : -0.45, 'pluck')
    }
  }
  if (bar >= 2 && bar < 30 && !breakdown) {
    for (const position of [0, 0.75, 1.5, 2, 2.75, 3.5]) {
      tone(start + position * beat, roots[chordIndex] + (position === 3.5 ? 12 : 0), 0.25, 0.21, 0, 'bass')
    }
  }
  if (full && bar % 2 === 0) {
    for (let i = 0; i < 4; i++) {
      tone(start + [0.5, 1.25, 2.5, 3.25][i] * beat, melody[(Math.floor(bar / 2) + i) % melody.length], 0.5, 0.07, -0.15, 'lead')
    }
  }
}

// Quiet cross-channel echoes on the pitched instruments only.
for (let i = length - 1; i >= 0; i--) {
  for (const [seconds, gain] of [[0.375, 0.2], [0.75, 0.1], [1.125, 0.05]]) {
    const source = i - Math.round(seconds * rate)
    if (source >= 0) {
      left[i] += right[source] * gain
      right[i] += left[source] * gain
    }
  }
}

for (let bar = 0; bar < 32; bar++) {
  const start = bar * 4 * beat
  const breakdown = bar >= 12 && bar < 16
  if (bar >= 30)
    continue
  for (let step = 0; step < 8; step++) {
    if (bar < 2 || (breakdown && step % 4))
      continue
    let previous = 0
    add(start + step * beat / 2, 0.1, (t) => {
      const current = noise()
      const high = (current - previous) / 2
      previous = current
      return high * Math.exp(-t * 55) * (step % 2 ? 0.09 : 0.045)
    }, step % 2 ? 0.35 : -0.35)
  }
  if (breakdown || bar < 4)
    continue
  for (let step = 0; step < 4; step++) {
    add(start + step * beat, 0.45, t =>
      (Math.sin(2 * Math.PI * (48 * t + 90 * 0.022 * (1 - Math.exp(-t / 0.022))))
        * Math.exp(-t * 11) + noise() * Math.exp(-t * 180) * 0.12)
      * Math.min(t / 0.002, 1) * 0.65)
    if (step % 2) {
      add(start + step * beat, 0.2, t =>
        (noise() * 0.7 + Math.sin(2 * Math.PI * 185 * t) * 0.3)
        * Math.exp(-t * 24) * Math.min(t / 0.002, 1) * 0.22, 0.1)
    }
  }
}

let peak = 0
for (let i = 0; i < length; i++) {
  const fade = Math.min(i / rate / 0.08, 1, (length - 1 - i) / rate / 2)
  left[i] *= fade
  right[i] *= fade
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
}

const wav = Buffer.alloc(44 + length * 4)
wav.write('RIFF', 0)
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(rate, 24)
wav.writeUInt32LE(rate * 4, 28)
wav.writeUInt16LE(4, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(length * 4, 40)
for (let i = 0; i < length; i++) {
  wav.writeInt16LE(Math.round(left[i] / peak * 0.85 * 32767), 44 + i * 4)
  wav.writeInt16LE(Math.round(right[i] / peak * 0.85 * 32767), 46 + i * 4)
}

const temporary = mkdtempSync(join(tmpdir(), 'beat-tube-music-'))
try {
  const input = join(temporary, 'signal-path.wav')
  await write(input, wav)
  const result = spawnSync(['ffmpeg', '-v', 'error', '-y', '-i', input, '-codec:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', '-metadata', 'title=Signal Path', '-metadata', 'comment=Synthesized for Beat Tube; see scripts/generate-preview.js', join(import.meta.dir, '../audio/signal-path.mp3')])
  if (result.exitCode !== 0)
    throw new Error(result.stderr.toString())
  console.log(`Generated Signal Path: ${length / rate}s, stereo, 120 BPM, no samples`)
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
