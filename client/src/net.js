// サーバとの つなぎこみ。
//  - NetLink   : WebSocket でサーバ（MacBook）につなぐ
//  - LocalLink : サーバなしで、ブラウザの中で同じ Room を動かす（ひとりであそぶ）
// どちらも send(obj) / onmsg(obj) だけの おなじ かたちなので、
// ゲーム本体は「どっちで動いているか」を気にしなくてよい。
import { Room } from '../../shared/room.js';
import { TICK_HZ } from '../../shared/constants.js';
import { LocalProfileStore } from './store.js';

/** 「192.168.0.12」「192.168.0.12:8080」「http://…」などを WebSocket の URL に直す */
export function toWsUrl(input) {
  let s = String(input || '').trim();
  if (!s) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }
  if (/^wss?:\/\//i.test(s)) return s.replace(/\/$/, '');
  s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/:\d+$/.test(s)) s += ':8080';
  return `ws://${s}/ws`;
}

export class NetLink {
  constructor(url, onmsg, onstate) {
    this.url = url;
    this.onmsg = onmsg;
    this.onstate = onstate || (() => {});
    this.ws = null;
    this.closedByUs = false;
    this.queue = [];
    this.open();
  }

  open() {
    this.onstate('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.onstate('error', String(e && e.message ? e.message : e));
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.onstate('open');
      for (const m of this.queue) ws.send(m);
      this.queue = [];
    };
    ws.onmessage = (ev) => {
      let obj;
      try {
        obj = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (obj.t === 'ping') {
        this.send({ t: 'pong' });
        return;
      }
      this.onmsg(obj);
    };
    ws.onerror = () => this.onstate('error', 'つながりませんでした');
    ws.onclose = () => {
      if (!this.closedByUs) this.onstate('closed');
    };
  }

  send(obj) {
    const s = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) this.queue.push(s);
  }

  close() {
    this.closedByUs = true;
    try {
      this.ws && this.ws.close();
    } catch { /* noop */ }
  }
}

export class LocalLink {
  constructor(join, onmsg) {
    this.onmsg = onmsg;
    this.store = new LocalProfileStore();
    this.room = new Room(this.store);
    this.conn = {
      remote: 'local',
      send: (s) => this.onmsg(JSON.parse(s)),
      sendJson: (o) => this.onmsg(o),
    };
    this.player = this.room.join(this.conn, join);
    this.stopped = false;
    this.acc = 0;
    this.last = performance.now();
    this.step = 1000 / TICK_HZ;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  loop(now) {
    if (this.stopped) return;
    this.acc += now - this.last;
    this.last = now;
    if (this.acc > 400) this.acc = this.step;
    while (this.acc >= this.step) {
      this.acc -= this.step;
      this.room.tick();
    }
    this.room.sync();
    requestAnimationFrame(this.loop);
  }

  send(obj) {
    if (!obj || obj.t === 'join' || obj.t === 'pong') return;
    this.room.handle(this.player, obj);
  }

  close() {
    this.stopped = true;
  }
}
