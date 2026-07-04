import { useDraggable } from '@dnd-kit/core'
import { componentLib } from '@/data/componentLib'
import { Icon } from './Icon'
import { LayerTree } from './LayerTree'
import { useEditorStore } from '@/store/editorStore'

export function ComponentPanel() {
  const collapsed = useEditorStore((s) => s.leftPanelCollapsed)
  const toggle = useEditorStore((s) => s.toggleLeftPanel)

  // 折叠态：仅显示一个窄条 + 展开按钮（始终可点，避免找不到入口）
  // 展开按钮：右箭头 (>>) → 表示"把面板展开到右侧"
  if (collapsed) {
    return (
      <div className="w-10 shrink-0 bg-ink-800 border-r border-ink-700 flex flex-col items-center pt-3 transition-all duration-200">
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded text-gray-300 hover:text-gray-100 hover:bg-ink-700 transition-colors"
          title="展开组件库"
          aria-label="展开组件库"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div
          className="mt-3 text-[11px] text-gray-500 tracking-wider"
          style={{ writingMode: 'vertical-rl' }}
        >
          组件库
        </div>
      </div>
    )
  }

  // 展开态：左箭头 (<<) → 表示"把面板收起（折叠到左侧）"
  return (
    <div className="w-52 shrink-0 bg-ink-800 border-r border-ink-700 overflow-y-auto flex flex-col transition-all duration-200">
      <div className="p-3 text-xs text-gray-400 uppercase tracking-wider flex items-center justify-between">
        <span>组件库</span>
        <button
          onClick={toggle}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-100 hover:bg-ink-700 transition-colors"
          title="收起组件库"
          aria-label="收起组件库"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
      <div className="px-2 pb-3 space-y-1.5">
        {componentLib.map((def) => (
          <DraggableComponent key={def.type} def={def} />
        ))}
      </div>

      {/* 图层树：展示画布元素层级，支持选中/折叠/显隐/删除 */}
      <div className="border-t border-ink-700 mt-1">
        <div className="p-3 text-xs text-gray-400 uppercase tracking-wider">图层</div>
        <div className="px-1">
          <LayerTree />
        </div>
      </div>
    </div>
  )
}

function DraggableComponent({ def }: { def: typeof componentLib[number] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib_${def.type}`,
    data: { source: 'library', type: def.type },
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md bg-ink-700 hover:bg-ink-600 cursor-grab active:cursor-grabbing text-gray-200 text-sm transition-colors select-none ${
        isDragging ? 'opacity-0' : ''
      }`}
    >
      <span className="w-5 flex items-center justify-center text-brand-200">
        <Icon type={def.icon.type} value={def.icon.value} size={16} />
      </span>
      <span>{def.label}</span>
    </div>
  )
}
