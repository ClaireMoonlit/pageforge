import { useEffect, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'

interface AlignInfoOverlayProps {
  cw: number
  ch: number
}

/**
 * 在对齐/分布操作完成后，临时在画布上以"设计稿标注"风格高亮显示间距值。
 * - 蓝色虚线外框标出整个分布区间
 * - 两端带箭头的尺寸线（中间断开）放在测量对象的中心轴上
 * - 数值标签在尺寸线中部，白底蓝字
 * - 3 秒后开始淡出，5 秒后自动清除
 */
export function AlignInfoOverlay({ cw, ch }: AlignInfoOverlayProps) {
  const lastAlignInfo = useEditorStore((s) => s.lastAlignInfo)
  const clearAlignInfo = useEditorStore((s) => s.clearAlignInfo)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    if (!lastAlignInfo) {
      setOpacity(1)
      return
    }
    const fade = setTimeout(() => setOpacity(0.25), 3000)
    const clear = setTimeout(() => clearAlignInfo(), 5000)
    return () => {
      clearTimeout(fade)
      clearTimeout(clear)
    }
  }, [lastAlignInfo, clearAlignInfo])

  if (!lastAlignInfo) return null

  const { type, direction, gap, bounds } = lastAlignInfo
  if (gap < 0) return null

  const COLOR = '#3b82f6' // 蓝色：Figma 风格的标注色

  // 横向分布：在水平方向测量
  if (direction === 'h') {
    // 尺寸线定位在元素上下方都行的位置（避免覆盖元素，也避免被画布视口裁切）
    // 默认放在元素上方 16px 处；若上方空间不够则放到下方 16px
    const aboveY = bounds.crossStart - 16
    const belowY = bounds.crossEnd + 16
    const measureY = aboveY >= 20 ? aboveY : belowY
    const fromX = bounds.from
    const toX = bounds.to
    const centerX = (fromX + toX) / 2

    return (
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 49,
          overflow: 'visible',
          opacity,
          transition: 'opacity 1s ease-out',
        }}
      >
        <defs>
          <marker
            id="arrow-end"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={COLOR} />
          </marker>
          <marker
            id="arrow-start"
            viewBox="0 0 10 10"
            refX="2"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M10,0 L0,5 L10,10 z" fill={COLOR} />
          </marker>
          <filter id="align-info-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* 虚线外框：标出整个分布区间的范围（仿 Figma 选中框） */}
        <rect
          x={fromX}
          y={Math.max(0, bounds.crossStart - 4)}
          width={toX - fromX}
          height={Math.min(ch, bounds.crossEnd + 4) - Math.max(0, bounds.crossStart - 4)}
          fill="none"
          stroke={COLOR}
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.45}
        />

        {/* 从外框左右两侧向尺寸线延伸的虚线（连到尺寸线） */}
        <line
          x1={fromX}
          y1={measureY < bounds.crossStart ? bounds.crossStart : measureY + (measureY > bounds.crossEnd ? 0 : 6)}
          x2={fromX}
          y2={measureY + (measureY < bounds.crossStart ? -6 : 6)}
          stroke={COLOR}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.6}
        />
        <line
          x1={toX}
          y1={measureY < bounds.crossStart ? bounds.crossStart : measureY + (measureY > bounds.crossEnd ? 0 : 6)}
          x2={toX}
          y2={measureY + (measureY < bounds.crossStart ? -6 : 6)}
          stroke={COLOR}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.6}
        />

        {/* 尺寸线（水平方向）：从 fromX 到 toX，两端带箭头 */}
        <line
          x1={fromX}
          y1={measureY}
          x2={toX}
          y2={measureY}
          stroke={COLOR}
          strokeWidth={1.5}
          markerStart="url(#arrow-start)"
          markerEnd="url(#arrow-end)"
        />

        {/* 数值标签：白底蓝字，放在尺寸线中部 */}
        <g transform={`translate(${centerX}, ${measureY})`}>
          <rect
            x={-32}
            y={-11}
            width={64}
            height={22}
            rx={3}
            fill="#ffffff"
            stroke={COLOR}
            strokeWidth={1.5}
            filter="url(#align-info-shadow)"
          />
          <text
            fill={COLOR}
            fontSize={12}
            fontFamily="monospace"
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {gap}px
          </text>
        </g>

        {/* 类型标签：紧贴尺寸线（上方/下方） */}
        <g transform={`translate(${centerX}, ${measureY + (measureY < bounds.crossStart ? -22 : 22)})`}>
          <rect
            x={-44}
            y={-10}
            width={88}
            height={20}
            rx={10}
            fill={COLOR}
            filter="url(#align-info-shadow)"
          />
          <text
            fill="#ffffff"
            fontSize={11}
            fontFamily="-apple-system, sans-serif"
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {type === 'distribute' ? '等距分布' : '已对齐'}
          </text>
        </g>
      </svg>
    )
  }

  // 纵向分布：尺寸线放在元素左/右侧（默认左侧；左侧空间不够则放右侧）
  const leftMeasure = bounds.crossStart - 16
  const rightMeasure = bounds.crossEnd + 16
  const measureX = leftMeasure >= 20 ? leftMeasure : rightMeasure
  const fromY = bounds.from
  const toY = bounds.to
  const centerY = (fromY + toY) / 2

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 49,
        overflow: 'visible',
        opacity,
        transition: 'opacity 1s ease-out',
      }}
    >
      <defs>
        <marker
          id="arrow-end-v"
          viewBox="0 0 10 10"
          refX="5"
          refY="8"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0 L5,10 L10,0 z" fill={COLOR} />
        </marker>
        <marker
          id="arrow-start-v"
          viewBox="0 0 10 10"
          refX="5"
          refY="2"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,10 L5,0 L10,10 z" fill={COLOR} />
        </marker>
        <filter id="align-info-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* 虚线外框：标出整个分布区间的范围 */}
      <rect
        x={Math.max(0, bounds.crossStart - 4)}
        y={fromY}
        width={Math.min(cw, bounds.crossEnd + 4) - Math.max(0, bounds.crossStart - 4)}
        height={toY - fromY}
        fill="none"
        stroke={COLOR}
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.45}
      />

      {/* 从外框上下两端向尺寸线延伸的虚线（连到尺寸线） */}
      <line
        x1={measureX < bounds.crossStart ? bounds.crossStart : measureX + (measureX > bounds.crossEnd ? 0 : 6)}
        y1={fromY}
        x2={measureX + (measureX < bounds.crossStart ? -6 : 6)}
        y2={fromY}
        stroke={COLOR}
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.6}
      />
      <line
        x1={measureX < bounds.crossStart ? bounds.crossStart : measureX + (measureX > bounds.crossEnd ? 0 : 6)}
        y1={toY}
        x2={measureX + (measureX < bounds.crossStart ? -6 : 6)}
        y2={toY}
        stroke={COLOR}
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.6}
      />

      {/* 尺寸线（垂直方向）：从 fromY 到 toY，两端带箭头 */}
      <line
        x1={measureX}
        y1={fromY}
        x2={measureX}
        y2={toY}
        stroke={COLOR}
        strokeWidth={1.5}
        markerStart="url(#arrow-start-v)"
        markerEnd="url(#arrow-end-v)"
      />

      {/* 数值标签：白底蓝字，放在尺寸线中部 */}
      <g transform={`translate(${measureX}, ${centerY})`}>
        <rect
          x={-32}
          y={-11}
          width={64}
          height={22}
          rx={3}
          fill="#ffffff"
          stroke={COLOR}
          strokeWidth={1.5}
          filter="url(#align-info-shadow)"
        />
        <text
          fill={COLOR}
          fontSize={12}
          fontFamily="monospace"
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {gap}px
        </text>
      </g>

      {/* 类型标签：紧贴尺寸线（左侧/右侧） */}
      <g transform={`translate(${measureX + (measureX < bounds.crossStart ? -50 : 50)}, ${centerY})`}>
        <rect
          x={-40}
          y={-10}
          width={80}
          height={20}
          rx={10}
          fill={COLOR}
          filter="url(#align-info-shadow)"
        />
        <text
          fill="#ffffff"
          fontSize={11}
          fontFamily="-apple-system, sans-serif"
          fontWeight={600}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {type === 'distribute' ? '等距分布' : '已对齐'}
        </text>
      </g>
    </svg>
  )
}