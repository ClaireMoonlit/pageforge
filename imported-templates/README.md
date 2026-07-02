# 抓取的开源模板

全部来自 [StartBootstrap](https://github.com/StartBootstrap) 开源项目（**MIT 许可**），可以从 https://startbootstrap.com 验证预览。

## 文件结构

| 原始源 | HTML | CSS | 合成版 (CSS 注入到 <style>) |
|---|---|---|---|
| Agency | `sb-agency.html` (40KB) | `agency.min.css` (206KB) | `ready-agency.html` (240KB) |
| Freelancer | `sb-freelancer.html` (31KB) | `freelancer.min.css` (198KB) | `ready-freelancer.html` (224KB) |
| New Age | `sb-new-age.html` (20KB) | `new-age.min.css` (200KB) | `ready-new-age.html` (216KB) |
| Modern Business | `sb-modern-business.html` (17KB) | `modern-business.min.css` (194KB) | `ready-modern-business.html` (206KB) |
| Creative | `sb-creative.html` (17KB) | `creative.min.css` (200KB) | `ready-creative.html` (212KB) |
| Landing Page | `sb-landing-page.html` (16KB) | `landing-page.min.css` (196KB) | `ready-landing-page.html` (206KB) |
| Grayscale | `sb-grayscale.html` (13KB) | `grayscale.min.css` (202KB) | `ready-grayscale.html` (210KB) |
| Resume | `sb-resume.html` (15KB) | `resume.min.css` (197KB) | `ready-resume.html` (206KB) |
| Clean Blog | `sb-clean-blog.html` (8KB) | `clean-blog.min.css` (190KB) | `ready-clean-blog.html` (194KB) |

## 使用方法

### 方式 1：直接打开合成版
合成版 `ready-*.html` 已经是单文件双击即可在浏览器中看到完整样式效果。

### 方式 2：导入到 PageForge 画布
1. 打开合成版 `ready-*.html` → 全选复制（Ctrl+A, Ctrl+C）
2. 粘贴到 PageForge 工具栏的 HTML 导入框
3. 走 `src/utils/importHtml.ts` 的 `htmlToNodes()` 解析（浏览器端有原生 `DOMParser`）
4. 解析得到的节点直接加载到画布

### 方式 3：单独看 HTML 结构
看 `sb-*.html`（原始 HTML），所有 class 名清晰可读。

## 工具脚本

- `convert.mjs` — Node 端尝试 `importHtml.ts` 转换（需要 `DOMParser` polyfill，**未运行**）
- `report.mjs` — 统计每个模板的元素结构（已运行，输出表见下）
- `merge.mjs` — 把 CSS 注入到 HTML 中生成 `ready-*.html`（**已运行**）

## 报告（运行 `report.mjs` 输出）

| 模板 | h1 | h2 | h3 | section | div | button | img | class 引用 |
|---|---|---|---|---|---|---|---|---|
| Agency | 0 | 11 | 5 | 5 | 166 | 8 | 30 | 326 |
| Freelancer | 1 | 9 | 0 | 3 | 146 | 14 | 13 | 248 |
| New Age | 1 | 3 | 4 | 4 | 67 | 4 | 6 | 131 |
| Modern Business | 1 | 6 | 0 | 2 | 76 | 2 | 8 | 152 |
| Creative | 1 | 4 | 4 | 4 | 76 | 2 | 6 | 138 |
| Landing Page | 1 | 5 | 3 | 4 | 61 | 2 | 3 | 112 |
| Grayscale | 1 | 3 | 0 | 4 | 54 | 2 | 4 | 105 |
| Resume | 1 | 5 | 6 | 6 | 37 | 1 | 1 | 145 |
| Clean Blog | 1 | 4 | 3 | 0 | 18 | 1 | 0 | 63 |

## 推荐优先级

按丰富度 / 设计感：

1. **Agency** (40KB HTML, 30 张图, 14 区块) — 设计公司风
2. **Freelancer** (14 按钮 + 248 class) — 自由职业者作品集
3. **Resume** (简历模板) — 跟我们现有简历模板同类型，可对比
4. **New Age** (App 推广风) — 适合 SaaS 落地页
5. **Modern Business** (多页商业风)

## 已知问题

- 9 个模板都使用 Bootstrap 5 class + Font Awesome 图标，**未引入 Bootstrap CSS**（importHtml.ts 解析器不认 Bootstrap class 也不下载外部 CSS）。但合成版 `ready-*.html` 用 `<style>` 注入了原始 Bootstrap CSS，浏览器里打开 OK。
- 字体来自 Google Fonts CDN（合成版里还能用），导入 PageForge 后丢失字体（PageForge 还没集成 Google Fonts 解析）
- 图片路径 `assets/...` 指向相对路径，合成版能加载，导入 PageForge 后会变红 X（资源未跟随导入）
- Font Awesome 图标 (i 标签) 会被解析为 `text` 节点，文字会显示 "fas fa-circle" 这种 class 名
