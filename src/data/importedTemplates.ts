import type { CanvasConfig } from '@/types'

export interface ImportedTemplateMeta {
  id: string
  name: string
  description: string
  preview: string
  /** 相对于 public/ 的 JSON 文件路径 */
  jsonPath: string
  /** 相对 public/ 的内联 CSS 版 HTML 文件路径（用于"重新生成"） */
  htmlPath?: string
  /** 默认画布配置（JSON 里有但作为 fallback） */
  canvas: CanvasConfig
}

export const importedTemplates: ImportedTemplateMeta[] = [
  {
    id: 'sb-agency',
    name: 'Agency',
    description: '设计公司风格 · 5 区块 · 30 张图 · 275 节点',
    preview: 'linear-gradient(135deg, #ffc107 0%, #212529 100%)',
    jsonPath: '/imported-templates/agency.json',
    htmlPath: '/imported-templates/ready-agency.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-freelancer',
    name: 'Freelancer',
    description: '自由职业者作品集 · 241 节点 · 14 按钮',
    preview: 'linear-gradient(135deg, #1abc9c 0%, #2c3e50 100%)',
    jsonPath: '/imported-templates/freelancer.json',
    htmlPath: '/imported-templates/ready-freelancer.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-new-age',
    name: 'New Age',
    description: 'App 推广落地页 · 149 节点 · 含视频组件',
    preview: 'linear-gradient(135deg, #2937f0 0%, #9f1ae2 100%)',
    jsonPath: '/imported-templates/new-age.json',
    htmlPath: '/imported-templates/ready-new-age.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-modern-business',
    name: 'Modern Business',
    description: '商务多页风格 · 134 节点 · 8 张图',
    preview: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)',
    jsonPath: '/imported-templates/modern-business.json',
    htmlPath: '/imported-templates/ready-modern-business.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-creative',
    name: 'Creative',
    description: '创意工作室风格 · 118 节点',
    preview: 'linear-gradient(135deg, #f4623a 0%, #d63720 100%)',
    jsonPath: '/imported-templates/creative.json',
    htmlPath: '/imported-templates/ready-creative.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-landing-page',
    name: 'Landing Page',
    description: '通用落地页 · 120 节点 · 简洁大气',
    preview: 'linear-gradient(135deg, #0066ff 0%, #00ccff 100%)',
    jsonPath: '/imported-templates/landing-page.json',
    htmlPath: '/imported-templates/ready-landing-page.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-resume',
    name: 'Resume',
    description: '个人简历模板 · 116 节点 · 6 区块',
    preview: 'linear-gradient(135deg, #bd5d38 0%, #6c3420 100%)',
    jsonPath: '/imported-templates/resume.json',
    htmlPath: '/imported-templates/ready-resume.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-grayscale',
    name: 'Grayscale',
    description: '极简灰阶风格 · 102 节点 · 4 区块',
    preview: 'linear-gradient(135deg, #343a40 0%, #000000 100%)',
    jsonPath: '/imported-templates/grayscale.json',
    htmlPath: '/imported-templates/ready-grayscale.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
  {
    id: 'sb-clean-blog',
    name: 'Clean Blog',
    description: '干净博客风格 · 47 节点 · 极简排版',
    preview: 'linear-gradient(135deg, #6c757d 0%, #212529 100%)',
    jsonPath: '/imported-templates/clean-blog.json',
    htmlPath: '/imported-templates/ready-clean-blog.html',
    canvas: { width: '1200px', height: '2000px', backgroundColor: '#ffffff' },
  },
]