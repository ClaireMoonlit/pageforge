/**
 * 精修模式插入策略
 *
 * 决定新创建的 DOM 元素插入到 iframe 内的哪个位置：
 * 1. 拖拽场景：传 screenX/screenY，根据鼠标位置找到目标元素，
 *    用 elementFromPoint 判断 + 上下半线决定 insertBefore/insertAfter
 * 2. 点击插入场景：不传坐标，优先插入到当前选中元素之后，
 *    否则追加到 body 末尾
 */
import type { RefineElementInfo } from '@/store/editorStore'
import { createRefineElement } from './elementFactory'
import type { ComponentType } from '@/types'

/**
 * 在 iframe 文档中插入一个新元素
 *
 * 关键设计：把新元素包在 `.pf-refine-inserted` wrapper 中。
 * - wrapper 负责间距、居中、最大宽度，避免新元素（特别是 navbar/grid 这种 width:1200px 的）
 *   直接撑满 body 拉乱整个页面布局
 * - 真正的内容元素保留 componentLib 的 defaultStyle
 *
 * @param doc                iframe.contentDocument
 * @param type               组件类型
 * @param opts.iframeEl      iframe DOM 元素（用于 screenX/screenY 转换）
 * @param opts.screenX       鼠标屏幕 X（可选）
 * @param opts.screenY       鼠标屏幕 Y（可选）
 * @param opts.selectedEl    当前选中的元素（点击插入时优先插到它后面）
 * @returns                  新插入的 wrapper 元素 + 它现在在 DOM 中的位置；失败返回 null
 */
export interface InsertOptions {
  iframeEl?: HTMLIFrameElement | null
  screenX?: number
  screenY?: number
  selectedEl?: HTMLElement | null
}

export function insertRefineElement(
  doc: Document,
  type: ComponentType,
  opts: InsertOptions = {},
): { element: HTMLElement; parent: Node; nextSibling: Node | null } | null {
  if (!doc || !doc.body) return null

  // 1. 创建内部新元素
  const inner = createRefineElement(doc, type)
  if (!inner) return null

  // 2. 决定插入位置（与原逻辑一致，但查的是 wrapper 层级）
  let parent: Node = doc.body
  let nextSibling: Node | null = null

  if (opts.screenX !== undefined && opts.screenY !== undefined && opts.iframeEl) {
    // 拖拽场景：用 elementFromPoint 找目标
    const rect = opts.iframeEl.getBoundingClientRect()
    const localX = opts.screenX - rect.left
    const localY = opts.screenY - rect.top
    let target: Element | null = null
    try {
      target = doc.elementFromPoint(localX, localY)
    } catch {
      target = null
    }
    // 跳过 wrapper 自身（避免插到自己的 wrapper 内部）
    if (target && target.closest('.pf-refine-inserted') && target.closest('.pf-refine-inserted') !== target) {
      target = target.closest('.pf-refine-inserted') as HTMLElement
    }
    if (target && target !== doc.body && target !== doc.documentElement) {
      const targetRect = target.getBoundingClientRect()
      const targetMidY = targetRect.top + targetRect.height / 2
      const insertBefore = localY < targetMidY
      parent = target.parentNode ?? doc.body
      nextSibling = insertBefore ? target : target.nextSibling
    } else {
      parent = doc.body
      nextSibling = null
    }
  } else if (opts.selectedEl && opts.selectedEl.isConnected && opts.selectedEl.parentNode) {
    // 点击插入：插到选中元素之后（向上找最近的 wrapper，作为同级）
    let anchor: HTMLElement = opts.selectedEl
    while (anchor.parentElement && !anchor.classList.contains('pf-refine-inserted') && anchor.parentElement !== doc.body) {
      anchor = anchor.parentElement
    }
    parent = anchor.parentNode ?? doc.body
    nextSibling = anchor.nextSibling
  } else {
    // 默认：追加到 body 末尾
    parent = doc.body
    nextSibling = null
  }

  // 3. 创建 wrapper（负责布局/间距）
  const wrapper = doc.createElement('div')
  wrapper.className = 'pf-refine-inserted'
  wrapper.setAttribute('data-pf-refine-inserted', 'true')
  // wrapper 样式：仅顶部留间距、宽度跟随 body，不做居中避免 layout shift
  wrapper.style.cssText = [
    'box-sizing: border-box',
    'margin: 24px 0 0 0',
    'padding: 0',
    'width: 100%',
  ].join(';')
  wrapper.appendChild(inner)

  // 4. 分配 eid 到 wrapper（让 Inspector / hover 选中的是 wrapper 而不是内部元素）
  const eid = 'e' + Math.random().toString(36).slice(2, 8)
  wrapper.setAttribute('data-pf-eid', eid)

  // 5. 插入 DOM
  parent.insertBefore(wrapper, nextSibling)

  return { element: wrapper, parent, nextSibling }
}

/**
 * 选中指定元素并提取 RefineElementInfo
 * @param doc  iframe.contentDocument
 * @param el   要选中的元素
 */
export function buildRefineInfo(doc: Document, el: HTMLElement): RefineElementInfo | null {
  try {
    const rect = el.getBoundingClientRect()
    const attributes: Record<string, string> = {}
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'style') continue
      attributes[attr.name] = attr.value
    }
    return {
      tagName: el.tagName.toLowerCase(),
      textContent: el.textContent ?? '',
      attributes,
      inlineStyle: el.style?.cssText ?? '',
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }
  } catch {
    return null
  }
}

/**
 * 从 store 中的 RefineElementInfo 找回对应的 DOM 元素。
 *
 * 因为元素没有持久化 id（不像自由画布模式有节点 id），我们用一组
 * 启发式匹配：tagName + 内联样式 hash + 文本内容做组合匹配。
 *
 * @param doc     iframe.contentDocument
 * @param info    当前 store 中的选中元素信息
 * @returns       找到的 DOM 元素；找不到返回 null
 */
export function findElementByInfo(doc: Document, info: RefineElementInfo): HTMLElement | null {
  if (!doc) return null
  const candidates = Array.from(doc.querySelectorAll(info.tagName))
  if (candidates.length === 0) return null
  // 唯一：直接返回
  if (candidates.length === 1) return candidates[0] as HTMLElement
  // 多选：先按 inlineStyle 严格匹配
  const byStyle = candidates.find((el) => (el as HTMLElement).style.cssText === info.inlineStyle)
  if (byStyle) return byStyle as HTMLElement
  // 再按 textContent 完全匹配
  const byText = candidates.find((el) => (el as HTMLElement).textContent === info.textContent)
  if (byText) return byText as HTMLElement
  // 兜底：第一个
  return candidates[0] as HTMLElement
}
