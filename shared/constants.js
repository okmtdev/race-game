// ゲーム全体の定数（サーバ・クライアント共用）

export const PROTOCOL_VERSION = 3;

/** シミュレーションのティック（サーバもオフラインも固定ステップ） */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/** 1レースの参加台数（人が足りない分は NPC で埋める） */
export const RACERS = 4;

/** 既定のラップ数 */
export const DEFAULT_LAPS = 3;

/** グランプリで走るコース（順番） */
export const DEFAULT_GP = ['circuit', 'beach', 'snow'];

/** カウントダウンの秒数 */
export const COUNTDOWN_SEC = 3.5;

/** 1位ゴールから何秒でレース強制終了にするか */
export const FINISH_GRACE_SEC = 25;

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
  sand: { gripMul: 0.9, name: 'すなはま' },
  snow: { gripMul: 0.72, name: 'ゆき' },
};

/** アイテム */
export const ITEMS = {
  rocket: { name: 'ロケット', icon: '🚀', desc: 'ビューン！とダッシュ' },
  shield: { name: 'バリア', icon: '🛡️', desc: '10びょう まもってくれる' },
  oil: { name: 'オイル', icon: '🛢️', desc: 'うしろに おいてスリップさせる' },
  thunder: { name: 'カミナリ', icon: '⚡', desc: 'まえの みんなを ちょっと おそくする' },
  magnet: { name: 'コインじしゃく', icon: '🧲', desc: 'コインを ひきよせる' },
};

/** 順位ごとのアイテム抽選テーブル（後ろほど強いアイテムが出る＝ゴムひも効果） */
export const ITEM_TABLE = [
  // 1位
  [['oil', 4], ['shield', 3], ['rocket', 1], ['magnet', 2]],
  // 2位
  [['oil', 3], ['shield', 3], ['rocket', 3], ['magnet', 2], ['thunder', 1]],
  // 3位
  [['oil', 2], ['shield', 2], ['rocket', 4], ['magnet', 2], ['thunder', 3]],
  // 4位
  [['oil', 1], ['shield', 2], ['rocket', 5], ['magnet', 2], ['thunder', 4]],
];

/** おかね */
export const MONEY = {
  coin: 50,
  itemBox: 30,
  lap: 200,
  drift: 15, // ドリフト1秒あたり
  overtake: 100,
  finish: [2200, 1500, 1000, 700],
  luckyMul: 1.25,
};

/** グランプリのポイント */
export const POINTS = [9, 6, 3, 1];

/** 復活（コインなどの）秒数 */
export const RESPAWN = { coin: 9, box: 6 };

/** NPC の名前候補 */
export const NPC_NAMES = ['ピコ', 'モグ', 'ラン', 'クマちゃん', 'ぴょん', 'たまご', 'ぷに', 'ゴロー'];

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
