import { BALLS_PER_ROUND, GAME_VERSION, GRID_SIZE, ROUND_BRICK_COUNTS } from '../src/lib/daily'
import { calculateRoundScore, ROUND_SCORE_TARGETS } from '../src/lib/scoring'
import { POWERUPS } from '../src/lib/powerups'
import type { LeaderboardMode } from '../src/lib/leaderboardProtocol'
import { validateNickname } from '../src/lib/nickname'

interface Env {
  DB: D1Database
  READ_LIMITER: RateLimit
  SUBMIT_LIMITER: RateLimit
  ALLOWED_ORIGINS: string
}

type ScoreRow = { nickname: string; score: number; rank: number; isYou: number }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY = 86_400_000

class RequestError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function validateDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RequestError('Invalid game date.')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new RequestError('Invalid game date.')
  return value
}

function validateBrowserId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new RequestError('Invalid browser ID.')
  return value.toLowerCase()
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Invalid result.')
  return value as Record<string, unknown>
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new RequestError('Invalid round statistics.')
  return value
}

function calculateScore(value: unknown, mode: LeaderboardMode, powerups: unknown): number {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) throw new RequestError('Invalid run length.')
  if (mode === 'daily' && value.length !== ROUND_BRICK_COUNTS.length) throw new RequestError('Finish all three rounds before submitting.')
  if (mode === 'arcade' && (!Array.isArray(powerups) || powerups.length !== value.length)) throw new RequestError('Missing level powerups.')
  return value.reduce((total, item, index) => {
    const round = record(item)
    const powerup = mode === 'arcade' && Array.isArray(powerups) ? powerups[index] : null
    if (mode === 'arcade' && !POWERUPS.some((item) => item.id === powerup)) throw new RequestError('Invalid powerup.')
    const baseCount = Math.min((mode === 'arcade' ? 20 : 2) + index * 2, GRID_SIZE * GRID_SIZE)
    const totalBricks = mode === 'daily' ? ROUND_BRICK_COUNTS[index] : powerup === 'thin' ? baseCount - Math.round(baseCount * 0.5) : baseCount
    const maxBalls = BALLS_PER_ROUND + (powerup === 'extra' ? 3 : 0)
    const bricksRemaining = integer(round.bricksRemaining, 0, totalBricks)
    const destroyed = totalBricks - bricksRemaining
    const ballsRemaining = integer(round.ballsRemaining, 0, maxBalls - 1)
    const bestCombo = integer(round.bestCombo, destroyed > 0 ? 1 : 0, destroyed)
    if ((bricksRemaining > 0 && ballsRemaining !== 0)
      || (destroyed === 0 && bestCombo !== 0)
      || destroyed > bestCombo * (maxBalls - ballsRemaining)) throw new RequestError('Invalid completed round.')
    if (mode !== 'daily' && (index === value.length - 1 ? bricksRemaining === 0 : bricksRemaining > 0)) throw new RequestError('Submit a finished run.')
    // Ignore client totals and recompute from bounded round statistics.
    const targets = mode === 'daily' ? ROUND_SCORE_TARGETS[index] : { combo: Math.min(totalBricks, 6), spareBalls: 2 }
    return total + calculateRoundScore({ totalBricks, bricksRemaining, ballsRemaining, bestCombo, targets }).total
  }, 0)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new RequestError('Send JSON.', 415)
  const reader = request.body?.getReader()
  if (!reader) throw new RequestError('Missing result.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > 131072) { await reader.cancel(); throw new RequestError('Result is too large.', 413) }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return record(JSON.parse(new TextDecoder().decode(bytes))) }
  catch { throw new RequestError('Invalid JSON result.') }
}

async function getBoard(env: Env, mode: LeaderboardMode, dateKey: string, browserId: string | null) {
  const queries = [env.DB.prepare(`
    SELECT nickname, score, RANK() OVER (ORDER BY score DESC) AS rank,
      CASE WHEN browser_id = ? THEN 1 ELSE 0 END AS isYou
    FROM (
      SELECT nickname, score, submitted_at, browser_id FROM scores
      WHERE date_key = ? AND game_version = ? AND mode = ?
      ORDER BY score DESC, submitted_at ASC, browser_id ASC LIMIT 20
    )
    ORDER BY score DESC, submitted_at ASC, browser_id ASC LIMIT 20
  `).bind(browserId, dateKey, GAME_VERSION, mode)]
  if (browserId) queries.push(env.DB.prepare(`
    SELECT nickname, score, 1 AS isYou,
      (SELECT COUNT(*) + 1 FROM scores WHERE date_key = ? AND game_version = ? AND mode = ? AND score > own.score) AS rank
    FROM scores AS own WHERE date_key = ? AND game_version = ? AND mode = ? AND browser_id = ?
  `).bind(dateKey, GAME_VERSION, mode, dateKey, GAME_VERSION, mode, browserId))
  const result = await env.DB.batch<ScoreRow>(queries)
  const entry = (row: ScoreRow) => {
    const checked = validateNickname(row.nickname)
    return { nickname: checked.error ? 'Player' : checked.nickname, score: row.score, rank: row.rank, isYou: row.isYou === 1 }
  }
  return { mode, dateKey, entries: result[0].results.map(entry), you: result[1]?.results[0] ? entry(result[1].results[0]) : null }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim())
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' })
    if (origin && !allowed.includes(origin)) return new Response(JSON.stringify({ error: 'Origin is not allowed.' }), { status: 403, headers })
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    const url = new URL(request.url)
    const pathMode = url.pathname.slice(1)
    if (pathMode !== 'daily' && pathMode !== 'endless' && pathMode !== 'arcade') return json({ error: 'Not found.' }, 404)
    const mode: LeaderboardMode = pathMode
    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    try {
      const limiter = request.method === 'POST' ? env.SUBMIT_LIMITER : env.READ_LIMITER
      const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })
      if (!success) { headers.set('Retry-After', '60'); return json({ error: 'Too many requests. Try again in a minute.' }, 429) }
      if (request.method === 'GET') {
        const dateKey = validateDate(url.searchParams.get('date'))
        const browserId = url.searchParams.has('browserId') ? validateBrowserId(url.searchParams.get('browserId')) : null
        return json(await getBoard(env, mode, dateKey, browserId))
      }
      const body = await readBody(request)
      const dateKey = validateDate(body.dateKey)
      const today = Date.parse(new Date().toISOString().slice(0, 10))
      // Local calendar dates can be one day ahead of or behind UTC.
      if (Math.abs(Date.parse(dateKey) - today) > DAY) throw new RequestError('Submissions are closed for this date.')
      if (body.gameVersion !== GAME_VERSION) throw new RequestError('Reload the game before submitting this version.')
      const browserId = validateBrowserId(body.browserId)
      const { nickname, error: nicknameError } = validateNickname(body.nickname)
      if (nicknameError) throw new RequestError(nicknameError)
      const score = calculateScore(body.results, mode, body.powerups)
      const conflict = mode === 'daily' ? 'DO NOTHING' : `DO UPDATE SET nickname = excluded.nickname, score = excluded.score,
        submitted_at = excluded.submitted_at WHERE excluded.score > scores.score`
      const inserted = await env.DB.prepare(`
        INSERT INTO scores (date_key, game_version, mode, browser_id, nickname, score) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (date_key, game_version, mode, browser_id) ${conflict}
      `).bind(dateKey, GAME_VERSION, mode, browserId, nickname, score).run()
      // Retries return the original entry, including after a lost response.
      return json({ ...await getBoard(env, mode, dateKey, browserId), alreadySubmitted: inserted.meta.changes === 0 }, inserted.meta.changes === 0 ? 200 : 201)
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status)
      console.error('Leaderboard request failed:', error instanceof Error ? error.message : 'Unknown error')
      return json({ error: 'Leaderboard unavailable. Try again shortly.' }, 503)
    }
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10)
    await env.DB.prepare('DELETE FROM scores WHERE date_key < ?').bind(cutoff).run()
  },
} satisfies ExportedHandler<Env>
