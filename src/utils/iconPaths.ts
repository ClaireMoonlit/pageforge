/**
 * 图标路径数据 —— 纯 JS 数据，导出 HTML 时使用
 * 与 src/components/Icons.tsx 中的 SVG_ICON_PRESETS 保持一致
 */

export interface IconPathData {
  /** 单一 path：SVG d 字符串 */
  d?: string
  /** 多 path：d + fill 选项 */
  paths?: { d: string; fill?: string }[]
  /** fill 模式：'none' 描边风格，'currentColor' 填充风格 */
  fill: 'none' | 'currentColor'
}

export const ICON_PATHS: Record<string, IconPathData> = {
  star: { d: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z', fill: 'none' },
  'star-fill': { d: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z', fill: 'currentColor' },
  heart: { d: 'M12 21s-7-4.5-9.5-9C.8 8.4 2.5 4 6.5 4c2 0 3.5 1 4.5 2.5 1-1.5 2.5-2.5 4.5-2.5 4 0 5.7 4.4 4 8-2.5 4.5-9.5 9-9.5 9z', fill: 'none' },
  fire: { paths: [{ d: 'M12 2c2 4-2 6 0 9 1 1 2 1 3 0 0 4-2 7-5 7s-7-3-7-7c0-3 2-4 4-7 1 1 2 2 2 4 1-2 2-4 3-6z' }], fill: 'none' },
  bulb: { paths: [{ d: 'M9 18h6' }, { d: 'M10 22h4' }, { d: 'M12 2a7 7 0 0 0-4 12c1 1 1 2 1 4h6c0-2 0-3 1-4a7 7 0 0 0-4-12z' }], fill: 'none' },
  rocket: { paths: [{ d: 'M5 19c0-2 1-3 3-4' }, { d: 'M15 9c-2-2-5-2-5-2s0 3 2 5 5 2 5 2 0-3-2-5z' }, { d: 'M9 15l-2 4 4-2' }, { d: 'M14 10l-4 4' }], fill: 'none' },
  gem: { d: 'M6 3h12l3 6-9 12L3 9z M12 3l-3 6h6z M3 9h18 M9 9l3 12 3-12', fill: 'none' },
  check: { d: 'M5 12l5 5 9-11', fill: 'none' },
  close: { paths: [{ d: 'M6 6l12 12' }, { d: 'M18 6L6 18' }], fill: 'none' },
  bolt: { d: 'M13 2L4 14h7l-1 8 9-12h-7z', fill: 'none' },
  target: { paths: [{ d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z' }, { d: 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z' }, { d: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 2z' }], fill: 'none' },
  pin: { d: 'M12 2v8l-3 3h6l-3 3v6l-3-3-3 3v-6l-3-3h6l-3-3V2z', fill: 'none' },
  'thumb-up': { paths: [{ d: 'M7 10v11' }, { d: 'M21 11.5V14a2 2 0 0 1-2 2h-6l-1 4H7V10h4l3-8 2 1-2 6h7a2 2 0 0 1 2 2z' }], fill: 'none' },
  'thumb-down': { paths: [{ d: 'M17 14V3' }, { d: 'M3 12.5V10a2 2 0 0 1 2-2h6l1-4h5v13h-4l-3 8-2-1 2-6H5a2 2 0 0 1-2-2z' }], fill: 'none' },
  palette: { paths: [{ d: 'M12 22a10 10 0 1 1 0-20c5 0 10 4 10 9 0 3-2 4-4 4h-2a2 2 0 0 0-1 4c1 1 1 2 0 3z' }, { d: 'M7 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M9 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M14 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }, { d: 'M17 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', fill: 'currentColor' }], fill: 'none' },
  moon: { d: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z', fill: 'none' },
  cloud: { d: 'M6 19a4 4 0 0 1-1-7.9 5 5 0 0 1 9.8-1A4 4 0 0 1 18 19z', fill: 'none' },
  plus: { d: 'M12 5v14 M5 12h14', fill: 'none' },
  minus: { d: 'M5 12h14', fill: 'none' },
}

/**
 * 把图标名/值转换成 HTML 字符串：
 * - 命中 ICON_PATHS → 输出 <svg> 标签
 * - 否则 → 原样输出（emoji）
 */
export function renderIconToHtml(value: string, size: number, color: string): string {
  const data = ICON_PATHS[value]
  if (!data) {
    // emoji / 自定义：原样输出，由浏览器用字体回退渲染
    return `<span style="font-size:${size}px;line-height:1;color:${color}">${escapeHtml(value)}</span>`
  }
  const paths = data.paths
    ? data.paths.map(p => `<path d="${p.d}"${p.fill ? ` fill="${p.fill}"` : ''}/>`).join('')
    : `<path d="${data.d}"/>`
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${data.fill}" stroke="${data.fill === 'none' ? 'currentColor' : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${paths}</svg>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
