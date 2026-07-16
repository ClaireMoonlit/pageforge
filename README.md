# 🏗️ 造页工坊 PageForge

> 像做 PPT 一样"造"网页 —— 自由画布拖拽 + 智能吸附对齐 + 一键导出响应式 HTML

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)](https://vitejs.dev/)

---

## 这是什么

造页工坊是一款**浏览器内的可视化网页搭建工具**。无需写代码，像做 PPT 一样拖拽组件、自由排版，一键导出可直接部署的响应式 HTML 文件。

- **不会写代码？** 14 种组件自由拖拽，智能吸附对齐，所见即所得
- **AI 生成了网页想微调？** 把 HTML 粘贴进来，秒变可视化编辑器，双击改文字、拖拽调布局
- **做好了怎么用？** 一键导出干净的单文件 HTML，无水印、无平台锁定，直接部署

🌐 **[在线体验](https://clairemoonlit.github.io/pageforge/)**

---

## 核心功能

### 🧩 自由画布 + 14 种组件

标题、正文、图片、按钮、卡片、容器、分隔线、图标、视频、输入框、导航栏、网格、表单、嵌入 —— 全部可在画布上自由拖拽、缩放、旋转、镜像。内置**智能吸附对齐**（边缘 / 中心 / 等间距），拖拽时实时显示蓝色参考线。

### 🔬 精修模式 —— 可视化编辑任意 HTML

导入现有 HTML 页面，在 iframe 中 100% 还原原布局，**点击选中元素直接编辑**：
- 双击改文字、拖拽手柄调尺寸
- 样式编辑器（颜色 / 字号 / 字重 / 对齐 / 内边距 / 圆角）
- 属性编辑器（图片地址 / 链接 / 描述 / 提示文字）
- DOM 面包屑导航，快速跳转任意层级

**特别适合精修 AI 生成的网页** —— 把 DeepSeek / GLM / MiniMax 写的 HTML 粘贴进来，不用对着代码找标签。

### 📱 响应式导出

桌面保持绝对定位、平板自适应、手机全宽堆叠 —— 三层断点自动适配，导出的 HTML 含完整响应式 CSS 和 Google Fonts 国内镜像加速。

### 🎬 交互动画（导出后保留）

零代码配置：链接跳转、点击动作（跳转 / 滚动锚点 / 切换显隐 / 提交表单）、悬停效果（缩放 / 阴影 / 变色 / 发光）、7 种入场动画。所有交互以 `data-pf-*` 属性序列化，由零依赖运行时驱动。

### 📚 18 套模板 + HTML 导入

9 套预设模板（简历 / SaaS 落地页 / 暗色主题 / 杂志风等）+ 9 套开源模板（Start Bootstrap 系列）。支持粘贴 HTML 或上传 `.html` 文件，智能检测复杂度并推荐最佳编辑模式。

### 🎨 属性面板 + 预设样式

21 种字体、按钮 8 种预设、卡片 6 种预设、图标选择器（SVG + emoji）、格式刷（一键复制样式）。

### 📐 图层树 + 多选对齐

嵌套树形展示、拖拽排序、显示/隐藏切换。Ctrl/Cmd 多选自动弹出对齐工具栏（六向对齐 + 等距分布）。

### 📤 三种导出

HTML（自包含单文件，可独立部署）、PNG、PDF。导出的 HTML 完全属于你。

### ✂️ 图片裁切

矩形 / 圆形 / 圆角三种形状，8 向手柄，正方形磁吸 + 原比例吸附 + 边缘吸附三套系统，支持旋转、翻转、重新裁切。

---

## 快速开始

```bash
git clone https://github.com/ClaireMoonlit/pageforge.git
cd pageforge
npm install
npm run dev
```

浏览器访问 `http://localhost:5173` 即可使用。

---

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 状态管理 | Zustand + Immer + zundo（撤销/重做） |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable |
| HTML 解析 | JSDOM + 内置 CSS 解析器 |
| 样式 | 原生 CSS + Tailwind（工具类） |

---

## License

MIT