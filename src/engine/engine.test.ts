import { describe, expect, it } from 'vitest'
import { createEngine, type BeretEngine, type Frame } from './engine'
import { HATS, HAT_IDS, LOGO_PATHS, fromLogo } from './hats'
import { SAMPLES, flattenPath, signedArea, type Outline, type Pt } from './outline'
import { STATE_IDS } from './states'

const numbers = (d: string): number[] => (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)

function maxJump(a: string, b: string): number {
  const p = numbers(a)
  const q = numbers(b)
  expect(q.length).toBe(p.length)
  let m = 0
  for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i]! - q[i]!))
  return m
}

function eyeJump(a: Frame, b: Frame): number {
  return Math.max(
    ...a.eyes.map((e, i) => Math.hypot(e.cx - b.eyes[i]!.cx, e.cy - b.eyes[i]!.cy, e.h - b.eyes[i]!.h))
  )
}

function inside(poly: Outline, [x, y]: Pt): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

type Change = [t: number, apply: (e: BeretEngine, t: number) => void]

/**
 * Changes land as time advances, the way the component drives the engine.
 * The engine keeps one slot of history, so it only replays times after the
 * last change: applying everything up front would hide mid-fade jumps.
 */
const SESSION: Change[] = [
  [1, (e, t) => e.setState('sleep', t)],
  // 0.03 s into sleep's 0.6 s blend: the eyes are still mostly open, and
  // blending from the full sleep pose would snap them shut
  [1.03, (e, t) => e.setState('alert', t)],
  [1.5, (e, t) => e.setHat('tophat', t)],
  // 0.2 s into the 0.6 s hat morph
  [1.7, (e, t) => e.setHat('cap', t)],
  [2.5, (e, t) => e.setState('happy', t)],
  [2.6, (e, t) => e.setFace(false, t)],
  [2.7, (e, t) => e.setFace(true, t)]
]

function play(until: number): BeretEngine {
  const engine = createEngine()
  for (const [t, apply] of SESSION) if (t <= until) apply(engine, t)
  return engine
}

describe('engine', () => {
  it('sample does not mutate: order of reads never changes a frame', () => {
    const times = Array.from({ length: 60 }, (_, i) => 2.7 + i * 0.031)
    const forward = play(2.7)
    const shuffled = play(2.7)
    const expected = times.map((t) => forward.sample(t))
    const order = [...times.keys()].sort((a, b) => ((a * 7919) % 60) - ((b * 7919) % 60))
    for (const i of order) expect(shuffled.sample(times[i]!)).toEqual(expected[i])
  })

  it('stays continuous when state and hat changes land mid-fade', () => {
    const engine = createEngine()
    let pending = 0
    let prev = engine.sample(0.9)
    for (let t = 0.9 + 1 / 60; t < 3.2; t += 1 / 60) {
      while (pending < SESSION.length && SESSION[pending]![0] <= t) {
        const [at, apply] = SESSION[pending++]!
        apply(engine, at)
      }
      const next = engine.sample(t)
      // a hard cut between hats moves points by 0.3 to 0.6
      expect(maxJump(prev.body, next.body)).toBeLessThan(0.1)
      expect(maxJump(prev.hatTransform, next.hatTransform)).toBeLessThan(0.1)
      // snapping from half-open to sleep's shut eyes changes their height by ~0.2
      expect(eyeJump(prev, next)).toBeLessThan(0.06)
      // an ease-out quint fade moves ~0.24 in its first frame; a cut moves 1
      expect(Math.abs(prev.eyeOpacity - next.eyeOpacity)).toBeLessThan(0.3)
      prev = next
    }
  })

  it('renders every state on every hat', () => {
    for (const hat of HAT_IDS) {
      for (const state of STATE_IDS) {
        const frame = createEngine({ hat, state }).sample(1.2)
        expect(numbers(frame.body).every(Number.isFinite)).toBe(true)
        expect(frame.eyes.every((e) => Number.isFinite(e.cx + e.cy + e.w + e.h))).toBe(true)
      }
    }
  })
})

describe('hats', () => {
  it('share sampling and winding, so morphs never turn inside out', () => {
    for (const id of HAT_IDS) {
      const hat = HATS[id]
      for (const outline of [hat.body, hat.shade, hat.accent]) expect(outline).toHaveLength(SAMPLES)
      expect(signedArea(hat.body)).toBeGreaterThan(0)
      expect(signedArea(hat.shade)).toBeGreaterThan(0)
      // accents may be collapsed to a point (area 0) but never reversed
      expect(signedArea(hat.accent)).toBeGreaterThanOrEqual(0)
    }
  })

  it('parses the logo paths into closed outlines', () => {
    for (const d of Object.values(LOGO_PATHS)) {
      const pts = flattenPath(d)
      const first = pts[0]!
      const last = pts[pts.length - 1]!
      expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(0.05)
    }
  })

  it('keeps the beret identical to the logo', () => {
    const logo = flattenPath(LOGO_PATHS.body).map(fromLogo)
    const distToLogo = ([x, y]: Pt) => {
      let best = Infinity
      for (let i = 0; i < logo.length; i++) {
        const a = logo[i]!
        const b = logo[(i + 1) % logo.length]!
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
        best = Math.min(best, Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy))
      }
      return best
    }
    // 0.005 of a 2-unit viewBox is 0.06 px at 24 px
    for (const p of HATS.beret.body) expect(distToLogo(p)).toBeLessThan(0.005)
  })

  it('puts both eyes on the crown at rest', () => {
    for (const hat of HAT_IDS) {
      const frame = createEngine({ hat }).sample(1.2)
      for (const e of frame.eyes) {
        const r = (e.rot * Math.PI) / 180
        const ux = -Math.sin(r) * (e.h / 2)
        const uy = Math.cos(r) * (e.h / 2)
        for (const p of [
          [e.cx, e.cy],
          [e.cx + ux, e.cy + uy],
          [e.cx - ux, e.cy - uy]
        ] as Pt[]) {
          expect(inside(HATS[hat].body, p), `${hat} eye point ${p}`).toBe(true)
          expect(inside(HATS[hat].shade, p), `${hat} eye on the band`).toBe(false)
        }
      }
    }
  })
})
