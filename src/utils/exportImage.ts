import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { useEditorStore } from '@/store/editorStore'

/** 获取画布内容区域 DOM 元素，用于导出截图 */
export function getCanvasContentElement(): HTMLElement | null {
  return document.querySelector('[data-pf-export-target]') as HTMLElement | null
}

interface ExportOptions {
  scale?: number
  backgroundColor?: string
}

/**
 * 导出画布内容为 PNG 图片并触发下载。
 * 图片分辨率 = 画布逻辑尺寸 × scale（默认 2x）
 */
export async function exportAsPNG(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
): Promise<void> {
  const scale = options?.scale ?? 2
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      // 不设置 allowTaint：跨域图片会导致 html2canvas 抛出异常，
      // 比 canvas 被污染后 toDataURL/toBlob 静默返回 null/抛 SecurityError 更好排查
    })
    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      // canvas 被污染（有跨域图片且无 CORS 头）→ toDataURL 抛 SecurityError
      throw new Error('导出失败：画布中包含跨域图片，无法生成 PNG。请使用本地图片或确保图片服务器允许跨域访问。')
    }
    triggerDownload(dataUrl, filename)
  } finally {
    restoreExportState()
  }
}

/**
 * 导出画布内容为 PDF 并触发下载。
 * 自动判断页面方向（宽 > 高 → 横版），内容超出单页时自动分页。
 */
export async function exportAsPDF(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
): Promise<void> {
  const scale = options?.scale ?? 2
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
    })

    let imgData: string
    try {
      imgData = canvas.toDataURL('image/jpeg', 0.95)
    } catch {
      throw new Error('导出失败：画布中包含跨域图片，无法生成 PDF。请使用本地图片或确保图片服务器允许跨域访问。')
    }
    const imgW = canvas.width
    const imgH = canvas.height

    // 根据宽高比判断方向
    const orientation = imgW >= imgH ? 'landscape' : 'portrait'
    const pdf = new jsPDF({ orientation, unit: 'px', format: [imgW, imgH] })

    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const ratio = imgW / imgH

    // 图片适配页面宽度
    const renderW = pageW
    const renderH = pageW / ratio

    pdf.addImage(imgData, 'JPEG', 0, 0, renderW, renderH)

    // 如果高度超过一页，自动分页
    let remainingH = renderH - pageH
    while (remainingH > 0) {
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, -pageH * (pdf.getNumberOfPages() - 1), renderW, renderH)
      remainingH -= pageH
    }

    pdf.save(filename)
  } finally {
    restoreExportState()
  }
}

/** 触发浏览器下载（data URL 方式，避免 blob URL 安全警告） */
function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ——— 导出前准备：进入预览模式 + 设为 100% zoom ———
// 预览模式隐藏选中边框和手柄，确保截图干净；
// zoom=1 确保 html2canvas 不受 transform 影响。

let savedZoom = 1
let savedPreviewMode = false

async function ensureExportReady(): Promise<void> {
  const store = useEditorStore.getState()

  // 保存状态
  savedZoom = store.zoom
  savedPreviewMode = store.previewMode

  // 清除选中状态（避免选中边框被导出）
  store.selectNode(null)

  // 进入预览模式（隐藏所有选中 UI 和交互标记）
  if (!savedPreviewMode) {
    store.togglePreviewMode()
  }

  // 设为 100% zoom
  if (savedZoom !== 1) {
    store.setZoom(1)
  }

  // 等待 DOM 重绘
  await new Promise((r) => requestAnimationFrame(r))
  await new Promise((r) => requestAnimationFrame(r))
}

function restoreExportState(): void {
  const store = useEditorStore.getState()

  // 还原 zoom
  if (savedZoom !== 1) {
    store.setZoom(savedZoom)
  }

  // 还原预览模式
  if (store.previewMode !== savedPreviewMode) {
    store.togglePreviewMode()
  }
}