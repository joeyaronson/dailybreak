import { useEffect, useRef, useState } from 'react'
import { formatEndlessShareResults, formatShareResults } from '../lib/scoring'
import type { RoundResult } from '../lib/scoring'
import { copyToClipboard } from '../lib/clipboard'

type GameResultsProps = {
  mode?: 'daily' | 'endless'
  onPlayAgain?: () => void
  dateKey: string
  results: readonly RoundResult[]
  colors: readonly string[]
}

export function GameResults({ dateKey, results, colors, mode = 'daily', onPlayAgain }: GameResultsProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const total = results.reduce((sum, round) => sum + round.total, 0)
  const shareText = mode === 'daily' ? formatShareResults(dateKey, results) : formatEndlessShareResults(dateKey, results)

  useEffect(() => { headingRef.current?.focus() }, [])

  const share = async () => {
    const success = await copyToClipboard(shareText)
    setCopied(success)
    setCopyFailed(!success)
  }

  return (
    <section className="game-results" aria-labelledby="results-title">
      <h1 id="results-title" ref={headingRef} tabIndex={-1}>{mode === 'daily' ? 'Results' : 'Endless results'}</h1>
      <div className="results-score-row">
        <p className="results-total" aria-label={mode === 'daily' ? `Total score ${total} out of ${results.length * 1000}` : `Total score ${total} points`}>
          {total}<span>{mode === 'daily' ? ` / ${results.length * 1000}` : ' points'}</span>
        </p>
        <a className="launch-button results-home" href="#">Home</a>
      </div>
      {mode === 'endless' && <p>{results.filter((round) => round.bricksRemaining === 0).length} rounds cleared</p>}
      <ol className="results-rounds">
        {results.map((round, index) => (
          <li key={index} className="result-round" style={{ borderColor: colors[index] }}>
            <div className="result-round-heading">
              <h2 style={{ color: colors[index] }}>Round {index + 1}</h2>
              <span className="result-round-score"><span aria-hidden="true">{round.emoji}</span> {round.total}<small> / 1000</small></span>
            </div>
            <dl className="result-round-stats">
              <div><dt>Balls left</dt><dd>{round.ballsRemaining}</dd></div>
              <div><dt>Bricks left</dt><dd>{round.bricksRemaining === 0 ? 'All clear' : round.bricksRemaining}</dd></div>
              <div><dt>Best combo</dt><dd>{round.bestCombo}x</dd></div>
            </dl>
          </li>
        ))}
      </ol>
      <button className="launch-button" type="button" onClick={share}>{copied ? 'Copied!' : 'Share'}</button>
      {onPlayAgain && <button className="launch-button play-again" type="button" onClick={onPlayAgain}>Play again</button>}
      <span className="sr-only" role="status">{copied ? 'Results copied to clipboard.' : ''}</span>
      {copyFailed && <p role="alert">Copy failed. Try again.</p>}
    </section>
  )
}
