// 把同名的 .min.css 注入到对应 .html 的 <head> 末尾的 <style> 标签里
// 这样后续可以直接在浏览器里用 importHtml.ts 解析（DOMParser 在浏览器里可用）
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'imported-templates'
const htmls = readdirSync(dir).filter((f) => f.startsWith('sb-') && f.endsWith('.html'))
for (const f of htmls) {
  const name = f.replace(/^sb-/, '').replace(/\.html$/, '')
  const cssName = `${name}.min.css`
  const cssPath = join(dir, cssName)
  if (!existsSync(cssPath)) {
    console.log(`skip ${f}: no css`)
    continue
  }
  const html = readFileSync(join(dir, f), 'utf8')
  const css = readFileSync(cssPath, 'utf8')
  // 删除外部 <link href="css/styles.css" rel="stylesheet" /> 引用
  let out = html.replace(/<link\s+href=["']css\/styles\.css["'][^>]*>\s*/gi, '')
  // 注入到 </head> 之前
  const styleTag = `\n<style id="injected-from-${cssName}">\n${css}\n</style>\n`
  if (out.includes('</head>')) {
    out = out.replace('</head>', `${styleTag}</head>`)
  } else {
    out = styleTag + out
  }
  const outName = `ready-${name}.html`
  writeFileSync(join(dir, outName), out, 'utf8')
  console.log(`${outName} -> ${(out.length / 1024).toFixed(0)}KB`)
}
