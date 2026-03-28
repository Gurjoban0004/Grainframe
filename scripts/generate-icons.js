#!/usr/bin/env node
// Generates PWA icons for Grainframe at 192, 512, and 180px sizes.
// Background: #0e0e0e, lettermark "G" in #c9a96e

import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')

mkdirSync(outDir, { recursive: true })

const sizes = [192, 512, 180]

for (const size of sizes) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Dark background
  ctx.fillStyle = '#0e0e0e'
  ctx.fillRect(0, 0, size, size)

  // "G" lettermark in accent color
  const fontSize = Math.round(size * 0.6)
  ctx.fillStyle = '#c9a96e'
  ctx.font = `bold ${fontSize}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('G', size / 2, size / 2)

  const buffer = canvas.toBuffer('image/png')
  const outPath = join(outDir, `icon-${size}.png`)
  writeFileSync(outPath, buffer)
  console.log(`Generated ${outPath}`)
}
