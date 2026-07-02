// 批量转换 ready-*.html → CanvasNode JSON
// 使用 happy-dom 的 DOMParser 在 Node 端运行 importHtml 逻辑
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { Window } from 'happy-dom'

const window = new Window()
const DOMParser = window.DOMParser

// ---- 以下代码移植自 importHtml.ts（去掉了 TypeScript 类型但逻辑完全一致）----

let idCounter = 0
function nid() {
  idCounter += 1
  return `sbt_${Date.now().toString(36)}_${idCounter}`
}

function parseStyleString(styleText) {
  const style = {}
  if (!styleText) return style
  const rules = styleText.split(';')
  for (const rule of rules) {
    const colonIdx = rule.indexOf(':')
    if (colonIdx < 0) continue
    const key = rule.substring(0, colonIdx).trim()
    let val = rule.substring(colonIdx + 1).trim()
    if (!key || !val) continue
    // 去掉 !important
    val = val.replace(/\s*!important\s*$/gi, '')
    const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    style[camelKey] = val
  }
  return style
}

const KNOWN_PROPS = new Set([
  'fontSize', 'fontWeight', 'fontFamily', 'color', 'textAlign', 'lineHeight',
  'backgroundColor', 'background', 'borderRadius', 'border',
  'boxShadow', 'padding', 'margin', 'width', 'height', 'minHeight',
  'display', 'alignItems', 'justifyContent', 'wordBreak',
  'flex', 'flexShrink', 'flexGrow', 'gap', 'textDecoration', 'fontStyle',
  'flexDirection', 'flexWrap', 'overflow', 'position', 'top', 'left',
  'right', 'bottom', 'maxWidth', 'maxHeight', 'opacity',
])

function pickNodeStyle(raw) {
  const s = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_PROPS.has(k)) continue
    if ((k === 'width' || k === 'height') && v === 'auto') continue
    // 去掉 !important 后缀（例如 'flex!important' -> 'flex'）
    let val = String(v).trim()
    val = val.replace(/\s*!important\s*$/gi, '')
    s[k] = val
  }
  return s
}

function parsePadding(raw) {
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

function resolveWidth(widthStr, parentW) {
  if (!widthStr) return parentW
  if (widthStr.endsWith('%')) return (parseFloat(widthStr) / 100) * parentW
  const px = parseDim(widthStr)
  return isNaN(px) ? parentW : px
}

function parseStyleTag(styleText) {
  const map = new Map()
  const cleaned = styleText.replace(/\/\*[\s\S]*?\*\//g, '')
  const ruleRe = /([^{]+)\{([^}]+)\}/g
  let match
  while ((match = ruleRe.exec(cleaned)) !== null) {
    const selectors = match[1].split(',').map(s => s.trim())
    const body = match[2]
    const parsed = parseStyleString(body)
    for (const sel of selectors) {
      // 跳过伪类、属性选择器
      if (sel.includes(':') || sel.includes('[')) continue
      // 跳过组合选择器（descendant/child/sibling）：.a>.b、.a .b、.a+.b 等
      if (/[\s>+~]/.test(sel)) continue
      // 多类选择器 .a.b 暂不支持（happens 极少）
      if (sel.split('.').length > 2) continue
      const classMatch = sel.match(/^\.([a-zA-Z_][\w-]*)$/)
      if (classMatch) {
        const cn = classMatch[1]
        const existing = map.get(cn) || {}
        map.set(cn, { ...existing, ...parsed })
        continue
      }
      const tagMatch = sel.match(/^([a-z][a-z0-9]*)$/i)
      if (tagMatch) {
        const tag = tagMatch[1].toLowerCase()
        const existing = map.get(`__tag_${tag}`) || {}
        map.set(`__tag_${tag}`, { ...existing, ...parsed })
      }
    }
  }
  return map
}

function inferType(el) {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'heading'
  if (['p', 'span', 'a', 'li', 'label', 'small', 'strong', 'em', 'b', 'i', 'pre', 'code', 'sub', 'sup', 'u', 's', 'del', 'ins', 'mark', 'cite', 'blockquote'].includes(tag)) return 'text'
  if (tag === 'img') return 'image'
  if (tag === 'button') return 'button'
  if (tag === 'hr') return 'divider'
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input'
  if (tag === 'video') return 'video'
  if (['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'ul', 'ol', 'table', 'form', 'figure', 'fieldset', 'details', 'summary', 'dl', 'dt', 'dd'].includes(tag)) return 'container'
  if (el.children.length > 0) {
    for (let i = 0; i < el.children.length; i++) {
      const ct = el.children[i].tagName.toLowerCase()
      if (['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'table', 'ul', 'ol', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'img', 'hr', 'input', 'textarea', 'figure', 'blockquote', 'pre'].includes(ct)) {
        return 'container'
      }
    }
  }
  const text = el.textContent?.trim()
  if (text) return 'text'
  return 'container'
}

function extractLevel(tag) {
  const map = { h1: 1, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 }
  return map[tag.toLowerCase()] || 2
}

function getText(el) {
  const tag = el.tagName.toLowerCase()
  if (['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'code', 'sub', 'sup', 'mark', 'abbr', 'cite', 'time'].includes(tag)) {
    return el.textContent?.trim() || ''
  }
  let text = ''
  for (const child of Array.from(el.childNodes)) {
    // happy-dom uses different node type constants
    if (child.nodeType === 3) { // TEXT_NODE
      text += child.textContent || ''
    } else if (child.nodeType === 1) { // ELEMENT_NODE
      const ctag = child.tagName.toLowerCase()
      if (['br', 'hr'].includes(ctag)) {
        text += '\n'
      } else if (['span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'code', 'sub', 'sup', 'mark', 'abbr', 'cite', 'time', 'u', 's', 'del', 'ins'].includes(ctag)) {
        text += child.textContent || ''
      } else {
        text += getText(child)
      }
    }
  }
  return text.trim()
}

/** 解析 CSS 尺寸值（处理 calc()、rem 等） */
function parseDim(val) {
  if (!val) return NaN
  let str = String(val)
  if (str.startsWith('calc(')) {
    str = str.slice(5, -1).trim()
    // 取 calc 表达式的第一个项
    const match = str.match(/^[\d.]+(rem|em|px|vw|vh|%)?/)
    if (match) str = match[0]
  }
  if (str.endsWith('rem')) return parseFloat(str) * 16
  if (str.endsWith('em')) return parseFloat(str) * 16
  return parseFloat(str)
}

function estimateHeightRecursive(el, style, cssMap) {
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
  if (tag === 'img') return 200
  if (tag === 'button') return 48
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 44
  if (tag === 'video') return 240

  const type = inferType(el)
  if (type === 'container') {
    const display = style.display || ''
    const flexDir = (style.flexDirection && typeof style.flexDirection === 'string') ? style.flexDirection : 'row'
    const isFlexRow = display.includes('flex') && flexDir !== 'column'

    const pad = parsePadding(style.padding)
    const children = Array.from(el.children).filter(c => {
      const ct = c.tagName.toLowerCase()
      return ct !== 'style' && ct !== 'script'
    })

    if (isFlexRow) {
      let maxH = 0
      for (const child of children) {
        const childStyle = extractElementStyle(child, cssMap)
        maxH = Math.max(maxH, estimateHeightRecursive(child, childStyle, cssMap))
      }
      return Math.max(60, pad.top + maxH + pad.bottom)
    }

    let totalH = pad.top
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const childStyle = extractElementStyle(child, cssMap)
      const cH = estimateHeightRecursive(child, childStyle, cssMap)
      totalH += cH
      if (i < children.length - 1) totalH += 16
    }
    totalH += pad.bottom
    return Math.max(60, totalH)
  }

  const text = getText(el)
  const fontSize = parseDim(style.fontSize) || 16
  const lineHeight = parseDim(style.lineHeight) || 1.7
  const availWidth = parseDim(style.width) || 700
  const avgCharWidth = fontSize * 0.8
  const charsPerLine = Math.max(1, Math.floor(availWidth / avgCharWidth))
  const lines = Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)))
  const pad = parsePadding(style.padding)
  return Math.max(28, lines * fontSize * lineHeight + pad.top + pad.bottom)
}

function extractElementStyle(el, cssMap) {
  const tag = el.tagName.toLowerCase()
  let mergedStyle = {}
  const tagStyles = cssMap.get(`__tag_${tag}`)
  if (tagStyles) Object.assign(mergedStyle, tagStyles)
  const classAttr = el.getAttribute('class')
  if (classAttr) {
    for (const cn of classAttr.split(/\s+/)) {
      const cls = cssMap.get(cn)
      if (cls) Object.assign(mergedStyle, cls)
    }
  }
  // 内联样式（最高优先级）
  const inline = parseStyleString(el.getAttribute('style') || '')
  Object.assign(mergedStyle, inline)

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

function buildElement(el, parentW, cssMap, isRoot = false) {
  const type = inferType(el)
  const tag = el.tagName.toLowerCase()
  const style = extractElementStyle(el, cssMap)
  const pad = parsePadding(style.padding)
  const props = {}

  if (type === 'heading') {
    props.text = getText(el)
    props.level = extractLevel(tag)
  } else if (type === 'text') {
    props.text = getText(el)
  } else if (type === 'image') {
    props.src = el.getAttribute('src') || ''
    props.alt = el.getAttribute('alt') || ''
  } else if (type === 'button') {
    props.text = getText(el)
  } else if (type === 'input') {
    props.placeholder = el.getAttribute('placeholder') || ''
    props.text = el.getAttribute('value') || ''
  } else if (type === 'container') {
    const h = el.querySelector('h1, h2, h3, h4, h5, h6')
    const p = el.querySelector('p')
    if (h) { props.text = getText(h); props.level = extractLevel(h.tagName) }
    if (p) { props.subtitle = getText(p) }
  }

  let effectiveW = parentW
  const cssW = resolveWidth(style.width, parentW)
  if (style.width) { effectiveW = cssW }
  if (isRoot && style.maxWidth) {
    const mw = parseFloat(style.maxWidth)
    if (!isNaN(mw) && mw < effectiveW) effectiveW = mw
  }

  return {
    el,
    type,
    style,
    pad,
    props,
    effectiveW,
    node: {
      id: nid(),
      type,
      props,
      style: { x: 0, y: 0, ...style, width: effectiveW + 'px' },
      children: [],
      visible: true,
    },
  }
}

function populateChildren(parentEl, parentNode, parentStyle, parentEffectiveW, cssMap) {
  if (parentNode.type !== 'container' || parentEl.children.length === 0) return
  const pad = parsePadding(parentStyle.padding)
  const childW = Math.max(100, parentEffectiveW - pad.left - pad.right)
  let childY = pad.top
  const childX = pad.left
  const display = parentStyle.display || ''
  const flexDir = (parentStyle.flexDirection && typeof parentStyle.flexDirection === 'string') ? parentStyle.flexDirection : 'row'
  const flexWrap = (parentStyle.flexWrap && typeof parentStyle.flexWrap === 'string') ? parentStyle.flexWrap : 'nowrap'
  const gap = parentStyle.gap ? parseFloat(parentStyle.gap) : 16
  const isFlex = display.includes('flex')
  const isRow = isFlex && flexDir !== 'column'

  const validChildren = Array.from(parentEl.children).filter(c => {
    const ct = c.tagName.toLowerCase()
    return ct !== 'style' && ct !== 'script'
  })

  if (isRow) {
    // 第一遍：仅构建子节点（不递归），计算 cW
    const parsedChildren = validChildren.map(child => {
      const built = buildElement(child, childW, cssMap)
      let cW = resolveWidth(built.node.style.width, childW)
      const grow = parseFloat(built.node.style.flexGrow || '0') || 0
      const shrink = parseFloat(built.node.style.flexShrink || '1') || 0
      const flexBasis = built.node.style.flexBasis ? resolveWidth(built.node.style.flexBasis, childW) : null
      return { child, built, cW, grow, shrink, flexBasis }
    })

    // 计算总 gap
    const totalGap = (parsedChildren.length - 1) * gap
    const availW = Math.max(100, childW - totalGap)

    let usedW = 0
    let growTotal = 0
    for (const pc of parsedChildren) {
      if (pc.flexBasis != null) {
        pc.cW = pc.flexBasis
        usedW += pc.cW
      } else if (pc.cW < childW * 0.9) {
        usedW += pc.cW
      } else {
        growTotal += pc.grow || 1
      }
    }
    const remainW = Math.max(0, availW - usedW)
    for (const pc of parsedChildren) {
      if (pc.flexBasis != null) continue
      if (pc.cW >= childW * 0.9) {
        if (growTotal > 0) {
          pc.cW = Math.floor(remainW * ((pc.grow || 1) / growTotal))
        } else {
          pc.cW = Math.floor(availW / parsedChildren.length)
        }
      }
    }

    // 第二遍：用 cW 作为 effectiveW 真正递归子元素
    let rowX = childX
    let rowY = childY
    let maxRowH = 0
    for (let i = 0; i < parsedChildren.length; i++) {
      const { child, built, cW } = parsedChildren[i]
      if (flexWrap === 'wrap' && rowX + cW > childX + childW + gap && i > 0) {
        rowX = childX
        rowY += maxRowH + gap
        maxRowH = 0
      }
      built.node.style.x = rowX
      built.node.style.y = rowY
      built.node.style.width = cW + 'px'
      // 现在用 cW 作为父宽递归处理子元素
      populateChildren(child, built.node, built.style, cW, cssMap)
      const cH = estimateHeightRecursive(child, built.node.style, cssMap)
      maxRowH = Math.max(maxRowH, cH)
      rowX += cW + gap
      parentNode.children.push(built.node)
    }
    // row 布局也设 minHeight（行总高 + padding）
    const rowTotalH = rowY + maxRowH + pad.bottom
    if (rowTotalH > pad.top + pad.bottom) {
      parentNode.style.minHeight = rowTotalH + 'px'
    }
  } else {
    for (let i = 0; i < validChildren.length; i++) {
      const child = validChildren[i]
      const built = buildElement(child, childW, cssMap)
      built.node.style.x = childX
      built.node.style.y = childY
      built.node.style.width = resolveWidth(built.node.style.width, childW) + 'px'
      // 用 effectiveW 递归
      populateChildren(child, built.node, built.style, resolveWidth(built.node.style.width, childW), cssMap)
      parentNode.children.push(built.node)
      childY += estimateHeightRecursive(child, built.node.style, cssMap)
      if (i < validChildren.length - 1) childY += gap
    }
  }

  childY += pad.bottom
  if (childY > pad.top + pad.bottom) {
    parentNode.style.minHeight = childY + 'px'
  }
}

function parseElement(el, parentW, cssMap, isRoot = false) {
  const built = buildElement(el, parentW, cssMap, isRoot)
  populateChildren(el, built.node, built.style, built.effectiveW, cssMap)
  return built.node
}

function htmlToNodes(html) {
  idCounter = 0
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const cssMap = new Map()
  const styleEls = doc.querySelectorAll('style')
  styleEls.forEach(el => {
    const css = parseStyleTag(el.textContent || '')
    css.forEach((v, k) => {
      const existing = cssMap.get(k) || {}
      cssMap.set(k, { ...existing, ...v })
    })
  })

  const body = doc.body
  const children = Array.from(body.children).filter(c => {
    const t = c.tagName.toLowerCase()
    return t !== 'style' && t !== 'script'
  })

  if (children.length === 0) return []

  if (children.length === 1) {
    const root = children[0]
    const node = parseElement(root, 1200, cssMap, true)
    node.style.x = 0
    node.style.y = 0
    return [node]
  }

  let y = 0
  const nodes = []
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const node = parseElement(child, 1200, cssMap, true)
    node.style.x = 0
    node.style.y = y
    nodes.push(node)
    y += estimateHeightRecursive(child, node.style, cssMap)
    if (i < children.length - 1) y += 24
  }

  return nodes
}

// ---- 批量转换 ----
// 策略：每个 StartBootstrap 模板通过 htmlToNodes 解析为多个可编辑节点。
// 支持 flex、flex-wrap、百分比宽度、max-width 等常用布局。

const inDir = 'imported-templates'
const outDir = 'imported-templates/out'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(inDir).filter(f => f.startsWith('ready-') && f.endsWith('.html'))
const results = []
for (const f of files) {
  const name = f.replace(/^ready-/, '').replace(/\.html$/, '')
  const html = readFileSync(join(inDir, f), 'utf8')
  console.log(`Parsing ${name}... (${(html.length / 1024).toFixed(0)}KB)`)
  try {
    const nodes = htmlToNodes(html)

    const types = new Set()
    function walk(n) { types.add(n.type); (n.children || []).forEach(walk) }
    nodes.forEach(walk)

    const countNodes = (n) => 1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0)
    const total = nodes.reduce((a, n) => a + countNodes(n), 0)

    // 自动计算画布高度：取所有根节点 + 根级子节点的 max(bottom)
    // 不递归深嵌（Bootstrap 模板里的 modal 弹窗可能隐藏在文档底部，会拉高画布）
    const parsePx = (s) => {
      if (s === null || s === undefined) return 0
      const n = Number(s)
      return isNaN(n) ? 0 : n
    }
    let maxBottom = 0
    for (const n of nodes) {
      const y = parsePx(n.style.y)
      const h = parsePx(n.style.minHeight) || parsePx(n.style.height) || 0
      const bottom = y + h
      if (bottom > maxBottom) maxBottom = bottom
      // 根级子节点（常见的 masthead、section、row），不递归
      if (n.children) {
        for (const c of n.children) {
          const cy = y + parsePx(c.style.y)
          const ch = parsePx(c.style.minHeight) || parsePx(c.style.height) || 0
          const cb = cy + ch
          if (cb > maxBottom) maxBottom = cb
        }
      }
    }
    const canvasHeight = Math.max(800, Math.ceil(maxBottom) + 64)

    const result = {
      id: `sb-${name}`,
      name: `StartBootstrap ${name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      nodes,
      canvas: { width: '1200px', height: `${canvasHeight}px`, backgroundColor: '#ffffff' },
    }

    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(result, null, 2))
    results.push({ name, rootNodes: nodes.length, totalNodes: total, types: [...types].join(',') })
    console.log(`  -> ${total} nodes (${types.size} types: ${[...types].join(', ')})`)
  } catch (e) {
    console.error(`  ERROR: ${e.message}`)
    results.push({ name, error: e.message })
  }
}

console.log('\n=== Summary ===')
console.table(results)