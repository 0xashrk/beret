export const TAU = Math.PI * 2

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

export const smoothstep = (e0: number, e1: number, v: number): number => {
  const k = clamp((v - e0) / (e1 - e0))
  return k * k * (3 - 2 * k)
}

export const easeOutQuint = (k: number): number => 1 - (1 - k) ** 5
export const easeOutCubic = (k: number): number => 1 - (1 - k) ** 3
export const easeInCubic = (k: number): number => k * k * k
export const easeInOutCubic = (k: number): number =>
  k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2

/** mulberry32: small, seeded, good enough to pre-draw a blink schedule. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Smooth pseudo-noise in [-1, 1]. Two sines whose period ratio is irrational,
 * so the sum never visibly repeats, and it stays a pure function of time.
 */
export const loopNoise = (t: number, period: number, phase: number): number =>
  Math.sin((t / period) * TAU + phase) * 0.62 + Math.sin((t / (period * 0.618)) * TAU + phase * 1.7) * 0.38

/** Formats a coordinate for path data: 3 decimals, no trailing noise. */
export const fmt = (v: number): string => (Math.round(v * 1000) / 1000).toString()
