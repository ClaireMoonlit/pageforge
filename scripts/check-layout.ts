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

console.log('Result length:', result.length)
console.log('First node type:', result[0].type)
console.log('First node props:', JSON.stringify(result[0].props))

// 深度打印
function dumpAll(node: any, depth = 0) {
  if (depth > 12) return
  const indent = '  '.repeat(depth)
  const t = node.props?.text
  console.log(indent + node.type + (t ? ' text=' + JSON.stringify(t.substring(0, 30)) : ''))
  if (node.children) {
    for (const c of node.children) dumpAll(c, depth + 1)
  }
}
console.log('\n=== Full tree of result[4] (About) ===')
dumpAll(result[4])

// 用 grep
function grepText(node: any, sub: string, results: any[] = []): any[] {
  const text = node.props?.text
  if (typeof text === 'string') {
    const lc = text.toLowerCase()
    const subLc = sub.toLowerCase()
    if (lc.includes(subLc)) {
      results.push(node)
    }
  }
  if (node.children) for (const c of node.children) results.push(...grepText(c, sub, results))
  return results
}
console.log('\n=== Direct recursive search ===')
function searchAll(node: any, depth = 0, results: any[] = []) {
  const t = node.props?.text
  if (typeof t === 'string') {
    if (t.includes('Be Part') || t.includes('be part') || t.includes('Be') || t.includes('be')) {
      results.push({ depth, type: node.type, text: t })
    }
  }
  if (node.children) for (const c of node.children) searchAll(c, depth + 1, results)
  return results
}
const allMatches = searchAll(result)
console.log('All matches with "Be" or "be":', allMatches.length)
allMatches.forEach(m => console.log('  depth=' + m.depth + ' type=' + m.type + ' text=' + JSON.stringify(m.text)))

console.log('\n=== Direct deep inspect of result[4] ===')
function inspect(n: any, depth = 0) {
  const indent = '  '.repeat(depth)
  const childCount = n.children?.length ?? 0
  console.log(indent + '[' + depth + '] type=' + n.type + ' x=' + n.style?.x + ' y=' + n.style?.y + ' w=' + n.style?.width + ' h=' + n.style?.height + ' childCount=' + childCount + ' text=' + JSON.stringify((n.props?.text || '').substring(0, 20)))
  if (depth < 5 && n.children) {
    for (const c of n.children) inspect(c, depth + 1)
  }
}
inspect(result[4])
console.log('\n=== Direct manual search ===')
const h4 = result[4].children?.[0]?.children?.[1]?.children?.[4]?.children?.[0]?.children?.[0]
console.log('h4 node found:', !!h4)
if (h4) {
  console.log('h4 type=' + h4.type)
  console.log('h4 keys=' + Object.keys(h4))
  console.log('h4.props=' + JSON.stringify(h4.props))
  console.log('h4.props.text=' + JSON.stringify(h4.props?.text))
  console.log('text includes Be Part:', h4.props?.text?.includes('Be Part'))
}
