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

console.log('Total root elements:', result.length)
for (let i = 0; i < result.length; i++) {
  const r = result[i]
  console.log(`Result[${i}]: type=${r.type} id=${r.id.slice(-6)} text=${JSON.stringify((r.props?.text || '').substring(0, 40))} childCount=${r.children?.length || 0} x=${r.style?.x} y=${r.style?.y} w=${r.style?.width} h=${r.style?.height}`)
}
