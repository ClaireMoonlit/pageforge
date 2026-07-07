import { useDroppable } from '@dnd-kit/core'
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore, getClipboard, getLastInternalCopyTime, getLastExternalCopyTime } from '@/store/editorStore'
import { CanvasElement } from './CanvasElement'
import { Ruler } from './Ruler'
import { AlignInfoOverlay } from './AlignInfoOverlay'
import type { SnapLine } from '@/utils/snapping'
import { readFileAsDataUrl } from '@/utils/fileUpload'

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
  useEditorStore.getState().updateNodeProps(id, { src: dataUrl })
  const img = new Image()
  img.onload = () => {
    const nw = img.naturalWidth
    const nh = img.naturalHeight
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
        useEditorStore.getState().updateNodeProps(id, {
          src: result.croppedDataUrl,
          originalSrc: dataUrl,
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

  const innerRef = useRef<HTMLDivElement | null>(null)
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

  // 鼠标离开窗口时强制结束拖拽
  useEffect(() => {
    if (!isPanning) return
    const onGlobalUp = () => setIsPanning(false)
    window.addEventListener('mouseup', onGlobalUp)
    return () => window.removeEventListener('mouseup', onGlobalUp)
  }, [isPanning])

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (!panMode || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY }
    panOriginRef.current = { ...panOffset }
  }, [panMode, panOffset])

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    setPanOffset({
      x: panOriginRef.current.x + dx,
      y: panOriginRef.current.y + dy,
    })
  }, [isPanning])

  const handlePanEnd = useCallback(() => {
    if (isPanning) setIsPanning(false)
  }, [isPanning])

  const cursor = isPanning ? 'grabbing' : panMode ? 'grab' : undefined
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
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const internalTime = getLastInternalCopyTime()
          const externalTime = getLastExternalCopyTime()
          // 清除内部剪贴板产生的节点（如果外部复制更新或同等，则用外部图片替换）
          const pendingId = getAndClearPendingPasteId()
          if (externalTime >= internalTime) {
            // 外部复制更新或同等（包括首次使用两者均为 0 的情况）
            if (pendingId) {
              useEditorStore.getState().removeNode(pendingId)
            }
            handlePaste(e as unknown as React.ClipboardEvent)
          }
          // 内部复制更新 → 保留内部节点，不处理外部图片
          return
        }
      }

      // 外部文本粘贴：创建 text 节点
      const text = e.clipboardData?.getData('text/plain')
      if (text && text.trim()) {
        const internalTime = getLastInternalCopyTime()
        const externalTime = getLastExternalCopyTime()
        if (externalTime >= internalTime) {
          e.preventDefault()
          const pendingId = getAndClearPendingPasteId()
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

  // 用原生事件监听 wheel，避免 passive 警告
  useEffect(() => {
    const el = innerRef.current
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
	    // 节点引用未变就不跑（避免拖拽/调整大小时频繁重排）
	    if (lastNodesRef.current === nodes) return
	    lastNodesRef.current = nodes

	    // 延迟一帧等待 DOM 完成首次布局
	    const raf = requestAnimationFrame(() => {
	      const rootEls = innerRef.current?.children
	      if (!rootEls || rootEls.length === 0) return
	      // 分类根节点：
	      // - A 类（自动堆叠）：x===0 && y===0，是模板导入时按顺序纵向排列的节点
	      // - B 类（显式放置）：x!==0（如两栏布局的右栏）或 y!==0（用户拖拽放置的节点），
	      //   这类节点应保持原位，不参与纵向堆叠计算，也不影响画布高度
	      const curZoom = useEditorStore.getState().zoom
	      const heights: number[] = new Array(nodes.length).fill(0)
	      // 第一步：测量所有根节点实际高度（不假设顺序，仅记录）
	      for (let i = 0; i < rootEls.length && i < nodes.length; i++) {
	        const el = rootEls[i] as HTMLElement
	        const r = el.getBoundingClientRect()
	        // getBoundingClientRect 返回屏幕空间像素（受 canvas transform: scale(zoom) 影响），
	        // 除以 zoom 转为画布空间，与 style.y（画布空间）对齐
	        heights[i] = r.height / curZoom
	      }
	      // 第二步：仅对 A 类节点计算新的 y 值（按 A 类节点在原数组中的相对顺序累加）
	      const newYs: number[] = new Array(nodes.length).fill(0)
	      const GAP = 24
	      let y = 0
	      let autoPlacedCount = 0
	      for (let i = 0; i < nodes.length; i++) {
	        const cur = nodes[i].style?.y ?? 0
	        const curX = nodes[i].style?.x ?? 0
	        if (cur !== 0 || curX !== 0) {
	          // B 类节点：不参与堆叠，使用原 y
	          newYs[i] = cur
	          continue
	        }
	        // A 类节点：按顺序累加 y
	        newYs[i] = y
	        y += heights[i] + GAP
	        autoPlacedCount += 1
	      }
	      const maxBottom = y
	      // 用 (heights + y 计划值) 作为「测量指纹」，避免 React maximum update depth
	      const measurementKey = newYs.map((yi, i) => `${i}:${yi}:${heights[i].toFixed(1)}`).join('|')
	      if (measurementKey === lastMeasuredKeyRef.current) {
	        // 已经按这套布局跑过、不需要再 setState
	        return
	      }
	      lastMeasuredKeyRef.current = measurementKey
	      // 应用新的 y 值：仅更新 A 类节点（x===0 且 y===0），
	      // B 类节点（x≠0 的并列布局节点，如两栏布局的右栏；或 y≠0 的用户放置节点）保持原位
	      const updates: Array<{ id: string; y: number }> = []
	      for (let i = 0; i < nodes.length; i++) {
	        const cur = nodes[i].style?.y ?? 0
	        const curX = nodes[i].style?.x ?? 0
	        // 只自动堆叠 A 类节点（x===0 且 y===0），
	        // 跳过 B 类节点（x≠0 的并列布局节点 或 y≠0 的用户放置节点）
	        if (cur !== 0 || curX !== 0) continue
	        if (Math.abs(cur - newYs[i]) > 0.5) {
	          updates.push({ id: nodes[i].id, y: newYs[i] })
	        }
	      }
	      if (updates.length > 0) {
	        // 批量更新用 setState（immer）
	        useEditorStore.setState((state) => {
	          for (let i = 0; i < updates.length; i++) {
	            const target = updates[i]
	            for (let j = 0; j < state.nodes.length; j++) {
	              if (state.nodes[j].id === target.id) {
	                state.nodes[j].style.y = target.y
	                break
	              }
	            }
	          }
	        })
	      }
	      // 调整画布高度以适应 A 类节点堆叠的总高度。
		      // 只在确实存在 A 类节点、且不存在 B 类根节点时才调整画布高度：
		      // - autoPlacedCount > 0：有需要自动堆叠的节点
		      // - !hasBClassRoot：没有 x≠0 的并列布局节点（即纯纵向堆叠场景）
		      // 存在 B 类根节点时（如两栏布局），画布高度由模板/用户指定，不应被自动覆盖。
		      const hasBClassRoot = nodes.some((n) => (n.style?.x ?? 0) !== 0)
		      if (autoPlacedCount > 0 && !hasBClassRoot) {
	        const curH = parseInt(canvas.height) || 0
	        const desiredH = Math.max(800, Math.ceil(maxBottom + 24))
	        if (Math.abs(desiredH - curH) > 1) {
	          updateCanvas({ height: `${desiredH}px` })
	        }
	      }
	    })
	    return () => cancelAnimationFrame(raf)
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [nodes.length])

  // 解析画布尺寸用于参考线长度
  const cw = parseInt(canvas.width) || 1200
  const ch = parseInt(canvas.height) || 800

  return (
    <div
      className="relative flex-1 overflow-auto"
      style={{
        backgroundColor: '#f3f4f6',
        backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {/* 缩放/工具控件：固定在画布视口底部居中。
          用 position:fixed 保证不被父级 flex 布局影响，始终贴底居中。 */}
      <div
        className="flex justify-center pointer-events-none"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 12,
          zIndex: 50,
        }}
      >
        <div className="inline-flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1.5 py-1 pointer-events-auto">
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
          width: `calc(${canvas.width} * ${zoom} + 48px)`,
          height: `calc(${canvas.height} * ${zoom} + 48px)`,
          margin: `0 auto ${24}px`,
          position: 'relative',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          cursor,
          userSelect: panMode ? 'none' : undefined,
        }}
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
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
        <div
          ref={setRefs}
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
            position: 'absolute',
            top: 24,
            left: 24,
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            backgroundColor: canvas.backgroundColor,
            color: '#1f2937',
            boxShadow: isOver ? '0 0 0 2px #6366f1, 0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.12)',
            // 手型模式下禁用画布内元素交互，让 mousedown 穿透到外层 wrapper 触发平移
            pointerEvents: panMode ? 'none' : undefined,
            // 手型模式下画布自身也显示光标，避免被白色背景遮挡 wrapper 的光标
            cursor: isPanning ? 'grabbing' : panMode ? 'grab' : undefined,
          }}
        >
          {nodes.length === 0 ? (
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

          {/* 智能吸附参考线：蓝=边缘，紫=中心，橙=等间距（带数值标签） */}
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
            <defs>
              <filter id="snap-label-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.5" />
              </filter>
            </defs>
            {snapLines.map((line, i) => {
              const color = line.type === 'spacing' ? '#f59e0b' : line.type === 'center' ? '#a855f7' : '#3b82f6'
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
                        {/* 在 fromPos 到拖拽元素左边缘之间画间距括号 */}
                        {line.fromPos !== undefined && (
                          <>
                            <line
                              x1={line.fromPos}
                              y1={4}
                              x2={line.fromPos}
                              y2={16}
                              stroke={color}
                              strokeWidth={2}
                            />
                            <line
                              x1={line.fromPos}
                              y1={10}
                              x2={line.pos - 4}
                              y2={10}
                              stroke={color}
                              strokeWidth={1.5}
                            />
                            <rect
                              x={(line.fromPos + line.pos) / 2 - 24}
                              y={2}
                              width={48}
                              height={16}
                              rx={3}
                              fill="#f59e0b"
                              filter="url(#snap-label-shadow)"
                            />
                            <text
                              x={(line.fromPos + line.pos) / 2}
                              y={13}
                              fill="#ffffff"
                              fontSize={11}
                              fontFamily="monospace"
                              fontWeight={600}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              ={Math.round(line.gap / 2)}px
                            </text>
                          </>
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
                      {line.fromPos !== undefined && (
                        <>
                          <line
                            x1={4}
                            y1={line.fromPos}
                            x2={16}
                            y2={line.fromPos}
                            stroke={color}
                            strokeWidth={2}
                          />
                          <line
                            x1={10}
                            y1={line.fromPos}
                            x2={10}
                            y2={line.pos - 4}
                            stroke={color}
                            strokeWidth={1.5}
                          />
                          <rect
                            x={2}
                            y={(line.fromPos + line.pos) / 2 - 8}
                            width={42}
                            height={16}
                            rx={3}
                            fill="#f59e0b"
                            filter="url(#snap-label-shadow)"
                          />
                          <text
                            x={23}
                            y={(line.fromPos + line.pos) / 2}
                            fill="#ffffff"
                            fontSize={11}
                            fontFamily="monospace"
                            fontWeight={600}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            ={Math.round(line.gap / 2)}px
                          </text>
                        </>
                      )}
                    </>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
      {/* 右键菜单 */}
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
              minWidth: 120,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
            onClick={closeCtxMenu}
          >
            {/* 右键复制按钮 */}
            <div
              onClick={(e) => {
                e.stopPropagation()
                closeCtxMenu()
                const sid = useEditorStore.getState().selectedId
                if (sid) useEditorStore.getState().copyNode(sid)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                color: useEditorStore.getState().selectedId ? '#e2e8f0' : '#64748b',
                fontSize: 13,
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                if (useEditorStore.getState().selectedId) (e.currentTarget as HTMLElement).style.background = '#334155'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              复制
            </div>
            {/* 右键粘贴按钮 */}
            <div
              onClick={async (e) => {
                e.stopPropagation()
                // 先粘贴再关闭菜单，保持用户手势上下文（navigator.clipboard.read 需要）
                await unifiedAsyncPaste({ ...lastMousePosRef.current })
                closeCtxMenu()
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                color: '#e2e8f0',
                fontSize: 13,
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#334155'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              粘贴
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
})
