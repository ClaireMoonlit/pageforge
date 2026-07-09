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
 * 图片分辨率 = 画布逻辑尺寸 × scale（默认 1.5x，兼顾速度与品质）
 *
 * 性能优化：
 * - 默认 scale 1.5×（2.25× 像素量 vs 2× 的 4× 像素量，速度提升 ~44%）
 * - 使用 canvas.toBlob() + blob URL 替代 toDataURL（异步编码 + 避免 base64 膨胀）
 */
export async function exportAsPNG(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
): Promise<void> {
  const scale = options?.scale ?? 1.5
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      logging: false,
    })
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('导出失败：画布中包含跨域图片，无法生成 PNG。请使用本地图片或确保图片服务器允许跨域访问。'))
      }, 'image/png')
    })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, filename)
    // 延迟释放 blob URL，确保浏览器已开始下载
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  } finally {
    restoreExportState()
  }
}

/**
 * 导出画布内容为 PDF 并触发下载。
 * 自动判断页面方向（宽 > 高 → 横版），内容超出单页时自动分页。
 *
 * 性能优化：scale 默认 1.5×，JPEG 质量 0.85（平衡速度与品质）
 */
export async function exportAsPDF(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
): Promise<void> {
  const scale = options?.scale ?? 1.5
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      logging: false,
    })

    let imgData: string
    try {
      imgData = canvas.toDataURL('image/jpeg', 0.85)
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

/** 触发浏览器下载 */
function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
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

  savedZoom = store.zoom
  savedPreviewMode = store.previewMode

  // 清除选中状态（避免选中边框被导出）
  store.selectNode(null)

  let needsUpdate = false

  // 进入预览模式（隐藏所有选中 UI 和交互标记）
  if (!savedPreviewMode) {
    store.togglePreviewMode()
    needsUpdate = true
  }

  // 设为 100% zoom
  if (savedZoom !== 1) {
    store.setZoom(1)
    needsUpdate = true
  }

  // 仅在状态确实变化时才等待 DOM 更新
  // selectNode(null) 也会触发 React 重渲染，但通常在 1 帧内完成
  if (needsUpdate) {
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  }
}

function restoreExportState(): void {
  const store = useEditorStore.getState()

  if (savedZoom !== 1) {
    store.setZoom(savedZoom)
  }

  if (store.previewMode !== savedPreviewMode) {
    store.togglePreviewMode()
  }
}