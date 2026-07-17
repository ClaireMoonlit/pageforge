import { createPortal } from 'react-dom'

export interface ImageWarningDialogProps {
  /** 不可访问图片数量 */
  count: number
  /** 关闭弹窗 */
  onClose: () => void
}

/**
 * 上传/粘贴 HTML 后，若检测到本地图片资源，弹此对话框提示用户。
 * 纯文字、无 emoji，文案面向非技术用户。
 */
export function ImageWarningDialog({ count, onClose }: ImageWarningDialogProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-ink-800 border border-ink-600 rounded-xl w-[480px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-2 border-b border-ink-600">
          <h2 className="text-gray-100 font-semibold text-base">无法显示图片</h2>
        </div>
        <div className="px-6 py-4 text-sm text-gray-300 leading-relaxed space-y-3">
          <p>
            上传的 HTML 引用了{' '}
            <span className="text-gray-100 font-mono">{count}</span>{' '}
            张本地图片。浏览器无法访问您电脑上的文件，因此这些图片在
            PageForge 中暂时无法显示。
          </p>
          <p>您可以：</p>
          <ol className="list-decimal list-inside space-y-2 pl-1">
            <li>
              改用左侧「模板库」中的模板（图片已自动准备好）
            </li>
            <li>
              将图片上传到图床（SM.MS / Imgur 等），获取链接后，在画布中点击图片，
              再从右侧属性面板替换为新的图片地址
            </li>
          </ol>
        </div>
        <div className="px-6 py-3 border-t border-ink-600 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm bg-brand-500 hover:bg-brand-400 text-white transition-colors"
          >
            好的，我知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
