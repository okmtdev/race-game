// ゲーム全体の定数（サーバ・クライアント共用）

export const PROTOCOL_VERSION = 3;

/** シミュレーションのティック（サーバもオフラインも固定ステップ） */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** レースの参加台数（人が足りない分は NPC で埋める）。ホストが 4 か 8 を えらぶ */
export const RACER_CHOICES = [4, 8];
export const RACERS = 4; // 既定値
export const MAX_RACERS = 8;

/** 既定のラップ数 */
export const DEFAULT_LAPS = 3;

/** カウントダウンの秒数 */
export const COUNTDOWN_SEC = 3.5;

/**
 * 1位ゴールから何秒でレース強制終了にするか。
 * へたな NPC や はじめての子でも ちゃんと ゴールできるように 長めにとってある。
 */
export const FINISH_GRACE_SEC = 60;

/** レースの上限時間（保険） */
export const RACE_TIMEOUT_SEC = 300;

/** クルマの見た目・当たり判定のサイズ */
export const CAR_LEN = 46;
export const CAR_W = 28;
export const CAR_R = 17; // 当たり判定の半径

/** 物理の基本値（アップグレードで変化する） */
export const PHYS = {
  maxSpeed: 400,
  accel: 480,
  brake: 560,
  reverseSpeed: 110,
  drag: 0.9, // 1秒あたりの空気抵抗係数
  turnRate: 2.75, // rad/s
  grip: 9.5, // 横滑りの止まりやすさ（大きいほどグリップ）
  boostMul: 1.55,
  boostTime: 1.5,
  boostKick: 90,
  spinTime: 1.15,
  offroadSpeedMul: 0.55,
  offroadDrag: 3.2,
  wallBounce: 0.35,
};

/** 路面の種類ごとの係数 */
export const SURFACES = {
  grass: { gripMul: 1.0, name: 'しばふ' },
  road: { gripMul: 1.06, name: 'アスファルト' },
  sand: { gripMul: 0.9, name: 'すなはま' },
  candy: { gripMul: 0.8, name: 'あめ' },
  lava: { gripMul: 0.88, name: 'いわ' },
  snow: { gripMul: 0.72, name: 'ゆき' },
  space: { gripMul: 0.62, name: 'むじゅうりょく' },
};

/**
 * アイテム。
 * special: true のものは「そのステージでしか出ない」ステージ限定アイテム。
 */
export const ITEMS = {
  rocket: { name: 'ロケット', icon: '🚀', desc: 'ビューン！と ダッシュ' },
  shield: { name: 'バリア', icon: '🛡️', desc: '10びょう まもってくれる' },
  oil: { name: 'オイル', icon: '🛢️', desc: 'うしろに おいて スリップさせる' },
  thunder: { name: 'カミナリ', icon: '⚡', desc: 'まえの みんなを ちょっと おそくする' },
  magnet: { name: 'コインじしゃく', icon: '🧲', desc: 'コインを ひきよせる' },
  shot: { name: 'ミサイル', icon: '☄️', desc: 'コースを とんでいって 1台に あたる' },
  ghost: { name: 'おばけ', icon: '👻', desc: '5びょう こうげきを うけない' },
  swap: { name: 'いれかわり', icon: '🔄', desc: 'まえの 1台と ばしょを こうかん！' },
  triple: { name: 'トリプルダッシュ', icon: '🎇', desc: '3かい ダッシュできる' },
  // ------------------------------------------------ ここから ステージ限定
  star: {
    name: 'スーパースター', icon: '⭐', special: true,
    desc: '8びょう むてき！ ぶつかった 相手は スピン',
  },
  snowball: {
    name: 'ゆきだま', icon: '⛄', special: true,
    desc: 'ころがって だんだん 大きくなる',
  },
  fireball: {
    name: 'ファイヤー', icon: '🔥', special: true,
    desc: 'うしろに ほのおを 3つ おく',
  },
  bubble: {
    name: 'シャボン', icon: '🫧', special: true,
    desc: 'まえの 1台を ふわふわに して ハンドルを きかなくする',
  },
  candy: {
    name: 'ベタベタキャンディ', icon: '🍬', special: true,
    desc: 'まえの みんなを ベタベタで おそくする',
  },
  vine: {
    name: 'つるレーザー', icon: '🌿', special: true,
    desc: '1いの クルマを つかまえて とめる',
  },
};

/**
 * 順位ごとのアイテム抽選テーブル（後ろほど強いアイテムが出る＝ゴムひも効果）。
 * 4人でも8人でも つかえるように「前から何割の位置か」で 4だんかいに わける。
 * ステージ限定アイテムは そのコースの special として あとから 足される。
 */
export const ITEM_TABLE = [
  // 前から 1/4（トップ集団）
  [['oil', 5], ['shield', 3], ['magnet', 2], ['rocket', 1], ['ghost', 1]],
  // 2/4
  [['oil', 3], ['shield', 3], ['rocket', 3], ['magnet', 2], ['shot', 3], ['ghost', 1]],
  // 3/4
  [['oil', 1], ['shield', 2], ['rocket', 4], ['magnet', 2], ['shot', 4],
    ['thunder', 3], ['triple', 2], ['swap', 2]],
  // うしろ 1/4
  [['shield', 2], ['rocket', 5], ['magnet', 2], ['shot', 3],
    ['thunder', 4], ['triple', 4], ['swap', 4], ['ghost', 2]],
];

/** ステージ限定アイテムの 出やすさ（順位バケツごと） */
export const SPECIAL_WEIGHT = [2, 3, 4, 5];

/** おかね */
export const MONEY = {
  coin: 50,
  itemBox: 30,
  lap: 200,
  drift: 15, // ドリフト1秒あたり
  overtake: 100,
  // 4人のときは まえの 4つ、8人のときは 8つぜんぶ つかう
  finish: [2200, 1500, 1000, 700, 600, 500, 420, 350],
  luckyMul: 1.25,
};

/** グランプリのポイント（人数によって かえる） */
export const POINTS = [9, 6, 3, 1];
export const POINTS_8 = [15, 12, 10, 8, 6, 4, 2, 1];

export function pointsFor(racerCount) {
  return racerCount > 4 ? POINTS_8 : POINTS;
}

/** 復活（コインなどの）秒数 */
export const RESPAWN = { coin: 9, box: 6 };

/** NPC の名前候補 */
export const NPC_NAMES = ['ピコ', 'モグ', 'ラン', 'クマちゃん', 'ぴょん', 'たまご', 'ぷに', 'ゴロー'];

/**
 * NPC の うでまえ（3だんかい）。
 *   skill     … カーブで 出す 速さ（大きいほど 上手）
 *   speedMul  … さいこうスピードの ばいりつ
 *   steerGain … ハンドルの はんのう（小さいほど もたつく＝ふくらむ）
 *   look      … どれだけ 先を 見るか（小さいほど 曲がるのが おそい）
 *   mistake   … ときどき やる しっぱい（ブレーキわすれ・ふくらみ）の おこりやすさ
 *   carPool   … のる マシン（下手な子は おそい クルマに のる）
 */
export const NPC_TIERS = {
  master: {
    key: 'master', name: 'プロ', badge: '🏆',
    skill: 1.12, speedMul: 1.12, steerGain: 2.9, look: 1.12, mistake: 0,
    catchUpMax: 1.08, levelBonus: 1,
    carPool: ['hyper', 'wedge', 'rosso'],
  },
  pro: {
    key: 'pro', name: 'じょうず', badge: '😎',
    skill: 0.95, speedMul: 1.0, steerGain: 2.4, look: 1.0, mistake: 0.0,
    catchUpMax: 1.06, levelBonus: 0,
    carPool: ['rosso', 'wedge', 'hyper'],
  },
  normal: {
    key: 'normal', name: 'ふつう', badge: '🙂',
    skill: 0.84, speedMul: 0.92, steerGain: 1.95, look: 0.88, mistake: 0.04,
    catchUpMax: 1.03, levelBonus: 0,
    carPool: ['gt', 'roadster', 'buggy'],
  },
  rookie: {
    key: 'rookie', name: 'へた', badge: '🔰',
    skill: 0.52, speedMul: 0.72, steerGain: 1.15, look: 0.55, mistake: 0.2,
    catchUpMax: 1.0, levelBonus: -2,
    carPool: ['classic', 'kei'],
  },
};

/**
 * NPC を 入れる じゅんばん（前から つかう）。ホストが えらぶ つよさで かわる。
 * どれも「へた」が おおめ。うしろの スロットほど つよい子が 入る。
 */
export const NPC_MIXES = {
  easy: ['rookie', 'rookie', 'rookie', 'normal', 'rookie', 'rookie', 'normal', 'rookie'],
  normal: ['rookie', 'normal', 'rookie', 'pro', 'rookie', 'normal', 'rookie', 'pro'],
  hard: ['rookie', 'normal', 'pro', 'master', 'normal', 'pro', 'master', 'pro'],
};

/** ホストが えらぶ「NPCの つよさ」（グランプリごとに えらべる） */
export const NPC_DIFFICULTY = {
  easy: { label: 'やさしい', desc: 'へた ばっかり' },
  normal: { label: 'ふつう', desc: 'へた おおめ ＋ じょうず が1人' },
  hard: { label: 'つよい', desc: '🏆プロ が でてくる' },
};

/** 選べるカラー */
export const CAR_COLORS = [
  { key: 'red', name: 'あか', hex: '#ff4d5a' },
  { key: 'blue', name: 'あお', hex: '#3d8bff' },
  { key: 'yellow', name: 'きいろ', hex: '#ffd93b' },
  { key: 'green', name: 'みどり', hex: '#4fd67a' },
  { key: 'pink', name: 'ピンク', hex: '#ff8ad1' },
  { key: 'purple', name: 'むらさき', hex: '#b07bff' },
  { key: 'orange', name: 'オレンジ', hex: '#ff9b3d' },
  { key: 'mint', name: 'ミント', hex: '#5be0d0' },
];

export const EMOTES = ['😆', '😭', '😡', '👍', '🎉', '💨'];
