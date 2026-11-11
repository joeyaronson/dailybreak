import { useEffect, useMemo, useRef, useState } from 'react'
import { hashSeed } from '../lib/daily'
import { getPowerupChoices, POWERUPS } from '../lib/powerups'
import type { Powerup } from '../lib/powerups'
import { ModalOutline } from './ModalOutline'

const REEL_DURATIONS = [900, 1200, 1500]
const REVEAL_DELAY = 1050

export function PowerupSelection({ dateKey, roundIndex, balls, onReroll, onSelect }: {
  dateKey: string; roundIndex: number; balls: number; onReroll: () => void; onSelect: (powerup: Powerup) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const firstChoiceRef = useRef<HTMLButtonElement>(null)
  const [reroll, setReroll] = useState(0)
  const choices = useMemo(() => getPowerupChoices(dateKey, roundIndex, reroll), [dateKey, roundIndex, reroll])
  const [reels, setReels] = useState(() => REEL_DURATIONS.map(() => ({ tick: 0, landed: window.matchMedia('(prefers-reduced-motion: reduce)').matches })))
  const ready = reels.every((reel) => reel.landed)
  const visualSeed = hashSeed(`powerup-reel:${dateKey}:${roundIndex}:${reroll}`)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const started = performance.now()
    let frame = 0
    const finish = () => {
      cancelAnimationFrame(frame)
      setReels(REEL_DURATIONS.map(() => ({ tick: 20, landed: true })))
    }
    const animate = (time: number) => {
      const elapsed = Math.max(0, time - started - (reroll === 0 ? REVEAL_DELAY : 0))
      const next = REEL_DURATIONS.map((duration) => {
        const progress = Math.min(1, elapsed / duration)
        return { tick: Math.floor((1 - (1 - progress) ** 2) * 20), landed: progress === 1 }
      })
      setReels((previous) => previous.every((reel, index) => reel.tick === next[index].tick && reel.landed === next[index].landed) ? previous : next)
      if (!next.every((reel) => reel.landed)) frame = requestAnimationFrame(animate)
    }
    const handleMotionChange = () => { if (reducedMotion.matches) finish() }
    if (reducedMotion.matches) finish()
    else {
      setReels(REEL_DURATIONS.map(() => ({ tick: 0, landed: false })))
      frame = requestAnimationFrame(animate)
    }
    reducedMotion.addEventListener('change', handleMotionChange)
    return () => {
      cancelAnimationFrame(frame)
      reducedMotion.removeEventListener('change', handleMotionChange)
    }
  }, [dateKey, roundIndex, reroll])

  useEffect(() => {
    if (ready) firstChoiceRef.current?.focus({ preventScroll: true })
  }, [ready])

  const rerollShop = () => {
    if (!ready || balls < 1) return
    onReroll()
    setReels(REEL_DURATIONS.map(() => ({ tick: 0, landed: false })))
    setReroll((previous) => previous + 1)
    dialogRef.current?.focus({ preventScroll: true })
  }

  return (
    <section className="daily" aria-label="Choose a powerup">
      <div className="board instructions-screen">
        <dialog ref={dialogRef} tabIndex={-1} className="round-summary powerup-dialog" aria-labelledby="powerup-title"
          onCancel={(event) => { event.preventDefault(); window.location.hash = '' }}>
          <ModalOutline />
          <div className="powerup-scroll">
            <div className="summary-content">
              <h2 id="powerup-title">Level {roundIndex + 1}</h2>
              <p>Choose a powerup for this level</p>
              <div className="powerup-options" aria-busy={!ready}>
                {reels.map((reel, index) => {
                  const powerup = reel.landed ? choices[index] : POWERUPS[(visualSeed + index * 3 + reel.tick) % POWERUPS.length]
                  return (
                    <button ref={index === 0 ? firstChoiceRef : undefined}
                      className={`launch-button powerup-option ${reel.landed ? 'powerup-landed' : 'powerup-cycling'}`}
                      type="button" key={index} disabled={!ready} onClick={() => onSelect(choices[index].id)}>
                      <span key={reel.landed ? 'landed' : reel.tick} className="powerup-reel" aria-hidden={!ready}>
                        <span>{powerup.name}</span>
                        <small>{powerup.description}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="powerup-shop">
                <p role="status">{balls} unused {balls === 1 ? 'ball' : 'balls'}</p>
                <button className="launch-button" type="button" disabled={!ready || balls < 1} onClick={rerollShop}>
                  Reroll · 1 ball
                </button>
              </div>
              <span className="sr-only" role="status">{ready ? 'Powerups ready. Choose one.' : 'Choosing powerups.'}</span>
            </div>
          </div>
        </dialog>
      </div>
    </section>
  )
}
