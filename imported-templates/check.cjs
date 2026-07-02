const fs = require('fs')
const html = fs.readFileSync('imported-templates/ready-agency.html', 'utf8')
const m = html.match(/<a class="navbar-brand[^"]*"[^>]*>([\s\S]*?)<\/a>/)
if (m) {
  console.log('Found navbar-brand:', JSON.stringify(m[1]))
} else {
  console.log('not found')
}
const m2 = html.match(/<h1[^>]*class="[^"]*site-heading[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
if (m2) {
  console.log('site-heading h1:', JSON.stringify(m2[1]))
}
