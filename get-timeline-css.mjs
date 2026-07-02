import * as fs from 'fs'
const html = fs.readFileSync('d:/My Projects/PageForge/public/imported-templates/ready-agency.html', 'utf-8')
// Extract the inline <style> block
const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)
if (!m) { console.log('no style'); process.exit(0) }
const css = m[1]
// Find all rules containing "timeline"
const rules = css.match(/[^{}]*\.timeline[^{}]*\{[^{}]*\}/g) || []
for (const r of rules) {
  console.log(r.substring(0, 300))
  console.log('---')
}
