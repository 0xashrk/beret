import { fmt, lerp } from './math'

/**
 * Every outline in the engine is a closed polygon of exactly `SAMPLES` points,
 * spaced evenly by arc length, starting at the leftmost point and wound the
 * same way. With that shared sampling, point i of one hat corresponds to point
 * i of any other, so a morph is plain linear interpolation.
 */
export const SAMPLES = 128

export type Pt = [number, number]
export type Outline = Pt[]

/* ------------------------------------------------------------ SVG parsing */

const TOKEN = /[MmLlHhVvCcSsZz]|-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g
const CURVE_STEPS = 24

/**
 * Flattens the subset of SVG path data Illustrator exports for simple shapes:
 * M L H V C S Z, absolute and relative, with implicit command repetition.
 * Only the first subpath is kept: every logo shape is a single closed blob.
 */
export function flattenPath(d: string): Outline {
  const tokens = d.match(TOKEN) ?? []
  const out: Outline = []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  // last cubic control point, for S reflection
  let cx = 0
  let cy = 0
  let started = false
  const num = (): number => Number(tokens[i++])

  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const k = s / CURVE_STEPS
      const m = 1 - k
      out.push([
        m * m * m * x + 3 * m * m * k * x1 + 3 * m * k * k * x2 + k * k * k * x3,
        m * m * m * y + 3 * m * m * k * y1 + 3 * m * k * k * y2 + k * k * k * y3
      ])
    }
    cx = x2
    cy = y2
    x = x3
    y = y3
  }

  while (i < tokens.length) {
    const tok = tokens[i]!
    if (/^[A-Za-z]$/.test(tok)) {
      cmd = tok
      i++
      if (cmd === 'Z' || cmd === 'z') {
        if (started) break
        continue
      }
    }
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num()
        y = oy + num()
        out.push([x, y])
        started = true
        // extra pairs after M are implicit L
        cmd = rel ? 'l' : 'L'
        cx = x
        cy = y
        break
      }
      case 'L':
        x = ox + num()
        y = oy + num()
        out.push([x, y])
        cx = x
        cy = y
        break
      case 'H':
        x = ox + num()
        out.push([x, y])
        cx = x
        cy = y
        break
      case 'V':
        y = oy + num()
        out.push([x, y])
        cx = x
        cy = y
        break
      case 'C': {
        const x1 = ox + num()
        const y1 = oy + num()
        const x2 = ox + num()
        const y2 = oy + num()
        cubic(x1, y1, x2, y2, ox + num(), oy + num())
        break
      }
      case 'S': {
        const x1 = 2 * x - cx
        const y1 = 2 * y - cy
        const x2 = ox + num()
        const y2 = oy + num()
        cubic(x1, y1, x2, y2, ox + num(), oy + num())
        break
      }
      default:
        throw new Error(`flattenPath: unsupported command "${cmd}"`)
    }
  }
  return out
}

/* ---------------------------------------------------------- normalisation */

export function signedArea(poly: Outline): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a / 2
}

/**
 * Resamples a closed polygon to `n` points evenly spaced by arc length, with
 * positive signed area (clockwise on screen, y down) and index 0 at the
 * leftmost vertex (lowest one on ties). Those two conventions are what make
 * outlines of unrelated hats correspond point for point.
 */
export function resample(input: Outline, n = SAMPLES): Outline {
  const poly = signedArea(input) < 0 ? [...input].reverse() : [...input]
  let start = 0
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i]!
    const s = poly[start]!
    if (p[0] < s[0] - 1e-9 || (Math.abs(p[0] - s[0]) <= 1e-9 && p[1] > s[1])) start = i
  }
  const ring = [...poly.slice(start), ...poly.slice(0, start)]
  ring.push(ring[0]!)

  const cum = [0]
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!
    const b = ring[i]!
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = cum[cum.length - 1]!
  const out: Outline = []
  let seg = 1
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total
    while (seg < cum.length - 1 && cum[seg]! < d) seg++
    const a = ring[seg - 1]!
    const b = ring[seg]!
    const len = cum[seg]! - cum[seg - 1]!
    const u = len > 0 ? (d - cum[seg - 1]!) / len : 0
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)])
  }
  return out
}

/** An outline collapsed onto one point: lets a hat without an accent grow one. */
export const pointOutline = (x: number, y: number, n = SAMPLES): Outline =>
  Array.from({ length: n }, () => [x, y] as Pt)

export function lerpOutline(a: Outline, b: Outline, k: number): Outline {
  const out: Outline = new Array(a.length)
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    const q = b[i]!
    out[i] = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
  }
  return out
}

export function centroid(poly: Outline): Pt {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p[0]
    y += p[1]
  }
  return [x / poly.length, y / poly.length]
}

/**
 * Closed Catmull-Rom spline through the points, emitted as cubic Beziers so
 * the 128-gon never shows facets at large sizes.
 */
export function smoothPath(poly: Outline): string {
  const n = poly.length
  const p0 = poly[0]!
  let d = `M${fmt(p0[0])} ${fmt(p0[1])}`
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n]!
    const b = poly[i]!
    const c = poly[(i + 1) % n]!
    const e = poly[(i + 2) % n]!
    d +=
      `C${fmt(b[0] + (c[0] - a[0]) / 6)} ${fmt(b[1] + (c[1] - a[1]) / 6)} ` +
      `${fmt(c[0] - (e[0] - b[0]) / 6)} ${fmt(c[1] - (e[1] - b[1]) / 6)} ${fmt(c[0])} ${fmt(c[1])}`
  }
  return `${d}Z`
}

/* ------------------------------------------------------- shape authoring */

/** Points along an elliptical arc, angles in radians, screen coordinates. */
export function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  steps = 24
): Outline {
  const out: Outline = []
  for (let s = 0; s <= steps; s++) {
    const a = lerp(from, to, s / steps)
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return out
}

/** Quadratic Bezier from a through control c to b, excluding a. */
export function quad(a: Pt, c: Pt, b: Pt, steps = 12): Outline {
  const out: Outline = []
  for (let s = 1; s <= steps; s++) {
    const k = s / steps
    const m = 1 - k
    out.push([m * m * a[0] + 2 * m * k * c[0] + k * k * b[0], m * m * a[1] + 2 * m * k * c[1] + k * k * b[1]])
  }
  return out
}

export const circle = (cx: number, cy: number, r: number): Outline => arc(cx, cy, r, r, 0, Math.PI * 2, 48).slice(0, -1)
