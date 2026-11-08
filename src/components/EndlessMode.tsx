import { useCallback, useMemo, useState } from 'react'
import { createSeededRandom, GAME_VERSION, generateBrickLayout, GRID_SIZE, hashSeed } from '../lib/daily'
import type { RoundProgress } from '../lib/progress'
import type { RoundResult } from '../lib/scoring'
import { BrickGrid } from './BrickGrid'
import { GameResults } from './GameResults'

const COLORS = ['#ff5cde', '#2266ff', '#ffe65c', '#ff5252', '#ff943d', '#b77dff', '#65ffc5']

function EndlessRun({ seed, dateKey, onRestart }: { seed: number; dateKey: string; onRestart: () => void }) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [results, setResults] = useState<RoundResult[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [finished, setFinished] = useState(false)
  const round = useMemo(() => {
    const roundSeed = hashSeed(`endless:${seed}:${roundIndex}`)
    const count = Math.min(2 + roundIndex * 2, GRID_SIZE * GRID_SIZE)
    return {
      bricks: generateBrickLayout(roundSeed, count),
      color: COLORS[Math.floor(createSeededRandom(roundSeed)() * COLORS.length)],
      targets: { combo: Math.min(count, 6), spareBalls: 2 },
    }
  }, [seed, roundIndex])
  const onProgress = useCallback((snapshot: RoundProgress) => {
    if (snapshot.phase === 'complete') {
      setFailed(snapshot.destroyedBricks.length < round.bricks.filter((brick) => brick.occupied).length)
    }
  }, [round])

  if (finished) return <GameResults mode="endless" dateKey={dateKey} results={results} colors={colors} onPlayAgain={onRestart} />

  return (
    <section className="daily" aria-label="Endless mode">
      <BrickGrid
        key={roundIndex}
        roundLabel={`Round ${roundIndex + 1}`}
        bricks={round.bricks}
        brickColor={round.color}
        scoreTargets={round.targets}
        initialProgress={null}
        onProgress={onProgress}
        hasNextRound={!failed}
        onNextRound={(result) => {
          setResults((previous) => [...previous, result])
          setColors((previous) => [...previous, round.color])
          if (result.bricksRemaining > 0) setFinished(true)
          else {
            setFailed(false)
            setRoundIndex((index) => index + 1)
          }
        }}
      />
    </section>
  )
}

export function EndlessMode({ dateKey }: { dateKey: string }) {
  const [attempt, setAttempt] = useState(0)
  const seed = hashSeed(`${GAME_VERSION}:endless:${dateKey}`)
  return <EndlessRun key={`${dateKey}:${attempt}`} seed={seed} dateKey={dateKey} onRestart={() => setAttempt((value) => value + 1)} />
}
