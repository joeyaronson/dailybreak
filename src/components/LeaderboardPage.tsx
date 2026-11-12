import { useEffect, useRef, useState } from 'react'
import { GameLeaderboard } from './GameLeaderboard'
import { LEADERBOARD_MODE_NAMES } from '../lib/leaderboardProtocol'
import type { LeaderboardMode } from '../lib/leaderboardProtocol'

const MODES = ['daily', 'endless', 'arcade'] as const

export function LeaderboardPage({ dateKey }: { dateKey: string }) {
  const [mode, setMode] = useState<LeaderboardMode>('daily')
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  return (
    <section className="leaderboard-page" aria-labelledby="leaderboards-title">
      <h1 id="leaderboards-title" ref={headingRef} tabIndex={-1}>Leaderboards</h1>
      <div className="leaderboard-tabs" role="tablist" aria-label="Game mode">
        {MODES.map((item, index) => <button
          ref={(element) => { tabsRef.current[index] = element }}
          className="launch-button leaderboard-tab" key={item} type="button" role="tab"
          id={`scores-tab-${item}`} aria-controls={`scores-panel-${item}`} aria-selected={item === mode}
          tabIndex={item === mode ? 0 : -1} onClick={() => setMode(item)}
          onKeyDown={(event) => {
            let next: number
            if (event.key === 'ArrowRight') next = (index + 1) % MODES.length
            else if (event.key === 'ArrowLeft') next = (index + MODES.length - 1) % MODES.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = MODES.length - 1
            else return
            event.preventDefault()
            setMode(MODES[next])
            tabsRef.current[next]?.focus()
          }}>
          {LEADERBOARD_MODE_NAMES[item]}
        </button>)}
      </div>
      {MODES.map((item) => <div key={item} role="tabpanel" id={`scores-panel-${item}`} aria-labelledby={`scores-tab-${item}`} hidden={item !== mode}>
        {item === mode && <GameLeaderboard key={`${item}:${dateKey}`} mode={item} dateKey={dateKey} />}
      </div>)}
    </section>
  )
}
