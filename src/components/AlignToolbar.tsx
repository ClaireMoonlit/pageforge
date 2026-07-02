import { useEditorStore } from '@/store/editorStore'

const btnCls =
  'w-8 h-8 flex items-center justify-center rounded text-sm bg-ink-700 hover:bg-ink-600 text-gray-200 transition-colors'

export function AlignToolbar() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const alignNodes = useEditorStore((s) => s.alignNodes)
  const distributeNodes = useEditorStore((s) => s.distributeNodes)

  if (selectedIds.length < 2) return null

  return (
    <div className="shrink-0 flex items-center gap-1 px-2 py-1 bg-ink-800 border border-ink-600 rounded-lg shadow-lg">
      <span className="text-xs text-gray-500 mr-1">{selectedIds.length} 个</span>
      <div className="w-px h-4 bg-ink-600" />
      <button
        onClick={() => alignNodes('left')}
        className={btnCls}
        title="左对齐"
      >
        ‖◀
      </button>
      <button
        onClick={() => alignNodes('centerH')}
        className={btnCls}
        title="水平居中"
      >
        ‖▶
      </button>
      <button
        onClick={() => alignNodes('right')}
        className={btnCls}
        title="右对齐"
      >
        ▶‖
      </button>
      <div className="w-px h-4 bg-ink-600" />
      <button
        onClick={() => alignNodes('top')}
        className={btnCls}
        title="上对齐"
      >
        ═▲
      </button>
      <button
        onClick={() => alignNodes('centerV')}
        className={btnCls}
        title="垂直居中"
      >
        ═▼
      </button>
      <button
        onClick={() => alignNodes('bottom')}
        className={btnCls}
        title="下对齐"
      >
        ▼═
      </button>
      <div className="w-px h-4 bg-ink-600" />
      <button
        onClick={() => distributeNodes('horizontal')}
        className={btnCls}
        title="水平分布"
        disabled={selectedIds.length < 3}
      >
        ↔
      </button>
      <button
        onClick={() => distributeNodes('vertical')}
        className={btnCls}
        title="垂直分布"
        disabled={selectedIds.length < 3}
      >
        ↕
      </button>
    </div>
  )
}