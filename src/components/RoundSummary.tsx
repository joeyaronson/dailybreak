import { useEffect, useRef, useState } from 'react'
import type { RoundScore } from '../lib/scoring'
import { BALLS_PER_ROUND } from '../lib/daily'
import { BallIndicator } from './BallIndicator'
import { ModalOutline } from './ModalOutline'

type RoundSummaryProps = {
  open: boolean
  ballsRemaining: number
  totalBalls?: number
  bricksRemaining: number
  brickColor: string
  bestCombo: number
  score: RoundScore
  hasNextRound: boolean
  onNextRound: () => void
  onClose: () => void
}

export function RoundSummary({ open, ballsRemaining, totalBalls = BALLS_PER_ROUND, bricksRemaining, brickColor, bestCombo, score, hasNextRound, onNextRound, onClose }: RoundSummaryProps) {
  const actionRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [displayedBricks, setDisplayedBricks] = useState(0)
  const [revealedBalls, setRevealedBalls] = useState(0)

  useEffect(() => {
    if (!open) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedBricks(bricksRemaining)
      setRevealedBalls(ballsRemaining)
      return
    }
    setDisplayedBricks(0)
    setRevealedBalls(0)
    const started = performance.now()
    let frame: number
    const animateStats = (time: number) => {
      // Start after the panel and content have drawn in.
      const elapsed = Math.max(0, time - started - 1050)
      const progress = Math.min(1, elapsed / 550)
      setDisplayedBricks(Math.round(bricksRemaining * (1 - (1 - progress) ** 3)))
      setRevealedBalls(Math.min(ballsRemaining, Math.floor(elapsed / 140)))
      if (progress < 1 || elapsed < ballsRemaining * 140) frame = requestAnimationFrame(animateStats)
    }
    frame = requestAnimationFrame(animateStats)
    return () => cancelAnimationFrame(frame)
  }, [open, ballsRemaining, bricksRemaining])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    actionRef.current?.focus({ preventScroll: true })
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return (
    <div className="round-summary-overlay">
      <div ref={panelRef} className="round-summary" role="dialog" aria-modal="true" aria-labelledby="round-summary-title"
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault()
            actionRef.current?.focus()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}>
        <ModalOutline />
        <div className="summary-content">
          <h2 id="round-summary-title">{hasNextRound ? 'Round complete' : 'Game complete'}</h2>
          <p className="round-score" aria-label={`Round score: ${score.total} out of 1000`}>
            <span className="score-emoji" aria-hidden="true">{score.emoji}</span>
            <span>{score.total}<span className="score-maximum"> / 1000</span></span>
          </p>
          <dl className="round-stats">
            <div>
              <dt>Balls remaining</dt>
              <dd className="summary-balls">
                <span className="sr-only">{ballsRemaining} of {totalBalls}</span>
                {Array.from({ length: totalBalls }, (_, index) => (
                  <BallIndicator key={index} available={index < revealedBalls} animateIn />
                ))}
              </dd>
            </div>
            <div>
              <dt>Bricks remaining</dt>
              <dd className="summary-bricks" aria-label={bricksRemaining === 0 ? 'All clear' : `${bricksRemaining}`}>
                <svg viewBox="0 0 34 26" style={{ color: brickColor }} aria-hidden="true">
                  <path d="M 3 9 L 12 3 H 31 V 17 L 22 23 H 3 Z M 3 9 H 22 V 23 M 22 9 L 31 3" />
                </svg>
                <span aria-hidden="true" className={bricksRemaining === 0 ? 'all-clear' : undefined}>
                  {bricksRemaining === 0 ? 'All clear' : displayedBricks}
                </span>
              </dd>
            </div>
            <div><dt>Best combo</dt><dd>{bestCombo}x</dd></div>
          </dl>
          <button ref={actionRef} className="launch-button" type="button" onClick={onNextRound}>
            {hasNextRound ? 'Next round' : 'View results'}
          </button>
        </div>
      </div>
    </div>
  )
}
