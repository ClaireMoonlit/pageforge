import { JSDOM } from 'jsdom'
import { htmlToNodes } from '../src/utils/importHtml'
import * as fs from 'fs'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(global as any).DOMParser = dom.window.DOMParser
;(global as any).Node = dom.window.Node
;(global as any).Element = dom.window.Element

const html = fs.readFileSync('./public/imported-templates/ready-agency.html', 'utf-8')
const nodes = htmlToNodes(html, 'http://localhost:5173/imported-templates/')

// Find the Be Part element
function findAll(nodes: any[], pred: (n: any) => boolean): any[] {
  const result: any[] = []
  for (const n of nodes) {
    if (pred(n)) result.push(n)
    if (n.children) result.push(...findAll(n.children, pred))
  }
  return result
}

// Find timeline-image elements with "Be Part" text
const bePartImages = findAll(nodes, (n) =>
  n.type === 'container' && /\btimeline-image\b/.test(n.props?.class || '') &&
  n.children?.some((c: any) => (c.props?.text || '').includes('Be Part'))
)

console.log('Be Part timeline-image found:', bePartImages.length)
for (const img of bePartImages) {
  console.log('  id:', img.id)
  console.log('  x:', img.style?.x, 'y:', img.style?.y)
  console.log('  width:', img.style?.width, 'height:', img.style?.height)
  console.log('  position:', img.style?.position)
  console.log('  display:', img.style?.display)
  console.log('  parent id:', img.props?.parentId)
}

// Find the parent li
const lis = findAll(nodes, (n) => n.type === 'container' && n.tagName === 'li' && /\btimeline-inverted\b/.test(n.props?.class || ''))
console.log('\nInverted lis found:', lis.length)
for (const li of lis.slice(-1)) {  // last inverted li (Be Part)
  console.log('  id:', li.id)
  console.log('  x:', li.style?.x, 'y:', li.style?.y)
  console.log('  width:', li.style?.width)
  console.log('  position:', li.style?.position)
  console.log('  display:', li.style?.display)
  console.log('  children count:', li.children?.length)
  for (let i = 0; i < (li.children || []).length; i++) {
    const c = li.children[i]
    console.log(`    child[${i}]: class=${(c.props?.class || '(none)').substring(0, 30)} x=${c.style?.x} y=${c.style?.y} w=${c.style?.width}`)
  }
}
