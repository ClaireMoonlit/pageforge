import { JSDOM } from 'jsdom'
import { htmlToNodes } from './src/utils/importHtml'
import * as fs from 'fs'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(global as any).DOMParser = dom.window.DOMParser
;(global as any).Node = dom.window.Node
;(global as any).Element = dom.window.Element

const html = fs.readFileSync('./public/imported-templates/ready-agency.html', 'utf-8')
const nodes = htmlToNodes(html, 'http://localhost:5173/imported-templates/')

// Find timeline node
function findAll(nodes: any[], pred: (n: any) => boolean): any[] {
  const result: any[] = []
  for (const n of nodes) {
    if (pred(n)) result.push(n)
    if (n.children) result.push(...findAll(n.children, pred))
  }
  return result
}

const timelines = findAll(nodes, (n) => /\btimeline\b/.test(n.props?.class || '') && n.type === 'container')
console.log('Timeline containers found:', timelines.length)

for (const tl of timelines) {
  console.log('\n=== Timeline ===')
  console.log('  id:', tl.id)
  console.log('  type:', tl.type)
  console.log('  class:', tl.props?.class)
  console.log('  position:', tl.style?.position)
  console.log('  display:', tl.style?.display)
  console.log('  width:', tl.style?.width)
  console.log('  children count:', tl.children?.length)
  for (let i = 0; i < (tl.children || []).length; i++) {
    const c = tl.children[i]
    console.log(`  child[${i}]:`)
    console.log(`    type: ${c.type}`)
    console.log(`    class: ${c.props?.class || '(no class)'}`)
    console.log(`    position: ${c.style?.position}`)
    console.log(`    display: ${c.style?.display}`)
    console.log(`    width: ${c.style?.width}`)
    console.log(`    height: ${c.style?.height}`)
    console.log(`    x: ${c.style?.x}, y: ${c.style?.y}`)
    console.log(`    minHeight: ${c.style?.minHeight}`)
    console.log(`    children count: ${c.children?.length || 0}`)
    if (c.children && c.children.length > 0 && c.children.length <= 3) {
      for (let j = 0; j < c.children.length; j++) {
        const gc = c.children[j]
        console.log(`    grandchild[${j}]: type=${gc.type}, class=${gc.props?.class || '(no class)'}, text=${(gc.props?.text || gc.props?.subtitle || '').substring(0, 50)}`)
      }
    }
  }
}
