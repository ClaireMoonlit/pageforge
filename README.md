# 🏗️ 造页工坊 PageForge

> 像做 PPT 一样"造"网页 —— 自由画布拖拽 + 智能吸附对齐 + 一键导出响应式 HTML

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6.svg)](https://www.typescriptlang.org/)
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

- 🎨 **自由画布**：绝对定位自由摆放，所见即所得
- 🧲 **智能吸附**：拖拽时自动识别对齐参考线，裁切弹窗支持正方形/正圆/居中/边缘吸附
- ✂️ **图片裁切**：上传图片后弹出裁切模态框，支持矩形/圆形/圆角矩形三种形状，8 向手柄自由调整
- 📱 **响应式导出**：桌面保持绝对定位、平板自适应、手机全宽堆叠，三层断点自动适配
- 🧩 **9 套模板**：一键导入 Start Bootstrap 系列模板，开箱即用
- ⚡ **交互支持**：零代码配置链接、点击、悬停、入场动画，导出 HTML 自带 vanilla JS 运行时
- 👁️ **编辑器内预览**：不导出也能预览交互效果
- 🔄 **撤销/重做**：完整的历史记录
- 📋 **统一剪贴板**：Ctrl+V / 工具栏 / 右键菜单三种粘贴方式统一，智能判断内部/外部复制来源，支持图片 + 文本粘贴
- 🖱️ **右键菜单**：复制、粘贴、删除，Portal 渲染浮于页面顶层
- 🖌️ **格式刷**：一键复制样式
- 🏷️ **多选对齐**：Shift 多选 → 左/中/右/上/中/下对齐 + 等距分布
- 📏 **标尺 + 辅助线**：画布标尺，拖拽创建辅助线
- 📤 **多格式导出**：HTML / PNG / PDF 一键导出，下拉菜单浮于页面顶层

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

# 打开浏览器访问
# http://localhost:5173（默认）或终端输出的实际地址
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
| 框架 | React 18 + TypeScript |
| 状态 | Zustand + Immer + zundo（撤销/重做） |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable |
| HTML 解析 | JSDOM（运行时导入）+ 内置 CSS 解析器 |
| 样式 | 原生 CSS + Tailwind（仅工具类） |

---

## 项目结构

```
PageForge/
├── src/
│   ├── App.tsx                  # 三栏布局 + 拖拽上下文
│   ├── components/
│   │   ├── Toolbar.tsx          # 顶部工具栏（导出下拉菜单 Portal）
│   │   ├── ComponentPanel.tsx   # 左：组件库 / 模板
│   │   ├── Canvas.tsx           # 中：自由画布 + 统一粘贴 + 右键菜单
│   │   ├── CanvasElement.tsx    # 节点渲染 + 拖拽 + 预览 + 右键复制
│   │   ├── NodeRenderer.tsx     # 节点 → React 元素
│   │   ├── ImageCropModal.tsx   # 图片裁切模态框（形状 + 吸附）
│   │   ├── Inspector.tsx        # 右：属性面板 + 本地上传
│   │   ├── LayerTree.tsx        # 右上：层级树
│   │   ├── AlignToolbar.tsx     # 多选对齐工具栏
│   │   ├── Ruler.tsx            # 画布标尺
│   │   └── Icon.tsx             # 智能图标组件
│   ├── utils/
│   │   ├── importHtml.ts        # HTML 解析（~1611 行）
│   │   ├── exportHtml.ts        # 节点 → 响应式 HTML 导出
│   │   ├── interactionRuntime.ts # 零依赖 vanilla JS 运行时
│   │   ├── layoutRules.ts       # 规则推断引擎
│   │   ├── iconPaths.ts         # 图标 SVG 路径
│   │   ├── snapping.ts          # 拖拽吸附辅助线
│   │   ├── fileUpload.ts        # 文件读取与校验
│   │   └── exportImage.ts       # PNG/PDF 导出
│   ├── store/
│   │   └── editorStore.ts       # Zustand 单一数据源（含剪贴板时间戳）
│   ├── types/
│   │   └── index.ts             # 类型定义
│   └── data/
│       ├── componentLib.ts      # 13 个内置组件
│       ├── importedTemplates.ts # 9 套导入模板
│       └── templates.ts         # 内置空白模板
├── public/
│   └── imported-templates/      # 运行时模板资源
├── scripts/
│   └── test-export.ts           # 导出功能测试
└── PROJECT_STATUS.md            # 项目状态交接文档
```

---

## 开发

> 新对话接入时，建议让 AI 读取 `PROJECT_STATUS.md` 了解项目上下文。

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览构建产物
```

---

## License

MIT