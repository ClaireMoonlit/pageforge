import { useRef } from 'react'

interface RefineFloatToolbarProps {
  rect: { left: number; top: number; width: number; height: number }
  onDelete: () => void
  onDuplicate: () => void
}

/**
 * 浮层工具条：选中元素时显示在元素上方，提供删除、复制等快捷操作
 *
 * 设计：深色半透明背景 + 紫色边框，与 PageForge 暗色主题一致。
 * 定位在选中框上方，小箭头指向下方选中元素。
 */
export function RefineFloatToolbar({ rect, onDelete, onDuplicate }: RefineFloatToolbarProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#e2e8f0',
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top - 36,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '3px 4px',
        background: 'rgba(30, 27, 22, 0.94)',
        border: '1px solid rgba(126, 34, 206, 0.5)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(126, 34, 206, 0.15)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
      }}
    >
      {/* 删除 */}
      <button
        style={btnStyle}
        onClick={onDelete}
        title="删除元素 (Delete)"
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.2)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <span>删除</span>
      </button>

      <span style={{ width: 1, height: 16, background: 'rgba(126, 34, 206, 0.3)' }} />

      {/* 复制 */}
      <button
        style={btnStyle}
        onClick={onDuplicate}
        title="重复元素 (Ctrl+D)"
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(126, 34, 206, 0.2)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span>重复</span>
      </button>
    </div>
  )
}