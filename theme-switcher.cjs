const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) {
      if (err.code === 'OENT' || err.code === 'EPERM') console.log("Cannot read:", dirFile);
    }
  });
  return filelist;
};

const files = walkSync(path.join(__dirname, 'src')).filter(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'));

const replacements = [
  { from: /bg-slate-900/g, to: 'bg-slate-50' },
  { from: /bg-slate-800/g, to: 'bg-white' },
  { from: /bg-slate-700/g, to: 'bg-slate-100' },
  { from: /border-slate-800/g, to: 'border-slate-200' },
  { from: /border-slate-700/g, to: 'border-slate-200' },
  { from: /border-slate-600/g, to: 'border-slate-300' },
  { from: /text-slate-400/g, to: 'text-slate-500' },
  { from: /text-slate-300/g, to: 'text-slate-600' },
  { from: /text-slate-100/g, to: 'text-slate-900' },
  { from: /bg-navy-900/g, to: 'bg-slate-50' },
  { from: /text-slate-200/g, to: 'text-slate-700' },
  { from: /border-slate-500/g, to: 'border-slate-300' },
];

let changedFiles = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  replacements.forEach(r => {
    content = content.replace(r.from, r.to);
  });
  
  // Custom text-white replacement (heuristic: replace text-white with text-slate-900 if not preceded or followed by badge/button colors)
  // Actually let's just do text-white to text-slate-900 for headings, we can just replace all text-white and fix the icons later, 
  // or just look for "text-white" and replace with "text-slate-900" only if it's not inside a specific block.
  // Actually it's safer to just let me do text-white manually.
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    changedFiles++;
    console.log("Updated", file);
  }
});

console.log("Total updated:", changedFiles);
