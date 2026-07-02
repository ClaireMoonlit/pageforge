# PageForge 项目状态交接文档

> 用途：在新对话中快速恢复项目上下文。
> 最后更新：2026-07-02
> 当前版本：v0.1.0（开发中）

---

## 1. 项目定位

**造页工坊 PageForge** —— 浏览器内的可视化网页搭建工具。

- **目标用户**：希望快速搭建落地页 / 作品集 / 营销页的非前端用户
- **核心思路**：自由画布（绝对定位） + 一键导入 HTML 模板 + 属性面板精修 + 一键导出 HTML
- **设计原则**：所见即所得、零代码、学习成本低

---

## 2. 技术栈

| 类别 | 选型 |
|------|------|
| 构建 | Vite 5 |
| 框架 | React 18 + TypeScript |
| 状态 | Zustand + Immer + zundo（撤销/重做） |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable |
| HTML 解析 | JSDOM（运行时导入）+ 内置 CSS 解析器 |
| 样式 | 原生 CSS + Tailwind（仅工具类） |
| 包管理 | npm |

> Node 路径别名：`@/*` → `src/*`（见 `vite.config.ts` 和 `tsconfig.json`）

---

## 3. 目录结构

```
PageForge/
├── public/
│   └── imported-templates/        # 9 套 Start Bootstrap 模板
│       ├── ready-agency.html      # 真实 HTML 源
│       ├── agency.json            # 预解析缓存
│       └── assets-*/              # 模板图片资源
├── scripts/                        # 调试脚本（debug-*.mts）
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # 三栏布局 + 拖拽上下文（DndContext）
│   ├── index.css                  # 全局样式 + pf-animate-* 动画 keyframes
│   ├── styles/
│   │   └── animations.css
│   ├── types/
│   │   └── index.ts               # AST 节点、样式、交互、组件类型
│   ├── store/
│   │   └── editorStore.ts         # Zustand 单一数据源
│   ├── data/
│   │   ├── componentLib.ts        # 11 个内置组件定义
│   │   ├── templates.ts           # 内置空白模板
│   │   └── importedTemplates.ts   # 9 套导入模板的元信息
│   ├── components/
│   │   ├── Toolbar.tsx            # 顶部工具栏（包含"预览"入口）
│   │   ├── ComponentPanel.tsx     # 左：组件库 / 模板
│   │   ├── TemplatePanel.tsx      # 模板导入面板
│   │   ├── Canvas.tsx             # 中：自由画布
│   │   ├── CanvasElement.tsx      # 画布节点渲染 + resize 手柄 + 预览模式交互
│   │   ├── NodeRenderer.tsx       # 节点 → React 元素 + nodeToCss + renderPreviewTree
│   │   ├── LayerTree.tsx          # 右上：层级树（末尾展示节点 ID 后 4 位）
│   │   ├── Inspector.tsx          # 右：属性面板（顶部展示完整 ID + 复制按钮）
│   │   ├── AlignInfoOverlay.tsx   # 多选对齐信息浮层
│   │   └── Icons.tsx              # 内联 SVG 图标库（含 IconEye）
│   └── utils/
│       ├── importHtml.ts          # HTML 解析（~1611 行，核心难点）
│       ├── exportHtml.ts          # 节点 → HTML 导出（含交互 + 字体收集）
│       ├── interactionRuntime.ts  # 导出 HTML 末尾的零依赖 vanilla JS 运行时
│       ├── iconPaths.ts           # 图标 SVG 路径数据
│       ├── layoutRules.ts         # 规则引擎（占位，未完整实现）
│       └── snapping.ts            # 拖拽吸附辅助线
```

---

## 4. 核心数据模型

```ts
interface CanvasNode {
  id: string
  type: 'heading' | 'text' | 'image' | 'button' | 'card' |
        'container' | 'divider' | 'icon' | 'video' | 'input' | 'iframe' |
        'navbar' | 'grid' | 'form'
  props: NodeProps      // text / src / alt / icon / level / ...
  style: NodeStyle      // 完整 CSS 子集 + 绝对坐标 x/y
  children: CanvasNode[]
  layoutHint?: 'row' | 'column' | 'nest'
  visible?: boolean
  interaction?: InteractionConfig   // 链接 / 点击 / 悬停 / 入场动画
}
```

**`editorStore.ts` 关键 API**：
- `addNode(type, x, y, parentId?)` → 返回新节点 id
- `moveNode(id, x, y)` / `updateNodeStyle(id, partial)` / `updateNodeProps(id, partial)`
- `reparentNode(id, parentId, index?)` / `removeNode(id)` / `toggleVisible(id)`
- `selectNode(id | null)` / `toggleSelection(id)` — 支持多选（Shift+点击）
- `copyNode(id)` / `duplicateNode(id)` / `pasteNode()` — 复制粘贴
- `clearCanvas()` / `loadTemplate(nodes, canvas)`
- `setZoom(zoom)` / `resetZoom()`（缩放 0.1~3）
- `setFormatBrush(style | null)` 格式刷
- `updateNodeInteraction(id, partial)` — 更新节点的链接/点击/悬停/动画
- `togglePreviewMode()` / `setPreviewMode(on)` — 预览模式开关
- `setPreviewDisplay(id, display)` / `clearPreviewDisplay()` — 预览期临时 display 状态

**撤销/重做**：`zundo` 中间件，`temporal` 状态，工具栏 ↶/↷ 触发。

---

## 5. 最近修复的问题（2026-07-02 本轮对话）

### 5.1 拖拽预览与松手位置不一致（整个画布）
- **根因**：`nodeToCss()` 只排除了 `x`/`y`/`position`，未排除 `left`/`top`/`right`/`bottom`。导入节点的 `node.style` 中残留这些 CSS 定位值，在 `CanvasElement` 中被显式 `left`/`top` 覆盖所以正确，但在 DragOverlay 预览中直接展开导致偏移。
- **修复**：`NodeRenderer.tsx:11-21` — `nodeToCss` 增加排除 `left`/`top`/`right`/`bottom`

### 5.2 容器内子元素二次拖拽吸附到左上角
- **根因**：`dragOriginRef` 存储的是子元素**相对容器**的坐标，但 `onDragEnd` 容器分支把它当作**绝对画布坐标**使用，减去容器绝对位置后 `Math.max(0, ...)` 钳制为 0。
- **修复**（三处联动）：
  1. `App.tsx:196-211` — `onDragStart` 中 `dragOriginRef` 存入绝对画布坐标（`n.style.x + parentOffset.x`）
  2. `App.tsx:344-352` — `onDragMove` 移除多余的 `parentOffset` 加法
  3. `App.tsx:284-298` — `onDragEnd` 从容器拖出时不再加 `parentOffset`

### 5.3 容器乱吸附（上一轮修复）
- **根因**：`closestCenter` 碰撞检测在吸附线对齐容器附近时误判。
- **修复**：切换为 `pointerWithin`，只有光标真正在容器内才触发拖入。

### 5.4 导出 HTML 字体/字间距与画布不一致（上一轮修复）
- **修复**：`exportHtml.ts` — body 添加 `font-family`、`-webkit-font-smoothing`、`line-height`、`color`

### 5.5 导出 HTML 重新导入布局全乱（上一轮修复）
- **修复**：
  - `exportHtml.ts` — 移除冗余包裹 div，使用 `data-pf-type` 标记类型
  - `importHtml.ts` — 识别 `pf-root` 剥离外层包装器；从 `style.left`/`style.top` 提取坐标转为画布 `x`/`y`；用 `delete` 移除 `left`/`top` 而非设为 `'auto'`

### 5.6 组件缩放尺寸突变（上一轮修复）
- **根因**：`getBoundingClientRect()` 返回屏幕空间尺寸，与后续除以 `zoom` 的移动计算坐标系不一致。
- **修复**：`CanvasElement.tsx` — 将 `rect.width`/`rect.height` 除以 `zoom` 转为画布空间

### 5.7 导出 HTML 字体丢失（这一轮排查）
- **根因 1**：导出 HTML 缺失 Google Fonts `<link>` 标签，且国内网络环境访问 `fonts.googleapis.com` 经常被墙。
- **根因 2**：`font-family` 值中的双引号导致 HTML `style` 属性提前终止（如 `"Helvetica Neue"` 被截断成 `Helvetica Neue`）。
- **根因 3**：初版只请求字重 400，但模板用了 700/600 粗体，浏览器合成"伪粗体"，渲染出现"艺术字体"风格。
- **根因 4**：`display=swap` 让浏览器先渲染回退字体，等 Web Font 加载完再替换，期间出现 FOIT/FOUT 闪烁。
- **修复**（`exportHtml.ts`）：
  1. 新增 `collectFontFamilies` 递归收集所有节点用到的字体与字重
  2. 改用 Google Fonts **CSS1 API** (`/css`) 支持字重指定，收集字重生成 `family=Name:wght@400;600;700` 链接
  3. 使用国内镜像 `fonts.loli.net` 替代 `fonts.googleapis.com`
  4. 添加 `<link rel="preconnect">` 预连接优化加载
  5. `nodeToHtml` 中对 `styleText` 做 HTML 转义（`"` → `&quot;`）

### 5.8 导出 HTML 画布高度过短（这一轮修复）
- **根因**：`calcMaxBottom` 仅使用节点显式 `height`/`minHeight` 计算底部，文本类节点无显式高度时返回 0。
- **修复**（`exportHtml.ts`）：
  - 新增 `estimateNodeHeight` 函数估算文本节点高度（基于 `fontSize`/`lineHeight`/文本长度/最大宽度）
  - `rootMinHeight` 取 `calcMaxBottom`、`canvas` 存储高度、`600px` 三者最大值

### 5.9 导出 HTML 再导回混乱、组件缩小错位（这一轮修复）
- **根因 1**：`buildElement` 对 PF 导出元素强制覆盖宽度为 `effectiveW + 'px'`，导致与子元素 flex 布局冲突。
- **根因 2**：`populateChildren` 在 flex row/column/flow 路径下二次覆盖宽度。
- **修复**（`importHtml.ts`）：
  - `buildElement` 对 PF 导出元素保留原始宽度
  - `populateChildren` 的 flex 路径跳过 PF 导出元素的宽度覆盖

### 5.10 图标导出为文字（这一轮修复）
- **根因**：`exportHtml.ts` 的 `icon` 分支直接把 `node.props.icon` 当文本输出，未用 SVG 渲染。
- **修复**：
  - 新建 `src/utils/iconPaths.ts` 提供图标路径数据（Star/Heart/Home/Check/ChevronRight/ArrowRight 等）
  - `exportHtml.ts` 调用 `renderIconToHtml(name, color, size)` 生成内联 `<svg>` 标签

### 5.11 点击卡片没隐藏目标元素（这一轮修复）
- **根因 1**：导出端没有给节点输出 `id` 属性，运行时 `document.getElementById(targetId)` 找不到元素。
- **根因 2**：`onClick` 仅支持 `navigate`/`submit-form`，未实现 `hide`/`show`/`toggle`/`scroll-to`。
- **修复**（`exportHtml.ts` + `interactionRuntime.ts`）：
  - `nodeToHtml` 所有节点分支统一加 `id="${node.id}"`
  - 运行时根据 `data-pf-onclick` 属性分派 `hide`/`show`/`toggle`/`scroll-to` 动作

### 5.12 链接重复包裹（这一轮修复）
- **根因**：导出时 `nodeToHtml` 已用 `<a>` 包裹内容，运行时 `wrapLinks` 又扫描 `[data-pf-link]` 重新包裹一次，导致 `<a><a></a></a>`。
- **修复**：运行时检测到元素已包含 `<a>` 子元素就跳过。

### 5.13 动画结束后元素位置错乱（这一轮修复）
- **根因**：动画用 `transform: translate/scale` 实现，结束后 `transform` 未清除，叠加到 `position:absolute` 元素上导致位置偏移。
- **修复**：新增 `clearTransformAfterAnim` 函数，在 `animationend` 事件中执行 `el.style.transform = 'none'`。

---

## 6. 交互功能（2026-07-02 本轮新增）

PageForge 现在支持零代码配置交互效果，导出 HTML 自带 vanilla JS 运行时。

### 6.1 数据模型扩展（`src/types/index.ts`）

```ts
interface InteractionConfig {
  /** 链接：把元素变成 <a> 标签 */
  link?: { href: string; target?: '_self' | '_blank' }
  /** 点击动作 */
  onClick?: {
    action: 'none' | 'navigate' | 'scroll-to' | 'toggle' | 'show' | 'hide' | 'submit-form'
    url?: string          // navigate 动作使用
    targetId?: string     // scroll-to/toggle/show/hide 目标节点 id
    newTab?: boolean      // navigate 是否新标签页
  }
  /** 悬停效果 */
  onHover?: {
    effect: 'none' | 'scale' | 'lift' | 'glow' | 'darken'
    duration?: number     // ms
  }
  /** 入场动画 */
  animation?: {
    type: 'none' | 'fade-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'bounce'
    delay?: number        // ms
    trigger: 'load' | 'hover'
  }
}
```

### 6.2 导出运行时（`src/utils/interactionRuntime.ts`）

- 生成零依赖 vanilla JS（约 100 行），嵌入导出的 HTML 末尾
- 负责：
  1. 入场动画：页面加载时按 `data-pf-animate` 属性添加对应 class
  2. 悬停效果：`mouseenter`/`mouseleave` 时切换 inline transform/filter
  3. 点击动作：根据 `data-pf-onclick` 分派动作
  4. 动画结束后清理 transform（避免错位）

### 6.3 编辑器内预览模式（2026-07-02 本轮新增）

让用户在不导出的情况下预览所有交互效果。

- **状态**（`src/store/editorStore.ts`）：
  - `previewMode: boolean` — 是否处于预览模式
  - `previewDisplayOverrides: Record<string, string>` — 预览期间临时 display 状态（不入历史栈）
  - Actions: `togglePreviewMode` / `setPreviewMode` / `setPreviewDisplay` / `clearPreviewDisplay`

- **入口**（`src/components/Toolbar.tsx`）：新增"预览"按钮（IconEye），开启时高亮显示"退出预览"

- **实现**（`src/components/CanvasElement.tsx`）：
  1. 预览模式禁用：拖拽、选中、编辑、resize、格式刷全部失效
  2. `transform` 强制 `none`（清空 dnd-kit 残留）
  3. `outline: none` 隐藏选中虚线框
  4. 隐藏交互标记徽章（🔗/🖱️）
  5. 光标根据是否有链接/点击动作切换为 `pointer`
  6. 点击触发 `onClick` 动作（`hide`/`show`/`toggle`/`scroll-to`/`navigate`/`submit-form`）
  7. 退出预览时清空所有临时 `display` 状态、选中、格式刷

- **动画支持**（`src/index.css`）：注入 `@keyframes pf-fade-in`/`pf-slide-up` 等动画 + `.pf-animate-*` 类，编辑器与导出 HTML 共享同一组 keyframes

### 6.4 元素 ID 查看入口

- **图层树**（`src/components/LayerTree.tsx`）：每个图层条目末尾追加 `…{id.slice(-4)}`
- **Inspector 顶部**（`src/components/Inspector.tsx`）：显示完整 ID 并提供复制按钮
- **targetId 输入**：从文本框改为下拉选择器，列出全部节点（含嵌套深度、容器标记、ID 后 4 位）

---

## 7. 当前已知问题 / 待办

### 🔴 高优先级（核心功能缺口）

1. **响应式导出（layoutRules）**：当前导出绝对定位 HTML，移动端体验差。`layoutRules.ts` 只有占位代码。
2. **组件库扩充**：缺少轮播/Carousel、弹窗/Modal、标签页/Tabs、折叠面板/Accordion 等。

### 🟡 中优先级

3. **HTML 导入 CSS 选择器覆盖不全**：不支持 `:not()`、`:nth-child()`、媒体查询
4. **CSS 变量解析**：`var(--bs-primary)` 等只做了收集，未做变量替换
5. **撤销栈粒度**：拖拽过程中产生大量历史项，应用 ref 缓冲松手一次性提交

### 🟢 低优先级

6. **多选编组/解组**未实现
7. **键盘快捷键**：Ctrl+A 全选、方向键移动未实现
8. **图层重命名**
9. **缩略图导出 / 复制 HTML 到剪贴板**

---

## 8. 关键技术决策

### 8.1 坐标系统（重要！）
- 所有节点存储**画布空间**坐标（`x`/`y`），不受 `zoom` 影响
- 屏幕空间 ↔ 画布空间：除以/乘以 `zoom`
- `dragOriginRef` 存储**绝对画布坐标**（含父级偏移），确保所有拖拽计算在同一坐标系
- `nodeToCss` 排除所有定位属性（`x`/`y`/`position`/`left`/`top`/`right`/`bottom`），定位由 `CanvasElement` 的 `left`/`top` 单独设置

### 8.2 拖拽架构
- `DndContext` + `pointerWithin` 碰撞检测
- 库拖拽：`centerLibraryOnCursor` modifier 把预览居中到光标
- 画布拖拽：`applySnap` modifier 同步吸附偏移
- `onDragMove` 实时计算吸附参考线（`snapping.ts`）
- `DragOverlay` 通过 `renderPreviewTree` 递归渲染预览

### 8.3 HTML 导入策略
- 不做完整 CSS 引擎（成本太高）
- 只处理 inline style + 简单选择器
- 降级策略：复杂选择器按最后一段应用

### 8.4 交互运行时策略
- 导出 HTML 完全自包含（vanilla JS，无 jQuery / 无 React）
- 通过 `data-pf-*` 属性传递配置
- 入场动画/悬停/点击三类交互统一由 `interactionRuntime.ts` 注入的脚本处理
- 编辑器与导出 HTML 共享同一组 `@keyframes` 与 `.pf-animate-*` 类名（`index.css`），确保预览所见即所得

### 8.5 字体加载策略
- 收集所有节点用到的 `font-family` 与 `font-weight`
- 走 Google Fonts **CSS1 API**（`/css`）支持多字重，避免"伪粗体"
- 国内镜像 `fonts.loli.net` + `preconnect` 加速
- `display=swap` 保留以避免 FOIT，但字重已对齐所以不会出现"艺术字体"回退

---

## 9. 重要文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| [src/App.tsx](file:///d:/My%20Projects/PageForge/src/App.tsx) | ~540 | 拖拽上下文、onDragStart/Move/End、modifier、吸附计算 |
| [src/utils/importHtml.ts](file:///d:/My%20Projects/PageForge/src/utils/importHtml.ts) | ~1611 | HTML 解析核心，CSS 选择器处理、特判逻辑 |
| [src/utils/exportHtml.ts](file:///d:/My%20Projects/PageForge/src/utils/exportHtml.ts) | ~600+ | 节点 → HTML 导出，字体收集、SVG 图标、交互属性 |
| [src/utils/interactionRuntime.ts](file:///d:/My%20Projects/PageForge/src/utils/interactionRuntime.ts) | ~100+ | 零依赖 vanilla JS 运行时（动画/悬停/点击） |
| [src/utils/iconPaths.ts](file:///d:/My%20Projects/PageForge/src/utils/iconPaths.ts) | - | 图标 SVG 路径数据 |
| [src/components/Canvas.tsx](file:///d:/My%20Projects/PageForge/src/components/Canvas.tsx) | ~330 | 画布渲染、缩放、动态高度修正 |
| [src/components/CanvasElement.tsx](file:///d:/My%20Projects/PageForge/src/components/CanvasElement.tsx) | ~500+ | 节点渲染 + resize + 拖拽 + 选中框 + 预览交互 |
| [src/components/NodeRenderer.tsx](file:///d:/My%20Projects/PageForge/src/components/NodeRenderer.tsx) | ~380 | nodeToCss、renderNodeContent、renderPreviewTree |
| [src/components/Inspector.tsx](file:///d:/My%20Projects/PageForge/src/components/Inspector.tsx) | ~1200+ | 属性面板 + 交互配置 + ID 复制 |
| [src/components/Toolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/Toolbar.tsx) | - | 工具栏（含预览按钮） |
| [src/components/LayerTree.tsx](file:///d:/My%20Projects/PageForge/src/components/LayerTree.tsx) | - | 图层树（含 ID 后 4 位） |
| [src/store/editorStore.ts](file:///d:/My%20Projects/PageForge/src/store/editorStore.ts) | ~600+ | 状态管理（新增预览模式状态） |
| [src/types/index.ts](file:///d:/My%20Projects/PageForge/src/types/index.ts) | ~154 | 类型定义（含 InteractionConfig） |
| [src/index.css](file:///d:/My%20Projects/PageForge/src/index.css) | - | 全局样式 + pf-animate-* keyframes |

---

## 10. 开发环境与启动

```bash
cd "d:\My Projects\PageForge"
npm install
npm run dev    # 启动 Vite，默认 http://localhost:5173
```

调试脚本：
```bash
npx tsx scripts/debug-import.ts
```

---

## 11. 接下来的工作建议

1. **响应式导出（layoutRules）** —— 最高优：移动端断点、节点 layoutHint 推断、绝对定位转 flex
2. **组件库扩充**：轮播/Carousel、弹窗/Modal、标签页/Tabs、折叠面板/Accordion
3. **样式系统深化**：CSS 变量、全局主题切换、颜色调色板
4. **体验优化**：撤销栈粒度优化、编组/解组、快捷键补全
5. **交互扩展**：在 `onClick` 中支持 `confirm` 对话框、`navigate-back`、`state` 切换（条件显示）；新增 `onLoad` 触发时序编排

---

**文档结束。** 建议在新对话开头告诉 AI "读取 `d:\My Projects\PageForge\PROJECT_STATUS.md` 了解项目状态"。
