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

const timelines = findAll(nodes, (n) => /\btimeline\b/.test(n.props?.class || '') && n.type === 'container' && n.children?.length > 3)
console.log('Timeline count:', timelines.length)
for (const tl of timelines) {
  console.log('\n=== Timeline Node ===')
  console.log('  id:', tl.id)
  console.log('  x:', tl.style?.x, 'y:', tl.style?.y)
  console.log('  width:', tl.style?.width)
  console.log('  pad: L=' + tl.style?.paddingLeft + ' R=' + tl.style?.paddingRight + ' T=' + tl.style?.paddingTop + ' B=' + tl.style?.paddingBottom)

  for (let i = 0; i < (tl.children || []).length; i++) {
    const c = tl.children[i]
    console.log(`  child[${i}]: class=${(c.props?.class || '(none)').substring(0, 30)} x=${c.style?.x} y=${c.style?.y} w=${c.style?.width} padL=${c.style?.paddingLeft} padR=${c.style?.paddingRight}`)
    if (c.children) {
      for (let j = 0; j < c.children.length; j++) {
        const gc = c.children[j]
        console.log(`    gc[${j}]: class=${(gc.props?.class || '(none)').substring(0, 30)} x=${gc.style?.x} y=${gc.style?.y} w=${gc.style?.width} padL=${gc.style?.paddingLeft} padR=${gc.style?.paddingRight}`)
        if (gc.children) {
          for (let k = 0; k < gc.children.length; k++) {
            const ggc = gc.children[k]
            console.log(`      ggc[${k}]: class=${(ggc.props?.class || '(none)').substring(0, 30)} x=${ggc.style?.x} y=${ggc.style?.y} w=${ggc.style?.width} text="${(ggc.props?.text || '').substring(0, 30)}"`)
          }
        }
      }
    }
  }
}
