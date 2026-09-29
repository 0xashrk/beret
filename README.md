# beret

A living SVG hat. One filled shape morphs between **8 states** and **6 hats**,
with two eyes clipped to its silhouette. No animation library: every frame is
`engine.sample(t)`, a pure function of time.

**Demo:** https://0xashrk.github.io/beret/

The beret is the [Ask Gina](https://askgina.ai) logo. The idea comes from
[bloub](https://github.com/jeremy-prt/bloub) by jeremy-prt, a recreation of
the x.ai bot avatar, and the OpenAI "dots" characters: give a flat mark a face
and a few honest reactions, and it stops looking like clip art.

## Running it

```bash
pnpm install
pnpm dev      # http://localhost:5191
pnpm test     # vitest
pnpm build    # tsc --noEmit && vite build
```

`#state=working&hat=tophat` in the URL opens that combination directly.

## Using the component

```tsx
import { Beret } from './src'

<Beret />                                        // idle beret, 24px, decorative
<Beret state="working" size={18} />              // a spinner that is also the logo
<Beret state="thinking" hat="fedora" size={32} title="Thinking" />
<Beret state="happy" frozenAt={0.4} />           // one exact frame, no loop
```

| Prop | Default | |
|---|---|---|
| `state` | `'idle'` | `idle` `thinking` `working` `searching` `wink` `happy` `alert` `sleep` |
| `hat` | `'beret'` | `beret` `cap` `beanie` `tophat` `bucket` `fedora` |
| `face` | `true` | eyes fade in and out |
| `size` | `24` | CSS size of the square box |
| `frozenAt` | | render exactly this engine time, no animation loop |
| `paused` | `false` | stop animating and show the state's resting pose |
| `colors` | Gina reds | `{ body, shade, eye }`, any subset |
| `title` | | set it and the SVG is announced as an image; omit it and it is decorative |

The component is `'use client'` and SSR-safe: server and first client render
both draw `t = 0`. It stops its `requestAnimationFrame` loop when offscreen,
when the tab is hidden, and under `prefers-reduced-motion`, where it shows a
still of the current state instead.

## The states

| State | What it does | Meant for |
|---|---|---|
| `idle` | blinks, gaze drifts, barely breathes | resting avatar |
| `thinking` | glances up, three dots pulse left to right | model is reasoning |
| `working` | twirls on a finger, eyes hidden while it faces away | replaces a spinner |
| `searching` | eyes scan side to side, hat leans with them | tool calls, lookups |
| `wink` | one eye shut as a wide dash | playful acknowledgement |
| `happy` | hops with squash on landing, `^ ^` eyes | done, success |
| `alert` | short shake, round eyes, a `!` | needs attention |
| `sleep` | shut eyes, slumps, z's drift up | offline, idle for long |

## How it works

- **Outlines correspond point for point.** Every outline (body, darker band,
  accent) is resampled to 128 points evenly spaced by arc length, starting at
  the leftmost point with the same winding. Point *i* of the beret is point *i*
  of the top hat, so morphing is linear interpolation, no path-morphing
  library. A hat without an accent (stem, pom, feather) collapses it to a
  point, so it grows in and out during morphs.
- **The beret is the logo.** Its outlines come from parsing the three paths of
  `public/beret.svg`; a test keeps every sampled point within 0.005 units of
  the original curve.
- **`sample(t)` is pure.** No `Date.now()`, no mutation while sampling. The
  blink schedule is pre-drawn from a seeded RNG, and gaze drift is summed sines
  with irrational period ratios, so it never visibly repeats.
- **Changes mid-fade blend from what is on screen.** A state change landing
  inside another state's blend freezes the composite pose and blends from it,
  not from the full pose of the state being left. Outside a fade the outgoing
  state keeps animating while it fades. Same for hats. A test drives a session
  frame by frame and bounds the per-frame jump.
- **Eyes are clipped to the body.** They are drawn in the hat's own
  coordinates with the body as a `clipPath`, so they tilt, squash and spin with
  it and cut off at the edge instead of spilling over.
- **Ease-out, no springs.** Blends use `easeOutQuint`. The only bounce is the
  squash on the `happy` landing, written into that state.

## Layout

```
src/engine/   framework-free: outlines, hats, states, engine
src/react/    <Beret>, the only React code the library needs
src/demo/     the playground deployed to GitHub Pages
```

## License

MIT. See [LICENSE](LICENSE). Parts of the engine are adapted from bloub, whose
MIT notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not
affiliated with x.ai or OpenAI.
