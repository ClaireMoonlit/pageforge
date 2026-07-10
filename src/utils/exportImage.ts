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
 * 三层约束：
 * 1. foreignObjectRendering: true → 文本由浏览器原生渲染，不下移
 * 2. 手动 clone + position:fixed + top/left:0 → SVG viewport 从原点开始，不裁切
 * 3. 保留 position:absolute/fixed 作为包含块 → 子元素宽度计算不变
 *
 * 为什么不用 onclone 回调：
 * html2canvas 在 onclone 之前就已用原始元素的坐标计算 SVG viewport，
 * 回调中修改 top/left 无法纠正已算好的 viewport → 导致"只显示右半"。
 * 必须先手动 clone 并定位到 (0,0)，再传入 html2canvas。
 */
function prepareExportClone(): HTMLElement | null {
  const original = getCanvasContentElement()
  if (!original) return null

  const clone = original.cloneNode(true) as HTMLElement

  // 清零坐标偏移，transform 也清掉（zoom=1 时 scale(1) 是恒等但干扰 viewport 计算）
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  // 改为 fixed 定位到视口原点，确保 html2canvas 从 (0,0) 开始渲染
  clone.style.position = 'fixed'
  clone.style.zIndex = '-1'
  clone.style.pointerEvents = 'none'

  document.body.appendChild(clone)
  return clone
}

function removeExportClone(clone: HTMLElement | null): void {
  if (clone?.parentNode) {
    clone.parentNode.removeChild(clone)
  }
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

  const clone = prepareExportClone()
  if (!clone) return

  try {
    const canvas = await html2canvas(clone, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      logging: false,
      foreignObjectRendering: true,
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
    removeExportClone(clone)
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

  const clone = prepareExportClone()
  if (!clone) return

  try {
    const canvas = await html2canvas(clone, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      logging: false,
      foreignObjectRendering: true,
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
    removeExportClone(clone)
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

let savedZoom = 1
let savedPreviewMode = false

async function ensureExportReady(): Promise<void> {
  const store = useEditorStore.getState()

  savedZoom = store.zoom
  savedPreviewMode = store.previewMode

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