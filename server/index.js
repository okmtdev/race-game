// ゲームサーバ（MacBook で動かす）
//   - ブラウザに ゲーム本体（HTML/JS）を くばる ふつうの HTTP サーバ
//   - みんなの そうさを うけとって レースを 計算する WebSocket サーバ
// Node.js の標準機能だけで動くので npm install は いりません。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from './ws.js';
import { Room } from '../shared/room.js';
import { ProfileStore } from './profiles.js';
import { TICK_HZ } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');
const DIST_DIR = path.join(ROOT, 'dist');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
// dist/ を配る（本番と同じものを確認したいとき）: SERVE_DIST=1 npm start
const SERVE_DIST = process.env.SERVE_DIST === '1' && fs.existsSync(DIST_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/** URL を実ファイルに対応づける（dist と同じ配置になるようにしている） */
function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  // ディレクトリを さかのぼる 攻撃を ふせぐ
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  if (SERVE_DIST) return path.join(DIST_DIR, safe);
  if (safe.startsWith('shared/')) return path.join(SHARED_DIR, safe.slice('shared/'.length));
  return path.join(CLIENT_DIR, safe);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: room.players.size, phase: room.phase }));
    return;
  }
  const file = resolveFile(req.url || '/');
  const base = SERVE_DIST ? DIST_DIR : ROOT;
  if (!file.startsWith(base)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('みつかりません: ' + req.url);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
});

// ガレージの 保存先（テストなどで かえられるように）
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'profiles.json');
const store = new ProfileStore(DATA_FILE);
const room = new Room(store);
const wss = new WebSocketServer(server, { path: '/ws' });

wss.on('connection', (conn) => {
  let player = null;
  conn.on('message', (text) => {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (!player) {
      if (msg.t !== 'join') return;
      player = room.join(conn, msg);
      return;
    }
    room.handle(player, msg);
  });
  conn.on('close', () => {
    if (player) room.leave(player.id);
  });
});

// メインループ（1/30 秒ごと）
let last = Date.now();
let acc = 0;
const STEP = 1000 / TICK_HZ;
setInterval(() => {
  const now = Date.now();
  acc += now - last;
  last = now;
  if (acc > 500) acc = STEP; // 大きく遅れたら追いつくのをあきらめる
  while (acc >= STEP) {
    acc -= STEP;
    room.tick();
  }
  room.sync();
}, Math.round(STEP / 2));

setInterval(() => room.pingAll(), 3000);

server.listen(PORT, HOST, () => {
  const urls = localUrls(PORT);
  console.log('');
  console.log('  🏁  こどもレーシング グランプリ  サーバ起動！');
  console.log('  ------------------------------------------------');
  console.log(`  この MacBook で あそぶ  : http://localhost:${PORT}/`);
  for (const u of urls) console.log(`  スマホ・タブレットから  : ${u}`);
  console.log('  ------------------------------------------------');
  console.log('  ※ おなじ Wi-Fi につないでから、上の URL をひらいてね');
  console.log(`  ※ 参加できるのは ${4} 台まで（あまりは NPC が走ります）`);
  console.log('');
  if (SERVE_DIST) console.log('  [dist/ を配信中]');
});

/** LAN の IP アドレスから、スマホでひらく URL を作る */
function localUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      out.push(`http://${ni.address}:${port}/`);
    }
  }
  return out;
}

process.on('SIGINT', () => {
  console.log('\nばいばい！');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
});
