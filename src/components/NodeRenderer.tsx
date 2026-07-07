import type { CSSProperties, ReactNode } from 'react'
import type { CanvasNode, NodeStyle } from '@/types'
import { AutoIcon } from './Icon'

/**
 * 把 NodeStyle 转成 CSS 属性。
 * 排除所有定位相关属性（x/y 由 CanvasElement 通过 left/top 单独设置；
 * left/top/right/bottom 是导入时残留的 CSS 定位值，不应污染输出，
 * 否则 DragOverlay 预览会被这些残余值偏移，导致预览位置与松手后不一致）。
 */
export function nodeToCss(style: NodeStyle): CSSProperties {
  const { x, y, position, left, top, right, bottom, ...rest } = style
  void x
  void y
  void position
  void left
  void top
  void right
  void bottom
  return rest as CSSProperties
}

/** 链接样式：画布中带链接的元素显示为可点击风格 */
const LINK_STYLE: CSSProperties = {
  textDecoration: 'underline',
  textDecorationColor: '#6366f1',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  color: 'inherit',
}

/** 如果节点配置了 link，将内容包裹在 <a> 标签中 */
function wrapLink(node: CanvasNode, content: ReactNode): ReactNode {
  const link = node.interaction?.link
  if (!link?.href) return content
  return (
    <a
      href={link.href}
      target={link.target || '_self'}
      style={LINK_STYLE}
      onClick={(e) => e.preventDefault()}
    >
      {content}
    </a>
  )
}

/** 按节点类型渲染内容（不含定位/拖拽逻辑，纯内容） */
export function renderNodeContent(node: CanvasNode): ReactNode {
  switch (node.type) {
    case 'heading': {
      const Tag = `h${node.props.level || 1}` as 'h1' | 'h2' | 'h3'
      const el = <Tag style={{ margin: 0, minWidth: 0, whiteSpace: 'pre-line', wordBreak: 'break-word', textAlign: 'inherit' }}>{node.props.text}</Tag>
      return wrapLink(node, el)
    }
    case 'text': {
      const el = (
        <p style={{ margin: 0, whiteSpace: 'pre-line', wordBreak: 'break-word', minHeight: '1.2em', textAlign: 'inherit' }}>
          {node.props.text || '\u200B'}
        </p>
      )
      return wrapLink(node, el)
    }
    case 'image': {
      const shape = node.props.imageShape || 'rectangle'
      const styleMaxHeight = node.style.maxHeight
      // 仅当有 maxHeight 时（如 .img-brand max-height:2.75rem）用 width:auto
      // 让 SVG/品牌图按 viewBox 比例显示；普通图片（含裁切后）始终填满容器
      const useAutoWidth = !!styleMaxHeight
      const isShaped = shape !== 'rectangle'

      // 形状覆盖样式（裁切后的图片已包含裁切区域，不需要 cover/position）
      const shapeStyle: CSSProperties = {}
      if (shape === 'circle') {
        shapeStyle.borderRadius = '50%'
      } else if (shape === 'rounded') {
        shapeStyle.borderRadius = '16px'
      }

      const el = node.props.src ? (
        <img
          src={node.props.src}
          alt={node.props.alt || ''}
          style={{
            width: useAutoWidth ? 'auto' : '100%',
            height: isShaped ? '100%' : 'auto',
            maxWidth: '100%',
            display: 'block',
            borderRadius: 'inherit',
            ...shapeStyle,
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 14,
            userSelect: 'none',
            borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? '16px' : undefined,
          }}
        >
          双击上传图片
        </div>
      )
      return wrapLink(node, el)
    }
    case 'button': {
      const el = (
        <span style={{
          display: 'inline-block',
          padding: '0',
          backgroundColor: 'transparent',
          color: 'inherit',
          fontWeight: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          textAlign: 'inherit',
          cursor: 'inherit',
          border: 'none',
          whiteSpace: 'pre-line',
          wordBreak: 'break-word',
        }}>
          {node.props.text || ''}
        </span>
      )
      return wrapLink(node, el)
    }
    case 'card':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontWeight: 600, fontSize: node.props.titleFontSize || '18px', color: node.props.titleColor || 'inherit', marginBottom: 8, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{node.props.text}</div>
          <div style={{ fontSize: node.props.subtitleFontSize || '14px', color: node.props.subtitleColor || '#6b7280', lineHeight: node.props.subtitleLineHeight || 1.6, flex: 1, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            {node.props.subtitle}
          </div>
        </div>
      )
    case 'container':
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#9ca3af', fontSize: 13, width: '100%', height: '100%',
          minHeight: 60,
        }}>
          容器（拖入子元素）
        </div>
      )
    case 'divider':
      return null // 纯样式分割线，无内容
    case 'icon': {
      const iconVal = node.props.icon || 'star'
      const el = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
            <AutoIcon value={iconVal} size={24} />
          </span>
          {node.props.text && <span style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{node.props.text}</span>}
        </div>
      )
      return wrapLink(node, el)
    }
    case 'video':
      return node.props.src ? (
        <video
          src={node.props.src}
          poster={node.props.poster || undefined}
          controls
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 'inherit',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 14,
            userSelect: 'none',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 32, userSelect: 'none' }}>▶</span>
          <span>双击上传视频</span>
        </div>
      )
    case 'input':
	      return (
	        <div
	          style={{
	            width: '100%',
	            height: '100%',
	            minHeight: 40,
	            display: 'flex',
	            alignItems: 'center',
	            color: node.props.text ? '#374151' : '#9ca3af',
	            fontSize: 'inherit',
	            whiteSpace: 'pre-line',
	            wordBreak: 'break-word',
	          }}
	        >
	          {node.props.text || node.props.placeholder || '输入框占位'}
	        </div>
	      )
    case 'iframe':
      return node.props.src ? (
        <iframe
          src={node.props.src}
          title={node.props.alt || 'embedded page'}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 'inherit',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            minHeight: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 14,
            backgroundColor: '#f3f4f6',
            border: '2px dashed #d1d5db',
          }}
        >
          iframe 占位（设置 src URL）
        </div>
      )
    case 'navbar': {
      const links = (node.props.navLinks || '首页,关于,服务,联系').split(',').map((s) => s.trim()).filter(Boolean)
      const linkColor = node.props.linkColor || node.style.color || '#374151'
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontWeight: 700, fontSize: '20px', color: '#6366f1', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            {node.props.logo || 'PageForge'}
          </span>
          <div style={{ display: 'flex', gap: '24px' }}>
            {links.map((link, i) => (
              <span
                key={i}
                style={{
                  color: linkColor,
                  fontSize: node.style.fontSize || '16px',
                  fontWeight: node.style.fontWeight || '500',
                  cursor: 'pointer',
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                }}
              >
                {link}
              </span>
            ))}
          </div>
        </div>
      )
    }
    case 'grid': {
      const cols = node.props.columns || 3
      const gap = node.props.gridGap || node.style.gap || '16px'
      const gridStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
        width: '100%',
        minHeight: '120px',
      }
      const cellStyle: CSSProperties = {
        backgroundColor: '#ffffff',
        border: '2px dashed #d1d5db',
        borderRadius: '8px',
        minHeight: '80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: '13px',
      }
      return (
        <div style={gridStyle}>
          {Array.from({ length: cols }, (_, i) => (
            <div key={i} style={cellStyle}>
              网格 {i + 1}
            </div>
          ))}
        </div>
      )
    }
    case 'form': {
      const fields = (node.props.fields || '姓名,邮箱,留言').split(',').map((s) => s.trim()).filter(Boolean)
      const submitText = node.props.submitText || '提交'
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', marginBottom: '4px', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
            联系我们
          </div>
          {fields.map((field, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151', whiteSpace: 'pre-line', wordBreak: 'break-word' }}>{field}</label>
              {field === '留言' || field.toLowerCase().includes('message') ? (
                <textarea
                  placeholder={`请输入${field}`}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: '#ffffff',
                    minHeight: '80px',
                    resize: 'vertical',
                    outline: 'none',
                    pointerEvents: 'none',
                  }}
                  readOnly
                />
              ) : (
                <input
                  type="text"
                  placeholder={`请输入${field}`}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    pointerEvents: 'none',
                  }}
                  readOnly
                />
              )}
            </div>
          ))}
          <div
            style={{
              marginTop: '4px',
              padding: '12px 24px',
              backgroundColor: '#6366f1',
              color: '#ffffff',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 600,
              fontSize: '16px',
              cursor: 'pointer',
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {submitText}
          </div>
        </div>
      )
    }
    default:
      return null
  }
}

/**
 * 纯展示用的节点渲染器（无交互、无定位）。
 * 供 DragOverlay 与就地预览复用，确保拖拽预览与画布外观一致。
 */
export function NodeRenderer({ node }: { node: CanvasNode }) {
  const style: CSSProperties = {
    ...nodeToCss(node.style),
    ...(node.type === 'button'
      ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
      : {}),
  }
  return <div style={style}>{renderNodeContent(node)}</div>
}

/**
 * 递归预览树（供 DragOverlay 拖拽容器时显示其子节点）。
 * 与 CanvasElement 视觉一致，但无交互/无手柄。
 */
export function renderPreviewTree(node: CanvasNode): ReactNode {
  if (node.type === 'container') {
    if (!node.children.length) {
      return <div style={{ color: '#9ca3af', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: 60 }}>容器（拖入子元素）</div>
    }
    // 与 CanvasElement 一致：子元素使用 position: absolute + left/top 定位
    return node.children.map((c) => (
      <div
        key={c.id}
        style={{
          position: 'absolute',
          ...nodeToCss(c.style),
          // left/top 必须在 ...nodeToCss 之后，避免被 style 中的 left/top 覆盖
          // （例如导入节点可能带有 left:auto 等残余值）
          left: c.style.x ?? 0,
          top: c.style.y ?? 0,
          ...(c.style.width === undefined || c.style.width === '' ? { width: 'fit-content', maxWidth: '100%' } : {}),
          ...(c.type === 'button'
            ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
            : {}),
        }}
      >
        {renderPreviewTree(c)}
      </div>
    ))
  }
  return renderNodeContent(node)
}
