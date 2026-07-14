import { useEffect, useRef, useState } from 'react'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'

interface RefineCanvasProps {
  /** 用于在 document 中唯一定位 iframe，便于 serializeRefineHtml 通过 id 找到它 */
  iframeId?: string
}

/**
 * 精修模式画布：在 iframe 中渲染用户导入的原始 HTML，100% 还原原页面。
 *
 * 核心机制：
 * 1. iframe srcdoc 写入原始 HTML，所有 CSS / 资源按原页面渲染
 * 2. 通过捕获 click / mouseover 事件实现元素选择（不修改原 DOM 行为）
 * 3. 选中元素后通过外层覆盖层（绝对定位 div）画高亮框，不污染 iframe 内部
 * 4. 文本编辑直接写入 iframe DOM（contenteditable），保留原页面所有样式
 *
 * 与自由画布模式互斥：进入精修模式时 store 会清空 nodes，退出时清空 refineSession
 */
export function RefineCanvas({ iframeId = 'pf-refine-iframe' }: RefineCanvasProps) {
  const session = useEditorStore((s) => s.refineSession)
  const selectRefineElement = useEditorStore((s) => s.selectRefineElement)
  const canvas = useEditorStore((s) => s.canvas)
  const zoom = useEditorStore((s) => s.zoom)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  /** 鼠标悬停的元素（用于画 hover 框） */
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  /** iframe 是否已加载完成（用于启用交互） */
  const [ready, setReady] = useState(false)

  // session 变化时强制重新挂载 iframe（srcdoc 改变）
  useEffect(() => {
    setReady(false)
  }, [session?.sessionKey])

  /**
   * 从 iframe 内的一个 DOM 元素提取 RefineElementInfo
   */
  const extractInfo = (el: HTMLElement): RefineElementInfo | null => {
    try {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return null
      const rect = el.getBoundingClientRect()
      const attributes: Record<string, string> = {}
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === 'style') continue
        attributes[attr.name] = attr.value
      }
      // textContent 取元素自身的直接文本（不含后代元素文本）以保持精修粒度
      // 但实际上为了简单起见，使用 element.textContent（包含子元素）
      // 用户编辑时也是改 textContent，整体替换
      return {
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent ?? '',
        attributes,
        inlineStyle: el.style?.cssText ?? '',
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      }
    } catch {
      return null
    }
  }

  /**
   * 绑定 iframe 内部文档的事件监听
   *
   * 注意：不能用 iframe.addEventListener('load') 来触发绑定 —— srcdoc 改变后
   * iframe 可能已加载完成，load 事件不会再次触发，导致 listener 永远不绑定。
   * 这里改为：每次 sessionKey 变化时直接尝试绑定，如果 contentDocument 还没
   * 就监听 load 事件，如果已加载则立即绑定。
   */
  useEffect(() => {
    if (!session) return
    const iframe = iframeRef.current
    if (!iframe) return

    let cancelled = false
    let doc: Document | null = null

    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const target = e.target as HTMLElement | null
      console.info('[RefineCanvas] onClick fired, target:', target && target.tagName, target && (target as HTMLElement).textContent?.slice(0, 20))
      if (!target) return
      const info = extractInfo(target)
      if (info) {
        console.info('[RefineCanvas] calling selectRefineElement with tag:', info.tagName)
        selectRefineElement(info)
      }
    }

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.tagName === 'HTML' || target.tagName === 'BODY') {
        setHoverRect(null)
        return
      }
      const r = target.getBoundingClientRect()
      setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    const onMouseOut = () => {
      setHoverRect(null)
    }

    const bind = () => {
      if (cancelled) return
      doc = iframe.contentDocument
      if (!doc || !doc.body) return
      setReady(true)
      doc.body.setAttribute('data-pf-refine', 'true')
      doc.addEventListener('click', onClick, true)
      doc.addEventListener('mouseover', onMouseOver, true)
      doc.addEventListener('mouseout', onMouseOut, true)
      console.info('[RefineCanvas] event listeners bound on sessionKey:', session.sessionKey)
    }

    // 如果 contentDocument 已加载完成（srcdoc 已渲染），立即绑定
    if (iframe.contentDocument && iframe.contentDocument.body) {
      bind()
    } else {
      // 否则等待 load 事件
      const onLoad = () => {
        bind()
        iframe.removeEventListener('load', onLoad)
      }
      iframe.addEventListener('load', onLoad)
    }

    return () => {
      cancelled = true
      if (doc) {
        doc.removeEventListener('click', onClick, true)
        doc.removeEventListener('mouseover', onMouseOver, true)
        doc.removeEventListener('mouseout', onMouseOut, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionKey])

  if (!session) return null

  return (
    <div
      style={{
        position: 'relative',
        width: session.width,
        height: session.height,
        backgroundColor: canvas.backgroundColor,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        // 缩放通过外层 wrapper（与 Canvas 一致），内部用原始尺寸
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
        // 给外层一个可识别的标记，方便 Inspector 识别精修模式
        ['--pf-refine' as string]: '1',
      }}
      data-pf-refine-canvas="true"
    >
      {/* iframe：承载原始 HTML，srcdoc 写入以保持完全隔离 */}
      <iframe
        id={iframeId}
        ref={iframeRef}
        title="Refine mode canvas"
        srcDoc={session.html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          backgroundColor: 'transparent',
          // 加载中时给点反馈
          opacity: ready ? 1 : 0.3,
          transition: 'opacity 0.2s',
          pointerEvents: 'auto',
        }}
      />

      {/* Hover 框：浅蓝虚线 */}
      {hoverRect && (
        <div
          style={{
            position: 'absolute',
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
            border: '1px dashed rgba(99, 102, 241, 0.6)',
            backgroundColor: 'rgba(99, 102, 241, 0.06)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* 选中框：品牌色实线 + 标签 */}
      {session.selectedElement && (
        <div
          style={{
            position: 'absolute',
            left: session.selectedElement.rect.left,
            top: session.selectedElement.rect.top,
            width: session.selectedElement.rect.width,
            height: session.selectedElement.rect.height,
            border: '2px solid #6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -22,
              left: 0,
              backgroundColor: '#6366f1',
              color: 'white',
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
            }}
          >
            &lt;{session.selectedElement.tagName}&gt;
          </div>
        </div>
      )}
    </div>
  )
}
