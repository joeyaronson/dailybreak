import { useCallback, useMemo, useState } from 'react'
import { createSeededRandom, GAME_VERSION, generateBrickLayout, GRID_SIZE, hashSeed } from '../lib/daily'
import type { RoundProgress } from '../lib/progress'
import type { RoundResult } from '../lib/scoring'
import { BrickGrid } from './BrickGrid'
import { GameResults } from './GameResults'
import { PowerupSelection } from './PowerupSelection'
import { POWERUPS } from '../lib/powerups'
import type { Powerup } from '../lib/powerups'

const COLORS = ['#ff5cde', '#2266ff', '#ffe65c', '#ff5252', '#ff943d', '#b77dff', '#65ffc5']

type Mode = 'endless' | 'arcade'

function EndlessRun({ seed, dateKey, mode, onRestart }: { seed: number; dateKey: string; mode: Mode; onRestart: () => void }) {
  const [roundIndex, setRoundIndex] = useState(0)
  const [results, setResults] = useState<RoundResult[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [powerups, setPowerups] = useState<Powerup[]>([])
  const [failed, setFailed] = useState(false)
  const [finished, setFinished] = useState(false)
  const [powerup, setPowerup] = useState<Powerup | null>(null)
  const [shopBalls, setShopBalls] = useState(0)
  const round = useMemo(() => {
    const roundSeed = hashSeed(`endless:${seed}:${roundIndex}`)
    const baseCount = Math.min((mode === 'arcade' ? 20 : 2) + roundIndex * 2, GRID_SIZE * GRID_SIZE)
    const count = powerup === 'thin' ? baseCount - Math.round(baseCount * 0.5) : baseCount
    return {
      bricks: generateBrickLayout(roundSeed, count),
      color: COLORS[Math.floor(createSeededRandom(roundSeed)() * COLORS.length)],
      targets: { combo: Math.min(count, 6), spareBalls: 2 },
    }
  }, [seed, roundIndex, mode, powerup])
  const onProgress = useCallback((snapshot: RoundProgress) => {
    if (snapshot.phase === 'complete') {
      setFailed(snapshot.destroyedBricks.length < round.bricks.filter((brick) => brick.occupied).length)
    }
  }, [round])

  if (finished) return <GameResults mode={mode} dateKey={dateKey} results={results} colors={colors} powerups={powerups} onPlayAgain={onRestart} />
  if (mode === 'arcade' && !powerup) return <PowerupSelection key={roundIndex} dateKey={dateKey} roundIndex={roundIndex}
    balls={shopBalls} onReroll={() => setShopBalls((remaining) => Math.max(0, remaining - 1))} onSelect={setPowerup} />

  return (
    <section className="daily" aria-label={mode === 'arcade' ? 'Arcade mode' : 'Endless mode'}>
      <BrickGrid
        key={roundIndex}
        roundLabel={mode === 'arcade' ? `Level ${roundIndex + 1} · ${POWERUPS.find((item) => item.id === powerup)?.name}` : `Round ${roundIndex + 1}`}
        powerup={powerup ?? undefined}
        bricks={round.bricks}
        brickColor={round.color}
        scoreTargets={round.targets}
        initialProgress={null}
        onProgress={onProgress}
        hasNextRound={!failed}
        onNextRound={(result) => {
          setResults((previous) => [...previous, result])
          setColors((previous) => [...previous, round.color])
          if (powerup) setPowerups((previous) => [...previous, powerup])
          if (result.bricksRemaining > 0) setFinished(true)
          else {
            setFailed(false)
            setShopBalls(result.ballsRemaining)
            setPowerup(null)
            setRoundIndex((index) => index + 1)
          }
        }}
      />
    </section>
  )
}

export function EndlessMode({ dateKey, mode = 'endless' }: { dateKey: string; mode?: Mode }) {
  const [attempt, setAttempt] = useState(0)
  const seed = hashSeed(`${GAME_VERSION}:endless:${dateKey}`)
  return <EndlessRun key={`${mode}:${dateKey}:${attempt}`} seed={seed} dateKey={dateKey} mode={mode} onRestart={() => setAttempt((value) => value + 1)} />
}
