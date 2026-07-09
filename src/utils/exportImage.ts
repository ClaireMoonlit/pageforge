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
 *
 * 性能优化：使用 canvas.toBlob() + blob URL 替代 toDataURL（异步编码 + 避免 base64 膨胀）
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
      logging: false,
      // onclone: 在 html2canvas 内部 clone 上剥掉 position/transform，
      // 让 fillText 基线计算不受这些属性干扰，解决文字下移问题
      onclone: (_, clonedEl) => stripCanvasStyles(clonedEl),
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
 * 性能优化：JPEG 质量 0.85（平衡速度与品质）
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
      logging: false,
      onclone: (_, clonedEl) => stripCanvasStyles(clonedEl),
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

/**
 * 在 html2canvas 的 onclone 回调中调用：剥掉 canvas 容器上的
 * position / top / left / transform，让 html2canvas 在"干净"的 DOM 上渲染。
 * 这解决了 fillText 基线受 CSS transform 和 absolute 定位干扰导致的文字下移。
 */
function stripCanvasStyles(el: HTMLElement): void {
  el.style.position = 'static'
  el.style.top = ''
  el.style.left = ''
  el.style.right = ''
  el.style.bottom = ''
  el.style.transform = ''
  el.style.transformOrigin = ''
}

// ——— 导出前准备：进入预览模式 + 设为 100% zoom ———
// 预览模式隐藏选中边框和手柄，确保截图干净；
// 文字位置修正由 onclone → stripCanvasStyles 在 html2canvas 内部完成。

let savedZoom = 1
let savedPreviewMode = false

async function ensureExportReady(): Promise<void> {
  const store = useEditorStore.getState()

  savedZoom = store.zoom
  savedPreviewMode = store.previewMode

  // 清除选中状态（避免选中边框被导出）
  store.selectNode(null)

  let needsUpdate = false

  if (!savedPreviewMode) {
    store.togglePreviewMode()
    needsUpdate = true
  }

  if (savedZoom !== 1) {
    store.setZoom(1)
    needsUpdate = true
  }

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