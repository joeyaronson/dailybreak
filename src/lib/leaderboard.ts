import { GAME_VERSION } from './daily'
import type { LeaderboardMode } from './leaderboardProtocol'
import { validateNickname } from './nickname'

export type LeaderboardEntry = { nickname: string; score: number; rank: number; isYou: boolean }
export type Leaderboard = { mode: LeaderboardMode; dateKey: string; entries: LeaderboardEntry[]; you: LeaderboardEntry | null }
const API_URL = (import.meta.env.VITE_LEADERBOARD_URL ?? '').trim().replace(/\/+$/, '')
// Keep leaderboard UI hidden until it is ready to return.
const SHOW_LEADERBOARDS = false
export const leaderboardEnabled = SHOW_LEADERBOARDS && API_URL !== ''
const BROWSER_KEY = 'dailybreak:leaderboard:browser:v1'
const NAME_KEY = 'dailybreak:leaderboard:nickname:v1'

export function getLeaderboardBrowserId(): string {
  try {
    const existing = localStorage.getItem(BROWSER_KEY)
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing
    // getRandomValues also works on local-network HTTP phone previews.
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    localStorage.setItem(BROWSER_KEY, id)
    return id
  } catch { throw new Error('Enable site storage to submit a score.') }
}

export function getLeaderboardNickname(): string {
  try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' }
}

async function requestBoard(url: string, init: RequestInit): Promise<Leaderboard> {
  try {
    const timeout = AbortSignal.timeout(10_000)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    const response = await fetch(url, { ...init, signal, credentials: 'omit' })
    const data = await response.json()
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Leaderboard unavailable. Try again.')
    if (!Array.isArray(data.entries) || typeof data.dateKey !== 'string') throw new Error('Leaderboard unavailable. Try again.')
    return data as Leaderboard
  } catch (error) {
    if (error instanceof Error && !['TypeError', 'TimeoutError', 'SyntaxError'].includes(error.name)) throw error
    throw new Error('Could not reach the leaderboard. Try again.')
  }
}

export function loadLeaderboard(mode: LeaderboardMode, dateKey: string, browserId: string | null, signal: AbortSignal) {
  const params = new URLSearchParams({ date: dateKey })
  if (browserId) params.set('browserId', browserId)
  return requestBoard(`${API_URL}/${mode}?${params}`, { signal })
}

export async function submitScore(mode: LeaderboardMode, dateKey: string, browserId: string, nickname: string, score: number, roundCount: number) {
  const checked = validateNickname(nickname)
  if (checked.error) throw new Error(checked.error)
  const board = await requestBoard(`${API_URL}/${mode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateKey, gameVersion: GAME_VERSION, browserId, nickname: checked.nickname, score, roundCount }),
  })
  try { localStorage.setItem(NAME_KEY, board.you?.nickname ?? nickname) } catch { /* Submission is already stored on the server. */ }
  return board
}
