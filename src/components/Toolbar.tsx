import { useHistory, useEditorStore, findById } from '@/store/editorStore'
import { downloadHtml } from '@/utils/exportHtml'
import { exportAsPNG, exportAsPDF, getCanvasContentElement } from '@/utils/exportImage'
import { TemplatePanel } from '@/components/TemplatePanel'
import { AlignToolbar } from '@/components/AlignToolbar'
import { unifiedAsyncPaste } from '@/components/Canvas'
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  IconUndo, IconRedo, IconTrash, IconBrush,
  IconCopy, IconPaste, IconDuplicate, IconDownload, IconEye,
} from '@/components/Icons'

const btnCls =
  'shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-sm bg-ink-700 hover:bg-ink-600 text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
const primaryBtnCls =
  'shrink-0 whitespace-nowrap px-3 py-1.5 rounded text-sm bg-brand-500 hover:bg-brand-400 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

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
  const previewMode = useEditorStore((s) => s.previewMode)
  const togglePreviewMode = useEditorStore((s) => s.togglePreviewMode)
  /** 精修模式会话：非 null 时工具栏禁用自由画布相关操作（撤销/重做/删除/格式刷等） */
  const refineSession = useEditorStore((s) => s.refineSession)
  const exitRefine = useEditorStore((s) => s.exitRefine)
  const nodeCount = nodes.length

  const [exporting, setExporting] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportBtnRef = useRef<HTMLButtonElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  // 下拉菜单位置（fixed 定位，基于按钮的视口坐标）
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!showExportMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node) &&
        exportBtnRef.current &&
        !exportBtnRef.current.contains(e.target as Node)
      ) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  // 打开下拉时，根据按钮位置计算 fixed 坐标
  useLayoutEffect(() => {
    if (!showExportMenu) {
      setMenuPos(null)
      return
    }
    const updatePos = () => {
      const btn = exportBtnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      // top: 按钮底部 + 4px；right: 视口右侧到按钮右边的距离
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showExportMenu])

  const handleExportHTML = () => {
    setShowExportMenu(false)
    downloadHtml(nodes, canvas)
  }

  const handleExportPNG = async () => {
    setShowExportMenu(false)
    const el = getCanvasContentElement()
    if (!el) return
    setExporting('png')
    try {
      await exportAsPNG(el, 'pageforge-export.png', {
        backgroundColor: canvas.backgroundColor,
      })
    } catch (err) {
      console.error('PNG export failed:', err)
      setTimeout(() => alert('PNG 导出失败，请重试'), 0)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = async () => {
    setShowExportMenu(false)
    const el = getCanvasContentElement()
    if (!el) return
    setExporting('pdf')
    try {
      await exportAsPDF(el, 'pageforge-export.pdf', {
        backgroundColor: canvas.backgroundColor,
      })
    } catch (err) {
      console.error('PDF export failed:', err)
      setTimeout(() => alert('PDF 导出失败，请重试'), 0)
    } finally {
      setExporting(null)
    }
  }

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
    <div className="h-12 shrink-0 bg-ink-900 border-b border-ink-700 flex items-center px-4 gap-2 overflow-x-auto relative z-10">
      <div className="flex items-center gap-2 mr-4">
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-pink-500" />
        <span className="text-gray-100 font-semibold">造页工坊</span>
        <span className="text-gray-500 text-xs hidden sm:inline">PageForge</span>
      </div>
      {/* 精修模式横幅：精修模式下禁用自由画布相关操作，提示用户当前模式 */}
      {refineSession && (
        <div
          data-testid="refine-mode-banner"
          className="flex items-center gap-2 px-3 py-1 bg-purple-900/40 border border-purple-700/50 rounded-md"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-purple-300"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span className="text-purple-200 text-xs font-medium">精修模式</span>
          <span className="text-purple-400 text-xs hidden md:inline">·  点击页面元素即可在右侧编辑</span>
          <button
            onClick={exitRefine}
            className="ml-1 px-2 py-0.5 rounded text-xs text-purple-200 hover:text-white hover:bg-purple-700/50 transition-colors"
            title="退出精修模式"
          >
            退出
          </button>
        </div>
      )}
      <button onClick={() => undo()} disabled={previewMode || !!refineSession || !canUndo} className={btnCls} title="撤销 (Ctrl+Z)">
        <span className="inline-flex items-center gap-1.5"><IconUndo size={16} /> 撤销</span>
      </button>
      <button onClick={() => redo()} disabled={previewMode || !!refineSession || !canRedo} className={btnCls} title="重做 (Ctrl+Shift+Z)">
        <span className="inline-flex items-center gap-1.5"><IconRedo size={16} /> 重做</span>
      </button>
      <button
        onClick={() => selectedId && removeNode(selectedId)}
        disabled={previewMode || !!refineSession || !selectedId}
        className={btnCls}
        title="删除 (Delete)"
      >
        <span className="inline-flex items-center gap-1.5"><IconTrash size={16} /> 删除</span>
      </button>
      <button
        onClick={handleFormatBrush}
        disabled={previewMode || !!refineSession || (!selectedId && !formatBrushStyle)}
        className={formatBrushStyle && !previewMode ? primaryBtnCls : btnCls}
        title="格式刷：先选中源元素点击激活，再点击目标元素应用样式"
      >
        <span className="inline-flex items-center gap-1.5"><IconBrush size={16} /> 格式刷</span>
      </button>
      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />
      <button
        onClick={() => selectedId && copyNode(selectedId)}
        disabled={previewMode || !!refineSession || !selectedId}
        className={btnCls}
        title="复制 (Ctrl+C)"
      >
        <span className="inline-flex items-center gap-1.5"><IconCopy size={16} /> 复制</span>
      </button>
      <button
        onClick={async () => {
          // 使用画布中心作为默认粘贴位置
          const cw = parseInt(canvas.width) || 1200
          const ch = parseInt(canvas.height) || 800
          await unifiedAsyncPaste({ x: Math.round(cw / 2), y: Math.round(ch / 2) })
        }}
        disabled={previewMode || !!refineSession}
        className={btnCls}
        title="粘贴 (Ctrl+V)"
      >
        <span className="inline-flex items-center gap-1.5"><IconPaste size={16} /> 粘贴</span>
      </button>
      <button
        onClick={() => selectedId && duplicateNode(selectedId)}
        disabled={previewMode || !!refineSession || !selectedId}
        className={btnCls}
        title="重复 (Ctrl+D)"
      >
        <span className="inline-flex items-center gap-1.5"><IconDuplicate size={16} /> 重复</span>
      </button>
      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />
      <button onClick={clearCanvas} disabled={previewMode || !!refineSession} className={btnCls}>清空</button>
      {!refineSession && <AlignToolbar />}
      {!previewMode && <TemplatePanel key={nodes.length} />}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-gray-500 text-xs">
          {refineSession ? '精修模式（iframe 渲染）' : `${nodeCount} 个元素`}
        </span>
        <button
          onClick={togglePreviewMode}
          disabled={!!refineSession || exporting !== null}
          className={previewMode && exporting === null ? primaryBtnCls : btnCls}
          title={previewMode ? '退出预览' : '预览交互（点击/悬停/动画/链接）'}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconEye size={16} /> {previewMode ? '退出预览' : '预览'}
          </span>
        </button>
        {/* 导出下拉菜单：按钮 */}
        <button
          ref={exportBtnRef}
          onClick={() => setShowExportMenu((v) => !v)}
          disabled={!!refineSession || nodeCount === 0 || exporting !== null || previewMode}
          className={primaryBtnCls}
          title={refineSession ? '精修模式下使用「复制 HTML」按钮导出' : '导出'}
        >
          <span className="inline-flex items-center gap-1.5">
            {exporting ? (
              <>导出中...</>
            ) : (
              <><IconDownload size={16} /> 导出</>
            )}
          </span>
        </button>
      </div>
      {/* 下拉菜单：用 Portal 渲染到 body，避免被 Toolbar overflow 裁剪 */}
      {showExportMenu && menuPos &&
        createPortal(
          <div
            ref={exportMenuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              width: 160,
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: 6,
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              zIndex: 99999,
              padding: 4,
            }}
          >
            <button
              onClick={handleExportHTML}
              disabled={exporting !== null}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded"
              style={{ background: 'transparent' }}
            >
              <IconDownload size={14} /> HTML 文件
            </button>
            <button
              onClick={handleExportPNG}
              disabled={exporting !== null}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded"
              style={{ background: 'transparent' }}
            >
              <IconDownload size={14} /> PNG 图片
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting !== null}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded"
              style={{ background: 'transparent' }}
            >
              <IconDownload size={14} /> PDF 文档
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
