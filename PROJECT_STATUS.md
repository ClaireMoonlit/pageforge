# PageForge 项目状态交接文档

> 用途：在新对话中快速恢复项目上下文。
> 最后更新：2026-07-03
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
├── imported-templates/             # 模板源文件（HTML + CSS，非运行时）
│   ├── README.md
│   ├── ready-*.html               # 处理后的模板 HTML
│   ├── sb-*.html                  # 原始 Bootstrap 模板
│   └── *.min.css                  # 模板 CSS
├── scripts/                        # 测试脚本
│   └── test-export.ts             # 导出功能自动化测试
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
│   │   ├── Toolbar.tsx            # 顶部工具栏（预览 + AlignToolbar）
│   │   ├── ComponentPanel.tsx     # 左：组件库 / 模板
│   │   ├── TemplatePanel.tsx      # 模板导入面板
│   │   ├── Canvas.tsx             # 中：自由画布（含 Ruler 标尺）
│   │   ├── CanvasElement.tsx      # 画布节点渲染 + resize 手柄 + 预览模式交互
│   │   ├── NodeRenderer.tsx       # 节点 → React 元素 + nodeToCss + renderPreviewTree
│   │   ├── LayerTree.tsx          # 右上：层级树（末尾展示节点 ID 后 4 位）
│   │   ├── Inspector.tsx          # 右：属性面板（顶部展示完整 ID + 复制按钮）
│   │   ├── AlignToolbar.tsx       # 多选对齐工具栏（左/中/右/上/中/下对齐 + 分布）
│   │   ├── AlignInfoOverlay.tsx   # 多选对齐信息浮层
│   │   ├── Ruler.tsx              # 画布标尺（水平/垂直，拖拽创建辅助线）
│   │   ├── Icon.tsx               # 智能图标（SVG/emoji 自适应，AutoIcon）
│   │   └── Icons.tsx              # 内联 SVG 图标库（含 IconEye）
│   └── utils/
│       ├── importHtml.ts          # HTML 解析（~1611 行，核心难点）
│       ├── exportHtml.ts          # 节点 → HTML 导出（含响应式 CSS + 字体收集 + 交互）
│       ├── interactionRuntime.ts  # 导出 HTML 末尾的零依赖 vanilla JS 运行时
│       ├── iconPaths.ts           # 图标 SVG 路径数据
│       ├── layoutRules.ts         # 规则推断引擎（Y 轴重叠分行、响应式布局推断）
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

## 5. 最近修复的问题

### 5.1 拖拽预览与松手位置不一致（整个画布）
- **根因**：`nodeToCss()` 只排除了 `x`/`y`/`position`，未排除 `left`/`top`/`right`/`bottom`。导入节点的 `node.style` 中残留这些 CSS 定位值，在 `CanvasElement` 中被显式 `left`/`top` 覆盖所以正确，但在 DragOverlay 预览中直接展开导致偏移。
- **修复**：`NodeRenderer.tsx:11-21` — `nodeToCss` 增加排除 `left`/`top`/`right`/`bottom`

### 5.2 容器内子元素二次拖拽吸附到左上角
- **根因**：`dragOriginRef` 存储的是子元素**相对容器**的坐标，但 `onDragEnd` 容器分支把它当作**绝对画布坐标**使用，减去容器绝对位置后 `Math.max(0, ...)` 钳制为 0。
- **修复**（三处联动）：
  1. `App.tsx:196-211` — `onDragStart` 中 `dragOriginRef` 存入绝对画布坐标（`n.style.x + parentOffset.x`）
  2. `App.tsx:344-352` — `onDragMove` 移除多余的 `parentOffset` 加法
  3. `App.tsx:284-298` — `onDragEnd` 从容器拖出时不再加 `parentOffset`

### 5.3 容器乱吸附
- **根因**：`closestCenter` 碰撞检测在吸附线对齐容器附近时误判。
- **修复**：切换为 `pointerWithin`，只有光标真正在容器内才触发拖入。

### 5.4 导出 HTML 字体/字间距与画布不一致
- **修复**：`exportHtml.ts` — body 添加 `font-family`、`-webkit-font-smoothing`、`line-height`、`color`

### 5.5 导出 HTML 重新导入布局全乱
- **修复**：
  - `exportHtml.ts` — 移除冗余包裹 div，使用 `data-pf-type` 标记类型
  - `importHtml.ts` — 识别 `pf-root` 剥离外层包装器；从 `style.left`/`style.top` 提取坐标转为画布 `x`/`y`；用 `delete` 移除 `left`/`top` 而非设为 `'auto'`

### 5.6 组件缩放尺寸突变
- **根因**：`getBoundingClientRect()` 返回屏幕空间尺寸，与后续除以 `zoom` 的移动计算坐标系不一致。
- **修复**：`CanvasElement.tsx` — 将 `rect.width`/`rect.height` 除以 `zoom` 转为画布空间

### 5.7 导出 HTML 字体丢失
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

### 5.8 导出 HTML 画布高度过短
- **根因**：`calcMaxBottom` 仅使用节点显式 `height`/`minHeight` 计算底部，文本类节点无显式高度时返回 0。
- **修复**（`exportHtml.ts`）：
  - 新增 `estimateNodeHeight` 函数估算文本节点高度（基于 `fontSize`/`lineHeight`/文本长度/最大宽度）
  - `rootMinHeight` 取 `calcMaxBottom`、`canvas` 存储高度、`600px` 三者最大值

### 5.9 导出 HTML 再导回混乱、组件缩小错位
- **根因 1**：`buildElement` 对 PF 导出元素强制覆盖宽度为 `effectiveW + 'px'`，导致与子元素 flex 布局冲突。
- **根因 2**：`populateChildren` 在 flex row/column/flow 路径下二次覆盖宽度。
- **修复**（`importHtml.ts`）：
  - `buildElement` 对 PF 导出元素保留原始宽度
  - `populateChildren` 的 flex 路径跳过 PF 导出元素的宽度覆盖

### 5.10 图标导出为文字
- **根因**：`exportHtml.ts` 的 `icon` 分支直接把 `node.props.icon` 当文本输出，未用 SVG 渲染。
- **修复**：
  - 新建 `src/utils/iconPaths.ts` 提供图标路径数据
  - `exportHtml.ts` 调用 `renderIconToHtml(name, color, size)` 生成内联 `<svg>` 标签

### 5.11 点击卡片没隐藏目标元素
- **根因 1**：导出端没有给节点输出 `id` 属性，运行时 `document.getElementById(targetId)` 找不到元素。
- **根因 2**：`onClick` 仅支持 `navigate`/`submit-form`，未实现 `hide`/`show`/`toggle`/`scroll-to`。
- **修复**（`exportHtml.ts` + `interactionRuntime.ts`）：
  - `nodeToHtml` 所有节点分支统一加 `id="${node.id}"`
  - 运行时根据 `data-pf-onclick` 属性分派 `hide`/`show`/`toggle`/`scroll-to` 动作

### 5.12 链接重复包裹
- **根因**：导出时 `nodeToHtml` 已用 `<a>` 包裹内容，运行时 `wrapLinks` 又扫描 `[data-pf-link]` 重新包裹一次，导致 `<a><a></a></a>`。
- **修复**：运行时检测到元素已包含 `<a>` 子元素就跳过。

### 5.13 动画结束后元素位置错乱
- **根因**：动画用 `transform: translate/scale` 实现，结束后 `transform` 未清除，叠加到 `position:absolute` 元素上导致位置偏移。
- **修复**：新增 `clearTransformAfterAnim` 函数，在 `animationend` 事件中执行 `el.style.transform = 'none'`。

### 5.14 输入框预览双层边框、属性面板 UI 优化（2026-07-02）
- **输入框双层边框**：`NodeRenderer.tsx` 中输入框内层 div 残留 `border`/`padding` 等样式，与导出不一致。
  - **修复**：移除 NodeRenderer 中输入框内层 div 的 border、padding 等样式。
- **画布顶端空缺**：`Canvas.tsx` 的 `margin-top` 默认值导致画布与页面顶部有空隙。
  - **修复**：调整 Canvas 组件 `margin-top` 为 `24px`。
- **属性面板风格统一**：
  - 去除不必要的 emoji 装饰
  - 数值可调项统一：单位定死为下拉框选（如 `px`/`%`/`em`），数值用户可输入或下拉框选
  - 删除重复的 `A+A-` 字号增减按钮（保留原生 `<input type="number">` 上下三角）
  - 边框设置从手动输入改为下拉框选（预设 `none`/`1px solid #000`/`1px solid #d1d5db` 等 + 自定义）
  - 链接/点击等面板改为直接展开（去除三角收起/展开）
  - URL 输入框 placeholder 颜色调浅（`#c4c4c4`），与已填写值区分
  - 元素 ID 显示优化（图层树显示后 4 位，Inspector 顶部显示完整 ID + 复制按钮）
  - 画布宽高标签去除 `(px)` 后缀避免与已写死的单位重复
  - 边框选"自定义"时不再自动跳到 `1px solid #9ca3af`

### 5.15 响应式导出功能实现（2026-07-03 新增）
- **背景**：导出 HTML 全为绝对定位，移动端体验差。需要桌面保持绝对定位、平板自适应、手机全宽堆叠。
- **实现**（`exportHtml.ts`）：
  1. 新增 `groupRows()` 函数：将顶层节点按 Y 轴重叠关系（容差 20px）分组为"行"，同一行元素在平板端保持并排
  2. 新增 `responsiveCSS()` 函数：生成三层断点 CSS
     - **桌面（>1024px）**：保持绝对定位原样
     - **平板（769-1024px）**：保持行内并排但允许换行，全宽自适应
     - **手机（≤768px）**：`position: relative` 覆盖为垂直堆叠，全宽显示，各组件类型特化处理（navbar 竖排、grid 单列、form 全宽等）
  3. `buildHtml()` 集成 `groupRows` + `responsiveCSS`，导出 HTML 自带响应式适配
- **辅助工具**（`layoutRules.ts`）：`inferLayout()` 规则推断引擎，按 Y 轴重叠分行、X 轴排序，提供 `getLayoutHint()` 供 UI 展示推断结果
- **测试脚本**（`scripts/test-export.ts`）：命令行自动化测试，11 项检查（DOCTYPE、响应式断点、各组件类型、Google Fonts 等），运行 `npx tsx scripts/test-export.ts`

---

### 5.16 库拖拽"到处飞"（上下左右偏移，预览与落点不一致）（2026-07-01 ~ 2026-07-03）

**现象**：从组件库拖拽组件到画布，松手后落点位置相对预览位置偏移（上下左右都有），且拖拽预览样式与落点样式明显不同。

**第一性原理分析**：dnd-kit v6.3.1 的 `DragOverlay` 内部定位机制为：
```
最终位置 = PositionedOverlay（pos:fixed, top:initialRect.top, left:initialRect.left）
          + CSS transform: translate3d(modifierX, modifierY, 0)
```
其中 `initialRect` = **冻结的** `activeNodeRect`（库项在 DOM 中的实际位置，如 `left:8, top:88`）。modifier 返回的是**相对 initialRect 的 delta**，不是绝对屏幕位置。

**根因 1 — modifier 返回绝对位置而非 delta（上下偏移 88px）**：
- 旧 modifier 返回 `(cursor - halfW, cursor - halfH)` 当作绝对屏幕位置
- dnd-kit 将此值叠加到 `initialRect.top`（88px）上 → 最终位置额外偏移 88px（库项距顶距离）
- **修复**：改为 `(cursor - halfW - baseLeft, cursor - halfH - baseTop)`，返回正确的 delta

**根因 2 — 落点用 overlay 中心，节点按左上角定位（上下左右偏移）**：
- modifier 把 overlay **中心** 贴到光标 → 用户看到组件居中于光标
- `onDragEnd` 用 `r.left + r.width/2`（= overlay 中心 = 光标）作为落点
- 但节点按 **左上角** 定位（`style.x` / `style.y`）→ 落点相对预览向右下偏移半个尺寸
- **修复**：改用 `r.left` / `r.top`（overlay 左上角）计算落点，与节点左上角定位一致

**根因 3 — `snapOffset` 在重置后被读取（吸附偏移永远为零）**：
- `onDragEnd` 中先执行 `snapOffsetRef.current = {x:0, y:0}` 重置，再 `const snapOff = snapOffsetRef.current`
- 导致吸附偏移永不生效，snap 视觉反馈存在但落点缺失
- **修复**：`const snapOff = { ...snapOffsetRef.current }` 移到重置之前

**根因 4 — 预览样式与落点不一致**：
- 预览 div 有 `position: absolute; left:0; top:0` + `boxShadow`
- DragOverlay wrapper 尺寸固定为库项尺寸（191x40），实际组件尺寸更大（如标题 32px 字号 ~ 300x50）
- 预览的视觉权重和溢出行为与落点节点不同
- **修复**：去掉 `position: absolute` 和 `boxShadow`，让 DragOverlay 自然包裹内容，预览 = 落点

**涉及文件**：`src/App.tsx`（onDragEnd 落点计算、centerLibraryOnCursor modifier、DragOverlay 预览样式）

---

### 5.17 SaaS 模板布局问题：按钮不居中 + 6 个卡片过高留白（2026-07-05）

**现象**：
1. Hero 区"开始免费使用 →"按钮明显偏左（中心 X=563 vs 画布中心 600，diff=-37px）
2. 底部 CTA 区"立即免费开始"按钮也偏左（centerX=775 vs 父容器中心 800，diff=-25px）
3. 6 个小卡片（3 张特性卡 + 3 张定价卡）高度过高，内容只占顶部 30-50%，下面 100-160px 大量空白

**根因**：
- 按钮 x 坐标基于 `width=240` 几何居中计算，但 button style 没有显式 `width`，渲染时按 inline-flex + 内容收缩为 ~200px，导致几何中心偏移
- 卡片高度硬编码 220/260px，但实际内容（标题 + 1-2 段描述）只需 120-145px，剩下一半是空白

**修复**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- Hero 按钮：`x: 460` → `x: 500`，并显式 `width: '200px'`，让按钮中心对齐 1200 画布中心 600
- CTA 按钮：`x: 400` → `x: 480`，让按钮在 1040 宽容器内居中（(1040-240)/2 + 容器 x=80 = 480）
- 特性卡片高度：`220px` → `160px`，padding `28px` → `24px`，内容自然填满
- 定价卡片高度：`260px` → `200px`，padding `32px` → `28px`，内容自然填满
- 后续元素 y 坐标相应调整：定价区标题 `y: 980` → `900`，定价卡片 `y: 1100` → `1020`，CTA 容器 `y: 1420` → `1280`（高度 200 → 180）
- 画布总高度：`1680px` → `1500px`

**验证**（100% 缩放，evaluate 测量）：
- Hero 按钮 centerX=600，画布中心=600，**diff=0 完全居中** ✓
- 特性卡片 h=160px（之前 220px）✓
- 定价卡片 h=200px（之前 260px）✓
- 画布高度 1500px（之前 1680px）✓

---

---

## 6. 交互功能

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

### 6.3 编辑器内预览模式

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

- **图层树**（`src/components/LayerTree.tsx`）：每个图层条目末尾追加 `...{id.slice(-4)}`
- **Inspector 顶部**（`src/components/Inspector.tsx`）：显示完整 ID 并提供复制按钮
- **targetId 输入**：从文本框改为下拉选择器，列出全部节点（含嵌套深度、容器标记、ID 后 4 位）

---

## 7. 当前已知问题 / 待办

### 🔴 高优先级（核心功能缺口）

1. **组件库扩充**：缺少轮播/Carousel、弹窗/Modal、标签页/Tabs、折叠面板/Accordion 等。

### 🟡 中优先级

2. **HTML 导入 CSS 选择器覆盖不全**：不支持 `:not()`、`:nth-child()`、媒体查询
3. **CSS 变量解析**：`var(--bs-primary)` 等只做了收集，未做变量替换
4. **撤销栈粒度**：拖拽过程中产生大量历史项，应用 ref 缓冲松手一次性提交

### 🟢 低优先级

5. **多选编组/解组**未实现
6. **键盘快捷键**：Ctrl+A 全选、方向键移动未实现
7. **图层重命名**
8. **缩略图导出 / 复制 HTML 到剪贴板**

### ✅ 已完成（本次迭代）

- ~~响应式导出~~：`groupRows` 分行 + 三层断点 CSS（桌面/平板/手机）已在 `exportHtml.ts` 实现，见 5.15
- ~~库拖拽"到处飞"~~：四根因 Bug（modifier delta 错误、落点中心/左上角不一致、snapOff 重置后读取、预览样式差异）已修复，见 5.16

---

## 8. 关键技术决策

### 8.1 坐标系统（重要！）
- 所有节点存储**画布空间**坐标（`x`/`y`），不受 `zoom` 影响
- 屏幕空间 ↔ 画布空间：除以/乘以 `zoom`
- `dragOriginRef` 存储**绝对画布坐标**（含父级偏移），确保所有拖拽计算在同一坐标系
- `nodeToCss` 排除所有定位属性（`x`/`y`/`position`/`left`/`top`/`right`/`bottom`），定位由 `CanvasElement` 的 `left`/`top` 单独设置

### 8.2 拖拽架构（重要！）
- `DndContext` + `pointerWithin` 碰撞检测
- **dnd-kit DragOverlay 定位机制**（v6.3.1）：
  - `PositionedOverlay` 是 `position: fixed` 元素，`top/left` 设为 **冻结的** `initialRect`（库项在 DOM 中的位置，首次测量后不变）
  - modifier 的返回值是**相对 initialRect 的 delta**，叠加到 CSS `translate3d()` 上，而非绝对屏幕位置
  - 这是"往上飞 88px"的根因：旧 modifier 返回绝对位置，被 dnd-kit 叠加到 `initialRect.top`（库项距顶 88px）上
- **库拖拽**：`centerLibraryOnCursor` modifier 返回 `(cursor - halfW - baseLeft, cursor - halfH - baseTop)` 作为 delta，DragOverlay 左上角对齐到 `(cursor - halfW, cursor - halfH)`
- **画布拖拽**：`applySnap` modifier 同步吸附偏移
- **落点计算**：`onDragEnd` 用 `r.left` / `r.top`（overlay 左上角，与节点左上角定位一致），除以 `zoom` 转画布坐标
- **吸附偏移**：`snapOffsetRef` 必须在重置前保存，否则吸附永不生效
- `onDragMove` 实时计算吸附参考线（`snapping.ts`）
- `DragOverlay` 通过 `renderPreviewTree` 递归渲染预览（预览 div 无 `position: absolute` 和 `boxShadow`，确保与落点视觉一致）

### 8.3 HTML 导入策略
- 不做完整 CSS 引擎（成本太高）
- 只处理 inline style + 简单选择器
- 降级策略：复杂选择器按最后一段应用
- **`@media` 规则处理**：导出 HTML 中的响应式媒体查询（`@media(max-width:768px)` 等）在导入时被跳过，不应用到画布。画布是固定宽度（1200px）设计面，移动端断点规则（如 `width:100%!important`）会污染桌面端布局。

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

### 8.6 响应式导出策略
- **不改变编辑器内核**：编辑器内部仍使用绝对定位自由画布，保持所见即所得
- **导出时转换**：`groupRows()` 按 Y 轴重叠（容差 20px）将顶层节点分行，`responsiveCSS()` 注入媒体查询
- **三层断点**：桌面保持绝对定位、平板允许换行、手机 `position:relative` 强制垂直堆叠
- **组件特化**：手机端 navbar 改竖排、grid 改单列、form 全宽、容器内子元素也递归堆叠
- 不使用 CSS Grid/Flexbox 重构整个布局（成本高且易出错），而是通过 `!important` 覆盖定位属性达到响应式效果

---

## 9. 重要文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| [src/App.tsx](file:///d:/My%20Projects/PageForge/src/App.tsx) | ~540 | 拖拽上下文、onDragStart/Move/End、modifier、吸附计算 |
| [src/utils/importHtml.ts](file:///d:/My%20Projects/PageForge/src/utils/importHtml.ts) | ~1611 | HTML 解析核心，CSS 选择器处理、特判逻辑 |
| [src/utils/exportHtml.ts](file:///d:/My%20Projects/PageForge/src/utils/exportHtml.ts) | ~432 | 节点 → HTML 导出：groupRows 分行、responsiveCSS 三层断点、字体收集、SVG 图标、交互属性 |
| [src/utils/interactionRuntime.ts](file:///d:/My%20Projects/PageForge/src/utils/interactionRuntime.ts) | ~100+ | 零依赖 vanilla JS 运行时（动画/悬停/点击） |
| [src/utils/iconPaths.ts](file:///d:/My%20Projects/PageForge/src/utils/iconPaths.ts) | - | 图标 SVG 路径数据 |
| [src/utils/layoutRules.ts](file:///d:/My%20Projects/PageForge/src/utils/layoutRules.ts) | ~130 | 规则推断引擎：inferLayout Y 轴重叠分行、getLayoutHint 布局提示 |
| [src/components/Canvas.tsx](file:///d:/My%20Projects/PageForge/src/components/Canvas.tsx) | ~330 | 画布渲染、缩放、动态高度修正（含 Ruler） |
| [src/components/CanvasElement.tsx](file:///d:/My%20Projects/PageForge/src/components/CanvasElement.tsx) | ~500+ | 节点渲染 + resize + 拖拽 + 选中框 + 预览交互 |
| [src/components/NodeRenderer.tsx](file:///d:/My%20Projects/PageForge/src/components/NodeRenderer.tsx) | ~380 | nodeToCss、renderNodeContent、renderPreviewTree |
| [src/components/Inspector.tsx](file:///d:/My%20Projects/PageForge/src/components/Inspector.tsx) | ~1200+ | 属性面板 + 交互配置 + ID 复制 |
| [src/components/Toolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/Toolbar.tsx) | - | 工具栏（含预览按钮 + AlignToolbar） |
| [src/components/AlignToolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/AlignToolbar.tsx) | - | 多选对齐工具栏（左/中/右/上/中/下对齐 + 分布） |
| [src/components/Ruler.tsx](file:///d:/My%20Projects/PageForge/src/components/Ruler.tsx) | - | 画布标尺（水平/垂直，拖拽创建辅助线） |
| [src/components/Icon.tsx](file:///d:/My%20Projects/PageForge/src/components/Icon.tsx) | - | 智能图标（SVG/emoji 自适应，AutoIcon） |
| [src/components/LayerTree.tsx](file:///d:/My%20Projects/PageForge/src/components/LayerTree.tsx) | - | 图层树（含 ID 后 4 位） |
| [src/store/editorStore.ts](file:///d:/My%20Projects/PageForge/src/store/editorStore.ts) | ~600+ | 状态管理（新增预览模式状态） |
| [src/types/index.ts](file:///d:/My%20Projects/PageForge/src/types/index.ts) | ~154 | 类型定义（含 InteractionConfig） |
| [src/index.css](file:///d:/My%20Projects/PageForge/src/index.css) | - | 全局样式 + pf-animate-* keyframes |
| [scripts/test-export.ts](file:///d:/My%20Projects/PageForge/scripts/test-export.ts) | ~170 | 命令行导出测试脚本，11 项自动化检查 |

---

## 10. 开发环境与启动

```bash
cd "d:\My Projects\PageForge"
npm install
npm run dev    # 启动 Vite，默认 http://localhost:5173
```

调试脚本：
```bash
npx tsx scripts/test-export.ts   # 导出功能自动化测试（11 项检查）
```

---

## 11. 接下来的工作建议

1. **组件库扩充**：轮播/Carousel、弹窗/Modal、标签页/Tabs、折叠面板/Accordion
2. **样式系统深化**：CSS 变量、全局主题切换、颜色调色板
3. **体验优化**：撤销栈粒度优化、编组/解组、快捷键补全
4. **交互扩展**：在 `onClick` 中支持 `confirm` 对话框、`navigate-back`、`state` 切换（条件显示）；新增 `onLoad` 触发时序编排
5. **测试与部署**：完善自动化测试覆盖、GitHub Pages 持续部署

---

**文档结束。** 建议在新对话开头告诉 AI "读取 `d:\My Projects\PageForge\PROJECT_STATUS.md` 了解项目状态"。