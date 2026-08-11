// ゲーム全体の まとめ役
//  - 画面（タイトル／ロビー／レース／ショップ）の きりかえ
//  - サーバ（または ブラウザ内の Room）との やりとり
//  - まいフレームの えがきなおしと HUD こうしん
import { COUNTDOWN_SEC, ITEMS } from '../../shared/constants.js';
import { clamp, lerpAngle, timeStr, yen } from '../../shared/util.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { LocalLink, NetLink, toWsUrl } from './net.js';
import { engine, setSound, sfx, unlockAudio } from './sfx.js';
import { drawThumbs, emoteBarHtml, screenHtml } from './ui.js';
import { loadGarage, saveGarage, settings, saveSettings } from './store.js';

const RENDER_DELAY = 30; // ミリ秒。ちょっと遅らせて なめらかに見せる

const el = {
  canvas: document.getElementById('game'),
  ui: document.getElementById('ui'),
  hud: document.getElementById('hud'),
  touch: document.getElementById('touch'),
  lap: document.getElementById('hudLap'),
  pos: document.getElementById('hudPos'),
  money: document.getElementById('hudMoney'),
  time: document.getElementById('hudTime'),
  item: document.getElementById('hudItem').firstElementChild,
  standings: document.getElementById('standings'),
  minimap: document.getElementById('minimap'),
  bigMsg: document.getElementById('bigMsg'),
  toast: document.getElementById('toast'),
  emoteBar: document.getElementById('emoteBar'),
};

class Game {
  constructor() {
    this.renderer = new Renderer(el.canvas);
    this.input = new Input();
    this.input.autoGas = settings.autoGas;
    this.name = settings.name || '';
    this.color = settings.color || 'red';
    this.serverInput = settings.server || '';
    this.autoGas = settings.autoGas;
    this.touchMode = settings.touchMode || 'auto'; // auto | on | off
    this.sound = settings.sound !== false;
    setSound(this.sound);

    this.mode = null; // 'online' | 'local'
    this.link = null;
    this.myId = null;
    this.room = null;
    this.profile = null;
    this.catalog = null;
    this.tracks = null;
    this.raceInfo = null;
    this.results = null;
    this.standings = null;
    this.snaps = [];
    this.screen = 'title';
    this.uiTab = 'lobby';
    this.statusText = '';
    this.msg = { text: '', ttl: 0, small: false };
    this.toastMsg = { text: '', ttl: 0 };
    this.lastInputSent = 0;
    this.lastInput = '';
    this.lastMoney = 0;

    el.emoteBar.innerHTML = emoteBarHtml();
    this.bindUi();
    this.refreshUi();
    this.loop = this.loop.bind(this);
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);
  }

  // --------------------------------------------------------------- UI そうさ

  bindUi() {
    const handler = (e) => {
      const target = e.target.closest('[data-a]');
      if (!target) return;
      unlockAudio();
      const a = target.dataset.a;
      this.action(a);
    };
    el.ui.addEventListener('click', handler);
    el.emoteBar.addEventListener('click', handler);
    addEventListener('keydown', () => unlockAudio(), { once: true });
    addEventListener('pointerdown', () => unlockAudio(), { once: true });
    // 一度でも 画面を さわったら、タッチそうさボタンを 出す
    addEventListener('touchstart', () => {
      this.input.usedTouch = true;
      this.refreshUi();
    }, { once: true, passive: true });
  }

  action(a) {
    // 画面を えがきなおすと 入力欄が もどってしまうので、先に よみとっておく
    this.captureInputs();
    const [cmd, arg1, arg2] = a.split(':');
    switch (cmd) {
      case 'color':
        this.color = arg1;
        saveSettings({ color: arg1 });
        if (this.link) this.send({ t: 'equip', kind: 'color', key: arg1 });
        this.refreshUi();
        break;
      case 'join-local':
      case 'join-online':
        saveSettings({ name: this.name, server: this.serverInput, color: this.color });
        this.connect(cmd === 'join-local' ? 'local' : 'online');
        break;
      case 'to-title':
        this.disconnect();
        break;
      case 'garage':
        this.uiTab = 'garage';
        if (this.screen === 'gpresult') this.screen = 'gpresult';
        this.refreshUi();
        break;
      case 'back':
        this.uiTab = 'lobby';
        this.refreshUi();
        break;
      case 'start':
        sfx.click();
        this.send({ t: 'start' });
        break;
      case 'next':
        sfx.click();
        this.send({ t: 'next' });
        break;
      case 'ready':
        this.send({ t: 'ready', v: !this.iAmReady() });
        break;
      case 'mode':
        this.send({ t: 'settings', mode: arg1 });
        break;
      case 'cup':
        this.send({ t: 'settings', gp: arg1 });
        break;
      case 'racers':
        this.send({ t: 'settings', racers: Number(arg1) });
        break;
      case 'laps':
        this.send({ t: 'settings', laps: Number(arg1) });
        break;
      case 'diff':
        this.send({ t: 'settings', difficulty: arg1 });
        break;
      case 'track':
        this.send({ t: 'settings', track: arg1 });
        break;
      case 'buy':
        this.send({ t: 'buy', kind: arg1, key: arg2 });
        break;
      case 'equip':
        this.send({ t: 'equip', kind: arg1, key: arg2 });
        if (arg1 === 'color') {
          this.color = arg2;
          saveSettings({ color: arg2 });
        }
        break;
      case 'emote':
        this.send({ t: 'emote', e: arg1 });
        break;
      case 'toggle-auto':
        this.autoGas = !this.autoGas;
        this.input.autoGas = this.autoGas;
        saveSettings({ autoGas: this.autoGas });
        this.refreshUi();
        break;
      case 'toggle-touch': {
        const order = ['auto', 'on', 'off'];
        this.touchMode = order[(order.indexOf(this.touchMode) + 1) % order.length];
        saveSettings({ touchMode: this.touchMode });
        this.refreshUi();
        break;
      }
      case 'toggle-sound':
        this.sound = !this.sound;
        setSound(this.sound);
        saveSettings({ sound: this.sound });
        this.refreshUi();
        break;
      default:
        break;
    }
  }

  /** 入力欄の いまの中身を おぼえておく */
  captureInputs() {
    const nameEl = document.getElementById('nameInput');
    const srvEl = document.getElementById('serverInput');
    if (nameEl) this.name = nameEl.value.trim() || 'プレイヤー';
    if (srvEl) this.serverInput = srvEl.value.trim();
  }

  /** タッチそうさボタンを 出すかどうか */
  showTouch() {
    if (this.touchMode === 'on') return true;
    if (this.touchMode === 'off') return false;
    return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0 || this.input.usedTouch;
  }

  refreshUi() {
    const html = this.screen === 'race' ? '' : screenHtml(this);
    if (html !== this.lastHtml) {
      el.ui.innerHTML = html;
      this.lastHtml = html;
      drawThumbs(el.ui);
    }
    const racing = this.screen === 'race';
    el.hud.classList.toggle('hidden', !racing);
    el.touch.classList.toggle('hidden', !(racing && this.showTouch()));
  }

  isHost() {
    if (!this.room) return false;
    const me = this.room.players.find((p) => p.id === this.myId);
    return !!(me && me.host);
  }

  iAmReady() {
    if (!this.room) return false;
    const me = this.room.players.find((p) => p.id === this.myId);
    return !!(me && me.ready);
  }

  // ------------------------------------------------------------------ 通信

  connect(mode) {
    this.disconnect(true);
    this.mode = mode;
    const join = {
      t: 'join',
      name: this.name,
      color: this.color,
      touch: matchMedia('(pointer: coarse)').matches,
      // ブラウザに 保存してある ガレージを もっていく（おかね・買ったものの 引きつぎ）
      garage: loadGarage(this.name),
    };
    if (mode === 'local') {
      this.screen = 'lobby';
      this.link = new LocalLink(join, (m) => this.onMessage(m));
    } else {
      const url = toWsUrl(this.serverInput);
      this.statusText = url;
      this.screen = 'connecting';
      this.link = new NetLink(url, (m) => this.onMessage(m), (state, info) => {
        if (state === 'open') this.link.send(join);
        else if (state === 'error' || state === 'closed') {
          this.statusText = (info || 'せつだんされました') + ' → ' + url;
          this.screen = 'title';
          this.toast('サーバに つながりません: ' + url);
          this.refreshUi();
        }
      });
    }
    this.refreshUi();
  }

  disconnect(quiet) {
    if (this.link) this.link.close();
    this.link = null;
    this.room = null;
    this.raceInfo = null;
    this.myId = null;
    this.snaps = [];
    this.screen = 'title';
    this.uiTab = 'lobby';
    engine(false, 0);
    if (!quiet) this.refreshUi();
  }

  send(obj) {
    if (this.link) this.link.send(obj);
  }

  onMessage(m) {
    switch (m.t) {
      case 'hello':
        this.myId = m.id;
        this.tracks = m.tracks;
        this.grandPrix = m.grandPrix;
        this.catalog = m.catalog;
        break;
      case 'you':
        this.profile = m.profile;
        this.color = m.profile.color;
        // おかね・買ったものは いつも ブラウザにも 保存しておく
        saveGarage(m.profile);
        break;
      case 'room': {
        this.room = m.room;
        const phase = m.room.phase;
        if (phase === 'lobby') this.screen = 'lobby';
        else if (phase === 'result') this.screen = 'result';
        else if (phase === 'shop') this.screen = 'shop';
        else if (phase === 'gpresult') this.screen = 'gpresult';
        else if (phase === 'race' && this.raceInfo) this.screen = 'race';
        break;
      }
      case 'racestart':
        this.raceInfo = m;
        this.snaps = [];
        this.results = null;
        this.renderer.setRace(m.trackId, m.cars);
        this.screen = 'race';
        this.msg = { text: '', ttl: 0 };
        this.lastMoney = 0;
        break;
      case 'snap':
        this.onSnapshot(m);
        return; // UI の えがきなおしは いらない
      case 'raceresult':
        this.results = m.results;
        this.standings = m.standings;
        this.screen = 'result';
        engine(false, 0);
        sfx.finish();
        break;
      case 'gpresult':
        this.standings = m.standings;
        this.screen = 'gpresult';
        this.uiTab = 'lobby';
        engine(false, 0);
        break;
      case 'emote': {
        const meta = this.renderer.carMeta && this.renderer.carMeta.get(m.id);
        if (meta) {
          meta.emote = m.e;
          meta.emoteUntil = this.renderer.time + 2;
        }
        break;
      }
      case 'toast':
        this.toast(m.text);
        sfx.error();
        break;
      case 'bought':
        sfx.buy();
        break;
      default:
        break;
    }
    this.refreshUi();
  }

  toast(text) {
    this.toastMsg = { text, ttl: 2.4 };
    el.toast.textContent = text;
  }

  bigMessage(text, ttl, small) {
    this.msg = { text, ttl, small: !!small };
  }

  // ------------------------------------------------------------- スナップショット

  onSnapshot(snap) {
    const now = performance.now();
    this.snaps.push({ at: now, snap });
    if (this.snaps.length > 6) this.snaps.shift();
    for (const ev of snap.ev || []) this.handleEvent(ev, snap);
  }

  handleEvent(ev, snap) {
    const mine = ev.id === this.myId;
    const r = this.renderer;
    const car = (snap.cars || []).find((c) => c.i === ev.id);
    switch (ev.type) {
      case 'count':
        if (ev.n > 0) sfx.count();
        break;
      case 'go':
        sfx.go();
        this.bigMessage('GO!', 1.1);
        break;
      case 'coin':
        if (mine) sfx.coin();
        for (let i = 0; i < 5; i++) {
          r.spawn(ev.x, ev.y, {
            vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
            life: 0.5, size: 5, color: '#ffd93b',
          });
        }
        break;
      case 'getitem':
        if (mine) {
          sfx.item();
          this.bigMessage((ITEMS[ev.item] || {}).icon + ' ' + (ITEMS[ev.item] || {}).name + ' ゲット！', 1.2, true);
        }
        break;
      case 'useitem':
        if (!mine) break;
        if (ev.item === 'shield' || ev.item === 'ghost') sfx.shield();
        else if (ev.item === 'star') {
          sfx.finish();
          this.bigMessage('⭐ むてき！', 1.4, true);
        } else if (ev.item === 'shot' || ev.item === 'snowball') sfx.item();
        break;
      case 'boost':
        if (mine) {
          sfx.boost();
          r.shake = 0.6;
          if (ev.why === 'start') this.bigMessage('ロケットスタート！', 1.2, true);
        }
        break;
      case 'spin':
        if (mine) {
          sfx.hit();
          r.shake = 1;
          this.bigMessage('ぶつかった！', 0.9, true);
        }
        if (car) {
          for (let i = 0; i < 10; i++) {
            r.spawn(car.x, car.y, {
              vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220,
              life: 0.6, size: 6, color: '#fff2a8',
            });
          }
        }
        break;
      case 'slow':
        if (mine) {
          sfx.thunder();
          this.bigMessage(ev.kind === 'candy' ? 'ベタベタ〜！' : 'カミナリ！', 0.9, true);
        }
        break;
      case 'bubble':
        if (mine) {
          sfx.item();
          this.bigMessage('ふわふわ〜！ ハンドルが きかない', 1.2, true);
        }
        break;
      case 'bubbled':
        if (ev.from === this.myId) this.bigMessage('シャボンで つつんだ！', 1, true);
        break;
      case 'swap':
        if (mine) {
          sfx.boost();
          this.bigMessage('いれかわり！', 1.2, true);
          r.shake = 0.5;
        }
        break;
      case 'shothit':
        r.shake = Math.max(r.shake, 0.4);
        for (let i = 0; i < 12; i++) {
          r.spawn(ev.x, ev.y, {
            vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260,
            life: 0.5, size: 7, color: ev.kind === 'snowball' ? '#ffffff' : '#ffc46b',
          });
        }
        break;
      case 'thunder':
        if (mine && ev.hits > 0) this.bigMessage('カミナリ どーん！', 1, true);
        break;
      case 'shieldbreak':
        if (mine) {
          sfx.shield();
          this.bigMessage('バリアが まもってくれた！', 1, true);
        }
        break;
      case 'money':
        if (car) r.floatText(car.x, car.y - 30, yen(ev.amount), '#ffd93b');
        break;
      case 'lap':
        if (mine) {
          sfx.lap();
          const laps = this.raceInfo ? this.raceInfo.laps : 3;
          this.bigMessage(ev.lap >= laps ? 'ラスト ' + (laps - ev.lap + 1) + 'しゅう！' : ev.lap + 'しゅうめ', 1.3, true);
        }
        break;
      case 'finish':
        if (mine) {
          sfx.finish();
          this.bigMessage('ゴール！ ' + ev.rank + 'い', 2.4);
        }
        break;
      case 'wall':
        if (mine) sfx.wall();
        break;
      default:
        break;
    }
  }

  /** 2つの スナップショットの あいだを 補間して、いまの見た目を つくる */
  sampleView(now) {
    const n = this.snaps.length;
    if (n === 0) return null;
    const b = this.snaps[n - 1];
    const a = n > 1 ? this.snaps[n - 2] : b;
    const span = Math.max(1, b.at - a.at);
    let alpha = 1 + (now - RENDER_DELAY - b.at) / span;
    alpha = clamp(alpha, 0, 1.9);
    const prev = new Map((a.snap.cars || []).map((c) => [c.i, c]));
    const cars = (b.snap.cars || []).map((c) => {
      const p = prev.get(c.i) || c;
      return Object.assign({}, c, {
        x: p.x + (c.x - p.x) * alpha,
        y: p.y + (c.y - p.y) * alpha,
        a: lerpAngle(p.a, c.a, alpha),
        v: p.v + (c.v - p.v) * alpha,
      });
    });
    const view = {
      cars,
      coins: b.snap.co,
      boxes: b.snap.bx,
      oils: b.snap.oil,
      shots: b.snap.sht,
      spurt: b.snap.sp,
      rt: b.snap.rt + (now - b.at) / 1000,
      phase: b.snap.ph,
    };
    view.me = cars.find((c) => c.i === this.myId) || cars.find((c) => c.rk === 1);
    view.spectating = !cars.some((c) => c.i === this.myId);
    return view;
  }

  // ---------------------------------------------------------------- ループ

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.screen === 'race') {
      this.sendInput(now);
      const view = this.sampleView(now);
      if (view) {
        this.renderer.draw(view, dt);
        this.renderer.drawMinimap(el.minimap, view);
        this.updateHud(view, dt);
      }
    } else {
      // メニュー中は うっすら コースを うつす
      this.renderer.updateParticles(dt);
      engine(false, 0);
    }

    this.msg.ttl -= dt;
    if (this.msg.ttl <= 0 && el.bigMsg.textContent) el.bigMsg.textContent = '';
    this.toastMsg.ttl -= dt;
    if (this.toastMsg.ttl <= 0 && el.toast.textContent) el.toast.textContent = '';

    requestAnimationFrame(this.loop);
  }

  sendInput(now) {
    if (now - this.lastInputSent < 33) return;
    const inp = this.input.read();
    const key = `${inp.s.toFixed(2)}|${inp.a.toFixed(2)}|${inp.it ? 1 : 0}`;
    // 変わったときは すぐ、変わらないときも 200ms ごとに送る
    if (key === this.lastInput && now - this.lastInputSent < 200) return;
    this.lastInput = key;
    this.lastInputSent = now;
    this.send({ t: 'i', s: inp.s, a: inp.a, it: inp.it });
  }

  updateHud(view, dt) {
    const me = view.me;
    const info = this.raceInfo || { laps: 3 };
    if (!me) return;

    const lap = clamp(me.lp + 1, 1, info.laps);
    el.lap.innerHTML = `<b>${lap}</b><span>/${info.laps} しゅう</span>`;
    el.pos.innerHTML = `<b>${me.rk}</b><span>い${view.spectating ? '（かんせん）' : ''}</span>`;
    el.money.textContent = yen(me.mn);
    el.time.textContent = view.rt < 0 ? 'よーい' : timeStr(Math.max(0, view.rt));

    const item = me.it;
    el.item.textContent = item ? (ITEMS[item] || {}).icon : '－';
    el.item.classList.toggle('empty', !item);

    // じゅんい表（8だいのときは 小さめ。画面が ひくい ときは 自分の まわりだけ）
    let order = view.cars.slice().sort((x, y) => x.rk - y.rk);
    el.standings.classList.toggle('compact', order.length > 4);
    if (order.length > 4 && this.renderer.h < 520) {
      const myIdx = Math.max(0, order.findIndex((c) => c.i === this.myId));
      const from = clamp(myIdx - 1, 0, Math.max(0, order.length - 4));
      order = order.slice(from, from + 4);
    }
    el.standings.innerHTML = order.map((c) => {
      const meta = (this.renderer.carMeta && this.renderer.carMeta.get(c.i)) || {};
      const hex = colorOf(meta.color);
      return `<div class="${c.i === this.myId ? 'me' : ''}">
        <span class="sq" style="background:${hex}"></span>${c.rk}. ${escapeText(meta.name || '')}
        ${c.fin ? '🏁' : ''}</div>`;
    }).join('');

    // カウントダウンと メッセージ
    if (view.rt < 0) {
      const n = Math.ceil(Math.min(COUNTDOWN_SEC, -view.rt));
      el.bigMsg.classList.remove('small');
      el.bigMsg.textContent = n > 3 ? 'よーい…' : String(n);
    } else if (this.msg.ttl > 0) {
      el.bigMsg.classList.toggle('small', this.msg.small);
      el.bigMsg.textContent = this.msg.text;
    } else if (view.spurt && !me.fin && this.msg.ttl <= 0) {
      el.bigMsg.classList.add('small');
      el.bigMsg.textContent = '🏁 ラストスパート！';
    } else if (me.au && !view.spectating) {
      el.bigMsg.classList.add('small');
      el.bigMsg.textContent = '🤖 AIが うんてん中（ボタンを おしてね）';
    } else if (me.ww && !me.fin) {
      el.bigMsg.classList.add('small');
      el.bigMsg.textContent = '⚠️ ぎゃくそう！';
    } else if (el.bigMsg.textContent) {
      el.bigMsg.textContent = '';
    }

    // エンジン音
    const on = view.phase === 'racing' && !view.spectating && this.sound;
    engine(on, me.v / 420);
  }
}

function colorOf(key) {
  const map = {
    red: '#ff4d5a', blue: '#3d8bff', yellow: '#ffd93b', green: '#4fd67a',
    pink: '#ff8ad1', purple: '#b07bff', orange: '#ff9b3d', mint: '#5be0d0',
  };
  return map[key] || '#ff4d5a';
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// URL に ?server=192.168.0.5 が ついていたら 入力を うめておく
const params = new URLSearchParams(location.search);
if (params.get('server')) saveSettings({ server: params.get('server') });

window.game = new Game();
