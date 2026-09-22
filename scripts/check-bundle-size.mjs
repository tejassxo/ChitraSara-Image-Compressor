import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { execSync } from 'child_process';

console.log('📦 Running production build...');
execSync('npm run build', { stdio: 'inherit' });

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');

console.log('\n📊 Auditing Production Bundle Budget (Strict <= 30 KB gzipped)...');

let totalRaw = 0;
let totalGzip = 0;

const files = readdirSync(assetsDir);
console.log('------------------------------------------------------------');
console.log(String('File').padEnd(35) + String('Raw Size').padStart(12) + String('Gzipped').padStart(12));
console.log('------------------------------------------------------------');

for (const file of files) {
  if (file.endsWith('.js') || file.endsWith('.css')) {
    const filePath = join(assetsDir, file);
    const content = readFileSync(filePath);
    const rawSize = statSync(filePath).size;
    const gzipSize = gzipSync(content).length;

    totalRaw += rawSize;
    totalGzip += gzipSize;

    console.log(
      file.padEnd(35) +
      `${(rawSize / 1024).toFixed(2)} KB`.padStart(12) +
      `${(gzipSize / 1024).toFixed(2)} KB`.padStart(12)
    );
  }
}

console.log('------------------------------------------------------------');
console.log(
  'Total Combined (JS + CSS)'.padEnd(35) +
  `${(totalRaw / 1024).toFixed(2)} KB`.padStart(12) +
  `${(totalGzip / 1024).toFixed(2)} KB`.padStart(12)
);
console.log('------------------------------------------------------------');

const BUDGET_KB = 30;
const totalGzipKB = totalGzip / 1024;

if (totalGzipKB > BUDGET_KB) {
  console.error(`❌ BUDGET EXCEEDED: ${totalGzipKB.toFixed(2)} KB > ${BUDGET_KB} KB limit!`);
  process.exit(1);
} else {
  console.log(`✅ BUDGET PASSED: ${totalGzipKB.toFixed(2)} KB <= ${BUDGET_KB} KB limit (${((totalGzipKB / BUDGET_KB) * 100).toFixed(1)}% of budget utilized).`);
}
