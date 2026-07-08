import { useState, useRef, useCallback, useMemo, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useEditorStore } from '@/store/editorStore'
import type { CanvasNode, ComponentType } from '@/types'
import { Icon, AutoIcon } from './Icon'
import { IconChevronRight, IconChevronDown, IconEye, IconEyeOff, IconX, IconChevronUp } from './Icons'

/** 组件类型 → 中文名（用于图层树显示） */
const TYPE_LABEL: Record<ComponentType, string> = {
  heading: '标题',
  text: '正文',
  image: '图片',
  button: '按钮',
  card: '卡片',
  container: '容器',
  divider: '分隔线',
  icon: '图标',
  video: '视频',
  input: '输入框',
  iframe: '嵌入',
  navbar: '导航栏',
  grid: '网格',
  form: '表单',
}

/** 扁平化后的图层项 */
interface FlatItem {
  node: CanvasNode
  depth: number
  parentId: string | null
  index: number
}

/** 将嵌套树扁平化为列表，跳过折叠的子树 */
function flattenTree(
  nodes: CanvasNode[],
  depth: number,
  parentId: string | null,
  collapsed: Set<string>,
): FlatItem[] {
  const result: FlatItem[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    result.push({ node, depth, parentId, index: i })
    if (node.children.length > 0 && !collapsed.has(node.id)) {
      result.push(...flattenTree(node.children, depth + 1, node.id, collapsed))
    }
  }
  return result
}

export function LayerTree() {
  const nodes = useEditorStore((s) => s.nodes)
  const selectNode = useEditorStore((s) => s.selectNode)
  const selectedId = useEditorStore((s) => s.selectedId)
  const reparentNode = useEditorStore((s) => s.reparentNode)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 拖拽排序状态
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [insertBefore, setInsertBefore] = useState(true)
  const cursorRef = useRef({ x: 0, y: 0 })

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 扁平化节点列表（用于拖拽排序）
  const flatItems = useMemo(
    () => flattenTree(nodes, 0, null, collapsed),
    [nodes, collapsed],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveId(id)
    const ae = event.activatorEvent as PointerEvent
    cursorRef.current = { x: ae.clientX, y: ae.clientY }
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const over = event.over
    if (!over) {
      setOverId(null)
      return
    }
    const targetId = String(over.id)
    setOverId(targetId)

    // 判断光标在目标元素的上半部分还是下半部分
    const targetEl = document.querySelector(`[data-layer-id="${targetId}"]`)
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      setInsertBefore(cursorRef.current.y < midY)
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setOverId(null)

      if (!over) return

      const activeNodeId = String(active.id)
      const overNodeId = String(over.id)
      if (activeNodeId === overNodeId) return

      // 在扁平列表中查找
      const activeIdx = flatItems.findIndex((f) => f.node.id === activeNodeId)
      const overIdx = flatItems.findIndex((f) => f.node.id === overNodeId)
      if (activeIdx < 0 || overIdx < 0) return

      const activeItem = flatItems[activeIdx]
      const overItem = flatItems[overIdx]

      // 计算目标索引（在目标父级中的位置）
      let targetIndex = overItem.index
      if (!insertBefore) targetIndex++

      // 如果同父级且原位置在目标位置之前，需要调整（因为移除后索引会前移）
      if (activeItem.parentId === overItem.parentId && activeItem.index < targetIndex) {
        targetIndex--
      }

      // 如果没变化，跳过
      if (activeItem.parentId === overItem.parentId && activeItem.index === targetIndex) return

      reparentNode(activeNodeId, overItem.parentId, targetIndex)
    },
    [flatItems, insertBefore, reparentNode],
  )

  // 拖拽期间监听指针移动
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (activeId) {
      cursorRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [activeId])

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-gray-600 leading-relaxed">
        画布上还没有元素，从上方组件库拖入即可。
      </div>
    )
  }

  const renderNode = (node: CanvasNode, depth: number): ReactNode => {
    const isSelected = node.id === selectedId
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.id)
    const isHidden = node.visible === false
    const label = node.props.text || TYPE_LABEL[node.type]
    const hasCustomIcon = node.type === 'icon' && node.props.icon
    const isActive = node.id === activeId
    const isOver = node.id === overId

    return (
      <div key={node.id}>
        {/* 拖入指示线（上方） */}
        {isOver && insertBefore && (
          <div
            className="layer-drop-indicator"
            style={{ marginLeft: `${8 + depth * 14}px` }}
          />
        )}
        <LayerItem
          node={node}
          depth={depth}
          isSelected={isSelected}
          isActive={isActive}
          isOver={isOver}
          isHidden={isHidden}
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          label={label}
          hasCustomIcon={!!hasCustomIcon}
          onSelect={() => selectNode(node.id)}
          onToggleCollapse={() => toggleCollapse(node.id)}
        />
        {/* 拖入指示线（下方） */}
        {isOver && !insertBefore && (
          <div
            className="layer-drop-indicator"
            style={{ marginLeft: `${8 + depth * 14}px` }}
          />
        )}
        {/* 子节点 */}
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="pb-2" onPointerMove={handlePointerMove}>
        {nodes.map((n) => renderNode(n, 0))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <DragPreview nodeId={activeId} flatItems={flatItems} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** 拖拽预览 */
function DragPreview({ nodeId, flatItems }: { nodeId: string; flatItems: FlatItem[] }) {
  const item = flatItems.find((f) => f.node.id === nodeId)
  if (!item) return null
  const node = item.node
  const label = node.props.text || TYPE_LABEL[node.type]
  const hasCustomIcon = node.type === 'icon' && node.props.icon
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-brand-600 text-white"
      style={{ paddingLeft: `${8 + item.depth * 14}px`, minWidth: 120 }}
    >
      <span className="w-4" />
      <span className="w-4 h-4 flex items-center justify-center text-brand-200">
        {hasCustomIcon ? (
          <AutoIcon value={node.props.icon!} size={14} />
        ) : (
          <Icon type="svg" value={node.type} size={14} />
        )}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </div>
  )
}

/** 单个图层项：可拖拽、可放置 */
function LayerItem({
  node,
  depth,
  isSelected,
  isActive,
  isOver,
  isHidden,
  hasChildren,
  isCollapsed,
  label,
  hasCustomIcon,
  onSelect,
  onToggleCollapse,
}: {
  node: CanvasNode
  depth: number
  isSelected: boolean
  isActive: boolean
  isOver: boolean
  isHidden: boolean
  hasChildren: boolean
  isCollapsed: boolean
  label: string
  hasCustomIcon: boolean
  onSelect: () => void
  onToggleCollapse: () => void
}) {
  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({
    id: node.id,
    data: { node },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    data: { node },
  })

  // 合并 refs
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el)
      setDropRef(el)
    },
    [setDragRef, setDropRef],
  )

  return (
    <div
      ref={combinedRef}
      data-layer-id={node.id}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`group flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer select-none transition-colors ${
        isActive ? 'opacity-40' : ''
      } ${isOver ? 'ring-1 ring-brand-400' : ''} ${
        isSelected ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-ink-700'
      }`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      {/* 展开/折叠 */}
      {hasChildren ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
          className="w-4 h-4 flex items-center justify-center hover:text-white"
          title={isCollapsed ? '展开' : '折叠'}
        >
          {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
        </button>
      ) : (
        <span className="w-4" />
      )}

      {/* 图标 */}
      <span
        className={`w-4 h-4 flex items-center justify-center ${
          isSelected ? 'text-brand-200' : 'text-brand-300'
        }`}
      >
        {hasCustomIcon ? (
          <AutoIcon value={node.props.icon!} size={14} />
        ) : (
          <Icon type="svg" value={node.type} size={14} />
        )}
      </span>

      {/* 名称 */}
      <span
        className={`flex-1 truncate ${isHidden ? 'line-through opacity-50' : ''}`}
        title={label}
      >
        {label}
      </span>

      {/* ID 后 4 位 */}
      <span
        className={`text-[10px] font-mono opacity-50 ${isSelected ? 'text-white' : 'text-gray-500'}`}
        title={`完整 ID：${node.id}`}
      >
        {node.id}
      </span>

      {/* 操作按钮（hover 显示） */}
      <LayerActions id={node.id} isSelected={isSelected} />
    </div>
  )
}

/** 行操作按钮：上移、下移、显示/隐藏、删除 */
function LayerActions({ id, isSelected }: { id: string; isSelected: boolean }) {
  const moveLayer = useEditorStore((s) => s.moveLayer)
  const toggleVisible = useEditorStore((s) => s.toggleVisible)
  const removeNode = useEditorStore((s) => s.removeNode)
  const visible = useEditorStore((s) => {
    const find = (arr: CanvasNode[]): boolean | undefined => {
      for (const n of arr) {
        if (n.id === id) return n.visible !== false
        const v = find(n.children)
        if (v !== undefined) return v
      }
      return undefined
    }
    return find(s.nodes)
  })

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => {
          e.stopPropagation()
          moveLayer(id, 'up')
        }}
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-black/20 ${
          isSelected ? 'text-white' : 'text-gray-400'
        }`}
        title="上移一层"
      >
        <IconChevronUp size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          moveLayer(id, 'down')
        }}
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-black/20 ${
          isSelected ? 'text-white' : 'text-gray-400'
        }`}
        title="下移一层"
      >
        <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><IconChevronUp size={12} /></span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleVisible(id)
        }}
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-black/20 ${
          isSelected ? 'text-white' : 'text-gray-400'
        }`}
        title={visible === false ? '显示' : '隐藏'}
      >
        {visible === false ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          removeNode(id)
        }}
        className={`w-5 h-5 flex items-center justify-center rounded hover:bg-red-600/80 ${
          isSelected ? 'text-white' : 'text-gray-400'
        }`}
        title="删除"
      >
        <IconX size={12} />
      </button>
    </div>
  )
}