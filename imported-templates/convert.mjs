// 用 tsx 跑（已通过 node --import tsx）
// 直接走 importHtml.ts 的 htmlToNodes，把每个开源模板 HTML 转成节点 JSON，
// 输出到 imported-templates/out/<name>.json，并打印每个文件的关键统计。
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { htmlToNodes } from '../src/utils/importHtml.ts'

const inDir = 'imported-templates'
const outDir = 'imported-templates/out'
mkdirSync(outDir, { recursive: true })

const files = readdirSync(inDir).filter((f) => f.endsWith('.html'))
const summary = []
for (const f of files) {
  const name = basename(f, extname(f))
  const html = readFileSync(join(inDir, f), 'utf8')
  try {
    const nodes = htmlToNodes(html)
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(nodes, null, 2))
    const countNodes = (n) => 1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0)
    const total = nodes.reduce((a, n) => a + countNodes(n), 0)
    const types = new Set()
    const walk = (n) => { types.add(n.type); (n.children || []).forEach(walk) }
    nodes.forEach(walk)
    const size = statSync(join(outDir, `${name}.json`)).size
    summary.push({ name, rootNodes: nodes.length, totalNodes: total, types: [...types].join(','), jsonKB: Math.round(size / 1024) })
  } catch (e) {
    summary.push({ name, error: e.message })
  }
}
console.table(summary)
