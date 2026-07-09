# 🏗️ 造页工坊 PageForge

> 像做 PPT 一样"造"网页 —— 自由画布拖拽 + 智能吸附对齐 + 一键导出响应式 HTML

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev/)

---

## 这是什么

造页工坊是一款**浏览器内的可视化网页搭建工具**。无需写一行代码，像做 PPT 一样在自由画布上拖拽组件，智能吸附对齐，规则推断自动转化为响应式 HTML/CSS，一键导出干净的生产级单文件 HTML，可独立部署、无平台锁定。

### 核心闭环

```
拖拽组件 → 自由摆放 → 智能吸附对齐 → 规则推断转响应式 → 一键导出 HTML
```

---

## 功能

### 画布与编辑
- 🎨 **自由画布**：绝对定位自由摆放，所见即所得，支持 10%~300% 缩放
- 🧲 **智能吸附**：拖拽时自动识别对齐参考线（边缘/中心/等间距），参与等间距的边线贯穿画布，误触发已修复（仅匹配水平/垂直重叠的目标），裁切弹窗支持正方形/正圆/居中/边缘吸附
- 📏 **标尺 + 辅助线**：画布标尺，拖拽创建辅助线，作为吸附参考
- 🔄 **撤销/重做**：完整的历史记录（基于 zundo）

### 组件与模板
- 🧩 **13 个内置组件**：标题、正文、图片、按钮、卡片、容器、分割线、图标、视频、输入框、导航栏、网格、表单
- 🧩 **9 套模板**：一键导入 Start Bootstrap 系列模板，开箱即用（Agency、Freelancer、New Age、Modern Business、Creative、Landing Page、Resume、Grayscale、Clean Blog）
- 🖌️ **格式刷**：一键复制样式到其他元素
- 🌲 **图层树拖拽排序**：图层树中直接拖拽调整元素层级，支持拖入容器内部
- ↕️ **右键层级调整**：画布内选中元素右键菜单支持上移一层 / 下移一层

### 图片处理
- ✂️ **图片裁切**：上传图片后弹出裁切模态框，支持矩形/圆形/圆角矩形三种形状，8 向手柄自由调整，正方形/正圆/居中/边缘智能吸附
- 🔄 **图片变换**：支持旋转（拖拽预览实时同步）、水平/垂直镜像翻转、自由拉伸
- 📤 **本地上传**：支持拖拽上传、双击画布上传、属性面板上传

### 交互与导出
- ⚡ **交互支持**：零代码配置链接、点击（隐藏/显示/切换/滚动到）、悬停、入场动画，导出 HTML 自带零依赖 vanilla JS 运行时
- 🎬 **模板内置动效**：SaaS 落地页模板内置滚动入场动画（slide-up），导出/导入 HTML 不丢失动画配置
- 👁️ **编辑器内预览**：不导出也能预览交互效果，预览模式下工具栏、图层树、画布文字选中自动禁用，隐藏元素完全消失
- 🎯 **隐藏/显示一致性**：隐藏元素在编辑模式半透明（便于编辑），预览/导出场景（HTML/PNG/PDF）完全消失，行为统一
- 📱 **响应式导出**：桌面保持绝对定位、平板自适应、手机全宽堆叠，三层断点（>1024 / 769-1024 / ≤768）自动适配
- 📤 **多格式导出**：HTML / PNG / PDF 一键导出，HTML 自动收集 Google Fonts 并镜像到国内 CDN

### 效率工具
- 📋 **统一剪贴板**：Ctrl+V / 工具栏 / 右键菜单三种粘贴方式统一，智能判断内部/外部复制来源，支持图片 + 文本粘贴
- 🖱️ **右键菜单**：复制、粘贴、删除，Portal 渲染浮于页面顶层
- 🏷️ **多选对齐**：Shift 多选 → 左/中/右/上/中/下对齐 + 等距分布

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/ClaireMoonlit/pageforge.git
cd pageforge

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 浏览器访问 http://localhost:5173/pageforge/
```

### 运行测试

```bash
npx tsx scripts/test-export.ts
```

### 在线体验

🌐 **[GitHub Pages Demo](https://clairemoonlit.github.io/pageforge/)**

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 构建 | Vite 5 |
| 框架 | React 18 + TypeScript 5.5 |
| 状态管理 | Zustand + Immer + zundo（撤销/重做） |
| 拖拽系统 | @dnd-kit/core + @dnd-kit/sortable |
| HTML 解析 | JSDOM（运行时导入）+ 内置 CSS 解析器 |
| 样式方案 | 原生 CSS + Tailwind（仅工具类） |
| 图片导出 | html2canvas + jsPDF |
| 部署 | GitHub Pages（gh-pages） |

---

## 项目结构

```
PageForge/
├── src/
│   ├── App.tsx                   # 三栏布局 + 拖拽上下文（DndContext）
│   ├── index.css                 # 全局样式 + pf-animate-* 动画 keyframes
│   ├── components/
│   │   ├── Toolbar.tsx           # 顶部工具栏（预览/撤销/重做/导出下拉菜单 Portal）
│   │   ├── ComponentPanel.tsx    # 左：组件库 / 模板导入面板
│   │   ├── Canvas.tsx            # 中：自由画布 + 统一粘贴 + 右键菜单
│   │   ├── CanvasElement.tsx     # 节点渲染 + resize 手柄 + 预览模式交互
│   │   ├── NodeRenderer.tsx      # 节点 → React 元素 + renderPreviewTree
│   │   ├── ImageCropModal.tsx    # 图片裁切模态框（形状切换 + 8 向手柄 + 吸附）
│   │   ├── Inspector.tsx         # 右：属性面板（样式/交互/ID 显示）
│   │   ├── LayerTree.tsx         # 右上：层级树
│   │   ├── AlignToolbar.tsx      # 多选对齐工具栏
│   │   ├── AlignInfoOverlay.tsx  # 多选对齐信息浮层
│   │   ├── Ruler.tsx             # 画布标尺（水平/垂直，拖拽创建辅助线）
│   │   ├── Icon.tsx              # 智能图标（SVG/emoji 自适应）
│   │   └── Icons.tsx             # 内联 SVG 图标库
│   ├── utils/
│   │   ├── importHtml.ts         # HTML 解析（~1611 行，核心难点）
│   │   ├── exportHtml.ts         # 节点 → 响应式 HTML 导出（含字体收集 + 断点 CSS）
│   │   ├── interactionRuntime.ts # 零依赖 vanilla JS 运行时（交互/动画）
│   │   ├── layoutRules.ts        # 规则推断引擎（Y 轴重叠分行、响应式布局推断）
│   │   ├── iconPaths.ts          # 图标 SVG 路径数据
│   │   ├── snapping.ts           # 拖拽吸附辅助线计算
│   │   ├── fileUpload.ts         # 文件读取与校验（FileReader → data URL）
│   │   └── exportImage.ts        # PNG/PDF 导出（html2canvas + jspdf）
│   ├── store/
│   │   └── editorStore.ts        # Zustand 单一数据源（含剪贴板时间戳）
│   ├── types/
│   │   └── index.ts              # 类型定义（CanvasNode、NodeStyle、InteractionConfig 等）
│   └── data/
│       ├── componentLib.ts       # 13 个内置组件定义
│       ├── importedTemplates.ts  # 9 套导入模板的元信息
│       └── templates.ts          # 内置空白模板
├── public/
│   └── imported-templates/       # 运行时模板资源（JSON 缓存 + 图片）
├── imported-templates/           # 模板源文件（HTML + CSS，非运行时）
├── scripts/
│   └── test-export.ts            # 导出功能自动化测试（11 项检查）
└── PROJECT_STATUS.md             # 项目状态交接文档（供 AI 恢复上下文）
```

---

## 开发

> 新对话接入时，建议让 AI 先读取 `PROJECT_STATUS.md` 了解项目上下文和最新进展。

```bash
npm run dev      # 启动开发服务器（Vite HMR）
npm run build    # 构建生产版本（tsc + vite build）
npm run preview  # 预览构建产物
```

### 部署

推送到 `main` 分支后，GitHub Actions 自动构建并部署到 GitHub Pages：

```bash
git push origin main
```

网络不稳定时可用脚本自动重试：

```powershell
.\git-push.ps1
```

---

## License

MIT