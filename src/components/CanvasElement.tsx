import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { CanvasNode, HoverEffectConfig } from '@/types'
import { useEditorStore, findById } from '@/store/editorStore'
import { nodeToCss, renderNodeContent } from '@/components/NodeRenderer'

/** 可双击就地编辑文字的节点类型 */
const TEXT_EDITABLE = new Set(['heading', 'text', 'button', 'card', 'icon', 'input'])

/**
 * 8 向 resize 手柄：pos 用 translate 把手柄中心落到选中线上。
 * outline 2px 画在 border-box 外侧，其中心在 border-box 边缘外 1px；
 * 故 top/bottom/left/right 用 -1 把手柄中心外移 1px，使其落在虚线中心。
 */
const HANDLES = [
  { dir: 'nw', pos: { top: -1, left: -1, transform: 'translate(-50%,-50%)' }, cursor: 'nwse-resize', aff: { x: true, y: true, w: -1, h: -1 } },
  { dir: 'n', pos: { top: -1, left: '50%', transform: 'translate(-50%,-50%)' }, cursor: 'ns-resize', aff: { x: false, y: true, w: 0, h: -1 } },
  { dir: 'ne', pos: { top: -1, right: -1, transform: 'translate(50%,-50%)' }, cursor: 'nesw-resize', aff: { x: false, y: true, w: 1, h: -1 } },
  { dir: 'e', pos: { top: '50%', right: -1, transform: 'translate(50%,-50%)' }, cursor: 'ew-resize', aff: { x: false, y: false, w: 1, h: 0 } },
  { dir: 'se', pos: { bottom: -1, right: -1, transform: 'translate(50%,50%)' }, cursor: 'nwse-resize', aff: { x: false, y: false, w: 1, h: 1 } },
  { dir: 's', pos: { bottom: -1, left: '50%', transform: 'translate(-50%,50%)' }, cursor: 'ns-resize', aff: { x: false, y: false, w: 0, h: 1 } },
  { dir: 'sw', pos: { bottom: -1, left: -1, transform: 'translate(-50%,50%)' }, cursor: 'nesw-resize', aff: { x: true, y: false, w: -1, h: 1 } },
  { dir: 'w', pos: { top: '50%', left: -1, transform: 'translate(-50%,-50%)' }, cursor: 'ew-resize', aff: { x: true, y: false, w: -1, h: 0 } },
] as const

interface ResizeStart {
  clientX: number
  clientY: number
  w: number
  h: number
  x: number
  y: number
  aff: { x: boolean; y: boolean; w: number; h: number }
  /** 起始时的画布缩放，用于把屏幕空间 delta 转画布空间 */
  zoom: number
}

const MIN_SIZE = 20

export const CanvasElement = memo(function CanvasElement({ node, isRoot = false }: { node: CanvasNode; isRoot?: boolean }) {
  const selectNode = useEditorStore((s) => s.selectNode)
  const toggleSelection = useEditorStore((s) => s.toggleSelection)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)
  const updateNodeStyle = useEditorStore((s) => s.updateNodeStyle)
  const selectedId = useEditorStore((s) => s.selectedId)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  // 预览模式状态
  const previewMode = useEditorStore((s) => s.previewMode)
  const previewDisplayOverride = useEditorStore((s) => s.previewDisplayOverrides[node.id])
  const setPreviewDisplay = useEditorStore((s) => s.setPreviewDisplay)
  const nodes = useEditorStore((s) => s.nodes)
  const draggable = useDraggable({
    id: node.id,
    data: { source: 'canvas', id: node.id, x: node.style.x ?? 0, y: node.style.y ?? 0 },
  })
  // 容器可作为放置目标；非容器禁用，避免拦截画布 drop
  const droppable = useDroppable({
    id: `container_${node.id}`,
    disabled: node.type !== 'container',
  })

  const isSelected = selectedId === node.id
  const isMultiSelected = selectedIds.includes(node.id)
  const isPrimary = isSelected
  const onPointerDownFromListener = draggable.listeners?.onPointerDown

  const [editing, setEditing] = useState(false)
  const editableRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef('')

  /** 本地 resize 态：拖拽手柄时实时更新尺寸视觉，松手才提交到 store（单条历史） */
  const [resize, setResize] = useState<{ w: number; h: number; x: number; y: number } | null>(null)
  const startRef = useRef<ResizeStart | null>(null)
  const liveRef = useRef<{ w: number; h: number; x: number; y: number } | null>(null)
  const elRef = useRef<HTMLDivElement | null>(null)

  /** 悬停预览状态 */
  const [isHovered, setIsHovered] = useState(false)
  const hoverConfig = node.interaction?.onHover
  const hasInteraction = !!(node.interaction?.link || (node.interaction?.onClick && node.interaction.onClick.action !== 'none'))

  const setRefs = (n: HTMLDivElement | null) => {
    try {
      draggable.setNodeRef(n)
      droppable.setNodeRef(n)
      elRef.current = n
    } catch (err) {
      console.error('[CE.setRefs] ERROR for', node.type, '#' + node.id.slice(-4), err)
      elRef.current = n
    }
  }

  useEffect(() => {
    if (editing) {
      if (elRef.current) {
        try {
          const r = elRef.current.getBoundingClientRect()
          elRef.current.setAttribute('data-debug', node.type + ' w=' + r.width.toFixed(0) + ' h=' + r.height.toFixed(0))
        } catch {
          // ignore
        }
      }
    }
  }, [editing, node.type, node.id])

  const isTextEditable = TEXT_EDITABLE.has(node.type)

  useEffect(() => {
    if (!editing || !editableRef.current) return
    const el = editableRef.current
    el.focus()
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editing])

  const startEditing = () => {
    if (!isTextEditable) return
    draftRef.current = node.props.text ?? ''
    setEditing(true)
  }

  const commitEdit = () => {
    if (!editing) return
    const text = editableRef.current?.innerText ?? ''
    updateNodeProps(node.id, { text })
    setEditing(false)
  }

  const cancelEdit = () => {
    if (!editing) return
    if (editableRef.current) editableRef.current.innerText = draftRef.current
    setEditing(false)
  }

  /**
   * 预览模式下的点击处理：根据 node.interaction.onClick 触发对应动作。
   * navigate: 新窗口或当前窗口打开 URL
   * scroll-to: 滚动画布容器到目标节点位置（画布坐标 → 屏幕坐标）
   * toggle/show/hide: 设置 previewDisplayOverrides 中的 display 值
   * submit-form: 提示提交成功（与导出运行时一致）
   */
  const handlePreviewClick = (e: React.MouseEvent) => {
    if (!previewMode) return
    const cfg = node.interaction?.onClick
    if (!cfg || cfg.action === 'none') return
    // 阻止事件冒泡，避免触发外层画布点击清空选中（虽然选中已清，但避免其它副作用）
    e.stopPropagation()
    e.preventDefault()
    switch (cfg.action) {
      case 'navigate':
        if (cfg.url) {
          if (cfg.newTab) {
            window.open(cfg.url, '_blank', 'noopener,noreferrer')
          } else {
            window.location.href = cfg.url
          }
        }
        break
      case 'scroll-to':
        if (cfg.targetId) {
          // 在 store 节点中查找目标
          const target = findById(nodes, cfg.targetId)
          if (target && elRef.current) {
            // 通过 [data-node-id] 找到目标 DOM 元素
            const canvasRoot = elRef.current.closest('.pf-canvas') || document.querySelector('[data-pf-canvas-root]')
            const targetEl = (canvasRoot || document).querySelector(`[data-node-id="${cfg.targetId}"]`) as HTMLElement | null
            const scrollContainer = (elRef.current.closest('.overflow-auto') as HTMLElement | null) ||
              document.querySelector('.pf-canvas-scroll') ||
              null
            if (targetEl && scrollContainer) {
              // 计算目标在画布坐标中的位置，转换为滚动容器内的偏移
              const zoom = useEditorStore.getState().zoom
              const ty = (target.style.y ?? 0)
              const tx = (target.style.x ?? 0)
              // 画布偏移 24px（画布 top/left）
              const targetTop = (ty + 24) * zoom - 16
              const targetLeft = (tx + 24) * zoom - 16
              scrollContainer.scrollTo({ top: targetTop, left: targetLeft, behavior: 'smooth' })
            } else if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }
        }
        break
      case 'show':
        if (cfg.targetId) setPreviewDisplay(cfg.targetId, '')
        break
      case 'hide':
        if (cfg.targetId) setPreviewDisplay(cfg.targetId, 'none')
        break
      case 'toggle':
        if (cfg.targetId) {
          const cur = useEditorStore.getState().previewDisplayOverrides[cfg.targetId]
          setPreviewDisplay(cfg.targetId, cur === 'none' ? '' : 'none')
        }
        break
      case 'submit-form':
        // 与导出运行时一致：提示提交成功
        const msg = document.createElement('div')
        msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15)'
        msg.textContent = '\u2714 提交成功！'
        document.body.appendChild(msg)
        setTimeout(() => { msg.remove() }, 3000)
        break
    }
  }

  // 预览模式：进入预览时触发入场动画（仅 load 类型）
  useEffect(() => {
    if (!previewMode) return
    const anim = node.interaction?.animation
    if (!anim || anim.type === 'none' || anim.trigger !== 'load') return
    const el = elRef.current
    if (!el) return
    // 与导出运行时一致：加 pf-animate-* 类，animationend 后清除 transform
    const cls = `pf-animate-${anim.type}`
    if (anim.delay > 0) {
      const t = setTimeout(() => {
        el.classList.add(cls)
        const onEnd = () => {
          el.style.transform = 'none'
          el.removeEventListener('animationend', onEnd)
        }
        el.addEventListener('animationend', onEnd)
      }, anim.delay)
      return () => clearTimeout(t)
    } else {
      el.classList.add(cls)
      const onEnd = () => {
        el.style.transform = 'none'
        el.removeEventListener('animationend', onEnd)
      }
      el.addEventListener('animationend', onEnd)
    }
    // 卸载时清理类名，避免切回编辑模式时残留动画
    return () => {
      el.classList.remove(cls)
    }
  }, [previewMode, node.interaction?.animation])

  // 预览模式：在 DOM 上挂载时给节点加 data-pf-* 属性，与导出运行时使用相同标记
  // 这样在编辑器中点击节点时，链接的 <a> 包裹等行为与导出 HTML 一致
  useEffect(() => {
    if (!previewMode) return
    const el = elRef.current
    if (!el) return
    if (node.interaction?.onClick && node.interaction.onClick.action !== 'none') {
      el.style.cursor = 'pointer'
    } else if (node.interaction?.link?.href) {
      el.style.cursor = 'pointer'
    }
  }, [previewMode, node.interaction?.onClick, node.interaction?.link?.href])

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, aff: ResizeStart['aff']) => {
    e.stopPropagation()
    e.preventDefault()
    const el = elRef.current
    if (!el) return
    const zoom = useEditorStore.getState().zoom
    const rect = el.getBoundingClientRect()
    // rect.width/height 是屏幕像素，需要除以 zoom 转为画布空间坐标
    // 否则在非 100% 缩放时，resize 初始尺寸会突变（例如 zoom=0.5 时直接缩一半）
    const canvasW = rect.width / zoom
    const canvasH = rect.height / zoom
    const start: ResizeStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      w: canvasW,
      h: canvasH,
      x: node.style.x ?? 0,
      y: node.style.y ?? 0,
      aff,
      zoom,
    }
    startRef.current = start
    const initial = { w: canvasW, h: canvasH, x: start.x, y: start.y }
    liveRef.current = initial
    setResize(initial)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = startRef.current
    if (!s) return
    // 屏幕空间的 dx/dy 需要除以 zoom 得到画布空间
    const dx = (e.clientX - s.clientX) / s.zoom
    const dy = (e.clientY - s.clientY) / s.zoom
    let newW = s.w + s.aff.w * dx
    let newH = s.h + s.aff.h * dy
    let newX = s.x
    let newY = s.y
    if (s.aff.x) newX = s.x + dx
    if (s.aff.y) newY = s.y + dy
    if (newW < MIN_SIZE) {
      if (s.aff.x) newX = s.x + (s.w - MIN_SIZE)
      newW = MIN_SIZE
    }
    if (newH < MIN_SIZE) {
      if (s.aff.y) newY = s.y + (s.h - MIN_SIZE)
      newH = MIN_SIZE
    }
    const next = { w: newW, h: newH, x: newX, y: newY }
    liveRef.current = next
    setResize(next)
  }

  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = liveRef.current
    if (r) {
      updateNodeStyle(node.id, { width: `${r.w}px`, height: `${r.h}px`, x: r.x, y: r.y })
    }
    startRef.current = null
    liveRef.current = null
    setResize(null)
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  // 容器作为放置目标时高亮（绿色虚线），帮助用户识别可放入区域
  const isContainerOver = node.type === 'container' && droppable.isOver

  // 根节点用 absolute 定位；容器内子元素用流式布局，参与父级的 flex/grid
  // 子元素的 width:1200px 与父容器等宽会让 flex/wrap 全堆成一行；这里把 width 强制 auto
  // 让 flex 容器能按内容尺寸并排显示子元素
  // 预览模式：禁用拖拽/选中样式（cursor/outline/zIndex 还原为普通元素）；
  // 应用 previewDisplayOverrides 中的 display 状态覆盖节点原 display；
  // 强制清除 dnd-kit 的 transform，避免拖拽过程产生的位移残留在预览中显示。
  const baseStyle: CSSProperties = {
    transform: previewMode
      ? 'none'
      : draggable.isDragging
        ? undefined
        : CSS.Transform.toString(draggable.transform),
    opacity: draggable.isDragging ? 0.3 : node.visible === false ? 0.25 : 1,
    cursor: previewMode
      ? (node.interaction?.onClick && node.interaction.onClick.action !== 'none') || node.interaction?.link?.href
        ? 'pointer'
        : 'default'
      : editing
        ? 'text'
        : 'move',
    minWidth: 1,
    overflow: 'visible',
    outline: previewMode
      ? 'none'
      : isContainerOver
        ? '2px dashed #10b981'
        : isMultiSelected
          ? '2px solid #a5b4fc'
          : isPrimary
            ? '2px dashed #6366f1'
            : '2px dashed transparent',
    outlineOffset: 0,
    zIndex: draggable.isDragging ? 100 : isMultiSelected ? 10 : isPrimary ? 11 : 1,
    ...nodeToCss(node.style),
    ...(previewDisplayOverride !== undefined ? { display: previewDisplayOverride } : {}),
    ...(resize ? { width: `${resize.w}px`, height: `${resize.h}px` } : {}),
    // 悬停效果预览
    ...getHoverStyle(hoverConfig, isHovered),
  }

  // 根节点用 absolute 定位；
  // 若节点自身 style 中有 position: absolute/fixed（由 importHtml 传入），也使用 absolute 定位，
  // 利用 style.x/y 作为 left/top 精确布局；否则用 relative 参与父级 flex/flow。
  const declaredPosition = (node.style.position as string) || ''
  const isAbsPos = isRoot || declaredPosition === 'absolute' || declaredPosition === 'fixed'

  const style: CSSProperties = isAbsPos
    ? {
        ...baseStyle,
        position: 'absolute',
        left: resize ? resize.x : (node.style.x ?? 0),
        top: resize ? resize.y : (node.style.y ?? 0),
      }
    : {
        ...baseStyle,
        position: 'absolute',
        left: resize ? resize.x : (node.style.x ?? 0),
        top: resize ? resize.y : (node.style.y ?? 0),
        // resize 期间跳过 fit-content，让 baseStyle 中的 resize 宽高生效
        ...(resize ? {} : (node.style.width === undefined || node.style.width === '' ? { width: 'fit-content', maxWidth: '100%' } : {})),
      }

  const showHandles = isSelected && !editing && !draggable.isDragging && !previewMode

  return (
    <div
      ref={setRefs}
      data-node-id={node.id}
      data-render-debug={node.type + '#' + node.id.slice(-4)}
      style={style}
      onPointerDown={(e) => {
        // 预览模式：禁用选中/拖拽
        if (previewMode) return
        e.stopPropagation()
        if (e.shiftKey) {
          toggleSelection(node.id)
        } else {
          // 如果不在多选集合中，正常单选
          if (!selectedIds.includes(node.id)) {
            selectNode(node.id)
          }
        }
        if (!editing) onPointerDownFromListener?.(e)
      }}
      onDoubleClick={(e) => {
        if (previewMode) return
        e.stopPropagation()
        startEditing()
      }}
      onClick={handlePreviewClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...(previewMode ? {} : draggable.attributes)}
    >
      {/* 交互标记徽章：编辑模式下显示，预览模式隐藏（避免遮挡预览效果） */}
      {hasInteraction && !editing && !previewMode && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 30,
            transform: 'translate(25%, -25%)',
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: node.interaction?.link ? '#6366f1' : '#f59e0b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#fff',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
          title={node.interaction?.link ? '有链接' : '有点击动作'}
        >
          {node.interaction?.link ? '🔗' : '🖱️'}
        </div>
      )}
      {editing ? (
        <>
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            style={{
              outline: 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              ...(node.type === 'card' ? { fontWeight: 600, fontSize: node.props.titleFontSize || '18px', color: node.props.titleColor || 'inherit', marginBottom: 8 } : {}),
            }}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelEdit()
              }
            }}
          >
            {node.props.text ?? ''}
          </div>
          {node.type === 'card' && (
            <div style={{ fontSize: node.props.subtitleFontSize || 14, color: node.props.subtitleColor || '#6b7280', lineHeight: 1.6 }}>
              {node.props.subtitle}
            </div>
          )}
        </>
      ) : node.type === 'container' ? (
        node.children.length ? (
          node.children.map((c) => (
            <CanvasElement
              key={c.id}
              node={c}
            />
          ))
        ) : (
          <div style={{ color: '#9ca3af', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: 60 }}>容器（拖入子元素）</div>
        )
      ) : (
        renderNodeContent(node)
      )}
      {showHandles &&
        HANDLES.map((h) => (
          <div
            key={h.dir}
            onPointerDown={(e) => onHandlePointerDown(e, h.aff)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              backgroundColor: '#ffffff',
              border: '1.5px solid #6366f1',
              borderRadius: 2,
              cursor: h.cursor,
              zIndex: 20,
              ...h.pos,
            }}
          />
        ))}
    </div>
  )
})

/** 根据悬停配置计算 hover 时的 CSS 样式 */
function getHoverStyle(
  config: HoverEffectConfig | undefined,
  isHovered: boolean,
): CSSProperties {
  if (!config || config.effect === 'none' || !isHovered) return {}
  const duration = config.duration ?? 200
  const transition = `all ${duration}ms ease`
  switch (config.effect) {
    case 'scale':
      return { transform: `scale(${config.scale ?? 1.05})`, transition }
    case 'shadow': {
      const shadows = {
        light: '0 4px 12px rgba(0,0,0,0.1)',
        medium: '0 8px 24px rgba(0,0,0,0.15)',
        heavy: '0 12px 32px rgba(0,0,0,0.2)',
      }
      return { boxShadow: shadows[config.shadowIntensity ?? 'medium'], transition }
    }
    case 'color-shift':
      return { backgroundColor: config.hoverColor ?? '#e0e7ff', transition }
    case 'glow':
      return { boxShadow: '0 0 16px rgba(99,102,241,0.4)', transition }
    default:
      return {}
  }
}
