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
 * @param doc                iframe.contentDocument
 * @param type               组件类型
 * @param opts.iframeEl      iframe DOM 元素（用于 screenX/screenY 转换）
 * @param opts.screenX       鼠标屏幕 X（可选）
 * @param opts.screenY       鼠标屏幕 Y（可选）
 * @param opts.selectedEl    当前选中的元素（点击插入时优先插到它后面）
 * @returns                  新插入的元素 + 它现在在 DOM 中的位置；失败返回 null
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

  // 1. 创建新元素
  const newEl = createRefineElement(doc, type)
  if (!newEl) return null

  // 2. 决定插入位置
  let parent: Node = doc.body
  let nextSibling: Node | null = null

  if (opts.screenX !== undefined && opts.screenY !== undefined && opts.iframeEl) {
    // 拖拽场景：用 elementFromPoint 找目标
    const rect = opts.iframeEl.getBoundingClientRect()
    const localX = opts.screenX - rect.left
    const localY = opts.screenY - rect.top
    // iframe 内部 document 的坐标系 = iframe 视口坐标系，直接用
    let target: Element | null = null
    try {
      // elementFromPoint 会"穿透"新元素，但新元素还没插入，不影响
      target = doc.elementFromPoint(localX, localY)
    } catch {
      target = null
    }
    if (target && target !== doc.body && target !== doc.documentElement) {
      // 跳过 html/body 这种"伪目标"
      const targetRect = target.getBoundingClientRect()
      const targetMidY = targetRect.top + targetRect.height / 2
      const insertBefore = localY < targetMidY
      parent = target.parentNode ?? doc.body
      nextSibling = insertBefore ? target : target.nextSibling
    } else {
      // 落到空白处：插入到 body 末尾
      parent = doc.body
      nextSibling = null
    }
  } else if (opts.selectedEl && opts.selectedEl.isConnected && opts.selectedEl.parentNode) {
    // 点击插入：插到选中元素之后
    parent = opts.selectedEl.parentNode
    nextSibling = opts.selectedEl.nextSibling
  } else {
    // 默认（点击插入且无选中元素）：追加到 body 最后一个块级元素之后（作为 body 的直接子元素）
    // 不能插入到最后一个块级容器内部（对于 flex column 的 section，新元素会作为子元素堆叠，
    // 导致 section 高度膨胀、将原有内容顶出屏幕）。作为 body 的兄弟节点追加最安全。
    let lastBlock: Element | null = null
    for (const child of Array.from(doc.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue
      const display = doc.defaultView?.getComputedStyle(child).display ?? ''
      if (display === 'block' || display === 'flex' || display === 'grid' || display === 'list-item' || display === '') {
        lastBlock = child
      }
    }
    parent = doc.body
    // 插在最后一个 block 之后（作为兄弟节点），而非嵌套进去
    nextSibling = lastBlock ? lastBlock.nextSibling : null
  }

  // 3. 分配 eid 并插入
  const eid = 'e' + Math.random().toString(36).slice(2, 8)
  newEl.setAttribute('data-pf-eid', eid)
  parent.insertBefore(newEl, nextSibling)

  return { element: newEl, parent, nextSibling }
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
