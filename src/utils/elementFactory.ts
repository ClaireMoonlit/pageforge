/**
 * 精修模式元素工厂
 *
 * 在 iframe 内部 document 上创建新 DOM 元素（用于精修模式下从组件库添加新组件）。
 * 设计目标：
 * 1. 复用 `data/componentLib` 的 `defaultStyle` 作为基础样式，与自由画布模式视觉一致
 * 2. 创建的元素直接归属 iframe 文档（doc.createElement），保留原页面 CSS 上下文
 * 3. 返回的元素可立即被 RefineCanvas 的事件监听器选中（无需重新绑定）
 * 4. 文本型元素自动填入合理的占位文字，方便用户后续编辑
 *
 * 关键点：必须在 iframe 文档内创建（doc.createElement），
 * 跨文档创建的元素不会归属到 iframe，会导致事件/样式失效。
 */
import { findComponentDef, componentLib } from '@/data/componentLib'
import type { ComponentType } from '@/types'

/**
 * 把 componentLib 的 defaultStyle 序列化为内联 style 字符串。
 * - 跳过 undefined / null / 空字符串
 * - 数字 / 布尔自动转字符串
 * - 字符串原样输出
 */
function styleToCss(style: Record<string, unknown> | undefined): string {
  if (!style) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v === '') continue
    // 转换 kebab-case：x / y / z 不需要，fontSize → font-size 等
    const cssKey = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    parts.push(`${cssKey}:${String(v)}`)
  }
  return parts.join(';')
}

/**
 * 在 iframe 文档上创建一个指定类型的新元素。
 * @param doc  iframe.contentDocument
 * @param type 组件类型（heading / text / button / ...）
 * @returns 创建好的 DOM 元素；type 未知或 doc 无效时返回 null
 */
export function createRefineElement(doc: Document, type: ComponentType): HTMLElement | null {
  if (!doc) return null
  const def = findComponentDef(type)
  if (!def) {
    console.warn('[elementFactory] unknown type:', type)
    return null
  }

  // 根据类型挑标签与默认文本（与 componentLib defaultProps 对齐）
  const props = def.defaultProps as Record<string, unknown>
  let tagName = 'div'
  let defaultText: string | null = null
  let extraAttrs: Record<string, string> = {}
  let extraInnerHTML: string | null = null
  let isVoid = false
  let isSVG = false

  switch (type) {
    case 'heading': {
      const level = Number(props.level ?? 1)
      tagName = `h${Math.min(6, Math.max(1, level))}`
      defaultText = String(props.text ?? '点击编辑标题')
      break
    }
    case 'text':
      tagName = 'p'
      defaultText = String(props.text ?? '这是一段正文，双击可编辑内容。')
      break
    case 'image': {
      tagName = 'img'
      isVoid = true
      const src = String(props.src ?? '')
      const alt = String(props.alt ?? '图片')
      if (src) extraAttrs.src = src
      extraAttrs.alt = alt
      break
    }
    case 'button':
      tagName = 'button'
      defaultText = String(props.text ?? '立即了解')
      break
    case 'divider':
      tagName = 'hr'
      isVoid = true
      break
    case 'icon': {
      // SVG 需要 createElementNS
      tagName = 'svg'
      isSVG = true
      isVoid = false
      // 用预设 star 路径
      const iconName = String(props.icon ?? 'star')
      const d = ICON_PATHS[iconName] ?? ICON_PATHS.star
      extraInnerHTML = `<path d="${d}" fill="currentColor"/>`
      break
    }
    case 'video': {
      tagName = 'video'
      isVoid = false
      const src = String(props.src ?? '')
      const poster = String(props.poster ?? '')
      extraAttrs.controls = ''
      if (src) extraAttrs.src = src
      if (poster) extraAttrs.poster = poster
      break
    }
    case 'input': {
      tagName = 'input'
      isVoid = true
      extraAttrs.type = 'text'
      const placeholder = String(props.placeholder ?? '')
      if (placeholder) extraAttrs.placeholder = placeholder
      break
    }
    case 'iframe': {
      tagName = 'iframe'
      isVoid = false
      extraAttrs.src = String(props.src ?? '')
      break
    }
    case 'container':
    case 'card':
    case 'navbar':
    case 'grid':
    case 'form':
    default: {
      tagName = 'div'
      defaultText = String(props.text ?? '容器')
      break
    }
  }

  let el: HTMLElement
  if (isSVG) {
    el = doc.createElementNS('http://www.w3.org/2000/svg', tagName) as unknown as HTMLElement
  } else {
    el = doc.createElement(tagName)
  }

  // 应用样式（componentLib 的 defaultStyle → 内联 style）
  const css = styleToCss(def.defaultStyle as Record<string, unknown>)
  if (css) el.setAttribute('style', css)

  // 写默认文本 / 子 HTML
  if (isVoid) {
    // 自闭合元素：只设属性
  } else if (extraInnerHTML !== null) {
    el.innerHTML = extraInnerHTML
  } else if (defaultText !== null) {
    el.textContent = defaultText
  }

  // 写额外属性
  for (const [k, v] of Object.entries(extraAttrs)) {
    el.setAttribute(k, v)
  }

  // 加 data-pf-refine-new 标记（可识别新插入的元素，便于后续做"新元素"高亮）
  el.setAttribute('data-pf-refine-new', 'true')

  return el
}

/** 简化版 icon 路径库（与 Icons.tsx 中的 SVG path 对齐的子集） */
const ICON_PATHS: Record<string, string> = {
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  check: 'M5 13l4 4L19 7',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  play: 'M5 3l14 9-14 9V3z',
}

/**
 * 精修模式下支持的组件类型（与 componentLib 对齐；video / input / iframe 等
 * 复杂组件在精修模式下也能添加，但默认数据可能不完整，用户后续可编辑）。
 */
export const REFINE_SUPPORTED_TYPES: ComponentType[] = componentLib.map((c) => c.type as ComponentType)
