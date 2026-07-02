# PageForge 交互式 HTML —— 下一步开发计划

> 创建日期：2026-07-02
> 基于：`interactive-html-plan.md`（5 Phase 计划）

---

## 当前状态总结

交互式 HTML 功能已完成了 **Phase 1~3 的大部分**：

| Phase | 状态 | 内容 |
|-------|------|------|
| Phase 1 | ✅ 完成 | 类型定义（InteractionConfig 等）、Store（updateNodeInteraction） |
| Phase 2 | ✅ 完成 | Inspector 交互配置面板（链接/点击/悬停/动画 4 个可折叠区域） |
| Phase 3 | ⚠️ 90% | animations.css 已创建、CanvasElement 悬停预览+徽章已完成，**NodeRenderer.tsx 链接渲染 `<a>` 标签未完成** |
| Phase 4 | ❌ 未开始 | interactionRuntime.ts（运行时 JS）、exportHtml.ts（data-pf 属性 + script 注入） |
| Phase 5 | ❌ 未开始 | 预览模式、表单提交、导入支持、动画序列等进阶功能 |

**核心结论：目前可以在 UI 中配置交互，画布中也能预览悬停效果，但导出的 HTML 仍然是纯静态的，因为缺少 Phase 4 的运行时代码和导出逻辑。**

---

## 下一步开发计划

### Step 1：完成 Phase 3 — NodeRenderer.tsx 链接渲染

**目标**：当节点配置了 `link` 时，在画布中渲染为 `<a>` 标签，提供视觉反馈。

**修改文件**：`src/components/NodeRenderer.tsx`

**具体改动**（~15 行）：

1. 修改 `renderNodeContent` 函数，接收 `node` 完整对象（当前只接收 `node: CanvasNode`，但 button/text 分支需要访问 `node.interaction?.link`）
2. 在 `button` 和 `text` 类型的渲染分支中：
   - 检查 `node.interaction?.link?.href` 是否存在
   - 若存在，将内容包裹在 `<a>` 标签中，设置 `href` 和 `target`
   - 同时给 `<a>` 添加 `cursor: pointer` 和适当的链接样式（下划线、颜色）
3. `heading` 类型同理，支持链接渲染

**涉及文件**：

| 文件 | 改动 |
|------|------|
| `src/components/NodeRenderer.tsx` | 修改 button/text/heading 渲染分支，支持 `<a>` 包裹（~15 行） |

---

### Step 2：Phase 4 — 创建交互运行时 JS

**目标**：生成的零依赖 vanilla JS 字符串，导出时嵌入 `<script>` 标签，让导出的 HTML 真正具有交互能力。

**新文件**：`src/utils/interactionRuntime.ts`（~200 行）

**运行时功能**：

1. **注入动画 CSS**（~20 行）
   - 创建 `<style>` 标签，写入 8 种入场动画的 `@keyframes`（与 `animations.css` 保持一致）
   - 动态生成 `.pf-animate-{type}` CSS 类

2. **生成悬停 CSS**（~30 行）
   - 扫描所有 `[data-pf-hover]` 元素
   - 解析 `data-pf-hover` JSON 属性（effect, scale, duration, shadowIntensity, hoverColor）
   - 为每个元素动态生成 CSS 规则（`.pf-hover-{id}:hover`），写入 `<style>`
   - 对每个元素添加对应的 class 和 `transition` 内联样式

3. **点击事件处理**（~50 行）
   - 扫描所有 `[data-pf-interaction]` 元素
   - 解析 `data-pf-interaction` JSON 属性
   - 注册 `click` 事件监听器，根据 `action` 类型处理：
     - `navigate`：`window.location.href = url` 或 `window.open(url)`
     - `scroll-to`：`document.getElementById(targetId)?.scrollIntoView({behavior:'smooth'})`
     - `toggle`：切换目标元素 `display` 属性
     - `show`：设置目标元素 `display = ''`
     - `hide`：设置目标元素 `display = 'none'`
     - `submit-form`：阻止默认，收集表单数据，显示成功消息

4. **滚动动画**（~30 行）
   - 使用 `IntersectionObserver` 监听 `[data-pf-animate][data-pf-trigger="scroll"]` 元素
   - 进入视口时添加动画 class，触发 CSS 动画
   - 支持 `data-pf-threshold` 自定义触发阈值

5. **加载动画**（~15 行）
   - `DOMContentLoaded` 后对 `[data-pf-animate][data-pf-trigger="load"]` 元素添加动画 class
   - 支持 `data-pf-delay` 延迟

6. **链接渲染**（~15 行）
   - 扫描 `[data-pf-link]` 元素
   - 将元素包裹在 `<a>` 标签中（或直接修改为可点击）

**导出函数签名**：

```typescript
export function generateInteractionRuntime(): string
```

返回一个完整的自执行 IIFE 字符串，格式为：

```javascript
;(function() {
  'use strict';
  // 1. 注入动画 CSS
  // 2. 生成悬停 CSS
  // 3. 点击事件
  // 4. 滚动动画
  // 5. 加载动画
  // 6. 链接处理
})();
```

**关键设计决策**：
- 所有选择器使用 `data-pf-*` 属性，避免与用户页面 CSS 冲突
- 动画 CSS 使用 `pf-` 前缀命名空间
- 不依赖任何第三方库，保持零依赖
- 运行时通过 `JSON.parse` 解析属性值，复杂数据存为 JSON 字符串

---

### Step 3：Phase 4 — 修改导出逻辑

**目标**：在导出 HTML 时注入交互属性和运行时脚本。

**修改文件**：`src/utils/exportHtml.ts`

**具体改动**（~60 行）：

1. **修改 `nodeToHtml` 函数**（~35 行）
   - 新增辅助函数 `buildInteractionAttrs(node: CanvasNode): string`
   - 根据 `node.interaction` 生成以下 data 属性：
     - 有 `link` → `data-pf-link='{"href":"...","target":"..."}'`
     - 有 `onClick` → `data-pf-interaction='{"action":"...","url":"...","targetId":"...","newTab":...}'`
     - 有 `onHover` → `data-pf-hover='{"effect":"...","scale":...,"duration":...}'` + `data-pf-hover-id="{node.id}"`
     - 有 `animation` → `data-pf-animate="pf-animate-{type}"` + `data-pf-delay="{delay}"` + `data-pf-trigger="{trigger}"` + `data-pf-threshold="{threshold}"`
   - 在每个 `node.type` 分支的 HTML 标签中插入这些属性
   - 有 `link` 的元素（button/text/heading/image/icon）渲染为 `<a>` 标签包裹

2. **修改 `buildHtml` 函数**（~25 行）
   - 导入 `generateInteractionRuntime`
   - 在 `</style>` 之后、`</head>` 之前注入 `<script>${generateInteractionRuntime()}</script>`
   - 仅当存在交互节点时才注入（通过检查 nodes 树中是否有任何 `interaction` 配置）

**涉及文件**：

| 文件 | 改动 |
|------|------|
| `src/utils/interactionRuntime.ts` | **新文件**，~200 行运行时 JS |
| `src/utils/exportHtml.ts` | nodeToHtml 加交互属性 + buildHtml 加 script 注入（~60 行） |

---

### Step 4：Phase 5 — 进阶功能（后续迭代）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| 🟡 中 | 预览模式 | 工具栏新增"预览"按钮，切换后禁用编辑交互，启用链接点击和动画播放 |
| 🟡 中 | 表单提交 | 支持配置 webhook URL，导出后表单可真正提交数据 |
| 🟢 低 | 导入支持 | `importHtml.ts` 解析 `data-pf-interaction` 等属性还原交互配置 |
| 🟢 低 | 动画序列 | 同类型动画自动 stagger 延迟，实现瀑布式入场效果 |
| 🟢 低 | 导航栏链接配置 | 从逗号分隔字符串改为结构化数组，每个链接独立配置 URL |

---

## 涉及文件总览（本次开发）

| 文件 | 改动量 | 说明 |
|------|--------|------|
| `src/components/NodeRenderer.tsx` | ~15 行 | 链接渲染为 `<a>` 标签 |
| `src/utils/interactionRuntime.ts` | **新文件** ~200 行 | 零依赖 JS 运行时 |
| `src/utils/exportHtml.ts` | ~60 行 | data-pf 属性 + script 注入 |

**总计：约 275 行新增代码，1 个新文件，2 个文件修改。**

---

## 验证方式

### Step 1 验证（NodeRenderer 链接渲染）
1. 在画布中选中一个 button 或 text 节点
2. 在 Inspector 中展开"🔗 链接"，输入 URL（如 `https://example.com`）
3. 确认画布中该节点渲染为 `<a>` 标签（可通过 DevTools 检查）
4. 确认链接样式（下划线、颜色）在画布中可见

### Step 2-3 验证（导出运行时）
1. 配置一个按钮：链接 → `https://example.com` + 悬停缩放 + 淡入动画
2. 配置一个图片：点击 → 滚动到 `#section2` + 悬停阴影
3. 导出 HTML，用浏览器打开
4. 验证：
   - 页面加载时按钮淡入动画播放 ✅
   - 鼠标悬停按钮时缩放效果正常 ✅
   - 鼠标悬停图片时阴影效果正常 ✅
   - 点击按钮跳转到 `https://example.com` ✅
   - 点击图片滚动到 `#section2` 锚点 ✅
5. 回归测试：导出纯静态节点（无交互配置），确认导出行为不变 ✅

### 整体验证
- 在画布中组合多个交互元素，导出后所有交互同时正常工作
- 检查浏览器 Console 无 JS 错误
- 检查导出的 HTML 文件大小合理（运行时约 3-5KB）