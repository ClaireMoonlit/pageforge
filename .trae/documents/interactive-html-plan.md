# PageForge 交互式 HTML 开发计划

## 背景

当前 PageForge 只能生成**纯静态** HTML 页面。所有组件（按钮、表单、导航栏等）渲染为静态元素，没有：

* 点击事件（链接跳转、滚动到锚点、弹窗）

* 悬停动效（缩放、阴影、颜色变化）

* 入场动画（淡入、滑入、缩放）

* 表单提交逻辑

* 任何 JavaScript 运行时

**目标**：让非前端用户通过可视化 UI 配置交互，导出的 HTML 自带零依赖 JS 运行时，实现真正的交互式页面。

***

## 总体架构

```
用户 (Inspector UI 配置交互)
       ↓
InteractionConfig (存储在 CanvasNode.interaction)
       ↓
  ┌────────────────────────────────────┐
  │ 画布预览 ← CanvasElement 实时预览  │
  │ 导出运行时 ← 嵌入式 vanilla JS     │
  └────────────────────────────────────┘
```

交互配置存储为**可序列化数据**，不存代码。画布预览 CSS 级效果（hover、动画），导出运行时处理全部 JS 逻辑。

***

## Phase 1：数据模型 & Store（地基）

### 1.1 扩展类型定义 — `src/types/index.ts`

新增交互相关类型：

```typescript
// 点击动作
export type ClickActionType = 'navigate' | 'scroll-to' | 'toggle' | 'show' | 'hide' | 'submit-form' | 'none'
export type HoverEffectType = 'none' | 'scale' | 'shadow' | 'color-shift' | 'glow'
export type AnimationType = 'none' | 'fade-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'bounce'
export type AnimationTrigger = 'load' | 'scroll'

export interface LinkConfig {
  href: string
  target: '_self' | '_blank'
}

export interface ClickActionConfig {
  action: ClickActionType
  url?: string
  targetId?: string
  newTab?: boolean
}

export interface HoverEffectConfig {
  effect: HoverEffectType
  scale?: number
  hoverColor?: string
  shadowIntensity?: 'light' | 'medium' | 'heavy'
  duration?: number
}

export interface AnimationConfig {
  type: AnimationType
  duration: number
  delay: number
  easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'
  trigger: AnimationTrigger
  threshold?: number
}

export interface InteractionConfig {
  link?: LinkConfig
  onClick?: ClickActionConfig
  onHover?: HoverEffectConfig
  animation?: AnimationConfig
}
```

在 `CanvasNode` 中新增字段：

```typescript
export interface CanvasNode {
  // ... 现有字段 ...
  interaction?: InteractionConfig
}
```

### 1.2 新增 Store Action — `src/store/editorStore.ts`

```typescript
updateNodeInteraction: (id: string, interaction: Partial<InteractionConfig>) => void
```

实现方式：复用 `updateById` 递归查找，`Object.assign` 合并。若 interaction 清空为全空对象则置 `undefined`。

撤销/重做：`partialize` 已追踪 `nodes`，自动生效，无需额外配置。

### 1.3 涉及文件

| 文件                         | 改动                                             |
| -------------------------- | ---------------------------------------------- |
| `src/types/index.ts`       | 新增 \~80 行类型定义，`CanvasNode` 加 `interaction?` 字段 |
| `src/store/editorStore.ts` | 新增 `updateNodeInteraction` action（\~15 行）      |

***

## Phase 2：Inspector 交互配置面板

### 2.1 修改 `src/components/Inspector.tsx`

在现有"外观"样式编辑区之后，按组件类型条件渲染 4 个可折叠交互配置区：

**🔗 链接**（适用：button, image, icon, text, heading, card, navbar）

* URL 输入框

* "新标签页打开" 复选框

**👆 点击动作**（适用：button, image, card, icon）

* 动作类型下拉：无 / 跳转 URL / 滚动到锚点 / 切换显隐 / 显示 / 隐藏 / 提交表单

* 条件字段：URL 输入、目标元素 ID 输入

**✨ 悬停效果**（适用：button, image, card, icon, container）

* 效果下拉：无 / 缩放 / 阴影 / 颜色变化 / 发光

* 条件字段：缩放倍率滑块、阴影强度、Hover 颜色选择器、过渡时长

**🎬 入场动画**（适用：全部组件）

* 动画类型下拉：无 / 淡入 / 上滑 / 下滑 / 左滑 / 右滑 / 缩放 / 弹跳

* 时长滑块 (200-2000ms)、延迟滑块 (0-2000ms)

* 缓动下拉、触发方式（加载时 / 滚动到视口）

每个区域用 `useState` 折叠/展开，复用现有 `Field` 组件模式。

### 2.2 涉及文件

| 文件                             | 改动                |
| ------------------------------ | ----------------- |
| `src/components/Inspector.tsx` | 新增 \~200 行交互配置 UI |

***

## Phase 3：画布交互预览

### 3.1 修改 `src/components/CanvasElement.tsx`

* **悬停效果预览**：添加 `onMouseEnter`/`onMouseLeave`，根据 `node.interaction?.onHover` 动态应用 CSS transform/box-shadow/background-color

* **交互标记徽章**：元素有 `link` 或 `onClick` 配置时，在右上角显示小图标（🔗 或 🖱️），提示用户该元素可交互

### 3.2 修改 `src/components/NodeRenderer.tsx`

* 有 `link` 配置的 button/text 渲染为 `<a>` 标签，视觉上显示链接样式

### 3.3 新增动画 CSS — `src/styles/animations.css`

定义 8 种入场动画的 `@keyframes`（fade-in, slide-up/down/left/right, zoom-in, bounce），供画布预览和导出 HTML 共用。

### 3.4 涉及文件

| 文件                                 | 改动                           |
| ---------------------------------- | ---------------------------- |
| `src/components/CanvasElement.tsx` | 新增 hover 预览 + 徽章（\~40 行）     |
| `src/components/NodeRenderer.tsx`  | link 渲染为 `<a>` 标签（\~10 行）    |
| `src/styles/animations.css`        | **新文件**，动画 keyframes（\~50 行） |

***

## Phase 4：导出 JS 运行时

### 4.1 新增 `src/utils/interactionRuntime.ts`

生成一段**零依赖、自执行**的 vanilla JS 字符串，导出时嵌入 `<script>` 标签。运行时功能：

1. **注入动画 CSS**：创建 `<style>` 标签，写入动画 keyframes
2. **生成悬停 CSS**：扫描 `[data-pf-hover]` 元素，动态生成 CSS 规则
3. **点击事件**：扫描 `[data-pf-interaction]`，注册 click handler

   * `navigate`：`window.location.href` 或 `window.open`

   * `scroll-to`：`document.getElementById(target).scrollIntoView({behavior:'smooth'})`

   * `toggle/show/hide`：切换目标元素 `display`

   * `submit-form`：阻止默认，显示成功消息
4. **滚动动画**：`IntersectionObserver` 监听 `[data-pf-animate]` 元素，进入视口时添加动画 class
5. **加载动画**：`DOMContentLoaded` 后对 `trigger=load` 的元素添加动画 class

### 4.2 修改 `src/utils/exportHtml.ts`

* `nodeToHtml`：为有交互的节点生成 `data-pf-interaction`、`data-pf-hover`、`data-pf-animate` 属性

* 有 `link` 的元素渲染为 `<a>` 标签

* `buildHtml`：在 `</style>` 后注入 `<script>${interactionRuntime}</script>`

### 4.3 涉及文件

| 文件                                | 改动                                             |
| --------------------------------- | ---------------------------------------------- |
| `src/utils/interactionRuntime.ts` | **新文件**，\~200 行运行时 JS                          |
| `src/utils/exportHtml.ts`         | nodeToHtml 加交互属性，buildHtml 加 script 注入（\~50 行） |

***

## Phase 5：进阶功能 & 打磨

| 功能    | 说明                                              |
| ----- | ----------------------------------------------- |
| 预览模式  | 工具栏新增按钮，切换后禁用编辑交互，启用链接点击和动画播放                   |
| 表单提交  | 支持配置 webhook URL，导出后表单可真正提交数据                   |
| 导入支持  | `importHtml.ts` 解析 `data-pf-interaction` 还原交互配置 |
| 导航栏链接 | 从逗号分隔字符串改为结构化数组，支持每个链接独立配置                      |
| 动画序列  | 同类型动画自动 stagger 延迟，实现瀑布式入场效果                    |

***

## 涉及文件总览

| 文件                                 | Phase | 改动量             |
| ---------------------------------- | ----- | --------------- |
| `src/types/index.ts`               | 1     | \~80 行新增        |
| `src/store/editorStore.ts`         | 1     | \~15 行新增        |
| `src/components/Inspector.tsx`     | 2     | \~200 行新增       |
| `src/components/CanvasElement.tsx` | 3     | \~40 行新增        |
| `src/components/NodeRenderer.tsx`  | 3     | \~10 行修改        |
| `src/styles/animations.css`        | 3     | **新文件** \~50 行  |
| `src/utils/interactionRuntime.ts`  | 4     | **新文件** \~200 行 |
| `src/utils/exportHtml.ts`          | 4     | \~50 行修改        |
| `src/components/Toolbar.tsx`       | 5     | \~20 行新增        |
| `src/utils/importHtml.ts`          | 5     | \~30 行新增        |

**总计：约 700 行新增代码，2 个新文件，6 个文件修改。**

***

## 验证方式

1. Phase 1-2 完成后：在 Inspector 中配置交互，通过 React DevTools 确认 `node.interaction` 正确存储
2. Phase 3 完成后：在画布上 hover 元素，确认缩放/阴影/颜色变化实时生效；确认交互徽章显示
3. Phase 4 完成后：导出 HTML，用浏览器打开，验证：

   * 悬停效果正常（CSS 驱动，无闪烁）

   * 点击按钮跳转/滚动

   * 入场动画在加载时/滚动时触发

   * 表单提交后显示成功消息
4. 回归测试：确保纯静态组件（无交互配置）导出行为不变

