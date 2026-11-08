import { useEffect, useRef, useState } from 'react'

type BallIndicatorProps = {
  available: boolean
  animateIn?: boolean
}

type Point = [number, number, number]
const ring = (pointAt: (angle: number) => Point) =>
  Array.from({ length: 41 }, (_, index) => pointAt(index / 40 * Math.PI * 2))

const grid = [
  ...[-Math.PI / 4, 0, Math.PI / 4].map((latitude) => ring((angle) => [
    Math.cos(latitude) * Math.cos(angle),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(angle),
  ])),
  ...[0, Math.PI / 3, Math.PI * 2 / 3].map((longitude) => ring((angle) => [
    Math.sin(angle) * Math.cos(longitude),
    Math.cos(angle),
    Math.sin(angle) * Math.sin(longitude),
  ])),
]

function wireframe(time: number) {
  const xAngle = 0.35 + time * 0.65
  const yAngle = time * 1.8
  const sx = Math.sin(xAngle), cx = Math.cos(xAngle)
  const sy = Math.sin(yAngle), cy = Math.cos(yAngle)
  return grid.map((points) => points.map(([x, y, z], index) => {
    // Rotate the entire spherical grid, then project it into the SVG.
    const rotatedX = x * cy + z * sy
    const rotatedZ = -x * sy + z * cy
    const rotatedY = y * cx - rotatedZ * sx
    return `${index === 0 ? 'M' : 'L'}${(12 + rotatedX * 10).toFixed(2)},${(12 - rotatedY * 10).toFixed(2)}`
  }).join(' ')).join(' ')
}

export function BallIndicator({ available, animateIn = false }: BallIndicatorProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const [spin] = useState(() => {
    const offset = Math.random() * 20
    return { offset, initialGrid: wireframe(offset) }
  })

  useEffect(() => {
    if (!available) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let previous = -Infinity
    const started = performance.now()
    const animate = (time: number) => {
      if (reducedMotion.matches) {
        pathRef.current?.setAttribute('d', spin.initialGrid)
      } else if (!document.hidden && time - previous >= 1000 / 30) {
        pathRef.current?.setAttribute('d', wireframe(spin.offset + (time - started) / 1000))
        previous = time
      }
      if (!reducedMotion.matches) frame = requestAnimationFrame(animate)
    }
    const restart = () => {
      cancelAnimationFrame(frame)
      animate(performance.now())
    }
    restart()
    reducedMotion.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      reducedMotion.removeEventListener('change', restart)
    }
  }, [available, spin])

  const stateClass = available ? animateIn ? ' available' : '' : ' spent'
  return (
    <svg className={`summary-ball${stateClass}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      {available && <path ref={pathRef} d={spin.initialGrid} />}
    </svg>
  )
}
