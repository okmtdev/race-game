// Canvas で コースとクルマを えがく
import { colorHex } from '../../shared/catalog.js';
import { carSize, drawCarShape } from './cars.js';
import { getTrack, posAt } from '../../shared/tracks.js';
import { clamp } from '../../shared/util.js';

const HAT_EMOJI = { crown: '👑', cap: '🧢', horn: '😈', flower: '🌸' };
const TRAIL_COLORS = {
  rainbow: ['#ff5d73', '#ffcc22', '#37d67a', '#3d8bff', '#b07bff'],
  star: ['#fff7c2', '#ffe066', '#ffffff'],
  fire: ['#ff9b3d', '#ff5d73', '#ffd93b'],
  bubble: ['#bfe9ff', '#ffffff', '#8fd8ff'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cam = { x: 0, y: 0, scale: 0.7 };
    this.particles = [];
    this.floaters = [];
    this.paths = new Map();
    this.time = 0;
    this.shake = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const c = this.canvas;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = c.clientWidth || window.innerWidth;
    this.h = c.clientHeight || window.innerHeight;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
  }

  setRace(trackId, cars) {
    this.track = getTrack(trackId);
    this.carMeta = new Map(cars.map((c) => [c.id, c]));
    this.particles.length = 0;
    this.floaters.length = 0;
    this.camReady = false;
  }

  /** コースの中心線を Path2D にしてキャッシュ（毎フレーム作り直さない） */
  trackPath() {
    const t = this.track;
    if (this.paths.has(t.id)) return this.paths.get(t.id);
    const p = new Path2D();
    p.moveTo(t.pts[0].x, t.pts[0].y);
    for (let i = 1; i < t.pts.length; i++) p.lineTo(t.pts[i].x, t.pts[i].y);
    p.closePath();
    this.paths.set(t.id, p);
    return p;
  }

  // ------------------------------------------------------------- パーティクル

  spawn(x, y, opts = {}) {
    if (this.particles.length > 700) return;
    this.particles.push({
      x, y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      life: opts.life || 0.5,
      max: opts.life || 0.5,
      size: opts.size || 6,
      color: opts.color || '#fff',
      grow: opts.grow || 0,
      text: opts.text || null,
    });
  }

  floatText(x, y, text, color) {
    this.floaters.push({ x, y, text, color: color || '#ffd93b', life: 1.1, max: 1.1 });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.size += p.grow * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 30 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  // -------------------------------------------------------------------- 描画

  draw(view, dt) {
    this.time += dt;
    this.updateParticles(dt);
    const ctx = this.ctx;
    const t = this.track;
    if (!t) return;

    const me = view.me;
    // カメラ（自分のクルマを追いかける）
    const target = me || view.cars[0];
    if (target) {
      const lead = 0.35;
      const tx = target.x + Math.cos(target.a) * target.v * lead;
      const ty = target.y + Math.sin(target.a) * target.v * lead;
      if (!this.camReady) {
        this.cam.x = tx;
        this.cam.y = ty;
        this.camReady = true;
      } else {
        const k = 1 - Math.exp(-7 * dt);
        this.cam.x += (tx - this.cam.x) * k;
        this.cam.y += (ty - this.cam.y) * k;
      }
    }
    // 画面の みじかい辺に、だいたい これくらいの ひろさが うつるように する
    const smaller = Math.min(this.w, this.h);
    const visible = clamp(smaller * 0.6 + 280, 480, 900);
    const base = clamp(smaller / visible, 0.34, 1.3);
    const zoomOut = 1 - clamp((target ? target.v : 0) / 1600, 0, 0.16);
    this.cam.scale += (base * zoomOut - this.cam.scale) * (1 - Math.exp(-3 * dt));
    const s = this.cam.scale;

    let ox = this.w / 2 - this.cam.x * s;
    let oy = this.h / 2 - this.cam.y * s;
    if (this.shake > 0) {
      ox += (Math.random() - 0.5) * this.shake * 22;
      oy += (Math.random() - 0.5) * this.shake * 22;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.theme.ground;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * ox, this.dpr * oy);

    // 見えている範囲（画面外は えがかない）
    const pad = 140;
    const vb = {
      x0: (0 - ox) / s - pad, y0: (0 - oy) / s - pad,
      x1: (this.w - ox) / s + pad, y1: (this.h - oy) / s + pad,
    };
    this.vb = vb;

    this.drawGround(ctx, vb, t);
    this.drawRoad(ctx, t);
    this.drawStartLine(ctx, t);
    this.drawPads(ctx, t, vb);
    this.drawDecor(ctx, t, vb);
    this.drawPickups(ctx, t, view, vb);
    this.drawOils(ctx, view);
    this.drawParticles(ctx);
    this.drawCars(ctx, view, dt);
    this.drawFloaters(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawGround(ctx, vb, t) {
    // しま模様で スピード感を だす
    ctx.fillStyle = t.theme.ground2;
    const step = 240;
    const x0 = Math.floor(vb.x0 / step) * step;
    const y0 = Math.floor(vb.y0 / step) * step;
    for (let x = x0; x < vb.x1; x += step) {
      for (let y = y0; y < vb.y1; y += step) {
        if (((x / step + y / step) & 1) === 0) continue;
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  drawRoad(ctx, t) {
    const path = this.trackPath();
    const hw = t.halfWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 道のそとの あんぜんゾーン
    ctx.strokeStyle = shade(t.theme.ground, -0.12);
    ctx.lineWidth = (hw + 60) * 2;
    ctx.stroke(path);
    // ふちの もよう
    ctx.strokeStyle = t.theme.edge;
    ctx.lineWidth = hw * 2 + 26;
    ctx.stroke(path);
    ctx.save();
    ctx.strokeStyle = t.theme.edge2;
    ctx.lineWidth = hw * 2 + 26;
    ctx.setLineDash([46, 46]);
    ctx.stroke(path);
    ctx.restore();
    // 道
    ctx.strokeStyle = t.theme.road;
    ctx.lineWidth = hw * 2;
    ctx.stroke(path);
    // 中央線
    ctx.save();
    ctx.strokeStyle = t.theme.roadLine;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 7;
    ctx.setLineDash([50, 60]);
    ctx.stroke(path);
    ctx.restore();
  }

  drawStartLine(ctx, t) {
    const p = posAt(t, 0, 0);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.heading);
    const hw = t.halfWidth;
    const cell = 26;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < Math.ceil((hw * 2) / cell); i++) {
        ctx.fillStyle = (i + row) % 2 === 0 ? '#ffffff' : '#1b2233';
        ctx.fillRect(row * cell - cell, -hw + i * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  drawPads(ctx, t, vb) {
    for (const p of t.pickups.pads) {
      if (p.x < vb.x0 || p.x > vb.x1 || p.y < vb.y0 || p.y > vb.y1) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const glow = 0.55 + 0.45 * Math.sin(this.time * 6);
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#ffd93b';
      for (let i = 0; i < 3; i++) {
        const x = -40 + i * 34;
        ctx.beginPath();
        ctx.moveTo(x, -46);
        ctx.lineTo(x + 26, 0);
        ctx.lineTo(x, 46);
        ctx.lineTo(x + 8, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawDecor(ctx, t, vb) {
    for (const d of t.decor) {
      if (d.x < vb.x0 || d.x > vb.x1 || d.y < vb.y0 || d.y > vb.y1) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(d.scale, d.scale);
      const sway = Math.sin(this.time * 1.4 + d.x * 0.01) * 0.05;
      ctx.rotate(sway);
      if (d.kind === 'tree') {
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(-6, -6, 12, 34);
        ctx.fillStyle = d.variant === 1 ? '#2fa14e' : '#37b85c';
        circle(ctx, 0, -18, 26);
        circle(ctx, -16, -4, 18);
        circle(ctx, 16, -4, 18);
      } else if (d.kind === 'palm') {
        ctx.fillStyle = '#9a6b3c';
        ctx.fillRect(-5, -10, 10, 40);
        ctx.fillStyle = '#33a95c';
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate((i / 5) * Math.PI * 2);
          ctx.beginPath();
          ctx.ellipse(0, -26, 10, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (d.kind === 'snow') {
        if (d.variant === 0) {
          ctx.fillStyle = '#fff';
          circle(ctx, 0, 6, 16);
          circle(ctx, 0, -14, 11);
          ctx.fillStyle = '#ff8c42';
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(14, -11);
          ctx.lineTo(0, -8);
          ctx.fill();
        } else {
          ctx.fillStyle = '#2f6b4f';
          tri(ctx, 0, -34, 22, 22);
          tri(ctx, 0, -14, 26, 24);
          ctx.fillStyle = '#7a5230';
          ctx.fillRect(-5, 8, 10, 16);
        }
      } else if (d.kind === 'flag') {
        ctx.fillStyle = '#cfd7e6';
        ctx.fillRect(-2, -40, 4, 44);
        ctx.fillStyle = ['#ff5d73', '#ffcc22', '#3d8bff'][d.variant % 3];
        const f = Math.sin(this.time * 5 + d.x) * 4;
        ctx.beginPath();
        ctx.moveTo(2, -40);
        ctx.lineTo(30, -34 + f);
        ctx.lineTo(2, -24);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawPickups(ctx, t, view, vb) {
    const coins = t.pickups.coins;
    const boxes = t.pickups.boxes;
    const co = view.coins || '';
    const bx = view.boxes || '';
    const bob = Math.sin(this.time * 5);
    for (let i = 0; i < coins.length; i++) {
      if (co[i] === '0') continue;
      const c = coins[i];
      if (c.x < vb.x0 || c.x > vb.x1 || c.y < vb.y0 || c.y > vb.y1) continue;
      const wobble = Math.abs(Math.cos(this.time * 3 + i));
      ctx.save();
      ctx.translate(c.x, c.y + bob * 2);
      ctx.scale(0.35 + wobble * 0.75, 1);
      ctx.fillStyle = '#ffd227';
      circle(ctx, 0, 0, 15);
      ctx.fillStyle = '#f2a900';
      circle(ctx, 0, 0, 10);
      ctx.restore();
      ctx.fillStyle = '#8a5a00';
      ctx.font = 'bold 15px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (wobble > 0.55) ctx.fillText('¥', c.x, c.y + bob * 2 + 1);
    }
    for (let i = 0; i < boxes.length; i++) {
      if (bx[i] === '0') continue;
      const b = boxes[i];
      if (b.x < vb.x0 || b.x > vb.x1 || b.y < vb.y0 || b.y > vb.y1) continue;
      ctx.save();
      ctx.translate(b.x, b.y + bob * 3);
      ctx.rotate(this.time * 1.6 + i);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      roundRect(ctx, -19, -19, 38, 38, 10);
      ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      roundRect(ctx, -13, -13, 26, 26, 7);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', b.x, b.y + bob * 3 + 1);
    }
  }

  drawOils(ctx, view) {
    for (const [x, y] of view.oils || []) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(70,40,110,.75)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,160,255,.6)';
      ctx.beginPath();
      ctx.ellipse(-8, -6, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = `bold ${p.size * 2}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        circle(ctx, p.x, p.y, p.size * (0.4 + a * 0.6));
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 26px system-ui';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  drawCars(ctx, view, dt) {
    const cars = view.cars.slice().sort((a, b) => a.y - b.y);
    for (const c of cars) {
      const meta = this.carMeta.get(c.i) || {};
      const col = colorHex(meta.color);
      const isMe = view.me && c.i === view.me.i;

      // けむり・ほこり
      if (c.dr && c.v > 100) {
        this.spawn(c.x - Math.cos(c.a) * 20, c.y - Math.sin(c.a) * 20, {
          vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
          life: 0.45, size: 9, color: 'rgba(255,255,255,.75)', grow: 14,
        });
      }
      if (c.of && c.v > 60 && Math.random() < 0.5) {
        this.spawn(c.x, c.y, {
          vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50,
          life: 0.5, size: 7, color: 'rgba(120,90,50,.6)', grow: 10,
        });
      }
      if (c.bo > 0) {
        this.spawn(c.x - Math.cos(c.a) * 26, c.y - Math.sin(c.a) * 26, {
          vx: -Math.cos(c.a) * 120 + (Math.random() - 0.5) * 50,
          vy: -Math.sin(c.a) * 120 + (Math.random() - 0.5) * 50,
          life: 0.3, size: 11, color: Math.random() < 0.5 ? '#ffd93b' : '#ff7a3d', grow: -8,
        });
      }
      const trail = TRAIL_COLORS[meta.trail];
      if (trail && c.v > 60 && Math.random() < 0.7) {
        this.spawn(c.x - Math.cos(c.a) * 24, c.y - Math.sin(c.a) * 24, {
          vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
          life: 0.6, size: 7, color: trail[(Math.random() * trail.length) | 0], grow: 2,
        });
      }

      const size = carSize(meta.model);
      ctx.save();
      ctx.translate(c.x, c.y);
      // かげ
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(3, 6, size.len * 0.5, size.wid * 0.6, c.a, 0, Math.PI * 2);
      ctx.fill();
      // ボディ（車種ごとの かたち）
      ctx.rotate(c.a);
      drawCarShape(ctx, meta.model, meta.color);
      ctx.restore();

      // かぶりもの
      if (HAT_EMOJI[meta.hat]) {
        ctx.font = '22px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(HAT_EMOJI[meta.hat], c.x, c.y - 2);
      }

      // バリア
      if (c.sh > 0) {
        ctx.save();
        ctx.globalAlpha = c.sh < 2 ? 0.4 + 0.4 * Math.sin(this.time * 18) : 0.55;
        ctx.strokeStyle = '#8ff0ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 34 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(140,240,255,.16)';
        ctx.fill();
        ctx.restore();
      }
      // じしゃく
      if (c.mg > 0) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#ff6bd6';
        ctx.setLineDash([8, 10]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 52 + Math.sin(this.time * 8) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // スピン中・おそくなっている
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (c.sp > 0) {
        ctx.font = '20px system-ui';
        ctx.fillText('💫', c.x + Math.cos(this.time * 12) * 22, c.y - 30 + Math.sin(this.time * 12) * 6);
      } else if (c.sl > 0) {
        ctx.font = '20px system-ui';
        ctx.fillText('⚡', c.x, c.y - 32);
      }
      if (c.ww && !c.fin) {
        ctx.font = '22px system-ui';
        ctx.fillText('⚠️', c.x, c.y - 34);
      }
      if (c.au && meta.kind === 'human') {
        // そうさが とどいていない あいだ AI が 運転していることを しめす
        ctx.font = '18px system-ui';
        ctx.fillText('🤖', c.x + 22, c.y - 26);
      }
      if (meta.emote && meta.emoteUntil > this.time) {
        ctx.font = '30px system-ui';
        ctx.fillText(meta.emote, c.x, c.y - 44);
      }

      // 名前
      ctx.font = 'bold 15px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      const label = (isMe ? '▼ ' : '') + (meta.name || '');
      ctx.strokeText(label, c.x, c.y - 22);
      ctx.fillStyle = isMe ? '#ffd93b' : '#fff';
      ctx.fillText(label, c.x, c.y - 22);
    }
  }

  /** ミニマップ（右上の 小さい 地図） */
  drawMinimap(canvas, view) {
    const t = this.track;
    if (!t) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 120;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const b = t.bounds;
    const sw = b.maxx - b.minx;
    const sh = b.maxy - b.miny;
    const s = Math.min(size / sw, size / sh) * 0.9;
    const ox = (size - sw * s) / 2 - b.minx * s;
    const oy = (size - sh * s) / 2 - b.miny * s;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = t.halfWidth * 1.4;
    ctx.stroke(this.trackPath());
    // スタート／ゴールの ばしょ
    const sp = posAt(t, 0, 0);
    ctx.fillStyle = '#17233b';
    circle(ctx, sp.x, sp.y, 6 / s);
    // クルマ（画面上で いつも おなじ 大きさに 見えるように 1/s する）
    for (const c of view.cars) {
      const meta = this.carMeta.get(c.i) || {};
      const isMe = view.me && c.i === view.me.i;
      ctx.fillStyle = colorHex(meta.color);
      circle(ctx, c.x, c.y, (isMe ? 6 : 4.5) / s);
      if (isMe) {
        ctx.strokeStyle = '#17233b';
        ctx.lineWidth = 2 / s;
        ctx.stroke();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** コースの形を 小さく えがく（コースえらび用） */
export function drawTrackThumb(canvas, trackId) {
  const t = getTrack(trackId);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 160;
  const h = canvas.clientHeight || 84;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const b = t.bounds;
  const sw = b.maxx - b.minx;
  const sh = b.maxy - b.miny;
  const s = Math.min(w / sw, h / sh) * 0.92;
  ctx.setTransform(dpr * s, 0, 0, dpr * s,
    dpr * ((w - sw * s) / 2 - b.minx * s), dpr * ((h - sh * s) / 2 - b.miny * s));
  ctx.fillStyle = t.theme.ground;
  ctx.fillRect(b.minx, b.miny, sw, sh);
  const path = new Path2D();
  path.moveTo(t.pts[0].x, t.pts[0].y);
  for (let i = 1; i < t.pts.length; i++) path.lineTo(t.pts[i].x, t.pts[i].y);
  path.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = t.theme.edge;
  ctx.lineWidth = t.halfWidth * 2.4;
  ctx.stroke(path);
  ctx.strokeStyle = t.theme.road;
  ctx.lineWidth = t.halfWidth * 1.8;
  ctx.stroke(path);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// -------------------------------------------------------------------- 小道具

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function tri(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x - w, y + h);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 色を あかるく／くらく する */
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (v) => clamp(Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
