// Generates the PWA icon set with zero image dependencies.
// The mark is a progress ring — the app's core idea: parent issue completion
// rolled up from its sub-issues.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = [0x0b, 0x0f, 0x16]
const RING_TRACK = [0x24, 0x2c, 0x38]
const RING = [0x3f, 0xb9, 0x50]
const DOT = [0xe6, 0xed, 0xf3]

const TAU = Math.PI * 2
const PROGRESS = 0.68

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Anti-aliased coverage of a disc/annulus, sampled on a 3x3 grid. */
function coverage(x, y, cx, cy, rOuter, rInner) {
  let hits = 0
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const dx = x + (sx + 0.5) / 3 - cx
      const dy = y + (sy + 0.5) / 3 - cy
      const d = Math.hypot(dx, dy)
      if (d <= rOuter && d >= rInner) hits++
    }
  }
  return hits / 9
}

function blend(dst, i, color, alpha) {
  if (alpha <= 0) return
  for (let c = 0; c < 3; c++) {
    dst[i + c] = Math.round(dst[i + c] * (1 - alpha) + color[c] * alpha)
  }
  dst[i + 3] = Math.round(dst[i + 3] * (1 - alpha) + 255 * alpha)
}

function render(size, { squircle }) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  // A maskable icon gets a full bleed background; the standard icon gets a
  // rounded square so it looks right un-masked on iOS/desktop.
  const radius = size * 0.22
  const ringOuter = size * (squircle ? 0.33 : 0.36)
  const ringInner = ringOuter - size * 0.085
  const dotR = size * 0.085

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let bgA = 1
      if (!squircle) {
        // Rounded-rect mask.
        const qx = Math.max(radius - x, x - (size - radius), 0)
        const qy = Math.max(radius - y, y - (size - radius), 0)
        const d = Math.hypot(qx, qy)
        bgA = d <= radius ? 1 : Math.max(0, 1 - (d - radius))
      }
      blend(px, i, BG, bgA)

      const cov = coverage(x, y, c, c, ringOuter, ringInner)
      if (cov > 0) {
        // Angle measured clockwise from 12 o'clock.
        const a = (Math.atan2(x + 0.5 - c, c - (y + 0.5)) + TAU) % TAU
        const filled = a <= TAU * PROGRESS
        blend(px, i, filled ? RING : RING_TRACK, cov * bgA)
      }

      const dot = coverage(x, y, c, c, dotR, 0)
      if (dot > 0) blend(px, i, DOT, dot * bgA)
    }
  }
  return px
}

mkdirSync(OUT, { recursive: true })
const targets = [
  ['icon-192.png', 192, { squircle: false }],
  ['icon-512.png', 512, { squircle: false }],
  ['apple-touch-icon.png', 180, { squircle: true }],
  ['maskable-512.png', 512, { squircle: true }],
]
for (const [name, size, opts] of targets) {
  writeFileSync(resolve(OUT, name), png(size, render(size, opts)))
  console.log('wrote', name, size)
}
