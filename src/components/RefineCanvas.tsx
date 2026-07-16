import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'
import { refineUndo } from '@/utils/refineUndo'

interface RefineCanvasProps {
  iframeId?: string
}

/** 缩放手柄方向 */
type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** 缩放手柄对应的光标样式 */
const RESIZE_CURSORS: Record<ResizeDir, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
  e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
  sw: 'nesw-resize', w: 'ew-resize',
}

/** 缩放手柄尺寸（px） —— 与画布模式统一为 10x10 白色 + 紫色边框 */
const HANDLE_SIZE = 10

export function RefineCanvas({ iframeId = 'pf-refine-iframe' }: RefineCanvasProps) {
  const session = useEditorStore((s) => s.refineSession)
  const refinePreviewMode = useEditorStore((s) => s.refinePreviewMode)
  const selectRefineElement = useEditorStore((s) => s.selectRefineElement)
  const updateRefineSize = useEditorStore((s) => s.updateRefineSize)
  const exitRefine = useEditorStore((s) => s.exitRefine)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null)

  /** 正在编辑的元素的 eid（用于 blur 时记录 undo） */
  const editingEidRef = useRef<string | null>(null)
  /** 编辑前的原始文本（用于 undo） */
  const editingOldTextRef = useRef<string>('')

  /** 缩放手柄状态 */
  const [isResizing, setIsResizing] = useState(false)
  const [resizeRect, setResizeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const resizeRef = useRef<{
    el: HTMLElement
    dir: ResizeDir
    startX: number
    startY: number
    startW: number
    startH: number
    startLeft: number
    startTop: number
    minW: number
    minH: number
  } | null>(null)

  /** 右键菜单状态（与画布模式一致：position + 选中态） */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // 右键菜单外部点击关闭（与画布模式一致：pointerdown 先于 click）
  // 用 setTimeout(0) 延迟注册，防止打开菜单的右键 click 立即触发关闭
  useEffect(() => {
    if (!ctxMenu) return
    const timer = setTimeout(() => {
      const onDown = (e: MouseEvent) => {
        if (ctxMenuRef.current?.contains(e.target as Node)) return
        closeCtxMenu()
      }
      document.addEventListener('mousedown', onDown, true)
      // 存储清理函数到 ref
      ;(ctxMenuRef as unknown as { _cleanup?: () => void })._cleanup = () => {
        document.removeEventListener('mousedown', onDown, true)
      }
    }, 0)
    return () => {
      clearTimeout(timer)
      ;(ctxMenuRef as unknown as { _cleanup?: () => void })._cleanup?.()
    }
  }, [ctxMenu, closeCtxMenu])

  /** 页面卡片容器 ref（用于 resize 时的坐标计算） */
  const cardRef = useRef<HTMLDivElement | null>(null)

  // session 变化时强制重新挂载
  useEffect(() => {
    setReady(false)
    setMeasured(null)
    setIsResizing(false)
    refineUndo.reset()
  }, [session?.sessionKey])

  /** 获取 iframe 文档（辅助函数） */
  const getDoc = useCallback(() => iframeRef.current?.contentDocument ?? null, [])

  /** 从 iframe 内的 DOM 元素提取 RefineElementInfo */
  const extractInfo = useCallback((el: HTMLElement): RefineElementInfo | null => {
    try {
      const doc = getDoc()
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
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      }
    } catch { return null }
  }, [getDoc])

  /** 通过 eid 在 iframe 中查找元素 */
  const findElementByEid = useCallback((eid: string): HTMLElement | null => {
    const doc = getDoc()
    if (!doc) return null
    return doc.querySelector(`[data-pf-eid="${eid}"]`) as HTMLElement | null
  }, [getDoc])

  /** 给元素分配唯一 eid（用于 undo 时精确定位元素） */
  const ensureEid = useCallback((el: HTMLElement): string => {
    let eid = el.getAttribute('data-pf-eid')
    if (!eid) {
      eid = 'e' + Math.random().toString(36).slice(2, 8)
      el.setAttribute('data-pf-eid', eid)
    }
    return eid
  }, [])

  /** 刷新选中元素信息（同步 store 中的 rect） */
  const refreshSelection = useCallback(() => {
    const doc = getDoc()
    const sel = useEditorStore.getState().refineSession?.selectedElement
    if (!doc || !sel) return
    const el = findElementByEid(sel.attributes['data-pf-eid'] || '')
    if (el) {
      const info = extractInfo(el)
      if (info) selectRefineElement(info)
    }
  }, [getDoc, extractInfo, findElementByEid, selectRefineElement])

  // ========== 缩放手柄 ==========

  /** 开始调整尺寸 */
  const startResize = useCallback((dir: ResizeDir, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const sel = session?.selectedElement
    if (!sel) return
    const eid = sel.attributes['data-pf-eid'] || ''
    const el = findElementByEid(eid)
    if (!el) return
    ensureEid(el)

    const rect = el.getBoundingClientRect()
    resizeRef.current = {
      el,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startLeft: rect.left,
      startTop: rect.top,
      minW: 20,
      minH: 20,
    }
    setIsResizing(true)
    setResizeRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }, [session?.selectedElement, findElementByEid, ensureEid])

  /** 调整尺寸中 */
  const handleResizeMove = useCallback((e: MouseEvent) => {
    const data = resizeRef.current
    if (!data) return
    const { el, dir, startX, startY, startW, startH, startLeft, startTop, minW, minH } = data
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    let newW = startW
    let newH = startH
    let newLeft = startLeft
    let newTop = startTop

    // 根据方向计算新尺寸
    if (dir.includes('e')) newW = Math.max(minW, startW + dx)
    if (dir.includes('w')) {
      newW = Math.max(minW, startW - dx)
      newLeft = startLeft + startW - newW
    }
    if (dir.includes('s')) newH = Math.max(minH, startH + dy)
    if (dir.includes('n')) {
      newH = Math.max(minH, startH - dy)
      newTop = startTop + startH - newH
    }

    // 直接应用到 iframe DOM 元素
    el.style.width = newW + 'px'
    el.style.height = newH + 'px'
    el.style.boxSizing = 'border-box'

    setResizeRect({ left: newLeft, top: newTop, width: newW, height: newH })
  }, [])

  /** 完成调整尺寸 */
  const handleResizeEnd = useCallback(() => {
    const data = resizeRef.current
    if (!data) return
    const { el, startW, startH } = data
    const newW = parseFloat(el.style.width) || startW
    const newH = parseFloat(el.style.height) || startH
    const oldW = String(startW)
    const oldH = String(startH)
    const eid = ensureEid(el)

    refineUndo.record({
      label: 'resize',
      execute: () => {
        const target = findElementByEid(eid)
        if (target) {
          target.style.width = newW + 'px'
          target.style.height = newH + 'px'
        }
      },
      rollback: () => {
        const target = findElementByEid(eid)
        if (target) {
          target.style.width = oldW + 'px'
          target.style.height = oldH + 'px'
        }
      },
    })

    resizeRef.current = null
    setIsResizing(false)
    setResizeRect(null)
    refreshSelection()
  }, [ensureEid, findElementByEid, refreshSelection])

  // 全局 mousemove/mouseup 监听（用于 resize）
  // 修复：改用 document + capture，确保 iframe 内部的 mouseup 也能被外层捕获到
  // （之前用 window 监听，鼠标在 iframe 内松开时会被 iframe 的 document 拦截）
  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: MouseEvent) => handleResizeMove(e)
    const onUp = () => handleResizeEnd()
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  // ========== 元素操作 ==========

  /** 删除选中元素 */
  const deleteElement = useCallback(() => {
    const sel = session?.selectedElement
    if (!sel) return
    const eid = sel.attributes['data-pf-eid'] || ''
    const el = findElementByEid(eid)
    if (!el) return
    const parent = el.parentElement
    if (!parent) return

    // 保存删除前的状态用于 undo
    const elClone = el.cloneNode(true) as HTMLElement
    const nextSibling = el.nextSibling
    const parentEid = ensureEid(parent)

    el.remove()
    selectRefineElement(null)

    refineUndo.record({
      label: 'delete',
      execute: () => {
        const p = findElementByEid(parentEid)
        if (p) {
          const target = p.querySelector(`[data-pf-eid="${eid}"]`)
          if (target) target.remove()
        }
      },
      rollback: () => {
        const p = findElementByEid(parentEid)
        if (p && nextSibling) {
          p.insertBefore(elClone, nextSibling)
        } else if (p) {
          p.appendChild(elClone)
        }
      },
    })
  }, [session?.selectedElement, findElementByEid, ensureEid, selectRefineElement])

  /** 复制选中元素 */
  const duplicateElement = useCallback(() => {
    const sel = session?.selectedElement
    if (!sel) return
    const eid = sel.attributes['data-pf-eid'] || ''
    const el = findElementByEid(eid)
    if (!el) return
    const parent = el.parentElement
    if (!parent) return

    const clone = el.cloneNode(true) as HTMLElement
    // 清除旧 eid，生成新的
    clone.removeAttribute('data-pf-eid')
    const newEid = ensureEid(clone)
    const parentEid = ensureEid(parent)

    el.insertAdjacentElement('afterend', clone)

    refineUndo.record({
      label: 'duplicate',
      execute: () => {
        const p = findElementByEid(parentEid)
        const original = p?.querySelector(`[data-pf-eid="${eid}"]`)
        if (p && original) {
          const c = original.cloneNode(true) as HTMLElement
          c.removeAttribute('data-pf-eid')
          c.setAttribute('data-pf-eid', newEid)
          original.insertAdjacentElement('afterend', c)
        }
      },
      rollback: () => {
        const c = findElementByEid(newEid)
        if (c) c.remove()
      },
    })

    // 选中新元素
    const info = extractInfo(clone)
    if (info) selectRefineElement(info)
  }, [session?.selectedElement, findElementByEid, ensureEid, extractInfo, selectRefineElement])

  // ========== 测量与同步 ==========

  const measureAndSyncSize = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc || !doc.body) return

    // 强制浏览器重排，确保 body.scrollHeight 反映最新 DOM 变更
    void doc.body.offsetHeight
    void doc.documentElement.offsetHeight

    const NEUTRALIZE_ID = 'pf-refine-neutralize'
    if (!doc.getElementById(NEUTRALIZE_ID)) {
      const styleEl = doc.createElement('style')
      styleEl.id = NEUTRALIZE_ID
      styleEl.textContent = `
        html, body, * { min-height: 0 !important; max-height: none !important; }
        html, body { height: auto !important; }
        html { overflow: hidden !important; }
        body { overflow: visible !important; overflow-x: visible !important; overflow-y: visible !important; }
        .vh-100, .min-vh-100, .h-100, [style*="100vh"], [style*="100%"] { height: auto !important; min-height: 0 !important; }
        [style*="100vw"] { width: 100% !important; max-width: 100% !important; }
        [style*="max-width: 100vw"], [style*="max-width:100vw"] { max-width: 100% !important; }
      `
      ;(doc.head || doc.documentElement).appendChild(styleEl)
      void doc.body.offsetHeight
    }

    const body = doc.body
    const canvasW = Math.max(320, parseInt(String(useEditorStore.getState().canvas.width)) || 1200)
    if (doc.documentElement.style.width !== `${canvasW}px`) {
      doc.documentElement.style.width = `${canvasW}px`
      doc.documentElement.style.boxSizing = 'border-box'
      body.style.width = `${canvasW}px`
      body.style.boxSizing = 'border-box'
      void body.offsetHeight
    }

    const h = Math.max(body.scrollHeight, body.offsetHeight)
    const finalW = canvasW
    const finalH = Math.ceil(h) + 8
    let changed = false
    setMeasured((prev) => {
      if (prev && prev.width === finalW && prev.height === finalH) return prev
      changed = true
      return { width: finalW, height: finalH }
    })
    if (changed) updateRefineSize(finalW, finalH)
  }, [updateRefineSize])

  // ========== 键盘快捷键 ==========

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 不拦截输入元素中的键盘事件
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }

      // Ctrl+Z / Ctrl+Shift+Z 撤销重做
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          refineUndo.redo()
          refreshSelection()
          measureAndSyncSize()
        } else {
          refineUndo.undo()
          refreshSelection()
          measureAndSyncSize()
        }
        return
      }

      // Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        refineUndo.redo()
        refreshSelection()
        measureAndSyncSize()
        return
      }

      // Delete / Backspace 删除选中元素
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (session?.selectedElement) {
          e.preventDefault()
          deleteElement()
          measureAndSyncSize()
        }
        return
      }

      // Escape 取消选中
      if (e.key === 'Escape') {
        if (session?.selectedElement) {
          selectRefineElement(null)
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session?.selectedElement, deleteElement, selectRefineElement, refreshSelection, measureAndSyncSize])

  // ========== iframe 事件绑定 ==========

  useLayoutEffect(() => {
    if (!session) return
    const iframe = iframeRef.current
    if (!iframe) return

    let cancelled = false
    let bound = false
    let doc: Document | null = null
    let iframeWin: Window | null = null
    let loadHandler: (() => void) | null = null
    let pollTimer: number | null = null

    const onClick = (e: MouseEvent) => {
      // 预览模式下：阻止所有浏览器默认导航，但保留 JS 事件（不 stopPropagation）
      if (refinePreviewMode) {
        const t = e.target as HTMLElement | null
        const a = t?.closest('a[href]') as HTMLAnchorElement | null
        if (a) {
          const href = a.getAttribute('href') || ''
          // 锚点链接：手动滚动
          if (href.startsWith('#')) {
            e.preventDefault()
            const id = href.slice(1)
            const target = doc?.getElementById(id)
            if (target) target.scrollIntoView({ behavior: 'smooth' })
            return
          }
          // 空 href / javascript: / 同源路径 → 阻止导航
          e.preventDefault()
          if (!href || href === '.' || href === './' || href === '/' || href === window.location.pathname || href.startsWith('javascript:')) {
            return
          }
          // 外部链接：新窗口打开
          try {
            const absoluteUrl = new URL(href, a.baseURI).toString()
            if (!absoluteUrl.startsWith(window.location.origin + '/') && absoluteUrl !== window.location.origin + '/' && absoluteUrl !== window.location.origin) {
              window.open(absoluteUrl, '_blank', 'noopener,noreferrer')
            }
          } catch { /* 无效 URL，静默 */ }
          return
        }
        // 非 anchor 元素：阻止默认导航，但放行 JS 事件处理
        e.preventDefault()
        return
      }
      // 编辑模式：阻止所有链接跳转和弹窗触发（防止开源模板中 href/onclick 误触导致页面跳转）
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement | null
      if (!target) return
      // 阻止 <a> 链接和 <button> 的 form 提交等默认行为
      if (target.closest('a[href]') || target.closest('[data-bs-toggle="modal"]') || target.closest('[data-toggle="modal"]')) {
        e.preventDefault()
      }
      ensureEid(target)
      const info = extractInfo(target)
      if (info) selectRefineElement(info)
    }

    /**
     * 双击编辑：直接在原元素上原地编辑（contentEditable），保留原样式。
     */
    const onDblClick = (e: MouseEvent) => {
      if (refinePreviewMode) return
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement | null
      if (!target) return
      ensureEid(target)
      const info = extractInfo(target)
      if (!info) return

      // 选中元素
      selectRefineElement(info)

      // void 元素不可编辑
      const VOID_TAGS = new Set(['img', 'input', 'hr', 'br', 'video', 'audio', 'iframe', 'source', 'track'])
      if (VOID_TAGS.has(info.tagName)) return

      // 使元素可编辑
      const eid = target.getAttribute('data-pf-eid') || ''
      if (!eid) return

      editingEidRef.current = eid
      editingOldTextRef.current = target.textContent ?? ''
      target.contentEditable = 'true'
      // 消除浏览器默认的黄色 focus outline
      target.style.outline = 'none'
      target.focus()
      // 选中全文
      const sel = doc?.getSelection()
      if (sel && doc) {
        sel.selectAllChildren(target)
      }
    }

    /**
     * 处理 contentEditable 元素 blur → 结束编辑，记录 undo
     */
    const onBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || !target.isContentEditable) return
      const eid = editingEidRef.current
      if (!eid) return
      const newText = target.textContent ?? ''
      const oldText = editingOldTextRef.current
      target.contentEditable = 'inherit'
      if (newText !== oldText) {
        refineUndo.record({
          label: 'text',
          execute: () => {
            const t = findElementByEid(eid)
            if (t) t.textContent = newText
          },
          rollback: () => {
            const t = findElementByEid(eid)
            if (t) t.textContent = oldText
          },
        })
      }
      editingEidRef.current = null
      editingOldTextRef.current = ''
    }

    /**
     * 右键菜单：与画布模式一致 —— 右键触发，菜单固定在鼠标位置。
     * 若已选中元素 → 菜单针对选中元素（删除/复制）
     * 若未选中 → 选中右键命中的元素后再开菜单
     */
    const onContextMenu = (e: MouseEvent) => {
      if (refinePreviewMode) return
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement | null
      if (target) {
        ensureEid(target)
        const info = extractInfo(target)
        if (info) selectRefineElement(info)
      }
      const iframeRect = iframeRef.current?.getBoundingClientRect()
      const x = e.clientX + (iframeRect?.left ?? 0)
      const y = e.clientY + (iframeRect?.top ?? 0)
      setCtxMenu({ x, y })
    }

    const onMouseOver = (e: MouseEvent) => {
      if (isResizing) return
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
      if (!isResizing) setHoverRect(null)
    }

    /** 将 iframe 内的 pointer 事件转发到父窗口（用于十字线/标尺指示 + 手型平移）。
     *  关键 1：使用 MouseEvent（而非 PointerEvent）确保 clientX/clientY 在跨浏览器环境下被正确设置；
     *  关键 2：派发到 document（而非 window）利用 DOM 冒泡机制确保事件传播到 window 监听器；
     *  关键 3：使用 iframeRect.width / innerWidth 计算实际视觉缩放比（而非 store 中的 zoom），
     *          避免 store zoom 更新与渲染不同步导致的十字线偏移；
     *  关键 4：加上 iframe 内部滚动偏移（scrollX/scrollY），确保十字线在内容滚动后仍与光标对齐。 */
    const forwardPointerEvent = (e: PointerEvent) => {
      const iframe = iframeRef.current
      if (!iframe) return
      const iframeRect = iframe.getBoundingClientRect()
      if (!iframeRect || iframeRect.width === 0) return
      const iframeWin = iframe.contentWindow
      if (!iframeWin) return
      const cssW = iframeWin.innerWidth
      const cssH = iframeWin.innerHeight
      if (cssW === 0 || cssH === 0) return

      const scaleX = iframeRect.width / cssW
      const scaleY = iframeRect.height / cssH

      // iframe 内部滚动偏移：若内容比视口宽/高，浏览器可能产生滚动，e.clientX/Y 仅相对于视口
      const sx = iframeWin.scrollX || 0
      const sy = iframeWin.scrollY || 0

      document.dispatchEvent(new MouseEvent(e.type, {
        clientX: (e.clientX + sx) * scaleX + iframeRect.left,
        clientY: (e.clientY + sy) * scaleY + iframeRect.top,
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
        buttons: e.buttons,
        bubbles: true,
        cancelable: true,
        view: window,
      }))
    }

    /** 处理精修模式下的 Ctrl+Wheel / 双指缩放 */
    const forwardWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const store = useEditorStore.getState()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        store.setZoom(store.zoom + delta)
      }
    }

    const bind = () => {
      if (cancelled || bound) return
      doc = iframe.contentDocument
      if (!doc || !doc.body) return
      bound = true

      doc.body.setAttribute('data-pf-refine', 'true')
      doc.addEventListener('click', onClick, true)
      doc.addEventListener('dblclick', onDblClick, true)
      doc.addEventListener('contextmenu', onContextMenu, true)
      doc.addEventListener('mouseover', onMouseOver, true)
      doc.addEventListener('mouseout', onMouseOut, true)
      doc.addEventListener('pointermove', forwardPointerEvent, true)
      doc.addEventListener('pointerdown', forwardPointerEvent, true)
      doc.addEventListener('pointerup', forwardPointerEvent, true)
      doc.addEventListener('wheel', forwardWheel, { passive: false, capture: true })
      doc.addEventListener('focusout', onBlur, true)

      // 同时监听 iframe 的 contentWindow 的 wheel 事件（兜底：document 级 capture 可能被 iframe 内部元素消费）
      iframeWin = iframe.contentWindow
      if (iframeWin) {
        iframeWin.addEventListener('wheel', forwardWheel, { passive: false, capture: true })
      }

      try { measureAndSyncSize() } catch (e) { console.error('[RefineCanvas] measureAndSyncSize failed:', e) }
      setReady(true)

      const timers: number[] = []
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 200))
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 1000))
      timers.push(window.setTimeout(() => { if (!cancelled) measureAndSyncSize() }, 2500))

      let resizeObserver: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined' && doc.body) {
        resizeObserver = new ResizeObserver(() => { if (!cancelled) measureAndSyncSize() })
        resizeObserver.observe(doc.body)
        resizeObserver.observe(doc.documentElement)
      }

      ;(bind as unknown as { __cleanup?: () => void }).__cleanup = () => {
        timers.forEach((t) => clearTimeout(t))
        if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
      }
    }

    const clearPending = () => {
      if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null }
      if (loadHandler) { iframe.removeEventListener('load', loadHandler); loadHandler = null }
    }

    const currentDoc = iframe.contentDocument
    if (currentDoc && currentDoc.body && currentDoc.body.children.length > 0) {
      bind()
    } else {
      loadHandler = () => { if (!cancelled) bind(); clearPending() }
      iframe.addEventListener('load', loadHandler)
      const poll = () => {
        if (cancelled) return
        const cd = iframe.contentDocument
        if (cd && cd.body && cd.body.children.length > 0) { bind(); clearPending(); return }
        pollTimer = window.setTimeout(poll, 100)
      }
      pollTimer = window.setTimeout(poll, 100)
    }

    // 监听外部插入事件（组件库点击），触发重新测量
    const onRemasure = () => {
      if (!cancelled) measureAndSyncSize()
    }
    window.addEventListener('pf-refine-remeasure', onRemasure)

    // 监听 RefineInspector 头部的"删除"按钮 —— 与画布模式统一互通
    const onDeleteSelected = () => {
      if (!cancelled) deleteElement()
    }
    window.addEventListener('pf-refine-delete-selected', onDeleteSelected)

    return () => {
      cancelled = true
      clearPending()
      window.removeEventListener('pf-refine-remeasure', onRemasure)
      window.removeEventListener('pf-refine-delete-selected', onDeleteSelected)
      const bindCleanup = (bind as unknown as { __cleanup?: () => void }).__cleanup
      if (bindCleanup) bindCleanup()
      if (doc) {
        doc.removeEventListener('click', onClick, true)
        doc.removeEventListener('dblclick', onDblClick, true)
        doc.removeEventListener('contextmenu', onContextMenu, true)
        doc.removeEventListener('mouseover', onMouseOver, true)
        doc.removeEventListener('mouseout', onMouseOut, true)
        doc.removeEventListener('pointermove', forwardPointerEvent, true)
        doc.removeEventListener('pointerdown', forwardPointerEvent, true)
        doc.removeEventListener('pointerup', forwardPointerEvent, true)
        doc.removeEventListener('wheel', forwardWheel, { capture: true } as any)
        doc.removeEventListener('focusout', onBlur, true)
      }
      if (iframeWin) {
        iframeWin.removeEventListener('wheel', forwardWheel, { capture: true } as any)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionKey, isResizing, refinePreviewMode])

  // ========== 渲染 ==========

  const pageTitle = (() => {
    if (!session) return ''
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(session.html)
    return (m?.[1] || '导入的页面').slice(0, 40)
  })()

  if (!session) return null

  // ========== URL 重写 ==========

  const rewriteAssetUrls = (html: string, baseUrl: string): string => {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
    const assetRefs = html.match(/(?:href|src)=["'](assets-[^"']+)/gi) || []
    const counts = new Map<string, number>()
    for (const r of assetRefs) {
      const m = r.match(/(assets-[^/'"]+)/i)
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1)
    }
    let resourceDir: string | null = null
    let maxCount = 0
    for (const [dir, c] of counts) { if (c > maxCount) { maxCount = c; resourceDir = dir } }

    const rewriteAttr = (match: string, attr: string, quote: string, value: string): string => {
      if (!value) return match
      if (value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return match
      return `${attr}=${quote}${base}${value}${quote}`
    }

    let result = html.replace(
      /(href|src)=(["'])([^"']*)\2/gi,
      (m, attr, quote, value) => rewriteAttr(m, attr, quote, value),
    )

    result = result.replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
      (m, quote, value) => {
        if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('#')) return m
        if (value.startsWith('../assets/')) {
          const rest = value.slice('../assets/'.length)
          const dir = resourceDir || 'assets'
          return `url("${base}${dir}/${rest}")`
        }
        if (value.startsWith('assets/') && !value.startsWith('assets-')) return `url("${base}${value}")`
        if (value.startsWith('./assets/')) return `url("${base}${value.slice(2)}")`
        return `url("${base}${value}")`
      },
    )
    return result
  }

  const rawBase = session.baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}imported-templates/` : '/')
  const baseUrl = /^https?:\/\//i.test(rawBase) ? rawBase : typeof window !== 'undefined' ? `${window.location.origin}${rawBase.startsWith('/') ? '' : '/'}${rawBase}` : rawBase
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'

  let iframeHtml = rewriteAssetUrls(session.html, normalizedBase)

  const canvasW = Math.max(320, parseInt(String(useEditorStore.getState().canvas.width)) || 1200)
  const NEUTRALIZE_CSS = `
<style id="pf-refine-neutralize">
  html, body, * { min-height: 0 !important; max-height: none !important; }
  html, body { height: auto !important; width: ${canvasW}px !important; box-sizing: border-box !important; }
  html { overflow: hidden !important; }
  body { overflow: visible !important; overflow-x: visible !important; overflow-y: visible !important; }
  .vh-100, .min-vh-100, .h-100, [style*="100vh"], [style*="100%"] { height: auto !important; min-height: 0 !important; }
  [style*="100vw"] { width: 100% !important; max-width: 100% !important; }
  [style*="max-width: 100vw"], [style*="max-width:100vw"] { max-width: 100% !important; }
</style>`
  if (iframeHtml.includes('</head>')) {
    iframeHtml = iframeHtml.replace('</head>', NEUTRALIZE_CSS + '</head>')
  } else if (iframeHtml.includes('<body')) {
    iframeHtml = iframeHtml.replace('<body', NEUTRALIZE_CSS + '<body')
  } else {
    iframeHtml = NEUTRALIZE_CSS + iframeHtml
  }

  const wrapperW = session.width
  const wrapperH = measured?.height || session.height

  /** 当前显示的选中框 rect（resize 中优先用 resizeRect） */
  const displayRect = resizeRect || session.selectedElement?.rect || null

  /** 生成缩放手柄样式（与画布模式统一：白底 + 紫色边框 + 圆角 2px） */
  const handleStyle = (dir: ResizeDir): React.CSSProperties => {
    const h = HANDLE_SIZE
    const halfH = h / 2
    const center = `calc(50% - ${halfH}px)`
    const pos: Record<string, React.CSSProperties> = {
      nw: { top: -1, left: -1, transform: 'translate(-50%,-50%)' },
      n: { top: -1, left: '50%', transform: 'translate(-50%,-50%)' },
      ne: { top: -1, right: -1, transform: 'translate(50%,-50%)' },
      e: { top: '50%', right: -1, transform: 'translate(50%,-50%)' },
      se: { bottom: -1, right: -1, transform: 'translate(50%,50%)' },
      s: { bottom: -1, left: '50%', transform: 'translate(-50%,50%)' },
      sw: { bottom: -1, left: -1, transform: 'translate(-50%,50%)' },
      w: { top: '50%', left: -1, transform: 'translate(-50%,-50%)' },
    }
    return {
      position: 'absolute',
      width: h,
      height: h,
      backgroundColor: '#ffffff',
      border: '1.5px solid #6366f1',
      borderRadius: 2,
      cursor: RESIZE_CURSORS[dir],
      zIndex: 20,
      pointerEvents: 'auto',
      ...pos[dir],
    }
  }

  return (
    <div
      style={{ position: 'relative', width: wrapperW, height: wrapperH }}
      data-pf-refine-canvas="true"
    >
      {/* 浮动徽章 — 预览模式下隐藏。
          仅显示精修状态指示 + 页面标题，简洁低调。 */}
      {!refinePreviewMode && (
      <div
        className="absolute top-0 left-0 z-30 flex items-center gap-2 px-3 py-1.5"
        style={{
          background: 'rgba(30, 27, 75, 0.85)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 4,
          top: -36,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="text-indigo-300 text-[11px] font-medium">精修模式</span>
        <span className="text-gray-500 text-[11px]">·</span>
        <span className="text-gray-300 text-[11px] font-mono max-w-[200px] truncate">{pageTitle}</span>
      </div>
      )}

      {/* 页面卡片 */}
      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%)',
          borderRadius: 8,
          boxShadow: '0 0 0 1px rgba(168, 85, 247, 0.15), 0 20px 50px -10px rgba(59, 7, 100, 0.25), 0 8px 24px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
        }}
      >
        <iframe
          key={session.sessionKey}
          id={iframeId}
          ref={iframeRef}
          title="Refine mode canvas"
          srcDoc={iframeHtml}
          sandbox="allow-same-origin allow-scripts"
          style={{
            width: '100%', height: '100%', border: 'none', display: 'block',
            backgroundColor: 'transparent', opacity: ready ? 1 : 0,
            transition: 'opacity 0.2s', pointerEvents: 'auto',
          }}
        />

        {/* Hover 框 — 预览模式下隐藏（颜色与画布模式选中框对齐：#6366f1） */}
        {!refinePreviewMode && hoverRect && !isResizing && (
          <div
            style={{
              position: 'absolute', left: hoverRect.left, top: hoverRect.top,
              width: hoverRect.width, height: hoverRect.height,
              outline: '1px dashed rgba(99, 102, 241, 0.5)',
              outlineOffset: 0,
              backgroundColor: 'rgba(99, 102, 241, 0.04)',
              pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}

        {/* 选中框 + 缩放手柄 — 预览模式下隐藏（与画布模式颜色统一：#6366f1） */}
        {!refinePreviewMode && displayRect && !isResizing && (
          <div
            style={{
              position: 'absolute',
              left: displayRect.left,
              top: displayRect.top,
              width: displayRect.width,
              height: displayRect.height,
              outline: '2px dashed #6366f1',
              outlineOffset: 0,
              backgroundColor: 'rgba(99, 102, 241, 0.06)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            {/* 8 个缩放手柄 */}
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeDir[]).map((dir) => (
              <div
                key={dir}
                style={handleStyle(dir)}
                onMouseDown={(e) => startResize(dir, e)}
              />
            ))}
          </div>
        )}

        {/* 文本编辑：双击直接在原元素上原地编辑（contentEditable），保留原样式 */}
      </div>

      {/* 右键菜单 — 与画布模式同款（fixed + 暗色风格 + Portal 到 body） */}
      {ctxMenu && session?.selectedElement && createPortal(
        <div
          ref={ctxMenuRef}
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 100000,
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: 6,
            padding: 4,
            minWidth: 130,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
          onClick={closeCtxMenu}
        >
          <CtxMenuItem
            label="删除"
            disabled={false}
            onClick={() => { closeCtxMenu(); deleteElement() }}
            danger
          />
          <CtxMenuItem
            label="重复"
            disabled={false}
            onClick={() => { closeCtxMenu(); duplicateElement() }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

/** 右键菜单单项（与画布模式同款暗色风格） */
function CtxMenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick() }}
      style={{
        padding: '6px 12px',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#64748b' : (danger ? '#fca5a5' : '#e2e8f0'),
        fontSize: 13,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = '#334155'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {label}
    </div>
  )
}