/**
 * 精修模式 HTML 序列化工具
 *
 * 提供独立的 HTML 序列化函数（不依赖 React 组件 / store hook），
 * 便于在事件处理、复制操作等命令式场景中调用。
 *
 * 实现：直接通过 document.getElementById 找到精修 iframe，
 * 从其 contentDocument 提取完整 HTML（含 doctype）。
 *
 * 与 store.serializeRefineHtml 的区别：
 * - store 版本：store 内部使用，依赖 zustand state
 * - 本工具：可被任意位置调用（如 RefineCanvas 浮动徽章的"复制"按钮）
 */
export function serializeRefineHtml(iframeId: string = 'pf-refine-iframe'): string {
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null
  if (!iframe || !iframe.contentDocument) {
    console.warn('[refineSerialization] iframe 不存在或未加载完成：', iframeId)
    return ''
  }
  const doc = iframe.contentDocument
  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}>\n`
    : '<!DOCTYPE html>\n'
  return doctype + doc.documentElement.outerHTML
}
