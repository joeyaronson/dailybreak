import { useCallback, useEffect, useRef, useState } from 'react'
import { useDailyGame } from './hooks/useDailyGame'
import { BrickGrid } from './components/BrickGrid'
import type { generateDailyGame } from './lib/daily'
import { calculateRoundScore, ROUND_SCORE_TARGETS } from './lib/scoring'
import type { RoundResult } from './lib/scoring'
import { loadDailyProgress, saveDailyProgress } from './lib/progress'
import type { RoundProgress } from './lib/progress'
import { GameResults } from './components/GameResults'
import { HomeScreen } from './components/HomeScreen'
import { EndlessMode } from './components/EndlessMode'
import { BallIndicator } from './components/BallIndicator'
import { ModeIntro } from './components/ModeIntro'
import type { Mode } from './components/ModeIntro'
import { HelpDialog } from './components/HelpDialog'
import { GamePauseContext } from './lib/gamePause'
import './App.css'

const ROUND_COLORS = ['#ff5cde', '#2266ff', '#ffe65c']
type DailyRoundsProps = { rounds: ReturnType<typeof generateDailyGame>['rounds']; dateKey: string }

function DailySession({ rounds, dateKey }: DailyRoundsProps) {
  const [initial] = useState(() => {
    try { return loadDailyProgress(dateKey, rounds) } catch { return null }
  })
  const progressRef = useRef(initial)
  const [roundIndex, setRoundIndex] = useState(initial?.roundIndex ?? 0)
  const [roundStart, setRoundStart] = useState(initial?.currentRound ?? null)
  const [results, setResults] = useState<RoundResult[]>(initial?.results ?? [])
  const [finished, setFinished] = useState(initial?.finished ?? false)
  const [saveError, setSaveError] = useState(false)
  const round = rounds[roundIndex]

  const handleProgress = useCallback((snapshot: RoundProgress) => {
    const current = progressRef.current
    // A departing scene must never overwrite the following round's save.
    if (!current || current.roundIndex !== roundIndex) return
    const nextResults = [...current.results]
    if (snapshot.phase === 'complete') {
      const stats = {
        ballsRemaining: snapshot.ballsRemaining,
        bricksRemaining: rounds[roundIndex].bricks.filter((brick) => brick.occupied).length - snapshot.destroyedBricks.length,
        bestCombo: snapshot.bestCombo,
      }
      nextResults[roundIndex] = {
        ...stats,
        ...calculateRoundScore({ ...stats, totalBricks: rounds[roundIndex].bricks.filter((brick) => brick.occupied).length, targets: ROUND_SCORE_TARGETS[roundIndex] }),
      }
    }
    const next = {
      ...current, currentRound: snapshot, results: nextResults,
      finished: current.finished || nextResults.length === rounds.length,
    }
    progressRef.current = next
    try { saveDailyProgress(next) } catch { setSaveError(true) }
  }, [roundIndex, rounds])

  const advanceRound = (result: RoundResult) => {
    const current = progressRef.current
    if (!current) return
    const nextResults = [...current.results]
    nextResults[roundIndex] = result
    const isFinished = roundIndex === rounds.length - 1
    const next = {
      ...current, results: nextResults, finished: isFinished,
      roundIndex: isFinished ? roundIndex : roundIndex + 1,
      currentRound: isFinished ? current.currentRound : null,
    }
    try { saveDailyProgress(next) } catch { setSaveError(true); return }
    progressRef.current = next
    setResults(nextResults)
    setFinished(isFinished)
    setRoundStart(next.currentRound)
    setRoundIndex(next.roundIndex)
  }

  if (!initial || saveError) {
    return <p className="session-message" role="alert">Unable to save or restore today’s game. Check that site storage is enabled.</p>
  }
  if (finished) return <GameResults dateKey={dateKey} results={results} colors={ROUND_COLORS} />

  return (
    <section className="daily" aria-label="Bricks">
      <BrickGrid
        key={round.number}
        roundLabel={`Round ${round.number} / ${rounds.length}`}
        bricks={round.bricks}
        brickColor={ROUND_COLORS[roundIndex]}
        scoreTargets={ROUND_SCORE_TARGETS[roundIndex]}
        initialProgress={roundStart}
        onProgress={handleProgress}
        hasNextRound={roundIndex < rounds.length - 1}
        onNextRound={advanceRound}
      />
    </section>
  )
}

const currentMode = (): Mode | 'home' => window.location.hash === '#daily' ? 'daily'
  : window.location.hash === '#endless' ? 'endless'
  : window.location.hash === '#arcade' ? 'arcade' : 'home'

function App() {
  const { dateKey, rounds } = useDailyGame()
  const [mode, setMode] = useState(currentMode)
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    const navigate = () => { setMode(currentMode()); setHelpOpen(false) }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  return (
    <main>
      <header>
        <a className="wordmark" href="#" aria-label="Dailybreak home">
          dailybreak<BallIndicator available />
        </a>
        <div className="header-tools">
          <time dateTime={dateKey}>{dateKey}</time>
          {mode !== 'home' && <nav className="header-actions" aria-label="Game navigation">
            <button className="home-link help-button" type="button" onClick={() => setHelpOpen(true)}>Help</button>
            <a className="home-link" href="#">Home</a>
          </nav>}
        </div>
      </header>
      <GamePauseContext value={helpOpen}>
      {mode === 'home' && <HomeScreen />}
      {mode === 'daily' && <ModeIntro key="daily" mode="daily"><DailySession key={dateKey} rounds={rounds} dateKey={dateKey} /></ModeIntro>}
      {mode === 'endless' && <ModeIntro key="endless" mode="endless"><EndlessMode dateKey={dateKey} /></ModeIntro>}
      {mode === 'arcade' && <ModeIntro key="arcade" mode="arcade"><EndlessMode mode="arcade" dateKey={dateKey} /></ModeIntro>}
      </GamePauseContext>
      {mode !== 'home' && <HelpDialog key={mode} mode={mode} open={helpOpen} onDismiss={() => setHelpOpen(false)} />}
    </main>
  )
}

export default App
