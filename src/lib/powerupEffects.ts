import { AdditiveBlending, BufferGeometry, Group, LineBasicMaterial, LineLoop, LineSegments, Vector3 } from 'three'
import type { Powerup } from './powerups'

export const POWERUP_COLORS: Record<Powerup, string> = {
  big: '#ffe65c', multi: '#65ffc5', split: '#b77dff', laser: '#ff5252',
  shield: '#3388ff', gravity: '#65dfff', blast: '#ff943d', extra: '#ff5cde',
  thin: '#b5ff65', chain: '#a0eaff', blackhole: '#c48aff',
  ghost: '#d8ecff',
  shuffle: '#9da8ff',
}

/** Wireframe ornaments stay in the play plane, independent of the ball's spin. */
export function createPowerupEffect(powerup: Powerup, radius: number) {
  const group = new Group()
  const material = new LineBasicMaterial({
    color: POWERUP_COLORS[powerup], transparent: true, opacity: 0.8,
    blending: AdditiveBlending, depthWrite: false,
  })
  const geometries: BufferGeometry[] = []
  const ring = (size: number, x = 0, y = 0, sides = 40) => {
    const geometry = new BufferGeometry().setFromPoints(Array.from({ length: sides }, (_, index) => {
      const angle = index / sides * Math.PI * 2
      return new Vector3(Math.cos(angle) * size, Math.sin(angle) * size, 0)
    }))
    geometries.push(geometry)
    const line = new LineLoop(geometry, material)
    line.position.set(x, y, 0.03)
    group.add(line)
    return line
  }
  const segments = (points: number[][]) => {
    const geometry = new BufferGeometry().setFromPoints(points.map(([x, y]) => new Vector3(x, y, 0.03)))
    geometries.push(geometry)
    const line = new LineSegments(geometry, material)
    group.add(line)
    return line
  }

  const orbit = new Group()
  group.add(orbit)
  if (powerup === 'big') {
    ring(radius * 1.4).scale.y = 0.55
    ring(radius * 1.4).scale.x = 0.55
    orbit.add(ring(radius * 1.75, 0, 0, 6))
  } else if (powerup === 'multi') {
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3
      orbit.add(ring(radius * 0.35, Math.cos(angle) * radius * 1.8, Math.sin(angle) * radius * 1.8, 8))
    }
  } else if (powerup === 'split') {
    orbit.add(ring(radius * 0.95, -radius * 0.8), ring(radius * 0.95, radius * 0.8))
  } else if (powerup === 'laser') {
    segments([[-radius, -0.9], [-radius, 0.5], [radius, -0.9], [radius, 0.5],
      [0, radius], [0, 0.85], [-0.1, 0.62], [0, 0.85], [0.1, 0.62], [0, 0.85]])
  } else if (powerup === 'shield') {
    orbit.add(ring(radius * 1.8, 0, 0, 6))
    ring(radius * 1.4)
  } else if (powerup === 'gravity') {
    for (let index = 0; index < 3; index++) {
      const y = -0.25 - index * 0.22
      segments([[-0.16, y - 0.12], [0, y], [0, y], [0.16, y - 0.12]])
    }
    ring(radius * 1.6).scale.y = 0.55
  } else if (powerup === 'blast') {
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = index / 32 * Math.PI * 2
      const size = radius * (index % 2 ? 1.35 : 2.1)
      return [Math.cos(angle) * size, Math.sin(angle) * size]
    })
    orbit.add(segments(points.flatMap((point, index) => [point, points[(index + 1) % points.length]])))
  } else if (powerup === 'thin') {
    for (const sign of [-1, 1]) {
      orbit.add(segments([[sign * 0.35, -0.14], [sign * 0.24, 0], [sign * 0.24, 0], [sign * 0.35, 0.14]]))
    }
    ring(radius * 1.3, 0, 0, 4)
  } else if (powerup === 'chain') {
    const points = Array.from({ length: 36 }, (_, index) => {
      const angle = index / 36 * Math.PI * 2
      const size = radius * [1.6, 2, 1.75][index % 3]
      return [Math.cos(angle) * size, Math.sin(angle) * size]
    })
    orbit.add(segments(points.flatMap((point, index) => [point, points[(index + 1) % points.length]])))
  } else if (powerup === 'blackhole') {
    ring(radius * 1.25)
    for (let arm = 0; arm < 3; arm++) {
      const points = Array.from({ length: 20 }, (_, index) => {
        const angle = arm * Math.PI * 2 / 3 + index / 19 * Math.PI * 1.5
        const size = radius * (1.3 + index / 19 * 1.7)
        return [Math.cos(angle) * size, Math.sin(angle) * size]
      })
      orbit.add(segments(points.slice(1).flatMap((point, index) => [points[index], point])))
    }
  } else if (powerup === 'ghost') {
    const outline = Array.from({ length: 21 }, (_, index) => {
      const angle = Math.PI - index / 20 * Math.PI
      return [Math.cos(angle) * radius * 1.6, Math.sin(angle) * radius * 1.6]
    })
    outline.push([radius * 1.6, -radius * 1.5], [radius * 0.8, -radius],
      [0, -radius * 1.5], [-radius * 0.8, -radius], [-radius * 1.6, -radius * 1.5])
    segments(outline.flatMap((point, index) => [point, outline[(index + 1) % outline.length]]))
  } else if (powerup === 'shuffle') {
    for (let index = 0; index < 4; index++) {
      const angle = index * Math.PI / 2
      orbit.add(ring(radius * 0.5, Math.cos(angle) * radius * 1.8, Math.sin(angle) * radius * 1.8, 4))
    }
  } else {
    ring(radius * 1.6)
    for (const x of [-radius * 2, radius * 2]) {
      orbit.add(segments([[x - 0.07, 0], [x + 0.07, 0], [x, -0.07], [x, 0.07]]))
    }
  }

  return {
    group,
    update(time: number, direction: Vector3, splitGeneration: number, reducedMotion: boolean) {
      const phase = reducedMotion ? 0 : time / 1000
      // Gravity arrows point toward the top even while the ball is falling.
      group.rotation.z = powerup === 'gravity' || powerup === 'ghost' ? 0 : Math.atan2(-direction.x, direction.y)
      orbit.rotation.z = phase * (powerup === 'blast' ? 2.4 : 1.2)
      const pulse = reducedMotion ? 1 : 1 + Math.sin(phase * 6) * 0.08
      group.scale.setScalar(pulse * (powerup === 'split' ? 0.75 ** splitGeneration : 1))
      material.opacity = reducedMotion ? 0.8 : 0.65 + Math.sin(phase * 8) * 0.15
      if (powerup === 'ghost') material.opacity *= direction.y >= 0 ? 0.45 : 1.2
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      material.dispose()
    },
  }
}
