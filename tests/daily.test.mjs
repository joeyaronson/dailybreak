import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { createSeededRandom, generateDailyGame, getLocalDateKey, hashSeed, millisecondsUntilMidnight, shuffle } from '../src/lib/daily.ts'

test('date keys use local calendar fields and pad month/day', () => {
  assert.equal(getLocalDateKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02')
  assert.equal(getLocalDateKey(new Date(2026, 0, 3, 0, 0)), '2026-01-03')
})

test('seed and puzzle sequence stay stable across reloads', () => {
  assert.equal(hashSeed('hello'), 1335831723)
  const first = createSeededRandom(42)
  assert.deepEqual(Array.from({ length: 3 }, first), [
    0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
  ])
  assert.deepEqual(generateDailyGame('2026-11-07'), generateDailyGame('2026-11-07'))
  assert.notEqual(generateDailyGame('2026-11-07').seed, generateDailyGame('2026-11-08').seed)
})

test('shuffling preserves input and includes each tile exactly once', () => {
  const items = Object.freeze([1, 2, 3, 4, 5])
  const shuffled = shuffle(items, createSeededRandom(42))
  assert.deepEqual([...shuffled].sort(), [...items])
  assert.notStrictEqual(shuffled, items)
  assert.deepEqual(shuffle([], createSeededRandom(0)), [])
})

test('random output stays within [0, 1)', () => {
  const random = createSeededRandom(0)
  for (let i = 0; i < 10000; i++) {
    const value = random()
    assert.ok(value >= 0 && value < 1)
  }
})

test('next midnight rolls over month/year boundaries', () => {
  assert.equal(millisecondsUntilMidnight(new Date(2026, 11, 31, 23, 59, 59)), 1000)
})

test('local dates differ from UTC and DST midnight durations are respected', () => {
  const moduleUrl = new URL('../src/lib/daily.ts', import.meta.url).href
  const evaluate = (timezone, code) => JSON.parse(execFileSync(process.execPath,
    ['--input-type=module', '-e', `import { getLocalDateKey, millisecondsUntilMidnight } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(${code}));`],
    { env: { ...process.env, TZ: timezone }, encoding: 'utf8' }))
  assert.equal(evaluate('America/Los_Angeles', "getLocalDateKey(new Date('2026-11-08T01:00:00Z'))"), '2026-11-07')
  assert.equal(evaluate('Asia/Tokyo', "getLocalDateKey(new Date('2026-11-07T20:00:00Z'))"), '2026-11-08')
  assert.equal(evaluate('America/Los_Angeles', 'millisecondsUntilMidnight(new Date(2026, 2, 8))'), 23 * 60 * 60 * 1000)
  assert.equal(evaluate('America/Los_Angeles', 'millisecondsUntilMidnight(new Date(2026, 10, 1))'), 25 * 60 * 60 * 1000)
})
