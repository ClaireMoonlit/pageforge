# PageForge 模板渲染问题 - 重启对话用

## 项目概述

**项目**：`d:\My Projects\PageForge` —— 浏览器端低代码页面编辑器，类 Canva/PageForge。
**技术栈**：React 18 + TypeScript + Vite + dnd-kit + Zustand + happy-dom
**目录**：`D:\My Projects\PageForge`，可执行脚本：`imported-templates\batch-convert.mjs`
**启动**：`cd "d:\My Projects\PageForge"; npm run dev` → 访问 http://localhost:5175

## 核心功能
- 画布上拖拽组件搭页面
- **HTML 模板批量导入**：读取 `imported-templates\*.html` → `importHtml.ts` 转成 CanvasNode JSON → 存到 `public\imported-templates\*.json` → 运行时 `fetch` 加载到画布
- 选中节点可拖动/8 向 resize/双击编辑文字

## 当前 bug：模板导入后画布基本空白

**症状**：点击"导入模板 → Agency"后：
- 控制台输出 `[Canvas] rendering 15 nodes, canvas={width: '1200px', height: '8138px', ...}` ✅
- 控制台输出大量 `[CE] render container/text/heading id=... x=0 y=0 w=1200px minH=... parentX=0 parentY=0` ✅
- **画布上完全看不到内容**（虽然有 8138px 高的占位）
- `[CE.dom]` useEffect 内的 getBoundingClientRect 日志**完全没出现**（已加在 src/components/CanvasElement.tsx useEffect 中）
- 已尝试关闭 React.StrictMode（src/main.tsx），无效果

**模板生成 JSON 是有效的**（15 个 root 节点，agency 共 8138px 高），且每个节点 style 看起来正确（width/minH 都对）。

## 关键文件位置

| 文件 | 作用 |
|------|------|
| `d:\My Projects\PageForge\src\components\Canvas.tsx` | 主画布组件，line 128 有 `[Canvas] rendering N nodes` 日志 |
| `d:\My Projects\PageForge\src\components\CanvasElement.tsx` | 单节点渲染组件，line 200 有 `[CE] render` 日志，line ~76 useEffect 应输出 `[CE.dom]` |
| `d:\My Projects\PageForge\src\components\NodeRenderer.tsx` | `nodeToCss` 和 `renderNodeContent` |
| `d:\My Projects\PageForge\src\utils\importHtml.ts` | HTML→JSON 转换核心 |
| `d:\My Projects\PageForge\imported-templates\batch-convert.mjs` | 批量转换脚本（happy-dom 模拟浏览器） |
| `d:\My Projects\PageForge\public\imported-templates\*.json` | 转换后产物 |
| `d:\My Projects\PageForge\src\types\index.ts` | `CanvasNode` / `NodeStyle` 类型 |
| `d:\My Projects\PageForge\src\store\editorStore.ts` | Zustand store |
| `d:\My Projects\PageForge\src\main.tsx` | 入口（已临时关闭 StrictMode） |
| `d:\My Projects\PageForge\src\components\TemplatePanel.tsx` | 模板加载 UI |

## 近期改动

1. **CanvasElement 加了 parentX/parentY 渲染时累加父级偏移**（不再依赖 JSON 内嵌的绝对坐标）
2. **importHtml.ts 改为两阶段**：buildElement（构建节点不递归）+ populateChildren（分配宽度后递归子元素）
3. **importHtml.ts 移除组合选择器**（如 `.navbar>.container-fluid` 不再被误解析为 `.container-fluid`）
4. **importHtml.ts 自动算 canvas height**（根节点 + 根级子节点 max bottom）
5. **CanvasElement 关闭 React.StrictMode 临时测试**，无效

## 用户期望
- Agency 模板应能看到 navbar + masthead + portfolio 等 sections
- 之前曾经正常显示过（所以 JSON 数据 + 渲染逻辑理论上都对过）
- 用户怀疑是否有更基础的渲染问题（如 z-index/overflow/pointer-events）

## 调试提示
- 刷新用 Ctrl+Shift+R 强制清缓存
- 浏览器 DevTools Network 看 agency.json 是否 200
- Elements 面板搜索 `data-debug`（CanvasElement 会在 useEffect 里设置此 attribute 包含 w/h/left/top）
- 搜索 `data-node-id`（CanvasElement 的根 div 有此属性）看实际渲染了多少个 div

## 上下文摘要（来自被压缩的对话）
- 之前在 importHtml.ts 和 CanvasElement.tsx 都加过 `parentOffsetX/Y` 累加，导致**双重偏移**，已修正为只在 CanvasElement 渲染时累加
- 之前 CSS 组合选择器导致 `.container-fluid` 错误继承 flex 属性，修改 parseStyleTag 跳过 `> + ~ 空格` 选择器
- 之前 style.width 被 `...style` 覆盖，修正为 `style: { ...style, width: effectiveW + 'px' }`
- Canvas 自动算高度成功（agency 8138px / clean-blog 1333px / resume 3805px）

## 关键问题（请优先排查）
1. **为什么 `[CE.dom]` useEffect 日志没出现**？`elRef.current` 应该被 setRefs 赋值。如果 effect 不跑说明组件 unmount 或抛错
2. **为什么 CanvasElement 渲染了但 DOM 里看不到**？可能：position: absolute 但父级 overflow:hidden + 0 高度、z-index 0 被覆盖、display:none、parent 高度为 0
3. **是否 dnd-kit 在嵌套多层 CanvasElement 时**有 children 数量限制？

请先打开 CanvasElement.tsx 和 Canvas.tsx 看实际渲染逻辑，重点看：
- CanvasElement 根 div 的 CSS 属性（特别是 position/overflow/height）
- Canvas 组件的容器 CSS（是否给了 height）
- 是否 CanvasElement 内部嵌套的 CanvasElement div 在 DOM 树里出现
