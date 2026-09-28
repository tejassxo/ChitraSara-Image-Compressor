import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const gitFiles = new Set(
  execSync('git ls-files')
    .toString()
    .trim()
    .split('\n')
    .map(f => f.trim().replace(/\r/g, ''))
);

let mismatches = 0;

function checkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        checkDir(full);
      }
    } else if (entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const relImport = match[1];
        const dirOfFile = path.dirname(full);
        const resolved = path.resolve(dirOfFile, relImport);
        let relToRoot = path.relative(process.cwd(), resolved).replace(/\\/g, '/');

        const candidate1 = relToRoot + '.ts';
        const candidate2 = relToRoot + '/index.ts';
        const candidate3 = relToRoot;

        const found = gitFiles.has(candidate1)
          ? candidate1
          : gitFiles.has(candidate2)
          ? candidate2
          : gitFiles.has(candidate3)
          ? candidate3
          : null;

        if (!found) {
          console.error(`Case/Path MISMATCH in ${path.relative(process.cwd(), full)}: import "${relImport}" -> looking for "${candidate1}"`);
          mismatches++;
        }
      }
    }
  }
}

console.log('Auditing imports against Git tracked paths...');
checkDir('src');
checkDir('tests');

if (mismatches === 0) {
  console.log('✅ ALL imports match Git paths exactly!');
} else {
  console.error(`❌ Found ${mismatches} mismatches!`);
}
