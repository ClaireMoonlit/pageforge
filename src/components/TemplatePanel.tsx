import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { pageTemplates } from '@/data/templates'
import { importedTemplates, type ImportedTemplateMeta } from '@/data/importedTemplates'
import { htmlToNodes, extractCanvasConfig } from '@/utils/importHtml'
import type { CanvasNode, CanvasConfig } from '@/types'

export function TemplatePanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'preset' | 'imported' | 'paste'>('preset')
  const [pasteHtml, setPasteHtml] = useState('')
  const [error, setError] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  /** 待确认的导入：导入会清空画布时弹出二次确认。
   *  source: 'html' 表示来自粘贴/上传的 HTML 导入（带"作为片段追加"选项）
   *          'preset' / 'imported' / 'reimport' 表示来自模板（只有"取消 / 确认替换"） */
  const [pendingImport, setPendingImport] = useState<{
    source: 'html' | 'preset' | 'imported' | 'reimport'
    html?: string
    presetIndex?: number
    meta?: ImportedTemplateMeta
    parsedCount?: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 粘贴 textarea 引用：用于根据内容动态调整高度（自适应 + 最大高度限制） */
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const loadTemplate = useEditorStore((s) => s.loadTemplate)
  const addNodes = useEditorStore((s) => s.addNodes)
  const nodes = useEditorStore((s) => s.nodes)

  /**
   * 递归计算节点的"实际底部"（用于画布高度适配）
   * - 累加子节点的 y（相对父）+ 父 y，得到绝对 y
   * - 如果节点有显式 height/lineHeight，用它；否则只看子节点最大底部
   * - 用于解决"container 节点 height=undefined，但子节点溢出"的情况
   */
  const calcNodeBottom = (n: CanvasNode, parentY: number = 0): number => {
    const absY = parentY + (Number(n.style?.y) || 0)
    const ownH = parseFloat(String(n.style?.height ?? '0')) || 0
    const ownMinH = parseFloat(String(n.style?.minHeight ?? '0')) || 0
    // 自身底部 = y + max(height, minHeight)
    let bottom = absY + Math.max(ownH, ownMinH)
    // 子节点最大底部
    for (const c of n.children || []) {
      const cb = calcNodeBottom(c, absY)
      if (cb > bottom) bottom = cb
    }
    return bottom
  }

  /**
   * 根据解析结果估算所需的画布高度。
   * - 递归算所有节点的底部（不仅根节点），避免 container 节点 height=undefined
   *   但子节点溢出的情况（典型：模板的最后一个 section 内的子元素）
   * - extractedHeight（来自 pf-canvas 标记）作为下限参考，但实际内容更大时取实际值
   * - 最小不低于 400px（避免画布过小）
   */
  const computeCanvasHeight = (parsed: CanvasNode[], extractedHeight?: string): string => {
    // 1. 递归算实际内容底部
    let maxBottom = 0
    for (const n of parsed) {
      const b = calcNodeBottom(n)
      if (b > maxBottom) maxBottom = b
    }
    // 2. 解析 extractedHeight 作为下限
    let extractedH = 0
    if (extractedHeight) {
      const v = parseInt(String(extractedHeight).replace(/px$/i, ''), 10)
      if (Number.isFinite(v) && v > 0) extractedH = v
    }
    // 3. 取 max(实际内容, extractedHeight, 400) + 40px 留白
    return `${Math.max(400, Math.ceil(maxBottom) + 40, extractedH)}px`
  }

  /** 判断 HTML 是否为完整页面（含 pf-root / <html> / <body> 标记） */
  const detectCompletePage = (html: string): boolean => {
    return (
      /\bpf-root\b/.test(html) ||
      /<html[\s>]/i.test(html) ||
      /<body[\s>]/i.test(html)
    )
  }

  /**
   * 执行实际导入。
   * @param html 待导入的 HTML
   * @param mode 强制模式：'replace' = 完整页面（清空），'append' = 组件片段（追加）
   *             传 undefined 时根据 detectCompletePage 自动判断
   */
  const performImport = useCallback(
    (html: string, mode?: 'replace' | 'append') => {
      try {
        setError('')
        const parsed = htmlToNodes(html)
        if (parsed.length === 0) {
          setError('未能解析到有效元素，请检查 HTML 内容。')
          return false
        }
        const isCompletePage = mode === 'replace' ? true : mode === 'append' ? false : detectCompletePage(html)

        if (isCompletePage) {
          // 完整页面 → 替换当前画布
          // 优先从 HTML 中还原画布配置（data-pf-canvas-* / .pf-root style），
          // 缺失字段时回退到默认或基于节点位置计算
          const extracted = extractCanvasConfig(html)
          const canvasH = computeCanvasHeight(parsed, extracted.height)
          loadTemplate(parsed, {
            backgroundColor: extracted.backgroundColor,
            width: extracted.width,
            height: canvasH,
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
        return true
      } catch (e) {
        setError('解析失败：' + (e instanceof Error ? e.message : '未知错误'))
        return false
      }
    },
    [loadTemplate, addNodes, nodes],
  )

  /**
   * 入口：先解析 HTML，若检测到完整页面且画布非空，则弹出确认；否则直接导入。
   * @returns true 表示导入流程已成功启动（含弹确认框的情况）；
   *          false 表示导入失败（如解析错误或空内容）
   */
  const handleImport = useCallback(
    (html: string): boolean => {
      const isCompletePage = detectCompletePage(html)
      // 仅在"完整页面"且"画布非空"时弹确认
      if (isCompletePage && nodes.length > 0) {
        let parsedCount = 0
        try {
          parsedCount = htmlToNodes(html).length
        } catch {
          parsedCount = 0
        }
        if (parsedCount === 0) {
          setError('未能解析到有效元素，请检查 HTML 内容。')
          return false
        }
        setPendingImport({ source: 'html', html, parsedCount })
        return true
      }
      return performImport(html)
    },
    [nodes.length, performImport],
  )

  /** 实际执行预设模板加载（handlePreset 确认后调用） */
  const applyPreset = useCallback(
    (presetIndex: number) => {
      const t = pageTemplates[presetIndex]
      if (!t) return
      loadTemplate(t.nodes, t.canvas)
      setOpen(false)
    },
    [loadTemplate],
  )

  /** 实际执行开源模板加载（handleImported 确认后调用） */
  const applyImported = useCallback(
    async (meta: ImportedTemplateMeta) => {
      setLoadingId(meta.id)
      setError('')
      try {
        const res = await fetch(meta.jsonPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const ns = data.nodes as CanvasNode[]
        const storedCanvas = (data.canvas || meta.canvas) as CanvasConfig
        if (!ns || ns.length === 0) {
          setError('模板数据为空。')
          return
        }
        // 不直接用 JSON 缓存的 height（早期导出的可能少了子节点溢出部分），
        // 重新递归计算实际内容底部，确保画布足够大
        const canvasH = computeCanvasHeight(ns, storedCanvas.height)
        const finalCanvas: CanvasConfig = {
          ...storedCanvas,
          height: canvasH,
        }
        loadTemplate(ns, finalCanvas)
        setOpen(false)
      } catch (e) {
        setError('加载失败：' + (e instanceof Error ? e.message : '未知错误'))
      } finally {
        setLoadingId(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadTemplate],
  )

  /** 实际执行从内联 HTML 重新生成（handleReimportFromHtml 确认后调用） */
  const applyReimport = useCallback(
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
        // 优先从 HTML 中还原画布配置（精确）
        const extracted = extractCanvasConfig(html)
        const finalCanvas: CanvasConfig = {
          ...meta.canvas,
          backgroundColor: extracted.backgroundColor,
          width: extracted.width,
          height: computeCanvasHeight(parsed, extracted.height),
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

  /** 确认弹窗 → 确认替换（依赖 applyPreset / applyImported / applyReimport，故声明在它们之后） */
  const confirmReplace = useCallback(() => {
    if (!pendingImport) return
    if (pendingImport.source === 'html' && pendingImport.html) {
      performImport(pendingImport.html, 'replace')
    } else if (pendingImport.source === 'preset' && pendingImport.presetIndex !== undefined) {
      applyPreset(pendingImport.presetIndex)
    } else if (pendingImport.source === 'imported' && pendingImport.meta) {
      applyImported(pendingImport.meta)
    } else if (pendingImport.source === 'reimport' && pendingImport.meta) {
      applyReimport(pendingImport.meta)
    }
    setPendingImport(null)
  }, [pendingImport, performImport, applyPreset, applyImported, applyReimport])

  const handlePreset = useCallback(
    (index: number) => {
      const t = pageTemplates[index]
      // 画布非空时弹确认
      if (nodes.length > 0) {
        setPendingImport({ source: 'preset', presetIndex: index, parsedCount: t.nodes.length })
        return
      }
      loadTemplate(t.nodes, t.canvas)
      setOpen(false)
    },
    [loadTemplate, nodes.length],
  )

  const handleImported = useCallback(
    (meta: ImportedTemplateMeta) => {
      // 画布非空时弹确认
      if (nodes.length > 0) {
        setPendingImport({ source: 'imported', meta })
        return
      }
      applyImported(meta)
    },
    [applyImported, nodes.length],
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
        const ok = handleImport(text)
        // 导入流程已启动（成功直接导入 / 弹出确认框均算 ok）→ 清空文件名，
        // 允许用户立即重新选择新文件而无需先点"清空"。
        // 真正解析失败（ok=false）时保留文件名，方便用户查看/重试。
        if (ok) {
          setUploadFileName('')
        }
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
    (meta: ImportedTemplateMeta) => {
      if (!meta.htmlPath) return
      if (nodes.length > 0) {
        setPendingImport({ source: 'reimport', meta })
        return
      }
      applyReimport(meta)
    },
    [applyReimport, nodes.length],
  )

  const handlePasteImport = useCallback(() => {
    if (!pasteHtml.trim()) {
      setError('请先粘贴 HTML 代码。')
      return
    }
    const ok = handleImport(pasteHtml)
    if (ok) {
      setPasteHtml('')
    }
  }, [pasteHtml, handleImport])

  /** 粘贴 textarea：内容变化时自适应高度（最小 192px，最大 384px，超出时 textarea 自身内部滚动） */
  useEffect(() => {
    const el = pasteTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(Math.max(el.scrollHeight, 192), 384) + 'px'
  }, [pasteHtml])

  // Escape 关闭弹窗
  useEffect(() => {
    if (!open && !pendingImport) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingImport) {
          setPendingImport(null)
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pendingImport])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded text-sm bg-ink-700 hover:bg-ink-600 text-gray-200 transition-colors"
      >
        导入
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
                {tab === 'preset' ? '选择模板' : tab === 'imported' ? '开源模板' : 'HTML 导入'}
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
                导入 HTML
              </button>
            </div>

            {/* 内容区：内容多时内部滚动（弹窗 max-h 限制） */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'preset' && (
                <>
                  {nodes.length > 0 && (
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-gray-300 leading-loose tracking-wide">
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
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-gray-300 leading-loose tracking-wide">
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
                  {/* 行为说明：两种检测规则 */}
                  <div className="px-3 py-2 bg-ink-700/50 rounded text-xs text-gray-400 leading-loose tracking-wide">
                    <span className="text-gray-200 font-medium">导入规则：</span>
                    HTML 含
                    <code className="text-gray-300 bg-ink-700/70 px-1 rounded mx-1">pf-root</code>
                    /
                    <code className="text-gray-300 bg-ink-700/70 px-1 rounded mx-1">&lt;html&gt;</code>
                    /
                    <code className="text-gray-300 bg-ink-700/70 px-1 rounded mx-1">&lt;body&gt;</code>
                    标记时识别为<span className="text-gray-200 mx-1">完整页面</span>（替换画布），
                    否则为<span className="text-gray-300 mx-1">组件片段</span>（追加到底部）。
                  </div>

                  {/* 实时检测指示器 */}
                  {pasteHtml.trim() && (() => {
                    const detected = detectCompletePage(pasteHtml)
                    const canReplace = nodes.length > 0
                    return (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded text-xs leading-loose tracking-wide bg-ink-700/50 text-gray-300">
                        {detected ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span>
                              完整页面
                              {canReplace ? ' — 导入时将弹出确认' : ' — 画布为空，直接替换'}
                            </span>
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>
                              组件片段
                              {nodes.length > 0 ? ' — 将追加到画布底部' : ' — 画布为空，直接添加'}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })()}

                  <p className="text-gray-400 text-xs leading-loose tracking-wide">
                    将网页 HTML 代码粘贴到下方，或直接上传 <code className="text-gray-300">.html / .htm</code> 文件（二选一），系统会自动解析内联样式并转换为 PageForge 节点。复杂布局（如多栏）建议分多次导入。
                  </p>

                  {/* 文件上传 / 拖拽区：粘贴框有内容时禁用，避免双输入源冲突 */}
                  <label
                    onDrop={pasteHtml.trim() ? undefined : onDrop}
                    onDragOver={onDragOver}
                    className={`flex flex-col items-center justify-center gap-1 px-4 py-5 border-2 border-dashed rounded-lg transition-colors ${
                      pasteHtml.trim()
                        ? 'border-ink-700 bg-ink-900/20 cursor-not-allowed opacity-50'
                        : 'border-ink-600 hover:border-brand-500 cursor-pointer bg-ink-900/40'
                    }`}
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
                      disabled={!!pasteHtml.trim()}
                      className="hidden"
                    />
                  </label>

                  <textarea
                    ref={pasteTextareaRef}
                    value={pasteHtml}
                    onChange={(e) => { setPasteHtml(e.target.value); setError('') }}
                    placeholder="或在此粘贴 HTML 代码..."
                    className="w-full min-h-48 max-h-[50vh] bg-ink-900 border border-ink-600 rounded-lg p-3 text-sm text-gray-200 font-mono resize-none focus:outline-none focus:border-brand-400 overflow-y-auto"
                    spellCheck={false}
                  />
                  {pasteHtml.trim() && (
                    <p className="text-gray-500 text-xs leading-loose tracking-wide px-1">
                      已启用粘贴模式：上方文件上传已禁用，如需上传请先清空。
                    </p>
                  )}
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

      {/* 二次确认弹窗：导入会清空画布时弹出 */}
      {pendingImport && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60"
          onClick={() => setPendingImport(null)}
        >
          <div
            className="bg-ink-800 border border-ink-600 rounded-xl w-[460px] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-600">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h3 className="text-gray-100 font-semibold text-sm tracking-wide">即将清空当前画布</h3>
              </div>
              <button
                onClick={() => setPendingImport(null)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* 内容：HTML 源 → 详细说明；模板源 → 简洁提示 */}
            {pendingImport.source === 'html' ? (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-3">
                <p>
                  检测到您粘贴的 HTML 含
                  <code className="text-gray-200 bg-ink-700 px-1 rounded mx-1">pf-root</code>
                  /
                  <code className="text-gray-200 bg-ink-700 px-1 rounded mx-1">&lt;html&gt;</code>
                  /
                  <code className="text-gray-200 bg-ink-700 px-1 rounded mx-1">&lt;body&gt;</code>
                  标记，会被识别为<span className="text-gray-200 mx-1">完整页面</span>。
                </p>
                <div className="px-3 py-2 bg-ink-900 border border-ink-600 rounded text-xs space-y-1 leading-loose">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>当前画布节点数</span>
                    <span className="text-gray-200 font-mono">{nodes.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400">
                    <span>待导入节点数</span>
                    <span className="text-gray-200 font-mono">{pendingImport.parsedCount}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-xs leading-loose tracking-wide">
                  如果直接导入，当前画布上的 {nodes.length} 个节点将被全部清空（可通过撤销恢复）。
                  如果您只想把内容追加到现有画布，请选择"作为片段追加"。
                </p>
              </div>
            ) : (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-2">
                <p>
                  {pendingImport.source === 'preset'
                    ? '当前预设模板'
                    : pendingImport.source === 'imported'
                      ? '当前开源模板'
                      : '重新生成的模板'}
                  加载后，画布上的 {nodes.length} 个节点将被全部替换（可通过撤销恢复）。
                </p>
              </div>
            )}

            {/* 操作按钮：HTML 源 3 个，模板源 2 个 */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-600 bg-ink-900/40">
              <button
                onClick={() => setPendingImport(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700 transition-colors"
              >
                取消
              </button>
              {pendingImport.source === 'html' && (
                <button
                  onClick={() => {
                    if (pendingImport.html && performImport(pendingImport.html, 'append')) {
                      setPendingImport(null)
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-200 hover:bg-ink-700 border border-ink-600 transition-colors"
                  title={`将内容作为组件片段追加到画布底部（保留现有 ${nodes.length} 个节点）`}
                >
                  作为片段追加
                </button>
              )}
              <button
                onClick={confirmReplace}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 transition-colors"
              >
                {pendingImport.source === 'html' ? '仍要替换' : '确认替换'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}