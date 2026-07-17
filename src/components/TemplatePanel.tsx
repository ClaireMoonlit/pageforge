import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '@/store/editorStore'
import { pageTemplates } from '@/data/templates'
import { importedTemplates, type ImportedTemplateMeta } from '@/data/importedTemplates'
import { htmlToNodes, extractCanvasConfig } from '@/utils/importHtml'
import { ImportModeDialog } from '@/components/ImportModeDialog'
import { detectHtmlComplexity, type ImportMode } from '@/utils/htmlComplexity'
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
   *          'preset' 表示来自预设模板（只有"取消 / 确认替换"）
   *          'refine' 表示精修模式下又导入新 HTML（弹"替换当前精修页面"确认）
   *          'freeform_to_refine' 自由画布有元素时切换到精修（弹确认）
   *          'refine_to_freeform' 精修模式切换到自由画布（弹确认）
   *  注：开源模板（'imported'）和重新生成（'reimport'）已改走模式选择弹窗，
   *      不再使用此处的二次确认，故类型中已删除 */
  const [pendingImport, setPendingImport] = useState<{
    source: 'html' | 'preset' | 'refine' | 'freeform_to_refine' | 'refine_to_freeform'
    html?: string
    presetIndex?: number
    parsedCount?: number
  } | null>(null)
  /**
   * 模式选择弹窗：所有 HTML 导入路径（粘贴/上传/开源模板）都先过这里。
   * html 已通过 detectHtmlComplexity 评估，给出推荐模式 + 置信度。
   * 用户可以一键采用推荐，也可以手动切换到另一种（阶段 1 仅 freeform 可用）。
   */
  const [modePrompt, setModePrompt] = useState<{ html: string; pendingForReplace?: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 粘贴 textarea 引用：用于根据内容动态调整高度（自适应 + 最大高度限制） */
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const loadTemplate = useEditorStore((s) => s.loadTemplate)
  const addNodes = useEditorStore((s) => s.addNodes)
  const nodes = useEditorStore((s) => s.nodes)
  const setModalOpen = useEditorStore((s) => s.setModalOpen)
  /** 精修模式会话：用于在精修模式下导入时弹确认 */
  const refineSession = useEditorStore((s) => s.refineSession)

  // 弹窗打开/关闭时同步到 store，让缩放工具栏变灰
  useEffect(() => {
    setModalOpen(open || pendingImport !== null || modePrompt !== null)
  }, [open, pendingImport, modePrompt, setModalOpen])

  /**
   * 递归计算节点的"实际底部"（用于画布高度适配）
   * - 累加子节点的 y（相对父）+ 父 y，得到绝对 y
   * - 如果节点有显式 height/lineHeight，用它；否则只看子节点最大底部
   * - 用于解决"container 节点 height=undefined，但子节点溢出"的情况
   * - 跳过 display: none 节点（如 Bootstrap modals），它们在画布中不占空间但
   *   可能保留着大 y 值，会被错误地当作可见内容撑高画布
   */
  const calcNodeBottom = (n: CanvasNode, parentY: number = 0): number => {
    // display: none 节点不参与布局计算（递归跳过整个子树）
    if (String(n.style?.display ?? '').toLowerCase() === 'none') return 0
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
    return `${Math.max(800, Math.ceil(maxBottom) + 120, extractedH)}px`
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
   * @param importMode 用户选的编辑模式（阶段 1 仅记录日志，后续阶段会按模式分流）
   */
  const performImport = useCallback(
    (html: string, mode?: 'replace' | 'append', importMode?: ImportMode) => {
      try {
        setError('')
        const effectiveMode: ImportMode = importMode === 'refine' ? 'refine' : 'freeform'
        // 精修模式：直接走 iframe 路径，不需要 htmlToNodes 解析
        if (effectiveMode === 'refine') {
          // 1. 解析 baseUrl：开源模板的 htmlPath 对应目录（如 /pageforge/imported-templates/），
          //    粘贴/上传 HTML 退回到 origin 根目录。
          //    srcdoc 的 base 是 about:srcdoc，相对路径（背景图/favicon）会失效。
          //
          // ⚠ 关键：baseUrl 必须是**完整 origin + 路径**，不能只写路径。
          //   如果只写 `/pageforge/imported-templates/`，iframe 内的相对路径
          //   `imported-templates/assets-agency/img/...` 会被解析为
          //   `http://host/imported-templates/...`（丢失 /pageforge/ 前缀）。
          //   因为 <base href="/xxx"> 在 iframe 中被当作 origin 相对解析。
          let baseUrl: string | undefined
          const cachedMeta = (window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta
          if (cachedMeta?.htmlPath) {
            // 去掉文件名，只保留目录部分
            const lastSlash = cachedMeta.htmlPath.lastIndexOf('/')
            const dirPath = lastSlash >= 0 ? cachedMeta.htmlPath.slice(0, lastSlash + 1) : cachedMeta.htmlPath
            // 拼上 origin，确保是完整 URL
            baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${dirPath.startsWith('/') ? '' : '/'}${dirPath}` : dirPath
          } else if (typeof window !== 'undefined') {
            // 粘贴/上传 HTML 退回到当前 origin 根目录
            baseUrl = window.location.origin + '/'
          }
          // 2. 启动精修模式（清空 nodes，切换为 iframe 渲染）
          useEditorStore.getState().startRefine(html, baseUrl)
          // 清理暂存的开源模板 meta（仅在精修分支用得到，freeform 分支在 handleModeConfirm 已清）
          if (cachedMeta) delete (window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta
          setOpen(false)
          console.info('[TemplatePanel] 启动精修模式，HTML 长度:', html.length, 'baseUrl:', baseUrl)
          return true
        }
        // 解析 baseUrl：与精修模式共用同样的逻辑，
        // 让相对路径图片在画布模式下也能正确解析为完整 URL（避免部署后图片 404）
        let baseUrl: string | undefined
        const cachedMeta = (window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta
        if (cachedMeta?.htmlPath) {
          const lastSlash = cachedMeta.htmlPath.lastIndexOf('/')
          const dirPath = lastSlash >= 0 ? cachedMeta.htmlPath.slice(0, lastSlash + 1) : cachedMeta.htmlPath
          baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${dirPath.startsWith('/') ? '' : '/'}${dirPath}` : dirPath
        } else if (typeof window !== 'undefined') {
          baseUrl = window.location.origin + '/'
        }
        const parsed = htmlToNodes(html, baseUrl)
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
   * 入口：先弹模式选择弹窗，让用户确认"自由画布 vs 精修"模式。
   * 模式确定后再走原有的"画布非空+完整页面 → 二次确认"逻辑。
   * @returns true 表示导入流程已成功启动；
   *          false 表示导入失败（如解析错误或空内容）
   */
  const handleImport = useCallback(
    (html: string): boolean => {
      if (!html || !html.trim()) {
        setError('请提供有效的 HTML 内容。')
        return false
      }
      // 触发模式选择弹窗
      setModePrompt({ html })
      return true
    },
    [],
  )

  /**
   * 模式选择确认后调用：根据用户选的模式执行导入。
   * 精修模式走 iframe 路径（直接 startRefine），自由画布走 htmlToNodes 路径。
   *
   * 同时支持：粘贴/上传的 HTML（直接用 modePrompt.html）
   *          开源模板（用 window.__pfImportedHtml，由 applyImported 暂存）
   */
  const handleModeConfirm = useCallback(
    (mode: ImportMode) => {
      if (!modePrompt) return
      // 优先用 modePrompt.html，回退到 window 暂存的开源模板 HTML
      const cachedImportedHtml = (window as unknown as { __pfImportedHtml?: string }).__pfImportedHtml
      const cachedImportedMeta = (window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta
      const html = modePrompt.html || cachedImportedHtml || ''
      // 关闭模式选择弹窗
      setModePrompt(null)
      // 清理暂存的开源模板数据（无论后续走哪条路径都不会再用）
      delete (window as unknown as { __pfImportedHtml?: string }).__pfImportedHtml
      // 保留 __pfImportedMeta 给 performImport 的精修分支使用（算 baseUrl），
      // 在那边用完再清
      if (!html) {
        delete (window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta
        return
      }
      // 暴露给调试 / 用户查看
      console.info(
        `[TemplatePanel] 导入模式：${mode} | 复杂度评分：`,
        detectHtmlComplexity(html),
      )
      // 精修模式：若当前已在精修模式，先弹"替换当前精修页面"确认（避免误操作丢页）
      if (mode === 'refine' && refineSession) {
        setPendingImport({ source: 'refine', html })
        return
      }
      // 自由画布有元素时切换到精修：弹确认（精修模式会清空自由画布节点）
      if (mode === 'refine' && nodes.length > 0 && !refineSession) {
        setPendingImport({ source: 'freeform_to_refine', html })
        return
      }
      // 精修模式切换到自由画布：弹确认
      if (mode === 'freeform' && refineSession) {
        setPendingImport({ source: 'refine_to_freeform', html })
        return
      }
      // 精修模式：直接走 iframe 路径，不预解析、不二次确认
      if (mode === 'refine') {
        performImport(html, undefined, 'refine')
        return
      }
      // 自由画布模式
      // 二次确认：完整页面 + 画布非空时弹"仍要替换"或"作为片段追加"确认
      const isCompletePage = detectCompletePage(html)
      if (isCompletePage && nodes.length > 0) {
        let parsedCount = 0
        try {
          parsedCount = htmlToNodes(html).length
        } catch {
          parsedCount = 0
        }
        if (parsedCount === 0) {
          setError('未能解析到有效元素，请检查 HTML 内容。')
          return
        }
        setPendingImport({ source: 'html', html, parsedCount })
        // 暂存模式供 confirmReplace 使用
        ;(window as unknown as { __pfImportMode?: ImportMode }).__pfImportMode = mode
        return
      }
      // 非完整页面 / 画布为空：直接导入
      performImport(html, undefined, mode)
      // 导入成功后关闭弹窗（performImport 内部已 setOpen(false)）
      // 对开源模板：额外显示成功提示
      if (cachedImportedMeta) {
        console.info(`[TemplatePanel] 开源模板 ${cachedImportedMeta.id} 导入成功（自由画布模式）`)
      }
    },
    [modePrompt, nodes.length, performImport, refineSession],
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

  /**
   * 递归遍历节点，检查是否存在任何 backgroundImage 样式。
   * 用于检测 JSON 缓存是否"完整"——早期导出的 JSON 完全丢失了
   * backgroundImage，导致直接加载时图片全没。
   *
   * 当前已改走"直接 fetch HTML 源 + 模式选择弹窗"路径，JSON 缓存不再使用，
   * 此函数保留作为注释占位，避免未来误删。
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _hasAnyBackgroundImage = (nodes: CanvasNode[]): boolean => {
    for (const n of nodes) {
      if (n.style?.backgroundImage && n.style.backgroundImage !== 'none') return true
      if (n.children && _hasAnyBackgroundImage(n.children)) return true
    }
    return false
  }

  /**
   * 实际执行开源模板加载（handleImported 确认后调用）
   *
   * 流程：先 fetch HTML（始终从 HTML 源走，绕过可能损坏的 JSON 缓存），
   *       然后弹出模式选择弹窗（与粘贴/上传路径一致），用户选完模式后再执行实际加载。
   * 这样能保证：
   * 1. 模式选择弹窗一定会出现（用户最关心此功能）
   * 2. 直接用最新 importHtml 逻辑解析，避免旧 JSON 缓存的各种问题
   */
  const applyImported = useCallback(
    async (meta: ImportedTemplateMeta) => {
      setLoadingId(meta.id)
      setError('')
      try {
        if (!meta.htmlPath) {
          setError('模板未提供 HTML 路径，无法加载。')
          return
        }
        // 直接 fetch HTML 源（最可靠，绕开可能损坏的 JSON 缓存）
        const res = await fetch(meta.htmlPath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Vite SPA fallback 会把 404 路径返回 200 + index.html，所以需要二次校验 content-type
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('text/html')) {
          throw new Error(`HTML 源返回了非 HTML 内容（${contentType}，可能是 Vite SPA fallback）`)
        }
        const html = await res.text()
        if (!html.trim()) {
          setError('模板 HTML 内容为空。')
          return
        }
        // 暂存 HTML 和 meta，等用户选完模式后再执行实际加载
        ;(window as unknown as { __pfImportedHtml?: string }).__pfImportedHtml = html
        ;(window as unknown as { __pfImportedMeta?: ImportedTemplateMeta }).__pfImportedMeta = meta
        // 走模式选择弹窗（与粘贴/上传路径完全一致）
        setModePrompt({ html })
      } catch (e) {
        setError('加载失败：' + (e instanceof Error ? e.message : '未知错误'))
      } finally {
        setLoadingId(null)
      }
    },
    [],
  )

  /** 确认弹窗 → 确认替换（依赖 applyPreset，故声明在它们之后）
   *  注：开源模板和重新生成都走模式选择弹窗（applyImported → setModePrompt），
   *      不再需要单独的二次确认。预设模板仍然走这个二次确认。 */
  const confirmReplace = useCallback(() => {
    if (!pendingImport) return
    // 取暂存的导入模式（来自 handleModeConfirm）
    const importMode = (window as unknown as { __pfImportMode?: ImportMode }).__pfImportMode
    if (pendingImport.source === 'refine') {
      if (pendingImport.html) {
        performImport(pendingImport.html, 'replace', 'refine')
      } else if (pendingImport.presetIndex !== undefined) {
        applyPreset(pendingImport.presetIndex)
      }
    } else if (pendingImport.source === 'freeform_to_refine') {
      // 自由画布 → 精修：清空画布，进入精修模式
      if (pendingImport.html) {
        performImport(pendingImport.html, 'replace', 'refine')
      }
    } else if (pendingImport.source === 'refine_to_freeform') {
      // 精修 → 自由画布：退出精修，导入到自由画布
      if (pendingImport.html) {
        performImport(pendingImport.html, 'replace', 'freeform')
      }
    } else if (pendingImport.source === 'html' && pendingImport.html) {
      performImport(pendingImport.html, 'replace', importMode)
    } else if (pendingImport.source === 'preset' && pendingImport.presetIndex !== undefined) {
      applyPreset(pendingImport.presetIndex)
    }
    setPendingImport(null)
    // 清理暂存
    delete (window as unknown as { __pfImportMode?: ImportMode }).__pfImportMode
  }, [pendingImport, performImport, applyPreset])

  const handlePreset = useCallback(
    (index: number) => {
      const t = pageTemplates[index]
      // 精修模式下点预设模板：先弹"替换当前精修页面"确认
      if (refineSession) {
        setPendingImport({ source: 'refine', presetIndex: index })
        return
      }
      // 画布非空时弹确认
      if (nodes.length > 0) {
        setPendingImport({ source: 'preset', presetIndex: index, parsedCount: t.nodes.length })
        return
      }
      loadTemplate(t.nodes, t.canvas)
      setOpen(false)
    },
    [loadTemplate, nodes.length, refineSession],
  )

  const handleImported = useCallback(
    (meta: ImportedTemplateMeta) => {
      // 开源模板走模式选择弹窗（与粘贴/上传完全一致），
      // 模式选择弹窗里的"作为片段追加 / 仍要替换"会处理画布非空场景，
      // 所以这里不再弹独立的二次确认，避免重复弹窗
      applyImported(meta)
    },
    [applyImported],
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
  // 现在走模式选择弹窗，与粘贴/上传/开源模板路径完全一致
  const handleReimportFromHtml = useCallback(
    (meta: ImportedTemplateMeta) => {
      if (!meta.htmlPath) return
      // 直接复用 applyImported（HTML 源加载 + 模式选择弹窗）
      applyImported(meta)
    },
    [applyImported],
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

      {open && createPortal(
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
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  tab === 'preset'
                    ? 'text-white border-brand-500'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                预设模板
              </button>
              <button
                onClick={() => { setTab('imported'); setError('') }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  tab === 'imported'
                    ? 'text-white border-brand-500'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                开源模板
              </button>
              <button
                onClick={() => { setTab('paste'); setError('') }}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  tab === 'paste'
                    ? 'text-white border-brand-500'
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
                  {refineSession ? (
                    <div className="mb-4 px-3 py-2 bg-purple-900/30 rounded text-xs text-purple-300 leading-loose tracking-wide">
                      当前处于<span className="text-purple-200 font-medium">精修模式</span>，预设模板将<span className="text-purple-200">退出精修并切换到自由画布</span>加载。
                      如需保留当前精修页面，请先通过导出菜单复制 HTML。
                    </div>
                  ) : nodes.length > 0 ? (
                    <div className="mb-4 px-3 py-2 bg-amber-900/30 rounded text-xs text-amber-300 leading-loose tracking-wide">
                      当前画布有 <span className="text-amber-200 font-mono">{nodes.length}</span> 个节点，加载预设模板将<span className="text-amber-200">替换全部内容</span>（可通过 Ctrl+Z 撤销恢复）。
                      <br />
                      <span className="text-gray-500">预设模板直接以自由画布模式加载，不经过模式选择。</span>
                    </div>
                  ) : (
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-gray-400 leading-loose tracking-wide">
                      画布为空，选择预设模板将以<span className="text-gray-200">自由画布模式</span>直接加载，可拖拽编辑每个元素。
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
                        <div className="text-gray-400 text-xs mt-1 leading-relaxed">{t.description}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {tab === 'imported' && (
                <>
                  {refineSession ? (
                    <div className="mb-4 px-3 py-2 bg-purple-900/30 rounded text-xs text-purple-300 leading-loose tracking-wide">
                      当前处于<span className="text-purple-200 font-medium">精修模式</span>，导入开源模板将<span className="text-purple-200">替换当前精修页面</span>。
                      建议在模式选择中选择「精修」以保留原样式，选择「自由画布」将退出精修。
                    </div>
                  ) : nodes.length > 0 ? (
                    <div className="mb-4 px-3 py-2 bg-amber-900/30 rounded text-xs text-amber-300 leading-loose tracking-wide">
                      当前画布有 <span className="text-amber-200 font-mono">{nodes.length}</span> 个节点，导入后将弹出<span className="text-gray-200">模式选择</span>。
                      选择「自由画布」会<span className="text-amber-200">替换全部内容</span>（可通过 Ctrl+Z 撤销），选择「精修」将切换到 iframe 编辑模式。
                    </div>
                  ) : (
                    <div className="mb-4 px-3 py-2 bg-ink-700/50 rounded text-xs text-gray-400 leading-loose tracking-wide">
                      画布为空，导入后将弹出<span className="text-gray-200">模式选择</span>（自由画布 / 精修），系统会根据页面复杂度智能推荐。
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
                          <div className="text-gray-400 text-xs mt-1 leading-relaxed">{t.description}</div>
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
                    粘贴或上传 HTML 后将弹出<span className="text-gray-300">模式选择</span>对话框。
                    <br />
                    <span className="text-gray-200">自由画布</span>：将 HTML 解析为可拖拽节点，适合简单页面或组件片段。
                    <br />
                    <span className="text-purple-300">精修</span>：在页面中原样渲染，点击元素即可编辑文字/图片/链接，适合复杂布局。
                    <br />
                    <span className="text-gray-500 mt-1 block">
                      系统会根据 HTML 复杂度自动推荐模式，也可手动切换。
                    </span>
                  </div>

                  {/* 实时检测指示器 */}
                  {pasteHtml.trim() && (() => {
                    const detected = detectCompletePage(pasteHtml)
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
                              完整页面 — 导入后将弹出模式选择，推荐使用<span className="text-purple-300">精修模式</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>
                              组件片段 — 导入后将弹出模式选择，推荐使用<span className="text-gray-200">自由画布</span>
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
        </div>,
        document.body
      )}

      {/* 二次确认弹窗：导入会清空画布时弹出 */}
      {pendingImport && createPortal(
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pendingImport.source === 'refine' ? 'text-purple-300 shrink-0' : 'text-gray-400 shrink-0'}>
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h3 className="text-gray-100 font-semibold text-sm tracking-wide">
                  {pendingImport.source === 'refine' ? '替换当前精修页面？'
                    : pendingImport.source === 'freeform_to_refine' ? '切换到精修模式？'
                    : pendingImport.source === 'refine_to_freeform' ? '切换到自由画布模式？'
                    : '即将清空当前画布'}
                </h3>
              </div>
              <button
                onClick={() => setPendingImport(null)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* 内容：HTML 源 → 详细说明；模板源 → 简洁提示；精修模式替换 → 紫色主题 */}
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
                  直接导入将替换当前画布上的 {nodes.length} 个节点（可通过撤销恢复）。
                  如需保留现有内容，请选择"作为片段追加"将新内容追加到画布底部。
                </p>
              </div>
            ) : pendingImport.source === 'refine' ? (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-2">
                <p>
                  当前正在<span className="text-purple-300 mx-1">精修模式</span>，
                  导入新内容会<span className="text-purple-300 mx-1">替换当前精修页面</span>。
                </p>
                <p className="text-gray-400 text-xs leading-loose tracking-wide">
                  如需保留当前精修页面的修改，建议先通过导出菜单复制当前 HTML。
                </p>
              </div>
            ) : pendingImport.source === 'freeform_to_refine' ? (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-2">
                <p>
                  当前自由画布上有 <span className="text-gray-200 font-mono">{nodes.length}</span> 个节点，
                  切换到<span className="text-purple-300 mx-1">精修模式</span>将清空画布，
                  在 iframe 中加载新页面进行编辑。
                </p>
                <p className="text-gray-400 text-xs leading-loose tracking-wide">
                  精修模式下元素位置由原结构决定，不能像自由画布那样随意拖拽。
                  如需保留当前画布内容，请先导出或以自由画布模式导入。
                </p>
              </div>
            ) : pendingImport.source === 'refine_to_freeform' ? (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-2">
                <p>
                  当前正在<span className="text-purple-300 mx-1">精修模式</span>，
                  切换到<span className="text-gray-200 mx-1">自由画布模式</span>将退出精修，
                  并以自由画布方式导入新内容。
                </p>
                <p className="text-gray-400 text-xs leading-loose tracking-wide">
                  自由画布模式下，复杂布局（多层 flex/grid）可能错位。
                  如需保留当前精修页面的修改，建议先导出。
                </p>
              </div>
            ) : (
              <div className="px-5 py-4 text-sm text-gray-300 leading-loose tracking-wide space-y-2">
                <p>
                  {refineSession
                    ? '当前正在精修模式，加载预设模板将退出精修并替换为模板内容。'
                    : `当前预设模板加载后，画布上的 ${nodes.length} 个节点将被全部替换（可通过撤销恢复）。`}
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
                    if (pendingImport.html) {
                      const importMode = (window as unknown as { __pfImportMode?: ImportMode }).__pfImportMode
                      if (performImport(pendingImport.html, 'append', importMode)) {
                        setPendingImport(null)
                        delete (window as unknown as { __pfImportMode?: ImportMode }).__pfImportMode
                      }
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
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pendingImport.source === 'refine' || pendingImport.source === 'freeform_to_refine'
                    ? 'bg-purple-700/40 hover:bg-purple-700/60 text-purple-200 border border-purple-600/40'
                    : pendingImport.source === 'refine_to_freeform'
                    ? 'bg-brand-600/40 hover:bg-brand-600/60 text-brand-200 border border-brand-500/40'
                    : 'bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800/40'
                }`}
              >
                {pendingImport.source === 'html' ? '仍要替换'
                  : pendingImport.source === 'freeform_to_refine' ? '确认切换到精修'
                  : pendingImport.source === 'refine_to_freeform' ? '确认切换到自由画布'
                  : '确认替换'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 模式选择弹窗：所有 HTML 导入路径都先过这里 */}
      {modePrompt && (
        <ImportModeDialog
          html={modePrompt.html}
          onCancel={() => setModePrompt(null)}
          onConfirm={handleModeConfirm}
        />
      )}
    </>
  )
}