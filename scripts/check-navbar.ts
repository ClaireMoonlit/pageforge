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

function findByClass(nodes: any[], cls: string): any | null {
  for (const n of nodes) {
    if (n.props?.class && new RegExp('\\b' + cls + '\\b').test(n.props.class)) return n
    if (n.children) {
      const r = findByClass(n.children, cls)
      if (r) return r
    }
  }
  return null
}

const navbar = findByClass(result, 'navbar')
console.log('Navbar found:', !!navbar)
if (navbar) {
  console.log('Navbar style:')
  for (const [k, v] of Object.entries(navbar.style)) {
    if (v) console.log(`  ${k}: ${v}`)
  }
  console.log('Navbar children count:', navbar.children?.length)
}

const navUL = findByClass(result, 'navbar-nav')
console.log('\nUL.navbar-nav found:', !!navUL)
if (navUL) {
  console.log('UL style:')
  for (const [k, v] of Object.entries(navUL.style)) {
    if (v) console.log(`  ${k}: ${v}`)
  }
  console.log('UL type:', navUL.type)
  console.log('UL children count:', navUL.children?.length)
  for (let i = 0; i < Math.min(navUL.children?.length || 0, 3); i++) {
    const li = navUL.children[i]
    console.log(`\n  LI ${i} style:`)
    for (const [k, v] of Object.entries(li.style)) {
      if (v) console.log(`    ${k}: ${v}`)
    }
  }
}

const navItem = findByClass(result, 'nav-item')
console.log('\nnav-item found:', !!navItem)
if (navItem) {
  console.log('nav-item style:')
  for (const [k, v] of Object.entries(navItem.style)) {
    if (v) console.log(`  ${k}: ${v}`)
  }
}

const navLink = findByClass(result, 'nav-link')
console.log('\nnav-link found:', !!navLink)
if (navLink) {
  console.log('nav-link style:')
  for (const [k, v] of Object.entries(navLink.style)) {
    if (v) console.log(`  ${k}: ${v}`)
  }
}
