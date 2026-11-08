// Keep input and popup positions aligned with the curved display shader.
const CURVATURE = 0.085
const OVERSCAN = 0.94

export function screenToScene(x: number, y: number) {
  const scale = OVERSCAN * (1 + CURVATURE * (x * x + y * y))
  return { x: x * scale, y: y * scale }
}

export function sceneToScreen(x: number, y: number) {
  const radius = Math.hypot(x, y)
  if (radius === 0) return { x: 0, y: 0 }
  const target = radius / OVERSCAN
  let curvedRadius = target
  for (let step = 0; step < 5; step++) {
    curvedRadius -= (curvedRadius + CURVATURE * curvedRadius ** 3 - target)
      / (1 + 3 * CURVATURE * curvedRadius ** 2)
  }
  return { x: x * curvedRadius / radius, y: y * curvedRadius / radius }
}

export const curvedScreenShader = {
  uniforms: {
    tDiffuse: { value: null },
    curvature: { value: CURVATURE },
    overscan: { value: OVERSCAN },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float curvature;
    uniform float overscan;
    varying vec2 vUv;
    void main() {
      vec2 screen = vUv * 2.0 - 1.0;
      vec2 curved = screen * (1.0 + curvature * dot(screen, screen)) * overscan;
      vec2 sampleUv = curved * 0.5 + 0.5;
      if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThan(sampleUv, vec2(1.0)))) {
        gl_FragColor = vec4(0.0);
        return;
      }
      vec4 phosphor = texture2D(tDiffuse, sampleUv);
      float edgeShade = 1.0 - 0.16 * smoothstep(0.4, 1.4, dot(screen, screen));
      gl_FragColor = vec4(phosphor.rgb * edgeShade, phosphor.a);
    }
  `,
}
