import { useDraggable } from '@dnd-kit/core'
import { componentLib } from '@/data/componentLib'
import { Icon } from './Icon'
import { LayerTree } from './LayerTree'

export function ComponentPanel() {
  return (
    <div className="w-52 shrink-0 bg-ink-800 border-r border-ink-700 overflow-y-auto flex flex-col">
      <div className="p-3 text-xs text-gray-400 uppercase tracking-wider">组件库</div>
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
