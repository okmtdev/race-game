// コース（ステージ）の定義と、コース形状の計算
//
// コースは「中心線（閉じたループ）＋道幅」で表現している。
// クルマの位置を中心線に射影して「何メートル進んだか（arc）」「道の中心から
// どれだけ横にずれているか（lateral）」を求め、周回数・順位・コースアウト判定に使う。
import { clamp, dist, makeRng, wrapAngle } from './util.js';

export const TRACK_DEFS = [
  {
    id: 'circuit',
    name: 'なかよしサーキット',
    subtitle: 'はじめてでも あんしん！ ひろい みち',
    difficulty: 1,
    surface: 'grass',
    halfWidth: 165,
    theme: {
      ground: '#7fd06a',
      ground2: '#6cc25a',
      road: '#5a5f6b',
      roadLine: '#f7f7f2',
      edge: '#ff6b6b',
      edge2: '#ffffff',
      sky: '#9fe0ff',
      decor: 'tree',
    },
    control: [
      [500, 1220], [660, 720], [1150, 480], [1850, 500], [2380, 690],
      [2620, 1000], [2960, 1160], [2740, 1520], [2220, 1760],
      [1520, 1820], [900, 1720], [530, 1520],
    ],
  },
  {
    id: 'beach',
    name: 'サンサンビーチ',
    subtitle: 'クネクネの みちに ちゅうい！',
    difficulty: 2,
    surface: 'sand',
    halfWidth: 148,
    theme: {
      ground: '#ffe6a7',
      ground2: '#f7d68a',
      road: '#8d8377',
      roadLine: '#fffbe8',
      edge: '#39b7ff',
      edge2: '#ffffff',
      sky: '#7fd4ff',
      decor: 'palm',
    },
    control: [
      [520, 1380], [520, 820], [900, 520], [1420, 700], [1720, 1120],
      [2040, 700], [2520, 540], [2920, 820], [2960, 1320],
      [2600, 1660], [2100, 1500], [1700, 1780], [1180, 1820], [700, 1760],
    ],
  },
  {
    id: 'snow',
    name: 'キラキラゆきやま',
    subtitle: 'ツルツル すべる！ じょうきゅうしゃむけ',
    difficulty: 3,
    surface: 'snow',
    halfWidth: 138,
    theme: {
      ground: '#eaf6ff',
      ground2: '#d8ecfb',
      road: '#9fb4c7',
      roadLine: '#ffffff',
      edge: '#7a9ec4',
      edge2: '#ffffff',
      sky: '#bfe4ff',
      decor: 'snow',
    },
    control: [
      [620, 1780], [500, 1280], [820, 1000], [1240, 1160], [1520, 900],
      [1300, 620], [1720, 450], [2200, 600], [2120, 1010],
      [2540, 1160], [2920, 1010], [3010, 1450], [2620, 1720],
      [2100, 1820], [1600, 1660], [1080, 1860],
    ],
  },
];

const SPACING = 16; // 中心線をこの間隔でサンプリング
const cache = new Map();

export function getTrack(id) {
  if (cache.has(id)) return cache.get(id);
  const def = TRACK_DEFS.find((d) => d.id === id) || TRACK_DEFS[0];
  const t = buildTrack(def);
  cache.set(def.id, t);
  return t;
}

export function trackList() {
  return TRACK_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    subtitle: d.subtitle,
    difficulty: d.difficulty,
    theme: d.theme,
  }));
}

// ---------------------------------------------------------------- 曲線の生成

function crInterp(pa, pb, ta, tb, t) {
  const d = tb - ta || 1e-6;
  const w1 = (tb - t) / d;
  const w2 = (t - ta) / d;
  return [pa[0] * w1 + pb[0] * w2, pa[1] * w1 + pb[1] * w2];
}

/** 求心パラメータの Catmull-Rom（とがったり自己交差しにくい） */
function crPoint(p0, p1, p2, p3, t) {
  const alpha = 0.5;
  const t0 = 0;
  const t1 = t0 + Math.pow(Math.max(1e-4, dist(p0[0], p0[1], p1[0], p1[1])), alpha);
  const t2 = t1 + Math.pow(Math.max(1e-4, dist(p1[0], p1[1], p2[0], p2[1])), alpha);
  const t3 = t2 + Math.pow(Math.max(1e-4, dist(p2[0], p2[1], p3[0], p3[1])), alpha);
  const tt = t1 + (t2 - t1) * t;
  const a1 = crInterp(p0, p1, t0, t1, tt);
  const a2 = crInterp(p1, p2, t1, t2, tt);
  const a3 = crInterp(p2, p3, t2, t3, tt);
  const b1 = crInterp(a1, a2, t0, t2, tt);
  const b2 = crInterp(a2, a3, t1, t3, tt);
  return crInterp(b1, b2, t1, t2, tt);
}

function sampleClosed(control) {
  const raw = [];
  const n = control.length;
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n];
    const p1 = control[i];
    const p2 = control[(i + 1) % n];
    const p3 = control[(i + 2) % n];
    const steps = Math.max(6, Math.ceil(dist(p1[0], p1[1], p2[0], p2[1]) / 8));
    for (let s = 0; s < steps; s++) raw.push(crPoint(p0, p1, p2, p3, s / steps));
  }
  return resampleClosed(raw, SPACING);
}

/** 折れ線を等間隔に打ち直す（閉ループ） */
function resampleClosed(raw, spacing) {
  const out = [];
  let carry = 0;
  const n = raw.length;
  for (let i = 0; i < n; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % n];
    const seg = dist(a[0], a[1], b[0], b[1]);
    if (seg < 1e-6) continue;
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  return out;
}

// ------------------------------------------------------------ コースの組み立て

function buildTrack(def) {
  const pts = sampleClosed(def.control);
  const N = pts.length;
  const seg = new Array(N);
  let cum = 0;
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % N];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    seg[i] = {
      x: a.x, y: a.y, dx: dx / len, dy: dy / len, len, cum,
      heading: Math.atan2(dy, dx),
    };
    cum += len;
  }
  const length = cum;

  // 進行方向のカーブのきつさから「安全に曲がれる速度」を作っておく（NPC 用）
  const limit = new Float32Array(N);
  const WIN = Math.max(3, Math.round(90 / SPACING)); // 約90ユニット先まで見る
  for (let i = 0; i < N; i++) {
    let d = 0;
    let ang = 0;
    for (let k = 0; k < WIN; k++) {
      const a = seg[(i + k) % N];
      const b = seg[(i + k + 1) % N];
      ang += Math.abs(wrapAngle(b.heading - a.heading));
      d += a.len;
    }
    const radius = ang > 1e-3 ? d / ang : 1e5;
    limit[i] = clamp(Math.sqrt(1500 * radius), 150, 900);
  }
  // 手前から減速できるように後ろ向きに伝播
  for (let pass = 0; pass < 3; pass++) {
    for (let k = N - 1; k >= 0; k--) {
      const i = k;
      const j = (i + 1) % N;
      const v = Math.sqrt(limit[j] * limit[j] + 2 * 380 * seg[i].len);
      if (v < limit[i]) limit[i] = v;
    }
  }

  const track = {
    id: def.id,
    def,
    name: def.name,
    surface: def.surface,
    halfWidth: def.halfWidth,
    theme: def.theme,
    pts,
    seg,
    N,
    length,
    limit,
    spacing: SPACING,
  };

  track.bounds = bounds(pts, def.halfWidth + 260);
  track.pickups = makePickups(track);
  track.decor = makeDecor(track);
  track.startGrid = makeStartGrid(track);
  return track;
}

function bounds(pts, pad) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pts) {
    if (p.x < minx) minx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.x > maxx) maxx = p.x;
    if (p.y > maxy) maxy = p.y;
  }
  return { minx: minx - pad, miny: miny - pad, maxx: maxx + pad, maxy: maxy + pad };
}

/** コイン・アイテムボックス・ブーストパッドを配置 */
function makePickups(track) {
  const coins = [];
  const boxes = [];
  const pads = [];
  const L = track.length;

  // アイテムボックス：4個ならびを3か所
  for (const f of [0.16, 0.44, 0.73]) {
    for (const lat of [-0.55, -0.19, 0.19, 0.55]) {
      const p = posAt(track, f * L, lat * track.halfWidth);
      boxes.push({ x: p.x, y: p.y, arc: f * L });
    }
  }
  // ブーストパッド
  for (const f of [0.3, 0.62, 0.9]) {
    const p = posAt(track, f * L, 0);
    const s = segAtArc(track, f * L);
    pads.push({ x: p.x, y: p.y, angle: s.heading });
  }
  // コイン：いろいろな並びで散らす
  const rng = makeRng(track.id.length * 7919 + 13);
  const patterns = [
    { lats: [0], n: 6 },
    { lats: [-0.5, 0.5], n: 4 },
    { lats: [-0.6, 0, 0.6], n: 3 },
    { lats: [0.45], n: 5 },
    { lats: [-0.45], n: 5 },
  ];
  let f = 0.05;
  while (f < 0.98) {
    const pat = patterns[rng.int(patterns.length)];
    for (let i = 0; i < pat.n; i++) {
      const arc = (f + i * 0.012) * L;
      for (const lat of pat.lats) {
        const p = posAt(track, arc % L, lat * track.halfWidth);
        coins.push({ x: p.x, y: p.y });
      }
    }
    f += 0.08 + rng() * 0.06;
  }
  return { coins, boxes, pads };
}

/** 背景のかざり（描画用。ゲーム進行には影響しない） */
function makeDecor(track) {
  const rng = makeRng(track.id.length * 104729 + 7);
  const out = [];
  const L = track.length;
  const kind = track.theme.decor;
  // コースが うねっているので、よこに ずらした 場所が べつの みちの 上に
  // かさなることがある。中心線からの きょりを 見て、みちの上なら おかない。
  const clear = (x, y, margin) => project(track, x, y).dist > track.halfWidth + margin;
  for (let i = 0; i < 220 && out.length < 130; i++) {
    const arc = rng() * L;
    const side = rng() < 0.5 ? -1 : 1;
    const off = track.halfWidth + 45 + rng() * 230;
    const p = posAt(track, arc, side * off);
    if (!clear(p.x, p.y, 34)) continue;
    out.push({
      x: p.x,
      y: p.y,
      kind,
      scale: 0.75 + rng() * 0.7,
      variant: rng.int(3),
    });
  }
  // 観客（旗）をスタート前に並べる
  for (let i = 0; i < 14; i++) {
    const arc = (L - 260 + i * 26) % L;
    const side = i % 2 === 0 ? -1 : 1;
    const p = posAt(track, arc, side * (track.halfWidth + 36));
    if (!clear(p.x, p.y, 24)) continue;
    out.push({ x: p.x, y: p.y, kind: 'flag', scale: 1, variant: i % 3 });
  }
  return out;
}

function makeStartGrid(track) {
  const L = track.length;
  const rows = [
    [-90, -60], [-90, 60], [-190, -60], [-190, 60],
  ];
  return rows.map(([back, lat]) => {
    const arc = (L + back) % L;
    const p = posAt(track, arc, lat);
    const s = segAtArc(track, arc);
    return { x: p.x, y: p.y, angle: s.heading, arc, lateral: lat };
  });
}

// ------------------------------------------------------------------- 検索系

export function segIndexAtArc(track, arc) {
  const a = ((arc % track.length) + track.length) % track.length;
  // ほぼ等間隔なので割り算で当たりをつけて、前後に微調整
  let i = clamp(Math.floor(a / track.spacing), 0, track.N - 1);
  while (i > 0 && track.seg[i].cum > a) i--;
  while (i < track.N - 1 && track.seg[i].cum + track.seg[i].len < a) i++;
  return i;
}

export function segAtArc(track, arc) {
  return track.seg[segIndexAtArc(track, arc)];
}

/** arc（進んだ距離）と lateral（横のずれ）から座標を求める */
export function posAt(track, arc, lateral = 0) {
  const i = segIndexAtArc(track, arc);
  const s = track.seg[i];
  const t = clamp((((arc % track.length) + track.length) % track.length - s.cum) / s.len, 0, 1);
  const cx = s.x + s.dx * s.len * t;
  const cy = s.y + s.dy * s.len * t;
  return { x: cx - s.dy * lateral, y: cy + s.dx * lateral, heading: s.heading };
}

/**
 * 座標をコースに射影する。
 * hint に前回の segIndex を渡すと近くだけ探すので速い。
 */
export function project(track, x, y, hint = -1) {
  const N = track.N;
  let best = { d2: Infinity, i: 0, t: 0 };
  const search = (i) => {
    const s = track.seg[i];
    const px = x - s.x;
    const py = y - s.y;
    let t = (px * s.dx + py * s.dy) / s.len;
    t = clamp(t, 0, 1);
    const cx = s.x + s.dx * s.len * t;
    const cy = s.y + s.dy * s.len * t;
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) best = { d2, i, t };
  };
  if (hint >= 0) {
    const W = 40;
    for (let k = -W; k <= W; k++) search(((hint + k) % N + N) % N);
    // 近くに見つからなければ全体を探し直す
    if (best.d2 > 400 * 400) best = { d2: Infinity, i: 0, t: 0 };
    else return finish(track, x, y, best);
  }
  for (let i = 0; i < N; i++) search(i);
  return finish(track, x, y, best);
}

function finish(track, x, y, best) {
  const s = track.seg[best.i];
  const arc = s.cum + best.t * s.len;
  // 符号つきの横ずれ（進行方向に対して左が負／右が正になる）
  const lateral = s.dx * (y - s.y) - s.dy * (x - s.x);
  return { i: best.i, arc, lateral, dist: Math.sqrt(best.d2), heading: s.heading };
}

/** そこは道の外か */
export function isOffroad(track, lateral) {
  return Math.abs(lateral) > track.halfWidth;
}
