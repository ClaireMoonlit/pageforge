import { JSDOM } from 'jsdom'
import { htmlToNodes } from './src/utils/importHtml'
import * as fs from 'fs'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(global as any).DOMParser = dom.window.DOMParser
;(global as any).Node = dom.window.Node
;(global as any).Element = dom.window.Element

const html = fs.readFileSync('./public/imported-templates/ready-agency.html', 'utf-8')
const nodes = htmlToNodes(html, 'http://localhost:5173/imported-templates/')

// Find the timeline (the parent we care about)
function findAll(nodes: any[], pred: (n: any) => boolean): any[] {
  const result: any[] = []
  for (const n of nodes) {
    if (pred(n)) result.push(n)
    if (n.children) result.push(...findAll(n.children, pred))
  }
  return result
}

const timelines = findAll(nodes, (n) => /\btimeline\b/.test(n.props?.class || '') && n.type === 'container')
console.log('Timeline count:', timelines.length)
for (const tl of timelines) {
  console.log('\n=== Timeline Node ===')
  console.log('  id:', tl.id)
  console.log('  class:', tl.props?.class)
  console.log('  x:', tl.style?.x, 'y:', tl.style?.y)
  console.log('  width:', tl.style?.width)
  console.log('  position:', tl.style?.position)
  console.log('  padding:', tl.style?.padding, 'padLeft:', tl.style?.paddingLeft, 'padRight:', tl.style?.paddingRight)
  console.log('  marginLeft:', tl.style?.marginLeft, 'marginRight:', tl.style?.marginRight)
  console.log('  All style keys:', Object.keys(tl.style || {}).join(','))
  console.log('  children count:', tl.children?.length)
  for (let i = 0; i < (tl.children || []).length; i++) {
    const c = tl.children[i]
    console.log(`  child[${i}]: class=${(c.props?.class || '(none)').substring(0, 30)} type=${c.type} w=${c.style?.width} x=${c.style?.x}`)
    if (/\b(timeline|li)\b/.test(c.props?.class || '') || c.props?.class === undefined) {
      console.log(`    style keys:`, Object.keys(c.style || {}).join(','))
      console.log(`    pad:`, c.style?.padding, 'padLeft:', c.style?.paddingLeft)
    }
  }
}
