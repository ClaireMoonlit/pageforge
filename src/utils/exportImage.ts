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
 * 第一性原理导出方案：
 *
 * 问题：html2canvas 的 fillText() 基线计算对 position:absolute + top/left
 * 偏移的元素存在 2-5px 向下偏移，且 transform:scale(zoom) 干扰渲染。
 *
 * 方案：foreignObjectRendering: true 将 HTML 嵌入 SVG <foreignObject>，
 * 由浏览器原生渲染引擎处理，文字位置与浏览器显示完全一致。
 *
 * 在 onclone 回调中剥离父容器的 position/transform，确保 SVG viewport
 * 从原点开始计算（之前"只显示右半"的根因是 viewport 被 position:absolute
 * 偏移导致错位）。
 */
function stripCanvasForExport(clonedDoc: Document): void {
  const el = clonedDoc.querySelector('[data-pf-export-target]') as HTMLElement | null
  if (!el) return
  // 保留 position: absolute（子元素 absolute 定位需要它作为包含块），
  // 仅清零 top/left 确保 SVG foreignObject 的 viewport 从原点开始。
  // 之前改成 position:relative 导致子元素宽度计算异常（fit-content 参照物变了）。
  el.style.top = '0'
  el.style.left = '0'
  el.style.transform = ''
  el.style.transformOrigin = ''
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
      logging: false,
      foreignObjectRendering: true,
      onclone: stripCanvasForExport,
    })
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('导出失败：画布中包含跨域图片，无法生成 PNG。请使用本地图片或确保图片服务器允许跨域访问。'))
      }, 'image/png')
    })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, filename)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
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
      logging: false,
      foreignObjectRendering: true,
      onclone: stripCanvasForExport,
    })

    let imgData: string
    try {
      imgData = canvas.toDataURL('image/jpeg', 0.85)
    } catch {
      throw new Error('导出失败：画布中包含跨域图片，无法生成 PDF。请使用本地图片或确保图片服务器允许跨域访问。')
    }
    const imgW = canvas.width
    const imgH = canvas.height

    const orientation = imgW >= imgH ? 'landscape' : 'portrait'
    const pdf = new jsPDF({ orientation, unit: 'px', format: [imgW, imgH] })

    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const ratio = imgW / imgH

    const renderW = pageW
    const renderH = pageW / ratio

    pdf.addImage(imgData, 'JPEG', 0, 0, renderW, renderH)

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
// 文字位置由 foreignObjectRendering + onclone 保证与浏览器渲染一致。

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