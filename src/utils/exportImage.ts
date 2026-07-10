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
 * 1. foreignObjectRendering: true → 文本由浏览器原生渲染，不下移
 * 2. 手动 clone + wrapper 定位到 (0,0) → SVG viewport 从原点开始，不裁切
 * 3. clone 保留 position: absolute → 子元素宽度计算与原始画布一致
 *
 * 为什么用 wrapper 而非直接改 clone 为 fixed：
 * position: fixed 的包含块是 viewport，与原始元素 position: absolute 的
 * 包含块不同，导致子元素 fit-content/max-width 计算偏差。
 * wrapper(position:fixed) → clone(position:absolute) 既保证 viewport 原点，
 * 又保持与原始画布相同的定位上下文。
 */
function prepareExportClone(): { clone: HTMLElement; wrapper: HTMLElement } | null {
  const original = getCanvasContentElement()
  if (!original) return null

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:-1'

  const clone = original.cloneNode(true) as HTMLElement
  // 保留 position: absolute（原始值），仅清零坐标和 transform
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  return { clone, wrapper }
}

function removeExportClone(result: { clone: HTMLElement; wrapper: HTMLElement } | null): void {
  if (result?.wrapper?.parentNode) {
    result.wrapper.parentNode.removeChild(result.wrapper)
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

  const result = prepareExportClone()
  if (!result) return

  try {
    const canvas = await html2canvas(result.clone, {
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
    removeExportClone(result)
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

  const result = prepareExportClone()
  if (!result) return

  try {
    const canvas = await html2canvas(result.clone, {
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
    removeExportClone(result)
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

// ——— 导出前准备：进入预览模式（不改变 zoom，clone 已剥离 transform）———

let savedPreviewMode = false

async function ensureExportReady(): Promise<void> {
  const store = useEditorStore.getState()

  savedPreviewMode = store.previewMode

  store.selectNode(null)

  if (!savedPreviewMode) {
    store.togglePreviewMode()
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  }
}

function restoreExportState(): void {
  const store = useEditorStore.getState()

  if (store.previewMode !== savedPreviewMode) {
    store.togglePreviewMode()
  }
}