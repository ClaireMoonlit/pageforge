import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pageTemplates } from '@/data/templates'
import { importedTemplates, type ImportedTemplateMeta } from '@/data/importedTemplates'
import { htmlToNodes } from '@/utils/importHtml'
import type { CanvasNode, CanvasConfig } from '@/types'

export function TemplatePanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'preset' | 'imported' | 'paste'>('preset')
  const [pasteHtml, setPasteHtml] = useState('')
  const [error, setError] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadTemplate = useEditorStore((s) => s.loadTemplate)
  const addNodes = useEditorStore((s) => s.addNodes)
  const nodes = useEditorStore((s) => s.nodes)

  /** 根据解析结果估算所需的画布高度（取所有根节点底部最大值，再加 40px 留白） */
  const computeCanvasHeight = (parsed: CanvasNode[]): string => {
    let maxBottom = 0
    for (const n of parsed) {
      const y = n.style?.y ?? 0
      const minH = parseInt(String(n.style?.minHeight ?? '0'), 10) || 0
      const h = parseInt(String(n.style?.height ?? '0'), 10) || 0
      const bottom = y + Math.max(minH, h)
      if (bottom > maxBottom) maxBottom = bottom
    }
    return `${Math.max(800, maxBottom + 40)}px`
  }

  const handlePreset = useCallback(
    (index: number) => {
      const t = pageTemplates[index]
      loadTemplate(t.nodes, t.canvas)
      setOpen(false)
    },
    [loadTemplate],
  )

  const handleImported = useCallback(
    async (meta: ImportedTemplateMeta) => {
      setLoadingId(meta.id)
      setError('')
      try {
        const res = await fetch(meta.jsonPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const nodes = data.nodes as CanvasNode[]
        const canvas = (data.canvas || meta.canvas) as CanvasConfig
        if (!nodes || nodes.length === 0) {
          setError('模板数据为空。')
          return
        }
        loadTemplate(nodes, canvas)
        setOpen(false)
      } catch (e) {
        setError('加载失败：' + (e instanceof Error ? e.message : '未知错误'))
      } finally {
        setLoadingId(null)
      }
    },
    [loadTemplate],
  )

  const handleImport = useCallback(
    (html: string) => {
      try {
        setError('')
        const parsed = htmlToNodes(html)
        if (parsed.length === 0) {
          setError('未能解析到有效元素，请检查 HTML 内容。')
          return
        }

        // 判断是否完整页面导入（包含 pf-root 或含完整 HTML 结构）
        const isCompletePage =
          /\bpf-root\b/.test(html) ||
          /<html[\s>]/i.test(html) ||
          /<body[\s>]/i.test(html)

        if (isCompletePage) {
          // 完整页面 → 替换当前画布
          loadTemplate(parsed, {
            backgroundColor: '#ffffff',
            width: '1200px',
            height: computeCanvasHeight(parsed),
          })
        } else {
          // 组件片段 → 追加到现有画布，自动偏移避免重叠
          const existingBottom = nodes.reduce((max, n) => {
            const y = (n.style?.y ?? 0) as number
            const h = parseFloat(String(n.style?.height ?? '40')) || 40
            return Math.max(max, y + h)
          }, 0)
          const offsetY = existingBottom > 0 ? existingBottom + 40 : 0
          const offsetNodes = parsed.map((n) => ({
            ...n,
            style: {
              ...n.style,
              y: ((n.style?.y ?? 0) as number) + offsetY,
            },
          }))
          const newHeight = computeCanvasHeight([...nodes, ...offsetNodes])
          addNodes(offsetNodes, { height: newHeight })
        }
        setOpen(false)
      } catch (e) {
        setError('解析失败：' + (e instanceof Error ? e.message : '未知错误'))
      }
    },
    [loadTemplate, addNodes, nodes],
  )

  /** 读取上传的 HTML 文件并触发导入（支持 .html / .htm / 文本文件） */
  const handleFileUpload = useCallback(
    async (file: File) => {
      setError('')
      setUploadFileName(file.name)
      try {
        const text = await file.text()
        if (!text.trim()) {
          setError('文件内容为空。')
          return
        }
        handleImport(text)
      } catch (e) {
        setError('读取文件失败：' + (e instanceof Error ? e.message : '未知错误'))
      }
    },
    [handleImport],
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileUpload(file)
      // 重置 input，允许重复选择同名文件
      e.target.value = ''
    },
    [handleFileUpload],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer.files?.[0]
      if (file) handleFileUpload(file)
    },
    [handleFileUpload],
  )

  const onDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // 从内联 HTML 重新生成（用最新 importHtml 逻辑，覆盖旧 JSON 的内容）
  const handleReimportFromHtml = useCallback(
    async (meta: ImportedTemplateMeta) => {
      if (!meta.htmlPath) return
      setLoadingId(meta.id)
      setError('')
      try {
        const res = await fetch(meta.htmlPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const html = await res.text()
        const baseUrl = meta.htmlPath.substring(0, meta.htmlPath.lastIndexOf('/') + 1)
        const parsed = htmlToNodes(html, baseUrl)
        if (parsed.length === 0) throw new Error('解析结果为空')
        // 根据所有根节点累积高度动态调整画布
        let totalH = 0
        for (const n of parsed) {
          const bottom = (n.style.y ?? 0) + (parseInt(String(n.style.minHeight ?? '0'), 10) || 0)
          totalH = Math.max(totalH, bottom)
        }
        console.log('[TemplatePanel] totalH from all roots:', totalH)
        const finalCanvas: CanvasConfig = {
          ...meta.canvas,
          height: `${Math.max(800, totalH + 40)}px`,
        }
        console.log('[TemplatePanel] finalCanvas height:', finalCanvas.height)
        // 验证子节点 position
        if (parsed[0]?.children) {
          const sample = parsed[0].children.slice(0, 3)
          sample.forEach((c: any, i: number) => {
            console.log(`[TemplatePanel] child[${i}]: type=${c.type} position=${c.style?.position} x=${c.style?.x} y=${c.style?.y} w=${c.style?.width}`)
          })
        }
        loadTemplate(parsed, finalCanvas)
        setOpen(false)
      } catch (e) {
        setError('重新生成失败：' + (e instanceof Error ? e.message : '未知错误'))
      } finally {
        setLoadingId(null)
      }
    },
    [loadTemplate],
  )

  const handlePasteImport = useCallback(() => {
    if (!pasteHtml.trim()) {
      setError('请先粘贴 HTML 代码。')
      return
    }
    handleImport(pasteHtml)
  }, [pasteHtml, handleImport])

  // Escape 关闭弹窗
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded text-sm bg-ink-700 hover:bg-ink-600 text-gray-200 transition-colors"
      >
        模板/导入
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-auto" onClick={() => setOpen(false)}>
          <div
            className="bg-ink-800 border border-ink-600 rounded-xl w-[640px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-600">
              <h2 className="text-gray-100 font-semibold text-base">
                {tab === 'preset' ? '选择模板' : tab === 'imported' ? '开源模板' : '粘贴 HTML 导入'}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* 标签切换 */}
            <div className="flex border-b border-ink-600 px-5">
              <button
                onClick={() => { setTab('preset'); setError('') }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  tab === 'preset'
                    ? 'text-brand-400 border-brand-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                预设模板
              </button>
              <button
                onClick={() => { setTab('imported'); setError('') }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  tab === 'imported'
                    ? 'text-brand-400 border-brand-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                开源模板
              </button>
              <button
                onClick={() => { setTab('paste'); setError('') }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  tab === 'paste'
                    ? 'text-brand-400 border-brand-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                粘贴 HTML
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'preset' && (
                <>
                  {nodes.length > 0 && (
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-yellow-400">
                      加载模板将替换当前画布内容，可通过撤销恢复。
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {pageTemplates.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => handlePreset(i)}
                        className="text-left p-4 rounded-lg border border-ink-600 hover:border-brand-500 bg-ink-900 hover:bg-ink-700 transition-colors"
                      >
                        <div
                          className="w-full h-24 rounded-md mb-3"
                          style={{ background: t.preview }}
                        />
                        <div className="font-medium text-gray-200 text-sm">{t.name}</div>
                        <div className="text-gray-500 text-xs mt-1 leading-relaxed">{t.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {tab === 'imported' && (
                <>
                  {nodes.length > 0 && (
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-yellow-400">
                      加载模板将替换当前画布内容，可通过撤销恢复。
                    </div>
                  )}
                  {error && (
                    <div className="mb-4 px-3 py-2 bg-red-900/30 rounded text-xs text-red-400">{error}</div>
                  )}
                  <p className="text-gray-500 text-xs mb-4">
                    来自 StartBootstrap 开源项目（MIT 许可），通过 CSS 解析自动转换为 PageForge 节点。部分样式（如 Bootstrap class、Google Fonts）可能不完整，可在画布中手动调整。
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {importedTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg border border-ink-600 hover:border-brand-500 bg-ink-900 transition-colors overflow-hidden"
                      >
                        <button
                          onClick={() => handleImported(t)}
                          disabled={loadingId === t.id}
                          className="w-full text-left p-4 hover:bg-ink-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                          <div
                            className="w-full h-24 rounded-md mb-3 flex items-center justify-center"
                            style={{ background: t.preview }}
                          >
                            {loadingId === t.id && (
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                          </div>
                          <div className="font-medium text-gray-200 text-sm">{t.name}</div>
                          <div className="text-gray-500 text-xs mt-1 leading-relaxed">{t.description}</div>
                        </button>
                        {t.htmlPath && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReimportFromHtml(t) }}
                            disabled={loadingId === t.id}
                            className="w-full px-4 py-2 text-xs text-gray-400 hover:text-brand-400 hover:bg-ink-700/50 border-t border-ink-600 transition-colors disabled:opacity-50"
                            title="用最新解析逻辑从 HTML 源重新生成（修复旧 JSON 的文字丢失）"
                          >
                            重新生成（从 HTML 源）
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'paste' && (
                <div className="flex flex-col gap-3">
                  {nodes.length > 0 && (
                    <div className="px-3 py-2 bg-ink-700/50 rounded text-xs text-yellow-400">
                      导入将替换当前画布内容，可通过撤销恢复。
                    </div>
                  )}
                  <p className="text-gray-400 text-xs">
                    将网页 HTML 代码粘贴到下方，或直接上传 <code className="text-gray-300">.html / .htm</code> 文件，系统会自动解析内联样式并转换为 PageForge 节点。复杂布局（如多栏）建议分多次导入。
                  </p>

                  {/* 文件上传 / 拖拽区 */}
                  <label
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    className="flex flex-col items-center justify-center gap-1 px-4 py-5 border-2 border-dashed border-ink-600 hover:border-brand-500 rounded-lg cursor-pointer transition-colors bg-ink-900/40"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-400"
                      aria-hidden="true"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm text-gray-200">
                      点击或拖拽 HTML 文件到此处上传
                    </span>
                    <span className="text-xs text-gray-500">
                      支持 .html / .htm
                    </span>
                    {uploadFileName && (
                      <span className="text-xs text-brand-400 mt-1">
                        已选择：{uploadFileName}
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".html,.htm,text/html"
                      onChange={onFileChange}
                      className="hidden"
                    />
                  </label>

                  <textarea
                    value={pasteHtml}
                    onChange={(e) => { setPasteHtml(e.target.value); setError('') }}
                    placeholder="或在此粘贴 HTML 代码..."
                    className="w-full h-56 bg-ink-900 border border-ink-600 rounded-lg p-3 text-sm text-gray-200 font-mono resize-none focus:outline-none focus:border-brand-400"
                    spellCheck={false}
                  />
                  {error && (
                    <div className="text-red-400 text-xs px-1">{error}</div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setPasteHtml('')
                        setUploadFileName('')
                        setError('')
                      }}
                      className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700 transition-colors"
                    >
                      清空
                    </button>
                    <button
                      onClick={handlePasteImport}
                      disabled={!pasteHtml.trim()}
                      className="px-6 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      导入
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}