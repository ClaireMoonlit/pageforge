// 把 ready-*.html 里的 assets/ 路径重写为 assets-{name}/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'public/imported-templates'
const files = readdirSync(dir).filter((f) => f.startsWith('ready-') && f.endsWith('.html'))
for (const f of files) {
  const name = f.replace(/^ready-/, '').replace(/\.html$/, '')
  const html = readFileSync(join(dir, f), 'utf8')
  // 把所有 "assets/ 或 'assets/ 替换为 assets-{name}/
  const rewritten = html
    .replace(/(["'])assets\//g, `$1assets-${name}/`)
    .replace(/(url\()assets\//g, `$1assets-${name}/`)
  writeFileSync(join(dir, f), rewritten, 'utf8')
  const matches = (html.match(/assets-/g) || []).length
  console.log(`${f} -> ${matches} paths rewritten`)
}
