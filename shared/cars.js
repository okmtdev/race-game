// えらべる クルマ（マシン）の いちらん
//
// 実在の スーパーカー／オープンカーの かたちを イメージして 作っています。
// ★ 名前を じっさいの メーカー名・車名（ランボルギーニ／フェラーリ／GT-R など）に
//    したい場合は、この ファイルの name を 書きかえるだけで 画面ぜんぶに 反映されます。
//    ただし インターネットに 公開する ばあいは 商標に なるので、
//    おうちの中（ローカル）だけで あそぶ ときに してください。
//
// stats は「基本性能に かける ばいりつ」。
//   maxSpeed: さいこうスピード / accel: 加速 / grip: よこ滑りのしにくさ / turn: ハンドルの切れ
// perk は とくべつな とくちょう。
//   'money'   … あつめる おかねが 1.15ばい
//   'offroad' … しばふ・すなの上でも あまり おそくならない
//   'tough'   … ぶつかっても スピンしにくい（回復がはやい）
export const CARS = [
  {
    id: 'gt',
    name: 'ハヤブサ GT-R',
    type: 'ツインターボ GTクーペ',
    desc: 'なんでも できる バランス型。はじめは これ！',
    cost: 0,
    stats: { maxSpeed: 1.0, accel: 1.05, grip: 1.06, turn: 1.0 },
    perk: null,
    size: { len: 48, wid: 29 },
    accent: '#20242e',
  },
  {
    id: 'kei',
    name: 'ちびスポーツ',
    type: 'かるい オープン 2シーター',
    desc: 'ちいさくて かるい。とびだしが いちばん はやい',
    cost: 0,
    stats: { maxSpeed: 0.93, accel: 1.14, grip: 1.12, turn: 1.06 },
    perk: null,
    size: { len: 40, wid: 26 },
    accent: '#ffffff',
  },
  {
    id: 'classic',
    name: 'クラシック オープン',
    type: 'むかしの オープンカー',
    desc: 'ゆっくりだけど、おかねが 1.15ばい たまる',
    cost: 1500,
    stats: { maxSpeed: 0.92, accel: 0.98, grip: 1.08, turn: 1.02 },
    perk: 'money',
    size: { len: 46, wid: 27 },
    accent: '#f4e4c1',
  },
  {
    id: 'roadster',
    name: 'ソラカゼ ロードスター',
    type: 'オープンカー（ほろナシ）',
    desc: 'カーブが とくい。かぜが きもちいい',
    cost: 3000,
    stats: { maxSpeed: 0.97, accel: 1.07, grip: 1.16, turn: 1.05 },
    perk: null,
    size: { len: 45, wid: 28 },
    accent: '#e9eef7',
  },
  {
    id: 'buggy',
    name: 'モンスター バギー',
    type: 'オフロード バギー',
    desc: 'しばふや すなはまでも へいき！',
    cost: 4000,
    stats: { maxSpeed: 0.95, accel: 1.05, grip: 1.02, turn: 1.04 },
    perk: 'offroad',
    size: { len: 46, wid: 33 },
    accent: '#2f3542',
  },
  {
    id: 'rosso',
    name: 'ロッソ・ヴェント',
    type: 'ミッドシップ スーパーカー',
    desc: 'あかい すごいクルマ。加速も カーブも つよい',
    cost: 9000,
    stats: { maxSpeed: 1.06, accel: 1.1, grip: 1.06, turn: 1.02 },
    perk: null,
    size: { len: 49, wid: 30 },
    accent: '#ffe9a8',
  },
  {
    id: 'wedge',
    name: 'トロ・ヴェルデ',
    type: 'V12 ウェッジ スーパーカー',
    desc: 'カミソリみたいな かたち。まっすぐが とにかく はやい',
    cost: 13000,
    stats: { maxSpeed: 1.11, accel: 1.06, grip: 0.96, turn: 0.98 },
    perk: null,
    size: { len: 51, wid: 31 },
    accent: '#1b1f2a',
  },
  {
    id: 'hyper',
    name: 'ゼロワン ハイパー',
    type: 'ハイブリッド ハイパーカー',
    desc: 'さいそく！ でも うまく のらないと むずかしい',
    cost: 24000,
    stats: { maxSpeed: 1.16, accel: 1.12, grip: 0.98, turn: 0.97 },
    perk: 'tough',
    size: { len: 52, wid: 31 },
    accent: '#c9f2ff',
  },
];

export const DEFAULT_CAR = 'gt';
export const FREE_CARS = CARS.filter((c) => c.cost === 0).map((c) => c.id);

const byId = new Map(CARS.map((c) => [c.id, c]));

export function carById(id) {
  return byId.get(id) || byId.get(DEFAULT_CAR);
}
