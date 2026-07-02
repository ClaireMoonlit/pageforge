import { useHistory, useEditorStore, findById, getClipboard } from '@/store/editorStore'
import { downloadHtml } from '@/utils/exportHtml'
import { TemplatePanel } from '@/components/TemplatePanel'
import { AlignToolbar } from '@/components/AlignToolbar'
import {
  IconUndo, IconRedo, IconTrash, IconBrush,
  IconCopy, IconPaste, IconDuplicate, IconDownload, IconEye,
} from '@/components/Icons'

const btnCls =
  'shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-sm bg-ink-700 hover:bg-ink-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
const primaryBtnCls =
  'shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-sm bg-brand-500 hover:bg-brand-400 text-white transition-colors'

export function Toolbar() {
  const { undo, redo, canUndo, canRedo } = useHistory()
  const clearCanvas = useEditorStore((s) => s.clearCanvas)
  const removeNode = useEditorStore((s) => s.removeNode)
  const selectedId = useEditorStore((s) => s.selectedId)
  const nodes = useEditorStore((s) => s.nodes)
  const canvas = useEditorStore((s) => s.canvas)
  const formatBrushStyle = useEditorStore((s) => s.formatBrushStyle)
  const setFormatBrush = useEditorStore((s) => s.setFormatBrush)
  const copyNode = useEditorStore((s) => s.copyNode)
  const duplicateNode = useEditorStore((s) => s.duplicateNode)
  const pasteNode = useEditorStore((s) => s.pasteNode)
  const previewMode = useEditorStore((s) => s.previewMode)
  const togglePreviewMode = useEditorStore((s) => s.togglePreviewMode)
  const nodeCount = nodes.length

  const handleFormatBrush = () => {
    if (formatBrushStyle) {
      // 取消格式刷
      setFormatBrush(null)
    } else if (selectedId) {
      // 激活格式刷：存储当前选中节点的样式
      const node = findById(nodes, selectedId)
      if (node) setFormatBrush(node.style)
    }
  }

  return (
    <div className="h-12 shrink-0 bg-ink-900 border-b border-ink-700 flex items-center px-4 gap-2 overflow-x-auto">
      <div className="flex items-center gap-2 mr-4">
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-pink-500" />
        <span className="text-gray-100 font-semibold">造页工坊</span>
        <span className="text-gray-500 text-xs hidden sm:inline">PageForge</span>
      </div>
      <button onClick={() => undo()} disabled={!canUndo} className={btnCls} title="撤销 (Ctrl+Z)">
        <span className="inline-flex items-center gap-1.5"><IconUndo size={16} /> 撤销</span>
      </button>
      <button onClick={() => redo()} disabled={!canRedo} className={btnCls} title="重做 (Ctrl+Shift+Z)">
        <span className="inline-flex items-center gap-1.5"><IconRedo size={16} /> 重做</span>
      </button>
      <button
        onClick={() => selectedId && removeNode(selectedId)}
        disabled={!selectedId}
        className={btnCls}
        title="删除 (Delete)"
      >
        <span className="inline-flex items-center gap-1.5"><IconTrash size={16} /> 删除</span>
      </button>
      <button
        onClick={handleFormatBrush}
        disabled={!selectedId && !formatBrushStyle}
        className={formatBrushStyle ? primaryBtnCls : btnCls}
        title="格式刷：先选中源元素点击激活，再点击目标元素应用样式"
      >
        <span className="inline-flex items-center gap-1.5"><IconBrush size={16} /> 格式刷</span>
      </button>
      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />
      <button
        onClick={() => selectedId && copyNode(selectedId)}
        disabled={!selectedId}
        className={btnCls}
        title="复制 (Ctrl+C)"
      >
        <span className="inline-flex items-center gap-1.5"><IconCopy size={16} /> 复制</span>
      </button>
      <button
        onClick={() => pasteNode()}
        disabled={!getClipboard()}
        className={btnCls}
        title="粘贴 (Ctrl+V)"
      >
        <span className="inline-flex items-center gap-1.5"><IconPaste size={16} /> 粘贴</span>
      </button>
      <button
        onClick={() => selectedId && duplicateNode(selectedId)}
        disabled={!selectedId}
        className={btnCls}
        title="重复 (Ctrl+D)"
      >
        <span className="inline-flex items-center gap-1.5"><IconDuplicate size={16} /> 重复</span>
      </button>
      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />
      <button onClick={clearCanvas} className={btnCls}>清空</button>
      <AlignToolbar />
      <TemplatePanel key={nodes.length} />
      <div className="ml-auto flex items-center gap-3">
        <span className="text-gray-500 text-xs">{nodeCount} 个元素</span>
        <button
          onClick={togglePreviewMode}
          className={previewMode ? primaryBtnCls : btnCls}
          title={previewMode ? '退出预览' : '预览交互（点击/悬停/动画/链接）'}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconEye size={16} /> {previewMode ? '退出预览' : '预览'}
          </span>
        </button>
        <button
          onClick={() => downloadHtml(nodes, canvas)}
          disabled={nodeCount === 0}
          className={primaryBtnCls}
        >
          <span className="inline-flex items-center gap-1.5"><IconDownload size={16} /> 导出 HTML</span>
        </button>
      </div>
    </div>
  )
}
