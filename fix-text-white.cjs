const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) {}
  });
  return filelist;
};

const files = walkSync(path.join(__dirname, 'src')).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

let changedFiles = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  content = content.replace(/text-white/g, (match, offset, string) => {
    const lineStart = string.lastIndexOf('\n', offset);
    let lineEnd = string.indexOf('\n', offset);
    if (lineEnd === -1) lineEnd = string.length;
    const line = string.substring(lineStart, lineEnd);
    
    // Check if the element has a solid colored background
    if (line.match(/bg-(indigo|emerald|amber|rose|red|blue|green|purple|slate-900|slate-800)-/)) {
      return 'text-white';
    }
    // Specific icon colors
    if (line.match(/bg-indigo-500/)) return 'text-white';
    
    return 'text-slate-900';
  });
  
  if (content !== original) {
    fs.writeFileSync(file, content);
    changedFiles++;
    console.log("Updated text-white in", file);
  }
});

console.log("Total text-white updated:", changedFiles);
