import { useState, useCallback, useMemo, type DragEvent } from 'react'
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
  /** 在根数组中的索引（用于倒序显示） */
  rootIndex: number
}

/** 将嵌套树扁平化为列表，跳过折叠的子树。
 *  返回顺序：后画的（数组末尾）排在前面 → 第一个节点在 LayerTree 顶部 */
function flattenTree(
  nodes: CanvasNode[],
  depth: number,
  parentId: string | null,
  collapsed: Set<string>,
): FlatItem[] {
  const result: FlatItem[] = []
  // 倒序遍历：后画的（数组靠后）放在最上（符合"后画在最上"的视觉直觉）
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    result.push({ node, depth, parentId, index: i, rootIndex: i })
    if (node.children.length > 0 && !collapsed.has(node.id)) {
      // 子节点也要倒序：reverse 父级之前的子节点顺序
      const children = flattenTree(node.children, depth + 1, node.id, collapsed)
      result.push(...children)
    }
  }
  return result
}

export function LayerTree() {
  const nodes = useEditorStore((s) => s.nodes)
  const selectNode = useEditorStore((s) => s.selectNode)
  const selectedId = useEditorStore((s) => s.selectedId)
  const reparentNode = useEditorStore((s) => s.reparentNode)
  const moveLayer = useEditorStore((s) => s.moveLayer)
  const toggleVisible = useEditorStore((s) => s.toggleVisible)
  const removeNode = useEditorStore((s) => s.removeNode)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 拖拽状态
  const [dragId, setDragId] = useState<string | null>(null)
  const [overInfo, setOverInfo] = useState<{ id: string; position: 'before' | 'after' | 'inside' } | null>(null)

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 扁平化节点列表（用于拖拽排序 + 渲染）
  const flatItems = useMemo(
    () => flattenTree(nodes, 0, null, collapsed),
    [nodes, collapsed],
  )

  /** 判断 overItem 是否是 dragItem 的子孙（不能拖入自己的子孙，防环） */
  const isDescendant = (ancestorId: string, candidateId: string): boolean => {
    const ancestor = findNode(nodes, ancestorId)
    if (!ancestor) return false
    const walk = (n: CanvasNode): boolean => {
      if (n.id === candidateId) return true
      return n.children.some(walk)
    }
    return walk(ancestor)
  }

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragId || dragId === id) return

    const rect = e.currentTarget.getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const ratio = offsetY / rect.height
    // 上 1/4 → before；下 1/4 → after；中间 → inside（拖入容器）
    let position: 'before' | 'after' | 'inside'
    if (ratio < 0.25) position = 'before'
    else if (ratio > 0.75) position = 'after'
    else position = 'inside'
    setOverInfo({ id, position })
  }, [dragId])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // 仅当真正离开图层树时清除
    const rt = e.relatedTarget as HTMLElement | null
    if (!rt || !rt.closest('[data-layer-id]')) {
      // 不清除，保持指示线稳定
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, overId: string) => {
    e.preventDefault()
    const activeId = e.dataTransfer.getData('text/plain') || dragId
    setDragId(null)
    setOverInfo(null)
    if (!activeId || activeId === overId) return
    if (isDescendant(activeId, overId)) return // 防环

    const overItem = flatItems.find((f) => f.node.id === overId)
    if (!overItem) return
    const position = overInfo?.id === overId ? overInfo.position : 'before'

    let targetParentId = overItem.parentId
    let targetIndex: number
    if (position === 'inside') {
      // 拖入容器（仅当目标是容器）：放到容器子节点数组最前（最上层）
      if (overItem.node.type !== 'container') return
      targetParentId = overItem.node.id
      targetIndex = 0
    } else if (position === 'after') {
      // 视觉"上方" = 更高 zIndex = 数组中 overItem 之后
      // （图层树倒序渲染，数组中靠后 = 视觉上靠上）
      targetIndex = overItem.index + 1
    } else {
      // 视觉"下方" = 更低 zIndex = 数组中 overItem 之前
      targetIndex = overItem.index
    }

    reparentNode(activeId, targetParentId, targetIndex)
  }, [dragId, flatItems, overInfo, reparentNode])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setOverInfo(null)
  }, [])

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-gray-600 leading-relaxed">
        画布上还没有元素，从上方组件库拖入即可。
      </div>
    )
  }

  return (
    <div className="pb-2">
      {flatItems.map((item) => {
        const { node, depth } = item
        const isSelected = node.id === selectedId
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsed.has(node.id)
        const isHidden = node.visible === false
        const label = node.props.text || TYPE_LABEL[node.type]
        const hasCustomIcon = !!(node.type === 'icon' && node.props.icon)
        const isDragging = node.id === dragId
        const isOver = overInfo?.id === node.id ? overInfo : null

        return (
          <div key={node.id} className="relative">
            {/* after 指示线：图二风格，蓝色虚线在节点底部 */}
            {isOver?.position === 'after' && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-brand-400 z-10 pointer-events-none"
                style={{ top: -1, marginLeft: `${8 + depth * 14}px` }}
              />
            )}
            <LayerItem
              node={node}
              depth={depth}
              isSelected={isSelected}
              isDragging={isDragging}
              isHidden={isHidden}
              hasChildren={hasChildren}
              isCollapsed={isCollapsed}
              label={label}
              hasCustomIcon={hasCustomIcon}
              onSelect={() => selectNode(node.id)}
              onToggleCollapse={() => toggleCollapse(node.id)}
              onMoveUp={() => moveLayer(node.id, 'up')}
              onMoveDown={() => moveLayer(node.id, 'down')}
              onToggleVisible={() => toggleVisible(node.id)}
              onRemove={() => removeNode(node.id)}
              onDragStart={(e) => handleDragStart(e, node.id)}
              onDragOver={(e) => handleDragOver(e, node.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, node.id)}
              onDragEnd={handleDragEnd}
            />
            {/* before 指示线：拖到节点下方（在视觉下移） */}
            {isOver?.position === 'before' && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-brand-400 z-10 pointer-events-none"
                style={{ bottom: -1, marginLeft: `${8 + depth * 14}px` }}
              />
            )}
            {/* inside 指示：边框高亮 */}
            {isOver?.position === 'inside' && (
              <div
                className="absolute inset-0 rounded border-2 border-brand-400 pointer-events-none z-10"
                style={{ marginLeft: `${depth * 14}px` }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 在节点树中按 id 查找节点 */
function findNode(nodes: CanvasNode[], id: string): CanvasNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const c = findNode(n.children, id)
    if (c) return c
  }
  return null
}

/** 单个图层项：可拖拽、可放置 */
function LayerItem({
  node,
  depth,
  isSelected,
  isDragging,
  isHidden,
  hasChildren,
  isCollapsed,
  label,
  hasCustomIcon,
  onSelect,
  onToggleCollapse,
  onMoveUp,
  onMoveDown,
  onToggleVisible,
  onRemove,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  node: CanvasNode
  depth: number
  isSelected: boolean
  isDragging: boolean
  isHidden: boolean
  hasChildren: boolean
  isCollapsed: boolean
  label: string
  hasCustomIcon: boolean
  onSelect: () => void
  onToggleCollapse: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleVisible: () => void
  onRemove: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: (e: DragEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      data-layer-id={node.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`group flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer select-none transition-colors ${
        isDragging ? 'opacity-40' : ''
      } ${isSelected ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-ink-700'}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      {/* 展开/折叠 */}
      {hasChildren ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
          onPointerDown={(e) => e.stopPropagation()}
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
      <div
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMoveUp()
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
            onMoveDown()
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
            onToggleVisible()
          }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-black/20 ${
            isSelected ? 'text-white' : 'text-gray-400'
          }`}
          title={isHidden ? '显示' : '隐藏'}
        >
          {isHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-red-600/80 ${
            isSelected ? 'text-white' : 'text-gray-400'
          }`}
          title="删除"
        >
          <IconX size={12} />
        </button>
      </div>
    </div>
  )
}
