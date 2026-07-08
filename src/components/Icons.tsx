/**
 * 统一 SVG 图标库
 * 所有图标均使用 stroke-only（无填色）风格，stroke="currentColor" 让父级控制颜色
 * 每个 Icon 函数都接受可选 { size?: number } 参数，默认 24px
 */
import type { ReactElement } from 'react'

/** 图标 Props：所有 Icon 函数都接受 */
export type IconProps = { size?: number }

/** 渲染单 path SVG 的辅助函数（统一 stroke 风格） */
function path(
  d: string | string[],
  size: number = 24,
  viewBox: string = '0 0 24 24',
  opts: { fill?: string; strokeWidth?: number; strokeLinecap?: 'round' | 'butt' | 'square' } = {},
): ReactElement {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={opts.fill ?? 'none'}
      stroke="currentColor"
      strokeWidth={opts.strokeWidth ?? 2}
      strokeLinecap={opts.strokeLinecap ?? 'round'}
      strokeLinejoin="round"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  )
}

/** 多 path SVG（如眼睛 = 椭圆 + 圆） */
function paths(
  dList: { d: string; fill?: string }[],
  size: number = 24,
  viewBox: string = '0 0 24 24',
  strokeWidth: number = 2,
): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dList.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ?? 'none'} />
      ))}
    </svg>
  )
}

// ============== 组件库类型图标（13 个） ==============
export const IconHeading = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M4 4h7v16H4z' },
    { d: 'M13 4h7v16h-7z' },
  ], size)

export const IconText = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M4 6h16M4 12h16M4 18h10', size)

export const IconImage = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { d: 'M3 16l4-4 4 4 6-6 4 4' },
    { d: 'M9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' },
  ], size)

export const IconButton = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  ], size)

export const IconCard = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { d: 'M3 9h18' },
  ], size)

export const IconContainer = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M3 5h18v14H3z', size, undefined, { fill: 'none' })

export const IconDivider = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M3 12h18', size)

export const IconIcon = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z', size)

export const IconVideo = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M5 4l14 8-14 8z', size, undefined, { fill: 'none' })

export const IconInput = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 8h18' },
    { d: 'M7 4v16' },
    { d: 'M17 4v16' },
  ], size)

export const IconNavbar = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M3 6h18M3 12h18M3 18h12', size)

export const IconGrid = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 3h7v7H3z' },
    { d: 'M14 3h7v7h-7z' },
    { d: 'M3 14h7v7H3z' },
    { d: 'M14 14h7v7h-7z' },
  ], size)

export const IconForm = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { d: 'M7 8h10' },
    { d: 'M7 12h10' },
    { d: 'M7 16h6' },
  ], size)

export const IconIframe = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { d: 'M9 9l-2 3 2 3' },
    { d: 'M15 9l2 3-2 3' },
  ], size)

// ============== Toolbar 按钮图标 ==============
export const IconUndo = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M9 14L4 9l5-5' },
    { d: 'M4 9h10a6 6 0 0 1 0 12h-3' },
  ], size)

export const IconRedo = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M15 14l5-5-5-5' },
    { d: 'M20 9H10a6 6 0 0 0 0 12h3' },
  ], size)

export const IconTrash = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 6h18' },
    { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
    { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' },
    { d: 'M10 11v6' },
    { d: 'M14 11v6' },
  ], size)

export const IconBrush = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M18 3l3 3-9 9-3-3 9-9z' },
    { d: 'M14 7l-9 9v3h3l9-9' },
    { d: 'M3 21h6' },
  ], size)

export const IconCopy = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M9 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z' },
    { d: 'M5 9V5a2 2 0 0 1 2-2h8' },
  ], size)

export const IconPaste = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M9 3h6a2 2 0 0 1 2 2v0H7v0a2 2 0 0 1 2-2z' },
    { d: 'M7 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2' },
  ], size)

export const IconDuplicate = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M5 3h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' },
    { d: 'M9 7h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9' },
  ], size)

export const IconDownload = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M12 3v12' },
    { d: 'M7 10l5 5 5-5' },
    { d: 'M5 21h14' },
  ], size)

// ============== LayerTree 按钮图标 ==============
export const IconChevronRight = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M9 6l6 6-6 6', size)

export const IconChevronDown = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M6 9l6 6 6-6', size)

export const IconChevronUp = ({ size = 24 }: IconProps = {}): ReactElement =>
  path('M6 15l6-6 6 6', size)

export const IconEye = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z' },
    { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' },
  ], size)

export const IconEyeOff = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M3 3l18 18' },
    { d: 'M10.6 6.1A10 10 0 0 1 22 12c-.4.7-1 1.6-1.7 2.5' },
    { d: 'M6.1 6.1A10 10 0 0 0 2 12s4 7 10 7c1.6 0 3-.4 4.3-1' },
    { d: 'M9.5 9.5A3 3 0 0 0 12 15a3 3 0 0 0 2.5-1.4' },
  ], size)

export const IconX = ({ size = 24 }: IconProps = {}): ReactElement =>
  paths([
    { d: 'M6 6l12 12' },
    { d: 'M18 6L6 18' },
  ], size)

// ============== Icon 组件的 SVG 备选（48 个常用图标） ==============
const starPath = 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z'
const starFillPath = { d: starPath, fill: 'currentColor' }
const heartPath = 'M12 21s-7-4.5-9.5-9C.8 8.4 2.5 4 6.5 4c2 0 3.5 1 4.5 2.5 1-1.5 2.5-2.5 4.5-2.5 4 0 5.7 4.4 4 8-2.5 4.5-9.5 9-9.5 9z'
const checkPath = 'M5 12l5 5 9-11'
const plusPath = 'M12 5v14'
const minusPath = 'M5 12h14'

export const SVG_ICON_PRESETS: { name: string; svg: (props?: IconProps) => ReactElement }[] = [
  { name: 'star', svg: ({ size } = {}) => path(starPath, size) },
  { name: 'star-fill', svg: ({ size } = {}) => paths([starFillPath], size) },
  { name: 'heart', svg: ({ size } = {}) => path(heartPath, size) },
  { name: 'fire', svg: ({ size } = {}) => paths([{ d: 'M12 2c2 4-2 6 0 9 1 1 2 1 3 0 0 4-2 7-5 7s-7-3-7-7c0-3 2-4 4-7 1 1 2 2 2 4 1-2 2-4 3-6z' }], size) },
  { name: 'bulb', svg: ({ size } = {}) => paths([{ d: 'M9 18h6' }, { d: 'M10 22h4' }, { d: 'M12 2a7 7 0 0 0-4 12c1 1 1 2 1 4h6c0-2 0-3 1-4a7 7 0 0 0-4-12z' }], size) },
  { name: 'rocket', svg: ({ size } = {}) => paths([{ d: 'M5 19c0-2 1-3 3-4' }, { d: 'M15 9c-2-2-5-2-5-2s0 3 2 5 5 2 5 2 0-3-2-5z' }, { d: 'M9 15l-2 4 4-2' }, { d: 'M14 10l-4 4' }], size) },
  { name: 'gem', svg: ({ size } = {}) => path('M6 3h12l3 6-9 12L3 9z M12 3l-3 6h6z M3 9h18 M9 9l3 12 3-12', size) },
  { name: 'check', svg: ({ size } = {}) => path(checkPath, size) },
  { name: 'close', svg: ({ size } = {}) => paths([{ d: 'M6 6l12 12' }, { d: 'M18 6L6 18' }], size) },
  { name: 'bolt', svg: ({ size } = {}) => path('M13 2L4 14h7l-1 8 9-12h-7z', size) },
  { name: 'target', svg: ({ size } = {}) => paths([{ d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' }, { d: 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z' }, { d: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 2z' }], size) },
  { name: 'pin', svg: ({ size } = {}) => path('M12 2v8l-3 3h6l-3 3v6l-3-3-3 3v-6l-3-3h6l-3-3V2z', size) },
  { name: 'thumb-up', svg: ({ size } = {}) => paths([{ d: 'M7 10v11' }, { d: 'M21 11.5V14a2 2 0 0 1-2 2h-6l-1 4H7V10h4l3-8 2 1-2 6h7a2 2 0 0 1 2 2z' }], size) },
  { name: 'thumb-down', svg: ({ size } = {}) => paths([{ d: 'M17 14V3' }, { d: 'M3 12.5V10a2 2 0 0 1 2-2h6l1-4h5v13h-4l-3 8-2-1 2-6H5a2 2 0 0 1-2-2z' }], size) },
  { name: 'palette', svg: ({ size } = {}) => paths([{ d: 'M12 22a10 10 0 1 1 0-20c5 0 10 4 10 9 0 3-2 4-4 4h-2a2 2 0 0 0-1 4c1 1 1 2 0 3z' }, { d: 'M7 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M9 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M14 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M17 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }], size) },
  { name: 'tool', svg: ({ size } = {}) => paths([{ d: 'M14 6l4-4 4 4-4 4-4-4z' }, { d: 'M14 6L4 16l4 4 10-10' }], size) },
  { name: 'box', svg: ({ size } = {}) => paths([{ d: 'M3 7l9-4 9 4-9 4z' }, { d: 'M3 7v10l9 4 9-4V7' }, { d: 'M12 11v10' }], size) },
  { name: 'search', svg: ({ size } = {}) => paths([{ d: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' }, { d: 'M21 21l-5-5' }], size) },
  { name: 'chat', svg: ({ size } = {}) => path('M21 12c0 4-4 7-9 7-1 0-2-.1-3-.4L3 21l1.4-4.4C3.5 15.2 3 13.7 3 12c0-4 4-7 9-7s9 3 9 7z', size) },
  { name: 'mail', svg: ({ size } = {}) => paths([{ d: 'M3 5h18v14H3z' }, { d: 'M3 7l9 6 9-6' }], size) },
  { name: 'home', svg: ({ size } = {}) => paths([{ d: 'M3 12l9-9 9 9' }, { d: 'M5 10v10h14V10' }], size) },
  { name: 'phone', svg: ({ size } = {}) => paths([{ d: 'M5 4h4l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z' }], size) },
  { name: 'monitor', svg: ({ size } = {}) => paths([{ d: 'M3 4h18v12H3z' }, { d: 'M8 20h8' }, { d: 'M12 16v4' }], size) },
  { name: 'globe', svg: ({ size } = {}) => paths([{ d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' }, { d: 'M2 12h20' }, { d: 'M12 2a14 14 0 0 1 0 20a14 14 0 0 1 0-20' }], size) },
  { name: 'camera', svg: ({ size } = {}) => paths([{ d: 'M3 7h4l2-3h6l2 3h4v12H3z' }, { d: 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' }], size) },
  { name: 'music', svg: ({ size } = {}) => paths([{ d: 'M9 18V5l12-2v13' }, { d: 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' }, { d: 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' }], size) },
  { name: 'film', svg: ({ size } = {}) => paths([{ d: 'M3 4h18v16H3z' }, { d: 'M7 4v16M17 4v16M3 8h4M3 16h4M17 8h4M17 16h4' }], size) },
  { name: 'note', svg: ({ size } = {}) => paths([{ d: 'M5 3h11l4 4v14H5z' }, { d: 'M14 3v5h5' }, { d: 'M9 13h6M9 17h4' }], size) },
  { name: 'clock', svg: ({ size } = {}) => paths([{ d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' }, { d: 'M12 6v6l4 2' }], size) },
  { name: 'bell', svg: ({ size } = {}) => paths([{ d: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z' }, { d: 'M10 20a2 2 0 0 0 4 0' }], size) },
  { name: 'arrow-right', svg: ({ size } = {}) => paths([{ d: 'M5 12h14' }, { d: 'M13 6l6 6-6 6' }], size) },
  { name: 'arrow-down', svg: ({ size } = {}) => paths([{ d: 'M12 5v14' }, { d: 'M6 13l6 6 6-6' }], size) },
  { name: 'link', svg: ({ size } = {}) => paths([{ d: 'M9 15l6-6' }, { d: 'M11 5a4 4 0 0 0-4 4v2H5a4 4 0 0 0 0 8h2v-2a4 4 0 0 0 4-4z' }, { d: 'M13 19a4 4 0 0 0 4-4v-2h2a4 4 0 0 0 0-8h-2v2a4 4 0 0 0-4 4z' }], size) },
  { name: 'plus', svg: ({ size } = {}) => paths([{ d: plusPath }, { d: 'M5 12h14' }], size) },
  { name: 'minus', svg: ({ size } = {}) => path(minusPath, size) },
  { name: 'edit', svg: ({ size } = {}) => paths([{ d: 'M4 20h4l10-10-4-4L4 16z' }, { d: 'M14 6l4 4' }], size) },
  { name: 'refresh', svg: ({ size } = {}) => paths([{ d: 'M3 12a9 9 0 0 1 15-6l3 3' }, { d: 'M21 4v5h-5' }, { d: 'M21 12a9 9 0 0 1-15 6l-3-3' }, { d: 'M3 20v-5h5' }], size) },
  { name: 'gear', svg: ({ size } = {}) => paths([{ d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' }, { d: 'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z' }], size) },
  { name: 'chart', svg: ({ size } = {}) => paths([{ d: 'M3 3v18h18' }, { d: 'M7 14l4-4 3 3 5-7' }], size) },
  { name: 'trophy', svg: ({ size } = {}) => paths([{ d: 'M6 4h12v6a6 6 0 0 1-12 0z' }, { d: 'M6 6H3a3 3 0 0 0 3 3' }, { d: 'M18 6h3a3 3 0 0 1-3 3' }, { d: 'M9 16h6l-1 4h-4z' }], size) },
  { name: 'tag', svg: ({ size } = {}) => paths([{ d: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z' }, { d: 'M7 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }], size) },
  { name: 'lock', svg: ({ size } = {}) => paths([{ d: 'M5 11h14v10H5z' }, { d: 'M8 11V7a4 4 0 0 1 8 0v4' }], size) },
  { name: 'user', svg: ({ size } = {}) => paths([{ d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' }, { d: 'M4 21a8 8 0 0 1 16 0' }], size) },
  { name: 'cart', svg: ({ size } = {}) => paths([{ d: 'M3 4h2l3 12h11l2-9H6' }, { d: 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' }, { d: 'M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' }], size) },
  { name: 'sun', svg: ({ size } = {}) => paths([{ d: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z' }, { d: 'M12 1v3M12 20v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2' }], size) },
  { name: 'moon', svg: ({ size } = {}) => path('M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z', size) },
  { name: 'cloud', svg: ({ size } = {}) => path('M6 19a4 4 0 0 1-1-7.9 5 5 0 0 1 9.8-1A4 4 0 0 1 18 19z', size) },
]

/** 组件类型 → SVG 渲染函数（用于组件库和图层树） */
export const TYPE_ICON_MAP: Record<string, (props?: IconProps) => ReactElement> = {
  heading: IconHeading,
  text: IconText,
  image: IconImage,
  button: IconButton,
  card: IconCard,
  container: IconContainer,
  divider: IconDivider,
  icon: IconIcon,
  video: IconVideo,
  input: IconInput,
  navbar: IconNavbar,
  grid: IconGrid,
  form: IconForm,
  iframe: IconIframe,
}

/** 名称 → SVG 渲染函数的查找表（预设 + 组件类型） */
export const SVG_ICON_MAP: Record<string, (props?: IconProps) => ReactElement> = {
  ...Object.fromEntries(SVG_ICON_PRESETS.map((p) => [p.name, p.svg])),
  ...TYPE_ICON_MAP,
}
