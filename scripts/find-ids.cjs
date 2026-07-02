const fs = require('fs');
const html = fs.readFileSync('public/imported-templates/ready-agency.html', 'utf8');
// Find all elements with id
const idMatches = html.match(/<[^>]+id="[^"]+"[^>]*>/g) || [];
console.log('All elements with id:');
const ids = new Set();
idMatches.forEach(m => {
  const idMatch = m.match(/id="([^"]+)"/);
  if (idMatch) ids.add(idMatch[1]);
});
console.log('Unique IDs:', Array.from(ids).join(', '));
