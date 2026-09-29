import {
  arc,
  circle,
  flattenPath,
  pointOutline,
  quad,
  resample,
  smoothPath,
  type Outline,
  type Pt
} from './outline'

export type HatId = 'beret' | 'cap' | 'beanie' | 'tophat' | 'bucket' | 'fedora'

export const HAT_IDS: readonly HatId[] = ['beret', 'cap', 'beanie', 'tophat', 'bucket', 'fedora']

/** Where the two eyes sit on a hat's crown, in viewBox units. */
export interface FaceAnchor {
  x: number
  y: number
  /** eye size and spacing multiplier */
  scale: number
  /** degrees, follows the slope of the crown */
  roll: number
}

export interface HatShape {
  body: Outline
  /** darker band, drawn over the body and clipped to it */
  shade: Outline
  /** stem, pom or feather, body colour, drawn on top */
  accent: Outline
  face: FaceAnchor
}

export interface HatDef extends HatShape {
  id: HatId
  /** pre-built path data, reused on every frame the hat is not morphing */
  paths: { body: string; shade: string; accent: string }
}

/**
 * The viewBox is `-1 -1 2 2`. Hats are about 1.8 wide with their base near
 * y = 0.7, which leaves room above for the decor (dots, z's, "!") and some
 * margin for squash and hops.
 */
export const HAT_BASE_Y = 0.66

/* ------------------------------------------------ the logo, unchanged */

export const LOGO_PATHS = {
  body: 'M27.23,6.11c-1.59,9.96-9.11,10.06-14.26,11.4-3.61.94-11.66,2.45-12.9-.5C-.75,15.06,5.74,4.33,15.37.92c5.46-1.94,12.87-1.12,11.86,5.18Z',
  shade:
    'M26.41,8.67c.06,2.17-2.17,5.16-6.06,6.87-5.76,2.54-11.76,2.86-11.76,2.86,0,0,.56-.37,1.33-.84,3.12-1.93,6.78-7.04,11.54-8.8,4.45-1.65,4.92-.93,4.95-.09Z',
  accent: 'M9.13,4.35l-1.74,1.41c-1.48-.68-3.87-.96-3.09-2.11,1.37-2.03,3.44-.66,4.83.69Z'
} as const

/** Logo viewBox is 27.32 x 18.74; it is scaled to 1.8 wide and centred at (0, 0.1). */
const LOGO_SCALE = 1.8 / 27.32

export const fromLogo = ([x, y]: Pt): Pt => [(x - 13.66) * LOGO_SCALE, (y - 9.37) * LOGO_SCALE + 0.1]

const logoOutline = (d: string): Outline => flattenPath(d).map(fromLogo)

/* ------------------------------------------------------ authored skins */

const rotated = (poly: Outline, cx: number, cy: number, deg: number): Outline => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return poly.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c])
}

const SHAPES: Record<HatId, HatShape> = {
  beret: {
    body: logoOutline(LOGO_PATHS.body),
    shade: logoOutline(LOGO_PATHS.shade),
    accent: logoOutline(LOGO_PATHS.accent),
    // on the dome, above the band, tilted with the crown's upward slope
    face: { x: 0.17, y: -0.05, scale: 0.72, roll: -10 }
  },

  cap: {
    body: [
      [-0.84, 0.62],
      ...arc(-0.2, 0.5, 0.64, 0.95, Math.PI, Math.PI * 2, 40),
      ...quad([0.44, 0.5], [0.8, 0.44], [0.97, 0.58]),
      ...quad([0.97, 0.58], [0.8, 0.73], [0.3, 0.67]),
      ...quad([0.3, 0.67], [-0.25, 0.66], [-0.84, 0.62])
    ],
    // the peak
    shade: [
      [0.28, 0.5],
      ...quad([0.28, 0.5], [0.8, 0.4], [0.97, 0.58]),
      ...quad([0.97, 0.58], [0.8, 0.73], [0.3, 0.67])
    ],
    // top button
    accent: circle(-0.2, -0.46, 0.07),
    face: { x: -0.18, y: 0.08, scale: 0.74, roll: 0 }
  },

  beanie: {
    body: [
      [-0.8, 0.7],
      [-0.8, 0.3],
      ...arc(0, 0.3, 0.74, 0.8, Math.PI, Math.PI * 2, 40),
      [0.8, 0.3],
      [0.8, 0.7]
    ],
    // folded cuff
    shade: [
      [-0.8, 0.7],
      [-0.8, 0.3],
      [0.8, 0.3],
      [0.8, 0.7]
    ],
    // pom
    accent: circle(0, -0.58, 0.17),
    face: { x: 0, y: -0.08, scale: 0.76, roll: 0 }
  },

  tophat: {
    body: [
      [-0.88, 0.6],
      ...quad([-0.88, 0.6], [-0.86, 0.52], [-0.5, 0.52]),
      [-0.46, 0.5],
      [-0.5, -0.5],
      ...quad([-0.5, -0.5], [0, -0.56], [0.5, -0.5]),
      [0.46, 0.5],
      [0.5, 0.52],
      ...quad([0.5, 0.52], [0.86, 0.52], [0.88, 0.6]),
      ...quad([0.88, 0.6], [0.85, 0.7], [0.5, 0.7]),
      [-0.5, 0.7],
      ...quad([-0.5, 0.7], [-0.85, 0.7], [-0.88, 0.6])
    ],
    shade: [
      [-0.48, 0.25],
      [0.48, 0.25],
      [0.47, 0.51],
      [-0.47, 0.51]
    ],
    accent: pointOutline(0, -0.4),
    face: { x: 0, y: -0.1, scale: 0.76, roll: 0 }
  },

  bucket: {
    body: [
      [-0.9, 0.66],
      ...quad([-0.9, 0.66], [-0.75, 0.44], [-0.52, 0.34]),
      [-0.42, -0.36],
      ...quad([-0.42, -0.36], [0, -0.55], [0.42, -0.36]),
      [0.52, 0.34],
      ...quad([0.52, 0.34], [0.75, 0.44], [0.9, 0.66]),
      ...quad([0.9, 0.66], [0.8, 0.74], [0.62, 0.7]),
      ...quad([0.62, 0.7], [0, 0.62], [-0.62, 0.7]),
      ...quad([-0.62, 0.7], [-0.8, 0.74], [-0.9, 0.66])
    ],
    shade: [
      [-0.5, 0.16],
      [0.5, 0.16],
      [0.53, 0.35],
      [-0.53, 0.35]
    ],
    accent: pointOutline(0, -0.3),
    face: { x: 0, y: -0.08, scale: 0.72, roll: 0 }
  },

  fedora: {
    body: [
      [-0.92, 0.44],
      ...quad([-0.92, 0.44], [-0.8, 0.46], [-0.5, 0.4]),
      [-0.44, -0.3],
      ...quad([-0.44, -0.3], [-0.36, -0.5], [-0.2, -0.49]),
      ...quad([-0.2, -0.49], [0, -0.4], [0.2, -0.49]),
      ...quad([0.2, -0.49], [0.36, -0.5], [0.44, -0.3]),
      [0.5, 0.4],
      ...quad([0.5, 0.4], [0.8, 0.46], [0.92, 0.44]),
      ...quad([0.92, 0.44], [0.8, 0.66], [0.3, 0.62]),
      ...quad([0.3, 0.62], [0, 0.6], [-0.3, 0.62]),
      ...quad([-0.3, 0.62], [-0.8, 0.66], [-0.92, 0.44])
    ],
    shade: [
      [-0.47, 0.2],
      [0.47, 0.2],
      [0.5, 0.41],
      [-0.5, 0.41]
    ],
    // feather tucked into the band, red on the dark band so it reads
    accent: rotated(circle(0.28, 0.24, 0.2).map(([x, y]) => [x, 0.24 + (y - 0.24) * 0.3] as Pt), 0.28, 0.24, -28),
    face: { x: 0, y: -0.06, scale: 0.72, roll: 0 }
  }
}

function build(id: HatId): HatDef {
  const shape = SHAPES[id]
  const body = resample(shape.body)
  const shade = resample(shape.shade)
  // resampling a collapsed accent is safe: zero-length segments interpolate to the point itself
  const accent = resample(shape.accent)
  return {
    id,
    body,
    shade,
    accent,
    face: shape.face,
    paths: { body: smoothPath(body), shade: smoothPath(shade), accent: smoothPath(accent) }
  }
}

export const HATS: Record<HatId, HatDef> = Object.fromEntries(HAT_IDS.map((id) => [id, build(id)])) as Record<
  HatId,
  HatDef
>
