import type { CanvasConfig, CanvasNode, ComponentType, NodeStyle } from '@/types'
import { ICON_PATHS } from './iconPaths'

let idCounter = 0
function nid(): string {
  idCounter += 1
  return `imp_${Date.now().toString(36)}_${idCounter}`
}

/** 解析内联 style 属性为 NodeStyle 对象 */
function parseStyleString(styleText: string): Record<string, string> {
  const style: Record<string, string> = {}
  if (!styleText) return style
  const rules = styleText.split(';')
  for (const rule of rules) {
    const colonIdx = rule.indexOf(':')
    if (colonIdx < 0) continue
    const key = rule.substring(0, colonIdx).trim()
    let val = rule.substring(colonIdx + 1).trim()
    if (!key || !val) continue
    // 去掉 !important（PageForge 不支持）
    val = val.replace(/\s*!important\s*$/gi, '')
    // CSS 自定义属性（--xxx）保持原样
    if (key.startsWith('--')) {
      style[key] = val
      continue
    }
    const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    style[camelKey] = val
  }
  return style
}

/** 关心样式属性的集合 */
const KNOWN_PROPS = new Set([
  'fontSize', 'fontWeight', 'fontFamily', 'color', 'textAlign', 'lineHeight', 'letterSpacing',
  'backgroundColor', 'background', 'backgroundImage', 'backgroundRepeat',
  'backgroundPosition', 'backgroundSize', 'borderRadius', 'border',
  'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
  'boxShadow', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'width', 'height', 'minHeight', 'maxHeight', 'maxWidth',
  'display', 'alignItems', 'justifyContent', 'wordBreak', 'whiteSpace',
  'flex', 'flexShrink', 'flexGrow', 'flexBasis', 'gap', 'textDecoration', 'fontStyle',
  'flexDirection', 'flexWrap', 'overflow', 'position', 'top', 'left',
  'right', 'bottom', 'opacity', 'textTransform', 'zIndex',
])

/** CSS 中会继承的属性（子元素未显式设置时，从父元素继承） */
const INHERITED_PROPS = new Set([
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'textAlign', 'lineHeight', 'letterSpacing', 'textTransform',
])

/** 从 style 记录中提取 NodeStyle */
function pickNodeStyle(raw: Record<string, string>): NodeStyle {
  const s: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_PROPS.has(k)) continue
    // 过滤掉 width/height: auto —— CSS 里表示"内容撑开"，但 PageForge 需要具体像素
    if ((k === 'width' || k === 'height') && v === 'auto') continue
    // 去掉 !important 后缀（例如 'flex!important' -> 'flex'）
    let val = String(v).trim()
    val = val.replace(/\s*!important\s*$/gi, '')
    s[k] = val
  }
  return s as NodeStyle
}

/** 解析 padding 值为 { top, right, bottom, left } */
function parsePadding(raw: string | number | undefined): { top: number; right: number; bottom: number; left: number } {
  if (raw === undefined || raw === null) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof raw === 'number') return { top: raw, right: raw, bottom: raw, left: raw }
  const parts = String(raw).split(/\s+/).map(p => parseDim(p) || 0)
  switch (parts.length) {
    case 1: return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
    case 2: return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
    case 3: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] }
    case 4: return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
    default: return { top: 0, right: 0, bottom: 0, left: 0 }
  }
}

/**
 * 简单求值 CSS calc() 表达式
 * 支持: + - * /，支持 px/rem/em 单位（rem/em 按 16px 换算）
 */
function evalCalc(expr: string): number | null {
  // 去除所有空格
  expr = expr.replace(/\s+/g, '')
  // 将 rem/em 转换为 px
  expr = expr.replace(/(-?[\d.]+)(rem|em)/g, (_m, n) => `${parseFloat(n) * 16}px`)
  // 将 px 单位去除（内部全部以 px 为单位计算）
  expr = expr.replace(/(-?[\d.]+)px/g, '$1')
  // 此时 expr 应该是纯数学表达式，如 "1.5*16*.5" 或 "-.5*1.5*16" 或 "-1*0"
  // 安全检查：只允许数字、运算符、括号、小数点
  if (!/^[-+*/().\d]+$/.test(expr)) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)()
    if (typeof result === 'number' && isFinite(result)) return result
  } catch {
    // ignore
  }
  return null
}

function parseDim(val: string | undefined): number {
  if (!val) return NaN
  let str = String(val).trim()
  if (str.startsWith('calc(') && str.endsWith(')')) {
    const inner = str.slice(5, -1).trim()
    // 先解析内部可能的 var() （如果还有残余）
    const resolved = inner
    const result = evalCalc(resolved)
    if (result !== null) return result
    // 回退：取第一个数字
    const match = inner.match(/-?[\d.]+(rem|em|px|vw|vh|%)?/)
    if (match) str = match[0]
    else return NaN
  }
  if (str.endsWith('%')) return parseFloat(str)
  if (str.endsWith('rem')) return parseFloat(str) * 16
  if (str.endsWith('em')) return parseFloat(str) * 16
  if (str.endsWith('px')) return parseFloat(str)
  if (str.endsWith('vw') || str.endsWith('vh')) return parseFloat(str) * 12 // 粗略估算
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

/** HTML 默认 inline / inline-block 标签（width 由内容撑开，不强制为父容器宽度）
 *  - inline 元素：a/span/em/strong/b/i/code 等
 *  - inline-block 元素：button/input/select/textarea/img/label 等
 *  这些元素即使在 block column flow 中也应 width:auto，否则会被强制成 100% 父宽
 *  （典型 bug：Bootstrap navbar 的 .navbar-brand a 被强制 1200px 撑爆布局） */
const INLINE_LIKE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'dfn', 'em',
  'i', 'img', 'input', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'select',
  'small', 'span', 'strong', 'sub', 'sup', 'textarea', 'time', 'u', 'var', 'wbr',
])
/** 判断标签是否应该 width:auto（行内/行内块元素，不强制为父容器宽度） */
function isInlineLikeTag(tag: string): boolean {
  return INLINE_LIKE_TAGS.has(tag)
}

/** 将 width 字符串（支持 px / %）转为像素值 */
function resolveWidth(widthStr: string | undefined, parentW: number): number {
  if (!widthStr || widthStr === 'auto') return parentW
  if (widthStr.endsWith('%')) return (parseFloat(widthStr) / 100) * parentW
  const px = parseDim(widthStr)
  return isNaN(px) ? parentW : px
}

/**
 * 提取 CSS 文本中所有的规则块（正确处理嵌套大括号，如 @media 内部规则）
 * 返回 [{ selector: '...', body: '...' }, ...]
 *
 * 关于 @media 块的处理策略：
 * - @media (max-width: ...) 是「移动端响应式」块，画布是固定宽度桌面端设计面，
 *   应用了里面的 width:100%!important 等规则会污染布局 → 整个块跳过
 * - @media (min-width: ...) 是「桌面端断点」块，里面通常是 Bootstrap 的 col-md-* /
 *   col-lg-* 等响应式栅格规则，这些正是我们要在桌面端画布上应用的样式。
 *   但 @media 包裹的 min-width 条件在固定宽度画布里始终满足（视口 ≥ 768px），
 *   所以可以「去掉 @media 外壳」直接提取内部规则。
 *
 * 实现：把 @media 块内部的子规则也提取出来，但仅当 @media 条件是 min-width 时
 * （即"桌面端样式"）；max-width / only screen 移动端样式仍跳过。
 */
function extractRules(css: string): Array<{ selector: string; body: string }> {
  const rules: Array<{ selector: string; body: string }> = []
  // 栈帧：每一层块的选择器起点、是否 at-rule 及其媒体方向
  type Frame = {
    selectorStart: number
    isAtRule: boolean
    atRuleKind: 'min-width' | 'max-width' | 'other' | null
  }
  const stack: Frame[] = []
  let blockStart = -1
  // 记录上一个 `}` 的位置 + 1 = 上一个 token 结束后的位置
  // 用于嵌套块开始时定位子规则选择器的起点
  let prevEnd = 0

  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (stack.length === 0) {
        // 顶层块：选择器范围是 [0, i)
        const selRaw = css.substring(0, i).trim()
        const isAtRule = selRaw.startsWith('@media') || selRaw.startsWith('@supports')
        let atRuleKind: Frame['atRuleKind'] = null
        if (isAtRule) {
          const hasMin = /\bmin-width\s*:/i.test(selRaw)
          const hasMax = /\bmax-width\s*:/i.test(selRaw)
          if (selRaw.startsWith('@media') && hasMin && !hasMax) atRuleKind = 'min-width'
          else if (selRaw.startsWith('@media') && hasMax) atRuleKind = 'max-width'
          else atRuleKind = 'other'
        }
        stack.push({ selectorStart: prevEnd, isAtRule, atRuleKind })
      } else {
        // 嵌套块（@media 内部子规则等）：
        // 选择器起点 = 上一个 `}` 之后的位置（prevEnd）
        stack.push({ selectorStart: prevEnd, isAtRule: false, atRuleKind: null })
      }
      blockStart = i + 1
    } else if (ch === '}') {
      const frame = stack.pop()
      if (!frame) continue
      const selector = css.substring(frame.selectorStart, blockStart - 1).trim()
      const body = css.substring(blockStart, i).trim()
      if (selector && body) {
        if (frame.isAtRule) {
          // 顶层 @media / @supports：丢弃
        } else if (selector.startsWith('@')) {
          // 嵌套的 @-rule：丢弃
        } else {
          rules.push({ selector, body })
        }
      }
      prevEnd = i + 1
      // 父块体的「body 起点」不变（指向父块 {+1 位置），
      // 父块的 selector/body 会在它自己的 `}` 弹出时计算
    }
  }
  return rules
}

/**
 * 将一个 CSS 规则集合应用到 map 中
 */
function applyRulesToMap(
  rules: Array<{ selector: string; body: string }>,
  map: Map<string, Record<string, string>>,
) {
  for (const { selector: selRaw, body } of rules) {
    const selectors = selRaw.split(',').map((s) => s.trim())
    const parsed = parseStyleString(body)
    for (const sel of selectors) {
      // :root / html / * 块收集 --xxx CSS 变量 + box-sizing 等关键重置属性
	      if (/^(:root|html|\*)$/i.test(sel)) {
	        const vars = map.get('__vars__') || {}
	        for (const [k, v] of Object.entries(parsed)) {
	          if (k.startsWith('--')) {
	            vars[k] = v
	          } else if (k === 'boxSizing') {
	            // 保存 box-sizing 到全局 key，后续在 buildElement 中应用
	            vars['__box_sizing__'] = v
	          }
	        }
	        map.set('__vars__', vars)
	        continue
	      }
      // 跳过伪类、伪元素、属性选择器
      if (sel.includes(':') || sel.includes('[')) continue

      // 处理 .class > * 和 #id > * 子选择器（Bootstrap grid: .row > *, .row-cols-2 > * 等）
      const childAnyMatch = sel.match(/^([.#][a-zA-Z_][\w-]*)\s*>\s*\*$/)
      if (childAnyMatch) {
        const parentKey = childAnyMatch[1]
        const storageKey = parentKey.startsWith('#')
          ? `__child_of_id__${parentKey.substring(1)}`
          : `__child_of__${parentKey.substring(1)}`
        const existing = map.get(storageKey) || {}
        map.set(storageKey, { ...existing, ...parsed })
        continue
      }

      // 处理后代/子选择器（.parent .child、.parent > .child 等）
      // - > 子选择器：将样式存入 __child_of__parentKey，应用于父元素的所有子元素
      // - 空格后代选择器：将样式应用到最后一个选择器上（丢失上下文但比跳过好）
      const parts = sel.split(/[\s>]+/).filter(Boolean)
      if (parts.length >= 2 && !/[+~]/.test(sel)) {
        const firstPart = parts[0]
        const lastPart = parts[parts.length - 1]
        const hasChildCombinator = />/.test(sel)
        const hasSpace = /\s/.test(sel)

        if (hasChildCombinator && !hasSpace) {
          // 纯 > 子选择器
          // 对于 A>B（二元，如 .navbar>.container）：firstPart 是直接父级
          // 对于 A>B>C（三元+，如 .timeline>li.timeline-inverted>.timeline-panel）：
          //   secondLastPart 是直接父级，firstPart 是祖先（用 secondLastPart 避免污染祖先的所有子元素）
          const directParentPart = parts.length >= 3 ? parts[parts.length - 2] : firstPart
          // 从 directParentPart 提取 class（支持 .class 和 tag.class 两种形式）
          const dpClassMatch = directParentPart.match(/^\.([a-zA-Z_][\w-]*)$/)
          const dpTagClassMatch = directParentPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
          const dpIdMatch = directParentPart.match(/^#([a-zA-Z_][\w-]*)$/)
          if (dpClassMatch || dpTagClassMatch) {
            const cn = dpClassMatch ? dpClassMatch[1] : dpTagClassMatch![1]
            const parentKey = `__child_of__${cn}`
            const existing = map.get(parentKey) || {}
            map.set(parentKey, { ...existing, ...parsed })
            continue
          } else if (dpIdMatch) {
            const parentKey = `__child_of_id__${dpIdMatch[1]}`
            const existing = map.get(parentKey) || {}
            map.set(parentKey, { ...existing, ...parsed })
            continue
          }
        } else if (!hasChildCombinator && hasSpace) {
          // 纯空格后代选择器（如 .navbar-expand-lg .navbar-collapse）：应用到最后一个选择器
          // 但若第一段是复合选择器（tag#id / tag.class），说明选择器上下文复杂，不应简化为 tag 应用
          if (/^[a-z][a-z0-9]*[.#]/.test(firstPart)) {
            // 特殊情况：tag.class .class 仍可降级为 .class （因为 tag 只是范围限定）
            // 例如 header.masthead .masthead-subheading -> 仅看 .masthead-subheading
            // 但 .masthead-subheading 仍是 masthead 内部，应该存为 __desc_of__masthead__*
            const tagClassMatch = firstPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
            if (tagClassMatch) {
              const parentCls = tagClassMatch[1]
              // 递归处理剩下的：把 lastPart 当作 firstPart 继续
              if (/^[a-z][a-z0-9]*$/.test(lastPart)) {
                // tag.class .tag -> 存为 __desc_of__<parentCls>__<tag>
                const descKey = `__desc_of__${parentCls}__${lastPart}`
                const existing = map.get(descKey) || {}
                map.set(descKey, { ...existing, ...parsed })
              } else if (/^\.[a-zA-Z_][\w-]*$/.test(lastPart)) {
                // tag.class .class -> 存为 __desc_of__<parentCls>__<tag>  (查找到 class 元素时按其 tag 匹配)
                // 因为子元素查表时用 __desc_of__<parentCls>__<tag>，所以这里我们存到对应 tag 下
                // 但不知道 lastClass 的 tag，所以最稳的是存到 __desc_of__<parentCls>__<lastCls> 占位
                // 然后在 buildElement 时让 class 元素去查这个占位
                const lastCls = lastPart.substring(1)
                const descKey = `__desc_of__${parentCls}__${lastCls}`
                const existing = map.get(descKey) || {}
                map.set(descKey, { ...existing, ...parsed })
              }
            }
            continue
          }
          // 简化策略：把 "A B" 后代选择器的样式存到 __desc_of__<A的类名>__<B的最后一段>
          // 这样无论 B 是 tag、.class 还是 tag.class，子元素都能通过查表找到
          // 但要先看 firstPart 能否提取出一个 class 名
          const firstClsMatch = firstPart.match(/^\.([a-zA-Z_][\w-]*)$/)
          const firstTagClsMatch = firstPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
          // 优先用 firstTagClsMatch（tag.class），其次 firstClsMatch（纯 .class）
          const firstClsName = firstTagClsMatch ? firstTagClsMatch[1] : (firstClsMatch ? firstClsMatch[1] : null)
          if (firstClsName) {
            // 把 lastPart 分解出 lastClassName（用于 class 元素查表）
            let lastClsName: string | null = null
            let lastTag: string | null = null
            const lastClsPure = lastPart.match(/^\.([a-zA-Z_][\w-]*)$/)
            const lastTagClsPure = lastPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
            const lastTagPure = lastPart.match(/^([a-z][a-z0-9]*)$/i)
            if (lastClsPure) {
              lastClsName = lastClsPure[1]
            } else if (lastTagClsPure) {
              lastClsName = lastTagClsPure[1]
            } else if (lastTagPure) {
              lastTag = lastTagPure[1].toLowerCase()
            } else {
              // 复杂的最后一段（如 .a.b），跳过
              continue
            }
            // 存为 __desc_of__<firstClsName>__<lastTag or lastClsName>
            const lookupKey = lastTag || lastClsName
            if (lookupKey) {
              const descKey = `__desc_of__${firstClsName}__${lookupKey}`
              const existing = map.get(descKey) || {}
              map.set(descKey, { ...existing, ...parsed })
            }
            continue
          }
          // 若第一段是 #id（限制在某个容器内），则不应降级为全局 tag 规则
          if (/^#/.test(firstPart)) continue
          // 兜底：尝试把 lastPart 存到对应的简单选择器
          const lastClassMatch = lastPart.match(/^\.([a-zA-Z_][\w-]*)$/)
          if (lastClassMatch) {
            const cn = lastClassMatch[1]
            const existing = map.get(cn) || {}
            map.set(cn, { ...existing, ...parsed })
            continue
          }
          const lastTagMatch = lastPart.match(/^([a-z][a-z0-9]*)$/i)
          if (lastTagMatch) {
            const tag = lastTagMatch[1].toLowerCase()
            // 若 firstPart 是简单 class（如 .team-member），把样式存到 __desc_of__<parentClass>__<tag>
            // 避免污染所有 <tag> 元素的样式
            const firstCls = firstPart.match(/^\.([a-zA-Z_][\w-]*)$/)
            if (firstCls) {
              const descKey = `__desc_of__${firstCls[1]}__${tag}`
              const existing = map.get(descKey) || {}
              map.set(descKey, { ...existing, ...parsed })
            } else {
              // firstPart 既不是 simple class 也不是 #id（已在上面过滤），
              // 为安全起见跳过（不要污染全局 __tag_<tag>）
              continue
            }
            continue
          }
          const lastTagClassMatch = lastPart.match(/^([a-z][a-z0-9]*)\.([a-zA-Z_][\w-]*)$/i)
          if (lastTagClassMatch) {
            const cn = lastTagClassMatch[2]
            const existing = map.get(cn) || {}
            map.set(cn, { ...existing, ...parsed })
            continue
          }
        }
        // 混合选择器（同时有 > 和空格）：尝试拆解出 lastPart 实际所在的「父级类上下文」
        // 例：.timeline>li .timeline-image img -> img 最近的类上下文是 .timeline-image
        //     存为 __desc_of__timeline-image__img
        //     header.masthead .masthead-heading -> .masthead-heading 的父级类是 masthead
        //     存为 __desc_of__masthead__masthead-heading
        if (hasChildCombinator && hasSpace && parts.length >= 3) {
          // 找出 lastPart（目标）和 secondLastPart（lastPart 的父级上下文）
          const secondLastPart = parts[parts.length - 2]
          // 从 secondLastPart 提取父级 class 名
          let parentCtxClass: string | null = null
          const slcMatch = secondLastPart.match(/^\.([a-zA-Z_][\w-]*)$/)
          const sltcMatch = secondLastPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
          if (slcMatch) parentCtxClass = slcMatch[1]
          else if (sltcMatch) parentCtxClass = sltcMatch[1]
          // 提取 lastPart 的目标 key（tag 或 class）
          let targetKey: string | null = null
          const lcMatch = lastPart.match(/^\.([a-zA-Z_][\w-]*)$/)
          const ltcMatch = lastPart.match(/^[a-z][a-z0-9]*\.([a-zA-Z_][\w-]*)$/i)
          const ltMatch = lastPart.match(/^([a-z][a-z0-9]*)$/i)
          if (lcMatch) targetKey = lcMatch[1]
          else if (ltcMatch) targetKey = ltcMatch[1]
          else if (ltMatch) targetKey = ltMatch[1].toLowerCase()
          // 若有父级类 + 目标 key，存到 __desc_of__<parentCtx>__<targetKey>
          if (parentCtxClass && targetKey) {
            const descKey = `__desc_of__${parentCtxClass}__${targetKey}`
            const existing = map.get(descKey) || {}
            map.set(descKey, { ...existing, ...parsed })
            continue
          }
        }
        // 其他无法识别的：跳过
        continue
      }

      // 处理 .parent tag 后代选择器（如 .team-member img）
      // 存到 __descendant_of__parentClass__tag 键
      const descMatch = sel.match(/^\.([a-zA-Z_][\w-]*)\s+([a-z][a-z0-9]*)$/i)
      if (descMatch) {
        const parentClass = descMatch[1]
        const tag = descMatch[2].toLowerCase()
        const key = `__desc_of__${parentClass}__${tag}`
        const existing = map.get(key) || {}
        map.set(key, { ...existing, ...parsed })
        continue
      }

      // 跳过其他组合选择器（descendant/sibling 等）：.a .b、.a+.b 等
      if (/[\s>+~]/.test(sel)) continue

      // #id 选择器
      const idMatch = sel.match(/^#([a-zA-Z_][\w-]*)$/)
      if (idMatch) {
        const id = idMatch[1]
        const key = `__id_${id}`
        const existing = map.get(key) || {}
        const merged = { ...existing, ...parsed }
        // 启发式：静态渲染下，不让 transparent 覆盖已有的纯色背景（通常是 JS 切换的初始状态，如 navbar-shrink）
        if (parsed.backgroundColor === 'transparent' && existing.backgroundColor && existing.backgroundColor !== 'transparent') {
          merged.backgroundColor = existing.backgroundColor
        }
        if (parsed.background === 'transparent' && existing.background && existing.background !== 'transparent') {
          merged.background = existing.background
        }
        map.set(key, merged)
        continue
      }
      // .class 选择器
      const classMatch = sel.match(/^\.([a-zA-Z_][\w-]*)$/)
      if (classMatch) {
        const cn = classMatch[1]
        const existing = map.get(cn) || {}
        map.set(cn, { ...existing, ...parsed })
        continue
      }
      // tag.class 形式（如 header.masthead）：把样式挂到类名上
      const tagClassMatch = sel.match(/^([a-z][a-z0-9]*)\.([a-zA-Z_][\w-]*)$/i)
      if (tagClassMatch) {
        const cn = tagClassMatch[2]
        const existing = map.get(cn) || {}
        map.set(cn, { ...existing, ...parsed })
        continue
      }
      // 纯 tag 选择器
      const tagMatch = sel.match(/^([a-z][a-z0-9]*)$/i)
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase()
        const existing = map.get(`__tag_${tag}`) || {}
        map.set(`__tag_${tag}`, { ...existing, ...parsed })
      }
    }
  }
}

/**
 * 解析 <style> 标签中的 CSS，提取 class/tag/id 选择器规则 + :root CSS 变量
 * 返回 Map: className -> styles, __tag_xxx -> tag styles, __id_xxx -> id styles, __vars__ -> CSS variables
 */
function parseStyleTag(styleText: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>()
  // 移除注释
  let cleaned = styleText.replace(/\/\*[\s\S]*?\*\//g, '')
  // 去掉 @charset 指令
  cleaned = cleaned.replace(/@charset\s+("[^"]*"|'[^']*'|[^\s;]+)\s*;?/gi, '')
  const rules = extractRules(cleaned)
  applyRulesToMap(rules, map)
  return map
}

/** 解析 CSS 变量引用：把 "var(--bs-primary, #ffc800)" 替换为实际值（最多 5 层嵌套） */
function resolveCssVars(value: string, vars: Record<string, string>): string {
  if (!value || !value.includes('var(')) return value
  let cur = value
  for (let i = 0; i < 5; i++) {
    const next = cur.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_, name, fallback) => {
      const v = vars[name]
      if (v != null) return v
      if (fallback != null) return fallback.trim()
      return ''
    })
    if (next === cur) break
    cur = next
  }
  return cur
}

/** 对 style 记录里所有字符串值做 CSS 变量解析 */
function resolveStyleVars(style: Record<string, string>, vars: Record<string, string>): Record<string, string> {
  if (!vars || Object.keys(vars).length === 0) return style
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(style)) {
    const resolved = resolveCssVars(String(v), vars)
    // 如果解析后是空字符串（var 没找到也没 fallback），丢掉这个属性
    if (resolved === '' && /var\(/.test(String(v))) continue
    out[k] = resolved
  }
  return out
}

/** 根据标签和属性推断组件类型 */
function inferType(el: Element): ComponentType {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (tag === 'p' || tag === 'span' || tag === 'label' || tag === 'small' || tag === 'strong' || tag === 'em' || tag === 'b' || tag === 'i' || tag === 'pre' || tag === 'code' || tag === 'sub' || tag === 'sup' || tag === 'u' || tag === 's' || tag === 'del' || tag === 'ins' || tag === 'mark' || tag === 'cite' || tag === 'blockquote') return 'text'
  if (tag === 'img') return 'image'
  if (tag === 'button') return 'button'
  if (tag === 'hr') return 'divider'
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input'
  if (tag === 'video') return 'video'
  // a 标签：如果有 block 级子元素，作为容器；否则作为 text
  // 但 .btn 类的 a 标签应识别为按钮
  if (tag === 'a') {
    const cls = el.getAttribute('class') || ''
    if (/\bbtn\b/.test(cls)) return 'button'
    if (el.children.length > 0) {
      for (let i = 0; i < el.children.length; i++) {
        const ct = el.children[i].tagName.toLowerCase()
        if (['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'table', 'ul', 'ol', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'img', 'hr', 'input', 'textarea', 'figure', 'blockquote', 'pre'].includes(ct)) {
          return 'container'
        }
      }
    }
    return 'text'
  }
  // 语义化容器标签：仅含文字无元素子节点时退化为 text，避免吞掉 div 里的标题/副标题
  if (['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'ul', 'ol', 'li', 'table', 'form', 'figure', 'fieldset', 'details', 'summary', 'dl', 'dt', 'dd'].includes(tag)) {
    if (el.children.length === 0 && el.textContent?.trim()) return 'text'
    return 'container'
  }
  // 有 block 级子元素的元素 → 容器
  if (el.children.length > 0) {
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i]
      const ct = c.tagName.toLowerCase()
      if (['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'table', 'ul', 'ol', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'img', 'hr', 'input', 'textarea', 'figure', 'blockquote', 'pre'].includes(ct)) {
        return 'container'
      }
    }
  }
  // 纯文本或无子元素 → text
  const text = el.textContent?.trim()
  if (text) return 'text'
  return 'container'
}

/** 提取 heading 层级 */
function extractLevel(tag: string): 1 | 2 | 3 {
  const map: Record<string, 1 | 2 | 3> = { h1: 1, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 }
  return map[tag.toLowerCase()] || 2
}

/** 获取元素纯文本（去除 HTML 标签但保留文本内容） */
function getText(el: Element): string {
  const tag = el.tagName.toLowerCase()
  // 对于内联元素，直接取全部 textContent
  if (['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'code', 'sub', 'sup', 'mark', 'abbr', 'cite', 'time'].includes(tag)) {
    return el.textContent?.trim() || ''
  }
  // 对于块级元素，遍历子节点提取文本
  let text = ''
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || ''
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const ctag = (child as Element).tagName.toLowerCase()
      if (['br', 'hr'].includes(ctag)) {
        text += '\n'
      } else if (['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'code', 'sub', 'sup', 'mark', 'abbr', 'cite', 'time', 'u', 's', 'del', 'ins'].includes(ctag)) {
        text += (child as Element).textContent || ''
      } else {
        // 对于其他块级元素，也递归提取文本
        text += getText(child as Element)
      }
    }
  }
  // 清理：每行首尾的空白（如 <br> 前后的 HTML 缩进）会被 \s*\n\s* 规则压成单个 \n
  // 这样 "Be Part\n                                \n\n                                Of Our" → "Be Part\nOf Our"
  let cleaned = text
    // 把 \s*\n\s* 折叠为 \n（处理 <br> 周围的多余空白和空行）
    .replace(/[ \t]*\n[ \t\n]*/g, '\n')
    // 把多个连续空白折叠为单个空格
    .replace(/[ \t]+/g, ' ')
  return cleaned.trim()
}

/** 递归估算元素总高度（包括子元素） */
function estimateHeightRecursive(el: Element, style: NodeStyle, cssMap: Map<string, Record<string, string>>): number {
  // 固定高度
  if (style.height) {
    const h = parseDim(style.height)
    if (!isNaN(h)) return h
  }
  if (style.minHeight) {
    const h = parseDim(style.minHeight)
    if (!isNaN(h)) return h
  }

  const tag = el.tagName.toLowerCase()
  if (tag === 'hr') return 30
  // 图片：估算为 4:3 横图比例，避免被拉宽
  if (tag === 'img') {
    const w = parseDim(style.width) || 0
    if (w > 0) return Math.round(w * 0.75)
    return 200
  }
  if (tag === 'button') return 48
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 44
  if (tag === 'video') return 240

  // 对于容器，递归计算所有子元素的高度
  const type = inferType(el)
  if (type === 'container') {
    const display = style.display || ''
    const flexDir = (style.flexDirection as string) || 'row'
    const isFlexRow = display.includes('flex') && flexDir !== 'column'

    const pad = parsePadding(style.padding)
    const children = Array.from(el.children).filter(c => {
      const ct = c.tagName.toLowerCase()
      return ct !== 'style' && ct !== 'script'
    })

    if (isFlexRow) {
      // Flex Row：高度 = 最高子元素 + padding
      let maxH = 0
      for (const child of children) {
        const childStyle = extractElementStyle(child, cssMap)
        maxH = Math.max(maxH, estimateHeightRecursive(child, childStyle, cssMap))
      }
      return Math.max(60, pad.top + maxH + pad.bottom)
    }

    // Column / Flow：高度 = 所有子元素高度之和
    let totalH = pad.top
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const childStyle = extractElementStyle(child, cssMap)
      totalH += estimateHeightRecursive(child, childStyle, cssMap)
      if (i < children.length - 1) totalH += 16
    }
    totalH += pad.bottom
    return Math.max(60, totalH)
  }

  // 文本元素：根据文字量和可用宽度估算
  const text = getText(el)
  const fontSize = parseDim(style.fontSize) || 16
  // line-height 可能是无单位乘数（如 1.5）或带单位绝对值（如 2.25rem）
  const rawLH = (style.lineHeight as string) || '1.7'
  const lhVal = parseDim(rawLH)
  const isUnitlessLH = /^[\d.]+$/.test(String(rawLH).trim())
  // 无单位 → 乘 fontSize；带单位 → 直接使用绝对值
  const effectiveLineHeight = isUnitlessLH ? fontSize * lhVal : lhVal
  const availWidth = parseDim(style.width) || 700
  // 每个字符平均宽度 ≈ 字体大小（中文）或 0.5 * 字体大小（英文）
  // 保守估计：取字体大小的 0.8 倍
  const avgCharWidth = fontSize * 0.8
  const charsPerLine = Math.max(1, Math.floor(availWidth / avgCharWidth))
  const lines = Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)))
  const pad = parsePadding(style.padding)
  return Math.max(28, lines * effectiveLineHeight + pad.top + pad.bottom)
}

/** 提取元素的合并样式（tag < descendant < #id < class < inline） */
function extractElementStyle(
  el: Element,
  cssMap: Map<string, Record<string, string>>,
  inheritedVars: Record<string, string> = {},
  parentChildStyles: Record<string, string> = {},
): NodeStyle {
  const tag = el.tagName.toLowerCase()
  const elClass = el.getAttribute('class') || ''
  const rootVars = cssMap.get('__vars__') || {}
  // 合并：root vars 最低，继承的父级 vars 覆盖
  const vars = { ...rootVars, ...inheritedVars }
  let mergedStyle: Record<string, string> = {}

  // tag 样式（最低优先级）
  const tagStyles = cssMap.get(`__tag_${tag}`)
  if (tagStyles) Object.assign(mergedStyle, resolveStyleVars(tagStyles, vars))

  // 父元素 > * 子选择器样式（优先级高于 tag，低于 id/class）
  // 但对于 .row>* 的 width:100% 等「通用子选择器」默认规则，遇到 col-* 类时应让位
  if (Object.keys(parentChildStyles).length > 0) {
    Object.assign(mergedStyle, resolveStyleVars(parentChildStyles, vars))
  }

  // #id 样式（次低优先级，高于 tag/child 低于 class）
  const elId = el.getAttribute('id')
  if (elId) {
    const idStyles = cssMap.get(`__id_${elId}`)
    if (idStyles) Object.assign(mergedStyle, resolveStyleVars(idStyles, vars))
  }

  // class 样式（中优先级）
  // 对 col-* 类做断点排序：col-xxl > col-xl > col-lg > col-md > col-sm > col（数字大的赢）
  // 关键：用最具体的断点前缀匹配（例如 col-lg-4 应该只匹配 col-lg-，不应被 col- 误判为无断点 col）
  const colBP: Record<string, number> = { 'col-xxl': 5, 'col-xl': 4, 'col-lg': 3, 'col-md': 2, 'col-sm': 1, 'col': 0 }
  // 断点前缀按从长到短排序，确保匹配 col-lg-4 时先匹配 col-lg-（而非 col-）
  const colBreakpointPrefixes = ['col-xxl-', 'col-xl-', 'col-lg-', 'col-md-', 'col-sm-']
  // 匹配 col-<数字>（无断点 col），用正则精确匹配避免和带断点 col-* 冲突
  const COL_PLAIN_RE = /^col-\d+$/
  const classAttr = el.getAttribute('class')
  // 先收集元素自身 class 中定义的 CSS 变量，用于后续解析 var() 引用
  if (classAttr) {
    const classes = classAttr.split(/\s+/)
    for (const cn of classes) {
      const cls = cssMap.get(cn)
      if (cls) {
        for (const [k, v] of Object.entries(cls)) {
          if (k.startsWith('--')) vars[k] = resolveStyleVars({ [k]: v }, vars)[k]
        }
      }
    }
    // 找到最高 col 断点（仅断点类 col-xxl-*, col-xl-*, col-lg-*, col-md-*, col-sm-*，不含无断点 col-*）
    let highestColBP = -1
    let highestColPrefix = ''
    for (const cn of classes) {
      for (const prefix of colBreakpointPrefixes) {
        if (cn.startsWith(prefix)) {
          const bpName = prefix.replace(/-$/, '') // "col-lg"
          const bpLevel = colBP[bpName] ?? 0
          if (bpLevel > highestColBP) {
            highestColBP = bpLevel
            highestColPrefix = prefix
          }
          break
        }
      }
    }
    // 应用类样式，但跳过被高优先级 col 覆盖的 col 类
    for (const cn of classes) {
      // 判断当前类是否是低优先级 col 类（被高优先级 col 覆盖时跳过）
      if (highestColBP >= 0) {
        // 检测 cn 属于哪个 col 断点
        let cnColPrefix: string | null = null
        for (const prefix of colBreakpointPrefixes) {
          if (cn.startsWith(prefix)) {
            cnColPrefix = prefix
            break
          }
        }
        // 如果当前类属于断点 col 但不是最高断点 → 跳过
        if (cnColPrefix && cnColPrefix !== highestColPrefix) {
          const bpName = cnColPrefix.replace(/-$/, '')
          const bpLevel = colBP[bpName] ?? 0
          if (bpLevel < highestColBP) continue
        }
        // 如果当前类是无断点 col（col-数字）但存在断点 col → 跳过无断点
        if (!cnColPrefix && COL_PLAIN_RE.test(cn) && highestColBP > 0) {
          continue
        }
      }
      const cls = cssMap.get(cn)
      if (cls) Object.assign(mergedStyle, resolveStyleVars(cls, vars))
    }
  }

  // 后代选择器样式（特异性 0,n,0，n>=1）放在 class 规则之后
  // 这样 `.parent .child` (0,2,0) 可以覆盖 `.child` (0,1,0) 的对应属性
  // 也能覆盖 tag 选择器 (0,0,1)
  const parentClassHint = (parentChildStyles['__hint_parent_class__'] || '').split(' ').filter(Boolean)
  const allAncestorClasses = (parentChildStyles['__all_ancestor_classes__'] || '').split(' ').filter(Boolean)
  const allClassesToCheck = new Set([...parentClassHint, ...allAncestorClasses])
  for (const pc of allClassesToCheck) {
    if (!pc) continue
    // __desc_of__<parentCls>__<tag>
    const descKey = `__desc_of__${pc}__${tag}`
    const descStyles = cssMap.get(descKey)
    if (descStyles) {
      for (const [k, v] of Object.entries(descStyles)) {
        mergedStyle[k] = resolveStyleVars({ [k]: v }, vars)[k]
      }
    }
    // __desc_of__<parentCls>__<className> （class 元素使用）
    if (elClass) {
      const classes = elClass.split(/\s+/)
      for (const cn of classes) {
        const classDescKey = `__desc_of__${pc}__${cn}`
        const classDescStyles = cssMap.get(classDescKey)
        if (classDescStyles) {
          for (const [k, v] of Object.entries(classDescStyles)) {
            mergedStyle[k] = resolveStyleVars({ [k]: v }, vars)[k]
          }
        }
      }
    }
  }

  // 内联样式（最高优先级）
  const inline = parseStyleString(el.getAttribute('style') || '')
  // 解析内联样式中的 url() 路径
  for (const [k, v] of Object.entries(inline)) {
    if (typeof v === 'string' && v.includes('url(')) {
      inline[k] = resolveCssUrls(v)
    }
  }
  Object.assign(mergedStyle, resolveStyleVars(inline, vars))

  // 固定/粘性定位在画布里没视口概念，降级为相对定位
  if (mergedStyle.position === 'fixed' || mergedStyle.position === 'sticky') {
    mergedStyle.position = 'relative'
    delete mergedStyle.top
    delete mergedStyle.right
    delete mergedStyle.bottom
    delete mergedStyle.left
  }

  return pickNodeStyle(mergedStyle)
}

/** 从元素的合并样式中收集 CSS 自定义属性（--xxx），用于传递给子元素 */
function collectLocalVars(
  el: Element,
  cssMap: Map<string, Record<string, string>>,
  parentVars: Record<string, string>,
  parentChildStyles: Record<string, string>,
): Record<string, string> {
  const rootVars = cssMap.get('__vars__') || {}
  const vars: Record<string, string> = { ...rootVars, ...parentVars }

  // tag styles (to get --xxx props)
  const tag = el.tagName.toLowerCase()
  const tagStyles = cssMap.get(`__tag_${tag}`)
  if (tagStyles) {
    for (const [k, v] of Object.entries(tagStyles)) {
      if (k.startsWith('--')) vars[k] = resolveStyleVars({ [k]: v }, vars)[k]
    }
  }
  // parent child styles
  for (const [k, v] of Object.entries(parentChildStyles)) {
    if (k.startsWith('--')) vars[k] = resolveStyleVars({ [k]: v }, vars)[k]
  }
  // id styles
  const elId = el.getAttribute('id')
  if (elId) {
    const idStyles = cssMap.get(`__id_${elId}`)
    if (idStyles) {
      for (const [k, v] of Object.entries(idStyles)) {
        if (k.startsWith('--')) vars[k] = resolveStyleVars({ [k]: v }, vars)[k]
      }
    }
  }
  // class styles
  const classAttr = el.getAttribute('class')
  if (classAttr) {
    for (const cn of classAttr.split(/\s+/)) {
      const cls = cssMap.get(cn)
      if (cls) {
        for (const [k, v] of Object.entries(cls)) {
          if (k.startsWith('--')) vars[k] = resolveStyleVars({ [k]: v }, vars)[k]
        }
      }
    }
  }
  // inline styles
  const inline = parseStyleString(el.getAttribute('style') || '')
  for (const [k, v] of Object.entries(inline)) {
    if (k.startsWith('--')) vars[k] = v
  }
  return vars
}

/** 根据父元素的 class 和 id 收集所有 .class > * / #id > * 的样式 */
function getParentChildStyles(parentEl: Element, cssMap: Map<string, Record<string, string>>, allAncestorClasses: string[] = []): Record<string, string> {
  const result: Record<string, string> = {}
  // 收集父元素的 class 对应的 __child_of__ 样式
  const parentClass = parentEl.getAttribute('class')
  if (parentClass) {
    for (const cn of parentClass.split(/\s+/)) {
      const childStyles = cssMap.get(`__child_of__${cn}`)
      if (childStyles) Object.assign(result, childStyles)
    }
    // 提示：父级 class 列表，供子元素查找 __desc_of__ 规则
    result['__hint_parent_class__'] = parentClass
  }
  // 收集父元素的 id 对应的 __child_of_id__ 样式
  const parentId = parentEl.getAttribute('id')
  if (parentId) {
    const childStyles = cssMap.get(`__child_of_id__${parentId}`)
    if (childStyles) Object.assign(result, childStyles)
  }
  // 提示：所有祖先 class 链，供子元素查找 __desc_of__ 规则（如 header.masthead .masthead-heading）
  // 包含父级的 class + 之前传入的所有祖先 class
  const combined = [...allAncestorClasses]
  if (parentClass) {
    for (const cn of parentClass.split(/\s+/)) {
      if (cn) combined.push(cn)
    }
  }
  if (combined.length > 0) {
    result['__all_ancestor_classes__'] = combined.join(' ')
  }
  return result
}

/** 构建节点（不递归子元素） */
function buildElement(
  el: Element,
  parentW: number,
  cssMap: Map<string, Record<string, string>>,
  isRoot: boolean = false,
  inheritedVars: Record<string, string> = {},
  parentChildStyles: Record<string, string> = {},
  inheritedStyle: Record<string, string> = {},
  parentDisplay: string = '',
): { el: Element; type: string; style: Record<string, string>; pad: ReturnType<typeof parsePadding>; props: Record<string, unknown>; effectiveW: number; node: CanvasNode; localVars: Record<string, string>; childStyles: Record<string, string>; inheritedStyle: Record<string, string> } {
  // PageForge 导出格式：data-pf-type 属性直接指定类型，跳过 inferType 推断
  const pfType = el.getAttribute('data-pf-type')
  const type: ComponentType = (pfType as ComponentType) || inferType(el)
  const tag = el.tagName.toLowerCase()
  const elClass = el.getAttribute('class') || ''
  let style = extractElementStyle(el, cssMap, inheritedVars, parentChildStyles) as Record<string, string>

  // 后代选择器样式已在 extractElementStyle 内部应用（与 tag 样式具有正确的 CSS 特异性优先级）
  // 此处不再重复应用，否则会覆盖已通过特异性排序的结果

  // CSS 继承：对于 inheritable 属性，如果当前元素未设置，则从父元素继承
  // 注意：必须在 extractElementStyle 之后再做继承，否则会覆盖该函数内的特异性结果
  for (const prop of INHERITED_PROPS) {
    if (!style[prop] && inheritedStyle[prop]) {
      style[prop] = inheritedStyle[prop]
    }
  }
  // 构建本元素的 "继承样式"（自身样式 + 父级继承，用于传递给子元素）
  const computedInheritedStyle: Record<string, string> = { ...inheritedStyle }
  for (const prop of INHERITED_PROPS) {
    if (style[prop]) computedInheritedStyle[prop] = style[prop] as string
  }
  // 合并 padding 简写和独立 padding 属性
  // CSS 级联规则：padding 简写在「同优先级」下会覆盖独立 padding-* 属性。
  // 但跨规则时（如 .timeline { padding:0 } vs ul { padding-left:2rem }），
  // 高优先级的简写应覆盖低优先级的独立属性。
  // 解决：如果 padding 简写被设置，让它覆盖所有独立 padding-* 属性
  // （模拟真实 CSS 中 padding 简写展开 4 个独立值的行为）
  const basePad = parsePadding(style.padding)
  const hasPaddingShorthand = style.padding !== undefined && style.padding !== ''
  const padTop = hasPaddingShorthand ? basePad.top : (style.paddingTop ? parseDim(style.paddingTop) : 0)
  const padRight = hasPaddingShorthand ? basePad.right : (style.paddingRight ? parseDim(style.paddingRight) : 0)
  const padBottom = hasPaddingShorthand ? basePad.bottom : (style.paddingBottom ? parseDim(style.paddingBottom) : 0)
  const padLeft = hasPaddingShorthand ? basePad.left : (style.paddingLeft ? parseDim(style.paddingLeft) : 0)
  const pad = {
    top: padTop,
    right: padRight,
    bottom: padBottom,
    left: padLeft,
  }
  // 收集本元素定义的 CSS 自定义属性，传递给子元素
  const localVars = collectLocalVars(el, cssMap, inheritedVars, parentChildStyles)
  // 本元素给子元素的 > * 样式 + 传递祖先 class 链（用于 __desc_of__ 跨级查找）
  const prevAncestors = (parentChildStyles['__all_ancestor_classes__'] || '').split(' ').filter(Boolean)
  const childStyles = getParentChildStyles(el, cssMap, prevAncestors)

  // 特殊处理：navbar-nav（Bootstrap 导航菜单 ul/ol）
  // @media (min-width:992px){.navbar-expand-lg .navbar-nav{flex-direction:row}}
  // 这条规则被 extractRules 整体跳过（@media 规则不递归提取），
  // 导致 navbar 永远显示为移动端 column 模式。PageForge 画布是桌面端，
  // 这里强制水平布局，避免 nav-item 一行一个。
  if ((tag === 'ul' || tag === 'ol') && /\bnavbar-nav\b/.test(elClass)) {
    style.display = 'flex'
    style.flexDirection = 'row'
    // 居中：navbar-nav 上常带 ms-auto（margin-left:auto），会导致 ul 被推到右侧
    // 在绝对定位布局中这不起作用，已通过 ms-auto 特殊处理将 x 设为右缘位置。
    // ⚠️ 不要设置 justifyContent: flex-end，否则 flex 布局会忽略子元素 x 坐标，
    // 把 nav-items 推到 ul 自身的最右端（画布外），导致菜单项完全不可见。
    if (!style.alignItems) style.alignItems = 'center'
    // gap 对应原模板的 .nav-link padding (px-lg-3 = 1rem=16px) + .nav-item margin (mx-lg-1 = 0.25rem=4px) 总和约 40px
    if (!style.gap) style.gap = '32px'
    // 去掉可能的 padding-left:0 / list-style:none 干扰（ul 默认 padding-left:40px + list-style:disc）
    if (!style.paddingLeft) style.paddingLeft = '0'
    if (!style.listStyle || style.listStyle === 'disc') style.listStyle = 'none'
  }
  // 特殊处理：navbar-collapse（Bootstrap 导航菜单折叠容器）
  // 原 HTML: <div class="collapse navbar-collapse" id="navbarResponsive">
  // CSS .collapse:not(.show){display:none} 把它设为 display:none，
  // 但实际上 .navbar-expand-lg .navbar-collapse{display:flex!important} 在桌面端会覆盖。
  // PageForge 画布是桌面端，直接强制 display:flex 并跳过"display:none"过滤，
  // 否则整个菜单子树会被 htmlToNodes / populateChildren 跳过，导致 PORTFOLIO/ABOUT/CONTACT 全部丢失。
  if (tag === 'div' && /\bnavbar-collapse\b/.test(elClass)) {
    style.display = 'flex'
    // 保持 flex-basis:auto 让它正常伸展（align-items: center 让菜单垂直居中）
    if (!style.alignItems) style.alignItems = 'center'
    if (!style.justifyContent) style.justifyContent = 'flex-end'
    // 删除 display:none 残留（避免后续 skip 过滤误判）
    delete style.displayNone
  }
  // 特殊处理：li.nav-item（Bootstrap 导航菜单项）
  // 关键修复：a.nav-link 的 padding 是 1rem 上 + 1rem 下 + 24px 文本 = 56px。
  // 但 estimateHeightRecursive 用 padding 简写 "0.5rem 0"（来自 py-3）+ 24px 文本 = 40px，
  // 忽略了 paddingTop/paddingBottom 的覆盖，导致 li.nav-item 高度估算错误（Portfolio 64px vs About/Contact 40px），
  // 三个菜单项垂直对齐错乱（Portfolio 上移 12px）。
  // 解决方案：强制 li.nav-item 高度为 56px，与 a.nav-link 实际内容高度一致，确保三个菜单项基线对齐。
  if (tag === 'li' && /\bnav-item\b/.test(elClass)) {
    style.minHeight = '56px'
    style.height = '56px'
  }
  // 特殊处理：timeline-image（圆形头像图片容器）默认居中显示
  if (tag === 'div' && /\btimeline-image\b/.test(elClass)) {
    // 容器需要固定尺寸（170x170）以便绝对居中
    if (!style.width) style.width = '170px'
    if (!style.height) style.height = '170px'
    // 黄色圆形按钮（来自 .timeline > li .timeline-image CSS）
    if (!style.backgroundColor) style.backgroundColor = '#ffc800'
    if (!style.borderRadius) style.borderRadius = '100%'
    if (!style.border) style.border = '7px solid #e9ecef'
    // 强制白色（无论父级是 inherit 还是其他 #212529）
    style.color = '#fff'
    // 强制 center（原版 CSS .timeline>li .timeline-image { text-align: center }）
    // 不用 if 判断，避免被 __child_of__timeline-inverted 的 text-align:left 污染
    style.textAlign = 'center'
    if (!style.zIndex) style.zIndex = '100'
    if (!style.display) style.display = 'flex'
    if (!style.alignItems) style.alignItems = 'center'
    if (!style.justifyContent) style.justifyContent = 'center'
    // timeline-image 由 populateChildren 计算居中 x，这里只设 absolute
    // 不设 CSS left/margin-left（会被 CanvasElement 的 node.style.x 覆盖，造成混乱）
    style.position = 'absolute'
    style.top = '0'
    // 清掉可能从 CSS 污染来的属性，避免与 timeline-image 的固定布局冲突
    delete style.left
    delete style.marginLeft
    delete style.padding
    delete style.paddingLeft
    delete style.paddingRight
    delete style.paddingTop
    delete style.paddingBottom
  }
  // 特殊处理：timeline-image 内的 h4（CSS .timeline>li .timeline-image h4 被跳过）
  // 这是「Be Part Of Our Story!」的 CTA 按钮，必须显示为白字黄色圆形
  // 强制覆盖，避免被 .timeline .timeline-heading h4 { color: inherit; margin-top: 0 } 覆盖
  const parentClass = el.parentElement?.getAttribute('class') || ''
  if ((tag === 'h4' || tag === 'h3' || tag === 'h2' || tag === 'h1') && /\btimeline-image\b/.test(parentClass)) {
    if (!style.fontSize) style.fontSize = '18px'
    if (!style.lineHeight) style.lineHeight = '26px'
    // 处理 marginTop 被 .timeline .timeline-heading h4 { margin-top: 0 } 覆盖的情况
    if (!style.marginTop || style.marginTop === '0' || style.marginTop === '0px' || style.marginTop === '0rem') {
      style.marginTop = '40px'
    }
    if (!style.marginBottom) style.marginBottom = '0'
    // 强制白色（无论父级是 inherit 还是其他）
    style.color = '#fff'
    if (!style.fontWeight) style.fontWeight = '700'
  }
  // 特殊处理：timeline-panel 占据一侧（左或右由父级 li 的 timeline-inverted 决定）
  if (tag === 'div' && /\btimeline-panel\b/.test(elClass)) {
    // panel 占据约 41% 宽度
    if (!style.width) style.width = '41%'
    // 通过查看祖先 li 的 class 决定 padding 与对齐方向
    let p: Element | null = el.parentElement
    let isInverted = false
    while (p) {
      if (p.tagName?.toLowerCase() === 'li' && /\btimeline-inverted\b/.test(p.getAttribute('class') || '')) {
        isInverted = true
        break
      }
      p = p.parentElement
    }
    if (isInverted) {
      // inverted panel: 占据 li 右侧，content 左对齐
      // 用 style.right 作为 inverted 标记（float 不在 KNOWN_PROPS 中会被过滤）
      // populateChildren 检测到 right 会把 panel 放到 li 右侧
      style.right = '0'
      style.paddingRight = '100px'
      style.paddingLeft = '20px'
      style.textAlign = 'left'
    } else {
      // 普通 panel: 占据 li 左侧，content 右对齐
      style.paddingLeft = '100px'
      style.paddingRight = '20px'
      style.textAlign = 'right'
    }
    // panel 用 absolute 定位，由 populateChildren 计算 x/y
    style.position = 'absolute'
    style.top = '0'
    delete style.left
    delete style.float
    // 重新计算 pad 以包含新设置的 padding 值（pad 是在函数顶部根据原 CSS 计算的）
    pad.left = parseDim(style.paddingLeft) || 0
    pad.right = parseDim(style.paddingRight) || 0
    pad.top = parseDim(style.paddingTop) || 0
    pad.bottom = parseDim(style.paddingBottom) || 0
  }
  // 特殊处理：timeline 下的 li 元素，需要设置 min-height 和垂直布局
  if (tag === 'li' && /\btimeline/.test(parentChildStyles['__hint_parent_class__'] || '')) {
    style.minHeight = '170px'
    // li 用 block + overflow:hidden 让内部 float 元素撑起高度
    style.display = 'block'
    style.position = 'relative'
    style.overflow = 'hidden'
  }

  // 提取 props
  const props: Record<string, unknown> = {}

  if (elClass) {
    props.class = elClass
  }

  if (type === 'heading') {
    props.text = getText(el)
    props.level = extractLevel(tag)
  } else if (type === 'text') {
    props.text = getText(el)
  } else if (type === 'image') {
    // 外层 src（裸 <img data-pf-type>） 或内层 <img> src（PageForge 导出格式：<div data-pf-type><img/></div>）
    const innerImg = el.tagName.toLowerCase() === 'img' ? (el as HTMLImageElement) : el.querySelector('img')
    props.src = resolveUrl(el.getAttribute('src') || innerImg?.getAttribute('src') || '')
    props.alt = el.getAttribute('alt') || innerImg?.getAttribute('alt') || ''
  } else if (type === 'button') {
    props.text = getText(el)
  } else if (type === 'input') {
    props.placeholder = el.getAttribute('placeholder') || ''
    props.text = (el as HTMLInputElement).value || el.getAttribute('value') || ''
  } else if (type === 'divider') {
	    // 无内容
	  } else if (type === 'card') {
	    // Card 结构：外层 div > 两个内层 div（标题 + 副标题）
	    const innerDivs = el.querySelectorAll(':scope > div')
	    if (innerDivs.length >= 1) {
	      props.text = getText(innerDivs[0])
	      const titleCss = parseStyleString(innerDivs[0].getAttribute('style') || '')
	      if (titleCss.fontSize) props.titleFontSize = titleCss.fontSize
	      if (titleCss.color) props.titleColor = titleCss.color
	    }
	    if (innerDivs.length >= 2) {
	      props.subtitle = getText(innerDivs[1])
	      const subCss = parseStyleString(innerDivs[1].getAttribute('style') || '')
	      if (subCss.fontSize) props.subtitleFontSize = subCss.fontSize
	      if (subCss.color) props.subtitleColor = subCss.color
	    }
	  } else if (type === 'video') {
    // 外层或内层 <video> src
    const innerVid = el.tagName.toLowerCase() === 'video' ? (el as HTMLVideoElement) : el.querySelector('video')
    props.src = resolveUrl(el.getAttribute('src') || innerVid?.getAttribute('src') || '')
    props.poster = el.getAttribute('poster') || innerVid?.getAttribute('poster') || ''
  } else if (type === 'iframe') {
    const innerIframe = el.tagName.toLowerCase() === 'iframe' ? (el as HTMLIFrameElement) : el.querySelector('iframe')
    props.src = resolveUrl(el.getAttribute('src') || innerIframe?.getAttribute('src') || '')
    props.alt = el.getAttribute('title') || innerIframe?.getAttribute('title') || ''
  } else if (type === 'container') {
    // 容器：尝试提取标题和副标题模式
    const h = el.querySelector('h1, h2, h3, h4, h5, h6')
    const p = el.querySelector('p')
    if (h) {
      props.text = getText(h)
      props.level = extractLevel(h.tagName)
    }
    if (p) {
      props.subtitle = getText(p)
    }
  } else if (type === 'navbar') {
    // 提取 logo：第一个 span（或第一段文本）
    const firstSpan = el.querySelector('span, a')
    if (firstSpan) {
      const logoText = (firstSpan.textContent || '').trim()
      if (logoText) props.logo = logoText
    }
    // 提取 navLinks：收集容器内所有 <span>/<a> 的文本（logo 之外的）
    const linkTexts: string[] = []
    el.querySelectorAll('span, a').forEach((n) => {
      const t = (n.textContent || '').trim()
      if (t && t !== props.logo) linkTexts.push(t)
    })
    if (linkTexts.length > 0) {
      props.navLinks = linkTexts.join(',')
    }
  } else if (type === 'icon') {
    // Icon 导出格式：<div data-pf-type="icon"><span>📊</span><span>文本</span></div>
    // 第一个 span 是图标（emoji 文本或 SVG），第二个 span 是文字
    const spans = el.querySelectorAll(':scope > span')
    if (spans.length >= 1) {
      const firstSpan = spans[0]
      const svg = firstSpan.querySelector('svg')
      if (svg) {
        // 命名图标（SVG）：通过 path d 属性反向匹配图标名称
        const pathD = svg.querySelector('path')?.getAttribute('d') || ''
        let iconName = ''
        for (const [name, data] of Object.entries(ICON_PATHS)) {
          if (data.d === pathD || data.paths?.some(p => p.d === pathD)) {
            iconName = name
            break
          }
        }
        props.icon = iconName || 'star'
      } else {
        // Emoji 或自定义图标：取文本内容
        props.icon = (firstSpan.textContent || '').trim() || 'star'
      }
    }
    if (spans.length >= 2) {
      props.text = getText(spans[1])
    }
  }

  let effectiveW = parentW
  // 解析 CSS 宽度（百分比等），子节点用这个实际宽度做参考
  const cssW = resolveWidth(style.width, parentW)
  if (style.width) {
    effectiveW = cssW
  }
  // 根容器受 max-width 约束（用 resolveWidth 正确处理百分比值如 100%）
  if (isRoot && style.maxWidth) {
    const mw = resolveWidth(style.maxWidth, parentW)
    if (!isNaN(mw) && mw < effectiveW) effectiveW = mw
  }

  // PageForge 导出格式：从 inline style 的 left/top 提取坐标
  // 注意：保留 style 中的 left/top（populateChildren 需要它们判断绝对定位），
  // 但在 node.style 中删除 left/top 避免 CSS 与 transform 双重定位
  const pfLeft = pfType ? (parseFloat(style.left) || 0) : undefined
  const pfTop = pfType ? (parseFloat(style.top) || 0) : undefined

  const isPfExport = !!pfType

  // 计算宽度
  // 关键：父容器是 flex/inline-flex/grid 时，子元素默认 width:auto（让 flex/grid 自行计算尺寸）。
  // 否则在 Bootstrap navbar 这种场景，所有子元素被强制成 width:parentW（1200px），
  // flex 容器会被撑爆成单列、排版全乱。
  // 另外，inline/inline-block 元素（a/span/button/img/input 等）即使在 block column flow 中
  // 也应 width:auto，由内容撑开宽度，否则会被强制成 100% 父宽撑爆布局（如 navbar-brand a）。
  const parentIsFlex = parentDisplay.includes('flex') || parentDisplay.includes('grid')
  const isInlineLike = isInlineLikeTag(tag)
  const widthComputed = isPfExport
    ? (style.width
        ? { width: resolveWidth(style.width, parentW) + 'px' }
        : (type === 'text'
          ? { width: Math.max(80, parentW) + 'px' }
          : {}))
    : (parentIsFlex
        // 父是 flex/grid：保持 width 不强制，让 flex 容器自行计算子元素尺寸
        // （当元素有显式 width 时仍保留，否则用 auto 由 flex 决定）
        ? (style.width
            ? { width: resolveWidth(style.width, parentW) + 'px' }
            : { width: 'auto' as any })
        // 父是 block (column flow)：仅 block-like 元素填满父宽，
        // inline/inline-block 元素（a/span/button/img 等）保持 auto
        : (style.width
            ? { width: resolveWidth(style.width, parentW) + 'px' }
            : (isInlineLike
                ? { width: 'auto' as any }
                : (style.display !== 'inline-block' && style.display !== 'inline-flex')
                  ? { width: effectiveW + 'px' }
                  : { width: 'auto' as any })))

  const nodeStyleBase: Record<string, unknown> = {
    x: pfLeft ?? 0,
    y: pfTop ?? 0,
    ...style,
    ...widthComputed,
    // 根节点保持 absolute（CanvasElement 的 isRoot 处理）；
    // 非根节点：仅当 CSS 显式声明 absolute/fixed 时才 absolute，其余用 relative 参与 flex/flow 布局
    ...(isRoot ? {} : (style.position === 'absolute' || style.position === 'fixed' ? {} : { position: 'relative' as any })),
  }
  // PageForge 导出：删除 node.style 中的 left/top（画布用 x/y + transform 定位）
  // 不设为 'auto'（会污染 nodeToCss 输出，导致 DragOverlay 预览位置错误）
  if (pfType) {
    delete nodeStyleBase.left
    delete nodeStyleBase.top
  }

  const node: CanvasNode = {
    id: nid(),
    type,
    props: props as CanvasNode['props'],
    style: nodeStyleBase as NodeStyle,
    children: [],
  }

  return { el, type, style: style as Record<string, string>, pad, props, effectiveW, node, localVars, childStyles, inheritedStyle: computedInheritedStyle }
}

/** 填充子元素（按 flex 规则排布） */
function populateChildren(
  parentEl: Element,
  parentNode: CanvasNode,
  parentStyle: Record<string, string>,
  parentPad: ReturnType<typeof parsePadding>,
  parentEffectiveW: number,
  cssMap: Map<string, Record<string, string>>,
  inheritedVars: Record<string, string> = {},
  parentChildStyles: Record<string, string> = {},
  inheritedStyle: Record<string, string> = {},
): void {
  if (parentNode.type !== 'container' || parentEl.children.length === 0) return

  const childW = Math.max(100, parentEffectiveW - parentPad.left - parentPad.right)
  let childY = parentPad.top
  const childX = parentPad.left

  const display = parentStyle.display || ''
  const parentIsFlex = display.includes('flex') || display.includes('grid')
  const flexDir = (parentStyle.flexDirection as string) || 'row'
  const flexWrap = (parentStyle.flexWrap as string) || 'nowrap'
  const parentPos = (parentStyle.position as string) || ''
  // 父元素的负 margin（Bootstrap row 特征：margin-left/right: calc(-.5 * gutter)）
  // 负 margin 让子元素可以超出父元素边缘，配合子元素的 padding 实现 gutter 效果
  // 注意：仅当父元素是「流式定位」（position 为 static/relative）时，margin 才会影响子元素布局。
  // 对于 absolute 定位的父元素，其 margin 不应传染给子元素（绝对定位元素的子元素在父元素的内容盒里正常布局）
  const parentMarginLeft = (parentPos === 'absolute' || parentPos === 'fixed') ? 0 : (parseFloat(parentStyle.marginLeft) || 0)
  const parentMarginRight = (parentPos === 'absolute' || parentPos === 'fixed') ? 0 : (parseFloat(parentStyle.marginRight) || 0)
  const hasNegativeRowMargin = parentMarginLeft < 0 || parentMarginRight < 0
  const baseGap = parentStyle.gap ? parseFloat(parentStyle.gap) : 16
  // 如果是负 margin 的 row（Bootstrap 风格），gutter 已经在子元素 padding 中处理，不需要额外 gap
  const gap = hasNegativeRowMargin ? 0 : baseGap
  const isFlex = display.includes('flex')
  const isRow = isFlex && flexDir !== 'column'

  const validChildren = Array.from(parentEl.children).filter(c => {
    const ct = c.tagName.toLowerCase()
    return ct !== 'style' && ct !== 'script'
  })

  if (isRow) {
    // 第一遍：仅构建子节点（不递归），计算 cW
    const parsedChildren = validChildren.map(child => {
      const built = buildElement(child, childW, cssMap, false, inheritedVars, parentChildStyles, inheritedStyle, display)
      let cW = resolveWidth(built.node.style.width, childW)
      // 关键修复：flex 容器中 width: 'auto' 表示「内容撑开」，
      // 必须把 cW 标记为 0 让后续按内容估算，不能用 resolveWidth 解析出的 parentW。
      // 否则在 Bootstrap navbar 这种场景，a.navbar-brand / div.navbar-collapse 都会被强制成父容器宽度，
      // 导致菜单元素全部溢出画布右缘。
      if (built.node.style.width === 'auto') {
        cW = 0
      }
      const grow = parseFloat(built.node.style.flexGrow || '0') || 0
      // 关键修复：flex-basis: 'auto' 在 flex 布局里表示「用 width 属性」（width 又是 auto 时则用内容宽度），
      // 不能用 resolveWidth 解析为 parentW。这里标记为 null（含义：未指定明确 basis 值），
      // 后续 grow 分配时不强制至少满足该值。
      const flexBasis = (built.node.style.flexBasis && built.node.style.flexBasis !== 'auto')
        ? resolveWidth(built.node.style.flexBasis, childW)
        : null
      return { child, built, cW, grow, flexBasis }
    }).filter(pc => {
      // 跳过 display: none 的元素
      if (pc.built.node.style.display === 'none') return false
      return true
    })

    const totalGap = (parsedChildren.length - 1) * gap
    const availW = Math.max(100, childW - totalGap)

    // 关键修复：分离「固定宽度」和「可伸展（flex-grow）」两类元素。
    // 之前把所有 flex-grow 元素都堆到 growTotal 但没更新 cW，导致 navbar-collapse
    // （flex-grow:1 flex-basis:100%）的 cW 停留在 200px（内容宽度），没有占满剩余空间，
    // 进而其内部的 ul.navbar-nav(ms-auto) 也无法被推到画布右缘。
    // 正确逻辑：
    //   1. 先计算所有「无 grow」元素的固定总宽 usedW
    //   2. 把 availW - usedW 全部剩余空间按 grow 比例分配给有 grow 的元素
    //   3. grow 元素至少要满足自己的 flexBasis（如果指定了）
    let usedW = 0
    let growTotal = 0
    const fixedChildren: typeof parsedChildren = []
    const growChildren: typeof parsedChildren = []
    for (const pc of parsedChildren) {
      if (pc.grow > 0) {
        growTotal += pc.grow
        growChildren.push(pc)
        continue
      }
      // 无 grow：先按 flexBasis / 显式 width / 估算内容宽度算 cW
      if (pc.flexBasis != null) {
        pc.cW = pc.flexBasis
      } else if (pc.cW >= childW * 0.9) {
        // cW 已经是父容器宽度的 90% 以上（如 width:100%），保持
        // 保持现状
      } else if (pc.cW <= 0) {
        // cW 是 0（width: auto 的 flex 子元素），按内容估算
        // 关键修复：textContent 会包含元素之间的缩进/换行（多 3-5 倍字符），
        // 估算前必须先折叠空白，避免 nav-item 之间的空白被误算成可见字符。
        // 典型 bug：Bootstrap navbar 的 ul.navbar-nav.textContent = 133 字符（含空白），
        // 估算宽度 1319px 被 childW=1136 截断，导致 ul 占满整个 navbar-collapse，
        // 加上 ms-auto 推右缘时 x = 1136 - 1136 = 0，又回到左缘。
        const text = (pc.child.textContent || '').replace(/\s+/g, ' ').trim()
        const textLen = text.length
        const hasCJK = /[一-龥ぁ-んァ-ヶ]/.test(text)
        // 关键修复：考虑 font-size、text-transform: uppercase、font-weight 对字符宽度的影响
        // 默认 16px sans-serif 字符约 0.55em，但 1.75em 的大字 + uppercase 会显著更宽
        let fontSize = parseDim(pc.built.node.style.fontSize) || 16
        if (fontSize < 8) fontSize = 16
        const fontWeight = pc.built.node.style.fontWeight || '400'
        const isBold = fontWeight === 'bold' || /^([6-9]\d{2})$/.test(fontWeight)
        const isUpper = pc.built.node.style.textTransform === 'uppercase' || /\btext-uppercase\b/.test(pc.built.style?.textTransform || '') || /\btext-uppercase\b/.test(pc.child.getAttribute('class') || '')
        // 字符宽度系数：英文小写 0.55、英文大写 0.62、中文 1.0、bold 加 0.05
        let charRatio = hasCJK ? 1.0 : (isUpper ? 0.62 : 0.55)
        if (isBold) charRatio += 0.05
        const charW = charRatio * fontSize
        const estW = Math.round(textLen * charW)
        const padL = parseDim(pc.built.node.style.paddingLeft) || 0
        const padR = parseDim(pc.built.node.style.paddingRight) || 0
        const marginL = parseDim(pc.built.node.style.marginLeft) || 0
        const marginR = parseDim(pc.built.node.style.marginRight) || 0
        pc.cW = Math.min(Math.max(estW + padL + padR + marginL + marginR, 24), childW)
      }
      // cW 是 0 且有 display 块级，但没有文本（如纯视觉分隔线 div），
      // 强制给一个最小宽度，避免被吃成 0
      if (pc.cW <= 0) pc.cW = 24
      usedW += pc.cW
      fixedChildren.push(pc)
    }
    const remainW = Math.max(0, availW - usedW)
    // 把剩余空间按 grow 比例分配给 growChildren
    // 关键修复：grow 元素即使有 flexBasis（如 navbar-collapse 的 100%），也不应让固定
    // 元素被挤压。我们用「最大宽度」而非「基础宽度」：
    //   - 如果 flexBasis > availW 总量，grow 元素只能拿到自己那份，固定元素保持
    //   - 如果 flexBasis 之和 <= availW，grow 元素可分配到 (availW - fixedW)
    for (const pc of growChildren) {
      if (growTotal > 0) {
        pc.cW = Math.max(pc.flexBasis ?? 0, Math.floor(remainW * (pc.grow / growTotal)))
      } else {
        pc.cW = Math.floor(availW / growChildren.length)
      }
    }

    // 第二遍：用 cW 作为 effectiveW 真正递归子元素
    // 如果父级有负 margin（如 Bootstrap row），子元素 x 起点需要补偿到父级左缘之外
    let rowX = childX + parentMarginLeft
    let rowY = childY
    let maxRowH = 0
    for (let i = 0; i < parsedChildren.length; i++) {
      const { child, built, cW } = parsedChildren[i]
      if (flexWrap === 'wrap' && rowX + cW > childX + childW + gap && i > 0) {
        rowX = childX + parentMarginLeft
        rowY += maxRowH + gap
        maxRowH = 0
      }
      // PageForge 导出格式：子元素有 data-pf-type，保留 buildElement 中已设置的绝对坐标
      const isPfExport = child.hasAttribute('data-pf-type')
      const cssPos = (built.style.position as string) || ''
      const isCssAbs = cssPos === 'absolute' || cssPos === 'fixed'
      if (isPfExport && isCssAbs) {
        // 保留 buildElement 设置的 x/y（来自 left/top），不覆盖
        // PF 导出元素的宽度已在 buildElement 中正确设置，不再覆盖
        populateChildren(child, built.node, built.style, built.pad, cW, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
        const cH = estimateHeightRecursive(child, built.node.style, cssMap)
        maxRowH = Math.max(maxRowH, cH)
        rowX += cW + gap
        parentNode.children.push(built.node)
        continue
      }
      // 特殊处理：timeline-image 始终居中显示
      const childClass = child.getAttribute('class') || ''
      if (/\btimeline-image\b/.test(childClass)) {
        // 居中：x = (父容器宽 - 元素宽) / 2 + 父容器左缘
        built.node.style.x = childX + Math.floor((childW - cW) / 2)
      } else if (/\btimeline-panel\b/.test(childClass)) {
        // timeline-panel 通过 float:right/left 控制左右
        if (built.style.float === 'right' || built.style.right !== undefined) {
          built.node.style.x = childX + childW - cW
        } else {
          built.node.style.x = childX
        }
      } else if (built.style.marginLeft === 'auto' || built.style.marginInlineStart === 'auto' || /\bms-auto\b/.test(childClass)) {
        // 关键修复：flex 子元素带 margin-left:auto（即 Bootstrap ms-auto），
        // 在 flex 布局中会把元素推到容器右缘。我们用绝对 x = 父容器右缘 - 元素宽 模拟。
        // 典型 bug：Bootstrap navbar 的 ul.navbar-nav.ms-auto 没被推到右侧，导致菜单和 logo 重叠。
        built.node.style.x = childX + childW - cW
        // margin-left:auto 在 absolute 定位里没意义，删掉避免污染样式
        delete built.node.style.marginLeft
        delete built.node.style.marginInlineStart
      } else if (parentStyle.justifyContent === 'center' || (parentStyle.display || '').includes('flex') && (parentStyle.textAlign as string) === 'center' && (built.node.style.display === 'inline-block' || built.node.style.display === 'inline-flex')) {
        // 父级是 flex 居中（或 text-align: center + 子元素 inline-*），居中放置
        const finalW = (built.node.style.width === 'auto') ? cW : resolveWidth(built.node.style.width, childW)
        if (finalW > 0 && finalW < childW) {
          built.node.style.x = childX + Math.floor((childW - finalW) / 2)
        } else {
          built.node.style.x = rowX
        }
      } else {
        built.node.style.x = rowX
      }
      built.node.style.y = rowY
      // 关键修复：PageForge 中子节点是独立 absolute 定位的兄弟节点，不是 DOM 子元素。
      // 在 flex 容器中保持 width:auto 会导致 flex 无法看到内容，宽度解析为 0（被 min-width 提升到 1px），
      // 典型 bug：Bootstrap navbar 的 <li class="nav-item"> 宽度只有 1px，导致 nav 菜单不可见。
      // 因此无论父容器是 flex 还是 block，都需要显式设置 width 为计算值 cW。
      if (isRow && (built.node.style.width === undefined || built.node.style.width === 'auto')) {
        built.node.style.width = cW + 'px'
      } else if (built.node.style.width === 'auto' && (built.node.style.display === 'inline-block' || built.node.style.display === 'inline-flex')) {
        // 对于 inline-block/inline-flex 元素，保持 width:auto 不覆盖
        // 保持 'auto'
      } else {
        built.node.style.width = cW + 'px'
      }
      populateChildren(child, built.node, built.style, built.pad, cW, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
      const cH = estimateHeightRecursive(child, built.node.style, cssMap)
      maxRowH = Math.max(maxRowH, cH)
      rowX += cW + gap
      parentNode.children.push(built.node)
    }
    // row 布局也设 minHeight（行总高 + padding）
    const rowTotalH = rowY + maxRowH + parentPad.bottom
    if (rowTotalH > parentPad.top + parentPad.bottom) {
      parentNode.style.minHeight = rowTotalH + 'px'
    }
  } else {
    // Column / Flow 布局
    // 先构建所有子节点，标记 CSS 原始 absolute/fixed 定位（不参与流式布局）
    // 注意：built.node.style.position 已被 canvas 系统覆盖为 'absolute'，
    // 必须用 built.style.position（CSS 原始值）来判断
    const builtChildren = validChildren.map(child => {
      const built = buildElement(child, childW, cssMap, false, inheritedVars, parentChildStyles, inheritedStyle, display)
      const cssPos = (built.style.position as string) || ''
      const isCssAbs = cssPos === 'absolute' || cssPos === 'fixed'
      const isPfExport = child.hasAttribute('data-pf-type')
      return { child, built, isCssAbs, isPfExport }
    }).filter(bc => {
      // 跳过 display: none 的元素
      if (bc.built.node.style.display === 'none') return false
      return true
    })
    for (let i = 0; i < builtChildren.length; i++) {
      const { child, built, isCssAbs, isPfExport } = builtChildren[i]
      const childClass = child.getAttribute('class') || ''
      // 特殊处理：timeline-image 居中显示
      if (/\btimeline-image\b/.test(childClass)) {
        const cw = resolveWidth(built.node.style.width, childW)
        built.node.style.x = childX + Math.floor((childW - cw) / 2)
        built.node.style.y = childY
        if (built.node.style.width !== 'auto') {
          built.node.style.width = cw + 'px'
        }
        populateChildren(child, built.node, built.style, built.pad, cw, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
        parentNode.children.push(built.node)
        if (!isCssAbs) {
          const ch = estimateHeightRecursive(child, built.node.style, cssMap)
          if (!built.node.style.height || built.node.style.height === 'auto') {
            built.node.style.height = `${ch}px`
          }
          childY += ch
          const nextFlow = builtChildren.slice(i + 1).find(bc => !bc.isCssAbs)
          if (nextFlow) childY += gap
        }
        continue
      }
      // 特殊处理：timeline-panel 用 absolute 定位 + right 标记控制左右
      const isTimelinePanel = /\btimeline-panel\b/.test(childClass)
      if (isTimelinePanel) {
        const cw = resolveWidth(built.node.style.width, childW)
        // inverted (style.right 存在) -> 放 li 右侧；普通 -> 放 li 左侧
        if (built.style.right !== undefined) {
          built.node.style.x = childX + childW - cw
        } else {
          built.node.style.x = childX
        }
        // panel 顶部对齐 li 顶部（top: 0 已在 buildElement 设置）
        built.node.style.y = 0
        if (built.node.style.width !== 'auto') {
          built.node.style.width = cw + 'px'
        }
        populateChildren(child, built.node, built.style, built.pad, cw, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
        parentNode.children.push(built.node)
        // 不推进 childY（absolute 不参与 flow）
        continue
      }
      // 对于 css absolute/fixed 元素，使用 left/right/top 决定位置，不覆盖 x/y
	      if (isCssAbs) {
	        const cw = resolveWidth(built.node.style.width, childW)
	        // PF 导出元素：保留 buildElement 中已设置的绝对坐标（来自 left/top），不覆盖
	        // 关键：HTML 的 `left:Xpx` 是相对父容器 padding box（外缘）的，
	        // PageForge 渲染时 `left:node.style.x` 同样相对 padding box（CSS 规范），
	        // 因此 childX/childY（= parentPad）不应当加到 PF 元素的坐标上。
	        if (isPfExport) {
	          // 宽度已在 buildElement 中设置；不做任何覆盖
	          populateChildren(child, built.node, built.style, built.pad, cw, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
	          parentNode.children.push(built.node)
	          continue
	        }
	        // 非 PF 元素：根据 left/right/top 决定位置
	        // 计算 x/y 由 left/top/right/bottom 决定
        if (built.style.left !== undefined || built.style.right !== undefined) {
          if (built.style.right !== undefined && built.style.left === undefined) {
            built.node.style.x = childX + childW - cw
          } else if (built.style.left !== undefined) {
            const left = parseDim(built.style.left)
            built.node.style.x = childX + (isNaN(left) ? 0 : left)
          }
        } else {
          built.node.style.x = childX
        }
        if (built.style.top !== undefined) {
          const top = parseDim(built.style.top)
          built.node.style.y = childY + (isNaN(top) ? 0 : top)
        } else {
          built.node.style.y = childY
        }
        // PF 导出元素的宽度已在 buildElement 中正确设置，不再覆盖
        if (!isPfExport && built.node.style.width !== 'auto') {
          built.node.style.width = cw + 'px'
        }
        populateChildren(child, built.node, built.style, built.pad, cw, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
        parentNode.children.push(built.node)
        continue
      }
      built.node.style.x = childX
      built.node.style.y = childY
      const cw = resolveWidth(built.node.style.width, childW)
      // 仅当元素没有显式 width 时才填满（CSS 中的百分比/像素应该保留）
      if (!built.node.style.width || built.node.style.width === 'auto') {
        // 对于 inline-block/inline-flex 元素，width:auto 表示内容撑开，不覆盖
        if (built.node.style.display !== 'inline-block' && built.node.style.display !== 'inline-flex') {
          built.node.style.width = cw + 'px'
        }
      } else {
        // 显式 width（如 41% / 170px）→ 解析为绝对像素
        built.node.style.width = cw + 'px'
      }
      // 居中处理：父级 text-align: center + 子元素是 inline-block/inline-flex
      // 这种情况下，CSS 会让子元素在行内居中。我们用 x 偏移模拟这个效果
      const parentTextAlign = parentStyle.textAlign as string | undefined
      const childDisplay = built.node.style.display as string | undefined
      if (parentTextAlign === 'center' && (childDisplay === 'inline-block' || childDisplay === 'inline-flex')) {
        let finalCw = resolveWidth(built.node.style.width, childW)
        // width:auto 时（如 .btn 按钮），估算内容宽度：文本长度 * 字体宽度 + padding
        if (!built.node.style.width || built.node.style.width === 'auto') {
          const padL = parseDim(built.style.paddingLeft) || 0
          const padR = parseDim(built.style.paddingRight) || 0
          const fontSize = parseDim(built.style.fontSize) || 16
          const text = (built.props?.text as string) || (built.props?.title as string) || ''
          // 中英文字符粗略估算：英文 0.6em，中文 1em
          const charW = /[一-龥]/.test(text) ? fontSize : fontSize * 0.6
          const textW = text.length * charW
          finalCw = textW + padL + padR
        }
        if (finalCw > 0 && finalCw < childW) {
          built.node.style.x = childX + Math.floor((childW - finalCw) / 2)
        }
      }
      populateChildren(child, built.node, built.style, built.pad, cw, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
      parentNode.children.push(built.node)
      if (!isCssAbs) {
        const ch = estimateHeightRecursive(child, built.node.style, cssMap)
        if (!built.node.style.height || built.node.style.height === 'auto') {
          built.node.style.height = `${ch}px`
        }
        childY += ch
        // gap 只在两个 flow 子元素之间
        const nextFlow = builtChildren.slice(i + 1).find(bc => !bc.isCssAbs)
        if (nextFlow) childY += gap
      }
    }
  }

  // 特殊处理：.timeline 的 ::before 竖线（CSS 伪元素无法渲染，手动添加居中竖线）
  const parentClass = parentEl.getAttribute('class') || ''
  if (/(?:^|\s)timeline(?:\s|$)/.test(parentClass)) {
    const lineH = childY + parentPad.bottom
    // 竖线居中：x = 内容区左缘 + (内容宽 - 线宽) / 2
    // 必须设置 node.style.x，否则 CanvasElement 会用 x=0 覆盖 CSS left:50%
    const lineW = 3
    const lineX = childX + Math.floor((childW - lineW) / 2)
    parentNode.children.push({
      type: 'container',
      id: 'timeline-line',
      props: {},
      style: {
        position: 'absolute',
        x: lineX,
        y: 0,
        width: lineW + 'px',
        height: lineH + 'px',
        backgroundColor: '#e9ecef',
        zIndex: '1',
      },
      children: [],
    } as CanvasNode)
  }

  childY += parentPad.bottom
  if (childY > parentPad.top + parentPad.bottom) {
    parentNode.style.minHeight = childY + 'px'
  }
}

/** 递归解析 DOM 节点 → CanvasNode */
function parseElement(
  el: Element,
  parentW: number,
  cssMap: Map<string, Record<string, string>>,
  isRoot: boolean = false,
  inheritedStyle: Record<string, string> = {},
): CanvasNode {
  const built = buildElement(el, parentW, cssMap, isRoot, {}, {}, inheritedStyle)
  populateChildren(built.el, built.node, built.style, built.pad, built.effectiveW, cssMap, built.localVars, built.childStyles, built.inheritedStyle)
  return built.node
}

/** 当前正在解析的 HTML 的基础路径，用于解析相对路径 */
let currentBaseUrl = ''
let assetFolderPrefix = ''

/** 解析相对路径为绝对路径（img src 等） */
function resolveUrl(src: string): string {
  if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//') || src.startsWith('data:')) {
    return src
  }
  if (src.startsWith('/')) return src
  return currentBaseUrl + src
}

/**
 * 解析 CSS 值中的 url() 路径
 * 处理 ../assets/ -> assetFolderPrefix 的映射（因为内联 CSS 中的相对路径基于原始 CSS 位置，不是 HTML 位置）
 */
function resolveCssUrls(value: string): string {
  if (!value || !value.includes('url(')) return value
  return value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, _quote, rawUrl) => {
    let url = rawUrl.trim()
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('data:')) {
      return `url("${url}")`
    }
    // 内联 CSS 中的 ../assets/ 路径是相对于原始 CSS 文件位置的（css/ 目录下），
    // 对应到模板中实际是 assets-{name}/ 目录
    if (url.startsWith('../assets/') && assetFolderPrefix) {
      url = assetFolderPrefix + url.substring('../assets/'.length)
    } else if (url.startsWith('../')) {
      // 其他 ../ 路径：向上一级目录解析
      const baseParts = currentBaseUrl.replace(/\/$/, '').split('/')
      baseParts.pop()
      const base = baseParts.join('/') + '/'
      url = base + url.substring(3)
    }
    // 相对路径前加上 baseUrl
    if (!url.startsWith('/') && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
      url = currentBaseUrl + url
    }
    return `url("${url}")`
  })
}

/** 检测 HTML 中使用的资源文件夹前缀（如 assets-agency/） */
function detectAssetFolderPrefix(doc: Document): string {
  const firstImg = doc.querySelector('img[src]')
  if (firstImg) {
    const src = firstImg.getAttribute('src') || ''
    const m = src.match(/^(assets-[a-z0-9-]+\/)/i)
    if (m) return m[1]
  }
  // 从 body background 或其他属性检测
  return ''
}

/**
 * 从 PageForge 导出的 HTML 中提取画布配置（背景色、宽度、高度）。
 * 优先读取 .pf-root 上的 data-pf-canvas-* 属性（精确还原原始画布配置），
 * 若缺失则回退到 <style> 块中的 .pf-root{min-height;max-width;background}。
 * 如果不是 PF 导出格式（缺少 .pf-root），则返回默认配置。
 */
export function extractCanvasConfig(html: string): CanvasConfig {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const root = doc.querySelector('.pf-root') as HTMLElement | null
  if (!root) {
    return {
      backgroundColor: '#ffffff',
      width: '1200px',
      height: '800px',
    }
  }

  // 1. 优先使用 data-pf-canvas-* 属性（导出时精确写入）
  const dataW = root.getAttribute('data-pf-canvas-width')
  const dataH = root.getAttribute('data-pf-canvas-height')
  const dataBg = root.getAttribute('data-pf-canvas-bg')
  if (dataW && dataH) {
    return {
      backgroundColor: dataBg || '#ffffff',
      width: dataW,
      height: dataH,
    }
  }

  // 2. 回退：从内联 style 解析
  const inlineStyle = root.getAttribute('style') || ''
  const parsed = parseStyleString(inlineStyle)
  // 3. 也尝试从 <style> 块中的 .pf-root 选择器获取
  const styleEls = doc.querySelectorAll('style')
  for (const el of styleEls) {
    const css = (el.textContent || '').trim()
    const m = css.match(/\.pf-root\s*\{([^}]+)\}/)
    if (m) {
      const inner = m[1]
      const cssParsed = parseStyleString(inner)
      for (const [k, v] of Object.entries(cssParsed)) {
        if (!parsed[k]) parsed[k] = v
      }
    }
  }

  const bg = parsed.background || parsed.backgroundColor || '#ffffff'
  const maxW = parsed.maxWidth || '1200px'
  let height = '800px'
  if (parsed.minHeight) {
    const h = parseInt(String(parsed.minHeight).replace(/px$/i, ''), 10)
    if (h > 0) height = `${h}px`
  }
  return {
    backgroundColor: bg,
    width: maxW,
    height,
  }
}

/**
 * 将 HTML 字符串转换为 PageForge 节点数组
 * 支持内联样式 + <style> 标签中的 class/标签选择器
 */
export function htmlToNodes(html: string, baseUrl = ''): CanvasNode[] {
  idCounter = 0
  currentBaseUrl = baseUrl
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 检测资源文件夹前缀（用于解析 CSS 中 ../assets/ 路径）
  assetFolderPrefix = detectAssetFolderPrefix(doc)

  // 解析所有 <style> 标签
  const cssMap = new Map<string, Record<string, string>>()
  const styleEls = doc.querySelectorAll('style')
  styleEls.forEach((el) => {
    const css = parseStyleTag(el.textContent || '')
    css.forEach((v, k) => {
      const existing = cssMap.get(k) || {}
      cssMap.set(k, { ...existing, ...v })
    })
  })

  // 解析 CSS map 中的 url() 路径
  cssMap.forEach((styles, key) => {
    if (key === '__vars__') return
    for (const [prop, val] of Object.entries(styles)) {
      if (typeof val === 'string' && val.includes('url(')) {
        styles[prop] = resolveCssUrls(val)
      }
    }
  })

  const body = doc.body
  const children = Array.from(body.children).filter(
    (c) => {
      const t = c.tagName.toLowerCase()
      return t !== 'style' && t !== 'script'
    },
  )

  if (children.length === 0) return []

  // 提取 body 的继承样式（color, font-family 等），作为根元素的初始继承值
  const bodyStyles = cssMap.get('__tag_body') || {}
  const rootVars = cssMap.get('__vars__') || {}
  const bodyInheritedStyle: Record<string, string> = {}
  for (const prop of INHERITED_PROPS) {
    if (bodyStyles[prop]) {
      bodyInheritedStyle[prop] = resolveStyleVars({ [prop]: bodyStyles[prop] }, rootVars)[prop]
    }
  }
  // 如果 body 没有显式设置 color，使用 --bs-body-color 作为默认值
  if (!bodyInheritedStyle.color && rootVars['--bs-body-color']) {
    bodyInheritedStyle.color = rootVars['--bs-body-color']
  }

  // 如果只有一个顶层容器，直接解析
  if (children.length === 1) {
    const root = children[0]
    //  PageForge 导出格式：pf-root 是外层包装器，应剥离并以子元素作为根节点
    if (root.classList.contains('pf-root')) {
      const rootChildren = Array.from(root.children).filter(
        (c) => {
          const t = c.tagName.toLowerCase()
          return t !== 'style' && t !== 'script'
        },
      )
      if (rootChildren.length === 1) {
        // 只有一个子元素：直接作为根节点
        const node = parseElement(rootChildren[0], 1200, cssMap, true, bodyInheritedStyle)
        return [node]
      }
      // 多个子元素：保留原始绝对坐标（buildElement 已将 left/top 转为 x/y）
      const nodes: CanvasNode[] = []
      for (let i = 0; i < rootChildren.length; i++) {
        const child = rootChildren[i]
        const node = parseElement(child, 1200, cssMap, true, bodyInheritedStyle)
        nodes.push(node)
      }
      return nodes
    }
    const node = parseElement(root, 1200, cssMap, true, bodyInheritedStyle)
    node.style.x = 0
    node.style.y = 0
    return [node]
  }

  // 多个顶层元素 → 垂直堆叠
  let y = 0
  const nodes: CanvasNode[] = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const node = parseElement(child, 1200, cssMap, true, bodyInheritedStyle)
    // 跳过 display: none 节点（Bootstrap modals 等），不参与 y 计算
    if (node.style.display === 'none') {
      continue
    }
    node.style.x = 0
    node.style.y = y
    const h = estimateHeightRecursive(child, node.style, cssMap)
    // 将估算高度写入节点样式，确保 computeCanvasHeight 能正确计算画布高度
    // 避免下标尺截断问题（之前只用了 h 算 y 偏移，没存到 style 里）
    if (!node.style.height || node.style.height === 'auto') {
      node.style.height = `${h}px`
    }
    nodes.push(node)
    y += h
    if (i < children.length - 1) y += 24
  }

  return nodes
}