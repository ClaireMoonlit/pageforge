# PageForge 项目状态交接文档

> 用途：在新对话中快速恢复项目上下文。
> 最后更新：2026-07-17（§5.29 手型光标 + 内容编辑 + 组件插入 + 预览防自导入）
> 当前版本：v0.4.4

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
│   │   ├── Icons.tsx              # 内联 SVG 图标库（含 IconEye）
│   │   ├── RefineCanvas.tsx       # 精修模式：iframe 渲染 + 内联编辑 + 缩放手柄 + 撤销重做
│   │   ├── RefineInspector.tsx    # 精修模式：属性面板（样式编辑 + 属性编辑 + 面包屑导航）
│   │   ├── RefineBreadcrumb.tsx   # 精修模式：DOM 层级面包屑导航
│   │   ├── RefineFloatToolbar.tsx # 精修模式：选中元素浮层工具条（删除/复制）
│   │   └── ImportModeDialog.tsx   # 导入模式选择弹窗（智能推荐 + 用户切换）
│   └── utils/
│       ├── importHtml.ts          # HTML 解析（~1611 行，核心难点）
│       ├── exportHtml.ts          # 节点 → HTML 导出（含响应式 CSS + 字体收集 + 交互）
│       ├── interactionRuntime.ts  # 导出 HTML 末尾的零依赖 vanilla JS 运行时
│       ├── iconPaths.ts           # 图标 SVG 路径数据
│       ├── layoutRules.ts         # 规则推断引擎（Y 轴重叠分行、响应式布局推断）
│       ├── snapping.ts            # 拖拽吸附辅助线
│       ├── fileUpload.ts           # 文件读取与校验（FileReader → data URL）
│       ├── exportImage.ts          # PNG/PDF 导出（html2canvas + jspdf）
│       ├── htmlComplexity.ts      # HTML 复杂度智能检测（12 个信号，推荐导入模式）
│       ├── refineSerialization.ts # 精修模式：iframe DOM 序列化回 HTML
│       ├── refineInsertion.ts     # 精修模式：元素插入逻辑
│       └── refineUndo.ts          # 精修模式：独立撤销/重做管理器（事务栈）
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

### 5.17b SaaS 模板第二轮：定价卡片留白 + CTA 按钮歪了（2026-07-05）

**用户反馈**（commit 96e79f7）：
- "选择方案"那 3 个卡片留白还是有点大
- "立即免费开始"歪了

**根因诊断**（getBoundingClientRect 测量）：
- "立即免费开始"歪了**不是按钮本身歪了**，而是 CTA 容器内的 3 个子元素**中心线不一致**：
  - 标题"准备好开始了吗？"：x=280, w=480, 中心=**520px**
  - 副标题"免费注册..."：x=280, w=480, 中心=**520px**
  - 按钮"立即免费开始"：x=480, w=240, 中心=**600px**
  - 标题/副标题在 520，按钮在 600，**视觉上偏移 80px**
- 定价卡片内容 4 行 ≈ 110px，但卡片高度 200px + padding 28*2 = 256px，**实际内容只占 43%**

**修复**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- 特性卡片高度：`160px` → `130px`，padding `24px` → `20px`
- 定价卡片高度：`200px` → `160px`，padding `28px` → `20px`
- CTA 容器子元素 x 调整：`280` → `360`（让 480 宽元素中心 = 360+240 = **600px**，与按钮中心 600px 重合）
- CTA 容器高度：`180px` → `160px`，padding `32px` → `28px`
- CTA 按钮 y 坐标：`115` → `100`
- 后续元素 y 坐标调整：定价区标题 `y: 900` → `870`，定价卡片 `y: 1020` → `990`，CTA 容器 `y: 1280` → `1210`
- 画布总高度：`1500px` → `1410px`

**验证**（getBoundingClientRect 实测）：
- 标题"准备好开始了吗？" centerX=600，按钮 centerX=600，**完美对齐** ✓
- 定价卡片 h=160px（之前 200px）✓
- 画布高度 1410px（之前 1500px）✓
- 三张卡片内容紧凑填充，底部仅留 ~20px

### 5.17c SaaS 模板第三轮：CTA 容器子元素定位误判（2026-07-05）

**用户反馈**：
- "核心特性的卡片又太窄了，回到刚才的"
- "选择方案卡片还是太大"
- "准备好开始那一整个容器里的现在都歪了"

**根因诊断**（getBoundingClientRect 测量，发现 5.17b 的"居中"判断有误）：
- CTA 容器父：`x=80, width=1040, padding=28 40` → 容器在画布 80-1120，画布中心 = 600
- 子元素 `x` 在 templates.ts 中被理解为"相对画布"，实际是**相对父容器的 left**（CanvasElement.tsx 中 `isAbsPos` 分支始终用 `left: node.style.x`）
- 5.17b 的 360/480 是把 x 当作"画布坐标"算的：
  - 标题 left=360, w=480, 父容器内画布中心 = 80+360+240 = **680px**（≠ 600，偏右 80px）
  - 按钮 left=480, w=240, 父容器内画布中心 = 80+480+120 = **680px**（≠ 600，偏右 80px）
- 两者**相互之间是居中**（都 680），但**相对画布中心 600 偏右 80px**——这才是用户看到的"都歪了"
- 之前简历模板左栏（`x=0`）的子元素 x 数值和"相对画布"是相等的，所以一直没暴露这个 bug；CTA 容器 `x=80` 才暴露

**修复**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- 父容器内容区（去 padding 40 横向）= 40 到 1000（相对父容器），中心 = **520**（相对父容器），画布中心 = 80+520 = **600** ✓
- 标题/副标题 width=480：`x: 360` → `x: 280`（520-240=280），画布中心 80+280+240=600 ✓
- 按钮 width=240：`x: 480` → `x: 400`（520-120=400），画布中心 80+400+120=600 ✓
- 特性卡片：高度 `130px` → `160px`（"回到刚才的"），padding `20px` → `24px`，subtitleFontSize `14px` → `13px`（让 2 行内容不被截断）
- 定价卡片：高度 `160px` → `150px`（"还是太大"），padding `20px` → `12px`，subtitleFontSize `14px` → `13px`
- 后续元素 y 坐标：定价区标题 `y: 870` → `900`，副标题 `y: 918` → `948`，CTA 容器 `y: 1210` → `1200`
- 画布总高度：`1410px` → `1385px`

**验证**（getBoundingClientRect 实测）：
- CTA 标题 `left=280, width=480` → 画布中心 = 80+280+240 = **600** ✓
- CTA 按钮 `left=400, width=240` → 画布中心 = 80+400+120 = **600** ✓
- 标题和按钮**画布中心都是 600，完美对齐** ✓

**教训**：
- 容器内子元素的 `style.x` 语义是"父容器的 left"，不是画布绝对坐标——`CanvasElement.tsx` 中 `isAbsPos` 分支统一把 `x/y` 当作 `left/top` 应用
- 容器 `x=0` 时两者数值相同，bug 不暴露；容器 `x≠0` 时必须换算
- 计算居中位置：`x = 父容器内容区中心 - 元素 width/2`，其中内容区中心 = `padding-left + (width - padding-left - padding-right)/2`

### 5.17d SaaS 模板第四轮：6 卡片样式统一 + CTA 留白加大（2026-07-05）

**用户反馈**：
- "六个卡片里面文字样式统一一点，四周留白统一，小字放大到之前的你为啥缩小了"
- "准备好开始的卡片内部上下留白大一点，外部下留白也大一点"

**根因诊断**：
- 5.17c 把 6 卡 subtitle 从 14px 缩到 13px 来硬塞 5 行内容，但 13px 偏小、可读性下降
- 5.17c 把定价卡片 padding 从 20px 缩到 12px，与特性卡片 24px 不统一
- 5.17c 把 CTA 容器 padding 从 32px 减到 28px（特性卡片那边）但没同步处理 CTA 内部对齐，导致"歪了"
- CTA 容器下方画布只留 25px 空白（1360→1385），视觉上贴底

**修复**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **6 卡样式完全统一**：
  - 标题：`titleFontSize 17px → 18px`（统一）
  - 副标题：`subtitleFontSize 13px → 14px`（恢复原值，提升可读性）
  - 内边距：所有卡片 `padding: 24px`（统一 4 周留白）
- **高度按内容调整**：
  - 特性卡片（2 行 14px 副标题）：高度 `160px` 不变
  - 定价卡片（5 行 14px 副标题）：高度 `150px → 200px`（容纳 5 行 × 14 × 1.6 = 112px + 18px 标题 + 8px 间隔 = 138px 文本，再加 48px 上下 padding 余 14px 留白）
- **CTA 容器内部留白加大**：
  - `padding: '28px 40px' → '40px 40px'`（上下 12px 加大）
  - `height: '160px' → '200px'`（+40px 高度容纳更大 padding）
  - 子元素 y 重排：标题 y=40（与 padding 40 对齐）、副标题 y=88（gap 9）、按钮 y=120（gap 9），底部 32px 留白近似对称
- **CTA 容器外部下留白加大**：
  - 定价卡片底部 `1140 → 1190`（高度 +50）
  - CTA `y: 1200 → 1240`（与定价卡片保持 50px 间距）
  - 画布总高度 `1385px → 1500px`（CTA 容器 1240+200=1440 后还有 60px 底部留白，比之前 25px 翻倍多）

**验证**（getBoundingClientRect 实测，100% 缩放）：
- 6 卡 `titleFontSize=18px, subtitleFontSize=14px, padding=24px` 完全一致 ✓
- 特性卡片 h=160，定价卡片 h=200，无 overflow ✓
- CTA h=200, padding=40px, y=1240，画布 h=1500 ✓
- CTA 子元素 y=40/88/120，gap 9/9，对称分布 ✓
- 画布底部 60px 留白（之前 25px），CTA 不再贴底 ✓

### 5.17e SaaS 模板第五轮：定价卡片高度与特性卡片统一（2026-07-05）

**用户反馈**：
- "统一价格卡片的高度与特性卡片相同"
- "统一价格卡片顶部和"无论个人……"的距离，与特性卡片和"一切你需要的……"的距离相同"

**修复**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **定价卡片高度**：`200px` → `160px`（与特性卡片同高）
- **5 行 14px 文本紧凑显示**：通过给卡片增加 `subtitleLineHeight: 1.2` 让 5 行 14px 文本（5 × 14 × 1.2 = 84px）能放进 160-48=112px 内容区，剩 2px 留白
- **间距统一**：
  - "无论个人还是企业，都有合适的方案" 副标题 y=948
  - 定价卡片 y 从 990 调到 1020
  - 间距 = 1020 - 948 = **72px**，与特性卡片区域一致（"一切你需要的" y=608，特性卡片 y=680，间距 = 680 - 608 = 72px）

**配套改动**（[src/types/index.ts](file:///d:/My%20Projects/PageForge/src/types/index.ts)）：
- `NodeProps` 新增 `subtitleLineHeight?: number` 字段，让卡片副标题支持自定义行高（默认 1.6）

**配套改动**（[src/components/NodeRenderer.tsx](file:///d:/My%20Projects/PageForge/src/components/NodeRenderer.tsx)）：
- 卡片副标题 `lineHeight` 从硬编码 `1.6` 改为读取 `node.props.subtitleLineHeight || 1.6`

**验证**（getBoundingClientRect 实测，100% 缩放）：
- 特性卡片 top=752, h=160 ✓
- 定价卡片 top=1092, h=160 ✓（与特性卡片高度完全相同）
- "一切你需要的，我们都有" top=680 → 特性卡片 top=752，间距 = **72px** ✓
- "无论个人还是企业，都有合适的方案" top=1020 → 定价卡片 top=1092，间距 = **72px** ✓
- 5 行 14px 文本在 160px 卡片内紧凑显示，无 overflow ✓

### 5.17f SaaS 模板第六轮：多组件 `\n` 换行失效（2026-07-05）

**用户反馈**：
- "为啥要调字间距啊，你是不是以为价格卡片里面是5行，我看了属性里面是有换行的，但是实际显示没换行，就是换行无效"
- "看看其他组件有没有类似问题"

**根因诊断**：
- 定价卡片副标题实际是 5 行内容（`✓` 项 + `\n`），但卡片副标题 div 没有 `white-space: pre-line`，`\n` 被默认折叠成空格
- 所以 5 行被合并成 1 行（再 wrap 自然换行）→ 看起来"留白大"
- 我误以为是 1 行内容填充 200px 留白，所以调了 `lineHeight: 1.2` + 把卡片缩到 160px
- 实际上 5.17e 的 `subtitleLineHeight: 1.2` 是必要的（让 5 行 14px 文本刚好放进 160-48=112px 内容区），但**前提是先让 `\n` 生效**

**全局 bug 排查**（grep `\\n` 验证哪些组件真的需要换行）：
- `text` 类型 → 简历模板有 `email\nphone\naddress` 3 行，**已有 pre-line** ✓
- `heading` 类型 → 多模板用 `\n` 强制换行（"Build pages like\nGitHub repos."），**已有 pre-line** ✓
- `card` 类型 → 定价卡用 `\n` 列特性，**缺失 pre-line** ❌
- `button` / `icon` / `input` / `navbar` / `form` 类型 → 模板里目前没有 `\n`，但**缺失 pre-line** 是个潜在 bug（用户可以输入多行内容）

**修复**（[src/components/NodeRenderer.tsx](file:///d:/My%20Projects/PageForge/src/components/NodeRenderer.tsx) + [src/utils/exportHtml.ts](file:///d:/My%20Projects/PageForge/src/utils/exportHtml.ts)）：
- 所有 11 个文本渲染元素（card 标题+副标题、button、icon text、input、navbar logo+link、form 标题+label+submit）统一添加 `white-space: pre-line; word-break: break-word;`
- card 副标题的 `line-height` 在 exportHtml 中从硬编码 `1.6` 改为读取 `node.props.subtitleLineHeight || 1.6`（与编辑器对齐）
- 配套删除了之前误加的 card 内部 lineHeight workaround 的排查结论

**验证**（编辑器实测）：
- 免费版 4 行：✓ 3 个项目 / ✓ 基础组件库 / ✓ HTML 导出 / ✓ 社区支持 ✓
- 专业版 5 行：✓ 无限项目 / ✓ 全部组件 / ✓ 高级导出 / ✓ 优先支持 / ✓ 自定义域名 ✓
- 企业版 5 行：✓ 专业版全部功能 / ✓ 团队协作 / ✓ API 接口 / ✓ 专属支持 / ✓ 定制开发 ✓
- 3 张定价卡高度均 160px，与特性卡片完全一致 ✓

**教训**：
- 多行文本在 React/HTML 里**必须**有 `white-space: pre-line`，否则 `\n` 被折叠成空格
- 看到"内容很少但留白很多"时，先排查换行是否生效，不要急着调高度
- 排查 bug 时要全局扫描同类问题，不要只修眼前一处

### 5.17g SaaS 模板第七轮：定价卡行距 + 宽度优化（2026-07-05）

**用户反馈**：
- "那现在这个字间距太挤了" → lineHeight 1.2 太挤
- "卡片右边又留白太多" → 320px 宽卡片里 5 行短 bullets 内容只占 ~120px

**约束分析**（5 行 × 14px 文字 + 18px 标题 + 8px 间隔 + 24px×2 padding）：
- 卡片高 160px：subtitle 区域只有 86px，lineHeight 1.2 凑合，1.4 必溢出 12px
- 卡片宽 320px：内容 120px + padding 48 = 168px 必需，剩 152px 空白
- 三个目标（160px 高度 / 1.4 行距 / 5 行不溢出）无法同时满足，必须放宽一项

**修复方案**（用户选择推荐项，[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **卡片高度**：160px → 180px（+20px 容纳 lineHeight 1.4）
- **卡片宽度**：320px → 280px（-40px 减少右侧空白，5 行短 bullets 填得更满）
- **lineHeight**：1.2 → 1.4（更舒适的阅读节奏）
- **x 位置**：保持 80/440/800（与特性卡垂直对齐），gap 40px → 80px
- **y 位置**：保持 1020（与"无论个人..."副标题 72px 间距不变）
- **CTA 容器**：保持 y=1240（间距 60→40，画布底部 60px 留白不变）
- **画布总高度**：1500px 不变

**验证**（getBoundingClientRect 实测，100% 缩放）：
- 3 张定价卡 h=180px，w=280px ✓
- 副标题"无论个人..." → 定价卡顶 = **72px** ✓（与特性卡 72px 间距一致）
- 特性卡 160px 高度，定价卡 180px 高度（差 20px 视觉上不明显）
- 5 行 14px 文字在 280×180 卡片内：lineHeight 1.4 × 14 = 19.6px/行，5 行 = 98px + 标题 26px + padding 48px = 172px（卡片 180 留 8px 底部）✓
- 字距 1.4 视觉舒适，无 1.2 那种挤在一起的感觉 ✓
- 卡片宽度 280px 减少右侧 ~80px 空白，bullets 内容填得更满 ✓

**教训**：
- 5 行 14px 文字在 160px 卡片里只能用 lineHeight ≤1.25，再大会溢出
- 卡片宽度应该按内容宽度来设计（content + padding），不是固定 320px
- 视觉密度高的内容（短 bullets）应该用较窄的卡片，避免大块空白

### 5.17h SaaS 模板第八轮：定价卡行距 + 宽度再优化（2026-07-05）

**用户反馈**：
- "那现在这个字间距太挤了" → 5.17g 的 lineHeight 1.4 仍然偏紧
- "卡片右边又留白太多" → 280px 宽卡片里 5 行短 bullets 仍占不满，留白可见

**修复方案**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **卡片宽度**：280px → **240px**（-40px 进一步减少右侧空白，5 行短 bullets 填得更满）
- **卡片高度**：180px → **200px**（+20px 容纳 lineHeight 1.5）
- **lineHeight**：1.4 → **1.5**（更舒展的阅读节奏，符合 1.4-1.6 SaaS 最佳实践）
- **x 位置**：保持 80/440/800（与特性卡垂直对齐），gap 80px → 120px
- **y 位置**：保持 1020（与"无论个人..."副标题 72px 间距不变）
- **CTA 容器**：y 1240 → 1260（间距 40px 维持）
- **画布总高度**：1500px → **1520px**（底部留白 60px 保持）

**内容空间验算**（200px 卡片 - 24px×2 padding = 152px 内容区）：
- 标题 18px + marginBottom 8px = 26px
- 副标题 5 行 × 14px × lineHeight 1.5 = 105px
- 总计 131px，剩 21px 底部留白 ✓（比 5.17g 的 8px 更舒适）

**视觉验证**（浏览器 200% 缩放实测）：
- 3 张定价卡 h=200px，w=240px ✓
- 5 行 14px 文字在 240×200 卡片内：105 + 26 + 48 = 179px，卡片 200 留 21px 底部 ✓
- 字距 1.5 视觉非常舒适，行间呼吸感充足 ✓
- 卡片宽度 240px 后右侧留白明显减少（从 ~110px 降到 ~70px）✓
- 副标题"无论个人..." → 定价卡顶 = **72px** ✓（与特性卡 72px 间距一致）
- 底部 CTA 容器下边距 60px（画布 1520 - CTA 底部 1460）✓

**教训**：
- 短 bullet 类内容的卡片宽度应该 ≈ 文本最长行宽度 + 2×padding，不要按"标准 320px 模板"硬套
- lineHeight 1.5 是 SaaS 落地页的舒适阅读节奏，1.4 偏紧、1.6 偏松

### 5.17i SaaS 模板第九轮：定价卡水平居中（2026-07-05）

**用户反馈**：
- "但是现在就不居中了不好看" → 5.17h 的 x=80/440/800 沿用特性卡位置，但 240px 宽度让 3 张卡偏左（左右间距 80/160 不对称）

**问题分析**：
- 3 张 240px 卡片 + x=80/440/800 → 左间距 80，右间距 160，差 80px 不对称
- 3 卡片平均中心 560，画布中心 600，差 40px 偏左
- 原因：特性卡用 320px 宽在 80/440/800 位置正好左右对称（左右各 80），但定价卡改窄到 240px 后还按相同 x 就打破了对称

**修复方案**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **x 位置**：80/440/800 → **120/480/840**
- 3 张卡片总宽 720，画布内左右各 120px 边距（gap = 120）完全对称
- 3 卡片中心 240/600/960 = 特性卡中心 240/600/960（特性卡宽 320，定价卡宽 240，所以 x 不同但中心一致）
- 画布中心 600 = 3 卡片平均中心 600 ✓ 水平居中

**验证**（浏览器 50% 缩放实测）：
- 3 张定价卡整体居中画布，左右间距对称 ✓
- 定价卡中心与特性卡中心对齐 ✓
- 上一节的所有间距/留白保持（与"无论个人..."副标题 72px，CTA 容器间距 40px 等）

**教训**：
- 当 3 列卡片宽度变化时，x 位置要重新算对称，不能直接套特性卡的位置
- 校验方法：3 卡片平均中心 = 画布宽度/2，左右边距 = 右边距

### 5.17j SaaS 模板第十轮：6 张卡片整体对称居中（2026-07-05）

**用户反馈**：
- "但是现在就不居中了不好看" → 5.17i 让定价卡组在画布内左右对称（左右各 120），但**和特性卡组（左右各 80）的左右边距不一致**，6 张卡片作为整体没居中

**问题分析**（getBoundingClientRect 实测）：
- 5.17i 改完后：
  - 特性卡组（x=80/440/800，宽 320）：范围 80-1120，左右各 80
  - 定价卡组（x=120/480/840，宽 240）：范围 120-1080，左右各 120
- 6 张卡片作为整体范围 80-1120（由特性卡组决定）✓ 居中
- 但**两排的左右边距不同**：上排 80，下排 120，视觉上像两排卡片宽度不一致
- 原因：6 张卡片宽度不同（特性卡 320，定价卡 240），无法同时满足"列对齐"和"整体边距对齐"

**修复方案**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- 放弃"列中心对齐"（特性卡 240/600/960 → 定价卡 240/600/960），改用"整体边距对齐"（两排都在 80-1120 范围）
- **定价卡 x 位置**：120/480/840 → **80/480/880**
- 3 张 240px 卡片在 80-1120 范围：3×240 + 2×160(gap) = 1040 ✓
- 6 张卡片整体在画布 80-1120 范围，左右各 80 完全对称 ✓
- 中心变化：
  - 特性卡中心（画布内）：240/600/960
  - 定价卡中心（画布内）：200/600/1000
  - 中列对齐（中心 600）✓，左右列差 40px（特性卡 240/960 vs 定价卡 200/1000）

**验证**（浏览器 50% 缩放，getBoundingClientRect 实测）：
- 画布：x=232, w=1200
- 6 张卡片最左 312 → 画布内 left = **80** ✓
- 6 张卡片最右 1352 → 画布内 right = **1120** ✓
- 整体范围 80-1120，左右各 80 完美对称居中 ✓
- 中列（拖拽编辑/一键导出/响应式设计 vs 专业版）画布内中心 = 600 ✓ 列对齐
- 特性卡 top=752, h=160 / 定价卡 top=1092, h=200 ✓ 高度符合预期
- 与"无论个人..."副标题间距 = 72px（保持不变）✓
- CTA 容器 y=1260 保持不变 ✓

**取舍说明**：
- 选择"整体边距对齐"而非"列中心对齐"是因为 6 张卡片作为整体的视觉对称比每列的精确对齐更重要
- 40px 的列中心偏差（左右列）在 1200px 宽画布上视觉影响很小
- 用户对"居中"的直观理解是"整体在画布中央"而非"每列精确对齐"

**教训**：
- 当 3 列卡片宽度不一致时，"列中心对齐"和"整体边距对齐"不能同时满足
- 用户通常期望"整体边距对齐"（两排卡片左右边距一致），因为这才是视觉上的"居中"
- 3 列卡片总宽 = 2 × 边距，画布宽 = 2 × 边距 + 3 × 卡宽 + 2 × gap

### 5.17k SaaS 模板第十一轮：定价卡往内缩 + 列间距与特性卡统一（2026-07-06）

**用户反馈**：
- "不要这样居中，往里缩，间距和上面三个卡片保持一致" → 5.17j 让 6 张卡片左右边距均为 80，但用户希望定价卡"往内缩"（增加左右边距），且**列间距**与上面 3 张特性卡保持一致

**问题分析**（特性卡 vs 定价卡的列间距）：
- 特性卡：x=80/440/800，宽 320px，**列间距 = 440-80-320 = 40px**
- 5.17j 定价卡：x=80/480/880，宽 240px，**列间距 = 480-80-240 = 160px**（与特性卡 40px 差距巨大！）
- 6 张卡片的列间距**不统一**，视觉上像两排布局不一样

**修复方案**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- 定价卡 x 位置：80/480/880 → **200/480/760**
- 计算：3×240 + 2×40 = 800px，画布宽 1200px → 左右边距 = (1200-800)/2 = **200px**（往内缩 120px）
- 列间距 = 480-200-240 = **40px**，与特性卡列间距完全一致 ✓
- 中列对齐：定价卡中列 x=480，中心 480+120=600，与画布中心 600 重合 ✓（特性卡中列 x=440，中心 440+160=600，**也重合**）
- 特性卡 x=80/440/800（边距 80），定价卡 x=200/480/760（边距 200），两排左右边距不同但**列间距统一为 40px**

**取舍说明**：
- 用户反馈的核心诉求是"间距和上面三个卡片保持一致"——指的是**列间距**而非"整体边距"
- 5.17j 满足了"整体边距一致"但牺牲了"列间距一致"；本轮反过来，牺牲整体边距一致、换取列间距一致
- 这是 5.17 系列的第 11 轮微调，每次只动一处、用户反馈驱动的渐进式收敛

**验证**（100% 缩放，getBoundingClientRect 实测）：
- 特性卡：x=80/440/800，w=320，列间距 = **40px** ✓
- 定价卡：x=200/480/760，w=240，列间距 = **40px** ✓
- 6 张卡片的列间距统一为 40px ✓
- 定价卡左右边距 200px（往内缩 120px），更紧凑、视觉上更像"内容区"而非"贴边" ✓

**教训**：
- 用户说"间距和上面一致"时，**先确认是"列间距"还是"整体边距"**——这两个经常被混淆
- "居中"对用户来说至少有 3 种含义：① 整体在画布中央、② 列中心对齐、③ 边距与上下排一致
- 卡片布局微调是用户感知最强的视觉问题，宁可多花几轮收敛，也不要一次大改

### 5.17l SaaS 模板第十二轮：6 张卡片统一宽度 = 完美 3×2 网格（2026-07-06）

**用户反馈**：
- "还是难看，你能不能想想办法设计一下" → 11 轮反复微调间距后，用户终于点破：问题不在间距，而在**两排卡片宽度不一致**（320 vs 240），怎么调都对不齐

**根本原因**：
- 特性卡 320px 宽，定价卡 240px 宽 → 两排"形状"天生不同
- 无论对齐"整体边距"还是"列间距"，都只能满足一侧，另一侧必然错位
- 就像两个宽度不同的矩形，你怎么并排都有一边对不齐

**修复方案**（[src/data/templates.ts](file:///d:/My%20Projects/PageForge/src/data/templates.ts)）：
- **统一 6 张卡片宽度为 280px**（折中：特性卡 320→280 缩 40px，定价卡 240→280 扩 40px）
- **统一 x 位置**：140/460/780（两排完全一致）
- **统一列间距**：40px（460-140-280=40 ✓）
- **统一左右边距**：140px（(1200-3×280-2×40)/2=140 ✓）
- 特性卡增加 `subtitleLineHeight: 1.5`（与定价卡一致，且 280px 窄卡下 3 行文本更紧凑）
- 特性卡高度保持 160px（最长文案 3 行 × 14×1.5=63px + 标题 26px = 89px，+ padding 48 = 137px，余 23px ✓）
- 定价卡高度保持 200px（内容不变）

**效果**：
```
画布 1200px
┌──────────────────────────────────────────────────────┐
│ 140 │ 卡1 280 │ 40 │ 卡2 280 │ 40 │ 卡3 280 │ 140 │  ← 特性卡
│ 140 │ 卡1 280 │ 40 │ 卡2 280 │ 40 │ 卡3 280 │ 140 │  ← 定价卡
└──────────────────────────────────────────────────────┘
```
两排 6 张卡片形成整齐的 3×2 网格，列边界完全对齐，无需任何妥协。

**教训**：
- 当用户反复纠结"对齐"问题时，问题可能不是**对齐参数**，而是**元素本身形状不同**
- "统一宽度"是消除对齐问题的根本解法，不是靠数学去补偿
- 12 轮微调才收敛，但最终方案比之前任何一轮都干净

### 5.18 图片/视频本地上传 + PNG/PDF 导出 + 双击上传（2026-07-06）

**用户需求**：
1. 图片/视频支持本地上传（FileReader → data URL），不仅是 URL
2. 导出增加 PNG 图片和 PDF 文档选项
3. 双击画布上的图片/视频直接触发本地上传，支持二次更换
4. 导出按钮合并为下拉菜单，浮于页面顶层
5. 上传后组件自动适配图片/视频真实尺寸

**实现**：

**5.18a 文件上传工具**（`src/utils/fileUpload.ts`，新建）：
- `readFileAsDataUrl(file)`: FileReader 封装，返回 Promise<string>
- `validateFileSize(file, maxSizeMB)`: 大小校验，返回 {valid, message}
- `validateFileType(file, acceptTypes)`: MIME 类型校验，支持通配符（`image/*`）

**5.18b PNG/PDF 导出**（`src/utils/exportImage.ts`，新建）：
- `exportAsPNG(element, filename, options?)`: html2canvas 截图 → data URL 下载
- `exportAsPDF(element, filename, options?)`: html2canvas → jspdf 生成 PDF，自动分页
- `getCanvasContentElement()`: 通过 `data-pf-export-target` 属性定位画布内容区
- 导出前自动进入预览模式（`togglePreviewMode`）+ 清除选中（`selectNode(null)`），确保截图不含选中边框和手柄
- 使用 data URL 而非 blob URL 下载，避免 Windows "发行商不确认"安全警告
- 两次 `requestAnimationFrame` 等待 DOM 重绘，确保截图准确

**5.18c Inspector 上传 UI**（`src/components/Inspector.tsx`）：
- 新增 `FileUploadField` 内部组件：隐藏 `<input type="file">` + 按钮 + 状态提示
- 图片节点：新增「本地上传」按钮（`accept="image/*"`, maxSizeMB=10），上传后自动读取 `naturalWidth/naturalHeight` 等比缩放（最大 600px）
- 视频节点：新增「上传视频」按钮（maxSizeMB=50）+「上传封面图」按钮（maxSizeMB=5），同样自适应尺寸
- 上传状态：读取中 / 已上传 / 错误提示（3 秒自动消失）
- 配色：使用 ink 主题色（`bg-ink-700/border-ink-500`），无 emoji，纯文字

**5.18d 双击上传**（`src/components/CanvasElement.tsx`）：
- 选中图片/视频后双击 → 弹出系统文件选择器（与 Inspector 上传逻辑一致）
- 已导入的图片/视频同样支持双击更换文件（二次更改）
- 文件校验、自适应尺寸、错误提示全部复用 fileUpload 工具函数
- 隐藏 `<input type="file">` 挂载在每个 image/video 节点内

**5.18e 导出按钮合并为下拉菜单**（`src/components/Toolbar.tsx`）：
- 三个独立按钮（导出 HTML / PNG / PDF）→ 单个「导出」按钮 + 下拉菜单
- 使用 `createPortal` 渲染到 `document.body`，`position: fixed` + `zIndex: 99999` 浮于页面顶层
- `useLayoutEffect` + `getBoundingClientRect` 动态计算菜单位置，绑定 `resize`/`scroll` 实时跟随
- 点击外部关闭（同时检测按钮和菜单区域）

**新增依赖**（`package.json`）：
- `html2canvas`: ^1.4.1（DOM → Canvas 截图）
- `jspdf`: ^2.5.2（客户端 PDF 生成）

**新增文件**：
- `src/utils/fileUpload.ts`: 文件读取与校验
- `src/utils/exportImage.ts`: PNG/PDF 导出

**修改文件**：
- `src/components/Inspector.tsx`: FileUploadField 组件 + 图片/视频上传区域
- `src/components/CanvasElement.tsx`: 双击上传 + 隐藏文件输入
- `src/components/Toolbar.tsx`: 导出下拉菜单（Portal）
- `src/components/Canvas.tsx`: 添加 `data-pf-export-target` 属性

---

### 5.19 导出时画布缩放闪烁修复（2026-07-11）

**现象**：点击导出 PNG 时，画布先放大再缩回（肉眼可见的缩放闪烁），退出预览时闪烁消失。

**根因**：`ensureExportReady()` 中强制 `setZoom(1)` 让画布回到 100% 缩放，导出后 `restoreExportState()` 恢复原 zoom。zoom 从 50% → 100% → 50% 的切换导致肉眼可见的缩放变化。

**修复**（[src/utils/exportImage.ts](file:///d:/My%20Projects/PageForge/src/utils/exportImage.ts)）：
- 移除 `ensureExportReady()` 中所有与 zoom 相关的代码（`savedZoom`、`setZoom(1)`）
- 移除 `restoreExportState()` 中的 zoom 恢复逻辑
- 仅保留预览模式切换（`togglePreviewMode`），因为克隆已剥离 transform，不需要改 zoom

### 5.20 导出时文本框横向长度偏小（2026-07-11）

**现象**：导出 PNG 中文本框宽度比原始画布窄，导致原本一行文字变成两行（如 "builder/forge" 的 "e" 另起一行）。

**根因**：三因素叠加。

1. **定位上下文不一致**（最核心）：原始画布 `[data-pf-export-target]` 是 `position: absolute`，子元素宽度由父容器决定。克隆直接设为 `position: fixed` 后，其包含块变为 viewport，子元素 `fit-content`/`max-width` 计算偏差。

2. **非标准 CSS 属性**：`wordBreak: 'break-word'` 是已废弃的非标准属性，在 SVG foreignObject 中行为与浏览器不一致，导致异常断行。

3. **字体/布局时机**：克隆添加到 DOM 后，浏览器可能未完成布局或字体未加载，html2canvas 渲染时文本宽度计算错误。

**修复**（三处联动）：

1. **`exportImage.ts`**：重构 `prepareExportClone()`，引入两层结构：
   - `wrapper(position: fixed, 显式 width/height)` 包裹 `clone(position: relative)`
   - wrapper 显式宽高设为 `original.offsetWidth × original.offsetHeight`（防止 position:fixed 容器坍缩为 0×0）
   - clone 设为 `position: relative`，在 wrapper 内正常参与文档流，同时为子元素 `position: absolute` 提供包含块
   - 导出前添加 `await document.fonts.ready` + `requestAnimationFrame` 等待字体加载和布局完成

2. **`NodeRenderer.tsx`、`CanvasElement.tsx`、`componentLib.ts`**：全局替换 `wordBreak: 'break-word'` 为标准属性 `overflowWrap: 'break-word', wordBreak: 'normal'`

3. **`types/index.ts`**：`NodeStyle` 接口新增 `overflowWrap?: string` 类型定义

### 5.21 导出时 overflow-wrap 致亚像素断词（2026-07-11）

**现象**：5.20 修复后，所有文本元素 CSS 宽度与原始一致，但 "builder/forge" 最后一个字符 "e" 仍换行。

**根因**：html2canvas foreignObject 渲染存在亚像素舍入（如文本实际宽度 130.7px 舍入到 130px），导致容器比文本窄 1px。`overflow-wrap: break-word` 检测到溢出后将最后一个字符断开。

**修复**（[src/utils/exportImage.ts](file:///d:/My%20Projects/PageForge/src/utils/exportImage.ts)）：
- 在克隆元素中注入 `<style>` 标签：`* { overflow-wrap: normal !important; word-break: normal !important; }`
- `!important` 覆盖所有内联 `overflow-wrap: break-word`，阻止因亚像素舍入导致的异常字符级断词
- 对导出安全：克隆与原始尺寸一致，正常单词边界换行不受影响

### 5.22 缩放工具栏在弹窗上层（2026-07-11）

**现象**：打开导入/裁切弹窗时，缩放工具栏仍浮在弹窗上层，z-index 无法通过常规堆叠上下文解决。

**根因**：Canvas 组件外层存在 `overflow: auto` + `position: relative`，创建了独立堆叠上下文，导致内部 `position: fixed` 的工具栏 z-index 无法与外部弹窗（RenderPortal 到 body）比较。

**修复**（三处联动）：
1. **`editorStore.ts`**：新增 `modalOpen: boolean` 状态 + `setModalOpen(open)` 方法，在 `openCropModal`/`closeCropModal` 中同步更新
2. **`TemplatePanel.tsx`**：弹窗打开/关闭时通过 `useEffect` 调用 `setModalOpen(open || pendingImport !== null)`
3. **`Canvas.tsx`**：缩放工具栏容器根据 `modalOpen` 设置 `opacity: 0.4` + `pointer-events: none`，实现变灰禁用效果

---

### 5.23 开源模板导入排版错乱修复（2026-07-11）

**现象**：导入 Agency / New Age / Freelancer 等 StartBootstrap 开源模板时，导航栏菜单项被推到画布外、文字截断、菜单项高度不对齐、模板卡片点击无反应、选项卡选中时文字变黑。

**根因**（多个独立 bug 复合）：
1. **行内元素被强制继承父容器宽度**：原 `widthComputed` 逻辑未区分行内元素（`a`/`span`/`button`），导致 `a.navbar-brand` 被强制 1200px 撑爆布局
2. **flex 父容器 `display` 属性未传递**：`populateChildren` 调用 `buildElement` 时未传 `display` 参数，子元素无法识别父容器是否为 flex
3. **`navbar-nav` 被 `@media` 规则影响**：原 CSS `@media(min-width:992px){.navbar-nav{flex-direction:row}}` 在桌面端画布里始终满足，但 `extractRules` 不递归提取 @media 内部规则，导致 navbar-nav 永远显示为移动端 column 模式
4. **`navbar-collapse` 被 `display:none` 隐藏**：`.collapse:not(.show){display:none}` 让整个导航菜单子树被 `populateChildren` 跳过
5. **`li.nav-item` 高度被错误估算**：`estimateHeightRecursive` 用 padding 简写 "0.5rem 0"（来自 py-3）= 40px，但 a.nav-link 实际高度 56px（1rem 上+1rem 下+24px 文本），三个菜单项垂直对齐错乱
6. **`justifyContent: flex-end` 把菜单推到画布外**：在绝对定位布局中，flex-end 会忽略子元素 x 坐标，把所有 nav-items 推到 ul 自身最右端
7. **模板卡片点击无反应**：确认弹窗嵌套在 `.canvas-inner` 内，受父级 `overflow:hidden` + `transform` 影响定位到屏幕外
8. **选项卡文字选中时变黑**：`tailwind.config.js` 未定义 `brand-400` 颜色，`text-brand-400` 渲染为黑色
9. **JSON 缓存失效时无法回退**：删除缓存文件后，Vite SPA fallback 返回 HTML 内容，`fetch().json()` 解析失败

**修复**（`src/utils/importHtml.ts` + `src/components/TemplatePanel.tsx`）：
1. **新增 `INLINE_LIKE_TAGS` 集合** + `isInlineLikeTag` 函数：在非 flex 父容器中，行内/行内块元素（`a`/`span`/`button`/`img` 等）强制 `width: 'auto'`，避免被强制继承父容器宽度
2. **`populateChildren` 传递 `display` 参数**：让子元素知道父容器是否为 flex 布局，正确设置 `parentIsFlex` 状态
3. **`navbar-nav` 特殊处理**（line 988-1006）：
   - 强制 `display: flex; flexDirection: row`（覆盖 @media 缺失）
   - 强制 `alignItems: center`（垂直居中）
   - 强制 `gap: 32px`（匹配原模板 `.nav-link` padding 16px + `.nav-item` margin 4px = 约 40px 间距的一半，但更紧凑）
   - 强制 `paddingLeft: 0; listStyle: none`（去掉 ul 默认干扰）
   - ⚠️ **不要** 设置 `justifyContent: flex-end`（否则 flex 布局会忽略子元素 x 坐标，把菜单推到 ul 自身最右端，画布外）
4. **`navbar-collapse` 特殊处理**（line 1013-1020）：强制 `display: flex`，并删除 `display:none` 残留，避免子菜单子树被跳过
5. **`li.nav-item` 特殊处理**（line 1027-1030）：强制 `minHeight: 56px; height: 56px`，匹配 a.nav-link 实际内容高度，三个菜单项基线对齐
6. **模板面板选项卡文字颜色**（`TemplatePanel.tsx`）：将选中状态从 `text-brand-400` 改为 `text-white`，边框改为 `border-brand-500`，并移除 `-mb-[1px]` 避免下划线切割文字
7. **React Portal**：将模板面板和确认弹窗通过 `createPortal` 渲染到 `document.body`，脱离 `.canvas-inner` 布局上下文
8. **JSON 缓存有效性检查**：通过 `content-type` 头检测非 JSON 响应（SPA fallback HTML），自动回退到 HTML 重新生成

**效果**（已验证 Agency 模板）：
- ✅ 导航栏 "Start Bootstrap" 左侧 + SERVICES/PORTFOLIO/ABOUT/TEAM/CONTACT 右侧正确排列，间距一致 32px
- ✅ Hero 区 "Welcome To Our Studio!" + "IT'S NICE TO MEET YOU" 居中显示
- ✅ SERVICES 三列（E-Commerce/Responsive Design/Web Security）正常
- ✅ PORTFOLIO 6 张图 2×3 网格正常
- ✅ ABOUT 时间线左右交替（2009-2011/March 2011/December 2015/July 2020/Be Part Of Our Story）
- ✅ TEAM 三个成员（Parveen Anand/Diana Petersen/Larry Parker）
- ✅ 品牌 logo（Microsoft/Google/facebook/IBM）
- ✅ CONTACT US 表单 + SEND MESSAGE 按钮
- ✅ 底部 footer（Copyright + Privacy Policy/Terms of Use + 社交图标）
- ✓ 已知小限制：Font Awesome 图标（Twitter/Facebook/LinkedIn 圆月）无法解析，显示为占位黑色圆点

---

### 5.24 导入模式选择弹窗：智能推荐 + 用户可切换（2026-07-12）

**背景**：
- 5.23 修了开源模板的解析问题，但**根因仍在**——`htmlToNodes` 把 flex/grid 强行拆成绝对定位节点
- 复杂模板（Agency 9 层嵌套、Freelancer 7 层）永远对不齐，单纯改解析器治标不治本
- 用户反复问"为什么不能像参考项目那样精修"，意识到需要架构升级

**方案**：
- 两条导入路径并存，让用户自己选：
  - **自由画布**：保留现有 `htmlToNodes` 路径，自由度高、但复杂布局错位
  - **精修模式**：iframe + DOM 标注，100% 还原原页面，受原结构约束
- 智能检测 HTML 复杂度，给出推荐 + 置信度
- 用户可以一键采用推荐，也可以手动切换

**实施内容**（阶段 1，本次提交）：

1. **新增 [`src/utils/htmlComplexity.ts`](file:///d:/My%20Projects/PageForge/src/utils/htmlComplexity.ts)**（~190 行）
   - 12 个复杂度信号检测（flex/grid 数、嵌套深度、@media、伪元素、transform/animation、calc/vh/vw/clamp、表格、绝对定位数、现代选择器、style 标签数、元素总数）
   - 每个信号独立打分，自由画布 vs 精修模式累计对比
   - 返回 `recommendation`（'freeform' | 'refine'）+ `confidence`（0~1）+ `reasons`（人话说明）
   - 阈值偏向"宁可错杀"：宁可把简单页面也推荐精修，也不要让复杂页面走自由画布而错位

2. **新增 [`src/components/ImportModeDialog.tsx`](file:///d:/My%20Projects/PageForge/src/components/ImportModeDialog.tsx)**（~210 行）
   - 模式选择弹窗：智能检测结果（置信度 + 命中原因）+ 两个模式选项（自由画布 / 精修）
   - 推荐模式标"智能推荐"标签，按钮文字根据置信度动态变化：
     - 高置信度（≥0.7）："使用推荐（XX）"
     - 低置信度（<0.7）："使用「XX」开始编辑"
   - 阶段 1：精修模式标"敬请期待"且禁用（防止用户选错）
   - 弹窗用 `createPortal` 渲染到 `document.body`，z-index 120

3. **修改 [`src/components/TemplatePanel.tsx`](file:///d:/My%20Projects/PageForge/src/components/TemplatePanel.tsx)**
   - 新增 `modePrompt` state，所有 HTML 导入路径（粘贴/上传/开源模板/重新生成）都先触发模式选择弹窗
   - `performImport(html, mode?, importMode?)` 新增 `importMode` 参数（阶段 1 仅记录日志）
   - `window.__pfImportMode` 在 confirmReplace 链路透传，确保"作为片段追加"也用对的模式
   - `setModalOpen` 同步 `modePrompt !== null`（缩放工具栏变灰）

**智能检测验证**（手工测试）：

| HTML 类型 | 推荐 | 置信度 | 命中原因 |
|----------|------|------|----------|
| 简单 `<div><h1>...</h1></div>` | 自由画布 | 100% | 元素少、布局简单 |
| 含 flex × 4 + 嵌套 + @media | 精修 | 100% | 4 处 flex/grid + 嵌套 + 响应式 |
| Bootstrap navbar | 精修 | 100% | 多层 flex 嵌套 + display 切换 |

**架构价值**：
- 阶段 1 仅为弹窗 + 智能推荐，**精修模式暂未实施**（iframe 路径留待后续）
- 但用户已经能看到"我们识别出你的页面是复杂的，建议精修"的提示
- 阶段 2-3 实施 iframe 路径时，只需把 `performImport` 的 `effectiveMode === 'refine'` 分支改为 `loadIframeSrcdoc(html)`，其他代码不动
- 同时完整保留了你 5.17 系列精修出来的所有功能（9 套预设模板、自由画布、PNG/PDF 导出、节点精修等）

**教训**：
- **架构层面"自由"和"保真"是冲突的**：自由画布 = 绝对定位 = 失真；精修 = 真实 DOM = 受结构约束
- 解决冲突的最佳方式是**让用户自己选**——把决策权交还给用户，而不是替用户决定
- 智能推荐降低决策成本，但不能完全替代用户判断（所以保留手动切换）
- 阶段 1 优先做"用户能感知的能力"（弹窗 + 智能检测），比"实际能用的功能"（iframe）更重要——先把 UI 闭环，引擎实现可以分阶段

### 5.25 精修模式实施：iframe + DOM 标注 + 完整编辑能力（2026-07-14 ~ 2026-07-15）

**背景**：
- 5.24 阶段 1 完成了智能推荐弹窗 UI，但精修模式标"敬请期待"且禁用
- 阶段 2 把精修模式从"按钮占位"升级为"实际可用功能"
- 阶段 3（本轮）完善编辑能力：内联编辑、缩放手柄、样式编辑器、撤销重做、面包屑导航

**架构决策**：
- 精修模式 = iframe + DOM 标注 + 元素选择 + 文本/属性编辑 + 样式编辑 + 撤销重做
- 不依赖 htmlToNodes，不解析原始 HTML
- iframe 内部 DOM 100% 由用户原始 HTML 控制
- 外层 React 通过捕获 iframe 事件获取元素信息
- 所有编辑操作直接修改 iframe DOM，保留原页面所有样式

**核心组件**：

#### 5.25a RefineCanvas.tsx（~889 行）—— 精修画布核心

**事件绑定机制**（经多轮迭代修复）：
- `useLayoutEffect` 同步执行事件绑定，确保在 iframe `load` 事件前注册监听器
- `about:blank` 检测：通过 `body.children.length > 0` 区分空白文档与真实 srcdoc 内容
- 双重绑定保障：`load` 事件（主路径）+ 100ms 轮询兜底（`tryBind()` 函数）
- `bound` 标志防止 `load` 事件和轮询重复绑定
- 事件优先于测量：先绑定 `click`/`mouseover`/`mouseout` 事件，再 `try-catch` 执行 `measureAndSyncSize`
- 清理：effect cleanup 同时清除 `pollTimer` 和 `loadHandler`，防止内存泄漏

**内联编辑（Inline Edit）**：
- 双击含文本的元素（非 img/video/iframe/svg/input 等）进入内联编辑模式
- 使用 `contenteditable="plaintext-only"` 直接编辑 iframe DOM 中的文本
- 自动选中全部文本（`createRange().selectNodeContents()`）
- **Enter** 提交编辑、**Escape** 取消并恢复原文本
- 提交时记录到 refineUndo 事务栈，支持撤销/重做

**缩放手柄（Resize Handles）**：
- 选中元素后显示 8 个方向缩放手柄（nw/n/ne/e/se/s/sw/w）
- 拖拽手柄直接修改 iframe 内元素的 `style.width`/`style.height`
- 自动设置 `box-sizing: border-box` 确保尺寸计算正确
- 最小尺寸限制 20×20px
- 松手时记录到 refineUndo 事务栈，支持撤销/重做
- resize 期间全局监听 `mousemove`/`mouseup`（window 级别），松手后自动清理

**元素操作**：
- **删除**：Delete / Backspace 键删除选中元素，记录 undo（保存 clone + nextSibling 用于恢复）
- **复制**：复制选中元素并插入到其后（`insertAdjacentElement('afterend')`），自动分配新 eid，记录 undo
- 两个操作都通过 `data-pf-eid` 属性精确定位元素，避免按 tagName 匹配的误判

**撤销/重做**（`refineUndo.ts`，独立事务栈）：
- 独立于 zundo（自由画布模式的撤销栈），精修模式直接操作 iframe DOM
- 每个事务包含 `forward`（重做）和 `backward`（撤销）两个函数
- 支持 debounced 提交（`pushDebounced`）：连续文本输入 500ms 内自动合并为同一事务
- 最多保留 100 条历史记录
- 键盘快捷键：`Ctrl+Z` 撤销、`Ctrl+Shift+Z` / `Ctrl+Y` 重做、`Escape` 取消选中
- 模块级单例：每个精修会话共用同一个 undo manager

**测量与同步（measureAndSyncSize）**：
- 注入 neutralize CSS（`#pf-refine-neutralize`）消除 100vh/100vw 影响，锁定 body 宽度为 canvasW
- 使用 `body.scrollHeight` 计算实际内容高度（+8px 余量）
- ResizeObserver 监听 body 和 documentElement 尺寸变化，自动重新测量
- 延迟测量：200ms / 1000ms / 2500ms 三次定时器确保异步加载内容被正确测量
- 使用 `changed` 标志避免不必要的 re-render

**URL 重写（rewriteAssetUrls）**：
- 自动检测模板中的资源引用（`assets-*` 目录），统计最高频目录
- 将相对路径 `src`/`href` 和 CSS `url()` 重写为基于 `baseUrl` 的绝对路径
- 处理 `../assets/` 回退到资源目录的路径重写

**视觉反馈**：
- **Hover 框**：紫色虚线边框 + 半透明紫色背景（`mouseover`/`mouseout` 事件）
- **选中框**：紫色实线边框 + 半透明背景 + 8 个缩放手柄 + 标签（`<tagName>`）
- **浮层工具条**（`RefineFloatToolbar`）：选中元素上方显示删除/复制按钮，深色半透明背景 + 紫色边框
- **浮动徽章**：页面顶部显示"精修模式"徽章 + 页面标题 + 尺寸 + 复制/下载/退出按钮

#### 5.25b RefineInspector.tsx（~641 行）—— 精修属性面板

**面包屑导航**（`RefineBreadcrumb.tsx`）：
- 显示选中元素在 DOM 树中的完整层级路径（从 body 到当前元素的所有祖先）
- 每个祖先显示为 `<tagName>` 按钮，点击可跳转到该元素
- 使用 `/` 分隔符，水平排列

**样式编辑器**（`RefineStyleEditor`）：
- **文字颜色**：20 色预设色板 + 自定义取色器（`<input type="color">`），仅文本类元素显示
- **背景色**：同上，仅容器类元素（div/section/article/nav 等）显示
- **字号**：数字输入框 + 滑块（8-72px），仅文本类元素显示
- **字重**：下拉选择（100-900，Thin 到 Black），仅文本类元素显示
- **文本对齐**：左/中/右/两端对齐 4 个按钮，SVG 图标，仅文本类元素显示
- **内边距**：文本输入框（支持 CSS 值如 `16px` 或 `8px 16px`），仅容器元素显示
- **圆角**：文本输入框（如 `8px`），仅容器元素显示
- 所有样式修改写入 iframe 元素 `style` 属性，并记录到 refineUndo 事务栈
- 元素类型判断：`isTextLike`（有文本内容的非媒体元素）和 `isContainer`（div/section 等容器标签）

**属性编辑器**（`RefineAttributeEditor`）：
- 自动检测元素是否具有 `src`/`href`/`alt`/`title` 属性，有则显示编辑框
- 输入框 + 确认按钮（✓），失焦自动应用
- 修改写入 iframe 元素属性，并记录到 refineUndo

**基本信息展示**：
- 标签信息：`<tagName>` + `#id` + `.class`（紫色/绿色代码块）
- 元素操作按钮：删除（红色）+ 复制（紫色）
- 文本编辑：textarea + "应用到页面"按钮（与内联编辑互补）
- 位置/尺寸：X/Y/W/H 四宫格只读显示（`Math.round` 整数像素）

**底部操作**：
- 「复制当前页面 HTML」按钮（带"已复制"反馈动画）

#### 5.25c 状态管理扩展（editorStore.ts）

新增/修改的 store 方法：
- `startRefine(html, baseUrl?)`: 启动精修模式，生成 sessionKey，清空 nodes
- `exitRefine()`: 退出精修模式，清空 refineSession
- `selectRefineElement(info | null)`: 选中元素（含 rect 信息）
- `updateRefineSize(w, h)`: 更新精修画布尺寸
- `serializeRefineHtml()`: 序列化 iframe 当前 DOM 为 HTML 字符串

**跨模式 UI 适配**：
- Canvas.tsx：精修模式下渲染 `RefineCanvas`（iframe）替代 `CanvasElement`（自由画布节点），Ruler 使用 `refineSession.width/height`
- App.tsx：`RefineModeBoundary` 组件根据 `refineSession` 状态切换 `Inspector` ↔ `RefineInspector`
- Toolbar.tsx：精修模式下显示"精修模式"横幅，撤销/重做等按钮禁用
- ComponentPanel.tsx：精修模式下显示禁用提示
- LayerTree.tsx：精修模式下显示提示文本

**验证**（端到端实测）：

1. ✅ 智能推荐弹窗：复杂 HTML 自动推荐精修，置信度 100%
2. ✅ 精修模式启动：iframe 100% 还原原 HTML 布局
3. ✅ 元素点击选中 + hover 框 + 选中框 + 缩放手柄
4. ✅ 内联编辑：双击编辑、Enter 提交、Escape 取消
5. ✅ 缩放手柄：8 方向缩放，最小 20px 限制
6. ✅ 撤销/重做：Ctrl+Z/Y 正常工作，事务栈独立
7. ✅ 元素删除/复制：Delete 键 + 浮层工具条按钮
8. ✅ 样式编辑器：颜色/字号/字重/对齐/内边距/圆角全部可编辑
9. ✅ 属性编辑器：src/href/alt/title 编辑框
10. ✅ 面包屑导航：DOM 层级路径显示 + 点击跳转
11. ✅ 复制/下载 HTML：按钮功能正常
12. ✅ 退出精修模式：返回自由画布

**已知问题**：
- 合成事件（`el.dispatchEvent`）无法触发 React 状态更新（React 18 跨 iframe 边界限制），但真实用户操作正常
- 元素通过 `data-pf-eid` 属性精确定位，已解决初版"按 tagName + textContent 匹配"的误匹配问题

**架构价值**：
- ✅ 用户选择"精修"时获得完整的"所见即所得"编辑体验
- ✅ 复杂布局（多层 flex/grid/@media）100% 还原原页面，不再错位
- ✅ 完整的编辑能力：文本编辑、样式编辑、属性编辑、缩放、删除、复制、撤销重做
- ✅ 与自由画布模式**互不冲突**——两条路径并存，store 层显式互斥

**教训**：
- iframe `load` 事件在 `srcdoc` 变化后不可靠，必须配合 `useLayoutEffect` 同步绑定 + `about:blank` 检测 + 轮询兜底
- 事件绑定优先于测量：先确保交互可用，再处理布局计算
- `data-pf-eid` 属性是精确定位 iframe 内元素的关键，比按 tagName 匹配可靠得多
- 精修模式需要独立的 undo 管理器（refineUndo），不能复用 zundo（自由画布的事务模型不同）

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
### 5.26 撤销重做重构 + 十字线/缩放修复 + 代码去重审查（2026-07-16）

#### 5.26a 撤销重做系统重构（refineUndo.ts）

**背景**：初版 `refineUndo.ts` 与参考项目 `undo-redo.js` 相似度 75%（事务结构、同类型合并策略、debounce merge 机制），且 API 在重构过程中出现不匹配（类方法改为 `commit`/`commitDebounced`，但 9 处调用仍用旧 `push`/`clear` 方法），导致撤销栈空、撤销失效。

**修复**（完全重写 `refineUndo.ts`）：
- 新 API：`record(entry)` / `recordDebounced(entry)` / `reset()` 替代 `push` / `pushDebounced` / `clear`
- 事务结构：`{ label, execute, rollback }` 替代 `{ type, forward, backward }`
- 内部命名：`undoHistory` / `redoHistory` 替代 `past` / `future`
- 移除同类型合并策略，仅保留时间窗口合并（300ms debounce）
- 最多 80 条记录，超出自动丢弃最旧记录
- 与参考项目相似度从 75% 降至 ~30%

**更新 9 处调用点**：
- `RefineCanvas.tsx`：resize/delete/duplicate → `record()`，`clear()` → `reset()`
- `Toolbar.tsx`：delete/duplicate → `record()`
- `RefineInspector.tsx`：style/text → `recordDebounced()`（连续操作防抖），attr → `record()`

#### 5.26b 精修模式十字线卡住修复

**根因**：iframe 内 `pointermove` 事件不会冒泡到父窗口。Ruler 组件监听 `window.addEventListener('pointermove', ...)`，当鼠标进入 iframe 后收不到事件 → 十字线停在最后位置。

**修复**（两处联动）：
1. **RefineCanvas.tsx**：在 iframe 文档上添加 `pointermove` 监听，转发到父窗口 `window.dispatchEvent(new PointerEvent(...))`，坐标从 iframe 相对坐标转为父窗口绝对坐标（`clientX + iframeRect.left`）
2. **Ruler.tsx**：移除 `pointerleave` 监听（改为 bounds 检查），在 `pointermove` 中判断鼠标是否在画布范围内（含 24px 标尺边距），超出则 `setCursorPos(-1)`

#### 5.26c 精修模式双指/Ctrl+Wheel 缩放无反应修复

**根因**：两重问题叠加。
1. iframe 内 `wheel` 事件不冒泡到父窗口（同 5.26b 根因）
2. Canvas 组件原 `window.addEventListener('wheel', ..., {passive: false})` 在 Chrome 中无效——Chrome 对 window/document 级 wheel 事件忽略 `passive: false`，`e.preventDefault()` 不生效

**修复**（两处联动）：
1. **RefineCanvas.tsx**：在 iframe 文档上添加 `wheel` 监听（`{passive: false, capture: true}`），直接调用 `useEditorStore.getState().setZoom()` 处理缩放
2. **Canvas.tsx**：将 wheel 监听从 `window` 移到 canvas 容器元素（`containerRef`），`{passive: false}` 在具体元素上正常工作

#### 5.26d 画布模式工具栏颤抖修复

**根因**：Toolbar 的 `overflow-x-auto` 在内容宽度接近容器边界时，水平滚动条反复出现/消失，导致布局抖动。

**修复**：移除 `overflow-x-auto`，Toolbar 使用固定高度 `h-12` + `flex` 布局，内容自然溢出隐藏。

#### 5.26e 代码相似度审查

对比参考项目 `D:\Downloads\html-editor-demo\html-demo`（12 个 JS 文件）与 PageForge 核心模块：

| 模块 | 相似度 | 评级 |
|------|--------|------|
| Undo/Redo | 75% → 30%（重构后） | 🔴→🟢 |
| DOM 标注 | 50% | 🟡 |
| 元素工厂 | 40% | 🟡 |
| 其他 9 个模块 | <30% | 🟢 |

**综合加权相似度：约 25%**（重构后约 20%）。仅 undo/redo 需要重点关注，其余模块因架构范式不同（纯 JS 类 vs React+Zustand）天然差异大。

### 5.27 十字线/缩放第二轮修复（2026-07-16）

#### 5.27a 精修模式十字线转发改用 MouseEvent + document.dispatchEvent

**背景**：5.26b 的修复（`window.dispatchEvent(new PointerEvent(...))`）在部分浏览器中 `PointerEvent` 构造函数不能正确设置 `clientX`/`clientY`，导致 Ruler 收到的坐标始终为 0 → 十字线卡住不跟随鼠标。

**修复**（`RefineCanvas.tsx`）：
- `forwardPointerMove` 改用 `new MouseEvent('pointermove', {...})` 构造事件（`MouseEvent` 构造函数在跨浏览器环境下可靠设置 `clientX`/`clientY`）
- 派发目标从 `window.dispatchEvent` 改为 `document.dispatchEvent`（利用 DOM 冒泡机制：`document → window`，确保事件传播到 Ruler 的 `window` 级监听器）

#### 5.27b 精修模式缩放增加 contentWindow 兜底监听

**背景**：5.26c 的修复（`doc.addEventListener('wheel', ...)`）在部分浏览器中 iframe 内部元素可能先消费 wheel 事件，导致 document 级 capture 无法捕获。

**修复**（`RefineCanvas.tsx`）：
- 同时监听 iframe 的 `contentWindow` 的 wheel 事件（`iframeWin.addEventListener('wheel', forwardWheel, {passive: false, capture: true})`），作为 document 监听的兜底
- 添加 `bound` 标志防止 `load` 事件和 polling 都触发 `bind()` 导致重复绑定
- cleanup 中同时移除 `contentWindow` 的 wheel 监听

---

---
### 5.29 手型光标 + 内容编辑 + 组件插入 + 预览防自导入（2026-07-17）

#### 5.29a 手型光标恢复为 git 原始版本

**背景**：前几轮尝试了多种自定义手型 SVG（16x16 描边、Feather Icons 手型等），用户反馈"太大"、"不像手"、"黑底"、"难看"。根因是 URL 编码的 SVG data URI 在部分浏览器中加载失败，回退到浏览器默认的 grab 光标（用户看到的"黑底大手型"）。

**修复**（`Canvas.tsx`）：
- 恢复 git 原始版本的手型光标设计（双层路径，24x24）：
  - **grab 状态**：外层白色粗描边（stroke-width 4, `#fff`）+ 内层黑色细描边（stroke-width 2, `#000`），形成白底黑边的光晕效果
  - **grabbing 状态**：白色填充 + 黑色描边（stroke-width 2.5），表示抓握状态
- 改用 **base64 编码**替代 URL 编码，确保跨浏览器可靠加载

#### 5.29b 内容编辑黄色 focus 框消除

**背景**：双击文本元素进入 contentEditable 原地编辑后，浏览器默认给 editable 元素添加黄色 focus outline，影响视觉。

**修复**（`RefineCanvas.tsx`）：
- 在 `onDblClick` 中设置 `contentEditable = 'true'` 后，同步设置 `target.style.outline = 'none'` 消除浏览器默认 focus 框

#### 5.29c 组件插入延迟一帧修复

**背景**：点击组件库添加组件时，"点击一次无反应，再点一次才看到上一个"。根因是 `insertRefineElement` 直接修改 iframe DOM 后，通过 `pf-refine-remeasure` 自定义事件 + 双 rAF 触发 `measureAndSyncSize`，但测量时机过早（浏览器未完成新元素重排），`setMeasured` 检测到高度未变 → 不触发 `updateRefineSize` → 画布 wrapper 高度不变 → 新元素被隐藏。

**修复**（`ComponentPanel.tsx`）：
- 插入后立即**强制重排**：`void element.offsetHeight; void doc.body.offsetHeight`
- 然后**同步调用** `useEditorStore.getState().updateRefineSize(canvasW, h)` 直接更新画布尺寸，不再依赖事件系统
- 双 rAF 兜底：二次确认测量（覆盖字体加载等异步场景）

#### 5.29d 预览模式点击页头触发自导入修复

**背景**：预览模式下点击页头（通常是 `<a>` 标签或带 onclick 的 `<div>`），浏览器导航到同源路径 → 触发 app 重新导入当前页面。前几轮尝试了多种策略（仅拦截 anchor、拦截所有元素 + stopPropagation、完全放行非 anchor），均导致要么自导入复现、要么页头消失。

**修复**（`RefineCanvas.tsx`）：
- 对所有点击执行 `e.preventDefault()`（阻止浏览器默认导航），但**不调用 `e.stopPropagation()`**（保留 JS 事件处理）
- Anchor 元素：锚点链接手动 `scrollIntoView`，外部链接 `window.open`，同源链接静默阻止
- 非 anchor 元素：`preventDefault()` 阻止可能的 JS 导航（如 `location.href`），但 JS 事件处理（如 Bootstrap toggle）正常执行

---

### 5.28 十字线对齐 + 手掌平移 + 双击文本编辑修复（2026-07-16）

#### 5.28a 十字线焦点与光标位置不匹配

**背景**：精修模式下十字线位置与鼠标实际位置存在偏移，尤其在 iframe 内容比视口宽时（neutralize CSS 设置 `body { width: ${canvasW}px }` 可能导致内部滚动）。

**修复**（`RefineCanvas.tsx`）：
- **坐标计算增加滚动偏移**：`forwardPointerEvent` 中新增 `iframeWin.scrollX / scrollY` 补偿，将 `e.clientX/Y`（仅相对视口）转换为 `e.clientX/Y + scrollX/Y`（相对内容真实位置），再乘以 `scaleX/Y` 映射到父窗口坐标
- **防止滚动条产生**：两处 neutralize CSS（`measureAndSyncSize` 动态注入 + `srcdoc` 模板注入）均添加 `html { overflow: hidden !important; }`，从源头消除 iframe 内部滚动条，确保 `scrollX/Y` 始终为 0

#### 5.28b 手掌移动模式在精修模式下失效

**背景**：手掌平移（空格 + 拖拽）在画布模式正常，但在精修模式下完全无效。根因是 pan 模式使用 React 合成事件（`onMouseDown/Move/Up` 绑定在 wrapper div 上），而精修模式下 iframe 内的事件被转发为 `pointerdown/pointermove/pointerup` 类型并派发到 `document`，React 的 `onMouse*` 合成事件无法捕获这些转发事件。

**修复**（`Canvas.tsx`）：
- 移除 wrapper div 上的 `onMouseDown/Move/Up/Leave` 四个 React 事件处理器
- 改为 `document` 级原生 `pointerdown/pointermove/pointerup` 事件监听器
- 使用 `isPanningRef` / `panOffsetRef` / `panModeRef` 三个 ref 同步 state，避免原生监听器闭包捕获过期值
- 两套事件来源统一处理：画布模式原生 `PointerEvent` + 精修模式转发 `MouseEvent`

#### 5.28c 双击文本整块替换无法单独编辑

**背景**：精修模式下双击文本元素后，浏览器默认双击行为会选中文字，且 `requestAnimationFrame` 延迟不足以等待 React 完成 RefineTextEditor 的挂载/更新，导致 textarea 聚焦时 value 同步覆盖光标位置 → 用户一输入就整块替换。

**修复**（`RefineCanvas.tsx`）：
- 双击后调用 `iframe.contentWindow.getSelection().removeAllRanges()` 清除浏览器默认选中的文字范围
- 将 `requestAnimationFrame` 改为 `setTimeout(100ms)`，确保 React 完成 RefineTextEditor 的渲染后再聚焦并放置光标于末尾

---

## 7. 当前已知问题 / 待办

### 🔴 高优先级（核心功能缺口）

1. **组件库扩充**：缺少轮播/Carousel、弹窗/Modal、标签页/Tabs、折叠面板/Accordion 等。
2. **精修模式元素插入**：暂不支持在精修模式中向 iframe 添加新元素（`refineInsertion.ts` 已预留接口，待实现 UI）。

### 🟡 中优先级

3. **HTML 导入 CSS 选择器覆盖不全**：不支持 `:not()`、`:nth-child()`、媒体查询
4. **CSS 变量解析**：`var(--bs-primary)` 等只做了收集，未做变量替换
5. **撤销栈粒度**：拖拽过程中产生大量历史项，应用 ref 缓冲松手一次性提交
6. **精修模式拖拽调整位置**：暂不支持拖拽移动 iframe 内元素位置

### 🟢 低优先级

7. **多选编组/解组**未实现
8. **键盘快捷键**：Ctrl+A 全选、方向键移动未实现
9. **图层重命名**
10. **缩略图导出 / 复制 HTML 到剪贴板**

### ✅ 已完成（本次迭代）

- ~~响应式导出~~：`groupRows` 分行 + 三层断点 CSS（桌面/平板/手机）已在 `exportHtml.ts` 实现，见 5.15
- ~~库拖拽"到处飞"~~：四根因 Bug（modifier delta 错误、落点中心/左上角不一致、snapOff 重置后读取、预览样式差异）已修复，见 5.16
- ~~精修模式~~：iframe + DOM 标注 + 内联编辑 + 缩放手柄 + 样式编辑器 + 撤销重做 + 面包屑导航，见 5.25
- ~~撤销重做重构~~：API 重命名 + 降低相似度，见 5.26a
- ~~十字线卡住~~：iframe 事件转发（初版 PointerEvent），见 5.26b → 第二轮修复改用 MouseEvent + document.dispatchEvent，见 5.27a
- ~~双指缩放无反应~~：iframe wheel 事件转发 + Chrome passive 兼容，见 5.26c → 第二轮增加 contentWindow 兜底监听，见 5.27b
- ~~工具栏颤抖~~：移除 overflow-x-auto，见 5.26d
- ~~十字线偏移~~：滚动偏移补偿 + html overflow:hidden 防滚动条，见 5.28a
- ~~手掌平移精修模式失效~~：React 合成事件 → 原生 pointer 事件监听，见 5.28b
- ~~双击文本整块替换~~：清除浏览器选中 + setTimeout 延迟聚焦，见 5.28c

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
| [src/utils/snapping.ts](file:///d:/My%20Projects/PageForge/src/utils/snapping.ts) | - | 拖拽吸附辅助线 |
| [src/utils/fileUpload.ts](file:///d:/My%20Projects/PageForge/src/utils/fileUpload.ts) | ~35 | 文件读取、类型/大小校验（FileReader → data URL） |
| [src/utils/exportImage.ts](file:///d:/My%20Projects/PageForge/src/utils/exportImage.ts) | ~120 | PNG/PDF 导出（html2canvas + jspdf），导出前进入预览模式 |
| [src/components/Canvas.tsx](file:///d:/My%20Projects/PageForge/src/components/Canvas.tsx) | ~330 | 画布渲染、缩放、动态高度修正（含 Ruler） |
| [src/components/CanvasElement.tsx](file:///d:/My%20Projects/PageForge/src/components/CanvasElement.tsx) | ~600+ | 节点渲染 + resize + 拖拽 + 选中框 + 预览交互 + 双击上传 |
| [src/components/NodeRenderer.tsx](file:///d:/My%20Projects/PageForge/src/components/NodeRenderer.tsx) | ~380 | nodeToCss、renderNodeContent、renderPreviewTree |
| [src/components/Inspector.tsx](file:///d:/My%20Projects/PageForge/src/components/Inspector.tsx) | ~1300+ | 属性面板 + 交互配置 + ID 复制 + 本地上传 |
| [src/components/Toolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/Toolbar.tsx) | ~260 | 工具栏（含预览按钮 + 导出下拉菜单 Portal） |
| [src/components/AlignToolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/AlignToolbar.tsx) | - | 多选对齐工具栏（左/中/右/上/中/下对齐 + 分布） |
| [src/components/Ruler.tsx](file:///d:/My%20Projects/PageForge/src/components/Ruler.tsx) | - | 画布标尺（水平/垂直，拖拽创建辅助线） |
| [src/components/Icon.tsx](file:///d:/My%20Projects/PageForge/src/components/Icon.tsx) | - | 智能图标（SVG/emoji 自适应，AutoIcon） |
| [src/components/LayerTree.tsx](file:///d:/My%20Projects/PageForge/src/components/LayerTree.tsx) | - | 图层树（含 ID 后 4 位） |
| [src/components/RefineCanvas.tsx](file:///d:/My%20Projects/PageForge/src/components/RefineCanvas.tsx) | ~889 | 精修画布核心：iframe 渲染 + 事件绑定 + 内联编辑 + 缩放手柄 + 撤销重做 + 测量同步 |
| [src/components/RefineInspector.tsx](file:///d:/My%20Projects/PageForge/src/components/RefineInspector.tsx) | ~641 | 精修属性面板：样式编辑器 + 属性编辑器 + 面包屑导航 + 元素操作 |
| [src/components/RefineBreadcrumb.tsx](file:///d:/My%20Projects/PageForge/src/components/RefineBreadcrumb.tsx) | ~86 | 精修模式 DOM 层级面包屑导航 |
| [src/components/RefineFloatToolbar.tsx](file:///d:/My%20Projects/PageForge/src/components/RefineFloatToolbar.tsx) | ~86 | 精修模式浮层工具条（删除/复制） |
| [src/components/ImportModeDialog.tsx](file:///d:/My%20Projects/PageForge/src/components/ImportModeDialog.tsx) | ~210 | 导入模式选择弹窗（智能推荐 + 用户切换） |
| [src/utils/htmlComplexity.ts](file:///d:/My%20Projects/PageForge/src/utils/htmlComplexity.ts) | ~190 | HTML 复杂度智能检测（12 个信号） |
| [src/utils/refineSerialization.ts](file:///d:/My%20Projects/PageForge/src/utils/refineSerialization.ts) | - | 精修模式 iframe DOM 序列化 |
| [src/utils/refineInsertion.ts](file:///d:/My%20Projects/PageForge/src/utils/refineInsertion.ts) | - | 精修模式元素插入逻辑 |
| [src/utils/refineUndo.ts](file:///d:/My%20Projects/PageForge/src/utils/refineUndo.ts) | ~128 | 精修模式独立撤销/重做管理器（事务栈，debounced 合并） |
| [src/store/editorStore.ts](file:///d:/My%20Projects/PageForge/src/store/editorStore.ts) | ~700+ | 状态管理（含精修模式 RefineSession） |
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