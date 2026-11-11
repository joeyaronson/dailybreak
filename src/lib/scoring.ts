export const ROUND_SCORE_TARGETS = [
  { combo: 4, spareBalls: 2 },
  { combo: 5, spareBalls: 1 },
  { combo: 6, spareBalls: 1 },
] as const

export type ScoreTargets = { readonly combo: number; readonly spareBalls: number }

type RoundStats = {
  totalBricks: number
  bricksRemaining: number
  ballsRemaining: number
  bestCombo: number
  targets: ScoreTargets
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

/** Keep scoring independent of animation, frame rate, and the daily seed. */
export function calculateRoundScore({ totalBricks, bricksRemaining, ballsRemaining, bestCombo, targets }: RoundStats) {
  const clearance = 700 * clamp((totalBricks - bricksRemaining) / totalBricks)
  // One brick alone earns no combo bonus; meeting the round's target earns 200.
  const combo = 200 * clamp((bestCombo - 1) / (targets.combo - 1))
  const spareBalls = 100 * clamp(ballsRemaining / targets.spareBalls)
  // Round only the final sum, so every client gets the same integer result.
  const total = Math.round(clearance + combo + spareBalls)
  const emoji = total === 1000 ? '💎'
    : total >= 900 ? '🟪'
    : total >= 750 ? '🟦'
    : total >= 500 ? '🟩'
    : total >= 250 ? '🟨' : '⬛'

  return { total, emoji }
}

export type RoundScore = ReturnType<typeof calculateRoundScore>

export type RoundResult = RoundScore & {
  ballsRemaining: number
  bricksRemaining: number
  bestCombo: number
}

export function formatShareResults(dateKey: string, results: readonly RoundResult[]) {
  const total = results.reduce((sum, round) => sum + round.total, 0)
  return [
    `Dailybreak · ${dateKey}`,
    results.map((round) => round.emoji).join(''),
    `${total}/${results.length * 1000}`,
  ].join('\n')
}

export function formatEndlessShareResults(dateKey: string, results: readonly RoundResult[], mode: 'endless' | 'arcade' = 'endless') {
  const total = results.reduce((sum, round) => sum + round.total, 0)
  const cleared = results.filter((round) => round.bricksRemaining === 0).length
  return [
    `Dailybreak · ${mode === 'arcade' ? 'Arcade' : 'Endless'} · ${dateKey}`,
    results.map((round) => round.emoji).join(''),
    `${total} points · ${cleared} rounds cleared`,
  ].join('\n')
}
