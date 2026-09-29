'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createEngine, type BeretEngine, type Frame } from '../engine/engine'
import type { HatId } from '../engine/hats'
import { fmt } from '../engine/math'
import type { StateId } from '../engine/states'

export interface BeretColors {
  body: string
  shade: string
  eye: string
}

export const DEFAULT_COLORS: BeretColors = { body: '#b50d00', shade: '#7c0600', eye: '#fff4ec' }

export interface BeretProps {
  state?: StateId
  hat?: HatId
  face?: boolean
  /** CSS size of the square box */
  size?: number | string
  /** render exactly this engine time, with no animation loop */
  frozenAt?: number
  /** stop animating and show the state's resting pose */
  paused?: boolean
  colors?: Partial<BeretColors>
  className?: string
  /** present: announced as an image with this label; absent: decorative */
  title?: string
}

/**
 * The instant used when the component must not animate (paused or reduced
 * motion): late enough that every entry blend has resolved, early enough that
 * the first blink (1.4 s) has not started.
 */
const STILL_AT = 1.2

export function Beret({
  state = 'idle',
  hat = 'beret',
  face = true,
  size = 24,
  frozenAt,
  paused = false,
  colors,
  className,
  title
}: BeretProps) {
  const id = `beret-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const svgRef = useRef<SVGSVGElement>(null)
  const engineRef = useRef<BeretEngine | null>(null)
  engineRef.current ??= createEngine({ state, hat, face })
  // null until mounted, so server and first client render both sample t = 0
  const originRef = useRef<number | null>(null)
  const [liveFrame, setLiveFrame] = useState<Frame>(() => engineRef.current!.sample(0))
  const [reducedMotion, setReducedMotion] = useState(false)
  const [onScreen, setOnScreen] = useState(true)

  const clock = () => (originRef.current === null ? 0 : (performance.now() - originRef.current) / 1000)

  useEffect(() => {
    originRef.current ??= performance.now()
  }, [])

  useEffect(() => engineRef.current!.setState(state, clock()), [state])
  useEffect(() => engineRef.current!.setHat(hat, clock()), [hat])
  useEffect(() => engineRef.current!.setFace(face, clock()), [face])

  // matchMedia and IntersectionObserver are missing in jsdom and some embedded
  // webviews; without them the bot simply animates whenever mounted.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(query.matches)
    const onChange = () => setReducedMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let intersecting = true
    const update = () => setOnScreen(intersecting && document.visibilityState === 'visible')
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            intersecting = entries.some((e) => e.isIntersecting)
            update()
          })
        : null
    observer?.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  const stillAt = frozenAt ?? (paused || reducedMotion ? STILL_AT : null)
  const animating = stillAt === null && onScreen

  useEffect(() => {
    if (!animating) return
    let raf = 0
    const tick = () => {
      setLiveFrame(engineRef.current!.sample(clock()))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animating])

  // A still is drawn by a fresh engine so it shows the state itself, not
  // whatever blend the live engine happened to be in.
  const stillFrame = useMemo(
    () => (stillAt === null ? null : createEngine({ state, hat, face }).sample(stillAt)),
    [stillAt, state, hat, face]
  )
  const frame = stillFrame ?? liveFrame
  const c = { ...DEFAULT_COLORS, ...colors }
  const clip = `url(#${id}-clip)`

  return (
    <svg
      ref={svgRef}
      viewBox="-1 -1 2 2"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={frame.body} />
        </clipPath>
      </defs>
      <g transform={frame.hatTransform}>
        <path d={frame.body} fill={c.body} />
        <path d={frame.shade} fill={c.shade} clipPath={clip} />
        <path d={frame.accent} fill={c.body} transform={frame.accentTransform} />
        {frame.eyeOpacity > 0.002 ? (
          <g clipPath={clip} opacity={frame.eyeOpacity}>
            {frame.eyes.map((e, i) => {
              const hw = e.w * 0.95
              const hh = e.h * 0.22
              return (
                <g key={i} transform={`translate(${fmt(e.cx)} ${fmt(e.cy)}) rotate(${fmt(e.rot)})`}>
                  {e.capsule > 0.01 ? (
                    <rect
                      x={fmt(-e.w / 2)}
                      y={fmt(-e.h / 2)}
                      width={fmt(e.w)}
                      height={fmt(e.h)}
                      rx={fmt(Math.min(e.w, e.h) / 2)}
                      fill={c.eye}
                      opacity={e.capsule}
                    />
                  ) : null}
                  {e.caret > 0.01 ? (
                    <path
                      d={`M${fmt(-hw)} ${fmt(hh)}L0 ${fmt(-hh)}L${fmt(hw)} ${fmt(hh)}`}
                      fill="none"
                      stroke={c.eye}
                      strokeWidth={fmt(e.w * 0.7)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={e.caret}
                    />
                  ) : null}
                </g>
              )
            })}
          </g>
        ) : null}
      </g>
      {frame.decor.map((d, i) => {
        if (d.kind === 'dot') {
          return <circle key={i} cx={fmt(d.x)} cy={fmt(d.y)} r={fmt(d.r)} fill={c.body} opacity={d.opacity} />
        }
        if (d.kind === 'z') {
          const s = d.size
          return (
            <path
              key={i}
              d={`M${fmt(d.x - s)} ${fmt(d.y - s)}H${fmt(d.x + s)}L${fmt(d.x - s)} ${fmt(d.y + s)}H${fmt(d.x + s)}`}
              fill="none"
              stroke={c.body}
              strokeWidth={fmt(s * 0.45)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={d.opacity}
            />
          )
        }
        const s = d.size
        return (
          <g key={i} fill={c.body} opacity={d.opacity}>
            <rect x={fmt(d.x - s * 0.22)} y={fmt(d.y - s)} width={fmt(s * 0.44)} height={fmt(s * 1.25)} rx={fmt(s * 0.22)} />
            <circle cx={fmt(d.x)} cy={fmt(d.y + s * 0.72)} r={fmt(s * 0.24)} />
          </g>
        )
      })}
    </svg>
  )
}
