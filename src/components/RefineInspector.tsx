import { useEffect, useState } from 'react'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'

/**
 * 精修模式属性面板
 *
 * 在精修模式下显示，展示当前选中的 iframe 元素的：
 * - 标签信息（tagName / class / id）
 * - 文本内容（可编辑，写回 iframe DOM）
 * - 关键属性（src / alt / href 等，可编辑）
 * - 屏幕坐标信息（只读）
 *
 * 与普通 Inspector 互斥：RefineCanvas 激活时 Canvas 切换为 iframe，
 * Inspector 也切换为 RefineInspector（由 App.tsx 路由）。
 */
export function RefineInspector() {
  const refineSession = useEditorStore((s) => s.refineSession)
  const selectedElement = refineSession?.selectedElement ?? null
  const exitRefine = useEditorStore((s) => s.exitRefine)

  if (!refineSession) return null

  return (
    <div className="w-72 shrink-0 bg-ink-800 border-l border-ink-700 overflow-y-auto transition-all duration-200">
      {/* 标题栏 */}
      <div className="p-3 border-b border-ink-700 flex items-center justify-between bg-purple-900/20">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-purple-400"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span className="text-sm text-purple-200 font-medium">精修模式</span>
        </div>
        <button
          onClick={exitRefine}
          className="text-xs px-2 py-1 rounded text-gray-300 hover:text-white hover:bg-ink-700 transition-colors"
          title="退出精修模式"
        >
          退出
        </button>
      </div>

      {!selectedElement ? (
        <div className="p-5 text-center text-gray-500 text-sm leading-relaxed">
          <div className="mb-2 text-gray-400">未选中元素</div>
          <div className="text-xs leading-loose">
            点击画布中的任意元素
            <br />
            即可在此编辑
          </div>
        </div>
      ) : (
        <RefineElementEditor element={selectedElement} />
      )}

      {/* 底部：操作按钮组 */}
      <div className="p-3 border-t border-ink-700 space-y-2">
        <CopyHtmlButton />
        <button
          onClick={exitRefine}
          className="w-full px-3 py-1.5 rounded text-xs text-gray-300 hover:text-white hover:bg-ink-700 border border-ink-600 transition-colors"
        >
          退出精修模式
        </button>
      </div>
    </div>
  )
}

/**
 * 元素编辑器：展示选中元素的所有信息并提供编辑入口
 */
function RefineElementEditor({ element }: { element: RefineElementInfo }) {
  const [editingText, setEditingText] = useState(element.textContent)
  // 每次选中新元素时重置编辑态
  useEffect(() => {
    setEditingText(element.textContent)
  }, [element.textContent, element.tagName])

  /**
   * 写入文本到 iframe DOM 并同步 store
   */
  const applyText = () => {
    const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
    if (!iframe?.contentDocument) return
    // 找到当前选中的元素：用 store 中保存的 rect + tagName 匹配
    // 简单做法：遍历 iframe 文档找匹配的元素（用 tagName + textContent 旧值）
    const all = iframe.contentDocument.querySelectorAll(element.tagName)
    let target: HTMLElement | null = null
    for (const el of Array.from(all)) {
      if ((el as HTMLElement).textContent === element.textContent) {
        target = el as HTMLElement
        break
      }
    }
    // 如果找不到完全匹配的（用户编辑过程中 textContent 已变），用第一个匹配 tagName
    if (!target && all.length > 0) target = all[0] as HTMLElement
    if (target) {
      target.textContent = editingText
      // 写入后同步 store 里的 textContent 和 rect
      const newRect = target.getBoundingClientRect()
      useEditorStore.getState().selectRefineElement({
        ...element,
        textContent: editingText,
        rect: {
          left: newRect.left,
          top: newRect.top,
          width: newRect.width,
          height: newRect.height,
        },
      })
    }
  }

  return (
    <div className="p-3 space-y-3">
      {/* 标签信息 */}
      <div className="space-y-1">
        <div className="text-xs text-gray-500">标签</div>
        <div className="flex items-center gap-2 text-sm">
          <code className="px-1.5 py-0.5 bg-ink-700 text-purple-300 rounded font-mono">
            &lt;{element.tagName}&gt;
          </code>
          {element.attributes.id && (
            <code className="px-1.5 py-0.5 bg-ink-700 text-blue-300 rounded font-mono text-xs">
              #{element.attributes.id}
            </code>
          )}
          {element.attributes.class && (
            <code className="px-1.5 py-0.5 bg-ink-700 text-green-300 rounded font-mono text-xs truncate max-w-[140px]">
              .{element.attributes.class.split(' ')[0]}
            </code>
          )}
        </div>
      </div>

      {/* 文本编辑（仅在元素有文本时显示） */}
      {element.textContent.trim() && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500 flex items-center justify-between">
            <span>文本内容</span>
            <span className="text-gray-600 text-[10px]">{element.textContent.length} 字</span>
          </div>
          <textarea
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={applyText}
            rows={Math.min(6, Math.max(2, Math.ceil(editingText.length / 40)))}
            className="w-full bg-ink-900 border border-ink-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-brand-500 resize-y"
            spellCheck={false}
          />
          <button
            onClick={applyText}
            className="w-full px-2 py-1 rounded text-xs bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            应用到页面
          </button>
        </div>
      )}

      {/* 关键属性（src / href / alt） */}
      <RefineAttributeEditor element={element} attrName="src" label="资源地址 (src)" />
      <RefineAttributeEditor element={element} attrName="href" label="链接 (href)" />
      <RefineAttributeEditor element={element} attrName="alt" label="替代文本 (alt)" />
      <RefineAttributeEditor element={element} attrName="title" label="标题 (title)" />

      {/* 屏幕坐标（只读） */}
      <div className="space-y-1 pt-2 border-t border-ink-700">
        <div className="text-xs text-gray-500">位置 / 尺寸</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-ink-900 px-2 py-1 rounded">
            <span className="text-gray-500">X </span>
            <span className="text-gray-300 font-mono">{Math.round(element.rect.left)}</span>
          </div>
          <div className="bg-ink-900 px-2 py-1 rounded">
            <span className="text-gray-500">Y </span>
            <span className="text-gray-300 font-mono">{Math.round(element.rect.top)}</span>
          </div>
          <div className="bg-ink-900 px-2 py-1 rounded">
            <span className="text-gray-500">W </span>
            <span className="text-gray-300 font-mono">{Math.round(element.rect.width)}</span>
          </div>
          <div className="bg-ink-900 px-2 py-1 rounded">
            <span className="text-gray-500">H </span>
            <span className="text-gray-300 font-mono">{Math.round(element.rect.height)}</span>
          </div>
        </div>
      </div>

      {/* 内联样式（只读） */}
      {element.inlineStyle && (
        <div className="space-y-1 pt-2 border-t border-ink-700">
          <div className="text-xs text-gray-500">内联样式</div>
          <div className="bg-ink-900 px-2 py-1.5 rounded text-xs font-mono text-gray-400 max-h-24 overflow-y-auto break-all">
            {element.inlineStyle}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 单个属性编辑器（src/href/alt/title）：元素没有该属性时自动跳过
 */
function RefineAttributeEditor({
  element,
  attrName,
  label,
}: {
  element: RefineElementInfo
  attrName: string
  label: string
}) {
  const [value, setValue] = useState(element.attributes[attrName] ?? '')
  useEffect(() => {
    setValue(element.attributes[attrName] ?? '')
  }, [element.attributes, attrName])

  const apply = () => {
    const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
    if (!iframe?.contentDocument) return
    const all = iframe.contentDocument.querySelectorAll(element.tagName)
    let target: Element | null = null
    for (const el of Array.from(all)) {
      if (el.getAttribute(attrName) === element.attributes[attrName]) {
        target = el
        break
      }
    }
    if (!target && all.length > 0) target = all[0]
    if (target) {
      target.setAttribute(attrName, value)
      // 同步 store
      const newAttrs = { ...element.attributes, [attrName]: value }
      const newRect = (target as HTMLElement).getBoundingClientRect()
      useEditorStore.getState().selectRefineElement({
        ...element,
        attributes: newAttrs,
        rect: {
          left: newRect.left,
          top: newRect.top,
          width: newRect.width,
          height: newRect.height,
        },
      })
    }
  }

  // 仅在元素原有该属性、或该属性是该标签的常见属性时显示
  // 这里简化处理：只在 element.attributes 中存在时显示编辑（避免界面过于杂乱）
  if (!(attrName in element.attributes)) return null

  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={apply}
          className="flex-1 bg-ink-900 border border-ink-600 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-brand-500 font-mono"
          spellCheck={false}
        />
        <button
          onClick={apply}
          className="px-2 py-1 rounded text-xs bg-ink-700 hover:bg-ink-600 text-gray-300 transition-colors"
          title="应用"
        >
          ✓
        </button>
      </div>
    </div>
  )
}

/**
 * 复制最新 HTML 按钮：将 iframe 当前内容序列化为 HTML 字符串，复制到剪贴板
 */
function CopyHtmlButton() {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    const html = useEditorStore.getState().serializeRefineHtml()
    if (!html) return
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('[RefineInspector] 复制失败', e)
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="w-full px-3 py-1.5 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white transition-colors"
    >
      {copied ? '✓ 已复制 HTML' : '复制当前页面 HTML'}
    </button>
  )
}
