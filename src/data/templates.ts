import type { CanvasConfig, CanvasNode } from '@/types'

export interface PageTemplate {
  id: string
  name: string
  description: string
  preview: string
  nodes: CanvasNode[]
  canvas: CanvasConfig
}

let idCounter = 0
function nid(): string {
  idCounter += 1
  return `t_n${idCounter}`
}

// ─── 共用色板 ───
const C = {
  white: '#ffffff',
  border: '#e5e7eb',

  // 字体
  fInter: '"Inter", system-ui, sans-serif',
  fSpace: '"Space Grotesk", "Inter", sans-serif',
  fPlayfair: '"Playfair Display", Georgia, serif',
  fSource: '"Source Sans 3", system-ui, sans-serif',
  fJetBrains: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
  fHelvetica: '"Helvetica Neue", "Arial", sans-serif',
  fCormorant: '"Cormorant Garamond", Georgia, serif',
  fLora: '"Lora", Georgia, serif',

  // 简历
  rDark: '#1e293b',
  rAccent: '#6366f1',
  rLight: '#f1f5f9',

  // SaaS 落地页
  sBg: '#f8fafc',
  sPrimary: '#4f46e5',
  sDark: '#0f172a',
  sGray: '#64748b',
  sLight: '#f1f5f9',

  // Claude 编辑风
  claudeBg: '#0f0f1a',
  claudeCard: '#1a1a2e',
  claudeGold: '#c9a96e',
  claudeCream: '#f0e8d8',
  claudeMuted: '#8b8b9e',

  // GitHub 暗色
  ghBg: '#0d1117',
  ghGreen: '#3fb950',
  ghBlue: '#58a6ff',
  ghMuted: '#8b949e',

  // 极简瑞士
  swissBg: '#fcfcfc',
  swissAccent: '#e63946',
  swissDark: '#1d1d1d',
  swissMuted: '#6b6b6b',

  // 杂志风
  magBg: '#faf9f7',
  magDark: '#1a1a1a',
  magAccent: '#d97706',
  magMuted: '#78716c',
}

export const pageTemplates: PageTemplate[] = [
  // ═══════════════════════════════════════════════
  // 1. 专业简历 — 两栏容器布局
  // ═══════════════════════════════════════════════
  {
    id: 'resume',
    name: '专业简历',
    description: '两栏布局，深色侧栏 + 白色主内容区，全容器内子元素',
    preview: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #6366f1 100%)',
    nodes: [
      // 左侧深色栏（撑满 900 画布，紧贴上下左边）
      {
        id: nid(), type: 'container', visible: true, props: {},
        style: { x: 0, y: 0, width: '300px', minHeight: '900px', padding: '60px 35px', backgroundColor: C.rDark, borderRadius: '0', position: 'relative' },
        children: [
          // 头像：x=90 与"张三"文本框(x=35, w=230)中心对齐（中心均 150）
          { id: nid(), type: 'image', children: [], visible: true, props: { src: '', alt: '头像' }, style: { x: 90, y: 60, width: '120px', height: '120px', borderRadius: '60px', backgroundColor: C.rAccent } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '张三', level: 2 }, style: { x: 35, y: 205, width: '230px', fontSize: '26px', fontWeight: '700', color: C.white, textAlign: 'center', fontFamily: C.fInter } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '高级前端工程师' }, style: { x: 35, y: 248, width: '230px', fontSize: '13px', color: '#a5b4fc', textAlign: 'center', lineHeight: '1.5', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 35, y: 290, width: '230px', height: '1px', backgroundColor: '#334155', display: 'block' } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '联系方式', level: 3 }, style: { x: 35, y: 318, fontSize: '14px', fontWeight: '600', color: '#c7d2fe', textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: 'zhangsan@example.com\n138-0000-0000\n北京市朝阳区' }, style: { x: 35, y: 348, fontSize: '13px', color: '#94a3b8', textAlign: 'left', lineHeight: '2.2', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 35, y: 470, width: '230px', height: '1px', backgroundColor: '#334155', display: 'block' } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '技术栈', level: 3 }, style: { x: 35, y: 498, fontSize: '14px', fontWeight: '600', color: '#c7d2fe', textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: 'React / Vue / TypeScript\nNode.js / Python\nTailwind CSS / Webpack\nDocker / AWS / CI/CD' }, style: { x: 35, y: 528, fontSize: '13px', color: '#94a3b8', textAlign: 'left', lineHeight: '2.2', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 35, y: 670, width: '230px', height: '1px', backgroundColor: '#334155', display: 'block' } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '技能证书', level: 3 }, style: { x: 35, y: 698, fontSize: '14px', fontWeight: '600', color: '#c7d2fe', textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '· AWS 认证解决方案架构师\n· Google Cloud 专业认证\n· 信息系统项目管理师' }, style: { x: 35, y: 728, fontSize: '13px', color: '#94a3b8', textAlign: 'left', lineHeight: '2.2', fontFamily: C.fInter } },
        ],
      },
      // 右侧白色主内容（撑满 900 画布，紧贴上下右）
      {
        id: nid(), type: 'container', visible: true, props: {},
        style: { x: 300, y: 0, width: '900px', minHeight: '900px', padding: '60px 70px', backgroundColor: C.white, borderRadius: '0', position: 'relative' },
        children: [
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '关于我', level: 2 }, style: { x: 70, y: 60, fontSize: '24px', fontWeight: '700', color: C.rDark, textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 70, y: 100, width: '50px', height: '3px', backgroundColor: C.rAccent, display: 'block' } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '拥有 6 年前端开发经验，擅长 React 生态与性能优化。主导过多个大型项目从 0 到 1 的架构设计，注重代码质量与用户体验。' }, style: { x: 70, y: 122, width: '760px', fontSize: '15px', color: '#64748b', textAlign: 'left', lineHeight: '1.8', fontFamily: C.fInter } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '工作经历', level: 2 }, style: { x: 70, y: 220, fontSize: '24px', fontWeight: '700', color: C.rDark, textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 70, y: 260, width: '50px', height: '3px', backgroundColor: C.rAccent, display: 'block' } },
          { id: nid(), type: 'card', children: [], visible: true, props: { text: '高级前端工程师 · ABC 科技', subtitle: '2022 - 至今 | 负责核心产品前端架构，主导 React 迁移至 Next.js，性能提升 40%。', titleFontSize: '16px', titleColor: C.rDark, subtitleFontSize: '14px', subtitleColor: '#64748b' }, style: { x: 70, y: 282, width: '760px', padding: '22px', backgroundColor: '#f8fafc', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fInter } },
          { id: nid(), type: 'card', children: [], visible: true, props: { text: '前端工程师 · XYZ 技术', subtitle: '2019 - 2022 | 参与电商平台前端开发，Vue 重构为微前端架构。', titleFontSize: '16px', titleColor: C.rDark, subtitleFontSize: '14px', subtitleColor: '#64748b' }, style: { x: 70, y: 402, width: '760px', padding: '22px', backgroundColor: '#f8fafc', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fInter } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '教育背景', level: 2 }, style: { x: 70, y: 522, fontSize: '24px', fontWeight: '700', color: C.rDark, textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 70, y: 562, width: '50px', height: '3px', backgroundColor: C.rAccent, display: 'block' } },
          { id: nid(), type: 'card', children: [], visible: true, props: { text: '硕士 · 计算机科学 · 清华大学', subtitle: '2017 - 2019 | 研究方向：人机交互与前端性能优化', titleFontSize: '16px', titleColor: C.rDark, subtitleFontSize: '14px', subtitleColor: '#64748b' }, style: { x: 70, y: 584, width: '760px', padding: '22px', backgroundColor: '#f8fafc', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fInter } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '项目经验', level: 2 }, style: { x: 70, y: 704, fontSize: '24px', fontWeight: '700', color: C.rDark, textAlign: 'left', fontFamily: C.fInter } },
          { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 70, y: 744, width: '50px', height: '3px', backgroundColor: C.rAccent, display: 'block' } },
          { id: nid(), type: 'card', children: [], visible: true, props: { text: '电商平台微前端架构 · 项目负责人', subtitle: '2021 - 2022 | 主导架构改造，页面加载速度提升 60%，团队效率提升 30%。', titleFontSize: '16px', titleColor: C.rDark, subtitleFontSize: '14px', subtitleColor: '#64748b' }, style: { x: 70, y: 766, width: '760px', padding: '22px', backgroundColor: '#f8fafc', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fInter } },
        ],
      },
    ],
    canvas: { backgroundColor: '#f1f5f9', width: '1200px', height: '900px' },
  },

  // ═══════════════════════════════════════════════
  // 2. SaaS 落地页 — Hero + 特性 + 数据 + 定价 + CTA
  // ═══════════════════════════════════════════════
  {
    id: 'saas-landing',
    name: 'SaaS 落地页',
    description: '完整产品页：Hero → 特性三列 → 数据条 → 定价三栏 → 底部 CTA',
    preview: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    nodes: [
      // Nav
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Forge' }, style: { x: 80, y: 28, fontSize: '18px', fontWeight: '700', color: C.sDark, textAlign: 'left', letterSpacing: '-0.02em', padding: '0', fontFamily: C.fSpace } },
      { id: nid(), type: 'button', children: [], visible: true, props: { text: '免费试用' }, style: { x: 1020, y: 22, fontSize: '14px', fontWeight: '600', color: C.white, backgroundColor: C.sPrimary, padding: '8px 20px', borderRadius: '8px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.fInter } },

      // Hero
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '用拖拽搭建你的网页', level: 1 }, style: { x: 200, y: 110, width: '800px', fontSize: '48px', fontWeight: '800', color: C.sDark, textAlign: 'center', letterSpacing: '-0.03em', padding: '0', fontFamily: C.fSpace } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: '无需代码，10 分钟创建专业落地页。一键导出 HTML，部署到任何地方。' }, style: { x: 220, y: 195, width: '760px', fontSize: '18px', color: C.sGray, textAlign: 'center', lineHeight: '1.65', padding: '0', fontFamily: C.fInter } },
      // Hero 按钮：x=500 让 240 宽按钮居中在 1200 画布中心（600 - 120 = 480 ≈ 500，给一点视觉偏移修正 padding 收缩）
      { id: nid(), type: 'button', children: [], visible: true, props: { text: '开始免费使用 →' }, style: { x: 500, y: 270, width: '200px', fontSize: '16px', fontWeight: '600', color: C.white, backgroundColor: C.sPrimary, padding: '14px 36px', borderRadius: '10px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.fInter } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: '无需信用卡 · 永久免费版可用' }, style: { x: 460, y: 330, width: '280px', fontSize: '13px', color: '#9ca3af', textAlign: 'center', lineHeight: '1.5', padding: '0', fontFamily: C.fInter } },

      // 数据条（4 列容器）
      {
        id: nid(), type: 'container', visible: true, props: {},
        style: { x: 80, y: 410, width: '1040px', minHeight: '90px', padding: '24px 20px', backgroundColor: C.white, borderRadius: '12px', position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
        children: [
          { id: nid(), type: 'icon', children: [], visible: true, props: { icon: '📊', text: '10,000+' }, style: { x: 40, y: 10, fontSize: '28px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '活跃用户' }, style: { x: 40, y: 50, fontSize: '13px', color: C.sGray, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'icon', children: [], visible: true, props: { icon: '⚡', text: '99.9%' }, style: { x: 280, y: 10, fontSize: '28px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '服务可用性' }, style: { x: 280, y: 50, fontSize: '13px', color: C.sGray, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'icon', children: [], visible: true, props: { icon: '⭐', text: '4.9/5' }, style: { x: 520, y: 10, fontSize: '28px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '用户评分' }, style: { x: 520, y: 50, fontSize: '13px', color: C.sGray, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'icon', children: [], visible: true, props: { icon: '🚀', text: '50,000+' }, style: { x: 760, y: 10, fontSize: '28px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0' } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '页面已创建' }, style: { x: 760, y: 50, fontSize: '13px', color: C.sGray, textAlign: 'center', padding: '0' } },
        ],
      },

      // 特性区标题
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '核心特性', level: 2 }, style: { x: 400, y: 560, width: '400px', fontSize: '30px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0', fontFamily: C.fSpace } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: '一切你需要的，我们都有' }, style: { x: 380, y: 608, width: '440px', fontSize: '16px', color: C.sGray, textAlign: 'center', lineHeight: '1.5', padding: '0', fontFamily: C.fInter } },

      // ═══════════════════════════════════════════════
      // 6 张卡片统一宽度 280px，统一列间距 40px，统一左右边距 140px
      // 3×280 + 2×40 = 920，画布 1200 → 左右边距各 140，两排 x 完全对齐
      // ═══════════════════════════════════════════════

      // 3 张特性卡片（280px 宽：最长文案 ~40 字 → 3 行 × 14×1.5=63px + 标题 26px = 89px，+ padding 48 = 137px，160px 够用）
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '拖拽编辑', subtitle: '直观的拖拽操作，无需代码即可自由布局。所见即所得，实时预览效果。', titleFontSize: '18px', titleColor: C.sDark, subtitleFontSize: '14px', subtitleColor: C.sGray, subtitleLineHeight: 1.5 }, style: { x: 140, y: 680, width: '280px', height: '160px', padding: '24px', backgroundColor: C.white, borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '一键导出', subtitle: '生成独立 HTML 文件，代码干净、结构清晰。部署到 Netlify、Vercel 或任意静态托管。', titleFontSize: '18px', titleColor: C.sDark, subtitleFontSize: '14px', subtitleColor: C.sGray, subtitleLineHeight: 1.5 }, style: { x: 460, y: 680, width: '280px', height: '160px', padding: '24px', backgroundColor: C.white, borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '响应式设计', subtitle: '桌面端绝对定位 + 移动端流式堆叠。一套设计，完美适配电脑、平板、手机。', titleFontSize: '18px', titleColor: C.sDark, subtitleFontSize: '14px', subtitleColor: C.sGray, subtitleLineHeight: 1.5 }, style: { x: 780, y: 680, width: '280px', height: '160px', padding: '24px', backgroundColor: C.white, borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },

      // 定价区标题（特性卡片底部 840，间距 60 → y=900）
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '选择适合你的方案', level: 2 }, style: { x: 310, y: 900, width: '580px', fontSize: '30px', fontWeight: '700', color: C.sDark, textAlign: 'center', padding: '0', fontFamily: C.fSpace } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: '无论个人还是企业，都有合适的方案' }, style: { x: 360, y: 948, width: '480px', fontSize: '16px', color: C.sGray, textAlign: 'center', lineHeight: '1.5', padding: '0', fontFamily: C.fInter } },

      // 3 张定价卡片（280px 宽 × 200px 高：5 行 bullets × 14×1.5=105px + 标题 26px = 131px，+ padding 48 = 179px，留 21px）
      // y=1020，与"无论个人..."副标题(y=948)间距 72px
      // x=140/460/780 与特性卡完全对齐，两排 6 张卡片形成整齐的 3×2 网格
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '免费版 · ¥0/月', subtitle: '✓ 3 个项目\n✓ 基础组件库\n✓ HTML 导出\n✓ 社区支持', titleFontSize: '18px', titleColor: C.sDark, subtitleFontSize: '14px', subtitleColor: C.sGray, subtitleLineHeight: 1.5 }, style: { x: 140, y: 1020, width: '280px', height: '200px', padding: '24px', backgroundColor: C.white, borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '专业版 · ¥99/月', subtitle: '✓ 无限项目\n✓ 全部组件\n✓ 高级导出\n✓ 优先支持\n✓ 自定义域名', titleFontSize: '18px', titleColor: C.white, subtitleFontSize: '14px', subtitleColor: '#c7d2fe', subtitleLineHeight: 1.5 }, style: { x: 460, y: 1020, width: '280px', height: '200px', padding: '24px', backgroundColor: C.sPrimary, borderRadius: '12px', boxShadow: '0 4px 16px rgba(79,70,229,0.3)', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: '企业版 · 联系我们', subtitle: '✓ 专业版全部功能\n✓ 团队协作\n✓ API 接口\n✓ 专属支持\n✓ 定制开发', titleFontSize: '18px', titleColor: C.sDark, subtitleFontSize: '14px', subtitleColor: C.sGray, subtitleLineHeight: 1.5 }, style: { x: 780, y: 1020, width: '280px', height: '200px', padding: '24px', backgroundColor: C.white, borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', fontFamily: C.fInter } },

      // 底部 CTA 容器（定价卡片底部 1220，间距 40 → y=1260；height 200 + padding 40 40 增加内部留白）
      // 外部下留白 = 画布 1520 - (1260 + 200) = 60px（保持）
      {
        id: nid(), type: 'container', visible: true, props: {},
        style: { x: 80, y: 1260, width: '1040px', height: '200px', padding: '40px 40px', backgroundColor: '#312e81', borderRadius: '12px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
        children: [
          // 关键修正：子元素 x 是相对父容器的 left，不是相对画布。
          // 父容器 x=80, width=1040, padding=40 横向 → 内容区 x=40 到 x=1000（相对父容器），
          // 内容区中心 = 520（相对父容器），画布中心 = 80+520 = 600 ✅
          // 标题/副标题 width=480：left = 520 - 240 = 280
          // 纵向：container h=200, padding 40 → 内容区 y=40 到 y=160 (h=120)
          // 标题 39 + 副标题 23 + 按钮 48 = 110，留 10px 分给 3 个间隙
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '准备好开始了吗？', level: 2 }, style: { x: 280, y: 40, width: '480px', fontSize: '26px', fontWeight: '700', color: C.white, textAlign: 'center', padding: '0', fontFamily: C.fSpace } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: '免费注册，10 分钟创建你的第一个页面。' }, style: { x: 280, y: 88, width: '480px', fontSize: '15px', color: '#c7d2fe', textAlign: 'center', lineHeight: '1.5', padding: '0', fontFamily: C.fInter } },
          // CTA 按钮 width=240：left = 520 - 120 = 400
          { id: nid(), type: 'button', children: [], visible: true, props: { text: '立即免费开始' }, style: { x: 400, y: 120, width: '240px', fontSize: '16px', fontWeight: '600', color: C.sPrimary, backgroundColor: C.white, padding: '12px 32px', borderRadius: '10px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.fInter } },
        ],
      },
    ],
    canvas: { backgroundColor: C.sBg, width: '1200px', height: '1520px' },
  },

  // ═══════════════════════════════════════════════
  // 3. Claude 编辑风 — 大字标题 + 细文排版 + 高行距
  // ═══════════════════════════════════════════════
  {
    id: 'claude-editorial',
    name: 'Claude 编辑风',
    description: '深海军蓝底，鹅黄点缀，三行大标题(56px/1.15)，细文(18px/1.65)，高行距排版',
    preview: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #c9a96e 100%)',
    nodes: [
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Site Name' }, style: { x: 80, y: 40, fontSize: '17px', fontWeight: '600', color: C.claudeCream, textAlign: 'left', letterSpacing: '-0.01em', padding: '0', fontFamily: C.fSource } },

      // 三行大标题 — 56px / line-height: 1.15
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: 'Design is how it\nworks, not how\nit looks.', level: 1 }, style: { x: 80, y: 120, width: '600px', fontSize: '56px', fontWeight: '700', color: C.claudeCream, textAlign: 'left', lineHeight: '1.15', letterSpacing: '-0.02em', padding: '0', fontFamily: C.fPlayfair } },

      // 细分割线
      { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 80, y: 340, width: '120px', height: '2px', backgroundColor: C.claudeGold, display: 'block' } },

      // 长副标题 — 18px / line-height: 1.65
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'We build tools for people who think deeply. Every pixel, every interaction, every word — considered with care.' }, style: { x: 80, y: 370, width: '580px', fontSize: '18px', color: C.claudeMuted, textAlign: 'left', lineHeight: '1.65', padding: '0', fontFamily: C.fSource } },

      // CTA
      { id: nid(), type: 'button', children: [], visible: true, props: { text: 'Explore our work —' }, style: { x: 80, y: 460, fontSize: '15px', fontWeight: '500', color: C.claudeBg, backgroundColor: C.claudeGold, padding: '12px 28px', borderRadius: '6px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.fSource } },

      // 右侧三张编号卡片
      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '01' }, style: { x: 28, y: 28, fontSize: '14px', fontWeight: '500', color: C.claudeGold, textAlign: 'left', padding: '0', fontFamily: C.fSource } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Research-first approach. We study how people interact with complex systems before writing a single line of code.' }, style: { x: 28, y: 58, width: '344px', fontSize: '15px', color: C.claudeMuted, textAlign: 'left', lineHeight: '1.6', padding: '0', fontFamily: C.fSource } },
      ], visible: true, props: {}, style: { x: 760, y: 120, width: '400px', minHeight: '150px', padding: '28px', backgroundColor: C.claudeCard, borderRadius: '8px', position: 'relative', border: '1px solid rgba(201,169,110,0.15)' } },

      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '02' }, style: { x: 28, y: 28, fontSize: '14px', fontWeight: '500', color: C.claudeGold, textAlign: 'left', padding: '0', fontFamily: C.fSource } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Typography as interface. Clear hierarchy, generous leading, intentional weight — every detail matters.' }, style: { x: 28, y: 58, width: '344px', fontSize: '15px', color: C.claudeMuted, textAlign: 'left', lineHeight: '1.6', padding: '0', fontFamily: C.fSource } },
      ], visible: true, props: {}, style: { x: 760, y: 300, width: '400px', minHeight: '150px', padding: '28px', backgroundColor: C.claudeCard, borderRadius: '8px', position: 'relative', border: '1px solid rgba(201,169,110,0.15)' } },

      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '03' }, style: { x: 28, y: 28, fontSize: '14px', fontWeight: '500', color: C.claudeGold, textAlign: 'left', padding: '0', fontFamily: C.fSource } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Less, but better. We remove until nothing else can be removed — then add the one thing that makes it sing.' }, style: { x: 28, y: 58, width: '344px', fontSize: '15px', color: C.claudeMuted, textAlign: 'left', lineHeight: '1.6', padding: '0', fontFamily: C.fSource } },
      ], visible: true, props: {}, style: { x: 760, y: 480, width: '400px', minHeight: '150px', padding: '28px', backgroundColor: C.claudeCard, borderRadius: '8px', position: 'relative', border: '1px solid rgba(201,169,110,0.15)' } },

      // 底部数据条
      {
        id: nid(), type: 'container', children: [
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '4.9', level: 1 }, style: { x: 0, y: 24, width: '180px', fontSize: '48px', fontWeight: '700', color: C.claudeGold, textAlign: 'center', padding: '0', fontFamily: C.fPlayfair } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Average rating' }, style: { x: 0, y: 84, width: '180px', fontSize: '13px', color: C.claudeMuted, textAlign: 'center', padding: '0', fontFamily: C.fSource } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '12k', level: 1 }, style: { x: 220, y: 24, width: '180px', fontSize: '48px', fontWeight: '700', color: C.claudeGold, textAlign: 'center', padding: '0', fontFamily: C.fPlayfair } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Projects shipped' }, style: { x: 220, y: 84, width: '180px', fontSize: '13px', color: C.claudeMuted, textAlign: 'center', padding: '0', fontFamily: C.fSource } },
          { id: nid(), type: 'heading', children: [], visible: true, props: { text: '8+', level: 1 }, style: { x: 440, y: 24, width: '180px', fontSize: '48px', fontWeight: '700', color: C.claudeGold, textAlign: 'center', padding: '0', fontFamily: C.fPlayfair } },
          { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Years experience' }, style: { x: 440, y: 84, width: '180px', fontSize: '13px', color: C.claudeMuted, textAlign: 'center', padding: '0', fontFamily: C.fSource } },
        ], visible: true, props: {},
        style: { x: 80, y: 560, width: '620px', minHeight: '95px', padding: '24px 0', backgroundColor: 'transparent', borderRadius: '0', position: 'relative', borderTop: '1px solid rgba(201,169,110,0.2)', borderBottom: '1px solid rgba(201,169,110,0.2)' },
      },
    ],
    canvas: { backgroundColor: C.claudeBg, width: '1200px', height: '700px' },
  },

  // ═══════════════════════════════════════════════
  // 4. GitHub 暗色 — 等宽标签 + 磨砂卡片 + 紧凑排版
  // ═══════════════════════════════════════════════
  {
    id: 'github-dark',
    name: 'GitHub 暗色',
    description: 'GitHub 暗色风格，monospace 导航，磨砂玻璃卡片，H1:48px/1.2，正文:16px/1.6',
    preview: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #3fb950 100%)',
    nodes: [
      // 等宽导航
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'builder/forge' }, style: { x: 80, y: 36, fontSize: '16px', fontWeight: '600', color: C.ghBlue, textAlign: 'left', fontFamily: C.fJetBrains, padding: '0' } },

      // 两行大标题 — 48px
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: 'Build pages like\nGitHub repos.', level: 1 }, style: { x: 80, y: 110, width: '520px', fontSize: '48px', fontWeight: '700', color: '#e6edf3', textAlign: 'left', lineHeight: '1.2', padding: '0', fontFamily: C.fInter } },

      // 正文 — 16px
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'A page builder for developers who think in commits, branches, and clean diffs. Version your pages like code.' }, style: { x: 80, y: 260, width: '520px', fontSize: '16px', color: C.ghMuted, textAlign: 'left', lineHeight: '1.6', padding: '0', fontFamily: C.fInter } },

      // 双按钮
      { id: nid(), type: 'button', children: [], visible: true, props: { text: 'Star on GitHub' }, style: { x: 80, y: 350, fontSize: '14px', fontWeight: '600', color: C.white, backgroundColor: '#238636', padding: '10px 22px', borderRadius: '6px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(240,246,252,0.1)', fontFamily: C.fInter } },
      { id: nid(), type: 'button', children: [], visible: true, props: { text: 'Read the docs' }, style: { x: 260, y: 350, fontSize: '14px', fontWeight: '600', color: '#c9d1d9', backgroundColor: '#21262d', padding: '10px 22px', borderRadius: '6px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #30363d', fontFamily: C.fInter } },

      // 三张磨砂玻璃卡片
      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '⚡' }, style: { x: 24, y: 24, fontSize: '28px', textAlign: 'left', padding: '0' } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Zero config' }, style: { x: 24, y: 66, fontSize: '16px', fontWeight: '600', color: '#e6edf3', textAlign: 'left', padding: '0', fontFamily: C.fInter } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Drag, drop, export. No build tools, no config files, no lock-in.' }, style: { x: 24, y: 94, width: '300px', fontSize: '13px', color: C.ghMuted, textAlign: 'left', lineHeight: '1.55', padding: '0', fontFamily: C.fInter } },
      ], visible: true, props: {}, style: { x: 80, y: 450, width: '330px', minHeight: '150px', padding: '24px', backgroundColor: 'rgba(22,27,34,0.6)', borderRadius: '8px', position: 'relative', border: '1px solid rgba(48,54,61,0.8)', boxShadow: '0 0 0 1px rgba(240,246,252,0.04)' } },

      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '🔀' }, style: { x: 24, y: 24, fontSize: '28px', textAlign: 'left', padding: '0' } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Version control' }, style: { x: 24, y: 66, fontSize: '16px', fontWeight: '600', color: '#e6edf3', textAlign: 'left', padding: '0', fontFamily: C.fInter } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Branch your pages, revert changes, compare diffs — just like git.' }, style: { x: 24, y: 94, width: '300px', fontSize: '13px', color: C.ghMuted, textAlign: 'left', lineHeight: '1.55', padding: '0', fontFamily: C.fInter } },
      ], visible: true, props: {}, style: { x: 440, y: 450, width: '330px', minHeight: '150px', padding: '24px', backgroundColor: 'rgba(22,27,34,0.6)', borderRadius: '8px', position: 'relative', border: '1px solid rgba(48,54,61,0.8)', boxShadow: '0 0 0 1px rgba(240,246,252,0.04)' } },

      { id: nid(), type: 'container', children: [
        { id: nid(), type: 'text', children: [], visible: true, props: { text: '📦' }, style: { x: 24, y: 24, fontSize: '28px', textAlign: 'left', padding: '0' } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Export anywhere' }, style: { x: 24, y: 66, fontSize: '16px', fontWeight: '600', color: '#e6edf3', textAlign: 'left', padding: '0', fontFamily: C.fInter } },
        { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Clean HTML output. Deploy to Netlify, Vercel, or your own server.' }, style: { x: 24, y: 94, width: '300px', fontSize: '13px', color: C.ghMuted, textAlign: 'left', lineHeight: '1.55', padding: '0', fontFamily: C.fInter } },
      ], visible: true, props: {}, style: { x: 800, y: 450, width: '330px', minHeight: '150px', padding: '24px', backgroundColor: 'rgba(22,27,34,0.6)', borderRadius: '8px', position: 'relative', border: '1px solid rgba(48,54,61,0.8)', boxShadow: '0 0 0 1px rgba(240,246,252,0.04)' } },
    ],
    canvas: { backgroundColor: C.ghBg, width: '1200px', height: '680px' },
  },

  // ═══════════════════════════════════════════════
  // 5. 极简瑞士 — 超大标题(62px/1.05) + 全大写 + 直角按钮 + 大量留白
  // ═══════════════════════════════════════════════
  {
    id: 'swiss-minimal',
    name: '极简瑞士',
    description: '纯白底，62px 粗黑标题，全大写标签，4px 红分割线，直角按钮，极简装饰',
    preview: 'linear-gradient(135deg, #fcfcfc 0%, #e63946 50%, #1d1d1d 100%)',
    nodes: [
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'STUDIO' }, style: { x: 80, y: 50, fontSize: '13px', fontWeight: '700', color: C.swissDark, textAlign: 'left', letterSpacing: '0.15em', padding: '0', fontFamily: C.fHelvetica } },

      // 两行超大标题 — 62px, line-height: 1.05
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: 'We make things\nthat matter.', level: 1 }, style: { x: 80, y: 120, width: '580px', fontSize: '62px', fontWeight: '800', color: C.swissDark, textAlign: 'left', lineHeight: '1.05', letterSpacing: '-0.03em', padding: '0', fontFamily: C.fHelvetica } },

      // 4px 红分割线
      { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 80, y: 310, width: '60px', height: '4px', backgroundColor: C.swissAccent, display: 'block' } },

      // 正文 — 16px
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'A design studio focused on brand identity, digital products, and typographic systems. Based in Zurich, working worldwide.' }, style: { x: 80, y: 340, width: '500px', fontSize: '16px', color: C.swissMuted, textAlign: 'left', lineHeight: '1.7', padding: '0', fontFamily: C.fHelvetica } },

      // 全大写直角按钮
      { id: nid(), type: 'button', children: [], visible: true, props: { text: 'START A PROJECT' }, style: { x: 80, y: 450, fontSize: '13px', fontWeight: '700', color: C.white, backgroundColor: C.swissAccent, padding: '16px 40px', borderRadius: '2px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.1em', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'button', children: [], visible: true, props: { text: 'VIEW WORK' }, style: { x: 320, y: 450, fontSize: '13px', fontWeight: '700', color: C.swissDark, backgroundColor: 'transparent', padding: '16px 40px', borderRadius: '2px', textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '0.1em', border: '2px solid #1d1d1d', fontFamily: C.fHelvetica } },

      // 右侧大数字装饰 — 72px 浅灰
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '2014', level: 1 }, style: { x: 820, y: 120, width: '200px', fontSize: '72px', fontWeight: '800', color: '#e8e8e8', textAlign: 'right', padding: '0', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'ESTABLISHED' }, style: { x: 820, y: 210, width: '200px', fontSize: '11px', fontWeight: '700', color: C.swissMuted, textAlign: 'right', letterSpacing: '0.15em', padding: '0', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '87', level: 1 }, style: { x: 820, y: 260, width: '200px', fontSize: '72px', fontWeight: '800', color: '#e8e8e8', textAlign: 'right', padding: '0', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'PROJECTS SHIPPED' }, style: { x: 820, y: 350, width: '200px', fontSize: '11px', fontWeight: '700', color: C.swissMuted, textAlign: 'right', letterSpacing: '0.15em', padding: '0', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: '14', level: 1 }, style: { x: 820, y: 400, width: '200px', fontSize: '72px', fontWeight: '800', color: '#e8e8e8', textAlign: 'right', padding: '0', fontFamily: C.fHelvetica } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'GLOBAL CLIENTS' }, style: { x: 820, y: 490, width: '200px', fontSize: '11px', fontWeight: '700', color: C.swissMuted, textAlign: 'right', letterSpacing: '0.15em', padding: '0', fontFamily: C.fHelvetica } },
    ],
    canvas: { backgroundColor: C.swissBg, width: '1200px', height: '620px' },
  },

  // ═══════════════════════════════════════════════
  // 6. 杂志风 — 左图右文 + 大号衬线标题 + 作者署名
  // ═══════════════════════════════════════════════
  {
    id: 'magazine',
    name: '杂志风',
    description: '暖白底，左图右文布局，大号衬线标题(52px)，作者署名，阅读式排版',
    preview: 'linear-gradient(135deg, #faf9f7 0%, #d97706 50%, #1a1a1a 100%)',
    nodes: [
      // 栏目标签
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'ESSAY' }, style: { x: 80, y: 40, fontSize: '12px', fontWeight: '700', color: C.magAccent, textAlign: 'left', letterSpacing: '0.2em', padding: '0', fontFamily: C.fLora } },

      // 左侧图片占位
      { id: nid(), type: 'image', children: [], visible: true, props: { src: '', alt: 'Feature image' }, style: { x: 80, y: 90, width: '480px', height: '400px', backgroundColor: '#e7e0d8', borderRadius: '4px' } },

      // 右侧文字区
      { id: nid(), type: 'heading', children: [], visible: true, props: { text: 'The Art of\nQuiet Design', level: 1 }, style: { x: 620, y: 90, width: '500px', fontSize: '52px', fontWeight: '700', color: C.magDark, textAlign: 'left', lineHeight: '1.1', letterSpacing: '-0.02em', padding: '0', fontFamily: C.fCormorant } },

      // 作者 + 日期
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'By Sarah Chen · June 2024' }, style: { x: 620, y: 240, fontSize: '14px', fontWeight: '500', color: C.magAccent, textAlign: 'left', padding: '0', fontFamily: C.fLora } },

      // 摘要正文 — 长段落，适合阅读
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'In an age of maximalism, the quietest designs often speak the loudest. This is not about minimalism as an aesthetic — it is about intentionality, restraint, and the courage to leave things out.' }, style: { x: 620, y: 275, width: '500px', fontSize: '17px', color: C.magMuted, textAlign: 'left', lineHeight: '1.75', padding: '0', fontFamily: C.fLora } },

      // 继续阅读
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Continue reading →' }, style: { x: 620, y: 440, fontSize: '15px', fontWeight: '600', color: C.magDark, textAlign: 'left', padding: '0', fontFamily: C.fLora } },

      // 底部相关文章（三张小卡片）
      { id: nid(), type: 'divider', children: [], visible: true, props: {}, style: { x: 80, y: 540, width: '1040px', height: '1px', backgroundColor: '#e0dcd5', display: 'block' } },
      { id: nid(), type: 'text', children: [], visible: true, props: { text: 'Related' }, style: { x: 80, y: 565, fontSize: '12px', fontWeight: '700', color: C.magMuted, textAlign: 'left', letterSpacing: '0.15em', padding: '0', fontFamily: C.fLora } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: 'Typography as Architecture', subtitle: 'How type structures the reading experience', titleFontSize: '16px', titleColor: C.magDark, subtitleFontSize: '13px', subtitleColor: C.magMuted }, style: { x: 80, y: 600, width: '320px', padding: '20px', backgroundColor: C.white, borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fLora } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: 'Color in Digital Spaces', subtitle: 'Beyond the hex code — a philosophy of hue', titleFontSize: '16px', titleColor: C.magDark, subtitleFontSize: '13px', subtitleColor: C.magMuted }, style: { x: 440, y: 600, width: '320px', padding: '20px', backgroundColor: C.white, borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fLora } },
      { id: nid(), type: 'card', children: [], visible: true, props: { text: 'The Grid Redux', subtitle: 'Why structure still matters in a fluid web', titleFontSize: '16px', titleColor: C.magDark, subtitleFontSize: '13px', subtitleColor: C.magMuted }, style: { x: 800, y: 600, width: '320px', padding: '20px', backgroundColor: C.white, borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: C.fLora } },
    ],
    canvas: { backgroundColor: C.magBg, width: '1200px', height: '760px' },
  },

  // ═══════════════════════════════════════════════
  // 7. 空白页
  // ═══════════════════════════════════════════════
  {
    id: 'blank',
    name: '空白页',
    description: '从零开始，自由创建',
    preview: 'linear-gradient(135deg, #e5e7eb 0%, #ffffff 100%)',
    nodes: [],
    canvas: { backgroundColor: '#ffffff', width: '1200px', height: '800px' },
  },
]