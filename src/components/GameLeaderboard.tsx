import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getLeaderboardBrowserId, getLeaderboardNickname, leaderboardEnabled, loadLeaderboard, submitScore } from '../lib/leaderboard'
import type { Leaderboard } from '../lib/leaderboard'
import type { RoundResult } from '../lib/scoring'
import type { Powerup } from '../lib/powerups'
import { LEADERBOARD_MODE_NAMES } from '../lib/leaderboardProtocol'
import type { LeaderboardMode } from '../lib/leaderboardProtocol'
import { NICKNAME_MAX_LENGTH } from '../lib/nickname'

export function GameLeaderboard({ mode, dateKey, results, powerups }: { mode: LeaderboardMode; dateKey: string; results: readonly RoundResult[]; powerups: readonly Powerup[] }) {
  const [identity] = useState(() => {
    try { return { id: getLeaderboardBrowserId(), error: '' } }
    catch (error) { return { id: null, error: error instanceof Error ? error.message : 'Site storage is unavailable.' } }
  })
  const [nickname, setNickname] = useState(() => getLeaderboardNickname().slice(0, NICKNAME_MAX_LENGTH))
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!leaderboardEnabled) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    loadLeaderboard(mode, dateKey, identity.id, controller.signal).then((next) => {
      if (!controller.signal.aborted) setBoard(next)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Leaderboard unavailable.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mode, dateKey, identity.id, refresh])

  if (!leaderboardEnabled) return null

  const total = results.reduce((sum, round) => sum + round.total, 0)
  const canSubmit = !board?.you || (mode !== 'daily' && total > board.you.score)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!identity.id || sendingRef.current || !canSubmit) return
    sendingRef.current = true
    setSubmitting(true)
    setError('')
    try { setBoard(await submitScore(mode, dateKey, identity.id, nickname.trim(), results, powerups)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not submit. Try again.') }
    finally { sendingRef.current = false; setSubmitting(false) }
  }

  return (
    <section className="daily-leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">{LEADERBOARD_MODE_NAMES[mode]} high scores</h2>
      {board?.you && <p className="leaderboard-status" role="status">Your {mode === 'daily' ? 'score' : 'best'}: #{board.you.rank} · {board.you.nickname} · {board.you.score} points</p>}
      {canSubmit && <form className="leaderboard-form" onSubmit={submit}>
        <label htmlFor="leaderboard-nickname">Nickname (max {NICKNAME_MAX_LENGTH})</label>
        <input id="leaderboard-nickname" name="nickname" type="text" autoComplete="nickname" maxLength={NICKNAME_MAX_LENGTH} minLength={1}
          value={nickname} onChange={(event) => setNickname(event.target.value)} disabled={submitting || !identity.id} required />
        <button className="launch-button" type="submit" disabled={loading || submitting || !identity.id || !nickname.trim()}>
          {submitting ? 'Submitting…' : board?.you ? 'Submit new best' : 'Submit score'}
        </button>
      </form>}
      {identity.error && <p role="alert">{identity.error}</p>}
      {error && <div className="leaderboard-error"><p role="alert">{error}</p>
        <button className="launch-button" type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || submitting}>Retry</button>
      </div>}
      {loading && <p role="status">Loading scores…</p>}
      {!loading && board && <>
        {board.entries.length === 0 ? <p>No scores yet.</p> : <table className="leaderboard-table">
          <caption className="sr-only">Top 20 {LEADERBOARD_MODE_NAMES[mode]} scores for {dateKey}</caption>
          <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead>
          <tbody>{board.entries.map((entry, index) => <tr key={index} className={entry.isYou ? 'leaderboard-you' : undefined}>
            <td>{entry.rank}</td><td>{entry.nickname}{entry.isYou && <span className="sr-only"> (you)</span>}</td><td>{entry.score}</td>
          </tr>)}</tbody>
        </table>}
      </>}
    </section>
  )
}
