import type { ReactNode } from 'react'
import { SVG_ICON_MAP, type IconProps } from './Icons'

/**
 * 智能图标组件：根据 type 渲染 SVG 或 emoji
 * - type='svg' + value=SVG 名称：查找 SVG_ICON_MAP 渲染
 * - type='svg' + value=内联 SVG path 字符串（极简用法）：直接渲染 path
 * - type='emoji' + value=emoji 字符：原样显示
 */
export interface IconPropsExposed extends IconProps {
  /** 图标类型 */
  type: 'svg' | 'emoji'
  /** 图标值：SVG 名称 / 字符 / path 字符串 */
  value: string
  className?: string
  title?: string
}

/** 判断字符串是否为 SVG path（极简判断：包含 "M" 路径指令） */
function looksLikePath(s: string): boolean {
  return /^\s*[Mm]/.test(s)
}

export function Icon({ type, value, size = 16, className, title }: IconPropsExposed): ReactNode {
  if (type === 'svg') {
    // 优先在预设表中查找
    const preset = SVG_ICON_MAP[value]
    if (preset) {
      return (
        <span
          className={className}
          title={title}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}
        >
          {/* preset 已经包含 <svg> */}
          {preset({ size })}
        </span>
      )
    }
    // 否则当作内联 path 渲染
    if (looksLikePath(value)) {
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {title && <title>{title}</title>}
          <path d={value} />
        </svg>
      )
    }
    // fallback：空
    return null
  }
  // emoji：原样显示
  return (
    <span className={className} title={title} style={{ fontSize: size, lineHeight: 1 }}>
      {value}
    </span>
  )
}

/**
 * 简化调用：直接传字符串，自动判断类型
 * - 含 'M' 开头 → 当作 SVG path
 * - 命中 SVG_ICON_MAP → 渲染对应 SVG
 * - 否则 → 当作 emoji
 */
export function AutoIcon({ value, size = 16, className, title }: { value: string; size?: number; className?: string; title?: string }): ReactNode {
  if (looksLikePath(value)) {
    return <Icon type="svg" value={value} size={size} className={className} title={title} />
  }
  if (SVG_ICON_MAP[value]) {
    return <Icon type="svg" value={value} size={size} className={className} title={title} />
  }
  return <Icon type="emoji" value={value} size={size} className={className} title={title} />
}
