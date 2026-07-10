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
  // 关键：必须给 wrapper 设置显式宽高，否则 position:fixed 的 wrapper 会坍缩为 0×0
  // （position:absolute 的子元素脱离文档流，不参与 shrink-to-fit 计算）
  // 导致 clone 的包含块为 0×0，right 计算为 -1200px，html2canvas 渲染异常
  wrapper.style.cssText = `position:fixed;top:0;left:0;width:${original.offsetWidth}px;height:${original.offsetHeight}px;pointer-events:none;z-index:-1`

  const clone = original.cloneNode(true) as HTMLElement
  // 关键：clone 必须设为 position: relative（而非保留原始的 absolute）
  // position: relative 在 wrapper 内正常参与文档流，width 由 wrapper 决定
  // 同时仍为子元素的 position: absolute 提供包含块
  clone.style.position = 'relative'
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.transform = ''
  clone.style.transformOrigin = ''

  // 关键：移除 clone 中所有 overflow-wrap: break-word
  // html2canvas foreignObject 渲染存在亚像素舍入（如 130.7px → 130px），
  // 导致容器比文本窄 1px，overflow-wrap: break-word 会将最后一个字符断开。
  // 用 !important 样式覆盖，阻止因舍入导致的异常断词。
  // 这对导出是安全的：克隆与原始尺寸一致，正常单词边界换行不受影响。
  const fixStyle = document.createElement('style')
  fixStyle.textContent = '* { overflow-wrap: normal !important; word-break: normal !important; }'
  clone.insertBefore(fixStyle, clone.firstChild)

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  // ====== 第一性原理诊断：对比原始元素与克隆元素的计算样式 ======
  const WIDTH_PROPS = ['width', 'maxWidth', 'minWidth', 'boxSizing', 'position', 'display', 'left', 'right', 'overflow', 'whiteSpace', 'wordBreak'] as const

  console.group('🔍 [exportImage] 第一性原理宽度诊断')

  // 1. 对比画布根元素
  const origRoot = getComputedStyle(original)
  const cloneRoot = getComputedStyle(clone)
  console.log('📐 画布根元素 (data-pf-export-target):')
  for (const prop of WIDTH_PROPS) {
    const ov = origRoot.getPropertyValue(prop)
    const cv = cloneRoot.getPropertyValue(prop)
    const match = ov === cv ? '✅' : '❌'
    console.log(`  ${match} ${prop}: original="${ov}"  clone="${cv}"`)
  }

  // 2. 对比所有文本元素 (p, h1-h6 等)
  const origTexts = original.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div')
  const cloneTexts = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div')

  let mismatchCount = 0
  const minCount = Math.min(origTexts.length, cloneTexts.length)
  for (let i = 0; i < minCount; i++) {
    const oe = origTexts[i] as HTMLElement
    const ce = cloneTexts[i] as HTMLElement
    const ocs = getComputedStyle(oe)
    const ccs = getComputedStyle(ce)
    const ow = ocs.width
    const cw = ccs.width
    if (ow !== cw) {
      mismatchCount++
      const tag = oe.tagName.toLowerCase()
      const text = (oe.textContent || '').slice(0, 40)
      console.log(
        `❌ 文本 #${i} <${tag}> "${text}"`,
        `\n    original: width=${ow} maxWidth=${ocs.maxWidth} boxSizing=${ocs.boxSizing} display=${ocs.display} position=${ocs.position}`,
        `\n    clone:    width=${cw} maxWidth=${ccs.maxWidth} boxSizing=${ccs.boxSizing} display=${ccs.display} position=${ccs.position}`,
        `\n    original parent width=${(oe.parentElement ? getComputedStyle(oe.parentElement).width : 'N/A')}`,
        `\n    clone parent width=${(ce.parentElement ? getComputedStyle(ce.parentElement).width : 'N/A')}`,
      )
    }
  }

  if (mismatchCount === 0) {
    console.log('✅ 所有文本元素宽度一致（共 ' + minCount + ' 个）')
  } else {
    console.warn(`⚠️ ${mismatchCount}/${minCount} 个文本元素宽度不一致`)
  }

  // 3. 检查 wrapper 的尺寸（position:fixed 的包含块）
  const wrapperCS = getComputedStyle(wrapper)
  console.log('📦 wrapper (position:fixed):', `width=${wrapperCS.width} height=${wrapperCS.height}`)

  console.groupEnd()

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

  // 确保字体加载完成 + 浏览器完成布局，避免因字体未就绪导致文本宽度偏差
  await document.fonts.ready
  await new Promise((r) => requestAnimationFrame(r))

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

  // 确保字体加载完成 + 浏览器完成布局，避免因字体未就绪导致文本宽度偏差
  await document.fonts.ready
  await new Promise((r) => requestAnimationFrame(r))

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