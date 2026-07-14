import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { Component, useEffect, useRef, useState } from 'react'
import { Toolbar } from '@/components/Toolbar'
import { ComponentPanel } from '@/components/ComponentPanel'
import { Canvas } from '@/components/Canvas'
import { Inspector } from '@/components/Inspector'
import { RefineInspector } from '@/components/RefineInspector'
import { ImageCropModal } from '@/components/ImageCropModal'
import { setPendingPasteId, getAndClearPendingPasteId } from '@/components/Canvas'
import { nodeToCss, renderPreviewTree } from '@/components/NodeRenderer'
import { useEditorStore, findById, getClipboard, getLastInternalCopyTime, getLastExternalCopyTime, markExternalCopy } from '@/store/editorStore'
import { findComponentDef } from '@/data/componentLib'
import type { CanvasNode, ComponentType } from '@/types'
import { collectRectsFromDOM, computeSnap, canvasRect, type SnapLine, type PrevSnapState } from '@/utils/snapping'
import { insertRefineElement, buildRefineInfo } from '@/utils/refineInsertion'

/** 判断事件目标是否处于可输入元素中（避免快捷键误触影响输入） */
function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (t.isContentEditable) return true
  return false
}

const CONTAINER_PREFIX = 'container_'

/** 解析 "320px" → 320，无效返回 null */
function parsePxLocal(s?: string): number | null {
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s.trim())
  return m ? parseFloat(m[1]) : null
}

/** 获取节点在画布坐标系的总父级偏移（累加所有祖先的 x/y） */
function getParentOffset(nodes: CanvasNode[], id: string): { x: number; y: number } {
  const walk = (arr: CanvasNode[], pl: number, pt: number): { x: number; y: number } | null => {
    for (const n of arr) {
      const nx = pl + (n.style.x ?? 0)
      const ny = pt + (n.style.y ?? 0)
      if (n.id === id) return { x: pl, y: pt } // 返回父级累计偏移（不含自身）
      if (n.children.length) {
        const r = walk(n.children, nx, ny)
        if (r) return r
      }
    }
    return null
  }
  return walk(nodes, 0, 0) ?? { x: 0, y: 0 }
}

/** 简易错误边界：捕获渲染阶段异常，避免白屏 */
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#ef4444', fontFamily: 'monospace' }}>
          <h2>渲染错误</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

/** 精修模式下用 RefineInspector 替代 Inspector，避免显示"未选中元素"误导用户 */
function RefineModeBoundary() {
  const refineSession = useEditorStore((s) => s.refineSession)
  if (refineSession) return <RefineInspector />
  return <Inspector />
}

export default function App() {
		  const addNode = useEditorStore((s) => s.addNode)
		  const moveNode = useEditorStore((s) => s.moveNode)
		  const zoom = useEditorStore((s) => s.zoom)
		  const cropKey = useEditorStore((s) => s.cropModal.cropKey)
		  const canvasRef = useRef<HTMLDivElement>(null)
  const [activeNode, setActiveNode] = useState<CanvasNode | null>(null)
  /** 调试用：将 store 暴露到 window */
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __pf: typeof useEditorStore }).__pf = useEditorStore
    }
    // 测试模式：URL 含 ?test=layer 时加载 5 个测试节点
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === 'layer') {
      // 生成 400x300 的 4:3 测试图（蓝色背景 + 白色文字）作为 data URL
      // 仅当 image 节点没有 src 时生成（避免 React 18 strict mode 重复执行时双倍生成）
      const c = document.createElement('canvas')
      c.width = 400; c.height = 300
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, 0, 400, 300)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 48px sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Test 4:3', 200, 150)
      const testImgSrc = c.toDataURL('image/png')
      const { addNode, addNodes } = useEditorStore.getState()
      // 测试模式下，使用 updateNodes 防止 React 18 strict mode 双倍加载
      const existing = useEditorStore.getState().nodes
      if (existing.length > 0) return
      addNodes([
        { id: 't1', type: 'heading', visible: true, props: { text: '标题 A', level: 1 }, style: { x: 100, y: 50, fontSize: '32px' }, children: [] },
        { id: 't2', type: 'text', visible: true, props: { text: '正文 B' }, style: { x: 100, y: 120, fontSize: '16px' }, children: [] },
        { id: 't3', type: 'container', visible: true, props: {}, style: { x: 100, y: 200, width: '400px', minHeight: '150px', backgroundColor: '#f1f5f9', padding: '20px' }, children: [
          { id: 't3-1', type: 'text', visible: true, props: { text: '容器内文字' }, style: { x: 0, y: 0, fontSize: '14px' }, children: [] },
        ] },
        { id: 't4', type: 'button', visible: true, props: { text: '按钮 D' }, style: { x: 100, y: 400, width: '120px', height: '40px' }, children: [] },
        { id: 't5', type: 'image', visible: true, props: { src: testImgSrc, originalWidth: 400, originalHeight: 300, alt: '4:3 测试图' }, style: { x: 100, y: 500, width: '200px', height: '150px' }, children: [] },
      ])
    }
  }, [])
  /** 记录当前拖拽来源，供 modifier 判断是否需要把预览贴到光标 */
  const dragSourceRef = useRef<'library' | 'canvas' | null>(null)
  /** 拖拽期间持续跟踪光标真实位置（不依赖 dnd-kit 的 delta/activatorEvent） */
  const cursorRef = useRef({ x: 0, y: 0 })
  /** overlay 外层 div 引用，用于在 onDragEnd 中读取实际渲染尺寸来居中落点 */
  const overlayRef = useRef<HTMLDivElement>(null)
  /** 拖拽来源（state 版本，驱动 DragOverlay 渲染判定与 modifier 选择） */
  const [dragSource, setDragSource] = useState<'library' | 'canvas' | null>(null)
  /** 画布拖拽期间的吸附参考线（state 驱动 Canvas 渲染粉色线） */
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  /** 当前拖拽的画布元素 id（用于 onDragMove 计算吸附） */
  const draggingCanvasIdRef = useRef<string | null>(null)
  /** 拖拽起点的元素坐标（onDragEnd 计算最终落点用） */
  const dragOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  /** 当前 snap 偏移量（画布空间），modifier 直接读此 ref 同步叠加到 transform */
  const snapOffsetRef = useRef({ x: 0, y: 0 })
  /** 上一次吸附状态（供滞后阈值防抖） */
  const prevSnapRef = useRef<PrevSnapState>({ snappedX: false, snappedY: false })
  /** 拖拽中 active node 的画布空间尺寸（用于补偿 scale(zoom) 从 center 缩放导致的视觉偏移） */
  const dragSizeRef = useRef<{ w: number; h: number }>({ w: 100, h: 40 })
  

  // 拖拽期间持续监听 pointermove，记录真实光标位置
  // （库拖拽 DragOverlay 居中 modifier 和画布吸附计算都会用到 cursorRef；
  //  用 ref 同步更新，避免 setState 延迟导致"乱飞"）
  useEffect(() => {
    if (!activeNode) return
    const onMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [activeNode])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  /**
   * 库拖拽 modifier：把 DragOverlay 中心对齐到光标（屏幕绝对位置）。
   * 关键：dnd-kit 的 DragOverlay wrapper 内部是
   *     `top: activeNodeRect.top; left: activeNodeRect.left; transform: translate3d(...)`
   *   即 wrapper 已先放在库项原位置，再把 transform 叠加上去。
   *   所以 modifier 返回的不是「绝对屏幕位置」而是「相对 activeNodeRect 的 delta」。
   *   否则会被叠加到 (libraryItem.left + cursor - halfW) 偏 88px（库项距顶）。
   * 用 cursorRef 实时位置直接计算最终位置 = cursor - halfSize，减去 activeNodeRect 原位置
   * 作为 delta，配合 applySnapToLibrary 在 modifier chain 中叠加吸附偏移。
   * 非 library 时（画布拖拽）原样返回 transform，避免重置画布拖拽位置。
   */
  const centerLibraryOnCursor: Modifier = ({ transform, activeNodeRect, draggingNodeRect }) => {
		    if (dragSourceRef.current !== 'library') return transform
		    const el = overlayRef.current
		    const ow = el?.offsetWidth ?? 100
		    const oh = el?.offsetHeight ?? 40
		    // wrapper 用的是 activeNodeRect（库项位置），modifier 返回的是 delta
		    const anr = activeNodeRect ?? draggingNodeRect
		    const baseLeft = anr?.left ?? 0
		    const baseTop = anr?.top ?? 0
		    // transformOrigin: center center —— scale 从中心展开，视觉中心 = wrapper 中心（ow/2），
		    // 不需要乘以 zoom（因 scale 不改变 center 位置）
		    return {
		      x: cursorRef.current.x - ow / 2 - baseLeft,
		      y: cursorRef.current.y - oh / 2 - baseTop,
		      scaleX: 1,
		      scaleY: 1,
		    }
		  }

  /**
   * 库拖拽 modifier：把 snap offset 应用到 DragOverlay。
   * snapOffsetRef 是画布空间，transform 是屏幕空间，需要乘以 zoom。
   * 与画布拖拽共用同一份 snap 状态，确保视觉吸附和最终落点原子一致。
   */
  const applySnapToLibrary: Modifier = ({ transform }) => {
    if (dragSourceRef.current !== 'library') return transform
    const zoom = useEditorStore.getState().zoom
    return {
      ...transform,
      x: transform.x + snapOffsetRef.current.x * zoom,
      y: transform.y + snapOffsetRef.current.y * zoom,
    }
  }

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as
      | { source: 'library' | 'canvas'; type?: string; id?: string }
      | undefined
    if (!data) return
    dragSourceRef.current = data.source
    setDragSource(data.source)
    prevSnapRef.current = { snappedX: false, snappedY: false }
    // 初始化光标位置为激活点，供 modifier 居中计算
    const ae = event.activatorEvent as PointerEvent
    cursorRef.current = { x: ae.clientX, y: ae.clientY }
    if (data.source === 'library' && data.type) {
      // 库拖拽：构造临时预览节点（不入库，仅用于 DragOverlay 显示）
      const def = findComponentDef(data.type)
      if (!def) return
      const preview: CanvasNode = {
        id: 'preview',
        type: data.type as ComponentType,
        props: { ...def.defaultProps },
        style: { ...def.defaultStyle },
        children: [],
      }
      setActiveNode(preview)
      dragSizeRef.current = {
        w: parsePxLocal(def.defaultStyle.width) ?? 100,
        h: parsePxLocal(def.defaultStyle.height) ?? 40,
      }
    } else if (data.source === 'canvas' && data.id) {
		      // 画布拖拽：取真实节点做预览（含子节点，故用递归预览）
		      const nodes = useEditorStore.getState().nodes
		      const n = findById(nodes, data.id)
		      setActiveNode(n)
		      if (n) {
		        draggingCanvasIdRef.current = data.id
		        // 存储绝对画布坐标（含父级偏移），确保后续计算（onDragMove / onDragEnd）
		        // 在统一坐标系下进行，避免子元素相对坐标与容器绝对坐标混用导致吸附到左上角
		        const parentOffset = getParentOffset(nodes, data.id)
		        dragOriginRef.current = {
		          x: (n.style.x ?? 0) + parentOffset.x,
		          y: (n.style.y ?? 0) + parentOffset.y,
		        }
		        dragSizeRef.current = {
		          w: parsePxLocal(n.style.width) ?? 100,
		          h: parsePxLocal(n.style.height) ?? 40,
		        }
		      }
		    }
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over, delta, activatorEvent } = event
    // ⚠️ 必须在重置前保存 snapOffset 和 overlay 位置，否则 setActiveNode(null) 后 ref 可能被清理
    const snapOff = { ...snapOffsetRef.current }
    const overlayRect = overlayRef.current?.getBoundingClientRect() ?? null
    setActiveNode(null)
    dragSourceRef.current = null
    setDragSource(null)
    setSnapLines([])
    snapOffsetRef.current = { x: 0, y: 0 }
    prevSnapRef.current = { snappedX: false, snappedY: false }
    draggingCanvasIdRef.current = null
    const data = active.data.current as
      | { source: 'library' | 'canvas'; type?: string; id?: string; x?: number; y?: number }
      | undefined
    if (!data || !activatorEvent) return

    const zoom = useEditorStore.getState().zoom

    if (data.source === 'library' && data.type) {
      // 库 → 画布根 / 容器内 (自由画布模式)
      //      或 → iframe (精修模式)
      const refineSession = useEditorStore.getState().refineSession
      if (refineSession) {
        // 精修模式：把元素直接插入到 iframe DOM
        // 用 cursorRef 记录的真实光标位置（已通过 pointermove 实时更新）
        // 兜底使用 activatorEvent 坐标
        const ae = activatorEvent as PointerEvent | MouseEvent
        const x = cursorRef.current.x || ae.clientX
        const y = cursorRef.current.y || ae.clientY
        const iframeEl = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
        if (!iframeEl?.contentDocument) return
        const doc = iframeEl.contentDocument
        // 用 screenX/screenY 走"基于鼠标位置定位"路径：
        // 落到哪个元素附近就插在它前面/后面，更符合用户拖拽直觉
        const result = insertRefineElement(doc, data.type as ComponentType, {
          iframeEl,
          screenX: x,
          screenY: y,
        })
        if (result) {
          // 触发选中：让右侧 Inspector 显示新元素的属性
          const info = buildRefineInfo(doc, result.element)
          if (info) {
            useEditorStore.getState().selectRefineElement(info)
          }
          // 滚动到新元素可见区域
          try {
            result.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          } catch {
            /* ignore cross-context errors */
          }
          console.info('[App] 精修模式插入元素：', data.type, 'at', x, y)
        }
        return
      }
      // 精修模式下库拖拽只到这里；下面继续 freeform 模式逻辑
      // 第一性原理：modifier 把 overlay 左上角贴到 (cursor - halfW, cursor - halfH)
      // 节点也按左上角定位，所以落点必须用 overlay 的 左上角（r.left, r.top）
      // 而不是用中心（r.left + r.width/2），否则节点会向右下偏移半个尺寸
      if (!overlayRect) return
      // snapOff 已通过 modifier 写入 overlay 位置，overlayRect.left/top 本身就包含吸附偏移
      const overId = String(over?.id ?? '')
      if (overId === 'canvas') {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        // 屏幕坐标 → 画布坐标：除以 zoom
        addNode(
          data.type as ComponentType,
          Math.max(0, (overlayRect.left - rect.left) / zoom),
          Math.max(0, (overlayRect.top - rect.top) / zoom),
        )
      } else if (overId.startsWith(CONTAINER_PREFIX)) {
        const parentId = overId.slice(CONTAINER_PREFIX.length)
        const containerEl = document.querySelector<HTMLElement>(`[data-node-id="${parentId}"]`)
        if (!containerEl) return
        const overRect = containerEl.getBoundingClientRect()
        addNode(
          data.type as ComponentType,
          Math.max(0, (overlayRect.left - overRect.left) / zoom),
          Math.max(0, (overlayRect.top - overRect.top) / zoom),
          parentId,
        )
      }
    } else if (data.source === 'canvas' && data.id) {
	      // 画布元素拖拽：pointerWithin 只在光标落入容器内时返回容器，防止吸附线误触发
	      const overId = String(over?.id ?? '')
	      if (overId.startsWith(CONTAINER_PREFIX) && overId !== `${CONTAINER_PREFIX}${data.id}`) {
	        // 光标在容器内 → 拖入容器
	        const parentId = overId.slice(CONTAINER_PREFIX.length)
	        const canvasEl = canvasRef.current
	        if (!canvasEl) return
	        const canvasRect = canvasEl.getBoundingClientRect()
	        const containerEl = document.querySelector<HTMLElement>(`[data-node-id="${parentId}"]`)
	        if (!containerEl) return
	        const containerRect = containerEl.getBoundingClientRect()
	        const absX = dragOriginRef.current.x + delta.x / zoom + snapOff.x
	        const absY = dragOriginRef.current.y + delta.y / zoom + snapOff.y
	        const px = (containerRect.left - canvasRect.left) / zoom
	        const py = (containerRect.top - canvasRect.top) / zoom
	        const relX = Math.max(0, absX - px)
	        const relY = Math.max(0, absY - py)
	        const { reparentNode: doReparent } = useEditorStore.getState()
	        doReparent(data.id, parentId)
	        moveNode(data.id, relX, relY)
	      } else {
		        // 光标不在容器内 → 普通移动或从容器拖出
		        const newX = dragOriginRef.current.x + delta.x / zoom + snapOff.x
		        const newY = dragOriginRef.current.y + delta.y / zoom + snapOff.y
		        const nodes = useEditorStore.getState().nodes
		        const isInContainer = !nodes.some((n) => n.id === data.id)
		        if (isInContainer && overId === 'canvas') {
		          // 从容器拖出到根级：dragOriginRef 已是绝对坐标，newX/newY 即目标绝对位置
		          const { reparentNode: doReparent } = useEditorStore.getState()
		          doReparent(data.id, null)
		          moveNode(data.id, newX, newY)
		        } else {
		          moveNode(data.id, newX, newY)
		        }
		      }
	    }
  }

  const onDragCancel = (_event: DragCancelEvent) => {
    setActiveNode(null)
    dragSourceRef.current = null
    setDragSource(null)
    setSnapLines([])
    snapOffsetRef.current = { x: 0, y: 0 }
    prevSnapRef.current = { snappedX: false, snappedY: false }
    draggingCanvasIdRef.current = null
  }

  /** 画布/库拖拽期间实时计算吸附，更新 snapLines 和 snapOffsetRef */
  const onDragMove = (event: DragMoveEvent) => {
    const source = dragSourceRef.current
    if (source !== 'canvas' && source !== 'library') return

    const state = useEditorStore.getState()
    const zoom = state.zoom

    const canvas = canvasRef.current
    if (!canvas) return

    // 统一：从 DOM 取 overlay 真实宽高（对齐外框虚线），但从 cursor 原始坐标算位置（避免 snap 反馈振荡）
    // 如果读 overlay 实际位置（含上一帧 snap 偏移），snap 计算 会形成反馈环：
    //   帧1: snap = target - cursor = D → overlay 到 target
    //   帧2: 读到 target 位置 → snap = target - target = 0 → overlay 回到 cursor
    //   帧3: 读到 cursor 位置 → snap = D → 振荡
    // 用 cursorRef 算位置（不含 snap），snap 偏移由 modifier 单向叠加，无振荡。
    const canvasRectDOM = canvas.getBoundingClientRect()
    let ow = 0
    let oh = 0
    let rawLeft = 0
    let rawTop = 0

    if (source === 'library') {
      // 宽高从 overlay DOM 读（offsetWidth 不受 transform 影响 = canvas 空间尺寸）
      const el = overlayRef.current
      ow = el?.offsetWidth ?? 100
      oh = el?.offsetHeight ?? 40
      // 位置从 cursorRef 算（= centerLibraryOnCursor 的基础位置，不含 snap）
      rawLeft = (cursorRef.current.x - ow / 2 - canvasRectDOM.left) / zoom
      rawTop = (cursorRef.current.y - oh / 2 - canvasRectDOM.top) / zoom
    } else if (source === 'canvas') {
	      const cid = draggingCanvasIdRef.current!
	      const nodeEl = document.querySelector<HTMLElement>(`[data-node-id="${cid}"]`)
	      ow = nodeEl?.offsetWidth ?? (parsePxLocal(findById(state.nodes, cid)?.style.width) ?? 100)
	      oh = nodeEl?.offsetHeight ?? (parsePxLocal(findById(state.nodes, cid)?.style.height) ?? 40)
	      // dragOriginRef 已是绝对画布坐标（含父级偏移），直接加 delta 即可
	      // delta 是屏幕空间，需要除以 zoom 转为画布空间
	      rawLeft = dragOriginRef.current.x + event.delta.x / zoom
	      rawTop = dragOriginRef.current.y + event.delta.y / zoom
	    }

    const id = source === 'canvas' ? draggingCanvasIdRef.current! : '__preview__'
    const dragRect = {
      id,
      left: rawLeft,
      right: rawLeft + ow,
      top: rawTop,
      bottom: rawTop + oh,
      centerX: rawLeft + ow / 2,
      centerY: rawTop + oh / 2,
    }

    // 统一：吸附目标也从 DOM 实际外框读取，与子元素优先顺序保持一致
    const excludeId = source === 'canvas' ? draggingCanvasIdRef.current! : ''
    const targets = collectRectsFromDOM(canvas, excludeId, zoom).reverse()
    targets.push(canvasRect(state.canvas.width, state.canvas.height))
    const { dx, dy, lines } = computeSnap(dragRect, targets, prevSnapRef.current)

    snapOffsetRef.current = { x: dx, y: dy }
    setSnapLines(lines)

    // 记录本次吸附状态，供下一次 onDragMove 滞后阈值判断
    prevSnapRef.current = {
      snappedX: lines.some((l) => l.axis === 'x'),
      snappedY: lines.some((l) => l.axis === 'y'),
    }
  }

  /** modifier：画布拖拽时把位置 + snap 补偿到 overlay 的 transform。
   * 第一性原理：
   * 1. dnd-kit 的 activeNodeRect 使用 getTransformAgnosticClientRect 测量，
   *    忽略了元素自身的旋转，所以旋转不需要额外补偿（overlay 自身的 CSS rotate 即可）
   * 2. 画布 canvas 使用 transformOrigin: 'top left' 缩放，而 overlay div 使用
   *    transformOrigin: 'center center'（为了旋转正确）。当 zoom ≠ 1 时，
   *    scale(zoom) 从 center 缩放会导致视觉中心偏移 (w*(1-zoom)/2, h*(1-zoom)/2)。
   *    必须在 modifier 中减去此偏移量补偿。 */
  const positionCanvasDrag: Modifier = ({ transform, activeNodeRect }) => {
    if (dragSourceRef.current !== 'canvas') return transform
    const anr = activeNodeRect
    if (!anr) return transform
    const canvasEl = canvasRef.current
    if (!canvasEl) return transform
    const canvasRect = canvasEl.getBoundingClientRect()
    const zoom = useEditorStore.getState().zoom
    // 未旋转元素的屏幕坐标（左上角）
    const unrotatedX = canvasRect.left + dragOriginRef.current.x * zoom
    const unrotatedY = canvasRect.top + dragOriginRef.current.y * zoom
    // activeNodeRect 忽略了元素自身旋转（getTransformAgnosticClientRect），
    // 所以 anr.left/top 就是未旋转的屏幕位置，与 unrotatedX/Y 一致。
    // 关键补偿：overlay div 使用 transformOrigin: 'center center' 进行 scale(zoom)，
    // 而画布 canvas 使用 'top left'。从 center 缩放时，视觉中心偏移了
    // (w*(1-zoom)/2, h*(1-zoom)/2)，需要减去此偏移使 overlay 视觉中心
    // 与画布上未旋转元素的视觉中心对齐。
    const { w, h } = dragSizeRef.current
    const scaleOffsetX = w * (1 - zoom) / 2
    const scaleOffsetY = h * (1 - zoom) / 2
    return {
      // unrotatedX - anr.left 为 0（activeNodeRect 忽略旋转），保留以文档化
      x: unrotatedX - anr.left + transform.x + snapOffsetRef.current.x * zoom - scaleOffsetX,
      y: unrotatedY - anr.top + transform.y + snapOffsetRef.current.y * zoom - scaleOffsetY,
      scaleX: 1,
      scaleY: 1,
    }
  }

  // 全局键盘快捷键：Delete 删除选中、方向键微移（Shift=10px）
  const removeNode = useEditorStore((s) => s.removeNode)
  const copyNode = useEditorStore((s) => s.copyNode)
  const duplicateNode = useEditorStore((s) => s.duplicateNode)
  const pasteNode = useEditorStore((s) => s.pasteNode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return

      // Ctrl+Z / Ctrl+Shift+Z 撤销重做（不依赖选中状态）
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        const { temporal } = useEditorStore
        if (e.shiftKey) {
          temporal.getState().redo()
        } else {
          temporal.getState().undo()
        }
        return
      }

      const state = useEditorStore.getState()
      const sid = state.selectedId
      const selectedIds = state.selectedIds

      // Ctrl+C 复制（多选时复制主节点）
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && sid) {
        e.preventDefault()
        copyNode(sid)
        return
      }

      // Ctrl+V 粘贴：比较内外复制时间戳，粘贴最新复制的内容
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const internalTime = getLastInternalCopyTime()
        const externalTime = getLastExternalCopyTime()
        const clip = getClipboard()

        if (internalTime >= externalTime && clip) {
          // 内部复制更新 → 粘贴内部节点
          const id = pasteNode()
          if (id) {
            setPendingPasteId(id)
            // 200ms 后清除（如果文档 paste 监听器没有处理图片，则保留此节点）
            setTimeout(() => getAndClearPendingPasteId(), 200)
          }
        }
        // 外部复制更新或无内部剪贴板 → 不阻止默认，让 paste 事件触发（文档监听器处理）
        return
      }

      // Ctrl+D 原地复制（多选时复制主节点）
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && sid) {
        e.preventDefault()
        duplicateNode(sid)
        return
      }

      // Delete/Backspace 删除（支持多选批量删除）
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (selectedIds.length > 1) {
          for (const id of selectedIds) {
            removeNode(id)
          }
        } else if (sid) {
          removeNode(sid)
        }
        return
      }

      if (!sid) return
      const node = findById(state.nodes, sid)
      if (!node) return
      const step = e.shiftKey ? 10 : 1
      const curX = node.style.x ?? 0
      const curY = node.style.y ?? 0
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          moveNode(sid, curX - step, curY)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveNode(sid, curX + step, curY)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveNode(sid, curX, curY - step)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveNode(sid, curX, curY + step)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [removeNode, moveNode, copyNode, duplicateNode, pasteNode])

  // 文档级 copy 监听：跟踪外部复制时间戳（用于粘贴时内外优先级判断）
  useEffect(() => {
    const onCopy = () => {
      markExternalCopy()
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [])

  // 窗口聚焦监听：用户在外部 App 复制后切回页面时，更新外部复制时间戳
  // 因为外部 App 的复制操作不会触发当前页面的 copy 事件
  useEffect(() => {
    const onFocus = () => {
      markExternalCopy()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex flex-col h-screen bg-ink-900 text-gray-100">
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <ComponentPanel />
          <ErrorBoundary>
            <Canvas ref={canvasRef} snapLines={snapLines} />
          </ErrorBoundary>
          <RefineModeBoundary />
        </div>
      </div>
      {/* 拖拽预览：库/画布都用 dnd-kit DragOverlay
          - modifier 必须放在 DragOverlay 上（DndContext.modifiers 只作用于 draggable 本身，
            不作用于 DragOverlay），否则库拖拽时看不见的 library item 被定位，画面看到
            的 DragOverlay 仍按 dnd-kit 默认 transform 渲染，造成"飞"
          - 库拖拽：centerLibraryOnCursor 把中心贴到光标 + applySnapToLibrary 同步吸附
          - 画布拖拽：positionCanvasDrag 补偿旋转偏移 + 同步吸附 */}
      {activeNode && (
        <DragOverlay
          dropAnimation={null}
          modifiers={
            dragSource === 'canvas'
              ? [positionCanvasDrag]
              : [centerLibraryOnCursor, applySnapToLibrary]
          }
        >
          <div
            ref={overlayRef}
            style={{
              // 不用 position: absolute，让 DragOverlay wrapper 自然包裹内容
              // 画布有 transform: scale(zoom)，所以预览也同步缩放，保证视觉尺寸一致
              ...nodeToCss(activeNode.style),
              // 旋转偏移补偿已移到 positionCanvasDrag modifier 中处理
              // 组合 zoom 缩放 + 节点旋转（旋转在 props 中，不在 style 里）
              // transformOrigin: center center —— 旋转围绕元素中心，与画布上实际元素一致
              transform: activeNode.props.rotation
                ? `scale(${zoom}) rotate(${activeNode.props.rotation}deg)`
                : `scale(${zoom})`,
              transformOrigin: 'center center',
              ...(activeNode.type === 'button'
                ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
                : {}),
              ...(!activeNode.style.width ? { width: 'max-content', maxWidth: 'none' } : {}),
              opacity: 0.92,
              pointerEvents: 'none',
              cursor: 'grabbing',
            }}
          >
            {renderPreviewTree(activeNode)}
          </div>
        </DragOverlay>
      )}
      <ImageCropModal key={cropKey} />
    </DndContext>
  )
}
