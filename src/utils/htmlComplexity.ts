/**
 * HTML 复杂度检测
 *
 * 用于在用户导入 HTML（粘贴 / 上传 / 开源模板）时，判断"自由画布模式"和"精修模式"
 * 哪种更合适。检测越复杂 → 越推荐"精修模式"（iframe + DOM 标注，100% 还原），
 * 因为自由画布模式会把 flex/grid/media query 强行拆成绝对定位节点，容易错位。
 *
 * 阈值的判断原则：宁可错杀（简单页面也走精修）也不漏杀（复杂页面走自由画布而错位）。
 */

export type ImportMode = 'freeform' | 'refine'

export interface ComplexitySignals {
  /** 多层嵌套的 flex/grid 容器（>1 层） */
  nestedFlexGrid: boolean
  /** 出现 display: flex 或 display: grid 的元素数 */
  flexGridCount: number
  /** 出现嵌套 flex 容器的层级深度（最深） */
  maxFlexDepth: number
  /** CSS 伪元素 ::before / ::after */
  hasPseudoElements: boolean
  /** @media 媒体查询 */
  hasMediaQuery: boolean
  /** 绝对/固定定位的子元素数（>2 个时易出现层叠混乱） */
  absoluteChildCount: number
  /** CSS transform / animation / transition */
  hasTransforms: boolean
  /** CSS calc() / vh/vw/min()/clamp() */
  hasAdvancedUnits: boolean
  /** <table> 表格布局 */
  hasTableLayout: boolean
  /** 元素总数 */
  elementCount: number
  /** 行内 <style> 标签数 */
  styleTagCount: number
  /** 检测到的 :has() / :is() / :where() 等现代选择器 */
  hasModernSelectors: boolean
}

export interface ComplexityResult {
  /** 推荐模式 */
  recommendation: ImportMode
  /** 推荐置信度 0~1，>0.7 表示强推荐 */
  confidence: number
  /** 命中的复杂度信号 */
  signals: ComplexitySignals
  /** 给用户看的人话说明（每条一行） */
  reasons: string[]
}

/**
 * 快速检测（不解析 DOM，仅正则 + 字符串计数）
 * 对超大 HTML 也能即时完成（O(n)，n=HTML 长度）
 */
export function detectHtmlComplexity(html: string): ComplexityResult {
  const signals: ComplexitySignals = {
    nestedFlexGrid: false,
    flexGridCount: 0,
    maxFlexDepth: 0,
    hasPseudoElements: false,
    hasMediaQuery: false,
    absoluteChildCount: 0,
    hasTransforms: false,
    hasAdvancedUnits: false,
    hasTableLayout: false,
    elementCount: 0,
    styleTagCount: 0,
    hasModernSelectors: false,
  }

  if (!html || !html.trim()) {
    return {
      recommendation: 'freeform',
      confidence: 0,
      signals,
      reasons: ['未检测到 HTML 内容'],
    }
  }

  // 1. flex/grid 出现次数（display:flex / display:grid / flex- 简写）
  const flexMatches = html.match(/display\s*:\s*(flex|inline-flex|grid|inline-grid)/gi) || []
  const flexBasisMatches = html.match(/flex\s*:\s*\d+/gi) || []
  signals.flexGridCount = flexMatches.length

  // 2. @media 媒体查询
  signals.hasMediaQuery = /@media[^{]+{/i.test(html)

  // 3. 伪元素
  signals.hasPseudoElements = /::?(?:before|after|placeholder|first-line|first-letter|selection|marker)\b/i.test(html)

  // 4. position: absolute / fixed 计数
  const absMatches = html.match(/position\s*:\s*(absolute|fixed|sticky)/gi) || []
  signals.absoluteChildCount = absMatches.length

  // 5. transform / animation / transition
  signals.hasTransforms =
    /transform\s*:/i.test(html) ||
    /animation\s*:/i.test(html) ||
    /transition\s*:/i.test(html) ||
    /@keyframes\b/i.test(html)

  // 6. 高级单位/函数
  signals.hasAdvancedUnits =
    /calc\s*\(/i.test(html) ||
    /\d+\s*v(h|w|min|max)\b/i.test(html) ||
    /\b(?:min|max|clamp)\s*\(/i.test(html)

  // 7. <table> 布局
  signals.hasTableLayout = /<table[\s>]/i.test(html) && /<td[\s>]/i.test(html)

  // 8. 元素总数（粗略估算开标签数）
  const tagMatches = html.match(/<[a-zA-Z][a-zA-Z0-9]*\b/g) || []
  signals.elementCount = tagMatches.length

  // 9. <style> 标签数
  signals.styleTagCount = (html.match(/<style[\s>]/gi) || []).length

  // 10. 现代选择器 :has / :is / :where
  signals.hasModernSelectors = /:has\s*\(|\b:is\s*\(|\b:where\s*\(/i.test(html)

  // 11. 多层 flex 嵌套检测（粗略）：找连续嵌套的 flex 容器
  // 通过统计 <div/section/... [任意属性] style="...display:flex..."> 嵌套
  // 简化处理：只数 flex 出现次数 ≥ 3 时认为可能多层嵌套
  if (signals.flexGridCount >= 3) {
    // 用更细致的方式估算嵌套深度：
    // 查找所有 display:flex 的 style 块，统计它们被几层相同特征的 div 包裹
    // 由于无 DOM 解析，这里用启发式：flex 数 > 5 通常意味着多层
    signals.maxFlexDepth = signals.flexGridCount >= 5 ? 3 : 2
  }
  signals.nestedFlexGrid = signals.maxFlexDepth >= 2

  // === 综合判断 ===
  const reasons: string[] = []
  let complexScore = 0
  let freeformScore = 0

  // 每条命中计分（每条独立加分，最终取 max）
  if (signals.flexGridCount >= 3) {
    complexScore += 0.4
    reasons.push(`检测到 ${signals.flexGridCount} 处 flex/grid 布局`)
  } else if (signals.flexGridCount > 0) {
    complexScore += 0.15
    reasons.push(`检测到 ${signals.flexGridCount} 处 flex/grid 布局`)
  } else {
    freeformScore += 0.3
  }

  if (signals.nestedFlexGrid) {
    complexScore += 0.3
    reasons.push(`多层 flex/grid 嵌套（深度约 ${signals.maxFlexDepth} 层）`)
  }

  if (signals.hasMediaQuery) {
    complexScore += 0.35
    const mediaCount = (html.match(/@media/g) || []).length
    reasons.push(`响应式断点（@media × ${mediaCount}）`)
  }

  if (signals.hasPseudoElements) {
    complexScore += 0.25
    reasons.push('CSS 伪元素（::before / ::after）')
  }

  if (signals.hasTransforms) {
    complexScore += 0.2
    reasons.push('变换/动画（transform / animation / transition）')
  }

  if (signals.hasAdvancedUnits) {
    complexScore += 0.2
    reasons.push('高级 CSS 单位（calc / vh / vw / clamp）')
  }

  if (signals.hasTableLayout) {
    complexScore += 0.4
    reasons.push('表格布局（<table>）')
  }

  if (signals.absoluteChildCount >= 3) {
    complexScore += 0.15
    reasons.push(`${signals.absoluteChildCount} 个绝对/固定定位元素`)
  }

  if (signals.hasModernSelectors) {
    complexScore += 0.15
    reasons.push('现代 CSS 选择器（:has / :is / :where）')
  }

  if (signals.styleTagCount >= 3) {
    complexScore += 0.1
    reasons.push(`${signals.styleTagCount} 个 <style> 块（样式量大）`)
  }

  if (signals.elementCount > 80) {
    complexScore += 0.1
    reasons.push(`元素数量较多（${signals.elementCount} 个）`)
  } else if (signals.elementCount < 20 && signals.flexGridCount === 0) {
    freeformScore += 0.4
    reasons.push('元素少、布局简单')
  }

  // 决策
  const total = complexScore - freeformScore
  const confidence = Math.min(1, Math.abs(total) + 0.3)

  if (total >= 0.3) {
    return {
      recommendation: 'refine',
      confidence,
      signals,
      reasons: reasons.length > 0 ? reasons : ['检测到复杂布局特征'],
    }
  } else if (total <= -0.3) {
    return {
      recommendation: 'freeform',
      confidence,
      signals,
      reasons: reasons.length > 0 ? reasons : ['结构简单，适合自由编辑'],
    }
  } else {
    // 灰色地带：根据 flexGridCount 偏向一侧
    if (signals.flexGridCount > 0) {
      return {
        recommendation: 'refine',
        confidence: 0.4,
        signals,
        reasons,
      }
    } else {
      return {
        recommendation: 'freeform',
        confidence: 0.4,
        signals,
        reasons,
      }
    }
  }
}

/**
 * 模式名 → 中文标签
 */
export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  freeform: '自由画布',
  refine: '精修',
}

/**
 * 模式描述（给用户看的）
 */
export const IMPORT_MODE_DESC: Record<ImportMode, string> = {
  freeform: '像从零做一样自由拖拽、resize、加新组件。简单页面首选。',
  refine: '100% 还原原页面，文字/颜色/图片随时改。复杂布局首选。',
}

/**
 * 模式警告（给用户看的代价）
 */
export const IMPORT_MODE_WARNING: Record<ImportMode, string> = {
  freeform: '复杂布局（多层 flex/grid）可能错位',
  refine: '元素位置由原结构决定，不能像自由画布那样随意拖拽',
}
