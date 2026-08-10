// dist/ を つくる（Cloud Storage に そのまま アップロードできる 形）
//
// バンドラは つかわない。ブラウザが そのまま よめる ES モジュールなので、
// ファイルを 同じ かたちで コピーして、URL だけ サーバと そろえている。
//   dist/index.html
//   dist/css/…      dist/src/…      dist/shared/…
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst, filter);
    else if (!filter || filter(src)) fs.copyFileSync(src, dst);
  }
}

/** import 文の「../../shared/」を「../shared/」に そろえる（配置が 1段 浅くなるため） */
function fixImports(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixImports(p);
      continue;
    }
    if (!p.endsWith('.js')) continue;
    const before = fs.readFileSync(p, 'utf8');
    const after = before.replace(/(['"])\.\.\/\.\.\/shared\//g, '$1../shared/');
    if (before !== after) fs.writeFileSync(p, after);
  }
}

rm(DIST);
fs.mkdirSync(DIST, { recursive: true });

fs.copyFileSync(path.join(ROOT, 'client', 'index.html'), path.join(DIST, 'index.html'));
// 静的ホスティングでは 404 ページも いるので、同じものを おいておく
fs.copyFileSync(path.join(ROOT, 'client', 'index.html'), path.join(DIST, '404.html'));
copyDir(path.join(ROOT, 'client', 'css'), path.join(DIST, 'css'));
copyDir(path.join(ROOT, 'client', 'src'), path.join(DIST, 'src'), (f) => f.endsWith('.js'));
copyDir(path.join(ROOT, 'shared'), path.join(DIST, 'shared'), (f) => f.endsWith('.js'));
fixImports(path.join(DIST, 'src'));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(DIST, 'version.txt'), `${pkg.version} ${new Date().toISOString()}\n`);

let count = 0;
let bytes = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      count++;
      bytes += fs.statSync(p).size;
    }
  }
})(DIST);

console.log(`dist/ を つくりました: ${count} ファイル / ${(bytes / 1024).toFixed(1)} KB`);
console.log('  ローカル確認:  npm run preview   → http://localhost:8080/');
console.log('  アップロード:  npm run deploy    （BUCKET=... が ひつよう）');
