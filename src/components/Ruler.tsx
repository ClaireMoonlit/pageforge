import { useRef, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditorStore } from '@/store/editorStore'

interface RulerProps {
  orientation: 'horizontal' | 'vertical'
  /** 画布在页面中的 DOM 引用（用于计算偏移） */
  canvasRef: React.RefObject<HTMLDivElement | null>
}

const RULER_SIZE = 24

/**
 * 根据缩放比例选择合适的刻度间隔
 * 确保在屏幕上至少相隔 20px
 */
function getTickInterval(zoom: number): { major: number; minor: number } {
  if (zoom >= 2) return { major: 50, minor: 10 }
  if (zoom >= 1.5) return { major: 50, minor: 25 }
  if (zoom >= 0.8) return { major: 100, minor: 20 }
  if (zoom >= 0.4) return { major: 200, minor: 50 }
  return { major: 500, minor: 100 }
}

export function Ruler({ orientation, canvasRef }: RulerProps) {
  const zoom = useEditorStore((s) => s.zoom)
  const canvas = useEditorStore((s) => s.canvas)
  const [cursorPos, setCursorPos] = useState(-1)
  const rulerRef = useRef<HTMLDivElement>(null)

  const cw = parseInt(canvas.width) || 1200
  const ch = parseInt(canvas.height) || 800

  // 跟踪鼠标在画布上的位置，在标尺上显示指示线
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onMove = (e: globalThis.PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const pos = orientation === 'horizontal'
        ? (e.clientX - rect.left) / zoom
        : (e.clientY - rect.top) / zoom
      setCursorPos(pos)
    }
    const onLeave = () => setCursorPos(-1)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [canvasRef, zoom, orientation])

  const { major, minor } = getTickInterval(zoom)
  const length = orientation === 'horizontal' ? cw : ch
  const numTicks = Math.ceil(length / minor) + 1

  const onPointerDown = (e: ReactPointerEvent) => {
    // 从标尺拖出辅助线的功能可以后续实现
    e.preventDefault()
  }

  return (
    <div
      ref={rulerRef}
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        backgroundColor: '#1e1e2e',
        zIndex: 51,
        ...(orientation === 'horizontal'
          ? {
              top: 0,
              left: RULER_SIZE,
              right: 0,
              height: RULER_SIZE,
              borderBottom: '1px solid #374151',
            }
          : {
              left: 0,
              top: RULER_SIZE,
              bottom: 0,
              width: RULER_SIZE,
              borderRight: '1px solid #374151',
            }),
      }}
    >
      <svg
        width={orientation === 'horizontal' ? '100%' : RULER_SIZE}
        height={orientation === 'horizontal' ? RULER_SIZE : '100%'}
        style={{ display: 'block' }}
      >
        {Array.from({ length: numTicks }, (_, i) => {
          const pos = i * minor * zoom
          const val = i * minor
          const isMajor = val % major === 0
          const tickH = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.3

          if (orientation === 'horizontal') {
            return (
              <g key={i}>
                <line
                  x1={pos}
                  y1={RULER_SIZE}
                  x2={pos}
                  y2={RULER_SIZE - tickH}
                  stroke={isMajor ? '#9ca3af' : '#4b5563'}
                  strokeWidth={1}
                />
                {isMajor && (
                  <text
                    x={pos + 3}
                    y={RULER_SIZE - tickH - 1}
                    fill="#9ca3af"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                )}
              </g>
            )
          } else {
            return (
              <g key={i}>
                <line
                  x1={RULER_SIZE}
                  y1={pos}
                  x2={RULER_SIZE - tickH}
                  y2={pos}
                  stroke={isMajor ? '#9ca3af' : '#4b5563'}
                  strokeWidth={1}
                />
                {isMajor && (
                  <text
                    x={4}
                    y={pos + 10}
                    fill="#9ca3af"
                    fontSize={9}
                    fontFamily="monospace"
                    transform={`rotate(-90, 4, ${pos + 10})`}
                  >
                    {val}
                  </text>
                )}
              </g>
            )
          }
        })}

        {/* 光标位置指示线 */}
        {cursorPos >= 0 && cursorPos <= length && (
          orientation === 'horizontal' ? (
            <line
              x1={cursorPos * zoom}
              y1={0}
              x2={cursorPos * zoom}
              y2={RULER_SIZE}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ) : (
            <line
              x1={0}
              y1={cursorPos * zoom}
              x2={RULER_SIZE}
              y2={cursorPos * zoom}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          )
        )}
      </svg>
    </div>
  )
}