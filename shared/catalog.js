// ショップ（カスタマイズ）のカタログと、クルマの性能計算
import { PHYS, CAR_COLORS } from './constants.js';
import { CARS, DEFAULT_CAR, FREE_CARS, carById } from './cars.js';
import { clamp } from './util.js';

/** レベルアップ式のパーツ */
export const UPGRADES = {
  engine: {
    name: 'エンジン',
    icon: '⚙️',
    desc: 'さいこうスピードが あがる',
    costs: [1200, 2600, 4800],
  },
  tire: {
    name: 'タイヤ',
    icon: '🛞',
    desc: 'カーブで すべりにくくなる',
    costs: [1000, 2200, 4000],
  },
  booster: {
    name: 'ブースター',
    icon: '🚀',
    desc: 'ダッシュが つよく ながくなる',
    costs: [900, 2000, 3600],
  },
  armor: {
    name: 'アーマー',
    icon: '🛡️',
    desc: 'スリップから はやく なおる',
    costs: [800, 1700, 3000],
  },
  turboStart: {
    name: 'ターボスタート',
    icon: '🏁',
    desc: 'スタートの ダッシュが つく',
    costs: [1500, 3200, 5500],
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);
export const MAX_LEVEL = 3;

/** 見た目だけのアイテム（1回買えばずっと使える） */
export const COSMETICS = {
  hat: {
    name: 'かぶりもの',
    items: [
      { key: 'none', name: 'なし', cost: 0 },
      { key: 'crown', name: 'おうかん 👑', cost: 2500 },
      { key: 'cap', name: 'キャップ 🧢', cost: 900 },
      { key: 'horn', name: 'つの 😈', cost: 1200 },
      { key: 'flower', name: 'おはな 🌸', cost: 700 },
    ],
  },
  trail: {
    name: 'しっぽ（けむり）',
    items: [
      { key: 'none', name: 'なし', cost: 0 },
      { key: 'rainbow', name: 'にじいろ 🌈', cost: 2000 },
      { key: 'star', name: 'キラキラ ✨', cost: 1400 },
      { key: 'fire', name: 'ファイヤー 🔥', cost: 1600 },
      { key: 'bubble', name: 'シャボン 🫧', cost: 800 },
    ],
  },
  color: {
    name: 'ボディカラー',
    items: CAR_COLORS.map((c, i) => ({ key: c.key, name: c.name, cost: i < 4 ? 0 : 500 })),
  },
};

/** 1レースだけ効く使い切りアイテム */
export const CONSUMABLES = {
  luckyCoin: {
    name: 'ラッキーコイン',
    icon: '🍀',
    desc: 'つぎのレースの おかねが 1.25ばい',
    cost: 700,
  },
  spareItem: {
    name: 'アイテムポケット',
    icon: '🎁',
    desc: 'スタート時に アイテムを 1こ もっている',
    cost: 600,
  },
  softTire: {
    name: 'ねんちゃくタイヤ',
    icon: '🧪',
    desc: 'つぎのレースだけ グリップ アップ',
    cost: 500,
  },
};

/** 買える クルマ（マシン）。中身は shared/cars.js */
export const CAR_CATALOG = CARS.map((c) => ({
  key: c.id,
  name: c.name,
  type: c.type,
  desc: c.desc,
  cost: c.cost,
  perk: c.perk,
  stats: c.stats,
}));

/** 新しいプロフィール（ガレージ）を作る */
export function newProfile(name = 'プレイヤー', color = 'red') {
  const upgrades = {};
  for (const k of UPGRADE_KEYS) upgrades[k] = 0;
  return {
    name,
    color,
    car: DEFAULT_CAR,
    hat: 'none',
    trail: 'none',
    money: 0,
    totalEarned: 0,
    upgrades,
    consumables: { luckyCoin: 0, spareItem: 0, softTire: 0 },
    owned: {
      hat: ['none'],
      trail: ['none'],
      color: CAR_COLORS.slice(0, 4).map((c) => c.key),
      car: FREE_CARS.slice(),
    },
  };
}

/** 足りないフィールドを埋めて安全にする（保存データの互換用） */
export function normalizeProfile(p) {
  const base = newProfile();
  if (!p || typeof p !== 'object') return base;
  const out = { ...base, ...p };
  out.upgrades = { ...base.upgrades, ...(p.upgrades || {}) };
  for (const k of UPGRADE_KEYS) out.upgrades[k] = clamp(Math.floor(out.upgrades[k] || 0), 0, MAX_LEVEL);
  out.consumables = { ...base.consumables, ...(p.consumables || {}) };
  out.owned = { ...base.owned, ...(p.owned || {}) };
  for (const k of ['hat', 'trail', 'color', 'car']) {
    if (!Array.isArray(out.owned[k])) out.owned[k] = base.owned[k].slice();
  }
  // 0円の クルマは いつでも つかえる
  for (const id of FREE_CARS) if (!out.owned.car.includes(id)) out.owned.car.push(id);
  out.car = out.owned.car.includes(out.car) ? out.car : DEFAULT_CAR;
  out.money = Math.max(0, Math.floor(out.money || 0));
  out.name = String(out.name || 'プレイヤー').slice(0, 10);
  return out;
}

/**
 * プロフィールから実際の走行性能を計算する。
 * race.js はこの結果だけを見る（＝ショップの効果がそのまま走りに反映される）。
 */
export function statsFor(profile, opts = {}) {
  const u = (profile && profile.upgrades) || {};
  const lv = (k) => clamp(Math.floor(u[k] || 0), 0, MAX_LEVEL);
  const cons = opts.consumables || {};
  const softTire = cons.softTire ? 1 : 0;
  const car = carById(profile && profile.car);
  const m = car.stats;

  return {
    carId: car.id,
    maxSpeed: (PHYS.maxSpeed + lv('engine') * 24) * m.maxSpeed,
    accel: (PHYS.accel + lv('engine') * 18) * m.accel,
    grip: (PHYS.grip + lv('tire') * 1.5 + softTire * 1.6) * m.grip,
    turnRate: (PHYS.turnRate + lv('tire') * 0.12) * (m.turn || 1),
    boostMul: PHYS.boostMul + lv('booster') * 0.09,
    boostTime: PHYS.boostTime + lv('booster') * 0.32,
    boostKick: PHYS.boostKick + lv('booster') * 22,
    spinTime: Math.max(0.4, PHYS.spinTime - lv('armor') * 0.2 - (car.perk === 'tough' ? 0.25 : 0)),
    startBoost: lv('turboStart') > 0 ? 0.55 + lv('turboStart') * 0.28 : 0,
    offroadSpeedMul: car.perk === 'offroad' ? 0.82 : PHYS.offroadSpeedMul,
    offroadDrag: car.perk === 'offroad' ? PHYS.offroadDrag * 0.45 : PHYS.offroadDrag,
    moneyMul: (cons.luckyCoin ? 1.25 : 1) * (car.perk === 'money' ? 1.15 : 1),
    spareItem: !!cons.spareItem,
  };
}

/** 次のレベルの値段（買えない場合は null） */
export function upgradeCost(key, level) {
  const def = UPGRADES[key];
  if (!def || level >= MAX_LEVEL) return null;
  return def.costs[level];
}

/**
 * 購入処理。成功したら {ok:true}、だめなら {ok:false, reason}
 * kind: 'upgrade' | 'hat' | 'trail' | 'color' | 'consumable'
 */
export function buy(profile, kind, key) {
  const p = profile;
  if (kind === 'upgrade') {
    if (!UPGRADES[key]) return { ok: false, reason: 'そのパーツは ないよ' };
    const lv = p.upgrades[key] || 0;
    const cost = upgradeCost(key, lv);
    if (cost == null) return { ok: false, reason: 'もう さいきょうだよ！' };
    if (p.money < cost) return { ok: false, reason: 'おかねが たりないよ' };
    p.money -= cost;
    p.upgrades[key] = lv + 1;
    return { ok: true, spent: cost };
  }
  if (kind === 'car') {
    const item = CAR_CATALOG.find((i) => i.key === key);
    if (!item) return { ok: false, reason: 'その クルマは ないよ' };
    if (!p.owned.car.includes(key)) {
      if (p.money < item.cost) return { ok: false, reason: 'おかねが たりないよ' };
      p.money -= item.cost;
      p.owned.car.push(key);
    }
    p.car = key;
    return { ok: true, spent: item.cost };
  }
  if (kind === 'hat' || kind === 'trail' || kind === 'color') {
    const def = COSMETICS[kind];
    const item = def.items.find((i) => i.key === key);
    if (!item) return { ok: false, reason: 'それは ないよ' };
    const owned = p.owned[kind];
    if (!owned.includes(key)) {
      if (p.money < item.cost) return { ok: false, reason: 'おかねが たりないよ' };
      p.money -= item.cost;
      owned.push(key);
    }
    p[kind] = key; // 買ったら（持っていたら）そのまま装備
    return { ok: true, spent: 0 };
  }
  if (kind === 'consumable') {
    const def = CONSUMABLES[key];
    if (!def) return { ok: false, reason: 'それは ないよ' };
    if (p.money < def.cost) return { ok: false, reason: 'おかねが たりないよ' };
    p.money -= def.cost;
    p.consumables[key] = (p.consumables[key] || 0) + 1;
    return { ok: true, spent: def.cost };
  }
  return { ok: false, reason: 'なにを かうの？' };
}

/** レース開始時に使い切りアイテムを消費して、効果の一覧を返す */
export function consumeForRace(profile) {
  const used = {};
  for (const k of Object.keys(CONSUMABLES)) {
    if ((profile.consumables[k] || 0) > 0) {
      profile.consumables[k] -= 1;
      used[k] = true;
    }
  }
  return used;
}

export function colorHex(key) {
  const c = CAR_COLORS.find((c) => c.key === key);
  return c ? c.hex : '#ff4d5a';
}
