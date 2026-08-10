// 動作確認テスト（npm run smoke）
//
//  1. サーバを 起動して、Node から 2人ぶん つないで レースを 1本 走らせる
//  2. Chromium が あれば ブラウザで ひらいて、エラーが 出ないか 見る
//     （ブラウザの場所は CHROME_PATH で 指定できる）
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { WsClient } from './wsclient.js';
import { getTrack, posAt, project } from '../shared/tracks.js';
import { wrapAngle, clamp } from '../shared/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8099);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function check(name, ok, extra = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function waitPort(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => resolve(false));
    });
    if (ok) return true;
    await sleep(200);
  }
  return false;
}

// ----------------------------------------------------------- サーバのテスト

console.log('\n[1] サーバ + 2人プレイ');
// 本番の セーブデータを こわさないように、テスト用の 保存先を つかう
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'race-data-')), 'profiles.json');
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_FILE: dataFile },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const cleanup = () => {
  try {
    server.kill('SIGKILL');
  } catch { /* noop */ }
};
process.on('exit', cleanup);

if (!(await waitPort(PORT))) {
  console.error('サーバが 起動しませんでした\n' + serverLog);
  process.exit(1);
}

const health = await get(`http://127.0.0.1:${PORT}/health`);
check('/health が こたえる', health.status === 200 && JSON.parse(health.body).ok);
const page = await get(`http://127.0.0.1:${PORT}/`);
check('index.html が くばられる', page.status === 200 && page.body.includes('<canvas id="game">'));
const shared = await get(`http://127.0.0.1:${PORT}/shared/race.js`);
check('/shared/race.js が くばられる', shared.status === 200 && shared.body.includes('export class Race'));

function player(name) {
  const c = new WsClient(`ws://127.0.0.1:${PORT}/ws`);
  const state = { name, id: null, snaps: 0, result: null, gpresult: null, room: null, hello: false, msgs: [] };
  c.on('open', () => c.sendJson({ t: 'join', name, touch: false }));
  c.on('json', (m) => {
    state.msgs.push(m.t);
    if (m.t === 'hello') {
      state.hello = true;
      state.id = m.id;
    } else if (m.t === 'room') state.room = m.room;
    else if (m.t === 'you') state.profile = m.profile;
    else if (m.t === 'racestart') {
      state.cars = m.cars;
      state.track = getTrack(m.trackId);
    } else if (m.t === 'snap') {
      state.snaps++;
      state.lastSnap = m;
      // コースの すこし先を めがけて 走る（人が あそんでいるのに近い うごき）
      const me = (m.cars || []).find((c) => c.i === state.id);
      if (me && state.track) {
        const inp = autoDrive(state.track, me);
        c.sendJson({ t: 'i', s: inp.s, a: inp.a, it: state.snaps % 40 === 0 });
      }
    } else if (m.t === 'toast') state.toast = m.text;
    else if (m.t === 'raceresult') state.result = m;
    else if (m.t === 'gpresult') state.gpresult = m;
  });
  state.conn = c;
  return state;
}

const p1 = player('ホストくん');
const p2 = player('ゲストちゃん');
await sleep(600);
check('2人が さんかできた', p1.hello && p2.hello && p1.room && p1.room.players.length === 2);
check('1人めが ホストになる', !!(p1.room && p1.room.players[0].host && p1.room.players[0].id === p1.id));
check('NPC で 4だいに なる', !!(p1.room && p1.room.npcCount === 2));

// 1レースだけ、2しゅうで はやく テスト
p1.conn.sendJson({ t: 'settings', mode: 'single', laps: 2, track: 'beach' });
await sleep(200);
p1.conn.sendJson({ t: 'start' });
await sleep(1200);
check('レースが はじまった', !!(p1.cars && p1.cars.length === 4 && p1.snaps > 10), `snaps=${p1.snaps}`);

// レースが おわるまで まつ（2しゅうなので だいたい 40秒くらい）
const started = Date.now();
while (!p1.result && Date.now() - started < 90000) await sleep(500);
check('レースが おわって けっかが きた', !!p1.result);
if (p1.result) {
  const mine = p1.result.results.find((r) => r.id === p1.id);
  check('じぶんの けっかが ある', !!mine, mine ? `${mine.rank}い / ${mine.money}円` : '');
  check('4だいぶんの けっかが ある', p1.result.results.length === 4);
  check('おかねが もらえた', !!(mine && mine.money > 0));
  check('タイムが 記録された', !!(mine && mine.time > 5));
  const nonZero = p1.result.results.filter((r) => r.time != null).length;
  check('ぜんいん 完走した', nonZero === 4, `${nonZero}/4`);
}

// ショップで かいものできるか（500円の 使い切りアイテムで ためす）
await sleep(500);
const before = p1.profile ? p1.profile.money : 0;
p1.conn.sendJson({ t: 'buy', kind: 'consumable', key: 'softTire' });
await sleep(400);
check('アイテムを かえた', !!(p1.profile && p1.profile.consumables.softTire === 1 && p1.profile.money === before - 500),
  `¥${before} → ¥${p1.profile ? p1.profile.money : '?'}`);
// おかねが たりないときは ことわられる（おうかんは 2500円）
p1.conn.sendJson({ t: 'buy', kind: 'hat', key: 'crown' });
await sleep(400);
check('おかね不足は ことわられる', /たりない/.test(p1.toast || ''), p1.toast || '(toast なし)');

// せつだんしても レースが こわれないこと
p2.conn.close();
await sleep(600);
check('ぬけた人が いても サーバは 生きている', (await get(`http://127.0.0.1:${PORT}/health`)).status === 200);

p1.conn.close();
await sleep(300);

// ------------------------------------------------------- ブラウザのテスト

console.log('\n[2] ブラウザ（Chromium）で 画面を ひらく');
const chrome = findChrome();
if (!chrome) {
  console.log('  ⏭  Chromium が 見つからないので スキップ（CHROME_PATH で 指定できます）');
} else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'race-smoke-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=1280,800',
    '--remote-debugging-port=9333',
    `--user-data-dir=${outDir}`,
    'about:blank',
  ];
  const browser = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let blog = '';
  browser.stderr.on('data', (d) => (blog += d));
  const ok = await waitPort(9333, 80);
  if (!ok) {
    check('Chromium が 起動した', false, blog.slice(-300));
  } else {
    try {
      await browserTest(`http://127.0.0.1:${PORT}/`, outDir);
    } catch (e) {
      check('ブラウザテスト', false, String(e && e.message));
    }
  }
  browser.kill('SIGKILL');
}

cleanup();
console.log(failures === 0 ? '\n🎉 ぜんぶ OK！\n' : `\n💥 ${failures}件 しっぱい\n`);
process.exit(failures === 0 ? 0 : 1);

// ------------------------------------------------------------------ 小道具

/** コースの 先を 見て ハンドルを 切る（テスト用の じどう運転） */
function autoDrive(track, me) {
  const pr = project(track, me.x, me.y);
  const look = 120 + me.v * 0.5;
  const tp = posAt(track, pr.arc + look, 0);
  const want = Math.atan2(tp.y - me.y, tp.x - me.x);
  const diff = wrapAngle(want - me.a);
  const limit = track.limit[(pr.i + Math.round(look / track.spacing)) % track.N];
  return { s: clamp(diff * 2.4, -1, 1), a: me.v > limit ? -1 : 1 };
}

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* noop */ }
  }
  // playwright が いれた chromium を さがす
  try {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '';
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch { /* noop */ }
  return null;
}

/** CDP（Chrome DevTools Protocol）で ページを そうさする */
async function browserTest(url, outDir) {
  const ver = JSON.parse((await get('http://127.0.0.1:9333/json/version')).body);
  const cdp = new WsClient(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    cdp.on('open', res);
    cdp.on('error', rej);
  });
  let msgId = 0;
  const waiting = new Map();
  const logs = [];
  const errors = [];
  cdp.on('json', (m) => {
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`${m.params.type}: ${text}`);
      if (m.params.type === 'error') errors.push(text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = ++msgId;
    waiting.set(id, (m) => resolve(m.result));
    cdp.sendJson(sessionId ? { id, method, params, sessionId } : { id, method, params });
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r && r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r && r.result ? r.result.value : null;
  };

  check('ページが よみこめた', (await evalJs('document.title')) === 'こどもレーシング グランプリ');
  check('タイトル画面が 出た', await evalJs('!!document.querySelector("[data-a=join-local]")'));

  // ひとりで あそぶ を おす
  await evalJs('document.getElementById("nameInput").value = "テストくん"');
  await evalJs('document.querySelector("[data-a=join-local]").click()');
  await sleep(400);
  check('ロビーに はいれた', await evalJs('window.game.screen === "lobby"'));
  check('NPC が 3だい ならぶ', (await evalJs('window.game.room.npcCount')) === 3);

  // レース開始
  await evalJs('document.querySelector("[data-a=start]").click()');
  await sleep(1500);
  check('レース画面に なった', await evalJs('window.game.screen === "race"'));
  const startPos = await evalJs('JSON.stringify(window.game.sampleView(performance.now()).me)');
  // コースにそって じどう運転させて 8秒 走らせる
  await evalJs(`window.__auto = setInterval(() => {
    const g = window.game, v = g.sampleView(performance.now());
    if (!v || !v.me) return;
    const t = g.renderer.track, me = v.me;
    let bi = 0, bd = 1e18;
    for (let i = 0; i < t.pts.length; i++) {
      const dx = t.pts[i].x - me.x, dy = t.pts[i].y - me.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const tp = t.pts[(bi + 24) % t.pts.length];
    const want = Math.atan2(tp.y - me.y, tp.x - me.x);
    const diff = Math.atan2(Math.sin(want - me.a), Math.cos(want - me.a));
    const k = g.input.keys;
    k.add('gas'); k.delete('brake');
    if (diff > 0.06) { k.add('right'); k.delete('left'); }
    else if (diff < -0.06) { k.add('left'); k.delete('right'); }
    else { k.delete('left'); k.delete('right'); }
  }, 50)`);
  await sleep(8000);
  const nowPos = await evalJs('JSON.stringify(window.game.sampleView(performance.now()).me)');
  const a = JSON.parse(startPos);
  const b = JSON.parse(nowPos);
  const moved = Math.hypot(b.x - a.x, b.y - a.y);
  check('クルマが うごいた', moved > 1200, `${moved.toFixed(0)} ユニット`);
  check('スピードが 出ている', b.v > 100, `v=${b.v}`);
  check('4だい 走っている', (await evalJs('window.game.sampleView(performance.now()).cars.length')) === 4);
  check('おかねを あつめた', (await evalJs('window.game.sampleView(performance.now()).me.mn')) > 0);
  await evalJs('clearInterval(window.__auto)');
  const hud = await evalJs('document.getElementById("hudPos").textContent');
  check('HUD が こうしんされている', /\d/.test(hud || ''), hud);

  // 画面を 画像で のこす（目で 見て たしかめる用）
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  if (shot && shot.data) {
    const file = path.join(process.env.SHOT_DIR || outDir, 'race.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('  📷 スクリーンショット: ' + file);
  }

  check('JavaScript の エラーが ない', errors.length === 0, errors.slice(0, 3).join(' / '));
  cdp.close();
}
