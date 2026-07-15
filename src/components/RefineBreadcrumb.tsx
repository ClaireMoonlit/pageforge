import { useCallback, useEffect, useState } from 'react'
import { useEditorStore, type RefineElementInfo } from '@/store/editorStore'

/** HTML 标签名 → 组件类型中文名（与 RefineInspector 中的 HTML_TAG_TYPE_LABEL 保持一致） */
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

function getTagTypeLabel(tagName: string): string {
  return HTML_TAG_TYPE_LABEL[tagName.toLowerCase()] || tagName
}

/**
 * 面包屑导航：显示选中元素在 DOM 树中的层级路径
 *
 * 点击任意祖先元素可跳转到该元素，方便在深层嵌套中导航。
 * 设计：水平排列的标签链，用紫色系与 PageForge 精修模式主题一致。
 * 显示中文组件类型（如「页头」「容器」），tooltip 仍保留原始 HTML 标签便于技术调试。
 */
export function RefineBreadcrumb() {
  const session = useEditorStore((s) => s.refineSession)
  const selectRefineElement = useEditorStore((s) => s.selectRefineElement)
  const selectedElement = session?.selectedElement ?? null
  const [ancestors, setAncestors] = useState<RefineElementInfo[]>([])

  /** 根据选中元素构建祖先链 */
  const buildAncestors = useCallback(() => {
    if (!selectedElement) {
      setAncestors([])
      return
    }
    const iframe = document.getElementById('pf-refine-iframe') as HTMLIFrameElement | null
    const doc = iframe?.contentDocument
    if (!doc) {
      setAncestors([])
      return
    }

    const eid = selectedElement.attributes['data-pf-eid'] || ''
    let el: HTMLElement | null = doc.querySelector(`[data-pf-eid="${eid}"]`) as HTMLElement | null
    if (!el) {
      setAncestors([])
      return
    }

    const chain: RefineElementInfo[] = []
    let current: HTMLElement | null = el.parentElement
    while (current && current !== doc.body && current !== doc.documentElement) {
      const rect = current.getBoundingClientRect()
      const attributes: Record<string, string> = {}
      for (const attr of Array.from(current.attributes)) {
        if (attr.name === 'style') continue
        attributes[attr.name] = attr.value
      }
      chain.unshift({
        tagName: current.tagName.toLowerCase(),
        textContent: (current.textContent ?? '').slice(0, 50),
        attributes,
        inlineStyle: current.style?.cssText ?? '',
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      })
      current = current.parentElement
    }
    setAncestors(chain)
  }, [selectedElement])

  useEffect(() => {
    buildAncestors()
  }, [buildAncestors])

  if (ancestors.length === 0) return null

  const handleClick = (info: RefineElementInfo) => {
    selectRefineElement(info)
  }

  return (
    <div className="px-3 py-2 border-b border-ink-700 flex items-center gap-1 flex-wrap">
      {ancestors.map((a, i) => {
        const typeLabel = getTagTypeLabel(a.tagName)
        const cls = a.attributes.class?.split(/\s+/).filter(Boolean)[0]
        return (
          <span key={i} className="flex items-center gap-1">
            <button
              onClick={() => handleClick(a)}
              className="px-1.5 py-0.5 rounded text-[11px] bg-ink-700 hover:bg-purple-800/50 text-gray-300 hover:text-purple-200 transition-colors"
              title={`跳转到 &lt;${a.tagName}&gt;`}
            >
              {typeLabel}
              {cls && <span className="text-emerald-300 ml-0.5">.{cls}</span>}
            </button>
            {i < ancestors.length - 1 && (
              <span className="text-gray-600 text-[10px]">/</span>
            )}
          </span>
        )
      })}
    </div>
  )
}