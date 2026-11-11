import { useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { curvedScreenShader, sceneToScreen, screenToScene } from '../lib/crt'
import { BALLS_PER_ROUND, createSeededRandom, GRID_SIZE } from '../lib/daily'
import type { generateDailyGame } from '../lib/daily'
import { RoundSummary } from './RoundSummary'
import { BallIndicator } from './BallIndicator'
import { calculateRoundScore } from '../lib/scoring'
import type { RoundResult, ScoreTargets } from '../lib/scoring'
import type { RoundProgress } from '../lib/progress'
import { SHIELD_BOUNCES } from '../lib/powerups'
import type { Powerup } from '../lib/powerups'
import { createPowerupEffect, POWERUP_COLORS } from '../lib/powerupEffects'
import { GamePauseContext } from '../lib/gamePause'

type BrickGridProps = {
  roundLabel?: string
  powerup?: Powerup
  demoMode?: boolean
  children?: ReactNode
  initialProgress: RoundProgress | null
  onProgress: (progress: RoundProgress) => void
  scoreTargets: ScoreTargets
  brickColor: string
  bricks: ReturnType<typeof generateDailyGame>['rounds'][number]['bricks']
  hasNextRound: boolean
  onNextRound: (result: RoundResult) => void
}

const CELL_HEIGHT = 0.625
const PADDING = 0.25
const FIELD_WIDTH = GRID_SIZE + PADDING * 2
const FIELD_HEIGHT = GRID_SIZE * CELL_HEIGHT + PADDING * 2 + 5.5
const BALL_RADIUS = 0.16
const WALL_HEIGHT = 0.6
const BALL_SPEED = 15
// Turn a full-speed downward ball within about 4.4 units, above the bottom exit.
const REVERSE_GRAVITY_ACCELERATION = 65
const REVERSE_GRAVITY_MAX_SPEED = 24
const MULTIBALL_SPREAD = 0.18
const LIGHTNING_RANGE = 2
const BLACK_HOLE_RANGE = 4
const BLACK_HOLE_PULL = 12
const MAX_LIVES = BALLS_PER_ROUND

export function BrickGrid({ bricks, brickColor, scoreTargets, initialProgress, onProgress, hasNextRound, onNextRound, demoMode = false, children, roundLabel, powerup }: BrickGridProps) {
  const paused = useContext(GamePauseContext)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const shieldCapacity = powerup === 'gravity' ? 1 : SHIELD_BOUNCES
  const ballRadius = BALL_RADIUS * (powerup === 'big' ? 2 : 1)
  const maxLives = MAX_LIVES + (powerup === 'extra' ? 3 : 0)
  const fieldHeight = demoMode ? GRID_SIZE * CELL_HEIGHT + PADDING * 2 + 3.75 : FIELD_HEIGHT
  const ballStartY = -fieldHeight / 2 + 0.75
  const containerRef = useRef<HTMLDivElement>(null)
  const launchRef = useRef<(() => void) | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const [lives, setLives] = useState(maxLives)
  const [roundComplete, setRoundComplete] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [bricksRemaining, setBricksRemaining] = useState(() => bricks.filter((brick) => brick.occupied).length)
  const [bestCombo, setBestCombo] = useState(0)
  const [shieldCharges, setShieldCharges] = useState<number>(shieldCapacity)
  const [hitPopups, setHitPopups] = useState<{ id: number; count: number; x: number; y: number }[]>([])
  const [isEntering, setIsEntering] = useState(true)

  useEffect(() => {
    if (!roundComplete) return
    const clearedBoard = bricksRemaining === 0
    const timer = setTimeout(() => setSummaryOpen(true), clearedBoard ? 800 : 0)
    return () => clearTimeout(timer)
  }, [roundComplete, bricksRemaining])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: WebGLRenderer
    try {
      // Each effect owns a fresh canvas. Strict Mode runs cleanup and setup
      // again, and a canvas with a lost context cannot be reused immediately.
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnavailable(true)
      return
    }
    const restoredComplete = initialProgress?.phase === 'complete'
      || (initialProgress?.phase === 'returning' && initialProgress.ballsRemaining === 0)
    setUnavailable(false)
    setIsFlying(initialProgress?.phase === 'flying')
    setLives(initialProgress?.ballsRemaining ?? maxLives)
    setRoundComplete(restoredComplete)
    setSummaryOpen(false)
    setBricksRemaining(bricks.filter((brick) => brick.occupied).length - (initialProgress?.destroyedBricks.length ?? 0))
    setHitPopups([])
    setShieldCharges(shieldCapacity)
    let bestComboValue = initialProgress?.bestCombo ?? 0
    setBestCombo(bestComboValue)
    let shotHits = initialProgress?.shotHits ?? 0
    let popupId = 0
    const popupTimers = new Set<ReturnType<typeof setTimeout>>()
    const showHitPopup = (brickIndex: number) => {
      const projected = brickLines[brickIndex].position.clone().project(camera)
      const point = sceneToScreen(projected.x, projected.y)
      const id = ++popupId
      const count = ++shotHits
      bestComboValue = Math.max(bestComboValue, count)
      setBestCombo(bestComboValue)
      if (count === 1) return
      setHitPopups((popups) => [...popups, {
        id, count,
        x: (point.x + 1) * 50,
        y: (1 - point.y) * 50,
      }])
      const timer = setTimeout(() => {
        setHitPopups((popups) => popups.filter((popup) => popup.id !== id))
        popupTimers.delete(timer)
      }, 650)
      popupTimers.add(timer)
    }
    const canvas = renderer.domElement
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', `Playing field with a ${GRID_SIZE} by ${GRID_SIZE} brick grid. Drag below the ball to move it horizontally. Drag above it to aim.`)
    container.appendChild(canvas)

    const scene = new Scene()
    const camera = new PerspectiveCamera(45, FIELD_WIDTH / fieldHeight, 0.1, 100)
    const viewDirection = new Vector3(0, demoMode ? -0.55 : -0.85, 1).normalize()
    camera.position.copy(viewDirection)
    camera.lookAt(0, 0, 0)
    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    const curvedPass = new ShaderPass(curvedScreenShader)
    const outputPass = new OutputPass()
    composer.addPass(renderPass)
    composer.addPass(curvedPass)
    composer.addPass(outputPass)

    const tableGeometry = new BoxGeometry(FIELD_WIDTH, fieldHeight, 0.18)
    const baseEdges = new EdgesGeometry(tableGeometry)
    const basePositions = baseEdges.getAttribute('position')
    const wallPoints = Array.from({ length: basePositions.count }, (_, index) =>
      new Vector3().fromBufferAttribute(basePositions, index),
    )
    const floorZ = 0.09
    const wallTop = floorZ + WALL_HEIGHT
    for (const x of [-FIELD_WIDTH / 2, FIELD_WIDTH / 2]) {
      wallPoints.push(
        new Vector3(x, -fieldHeight / 2, wallTop), new Vector3(x, fieldHeight / 2, wallTop),
      )
      for (const y of [-fieldHeight / 2, fieldHeight / 2]) {
        wallPoints.push(new Vector3(x, y, floorZ), new Vector3(x, y, wallTop))
      }
    }
    if (powerup !== 'gravity') wallPoints.push(
      new Vector3(-FIELD_WIDTH / 2, fieldHeight / 2, wallTop),
      new Vector3(FIELD_WIDTH / 2, fieldHeight / 2, wallTop),
    )
    if (demoMode) wallPoints.push(
      new Vector3(-FIELD_WIDTH / 2, -fieldHeight / 2, wallTop),
      new Vector3(FIELD_WIDTH / 2, -fieldHeight / 2, wallTop),
    )
    const tableEdges = new BufferGeometry().setFromPoints(wallPoints)
    baseEdges.dispose()
    const tableMaterial = new LineBasicMaterial({ color: '#49d77e' })
    const table = new LineSegments(tableEdges, tableMaterial)
    table.position.z = -ballRadius - 0.09
    scene.add(table)

    const geometry = new BoxGeometry(0.92, CELL_HEIGHT - 0.08, 0.3)
    const material = new MeshBasicMaterial()
    const brickEdges = new EdgesGeometry(geometry)
    const brickMaterial = new LineBasicMaterial({ color: brickColor })
    const brickHighlight = new Color(brickColor).lerp(new Color('#ffffff'), 0.55).getStyle()
    const occupied = bricks.filter((brick) => brick.occupied).map((brick) => ({ ...brick }))
    const brickLines = occupied.map(() => new LineSegments(brickEdges, brickMaterial))
    const brickFaceMaterial = new MeshBasicMaterial({
      // Write depth without filling faces, so rear edges stay hidden.
      colorWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const brickFaces = new InstancedMesh(geometry, brickFaceMaterial, occupied.length)
    scene.add(brickFaces)
    // Expand brick bounds by the ball radius for swept collision detection.
    const collisionGeometry = new BoxGeometry(0.92 + ballRadius * 2, CELL_HEIGHT - 0.08 + ballRadius * 2, 1)
    const collider = new InstancedMesh(collisionGeometry, material, occupied.length)
    const destroyed = new Set<number>()
    const savedDestroyed = new Set(initialProgress?.destroyedBricks ?? [])
    occupied.forEach((brick, index) => { if (savedDestroyed.has(brick.id)) destroyed.add(index) })
    const matrix = new Matrix4()
    occupied.forEach((brick, index) => {
      matrix.makeTranslation(
        brick.column - (GRID_SIZE - 1) / 2,
        fieldHeight / 2 - PADDING - (brick.row + 0.5) * CELL_HEIGHT,
        0,
      )
      brickLines[index].position.setFromMatrixPosition(matrix)
      brickLines[index].renderOrder = 1
      scene.add(brickLines[index])
      brickFaces.setMatrixAt(index, matrix)
      collider.setMatrixAt(index, matrix)
      if (destroyed.has(index)) {
        brickLines[index].visible = false
        brickFaces.setMatrixAt(index, matrix.clone().makeScale(0, 0, 0))
      }
    })
    brickFaces.instanceMatrix.needsUpdate = true
    const demoDrops = new Map<number, { started: number; height: number }>()
    const replaceDemoBrick = (index: number) => {
      const candidates = bricks.filter((cell) => {
        if (cell.id === occupied[index].id || occupied.some((brick, other) => other !== index && brick.id === cell.id)) return false
        const x = cell.column - (GRID_SIZE - 1) / 2
        const y = fieldHeight / 2 - PADDING - (cell.row + 0.5) * CELL_HEIGHT
        return Math.hypot(x - ball.position.x, y - ball.position.y) > 1.2
      })
      const cell = candidates[Math.floor(Math.random() * candidates.length)]
      if (!cell) return
      occupied[index] = { ...cell, occupied: true }
      matrix.makeTranslation(cell.column - (GRID_SIZE - 1) / 2,
        fieldHeight / 2 - PADDING - (cell.row + 0.5) * CELL_HEIGHT, 0)
      brickLines[index].position.setFromMatrixPosition(matrix)
      brickLines[index].visible = true
      collider.setMatrixAt(index, matrix)
      if (!reducedMotion.matches) {
        const dropRay = new Raycaster()
        dropRay.setFromCamera(new Vector2(0, 1.25), camera)
        const aboveScreen = dropRay.ray.intersectPlane(
          new Plane(new Vector3(0, 1, 0), -brickLines[index].position.y), new Vector3(),
        )
        const height = Math.max(2, (aboveScreen?.z ?? fieldHeight * 2) + 0.5)
        demoDrops.set(index, { started: performance.now(), height })
        brickLines[index].position.z = height
        matrix.setPosition(brickLines[index].position)
        brickFaces.frustumCulled = false
      }
      brickFaces.setMatrixAt(index, matrix)
      brickFaces.instanceMatrix.needsUpdate = true
      collider.instanceMatrix.needsUpdate = true
      brickFaces.computeBoundingSphere()
      collider.computeBoundingSphere()
    }
    const updateDemoDrops = () => {
      if (demoDrops.size === 0) return
      const now = performance.now()
      demoDrops.forEach((drop, index) => {
        const progress = reducedMotion.matches ? 1 : Math.min(1, (now - drop.started) / 650)
        const position = brickLines[index].position
        const ballUnderneath = Math.abs(position.x - ball.position.x) < 0.46 + ballRadius
          && Math.abs(position.y - ball.position.y) < (CELL_HEIGHT - 0.08) / 2 + ballRadius
        position.z = progress < 0.8
          ? drop.height * (1 - (progress / 0.8) ** 2)
          : Math.sin((progress - 0.8) / 0.2 * Math.PI) * 0.08
        if (progress === 1) {
          // Don't activate a brick around a ball passing underneath it.
          position.z = ballUnderneath ? 0.18 : 0
          if (!ballUnderneath) demoDrops.delete(index)
        }
        matrix.makeTranslation(position.x, position.y, position.z)
        brickFaces.setMatrixAt(index, matrix)
      })
      brickFaces.instanceMatrix.needsUpdate = true
      if (demoDrops.size === 0) {
        brickFaces.computeBoundingSphere()
        brickFaces.frustumCulled = true
      }
    }
    const ballGeometry = new SphereGeometry(ballRadius, 12, 8)
    const ballEdges = new EdgesGeometry(ballGeometry)
    const ballVertices = ballEdges.getAttribute('position')
    const ballFragments: Vector3[] = []
    const edgeStride = Math.ceil(ballVertices.count / 40) * 2
    for (let vertex = 0; vertex + 1 < ballVertices.count; vertex += edgeStride) {
      ballFragments.push(new Vector3().fromBufferAttribute(ballVertices, vertex), new Vector3().fromBufferAttribute(ballVertices, vertex + 1))
    }
    const ballBurstGeometry = new BufferGeometry().setFromPoints(ballFragments)
    const ballColor = powerup ? POWERUP_COLORS[powerup] : '#bdffd3'
    const ballMaterial = new MeshBasicMaterial({ color: ballColor, wireframe: true })
    const ball = new Mesh(ballGeometry, ballMaterial)
    ball.position.set(
      initialProgress?.ball.x ?? 0,
      initialProgress?.phase === 'flying'
        ? Math.max(-fieldHeight / 2 + ballRadius + 0.001, Math.min(fieldHeight / 2 - ballRadius - 0.001, initialProgress.ball.y))
        : ballStartY,
      0,
    )
    const ballTraceMaterial = new LineBasicMaterial({ color: ballColor })
    const ballTrace = new LineSegments(ballEdges, ballTraceMaterial)
    ball.add(ballTrace)
    scene.add(ball)

    const arrowShape = new Shape()
    arrowShape.moveTo(0, -0.035)
    arrowShape.lineTo(0.3, -0.035)
    arrowShape.lineTo(0.3, -0.14)
    arrowShape.lineTo(0.48, 0)
    arrowShape.lineTo(0.3, 0.14)
    arrowShape.lineTo(0.3, 0.035)
    arrowShape.lineTo(0, 0.035)
    arrowShape.closePath()
    const arrowPoints = arrowShape.getPoints()
    const arrowGeometry = new BufferGeometry().setFromPoints(
      arrowPoints.slice(1).flatMap((point, index) => [arrowPoints[index], point]),
    )
    const arrowMaterial = new LineBasicMaterial({ color: '#55ff91' })
    const leftArrow = new LineSegments(arrowGeometry, arrowMaterial)
    const rightArrow = new LineSegments(arrowGeometry, arrowMaterial)
    leftArrow.rotation.z = Math.PI
    leftArrow.position.x = -0.35
    rightArrow.position.x = 0.35
    ball.add(leftArrow, rightArrow)

    const dotGeometry = new SphereGeometry(0.035, 8, 6)
    const dotMaterial = new MeshBasicMaterial({ color: powerup ? ballColor : '#55ff91' })
    const maxDots = powerup === 'multi' ? 600 : 200
    const dots = new InstancedMesh(dotGeometry, dotMaterial, maxDots)
    dots.frustumCulled = false
    scene.add(dots)
    const aimDirection = new Vector3(initialProgress?.aim.x ?? 0, initialProgress?.aim.y ?? 1, 0)
    const raycaster = new Raycaster()
    const dotMatrix = new Matrix4()
    let flying = initialProgress?.phase === 'flying'
    let cleared = destroyed.size === occupied.length
    let completed = restoredComplete
    let returnAt: number | null = null
    let remainingLives = initialProgress?.ballsRemaining ?? maxLives
    let animationFrame = 0
    const flightDirection = new Vector3(initialProgress?.direction.x ?? 0, initialProgress?.direction.y ?? 1, 0)
    const makeEffect = () => {
      if (!powerup) return undefined
      const effect = createPowerupEffect(powerup, ballRadius)
      scene.add(effect.group)
      return effect
    }
    type FlightBall = { mesh: typeof ball; direction: Vector3; active: boolean; splitGeneration: number; bottomBounces: number; topBounces: number; effect?: ReturnType<typeof createPowerupEffect> }
    const flightBalls: FlightBall[] = [{ mesh: ball, direction: flightDirection, active: flying, splitGeneration: 0, bottomBounces: 0, topBounces: 0, effect: makeEffect() }]
    const addBall = (position: Vector3, direction: Vector3, splitGeneration = 0) => {
      const mesh = new Mesh(ballGeometry, ballMaterial)
      mesh.position.copy(position)
      scene.add(mesh)
      const actor: FlightBall = { mesh, direction: direction.clone(), active: true, splitGeneration, bottomBounces: 0, topBounces: 0, effect: makeEffect() }
      flightBalls.push(actor)
      return actor
    }
    const trace = (origin: Vector3, direction: Vector3, ignoreBricks = false) => {
      const normal = new Vector3(0, -Math.sign(direction.y), 0)
      let bottom = direction.y < 0 && !demoMode
      let brickIndex: number | undefined
      let distance = direction.y === 0 ? Infinity
        : (Math.sign(direction.y) * (fieldHeight / 2 - ballRadius) - origin.y) / direction.y
      if (direction.x !== 0) {
        const sideDistance = (Math.sign(direction.x) * (FIELD_WIDTH / 2 - ballRadius) - origin.x) / direction.x
        if (sideDistance < distance) {
          distance = sideDistance
          normal.set(-Math.sign(direction.x), 0, 0)
          bottom = false
        }
      }
      raycaster.set(origin, direction)
      const hit = (ignoreBricks ? [] : raycaster.intersectObject(collider, false))
        .find((hit) => hit.instanceId !== undefined && !destroyed.has(hit.instanceId) && !demoDrops.has(hit.instanceId))
      if (hit?.face && hit.distance < distance) {
        distance = hit.distance
        normal.copy(hit.face.normal)
        brickIndex = hit.instanceId
        bottom = false
      }
      const topExit = powerup === 'gravity' && brickIndex === undefined && normal.y === -1
      return { distance, normal, brickIndex, bottom, topExit }
    }
    const steerTowardBricks = (position: Vector3, direction: Vector3, delta: number) => {
      let target: Vector3 | undefined
      let nearest = BLACK_HOLE_RANGE
      brickLines.forEach((brick, index) => {
        if (destroyed.has(index)) return
        const distance = brick.position.distanceTo(position)
        if (distance < nearest) { nearest = distance; target = brick.position }
      })
      if (!target) return
      const pull = BLACK_HOLE_PULL * (1 - nearest / BLACK_HOLE_RANGE)
      direction.addScaledVector(target.clone().sub(position).normalize(), pull * delta / BALL_SPEED).normalize()
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let lastShieldHit = -Infinity
    const shieldGeometry = new BufferGeometry().setFromPoints([
      new Vector3(-FIELD_WIDTH / 2 + 0.1, 0, 0), new Vector3(FIELD_WIDTH / 2 - 0.1, 0, 0),
      ...Array.from({ length: 20 }, (_, index) => {
        const x = -FIELD_WIDTH / 2 + 0.2 + index * (FIELD_WIDTH - 0.4) / 19
        return [new Vector3(x - 0.08, -0.07, 0), new Vector3(x + 0.08, 0.07, 0)]
      }).flat(),
    ])
    const shields = powerup === 'shield' || powerup === 'gravity' ? Array.from({ length: shieldCapacity }, (_, index) => {
      const shieldMaterial = new LineBasicMaterial({
        color: ballColor, transparent: true, opacity: 0.75,
        blending: AdditiveBlending, depthWrite: false,
      })
      const shield = new LineSegments(shieldGeometry, shieldMaterial)
      shield.position.set(0, powerup === 'gravity' ? fieldHeight / 2 - ballRadius : -fieldHeight / 2 + ballRadius + index * 0.16, 0.02)
      scene.add(shield)
      return shield
    }) : []
    let entering = !demoMode && !initialProgress && !reducedMotion.matches
    let drawing = entering
    setIsEntering(entering)
    const introStarted = performance.now()
    const introDuration = 1725
    const entranceStarted = introStarted + introDuration
    const beamGeometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()])
    const beamMaterial = new LineBasicMaterial({ color: '#8bffb2', transparent: true, opacity: 0.42, depthTest: false, depthWrite: false })
    const beam = new LineSegments(beamGeometry, beamMaterial)
    beam.frustumCulled = false
    beam.renderOrder = 2
    const beamTipGeometry = new SphereGeometry(0.06, 8, 6)
    const beamTipMaterial = new MeshBasicMaterial({ color: '#d9ffe6', depthTest: false, depthWrite: false })
    const beamTip = new Mesh(beamTipGeometry, beamTipMaterial)
    beamTip.renderOrder = 3
    beam.visible = beamTip.visible = false
    scene.add(beam, beamTip)
    const scanGeometry = beamGeometry.clone()
    const scanMaterial = beamMaterial.clone()
    const scanBeam = new LineSegments(scanGeometry, scanMaterial)
    scanBeam.frustumCulled = false
    scanBeam.renderOrder = 2
    scanBeam.visible = false
    scene.add(scanBeam)
    const beamRay = new Raycaster()
    const updateBeam = (tip: Vector3, opacity: number, showTip: boolean, target = beam) => {
      const projected = tip.clone().project(camera)
      beamRay.setFromCamera(new Vector2(projected.x < 0 ? -1.02 : 1.02, projected.y), camera)
      const screenEdge = beamRay.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -tip.z), new Vector3())
      target.visible = screenEdge !== null
      if (target === beam) beamTip.visible = target.visible && showTip
      if (!screenEdge) return
      const positions = target.geometry.getAttribute('position')
      positions.setXYZ(0, screenEdge.x, screenEdge.y, screenEdge.z)
      positions.setXYZ(1, tip.x, tip.y, tip.z)
      positions.needsUpdate = true
      target.material.opacity = opacity
      if (showTip) beamTip.position.copy(tip)
    }
    const scanTip = new Vector3()
    const scanEnd = new Vector3()
    const updateScan = () => {
      scanBeam.visible = false
      if (drawing || reducedMotion.matches) return
      const objects = [table, ...brickLines.filter((line) => line.visible)]
      const edgeCount = objects.reduce((total, object) => total + object.geometry.getAttribute('position').count / 2, 0)
      const sweep = performance.now() / 65
      let edge = Math.floor(sweep) % edgeCount
      for (const object of objects) {
        const positions = object.geometry.getAttribute('position')
        if (edge >= positions.count / 2) {
          edge -= positions.count / 2
          continue
        }
        object.updateWorldMatrix(true, false)
        scanTip.fromBufferAttribute(positions, edge * 2)
        scanEnd.fromBufferAttribute(positions, edge * 2 + 1)
        scanTip.lerp(scanEnd, sweep % 1).applyMatrix4(object.matrixWorld)
        updateBeam(scanTip, 0.13, false, scanBeam)
        break
      }
    }
    const afterimages = Array.from({ length: 8 }, () => {
      const material = new MeshBasicMaterial({
        color: powerup ? ballColor : '#8bffb2', wireframe: true, transparent: true,
        opacity: 0, blending: AdditiveBlending, depthWrite: false,
      })
      const ghost = new Mesh(ballGeometry, material)
      ghost.visible = false
      scene.add(ghost)
      return ghost
    })
    const trailSamples: { position: Vector3; rotation: typeof ball.quaternion; time: number }[] = []
    let lastAfterimage = -Infinity
    const recordTrail = () => {
      if (reducedMotion.matches) return
      const now = performance.now()
      if (now - lastAfterimage < 35) return
      lastAfterimage = now
      trailSamples.push({ position: ball.position.clone(), rotation: ball.quaternion.clone(), time: now })
      if (trailSamples.length > afterimages.length) trailSamples.shift()
    }
    const updateTrail = () => {
      const now = performance.now()
      while (trailSamples.length && now - trailSamples[0].time > 280) trailSamples.shift()
      afterimages.forEach((ghost, index) => {
        const sample = trailSamples[index]
        ghost.visible = !reducedMotion.matches && !!sample
        if (!sample) return
        ghost.position.copy(sample.position)
        ghost.quaternion.copy(sample.rotation)
        ghost.material.opacity = 0.3 * (1 - (now - sample.time) / 280) ** 2
      })
    }
    const traces = [
      { geometry: tableEdges, object: table, start: 0, duration: 900 },
      { geometry: ballEdges, object: ballTrace, start: 825, duration: 525 },
      { geometry: arrowGeometry, object: leftArrow, start: 1275, duration: 450 },
    ].map((trace) => {
      trace.geometry.computeBoundingSphere()
      return { ...trace, original: new Float32Array(trace.geometry.getAttribute('position').array) }
    })
    const drawTraces = (elapsed: number) => {
      beam.visible = beamTip.visible = false
      traces.forEach(({ geometry, object, original, start, duration }) => {
        const progress = reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (elapsed - start) / duration))
        const positions = geometry.getAttribute('position')
        const edges = positions.count / 2
        for (let edge = 0; edge < edges; edge++) {
          const fraction = Math.max(0, Math.min(1, progress * edges - edge))
          const offset = edge * 6
          positions.setXYZ(edge * 2 + 1,
            original[offset] + (original[offset + 3] - original[offset]) * fraction,
            original[offset + 1] + (original[offset + 4] - original[offset + 1]) * fraction,
            original[offset + 2] + (original[offset + 5] - original[offset + 2]) * fraction,
          )
        }
        positions.needsUpdate = true
        geometry.setDrawRange(0, Math.ceil(progress * edges) * 2)
        if (progress > 0 && progress < 1) {
          object.updateWorldMatrix(true, false)
          const edge = Math.min(edges - 1, Math.floor(progress * edges))
          const tip = new Vector3().fromBufferAttribute(positions, edge * 2 + 1)
            .applyMatrix4(object.matrixWorld)
          updateBeam(tip, 0.42, true)
        }
      })
    }
    const entrances = occupied.map((_, index) => ({
      delay: index * 50,
      height: fieldHeight * 2,
    }))
    brickFaces.frustumCulled = !entering
    const updateEntrance = () => {
      if (!entering) return
      if (drawing) {
        const elapsed = performance.now() - introStarted
        drawTraces(elapsed)
        if (!reducedMotion.matches && elapsed < introDuration) {
          brickFaces.visible = false
          brickLines.forEach((line) => { line.visible = false })
          return
        }
        drawing = false
        brickFaces.visible = true
        brickLines.forEach((line) => { line.visible = true })
      }
      const elapsed = performance.now() - entranceStarted
      let landed = 0
      entrances.forEach((entrance, index) => {
        const progress = reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (elapsed - entrance.delay) / 650))
        const height = progress < 0.8
          ? entrance.height * (1 - (progress / 0.8) ** 2)
          : Math.sin((progress - 0.8) / 0.2 * Math.PI) * 0.08
        brickLines[index].position.z = progress === 1 ? 0 : height
        matrix.makeTranslation(
          brickLines[index].position.x,
          brickLines[index].position.y,
          brickLines[index].position.z,
        )
        brickFaces.setMatrixAt(index, matrix)
        if (progress === 1) landed++
      })
      brickFaces.instanceMatrix.needsUpdate = true
      if (landed === occupied.length) {
        entering = false
        brickFaces.computeBoundingSphere()
        brickFaces.frustumCulled = true
        setIsEntering(false)
      }
    }
    let shake: Animation | null = null
    const shakeScreen = () => {
      if (reducedMotion.matches) return
      shake?.cancel()
      shake = container.animate([
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-1.6px, 1px)' },
        { transform: 'translate(1.2px, -0.8px)' },
        { transform: 'translate(-0.6px, 0.4px)' },
        { transform: 'translate(0, 0)' },
      ], { duration: 180, easing: 'ease-out' })
    }
    type Burst = {
      lines: LineSegments
      points: Points
      geometry: BufferGeometry
      lineMaterial: LineBasicMaterial
      pointMaterial: PointsMaterial
      fragments: {
        center: Vector3
        halfEdge: Vector3
        velocity: Vector3
        axis: Vector3
        spin: number
      }[]
      started: number
      duration: number
    }
    const bursts: Burst[] = []
    const shockwaveGeometry = new BufferGeometry().setFromPoints(Array.from({ length: 64 }, (_, index) => {
      const angle = index / 64 * Math.PI * 2
      return new Vector3(Math.cos(angle), Math.sin(angle), 0)
    }))
    const shockwaves: { rings: LineLoop<BufferGeometry, LineBasicMaterial>[]; started: number }[] = []
    const disposeShockwave = (wave: typeof shockwaves[number]) => {
      wave.rings.forEach((ring) => { scene.remove(ring); ring.material.dispose() })
    }
    const disposeBurst = (burst: Burst) => {
      scene.remove(burst.lines, burst.points)
      burst.geometry.dispose()
      burst.lineMaterial.dispose()
      burst.pointMaterial.dispose()
    }
    const explode = (source: BufferGeometry, position: Vector3, color: string, pointColor: string, seed: number) => {
      if (reducedMotion.matches) return
      const burstGeometry = source.clone()
      const positions = new Float32Array(burstGeometry.getAttribute('position').array)
      const fragments: Burst['fragments'] = []
      // Independent visual randomness keeps the daily layouts and ball physics unchanged.
      const random = createSeededRandom(seed)
      for (let edge = 0; edge < positions.length; edge += 6) {
        const first = new Vector3().fromArray(positions, edge)
        const second = new Vector3().fromArray(positions, edge + 3)
        const center = first.clone().add(second).multiplyScalar(0.5)
        const outward = center.clone().add(new Vector3(0, 0, 0.2))
          .normalize().multiplyScalar(1 + random() * 0.8)
        outward.x += (random() - 0.5) * 0.4
        outward.y += (random() - 0.5) * 0.4
        outward.z = Math.abs(outward.z) * 0.5 + 0.3
        fragments.push({
          center,
          halfEdge: first.sub(second).multiplyScalar(0.5),
          velocity: outward,
          axis: new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
          spin: (random() < 0.5 ? -1 : 1) * (1 + random() * 2),
        })
      }
      const lineMaterial = new LineBasicMaterial({ color, transparent: true, depthWrite: false })
      const pointMaterial = new PointsMaterial({ color: pointColor, size: 0.07, transparent: true, depthWrite: false })
      const lines = new LineSegments(burstGeometry, lineMaterial)
      const points = new Points(burstGeometry, pointMaterial)
      lines.position.copy(position)
      points.position.copy(lines.position)
      lines.frustumCulled = points.frustumCulled = false
      scene.add(lines, points)
      bursts.push({ lines, points, geometry: burstGeometry, lineMaterial, pointMaterial, fragments, started: performance.now(), duration: 0.7 })
    }
    let impactCount = 0
    const lightningImpact = (path: Vector3[]) => {
      if (reducedMotion.matches) return
      const random = createSeededRandom(++impactCount)
      const fragments: Burst['fragments'] = []
      for (let link = 1; link < path.length; link++) {
        const start = path[link - 1]
        const end = path[link]
        const tangent = new Vector3(-(end.y - start.y), end.x - start.x, 0).normalize()
        let previous = start.clone()
        previous.z += 0.2
        for (let step = 1; step <= 10; step++) {
          const next = start.clone().lerp(end, step / 10)
          if (step < 10) next.addScaledVector(tangent, (random() - 0.5) * 0.35)
          next.z += 0.2
          fragments.push({ center: previous.clone().add(next).multiplyScalar(0.5),
            halfEdge: previous.clone().sub(next).multiplyScalar(0.5), velocity: new Vector3(),
            axis: new Vector3(0, 0, 1), spin: 0 })
          previous = next
        }
      }
      const geometry = new BufferGeometry().setFromPoints(fragments.flatMap((fragment) => [
        fragment.center.clone().add(fragment.halfEdge), fragment.center.clone().sub(fragment.halfEdge),
      ]))
      const lineMaterial = new LineBasicMaterial({ color: POWERUP_COLORS.chain, transparent: true,
        blending: AdditiveBlending, depthTest: false, depthWrite: false })
      const pointMaterial = new PointsMaterial({ color: '#efffff', size: 0.07, transparent: true,
        blending: AdditiveBlending, depthTest: false, depthWrite: false })
      const lines = new LineSegments(geometry, lineMaterial)
      const points = new Points(geometry, pointMaterial)
      lines.frustumCulled = points.frustumCulled = false
      scene.add(lines, points)
      bursts.push({ lines, points, geometry, lineMaterial, pointMaterial, fragments, started: performance.now(), duration: 0.4 })
    }
    const blastImpact = (position: Vector3) => {
      if (reducedMotion.matches) return
      const rings = ['#fff3ce', '#ff943d', '#ff5252'].map((color) => {
        const ring = new LineLoop(shockwaveGeometry, new LineBasicMaterial({
          color, transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false,
        }))
        ring.position.copy(position)
        ring.position.z += 0.2
        ring.scale.setScalar(0.06)
        ring.renderOrder = 4
        scene.add(ring)
        return ring
      })
      shockwaves.push({ rings, started: performance.now() })
      const random = createSeededRandom(++impactCount)
      const fragments: Burst['fragments'] = Array.from({ length: 32 }, (_, index) => {
        const angle = (index + random() * 0.5) / 32 * Math.PI * 2
        const outward = new Vector3(Math.cos(angle), Math.sin(angle), 0)
        return {
          center: outward.clone().multiplyScalar(0.1),
          halfEdge: outward.clone().multiplyScalar(0.08 + random() * 0.1),
          velocity: outward.clone().multiplyScalar(4 + random() * 4).add(new Vector3(0, 0, 0.8 + random())),
          axis: new Vector3(0, 0, 1), spin: (random() - 0.5) * 3,
        }
      })
      const geometry = new BufferGeometry().setFromPoints(fragments.flatMap((fragment) => [
        fragment.center.clone().add(fragment.halfEdge), fragment.center.clone().sub(fragment.halfEdge),
      ]))
      const lineMaterial = new LineBasicMaterial({ color: '#ff943d', transparent: true, blending: AdditiveBlending, depthWrite: false })
      const pointMaterial = new PointsMaterial({ color: '#fff3ce', size: 0.12, transparent: true, blending: AdditiveBlending, depthWrite: false })
      const lines = new LineSegments(geometry, lineMaterial)
      const points = new Points(geometry, pointMaterial)
      lines.position.copy(position)
      points.position.copy(position)
      lines.frustumCulled = points.frustumCulled = false
      scene.add(lines, points)
      bursts.push({ lines, points, geometry, lineMaterial, pointMaterial, fragments, started: performance.now(), duration: 0.75 })
    }
    const sparkImpact = (normal: Vector3, position = ball.position) => {
      if (reducedMotion.matches) return
      const random = createSeededRandom(++impactCount)
      const tangent = new Vector3(-normal.y, normal.x, 0)
      const fragments: Burst['fragments'] = Array.from({ length: 10 }, () => {
        const velocity = normal.clone().multiplyScalar(1.5 + random() * 2.2)
          .addScaledVector(tangent, (random() - 0.5) * 4)
        velocity.z = 0.5 + random() * 1.1
        return {
          center: new Vector3(),
          halfEdge: velocity.clone().normalize().multiplyScalar(0.06 + random() * 0.05),
          velocity,
          axis: new Vector3(0, 0, 1),
          spin: (random() - 0.5) * 2,
        }
      })
      const sparkGeometry = new BufferGeometry().setFromPoints(
        fragments.flatMap((fragment) => [fragment.halfEdge.clone(), fragment.halfEdge.clone().negate()]),
      )
      const lineMaterial = new LineBasicMaterial({ color: '#55ff91', transparent: true, depthWrite: false })
      const pointMaterial = new PointsMaterial({ color: '#bdffd3', size: 0.09, transparent: true, depthWrite: false })
      const lines = new LineSegments(sparkGeometry, lineMaterial)
      const points = new Points(sparkGeometry, pointMaterial)
      lines.position.copy(position).addScaledVector(normal, -ballRadius)
      points.position.copy(lines.position)
      lines.frustumCulled = points.frustumCulled = false
      scene.add(lines, points)
      bursts.push({ lines, points, geometry: sparkGeometry, lineMaterial, pointMaterial, fragments, started: performance.now(), duration: 0.45 })
    }
    const fragmentCenter = new Vector3()
    const fragmentHalfEdge = new Vector3()
    const updateBursts = () => {
      for (let index = shockwaves.length - 1; index >= 0; index--) {
        const wave = shockwaves[index]
        const age = (performance.now() - wave.started) / 1000
        if (age >= 0.65 || reducedMotion.matches) {
          disposeShockwave(wave)
          shockwaves.splice(index, 1)
          continue
        }
        wave.rings.forEach((ring, ringIndex) => {
          const progress = Math.max(0, Math.min(1, (age - ringIndex * 0.055) / 0.5))
          // The outer wave reaches the actual blast radius.
          ring.scale.setScalar(0.06 + (1.25 - ringIndex * 0.12 - 0.06) * (1 - (1 - progress) ** 3))
          ring.material.opacity = progress > 0 ? (1 - progress) ** 1.5 : 0
        })
      }
      for (let index = bursts.length - 1; index >= 0; index--) {
        const burst = bursts[index]
        const age = (performance.now() - burst.started) / 1000
        if (age >= burst.duration || reducedMotion.matches) {
          disposeBurst(burst)
          bursts.splice(index, 1)
          continue
        }
        const travel = (1 - Math.exp(-3 * age)) / 3
        const attribute = burst.geometry.getAttribute('position')
        burst.fragments.forEach((fragment, edge) => {
          fragmentCenter.copy(fragment.center).addScaledVector(fragment.velocity, travel)
          fragmentCenter.z -= age * age
          fragmentHalfEdge.copy(fragment.halfEdge).applyAxisAngle(fragment.axis, fragment.spin * age)
          attribute.setXYZ(edge * 2,
            fragmentCenter.x + fragmentHalfEdge.x,
            fragmentCenter.y + fragmentHalfEdge.y,
            fragmentCenter.z + fragmentHalfEdge.z,
          )
          attribute.setXYZ(edge * 2 + 1,
            fragmentCenter.x - fragmentHalfEdge.x,
            fragmentCenter.y - fragmentHalfEdge.y,
            fragmentCenter.z - fragmentHalfEdge.z,
          )
        })
        attribute.needsUpdate = true
        burst.lineMaterial.opacity = (1 - age / burst.duration) ** 2
        burst.pointMaterial.opacity = 1 - age / burst.duration
      }
    }
    const updatePreview = () => {
      const origin = ball.position.clone()
      const direction = aimDirection.clone()
      const spacing = 0.22
      const phase = reducedMotion.matches ? 0 : (performance.now() / 1000 * 0.55) % spacing
      let nextDot = ballRadius + 0.15 + phase
      let count = 0
      if (powerup === 'gravity' || powerup === 'blackhole') {
        let speed = BALL_SPEED
        let reflections = 0
        let topBounces = 0
        let finished = false
        // Use the same steering and swept collisions as live flight.
        for (let step = 0; step < 160 && !finished && count < maxDots; step++) {
          if (powerup === 'gravity') {
            direction.multiplyScalar(speed)
            direction.y += REVERSE_GRAVITY_ACCELERATION / 120
            speed = Math.min(direction.length(), REVERSE_GRAVITY_MAX_SPEED)
            direction.normalize()
          } else {
            steerTowardBricks(origin, direction, 1 / 120)
          }
          let travel = speed / 120
          for (let collision = 0; travel > 0.00001 && collision < 8; collision++) {
            const hit = trace(origin, direction)
            const distance = Math.min(travel, Math.max(0, hit.distance))
            for (; nextDot < distance && count < maxDots; nextDot += spacing) {
              dotMatrix.makeTranslation(origin.x + direction.x * nextDot, origin.y + direction.y * nextDot, 0)
              dots.setMatrixAt(count++, dotMatrix)
            }
            nextDot -= distance
            origin.addScaledVector(direction, distance)
            travel -= distance
            if (hit.distance > distance) break
            if (hit.bottom || (hit.topExit && topBounces >= 1) || reflections++ > 0) { finished = true; break }
            if (hit.topExit) topBounces++
            direction.reflect(hit.normal)
            origin.addScaledVector(direction, 0.001)
          }
        }
        dots.count = count
        dots.instanceMatrix.needsUpdate = true
        return
      }
      const angles = powerup === 'multi' ? [0, -MULTIBALL_SPREAD, MULTIBALL_SPREAD] : [0]
      for (const angle of angles) {
        origin.copy(ball.position)
        direction.copy(aimDirection).applyAxisAngle(new Vector3(0, 0, 1), angle)
        nextDot = ballRadius + 0.15 + phase
        const pathLimit = Math.min(count + 200, maxDots)
        // Two segments: the initial path and the path after its first reflection.
        for (let segment = 0; segment < 2; segment++) {
          const { distance, normal } = trace(origin, direction, powerup === 'laser')
          if (!Number.isFinite(distance) || distance < 0) break
          for (; nextDot < distance && count < pathLimit; nextDot += spacing) {
            dotMatrix.makeTranslation(
              origin.x + direction.x * nextDot,
              origin.y + direction.y * nextDot,
              0,
            )
            dots.setMatrixAt(count++, dotMatrix)
          }
          origin.addScaledVector(direction, distance)
          direction.reflect(normal)
          // Start just clear of the surface to avoid hitting the same face again.
          origin.addScaledVector(direction, 0.001)
          nextDot -= distance + 0.001
        }
      }
      dots.count = count
      dots.instanceMatrix.needsUpdate = true
    }
    const aimAt = (x: number, y: number) => {
      // Keep the launch direction upward, even if a captured drag moves below the ball.
      const minAngleFromHorizontal = 15 * Math.PI / 180
      const maxAngle = Math.PI / 2 - minAngleFromHorizontal
      const angle = Math.max(-maxAngle, Math.min(maxAngle,
        Math.atan2(x - ball.position.x, Math.max(0.1, y - ball.position.y)),
      ))
      aimDirection.set(Math.sin(angle), Math.cos(angle), 0)
    }

    let lastSave = 0
    const persist = (force = false) => {
      if (demoMode) return
      const now = performance.now()
      if (!force && now - lastSave < 150) return
      lastSave = now
      onProgress({
        phase: completed ? 'complete' : flying ? 'flying' : returnAt !== null ? 'returning' : 'ready',
        ballsRemaining: remainingLives,
        destroyedBricks: [...destroyed].map((index) => occupied[index].id),
        bestCombo: bestComboValue,
        shotHits,
        ball: { x: ball.position.x, y: ball.position.y },
        direction: { x: flightDirection.x, y: flightDirection.y },
        aim: { x: aimDirection.x, y: aimDirection.y },
      })
    }

    const render = () => {
      updateEntrance()
      updateDemoDrops()
      updateScan()
      updateBursts()
      updateTrail()
      if (!drawing) {
        beam.visible = beamTip.visible = false
        const activeBall = flightBalls.find((actor) => actor.active)
        if (flying && activeBall && !reducedMotion.matches) updateBeam(activeBall.mesh.position, 0.15, false)
      }
      ball.visible = !cleared && returnAt === null && (flying ? flightBalls[0].active : remainingLives > 0)
      flightBalls.slice(1).forEach((actor) => { actor.mesh.visible = !cleared && actor.active })
      const now = performance.now()
      flightBalls.forEach((actor) => {
        if (!actor.effect) return
        actor.effect.group.visible = actor.mesh.visible && !drawing
        actor.effect.group.position.copy(actor.mesh.position)
        actor.effect.update(now, flying ? actor.direction : aimDirection, actor.splitGeneration, reducedMotion.matches)
      })
      shields.forEach((shield, index) => {
        const bounces = flying || returnAt !== null
          ? powerup === 'gravity' ? flightBalls[0].topBounces : flightBalls[0].bottomBounces
          : 0
        shield.visible = !entering && !completed && index >= bounces
        const flash = reducedMotion.matches ? 0 : Math.max(0, 1 - (now - lastShieldHit) / 350)
        shield.material.color.set(flash > 0 ? '#d9ffe6' : ballColor)
        shield.material.opacity = reducedMotion.matches ? 0.8 : 0.65 + Math.sin(now / 200 + index) * 0.12 + flash * 0.2
      })
      ballMaterial.visible = !drawing
      ballTrace.visible = drawing
      dots.visible = !demoMode && !cleared && !entering && !flying && returnAt === null && remainingLives > 0
      if (dots.visible) updatePreview()
      leftArrow.visible = (entering || dots.visible) && ball.position.x > -FIELD_WIDTH / 2 + 0.9
      rightArrow.visible = (entering || dots.visible) && ball.position.x < FIELD_WIDTH / 2 - 0.9
      composer.render()
    }
    let lastTime = 0
    const spinAxis = new Vector3()
    const moveBall = (actor: FlightBall, distance: number) => {
      spinAxis.set(-actor.direction.y, actor.direction.x, 0)
      actor.mesh.rotateOnWorldAxis(spinAxis, distance / ballRadius * 0.35)
      actor.mesh.position.addScaledVector(actor.direction, distance)
      if (actor.mesh === ball) recordTrail()
    }
    const animate = (time: number) => {
      if (pausedRef.current) {
        lastTime = time
        animationFrame = requestAnimationFrame(animate)
        return
      }
      if (!flying) {
        const finishedExit = returnAt !== null && time >= returnAt
        if (finishedExit) {
          returnAt = null
          ball.position.y = ballStartY
          ball.quaternion.identity()
          setShieldCharges(shieldCapacity)
          setIsFlying(false)
          if (remainingLives === 0) {
            completed = true
            setRoundComplete(true)
          }
          persist(true)
        }
        if ((entering || finishedExit || !reducedMotion.matches || bursts.length > 0) && !document.hidden) render()
        if (remainingLives > 0 || bursts.length > 0 || returnAt !== null || !reducedMotion.matches) animationFrame = requestAnimationFrame(animate)
        return
      }
      const delta = Math.max(0, Math.min((time - lastTime) / 1000, 0.05))
      lastTime = time
      let collided = false
      const destroyBrick = (index: number) => {
        if (destroyed.has(index)) return
        if (!demoMode) {
          destroyed.add(index)
          setBricksRemaining(occupied.length - destroyed.size)
          showHitPopup(index)
        }
        brickLines[index].visible = false
        matrix.makeScale(0, 0, 0)
        brickFaces.setMatrixAt(index, matrix)
        brickFaces.instanceMatrix.needsUpdate = true
        explode(brickEdges, brickLines[index].position, powerup === 'blast' ? '#ff943d' : brickColor, powerup === 'blast' ? '#fff3ce' : brickHighlight, occupied[index].id + 1)
        if (demoMode) replaceDemoBrick(index)
      }
      // New split balls begin moving next frame; all balls share one shot and combo.
      for (const actor of [...flightBalls]) {
        if (!actor.active || cleared) continue
        const position = actor.mesh.position
        const direction = actor.direction
        let speed = demoMode ? 7 : BALL_SPEED
        if (powerup === 'blackhole') steerTowardBricks(position, direction, delta)
        if (powerup === 'gravity') {
          // Accelerate upward while retaining horizontal momentum.
          direction.multiplyScalar(actor.mesh.userData.speed ?? BALL_SPEED)
          direction.y += REVERSE_GRAVITY_ACCELERATION * delta
          speed = Math.min(direction.length(), REVERSE_GRAVITY_MAX_SPEED)
          direction.normalize()
          actor.mesh.userData.speed = speed
        }
        let remaining = delta * speed
        // Sweep each movement so fast shots cannot skip bricks.
        for (let collisions = 0; remaining > 0.00001 && collisions < 16; collisions++) {
          const hit = trace(position, direction)
          const distance = Math.max(0, hit.distance)
          if (distance > remaining) {
            moveBall(actor, remaining)
            break
          }
          moveBall(actor, distance)
          remaining -= distance
          collided = true
          shakeScreen()
          if ((hit.topExit && actor.topBounces >= 1) || (hit.bottom && !(powerup === 'shield' && actor.bottomBounces < SHIELD_BOUNCES))) {
            actor.active = false
            actor.mesh.visible = false
            explode(ballBurstGeometry, position, '#55ff91', '#bdffd3', maxLives - remainingLives)
            break
          }
          if (hit.topExit) {
            actor.topBounces++
            setShieldCharges(0)
            lastShieldHit = performance.now()
          }
          if (hit.bottom) {
            actor.bottomBounces++
            if (powerup === 'shield') {
              setShieldCharges(SHIELD_BOUNCES - actor.bottomBounces)
              lastShieldHit = performance.now()
            }
          }
          if (hit.brickIndex !== undefined) {
            destroyBrick(hit.brickIndex)
            if (powerup === 'blast') {
              const center = brickLines[hit.brickIndex].position
              blastImpact(center)
              brickLines.forEach((brick, index) => {
                if (!destroyed.has(index) && brick.position.distanceTo(center) <= 1.25) destroyBrick(index)
              })
            }
            if (powerup === 'chain') {
              const path = [brickLines[hit.brickIndex].position.clone()]
              // Bonus hits do not trigger another chain.
              for (let jump = 0; jump < 1; jump++) {
                const origin = path[path.length - 1]
                let target: number | undefined
                let nearest = LIGHTNING_RANGE * LIGHTNING_RANGE
                brickLines.forEach((brick, index) => {
                  if (destroyed.has(index)) return
                  const distance = brick.position.distanceToSquared(origin)
                  if (distance < nearest) { nearest = distance; target = index }
                })
                if (target === undefined) break
                path.push(brickLines[target].position.clone())
                destroyBrick(target)
              }
              if (path.length > 1) lightningImpact(path)
            }
          }
          if (!(powerup === 'blast' && hit.brickIndex !== undefined)) sparkImpact(hit.normal, position)
          if (!demoMode && destroyed.size === occupied.length) {
            cleared = true
            completed = true
            flying = false
            setIsFlying(false)
            setRoundComplete(true)
            break
          }
          if (!(powerup === 'laser' && hit.brickIndex !== undefined)) direction.reflect(hit.normal)
          if (powerup === 'split' && actor.splitGeneration < 2 && hit.brickIndex !== undefined) {
            actor.splitGeneration++
            const axis = new Vector3(0, 0, 1)
            const otherDirection = direction.clone().applyAxisAngle(axis, -0.18)
            direction.applyAxisAngle(axis, 0.18)
            // Both children must head away from the collision surface.
            if (direction.dot(hit.normal) <= 0) direction.reflect(hit.normal)
            if (otherDirection.dot(hit.normal) <= 0) otherDirection.reflect(hit.normal)
            addBall(position.clone().addScaledVector(otherDirection, 0.002), otherDirection, actor.splitGeneration)
          }
          position.addScaledVector(direction, 0.001)
          const sideLimit = FIELD_WIDTH / 2 - ballRadius - 0.001
          position.x = Math.max(-sideLimit, Math.min(sideLimit, position.x))
          position.y = Math.max(-fieldHeight / 2 + ballRadius + 0.001, Math.min(fieldHeight / 2 - ballRadius - 0.001, position.y))
        }
      }
      if (flying && !flightBalls.some((actor) => actor.active)) {
        flying = false
        returnAt = performance.now() + (reducedMotion.matches ? 0 : 700)
      }
      persist(collided)
      render()
      if (flying || remainingLives > 0 || bursts.length > 0 || returnAt !== null || !reducedMotion.matches) animationFrame = requestAnimationFrame(animate)
    }
    launchRef.current = () => {
      if (cleared || entering || flying || returnAt !== null || remainingLives === 0) return
      remainingLives--
      setLives(remainingLives)
      shotHits = 0
      setHitPopups([])
      flying = true
      setIsFlying(true)
      flightDirection.copy(aimDirection)
      flightBalls.slice(1).forEach((actor) => {
        scene.remove(actor.mesh)
        if (actor.effect) {
          scene.remove(actor.effect.group)
          actor.effect.dispose()
        }
      })
      flightBalls.length = 1
      Object.assign(flightBalls[0], { active: true, splitGeneration: 0, bottomBounces: 0, topBounces: 0 })
      setShieldCharges(shieldCapacity)
      ball.userData.speed = BALL_SPEED
      if (powerup === 'multi') {
        const axis = new Vector3(0, 0, 1)
        for (const angle of [-MULTIBALL_SPREAD, MULTIBALL_SPREAD]) {
          const direction = aimDirection.clone().applyAxisAngle(axis, angle)
          addBall(ball.position, direction)
        }
      }
      trailSamples.length = 0
      lastAfterimage = -Infinity
      recordTrail()
      canvas.style.cursor = 'default'
      lastTime = performance.now()
      persist(true)
      render()
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(animate)
    }
    let dragPointer: number | null = null
    let dragMode: 'move' | 'aim' = 'move'
    let dragOffset = 0
    const pointerRaycaster = new Raycaster()
    const playPlane = new Plane(new Vector3(0, 0, 1), 0)
    const pointerNdc = new Vector2()
    const pointerPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerNdc.set(
        (event.clientX - rect.left) / rect.width * 2 - 1,
        1 - (event.clientY - rect.top) / rect.height * 2,
      )
      const scenePointer = screenToScene(pointerNdc.x, pointerNdc.y)
      pointerRaycaster.setFromCamera(new Vector2(scenePointer.x, scenePointer.y), camera)
      const point = pointerRaycaster.ray.intersectPlane(playPlane, new Vector3())
      if (!point) return null
      const ballProjection = ball.position.clone().project(camera)
      const ballScreen = sceneToScreen(ballProjection.x, ballProjection.y)
      return {
        x: point.x,
        y: point.y,
        belowBall: pointerNdc.y <= ballScreen.y,
      }
    }

    const pointerDown = (event: PointerEvent) => {
      if (demoMode) return
      if (cleared || entering || flying || returnAt !== null || remainingLives === 0) return
      if (!event.isPrimary || event.button !== 0 || dragPointer !== null) return
      const point = pointerPosition(event)
      if (!point) return
      event.preventDefault()
      dragMode = point.belowBall ? 'move' : 'aim'
      if (dragMode === 'aim') {
        aimAt(point.x, point.y)
        render()
      }
      dragPointer = event.pointerId
      dragOffset = ball.position.x - point.x
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor = dragMode === 'move' ? 'grabbing' : 'crosshair'
    }
    const pointerMove = (event: PointerEvent) => {
      if (demoMode) return
      if (cleared || entering || flying || returnAt !== null || remainingLives === 0) return
      const point = pointerPosition(event)
      if (!point) return
      if (dragPointer === null) {
        canvas.style.cursor = point.belowBall ? 'grab' : 'crosshair'
        return
      }
      if (event.pointerId !== dragPointer) return
      event.preventDefault()
      if (dragMode === 'move') {
        const limit = FIELD_WIDTH / 2 - ballRadius
        ball.position.x = Math.max(-limit, Math.min(limit, point.x + dragOffset))
      } else {
        aimAt(point.x, point.y)
      }
      render()
    }
    const pointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragPointer) return
      dragPointer = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      canvas.style.cursor = 'default'
      persist(true)
    }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerEnd)
    canvas.addEventListener('pointercancel', pointerEnd)
    canvas.addEventListener('lostpointercapture', pointerEnd)
    const preventGameTouch = (event: TouchEvent) => {
      if (!demoMode && event.cancelable) event.preventDefault()
    }
    const preventEdgeNavigation = (event: TouchEvent) => {
      if (demoMode || !event.cancelable) return
      const touch = event.touches[0]
      if (!touch) return
      const rect = canvas.getBoundingClientRect()
      const nearEdge = touch.clientX < 24 || touch.clientX > window.innerWidth - 24
      if (nearEdge && touch.clientY >= rect.top && touch.clientY <= rect.bottom) event.preventDefault()
    }
    const preventCanvasMenu = (event: Event) => { event.preventDefault() }
    canvas.addEventListener('touchstart', preventGameTouch, { passive: false })
    canvas.addEventListener('touchmove', preventGameTouch, { passive: false })
    canvas.addEventListener('contextmenu', preventCanvasMenu)
    canvas.addEventListener('dragstart', preventCanvasMenu)
    window.addEventListener('touchstart', preventEdgeNavigation, { passive: false })
    const saveOnLeave = () => persist(true)
    const saveOnHide = () => { if (document.hidden) persist(true) }
    window.addEventListener('pagehide', saveOnLeave)
    document.addEventListener('visibilitychange', saveOnHide)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // Fit the table's corners after tilting, including its visible thickness.
      const inverseRotation = camera.quaternion.clone().invert()
      const tangent = Math.tan(camera.fov * Math.PI / 360) * 0.94
      let distance = 1
      for (const x of [-FIELD_WIDTH / 2, FIELD_WIDTH / 2]) {
        for (const y of [-fieldHeight / 2, fieldHeight / 2]) {
          for (const z of [-0.35, WALL_HEIGHT - ballRadius + 0.1]) {
            const corner = new Vector3(x, y, z).applyQuaternion(inverseRotation)
            distance = Math.max(distance,
              corner.z + Math.abs(corner.x) / (tangent * camera.aspect),
              corner.z + Math.abs(corner.y) / tangent,
            )
          }
        }
      }
      camera.position.copy(viewDirection).multiplyScalar(distance)
      camera.updateMatrixWorld(true)
      if (entering) {
        // Find the height above the viewport for each brick's row.
        const entryRay = new Raycaster()
        entryRay.setFromCamera(new Vector2(0, 1.25), camera)
        entrances.forEach((entrance, index) => {
          const rowPlane = new Plane(new Vector3(0, 1, 0), -brickLines[index].position.y)
          const aboveScreen = entryRay.ray.intersectPlane(rowPlane, new Vector3())
          if (aboveScreen) entrance.height = Math.max(1, aboveScreen.z + 0.5)
        })
      }
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    window.addEventListener('resize', resize)
    canvas.addEventListener('webglcontextrestored', render)
    resize()
    persist(true)
    lastTime = performance.now()
    if (demoMode && !reducedMotion.matches) {
      flying = true
      flightBalls[0].active = true
      flightDirection.set(0.6, 0.8, 0)
      setIsFlying(true)
      render()
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      persist(true)
      window.removeEventListener('pagehide', saveOnLeave)
      document.removeEventListener('visibilitychange', saveOnHide)
      launchRef.current = null
      popupTimers.forEach(clearTimeout)
      shake?.cancel()
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      bursts.forEach(disposeBurst)
      shockwaves.forEach(disposeShockwave)
      shockwaveGeometry.dispose()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextrestored', render)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerEnd)
      canvas.removeEventListener('pointercancel', pointerEnd)
      canvas.removeEventListener('lostpointercapture', pointerEnd)
      canvas.removeEventListener('touchstart', preventGameTouch)
      canvas.removeEventListener('touchmove', preventGameTouch)
      canvas.removeEventListener('contextmenu', preventCanvasMenu)
      canvas.removeEventListener('dragstart', preventCanvasMenu)
      window.removeEventListener('touchstart', preventEdgeNavigation)
      geometry.dispose()
      brickEdges.dispose()
      brickMaterial.dispose()
      brickFaces.dispose()
      brickFaceMaterial.dispose()
      tableGeometry.dispose()
      tableEdges.dispose()
      tableMaterial.dispose()
      collider.dispose()
      collisionGeometry.dispose()
      material.dispose()
      ballGeometry.dispose()
      ballEdges.dispose()
      ballTraceMaterial.dispose()
      beamGeometry.dispose()
      beamMaterial.dispose()
      scanGeometry.dispose()
      scanMaterial.dispose()
      beamTipGeometry.dispose()
      beamTipMaterial.dispose()
      afterimages.forEach((ghost) => ghost.material.dispose())
      ballBurstGeometry.dispose()
      ballMaterial.dispose()
      flightBalls.forEach((actor) => actor.effect?.dispose())
      shieldGeometry.dispose()
      shields.forEach((shield) => shield.material.dispose())
      arrowGeometry.dispose()
      arrowMaterial.dispose()
      dots.dispose()
      dotGeometry.dispose()
      dotMaterial.dispose()
      curvedPass.dispose()
      outputPass.dispose()
      renderPass.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [bricks, brickColor, initialProgress, onProgress, demoMode, powerup, ballRadius, maxLives, shieldCapacity])

  const score = calculateRoundScore({
    totalBricks: bricks.filter((brick) => brick.occupied).length,
    bricksRemaining,
    ballsRemaining: lives,
    bestCombo,
    targets: scoreTargets,
  })

  return (
    <>
      <div className="board" style={{ aspectRatio: demoMode ? '1.15' : `${FIELD_WIDTH} / ${fieldHeight}` }}>
        {(roundLabel || !demoMode) && <div className="board-hud">
          {roundLabel && <p className="round-number" role="status">{roundLabel}</p>}
          {!demoMode && <p className="round-best-combo" aria-label={`Best combo this round: ${bestCombo}`}>
            Best {bestCombo}x
          </p>}
        </div>}
        {(powerup === 'shield' || powerup === 'gravity') && !demoMode && !roundComplete && <p className="board-shield" aria-label={`${shieldCharges} ${powerup === 'gravity' ? 'top' : 'bottom'} bounces remaining`}>
          {powerup === 'gravity' ? 'Top shield' : 'Shield'} {shieldCharges} / {shieldCapacity}
        </p>}
        <div className="board-surface" ref={containerRef} />
        {hitPopups.map((popup) => (
          <span className="hit-popup" key={popup.id} style={{
            left: `${popup.x}%`, top: `${popup.y}%`,
            WebkitTextStrokeColor: brickColor,
            filter: `drop-shadow(0 0 2px ${brickColor}55)`,
          }} aria-hidden="true">
            {popup.count}x
          </span>
        ))}
        {unavailable && <p className="board-error" role="alert">WebGL unavailable.</p>}
        {children}
        <RoundSummary
          open={summaryOpen}
          ballsRemaining={lives}
          totalBalls={maxLives}
          bricksRemaining={bricksRemaining}
          brickColor={brickColor}
          bestCombo={bestCombo}
          score={score}
          hasNextRound={hasNextRound}
          onNextRound={() => onNextRound({ ...score, ballsRemaining: lives, bricksRemaining, bestCombo })}
          onClose={() => setSummaryOpen(false)}
        />
      </div>
      {!demoMode && <>
      <div className="lives" role="status" aria-live="polite" aria-atomic="true">
        <span>Balls remaining <span className="sr-only">{lives} of {maxLives}</span></span>
        <span className="life-balls" aria-hidden="true">
          {Array.from({ length: maxLives }, (_, index) => (
            <BallIndicator key={index} available={index < lives} />
          ))}
        </span>
      </div>
      <button
        className="launch-button"
        type="button"
        disabled={summaryOpen || isEntering || isFlying || unavailable || (lives === 0 && !roundComplete)}
        onClick={() => roundComplete ? setSummaryOpen(true) : launchRef.current?.()}
      >
        {roundComplete ? 'Round results' : 'Launch'}
      </button>
      </>}
    </>
  )
}
