// コース（ステージ）の定義と、コース形状の計算
//
// コースは「中心線（閉じたループ）＋道幅」で表現している。
// クルマの位置を中心線に射影して「何メートル進んだか（arc）」「道の中心から
// どれだけ横にずれているか（lateral）」を求め、周回数・順位・コースアウト判定に使う。
import { clamp, dist, makeRng, wrapAngle } from './util.js';

export const TRACK_DEFS = [
  // ============================================================ カップ1（やさしい）
  {
    id: 'circuit',
    name: 'なかよしサーキット',
    subtitle: 'はじめてでも あんしん！ ひろい みち',
    difficulty: 1,
    surface: 'grass',
    halfWidth: 165,
    special: null,
    theme: {
      ground: '#7fd06a', ground2: '#6cc25a', road: '#5a5f6b', roadLine: '#f7f7f2',
      edge: '#ff6b6b', edge2: '#ffffff', sky: '#9fe0ff', decor: 'tree',
    },
    control: [
      [500, 1220], [660, 720], [1150, 480], [1850, 500], [2380, 690],
      [2620, 1000], [2960, 1160], [2740, 1520], [2220, 1760],
      [1520, 1820], [900, 1720], [530, 1520],
    ],
  },
  {
    id: 'park',
    name: 'こうえん ひろば',
    subtitle: 'まるい みちを ぐるぐる まわろう',
    difficulty: 1,
    surface: 'grass',
    halfWidth: 170,
    special: null,
    theme: {
      ground: '#8ad97a', ground2: '#74c765', road: '#6b6f7d', roadLine: '#fffdf0',
      edge: '#ffb03d', edge2: '#ffffff', sky: '#a8e6ff', decor: 'tree',
    },
    control: [
      [560, 1150], [760, 640], [1300, 460], [1900, 470], [2450, 640],
      [2820, 1050], [2700, 1560], [2150, 1800], [1450, 1830], [820, 1650],
    ],
  },
  {
    id: 'farm',
    name: 'ぼくじょう ロード',
    subtitle: 'ゆるい S字が つづくよ',
    difficulty: 2,
    surface: 'grass',
    halfWidth: 155,
    special: 'candy',
    theme: {
      ground: '#c8e07a', ground2: '#b6d268', road: '#7a6a55', roadLine: '#fff8dc',
      edge: '#e2703a', edge2: '#ffffff', sky: '#bfe9ff', decor: 'farm',
    },
    control: [
      [520, 1500], [560, 950], [950, 640], [1450, 780], [1750, 1150],
      [2150, 830], [2650, 700], [2980, 1020], [2900, 1500],
      [2450, 1740], [1900, 1620], [1400, 1800], [880, 1780],
    ],
  },
  {
    id: 'beach',
    name: 'サンサンビーチ',
    subtitle: 'クネクネの みちに ちゅうい！',
    difficulty: 2,
    surface: 'sand',
    halfWidth: 148,
    special: 'bubble',
    theme: {
      ground: '#ffe6a7', ground2: '#f7d68a', road: '#8d8377', roadLine: '#fffbe8',
      edge: '#39b7ff', edge2: '#ffffff', sky: '#7fd4ff', decor: 'palm',
    },
    control: [
      [520, 1380], [520, 820], [900, 520], [1420, 700], [1720, 1120],
      [2040, 700], [2520, 540], [2920, 820], [2960, 1320],
      [2600, 1660], [2100, 1500], [1700, 1780], [1180, 1820], [700, 1760],
    ],
  },
  // ============================================================ カップ2（ふつう）
  {
    id: 'harbor',
    name: 'みなと ドライブ',
    subtitle: 'うみぞいの ながい ストレート',
    difficulty: 2,
    surface: 'road',
    halfWidth: 150,
    special: 'bubble',
    theme: {
      ground: '#7ec9e8', ground2: '#6ab8db', road: '#5d6470', roadLine: '#f2f7ff',
      edge: '#ffffff', edge2: '#2f6f9e', sky: '#8fdcff', decor: 'harbor',
    },
    control: [
      [500, 1600], [500, 900], [800, 560], [1500, 480], [2200, 520],
      [2750, 700], [3000, 1100], [2850, 1560], [2350, 1800],
      [1700, 1850], [1050, 1780],
    ],
  },
  {
    id: 'desert',
    name: 'サボテン さばく',
    subtitle: 'すなで すべる！ ながい カーブ',
    difficulty: 3,
    surface: 'sand',
    halfWidth: 152,
    special: 'star',
    theme: {
      ground: '#f2c977', ground2: '#e5b962', road: '#a08256', roadLine: '#fff4d6',
      edge: '#c65f3a', edge2: '#ffe9c0', sky: '#ffd9a0', decor: 'cactus',
    },
    control: [
      [540, 1250], [700, 700], [1250, 520], [1800, 700], [2050, 1100],
      [2400, 780], [2900, 900], [3020, 1400], [2600, 1720],
      [2000, 1780], [1400, 1620], [900, 1750], [520, 1650],
    ],
  },
  {
    id: 'jungle',
    name: 'ジャングル たんけん',
    subtitle: 'せまい みちと きゅうカーブ',
    difficulty: 3,
    surface: 'grass',
    halfWidth: 138,
    special: 'vine',
    theme: {
      ground: '#3f9e5c', ground2: '#35894f', road: '#6b5a44', roadLine: '#e9ffe4',
      edge: '#f2d24b', edge2: '#2c6b41', sky: '#69d38a', decor: 'jungle',
    },
    control: [
      [600, 1700], [520, 1150], [880, 880], [1350, 1000], [1600, 700],
      [2100, 560], [2450, 850], [2200, 1200], [2600, 1400],
      [3000, 1250], [3020, 1700], [2500, 1850], [1800, 1780], [1150, 1880],
    ],
  },
  {
    id: 'snow',
    name: 'キラキラゆきやま',
    subtitle: 'ツルツル すべる！ じょうきゅうしゃむけ',
    difficulty: 3,
    surface: 'snow',
    halfWidth: 138,
    special: 'snowball',
    theme: {
      ground: '#eaf6ff', ground2: '#d8ecfb', road: '#9fb4c7', roadLine: '#ffffff',
      edge: '#7a9ec4', edge2: '#ffffff', sky: '#bfe4ff', decor: 'snow',
    },
    control: [
      [620, 1780], [500, 1280], [820, 1000], [1240, 1160], [1520, 900],
      [1300, 620], [1720, 450], [2200, 600], [2120, 1010],
      [2540, 1160], [2920, 1010], [3010, 1450], [2620, 1720],
      [2100, 1820], [1600, 1660], [1080, 1860],
    ],
  },
  // ========================================================== カップ3（むずかしい）
  {
    id: 'city',
    name: 'よるの シティ',
    subtitle: 'ネオンの まちを かけぬけろ',
    difficulty: 4,
    surface: 'road',
    halfWidth: 142,
    special: 'star',
    theme: {
      ground: '#2c3350', ground2: '#252b45', road: '#3d4358', roadLine: '#ffe66d',
      edge: '#ff4d8d', edge2: '#5ce1e6', sky: '#1b2036', decor: 'city',
    },
    control: [
      [560, 1500], [520, 950], [900, 600], [1450, 560], [1780, 880],
      [2150, 600], [2700, 640], [2980, 1020], [2870, 1500],
      [2350, 1810], [1700, 1870], [1080, 1720],
    ],
  },
  {
    id: 'candy',
    name: 'おかしの くに',
    subtitle: 'あまーい みちは ベタベタ すべる',
    difficulty: 4,
    surface: 'candy',
    halfWidth: 145,
    special: 'candy',
    theme: {
      ground: '#ffd7ec', ground2: '#ffc6e4', road: '#b06ea8', roadLine: '#fff3fa',
      edge: '#ff7bc0', edge2: '#fff0f8', sky: '#ffe3f4', decor: 'candy',
    },
    control: [
      [560, 1300], [620, 780], [1100, 520], [1600, 640], [1850, 1000],
      [2200, 640], [2750, 620], [3000, 1050], [2880, 1520],
      [2400, 1780], [1850, 1650], [1350, 1820], [800, 1700],
    ],
  },
  {
    id: 'volcano',
    name: 'ドキドキ かざん',
    subtitle: 'あつい！ ほのおに 気をつけて',
    difficulty: 5,
    surface: 'lava',
    halfWidth: 136,
    special: 'fireball',
    theme: {
      ground: '#5b2b2b', ground2: '#4c2424', road: '#3a3238', roadLine: '#ffb347',
      edge: '#ff5722', edge2: '#ffd08a', sky: '#7a2f2f', decor: 'volcano',
    },
    control: [
      [600, 1650], [520, 1100], [900, 820], [1350, 950], [1550, 640],
      [2050, 520], [2400, 800], [2150, 1150], [2600, 1300],
      [3000, 1150], [3020, 1620], [2500, 1820], [1900, 1700], [1200, 1830],
    ],
  },
  {
    id: 'space',
    name: 'うちゅう ステーション',
    subtitle: 'さいごの ステージ！ ツルツルで きゅうカーブ',
    difficulty: 5,
    surface: 'space',
    halfWidth: 134,
    special: 'star',
    theme: {
      ground: '#131a33', ground2: '#0f1529', road: '#4a5580', roadLine: '#9fe8ff',
      edge: '#7b5cff', edge2: '#9fe8ff', sky: '#0b1020', decor: 'space',
    },
    control: [
      [640, 1760], [500, 1180], [860, 840], [1400, 740], [1740, 1060],
      [2080, 720], [2520, 560], [2960, 820], [3060, 1320],
      [2740, 1700], [2180, 1800], [1620, 1620], [1080, 1840],
    ],
  },
];

/** グランプリ（4コース × 3カップ） */
export const GRAND_PRIX = [
  {
    id: 'friend',
    name: 'なかよしカップ',
    badge: '🌼',
    desc: 'はじめての 4コース。ひろい みちが おおい',
    tracks: ['circuit', 'park', 'farm', 'beach'],
  },
  {
    id: 'wonder',
    name: 'わくわくカップ',
    badge: '⭐',
    desc: 'うみ・さばく・ジャングル・ゆきやま',
    tracks: ['harbor', 'desert', 'jungle', 'snow'],
  },
  {
    id: 'champion',
    name: 'チャンピオンカップ',
    badge: '🏆',
    desc: 'よるの まちから うちゅうまで。いちばん むずかしい',
    tracks: ['city', 'candy', 'volcano', 'space'],
  },
];

export function grandPrixList() {
  return GRAND_PRIX.map((g) => ({
    id: g.id,
    name: g.name,
    badge: g.badge,
    desc: g.desc,
    tracks: g.tracks.slice(),
  }));
}

export function grandPrixById(id) {
  return GRAND_PRIX.find((g) => g.id === id) || GRAND_PRIX[0];
}

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
    surface: d.surface,
    special: d.special || null,
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
    special: def.special || null,
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
  // 2台ずつ 4れつ ＝ さいだい 8台
  const rows = [];
  for (let row = 0; row < 4; row++) {
    const back = -90 - row * 100;
    rows.push([back, -62], [back, 62]);
  }
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
