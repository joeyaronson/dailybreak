import { createSeededRandom, GAME_VERSION, hashSeed } from './daily'

export const SHIELD_BOUNCES = 3
const POWERUP_SEED_VERSION = 2

export const POWERUPS = [
  { id: 'big', name: 'Big ball', description: 'Double size. Pierce one brick between bounces.' },
  { id: 'multi', name: 'Multiball', description: 'Launch three balls at once.' },
  { id: 'split', name: 'Split ball', description: 'Split on brick hits twice, for up to four balls per shot.' },
  { id: 'laser', name: 'Laser ball', description: 'Pierce bricks without bouncing.' },
  { id: 'shield', name: 'Bounce shield', description: `Bounce off the bottom ${SHIELD_BOUNCES} times per shot.` },
  { id: 'gravity', name: 'Reverse gravity', description: 'Curve upward with one top shield bounce per shot.' },
  { id: 'blast', name: 'Blast ball', description: 'Destroy nearby bricks on impact.' },
  { id: 'extra', name: 'Extra shots', description: 'Get three extra shots this level.' },
  { id: 'thin', name: 'Thin the herd', description: 'Start the level with 50% fewer bricks.' },
  { id: 'chain', name: 'Chain lightning', description: 'Each brick hit chains to one nearby brick.' },
  { id: 'blackhole', name: 'Black hole', description: 'Bricks pull the ball toward them from farther away.' },
  { id: 'ghost', name: 'Ghost ball', description: 'Pass through bricks going up. Hit them going down.' },
  { id: 'shuffle', name: 'Shuffle', description: 'Shuffle remaining bricks as often as you like between shots.' },
] as const

export type Powerup = typeof POWERUPS[number]['id']

export function getPowerupChoices(dateKey: string, roundIndex: number, reroll = 0) {
  const seed = `${GAME_VERSION}:arcade:powerups:v${POWERUP_SEED_VERSION}:${dateKey}:${roundIndex}`
  const random = createSeededRandom(hashSeed(reroll === 0 ? seed : `${seed}:reroll:${reroll}`))
  const pool = [...POWERUPS]
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const current = pool[index]
    pool[index] = pool[other]
    pool[other] = current
  }
  return pool.slice(0, 3)
}
