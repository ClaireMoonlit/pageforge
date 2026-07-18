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
  /** iframe 内部 DOM 真正就绪：load 事件触发 + 等 2 帧 + body 有子元素 + 1500ms 兜底
   *  避免 loading 提示消失但内容还在解析时的"白屏 + 紫色 hover 框"误交互 */
  const [bodyReady, setBodyReady] = useState(false)
  const loadedAtRef = useRef<number>(0)
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

  /** 拖拽移动状态（ref 避免拖拽期间重渲染） */
  const dragMoveRef = useRef<{
    el: HTMLElement | null
    eid: string
    /** 鼠标按下时的主文档屏幕坐标 */
    startX: number
    startY: number
    /** 元素当前的 left/top（parseFloat 后的像素值，默认 0） */
    origLeft: number
    origTop: number
    /** 是否已开始拖拽（超过阈值后为 true） */
    active: boolean
    /** iframe 视觉缩放比 = iframeRect.width / innerWidth，用于将主文档像素转为 iframe CSS 像素 */
    scaleX: number
    scaleY: number
    /** 元素原始 transform（拖拽前保存，松手后恢复） */
    origTransform: string
    /** 元素原始 zIndex（拖拽前保存，松手后恢复） */
    origZIndex: string
    /** 元素原始宽高（拖拽开始时记录，用于吸附计算） */
    elWidth: number
    elHeight: number
    /** 拖拽原地 ghost 克隆（模拟 Canvas 模式 dnd-kit 浅色影子） */
    ghost: HTMLElement | null
  }>({ el: null, eid: '', startX: 0, startY: 0, origLeft: 0, origTop: 0, active: false, scaleX: 1, scaleY: 1, origTransform: '', origZIndex: '', elWidth: 0, elHeight: 0, ghost: null })
  /** 拖拽刚结束标记：防止 click 事件在拖拽后误触发选中切换 */
  const dragJustEndedRef = useRef(false)

  // session 变化时强制重新挂载
  useEffect(() => {
    setReady(false)
    setBodyReady(false)
    loadedAtRef.current = 0
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

  // ========== 拖拽吸附对齐线 ==========

  const SNAP_THRESHOLD = 8
  const SNAP_DEACTIVATE = 14
  /** 主页面吸附参考线 DOM ref（渲染在 card div 内，z-index 高于内容层，不会被 iframe 内容遮挡） */
  const snapGuideVRef = useRef<HTMLDivElement | null>(null)
  const snapGuideHRef = useRef<HTMLDivElement | null>(null)
  const snapActiveRef = useRef({ x: false, y: false })
  /** 拖拽中标记（用于隐藏选中框/悬停框） */
  const [isDragging, setIsDragging] = useState(false)

  /** 显示主页面吸附参考线：将 iframe 视口坐标转换为 card div 坐标 */
  const showSnapGuides = (vPos: number | null, hPos: number | null) => {
    const vEl = snapGuideVRef.current
    const hEl = snapGuideHRef.current
    if (!vEl || !hEl) return

    const iframe = iframeRef.current
    if (!iframe) return
    const iframeWin = iframe.contentWindow
    if (!iframeWin) return
    const iframeRect = iframe.getBoundingClientRect()
    const scaleX = iframeRect.width / (iframeWin.innerWidth || 1)
    const scaleY = iframeRect.height / (iframeWin.innerHeight || 1)

    if (vPos !== null) {
      vEl.style.left = (vPos * scaleX) + 'px'
      vEl.style.display = 'block'
    } else {
      vEl.style.display = 'none'
    }
    if (hPos !== null) {
      hEl.style.top = (hPos * scaleY) + 'px'
      hEl.style.display = 'block'
    } else {
      hEl.style.display = 'none'
    }
  }

  const hideSnapGuides = () => {
    if (snapGuideVRef.current) snapGuideVRef.current.style.display = 'none'
    if (snapGuideHRef.current) snapGuideHRef.current.style.display = 'none'
  }

  const collectSiblingRects = (doc: Document, excludeEl: HTMLElement) => {
    const rects: Array<{ left: number; right: number; top: number; bottom: number; centerX: number; centerY: number }> = []
    const body = doc.body
    if (!body) return rects
    for (const child of Array.from(body.children)) {
      if (child === excludeEl) continue
      if (child.hasAttribute('data-pf-drag-ghost')) continue
      if (child.hasAttribute('data-pf-snap-guide')) continue
      if (child.hasAttribute('data-pf-resize-handle')) continue
      if (child.hasAttribute('data-hds-overlay')) continue
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue
      const r = (child as HTMLElement).getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      rects.push({
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        centerX: r.left + r.width / 2, centerY: r.top + r.height / 2,
      })
    }
    return rects
  }

  const computeRefineSnap = (
    dragLeft: number, dragRight: number, dragTop: number, dragBottom: number,
    dragCX: number, dragCY: number,
    targets: Array<{ left: number; right: number; top: number; bottom: number; centerX: number; centerY: number }>,
  ) => {
    let dx = 0, dy = 0, showV: number | null = null, showH: number | null = null
    const xTh = snapActiveRef.current.x ? SNAP_DEACTIVATE : SNAP_THRESHOLD
    const yTh = snapActiveRef.current.y ? SNAP_DEACTIVATE : SNAP_THRESHOLD
    for (const t of targets) {
      if (showV === null) {
        for (const c of [{ o: t.left - dragLeft, p: t.left }, { o: t.right - dragRight, p: t.right }, { o: t.centerX - dragCX, p: t.centerX }]) {
          if (Math.abs(c.o) <= xTh) { dx = c.o; showV = c.p; break }
        }
      }
      if (showH === null) {
        for (const c of [{ o: t.top - dragTop, p: t.top }, { o: t.bottom - dragBottom, p: t.bottom }, { o: t.centerY - dragCY, p: t.centerY }]) {
          if (Math.abs(c.o) <= yTh) { dy = c.o; showH = c.p; break }
        }
      }
      if (showV !== null && showH !== null) break
    }
    return { dx, dy, showV, showH }
  }

  // ========== 拖拽移动 ==========

  /** 全局 pointermove/pointerup 监听（用于拖拽移动元素位置）。
   *  始终监听，通过 dragMoveRef 判断是否在拖拽中。
   *  3px 移动阈值区分"点击选中"和"拖拽移动"。
   *
   *  坐标转换：onMove 收到的是主文档坐标（由 forwardPointerEvent 转发），
   *  dx/dy 需除以 scaleX/scaleY 转为 iframe CSS 像素。
   *
   *  交互统一：使用 transform: translate() 移动（与 Canvas 模式 dnd-kit 一致），
   *  配合 boxShadow + zIndex 提升 + opacity 降低 + ghost 克隆 实现"提起来"的拖拽手感。 */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const dm = dragMoveRef.current
      if (!dm.el) return

      // 主文档像素差 → iframe CSS 像素差
      const dx = (e.clientX - dm.startX) / dm.scaleX
      const dy = (e.clientY - dm.startY) / dm.scaleY

      // 3px 阈值（iframe CSS 像素）：超过后才激活拖拽
      if (!dm.active && Math.abs(dx) < 3 && Math.abs(dy) < 3) return

      if (!dm.active) {
        dm.active = true
        const el = dm.el
        // 设置 position: relative 以支持 left/top 偏移
        if (!el.style.position || el.style.position === 'static') {
          el.style.position = 'relative'
        }
        // 保存原始 transform 和 zIndex（松手后恢复）
        dm.origTransform = el.style.transform || ''
        dm.origZIndex = el.style.zIndex || ''
        // 记录元素原始宽高（用于吸附计算）
        dm.elWidth = el.offsetWidth
        dm.elHeight = el.offsetHeight
        // 创建 ghost 克隆（模拟 Canvas 模式 dnd-kit 原地留浅色影子）
        const ghost = el.cloneNode(true) as HTMLElement
        ghost.setAttribute('data-pf-drag-ghost', 'true')
        ghost.style.position = el.style.position || 'relative'
        ghost.style.left = el.style.left || '0px'
        ghost.style.top = el.style.top || '0px'
        ghost.style.opacity = '0.3'
        ghost.style.pointerEvents = 'none'
        ghost.style.transform = ''
        ghost.style.boxShadow = ''
        ghost.style.zIndex = ''
        ghost.style.cursor = ''
        ghost.style.userSelect = ''
        ghost.style.transition = ''
        el.insertAdjacentElement('afterend', ghost)
        dm.ghost = ghost
        // 拖拽中视觉反馈：模拟 Canvas 模式 dnd-kit 的"提起来"效果
        el.style.opacity = '0.45'
        el.style.transform = `translate(${dx}px, ${dy}px)`
        el.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.25)'
        el.style.zIndex = '9999'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
        el.style.transition = 'box-shadow 0.15s ease'
        // 隐藏选中框/悬停框（与 Canvas 模式一致）
        setIsDragging(true)
        // 不改变 left/top：仅通过 transform 移动，松手后再提交 left/top
        return
      }

      // 拖拽中：计算吸附对齐
      const doc = getDoc()
      let snapDx = 0, snapDy = 0
      if (doc) {
        const el = dm.el
        const elW = dm.elWidth || el.offsetWidth
        const elH = dm.elHeight || el.offsetHeight
        const dragLeft = dm.origLeft + dx
        const dragTop = dm.origTop + dy
        const dragRight = dragLeft + elW
        const dragBottom = dragTop + elH
        const dragCX = dragLeft + elW / 2
        const dragCY = dragTop + elH / 2

        const siblings = collectSiblingRects(doc, el)
        const snap = computeRefineSnap(dragLeft, dragRight, dragTop, dragBottom, dragCX, dragCY, siblings)
        snapDx = snap.dx
        snapDy = snap.dy
        snapActiveRef.current.x = snap.showV !== null
        snapActiveRef.current.y = snap.showH !== null
        showSnapGuides(snap.showV, snap.showH)
      }

      // 拖拽中：仅更新 transform（不触发 layout reflow，与 dnd-kit 一致）
      const el = dm.el
      const finalDx = dx + snapDx
      const finalDy = dy + snapDy
      el.style.transform = `translate(${finalDx}px, ${finalDy}px)`
      // 实时记录最终 delta（供 onUp 使用，避免解析 transform 字符串）
      ;(dm as any)._finalDx = finalDx
      ;(dm as any)._finalDy = finalDy
    }

    const onUp = () => {
      const dm = dragMoveRef.current
      if (!dm.el) return

      // 隐藏吸附参考线
      hideSnapGuides()
      snapActiveRef.current = { x: false, y: false }
      setIsDragging(false)

      if (dm.active) {
        const el = dm.el
        const eid = dm.eid

        // 使用实时记录的最终 delta（避免解析 transform 字符串）
        const finalDx = (dm as any)._finalDx ?? 0
        const finalDy = (dm as any)._finalDy ?? 0
        const newLeft = dm.origLeft + finalDx
        const newTop = dm.origTop + finalDy

        // 恢复视觉状态 + 提交 left/top
        el.style.transform = dm.origTransform
        el.style.boxShadow = ''
        el.style.zIndex = dm.origZIndex
        el.style.cursor = ''
        el.style.userSelect = ''
        el.style.transition = ''
        el.style.opacity = ''
        el.style.left = newLeft + 'px'
        el.style.top = newTop + 'px'
        el.style.right = 'auto'
        el.style.bottom = 'auto'

        const oldLeft = dm.origLeft
        const oldTop = dm.origTop

        refineUndo.record({
          label: 'move',
          execute: () => {
            const t = findElementByEid(eid)
            if (t) {
              if (!t.style.position || t.style.position === 'static') {
                t.style.position = 'relative'
              }
              t.style.left = newLeft + 'px'
              t.style.top = newTop + 'px'
              t.style.right = 'auto'
              t.style.bottom = 'auto'
            }
          },
          rollback: () => {
            const t = findElementByEid(eid)
            if (t) {
              if (oldLeft === 0 && oldTop === 0) {
                t.style.left = ''
                t.style.top = ''
                t.style.position = ''
              } else {
                t.style.left = oldLeft + 'px'
                t.style.top = oldTop + 'px'
              }
              t.style.right = 'auto'
              t.style.bottom = 'auto'
            }
          },
        })

        // 刷新选中元素 rect
        refreshSelection()
        // 标记拖拽刚结束，防止后续 click 误触发
        dragJustEndedRef.current = true
        setTimeout(() => { dragJustEndedRef.current = false }, 50)
      }

      // 移除 ghost 克隆
      if (dm.ghost) {
        dm.ghost.remove()
      }

      // 重置拖拽状态
      dragMoveRef.current = {
        el: null, eid: '', startX: 0, startY: 0, origLeft: 0, origTop: 0, active: false, scaleX: 1, scaleY: 1, origTransform: '', origZIndex: '', elWidth: 0, elHeight: 0, ghost: null,
      }
    }

    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    return () => {
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', onUp, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findElementByEid, refreshSelection])

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

  /** 阻止浏览器原生拖拽（防止 <a>/<img> 等元素触发浏览器默认拖拽行为，干扰项目拖拽） */
  const preventDragStart = useCallback((e: DragEvent) => e.preventDefault(), [])

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
      // 拖拽刚结束：跳过 click 选中，防止松手后误触发重新选中
      if (dragJustEndedRef.current) return
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

    /**
     * 拖拽移动：pointerdown 在选中元素上 → 记录起始位置，准备拖拽。
     * 仅当目标元素是当前选中元素且不在缩放手柄上时触发。
     * 使用 3px 阈值区分"点击选中"和"拖拽移动"。
     *
     * 坐标转换：iframe 内 pointerdown 事件的 clientX/Y 是 iframe 内部坐标，
     * 但全局 onMove 使用的是主文档坐标（由 forwardPointerEvent 转发）。
     * 必须统一转换为与 onMove 相同的主文档坐标系，避免拖拽偏移。
     */
    const onPointerDown = (e: PointerEvent) => {
      if (refinePreviewMode || isResizing) return
      const sel = useEditorStore.getState().refineSession?.selectedElement
      if (!sel) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const selEid = sel.attributes['data-pf-eid'] || ''
      if (!selEid) return
      const targetEid = target.getAttribute('data-pf-eid') || target.closest('[data-pf-eid]')?.getAttribute('data-pf-eid')
      if (targetEid !== selEid) return
      // 不在缩放手柄上才能拖拽移动
      if ((e.target as HTMLElement).hasAttribute('data-pf-resize-handle')) return
      // 只处理左键
      if (e.button !== 0) return

      const el = findElementByEid(selEid)
      if (!el) return
      ensureEid(el)

      // 读取当前 left/top（parseFloat，默认 0）
      const curLeft = parseFloat(el.style.left) || 0
      const curTop = parseFloat(el.style.top) || 0

      // 将 iframe 内部坐标转换为主文档坐标（与 onMove 坐标系一致）
      const iframe = iframeRef.current
      let mainX = e.clientX
      let mainY = e.clientY
      let scaleX = 1
      let scaleY = 1
      if (iframe) {
        const iframeRect = iframe.getBoundingClientRect()
        const iframeWin = iframe.contentWindow
        if (iframeWin && iframeRect.width > 0) {
          scaleX = iframeRect.width / iframeWin.innerWidth
          scaleY = iframeRect.height / iframeWin.innerHeight
          const sx = iframeWin.scrollX || 0
          const sy = iframeWin.scrollY || 0
          mainX = (e.clientX + sx) * scaleX + iframeRect.left
          mainY = (e.clientY + sy) * scaleY + iframeRect.top
        }
      }

      dragMoveRef.current = {
        el,
        eid: selEid,
        startX: mainX,
        startY: mainY,
        origLeft: curLeft,
        origTop: curTop,
        active: false,
        scaleX,
        scaleY,
        origTransform: el.style.transform || '',
        origZIndex: el.style.zIndex || '',
        elWidth: 0,
        elHeight: 0,
        ghost: null,
      }
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
      doc.addEventListener('pointerdown', onPointerDown, true)
      doc.addEventListener('pointermove', forwardPointerEvent, true)
      doc.addEventListener('pointerdown', forwardPointerEvent, true)
      doc.addEventListener('pointerup', forwardPointerEvent, true)
      doc.addEventListener('wheel', forwardWheel, { passive: false, capture: true })
      doc.addEventListener('focusout', onBlur, true)
      // 阻止浏览器原生拖拽（防止 <a>/<img> 等元素触发浏览器默认拖拽行为，干扰项目拖拽）
      doc.addEventListener('dragstart', preventDragStart, true)

      // 同时监听 iframe 的 contentWindow 的 wheel 事件（兜底：document 级 capture 可能被 iframe 内部元素消费）
      iframeWin = iframe.contentWindow
      if (iframeWin) {
        iframeWin.addEventListener('wheel', forwardWheel, { passive: false, capture: true })
      }

      try { measureAndSyncSize() } catch (e) { console.error('[RefineCanvas] measureAndSyncSize failed:', e) }
      setReady(true)
      loadedAtRef.current = Date.now()

      // 等待 iframe 内所有外部样式表加载完毕（避免 loading 消失但 CSS 还没加载完）
      const cd = iframe.contentDocument
      const links = cd?.querySelectorAll('link[rel="stylesheet"]') ?? []
      if (links.length > 0) {
        let pending = links.length
        const onSheetDone = () => {
          pending--
          if (pending <= 0 || cancelled) setBodyReady(true)
        }
        links.forEach((l) => {
          l.addEventListener('load', onSheetDone)
          l.addEventListener('error', onSheetDone)
          if ((l as HTMLLinkElement).sheet) onSheetDone()
        })
        const fallback = setTimeout(() => { if (!cancelled) setBodyReady(true) }, 3000)
        const origCleanup = (bind as any).__cleanup as (() => void) | undefined
        ;(bind as any).__cleanup = () => { clearTimeout(fallback); origCleanup?.() }
      } else {
        let raf = 0
        const check = () => { raf++; if (raf >= 2 || cancelled) { setBodyReady(true); return } requestAnimationFrame(check) }
        requestAnimationFrame(check)
      }

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
        doc.removeEventListener('pointerdown', onPointerDown, true)
        doc.removeEventListener('pointermove', forwardPointerEvent, true)
        doc.removeEventListener('pointerdown', forwardPointerEvent, true)
        doc.removeEventListener('pointerup', forwardPointerEvent, true)
        doc.removeEventListener('wheel', forwardWheel, { capture: true } as any)
        doc.removeEventListener('focusout', onBlur, true)
        doc.removeEventListener('dragstart', preventDragStart, true)
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
            transition: 'opacity 0.2s', pointerEvents: bodyReady ? 'auto' : 'none',
          }}
        />
        {/* 加载提示：iframe 未就绪（ready）或 body 还在解析（bodyReady）时显示 */}
        {(!ready || !bodyReady) && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%)', zIndex: 12,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 32, height: 32, border: '3px solid #e9d5ff', borderTopColor: '#a855f7',
                borderRadius: '50%', animation: 'pf-spin 0.8s linear infinite', margin: '0 auto 12px',
              }} />
              <style>{`@keyframes pf-spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ color: '#a1a1aa', fontSize: 13 }}>正在加载页面...</div>
            </div>
          </div>
        )}
        {/* 吸附参考线（主页面渲染，z-index: 15 高于选中框/悬停框，不会被 iframe 内容遮挡） */}
        <div ref={snapGuideVRef} style={{ position: 'absolute', top: 0, width: 1, height: '100%', background: '#3b82f6', pointerEvents: 'none', zIndex: 15, display: 'none' }} />
        <div ref={snapGuideHRef} style={{ position: 'absolute', left: 0, width: '100%', height: 1, background: '#3b82f6', pointerEvents: 'none', zIndex: 15, display: 'none' }} />

        {/* Hover 框 — 预览/拖拽/body 未就绪时隐藏（避免白屏时显示紫色遮罩） */}
        {!refinePreviewMode && bodyReady && hoverRect && !isResizing && !isDragging && (
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

        {/* 选中框 + 缩放手柄 — 预览/拖拽/body 未就绪时隐藏 */}
        {!refinePreviewMode && bodyReady && displayRect && !isResizing && !isDragging && (
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