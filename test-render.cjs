const fs = require('fs')
const j = JSON.parse(fs.readFileSync('public/imported-templates/agency.json', 'utf8'))

function render(n, px, py, depth) {
  if (depth > 5) return ''
  const x = (n.style.x || 0) + px
  const y = (n.style.y || 0) + py
  const w = n.style.width || 'auto'
  const h = n.style.minHeight || n.style.height || 'auto'
  const vis = n.visible === false ? 'hidden' : 'visible'
  const text = n.props && n.props.text ? n.props.text.slice(0, 20) : ''
  let html = '<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + ';min-height:' + h + ';border:1px solid #6366f1;visibility:' + vis + ';box-sizing:border-box;overflow:hidden">' + depth + ':' + n.type + (text ? ' [' + text + ']' : '')
  if (n.children) n.children.forEach(c => { html += render(c, x, y, depth + 1) })
  html += '</div>'
  return html
}

let all = ''
j.nodes.forEach(n => { all += render(n, 0, 0, 0) })

const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test</title></head><body><div style="position:relative;width:1200px;height:' + j.canvas.height + ';margin:0 auto;background:#f5f5f5">' + all + '</div></body></html>'

fs.writeFileSync('test-render.html', html)
console.log('wrote test-render.html, canvas:', j.canvas.height, 'nodes:', j.nodes.length)
