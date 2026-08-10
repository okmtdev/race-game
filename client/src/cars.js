// クルマの 見た目（うえから見た かたち）を えがく。
// 車種ごとに シルエットを かえて、スーパーカー／オープンカー／バギーの
// ちがいが パッと わかるように している。
import { carById } from '../../shared/cars.js';
import { colorHex } from '../../shared/catalog.js';
import { clamp } from '../../shared/util.js';

/** 色を あかるく／くらく する */
export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex || '#ff4d5a';
  const n = parseInt(m[1], 16);
  const f = (v) => clamp(Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
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

function wheels(ctx, list, color = '#23283a') {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of list) {
    roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.4);
    ctx.fill();
  }
}

function windshield(ctx, x, y, w, h, r = 5) {
  ctx.fillStyle = '#cfe9ff';
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  roundRect(ctx, x + 1.5, y + 1.5, w * 0.45, h - 3, r * 0.7);
  ctx.fill();
}

/** オープンカーの ざせき（2つの まる） */
function seats(ctx, x, gap) {
  ctx.fillStyle = '#3a2f2a';
  for (const dy of [-gap, gap]) {
    ctx.beginPath();
    ctx.arc(x, dy, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function headlights(ctx, x, gap, w = 5, h = 3.4) {
  ctx.fillStyle = '#fff8d8';
  for (const dy of [-gap, gap]) {
    roundRect(ctx, x, dy - h / 2, w, h, 1.6);
    ctx.fill();
  }
}

function tailLight(ctx, x, w, h) {
  ctx.fillStyle = '#ff4646';
  roundRect(ctx, x, -h / 2, w, h, 1.5);
  ctx.fill();
}

// -------------------------------------------------------------- 車種ごとの絵
// どの関数も「中心 (0,0)・鼻先が +X」の むきで えがく。

const MODELS = {
  // ツインターボ GT クーペ（四角くて つよそう）
  gt(ctx, col, dark, accent) {
    wheels(ctx, [[-15, -15, 15, 11], [-15, 15, 15, 11], [15, -15, 15, 11], [15, 15, 15, 11]]);
    ctx.fillStyle = col;
    poly(ctx, [[-24, -13], [-20, -14.5], [16, -14.5], [24, -9], [24, 9], [16, 14.5], [-20, 14.5], [-24, 13]]);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // うしろの ハネ
    ctx.fillStyle = accent;
    roundRect(ctx, -26, -15, 6, 30, 2);
    ctx.fill();
    // ボンネットの ダクト
    ctx.fillStyle = shade(col, -0.3);
    roundRect(ctx, 8, -7, 8, 14, 3);
    ctx.fill();
    windshield(ctx, -6, -9.5, 13, 19, 5);
    ctx.fillStyle = shade(col, 0.2);
    roundRect(ctx, -18, -10, 10, 20, 4);
    ctx.fill();
    headlights(ctx, 18, 8);
    tailLight(ctx, -22, 3, 20);
  },

  // ちびスポーツ（かるい オープン2シーター）
  kei(ctx, col, dark, accent) {
    wheels(ctx, [[-12, -13, 12, 9], [-12, 13, 12, 9], [12, -13, 12, 9], [12, 13, 12, 9]]);
    ctx.fillStyle = col;
    roundRect(ctx, -20, -12, 40, 24, 9);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // まえの まる目
    headlights(ctx, 14, 7, 4.5, 4.5);
    // ほろナシ（ざせきが 見える）
    ctx.fillStyle = shade(col, -0.25);
    roundRect(ctx, -10, -9, 14, 18, 6);
    ctx.fill();
    seats(ctx, -3, 4.6);
    ctx.fillStyle = accent;
    roundRect(ctx, 3, -9, 2.6, 18, 1.3);
    ctx.fill(); // ちいさな フロントガラス
    tailLight(ctx, -19, 2.6, 14);
  },

  // クラシック オープン（まるい フェンダー）
  classic(ctx, col, dark, accent) {
    wheels(ctx, [[-14, -15, 13, 10], [-14, 15, 13, 10], [14, -15, 13, 10], [14, 15, 13, 10]]);
    ctx.fillStyle = col;
    roundRect(ctx, -23, -11, 46, 22, 11);
    ctx.fill();
    // まるい フェンダー
    for (const [x, y] of [[-14, -13], [-14, 13], [14, -13], [14, 13]]) {
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    roundRect(ctx, -23, -11, 46, 22, 11);
    ctx.stroke();
    ctx.fillStyle = accent;
    roundRect(ctx, -8, -8.5, 15, 17, 6);
    ctx.fill(); // ベージュの 内そう
    seats(ctx, -2, 4.4);
    ctx.fillStyle = '#cfe9ff';
    roundRect(ctx, 6, -8, 2.6, 16, 1.3);
    ctx.fill();
    headlights(ctx, 17, 8.5, 4.5, 4.5);
    ctx.fillStyle = shade(col, -0.35);
    roundRect(ctx, 20, -5, 4, 10, 2);
    ctx.fill(); // グリル
  },

  // ソラカゼ ロードスター（ほろナシ・なめらか）
  roadster(ctx, col, dark, accent) {
    wheels(ctx, [[-14, -14, 14, 10], [-14, 14, 14, 10], [14, -14, 14, 10], [14, 14, 14, 10]]);
    ctx.fillStyle = col;
    poly(ctx, [[-22, -11], [-16, -13.5], [14, -13], [22, -7], [22, 7], [14, 13], [-16, 13.5], [-22, 11]]);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = shade(col, -0.28);
    roundRect(ctx, -12, -9.5, 16, 19, 7);
    ctx.fill();
    seats(ctx, -4, 4.8);
    ctx.fillStyle = accent;
    roundRect(ctx, 4, -9.5, 3, 19, 1.5);
    ctx.fill();
    headlights(ctx, 16, 7.5, 5.5, 3);
    tailLight(ctx, -21, 3, 16);
  },

  // モンスター バギー（タイヤ でかい・ロールバー）
  buggy(ctx, col, dark, accent) {
    wheels(ctx, [[-15, -17, 18, 13], [-15, 17, 18, 13], [15, -17, 18, 13], [15, 17, 18, 13]], '#1b1f28');
    ctx.fillStyle = col;
    roundRect(ctx, -20, -11, 40, 22, 7);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // ロールバー
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.moveTo(-2, -10);
    ctx.lineTo(-2, 10);
    ctx.stroke();
    seats(ctx, -5, 4.6);
    ctx.fillStyle = '#ffd93b';
    for (const dy of [-6, 6]) {
      ctx.beginPath();
      ctx.arc(15, dy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    tailLight(ctx, -19, 3, 12);
  },

  // ロッソ・ヴェント（ミッドシップ スーパーカー）
  rosso(ctx, col, dark, accent) {
    wheels(ctx, [[-16, -15, 16, 11], [-16, 15, 16, 11], [15, -15, 14, 10], [15, 15, 14, 10]]);
    ctx.fillStyle = col;
    poly(ctx, [[-24, -10], [-19, -14], [8, -15], [20, -10], [25, -4], [25, 4], [20, 10], [8, 15], [-19, 14], [-24, 10]]);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // エンジンの すきま（うしろ）
    ctx.fillStyle = shade(col, -0.4);
    for (const dy of [-7, 0, 7]) {
      roundRect(ctx, -20, dy - 1.6, 11, 3.2, 1.6);
      ctx.fill();
    }
    windshield(ctx, -5, -9, 11, 18, 5);
    // サイドの すいこみ口
    ctx.fillStyle = shade(col, -0.3);
    poly(ctx, [[-8, -15], [2, -13], [2, -10], [-8, -11]]);
    ctx.fill();
    poly(ctx, [[-8, 15], [2, 13], [2, 10], [-8, 11]]);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, -26, -12, 5, 24, 2);
    ctx.fill(); // リヤウイング
    headlights(ctx, 19, 7, 5, 2.8);
    tailLight(ctx, -23, 2.6, 18);
  },

  // トロ・ヴェルデ（V12 ウェッジ・カミソリみたいな かたち）
  wedge(ctx, col, dark, accent) {
    wheels(ctx, [[-17, -16, 17, 12], [-17, 16, 17, 12], [16, -15, 14, 10], [16, 15, 14, 10]]);
    ctx.fillStyle = col;
    poly(ctx, [[-25, -13], [-21, -16], [4, -16], [26, -6], [26, 6], [4, 16], [-21, 16], [-25, 13]]);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // とがった ボンネットの すじ
    ctx.strokeStyle = shade(col, -0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(6, -9);
    ctx.moveTo(24, 0);
    ctx.lineTo(6, 9);
    ctx.stroke();
    ctx.fillStyle = '#cfe9ff';
    poly(ctx, [[-2, -9], [8, -6], [8, 6], [-2, 9]]);
    ctx.fill();
    ctx.fillStyle = shade(col, -0.45);
    roundRect(ctx, -20, -12, 12, 24, 3);
    ctx.fill(); // エンジンフード
    ctx.fillStyle = accent;
    roundRect(ctx, -27, -14, 6, 28, 2);
    ctx.fill();
    headlights(ctx, 20, 5.5, 4.5, 2.4);
    tailLight(ctx, -24, 2.6, 20);
  },

  // ゼロワン ハイパー（ながい しっぽ・光る すじ）
  hyper(ctx, col, dark, accent) {
    wheels(ctx, [[-17, -16, 17, 11], [-17, 16, 17, 11], [16, -15, 15, 10], [16, 15, 15, 10]]);
    ctx.fillStyle = col;
    poly(ctx, [[-26, -8], [-22, -14], [-4, -16], [14, -13], [26, -5], [26, 5], [14, 13], [-4, 16], [-22, 14], [-26, 8]]);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // 光る すじ
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(20, -6);
    ctx.lineTo(-24, -6);
    ctx.moveTo(20, 6);
    ctx.lineTo(-24, 6);
    ctx.stroke();
    windshield(ctx, -4, -8, 12, 16, 5);
    ctx.fillStyle = shade(col, -0.4);
    poly(ctx, [[-24, -12], [-10, -13], [-10, 13], [-24, 12]]);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, -28, -13, 5, 26, 2);
    ctx.fill();
    headlights(ctx, 20, 6, 4.5, 2.4);
    tailLight(ctx, -25, 2.4, 22);
  },
};

/** クルマ1台を えがく（中心が (0,0)、鼻先が +X の むき） */
export function drawCarShape(ctx, modelId, colorKey) {
  const model = carById(modelId);
  const col = colorHex(colorKey);
  const fn = MODELS[model.id] || MODELS.gt;
  fn(ctx, col, shade(col, -0.45), model.accent);
}

/** クルマの 大きさ（かげや えらぶ画面で つかう） */
export function carSize(modelId) {
  return carById(modelId).size;
}

/** ショップの「クルマえらび」用の 絵 */
export function drawCarPreview(canvas, modelId, colorKey) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 150;
  const h = canvas.clientHeight || 80;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // 車体（さいだい 52x33、たてむきに するので 33x52）が はみ出さない ばいりつ
  const s = Math.min(w / 46, h / 60);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, (dpr * w) / 2, (dpr * h) / 2);
  ctx.clearRect(-w, -h, w * 2, h * 2);
  ctx.rotate(-Math.PI / 2); // 上を むかせる
  // ゆかの かげ（クルマと 同じ むきに する）
  const size = carById(modelId).size;
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath();
  ctx.ellipse(1, 3, size.len * 0.52, size.wid * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCarShape(ctx, modelId, colorKey);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
