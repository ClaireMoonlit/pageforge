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

function findNode(nodes: any[], test: (n: any) => boolean): any {
  for (const n of nodes) {
    if (test(n)) return n
    if (n.children) {
      const f = findNode(n.children, test)
      if (f) return f
    }
  }
  return null
}

function findAll(nodes: any[], test: (n: any) => boolean, results: any[] = []): any[] {
  for (const n of nodes) {
    if (test(n)) results.push(n)
    if (n.children) findAll(n.children, test, results)
  }
  return results
}

// 找所有 "Be Part" 相关元素
const bePartItems = findAll(result, (n) => {
  const text = n.props?.text || ''
  return /Be Part/.test(text)
})

console.log('=== Be Part elements found ===')
for (const item of bePartItems) {
  console.log('\ntype:', item.type)
  console.log('level:', item.props?.level)
  console.log('text:', JSON.stringify(item.props?.text))
  console.log('class:', item.props?.class)
  console.log('style:', JSON.stringify(item.style, null, 2))
}

// 也找 timeline-image 元素看它们的样式
const timelineImages = findAll(result, (n) => {
  const cls = n.props?.class || ''
  return /\btimeline-image\b/.test(cls)
})
console.log(`\n=== timeline-image elements: ${timelineImages.length} ===`)
for (let i = 0; i < timelineImages.length; i++) {
  const ti = timelineImages[i]
  console.log(`\ntimeline-image[${i}]:`)
  console.log('  class:', ti.props?.class)
  console.log('  text:', JSON.stringify((ti.props?.text || '').substring(0, 50)))
  console.log('  position:', ti.style?.position, 'left:', ti.style?.left, 'marginLeft:', ti.style?.marginLeft)
  console.log('  width:', ti.style?.width, 'height:', ti.style?.height)
  console.log('  bg:', ti.style?.backgroundColor, 'borderRadius:', ti.style?.borderRadius, 'border:', ti.style?.border)
  console.log('  color:', ti.style?.color, 'textAlign:', ti.style?.textAlign)
  console.log('  zIndex:', ti.style?.zIndex)
  console.log('  display:', ti.style?.display, 'alignItems:', ti.style?.alignItems, 'justifyContent:', ti.style?.justifyContent)
  console.log('  children:', ti.children?.length)
  for (const c of ti.children || []) {
    console.log(`    child type=${c.type} text=${JSON.stringify((c.props?.text || '').substring(0, 50))}`)
  }
}
