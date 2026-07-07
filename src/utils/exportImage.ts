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
 * @param fileHandle 可选，如果已通过 showSaveFilePicker 获取句柄则直接写入，
 *   避免渲染完成后才弹对话框的延迟，同时避免传统下载方式的安全警告。
 */
export async function exportAsPNG(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
  fileHandle?: FileSystemFileHandle,
): Promise<void> {
  const scale = options?.scale ?? 2
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      allowTaint: true,
    })
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!blob) throw new Error('Failed to create blob')

    if (fileHandle) {
      await writeToHandle(fileHandle, blob)
    } else {
      await saveBlob(blob, filename, 'image/png')
    }
  } finally {
    restoreExportState()
  }
}

/**
 * 导出画布内容为 PDF 并触发下载。
 * 自动判断页面方向（宽 > 高 → 横版），内容超出单页时自动分页。
 *
 * @param fileHandle 可选，如果已通过 showSaveFilePicker 获取句柄则直接写入。
 */
export async function exportAsPDF(
  element: HTMLElement,
  filename: string,
  options?: ExportOptions,
  fileHandle?: FileSystemFileHandle,
): Promise<void> {
  const scale = options?.scale ?? 2
  const bg = options?.backgroundColor ?? '#ffffff'

  await ensureExportReady()

  try {
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      allowTaint: true,
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
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

    const pdfBlob = pdf.output('blob') as Blob

    if (fileHandle) {
      await writeToHandle(fileHandle, pdfBlob)
    } else {
      await saveBlob(pdfBlob, filename, 'application/pdf')
    }
  } finally {
    restoreExportState()
  }
}

/** 触发浏览器下载（blob URL / data URL 方式） */
function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * 在用户点击事件中调用，立即弹出保存对话框获取文件句柄。
 * 应在导出渲染之前调用，让用户感知对话框是即时响应的。
 * 返回句柄或 null（用户取消 / 不支持）。
 */
export async function getFileHandle(
  filename: string,
  mimeType: string,
): Promise<FileSystemFileHandle | null> {
  if (!('showSaveFilePicker' in window)) return null
  try {
    const ext = filename.split('.').pop() || ''
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: `${ext.toUpperCase()} 文件`,
        accept: { [mimeType]: [`.${ext}`] },
      }],
    })
    return handle as FileSystemFileHandle
  } catch (err: any) {
    if (err.name === 'AbortError') return null // 用户取消
    // 其他错误也返回 null，后续会回退到传统方式
    console.warn('showSaveFilePicker 失败:', err)
    return null
  }
}

/** 将 blob 写入已获取的文件句柄，包含完整的错误处理 */
async function writeToHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  try {
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
  } catch (err: any) {
    // 文件被占用 / 无写入权限 / 磁盘满等
    if (
      err.name === 'NotAllowedError' ||
      err.name === 'InvalidStateError' ||
      err.name === 'NoModificationAllowedError' ||
      err.name === 'QuotaExceededError'
    ) {
      // 用 setTimeout 0 推迟到下一事件循环，避免 alert 阻塞 React 重渲染
      // 导致 #185 maximum update depth 死循环。
      const msg = '文件保存失败：目标文件可能正在被其他应用使用，或磁盘空间不足，请关闭文件后重试。'
      setTimeout(() => alert(msg), 0)
      return
    }
    throw err
  }
}

/**
 * 保存 Blob 到文件。
 * 优先使用 showSaveFilePicker（可检测文件被占用等错误），
 * 不支持时回退到传统 <a download> 方式。
 */
async function saveBlob(blob: Blob, filename: string, mimeType: string): Promise<void> {
  // 优先使用 File System Access API（Chromium 浏览器）
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || ''
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: `${ext.toUpperCase()} 文件`,
          accept: { [mimeType]: [`.${ext}`] },
        }],
      })
      await writeToHandle(handle, blob)
      return
    } catch (err: any) {
      // 用户取消保存 → 静默退出
      if (err.name === 'AbortError') return
      // 文件被占用或其他写入错误 → 已在 writeToHandle 中处理
      // 其他错误 → 回退到传统下载方式
      console.warn('showSaveFilePicker 失败，回退到传统下载:', err)
    }
  }

  // 回退：传统 <a download> 方式（注意：此方式无法检测文件占用错误，且文件会被标记为"来自互联网"）
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  // 延迟释放 blob URL，确保浏览器已开始下载
  setTimeout(() => URL.revokeObjectURL(url), 2000)
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