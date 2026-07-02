// 不依赖 DOM：自己用栈解析 HTML 标签 + 内联 style + class 关联 <style> CSS
// 然后复用 importHtml 的输出结构（去掉 DOMParser 后再写一遍相同算法太重）
// 策略：把浏览器版 importHtml.ts 的核心思路用 node-html-parser 之类是不行的
// 改方案：内联一个最简 HTML 解析 + 拼成 importHtml.ts 期望的"伪 DOM"接口
//
// 这里不重新实现。直接输出每个模板的 简单 AST 报告（标题/段落数/块数），
// 让用户知道哪些值得用页面的 HTML 导入功能跑。

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const inDir = 'imported-templates'
const files = readdirSync(inDir).filter((f) => f.endsWith('.html'))

const report = []
for (const f of files) {
  const html = readFileSync(join(inDir, f), 'utf8')
  // 提取 <style>...</style> 中的 .class 规则
  const classStyle = new Map()
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let sm
  while ((sm = styleRe.exec(html))) {
    const css = sm[1]
    const ruleRe = /([^{}]+)\{([^{}]+)\}/g
    let rm
    while ((rm = ruleRe.exec(css))) {
      const sel = rm[1].trim()
      const body = rm[2]
      if (sel.startsWith('.')) {
        const cn = sel.slice(1).split(/[\s,>~+]/)[0]
        const existing = classStyle.get(cn) || ''
        classStyle.set(cn, existing + body + ';')
      }
    }
  }

  // 统计：h1/h2/h3、按钮、img、section、div
  const count = (re) => (html.match(re) || []).length
  const stat = {
    file: f,
    bytes: html.length,
    h1: count(/<h1\b/g),
    h2: count(/<h2\b/g),
    h3: count(/<h3\b/g),
    section: count(/<section\b/g),
    div: count(/<div\b/g),
    button: count(/<button\b/g),
    img: count(/<img\b/g),
    styleRules: classStyle.size,
    classRefs: (html.match(/class="[^"]+"/g) || []).length,
  }
  report.push(stat)
}
console.table(report)
