const fs = require('fs');
const html = fs.readFileSync('public/imported-templates/ready-agency.html', 'utf8');
const matches = html.match(/id=("line"|'line')/g);
console.log('id=line occurrences:', matches);
