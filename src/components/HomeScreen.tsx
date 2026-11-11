import { useState } from 'react'
import { generateBrickLayout } from '../lib/daily'
import { ROUND_SCORE_TARGETS } from '../lib/scoring'
import { BrickGrid } from './BrickGrid'

const noop = () => {}

export function HomeScreen() {
  const [bricks] = useState(() => generateBrickLayout(crypto.getRandomValues(new Uint32Array(1))[0], 10))
  return (
    <section className="home-screen" aria-label="Choose a game mode">
      <BrickGrid
        demoMode
        bricks={bricks}
        brickColor="#ff5cde"
        scoreTargets={ROUND_SCORE_TARGETS[0]}
        initialProgress={null}
        onProgress={noop}
        hasNextRound
        onNextRound={noop}
      />
      <nav className="mode-options" aria-label="Game modes">
        <a className="launch-button" href="#daily">Daily mode</a>
        <a className="launch-button" href="#endless">Endless mode</a>
        <a className="launch-button" href="#arcade">Arcade mode</a>
      </nav>
      <footer className="home-footer">made by <a href="https://arons0n.com" aria-label="arons0n">arons<span className="slashed-zero">0</span>n</a></footer>
    </section>
  )
}
