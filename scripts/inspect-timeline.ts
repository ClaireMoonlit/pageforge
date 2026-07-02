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

// 找到 about 容器，然后找到时间轴 ul
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

const about = result[4]  // About section
console.log('About (result[4]) type:', about.type, 'text:', JSON.stringify((about.props?.text || '').substring(0, 30)))
console.log('About children count:', about.children?.length)

// 找 ul.timeline（5个 li 子节点的容器）
function findTimelineUL(node: any, depth = 0): any {
  if (!node.children) return null
  if (depth > 20) return null
  for (const c of node.children) {
    if (c.type === 'container' && c.children && c.children.length >= 4) {
      const firstChildText = c.children[0]?.props?.text || ''
      // 包含时间信息的容器
      if (firstChildText.includes('2009-2011') || firstChildText.includes('March 2011') || firstChildText.includes('Be Part')) {
        console.log('Found container at depth ' + depth + ' with first child text: ' + firstChildText.substring(0, 30))
        return c
      }
    }
    const r = findTimelineUL(c, depth + 1)
    if (r) return r
  }
  return null
}

const ul = findTimelineUL(about)
console.log('UL found:', !!ul)
if (ul) {
  console.log('UL children count:', ul.children.length)
  for (let i = 0; i < ul.children.length; i++) {
    const li = ul.children[i]
    console.log(`\n=== LI ${i} ===`)
    console.log('  type:', li.type)
    console.log('  style.x:', li.style.x, 'y:', li.style.y)
    console.log('  style.width:', li.style.width, 'height:', li.style.height)
    console.log('  style.position:', li.style.position)
    console.log('  style.display:', li.style.display)
    console.log('  style.minHeight:', li.style.minHeight)
    console.log('  style.marginBottom:', li.style.marginBottom)
    console.log('  children count:', li.children?.length)
    for (let j = 0; j < (li.children?.length || 0); j++) {
      const c = li.children[j]
      console.log(`    Child ${j}: type=${c.type} x=${c.style?.x} y=${c.style?.y} w=${c.style?.width} h=${c.style?.height} bg=${c.style?.backgroundColor} pos=${c.style?.position} display=${c.style?.display}`)
      if (c.children) {
        for (let k = 0; k < c.children.length; k++) {
          const cc = c.children[k]
          console.log(`      Grandchild ${k}: type=${cc.type} x=${cc.style?.x} y=${cc.style?.y} w=${cc.style?.width} h=${cc.style?.height} pos=${cc.style?.position} display=${cc.style?.display}`)
        }
      }
    }
  }
}
