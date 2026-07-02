import { useState, type ReactNode } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { CanvasNode, ComponentType } from '@/types'
import { Icon, AutoIcon } from './Icon'
import { IconChevronRight, IconChevronDown, IconEye, IconEyeOff, IconX } from './Icons'

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

export function LayerTree() {
  const nodes = useEditorStore((s) => s.nodes)
  const selectNode = useEditorStore((s) => s.selectNode)
  const selectedId = useEditorStore((s) => s.selectedId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

    return (
      <div key={node.id}>
        <div
          onClick={() => selectNode(node.id)}
          className={`group flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer select-none transition-colors ${
            isSelected
              ? 'bg-brand-600 text-white'
              : 'text-gray-300 hover:bg-ink-700'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          {/* 展开/折叠 */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(node.id)
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
          <span className={`w-4 h-4 flex items-center justify-center ${isSelected ? 'text-brand-200' : 'text-brand-300'}`}>
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

          {/* ID 后 4 位（hover 显示完整 ID） */}
          <span
            className={`text-[10px] font-mono opacity-50 ${isSelected ? 'text-white' : 'text-gray-500'}`}
            title={`完整 ID：${node.id}`}
          >
            {node.id}
          </span>

          {/* 操作按钮（hover 显示） */}
          <LayerActions id={node.id} isSelected={isSelected} />
        </div>

        {/* 子节点 */}
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return <div className="pb-2">{nodes.map((n) => renderNode(n, 0))}</div>
}

/** 行操作按钮：显示/隐藏、删除 */
function LayerActions({ id, isSelected }: { id: string; isSelected: boolean }) {
  const toggleVisible = useEditorStore((s) => s.toggleVisible)
  const removeNode = useEditorStore((s) => s.removeNode)
  // 需要读取当前 visible 状态来决定眼睛图标
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
