﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { create, useStore } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal } from 'zundo'
import type { CanvasConfig, CanvasNode, ComponentType, InteractionConfig, NodeProps, NodeStyle } from '@/types'
import { findComponentDef } from '@/data/componentLib'

/** 类型 → 短前缀映射 */
const TYPE_SHORT: Record<string, string> = {
  heading: 'h', text: 'txt', image: 'img', button: 'btn', card: 'card',
  container: 'box', divider: 'line', icon: 'icon', video: 'vid',
  input: 'inp', iframe: 'frame', navbar: 'nav', grid: 'grid', form: 'form',
}

/** 生成人类可读节点 id：btn-1、txt-2、card-3 ... */
const typeCounters: Record<string, number> = {}
function genId(type?: string): string {
  const short = type ? (TYPE_SHORT[type] || type) : 'el'
  typeCounters[short] = (typeCounters[short] || 0) + 1
  return `${short}-${typeCounters[short]}`
}

/** 剪贴板：模块级变量，存储被复制的节点（深拷贝，不含 id 重生成） */
let clipboard: CanvasNode | null = null
/** 剪贴板计数器：每次粘贴时递增，用于生成不同的偏移量 */
let clipboardPasteCount = 0
/** 最后一次内部复制的时间戳（用于判断"最后复制的是内部还是外部"） */
let lastInternalCopyTime = 0
/** 最后一次外部复制的时间戳（系统剪贴板，如从浏览器复制图片） */
let lastExternalCopyTime = 0
/** 标记当前是否正在执行内部复制（防止 copy 事件监听器误判为外部复制） */
let isInternalCopying = false

/** 深拷贝节点并递归重生成所有 id */
function deepCloneNode(node: CanvasNode): CanvasNode {
  const newId = genId(node.type)
  return {
    ...node,
    id: newId,
    props: { ...node.props },
    style: { ...node.style },
    children: node.children.map(deepCloneNode),
  }
}

/** 暴露剪贴板状态（供 Toolbar 判断按钮是否可用） */
export function getClipboard(): CanvasNode | null {
  return clipboard
}

/** 重置粘贴计数器 */
export function resetClipboardPasteCount(): void {
  clipboardPasteCount = 0
}

/** 获取最后一次内部复制的时间戳（用于粘贴时判断内外优先级） */
export function getLastInternalCopyTime(): number {
  return lastInternalCopyTime
}

/** 获取最后一次外部复制的时间戳 */
export function getLastExternalCopyTime(): number {
  return lastExternalCopyTime
}

/** 记录外部复制（由 document copy 事件监听器调用） */
export function markExternalCopy(): void {
  if (!isInternalCopying) {
    lastExternalCopyTime = Date.now()
  }
}

/** 标记内部复制开始/结束（防止 copy 事件监听器误判） */
export function setInternalCopying(v: boolean): void {
  isInternalCopying = v
}

interface EditorState {
  /** 画布根级节点（AST 顶层） */
  nodes: CanvasNode[]
  /** 画布配置（背景色 / 尺寸） */
  canvas: CanvasConfig
  /** 当前选中节点 id（单选；多选时为主节点） */
  selectedId: string | null
  /** 多选节点 id 集合 */
  selectedIds: string[]
  /** 格式刷：存储源节点的样式，非 null 时表示格式刷已激活 */
  formatBrushStyle: NodeStyle | null
  /** 预览模式：开启后禁用编辑，激活 click/hover/link/动画 */
  previewMode: boolean
  /** 预览期间的临时 display 状态：id → 'none' | '' | 'inline' 等。退出预览时清空 */
  previewDisplayOverrides: Record<string, string>
  /** 画布缩放比例 (0.1 - 3) */
  zoom: number
  /** 最近一次对齐/分布操作信息 */
  lastAlignInfo: { type: 'align' | 'distribute'; direction: 'h' | 'v'; gap: number; bounds: { from: number; to: number; crossStart: number; crossEnd: number } } | null
  /** 左侧组件库面板是否折叠（true=折叠成窄条，false=展开） */
  leftPanelCollapsed: boolean
  /** 右侧属性/画布设置面板是否折叠 */
  rightPanelCollapsed: boolean
  /** 标尺光标定位线是否显示（按 R 切换） */
  rulerCursorVisible: boolean
  /** 图片裁切弹窗状态 */
  cropModal: CropModalState

  addNode: (type: ComponentType, x: number, y: number, parentId?: string) => string
  removeNode: (id: string) => void
  moveNode: (id: string, x: number, y: number) => void
  /** 把节点移到新父级（或不传则移到根级），并插入到指定索引位置 */
  reparentNode: (id: string, parentId: string | null, index?: number) => void
  /** 图层排序：将节点在同级内上移或下移一层 */
  moveLayer: (id: string, direction: 'up' | 'down') => void
  toggleVisible: (id: string) => void
  updateNodeStyle: (id: string, style: Partial<NodeStyle>) => void
  updateNodeProps: (id: string, props: Partial<NodeProps>) => void
  updateCanvas: (patch: Partial<CanvasConfig>) => void
  selectNode: (id: string | null) => void
  /** 多选：添加/移除节点到选中集合 */
  toggleSelection: (id: string) => void
  /** 清除所有选中 */
  clearSelection: () => void
  /** 批量选中节点 */
  selectNodes: (ids: string[]) => void
  clearCanvas: () => void
  loadTemplate: (nodes: CanvasNode[], canvas: CanvasConfig) => void
  /** 追加节点到现有画布（用于导入组件片段，不清空已有内容） */
  addNodes: (nodes: CanvasNode[], canvas?: Partial<CanvasConfig>) => void
  /** 格式刷：激活/取消 */
  setFormatBrush: (style: NodeStyle | null) => void
  /** 设置画布缩放 */
  setZoom: (zoom: number) => void
  /** 重置为 100% */
  resetZoom: () => void
  /** 复制节点到剪贴板 */
  copyNode: (id: string) => void
  /** 在当前选中节点旁复制一份（偏移 20px） */
  duplicateNode: (id: string) => string
  /** 从剪贴板粘贴到根级或父容器 */
  pasteNode: (parentId?: string) => string
  /** 对齐选中节点 */
  alignNodes: (alignment: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => void
  /** 分布选中节点 */
  distributeNodes: (direction: 'horizontal' | 'vertical') => void
  /** 清除对齐/分布高亮信息 */
  clearAlignInfo: () => void
  /** 更新节点交互配置 */
  updateNodeInteraction: (id: string, interaction: Partial<InteractionConfig>) => void
  /** 切换预览模式 */
  togglePreviewMode: () => void
  /** 设置预览模式 */
  setPreviewMode: (on: boolean) => void
  /** 预览期间临时设置元素 display（hide/show/toggle 预览用，不入历史） */
  setPreviewDisplay: (id: string, display: string) => void
  /** 清除所有预览临时 display 状态 */
  clearPreviewDisplay: () => void
  /** 切换左侧组件库面板折叠状态 */
  toggleLeftPanel: () => void
  /** 切换右侧属性面板折叠状态 */
  toggleRightPanel: () => void
  /** 切换标尺光标定位线显隐 */
  toggleRulerCursor: () => void
  /** 打开图片裁切弹窗 */
  openCropModal: (payload: CropModalPayload) => void
  /** 关闭图片裁切弹窗 */
  closeCropModal: () => void
}

/** 图片裁切弹窗：原图信息 + 确认回调 */
export interface CropModalPayload {
  imageSrc: string
  imageWidth: number
  imageHeight: number
  /** 弹窗打开时预填的形状（重新裁切时使用） */
  initialShape?: 'rectangle' | 'circle' | 'rounded'
  /** 弹窗打开时预填的选区（重新裁切时使用，原图坐标系） */
  initialCrop?: { x: number; y: number; width: number; height: number }
  /** 确认后回调：拿到裁切结果（裁切后图片 + 形状 + 选区） */
  onConfirm: (result: CropModalResult) => void
}

/** 裁切弹窗确认结果 */
export interface CropModalResult {
  croppedDataUrl: string
  shape: 'rectangle' | 'circle' | 'rounded'
  crop: { x: number; y: number; width: number; height: number }
}

/** 弹窗状态 */
export interface CropModalState {
  open: boolean
  imageSrc: string | null
  imageWidth: number
  imageHeight: number
  initialShape: 'rectangle' | 'circle' | 'rounded'
  initialCrop: { x: number; y: number; width: number; height: number } | null
  onConfirm: ((result: CropModalResult) => void) | null
  /** 每次 openCropModal 递增，用于强制 ImageCropModal 重新挂载 */
  cropKey: number
}

/** 递归查找并就地更新节点（支持嵌套） */
function updateById(nodes: CanvasNode[], id: string, updater: (n: CanvasNode) => void): boolean {
  for (const node of nodes) {
    if (node.id === id) {
      updater(node)
      return true
    }
    if (node.children.length && updateById(node.children, id, updater)) return true
  }
  return false
}

/** 递归查找节点（导出供组件使用） */
export function findById(nodes: CanvasNode[], id: string): CanvasNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findById(node.children, id)
    if (found) return found
  }
  return null
}

/** 解析 "320px" → 320，无效返回 null */
function parsePx(s?: string): number | null {
  if (!s) return null
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s.trim())
  return m ? parseFloat(m[1]) : null
}

export const useEditorStore = create<EditorState>()(
  temporal(
    immer((set) => ({
      nodes: [],
      canvas: {
        backgroundColor: '#ffffff',
        width: '1200px',
        height: '800px',
      },
      selectedId: null,
      selectedIds: [],
      formatBrushStyle: null,
      previewMode: false,
      previewDisplayOverrides: {},
      zoom: 1,
      lastAlignInfo: null,
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
      rulerCursorVisible: true,
      cropModal: {
        open: false,
        imageSrc: null,
        imageWidth: 0,
        imageHeight: 0,
        initialShape: 'rectangle',
        initialCrop: null,
        onConfirm: null,
        cropKey: 0,
      },

      addNode: (type, x, y, parentId) => {
        const def = findComponentDef(type)
        if (!def) return ''
        const id = genId(type)
        const node: CanvasNode = {
          id,
          type,
          props: { ...def.defaultProps },
          style: { ...def.defaultStyle, x, y },
          children: [],
        }
        set((state) => {
          if (parentId) {
            // 嵌套：递归找到父容器并 push 到其 children
            updateById(state.nodes, parentId, (n) => {
              n.children.push(node)
            })
          } else {
            state.nodes.push(node)
          }
          state.selectedId = id
        })
        return id
      },

      removeNode: (id) =>
        set((state) => {
          // 递归从任意层级移除
          const removeFrom = (arr: CanvasNode[]): boolean => {
            const idx = arr.findIndex((n) => n.id === id)
            if (idx >= 0) {
              arr.splice(idx, 1)
              return true
            }
            for (const n of arr) {
              if (n.children.length && removeFrom(n.children)) return true
            }
            return false
          }
          removeFrom(state.nodes)
          if (state.selectedId === id) {
            const idx = state.selectedIds.indexOf(id)
            if (idx >= 0) state.selectedIds.splice(idx, 1)
            state.selectedId = state.selectedIds.length > 0 ? state.selectedIds[state.selectedIds.length - 1] : null
          }
        }),

      moveNode: (id, x, y) =>
        set((state) => {
          updateById(state.nodes, id, (n) => {
            n.style.x = x
            n.style.y = y
            // 子元素在容器内是 position: absolute，坐标相对容器，
            // 容器移动后子元素自动跟随，无需递归移动（否则会双倍位移）。
          })
        }),

      reparentNode: (id, parentId, index) =>
        set((state) => {
          // 1. 从原位置摘出节点（深拷贝避免 immer 引用问题）
          let moved: CanvasNode | null = null
          const pluck = (arr: CanvasNode[]): boolean => {
            const idx = arr.findIndex((n) => n.id === id)
            if (idx >= 0) {
              moved = arr.splice(idx, 1)[0]
              return true
            }
            for (const n of arr) {
              if (n.children.length && pluck(n.children)) return true
            }
            return false
          }
          pluck(state.nodes)
          if (!moved) return
          // 2. 不能把节点移进自己或自己的子孙（防环）
          const isDescendant = (node: CanvasNode): boolean => {
            if (node.id === parentId) return true
            return node.children.some(isDescendant)
          }
          if (parentId && isDescendant(moved)) return
          // 3. 插入到目标父级或根级
          if (parentId) {
            updateById(state.nodes, parentId, (n) => {
              const arr = n.children
              const at = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length))
              arr.splice(at, 0, moved!)
            })
          } else {
            const arr = state.nodes
            const at = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length))
            arr.splice(at, 0, moved)
          }
        }),

      moveLayer: (id, direction) =>
        set((state) => {
          // 找到节点的父数组和索引
          let parentId: string | null = null
          let idx = -1
          const findParent = (arr: CanvasNode[], parent: string | null): boolean => {
            const i = arr.findIndex((n) => n.id === id)
            if (i >= 0) { parentId = parent; idx = i; return true }
            for (const n of arr) {
              if (n.children.length && findParent(n.children, n.id)) return true
            }
            return false
          }
          findParent(state.nodes, null)
          if (idx < 0) return

          // 图层树是倒序的：数组靠后 = 视觉上靠上
          // 因此 'up'（视觉上向上）= idx + 1，'down'（视觉上向下）= idx - 1
          const newIdx = direction === 'up' ? idx + 1 : idx - 1

          // 获取父数组引用
          const getArr = (arr: CanvasNode[]): CanvasNode[] | null => {
            if (parentId === null) return arr
            for (const n of arr) {
              if (n.id === parentId) return n.children
              if (n.children.length) { const r = getArr(n.children); if (r) return r }
            }
            return null
          }
          const arr = getArr(state.nodes)
          if (!arr || newIdx < 0 || newIdx >= arr.length) return

          // 交换：从旧位置移除，插入新位置
          const [moved] = arr.splice(idx, 1)
          arr.splice(newIdx, 0, moved)
        }),

      toggleVisible: (id) =>
        set((state) => {
          updateById(state.nodes, id, (n) => {
            n.visible = n.visible === false ? true : false
          })
        }),

      updateNodeStyle: (id, style) =>
        set((state) => {
          updateById(state.nodes, id, (n) => {
            Object.assign(n.style, style)
          })
        }),

      updateNodeProps: (id, props) =>
        set((state) => {
          updateById(state.nodes, id, (n) => {
            Object.assign(n.props, props)
          })
        }),

      updateCanvas: (patch) =>
        set((state) => {
          Object.assign(state.canvas, patch)
        }),

      selectNode: (id) =>
        set((state) => {
          // 格式刷模式：如果选中了新节点且格式刷已激活，复制样式
          if (id && state.formatBrushStyle) {
            const sourceStyle = state.formatBrushStyle
            updateById(state.nodes, id, (n) => {
              // 只复制样式属性，不复制位置和尺寸
              const { x, y, width, height, minHeight, position, ...pureStyle } = sourceStyle as Record<string, unknown>
              void x; void y; void width; void height; void minHeight; void position
              Object.assign(n.style, pureStyle)
            })
            state.formatBrushStyle = null // 应用后取消格式刷
          }
          state.selectedId = id
          state.selectedIds = id ? [id] : []
        }),

      /** 多选模式：Shift+点击 切换节点选中状态 */
      toggleSelection: (id) =>
        set((state) => {
          const idx = state.selectedIds.indexOf(id)
          if (idx >= 0) {
            state.selectedIds.splice(idx, 1)
            if (state.selectedId === id) {
              state.selectedId = state.selectedIds.length > 0 ? state.selectedIds[state.selectedIds.length - 1] : null
            }
          } else {
            state.selectedIds.push(id)
            state.selectedId = id
          }
        }),

      clearSelection: () =>
        set((state) => {
          state.selectedId = null
          state.selectedIds = []
        }),

      selectNodes: (ids) =>
        set((state) => {
          state.selectedIds = ids
          state.selectedId = ids.length > 0 ? ids[ids.length - 1] : null
        }),

      /** 对齐选中节点 */
      alignNodes: (alignment) =>
        set((state) => {
          const ids = state.selectedIds
          if (ids.length < 2) return
          // 收集所有选中节点在画布上的绝对坐标
          const nodes: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
          const collectAbs = (arr: CanvasNode[], pl: number, pt: number) => {
            for (const n of arr) {
              if (ids.includes(n.id)) {
                const x = (n.style.x ?? 0) + pl
                const y = (n.style.y ?? 0) + pt
                const w = parsePx(n.style.width) ?? 100
                const h = parsePx(n.style.height) ?? 40
                nodes.push({ id: n.id, x, y, w, h })
              }
              if (n.children.length) {
                collectAbs(n.children, pl + (n.style.x ?? 0), pt + (n.style.y ?? 0))
              }
            }
          }
          collectAbs(state.nodes, 0, 0)
          if (nodes.length < 2) return

          // 计算参考值
          let refValue = 0
          switch (alignment) {
            case 'left': refValue = Math.min(...nodes.map((n) => n.x)); break
            case 'right': refValue = Math.max(...nodes.map((n) => n.x + n.w)); break
            case 'top': refValue = Math.min(...nodes.map((n) => n.y)); break
            case 'bottom': refValue = Math.max(...nodes.map((n) => n.y + n.h)); break
            case 'centerH': {
              const minX = Math.min(...nodes.map((n) => n.x))
              const maxX = Math.max(...nodes.map((n) => n.x + n.w))
              refValue = (minX + maxX) / 2
              break
            }
            case 'centerV': {
              const minY = Math.min(...nodes.map((n) => n.y))
              const maxY = Math.max(...nodes.map((n) => n.y + n.h))
              refValue = (minY + maxY) / 2
              break
            }
          }

          // 应用对齐
          for (const n of nodes) {
            updateById(state.nodes, n.id, (node) => {
              switch (alignment) {
                case 'left':
                  node.style.x = refValue
                  break
                case 'right':
                  node.style.x = refValue - n.w
                  break
                case 'top':
                  node.style.y = refValue
                  break
                case 'bottom':
                  node.style.y = refValue - n.h
                  break
                case 'centerH':
                  node.style.x = refValue - n.w / 2
                  break
                case 'centerV':
                  node.style.y = refValue - n.h / 2
                  break
              }
            })
          }
        }),

      /** 分布选中节点（等间距排列） */
      distributeNodes: (direction) =>
        set((state) => {
          const ids = state.selectedIds
          if (ids.length < 3) return
          const nodes: Array<{ id: string; x: number; y: number; w: number; h: number }> = []
          const collectAbs = (arr: CanvasNode[], pl: number, pt: number) => {
            for (const n of arr) {
              if (ids.includes(n.id)) {
                const x = (n.style.x ?? 0) + pl
                const y = (n.style.y ?? 0) + pt
                const w = parsePx(n.style.width) ?? 100
                const h = parsePx(n.style.height) ?? 40
                nodes.push({ id: n.id, x, y, w, h })
              }
              if (n.children.length) {
                collectAbs(n.children, pl + (n.style.x ?? 0), pt + (n.style.y ?? 0))
              }
            }
          }
          collectAbs(state.nodes, 0, 0)
          if (nodes.length < 3) return

          if (direction === 'horizontal') {
            nodes.sort((a, b) => a.x - b.x)
            const totalWidth = nodes.reduce((sum, n) => sum + n.w, 0)
            const startX = nodes[0].x
            const endX = nodes[nodes.length - 1].x + nodes[nodes.length - 1].w
            const gap = (endX - startX - totalWidth) / (nodes.length - 1)
            let curX = startX
            for (let i = 1; i < nodes.length - 1; i++) {
              curX += nodes[i - 1].w + gap
              updateById(state.nodes, nodes[i].id, (node) => {
                node.style.x = curX
              })
            }
            // 元素在主轴方向之外的跨度（用于把尺寸线定位在元素附近而不是画布底部）
            const crossStart = Math.min(...nodes.map((n) => n.y))
            const crossEnd = Math.max(...nodes.map((n) => n.y + n.h))
            // 记录对齐信息：分布的方向 + 间距 + 边界
            state.lastAlignInfo = {
              type: 'distribute',
              direction: 'h',
              gap: Math.round(gap),
              bounds: { from: startX, to: endX, crossStart, crossEnd },
            }
          } else {
            nodes.sort((a, b) => a.y - b.y)
            const totalHeight = nodes.reduce((sum, n) => sum + n.h, 0)
            const startY = nodes[0].y
            const endY = nodes[nodes.length - 1].y + nodes[nodes.length - 1].h
            const gap = (endY - startY - totalHeight) / (nodes.length - 1)
            let curY = startY
            for (let i = 1; i < nodes.length - 1; i++) {
              curY += nodes[i - 1].h + gap
              updateById(state.nodes, nodes[i].id, (node) => {
                node.style.y = curY
              })
            }
            const crossStart = Math.min(...nodes.map((n) => n.x))
            const crossEnd = Math.max(...nodes.map((n) => n.x + n.w))
            state.lastAlignInfo = {
              type: 'distribute',
              direction: 'v',
              gap: Math.round(gap),
              bounds: { from: startY, to: endY, crossStart, crossEnd },
            }
          }
        }),

      clearAlignInfo: () =>
        set((state) => {
          state.lastAlignInfo = null
        }),

      updateNodeInteraction: (id, interaction) =>
        set((state) => {
          updateById(state.nodes, id, (n) => {
            if (!n.interaction) {
              n.interaction = {} as InteractionConfig
            }
            Object.assign(n.interaction, interaction)
            // 清空子配置时移除空对象，避免导出时输出空 interaction
            const hasContent = Object.values(n.interaction).some(
              (v) => v !== undefined && v !== null,
            )
            if (!hasContent) {
              n.interaction = undefined as any
            }
          })
        }),

      togglePreviewMode: () =>
        set((state) => {
          state.previewMode = !state.previewMode
          if (!state.previewMode) {
            // 退出预览：清空所有临时 display 状态
            state.previewDisplayOverrides = {}
            // 同时清空选中和格式刷
            state.selectedId = null
            state.selectedIds = []
            state.formatBrushStyle = null
          }
        }),

      setPreviewMode: (on) =>
        set((state) => {
          state.previewMode = on
          if (!on) {
            state.previewDisplayOverrides = {}
            state.selectedId = null
            state.selectedIds = []
            state.formatBrushStyle = null
          }
        }),

      setPreviewDisplay: (id, display) =>
        set((state) => {
          state.previewDisplayOverrides[id] = display
        }),

      clearPreviewDisplay: () =>
        set((state) => {
          state.previewDisplayOverrides = {}
        }),

      toggleLeftPanel: () =>
        set((state) => {
          state.leftPanelCollapsed = !state.leftPanelCollapsed
        }),

      toggleRightPanel: () =>
        set((state) => {
          state.rightPanelCollapsed = !state.rightPanelCollapsed
        }),

      toggleRulerCursor: () =>
        set((state) => {
          state.rulerCursorVisible = !state.rulerCursorVisible
        }),

      openCropModal: (payload) =>
        set((state) => {
          state.cropModal = {
            open: true,
            imageSrc: payload.imageSrc,
            imageWidth: payload.imageWidth,
            imageHeight: payload.imageHeight,
            initialShape: payload.initialShape || 'rectangle',
            initialCrop: payload.initialCrop || null,
            onConfirm: payload.onConfirm,
            cropKey: state.cropModal.cropKey + 1,
          }
        }),

      closeCropModal: () =>
        set((state) => {
          state.cropModal.open = false
          // 保留 imageSrc 等数据 1 帧用于退出动画
        }),

      clearCanvas: () =>
        set((state) => {
          state.nodes = []
          state.selectedId = null
          state.selectedIds = []
          state.formatBrushStyle = null
        }),

      loadTemplate: (nodes, canvas) => {
        set((state) => {
          state.nodes = nodes
          state.canvas = canvas
          state.selectedId = null
          state.selectedIds = []
          state.formatBrushStyle = null
        })
      },

      addNodes: (nodes, canvasPatch) => {
        set((state) => {
          state.nodes = [...state.nodes, ...nodes]
          if (canvasPatch) {
            Object.assign(state.canvas, canvasPatch)
          }
          state.selectedId = null
          state.selectedIds = []
        })
      },

      setFormatBrush: (style) =>
        set((state) => {
          state.formatBrushStyle = style
        }),

      setZoom: (zoom) =>
        set((state) => {
          state.zoom = Math.max(0.1, Math.min(3, zoom))
        }),

      resetZoom: () =>
        set((state) => {
          state.zoom = 1
        }),

      /** 复制节点到模块级剪贴板（不操作 store，不触发重渲染） */
      copyNode: (id) => {
        const { nodes } = useEditorStore.getState()
        const node = findById(nodes, id)
        if (node) {
          clipboard = JSON.parse(JSON.stringify(node)) as CanvasNode
          clipboardPasteCount = 0
          isInternalCopying = true
          lastInternalCopyTime = Date.now()
          // 下一个事件循环重置标记，确保 document copy 监听器不会误判
          setTimeout(() => { isInternalCopying = false }, 0)
        }
      },

      /** 在当前节点旁复制一份，偏移 20px */
      duplicateNode: (id) => {
        const { nodes } = useEditorStore.getState()
        const node = findById(nodes, id)
        if (!node) return ''
        const clone = deepCloneNode(node)
        const offset = 20
        clone.style.x = (clone.style.x ?? 0) + offset
        clone.style.y = (clone.style.y ?? 0) + offset
        // 找到原节点的父级，插入到其旁边
        let newId = ''
        set((state) => {
          const insertAfter = (arr: CanvasNode[]): boolean => {
            const idx = arr.findIndex((n) => n.id === id)
            if (idx >= 0) {
              arr.splice(idx + 1, 0, clone)
              return true
            }
            for (const n of arr) {
              if (n.children.length && insertAfter(n.children)) return true
            }
            return false
          }
          if (!insertAfter(state.nodes)) {
            state.nodes.push(clone)
          }
          state.selectedId = clone.id
          newId = clone.id
        })
        // 同步到剪贴板
        clipboard = JSON.parse(JSON.stringify(clone)) as CanvasNode
        clipboardPasteCount = 0
        isInternalCopying = true
        lastInternalCopyTime = Date.now()
        setTimeout(() => { isInternalCopying = false }, 0)
        return newId
      },

      /** 从剪贴板粘贴：在画布中央或选中容器内添加 */
      pasteNode: (parentId) => {
        if (!clipboard) return ''
        clipboardPasteCount++
        const clone = deepCloneNode(clipboard)
        const offset = 20 * clipboardPasteCount
        clone.style.x = (clone.style.x ?? 0) + offset
        clone.style.y = (clone.style.y ?? 0) + offset
        let newId = ''
        set((state) => {
          if (parentId) {
            updateById(state.nodes, parentId, (n) => {
              n.children.push(clone)
            })
          } else {
            state.nodes.push(clone)
          }
          state.selectedId = clone.id
          newId = clone.id
        })
        return newId
      },
    })),
    // 追踪 nodes 与 canvas 变化作为撤销/重做历史（选中态不进历史）
    {
      partialize: (state) => ({ nodes: state.nodes, canvas: state.canvas }) as EditorState,
      limit: 100,
    },
  ),
)

// 开发环境暴露 store 到 window，便于调试
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  ;(window as unknown as { __pageforge_store: typeof useEditorStore }).__pageforge_store = useEditorStore
}

/** 获取当前选中节点 */
export function useSelectedNode(): CanvasNode | null {
  const nodes = useEditorStore((s) => s.nodes)
  const selectedId = useEditorStore((s) => s.selectedId)
  if (!selectedId) return null
  return findById(nodes, selectedId)
}

/** 撤销/重做状态（通过 zundo 的 temporal store 订阅） */
export function useHistory() {
  const undo = useStore(useEditorStore.temporal, (s) => s.undo)
  const redo = useStore(useEditorStore.temporal, (s) => s.redo)
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0)
  return { undo, redo, canUndo, canRedo }
}
