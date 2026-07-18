import { useState, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useEditorStore, useSelectedNode } from '@/store/editorStore'
import type { NodeStyle, NodeProps, InteractionConfig, ClickActionType, HoverEffectType, AnimationType, AnimationTrigger, AnimationConfig } from '@/types'
import { SVG_ICON_PRESETS, SVG_ICON_MAP, IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustify } from '@/components/Icons'
import { readFileAsDataUrl, validateFileSize, validateFileType } from '@/utils/fileUpload'

const inputCls =
  'w-full bg-ink-900 border border-ink-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500'

const selectCls =
  'appearance-none bg-ink-900 border border-ink-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-brand-500'

const quickStepBtnCls =
  'flex-1 text-xs bg-ink-700 hover:bg-ink-600 text-gray-300 rounded py-1 transition-colors'

const sectionLabelCls = 'pt-2 border-t border-ink-700 text-xs text-gray-500'

const toggleBtnCls = (active: boolean) =>
  `px-2 py-1 text-xs rounded border transition-colors ${active
    ? 'bg-brand-600 border-brand-500 text-white'
    : 'bg-ink-700 border-ink-600 text-gray-300 hover:bg-ink-600'}`

// === 图标预设：SVG 优先（无填色），后跟 emoji 备选 ===
const SVG_PRESET_NAMES = SVG_ICON_PRESETS.map((p) => p.name)
const EMOJI_ICON_PRESETS = [
  '⭐', '🔥', '💡', '🚀', '💎', '✅', '❌', '⚡', '🎯',
  '📌', '❤️', '👍', '👎', '🎨', '🔧', '📦', '🔍', '💬', '📧',
  '🏠', '📱', '🖥️', '🌐', '📷', '🎵', '🎬', '📝', '⏰', '🔔',
  '➡️', '⬇️', '🔗', '➕', '➖', '✏️', '🔄', '⚙️', '📊', '🏆',
]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

/** 文件上传字段：隐藏 input + 按钮 + 状态提示 */
function FileUploadField({
  accept,
  maxSizeMB,
  label,
  onUpload,
  currentValue,
}: {
  accept: string
  maxSizeMB: number
  label: string
  onUpload: (dataUrl: string) => void
  currentValue?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState(false)

  // 当 currentValue 变化时重置上传状态
  useLayoutEffect(() => {
    setUploaded(!!(currentValue && currentValue.startsWith('data:')))
  }, [currentValue])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 校验文件类型
    const typeResult = validateFileType(file, [accept])
    if (!typeResult.valid) {
      setError(typeResult.message)
      setTimeout(() => setError(''), 3000)
      // 重置 input 以便重新选择同一文件
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    // 校验文件大小
    const sizeResult = validateFileSize(file, maxSizeMB)
    if (!sizeResult.valid) {
      setError(sizeResult.message)
      setTimeout(() => setError(''), 3000)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    setError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      onUpload(dataUrl)
      setUploaded(true)
    } catch (err) {
      setError(`文件读取失败: ${file.name}`)
      setTimeout(() => setError(''), 3000)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`px-2 py-1 text-xs rounded border transition-colors ${
            uploading
              ? 'bg-ink-600 border-ink-500 text-gray-400 cursor-not-allowed'
              : uploaded
              ? 'bg-ink-700 border-ink-500 text-gray-300'
              : 'bg-ink-700 border-ink-600 text-gray-300 hover:bg-ink-600'
          }`}
        >
          {uploading ? '读取中...' : uploaded ? '重新上传' : label}
        </button>
        {uploaded && currentValue && (
          <span className="text-[10px] text-gray-500 truncate max-w-[160px]" title={currentValue}>
            {currentValue.startsWith('data:') ? '本地文件' : currentValue}
          </span>
        )}
      </div>
      {error && (
        <div className="mt-1 text-xs text-red-400">{error}</div>
      )}
    </div>
  )
}

function SectionLabel({ label }: { label: string }) {
  return <div className={sectionLabelCls}>{label}</div>
}

function normalizeColor(c?: string): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#000000'
}

/** 解析任意 CSS 数值字符串，返回 {数值, 单位}。支持 "320px" / "50%" / "auto" / "" */
function parseNumericValue(raw?: string, defaultVal = 0, defaultUnit = 'px'): { val: number; unit: string } {
  if (!raw) return { val: defaultVal, unit: defaultUnit }
  if (raw === 'auto') return { val: 0, unit: 'auto' }
  // 支持 shorthand 值（如 '16px 40px' → 取第一个值 16px）
  const first = raw.split(/\s+/)[0]
  const m = first.match(/^([\d.]+)\s*(px|rem|em|pt|%|vw|vh|ms)?$/i)
  if (m) return { val: parseFloat(m[1]), unit: m[2] || defaultUnit }
  return { val: defaultVal, unit: defaultUnit }
}

/** 统一的数值 + 单位编辑组件：
 *  [数值输入] [单位下拉]
 *  支持 freeUnit=false 时显示固定单位文字
 */
function NumberUnitField({
  label,
  value,
  onChange,
  units = ['px', 'rem', 'em', '%'],
  min = 0,
  max = 9999,
  step = 1,
  placeholder = '',
  freeUnit = true,
  fixedUnit = '',
}: {
  label: string
  value: string | undefined
  onChange: (newValue: string) => void
  units?: string[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
  freeUnit?: boolean
  fixedUnit?: string
}) {
  const parsed = parseNumericValue(value, freeUnit ? 0 : 0, freeUnit ? (units[0] ?? 'px') : fixedUnit)
  const unit = freeUnit ? parsed.unit : fixedUnit

  const apply = useCallback(
    (newVal: number, newUnit: string) => {
      const u = freeUnit ? newUnit : fixedUnit
      if (u === 'auto') {
        onChange('auto')
      } else {
        onChange(`${newVal}${u}`)
      }
    },
    [onChange, freeUnit, fixedUnit],
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
              // 当前是 auto 时输入数值 → 自动切到第一个非 auto 单位
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
        {freeUnit ? (
          <select
            value={unit}
            onChange={(e) => {
              const newUnit = e.target.value
              if (newUnit === 'auto') {
                onChange('auto')
              } else {
                apply(parsed.val, newUnit)
              }
            }}
            className={selectCls + ' w-14'}
          >
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-gray-500 w-8 text-center shrink-0">{fixedUnit}</span>
        )}
      </div>
    </Field>
  )
}

/** 颜色预设：常用色板 */
const COLOR_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#1e293b', '#ffffff',
  '#000000', 'transparent',
]

/** 颜色选择器组件：预设色板 + 原生取色器 + 当前值显示（与精修模式统一） */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const currentDisplay = (() => {
    if (!value) return null
    if (value === 'transparent') return 'transparent'
    if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value
    if (/^rgba?\(/i.test(value)) return value
    return null
  })()
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {/* 当前颜色预览条（与精修模式统一） */}
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
              title="清除颜色"
            >
              清除
            </button>
          )}
        </div>
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
          <div className="relative w-5 h-5 rounded border border-ink-600 cursor-pointer flex items-center justify-center bg-ink-800 hover:bg-ink-700 transition-colors" title="取色器">
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
          </div>
        </div>
      </div>
    </Field>
  )
}

const FONT_FAMILIES = [
  // Google Fonts
  '"Inter", system-ui, sans-serif',
  '"Space Grotesk", "Inter", sans-serif',
  '"Playfair Display", Georgia, serif',
  '"Source Sans 3", system-ui, sans-serif',
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
  '"Helvetica Neue", "Arial", sans-serif',
  '"Cormorant Garamond", Georgia, serif',
  '"Lora", Georgia, serif',
  '"DM Mono", "Courier New", monospace',
  // 系统字体
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  '"Times New Roman", serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  '"Trebuchet MS", sans-serif',
  '"Courier New", monospace',
  // 中文字体
  '"PingFang SC", "Microsoft YaHei", sans-serif',
  '"Noto Sans SC", sans-serif',
  '"LXGW WenKai", serif',
  '"ZCOOL XiaoWei", serif',
  '"Ma Shan Zheng", cursive',
]

/** 边框预设 */
const BORDER_PRESETS = [
  { label: '无', value: '' },
  { label: '1px 浅灰', value: '1px solid #e5e7eb' },
  { label: '2px 品牌色', value: '2px solid #6366f1' },
  { label: '1px 中灰', value: '1px solid #d1d5db' },
  { label: '2px 深色', value: '2px solid #1f2937' },
  { label: '自定义', value: '__custom__' },
]


// --- 样式预设 ---

interface StylePreset {
  label: string
  preview: ReactNode
  styles: Partial<NodeStyle>
  props?: Partial<NodeProps>
}

/** 按钮预设样式 */
const BUTTON_PRESETS: StylePreset[] = [
  {
    label: '主要',
    preview: <span className="w-4 h-4 rounded-full bg-brand-500 inline-block" />,
    styles: {
      backgroundColor: '#6366f1',
      color: '#ffffff',
      borderRadius: '8px',
      fontWeight: '600',
      padding: '12px 24px',
      border: 'none',
      boxShadow: '0 2px 4px rgba(99,102,241,0.3)',
    },
  },
  {
    label: '次要',
    preview: <span className="w-4 h-4 rounded-full bg-gray-500 inline-block" />,
    styles: {
      backgroundColor: '#6b7280',
      color: '#ffffff',
      borderRadius: '8px',
      fontWeight: '600',
      padding: '12px 24px',
      border: 'none',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },
  },
  {
    label: '成功',
    preview: <span className="w-4 h-4 rounded-full bg-green-500 inline-block" />,
    styles: {
      backgroundColor: '#10b981',
      color: '#ffffff',
      borderRadius: '8px',
      fontWeight: '600',
      padding: '12px 24px',
      border: 'none',
      boxShadow: '0 2px 4px rgba(16,185,129,0.3)',
    },
  },
  {
    label: '危险',
    preview: <span className="w-4 h-4 rounded-full bg-red-500 inline-block" />,
    styles: {
      backgroundColor: '#ef4444',
      color: '#ffffff',
      borderRadius: '8px',
      fontWeight: '600',
      padding: '12px 24px',
      border: 'none',
      boxShadow: '0 2px 4px rgba(239,68,68,0.3)',
    },
  },
  {
    label: '轮廓',
    preview: <span className="w-4 h-4 rounded border-2 border-brand-500 bg-transparent inline-block" />,
    styles: {
      backgroundColor: 'transparent',
      color: '#6366f1',
      borderRadius: '8px',
      fontWeight: '600',
      padding: '11px 23px',
      border: '2px solid #6366f1',
      boxShadow: 'none',
    },
  },
  {
    label: '圆角',
    preview: <span className="w-4 h-4 rounded-full bg-brand-500 inline-block" />,
    styles: {
      backgroundColor: '#6366f1',
      color: '#ffffff',
      borderRadius: '9999px',
      fontWeight: '600',
      padding: '12px 28px',
      border: 'none',
      boxShadow: '0 2px 4px rgba(99,102,241,0.3)',
    },
  },
  {
    label: '大号',
    preview: <span className="w-4 h-4 rounded bg-brand-500 inline-block" style={{ width: 18, height: 18 }} />,
    styles: {
      backgroundColor: '#6366f1',
      color: '#ffffff',
      borderRadius: '10px',
      fontWeight: '700',
      padding: '16px 32px',
      fontSize: '18px',
      border: 'none',
      boxShadow: '0 4px 8px rgba(99,102,241,0.3)',
    },
  },
  {
    label: '小号',
    preview: <span className="w-3 h-3 rounded bg-brand-500 inline-block" />,
    styles: {
      backgroundColor: '#6366f1',
      color: '#ffffff',
      borderRadius: '6px',
      fontWeight: '500',
      padding: '6px 14px',
      fontSize: '13px',
      border: 'none',
      boxShadow: 'none',
    },
  },
]

/** 卡片预设样式 */
const CARD_PRESETS: StylePreset[] = [
  {
    label: '默认',
    preview: <span className="w-4 h-4 rounded bg-white border border-gray-300 inline-block" />,
    styles: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: 'none',
    },
  },
  {
    label: '浮起',
    preview: <span className="w-4 h-4 rounded bg-white inline-block" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />,
    styles: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      border: 'none',
    },
  },
  {
    label: '边框',
    preview: <span className="w-4 h-4 rounded bg-white border-2 border-gray-300 inline-block" />,
    styles: {
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: 'none',
      border: '2px solid #e5e7eb',
    },
  },
  {
    label: '扁平',
    preview: <span className="w-4 h-4 rounded bg-gray-100 inline-block" />,
    styles: {
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: 'none',
      border: 'none',
    },
  },
  {
    label: '深色',
    preview: <span className="w-4 h-4 rounded bg-gray-800 inline-block" />,
    styles: {
      backgroundColor: '#1f2937',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      border: 'none',
      color: '#f9fafb',
    },
    props: {
      titleColor: '#f9fafb',
      subtitleColor: '#d1d5db',
    },
  },
  {
    label: '带色',
    preview: <span className="w-4 h-4 rounded bg-brand-50 border border-brand-200 inline-block" />,
    styles: {
      backgroundColor: '#eef2ff',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: 'none',
      border: '1px solid #c7d2fe',
    },
  },
]

/** 复制按钮：点击后短暂显示'已复制' */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          // 降级：选中文本
          const ta = document.createElement('textarea')
          ta.value = text
          document.body.appendChild(ta)
          ta.select()
          try { document.execCommand('copy') } catch {}
          document.body.removeChild(ta)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }
      }}
      className="text-[10px] px-1.5 py-0.5 rounded bg-ink-700 hover:bg-ink-600 text-gray-300 shrink-0"
      title="复制 ID"
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

/** 节点类型 → 中文名（用于 targetId 下拉显示） */
const TYPE_LABEL: Record<string, string> = {
  heading: '标题',
  text: '正文',
  image: '图片',
  button: '按钮',
  card: '卡片',
  container: '容器',
  divider: '分隔线',
  icon: '图标',
  video: '视频',
  input: '输入框',
  iframe: '嵌入',
  navbar: '导航栏',
  grid: '网格',
  form: '表单',
}

export function Inspector() {
  const selected = useSelectedNode()
  const updateNodeStyle = useEditorStore((s) => s.updateNodeStyle)
  const updateNodeProps = useEditorStore((s) => s.updateNodeProps)
  const removeNode = useEditorStore((s) => s.removeNode)
  const updateNodeInteraction = useEditorStore((s) => s.updateNodeInteraction)
  const canvas = useEditorStore((s) => s.canvas)
  const updateCanvas = useEditorStore((s) => s.updateCanvas)
  const allNodes = useEditorStore((s) => s.nodes)
  const collapsed = useEditorStore((s) => s.rightPanelCollapsed)
  const toggle = useEditorStore((s) => s.toggleRightPanel)
  const zoom = useEditorStore((s) => s.zoom)
  const [borderCustom, setBorderCustom] = useState(false)

  // 当未显式设置宽高时，从 DOM 读取实际渲染尺寸作为默认值
  // ⚠️ 必须在 useLayoutEffect（DOM commit 后）读取，否则新添加的节点还没渲染到 DOM 中
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    if (!selected) {
      setRenderedSize(null)
      return
    }
    const el = document.getElementById(selected.id)
    if (!el) {
      setRenderedSize(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRenderedSize({ w: Math.round(r.width / zoom), h: Math.round(r.height / zoom) })
  }, [selected?.id, zoom])

  // 折叠态：仅显示窄条 + 展开按钮
  // 展开按钮：左箭头 (<<) → 表示"把面板展开到左侧"
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

  /** 递归收集所有节点（带缩进深度），供 targetId 下拉使用 */
  const flatNodes: { id: string; label: string; depth: number; isContainer: boolean }[] = []
  const walk = (arr: typeof allNodes, depth: number) => {
    for (const n of arr) {
      const label = n.props.text?.slice(0, 16) || TYPE_LABEL[n.type] || n.type
      flatNodes.push({ id: n.id, label, depth, isContainer: n.type === 'container' })
      if (n.children?.length) walk(n.children, depth + 1)
    }
  }
  walk(allNodes, 0)

  if (!selected) {
    return (
      <div className="pf-right-panel w-64 shrink-0 bg-ink-800 border-l border-ink-700 overflow-y-auto transition-all duration-200">
        <div className="p-3 border-b border-ink-700 flex items-center justify-between">
          <span className="text-sm text-gray-200">画布设置</span>
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
        <div className="p-3 space-y-3">
          <div className="text-xs text-gray-500">未选中元素时编辑画布属性</div>
          <ColorField
            label="背景色"
            value={normalizeColor(canvas.backgroundColor) || '#000000'}
            onChange={(v) => updateCanvas({ backgroundColor: v })}
          />
          <Field label="宽度">
            <NumberUnitField
              label=""
              value={canvas.width}
              onChange={(v) => updateCanvas({ width: v })}
              units={['px']}
              freeUnit={false}
              fixedUnit="px"
              min={200}
              max={5000}
              step={10}
              placeholder="1200"
            />
          </Field>
          <Field label="高度">
            <NumberUnitField
              label=""
              value={canvas.height}
              onChange={(v) => updateCanvas({ height: v })}
              units={['px']}
              freeUnit={false}
              fixedUnit="px"
              min={200}
              max={5000}
              step={10}
              placeholder="800"
            />
          </Field>
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              {(['1280x720', '1200x800'] as const).map((preset) => {
                const [w, h] = preset.split('x')
                return (
                  <button
                    key={preset}
                    onClick={() => updateCanvas({ width: `${w}px`, height: `${h}px` })}
                    className="flex-1 px-2 py-1 rounded text-xs bg-ink-700 hover:bg-ink-600 text-gray-300"
                  >
                    {preset}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              {(['1024x768', '1920x1080'] as const).map((preset) => {
                const [w, h] = preset.split('x')
                return (
                  <button
                    key={preset}
                    onClick={() => updateCanvas({ width: `${w}px`, height: `${h}px` })}
                    className="flex-1 px-2 py-1 rounded text-xs bg-ink-700 hover:bg-ink-600 text-gray-300"
                  >
                    {preset}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="pt-2 border-t border-ink-700 text-xs text-gray-600 leading-relaxed">
            提示：选中元素后可编辑其属性；双击元素可直接改文字；拖拽手柄可调大小。
          </div>
        </div>
      </div>
    )
  }

  const hasText = selected.props.text !== undefined

  return (
    <div className="pf-right-panel w-64 shrink-0 bg-ink-800 border-l border-ink-700 overflow-y-auto transition-all duration-200">
      <div className="p-3 border-b border-ink-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200">属性 · {selected.type}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => removeNode(selected.id)}
            className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-ink-700 transition-colors"
          >
            删除
          </button>
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
      <div className="px-3 pt-2 pb-1 border-b border-ink-700/50 flex items-center gap-2">
        <span className="text-[10px] text-gray-500 shrink-0">ID</span>
        <code
          className="flex-1 text-[11px] font-mono text-gray-300 bg-ink-900 border border-ink-600 rounded px-1.5 py-0.5 truncate"
          title={selected.id}
        >
          {selected.id}
        </code>
        <CopyButton text={selected.id} />
      </div>
      <div className="p-3 space-y-3">
        {selected.type === 'card' ? (
          <>
            {/* 卡片标题 */}
            <SectionLabel label="卡片标题" />
            <Field label="文字">
              <textarea
                value={selected.props.text || ''}
                onChange={(e) => updateNodeProps(selected.id, { text: e.target.value })}
                className={inputCls}
                rows={2}
              />
            </Field>
            <NumberUnitField
              label="字号"
              value={selected.props.titleFontSize}
              onChange={(v) => updateNodeProps(selected.id, { titleFontSize: v })}
              units={['px', 'rem', 'em', 'pt']}
              min={8}
              max={200}
              step={2}
              placeholder="18px"
            />
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => {
                  const p = parseNumericValue(selected.props.titleFontSize, 18, 'px')
                  updateNodeProps(selected.id, { titleFontSize: `${Math.max(1, p.val - 2)}${p.unit}` })
                }}
                className={quickStepBtnCls}
              >A-</button>
              <button
                onClick={() => {
                  const p = parseNumericValue(selected.props.titleFontSize, 18, 'px')
                  updateNodeProps(selected.id, { titleFontSize: `${Math.min(200, p.val + 2)}${p.unit}` })
                }}
                className={quickStepBtnCls}
              >A+</button>
            </div>
            <ColorField
                label="字色"
                value={normalizeColor(selected.props.titleColor) || '#000000'}
                onChange={(v) => updateNodeProps(selected.id, { titleColor: v })}
              />
            {/* 卡片内容 */}
            <SectionLabel label="卡片内容" />
            <Field label="文字">
              <textarea
                value={selected.props.subtitle || ''}
                onChange={(e) => updateNodeProps(selected.id, { subtitle: e.target.value })}
                className={inputCls}
                rows={2}
              />
            </Field>
            <NumberUnitField
              label="字号"
              value={selected.props.subtitleFontSize}
              onChange={(v) => updateNodeProps(selected.id, { subtitleFontSize: v })}
              units={['px', 'rem', 'em', 'pt']}
              min={8}
              max={200}
              step={2}
              placeholder="14px"
            />
            <div className="flex gap-1 mt-1">
              <button
                onClick={() => {
                  const p = parseNumericValue(selected.props.subtitleFontSize, 14, 'px')
                  updateNodeProps(selected.id, { subtitleFontSize: `${Math.max(1, p.val - 2)}${p.unit}` })
                }}
                className={quickStepBtnCls}
              >A-</button>
              <button
                onClick={() => {
                  const p = parseNumericValue(selected.props.subtitleFontSize, 14, 'px')
                  updateNodeProps(selected.id, { subtitleFontSize: `${Math.min(200, p.val + 2)}${p.unit}` })
                }}
                className={quickStepBtnCls}
              >A+</button>
            </div>
            <ColorField
                label="字色"
                value={normalizeColor(selected.props.subtitleColor) || '#000000'}
                onChange={(v) => updateNodeProps(selected.id, { subtitleColor: v })}
              />
            {/* 卡片预设样式 */}
            <SectionLabel label="卡片预设" />
            <div className="grid grid-cols-3 gap-1.5">
              {CARD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    updateNodeStyle(selected.id, preset.styles)
                    if (preset.props) updateNodeProps(selected.id, preset.props)
                  }}
                  className="flex flex-col items-center gap-0.5 px-1.5 py-2 rounded bg-ink-700 hover:bg-ink-600 text-gray-300 text-xs transition-colors"
                  title={preset.label}
                >
                  {preset.preview}
                  <span className="text-[10px]">{preset.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          (hasText && selected.type !== 'icon' && selected.type !== 'input') && (
            <Field label="文字内容">
              <textarea
                value={selected.props.text || ''}
                onChange={(e) => updateNodeProps(selected.id, { text: e.target.value })}
                className={inputCls}
                rows={2}
              />
            </Field>
          )
        )}
        {/* 按钮预设样式 */}
        {selected.type === 'button' && (
          <>
            <SectionLabel label="按钮预设" />
            <div className="grid grid-cols-4 gap-1.5">
              {BUTTON_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => updateNodeStyle(selected.id, preset.styles)}
                  className="flex flex-col items-center gap-0.5 px-1.5 py-2 rounded bg-ink-700 hover:bg-ink-600 text-gray-300 text-xs transition-colors"
                  title={preset.label}
                >
                  {preset.preview}
                  <span className="text-[10px]">{preset.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {selected.type === 'image' && (
          <>
            <FileUploadField
              accept="image/*"
              maxSizeMB={10}
              label="本地上传"
              currentValue={selected.props.src}
              onUpload={(dataUrl) => {
                // 临时显示原图，等待用户裁切
                updateNodeProps(selected.id, { src: dataUrl })
                const img = new Image()
                img.onload = () => {
                  const maxW = 600
                  const nw = img.naturalWidth
                  const nh = img.naturalHeight
                  const w = nw > maxW ? maxW : nw
                  const h = nw > maxW ? Math.round(maxW * nh / nw) : nh
                  updateNodeStyle(selected.id, { width: `${w}px`, height: `${h}px` })
                  // 打开裁切弹窗
                  useEditorStore.getState().openCropModal({
                    imageSrc: dataUrl,
                    imageWidth: nw,
                    imageHeight: nh,
                    initialShape: selected.props.imageShape,
                    onConfirm: (result) => {
                      const maxSide = 400
                      const ratio = Math.min(maxSide / result.crop.width, maxSide / result.crop.height, 1)
                      const finalW = Math.round(result.crop.width * ratio)
                      const finalH = Math.round(result.crop.height * ratio)
                      const isShaped = result.shape !== 'rectangle'
                      updateNodeProps(selected.id, {
                        src: result.croppedDataUrl,
                        originalSrc: dataUrl,
                        imageShape: result.shape,
                        cropRect: result.crop,
                      })
                      updateNodeStyle(selected.id, {
                        width: `${finalW}px`,
                        height: `${finalH}px`,
                        ...(isShaped ? { backgroundColor: 'transparent' } : {}),
                      })
                    },
                  })
                }
                img.src = dataUrl
              }}
            />
            <Field label="图片地址">
              <input
                value={selected.props.src || ''}
                onChange={(e) => updateNodeProps(selected.id, { src: e.target.value })}
                className={inputCls}
                placeholder="https://... 或使用上方上传按钮"
              />
            </Field>
            {/* 旋转角度 */}
            {selected.props.src && (
              <Field label="旋转角度">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selected.props.rotation || 0}
                    onChange={(e) => updateNodeProps(selected.id, { rotation: parseInt(e.target.value) || 0 })}
                    className="flex-1"
                    list="rotation-ticks"
                  />
                  <datalist id="rotation-ticks">
                    <option value="-180" />
                    <option value="-135" />
                    <option value="-90" />
                    <option value="-45" />
                    <option value="0" />
                    <option value="45" />
                    <option value="90" />
                    <option value="135" />
                    <option value="180" />
                  </datalist>
                  <span className="text-xs text-gray-500 w-10 text-right tabular-nums">
                    {selected.props.rotation || 0}°
                  </span>
                </div>
              </Field>
            )}
            {/* 镜像翻转 */}
            {selected.props.src && (
              <div className="flex gap-1">
                <button
                  onClick={() => updateNodeProps(selected.id, { flipH: !selected.props.flipH })}
                  className={toggleBtnCls(!!selected.props.flipH)}
                >
                  ↔ 水平翻转
                </button>
                <button
                  onClick={() => updateNodeProps(selected.id, { flipV: !selected.props.flipV })}
                  className={toggleBtnCls(!!selected.props.flipV)}
                >
                  ↕ 垂直翻转
                </button>
              </div>
            )}
            {/* 重新裁切图片（仅当已有 src 时显示） */}
            {selected.props.src && (
              <button
                onClick={() => {
                  // 第一性原理：始终使用 originalSrc（未裁切原图）作为裁切源
                  let baseSrc = selected.props.originalSrc || selected.props.src!
                  let effectiveCrop = selected.props.cropRect
                  if (!selected.props.originalSrc && selected.props.src) {
                    if (selected.props.cropRect) {
                      // 已裁切过但丢失了 originalSrc → 使用当前 src 但清除 cropRect 避免坐标错位
                      baseSrc = selected.props.src
                      effectiveCrop = undefined
                    } else {
                      updateNodeProps(selected.id, { originalSrc: selected.props.src })
                    }
                  }
                  const img = new Image()
                  img.onload = () => {
                    useEditorStore.getState().openCropModal({
                      imageSrc: baseSrc,
                      imageWidth: img.naturalWidth,
                      imageHeight: img.naturalHeight,
                      initialShape: selected.props.imageShape,
                      initialCrop: effectiveCrop,
                      onConfirm: (result) => {
                        const maxSide = 400
                        const ratio = Math.min(maxSide / result.crop.width, maxSide / result.crop.height, 1)
                        const finalW = Math.round(result.crop.width * ratio)
                        const finalH = Math.round(result.crop.height * ratio)
                        const isShaped = result.shape !== 'rectangle'
                        updateNodeProps(selected.id, {
                          src: result.croppedDataUrl,
                          imageShape: result.shape,
                          cropRect: result.crop,
                        })
                        updateNodeStyle(selected.id, {
                          width: `${finalW}px`,
                          height: `${finalH}px`,
                          ...(isShaped ? { backgroundColor: 'transparent' } : {}),
                        })
                      },
                    })
                  }
                  img.src = baseSrc
                }}
                className="w-full mt-2 px-2 py-1 text-xs rounded border border-ink-600 text-gray-300 bg-ink-700 hover:bg-ink-600"
              >
                重新裁切图片
              </button>
            )}
          </>
        )}
        {selected.type === 'video' && (
          <>
            <FileUploadField
              accept="video/*"
              maxSizeMB={50}
              label="上传视频"
              currentValue={selected.props.src}
              onUpload={(dataUrl) => {
                updateNodeProps(selected.id, { src: dataUrl })
                // 读取视频自然尺寸，自适应调整组件宽高
                const video = document.createElement('video')
                video.preload = 'metadata'
                video.onloadedmetadata = () => {
                  const maxW = 600
                  const nw = video.videoWidth
                  const nh = video.videoHeight
                  if (nw && nh) {
                    const w = nw > maxW ? maxW : nw
                    const h = nw > maxW ? Math.round(maxW * nh / nw) : nh
                    updateNodeStyle(selected.id, { width: `${w}px`, height: `${h}px` })
                  }
                }
                video.src = dataUrl
              }}
            />
            <Field label="视频地址">
              <input
                value={selected.props.src || ''}
                onChange={(e) => updateNodeProps(selected.id, { src: e.target.value })}
                className={inputCls}
                placeholder="https://... 或使用上方上传按钮"
              />
            </Field>
            <FileUploadField
              accept="image/*"
              maxSizeMB={5}
              label="上传封面图"
              currentValue={selected.props.poster}
              onUpload={(dataUrl) => updateNodeProps(selected.id, { poster: dataUrl })}
            />
            <Field label="封面图">
              <input
                value={selected.props.poster || ''}
                onChange={(e) => updateNodeProps(selected.id, { poster: e.target.value })}
                className={inputCls}
                placeholder="https://... 或使用上方上传按钮"
              />
            </Field>
          </>
        )}
        {selected.type === 'iframe' && (
          <>
            <Field label="嵌入地址">
              <input
                value={selected.props.src || ''}
                onChange={(e) => updateNodeProps(selected.id, { src: e.target.value })}
                className={inputCls}
                placeholder="/imported-templates/agency.html"
              />
            </Field>
            <Field label="标题">
              <input
                value={selected.props.alt || ''}
                onChange={(e) => updateNodeProps(selected.id, { alt: e.target.value })}
                className={inputCls}
                placeholder="embedded page"
              />
            </Field>
          </>
        )}
        {selected.type === 'icon' && (
          <>
            <Field label="图标">
              <div className="flex gap-1">
                <input
                  value={selected.props.icon || ''}
                  onChange={(e) => updateNodeProps(selected.id, { icon: e.target.value })}
                  className={inputCls}
                  placeholder="输入或选择"
                />
              </div>
              {/* 图标网格：SVG 优先（无填色），后跟 emoji 备选 */}
              <div className="mt-2 max-h-48 overflow-y-auto p-1.5 bg-ink-900 border border-ink-600 rounded">
                {/* SVG 组 */}
                <div className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mb-1">SVG 矢量</div>
                <div className="grid grid-cols-8 gap-0.5 mb-2">
                  {SVG_PRESET_NAMES.map((name) => {
                    const isActive = selected.props.icon === name
                    return (
                      <button
                        key={name}
                        onClick={() => updateNodeProps(selected.id, { icon: name })}
                        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                          isActive
                            ? 'bg-brand-600 text-white'
                            : 'text-gray-300 hover:bg-ink-700'
                        }`}
                        title={name}
                      >
                        {SVG_ICON_MAP[name]()}
                      </button>
                    )
                  })}
                </div>
                {/* Emoji 组 */}
                <div className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mb-1 pt-1 border-t border-ink-700">Emoji 备选</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJI_ICON_PRESETS.map((emoji) => {
                    const isActive = selected.props.icon === emoji
                    return (
                      <button
                        key={emoji}
                        onClick={() => updateNodeProps(selected.id, { icon: emoji })}
                        className={`w-7 h-7 flex items-center justify-center rounded text-base transition-colors ${
                          isActive
                            ? 'bg-brand-600'
                            : 'hover:bg-ink-700'
                        }`}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Field>
            <Field label="描述文字">
              <input
                value={selected.props.text || ''}
                onChange={(e) => updateNodeProps(selected.id, { text: e.target.value })}
                className={inputCls}
                placeholder="图标说明文字"
              />
            </Field>
          </>
        )}
        {selected.type === 'input' && (
          <>
            <Field label="占位文字">
              <input
                value={selected.props.placeholder || ''}
                onChange={(e) => updateNodeProps(selected.id, { placeholder: e.target.value })}
                className={inputCls}
                placeholder="请输入内容..."
              />
            </Field>
            <Field label="默认值">
              <input
                value={selected.props.text || ''}
                onChange={(e) => updateNodeProps(selected.id, { text: e.target.value })}
                className={inputCls}
                placeholder="默认文字"
              />
            </Field>
          </>
        )}
        {selected.type === 'navbar' && (
          <>
            <Field label="Logo 文字">
              <input
                value={selected.props.logo || ''}
                onChange={(e) => updateNodeProps(selected.id, { logo: e.target.value })}
                className={inputCls}
                placeholder="PageForge"
              />
            </Field>
            <Field label="导航链接">
              <input
                value={selected.props.navLinks || ''}
                onChange={(e) => updateNodeProps(selected.id, { navLinks: e.target.value })}
                className={inputCls}
                placeholder="首页,关于,服务,联系"
              />
            </Field>
            <ColorField
            label="链接颜色"
            value={normalizeColor(selected.props.linkColor || selected.style.color) || '#000000'}
            onChange={(v) => updateNodeProps(selected.id, { linkColor: v })}
          />
          </>
        )}
        {selected.type === 'grid' && (
          <>
            <Field label="列数">
              <select
                value={selected.props.columns || 3}
                onChange={(e) => updateNodeProps(selected.id, { columns: parseInt(e.target.value) })}
                className={selectCls + ' w-full'}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} 列</option>
                ))}
              </select>
            </Field>
            <NumberUnitField
              label="间距"
              value={selected.props.gridGap}
              onChange={(v) => updateNodeProps(selected.id, { gridGap: v })}
              units={['px', 'rem', 'em', '%']}
              min={0}
              max={200}
              step={4}
              placeholder="16px"
            />
          </>
        )}
        {selected.type === 'form' && (
          <>
            <Field label="表单字段">
              <input
                value={selected.props.fields || ''}
                onChange={(e) => updateNodeProps(selected.id, { fields: e.target.value })}
                className={inputCls}
                placeholder="姓名,邮箱,留言"
              />
            </Field>
            <Field label="提交按钮">
              <input
                value={selected.props.submitText || ''}
                onChange={(e) => updateNodeProps(selected.id, { submitText: e.target.value })}
                className={inputCls}
                placeholder="提交"
              />
            </Field>
          </>
        )}

        <SectionLabel label="尺寸与间距" />
        <NumberUnitField
          label="宽度"
          value={selected.style.width ?? (renderedSize ? `${renderedSize.w}px` : '0px')}
          onChange={(v) => updateNodeStyle(selected.id, { width: v })}
          units={['px', '%', 'vw']}
          min={0}
          max={9999}
          step={10}
          placeholder="320px"
        />
        <NumberUnitField
          label="高度"
          value={selected.style.height ?? (renderedSize ? `${renderedSize.h}px` : '0px')}
          onChange={(v) => updateNodeStyle(selected.id, { height: v })}
          units={['px', '%', 'vh']}
          min={0}
          max={9999}
          step={10}
          placeholder="180px"
        />
        <NumberUnitField
          label="内边距"
          value={selected.style.padding ?? '0px'}
          onChange={(v) => updateNodeStyle(selected.id, { padding: v })}
          units={['px', 'rem', 'em', '%']}
          min={0}
          max={999}
          step={4}
          placeholder="16px"
        />

        {selected.type !== 'card' && selected.type !== 'divider' && selected.type !== 'video' && selected.type !== 'input' && selected.type !== 'icon' && selected.type !== 'iframe' && (
          (() => {
            return (
              <>
                <SectionLabel label="字体" />
                <Field label="字体">
                  <select
                    value={selected.style.fontFamily || ''}
                    onChange={(e) => updateNodeStyle(selected.id, { fontFamily: e.target.value || undefined })}
                    className={selectCls + ' w-full'}
                  >
                    <option value="">默认</option>
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </Field>

                {/* 粗体 / 斜体 / 下划线 / 删除线 切换按钮 */}
                <Field label="样式">
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const cur = selected.style.fontWeight
                        updateNodeStyle(selected.id, { fontWeight: cur === '700' ? undefined : '700' })
                      }}
                      className={toggleBtnCls(selected.style.fontWeight === '700')}
                      title="粗体"
                    >B</button>
                    <button
                      onClick={() => {
                        const cur = selected.style.fontStyle
                        updateNodeStyle(selected.id, { fontStyle: cur === 'italic' ? undefined : 'italic' })
                      }}
                      className={toggleBtnCls(selected.style.fontStyle === 'italic')}
                      title="斜体"
                    >I</button>
                    <button
                      onClick={() => {
                        const cur = selected.style.textDecoration
                        const hasUnderline = cur?.includes('underline')
                        updateNodeStyle(selected.id, { textDecoration: hasUnderline ? (cur === 'underline line-through' ? 'line-through' : undefined) : (cur === 'line-through' ? 'underline line-through' : 'underline') })
                      }}
                      className={toggleBtnCls(!!selected.style.textDecoration?.includes('underline'))}
                      title="下划线"
                    >U</button>
                    <button
                      onClick={() => {
                        const cur = selected.style.textDecoration
                        const hasStrike = cur?.includes('line-through')
                        updateNodeStyle(selected.id, { textDecoration: hasStrike ? (cur === 'underline line-through' ? 'underline' : undefined) : (cur === 'underline' ? 'underline line-through' : 'line-through') })
                      }}
                      className={toggleBtnCls(!!selected.style.textDecoration?.includes('line-through'))}
                      title="删除线"
                    >S</button>
                  </div>
                </Field>

                <NumberUnitField
                  label="字号"
                  value={selected.style.fontSize}
                  onChange={(v) => updateNodeStyle(selected.id, { fontSize: v })}
                  units={['px', 'rem', 'em', 'pt']}
                  min={1}
                  max={200}
                  step={2}
                  placeholder="16px"
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      const p = parseNumericValue(selected.style.fontSize, 16, 'px')
                      updateNodeStyle(selected.id, { fontSize: `${Math.max(1, p.val - 2)}${p.unit}` })
                    }}
                    className={quickStepBtnCls}
                  >A-</button>
                  <button
                    onClick={() => {
                      const p = parseNumericValue(selected.style.fontSize, 16, 'px')
                      updateNodeStyle(selected.id, { fontSize: `${Math.min(200, p.val + 2)}${p.unit}` })
                    }}
                    className={quickStepBtnCls}
                  >A+</button>
                </div>

                <Field label="粗细">
                  <select
                    value={selected.style.fontWeight || ''}
                    onChange={(e) => updateNodeStyle(selected.id, { fontWeight: e.target.value || undefined })}
                    className={selectCls + ' w-full'}
                  >
                    <option value="">默认</option>
                    <option value="300">Light (300)</option>
                    <option value="400">Normal (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semi Bold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">Extra Bold (800)</option>
                    <option value="900">Black (900)</option>
                  </select>
                </Field>

                <NumberUnitField
                  label="行高"
                  value={selected.style.lineHeight}
                  onChange={(v) => updateNodeStyle(selected.id, { lineHeight: v })}
                  units={['px', 'em', 'rem', '%']}
                  min={0} max={200} step={1} placeholder="1.5"
                />

                <NumberUnitField
                  label="字距"
                  value={selected.style.letterSpacing}
                  onChange={(v) => updateNodeStyle(selected.id, { letterSpacing: v })}
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
                        onClick={() => updateNodeStyle(selected.id, { textAlign: align.value as 'left' | 'center' | 'right' | 'justify' })}
                        className={toggleBtnCls(selected.style.textAlign === align.value)}
                        title={align.title}
                      >
                        {align.icon}
                      </button>
                    ))}
                  </div>
                </Field>

                <ColorField
                label="字色"
                value={normalizeColor(selected.style.color) || '#000000'}
                onChange={(v) => updateNodeStyle(selected.id, { color: v })}
              />
              </>
            )
          })()
        )}

        {selected.type === 'icon' && (
          (() => {
            return (
              <>
                <SectionLabel label="图标样式" />
                <NumberUnitField
                  label="字号"
                  value={selected.style.fontSize}
                  onChange={(v) => updateNodeStyle(selected.id, { fontSize: v })}
                  units={['px', 'rem', 'em', 'pt']}
                  min={1}
                  max={500}
                  step={4}
                  placeholder="48px"
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      const p = parseNumericValue(selected.style.fontSize, 48, 'px')
                      updateNodeStyle(selected.id, { fontSize: `${Math.max(1, p.val - 4)}${p.unit}` })
                    }}
                    className={quickStepBtnCls}
                  >A-</button>
                  <button
                    onClick={() => {
                      const p = parseNumericValue(selected.style.fontSize, 48, 'px')
                      updateNodeStyle(selected.id, { fontSize: `${Math.min(500, p.val + 4)}${p.unit}` })
                    }}
                    className={quickStepBtnCls}
                  >A+</button>
                </div>
                <ColorField
                label="字色"
                value={normalizeColor(selected.style.color) || '#000000'}
                onChange={(v) => updateNodeStyle(selected.id, { color: v })}
              />
              </>
            )
          })()
        )}

        <SectionLabel label="外观" />
        <ColorField
          label="背景色"
          value={normalizeColor(selected.style.backgroundColor) || '#000000'}
          onChange={(v) => updateNodeStyle(selected.id, { backgroundColor: v })}
        />
        <NumberUnitField
          label="圆角"
          value={selected.style.borderRadius ?? '0px'}
          onChange={(v) => updateNodeStyle(selected.id, { borderRadius: v })}
          units={['px', 'rem', 'em', '%']}
          min={0}
          max={999}
          step={2}
          placeholder="8px"
        />
        <Field label="边框">
          {(() => {
            const currentBorder = selected.style.border || ''
            // 如果当前边框恰好匹配某个预设，重置自定义标记
            const isPreset = BORDER_PRESETS.some((p) => p.value === currentBorder)
            const showCustom = borderCustom || (currentBorder !== '' && !isPreset)
            const selectValue = showCustom ? '__custom__' : currentBorder
            return (
              <>
                <select
                  value={selectValue}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setBorderCustom(true)
                    } else {
                      setBorderCustom(false)
                      updateNodeStyle(selected.id, { border: v || undefined })
                    }
                  }}
                  className={selectCls + ' w-full'}
                >
                  {BORDER_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {showCustom && (
                  <input
                    value={currentBorder}
                    onChange={(e) => {
                      updateNodeStyle(selected.id, { border: e.target.value })
                    }}
                    onBlur={() => {
                      // 失焦时检查是否变成某个预设值
                      const newVal = selected.style.border || ''
                      if (BORDER_PRESETS.some((p) => p.value === newVal)) {
                        setBorderCustom(false)
                      }
                    }}
                    className={inputCls + ' mt-1'}
                    placeholder="1px solid #d1d5db"
                  />
                )}
              </>
            )
          })()}
        </Field>

        {/* ══════════════════════════════════════ 交互配置 ══════════════════════════════════════ */}
        <InteractionSections
          selected={selected}
          interaction={selected.interaction}
          onChange={(patch) => updateNodeInteraction(selected.id, patch)}
          targetOptions={flatNodes}
        />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// 交互配置子组件
// ═══════════════════════════════════════════════

/** 组件类型是否支持特定交互 */
const LINKABLE_TYPES = new Set(['button', 'image', 'icon', 'text', 'heading', 'card', 'navbar'])
const CLICKABLE_TYPES = new Set(['button', 'image', 'card', 'icon'])
const HOVERABLE_TYPES = new Set(['button', 'image', 'card', 'icon', 'container'])

function InteractionSections({
  selected,
  interaction,
  onChange,
  targetOptions,
}: {
  selected: { type: string; id: string }
  interaction?: InteractionConfig
  onChange: (patch: Partial<InteractionConfig>) => void
  targetOptions: { id: string; label: string; depth: number; isContainer: boolean }[]
}) {
  const link = interaction?.link
  const onClick = interaction?.onClick
  const onHover = interaction?.onHover
  const animation = interaction?.animation

  return (
    <>
      {/* 链接 */}
      {LINKABLE_TYPES.has(selected.type) && (
        <>
          <SectionLabel label="链接" />
          <Field label="URL">
            <input
              value={link?.href || ''}
              onChange={(e) =>
                onChange({
                  link: { href: e.target.value, target: link?.target || '_self' },
                })
              }
              className={inputCls}
              placeholder="https://example.com"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={link?.target === '_blank'}
              onChange={(e) =>
                onChange({
                  link: { href: link?.href || '', target: e.target.checked ? '_blank' : '_self' },
                })
              }
              className="accent-brand-500"
            />
            新标签页打开
          </label>
        </>
      )}

      {/* 点击动作 */}
      {CLICKABLE_TYPES.has(selected.type) && (
        <>
          <SectionLabel label="点击动作" />
          <Field label="动作">
            <select
              value={onClick?.action || 'none'}
              onChange={(e) => {
                const action = e.target.value as ClickActionType
                onChange({
                  onClick: action === 'none' ? undefined : { action, url: onClick?.url, targetId: onClick?.targetId, newTab: onClick?.newTab },
                })
              }}
              className={selectCls + ' w-full'}
            >
              <option value="none">无</option>
              <option value="navigate">跳转 URL</option>
              <option value="scroll-to">滚动到锚点</option>
              <option value="toggle">切换显隐</option>
              <option value="show">显示</option>
              <option value="hide">隐藏</option>
              <option value="submit-form">提交表单</option>
            </select>
          </Field>
          {onClick?.action === 'navigate' && (
            <>
              <Field label="目标 URL">
                <input
                  value={onClick.url || ''}
                  onChange={(e) => onChange({ onClick: { ...onClick, url: e.target.value } })}
                  className={inputCls}
                  placeholder="https://..."
                />
              </Field>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!onClick.newTab}
                  onChange={(e) => onChange({ onClick: { ...onClick, newTab: e.target.checked } })}
                  className="accent-brand-500"
                />
                新标签页打开
              </label>
            </>
          )}
          {(onClick?.action === 'scroll-to' || onClick?.action === 'toggle' || onClick?.action === 'show' || onClick?.action === 'hide') && (
            <Field label="目标元素">
              <select
                value={onClick.targetId || ''}
                onChange={(e) => onChange({ onClick: { ...onClick, targetId: e.target.value } })}
                className={selectCls}
              >
                <option value="">— 选择节点 —</option>
                {targetOptions
                  .filter((n) => n.id !== selected.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {'　'.repeat(n.depth)}
                      {n.isContainer ? '[容器] ' : ''}
                      {n.label} …{n.id}
                    </option>
                  ))}
              </select>
              {onClick.targetId && (
                <div className="text-[10px] text-gray-500 mt-1 font-mono break-all">
                  ID: {onClick.targetId}
                </div>
              )}
            </Field>
          )}
        </>
      )}

      {/* 悬停效果 */}
      {HOVERABLE_TYPES.has(selected.type) && (
        <>
          <SectionLabel label="悬停效果" />
          <Field label="效果">
            <select
              value={onHover?.effect || 'none'}
              onChange={(e) => {
                const effect = e.target.value as HoverEffectType
                onChange({
                  onHover: effect === 'none' ? undefined : { effect, duration: onHover?.duration ?? 200 },
                })
              }}
              className={selectCls + ' w-full'}
            >
              <option value="none">无</option>
              <option value="scale">缩放</option>
              <option value="shadow">阴影</option>
              <option value="color-shift">颜色变化</option>
              <option value="glow">发光</option>
            </select>
          </Field>
          {onHover?.effect === 'scale' && (
            <Field label="缩放倍率">
              <input
                type="range"
                min="1.01"
                max="1.2"
                step="0.01"
                value={onHover.scale ?? 1.05}
                onChange={(e) => onChange({ onHover: { ...onHover, scale: parseFloat(e.target.value) } })}
                className="w-full accent-brand-500"
              />
              <span className="text-xs text-gray-500">{onHover.scale ?? 1.05}x</span>
            </Field>
          )}
          {onHover?.effect === 'shadow' && (
            <Field label="阴影强度">
              <select
                value={onHover.shadowIntensity || 'medium'}
                onChange={(e) => onChange({ onHover: { ...onHover, shadowIntensity: e.target.value as 'light' | 'medium' | 'heavy' } })}
                className={selectCls + ' w-full'}
              >
                <option value="light">轻</option>
                <option value="medium">中</option>
                <option value="heavy">重</option>
              </select>
            </Field>
          )}
          {onHover?.effect === 'color-shift' && (
            <ColorField
              label="Hover 颜色"
              value={onHover.hoverColor || '#e0e7ff'}
              onChange={(v) => onChange({ onHover: { ...onHover, hoverColor: v } })}
            />
          )}
          {onHover && onHover.effect !== 'none' && (
            <NumberUnitField
              label="过渡时长"
              value={onHover.duration != null ? `${onHover.duration}ms` : undefined}
              onChange={(v) => onChange({ onHover: { ...onHover, duration: parseInt(v) || 200 } })}
              units={['ms']}
              freeUnit={false}
              fixedUnit="ms"
              min={50}
              max={2000}
              step={50}
            />
          )}
        </>
      )}

      {/* 入场动画 */}
      <>
        <SectionLabel label="入场动画" />
        <Field label="动画类型">
          <select
            value={animation?.type || 'none'}
            onChange={(e) => {
              const type = e.target.value as AnimationType
              onChange({
                animation:
                  type === 'none'
                    ? undefined
                    : { type, duration: animation?.duration ?? 600, delay: animation?.delay ?? 0, easing: animation?.easing ?? 'ease', trigger: animation?.trigger ?? 'load' },
              })
            }}
            className={selectCls + ' w-full'}
          >
            <option value="none">无</option>
            <option value="fade-in">淡入</option>
            <option value="slide-up">上滑</option>
            <option value="slide-down">下滑</option>
            <option value="slide-left">左滑</option>
            <option value="slide-right">右滑</option>
            <option value="zoom-in">缩放</option>
            <option value="bounce">弹跳</option>
          </select>
        </Field>
        {animation && animation.type !== 'none' && (
          <>
            <NumberUnitField
              label="时长"
              value={animation.duration != null ? `${animation.duration}ms` : undefined}
              onChange={(v) => onChange({ animation: { ...animation, duration: parseInt(v) || 600 } })}
              units={['ms']}
              freeUnit={false}
              fixedUnit="ms"
              min={200}
              max={3000}
              step={100}
            />
            <NumberUnitField
              label="延迟"
              value={animation.delay != null ? `${animation.delay}ms` : undefined}
              onChange={(v) => onChange({ animation: { ...animation, delay: parseInt(v) || 0 } })}
              units={['ms']}
              freeUnit={false}
              fixedUnit="ms"
              min={0}
              max={3000}
              step={100}
            />
            <Field label="缓动">
              <select
                value={animation.easing}
                onChange={(e) => onChange({ animation: { ...animation, easing: e.target.value as AnimationConfig['easing'] } })}
                className={selectCls + ' w-full'}
              >
                <option value="ease">ease</option>
                <option value="ease-in">ease-in</option>
                <option value="ease-out">ease-out</option>
                <option value="ease-in-out">ease-in-out</option>
                <option value="linear">linear</option>
              </select>
            </Field>
            <Field label="触发方式">
              <select
                value={animation.trigger}
                onChange={(e) => onChange({ animation: { ...animation, trigger: e.target.value as AnimationTrigger } })}
                className={selectCls + ' w-full'}
              >
                <option value="load">页面加载时</option>
                <option value="scroll">滚动到视口</option>
              </select>
            </Field>
            {animation.trigger === 'scroll' && (
              <Field label="触发阈值">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={animation.threshold ?? 0.2}
                  onChange={(e) => onChange({ animation: { ...animation, threshold: parseFloat(e.target.value) } })}
                  className="w-full accent-brand-500"
                />
                <span className="text-xs text-gray-500">{Math.round((animation.threshold ?? 0.2) * 100)}% 可见时触发</span>
              </Field>
            )}
          </>
        )}
      </>
    </>
  )
}