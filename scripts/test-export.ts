/**
 * 命令行测试导出函数
 * 用法: npx tsx scripts/test-export.ts
 * 
 * 测试场景：
 * 1. 基础绝对定位导出
 * 2. 响应式 CSS 生成
 * 3. 行分组逻辑
 * 4. 包含交互的导出
 */

import { buildHtml } from '../src/utils/exportHtml'
import type { CanvasNode, CanvasConfig } from '../src/types'

// ---- 测试 1: 基础导出 ----
const canvas: CanvasConfig = {
  width: '1200px',
  height: '800px',
  backgroundColor: '#ffffff',
}

const nodes: CanvasNode[] = [
  {
    id: 'heading-1',
    type: 'heading',
    visible: true,
    props: { level: 1, text: '欢迎来到 PageForge' },
    style: {
      x: 100, y: 40,
      width: '600px',
      fontSize: '36px',
      fontWeight: '700',
      color: '#1f2937',
      fontFamily: '"Playfair Display", serif',
    },
    children: [],
  },
  {
    id: 'text-1',
    type: 'text',
    visible: true,
    props: { text: '这是一段描述文字，用于测试响应式导出效果。在手机上应该会堆叠显示。' },
    style: {
      x: 100, y: 120,
      width: '500px',
      fontSize: '16px',
      color: '#6b7280',
      lineHeight: '1.8',
    },
    children: [],
  },
  {
    id: 'button-1',
    type: 'button',
    visible: true,
    props: { text: '立即开始' },
    style: {
      x: 100, y: 220,
      width: '160px',
      height: '48px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#ffffff',
      backgroundColor: '#6366f1',
      borderRadius: '8px',
      textAlign: 'center',
    },
    children: [],
  },
  {
    id: 'image-1',
    type: 'image',
    visible: true,
    props: { src: 'https://picsum.photos/400/300', alt: '示例图片' },
    style: {
      x: 700, y: 40,
      width: '400px',
      height: '300px',
      borderRadius: '12px',
    },
    children: [],
  },
  // 第二行：与第一行 y 不重叠，测试分行
  {
    id: 'heading-2',
    type: 'heading',
    visible: true,
    props: { level: 2, text: '功能特性' },
    style: {
      x: 100, y: 380,
      width: '400px',
      fontSize: '28px',
      fontWeight: '600',
      color: '#1f2937',
    },
    children: [],
  },
  {
    id: 'text-2',
    type: 'text',
    visible: true,
    props: { text: '拖拽式搭建 · 所见即所得 · 一键导出 HTML · 响应式适配' },
    style: {
      x: 100, y: 440,
      width: '600px',
      fontSize: '14px',
      color: '#9ca3af',
      lineHeight: '1.6',
    },
    children: [],
  },
  // 导航栏组件
  {
    id: 'navbar-1',
    type: 'navbar',
    visible: true,
    props: {
      logo: 'PageForge',
      navLinks: '首页,功能,模板,关于',
      linkColor: '#374151',
    },
    style: {
      x: 0, y: 0,
      width: '1200px',
      height: '64px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      padding: '0 40px',
      fontSize: '16px',
    },
    children: [],
  },
]

console.log('=== 测试导出 ===')
const html = buildHtml(nodes, canvas)

// 检查关键内容
const checks = [
  { name: 'DOCTYPE', pass: html.includes('<!DOCTYPE html>') },
  { name: 'pf-root', pass: html.includes('class="pf-root"') },
  { name: '响应式 - 平板断点', pass: html.includes('min-width:769px) and (max-width:1024px)') },
  { name: '响应式 - 手机断点', pass: html.includes('max-width:768px') },
  { name: '绝对定位', pass: html.includes('position:absolute') },
  { name: 'heading 元素', pass: html.includes('data-pf-type="heading"') },
  { name: 'button 元素', pass: html.includes('data-pf-type="button"') },
  { name: 'navbar 元素', pass: html.includes('data-pf-type="navbar"') },
  { name: 'image 元素', pass: html.includes('data-pf-type="image"') },
  { name: 'Google Fonts (Playfair)', pass: html.includes('Playfair+Display') },
  { name: 'viewport meta', pass: html.includes('viewport') },
]

let passCount = 0
for (const c of checks) {
  console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`)
  if (c.pass) passCount++
}

console.log(`\n${passCount}/${checks.length} 项检查通过`)
console.log(`\n导出 HTML 长度: ${html.length} 字符`)

// 保存到文件方便查看
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outPath = path.resolve(__dirname, '../test-export-output.html')
fs.writeFileSync(outPath, html, 'utf-8')
console.log(`已保存到: ${outPath}`)
console.log('用浏览器打开该文件，然后调整窗口大小测试响应式效果')