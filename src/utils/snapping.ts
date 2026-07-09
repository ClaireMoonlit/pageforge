import type { CanvasNode } from '@/types'

/** 吸附阈值：距离 ≤ 此值时吸附 */
export const SNAP_THRESHOLD = 8
/** 脱离阈值：已吸附状态下，距离 ≥ 此值才脱离（防抖） */
export const SNAP_DEACTIVATE = 12
/** 中心交点次要轴阈值：更宽松，使十字交点更容易触发 */
const SNAP_CENTER_CROSS = 18

/** 参考线（水平或垂直） */
export interface SnapLine {
  /** 线的坐标：水平线是 y 值，垂直线是 x 值 */
  pos: number
  /** 方向 */
  axis: 'x' | 'y'
  /** 吸附类型：edge=边缘对齐, center=中心对齐, spacing=等间距 */
  type: 'edge' | 'center' | 'spacing'
  /** 等间距时：左/上目标右边缘到右/下目标左边缘的距离（仅 spacing 类型有值） */
  gap?: number
  /** 等间距时：左/上目标右边缘坐标（spacing 类型时使用） */
  fromPos?: number
  /** 等间距时：右/下目标左边缘坐标（spacing 类型时使用） */
  toPos?: number
  /** 等间距时：拖拽元素左/上边缘坐标（用于绘制两端间距指示） */
  dragStart?: number
  /** 等间距时：拖拽元素右/下边缘坐标（用于绘制两端间距指示） */
  dragEnd?: number
}

/** 上一次吸附状态（用于滞后阈值） */
export interface PrevSnapState {
  snappedX: boolean
  snappedY: boolean
}

/** 矩形（元素在画布坐标系内的位置和尺寸） */
interface Rect {
  id: string
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
}

/** 把节点 + 其子节点拍平成 Rect 列表（用于吸附参考） */
export function collectRects(
  nodes: CanvasNode[],
  excludeId: string,
  parentLeft = 0,
  parentTop = 0,
): Rect[] {
  const rects: Rect[] = []
  const walk = (arr: CanvasNode[], pl: number, pt: number) => {
    for (const n of arr) {
      if (n.visible === false) continue
      const x = (n.style.x ?? 0) + pl
      const y = (n.style.y ?? 0) + pt
      const w = parsePx(n.style.width) ?? 100
      const h = parsePx(n.style.height) ?? 40
      rects.push({
        id: n.id,
        left: x,
        right: x + w,
        top: y,
        bottom: y + h,
        centerX: x + w / 2,
        centerY: y + h / 2,
      })
      if (n.children.length) walk(n.children, x, y)
    }
  }
  walk(nodes, parentLeft, parentTop)
  return rects.filter((r) => r.id !== excludeId)
}

/** 解析 "320px" → 320，无效返回 null */
function parsePx(s?: string): number | null {
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s.trim())
  return m ? parseFloat(m[1]) : null
}

/**
 * 从 DOM 实际渲染外框收集吸附目标（更精确，与虚线选框一致）。
 * getBoundingClientRect 返回屏幕空间坐标（受 canvas 的 transform: scale(zoom) 影响），
 * 必须除以 zoom 转换为 canvas 空间，才能与 onDragMove 中除以 zoom 后的拖拽元素位置正确比较。
 */
export function collectRectsFromDOM(canvasEl: HTMLElement, excludeId?: string, zoom: number = 1): Rect[] {
  const canvasRect = canvasEl.getBoundingClientRect()
  const rects: Rect[] = []
  document.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el) => {
    const id = el.dataset.nodeId
    if (!id || id === excludeId) return
    const r = el.getBoundingClientRect()
    const left = (r.left - canvasRect.left) / zoom
    const top = (r.top - canvasRect.top) / zoom
    const w = r.width / zoom
    const h = r.height / zoom
    rects.push({
      id,
      left,
      right: left + w,
      top,
      bottom: top + h,
      centerX: left + w / 2,
      centerY: top + h / 2,
    })
  })
  return rects
}

/** 画布矩形（作为吸附参考之一） */
export function canvasRect(width: string, height: string): Rect {
  const w = parsePx(width) ?? 1200
  const h = parsePx(height) ?? 800
  return {
    id: '__canvas__',
    left: 0,
    right: w,
    top: 0,
    bottom: h,
    centerX: w / 2,
    centerY: h / 2,
  }
}

/**
 * 计算拖拽中元素应吸附到的位置。
 * 支持三种吸附：边缘对齐、中心对齐、等间距
 */
export function computeSnap(
  dragRect: Rect,
  targets: Rect[],
  prevSnap?: PrevSnapState,
): { dx: number; dy: number; lines: SnapLine[] } {
  let dx = 0
  let dy = 0
  const lines: SnapLine[] = []

  // 根据上一次状态选择阈值：已吸附用大阈值防脱离，未吸附用小阈值
  const xThreshold = prevSnap?.snappedX ? SNAP_DEACTIVATE : SNAP_THRESHOLD
  const yThreshold = prevSnap?.snappedY ? SNAP_DEACTIVATE : SNAP_THRESHOLD

  // 优先：中心交点吸附
  for (const t of targets) {
    const cxOff = dragRect.centerX - t.centerX
    const cyOff = dragRect.centerY - t.centerY
    const absCx = Math.abs(cxOff)
    const absCy = Math.abs(cyOff)
    if (absCx <= xThreshold && absCy <= SNAP_CENTER_CROSS) {
      return {
        dx: -cxOff,
        dy: -cyOff,
        lines: [
          { pos: t.centerX, axis: 'x', type: 'center' },
          { pos: t.centerY, axis: 'y', type: 'center' },
        ],
      }
    }
    if (absCy <= yThreshold && absCx <= SNAP_CENTER_CROSS) {
      return {
        dx: -cxOff,
        dy: -cyOff,
        lines: [
          { pos: t.centerX, axis: 'x', type: 'center' },
          { pos: t.centerY, axis: 'y', type: 'center' },
        ],
      }
    }
  }

  // 等间距检测（X 轴）
  // 当拖拽元素在水平方向上位于两个目标之间，且到两边的间距相等时触发
  const spacingThreshold = 10
  const spacingSnapX = findEqualSpacingX(dragRect, targets, spacingThreshold)
  if (spacingSnapX && Math.abs(spacingSnapX.dx) <= xThreshold + 4) {
    dx = spacingSnapX.dx
    lines.push({
      pos: spacingSnapX.pos,
      axis: 'x',
      type: 'spacing',
      gap: spacingSnapX.gap,
      fromPos: spacingSnapX.fromPos,
      toPos: spacingSnapX.toPos,
      dragStart: spacingSnapX.dragStart,
      dragEnd: spacingSnapX.dragEnd,
    })
  }

  // 等间距检测（Y 轴）
  const spacingSnapY = findEqualSpacingY(dragRect, targets, spacingThreshold)
  if (spacingSnapY && Math.abs(spacingSnapY.dy) <= yThreshold + 4) {
    dy = spacingSnapY.dy
    lines.push({
      pos: spacingSnapY.pos,
      axis: 'y',
      type: 'spacing',
      gap: spacingSnapY.gap,
      fromPos: spacingSnapY.fromPos,
      toPos: spacingSnapY.toPos,
      dragStart: spacingSnapY.dragStart,
      dragEnd: spacingSnapY.dragEnd,
    })
  }

  // 关键：等间距不抢占另一轴的吸附
  // X 轴等间距触发时，Y 轴仍可做边缘/中心吸附（保持水平同时等间距）
  // Y 轴等间距触发时，X 轴仍可做边缘/中心吸附
  // 仅当两个轴都触发了等间距时，才提前返回（避免被回退分支覆盖）

  // 回退：独立 X 吸附（left/right/centerX 的边缘对齐）
  // 如果 X 轴已经等间距吸附，跳过 X 轴回退，避免覆盖
  if (!spacingSnapX || Math.abs(spacingSnapX.dx) > xThreshold + 4) {
    const xCandidates: Array<{ target: number; offset: number; type: SnapLine['type'] }> = []
    for (const t of targets) {
      xCandidates.push({ target: t.left, offset: dragRect.left - t.left, type: 'edge' })
      xCandidates.push({ target: t.right, offset: dragRect.right - t.right, type: 'edge' })
      xCandidates.push({ target: t.centerX, offset: dragRect.centerX - t.centerX, type: 'center' })
    }
    let bestX: { offset: number; target: number; type: SnapLine['type'] } | null = null
    for (const c of xCandidates) {
      if (Math.abs(c.offset) <= xThreshold) {
        if (!bestX || Math.abs(c.offset) < Math.abs(bestX.offset)) {
          bestX = { offset: c.offset, target: c.target, type: c.type }
        }
      }
    }
    if (bestX) {
      dx = -bestX.offset
      lines.push({ pos: bestX.target, axis: 'x', type: bestX.type })
    }
  }

  // 回退：独立 Y 吸附
  // 如果 Y 轴已经等间距吸附，跳过 Y 轴回退，避免覆盖
  if (!spacingSnapY || Math.abs(spacingSnapY.dy) > yThreshold + 4) {
    const yCandidates: Array<{ target: number; offset: number; type: SnapLine['type'] }> = []
    for (const t of targets) {
      yCandidates.push({ target: t.top, offset: dragRect.top - t.top, type: 'edge' })
      yCandidates.push({ target: t.bottom, offset: dragRect.bottom - t.bottom, type: 'edge' })
      yCandidates.push({ target: t.centerY, offset: dragRect.centerY - t.centerY, type: 'center' })
    }
    let bestY: { offset: number; target: number; type: SnapLine['type'] } | null = null
    for (const c of yCandidates) {
      if (Math.abs(c.offset) <= yThreshold) {
        if (!bestY || Math.abs(c.offset) < Math.abs(bestY.offset)) {
          bestY = { offset: c.offset, target: c.target, type: c.type }
        }
      }
    }
    if (bestY) {
      dy = -bestY.offset
      lines.push({ pos: bestY.target, axis: 'y', type: bestY.type })
    }
  }

  return { dx, dy, lines }
}

/** 等间距检测：X 轴 — 拖拽元素中心在两目标之间，左右间距相等 */
function findEqualSpacingX(
  drag: Rect,
  targets: Rect[],
  threshold: number,
): { dx: number; pos: number; gap: number; fromPos: number; toPos: number; dragStart: number; dragEnd: number } | null {
  // 寻找拖拽元素左侧的目标（左目标右边缘 < 拖拽左边缘）和右侧的目标（右目标左边缘 > 拖拽右边缘）
  // 关键约束：左右目标必须与拖拽元素在垂直方向上重叠（即它们"夹住"拖拽元素在同一水平带），
  // 避免选中画布上/下方完全无关的元素（例如拖拽元素 B 在上半部分，但等间距却匹配了下半部分的元素）
  const verticalOverlap = (t: Rect) => !(t.bottom <= drag.top || t.top >= drag.bottom)
  const leftTargets = targets
    .filter((t) => t.right < drag.left && verticalOverlap(t))
    .sort((a, b) => b.right - a.right) // 最近的在前
  const rightTargets = targets
    .filter((t) => t.left > drag.right && verticalOverlap(t))
    .sort((a, b) => a.left - b.left) // 最近的在前

  for (const lt of leftTargets) {
    for (const rt of rightTargets) {
      const gap = rt.left - lt.right
      const dragWidth = drag.right - drag.left
      const idealLeft = lt.right + (gap - dragWidth) / 2
      const offset = drag.left - idealLeft
      if (Math.abs(offset) <= threshold) {
        return {
          dx: -offset,
          pos: drag.left - offset + dragWidth / 2,
          gap,
          fromPos: lt.right,
          toPos: rt.left,
          dragStart: drag.left - offset,
          dragEnd: drag.right - offset,
        }
      }
    }
  }
  return null
}

/** 等间距检测：Y 轴 — 拖拽元素中心在两目标之间，上下间距相等 */
function findEqualSpacingY(
  drag: Rect,
  targets: Rect[],
  threshold: number,
): { dy: number; pos: number; gap: number; fromPos: number; toPos: number; dragStart: number; dragEnd: number } | null {
  // 关键约束：上下目标必须与拖拽元素在水平方向上重叠，避免误匹配画布左右两侧无关元素
  const horizontalOverlap = (t: Rect) => !(t.right <= drag.left || t.left >= drag.right)
  const topTargets = targets
    .filter((t) => t.bottom < drag.top && horizontalOverlap(t))
    .sort((a, b) => b.bottom - a.bottom)
  const bottomTargets = targets
    .filter((t) => t.top > drag.bottom && horizontalOverlap(t))
    .sort((a, b) => a.top - b.top)

  for (const tt of topTargets) {
    for (const bt of bottomTargets) {
      const gap = bt.top - tt.bottom
      const dragHeight = drag.bottom - drag.top
      const idealTop = tt.bottom + (gap - dragHeight) / 2
      const offset = drag.top - idealTop
      if (Math.abs(offset) <= threshold) {
        return {
          dy: -offset,
          pos: drag.top - offset + dragHeight / 2,
          gap,
          fromPos: tt.bottom,
          toPos: bt.top,
          dragStart: drag.top - offset,
          dragEnd: drag.bottom - offset,
        }
      }
    }
  }
  return null
}
