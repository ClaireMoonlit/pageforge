import { useHistory, useEditorStore, findById } from '@/store/editorStore'
import { downloadHtml } from '@/utils/exportHtml'
import { exportAsPNG, exportAsPDF, getCanvasContentElement } from '@/utils/exportImage'
 import { refineUndo } from '@/utils/refineUndo'
import { serializeRefineHtml } from '@/utils/refineSerialization'
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

/** 精修模式：获取 iframe 文档 */
function getRefineDoc(): Document | null {
  const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
  return iframe?.contentDocument ?? null
}

/** 精修模式：通过 eid 查找元素 */
function findRefineElement(eid: string): HTMLElement | null {
  const doc = getRefineDoc()
  if (!doc) return null
  return doc.querySelector(`[data-pf-eid="${eid}"]`) as HTMLElement | null
}

/** 精修模式：给元素分配 eid */
function ensureRefineEid(el: HTMLElement): string {
  let eid = el.getAttribute('data-pf-eid')
  if (!eid) {
    eid = 'e' + Math.random().toString(36).slice(2, 8)
    el.setAttribute('data-pf-eid', eid)
  }
  return eid
}

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
  const refineSession = useEditorStore((s) => s.refineSession)
  const refinePreviewMode = useEditorStore((s) => s.refinePreviewMode)
  const toggleRefinePreviewMode = useEditorStore((s) => s.toggleRefinePreviewMode)
  const selectRefineElement = useEditorStore((s) => s.selectRefineElement)
  const exitRefine = useEditorStore((s) => s.exitRefine)
  const nodeCount = nodes.length

  const [exporting, setExporting] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportBtnRef = useRef<HTMLButtonElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  useLayoutEffect(() => {
    if (!showExportMenu) { setMenuPos(null); return }
    const updatePos = () => {
      const btn = exportBtnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
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

  // ═══════════════════════════════════════
  // 精修模式操作
  // ═══════════════════════════════════════

  const refineSelected = refineSession?.selectedElement
  const refineEid = refineSelected?.attributes['data-pf-eid'] || ''

  /** 精修撤销 */
  const handleRefineUndo = () => {
    refineUndo.undo()
    // 刷新选中状态
    setTimeout(() => {
      const sel = useEditorStore.getState().refineSession?.selectedElement
      if (sel) {
        const el = findRefineElement(sel.attributes['data-pf-eid'] || '')
        if (el) {
          const rect = el.getBoundingClientRect()
          const attrs: Record<string, string> = {}
          for (const a of Array.from(el.attributes)) { if (a.name !== 'style') attrs[a.name] = a.value }
          selectRefineElement({
            tagName: el.tagName.toLowerCase(), textContent: el.textContent ?? '',
            attributes: attrs, inlineStyle: el.style?.cssText ?? '',
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          })
        } else {
          selectRefineElement(null)
        }
      }
    }, 0)
  }

  /** 精修重做 */
  const handleRefineRedo = () => {
    refineUndo.redo()
    setTimeout(() => {
      const sel = useEditorStore.getState().refineSession?.selectedElement
      if (sel) {
        const el = findRefineElement(sel.attributes['data-pf-eid'] || '')
        if (el) {
          const rect = el.getBoundingClientRect()
          const attrs: Record<string, string> = {}
          for (const a of Array.from(el.attributes)) { if (a.name !== 'style') attrs[a.name] = a.value }
          selectRefineElement({
            tagName: el.tagName.toLowerCase(), textContent: el.textContent ?? '',
            attributes: attrs, inlineStyle: el.style?.cssText ?? '',
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          })
        } else {
          selectRefineElement(null)
        }
      }
    }, 0)
  }

  /** 精修删除 */
  const handleRefineDelete = () => {
    if (!refineSelected) return
    const el = findRefineElement(refineEid)
    if (!el) return
    const parent = el.parentElement
    if (!parent) return
    const elClone = el.cloneNode(true) as HTMLElement
    const nextSibling = el.nextSibling
    const parentEid = ensureRefineEid(parent)
    el.remove()
    selectRefineElement(null)
    refineUndo.record({
      label: 'delete',
      execute: () => { const p = findRefineElement(parentEid); if (p) { const t = p.querySelector(`[data-pf-eid="${refineEid}"]`); if (t) t.remove() } },
      rollback: () => {
        const p = findRefineElement(parentEid)
        if (p && nextSibling) p.insertBefore(elClone, nextSibling)
        else if (p) p.appendChild(elClone)
      },
    })
  }

  /** 精修复制（重复） */
  const handleRefineDuplicate = () => {
    if (!refineSelected) return
    const el = findRefineElement(refineEid)
    if (!el) return
    const parent = el.parentElement
    if (!parent) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-pf-eid')
    const newEid = ensureRefineEid(clone)
    const parentEid = ensureRefineEid(parent)
    el.insertAdjacentElement('afterend', clone)
    refineUndo.record({
      label: 'duplicate',
      execute: () => {
        const p = findRefineElement(parentEid)
        const original = p?.querySelector(`[data-pf-eid="${refineEid}"]`)
        if (p && original) {
          const c = original.cloneNode(true) as HTMLElement
          c.removeAttribute('data-pf-eid'); c.setAttribute('data-pf-eid', newEid)
          original.insertAdjacentElement('afterend', c)
        }
      },
      rollback: () => { const c = findRefineElement(newEid); if (c) c.remove() },
    })
    const rect = clone.getBoundingClientRect()
    const attrs: Record<string, string> = {}
    for (const a of Array.from(clone.attributes)) { if (a.name !== 'style') attrs[a.name] = a.value }
    selectRefineElement({
      tagName: clone.tagName.toLowerCase(), textContent: clone.textContent ?? '',
      attributes: attrs, inlineStyle: clone.style?.cssText ?? '',
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    })
  }

  // ═══════════════════════════════════════
  // 导出（自由画布模式 / 精修模式）
  // ═══════════════════════════════════════

  /** 统一导出文件名 —— 两种模式都用 pageforge-export-YYYY-MM-DD-XXXX.ext */
  const buildExportFilename = (ext: 'html' | 'png' | 'pdf'): string => {
    const date = new Date().toISOString().slice(0, 10)
    const rand = Math.random().toString(36).substring(2, 6)
    return `pageforge-export-${date}-${rand}.${ext}`
  }

  const handleExportHTML = () => {
    setShowExportMenu(false)
    if (refineSession) {
      const html = serializeRefineHtml('pf-refine-iframe')
      if (!html) return
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = buildExportFilename('html')
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
    downloadHtml(nodes, canvas, buildExportFilename('html'))
  }

  /** 导出菜单里的"复制 HTML"：精修模式复制页面 HTML 到剪贴板；画布模式复制选中节点 */
  const handleCopyHTML = async () => {
    setShowExportMenu(false)
    try {
      if (refineSession) {
        const html = serializeRefineHtml('pf-refine-iframe')
        if (html) {
          await navigator.clipboard.writeText(html)
          // toast 提示
          setToast('已复制到剪贴板')
          setTimeout(() => setToast(null), 2000)
        }
      } else if (selectedId) {
        useEditorStore.getState().copyNode(selectedId)
        setToast('已复制到剪贴板')
        setTimeout(() => setToast(null), 2000)
      }
    } catch (e) {
      console.error('复制失败：', e)
    }
  }

  const handleExportPNG = async () => {
    setShowExportMenu(false)
    setExporting('png')
    try {
      if (refineSession) {
        // 精修模式：导出 iframe 内容
        const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
        if (!iframe) throw new Error('iframe not found')
        const { default: html2canvas } = await import('html2canvas')
        const body = iframe.contentDocument?.body
        if (!body) throw new Error('body not found')
        const dataUrl = await html2canvas(body, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          allowTaint: true,
        })
        const link = document.createElement('a')
        link.download = buildExportFilename('png')
        link.href = dataUrl.toDataURL('image/png')
        link.click()
      } else {
        const el = getCanvasContentElement()
        if (!el) throw new Error('no canvas element')
        await exportAsPNG(el, buildExportFilename('png'), { backgroundColor: canvas.backgroundColor })
      }
    } catch (err) {
      console.error('PNG export failed:', err)
      setTimeout(() => alert('PNG 导出失败，请重试'), 0)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = async () => {
    setShowExportMenu(false)
    setExporting('pdf')
    try {
      if (refineSession) {
        const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
        if (!iframe) throw new Error('iframe not found')
        const { default: html2canvas } = await import('html2canvas')
        const { jsPDF } = await import('jspdf')
        const body = iframe.contentDocument?.body
        if (!body) throw new Error('body not found')
        const canvas = await html2canvas(body, {
          backgroundColor: '#ffffff', scale: 2, useCORS: true, allowTaint: true,
        })
        const imgData = canvas.toDataURL('image/png')
        const imgW = canvas.width / 2
        const imgH = canvas.height / 2
        const pdf = new jsPDF({
          orientation: imgW > imgH ? 'landscape' : 'portrait',
          unit: 'px',
          format: [imgW, imgH],
        })
        pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH)
        pdf.save(buildExportFilename('pdf'))
      } else {
        const el = getCanvasContentElement()
        if (!el) throw new Error('no canvas element')
        await exportAsPDF(el, buildExportFilename('pdf'), { backgroundColor: canvas.backgroundColor })
      }
    } catch (err) {
      console.error('PDF export failed:', err)
      setTimeout(() => alert('PDF 导出失败，请重试'), 0)
    } finally {
      setExporting(null)
    }
  }

  const handleFormatBrush = () => {
    if (formatBrushStyle) {
      setFormatBrush(null)
    } else if (selectedId) {
      const node = findById(nodes, selectedId)
      if (node) setFormatBrush(node.style)
    }
  }

  // 精修模式下是否禁用按钮
  const isRefine = !!refineSession
  // 精修预览模式
  const isRefinePreview = isRefine && refinePreviewMode

  // 订阅精修撤销栈变化，让撤销/重做按钮的禁用状态实时更新
  const [refineUndoState, setRefineUndoState] = useState({
    canUndo: false,
    canRedo: false,
  })
  useEffect(() => {
    if (!isRefine) return
    const sync = () => setRefineUndoState({
      canUndo: refineUndo.canUndo(),
      canRedo: refineUndo.canRedo(),
    })
    sync()
    // 简单轮询兜底（也可以让 refineUndo 支持订阅，但避免改动其他文件）
    const timer = window.setInterval(sync, 200)
    return () => window.clearInterval(timer)
  }, [isRefine, refineSession?.sessionKey])

  return (
    <div className="h-12 shrink-0 bg-ink-900 border-b border-ink-700 flex items-center px-4 gap-2 relative z-10">
      <div className="flex items-center gap-2 mr-4">
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-pink-500" />
        <span className="text-gray-100 font-semibold">造页工坊</span>
        <span className="text-gray-500 text-xs hidden sm:inline">PageForge</span>
      </div>

      {/* 精修模式横幅 */}
      {isRefine && (
        <div className="flex items-center gap-2 px-3 py-1 bg-purple-950/50 border border-purple-700/40 rounded-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /><path d="M8 11h6" />
          </svg>
          <span className="text-purple-100 text-xs font-medium">精修模式</span>
          <span className="text-purple-400/80 text-xs hidden md:inline">· 点击画布中元素即可在右侧编辑</span>
          <button
            onClick={exitRefine}
            className="ml-1 px-2 py-0.5 rounded text-xs text-purple-200 hover:text-white hover:bg-purple-700/50 transition-colors"
          >
            退出
          </button>
        </div>
      )}

      {/* 撤销 */}
      <button
        onClick={() => isRefine ? handleRefineUndo() : undo()}
        disabled={previewMode || isRefinePreview || (isRefine ? !refineUndoState.canUndo : !canUndo)}
        className={btnCls}
        title="撤销 (Ctrl+Z)"
      >
        <span className="inline-flex items-center gap-1.5"><IconUndo size={16} /> 撤销</span>
      </button>

      {/* 重做 */}
      <button
        onClick={() => isRefine ? handleRefineRedo() : redo()}
        disabled={previewMode || isRefinePreview || (isRefine ? !refineUndoState.canRedo : !canRedo)}
        className={btnCls}
        title="重做 (Ctrl+Shift+Z)"
      >
        <span className="inline-flex items-center gap-1.5"><IconRedo size={16} /> 重做</span>
      </button>

      {/* 删除 */}
      <button
        onClick={() => isRefine ? handleRefineDelete() : selectedId && removeNode(selectedId)}
        disabled={previewMode || isRefinePreview || (isRefine ? !refineSelected : !selectedId)}
        className={btnCls}
        title="删除 (Delete)"
      >
        <span className="inline-flex items-center gap-1.5"><IconTrash size={16} /> 删除</span>
      </button>

      {/* 格式刷 — 仅自由画布模式 */}
      <button
        onClick={handleFormatBrush}
        disabled={previewMode || isRefine || (!selectedId && !formatBrushStyle)}
        className={formatBrushStyle && !previewMode ? primaryBtnCls : btnCls}
        title="格式刷：先选中源元素点击激活，再点击目标元素应用样式"
      >
        <span className="inline-flex items-center gap-1.5"><IconBrush size={16} /> 格式刷</span>
      </button>

      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />

      {/* 复制 */}
      <button
        onClick={() => selectedId && copyNode(selectedId)}
        disabled={previewMode || isRefine || !selectedId}
        className={btnCls}
        title="复制 (Ctrl+C)"
      >
        <span className="inline-flex items-center gap-1.5"><IconCopy size={16} /> 复制</span>
      </button>

      {/* 粘贴 */}
      <button
        onClick={async () => {
          const cw = parseInt(canvas.width) || 1200
          const ch = parseInt(canvas.height) || 800
          await unifiedAsyncPaste({ x: Math.round(cw / 2), y: Math.round(ch / 2) })
        }}
        disabled={previewMode || isRefine}
        className={btnCls}
        title="粘贴 (Ctrl+V)"
      >
        <span className="inline-flex items-center gap-1.5"><IconPaste size={16} /> 粘贴</span>
      </button>

      {/* 重复 */}
      <button
        onClick={() => isRefine ? handleRefineDuplicate() : selectedId && duplicateNode(selectedId)}
        disabled={previewMode || isRefinePreview || (isRefine ? !refineSelected : !selectedId)}
        className={btnCls}
        title="重复 (Ctrl+D)"
      >
        <span className="inline-flex items-center gap-1.5"><IconDuplicate size={16} /> 重复</span>
      </button>

      <div className="w-px h-5 bg-ink-600 mx-0.5 shrink-0" />
      <button onClick={clearCanvas} disabled={previewMode || isRefine} className={btnCls}>清空</button>
      {!isRefine && <AlignToolbar />}
      {!previewMode && !isRefinePreview && <TemplatePanel key={nodes.length} />}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-gray-500 text-xs">
          {isRefine ? '精修模式（iframe 渲染）' : `${nodeCount} 个元素`}
        </span>

        {/* 预览 */}
        <button
          onClick={() => isRefine ? toggleRefinePreviewMode() : togglePreviewMode()}
          disabled={exporting !== null}
          className={(previewMode || isRefinePreview) ? primaryBtnCls : btnCls}
          title={previewMode || isRefinePreview ? '退出预览' : '预览交互（点击/悬停/动画/链接）'}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconEye size={16} /> {previewMode || isRefinePreview ? '退出预览' : '预览'}
          </span>
        </button>

        {/* 导出 */}
        <button
          ref={exportBtnRef}
          onClick={() => setShowExportMenu((v) => !v)}
          disabled={(isRefine ? false : nodeCount === 0) || exporting !== null || previewMode || isRefinePreview}
          className={primaryBtnCls}
          title="导出"
        >
          <span className="inline-flex items-center gap-1.5">
            {exporting ? '导出中...' : <><IconDownload size={16} /> 导出</>}
          </span>
        </button>
      </div>

      {/* 导出下拉菜单 */}
      {showExportMenu && menuPos &&
        createPortal(
          <div
            ref={exportMenuRef}
            style={{
              position: 'fixed', top: menuPos.top, right: menuPos.right,
              width: 160, backgroundColor: '#1f2937', border: '1px solid #374151',
              borderRadius: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              zIndex: 99999, padding: 4,
            }}
          >
            <button
              onClick={handleCopyHTML}
              disabled={!refineSession && !selectedId}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded"
              style={{ background: 'transparent' }}
            >
              <IconCopy size={14} /> 复制 HTML
            </button>
            <button onClick={handleExportHTML} disabled={exporting !== null} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded" style={{ background: 'transparent' }}>
              <IconDownload size={14} /> HTML 文件
            </button>
            <button onClick={handleExportPNG} disabled={exporting !== null} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded" style={{ background: 'transparent' }}>
              <IconDownload size={14} /> PNG 图片
            </button>
            <button onClick={handleExportPDF} disabled={exporting !== null} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 rounded" style={{ background: 'transparent' }}>
              <IconDownload size={14} /> PDF 文档
            </button>
          </div>,
          document.body,
        )}
      {toast &&
        createPortal(
          <div
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              backgroundColor: '#1f2937', color: '#e5e7eb', border: '1px solid #374151',
              borderRadius: 8, padding: '8px 20px', fontSize: 14,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 99999,
              animation: 'pf-toast-in 0.3s ease',
            }}
          >
            {toast}
          </div>,
          document.body,
        )}
    </div>
  )
}