import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  detectHtmlComplexity,
  IMPORT_MODE_LABEL,
  IMPORT_MODE_DESC,
  IMPORT_MODE_WARNING,
  type ComplexityResult,
  type ImportMode,
} from '@/utils/htmlComplexity'

export interface ImportModeDialogProps {
  /** 待导入的 HTML */
  html: string
  /** 关闭弹窗（取消导入） */
  onCancel: () => void
  /** 确认导入（用户选了模式） */
  onConfirm: (mode: ImportMode) => void
}

/**
 * 导入模式选择弹窗
 *
 * 用户从粘贴/上传/开源模板三种路径导入 HTML 时弹出。
 * 先做智能检测，给出推荐模式 + 置信度，用户可以一键采用也可以手动切换。
 *
 * 阶段 1 实现：仅"自由画布"模式可用（走现有 importHtml 路径），
 * "精修"模式后续阶段通过 iframe 实施。
 */
export function ImportModeDialog({ html, onCancel, onConfirm }: ImportModeDialogProps) {
  const [result, setResult] = useState<ComplexityResult | null>(null)
  const [selected, setSelected] = useState<ImportMode>('freeform')
  const [refineAvailable, setRefineAvailable] = useState(false)

  // 弹窗打开时做一次检测
  useEffect(() => {
    const r = detectHtmlComplexity(html)
    setResult(r)
    setSelected(r.recommendation)
    // 精修模式已实施（基于 iframe + DOM 标注），允许用户选择
    setRefineAvailable(true)
  }, [html])

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  if (!result) {
    return null
  }

  const isHighConfidence = result.confidence >= 0.7

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-ink-800 border border-ink-600 rounded-xl w-[560px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-ink-600">
          <div className="flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-200 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <h3 className="text-gray-100 font-semibold text-sm tracking-wide">
              选择编辑模式
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white text-lg leading-none"
            title="关闭 (Esc)"
          >
            ✕
          </button>
        </div>

        {/* 智能检测结果 */}
        <div className="px-5 py-3 border-b border-ink-700 bg-ink-900/40">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-300">智能检测结果：</span>
            {isHighConfidence ? (
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  result.recommendation === 'refine'
                    ? 'bg-ink-700 text-white border border-brand-500/40'
                    : 'bg-ink-700 text-gray-100 border border-ink-500'
                }`}
              >
                推荐「{IMPORT_MODE_LABEL[result.recommendation]}」
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded bg-ink-700 text-gray-200 border border-ink-500">
                建议「{IMPORT_MODE_LABEL[result.recommendation]}」
              </span>
            )}
            <span className="text-xs text-gray-300">
              置信度 {Math.round(result.confidence * 100)}%
            </span>
          </div>
          {result.reasons.length > 0 && (
            <ul className="text-xs text-gray-300 leading-loose space-y-0.5">
              {result.reasons.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-gray-400 shrink-0">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 模式选择 */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <ModeOption
            mode="freeform"
            recommendation={result.recommendation}
            isSelected={selected === 'freeform'}
            onSelect={() => setSelected('freeform')}
          />
          <ModeOption
            mode="refine"
            recommendation={result.recommendation}
            isSelected={selected === 'refine'}
            onSelect={() => !refineAvailable || setSelected('refine')}
            disabled={!refineAvailable}
            disabledHint={!refineAvailable ? '精修模式将在后续版本推出（基于 iframe + DOM 标注，100% 还原原页面）' : undefined}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-600 bg-ink-900/40">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-ink-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            {isHighConfidence
              ? `使用推荐（${IMPORT_MODE_LABEL[result.recommendation]}）`
              : `使用「${IMPORT_MODE_LABEL[selected]}」开始编辑`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface ModeOptionProps {
  mode: ImportMode
  recommendation: ImportMode
  isSelected: boolean
  onSelect: () => void
  disabled?: boolean
  disabledHint?: string
}

function ModeOption({
  mode,
  recommendation,
  isSelected,
  onSelect,
  disabled,
  disabledHint,
}: ModeOptionProps) {
  const isRecommended = recommendation === mode
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'border-brand-500 bg-brand-500/10'
          : 'border-ink-600 bg-ink-900 hover:border-ink-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex items-start gap-3">
        {/* 单选圆点 */}
        <div
          className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            isSelected ? 'border-brand-500' : 'border-ink-500'
          }`}
        >
          {isSelected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-100 font-medium text-sm">
              {IMPORT_MODE_LABEL[mode]}
            </span>
            {isRecommended && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isSelected
                    ? 'bg-brand-500 text-white'
                    : 'bg-ink-700 text-brand-300 border border-brand-500/30'
                }`}
              >
                智能推荐
              </span>
            )}
            {disabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-700 text-gray-400 border border-ink-600">
                敬请期待
              </span>
            )}
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            {IMPORT_MODE_DESC[mode]}
          </p>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
            ⚠ {IMPORT_MODE_WARNING[mode]}
          </p>
          {disabled && disabledHint && (
            <p className="text-[11px] text-gray-400 leading-relaxed mt-1 italic">
              {disabledHint}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
