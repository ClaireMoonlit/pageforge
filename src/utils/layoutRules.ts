import type { CanvasNode } from '@/types'

/**
 * 规则推断引擎：分析画布节点的位置关系，推断响应式布局。
 *
 * 核心思路：
 * - y 轴重叠的节点 → 同一行（flex-row）
 * - 不同行 → 按顺序垂直排列（flex-col）
 * - 容器内部子节点递归推断
 * - 导出时用 flex-wrap: wrap 实现窄屏自动换行
 */

/** 布局节点：叶子或容器分组 */
export type LayoutNode =
  | { kind: 'leaf'; node: CanvasNode }
  | { kind: 'row'; children: LayoutNode[] }
  | { kind: 'column'; children: LayoutNode[] }

/** 解析 "320px" → 320，无效返回 0 */
function parsePx(s?: string): number {
  if (!s) return 0
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s.trim())
  return m ? parseFloat(m[1]) : 0
}

/** 节点默认尺寸兜底 */
const DEFAULT_W = 100
const DEFAULT_H = 40

/** 获取节点边界框（画布坐标） */
function getBounds(node: CanvasNode) {
  const x = node.style.x ?? 0
  const y = node.style.y ?? 0
  const w = parsePx(node.style.width) || DEFAULT_W
  const h = parsePx(node.style.height) || DEFAULT_H
  return { x, y, w, h, left: x, right: x + w, top: y, bottom: y + h }
}

/** 判断两个区间是否重叠（含容差，解决相邻元素微小偏差） */
function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  tolerance = 8,
): boolean {
  return aStart < bEnd + tolerance && bStart < aEnd + tolerance
}

/**
 * 推断同级节点的布局关系，生成布局树。
 *
 * 算法：
 * 1. 按 y 坐标排序
 * 2. 遍历，y 轴重叠的归为同一行
 * 3. 行内按 x 排序
 * 4. 多行用 column 包裹，单行直接返回 row
 */
export function inferLayout(nodes: CanvasNode[]): LayoutNode[] {
  const visible = nodes.filter((n) => n.visible !== false)
  if (visible.length === 0) return []
  if (visible.length === 1) {
    return [{ kind: 'leaf', node: visible[0] }]
  }

  // 计算边界框
  const items = visible.map((n) => ({ node: n, ...getBounds(n) }))

  // 按 y 排序（优先顶部元素）
  items.sort((a, b) => a.y - b.y)

  // 分行：y 轴重叠的归为同一行
  const rows: typeof items[] = []
  for (const item of items) {
    let placed = false
    for (const row of rows) {
      // 与行内任意元素 y 重叠则加入该行
      if (row.some((r) => overlaps(r.top, r.bottom, item.top, item.bottom))) {
        row.push(item)
        placed = true
        break
      }
    }
    if (!placed) rows.push([item])
  }

  // 行内按 x 排序
  rows.forEach((row) => row.sort((a, b) => a.x - b.x))

  // 构建布局树
  const rowNodes: LayoutNode[] = rows.map((row) => {
    if (row.length === 1) {
      return { kind: 'leaf', node: row[0].node }
    }
    return {
      kind: 'row',
      children: row.map((r) => ({ kind: 'leaf' as const, node: r.node })),
    }
  })

  // 单行直接返回；多行用 column 包裹
  if (rowNodes.length === 1) {
    return rowNodes[0].kind === 'row'
      ? [(rowNodes[0] as { children: LayoutNode[] }).children].flat()
      : [rowNodes[0]]
  }

  // 多行：每行作为 leaf/row，整体不需要额外 column 包裹（body 本身就是 column）
  return rowNodes
}

/**
 * 获取节点的布局提示（供 UI 展示推断结果）。
 */
export function getLayoutHint(node: CanvasNode, siblings: CanvasNode[]): 'row' | 'column' | 'nest' {
  if (node.visible === false) return 'nest'
  const items = siblings.filter((n) => n.visible !== false)
  if (items.length <= 1) return 'column'

  const nodeBounds = getBounds(node)
  for (const s of items) {
    if (s.id === node.id) continue
    const sBounds = getBounds(s)
    // y 重叠 → 同行
    if (overlaps(nodeBounds.top, nodeBounds.bottom, sBounds.top, sBounds.bottom)) {
      return 'row'
    }
  }
  return 'column'
}
