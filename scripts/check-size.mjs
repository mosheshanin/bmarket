// Проверка размера Worker: бесплатный тариф — 3 МБ в сжатом виде (раздел 2).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 3 * 1024 * 1024;
const root = 'dist/server';
let raw = 0;
const parts = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== '.prerender') walk(p);
    } else if (/\.(m?js|wasm)$/.test(f)) {
      const buf = readFileSync(p);
      raw += buf.length;
      parts.push(buf);
    }
  }
})(root);
const gz = gzipSync(Buffer.concat(parts), { level: 9 }).length;
const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' МБ';
console.log(`Worker: ${mb(raw)} без сжатия, ${mb(gz)} gzip (лимит ${mb(LIMIT)})`);
if (gz > LIMIT) {
  console.error('Превышен лимит размера бесплатного Workers!');
  process.exit(1);
}
