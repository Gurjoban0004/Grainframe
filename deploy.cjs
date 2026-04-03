const fs = require('fs');

const content = fs.readFileSync('/Users/gurjobansingh/Desktop/grain/improvement.md', 'utf8');
const blocks = content.split('```javascript');

if (blocks.length >= 3) {
  const skinJs = blocks[1].split('```')[0].trim();
  const autoMatchJs = blocks[2].split('```')[0].trim();

  fs.writeFileSync('/Users/gurjobansingh/Desktop/grain/grainframe/src/pipeline/skin.js', skinJs);
  fs.writeFileSync('/Users/gurjobansingh/Desktop/grain/grainframe/public/auto-match.js', autoMatchJs);
  console.log('Successfully wrote skin.js and auto-match.js');
} else {
  console.log('Code blocks not found!');
}
