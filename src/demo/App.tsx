import { useEffect, useState } from 'react'
import { Beret, HAT_IDS, STATE_IDS, type HatId, type StateId } from '../index'

const STATE_NOTES: Record<StateId, string> = {
  idle: 'blinks and drifts',
  thinking: 'glances up, dots pulse',
  working: 'twirls on a finger',
  searching: 'scans side to side',
  wink: 'one eye shut',
  happy: 'hops, eyes ^ ^',
  alert: 'shakes, raises a !',
  sleep: "z's drift up"
}

const CYCLE_EVERY = 2400

function readHash(): { state: StateId; hat: HatId } {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const state = params.get('state')
  const hat = params.get('hat')
  return {
    state: STATE_IDS.includes(state as StateId) ? (state as StateId) : 'idle',
    hat: HAT_IDS.includes(hat as HatId) ? (hat as HatId) : 'beret'
  }
}

export function App() {
  const [{ state, hat }, setSelection] = useState(readHash)
  const [face, setFace] = useState(true)
  const [cycling, setCycling] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  const setState = (next: StateId) => setSelection((s) => ({ ...s, state: next }))

  useEffect(() => {
    history.replaceState(null, '', `#state=${state}&hat=${hat}`)
  }, [state, hat])

  useEffect(() => {
    const onHash = () => setSelection(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    if (!cycling) return
    const id = window.setInterval(() => {
      setSelection((s) => ({ ...s, state: STATE_IDS[(STATE_IDS.indexOf(s.state) + 1) % STATE_IDS.length]! }))
    }, CYCLE_EVERY)
    return () => window.clearInterval(id)
  }, [cycling])

  return (
    <div className="page">
      <header className="masthead">
        <h1>beret</h1>
        <p>One shape, eight states, six hats. The eyes are holes cut through it; every frame is a pure function of time.</p>
        <nav>
          <a href="https://github.com/0xashrk/beret">GitHub</a>
          <button type="button" className="quiet" aria-pressed={dark} onClick={() => setDark((d) => !d)}>
            {dark ? 'Light' : 'Dark'}
          </button>
        </nav>
      </header>

      <main className="stage">
        <section className="hero" aria-label="Live preview">
          <Beret state={state} hat={hat} face={face} size={240} title={`${hat}, ${state}`} />
          <p className="caption">
            <strong>{state}</strong> {STATE_NOTES[state]}
          </p>
          <div className="sizes" aria-label="At icon sizes">
            {[16, 20, 24, 32].map((s) => (
              <figure key={s}>
                <Beret state={state} hat={hat} face={face} size={s} />
                <figcaption>{s}px</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="controls">
          <fieldset>
            <legend>State</legend>
            <div className="chips">
              {STATE_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={id === state} onClick={() => setState(id)}>
                  {id}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Hat</legend>
            <div className="hats">
              {HAT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === hat}
                  onClick={() => setSelection((s) => ({ ...s, hat: id }))}
                >
                  <Beret hat={id} face={face} size={44} frozenAt={1.2} />
                  <span>{id}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="toggles">
            <button type="button" aria-pressed={face} onClick={() => setFace((f) => !f)}>
              Face
            </button>
            <button type="button" aria-pressed={cycling} onClick={() => setCycling((c) => !c)}>
              Cycle states
            </button>
          </div>
        </section>
      </main>

      <section className="board" aria-label="Every state, frozen">
        <h2>Every state on the {hat}</h2>
        <ol>
          {STATE_IDS.map((id) => (
            <li key={id}>
              <button type="button" aria-pressed={id === state} onClick={() => setState(id)}>
                <Beret state={id} hat={hat} face={face} size={88} frozenAt={id === 'working' ? 1.35 : 1.2} />
                <span>{id}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <footer>
        Inspired by <a href="https://github.com/jeremy-prt/bloub">bloub</a>, a recreation of the x.ai bot avatar. The
        beret is the Ask Gina logo. MIT.
      </footer>
    </div>
  )
}
