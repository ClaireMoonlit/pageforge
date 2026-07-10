// 造页工坊 · 文档模型（AST）类型定义
// 节点 = { id, type, props, style, children, layoutHint }

/** 组件类型 */
export type ComponentType =
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'card'
  | 'container'
  | 'divider'
  | 'icon'
  | 'video'
  | 'input'
  | 'iframe'
  | 'navbar'
  | 'grid'
  | 'form'

/**
 * 布局提示：供规则引擎推断响应式布局
 * - row: 与其他元素同行排列 → flex-row
 * - column: 与其他元素同列排列 → flex-col
 * - nest: 嵌套在容器内 → container
 */
export type LayoutHint = 'row' | 'column' | 'nest'

/** 元素样式（自由画布阶段含绝对坐标，导出时由规则引擎转响应式） */
export interface NodeStyle {
  // 位置（画布坐标）
  x?: number
  y?: number
  position?: 'relative' | 'absolute'
  // 尺寸
  width?: string
  maxWidth?: string
  height?: string
  minHeight?: string
  // 间距
  padding?: string
  paddingTop?: string
  paddingRight?: string
  paddingBottom?: string
  paddingLeft?: string
  margin?: string
  marginTop?: string
  marginRight?: string
  marginBottom?: string
  marginLeft?: string
  // 文字
  fontSize?: string
  fontWeight?: string
  fontFamily?: string
  fontStyle?: 'normal' | 'italic' | 'oblique'
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  lineHeight?: string
  letterSpacing?: string
  // 布局
  display?: string
  alignItems?: string
  justifyContent?: string
  flexDirection?: string
  flexWrap?: string
  flex?: string
  flexGrow?: string
  flexShrink?: string
  flexBasis?: string
  gap?: string
  overflow?: string
  // 额外定位
  top?: string
  left?: string
  right?: string
  bottom?: string
  maxHeight?: string
  // 外观
  backgroundColor?: string
  background?: string
  backgroundImage?: string
  backgroundRepeat?: string
  backgroundPosition?: string
  backgroundSize?: string
  borderRadius?: string
  border?: string
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
  boxShadow?: string
  wordBreak?: string
  overflowWrap?: string
  textTransform?: string
  whiteSpace?: string
  zIndex?: string
  opacity?: string
}

// ═══════════════════════════════════════════════
// 交互配置类型
// ═══════════════════════════════════════════════

/** 点击动作类型 */
export type ClickActionType =
  | 'navigate'    // 跳转 URL
  | 'scroll-to'   // 平滑滚动到锚点
  | 'toggle'      // 切换目标元素显隐
  | 'show'        // 显示目标元素
  | 'hide'        // 隐藏目标元素
  | 'submit-form' // 提交最近表单
  | 'none'

/** 悬停效果类型 */
export type HoverEffectType =
  | 'none'
  | 'scale'
  | 'shadow'
  | 'color-shift'
  | 'glow'

/** 入场动画类型 */
export type AnimationType =
  | 'none'
  | 'fade-in'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'bounce'

/** 动画触发方式 */
export type AnimationTrigger = 'load' | 'scroll'

/** 链接配置 */
export interface LinkConfig {
  href: string
  target: '_self' | '_blank'
}

/** 点击动作配置 */
export interface ClickActionConfig {
  action: ClickActionType
  url?: string
  targetId?: string
  newTab?: boolean
}

/** 悬停效果配置 */
export interface HoverEffectConfig {
  effect: HoverEffectType
  scale?: number
  hoverColor?: string
  shadowIntensity?: 'light' | 'medium' | 'heavy'
  duration?: number
}

/** 入场动画配置 */
export interface AnimationConfig {
  type: AnimationType
  duration: number
  delay: number
  easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'
  trigger: AnimationTrigger
  threshold?: number
}

/** 交互配置（存储在节点上，可序列化） */
export interface InteractionConfig {
  link?: LinkConfig
  onClick?: ClickActionConfig
  onHover?: HoverEffectConfig
  animation?: AnimationConfig
}

// ═══════════════════════════════════════════════

/** 组件内容 props（按类型取用） */
export interface NodeProps {
  text?: string // heading / text / button / card / icon / input
  subtitle?: string // card
  titleFontSize?: string // card 主标题字号
  titleColor?: string // card 主标题颜色
  subtitleFontSize?: string // card 副标题字号
  subtitleColor?: string // card 副标题颜色
  subtitleLineHeight?: number // card 副标题行高（默认 1.6）
  src?: string // image / video
  alt?: string // image
  poster?: string // video 封面
  originalSrc?: string // 未裁切的原图（重新裁切时使用）
  imageShape?: 'rectangle' | 'circle' | 'rounded' // 图片占位形状，默认 rectangle
  cropRect?: { x: number; y: number; width: number; height: number } // 上次裁切选区（重新裁切时记忆）
  originalWidth?: number // 原图自然宽度（用于自由拉伸原比例吸附）
  originalHeight?: number // 原图自然高度
  rotation?: number // 图片旋转角度（度），默认 0
  flipH?: boolean // 水平镜像
  flipV?: boolean // 垂直镜像
  icon?: string // icon 图标（emoji 或文字）
  placeholder?: string // input 占位文字
  level?: 1 | 2 | 3 // heading 层级
  // navbar
  logo?: string // 导航栏 logo 文字
  navLinks?: string // 导航链接（逗号分隔，如 "首页,关于,服务,联系"）
  linkColor?: string // 导航链接颜色
  linkHoverColor?: string // 导航链接 hover 颜色
  // grid
  columns?: number // 网格列数
  gridGap?: string // 网格间距
  // form
  fields?: string // 表单字段（JSON 数组字符串）
  submitText?: string // 提交按钮文字
}

/** AST 节点 */
export interface CanvasNode {
  id: string
  type: ComponentType
  props: NodeProps
  style: NodeStyle
  children: CanvasNode[]
  layoutHint?: LayoutHint
  /** 是否在画布上可见（false 时渲染为半透明占位，导出时跳过） */
  visible?: boolean
  /** 交互配置（链接、点击动作、悬停效果、入场动画） */
  interaction?: InteractionConfig
}

/** 组件库条目定义 */
export interface ComponentDef {
  type: ComponentType
  label: string
  /** 图标：type='svg' 用 SVG_ICON_MAP 中的 key；type='emoji' 直接显示字符 */
  icon: { type: 'svg' | 'emoji'; value: string }
  defaultProps: NodeProps
  defaultStyle: NodeStyle
}

/** 画布配置（背景色与画布尺寸，可在无选中时于属性面板编辑） */
export interface CanvasConfig {
  backgroundColor: string
  width: string
  height: string
}
