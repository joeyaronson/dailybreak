import { BALLS_PER_ROUND, GAME_VERSION, ROUND_BRICK_COUNTS } from './daily'
import type { generateDailyGame } from './daily'
import { calculateRoundScore, ROUND_SCORE_TARGETS } from './scoring'
import type { RoundResult } from './scoring'

type Position = { x: number; y: number }
export type RoundProgress = {
  phase: 'ready' | 'flying' | 'returning' | 'complete'
  ballsRemaining: number
  destroyedBricks: number[]
  bestCombo: number
  shotHits: number
  ball: Position
  direction: Position
  aim: Position
}

export type DailyProgress = {
  version: 1
  dateKey: string
  roundIndex: number
  results: RoundResult[]
  currentRound: RoundProgress | null
  finished: boolean
}

export const progressKey = (dateKey: string) => `${GAME_VERSION}:progress:${dateKey}`

const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max

function position(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false
  const point = value as Position
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 20 && Math.abs(point.y) <= 20
}

function direction(value: unknown): value is Position {
  return position(value) && Math.abs(Math.hypot(value.x, value.y) - 1) < 0.001
}

/** Browser-local saves are scoped to the date and game version. */
export function loadDailyProgress(dateKey: string, rounds: ReturnType<typeof generateDailyGame>['rounds']): DailyProgress {
  const raw = localStorage.getItem(progressKey(dateKey))
  const fresh: DailyProgress = { version: 1, dateKey, roundIndex: 0, results: [], currentRound: null, finished: false }
  if (!raw) return fresh
  // Invalid saves fail visibly instead of silently granting another attempt.
  const saved = JSON.parse(raw) as DailyProgress
  if (!saved || saved.version !== 1 || saved.dateKey !== dateKey
    || !integer(saved.roundIndex, rounds.length - 1) || typeof saved.finished !== 'boolean'
    || !Array.isArray(saved.results) || saved.results.length < saved.roundIndex
    || saved.results.length > saved.roundIndex + 1) throw new Error('Invalid daily save')

  saved.results = saved.results.map((result, index) => {
    const totalBricks = ROUND_BRICK_COUNTS[index]
    if (!result || !integer(result.ballsRemaining, BALLS_PER_ROUND)
      || !integer(result.bricksRemaining, totalBricks) || !integer(result.bestCombo, totalBricks)
      || result.bestCombo > totalBricks - result.bricksRemaining) throw new Error('Invalid round result')
    return { ...result, ...calculateRoundScore({ ...result, totalBricks, targets: ROUND_SCORE_TARGETS[index] }) }
  })
  if (saved.finished && saved.results.length !== rounds.length) throw new Error('Incomplete daily results')

  const current = saved.currentRound
  if (current !== null) {
    const cells = new Set(rounds[saved.roundIndex].bricks.filter((brick) => brick.occupied).map((brick) => brick.id))
    if (!current || !['ready', 'flying', 'returning', 'complete'].includes(current.phase)
      || !integer(current.ballsRemaining, BALLS_PER_ROUND)
      || !integer(current.bestCombo, cells.size) || !integer(current.shotHits, current.bestCombo)
      || !Array.isArray(current.destroyedBricks) || new Set(current.destroyedBricks).size !== current.destroyedBricks.length
      || current.destroyedBricks.some((id) => !cells.has(id)) || current.bestCombo > current.destroyedBricks.length
      || !position(current.ball) || !direction(current.direction) || !direction(current.aim) || current.aim.y <= 0
      || (current.phase === 'flying' && current.ballsRemaining === BALLS_PER_ROUND)) throw new Error('Invalid round progress')
  }
  return saved
}

export function saveDailyProgress(progress: DailyProgress) {
  localStorage.setItem(progressKey(progress.dateKey), JSON.stringify(progress))
}
