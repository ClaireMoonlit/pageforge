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
 * 第一性原理：手动 clone 画布 DOM，剥离所有干扰 html2canvas 的样式，
 * 配合 foreignObjectRendering: true 实现像素级精准的文本渲染。
 *
 * 核心设计：
 * 1. 外层的 wrapper（position:fixed）仅用于隐藏 clone，不参与渲染
 * 2. clone 本身保持 position:relative + 干净坐标，确保 SVG viewport 从原点开始
 * 3. 子元素保留 position:absolute —— foreignObject 内浏览器原生渲染，文本位置完全精准
 */
function prepareExportClone(): { clone: HTMLElement; wrapper: HTMLElement } | null {
  const original = getCanvasContentElement()
  if (!original) return null

  const clone = original.cloneNode(true) as HTMLElement

  // 剥离父容器上干扰 html2canvas / foreignObject 的样式
  clone.style.position = 'relative'
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.right = ''
  clone.style.bottom = ''
  clone.style.transform = ''
  clone.style.transformOrigin = ''
  // 显式设为 visible：wrapper 的 visibility:hidden 是继承属性，
  // 若不覆盖，foreignObject 内的内容也会被隐藏，导致导出纯背景图
  clone.style.visibility = 'visible'

  // 创建隐藏 wrapper：wrapper 定位到 (0,0) 而非 -9999px，
  // 确保 foreignObject 的 SVG viewport 与元素实际渲染区域一致
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;z-index:-1'
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

  // 手动 clone 干净 DOM + foreignObject 渲染：文字位置与浏览器完全一致，无下移
  const cloneResult = prepareExportClone()
  if (!cloneResult) return

  try {
    const canvas = await html2canvas(cloneResult.clone, {
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
    removeExportClone(cloneResult)
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

  const cloneResult = prepareExportClone()
  if (!cloneResult) return

  try {
    const canvas = await html2canvas(cloneResult.clone, {
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
    removeExportClone(cloneResult)
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
// 文字位置由 foreignObjectRendering + 手动 clone 保证与浏览器渲染一致。

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