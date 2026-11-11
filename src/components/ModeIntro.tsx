import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type Mode = 'daily' | 'endless' | 'arcade'
const seenThisSession = new Set<Mode>()
const storageKey = (mode: Mode) => `dailybreak:instructions:v1:${mode}`

export function ModeIntro({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [seen, setSeen] = useState(() => {
    if (seenThisSession.has(mode)) return true
    try { return localStorage.getItem(storageKey(mode)) === 'seen' } catch { return false }
  })
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!seen) buttonRef.current?.focus({ preventScroll: true })
  }, [seen])

  const start = () => {
    seenThisSession.add(mode)
    try { localStorage.setItem(storageKey(mode), 'seen') } catch { /* Remember for this session if storage is unavailable. */ }
    setSeen(true)
  }

  if (seen) return children

  return (
    <section className="daily" aria-label={`${mode === 'daily' ? 'Daily' : mode === 'arcade' ? 'Arcade' : 'Endless'} mode instructions`}>
      <div className="board instructions-screen">
        <div className="round-summary-overlay">
          <div className="round-summary instructions-panel" role="dialog" aria-modal="true" aria-labelledby="instructions-title"
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                event.preventDefault()
                buttonRef.current?.focus()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                window.location.hash = ''
              }
            }}>
            <h2 id="instructions-title">How to play</h2>
            <ModeInstructions mode={mode} />
            <button ref={buttonRef} className="launch-button" type="button" onClick={start}>Play</button>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ModeInstructions({ mode }: { mode: Mode }) {
  return (
    <div className="instructions-copy">
      <p>Drag below the ball to move. Drag above to aim.</p>
      <p>Tap Launch to shoot.</p>
      {mode === 'daily' ? <>
        <p>3 rounds. 4 balls per round. One game each day.</p>
        <p>Clear bricks, build combos, and save balls to score more.</p>
      </> : mode === 'arcade' ? <>
        <p>20 bricks to start, then +2 per level. Clear each level in 4 shots.</p>
        <p>Choose a powerup for each level.</p>
        <p>Reroll for 1 unused ball from the previous level.</p>
      </> : <>
        <p>Start with 2 bricks. Each round adds 2.</p>
        <p>Clear every brick within 4 shots to continue.</p>
      </>}
    </div>
  )
}
