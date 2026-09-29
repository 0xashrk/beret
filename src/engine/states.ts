import { TAU, clamp, easeInCubic, easeOutCubic, easeOutQuint, lerp, smoothstep } from './math'

export type StateId = 'idle' | 'thinking' | 'working' | 'searching' | 'wink' | 'happy' | 'alert' | 'sleep'

export const STATE_IDS: readonly StateId[] = [
  'idle',
  'thinking',
  'working',
  'searching',
  'wink',
  'happy',
  'alert',
  'sleep'
]

/** Eye settings as multipliers of the hat's base eye, in face units. */
export interface EyeCfg {
  w: number
  h: number
  /** 1 open, 0 shut; multiplies the blink lid */
  open: number
  /** 0 capsule, 1 happy caret (^); in between they crossfade */
  caret: number
  dx: number
  dy: number
  /** degrees, on top of the hat's face roll */
  tilt: number
}

export type Decor =
  | { kind: 'dot'; x: number; y: number; r: number; opacity: number }
  | { kind: 'z'; x: number; y: number; size: number; opacity: number }
  | { kind: 'bang'; x: number; y: number; size: number; opacity: number }

export interface Pose {
  /** hat transform about the middle of its base */
  tx: number
  ty: number
  rot: number
  sx: number
  sy: number
  accent: { dx: number; dy: number; rot: number; scale: number }
  /** where the eyes look, -1..1 on each axis */
  gaze: [number, number]
  eyes: [EyeCfg, EyeCfg]
  eyeAlpha: number
  /** how much idle gaze drift applies */
  wander: number
  /** how much the blink schedule applies */
  blink: number
  decor: Decor[]
}

export interface StateDef {
  id: StateId
  /** duration of the blend into this state */
  morph: number
  pose(local: number): Pose
}

const eye = (over: Partial<EyeCfg> = {}): EyeCfg => ({ w: 1, h: 1, open: 1, caret: 0, dx: 0, dy: 0, tilt: 0, ...over })

function base(over: Partial<Pose> = {}): Pose {
  return {
    tx: 0,
    ty: 0,
    rot: 0,
    sx: 1,
    sy: 1,
    accent: { dx: 0, dy: 0, rot: 0, scale: 1 },
    gaze: [0, 0],
    eyes: [eye(), eye()],
    eyeAlpha: 1,
    wander: 1,
    blink: 1,
    decor: [],
    ...over
  }
}

export function blendPose(a: Pose, b: Pose, k: number): Pose {
  const blendEye = (p: EyeCfg, q: EyeCfg): EyeCfg => ({
    w: lerp(p.w, q.w, k),
    h: lerp(p.h, q.h, k),
    open: lerp(p.open, q.open, k),
    caret: lerp(p.caret, q.caret, k),
    dx: lerp(p.dx, q.dx, k),
    dy: lerp(p.dy, q.dy, k),
    tilt: lerp(p.tilt, q.tilt, k)
  })
  return {
    tx: lerp(a.tx, b.tx, k),
    ty: lerp(a.ty, b.ty, k),
    rot: lerp(a.rot, b.rot, k),
    sx: lerp(a.sx, b.sx, k),
    sy: lerp(a.sy, b.sy, k),
    accent: {
      dx: lerp(a.accent.dx, b.accent.dx, k),
      dy: lerp(a.accent.dy, b.accent.dy, k),
      rot: lerp(a.accent.rot, b.accent.rot, k),
      scale: lerp(a.accent.scale, b.accent.scale, k)
    },
    gaze: [lerp(a.gaze[0], b.gaze[0], k), lerp(a.gaze[1], b.gaze[1], k)],
    eyes: [blendEye(a.eyes[0], b.eyes[0]), blendEye(a.eyes[1], b.eyes[1])],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, k),
    wander: lerp(a.wander, b.wander, k),
    blink: lerp(a.blink, b.blink, k),
    // decor is not interpolated: the outgoing set fades while the new one fades in
    decor: [
      ...a.decor.map((d) => ({ ...d, opacity: d.opacity * (1 - k) })),
      ...b.decor.map((d) => ({ ...d, opacity: d.opacity * k }))
    ]
  }
}

/** A pulse that travels left to right across three dots, 1.5 s per wave. */
function dotPulse(t: number, index: number): number {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1
  return p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU * 2) : 0
}

/** Anticipation squash, rise, fall, landing squash, settle: 0.95 s. */
function hop(t: number): { ty: number; sx: number; sy: number } {
  if (t < 0.12) {
    const k = easeOutCubic(t / 0.12)
    return { ty: 0, sx: 1 + 0.06 * k, sy: 1 - 0.09 * k }
  }
  if (t < 0.45) {
    const k = easeOutCubic((t - 0.12) / 0.33)
    return { ty: -0.16 * k, sx: lerp(1.06, 0.97, k), sy: lerp(0.91, 1.05, k) }
  }
  if (t < 0.72) {
    const k = easeInCubic((t - 0.45) / 0.27)
    return { ty: -0.16 * (1 - k), sx: lerp(0.97, 1, k), sy: lerp(1.05, 1, k) }
  }
  if (t < 0.95) {
    const k = (t - 0.72) / 0.23
    const squash = Math.sin(k * Math.PI) * (1 - k * 0.4)
    return { ty: 0, sx: 1 + 0.05 * squash, sy: 1 - 0.07 * squash }
  }
  return { ty: 0, sx: 1, sy: 1 }
}

export const STATES: Record<StateId, StateDef> = {
  idle: {
    id: 'idle',
    morph: 0.45,
    // Life at rest is gaze drift and blinks, plus a breath too small to notice
    // consciously. No floating bob: it reads as restless at icon sizes.
    pose: (t) => base({ sy: 1 + Math.sin((t / 3.4) * TAU) * 0.008 })
  },

  thinking: {
    id: 'thinking',
    morph: 0.4,
    pose: (t) => {
      const emerge = easeOutCubic(clamp(t / 0.35))
      return base({
        rot: -3 + Math.sin((t / 3) * TAU) * 2,
        gaze: [0.55, -0.65],
        eyes: [eye({ open: 0.8 }), eye({ open: 0.8 })],
        wander: 0.25,
        decor: [0, 1, 2].map((i) => {
          const k = dotPulse(t, i)
          return {
            kind: 'dot' as const,
            x: 0.46 + i * 0.2,
            y: -0.8 - k * 0.05,
            r: 0.055 * emerge * (1 + 0.45 * k),
            opacity: 0.45 + 0.55 * k
          }
        })
      })
    }
  },

  working: {
    id: 'working',
    morph: 0.3,
    // Twirled on a finger: horizontal scale follows cos, so the hat shows its
    // back half the time. Starts at cos(0) = 1, which keeps the entry smooth.
    // Edge-on it keeps a sliver of thickness instead of vanishing, which is
    // what a real brim does and what keeps it visible at 18px.
    pose: (t) => {
      const c = Math.cos((t / 1.2) * TAU)
      return base({
        sx: Math.sign(c) * Math.hypot(c, 0.1),
        ty: -Math.abs(Math.sin((t / 1.2) * TAU)) * 0.03,
        eyeAlpha: smoothstep(0.15, 0.55, c),
        wander: 0,
        blink: 0
      })
    }
  },

  searching: {
    id: 'searching',
    morph: 0.4,
    pose: (t) => {
      // sqrt of a sine lingers at each end, like actually reading a line
      const s = Math.sin((t / 2.2) * TAU)
      const look = Math.sign(s) * Math.sqrt(Math.abs(s))
      return base({
        rot: look * 5,
        tx: look * 0.03,
        gaze: [look * 0.85, 0.1],
        wander: 0,
        blink: 0.6
      })
    }
  },

  wink: {
    id: 'wink',
    morph: 0.3,
    pose: () =>
      base({
        rot: 4,
        gaze: [-0.15, -0.1],
        // the shut eye is a dash wider than the open one, not a squashed capsule
        eyes: [eye(), eye({ w: 1.9, h: 0.24, dy: 0.06 })],
        accent: { dx: 0, dy: 0, rot: -10, scale: 1 },
        wander: 0.3,
        blink: 0
      })
  },

  happy: {
    id: 'happy',
    morph: 0.3,
    pose: (t) => {
      const local = t % 2.6
      const h = hop(local)
      // the accent pops at the top of the hop
      const pop = local < 0.95 ? Math.sin(clamp(local / 0.95) * Math.PI) : 0
      return base({
        ty: h.ty,
        sx: h.sx,
        sy: h.sy,
        eyes: [eye({ caret: 1, dy: 0.02 }), eye({ caret: 1, dy: 0.02 })],
        accent: { dx: 0, dy: -0.03 * pop, rot: 0, scale: 1 + 0.25 * pop },
        wander: 0,
        blink: 0
      })
    }
  },

  alert: {
    id: 'alert',
    morph: 0.2,
    pose: (t) => {
      const shake = Math.sin(t * TAU * 7) * Math.exp(-t * 5)
      const pop = easeOutQuint(clamp(t / 0.3))
      return base({
        rot: shake * 6,
        tx: shake * 0.02,
        eyes: [eye({ w: 1.6, h: 0.78 }), eye({ w: 1.6, h: 0.78 })],
        wander: 0.15,
        blink: 0,
        decor: [{ kind: 'bang', x: 0.78, y: -0.66, size: 0.2 * (0.5 + 0.5 * pop), opacity: pop }]
      })
    }
  },

  sleep: {
    id: 'sleep',
    morph: 0.6,
    pose: (t) =>
      base({
        rot: 3,
        ty: 0.02,
        sy: 0.95 + Math.sin((t / 3.2) * TAU) * 0.015,
        eyes: [eye({ w: 1.5, h: 0.2, dy: 0.08 }), eye({ w: 1.5, h: 0.2, dy: 0.08 })],
        wander: 0,
        blink: 0,
        decor: [0, 1, 2].map((i) => {
          const p = ((((t - i) / 3) % 1) + 1) % 1
          return {
            kind: 'z' as const,
            x: 0.46 + p * 0.3,
            y: -0.42 - p * 0.45,
            size: 0.05 + p * 0.06,
            opacity: Math.sin(p * Math.PI)
          }
        })
      })
  }
}
