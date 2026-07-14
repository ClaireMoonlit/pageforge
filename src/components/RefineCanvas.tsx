import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'
import { serializeRefineHtml } from '@/utils/refineSerialization'

interface RefineCanvasProps {
  /** 用于在 document 中唯一定位 iframe，便于 serializeRefineHtml 通过 id 找到它 */
  iframeId?: string
}

/**
 * 精修模式画布（精致显微镜风）
 *
 * 核心设计：
 * 1. 页面作为「卡片」居中显示，浅紫色背景 + 投影，与周围画布形成视觉分离
 * 2. 顶部浮动徽章展示「精修模式 + 页面标题 + 快速操作」，强化"当前正在精修"的语义
 * 3. 自动测量 iframe 内容高度，wrapper 高度 = 内容高度 + 上下 padding，
 *    避免页面内出现原生滚动条（页面"自带滚轮"问题）
 * 4. 选中态使用紫色系：紫色虚线（hover）+ 紫色实线（selected）+ 紫色标签
 *
 * 与自由画布模式互斥：进入精修模式时 store 会清空 nodes，退出时清空 refineSession
 */
export function RefineCanvas({ iframeId = 'pf-refine-iframe' }: RefineCanvasProps) {
  const session = useEditorStore((s) => s.refineSession)
  const selectRefineElement = useEditorStore((s) => s.selectRefineElement)
  const updateRefineSize = useEditorStore((s) => s.updateRefineSize)
  const exitRefine = useEditorStore((s) => s.exitRefine)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  /** 鼠标悬停的元素（用于画 hover 框） */
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  /** iframe 是否已加载完成（用于启用交互） */
  const [ready, setReady] = useState(false)
  /** iframe 内容实际测量尺寸（用于自适应 wrapper 高度） */
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null)
  /** 浮动徽章悬停状态 */
  const [hoveredBadge, setHoveredBadge] = useState(false)

  // session 变化时强制重新挂载 iframe（srcdoc 改变）
  useEffect(() => {
    setReady(false)
    setMeasured(null)
  }, [session?.sessionKey])

  /**
   * 从 iframe 内的一个 DOM 元素提取 RefineElementInfo
   */
  const extractInfo = (el: HTMLElement): RefineElementInfo | null => {
    try {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
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
   * 测量 iframe 内容尺寸并更新 wrapper。
   *
   * 关键策略（2026-07-15 终极版）：
   * 1. **中和模板里的 100vh/100vw/height:100%** —— 防止 Bootstrap 类模板强制
   *    body 高度 = iframe 视口、vw 元素强制宽度 = iframe 视口。
   *    其中 100vw 最致命：vw 元素宽度 = iframe.clientWidth = wrapper 宽度，
   *    wrapper 跟着 body.scrollWidth 放大，vw 元素又跟着 wrapper 放大 → 死循环。
   *    必须把 `[style*="100vw"]` 也用 `!important` 覆盖为 `width: 100%`。
   *
   * 2. **固定 body/html 宽度 = canvas.width** —— 防止 body 内的 width:100% 元素
   *    跟随 wrapper 放大（v1 用 max(...) 测宽时遇到的最大问题）。
   *    固定后 body 内 width:100% 元素 = body.width = canvasW（不再放大）。
   *    但 body.scrollWidth 仍可能 > canvasW（如果 body 内有 width:N 的固定元素如图片），
   *    那是有效信号，应该被 wrapper 包住。
   *
   * 3. **w = max(canvasW, body.scrollWidth)** —— 保留足够宽度包住实际内容。
   *    死循环防御：body.width 已被我们限制为 canvasW，不会再放大，
   *    body 内 width:100% 元素也固定在 canvasW；只有固定 width 的元素（图片等）
   *    会贡献额外的 scrollWidth，且不会跟随 wrapper 变化 → 收敛。
   *
   * 4. **h = body.scrollHeight** —— 高度只跟 body 内容相关，不受 wrapper 高度反推。
   */
  const measureAndSyncSize = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc || !doc.body) return

    // 1. 注入 CSS 中和 100vh / 100vw / height: 100% 约束（幂等：检查 id 防重复）
    const NEUTRALIZE_ID = 'pf-refine-neutralize'
    if (!doc.getElementById(NEUTRALIZE_ID)) {
      const styleEl = doc.createElement('style')
      styleEl.id = NEUTRALIZE_ID
      // 为什么用 * 选择器覆盖所有元素 + !important：
      //   100vh/100vw 不只设在 html/body 上，Bootstrap 模板里 .masthead、section、main 等
      //   也常用 min-height: 100vh / width: 100vw。
      //   - 100vh 相对 iframe 视口 = wrapper 高度，形成"内容撑高 wrapper → 100vh 撑高元素 → 死循环"
      //   - 100vw 相对 iframe 视口 = wrapper 宽度，形成"内容撑宽 wrapper → 100vw 撑宽元素 → 死循环"
      // 全部覆盖后页面回到"自然内容尺寸"，无任何 vh/vw 死循环。
      //
      // 关键：必须用 `width: 100% !important` 覆盖 `[style*="100vw"]`，
      // 否则 vw 元素宽度 = iframe.clientWidth，wrapper 放大 → iframe 放大 → vw 元素放大 → 死循环
      // 转为 100% 后，vw 元素 = 父容器宽度 = body.width（被我们限制为 canvasW），不再放大。
      styleEl.textContent = `
        html, body, * {
          min-height: 0 !important;
          max-height: none !important;
        }
        html, body {
          height: auto !important;
        }
        body {
          overflow: visible !important;
          overflow-x: visible !important;
          overflow-y: visible !important;
        }
        .vh-100, .min-vh-100, .h-100, [style*="100vh"], [style*="100%"] {
          height: auto !important;
          min-height: 0 !important;
        }
        /* vw 关键防御：把 100vw 强制改为 100%，让元素宽度跟随父容器（body，已被我们限制为 canvasW） */
        [style*="100vw"] {
          width: 100% !important;
          max-width: 100% !important;
        }
        /* 兜底：max-width: 100vw 也会跟随 wrapper 放大，改为 max-width: 100% */
        [style*="max-width: 100vw"], [style*="max-width:100vw"] {
          max-width: 100% !important;
        }
      `
      ;(doc.head || doc.documentElement).appendChild(styleEl)
      // 强制同步 reflow，确保下面的 scrollHeight 读到的就是中和后的值
      void doc.body.offsetHeight
    }

    // 2. 死循环防御：固定 body 和 html 宽度为 canvas.width
    //    让 body 内 width:100% 元素固定在 canvasW，不会跟随 wrapper 放大。
    //    body.scrollWidth 仍可能 > canvasW（如果 body 内有 width:N 的固定元素如图片），
    //    那是有效信号，应该被 wrapper 包住。
    const body = doc.body
    const canvasW = Math.max(320, parseInt(String(useEditorStore.getState().canvas.width)) || 1200)
    if (doc.documentElement.style.width !== `${canvasW}px`) {
      doc.documentElement.style.width = `${canvasW}px`
      doc.documentElement.style.boxSizing = 'border-box'
      body.style.width = `${canvasW}px`
      body.style.boxSizing = 'border-box'
      // 强制 reflow，让 scrollWidth 反映新宽度
      void body.offsetHeight
    }

    // 3. 测得最终尺寸：宽度固定为 canvasW（不随 scrollWidth 变化），高度 = body.scrollHeight
    //    宽度必须稳定！因为 wrapper 是居中的（margin: 0 auto），宽度变化会导致内容偏移抖动。
    //    body 已被我们限制为 canvasW，width:100% 元素 = canvasW，不会溢出。
    //    固定 width 元素（如图片）若超出 body 宽度，会被 Canvas 外层 overflow:hidden 裁切。
    const h = Math.max(body.scrollHeight, body.offsetHeight)
    const finalW = canvasW
    const finalH = Math.ceil(h) + 8
    // 防止重复 setState 触发无限渲染：仅当尺寸变化时才更新
    // 用同一个 changed 标记控制 setMeasured 和 updateRefineSize，
    // 避免 updateRefineSize 在 measured 没变时仍触发重渲染
    let changed = false
    setMeasured((prev) => {
      if (prev && prev.width === finalW && prev.height === finalH) return prev
      changed = true
      return { width: finalW, height: finalH }
    })
    if (changed) updateRefineSize(finalW, finalH)
  }, [updateRefineSize])

  /**
   * 绑定 iframe 内部文档的事件监听 + 自动测量
   *
   * 关键设计（2026-07-15 v2）：
   * - useLayoutEffect 同步执行（在 DOM 变更后、浏览器绘制前），确保在 load 事件触发前
   *   就已添加好监听器。useEffect 异步执行，srcdoc 的 load 可能在 effect 前就触发。
   * - 事件监听器绑定在 measureAndSyncSize 之前，防止测量异常阻断事件绑定。
   * - 双重保障：load 事件（主路径）+ 轮询（兜底，防止极端时序）。
   */
  useLayoutEffect(() => {
    if (!session) return
    const iframe = iframeRef.current
    if (!iframe) return

    let cancelled = false
    let doc: Document | null = null
    let loadHandler: (() => void) | null = null
    let pollTimer: number | null = null

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement | null
      console.info('[RefineCanvas] onClick fired, target:', target?.tagName, target?.textContent?.slice(0, 30))
      if (!target) return
      const info = extractInfo(target)
      if (info) {
        console.info('[RefineCanvas] selectRefineElement called for', info.tagName)
        selectRefineElement(info)
      } else {
        console.warn('[RefineCanvas] extractInfo returned null for', target.tagName)
      }
    }

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.tagName === 'HTML' || target.tagName === 'BODY') {
        setHoverRect(null)
        return
      }
      const r = target.getBoundingClientRect()
      setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    const onMouseOut = () => {
      setHoverRect(null)
    }

    /**
     * 绑定事件监听器 + 测量尺寸。
     * 事件绑定在测量之前，确保点击不穿透。
     */
    const bind = () => {
      if (cancelled) return
      doc = iframe.contentDocument
      if (!doc || !doc.body) return

      // 步骤 1：绑定事件监听器（最高优先级）
      doc.body.setAttribute('data-pf-refine', 'true')
      doc.addEventListener('click', onClick, true)
      doc.addEventListener('mouseover', onMouseOver, true)
      doc.addEventListener('mouseout', onMouseOut, true)
      console.info('[RefineCanvas] event listeners bound, sessionKey:', session.sessionKey)

      // 步骤 2：测量尺寸（包裹 try-catch，不阻断事件绑定）
      try {
        measureAndSyncSize()
      } catch (e) {
        console.error('[RefineCanvas] measureAndSyncSize failed:', e)
      }
      setReady(true)

      // 多阶段测量
      const timers: number[] = []
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 200))
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 1000))
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 2500))

      let resizeObserver: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined' && doc.body) {
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) measureAndSyncSize()
        })
        resizeObserver.observe(doc.body)
        resizeObserver.observe(doc.documentElement)
      }

      // 清理句柄挂到 closure
      ;(bind as unknown as { __cleanup?: () => void }).__cleanup = () => {
        timers.forEach((t) => clearTimeout(t))
        if (resizeObserver) {
          resizeObserver.disconnect()
          resizeObserver = null
        }
      }
    }

    // 清理 pollTimer 和 loadHandler 的辅助函数
    const clearPending = () => {
      if (pollTimer !== null) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      if (loadHandler) {
        iframe.removeEventListener('load', loadHandler)
        loadHandler = null
      }
    }

    // 尝试立即绑定（body.children.length > 0 区分 srcdoc 和 about:blank）
    const currentDoc = iframe.contentDocument
    if (currentDoc && currentDoc.body && currentDoc.body.children.length > 0) {
      bind()
    } else {
      // 主路径：load 事件（useLayoutEffect 同步执行，此时 load 还未触发）
      loadHandler = () => {
        if (!cancelled) bind()
        clearPending()
      }
      iframe.addEventListener('load', loadHandler)

      // 兜底：每 100ms 轮询（极端情况 load 未触发）
      const poll = () => {
        if (cancelled) return
        const cd = iframe.contentDocument
        // body.children.length > 0 确保不是 about:blank
        if (cd && cd.body && cd.body.children.length > 0) {
          bind()
          clearPending()
          return
        }
        pollTimer = window.setTimeout(poll, 100)
      }
      pollTimer = window.setTimeout(poll, 100)
    }

    return () => {
      cancelled = true
      clearPending()
      const bindCleanup = (bind as unknown as { __cleanup?: () => void }).__cleanup
      if (bindCleanup) bindCleanup()
      if (doc) {
        doc.removeEventListener('click', onClick, true)
        doc.removeEventListener('mouseover', onMouseOver, true)
        doc.removeEventListener('mouseout', onMouseOut, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionKey])

  /** 浮动徽章：提取当前页面标题（用于展示） */
  const pageTitle = (() => {
    if (!session) return ''
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(session.html)
    return (m?.[1] || '导入的页面').slice(0, 40)
  })()

  /** 复制当前 HTML 到剪贴板（封装供浮动徽章调用） */
  const handleCopyHtml = useCallback(async () => {
    try {
      const html = serializeRefineHtml(iframeId)
      await navigator.clipboard.writeText(html)
      console.info('[RefineCanvas] 已复制 HTML 到剪贴板')
    } catch (e) {
      console.warn('[RefineCanvas] 复制失败：', e)
    }
  }, [iframeId])

  if (!session) return null

  /**
   * 把 HTML 内的所有相对资源引用改写为绝对 URL，避免注入 `<base href>` 导致 iframe 导航。
   *
   * 关键背景：
   * srcdoc 文档的 base URL 默认是 `about:srcdoc`，相对路径无法解析。常见的修复方法
   * 是注入 `<base href="http://host/path/">`，但这会让文档"基础 URL"指向真实 HTTP URL，
   * 一旦用户点击 `<a href="#services">` 之类的 hash 链接，浏览器会认为 iframe 已导航到
   * `<base>#services` 这个真实 URL，并发起 HTTP 请求。Vite dev server 配了 SPA fallback
   * （任何路径都返回 index.html），结果 iframe 显示了主应用，模板被替换！
   *
   * 正确做法：直接把 HTML 里所有 `assets-X/...` 引用（href/src）和 CSS `url(...)` 引用
   * 改写为绝对 URL（用 baseUrl 拼），不依赖 `<base href>`。这样 iframe 始终在 srcdoc 模式，
   * 相对路径不会触发任何导航。
   *
   * 处理范围：
   * 1. `href="assets-X/..."` / `src="assets-X/..."` → 绝对 URL
   * 2. `href="js/..."` / `src="js/..."`（Agency 模板的 scripts.js 等）→ 绝对 URL
   * 3. `href="css/..."` / `src="css/..."` → 绝对 URL
   * 4. CSS `url("../assets/...")` / `url("assets/...")` → 绝对 URL
   * 5. CSS `url("./assets/...")` → 绝对 URL
   * 6. 跳过 `href="#xxx"`（hash 链接）和协议相对/绝对的 URL
   *
   * 重要：必须**先**提取 `assets-X` 资源目录名，**再**改写 href/src 属性。
   * 否则改写后所有 href/src 都是绝对 URL，扫描不到 `assets-X` 前缀。
   */
  const rewriteAssetUrls = (html: string, baseUrl: string): string => {
    // baseUrl 必须以 `/` 结尾
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

    // 0. 先扫描 HTML 提取 assets-X 资源目录前缀（在重写 href/src 之前！）
    //    因为重写后 href/src 变成绝对 URL，扫描不到 `assets-` 前缀
    const assetRefs = html.match(/(?:href|src)=["'](assets-[^"']+)/gi) || []
    const counts = new Map<string, number>()
    for (const r of assetRefs) {
      const m = r.match(/(assets-[^/'"]+)/i)
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1)
    }
    let resourceDir: string | null = null
    let maxCount = 0
    for (const [dir, c] of counts) {
      if (c > maxCount) {
        maxCount = c
        resourceDir = dir
      }
    }

    // 1. 重写 HTML 属性里的相对资源引用
    //    匹配 `href="..."` / `src="..."`，捕获引号内的值
    //    排除：空字符串、hash 链接（#xxx）、协议/绝对 URL、javascript:、data:、mailto:、tel:
    const rewriteAttr = (match: string, attr: string, quote: string, value: string): string => {
      // 跳过这些情况
      if (!value) return match
      if (value.startsWith('#')) return match // hash 链接
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return match // 协议：https: data: mailto: 等
      if (value.startsWith('//')) return match // 协议相对

      // 相对路径 → 绝对 URL
      return `${attr}=${quote}${base}${value}${quote}`
    }

    let result = html.replace(
      /(href|src)=(["'])([^"']*)\2/gi,
      (m, attr, quote, value) => rewriteAttr(m, attr, quote, value),
    )

    // 2. 重写 CSS url() 引用
    //    匹配 `url(...)`（单/双/无引号都支持），处理以下路径：
    //    - `../assets/...` → baseUrl/assets-X/...（通过 baseUrl + assets-X 前缀）
    //    - `assets/...` → baseUrl/assets-X/...
    //    - `./assets/...` → baseUrl/assets-X/...
    //    - `js/...`、`css/...` → baseUrl/js/...、baseUrl/css/...（直接拼 baseUrl）
    //    注意：开源模板的 CSS 里 `url("../assets/...")` 是相对于 CSS 文件位置的；
    //    我们要把它们改写为相对于 baseUrl 的绝对 URL。
    result = result.replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
      (m, quote, value) => {
        // 跳过绝对 URL、data:、hash 等
        if (!value) return m
        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return m
        if (value.startsWith('//')) return m
        if (value.startsWith('#')) return m

        // 处理 `../assets/...`：解析为 `<baseUrl>/<resourceDir>/...`
        // 因为 ../assets/ 相对于 imported-templates/ 解析为 /assets/（错的），
        // 但实际资源在 <baseUrl>/<resourceDir>/ 下。
        if (value.startsWith('../assets/')) {
          const rest = value.slice('../assets/'.length)
          const dir = resourceDir || 'assets'
          return `url("${base}${dir}/${rest}")`
        }
        // `assets/...`：相对于当前文档（imported-templates/），拼 baseUrl
        if (value.startsWith('assets/') && !value.startsWith('assets-')) {
          return `url("${base}${value}")`
        }
        // `./assets/...`
        if (value.startsWith('./assets/')) {
          return `url("${base}${value.slice(2)}")`
        }
        // 其他相对路径（js/、css/、img/ 等）：直接拼 baseUrl
        return `url("${base}${value}")`
      },
    )

    return result
  }

  // 计算 baseUrl（绝对 URL，末尾有 /）
  // 用于把 HTML 内的相对资源引用改写为绝对 URL。
  //
  // 注意：不能用 `<base href="...">` 指向真实 URL，
  // 否则点击 hash 链接（#services）时 iframe 会"导航"到该真实 URL，
  // Vite SPA fallback 会返回 PageForge 主应用，模板被替换！
  const rawBase = session.baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}imported-templates/` : '/')
  const baseUrl =
    /^https?:\/\//i.test(rawBase)
      ? rawBase
      : typeof window !== 'undefined'
        ? `${window.location.origin}${rawBase.startsWith('/') ? '' : '/'}${rawBase}`
        : rawBase
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

  // 把 HTML 内的所有相对资源引用改写为绝对 URL（不注入 base href）
  let iframeHtml = rewriteAssetUrls(session.html, normalizedBase)

  // 将中和 CSS 注入到 srcdoc HTML 中，确保 iframe 从第一帧就以正确 CSS 渲染，
  // 避免"先以原始 CSS 显示 → CSS 注入后回流 → 顶部内容右移抖动"的视觉闪烁。
  // 关键：100vw 元素在注入前宽度 = iframe.clientWidth（可能 ≠ canvasW），
  // 注入后变为 100%（= body.width = canvasW），宽度变化导致内容偏移。
  const canvasW = Math.max(320, parseInt(String(useEditorStore.getState().canvas.width)) || 1200)
  const NEUTRALIZE_CSS = `
<style id="pf-refine-neutralize">
  html, body, * {
    min-height: 0 !important;
    max-height: none !important;
  }
  html, body {
    height: auto !important;
    width: ${canvasW}px !important;
    box-sizing: border-box !important;
  }
  body {
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
  }
  .vh-100, .min-vh-100, .h-100, [style*="100vh"], [style*="100%"] {
    height: auto !important;
    min-height: 0 !important;
  }
  [style*="100vw"] {
    width: 100% !important;
    max-width: 100% !important;
  }
  [style*="max-width: 100vw"], [style*="max-width:100vw"] {
    max-width: 100% !important;
  }
</style>`
  // 注入到 </head> 之前（如果有 head），否则注入到 <body> 之前
  if (iframeHtml.includes('</head>')) {
    iframeHtml = iframeHtml.replace('</head>', NEUTRALIZE_CSS + '</head>')
  } else if (iframeHtml.includes('<body')) {
    iframeHtml = iframeHtml.replace('<body', NEUTRALIZE_CSS + '<body')
  } else {
    iframeHtml = NEUTRALIZE_CSS + iframeHtml
  }

  // wrapper 尺寸：宽度始终 = session.width（稳定不变，避免居中后偏移），高度 = 实测内容高度
  // 浮动徽章用 absolute top: -52 定位在画布卡片上方，不占布局空间
  const wrapperW = session.width
  const wrapperH = measured?.height || session.height

  return (
    <div
      style={{
        position: 'relative',
        width: wrapperW,
        height: wrapperH,
      }}
      data-pf-refine-canvas="true"
    >
      {/* 浮动徽章：精修模式 + 页面标题 + 快速操作 */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full transition-all"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 7, 100, 0.95) 0%, rgba(76, 29, 149, 0.95) 100%)',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          boxShadow: '0 8px 24px rgba(59, 7, 100, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2)',
          top: -52,
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={() => setHoveredBadge(true)}
        onMouseLeave={() => setHoveredBadge(false)}
      >
        {/* 紫色脉冲点 — 标识精修激活态 */}
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: hoveredBadge ? '#f0abfc' : '#c4b5fd',
            boxShadow: hoveredBadge
              ? '0 0 0 4px rgba(240, 171, 252, 0.25)'
              : '0 0 0 4px rgba(196, 181, 253, 0.2)',
            transition: 'all 0.2s',
          }}
        />
        <span className="text-purple-100 text-xs font-medium tracking-wide">精修模式</span>
        <span className="text-purple-300/70 text-xs">·</span>
        <span className="text-purple-200 text-xs font-mono max-w-[260px] truncate">{pageTitle}</span>
        <span className="text-purple-400/50 text-xs ml-1 hidden sm:inline">
          {wrapperW} × {wrapperH}
        </span>
        {/* 分隔线 */}
        <span className="w-px h-4 bg-purple-400/30 mx-1" />
        {/* 复制 HTML */}
        <button
          onClick={handleCopyHtml}
          className="px-2 py-0.5 rounded text-[11px] text-purple-200 hover:text-white hover:bg-purple-500/30 transition-colors flex items-center gap-1"
          title="复制当前页面完整 HTML"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          复制
        </button>
        {/* 退出 */}
        <button
          onClick={exitRefine}
          className="px-2 py-0.5 rounded text-[11px] text-purple-200 hover:text-white hover:bg-purple-500/30 transition-colors flex items-center gap-1"
          title="退出精修模式"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          退出
        </button>
      </div>

      {/* 页面卡片：浅紫渐变背景 + 投影 + 圆角，让页面被"框"起来 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // 显微镜风：淡紫渐变 + 柔和大投影 + 8px 圆角
          background: 'linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%)',
          borderRadius: 8,
          boxShadow:
            '0 0 0 1px rgba(168, 85, 247, 0.15), 0 20px 50px -10px rgba(59, 7, 100, 0.25), 0 8px 24px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
        }}
      >
        <iframe
          key={session.sessionKey}
          id={iframeId}
          ref={iframeRef}
          title="Refine mode canvas"
          srcDoc={iframeHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: 'transparent',
            opacity: ready ? 1 : 0,
            transition: 'opacity 0.2s',
            pointerEvents: 'auto',
          }}
        />

        {/* Hover 框：紫色虚线 */}
        {hoverRect && (
          <div
            style={{
              position: 'absolute',
              left: hoverRect.left,
              top: hoverRect.top,
              width: hoverRect.width,
              height: hoverRect.height,
              border: '1px dashed rgba(147, 51, 234, 0.7)',
              backgroundColor: 'rgba(147, 51, 234, 0.05)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {/* 选中框：紫色实线 + 标签（更暗的紫色，与 banner 一致） */}
        {session.selectedElement && (
          <div
            style={{
              position: 'absolute',
              left: session.selectedElement.rect.left,
              top: session.selectedElement.rect.top,
              width: session.selectedElement.rect.width,
              height: session.selectedElement.rect.height,
              border: '2px solid #7e22ce',
              backgroundColor: 'rgba(126, 34, 206, 0.08)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                backgroundColor: '#7e22ce',
                color: '#f5f3ff',
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}
            >
              &lt;{session.selectedElement.tagName}&gt;
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
