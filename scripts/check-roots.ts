import { JSDOM } from 'jsdom'
const dom = new JSDOM('')
// @ts-ignore
globalThis.DOMParser = dom.window.DOMParser
// @ts-ignore
globalThis.Node = dom.window.Node
// @ts-ignore
globalThis.Element = dom.window.Element

const { htmlToNodes } = await import('../src/utils/importHtml.ts')
import { readFileSync } from 'node:fs'

const html = readFileSync('public/imported-templates/ready-agency.html', 'utf8')
const result = htmlToNodes(html, '')

console.log('Total root nodes:', result.length)
let cumulativeY = 0
for (let i = 0; i < result.length; i++) {
  const n = result[i]
  const text = (n.props?.text || '').substring(0, 30)
  const y = n.style?.y ?? 0
  const minH = n.style?.minHeight
  console.log(`[${i}] type=${n.type} y=${y} minH=${minH} text="${text}" gap=${y - cumulativeY}`)
  cumulativeY = y
}
