import { HATS, HAT_BASE_Y, type FaceAnchor, type HatId } from './hats'
import { clamp, createRng, easeOutQuint, fmt, lerp, loopNoise } from './math'
import { centroid, lerpOutline, smoothPath, type Outline, type Pt } from './outline'
import { STATES, blendPose, type Decor, type Pose, type StateId } from './states'

/** Base eye in face units, before the hat's face scale. */
const EYE_W = 0.2
const EYE_H = 0.44
/** half the distance between the two eyes */
const EYE_GAP = 0.26
/** how far the eyes travel when the gaze is at full tilt */
const GAZE_REACH: Pt = [0.14, 0.12]

const HAT_MORPH = 0.6
const FACE_FADE = 0.35

export interface EyeFrame {
  /** centre, in hat coordinates */
  cx: number
  cy: number
  w: number
  h: number
  /** degrees */
  rot: number
  capsule: number
  caret: number
}

/** Everything needed to draw one instant. Plain data, cheap to diff. */
export interface Frame {
  body: string
  shade: string
  accent: string
  /** SVG matrix() for the hat group (body, shade, accent, eyes) */
  hatTransform: string
  accentTransform: string
  eyes: [EyeFrame, EyeFrame]
  eyeOpacity: number
  /** in viewBox coordinates, outside the hat group */
  decor: Decor[]
}

export interface BeretEngine {
  setState(id: StateId, t: number): void
  setHat(id: HatId, t: number): void
  setFace(on: boolean, t: number): void
  sample(t: number): Frame
}

/* ------------------------------------------------------------- blinking */

const BLINK_DUR = 0.18

/** Pre-drawn schedule: deterministic, so sampling stays a pure function of time. */
const BLINKS: number[] = (() => {
  const rng = createRng(0xbe7e7)
  const out: number[] = []
  let t = 1.4
  while (t < 1200) {
    out.push(t)
    t += 1.9 + rng() * 2.7
    if (rng() < 0.18) {
      out.push(t)
      t += 0.24
    }
  }
  return out
})()

/** 1 = open. Fast close, slightly slower reopen. Loops after 20 minutes. */
function blinkLid(time: number): number {
  const t = time % 1200
  // binary search for the last blink that started before t
  let lo = 0
  let hi = BLINKS.length - 1
  if (t < BLINKS[0]!) return 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (BLINKS[mid]! <= t) lo = mid
    else hi = mid - 1
  }
  const k = (t - BLINKS[lo]!) / BLINK_DUR
  if (k > 1) return 1
  return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55
}

/* ------------------------------------------------------------ geometry */

function matrix(tx: number, ty: number, px: number, py: number, rotDeg: number, sx: number, sy: number): string {
  // translate(tx,ty) . translate(p) . rotate . scale . translate(-p)
  const r = (rotDeg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const a = c * sx
  const b = s * sx
  const cc = -s * sy
  const d = c * sy
  const e = tx + px - (a * px + cc * py)
  const f = ty + py - (b * px + d * py)
  return `matrix(${fmt(a)} ${fmt(b)} ${fmt(cc)} ${fmt(d)} ${fmt(e)} ${fmt(f)})`
}

function eyeFrames(pose: Pose, face: FaceAnchor, gaze: Pt, lid: number): [EyeFrame, EyeFrame] {
  const r = (face.roll * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const lidScale = 0.06 + 0.94 * clamp(lid)
  const build = (side: -1 | 1): EyeFrame => {
    const cfg = pose.eyes[side < 0 ? 0 : 1]
    const lx = (side * EYE_GAP + gaze[0] * GAZE_REACH[0] + cfg.dx) * face.scale
    const ly = (gaze[1] * GAZE_REACH[1] + cfg.dy) * face.scale
    // The eye on the side being looked towards turns away from the viewer and
    // foreshortens: a cheap stand-in for eyes painted on a curved crown.
    const turn = 1 - 0.28 * Math.max(0, side * gaze[0])
    return {
      cx: face.x + lx * cos - ly * sin,
      cy: face.y + lx * sin + ly * cos,
      w: EYE_W * cfg.w * face.scale * turn,
      h: EYE_H * cfg.h * face.scale * lidScale * cfg.open,
      rot: face.roll + cfg.tilt,
      capsule: 1 - cfg.caret,
      caret: cfg.caret
    }
  }
  return [build(-1), build(1)]
}

/* --------------------------------------------------------------- engine */

interface StateSlot {
  id: StateId
  t0: number
  /** composite pose captured when a change landed mid-fade */
  frozen: Pose | null
}

interface HatSlot {
  id: HatId
  t0: number
  from: { body: Outline; shade: Outline; accent: Outline; face: FaceAnchor } | null
}

export function createEngine(opts: { state?: StateId; hat?: HatId; face?: boolean } = {}): BeretEngine {
  let cur: StateSlot = { id: opts.state ?? 'idle', t0: 0, frozen: null }
  let prev: StateSlot | null = null
  let hat: HatSlot = { id: opts.hat ?? 'beret', t0: -Infinity, from: null }
  let face = { on: opts.face ?? true, t0: -Infinity, from: (opts.face ?? true) ? 1 : 0 }

  function poseAt(t: number): Pose {
    const def = STATES[cur.id]
    const local = Math.max(0, t - cur.t0)
    const target = def.pose(local)
    if (!prev || local >= def.morph) return target
    const from = prev.frozen ?? STATES[prev.id].pose(Math.max(0, t - prev.t0))
    return blendPose(from, target, easeOutQuint(local / def.morph))
  }

  function hatAt(t: number) {
    const def = HATS[hat.id]
    const k = hat.from ? clamp((t - hat.t0) / HAT_MORPH) : 1
    if (!hat.from || k >= 1) return def
    const e = easeOutQuint(k)
    const f = hat.from
    return {
      body: lerpOutline(f.body, def.body, e),
      shade: lerpOutline(f.shade, def.shade, e),
      accent: lerpOutline(f.accent, def.accent, e),
      face: {
        x: lerp(f.face.x, def.face.x, e),
        y: lerp(f.face.y, def.face.y, e),
        scale: lerp(f.face.scale, def.face.scale, e),
        roll: lerp(f.face.roll, def.face.roll, e)
      },
      paths: null
    }
  }

  function faceAt(t: number): number {
    const k = clamp((t - face.t0) / FACE_FADE)
    return lerp(face.from, face.on ? 1 : 0, easeOutQuint(k))
  }

  return {
    setState(id, t) {
      if (id === cur.id) return
      const local = t - cur.t0
      // Only freeze inside a fade: outside one, the outgoing state keeps its
      // own animation running while it fades, which is what reads as alive.
      const frozen = prev && local < STATES[cur.id].morph ? poseAt(t) : null
      prev = { ...cur, frozen }
      cur = { id, t0: t, frozen: null }
    },

    setHat(id, t) {
      if (id === hat.id) return
      const h = hatAt(t)
      hat = { id, t0: t, from: { body: h.body, shade: h.shade, accent: h.accent, face: h.face } }
    },

    setFace(on, t) {
      if (on === face.on) return
      face = { on, t0: t, from: faceAt(t) }
    },

    sample(t) {
      const pose = poseAt(t)
      const h = hatAt(t)

      const drift: Pt = [
        (loopNoise(t, 11.3, 0.4) * 0.28 + loopNoise(t, 3.7, 2.1) * 0.08) * pose.wander,
        (loopNoise(t, 9.1, 1.3) * 0.22 + loopNoise(t, 4.3, 0.7) * 0.07) * pose.wander
      ]
      const gaze: Pt = [pose.gaze[0] + drift[0], pose.gaze[1] + drift[1]]
      const lid = lerp(1, blinkLid(t), pose.blink)

      const accentCenter = centroid(h.accent)
      return {
        body: h.paths?.body ?? smoothPath(h.body),
        shade: h.paths?.shade ?? smoothPath(h.shade),
        accent: h.paths?.accent ?? smoothPath(h.accent),
        hatTransform: matrix(pose.tx, pose.ty, 0, HAT_BASE_Y, pose.rot, pose.sx, pose.sy),
        accentTransform: matrix(
          pose.accent.dx,
          pose.accent.dy,
          accentCenter[0],
          accentCenter[1],
          pose.accent.rot,
          pose.accent.scale,
          pose.accent.scale
        ),
        eyes: eyeFrames(pose, h.face, gaze, lid),
        eyeOpacity: pose.eyeAlpha * faceAt(t),
        decor: pose.decor.filter((d) => d.opacity > 0.002)
      }
    }
  }
}
