import type { CanvasConfig, CanvasNode, InteractionConfig, NodeStyle } from '@/types'
import { generateInteractionRuntime } from './interactionRuntime'
import { renderIconToHtml } from './iconPaths'

/** 转义 HTML 文本节点内容 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 转义属性值（含引号） */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

/** 缩进 */
function indent(depth: number): string {
  return '  '.repeat(depth)
}

/** 把 NodeStyle 转为内联 CSS 文本（含绝对坐标，与画布渲染一致） */
function nodeStyleToCssText(style: NodeStyle): string {
  const parts: string[] = []
  parts.push(`position:absolute`)
  parts.push(`left:${style.x ?? 0}px`)
  parts.push(`top:${style.y ?? 0}px`)
  for (const [key, val] of Object.entries(style)) {
    // 排除所有定位属性：x/y 用 left/top 单独设置；left/top/right/bottom 是导入残留值，
    // 若不排除会在 CSS 中覆盖前面的显式 left/top（CSS 后声明优先），导致 DragOverlay 预览
    // 与画布位置不一致、导出再导入后坐标偏移。
    if (key === 'x' || key === 'y' || key === 'position' || key === 'left' || key === 'top' || key === 'right' || key === 'bottom' || val === undefined) continue
    const cssKey = key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    parts.push(`${cssKey}:${val}`)
  }
  return parts.join(';')
}

/** 递归检查节点树中是否有任何交互配置 */
function hasAnyInteraction(nodes: CanvasNode[]): boolean {
  for (const node of nodes) {
    if (node.interaction) {
      const i = node.interaction
      if (i.link?.href || (i.onClick && i.onClick.action !== 'none') || (i.onHover && i.onHover.effect !== 'none') || (i.animation && i.animation.type !== 'none')) {
        return true
      }
    }
    if (node.type === 'container' && node.children.length > 0) {
      if (hasAnyInteraction(node.children)) return true
    }
  }
  return false
}

/** 根据节点交互配置生成 data-pf-* HTML 属性字符串 */
function buildInteractionAttrs(node: CanvasNode): string {
  const i = node.interaction
  if (!i) return ''
  const attrs: string[] = []

  // 链接
  if (i.link?.href) {
    attrs.push(`data-pf-link='${escapeAttr(JSON.stringify(i.link))}'`)
  }

  // 点击动作
  if (i.onClick && i.onClick.action !== 'none') {
    attrs.push(`data-pf-interaction='${escapeAttr(JSON.stringify(i.onClick))}'`)
  }

  // 悬停效果
  if (i.onHover && i.onHover.effect !== 'none') {
    attrs.push(`data-pf-hover='${escapeAttr(JSON.stringify(i.onHover))}'`)
    attrs.push(`data-pf-hover-id="${node.id}"`)
  }

  // 动画
  if (i.animation && i.animation.type !== 'none') {
    attrs.push(`data-pf-animate="pf-animate-${i.animation.type}"`)
    attrs.push(`data-pf-trigger="${i.animation.trigger || 'load'}"`)
    if (i.animation.delay) attrs.push(`data-pf-delay="${i.animation.delay}"`)
    if (i.animation.trigger === 'scroll' && i.animation.threshold !== undefined) {
      attrs.push(`data-pf-threshold="${i.animation.threshold}"`)
    }
  }

  return attrs.length ? ' ' + attrs.join(' ') : ''
}

/** 生成动画 CSS 变量（--pf-duration, --pf-easing, --pf-delay），追加到 style 属性 */
function animationCssVars(node: CanvasNode): string {
  const anim = node.interaction?.animation
  if (!anim || anim.type === 'none') return ''
  const parts: string[] = []
  if (anim.duration) parts.push(`--pf-duration:${anim.duration}ms`)
  if (anim.easing) parts.push(`--pf-easing:${anim.easing}`)
  if (anim.delay) parts.push(`--pf-delay:${anim.delay}ms`)
  return parts.length ? ';' + parts.join(';') : ''
}

/** 按节点类型生成 HTML（不再额外包裹 pf-item div，直接以语义标签输出） */
function nodeToHtml(node: CanvasNode, depth: number, z: number): string {
  if (node.visible === false) return ''
  // 转义 CSS 值中的双引号，避免 font-family: "Cormorant Garamond" 等带引号字体名
  // 提前终止 HTML style 属性，导致字体样式被截断退化为系统字体。
  const styleText = nodeStyleToCssText(node.style).replace(/"/g, '&quot;') + animationCssVars(node)
  const pre = indent(depth)
  const ia = buildInteractionAttrs(node)
  const link = node.interaction?.link

  /** 如果有链接，用 <a> 包裹内容 */
  function wrapLink(content: string): string {
    if (!link?.href) return content
    const target = link.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${escapeAttr(link.href)}"${target} style="text-decoration:underline;text-decoration-color:#6366f1;text-underline-offset:2px;cursor:pointer;color:inherit;display:inherit">${content}</a>`
  }

  switch (node.type) {
	    case 'heading': {
	      const tag = `h${node.props.level || 1}`
	      const inner = escapeHtml(node.props.text || '')
	      // 默认值在前，styleText 在后 —— 节点自定义样式覆盖默认值
	      return `${pre}<${tag} id="${node.id}" class="pf-item" data-pf-type="heading"${ia} style="margin:0;min-width:0;white-space:pre-line;word-break:break-word;${styleText};z-index:${z}">${wrapLink(inner)}</${tag}>`
	    }
	    case 'text': {
	      const inner = escapeHtml(node.props.text || '')
	      return `${pre}<p id="${node.id}" class="pf-item" data-pf-type="text"${ia} style="margin:0;white-space:pre-line;word-break:break-word;min-height:1.2em;${styleText};z-index:${z}">${wrapLink(inner)}</p>`
	    }
	    case 'image': {
	      const imgTag = node.props.src
	        ? `<img src="${escapeAttr(node.props.src)}" alt="${escapeAttr(node.props.alt || '')}" style="width:100%;height:auto;max-width:100%;display:block;border-radius:inherit"/>`
	        : `<div style="width:100%;height:100%;min-height:120px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px">图片占位</div>`
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="image"${ia} style="${styleText};z-index:${z}">${wrapLink(imgTag)}</div>`
	    }
	    case 'button': {
	      const inner = escapeHtml(node.props.text || '')
	      // display:inline-flex 等是默认值，允许节点样式覆盖
	      return `${pre}<span id="${node.id}" class="pf-item" data-pf-type="button"${ia} style="display:inline-flex;align-items:center;justify-content:center;${styleText};z-index:${z}">${wrapLink(inner)}</span>`
	    }
	    case 'card':
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="card"${ia} style="${styleText};z-index:${z}"><div style="font-weight:600;font-size:${node.props.titleFontSize || '18px'};color:${node.props.titleColor || 'inherit'};margin-bottom:8px">${escapeHtml(node.props.text || '')}</div><div style="font-size:${node.props.subtitleFontSize || '14px'};color:${node.props.subtitleColor || '#6b7280'};line-height:1.6">${escapeHtml(node.props.subtitle || '')}</div></div>`
	    case 'divider':
	      return `${pre}<hr id="${node.id}" class="pf-item" data-pf-type="divider"${ia} style="${styleText};z-index:${z}"/>`
	    case 'icon': {
	      const iconVal = node.props.icon || 'star'
	      const fsStr = typeof node.style.fontSize === 'string' ? node.style.fontSize : '24px'
	      const fs = parseFloat(fsStr) || 24
	      const color = (typeof node.style.color === 'string' ? node.style.color : '') || 'currentColor'
	      const iconHtml = renderIconToHtml(iconVal, fs, color)
	      const textHtml = node.props.text ? `<span>${escapeHtml(node.props.text)}</span>` : ''
	      // display:flex 等是默认值，允许节点样式覆盖
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="icon"${ia} style="display:flex;align-items:center;gap:8px;justify-content:center;${styleText};z-index:${z}">${iconHtml}${textHtml}</div>`
	    }
	    case 'video':
	      return node.props.src
	        ? `${pre}<div id="${node.id}" class="pf-item" data-pf-type="video" style="${styleText};z-index:${z}"><video src="${escapeAttr(node.props.src)}"${node.props.poster ? ` poster="${escapeAttr(node.props.poster)}"` : ''} controls style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block"></video></div>`
	        : `${pre}<div id="${node.id}" class="pf-item" data-pf-type="video" style="${styleText};z-index:${z}"><div style="width:100%;height:100%;min-height:120px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;flex-direction:column;gap:4px"><span style="font-size:32px">▶</span><span>视频占位</span></div></div>`
	    case 'input': {
	      const inner = escapeHtml(node.props.text || node.props.placeholder || '输入框占位')
	      const placeholderColor = node.props.text ? '#374151' : '#9ca3af'
	      // 仅布局默认值在前，border/padding/bg 由节点 style 提供（与编辑器一致）
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="input"${ia} style="display:flex;align-items:center;color:${placeholderColor};${styleText};z-index:${z}">${inner}</div>`
	    }
	    case 'iframe':
	      return node.props.src
	        ? `${pre}<div id="${node.id}" class="pf-item" data-pf-type="iframe"${ia} style="${styleText};z-index:${z}"><iframe src="${escapeAttr(node.props.src)}" title="${escapeAttr(node.props.alt || 'embedded page')}" style="width:100%;height:100%;border:none;border-radius:inherit;display:block"></iframe></div>`
	        : `${pre}<div id="${node.id}" class="pf-item" data-pf-type="iframe"${ia} style="${styleText};z-index:${z}"><div style="width:100%;height:100%;min-height:120px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;background:#f3f4f6;border:2px dashed #d1d5db">iframe 占位（设置 src URL）</div></div>`
	    case 'navbar': {
	      const links = (node.props.navLinks || '首页,关于,服务,联系').split(',').map((s: string) => s.trim()).filter(Boolean)
	      const linkColor = node.props.linkColor || node.style.color || '#374151'
	      const linkItems = links.map((l: string, i: number) =>
	        `<span style="color:${linkColor};font-size:${node.style.fontSize || '16px'};font-weight:${node.style.fontWeight || '500'};cursor:pointer">${escapeHtml(l)}</span>`
	      ).join('')
	      const logo = escapeHtml(node.props.logo || 'PageForge')
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="navbar"${ia} style="display:flex;align-items:center;justify-content:space-between;${styleText};z-index:${z}"><span style="font-weight:700;font-size:20px;color:#6366f1">${logo}</span><div style="display:flex;gap:24px">${linkItems}</div></div>`
	    }
	    case 'grid': {
	      const cols = node.props.columns || 3
	      const gap = node.props.gridGap || node.style.gap || '16px'
	      const cells = Array.from({ length: cols }, (_, i) =>
	        `<div style="background:#fff;border:2px dashed #d1d5db;border-radius:8px;min-height:80px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px">网格 ${i + 1}</div>`
	      ).join('')
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="grid"${ia} style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${gap};${styleText};z-index:${z}">${cells}</div>`
	    }
	    case 'form': {
	      const fields = (node.props.fields || '姓名,邮箱,留言').split(',').map((s: string) => s.trim()).filter(Boolean)
	      const submitText = escapeHtml(node.props.submitText || '提交')
	      const fieldItems = fields.map((f: string) => {
	        const isTextarea = f === '留言' || f.toLowerCase().includes('message')
	        return isTextarea
	          ? `<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:14px;font-weight:500;color:#374151">${escapeHtml(f)}</label><textarea placeholder="请输入${escapeHtml(f)}" style="padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:14px;color:#374151;background:#fff;min-height:80px;resize:vertical;outline:none" readonly></textarea></div>`
	          : `<div style="display:flex;flex-direction:column;gap:4px"><label style="font-size:14px;font-weight:500;color:#374151">${escapeHtml(f)}</label><input type="text" placeholder="请输入${escapeHtml(f)}" style="padding:10px 14px;border-radius:8px;border:1px solid #d1d5db;font-size:14px;color:#374151;background:#fff;outline:none" readonly/></div>`
	      }).join('')
	      return `${pre}<div id="${node.id}" class="pf-item" data-pf-type="form"${ia} style="display:flex;flex-direction:column;gap:12px;${styleText};z-index:${z}"><div style="font-size:20px;font-weight:600;color:#1f2937;margin-bottom:4px">联系我们</div>${fieldItems}<div style="margin-top:4px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-align:center;font-weight:600;font-size:16px;cursor:pointer">${submitText}</div></div>`
	    }
	    case 'container': {
	      const visibleChildren = node.children.filter((c) => c.visible !== false)
	      if (visibleChildren.length === 0) {
	        return `${pre}<div id="${node.id}" class="pf-item pf-container" data-pf-type="container"${ia} style="${styleText};z-index:${z}">${indent(depth + 1)}<div style="color:#9ca3af;font-size:13px">容器</div>\n${pre}</div>`
	      }
	      const inner = visibleChildren.map((c) => nodeToHtml(c, depth + 1, z + 1)).join('\n')
	      return `${pre}<div id="${node.id}" class="pf-item pf-container" data-pf-type="container"${ia} style="${styleText};z-index:${z}">\n${inner}\n${pre}</div>`
	    }
	    default:
	      return ''
	  }
}

/** 已知系统字体 / 通用字体族，不需要从 Google Fonts 加载 */
const SYSTEM_FONTS = new Set([
  'arial', 'helvetica', 'helvetica neue', 'times new roman', 'times', 'georgia',
  'verdana', 'tahoma', 'trebuchet ms', 'courier', 'courier new',
  'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
  'sf mono', 'menlo', 'monaco', 'consolas', 'liberation mono',
  'pingfang sc', 'microsoft yahei', 'noto sans', 'noto color emoji',
  'apple color emoji', 'segoe ui emoji', 'segoe ui symbol',
  'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'inherit', 'initial',
])

/** 递归收集所有节点中使用的字体族及其字重（取 fontFamily 第一个字体名） */
function collectFontFamilies(nodes: CanvasNode[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()

  function walk(list: CanvasNode[]) {
    for (const node of list) {
      if (node.visible === false) continue
      const ff = node.style.fontFamily as string | undefined
      if (ff) {
        // 取第一个字体名（逗号前），去掉引号
        const first = ff.split(',')[0].trim().replace(/^["']|["']$/g, '')
        const lower = first.toLowerCase()
        if (first && !SYSTEM_FONTS.has(lower)) {
          if (!map.has(first)) map.set(first, new Set())
          const fw = parseInt(node.style.fontWeight as string) || 400
          map.get(first)!.add(fw)
        }
      }
      if (node.type === 'container' && node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return map
}

/** 生成 Google Fonts <link> 标签，CSS1 API（兼容 loli.net 国内镜像），带字重 */
function googleFontsLink(fontMap: Map<string, Set<number>>): string {
  if (fontMap.size === 0) return ''
  const families: string[] = []
  for (const [name, weights] of fontMap) {
    const encoded = name.replace(/ /g, '+')
    const sorted = [...weights].sort((a, b) => a - b)
    // 只有默认字重 400 时不需要显式指定
    if (sorted.length === 1 && sorted[0] === 400) {
      families.push(`family=${encoded}`)
    } else {
      families.push(`family=${encoded}:${sorted.join(',')}`)
    }
  }
  // 使用 CSS1 API（/css 而非 /css2），loli.net 镜像不支持 css2 的 :wght@ 语法
  // &amp; 保证 HTML 属性值合法，浏览器获取 URL 时会将其解码为 &
  const params = families.join('&amp;') + '&amp;display=swap'
  return `<link rel="preconnect" href="https://fonts.loli.net" />
<link rel="preconnect" href="https://gstatic.loli.net" crossorigin />
<link href="https://fonts.loli.net/css?${params}" rel="stylesheet" />`
}

/** 估算文本类节点的视觉高度（画布空间），用于没有显式 height 时计算底部 */
function estimateNodeHeight(node: CanvasNode): number {
  const style = node.style
  const h = parseFloat(style.height as string) || parseFloat(style.minHeight as string) || 0
  if (h > 0) return h

  const fs = parseFloat(style.fontSize as string) || 16
  const lh = parseFloat(style.lineHeight as string) || 1.5
  const text = (node.props as any)?.text || ''
  const w = parseFloat(style.width as string) || 300

  // 粗略估算行数：每行容纳字符数 ≈ width / (fontSize * 0.6)
  const charsPerLine = Math.max(1, Math.floor(w / (fs * 0.55)))
  const lines = text ? Math.max(1, Math.ceil(text.replace(/\n/g, '').length / charsPerLine) + (text.split('\n').length - 1)) : 1

  return Math.ceil(fs * lh * lines)
}

/** 递归计算节点树的最大底部坐标（画布空间），用于导出时设置 .pf-root 高度 */
function calcMaxBottom(nodes: CanvasNode[], parentX: number = 0, parentY: number = 0): number {
  let maxBottom = 0
  for (const node of nodes) {
    if (node.visible === false) continue
    const nx = (node.style.x ?? 0) + parentX
    const ny = (node.style.y ?? 0) + parentY
    const h = estimateNodeHeight(node)
    const bottom = ny + h
    if (bottom > maxBottom) maxBottom = bottom
    if (node.type === 'container' && node.children.length > 0) {
      const childBottom = calcMaxBottom(node.children, nx, ny)
      if (childBottom > maxBottom) maxBottom = childBottom
    }
  }
  return maxBottom
}

/**
 * 将顶层节点按 Y 轴重叠关系分组为"行"。
 * 用于生成响应式 CSS：同一行的元素在平板端保持并排，手机端才堆叠。
 */
function groupRows(nodes: CanvasNode[]): CanvasNode[][] {
  const visible = nodes.filter((n) => n.visible !== false)
  if (visible.length <= 1) return [visible]

  const items = visible.map((n) => ({
    node: n,
    y: n.style.y ?? 0,
    h: parseFloat(String(n.style.height || n.style.minHeight || '40')) || 40,
  }))
  items.sort((a, b) => a.y - b.y)

  const rows: (typeof items)[] = []
  for (const item of items) {
    let placed = false
    for (const row of rows) {
      const rowTop = Math.min(...row.map((r) => r.y))
      const rowBottom = Math.max(...row.map((r) => r.y + r.h))
      if (item.y < rowBottom + 20 && item.y + item.h > rowTop - 20) {
        row.push(item)
        placed = true
        break
      }
    }
    if (!placed) rows.push([item])
  }
  return rows.map((row) => row.map((r) => r.node))
}

/** 生成响应式 CSS */
function responsiveCSS(_rows: CanvasNode[][]): string {
  return `/* ═══ 响应式布局 ═══ */
/* 平板：保持行内并排，允许换行 */
@media(min-width:769px) and (max-width:1024px){
  .pf-root{max-width:100%!important;padding:24px}
  .pf-item{max-width:100%!important}
  .pf-item img,.pf-item video,.pf-item iframe{max-width:100%!important;height:auto!important}
}
/* 手机：垂直堆叠，全宽，适当间距 */
@media(max-width:768px){
  .pf-root{max-width:100%!important;padding:16px;min-height:auto!important}
  .pf-item{position:relative!important;left:auto!important;top:auto!important;width:100%!important;max-width:100%!important;height:auto!important;margin-bottom:24px}
  .pf-item:last-child{margin-bottom:0}
  .pf-item img,.pf-item video,.pf-item iframe{max-width:100%!important;height:auto!important}
  .pf-item[data-pf-type="button"]{text-align:center;justify-content:center!important}
  .pf-item[data-pf-type="container"]{display:flex!important;flex-direction:column!important;gap:16px;padding:16px}
  .pf-item .pf-item{margin-bottom:16px}
  .pf-item .pf-item:last-child{margin-bottom:0}
  .pf-item[data-pf-type="navbar"]{flex-direction:column!important;gap:12px;text-align:center}
  .pf-item[data-pf-type="grid"]{grid-template-columns:1fr!important}
  .pf-item[data-pf-type="form"]{width:100%!important}
  .pf-item[data-pf-type="form"] input,.pf-item[data-pf-type="form"] textarea{width:100%!important;box-sizing:border-box}
  .pf-item[data-pf-type="heading"]{word-break:break-word}
  .pf-item[data-pf-type="text"]{word-break:break-word}
}`
}

/** 构建完整单文件 HTML 文档（递归保持树结构，桌面端绝对定位 + 移动端堆叠） */
export function buildHtml(nodes: CanvasNode[], canvas?: CanvasConfig): string {
  let zi = 0
  const visibleNodes = nodes.filter((n) => n.visible !== false)
  const rows = groupRows(visibleNodes)

  const body = visibleNodes.map((n) => {
    zi += 1
    return nodeToHtml(n, 2, zi)
  }).join('\n')
  const bg = canvas?.backgroundColor ?? '#ffffff'
  const cw = canvas?.width ?? '1200px'
  // 计算实际内容高度：取 calcMaxBottom 估算值、canvas 存储高度、600px 三者的最大值
  const contentBottom = calcMaxBottom(visibleNodes)
  const canvasHeightPx = parseInt(canvas?.height || '0') || 0
  const rootMinHeight = Math.max(600, Math.ceil(contentBottom + 40), canvasHeightPx)

  // 收集 Google Fonts 引用
  const fontFamilies = collectFontFamilies(visibleNodes)
  const fontLink = googleFontsLink(fontFamilies)

  // 检查是否有交互节点，有则注入运行时
  const hasInteraction = hasAnyInteraction(visibleNodes)
  const runtimeScript = hasInteraction ? `\n<script>${generateInteractionRuntime()}</script>` : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>PageForge 导出</title>
${fontLink ? fontLink + '\n' : ''}<style>
*{box-sizing:border-box}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
p{margin:0}
body{margin:0;padding:0;font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;color:#333}
.pf-root{position:relative;width:100%;max-width:${cw};margin:0 auto;min-height:${rootMinHeight}px;background:${bg}}
.pf-item{position:absolute}
${responsiveCSS(rows)}
</style>
</head>
<body>
  <div class="pf-root" data-pf-canvas-width="${canvas?.width ?? '1200px'}" data-pf-canvas-height="${canvas?.height ?? '800px'}" data-pf-canvas-bg="${bg}">
${body}
  </div>${runtimeScript}
</body>
</html>`
}

/** 触发浏览器下载 HTML 文件 */
export function downloadHtml(
  nodes: CanvasNode[],
  canvas?: CanvasConfig,
  filename = 'pageforge-export.html',
): void {
  const html = buildHtml(nodes, canvas)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}