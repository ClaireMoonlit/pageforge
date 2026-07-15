import { useRef, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditorStore } from '@/store/editorStore'

interface RulerProps {
  /** 标尺朝向：horizontal 水平方向（左右轴），vertical 垂直方向（上下轴） */
  orientation: 'horizontal' | 'vertical'
  /** 标尺贴边位置 */
  edge: 'top' | 'bottom' | 'left' | 'right'
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

export function Ruler({ orientation, edge, canvasRef }: RulerProps) {
  const zoom = useEditorStore((s) => s.zoom)
  const canvas = useEditorStore((s) => s.canvas)
  /** 精修模式会话：非 null 时标尺用导入页面的实测尺寸，而非 store 中的画布尺寸 */
  const refineSession = useEditorStore((s) => s.refineSession)
  const rulerCursorVisible = useEditorStore((s) => s.rulerCursorVisible)
  const [cursorPos, setCursorPos] = useState(-1)
  const rulerRef = useRef<HTMLDivElement>(null)

  // 精修模式下，标尺长度跟随导入页面的实测尺寸，否则用 store 中的画布尺寸。
  // 这样页面跑到画布外面时，标尺也会跟着包住整个页面。
  const cw = (refineSession ? refineSession.width : parseInt(canvas.width)) || 1200
  const ch = (refineSession ? refineSession.height : parseInt(canvas.height)) || 800

  /** 精修模式下的有效十字线状态：两种模式都支持十字线 */
  const effectiveCursorVisible = rulerCursorVisible

  // 跟踪鼠标在画布上的位置，在标尺上显示指示线
  // 使用 window 监听 pointermove 而非 canvas 元素，因为精修模式下 iframe 会捕获 pointer 事件，
  // 导致 canvas wrapper 的 pointermove 不触发 → 十字线不显示。
  // 不再使用 pointerleave（iframe 内部鼠标移动会误触发 → 十字线卡住），
  // 改为在 pointermove 中判断鼠标是否在画布范围内。
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onMove = (e: globalThis.PointerEvent) => {
      const rect = el.getBoundingClientRect()
      // 判断鼠标是否在画布范围内（含 24px 标尺边距）
      const inBounds =
        e.clientX >= rect.left - 24 &&
        e.clientX <= rect.right + 24 &&
        e.clientY >= rect.top - 24 &&
        e.clientY <= rect.bottom + 24
      if (!inBounds) {
        setCursorPos(-1)
        return
      }
      const pos = orientation === 'horizontal'
        ? (e.clientX - rect.left) / zoom
        : (e.clientY - rect.top) / zoom
      setCursorPos(pos)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
    }
  }, [canvasRef, zoom, orientation])

  const { major, minor } = getTickInterval(zoom)
  const length = orientation === 'horizontal' ? cw : ch
  const numTicks = Math.ceil(length / minor) + 1

  const onPointerDown = (e: ReactPointerEvent) => {
    // 从标尺拖出辅助线的功能可以后续实现
    e.preventDefault()
  }

  // 计算容器定位样式（绝对定位贴到画布 wrapper 的指定边）
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: '#1e1e2e',
    zIndex: 51,
    overflow: 'visible',
  }
  if (orientation === 'horizontal') {
    // 水平标尺宽度 = 画布视觉宽度（cw * zoom）。
    // 定位：上标尺 top=0，下标尺 bottom=0。
    // wrapper 现在是视觉尺寸（cw*zoom+48 × ch*zoom+48），
    // 不再有 transform 导致的 layout/visual 分离问题，bottom:0 直接贴在 wrapper 底部。
    Object.assign(containerStyle, {
      left: RULER_SIZE,
      width: cw * zoom,
      height: RULER_SIZE,
      top: edge === 'top' ? 0 : undefined,
      bottom: edge === 'bottom' ? 0 : undefined,
      [edge === 'top' ? 'borderBottom' : 'borderTop']: '1px solid #374151',
    } as React.CSSProperties)
  } else {
    // 垂直标尺高度 = 画布视觉高度（ch * zoom）。
    // 定位：左标尺 left=0，右标尺 right=0。
    Object.assign(containerStyle, {
      top: RULER_SIZE,
      height: ch * zoom,
      width: RULER_SIZE,
      left: edge === 'left' ? 0 : undefined,
      right: edge === 'right' ? 0 : undefined,
      [edge === 'left' ? 'borderRight' : 'borderLeft']: '1px solid #374151',
    } as React.CSSProperties)
  }

  // 底部/右侧标尺：刻度镜像绘制，让 0 标尺在远端（与画布坐标方向一致）
  // - 底部水平：0 在右，值向左递增（视觉上像在画布下方从右往左读）
  // - 右侧垂直：0 在下，值向上递增
  // 这里采用简单方案：底部/右侧仍从 0 开始递增绘制，只调整 tick 刻度起点位置
  const isMirror = edge === 'bottom' || edge === 'right'

  // SVG 尺寸（容器是 100% / RULER_SIZE）
  const svgWidth = orientation === 'horizontal' ? '100%' : RULER_SIZE
  const svgHeight = orientation === 'horizontal' ? RULER_SIZE : '100%'

  return (
    <div
      ref={rulerRef}
      onPointerDown={onPointerDown}
      style={containerStyle}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {Array.from({ length: numTicks }, (_, i) => {
          const pos = i * minor * zoom
          const val = i * minor
          const isMajor = val % major === 0
          const tickH = isMajor ? RULER_SIZE * 0.55 : RULER_SIZE * 0.3

          if (orientation === 'horizontal') {
            // 水平标尺：刻度线从顶/底边向内延伸
            const lineY1 = edge === 'top' ? RULER_SIZE : 0
            const lineY2 = edge === 'top' ? RULER_SIZE - tickH : tickH
            return (
              <g key={i}>
                <line
                  x1={pos}
                  y1={lineY1}
                  x2={pos}
                  y2={lineY2}
                  stroke={isMajor ? '#9ca3af' : '#4b5563'}
                  strokeWidth={1}
                />
                {isMajor && (
                  <text
                    // 底部标尺：标签贴下沿（值 0 在右，镜像时整体往左靠一点）
                    x={edge === 'top' ? pos + 3 : pos + 3}
                    y={edge === 'top' ? RULER_SIZE - tickH - 1 : tickH + 9}
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
            // 垂直标尺：刻度线从顶/底边向内延伸
            const lineX1 = edge === 'left' ? RULER_SIZE : 0
            const lineX2 = edge === 'left' ? RULER_SIZE - tickH : tickH
            return (
              <g key={i}>
                <line
                  x1={lineX1}
                  y1={pos}
                  x2={lineX2}
                  y2={pos}
                  stroke={isMajor ? '#9ca3af' : '#4b5563'}
                  strokeWidth={1}
                />
                {isMajor && (
                  <text
                    x={edge === 'left' ? RULER_SIZE / 2 - 11 : RULER_SIZE / 2 + 3}
                    y={pos + 12}
                    fill="#9ca3af"
                    fontSize={9}
                    fontFamily="monospace"
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    transform={`rotate(-90, ${edge === 'left' ? RULER_SIZE / 2 - 11 : RULER_SIZE / 2 + 3}, ${pos + 12})`}
                  >
                    {val}
                  </text>
                )}
              </g>
            )
          }
        })}

        {/* 光标位置指示线：标尺端用实色虚线（保持原样） */}
        {effectiveCursorVisible && cursorPos >= 0 && cursorPos <= length && (
          orientation === 'horizontal' ? (
            <line
              x1={cursorPos * zoom}
              y1={edge === 'top' ? 0 : RULER_SIZE - 0}
              x2={cursorPos * zoom}
              y2={edge === 'top' ? RULER_SIZE : 0}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ) : (
            <line
              x1={edge === 'left' ? 0 : RULER_SIZE - 0}
              y1={cursorPos * zoom}
              x2={edge === 'left' ? RULER_SIZE : 0}
              y2={cursorPos * zoom}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          )
        )}
      </svg>

      {/* 画布端延伸：从标尺边沿（RULER_SIZE=24px）开始，向画布内延伸。
          使用 border 虚线实现，与标尺内 SVG 虚线风格一致，接头在标尺边沿不留痕迹。 */}
      {effectiveCursorVisible && cursorPos >= 0 && cursorPos <= length && (
        <div
          style={
            orientation === 'horizontal'
              ? {
                  position: 'absolute',
                  // 从标尺边沿起步（24px 处），避免与 SVG 线重叠产生接头
                  top: edge === 'top' ? RULER_SIZE : undefined,
                  bottom: edge === 'bottom' ? RULER_SIZE : undefined,
                  left: cursorPos * zoom,
                  width: 0,
                  height: ch * zoom,
                  borderLeft: '1px dashed #6366f1',
                  opacity: 0.10,
                  pointerEvents: 'none',
                }
              : {
                  position: 'absolute',
                  // 从标尺边沿起步（24px 处）
                  left: edge === 'left' ? RULER_SIZE : undefined,
                  right: edge === 'right' ? RULER_SIZE : undefined,
                  top: cursorPos * zoom,
                  height: 0,
                  width: cw * zoom,
                  borderTop: '1px dashed #6366f1',
                  opacity: 0.10,
                  pointerEvents: 'none',
                }
          }
        />
      )}
    </div>
  )
}
