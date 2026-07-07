import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore } from '@/store/editorStore'
import type { CropModalResult } from '@/store/editorStore'

type Shape = 'rectangle' | 'circle' | 'rounded'
interface CropRect { x: number; y: number; width: number; height: number }

/** 拖拽模式 */
type HandleCorner = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
type DragMode =
  | { kind: 'move'; startX: number; startY: number; orig: CropRect }
  | { kind: 'resize'; corner: HandleCorner; startX: number; startY: number; orig: CropRect; aspectRatio: number }
  | null

/** 吸附类型 */
type SnapType = 'square' | 'center' | 'edge'

/** 单条吸附参考线 */
interface SnapGuide {
  axis: 'x' | 'y'
  pos: number
  type: SnapType
  /** 对应吸附值（用于修正） */
  correction: number
}

/** 吸附阈值（与画布 snapping.ts 保持一致）—— 用于居中/边缘吸附（绝对像素） */
const SNAP_ON = 8
const SNAP_OFF = 12

/** 正方形/正圆吸附相对阈值
 * 相对差异 = |w-h| / max(w,h)，与尺度无关。
 * 1.5% 进入吸附（500px 宽图片仅差 7.5px），4% 退出（需拉到 20px 才脱离）。
 * 滞后比 2.67x（画布仅 1.5x），因为宽高比吸附的视觉反馈弱于位置吸附，需要更大黏性。 */
const SQ_SNAP_ON = 0.015
const SQ_SNAP_OFF = 0.04

/** 形状按钮样式 */
const shapeBtnCls = (active: boolean) =>
  `px-3 py-1 text-xs rounded border transition-colors ${
    active
      ? 'bg-ink-700 border-ink-500 text-white'
      : 'bg-ink-900 border-ink-600 text-gray-300 hover:bg-ink-600'
  }`

export function ImageCropModal() {
  const cropModal = useEditorStore((s) => s.cropModal)
  const closeCropModal = useEditorStore((s) => s.closeCropModal)

  const [shape, setShape] = useState<Shape>('rectangle')
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 })
  const [imgDisplay, setImgDisplay] = useState<{ width: number; height: number; offsetX: number; offsetY: number }>({ width: 0, height: 0, offsetX: 0, offsetY: 0 })
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  // 仅用于渲染的光标/捕获状态，实际拖拽数据存在 ref 中避免异步跳帧
  const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null)
  // 图片 src 变更计数器，用于 key 强制 React 重新挂载 <img>
  const [imgKey, setImgKey] = useState(0)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const open = cropModal.open

  // 拖拽数据用 ref（同步读写，避免 state 异步导致的首帧跳变）
  const dragRef = useRef<DragMode>(null)
  // 当前 live 值（resize 过程中实时尺寸，用于渲染）
  const liveCropRef = useRef<CropRect | null>(null)
  // crop 的 ref 镜像，供 useEffect 读取最新值（避免闭包读到初始 {0,0,0,0}）
  const cropRef = useRef<CropRect>(crop)
  cropRef.current = crop

  // 缩放比例 ref（避免 imgDisplay state 陈旧闭包导致 scale=Infinity 外跳）
  const scaleRef = useRef(1)

  // 上一帧吸附状态（用于滞后阈值）
  const prevSnapRef = useRef<{
    square: boolean
    centerX: boolean
    centerY: boolean
    edgeLeft: boolean
    edgeRight: boolean
    edgeTop: boolean
    edgeBottom: boolean
  }>({
    square: false,
    centerX: false,
    centerY: false,
    edgeLeft: false,
    edgeRight: false,
    edgeTop: false,
    edgeBottom: false,
  })

  // 弹窗打开时初始化形状和选区
  useEffect(() => {
    if (!open) return
    setShape(cropModal.initialShape)
    if (cropModal.initialCrop) {
      const ic = cropModal.initialCrop
      const imgW = cropModal.imageWidth
      const imgH = cropModal.imageHeight
      // 第一性原理验证：如果 initialCrop 的右下角超出了图片范围（说明图片已被裁切但坐标是原图坐标），
      // 则说明弹窗显示的是裁切后图片而非原图 → 重置为全图选区
      if (ic.x + ic.width > imgW + 10 || ic.y + ic.height > imgH + 10) {
        setCrop({ x: 0, y: 0, width: imgW, height: imgH })
      } else {
        setCrop({
          x: Math.max(0, Math.min(ic.x, imgW - 10)),
          y: Math.max(0, Math.min(ic.y, imgH - 10)),
          width: Math.max(30, Math.min(ic.width, imgW - Math.max(0, ic.x))),
          height: Math.max(30, Math.min(ic.height, imgH - Math.max(0, ic.y))),
        })
      }
    } else {
      setCrop({ x: 0, y: 0, width: cropModal.imageWidth, height: cropModal.imageHeight })
    }
    setGuides([])
    setImgEl(null)
    setDragMode(null)
    dragRef.current = null
    liveCropRef.current = null
    shapeSwitchCountRef.current = 0
    // 递增 key 强制 React 重新挂载 <img>，确保浏览器加载新 src
    setImgKey((k) => k + 1)
    // 重置吸附状态
    prevSnapRef.current = {
      square: false,
      centerX: false,
      centerY: false,
      edgeLeft: false,
      edgeRight: false,
      edgeTop: false,
      edgeBottom: false,
    }
  }, [open, cropModal.imageWidth, cropModal.imageHeight, cropModal.initialCrop, cropModal.initialShape])

  // 形状切换时检测当前选区是否已经是正方形，短暂显示绿色指示后消失
  // 使用 cropRef 读取最新值，避免闭包读到初始 {0,0,0,0} 导致误判
  const shapeSwitchCountRef = useRef(0)
  const shapeGuideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!open) return
    shapeSwitchCountRef.current += 1
    // 第一次触发是弹窗打开时的初始化，跳过正方形检测
    if (shapeSwitchCountRef.current <= 1) return
    const { width, height } = cropRef.current
    if (width === 0 || height === 0) return
    // 清除之前的定时器
    if (shapeGuideTimerRef.current) clearTimeout(shapeGuideTimerRef.current)
    const maxDim = Math.max(width, height)
    const relDiff = Math.abs(width - height) / maxDim
    if (relDiff <= SQ_SNAP_ON) {
      setGuides([{ axis: 'x', pos: 0, type: 'square', correction: 0 }])
    } else {
      setGuides((g) => g.filter((l) => l.type !== 'square'))
    }
    // 300ms 后自动清除正方形指示
    shapeGuideTimerRef.current = setTimeout(() => {
      setGuides((g) => g.filter((l) => l.type !== 'square'))
    }, 300)
  }, [shape, open])

  // 计算图片在弹窗中的显示尺寸（contain 适配）
  useEffect(() => {
    if (!open) return
    const containerW = Math.min(window.innerWidth * 0.85, 800)
    const containerH = Math.min(window.innerHeight * 0.85, 700)
    const ratio = Math.min(containerW / cropModal.imageWidth, containerH / cropModal.imageHeight, 1)
    const dispW = cropModal.imageWidth * ratio
    const dispH = cropModal.imageHeight * ratio
    setImgDisplay({ width: dispW, height: dispH, offsetX: 0, offsetY: 0 })
    scaleRef.current = dispW > 0 ? cropModal.imageWidth / dispW : 1
  }, [open, cropModal.imageWidth, cropModal.imageHeight])

  /**
   * 计算吸附参考线（仿 canvas snapping.ts 的 computeSnap 逻辑）
   * 返回需要应用的修正量数组和参考线数组
   * @param skipEdgeSnap 跳过边缘吸附（resize 时使用，避免破坏锚点）
   */
  const computeSnapGuides = (
    rect: { x: number; y: number; width: number; height: number },
    imgW: number,
    imgH: number,
    skipEdgeSnap = false,
    skipSquareSnap = false,
    skipCenterSnap = false,
  ): { guides: SnapGuide[]; adjusted: CropRect } => {
    const guides: SnapGuide[] = []
    let { x, y, width, height } = rect
    const prev = prevSnapRef.current

    // 正方形/正圆吸附（宽高比接近 1:1，使用相对差异而非绝对像素差）
    // 移动时跳过正方形吸附：移动只调整位置不调整尺寸，绿色边框会误导用户
    if (!skipSquareSnap) {
      const maxDim = Math.max(width, height)
      const relDiff = maxDim > 0 ? Math.abs(width - height) / maxDim : 0
      const squareThreshold = prev.square ? SQ_SNAP_OFF : SQ_SNAP_ON
      const squareSnap = relDiff <= squareThreshold
      prev.square = squareSnap
      if (squareSnap) {
        const size = Math.round((width + height) / 2)
        // 保持中心不变
        const cx = x + width / 2
        const cy = y + height / 2
        width = size
        height = size
        x = cx - size / 2
        y = cy - size / 2
        guides.push({ axis: 'x', pos: 0, type: 'square', correction: 0 })
      }
    } else {
      prev.square = false
    }

    // 居中吸附（裁切框中心 → 图片中心）
    // resize 时跳过：居中吸附调整 x/y 会破坏 resize 锚点
    if (!skipCenterSnap) {
      const cx = x + width / 2
      const cy = y + height / 2
      const cxOff = cx - imgW / 2
      const cyOff = cy - imgH / 2
      const centerXThreshold = prev.centerX ? SNAP_OFF : SNAP_ON
      const centerYThreshold = prev.centerY ? SNAP_OFF : SNAP_ON
      const centerXSnap = Math.abs(cxOff) <= centerXThreshold
      const centerYSnap = Math.abs(cyOff) <= centerYThreshold
      prev.centerX = centerXSnap
      prev.centerY = centerYSnap
      if (centerXSnap && centerYSnap) {
        // 十字中心吸附：同时修正 X 和 Y
        x = imgW / 2 - width / 2
        y = imgH / 2 - height / 2
        guides.push({ axis: 'x', pos: imgW / 2, type: 'center', correction: -cxOff })
        guides.push({ axis: 'y', pos: imgH / 2, type: 'center', correction: -cyOff })
      } else {
        if (centerXSnap) {
          x = imgW / 2 - width / 2
          guides.push({ axis: 'x', pos: imgW / 2, type: 'center', correction: -cxOff })
        }
        if (centerYSnap) {
          y = imgH / 2 - height / 2
          guides.push({ axis: 'y', pos: imgH / 2, type: 'center', correction: -cyOff })
        }
      }
    } else {
      prev.centerX = false
      prev.centerY = false
    }

    // 边缘吸附（裁切框四边 → 图片四边）
    // resize 时跳过边缘吸附：边缘吸附只调整 x/y 不调整 width/height，
    // 会破坏 resize 锚点（对角的锚定边），导致裁切框往外跳
    if (!skipEdgeSnap) {
      const edgeThreshold = (prevSnapped: boolean) => prevSnapped ? SNAP_OFF : SNAP_ON
      // 左边缘 → 0
      if (Math.abs(x) <= edgeThreshold(prev.edgeLeft)) {
        prev.edgeLeft = true
        x = 0
        guides.push({ axis: 'x', pos: 0, type: 'edge', correction: x })
      } else {
        prev.edgeLeft = false
      }
      // 右边缘 → imgW
      const rightEdge = x + width
      if (Math.abs(rightEdge - imgW) <= edgeThreshold(prev.edgeRight)) {
        prev.edgeRight = true
        x = imgW - width
        guides.push({ axis: 'x', pos: imgW, type: 'edge', correction: rightEdge - imgW })
      } else {
        prev.edgeRight = false
      }
      // 上边缘 → 0
      if (Math.abs(y) <= edgeThreshold(prev.edgeTop)) {
        prev.edgeTop = true
        y = 0
        guides.push({ axis: 'y', pos: 0, type: 'edge', correction: y })
      } else {
        prev.edgeTop = false
      }
      // 下边缘 → imgH
      const bottomEdge = y + height
      if (Math.abs(bottomEdge - imgH) <= edgeThreshold(prev.edgeBottom)) {
        prev.edgeBottom = true
        y = imgH - height
        guides.push({ axis: 'y', pos: imgH, type: 'edge', correction: bottomEdge - imgH })
      } else {
        prev.edgeBottom = false
      }
    } else {
      // resize 时重置边缘吸附状态，避免滞后阈值残留
      prev.edgeLeft = false
      prev.edgeRight = false
      prev.edgeTop = false
      prev.edgeBottom = false
    }

    return { guides, adjusted: { x, y, width, height } }
  }

  const onPointerDownMove = (e: ReactPointerEvent) => {
    if (!open) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // 重置所有吸附状态（移动时跳过正方形吸附，所以也重置 square）
    const p = prevSnapRef.current
    p.square = false; p.centerX = false; p.centerY = false
    p.edgeLeft = false; p.edgeRight = false; p.edgeTop = false; p.edgeBottom = false
    dragRef.current = { kind: 'move', startX: e.clientX, startY: e.clientY, orig: { ...crop } }
    setDragMode('move')
  }

  const onPointerDownResize = (corner: HandleCorner) => (e: ReactPointerEvent) => {
    if (!open) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // 重置所有吸附状态（新拖拽开始）
    const p = prevSnapRef.current
    p.square = false; p.centerX = false; p.centerY = false
    p.edgeLeft = false; p.edgeRight = false; p.edgeTop = false; p.edgeBottom = false
    const ar = crop.width / crop.height
    dragRef.current = { kind: 'resize', corner, startX: e.clientX, startY: e.clientY, orig: { ...crop }, aspectRatio: ar }
    setDragMode('resize')
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    // 使用 ref 而非 imgDisplay state，避免陈旧闭包导致 scale=Infinity
    const scale = scaleRef.current
    const dx = (e.clientX - drag.startX) * scale
    const dy = (e.clientY - drag.startY) * scale
    const imgW = cropModal.imageWidth
    const imgH = cropModal.imageHeight

    if (drag.kind === 'move') {
      let newX = drag.orig.x + dx
      let newY = drag.orig.y + dy
      newX = Math.max(0, Math.min(newX, imgW - crop.width))
      newY = Math.max(0, Math.min(newY, imgH - crop.height))

      // 移动时也做吸附（居中 + 边缘），跳过正方形吸附避免绿色误判
      const result = computeSnapGuides(
        { x: newX, y: newY, width: crop.width, height: crop.height },
        imgW, imgH,
        false, // skipEdgeSnap
        true,  // skipSquareSnap：移动不改变尺寸，绿色边框会误导
        false, // skipCenterSnap
      )
      setGuides(result.guides)
      liveCropRef.current = { ...crop, x: result.adjusted.x, y: result.adjusted.y }
      setCrop((c) => ({ ...c, x: result.adjusted.x, y: result.adjusted.y }))
    } else if (drag.kind === 'resize') {
      let { x, y, width, height } = drag.orig
      const minSize = 30
      const corner = drag.corner
      const ar = drag.aspectRatio
      const isCorner = corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se'

      if (isCorner && ar > 0) {
		        // 第一性原理：正方形检测必须在投影之前，用无约束尺寸（不锁宽高比）计算。
		        // 投影法始终维持原始 ar，若 ar≠1（如 1920×1080, ar=1.78），
		        // 投影结果永远不接近正方形 → 吸附永不触发。
		        let uncW: number, uncH: number
		        if (corner === 'nw') {
		          uncW = drag.orig.width - dx
		          uncH = drag.orig.height - dy
		        } else if (corner === 'ne') {
		          uncW = drag.orig.width + dx
		          uncH = drag.orig.height - dy
		        } else if (corner === 'sw') {
		          uncW = drag.orig.width - dx
		          uncH = drag.orig.height + dy
		        } else { // se
		          uncW = drag.orig.width + dx
		          uncH = drag.orig.height + dy
		        }

		        // 正方形检测（相对差异 + 滞后阈值）
			        // 第一性原理：当 ar=1 时投影天然保持正方形，不需要 uncW/uncH 检测。
			        // 用 uncW/uncH 检测反而会因为鼠标轻微偏离对角线导致绿框闪烁。
			        const isSquareAr = Math.abs(ar - 1) < 0.001
			        let sqSnap: boolean
			        if (isSquareAr) {
			          sqSnap = true
			          prevSnapRef.current.square = true
			        } else {
			          const uncMax = Math.max(uncW, uncH)
			          const uncRelDiff = uncMax > 0 ? Math.abs(uncW - uncH) / uncMax : 0
			          const sqThreshold = prevSnapRef.current.square ? SQ_SNAP_OFF : SQ_SNAP_ON
			          sqSnap = uncRelDiff <= sqThreshold
			          prevSnapRef.current.square = sqSnap
			        }

		        // 始终用原始 ar 投影（自然尺寸），不做 aspect ratio 切换
		        const minT = Math.max(minSize, minSize / ar)
		        let t: number

		        if (corner === 'nw') {
		          const anchorX = drag.orig.x + drag.orig.width
		          const anchorY = drag.orig.y + drag.orig.height
		          t = (ar * (anchorX - (drag.orig.x + dx)) + (anchorY - (drag.orig.y + dy))) / (ar * ar + 1)
		          t = Math.max(minT, Math.min(t, Math.min(anchorX / ar, anchorY)))
		          height = t
		          width = ar * t
		          x = anchorX - width
		          y = anchorY - height
		        } else if (corner === 'ne') {
		          const anchorX = drag.orig.x
		          const anchorY = drag.orig.y + drag.orig.height
		          t = (ar * (drag.orig.x + drag.orig.width + dx - anchorX) + (anchorY - (drag.orig.y + dy))) / (ar * ar + 1)
		          t = Math.max(minT, Math.min(t, Math.min(anchorY, (imgW - anchorX) / ar)))
		          height = t
		          width = ar * t
		          y = anchorY - height
		        } else if (corner === 'sw') {
		          const anchorX = drag.orig.x + drag.orig.width
		          const anchorY = drag.orig.y
		          t = (ar * (anchorX - (drag.orig.x + dx)) + (drag.orig.y + drag.orig.height + dy - anchorY)) / (ar * ar + 1)
		          t = Math.max(minT, Math.min(t, Math.min(anchorX / ar, imgH - anchorY)))
		          height = t
		          width = ar * t
		          x = anchorX - width
		        } else { // se
		          const anchorX = drag.orig.x
		          const anchorY = drag.orig.y
		          t = (ar * (drag.orig.x + drag.orig.width + dx - anchorX) + (drag.orig.y + drag.orig.height + dy - anchorY)) / (ar * ar + 1)
		          t = Math.max(minT, Math.min(t, Math.min((imgW - anchorX) / ar, imgH - anchorY)))
		          height = t
		          width = ar * t
		        }

		        // 正方形吸附：直接修正尺寸（仿画布 dx=-offset 的直接修正逻辑）
		        // 第一性原理：投影法是鼠标位置的平滑函数，不存在"修正量"→无磁吸感。
		        // 画布吸附的磁吸感来自 dx=-offset 直接修正元素位置，使其偏离鼠标预期。
		        // 此处等效：用自然投影 (w,h) 的平均值强制正方形，修正量 = |w-h|/2。
		        if (sqSnap) {
		          const size = Math.round((width + height) / 2)
		          width = size
		          height = size
		          // 重新锚定对角（保持锚点不变）
		          if (corner === 'nw') {
		            const anchorX = drag.orig.x + drag.orig.width
		            const anchorY = drag.orig.y + drag.orig.height
		            x = anchorX - size
		            y = anchorY - size
		          } else if (corner === 'ne') {
		            const anchorY = drag.orig.y + drag.orig.height
		            y = anchorY - size
		          } else if (corner === 'sw') {
		            const anchorX = drag.orig.x + drag.orig.width
		            x = anchorX - size
		          }
		          // se: x, y 保持锚定在 (drag.orig.x, drag.orig.y)，无需调整

		          // 钳制到图片边界
		          x = Math.max(0, x)
		          y = Math.max(0, y)
		          width = Math.max(minSize, Math.min(width, imgW - x))
		          height = Math.max(minSize, Math.min(height, imgH - y))
		          // 尺寸钳制后重新锚定
		          if (corner === 'nw') {
		            const anchorX = drag.orig.x + drag.orig.width
		            const anchorY = drag.orig.y + drag.orig.height
		            x = Math.max(0, anchorX - width)
		            y = Math.max(0, anchorY - height)
		            width = anchorX - x
		            height = anchorY - y
		          } else if (corner === 'ne') {
		            const anchorY = drag.orig.y + drag.orig.height
		            y = Math.max(0, anchorY - height)
		            height = anchorY - y
		            width = Math.max(minSize, Math.min(width, imgW - x))
		          } else if (corner === 'sw') {
		            const anchorX = drag.orig.x + drag.orig.width
		            x = Math.max(0, anchorX - width)
		            width = anchorX - x
		            height = Math.max(minSize, Math.min(height, imgH - y))
		          } else { // se
			            width = Math.max(minSize, Math.min(width, imgW - x))
			            height = Math.max(minSize, Math.min(height, imgH - y))
			          }
			          setGuides([{ axis: 'x', pos: 0, type: 'square', correction: 0 }])
		        } else {
		          setGuides([])
		        }
		        liveCropRef.current = { x, y, width, height }
		        setCrop({ x, y, width, height })
      } else {
	        // 边缘手柄：先用鼠标 delta 计算自然尺寸，再检测正方形吸附
	        // 第一性原理：不能拿修正后的尺寸检测吸附（width=height → relDiff=0 → 永不退出）。
	        // 必须用自然的鼠标驱动尺寸检测，修正仅用于显示。
	        let natWidth = width
	        let natHeight = height
	        let natX = x
	        let natY = y

	        if (corner === 'nw' || corner === 'sw' || corner === 'w') {
	          let newX = x + dx
	          newX = Math.max(0, Math.min(newX, x + width - minSize))
	          natWidth = x + width - newX
	          natX = newX
	        }
	        if (corner === 'ne' || corner === 'se' || corner === 'e') {
	          natWidth = Math.max(minSize, Math.min(width + dx, imgW - x))
	        }
	        if (corner === 'nw' || corner === 'ne' || corner === 'n') {
	          let newY = y + dy
	          newY = Math.max(0, Math.min(newY, y + height - minSize))
	          natHeight = y + height - newY
	          natY = newY
	        }
	        if (corner === 'sw' || corner === 'se' || corner === 's') {
	          natHeight = Math.max(minSize, Math.min(height + dy, imgH - y))
	        }

	        // 正方形检测用自然尺寸（滞后阈值）
			        // 边缘手柄允许自由拉伸，仅当自然尺寸接近正方形时才触发吸附
			        const natMax = Math.max(natWidth, natHeight)
			        const natRelDiff = natMax > 0 ? Math.abs(natWidth - natHeight) / natMax : 0
			        const sqThreshold = prevSnapRef.current.square ? SQ_SNAP_OFF : SQ_SNAP_ON
			        const sqSnap = natRelDiff <= sqThreshold
			        prevSnapRef.current.square = sqSnap

			        if (sqSnap) {
			          // 磁吸修正：冻结未拖拽的维度，让拖拽维度跟随
			          if (corner === 'e') {
			            width = Math.max(minSize, Math.min(natHeight, imgW - x))
			            height = natHeight
			          } else if (corner === 'w') {
			            const anchorRight = drag.orig.x + drag.orig.width
			            height = natHeight
			            width = Math.max(minSize, Math.min(height, anchorRight))
			            x = anchorRight - width
			          } else if (corner === 's') {
			            width = natWidth
			            height = Math.max(minSize, Math.min(natWidth, imgH - y))
			          } else if (corner === 'n') {
			            const anchorBottom = drag.orig.y + drag.orig.height
			            width = natWidth
			            height = Math.max(minSize, Math.min(width, anchorBottom))
			            y = anchorBottom - height
			          }
			          setGuides([{ axis: 'x', pos: 0, type: 'square', correction: 0 }])
			        } else {
			          // 无吸附：直接用自然尺寸
			          width = natWidth
			          height = natHeight
			          x = natX
			          y = natY
			          setGuides([])
			        }
	        liveCropRef.current = { x, y, width, height }
	        setCrop({ x, y, width, height })
      }
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!dragRef.current) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    dragRef.current = null
    liveCropRef.current = null
    setDragMode(null)
    // 松手后清除吸附指示（短暂延迟，让用户看到吸附结果）
    setTimeout(() => setGuides([]), 300)
  }

  // 裁切算法：用 Canvas API 裁切 + 圆形裁切后输出 PNG 透明
  const performCrop = (): string | null => {
    if (!imgEl) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(crop.width)
    canvas.height = Math.round(crop.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (shape === 'circle') {
      ctx.beginPath()
      ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
    }
    ctx.drawImage(
      imgEl,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, canvas.width, canvas.height,
    )
    return canvas.toDataURL('image/png')
  }

  const handleConfirm = () => {
    const croppedDataUrl = performCrop()
    if (!croppedDataUrl) return
    const result: CropModalResult = { croppedDataUrl, shape, crop }
    if (cropModal.onConfirm) cropModal.onConfirm(result)
    closeCropModal()
  }

  const handleCancel = () => {
    closeCropModal()
  }

  if (!open || !cropModal.imageSrc) return null

  // 选区在屏幕上的位置（用于渲染）
  const scale = imgDisplay.width > 0 ? cropModal.imageWidth / imgDisplay.width : 1
  const cropScreen = {
    left: imgDisplay.offsetX + crop.x / scale,
    top: imgDisplay.offsetY + crop.y / scale,
    width: crop.width / scale,
    height: crop.height / scale,
  }

  const cropBorderRadius: string =
    shape === 'circle' ? '50%' : shape === 'rounded' ? '16px' : '0px'

  // 4 个遮罩矩形
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    pointerEvents: 'none',
  }

  // 吸附参考线颜色：绿色=正方形，紫色=居中，蓝色=边缘
  const guideColor = (type: SnapType) =>
    type === 'square' ? '#22c55e' : type === 'center' ? '#a855f7' : '#3b82f6'

  // 是否有正方形吸附
  const hasSquareSnap = guides.some((g) => g.type === 'square')
  const hasCenterSnap = guides.some((g) => g.type === 'center')
  const hasEdgeSnap = guides.some((g) => g.type === 'edge')

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: 24,
      }}
    >
      {/* 顶部形状切换 */}
      <div className="flex items-center gap-1 mb-4">
        {(['rectangle', 'rounded', 'circle'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setShape(s)}
            className={shapeBtnCls(shape === s)}
          >
            {s === 'rectangle' ? '矩形' : s === 'rounded' ? '圆角' : '圆形'}
          </button>
        ))}
      </div>

      {/* 图片 + 选区容器 */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: imgDisplay.width,
          height: imgDisplay.height,
          userSelect: 'none',
        }}
      >
        {/* 原图 */}
        <img
          key={imgKey}
          src={cropModal.imageSrc}
          alt="原图"
          ref={(el) => setImgEl(el)}
          draggable={false}
          style={{
            width: imgDisplay.width,
            height: imgDisplay.height,
            display: 'block',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* 4 个遮罩矩形 */}
        <div style={{ ...overlayStyle, left: 0, top: 0, width: imgDisplay.width, height: cropScreen.top }} />
        <div style={{ ...overlayStyle, left: 0, top: cropScreen.top + cropScreen.height, width: imgDisplay.width, height: imgDisplay.height - cropScreen.top - cropScreen.height }} />
        <div style={{ ...overlayStyle, left: 0, top: cropScreen.top, width: cropScreen.left, height: cropScreen.height }} />
        <div style={{ ...overlayStyle, left: cropScreen.left + cropScreen.width, top: cropScreen.top, width: imgDisplay.width - cropScreen.left - cropScreen.width, height: cropScreen.height }} />

        {/* 圆形/圆角内部遮罩：框内但形状外的区域，比外部遮罩更淡 */}
        {(shape === 'circle' || shape === 'rounded') && (
          <div
            style={{
              position: 'absolute',
              left: cropScreen.left,
              top: cropScreen.top,
              width: cropScreen.width,
              height: cropScreen.height,
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              maskImage: shape === 'circle'
                ? 'radial-gradient(ellipse closest-side at center, transparent 98%, white 99%)'
                : 'radial-gradient(ellipse closest-side at center, transparent 72%, white 82%)',
              WebkitMaskImage: shape === 'circle'
                ? 'radial-gradient(ellipse closest-side at center, transparent 98%, white 99%)'
                : 'radial-gradient(ellipse closest-side at center, transparent 72%, white 82%)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {/* 吸附参考线（仿画布 snap line 样式）
            正方形/正圆吸附不画参考线：绿色边框已提供足够视觉反馈，在 pos:0 画线会出现在图片左边缘 */}
        <svg
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 25,
            overflow: 'visible',
          }}
        >
          {guides
            .filter((g) => g.type !== 'square')
            .map((guide, i) => (
            <g key={`${guide.axis}-${i}`}>
              <line
                x1={guide.axis === 'x' ? guide.pos / scale : 0}
                y1={guide.axis === 'y' ? guide.pos / scale : 0}
                x2={guide.axis === 'x' ? guide.pos / scale : imgDisplay.width}
                y2={guide.axis === 'y' ? guide.pos / scale : imgDisplay.height}
                stroke={guideColor(guide.type)}
                strokeWidth={1}
                strokeDasharray={guide.type === 'center' ? '4 4' : 'none'}
                opacity={0.8}
              />
            </g>
          ))}
        </svg>

        {/* 选区边框 */}
        <div
          style={{
            position: 'absolute',
            left: cropScreen.left,
            top: cropScreen.top,
            width: cropScreen.width,
            height: cropScreen.height,
            border: hasSquareSnap
              ? '2px solid #22c55e'
              : hasCenterSnap
                ? '2px solid #a855f7'
                : hasEdgeSnap
                  ? '2px solid #3b82f6'
                  : '2px dashed #ffffff',
            borderRadius: cropBorderRadius,
            boxSizing: 'border-box',
            cursor: dragMode === 'move' ? 'grabbing' : 'grab',
            pointerEvents: 'auto',
            boxShadow: hasSquareSnap
              ? '0 0 8px rgba(34, 197, 94, 0.4)'
              : hasCenterSnap
                ? '0 0 8px rgba(168, 85, 247, 0.4)'
                : hasEdgeSnap
                  ? '0 0 8px rgba(59, 130, 246, 0.4)'
                  : undefined,
          }}
          onPointerDown={onPointerDownMove}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
        </div>

        {/* 4 角 resize 手柄（等比缩放） */}
        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
          const handleStyle: CSSProperties = {
            position: 'absolute',
            width: 10,
            height: 10,
            backgroundColor: '#ffffff',
            border: '1.5px solid #6366f1',
            borderRadius: 2,
            zIndex: 20,
            cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
            pointerEvents: 'auto',
          }
          if (corner === 'nw') {
            handleStyle.left = cropScreen.left - 5
            handleStyle.top = cropScreen.top - 5
          } else if (corner === 'ne') {
            handleStyle.left = cropScreen.left + cropScreen.width - 5
            handleStyle.top = cropScreen.top - 5
          } else if (corner === 'sw') {
            handleStyle.left = cropScreen.left - 5
            handleStyle.top = cropScreen.top + cropScreen.height - 5
          } else {
            handleStyle.left = cropScreen.left + cropScreen.width - 5
            handleStyle.top = cropScreen.top + cropScreen.height - 5
          }
          return (
            <div
              key={corner}
              style={handleStyle}
              onPointerDown={onPointerDownResize(corner)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          )
        })}
        {/* 4 边中点 resize 手柄（自由拉伸，不锁比例） */}
        {(['n', 's', 'w', 'e'] as const).map((edge) => {
          const handleStyle: CSSProperties = {
            position: 'absolute',
            width: 10,
            height: 10,
            backgroundColor: '#ffffff',
            border: '1.5px solid #6366f1',
            borderRadius: 2,
            zIndex: 20,
            cursor: edge === 'n' || edge === 's' ? 'ns-resize' : 'ew-resize',
            pointerEvents: 'auto',
          }
          if (edge === 'n') {
            handleStyle.left = cropScreen.left + cropScreen.width / 2 - 5
            handleStyle.top = cropScreen.top - 5
          } else if (edge === 's') {
            handleStyle.left = cropScreen.left + cropScreen.width / 2 - 5
            handleStyle.top = cropScreen.top + cropScreen.height - 5
          } else if (edge === 'w') {
            handleStyle.left = cropScreen.left - 5
            handleStyle.top = cropScreen.top + cropScreen.height / 2 - 5
          } else {
            handleStyle.left = cropScreen.left + cropScreen.width - 5
            handleStyle.top = cropScreen.top + cropScreen.height / 2 - 5
          }
          return (
            <div
              key={edge}
              style={handleStyle}
              onPointerDown={onPointerDownResize(edge)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          )
        })}
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center gap-2 mt-6">
        <button
          onClick={handleCancel}
          className="px-5 py-2 text-sm rounded border border-ink-600 text-gray-300 bg-ink-800 hover:bg-ink-700"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          className="px-5 py-2 text-sm rounded border border-brand-500 text-white bg-brand-600 hover:bg-brand-500"
        >
          确定
        </button>
      </div>
    </div>,
    document.body,
  )
}