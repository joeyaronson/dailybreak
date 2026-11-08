// Keep stable once puzzles are live. Bump to change the puzzle sequence.
export const GAME_VERSION = 'dailybreak-v1'

/** Calendar date in the player's local timezone, intentionally not UTC. */
export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** FNV-1a: a stable unsigned 32-bit seed from a string. */
export function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

/** Mulberry32. Create a fresh generator for each puzzle; returns values in [0, 1). */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle without mutating the input. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export const GRID_SIZE = 10
export const BALLS_PER_ROUND = 4
export const ROUND_BRICK_COUNTS = [6, 10, 14] as const

export function generateBrickLayout(seed: number, brickCount: number) {
  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index)
  const random = createSeededRandom(seed)
  const occupied = new Set(shuffle(cells, random).slice(0, brickCount))
  return cells.map((id) => ({
    id,
    row: Math.floor(id / GRID_SIZE),
    column: id % GRID_SIZE,
    occupied: occupied.has(id),
  }))
}

/** Each round has an exact brick count and its own deterministic layout. */
export function generateDailyGame(dateKey: string) {
  const seed = hashSeed(`${GAME_VERSION}:${dateKey}`)
  const rounds = ROUND_BRICK_COUNTS.map((brickCount, index) => {
    const roundSeed = hashSeed(`${seed}:round:${index + 1}`)
    const bricks = generateBrickLayout(roundSeed, brickCount)
    return { number: index + 1, seed: roundSeed, bricks }
  })
  return { dateKey, seed, rounds }
}

/** Local midnight construction respects 23- and 25-hour daylight saving days. */
export function millisecondsUntilMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}
