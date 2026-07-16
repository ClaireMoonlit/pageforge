import { useDroppable } from '@dnd-kit/core'
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore, getClipboard, getLastInternalCopyTime, getLastExternalCopyTime } from '@/store/editorStore'
import { CanvasElement } from './CanvasElement'
import { Ruler } from './Ruler'
import { AlignInfoOverlay } from './AlignInfoOverlay'
import { RefineCanvas } from './RefineCanvas'
import type { SnapLine } from '@/utils/snapping'
import { readFileAsDataUrl } from '@/utils/fileUpload'

/** 自定义手型光标（白色描边 + 黑色内核，比系统默认 grab 更明显） */
const CURSOR_GRAB = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M7 11.5V8a2 2 0 0 1 4 0v2h1V5a2 2 0 0 1 4 0v3h1V4a2 2 0 0 1 4 0v4h1V6a2 2 0 0 1 4 0v8l-3 6H10l-4-4 2-3' fill='none' stroke='%23fff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M7 11.5V8a2 2 0 0 1 4 0v2h1V5a2 2 0 0 1 4 0v3h1V4a2 2 0 0 1 4 0v4h1V6a2 2 0 0 1 4 0v8l-3 6H10l-4-4 2-3' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 12 12, grab`
const CURSOR_GRABBING = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M7 11.5V8a2 2 0 0 1 4 0v2h1V5a2 2 0 0 1 4 0v3h1V4a2 2 0 0 1 4 0v4h1V6a2 2 0 0 1 4 0v8l-3 6H10l-4-4 2-3' fill='%23fff' stroke='%23000' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 12 12, grabbing`

/** 协调内部剪贴板粘贴与系统剪贴板图片粘贴：当两者同时存在时，优先图片 */
let pendingPasteId: string | null = null
export function setPendingPasteId(id: string | null) { pendingPasteId = id }
export function getAndClearPendingPasteId() { const id = pendingPasteId; pendingPasteId = null; return id }

/**
 * 共享的图片粘贴 + 裁切流程：从 dataUrl 创建节点并打开裁切弹窗
 * 用于系统剪贴板图片粘贴（右键菜单、工具栏按钮、Ctrl+V）
 */
function pasteImageFromDataUrl(dataUrl: string, pos: { x: number; y: number }) {
  const id = useEditorStore.getState().addNode('image', pos.x, pos.y)
  const img = new Image()
  img.onload = () => {
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    // 第一性原理：必须保存 originalWidth/originalHeight，否则裁切后无法做原比例吸附
    useEditorStore.getState().updateNodeProps(id, { src: dataUrl, originalWidth: nw, originalHeight: nh })
    const maxW = 600
    const w = nw > maxW ? maxW : nw
    const h = nw > maxW ? Math.round(maxW * nh / nw) : nh
    useEditorStore.getState().updateNodeStyle(id, { width: `${w}px`, height: `${h}px` })
    useEditorStore.getState().openCropModal({
      imageSrc: dataUrl,
      imageWidth: nw,
      imageHeight: nh,
      onConfirm: (result) => {
        const maxSide = 400
        const ratio = Math.min(maxSide / result.crop.width, maxSide / result.crop.height, 1)
        const finalW = Math.round(result.crop.width * ratio)
        const finalH = Math.round(result.crop.height * ratio)
        const isShaped = result.shape !== 'rectangle'
        // 保留 originalWidth/originalHeight：原比例吸附要用原图尺寸，不能用裁切后的
        useEditorStore.getState().updateNodeProps(id, {
          src: result.croppedDataUrl,
          originalSrc: dataUrl,
          originalWidth: nw,
          originalHeight: nh,
          imageShape: result.shape,
          cropRect: result.crop,
        })
        useEditorStore.getState().updateNodeStyle(id, {
          width: `${finalW}px`,
          height: `${finalH}px`,
          ...(isShaped ? { backgroundColor: 'transparent' } : {}),
        })
      },
    })
  }
  img.src = dataUrl
}

/**
 * 从 navigator.clipboard.read() 结果中提取图片并粘贴
 * 返回 true 表示成功粘贴了图片
 */
async function pasteImageFromClipboardItems(items: ClipboardItems, pos: { x: number; y: number }): Promise<boolean> {
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith('image/')) {
        const blob = await item.getType(type)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        pasteImageFromDataUrl(dataUrl, pos)
        return true
      }
    }
  }
  return false
}

/**
 * 统一异步粘贴入口（供工具栏按钮和右键菜单使用）
 * 比较内部/外部复制时间戳，粘贴最新复制的内容
 * @param pos 粘贴位置（画布坐标）
 */
export async function unifiedAsyncPaste(pos: { x: number; y: number }): Promise<boolean> {
  const internalTime = getLastInternalCopyTime()
  const externalTime = getLastExternalCopyTime()
  const clip = getClipboard()

  // 内部复制更新且内部剪贴板有内容 → 粘贴内部节点
  if (internalTime >= externalTime && clip) {
    useEditorStore.getState().pasteNode()
    return true
  }

  // 外部复制更新 → 尝试读取系统剪贴板
  try {
    const clipboardItems = await navigator.clipboard.read()
    // 先检查图片
    const pastedImg = await pasteImageFromClipboardItems(clipboardItems, pos)
    if (pastedImg) return true
    // 再检查文本
    for (const item of clipboardItems) {
      for (const type of item.types) {
        if (type === 'text/plain') {
          const blob = await item.getType(type)
          const text = await blob.text()
          if (text && text.trim()) {
            const id = useEditorStore.getState().addNode('text', pos.x, pos.y)
            useEditorStore.getState().updateNodeProps(id, { text: text.trim() })
            return true
          }
        }
      }
    }
  } catch {
    // 无权限，静默
  }

  // 系统剪贴板无图片/文本或无权限 → 回退到内部剪贴板
  if (clip) {
    useEditorStore.getState().pasteNode()
    return true
  }

  return false
}

/** 判断焦点是否在可输入元素中（避免空格键误触影响输入） */
function isTypingTarget(): boolean {
  const t = document.activeElement as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (t.isContentEditable) return true
  return false
}

interface CanvasProps {
  snapLines?: SnapLine[]
}

export const Canvas = forwardRef<HTMLDivElement, CanvasProps>((props, ref) => {
  const { snapLines = [] } = props
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })
  const nodes = useEditorStore((s) => s.nodes)
  const canvas = useEditorStore((s) => s.canvas)
  const selectNode = useEditorStore((s) => s.selectNode)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const resetZoom = useEditorStore((s) => s.resetZoom)
  const updateNodeStyle = useEditorStore((s) => s.updateNodeStyle)
  const updateCanvas = useEditorStore((s) => s.updateCanvas)
  const rulerCursorVisible = useEditorStore((s) => s.rulerCursorVisible)
  const toggleRulerCursor = useEditorStore((s) => s.toggleRulerCursor)
  const addNode = useEditorStore((s) => s.addNode)
  const removeNode = useEditorStore((s) => s.removeNode)
  const modalOpen = useEditorStore((s) => s.modalOpen)
  const selectedId = useEditorStore((s) => s.selectedId)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  /** 精修模式会话：非 null 时画布切换为 iframe 渲染 */
  const refineSession = useEditorStore((s) => s.refineSession)

  const innerRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastMousePosRef = useRef({ x: 400, y: 300 }) // 画布坐标，默认中心附近

  // 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)
  const closeCtxMenu = useCallback(() => setCtxMenu(null), [])

  // 右键菜单外部点击关闭（pointerdown 先于 click 触发，需排除菜单内部点击）
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: PointerEvent) => {
      // 点击在菜单内部 → 不关闭，让菜单项的 click 处理
      if (ctxMenuRef.current?.contains(e.target as Node)) return
      closeCtxMenu()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [ctxMenu, closeCtxMenu])

  // ========== 手型平移 ==========
  const [panMode, setPanMode] = useState(false)       // 空格按下 → 进入手型模式
  const [isPanning, setIsPanning] = useState(false)   // 手型模式下拖拽中
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOriginRef = useRef({ x: 0, y: 0 })
  // 用 ref 避免 native 事件监听器中闭包捕获过期 state（精修模式 iframe 转发的事件也走这套）
  const isPanningRef = useRef(false)
  const panOffsetRef = useRef({ x: 0, y: 0 })
  const panModeRef = useRef(false)

  useEffect(() => { isPanningRef.current = isPanning }, [isPanning])
  useEffect(() => { panOffsetRef.current = panOffset }, [panOffset])
  useEffect(() => { panModeRef.current = panMode }, [panMode])

  // 空格键监听
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTypingTarget()) {
        e.preventDefault()
        setPanMode(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setPanMode(false)
        setIsPanning(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // 原生 document 级 pointer 事件监听：手型平移
  // 使用 pointerdown/pointermove/pointerup（而非 React onMouse*），
  // 因为精修模式下 iframe 内的事件被转发为 pointer 事件派发到 document，
  // React 合成事件（onMouse*）无法捕获这些转发事件。
  useEffect(() => {
    const onPointerDown = (e: PointerEvent | MouseEvent) => {
      if (!panModeRef.current || e.button !== 0) return
      isPanningRef.current = true
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panOriginRef.current = { ...panOffsetRef.current }
    }
    const onPointerMove = (e: PointerEvent | MouseEvent) => {
      if (!isPanningRef.current) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanOffset({
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      })
    }
    const onPointerUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false
        setIsPanning(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const cursor = isPanning ? CURSOR_GRABBING : panMode ? CURSOR_GRAB : undefined

  // 精修模式下，同步手型光标到 iframe 内部的 body（wrapper div 的 cursor 样式不影响 iframe 内元素）
  useEffect(() => {
    const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
    const body = iframe?.contentDocument?.body
    if (!body) return
    if (isPanning) {
      body.style.cursor = CURSOR_GRABBING
    } else if (panMode) {
      body.style.cursor = CURSOR_GRAB
    } else {
      body.style.cursor = ''
    }
  }, [panMode, isPanning, refineSession])
  // ========== 手型平移 END ==========

  // ========== 画布粘贴 ==========
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return

    const pos = { ...lastMousePosRef.current }

    // 优先检查系统剪贴板中的图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        try {
          const dataUrl = await readFileAsDataUrl(file)
          pasteImageFromDataUrl(dataUrl, pos)
        } catch {
          // 静默失败
        }
        return
      }
    }
  }, [])

  // 文档级 paste 监听：捕获系统剪贴板图片和文本（不依赖焦点/位置）
  useEffect(() => {
    const onDocPaste = (e: ClipboardEvent) => {
      // 不拦截 input/textarea/contentEditable 中的粘贴
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      const items = e.clipboardData?.items
      if (!items) return

      const internalTime = getLastInternalCopyTime()
      const externalTime = getLastExternalCopyTime()
      const pendingId = getAndClearPendingPasteId()

      // 外部复制更新时，检查剪贴板内容
      if (externalTime >= internalTime) {
        // 先检查图片（富媒体优先）
        let hasImage = false
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            hasImage = true
            break
          }
        }
        if (hasImage) {
          e.preventDefault()
          if (pendingId) {
            useEditorStore.getState().removeNode(pendingId)
          }
          handlePaste(e as unknown as React.ClipboardEvent)
          return
        }

        // 再检查文本
        const text = e.clipboardData?.getData('text/plain')
        if (text && text.trim()) {
          e.preventDefault()
          if (pendingId) {
            useEditorStore.getState().removeNode(pendingId)
          }
          const pos = { ...lastMousePosRef.current }
          const id = useEditorStore.getState().addNode('text', pos.x, pos.y)
          useEditorStore.getState().updateNodeProps(id, { text: text.trim() })
        }
      }
    }
    document.addEventListener('paste', onDocPaste)
    return () => document.removeEventListener('paste', onDocPaste)
  }, [handlePaste])

  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node)
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node
  }

  // 用原生事件监听 wheel，避免 passive 警告。
  // 使用 canvas 容器元素监听（而非 window），因为 Chrome 会忽略 window/document 级
  // wheel 事件的 passive:false，导致 e.preventDefault() 无效 → Ctrl+Wheel/双指缩放无反应。
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoom(zoom + delta)
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [zoom, setZoom])

  /**
   * 渲染后修正根节点 y 位置：
   * htmlToNodes 使用 estimateHeightRecursive 估算子高度，但估算值与实际渲染高度不一致，
   * 导致后续根节点被叠在前面 section 之上。这里用实际渲染高度重新堆叠。
   * 用 ref 严格控制：仅在节点引用集合变化时跑一次；测量后用 ref 比对上一次测量值，
   * 没有真实变化就不再 setState，避免触发 React 的 maximum update depth 限制。
   */
  const lastNodesRef = useRef<typeof nodes>([])
  const lastMeasuredKeyRef = useRef('')
  useLayoutEffect(() => {
    if (!innerRef.current) return
    if (lastNodesRef.current === nodes) return
    lastNodesRef.current = nodes

    const raf = requestAnimationFrame(() => {
      const inner = innerRef.current
      if (!inner) return
      const rootEls = Array.from(inner.children).filter(
        (el) => (el as HTMLElement).hasAttribute('data-node-id'),
      )
      if (rootEls.length === 0) return
      const curZoom = useEditorStore.getState().zoom
      const heights: number[] = new Array(nodes.length).fill(0)
      for (let i = 0; i < rootEls.length && i < nodes.length; i++) {
        const el = rootEls[i] as HTMLElement
        const r = el.getBoundingClientRect()
        heights[i] = r.height / curZoom
      }
      const newYs: number[] = new Array(nodes.length).fill(0)
      const GAP = 24
      let y = 0
      let autoPlacedCount = 0
      for (let i = 0; i < nodes.length; i++) {
        const cur = nodes[i].style?.y ?? 0
        const curX = nodes[i].style?.x ?? 0
        if (cur !== 0 || curX !== 0) {
          newYs[i] = cur
          continue
        }
        newYs[i] = y
        y += heights[i] + GAP
        autoPlacedCount += 1
      }
      let maxBottom = 0
      for (let i = 0; i < nodes.length; i++) {
        if (String(nodes[i].style?.display ?? '').toLowerCase() === 'none') continue
        const bottom = newYs[i] + heights[i]
        if (bottom > maxBottom) maxBottom = bottom
      }
      const measurementKey = newYs.map((yi, i) => `${i}:${yi}:${heights[i].toFixed(1)}`).join('|')
      if (measurementKey === lastMeasuredKeyRef.current) return
      lastMeasuredKeyRef.current = measurementKey

      const updates: Array<{ id: string; y: number }> = []
      for (let i = 0; i < nodes.length; i++) {
        const cur = nodes[i].style?.y ?? 0
        const curX = nodes[i].style?.x ?? 0
        if (cur !== 0 || curX !== 0) continue
        if (Math.abs(cur - newYs[i]) > 0.5) {
          updates.push({ id: nodes[i].id, y: newYs[i] })
        }
      }
      if (updates.length > 0) {
        useEditorStore.setState((state) => {
          for (const target of updates) {
            for (let j = 0; j < state.nodes.length; j++) {
              if (state.nodes[j].id === target.id) {
                state.nodes[j].style.y = target.y
                break
              }
            }
          }
        })
      }
      const hasBClassRoot = nodes.some((n) => (n.style?.x ?? 0) !== 0)
      if (autoPlacedCount > 0 && !hasBClassRoot) {
        const curH = parseInt(canvas.height) || 0
        // 安全边距加大到 200px，覆盖 web font 加载前的高度估算误差
        // 粘贴开源模板代码时，首次 rAF 测量在 font 加载前完成，高度偏小。
        // ResizeObserver 会在 font 加载后再次触发 → 画布自动伸长到正确位置。
        const desiredH = Math.max(800, Math.ceil(maxBottom + 200))
        if (desiredH > curH + 1) {
          updateCanvas({ height: `${desiredH}px` })
        }
      }
    })
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length])

  // 解析画布尺寸用于参考线长度
  // 精修模式下，画布尺寸 = 导入页面的实测尺寸（refineSession.width/height），
  // 否则用 store 中的 canvas.width/canvas.height。
  // 这样外层 wrapper（含标尺）会跟着页面尺寸扩张，避免页面跑到画布外面。
  const cw = (refineSession ? refineSession.width : parseInt(canvas.width)) || 1200
  const ch = (refineSession ? refineSession.height : parseInt(canvas.height)) || 800

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto"
      style={{
        backgroundColor: '#f3f4f6',
        backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {/* 缩放/工具控件：固定在画布视口底部居中。
          用 position:fixed 保证不被父级 flex 布局影响，始终贴底居中。
          zIndex: 40 低于导入弹窗 z-[100]，确保弹窗在上层。 */}
      <div
        className="flex justify-center pointer-events-none"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 12,
          zIndex: 40,
          opacity: modalOpen ? 0.4 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        <div className={`inline-flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1.5 py-1 ${modalOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}>
          <button
            className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded text-lg font-bold"
            onClick={() => setZoom(zoom - 0.1)}
            title="缩小"
          >
            −
          </button>
          <button
            className="min-w-[58px] h-7 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded tabular-nums"
            onClick={() => resetZoom()}
            title="重置 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded text-lg font-bold"
            onClick={() => setZoom(zoom + 0.1)}
            title="放大"
          >
            +
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              panMode ? 'bg-gray-200 text-gray-500' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
            }`}
            onClick={() => setPanMode((v) => !v)}
            title={panMode ? '手型模式（已激活）' : '手型工具（快捷键：空格）'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
              <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </button>
          <button
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              rulerCursorVisible ? 'bg-gray-200 text-gray-500' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
            }`}
            onClick={toggleRulerCursor}
            title={rulerCursorVisible ? '关闭定位线' : '开启定位线'}
            aria-label={rulerCursorVisible ? '关闭定位线' : '开启定位线'}
          >
            {/* 十字线图标：竖线 + 横线，象征"定位线" */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100 rounded"
            onClick={() => setZoom(0.5)}
            title="50%"
          >
            50%
          </button>
          <button
            className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100 rounded"
            onClick={() => setZoom(1)}
            title="100%"
          >
            100%
          </button>
          <button
            className="h-7 px-2 text-xs text-gray-600 hover:bg-gray-100 rounded"
            onClick={() => setZoom(2)}
            title="200%"
          >
            200%
          </button>
        </div>
      </div>

      {/* 画布页：外层 wrapper 用缩放后的尺寸撑开布局空间并居中，内层承载原始尺寸 + transform:scale。
          margin 只保留左右和底部内边距，上方贴顶以让画布初始就顶到上方不空。
          4 周各预留 24px 给标尺。 */}
      <div
        style={{
          width: `calc(${cw}px * ${zoom} + 48px)`,
          height: `calc(${ch}px * ${zoom} + 48px)`,
          margin: `0 auto ${24}px`,
          position: 'relative',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          cursor,
          userSelect: panMode ? 'none' : undefined,
        }}
      >
        {/* 4 个标尺角（左上 / 右上 / 左下 / 右下） */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, width: 24, height: 24,
            backgroundColor: '#1e1e2e', zIndex: 52,
            borderRight: '1px solid #374151', borderBottom: '1px solid #374151',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0, right: 0, width: 24, height: 24,
            backgroundColor: '#1e1e2e', zIndex: 52,
            borderLeft: '1px solid #374151', borderBottom: '1px solid #374151',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0, left: 0, width: 24, height: 24,
            backgroundColor: '#1e1e2e', zIndex: 52,
            borderRight: '1px solid #374151', borderTop: '1px solid #374151',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0, right: 0, width: 24, height: 24,
            backgroundColor: '#1e1e2e', zIndex: 52,
            borderLeft: '1px solid #374151', borderTop: '1px solid #374151',
          }}
        />
        {/* 4 边标尺（画布四周） */}
        <Ruler orientation="horizontal" edge="top" canvasRef={innerRef} />
        <Ruler orientation="horizontal" edge="bottom" canvasRef={innerRef} />
        <Ruler orientation="vertical" edge="left" canvasRef={innerRef} />
        <Ruler orientation="vertical" edge="right" canvasRef={innerRef} />

        {/* 画布 */}
        {/* 外层容器：layout 尺寸 = 视觉尺寸（cw*zoom × ch*zoom），overflow:hidden 裁剪内部缩放后溢出的内容。
            这是第一性原理修复：之前 transform 直接加在外层，导致 layout 尺寸 = cw×ch（远大于视觉尺寸），
            外层 wrapper 的 scroll 区域、标尺定位全部基于 layout 坐标，与视觉不对齐。
            现在外层 = visual，内层 = content 并 scale 到 visual，scroll 和标尺都正确。 */}
        <div
          ref={setRefs}
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            width: `${cw * zoom}px`,
            height: `${ch * zoom}px`,
            overflow: 'hidden',
            backgroundColor: canvas.backgroundColor,
            boxShadow: isOver ? '0 0 0 2px #6366f1, 0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.12)',
            // 手型模式下禁用画布内元素交互，让 mousedown 穿透到外层 wrapper 触发平移
            pointerEvents: panMode ? 'none' : undefined,
            // 手型模式下画布自身也显示光标，避免被白色背景遮挡 wrapper 的光标
            cursor: isPanning ? 'grabbing' : panMode ? 'grab' : undefined,
          }}
        >
          {/* 内层 wrapper：content 原始尺寸（cw×ch），transform: scale(zoom) 缩放到视觉尺寸。
              data-pf-export-target 在此层，export 取的是原始尺寸；事件处理也在此层。 */}
          <div
            data-pf-export-target="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) selectNode(null)
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              if (rect) {
                const curZoom = useEditorStore.getState().zoom
                lastMousePosRef.current = {
                  x: Math.round((e.clientX - rect.left) / curZoom),
                  y: Math.round((e.clientY - rect.top) / curZoom),
                }
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setCtxMenu({ x: e.clientX, y: e.clientY })
            }}
            style={{
              width: `${cw}px`,
              height: `${ch}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              color: '#1f2937',
            }}
          >
            {refineSession ? (
              <RefineCanvas iframeId="pf-refine-iframe" />
            ) : nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 select-none">
                从左侧拖入组件开始创作
              </div>
            ) : (
              <>
                {nodes.map((n) => <CanvasElement key={n.id} node={n} isRoot />)}
              </>
            )}
            {/* 对齐/分布操作结果高亮（临时显示 2.5s） */}
            <AlignInfoOverlay cw={cw} ch={ch} />
            {/* 智能吸附参考线：蓝=边缘/等间距，紫=中心 */}
            <svg
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 50,
              overflow: 'visible',
            }}
          >
            {snapLines.map((line, i) => {
              const color = line.type === 'center' ? '#a855f7' : '#3b82f6'
              if (line.axis === 'x') {
                return (
                  <g key={`x-${i}`}>
                    <line
                      x1={line.pos}
                      y1={0}
                      x2={line.pos}
                      y2={ch}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray={line.type === 'center' ? '4 4' : 'none'}
                    />
                    {line.type === 'spacing' && line.gap !== undefined && (
                      <>
                        {/* 等间距参与的边：延长参考线到画布全高，让用户清楚看到是哪几条边在等间距 */}
                        {line.fromPos !== undefined && (
                          <line x1={line.fromPos} y1={0} x2={line.fromPos} y2={ch} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.dragStart !== undefined && (
                          <line x1={line.dragStart} y1={0} x2={line.dragStart} y2={ch} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.dragEnd !== undefined && (
                          <line x1={line.dragEnd} y1={0} x2={line.dragEnd} y2={ch} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.toPos !== undefined && (
                          <line x1={line.toPos} y1={0} x2={line.toPos} y2={ch} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {/* 左侧间距双头箭头：fromPos → dragStart */}
                        {line.fromPos !== undefined && line.dragStart !== undefined && (
                            <g>
                              <line x1={line.fromPos} y1={10} x2={line.dragStart} y2={10} stroke="#3b82f6" strokeWidth={1.5} />
                              <polygon points={`${line.fromPos},10 ${line.fromPos+6},6 ${line.fromPos+6},14`} fill="#3b82f6" />
                              <polygon points={`${line.dragStart},10 ${line.dragStart-6},6 ${line.dragStart-6},14`} fill="#3b82f6" />
                            </g>
                          )}
                        {/* 右侧间距双头箭头：dragEnd → toPos */}
                        {line.dragEnd !== undefined && line.toPos !== undefined && (
                            <g>
                              <line x1={line.dragEnd} y1={10} x2={line.toPos} y2={10} stroke="#3b82f6" strokeWidth={1.5} />
                              <polygon points={`${line.dragEnd},10 ${line.dragEnd+6},6 ${line.dragEnd+6},14`} fill="#3b82f6" />
                              <polygon points={`${line.toPos},10 ${line.toPos-6},6 ${line.toPos-6},14`} fill="#3b82f6" />
                            </g>
                          )}
                      </>
                    )}
                  </g>
                )
              }
              return (
                <g key={`y-${i}`}>
                  <line
                    x1={0}
                    y1={line.pos}
                    x2={cw}
                    y2={line.pos}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray={line.type === 'center' ? '4 4' : 'none'}
                  />
                  {line.type === 'spacing' && line.gap !== undefined && (
                      <>
                        {/* 等间距参与的边：延长参考线到画布全宽，让用户清楚看到是哪几条边在等间距 */}
                        {line.fromPos !== undefined && (
                          <line x1={0} y1={line.fromPos} x2={cw} y2={line.fromPos} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.dragStart !== undefined && (
                          <line x1={0} y1={line.dragStart} x2={cw} y2={line.dragStart} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.dragEnd !== undefined && (
                          <line x1={0} y1={line.dragEnd} x2={cw} y2={line.dragEnd} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {line.toPos !== undefined && (
                          <line x1={0} y1={line.toPos} x2={cw} y2={line.toPos} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                        )}
                        {/* 上方间距双头箭头：fromPos → dragStart */}
                        {line.fromPos !== undefined && line.dragStart !== undefined && (
                          <g>
                            <line x1={10} y1={line.fromPos} x2={10} y2={line.dragStart} stroke="#3b82f6" strokeWidth={1.5} />
                            <polygon points={`10,${line.fromPos} 6,${line.fromPos+6} 14,${line.fromPos+6}`} fill="#3b82f6" />
                            <polygon points={`10,${line.dragStart} 6,${line.dragStart-6} 14,${line.dragStart-6}`} fill="#3b82f6" />
                          </g>
                        )}
                        {/* 下方间距双头箭头：dragEnd → toPos */}
                        {line.dragEnd !== undefined && line.toPos !== undefined && (
                          <g>
                            <line x1={10} y1={line.dragEnd} x2={10} y2={line.toPos} stroke="#3b82f6" strokeWidth={1.5} />
                            <polygon points={`10,${line.dragEnd} 6,${line.dragEnd+6} 14,${line.dragEnd+6}`} fill="#3b82f6" />
                            <polygon points={`10,${line.toPos} 6,${line.toPos-6} 14,${line.toPos-6}`} fill="#3b82f6" />
                          </g>
                        )}
                      </>
                    )}
                </g>
              )
            })}
          </svg>
          </div>
        </div>
      </div>
      {/* 右键菜单 —— 与精修模式统一使用 CtxMenuItem 组件 */}
      {ctxMenu &&
        createPortal(
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
              label="上移一层"
              disabled={!selectedId}
              onClick={() => {
                if (selectedId) useEditorStore.getState().moveLayer(selectedId, 'up')
              }}
            />
            <CtxMenuItem
              label="下移一层"
              disabled={!selectedId}
              onClick={() => {
                if (selectedId) useEditorStore.getState().moveLayer(selectedId, 'down')
              }}
            />
            {selectedId && (
              <div style={{ height: 1, background: '#475569', margin: '4px 6px' }} />
            )}
            <CtxMenuItem
              label="复制"
              disabled={!selectedId}
              onClick={() => {
                if (selectedId) useEditorStore.getState().copyNode(selectedId)
              }}
            />
            <CtxMenuItem
              label="粘贴"
              disabled={false}
              onClick={async () => {
                // 先粘贴再关闭菜单，保持用户手势上下文（navigator.clipboard.read 需要）
                await unifiedAsyncPaste({ ...lastMousePosRef.current })
              }}
            />
            {selectedId && (
              <div style={{ height: 1, background: '#475569', margin: '4px 6px' }} />
            )}
            <CtxMenuItem
              label="删除"
              disabled={!selectedId && selectedIds.length === 0}
              onClick={() => {
                if (selectedIds.length > 1) {
                  for (const id of selectedIds) removeNode(id)
                } else if (selectedId) {
                  removeNode(selectedId)
                }
              }}
              danger
            />
          </div>,
          document.body,
        )}
    </div>
  )
})

/** 右键菜单单项（与精修模式同款暗色风格） */
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
