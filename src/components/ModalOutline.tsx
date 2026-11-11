import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export function ModalOutline() {
  const outlineRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 300, height: 240 })

  useLayoutEffect(() => {
    const panel = outlineRef.current?.parentElement
    if (!panel) return
    const measure = () => {
      const { width, height } = panel.getBoundingClientRect()
      if (!width || !height) return
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  const right = size.width - 0.5
  const bottom = size.height - 0.5
  const perimeter = 2 * (size.width + size.height - 2)
  const firstCorner = (size.width - 1) / perimeter

  return (
    <svg ref={outlineRef} className="summary-outline" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
      <g key={`${size.width}-${size.height}`}>
        <path className="summary-border" d={`M 0.5 0.5 H ${right} V ${bottom} H 0.5 Z`}
          style={{ strokeDasharray: `${perimeter} ${perimeter}`, '--outline-length': perimeter } as CSSProperties} />
        <line className="summary-beam" x1="-120" y1={size.height / 2} x2="0.5" y2="0.5">
          <animate attributeName="x2" values={`0.5;${right};${right};0.5;0.5`} keyTimes={`0;${firstCorner};0.5;${0.5 + firstCorner};1`} dur="0.7s" fill="freeze" />
          <animate attributeName="y2" values={`0.5;0.5;${bottom};${bottom};0.5`} keyTimes={`0;${firstCorner};0.5;${0.5 + firstCorner};1`} dur="0.7s" fill="freeze" />
        </line>
      </g>
    </svg>
  )
}
