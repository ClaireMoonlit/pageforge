import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'
import { refineUndo } from '@/utils/refineUndo'
import { RefineBreadcrumb } from './RefineBreadcrumb'
import { IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustify } from './Icons'

// ═══════════════════════════════════════════════
// 与画布模式 Inspector 共享的 UI 原子
// ═══════════════════════════════════════════════

const inputCls = 'w-full bg-ink-900 border border-ink-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500'
const selectCls = 'appearance-none bg-ink-900 border border-ink-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500'
const quickStepBtnCls = 'flex-1 text-xs bg-ink-700 hover:bg-ink-600 text-gray-300 rounded py-1 transition-colors'
const sectionLabelCls = 'pt-2 border-t border-ink-700 text-xs text-gray-500'
const toggleBtnCls = (active: boolean) =>
  `px-2 py-1 text-xs rounded border transition-colors ${active ? 'bg-brand-600 border-brand-500 text-white' : 'bg-ink-700 border-ink-600 text-gray-300 hover:bg-ink-600'}`

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ label }: { label: string }) {
  return <div className={sectionLabelCls}>{label}</div>
}

const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#1e293b', '#ffffff',
  '#000000', 'transparent',
]

const FONT_FAMILIES = [
  '"Inter", system-ui, sans-serif',
  '"Space Grotesk", "Inter", sans-serif',
  '"Playfair Display", Georgia, serif',
  '"Source Sans 3", system-ui, sans-serif',
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
  '"Helvetica Neue", "Arial", sans-serif',
  '"Cormorant Garamond", Georgia, serif',
  '"Lora", Georgia, serif',
  '"DM Mono", "Courier New", monospace',
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  '"Times New Roman", serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  '"Trebuchet MS", sans-serif',
  '"Courier New", monospace',
  '"PingFang SC", "Microsoft YaHei", sans-serif',
  '"Noto Sans SC", sans-serif',
  '"LXGW WenKai", serif',
  '"ZCOOL XiaoWei", serif',
  '"Ma Shan Zheng", cursive',
]

/** HTML 标签名 → 组件类型中文名（与画布模式 TYPE_LABEL 对应） */
const HTML_TAG_TYPE_LABEL: Record<string, string> = {
  h1: '标题', h2: '标题', h3: '标题', h4: '标题', h5: '标题', h6: '标题',
  p: '正文', span: '文本', div: '容器', section: '区块', article: '文章',
  header: '页头', footer: '页脚', nav: '导航', main: '主体', aside: '侧栏',
  img: '图片', a: '链接', button: '按钮', input: '输入框', textarea: '文本域',
  ul: '列表', ol: '列表', li: '列表项', table: '表格', form: '表单',
  video: '视频', iframe: '嵌入', hr: '分隔线', br: '换行',
  figure: '图表', figcaption: '图表标题', blockquote: '引用',
  pre: '代码块', code: '代码', label: '标签', select: '下拉框',
  svg: '图标', i: '图标', em: '强调', strong: '强调', small: '小字',
  area: '区域', map: '图片映射', canvas: '画布',
}

/** 常见 Bootstrap / 组件库的语义类名 → 中文标签（用于精修模式顶部标题，更贴近用户认知） */
const SEMANTIC_CLASS_LABEL: Record<string, string> = {
  // Bootstrap 按钮/链接
  btn: '按钮', 'btn-primary': '按钮', 'btn-secondary': '按钮', 'btn-outline': '按钮',
  // Bootstrap 导航
  navbar: '导航栏', 'navbar-brand': '导航品牌', 'navbar-nav': '导航菜单',
  'nav-link': '导航链接', 'nav-item': '导航项',
  // 卡片
  card: '卡片', 'card-body': '卡片内容', 'card-title': '卡片标题', 'card-img': '卡片图片',
  // 表单
  'form-control': '输入框', 'form-group': '表单组', 'form-label': '表单标签',
  // 布局
  container: '容器', row: '行', col: '列', 'col-md': '列', 'col-lg': '列', 'col-sm': '列',
  // 文本
  lead: '标题文本', display: '大标题', 'text-muted': '辅助文字', 'text-primary': '主要文字',
  // 列表
  list: '列表', 'list-group': '列表组', 'list-item': '列表项',
  // 表格
  table: '表格', 'table-row': '表格行', 'table-cell': '表格单元格',
}

/** 根据元素（tag + class）智能选择最贴近用户的"组件类型"标签
 *  优先级：class（语义类）> tag（HTML 标签） */
function getElementTypeLabel(tagName: string, className?: string): string {
  const tag = tagName.toLowerCase()
  if (className) {
    const firstCls = className.split(/\s+/)[0]?.toLowerCase()
    if (firstCls && SEMANTIC_CLASS_LABEL[firstCls]) {
      return SEMANTIC_CLASS_LABEL[firstCls]
    }
  }
  return HTML_TAG_TYPE_LABEL[tag] || tag
}

/** 旧接口：仅根据标签名获取组件类型中文名（保留供面包屑等需要纯 tag 信息的场景） */
function getTagTypeLabel(tagName: string): string {
  return HTML_TAG_TYPE_LABEL[tagName.toLowerCase()] || tagName
}

function normalizeColor(c?: string): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#000000'
}

function parseNumericValue(raw?: string, defaultVal = 0, defaultUnit = 'px'): { val: number; unit: string } {
  if (!raw) return { val: defaultVal, unit: defaultUnit }
  if (raw === 'auto') return { val: 0, unit: 'auto' }
  const first = raw.split(/\s+/)[0]
  const m = first.match(/^([\d.]+)\s*(px|rem|em|pt|%|vw|vh|ms)?$/i)
  if (m) return { val: parseFloat(m[1]), unit: m[2] || defaultUnit }
  return { val: defaultVal, unit: defaultUnit }
}

// ═══════════════════════════════════════════════
// iframe 元素操作辅助
// ═══════════════════════════════════════════════

function getElementByEid(eid: string): HTMLElement | null {
  const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
  const doc = iframe?.contentDocument
  if (!doc) return null
  return doc.querySelector(`[data-pf-eid="${eid}"]`) as HTMLElement | null
}

function refreshSelection() {
  const state = useEditorStore.getState()
  const sel = state.refineSession?.selectedElement
  if (!sel) return
  const el = getElementByEid(sel.attributes['data-pf-eid'] || '')
  if (el) {
    const rect = el.getBoundingClientRect()
    const attributes: Record<string, string> = {}
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'style') continue
      attributes[attr.name] = attr.value
    }
    state.selectRefineElement({
      tagName: el.tagName.toLowerCase(),
      textContent: el.textContent ?? '',
      attributes,
      inlineStyle: el.style?.cssText ?? '',
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    })
  }
}

// ═══════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════

export function RefineInspector() {
  const refineSession = useEditorStore((s) => s.refineSession)
  const selectedElement = refineSession?.selectedElement ?? null
  const refinePreviewMode = useEditorStore((s) => s.refinePreviewMode)
  const collapsed = useEditorStore((s) => s.rightPanelCollapsed)
  const toggle = useEditorStore((s) => s.toggleRightPanel)

  if (!refineSession) return null

  /** 头部删除按钮 —— 与画布模式统一：触发自定义事件，RefineCanvas 监听并执行实际删除 */
  const handleHeaderDelete = () => {
    if (!selectedElement) return
    window.dispatchEvent(new CustomEvent('pf-refine-delete-selected'))
  }

  const typeLabel = selectedElement
    ? getElementTypeLabel(selectedElement.tagName, selectedElement.attributes.class)
    : ''

  // 折叠态：仅显示窄条 + 展开按钮（与画布模式 Inspector 一致）
  if (collapsed) {
    return (
      <div className="w-10 shrink-0 bg-ink-800 border-l border-ink-700 flex flex-col items-center pt-3 transition-all duration-200">
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded text-gray-300 hover:text-gray-100 hover:bg-ink-700 transition-colors"
          title="展开属性面板"
          aria-label="展开属性面板"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          className="mt-3 text-[11px] text-gray-500 tracking-wider"
          style={{ writingMode: 'vertical-rl' }}
        >
          属性
        </div>
      </div>
    )
  }

  return (
    <div className="pf-right-panel w-64 shrink-0 bg-ink-800 border-l border-ink-700 overflow-y-auto transition-all duration-200">
      <div className="p-3 border-b border-ink-700 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-gray-200">精修模式</span>
          {selectedElement && (
            <span className="text-xs text-gray-500 truncate">· {typeLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedElement && !refinePreviewMode && (
            <button
              onClick={handleHeaderDelete}
              className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-ink-700 transition-colors"
              title="删除选中元素"
            >
              删除
            </button>
          )}
          <button
            onClick={toggle}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-100 hover:bg-ink-700 transition-colors"
            title="收起属性面板"
            aria-label="收起属性面板"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <RefineBreadcrumb />

      {refinePreviewMode ? (
        <div className="p-5 text-center text-gray-300 text-sm leading-relaxed">
          <div className="mb-2 text-gray-200 font-medium">预览模式</div>
          <div className="text-xs leading-loose text-gray-400">
            退出预览后可继续编辑元素
            <br />
            预览时链接/按钮可正常交互
          </div>
        </div>
      ) : !selectedElement ? (
        <div className="p-5 text-center text-gray-300 text-sm leading-relaxed">
          <div className="mb-2 text-gray-200 font-medium">未选中元素</div>
          <div className="text-xs leading-loose text-gray-400">
            点击画布中的任意元素
            <br />
            即可在此编辑
          </div>
        </div>
      ) : (
        <RefineElementEditor element={selectedElement} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
// 元素编辑器
// ═══════════════════════════════════════════════

function RefineElementEditor({ element }: { element: RefineElementInfo }) {
  const eid = element.attributes['data-pf-eid'] || ''

  /** 应用样式并记录 undo */
  const applyStyle = useCallback((prop: string, value: string) => {
    const el = getElementByEid(eid)
    if (!el) return
    const old = el.style.getPropertyValue(prop)
    el.style.setProperty(prop, value)
    refineUndo.recordDebounced({
      label: 'style',
      execute: () => { const t = getElementByEid(eid); if (t) t.style.setProperty(prop, value) },
      rollback: () => { const t = getElementByEid(eid); if (t) t.style.setProperty(prop, old) },
    })
    refreshSelection()
  }, [eid])

  const getComputed = useCallback((): CSSStyleDeclaration | null => {
    const el = getElementByEid(eid)
    if (!el) return null
    const win = (document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null)?.contentWindow
    if (!win) return null
    return win.getComputedStyle(el)
  }, [eid])

  const getStyleValue = useCallback((prop: string): string => {
    const el = getElementByEid(eid)
    if (el && el.style.getPropertyValue(prop)) return el.style.getPropertyValue(prop)
    const cs = getComputed()
    return cs?.getPropertyValue(prop) ?? ''
  }, [eid, getComputed])

  const tag = element.tagName.toLowerCase()
  const isTextLike = element.textContent.trim().length > 0 && !['img', 'video', 'iframe', 'hr', 'br', 'input', 'textarea', 'select'].includes(tag)
  const isContainer = ['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'figure', 'li', 'ul', 'ol'].includes(tag)
  // 主标签：优先根据 class 推断（如 a.btn → 按钮），否则按 tag（如 a → 链接）
  const typeLabel = getElementTypeLabel(element.tagName, element.attributes.class)
  // 副标签：HTML 标签（仅当主标签来源是 class 时显示，避免重复）
  const primaryFromClass = element.attributes.class
    && SEMANTIC_CLASS_LABEL[element.attributes.class.split(/\s+/)[0]?.toLowerCase() || '']
  const tagBadge = primaryFromClass ? `<${tag}>` : null

  // 判断元素是否有特定属性
  const hasSrc = 'src' in element.attributes
  const hasHref = 'href' in element.attributes
  const hasAlt = 'alt' in element.attributes
  const hasTitle = 'title' in element.attributes
  const hasLinkAttrs = hasSrc || hasHref || hasAlt || hasTitle

  return (
    <div className="p-3 space-y-3">
      {/* 标签 + ID（主标签为中文组件类型，如「按钮」「链接」；如来源是 class，附 HTML 标签作为副信息） */}
      <div className="flex items-center gap-2 flex-wrap">
        <code className="px-1.5 py-0.5 bg-brand-500/20 text-brand-100 border border-brand-200/40 rounded font-mono text-xs">
          {typeLabel}
        </code>
        {tagBadge && (
          <code className="px-1.5 py-0.5 bg-ink-700 text-gray-400 rounded font-mono text-[10px]" title="HTML 标签">
            {tagBadge}
          </code>
        )}
        {element.attributes.id && (
          <code className="px-1.5 py-0.5 bg-ink-700 text-gray-400 rounded font-mono text-[10px] truncate max-w-[120px]" title="元素 ID">
            #{element.attributes.id}
          </code>
        )}
        {element.attributes.class && (
          <code className="px-1.5 py-0.5 bg-ink-700 text-emerald-300 rounded font-mono text-[10px] truncate max-w-[120px]" title="class 列表">
            .{element.attributes.class.split(' ').slice(0, 2).join(' .')}
          </code>
        )}
      </div>

      {/* 文本内容 */}
      {element.textContent.trim() && (
        <RefineTextEditor element={element} />
      )}

      {/* 字体样式（文本类元素） */}
      {isTextLike && (
        <>
          <SectionLabel label="字体" />

          <Field label="字体">
            <select
              value={getStyleValue('font-family')}
              onChange={(e) => applyStyle('font-family', e.target.value)}
              className={selectCls + ' w-full'}
            >
              <option value="">默认</option>
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>

          <RefineColorPicker
            label="字色"
            value={getStyleValue('color')}
            onChange={(v) => applyStyle('color', v)}
          />

          <NumberUnitFieldRefine
            label="字号"
            value={getStyleValue('font-size')}
            onChange={(v) => applyStyle('font-size', v)}
            units={['px', 'rem', 'em', 'pt']}
            min={8} max={120} step={2} placeholder="16px"
          />

          <div className="flex gap-1">
            <button onClick={() => { const v = parseFloat(getStyleValue('font-size')) || 16; applyStyle('font-size', `${Math.max(8, v - 2)}px`) }} className={quickStepBtnCls}>A-</button>
            <button onClick={() => { const v = parseFloat(getStyleValue('font-size')) || 16; applyStyle('font-size', `${Math.min(120, v + 2)}px`) }} className={quickStepBtnCls}>A+</button>
          </div>

          {/* B / I / U / S 切换 */}
          <Field label="样式">
            <div className="flex gap-1">
              <button onClick={() => { const v = getStyleValue('font-weight'); applyStyle('font-weight', v === '700' ? '400' : '700') }} className={toggleBtnCls(getStyleValue('font-weight') === '700')} title="粗体">B</button>
              <button onClick={() => { const v = getStyleValue('font-style'); applyStyle('font-style', v === 'italic' ? 'normal' : 'italic') }} className={toggleBtnCls(getStyleValue('font-style') === 'italic')} title="斜体">I</button>
              <button onClick={() => { const v = getStyleValue('text-decoration'); applyStyle('text-decoration', v?.includes('underline') ? 'none' : 'underline') }} className={toggleBtnCls(getStyleValue('text-decoration')?.includes('underline') || false)} title="下划线">U</button>
              <button onClick={() => { const v = getStyleValue('text-decoration'); applyStyle('text-decoration', v?.includes('line-through') ? 'none' : 'line-through') }} className={toggleBtnCls(getStyleValue('text-decoration')?.includes('line-through') || false)} title="删除线">S</button>
            </div>
          </Field>

          <Field label="粗细">
            <select
              value={getStyleValue('font-weight') || '400'}
              onChange={(e) => applyStyle('font-weight', e.target.value)}
              className={selectCls + ' w-full'}
            >
              <option value="300">Light (300)</option>
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semi Bold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra Bold (800)</option>
              <option value="900">Black (900)</option>
            </select>
          </Field>

          <NumberUnitFieldRefine
            label="行高"
            value={getStyleValue('line-height')}
            onChange={(v) => applyStyle('line-height', v)}
            units={['px', 'em', 'rem', '%']}
            min={0} max={200} step={1} placeholder="1.5"
          />

          <NumberUnitFieldRefine
            label="字距"
            value={getStyleValue('letter-spacing')}
            onChange={(v) => applyStyle('letter-spacing', v)}
            units={['px', 'em', 'rem']}
            min={-10} max={50} step={0.5} placeholder="0px"
          />

          <Field label="对齐">
            <div className="flex gap-1">
              {([
                { value: 'left', icon: <IconAlignLeft size={14} />, title: '左对齐' },
                { value: 'center', icon: <IconAlignCenter size={14} />, title: '居中' },
                { value: 'right', icon: <IconAlignRight size={14} />, title: '右对齐' },
                { value: 'justify', icon: <IconAlignJustify size={14} />, title: '两端对齐' },
              ] as const).map((align) => (
                <button
                  key={align.value}
                  onClick={() => applyStyle('text-align', align.value)}
                  className={toggleBtnCls(getStyleValue('text-align') === align.value)}
                  title={align.title}
                >
                  {align.icon}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {/* 外观（容器类元素） */}
      {isContainer && (
        <>
          <SectionLabel label="外观" />
          <RefineColorPicker
            label="背景色"
            value={getStyleValue('background-color')}
            onChange={(v) => applyStyle('background-color', v)}
          />
          <NumberUnitFieldRefine
            label="内边距"
            value={getStyleValue('padding')}
            onChange={(v) => applyStyle('padding', v)}
            units={['px', 'rem', 'em', '%']}
            min={0} max={200} step={4} placeholder="16px"
          />
          <NumberUnitFieldRefine
            label="圆角"
            value={getStyleValue('border-radius')}
            onChange={(v) => applyStyle('border-radius', v)}
            units={['px', 'rem', 'em', '%']}
            min={0} max={200} step={2} placeholder="8px"
          />
        </>
      )}

      {/* 元素属性（与画布模式统一：仅当元素有对应属性时显示） */}
      {hasLinkAttrs && (
        <>
          <SectionLabel label="元素属性" />
          {hasSrc && <RefineAttributeEditor element={element} attrName="src" label="图片地址" placeholder="https://..." />}
          {hasHref && <RefineAttributeEditor element={element} attrName="href" label="链接地址" placeholder="https://..." />}
          {hasAlt && <RefineAttributeEditor element={element} attrName="alt" label="图片描述" placeholder="未设置（描述图片内容）" />}
          {hasTitle && <RefineAttributeEditor element={element} attrName="title" label="提示文字" placeholder="未设置（鼠标悬停时显示）" />}
        </>
      )}

      {/* 位置 / 尺寸 */}
      <SectionLabel label="位置与尺寸" />
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
  )
}

// ═══════════════════════════════════════════════
// 文本编辑（实时生效，debounce 300ms）
// ═══════════════════════════════════════════════

function RefineTextEditor({ element }: { element: RefineElementInfo }) {
  const [editingText, setEditingText] = useState(element.textContent)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>()
  const eid = element.attributes['data-pf-eid'] || ''

  useEffect(() => {
    setEditingText(element.textContent)
    // 如果本次选中来自双击（RefineCanvas onDblClick 设置了标志），
    // 在 React 完成 DOM 更新后自动聚焦 textarea 并将光标置于末尾
    if ((window as any).__pfJustDoubleClicked) {
      delete (window as any).__pfJustDoubleClicked
      // setTimeout(0) 确保在 React 完成当前渲染周期（包括 setEditingText 触发的重渲染）后再聚焦
      setTimeout(() => {
        const textEditor = document.querySelector('[data-pf-refine-text-editor]') as HTMLTextAreaElement | null
        if (textEditor) {
          textEditor.focus()
          textEditor.setSelectionRange(textEditor.value.length, textEditor.value.length)
        }
      }, 0)
    }
  }, [element.textContent, element.tagName])

  /** 实时写入 iframe DOM（debounce 300ms） */
  const applyTextDebounced = useCallback((text: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const el = getElementByEid(eid)
      if (!el) return
      const oldText = el.textContent ?? ''
      if (text === oldText) return
      el.textContent = text
      refineUndo.recordDebounced({
        label: 'text',
        execute: () => { const t = getElementByEid(eid); if (t) t.textContent = text },
        rollback: () => { const t = getElementByEid(eid); if (t) t.textContent = oldText },
      })
      refreshSelection()
    }, 300)
  }, [eid])

  // 清理 timer
  useEffect(() => {
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [])

  return (
    <Field label="文字内容">
      <textarea
        value={editingText}
        onChange={(e) => {
          setEditingText(e.target.value)
          applyTextDebounced(e.target.value)
        }}
        rows={Math.min(6, Math.max(2, Math.ceil(editingText.length / 40)))}
        className={inputCls + ' resize-y'}
        spellCheck={false}
        data-pf-refine-text-editor=""
      />
    </Field>
  )
}

// ═══════════════════════════════════════════════
// 颜色选择器（预设 + 原生取色器）
// ═══════════════════════════════════════════════

function RefineColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // 当前颜色：用于顶部预览。优先用 value（用户当前设置），
  // 若 value 是 CSS 变量或非标准色（如 'rgba(...)'/'var(--x)'），预览区用占位斜线表达
  const currentDisplay = (() => {
    if (!value) return null
    if (value === 'transparent') return 'transparent'
    // 标准 hex / rgb 颜色 → 可直接预览
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value
    if (/^rgba?\(/i.test(value)) return value
    // CSS 变量 / 其他 → 显示占位
    return null
  })()
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {/* 当前颜色预览条：实时显示当前值，取色器选完也能看到 */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-7 h-7 rounded border border-ink-600 shrink-0"
            style={{
              backgroundColor: currentDisplay || 'transparent',
              backgroundImage: currentDisplay
                ? undefined
                : 'linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555), linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555)',
              backgroundSize: currentDisplay ? undefined : '8px 8px',
              backgroundPosition: currentDisplay ? undefined : '0 0, 4px 4px',
            }}
            title={value ? `当前：${value}` : '未设置'}
          />
          <div className="flex-1 min-w-0 px-1.5 py-1 bg-ink-900 border border-ink-600 rounded text-[11px] text-gray-300 font-mono truncate" title={value || ''}>
            {value || '未设置'}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange('transparent')}
              className="shrink-0 px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-200 hover:bg-ink-700 rounded transition-colors"
              title="清除颜色（设为 transparent）"
            >
              清除
            </button>
          )}
        </div>
        {/* 预设色板 + 取色器 */}
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => onChange(color === 'transparent' ? 'transparent' : color)}
              className="w-5 h-5 rounded border border-ink-600 hover:scale-110 transition-transform"
              style={{
                backgroundColor: color === 'transparent' ? 'transparent' : color,
                backgroundImage: color === 'transparent'
                  ? 'linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555), linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555)'
                  : undefined,
                backgroundSize: color === 'transparent' ? '8px 8px' : undefined,
                backgroundPosition: color === 'transparent' ? '0 0, 4px 4px' : undefined,
                outline: value === color ? '2px solid #a855f7' : 'none',
                outlineOffset: 1,
              }}
              title={color}
            />
          ))}
          {/* 原生取色器 - 带吸管图标 */}
          <label className="relative w-5 h-5 rounded border border-ink-600 cursor-pointer flex items-center justify-center bg-ink-800 hover:bg-ink-700 transition-colors" title="取色器">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <input
              type="color"
              value={normalizeColor(value)}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              style={{ padding: 0 }}
            />
          </label>
        </div>
      </div>
    </Field>
  )
}

// ═══════════════════════════════════════════════
// 数值 + 单位编辑
// ═══════════════════════════════════════════════

function NumberUnitFieldRefine({
  label,
  value,
  onChange,
  units = ['px', 'rem', 'em', '%'],
  min = 0,
  max = 9999,
  step = 1,
  placeholder = '',
}: {
  label: string
  value: string | undefined
  onChange: (newValue: string) => void
  units?: string[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
}) {
  const parsed = parseNumericValue(value, 0, units[0] ?? 'px')
  const unit = parsed.unit

  const apply = useCallback(
    (newVal: number, newUnit: string) => {
      if (newUnit === 'auto') { onChange('auto') }
      else { onChange(`${newVal}${newUnit}`) }
    },
    [onChange],
  )

  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={unit === 'auto' ? '' : parsed.val}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) {
              const u = unit === 'auto' ? (units.find(u => u !== 'auto') ?? 'px') : unit
              apply(v, u)
            }
          }}
          className={inputCls + ' flex-1'}
          placeholder={placeholder || (unit === 'auto' ? 'auto' : '')}
          min={min}
          max={max}
          step={step}
        />
        <select
          value={unit}
          onChange={(e) => {
            const newUnit = e.target.value
            if (newUnit === 'auto') { onChange('auto') }
            else { apply(parsed.val, newUnit) }
          }}
          className={selectCls + ' w-14'}
        >
          {units.map((u) => (<option key={u} value={u}>{u}</option>))}
        </select>
      </div>
    </Field>
  )
}

// ═══════════════════════════════════════════════
// 属性编辑器
// ═══════════════════════════════════════════════

function RefineAttributeEditor({
  element,
  attrName,
  label,
  placeholder,
}: {
  element: RefineElementInfo
  attrName: string
  label: string
  placeholder?: string
}) {
  const [value, setValue] = useState(element.attributes[attrName] ?? '')
  useEffect(() => { setValue(element.attributes[attrName] ?? '') }, [element.attributes, attrName])

  const eid = element.attributes['data-pf-eid'] || ''

  const apply = () => {
    const el = getElementByEid(eid)
    if (!el) return
    const oldValue = el.getAttribute(attrName) ?? ''
    el.setAttribute(attrName, value)
    if (value !== oldValue) {
      refineUndo.record({
        label: 'attr',
        execute: () => { const t = getElementByEid(eid); if (t) t.setAttribute(attrName, value) },
        rollback: () => { const t = getElementByEid(eid); if (t) t.setAttribute(attrName, oldValue) },
      })
    }
    refreshSelection()
  }

  if (!(attrName in element.attributes)) return null

  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={apply}
          className={inputCls + ' flex-1 font-mono'}
          spellCheck={false}
          placeholder={placeholder || ''}
        />
        <button
          onClick={apply}
          className="px-2 py-1 rounded text-xs bg-ink-700 hover:bg-ink-600 text-gray-300 transition-colors"
          title="应用"
        >
          ✓
        </button>
      </div>
    </Field>
  )
}

// ═══════════════════════════════════════════════
// 复制 HTML（已移至导出菜单，参见 Toolbar.tsx）
// ═══════════════════════════════════════════════