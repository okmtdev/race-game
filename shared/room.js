// ロビー → レース → けっか → ショップ → つぎのレース … の進行管理
//
// このクラスはサーバ（node）でも、ブラウザの「ひとりであそぶ」モードでも
// そのまま使う。node 固有の API は使わず、保存は store（差しかえ可能）に任せる。
import {
  CAR_COLORS, DEFAULT_LAPS, DT, MAX_RACERS, NPC_DIFFICULTY, NPC_MIXES, NPC_NAMES,
  NPC_TIERS, RACER_CHOICES, RACERS, pointsFor,
} from './constants.js';
import {
  CAR_CATALOG, COSMETICS, CONSUMABLES, UPGRADES, buy, consumeForRace, mergeProfile, newProfile,
} from './catalog.js';
import { Race } from './race.js';
import { CARS } from './cars.js';
import { GRAND_PRIX, grandPrixById, grandPrixList, trackList } from './tracks.js';
import { clamp } from './util.js';

const RESULT_SEC = 7;

export class Room {
  constructor(store) {
    this.store = store;
    this.players = new Map(); // id -> player
    this.nextId = 1;
    this.phase = 'lobby'; // lobby | race | result | shop | gpresult
    this.settings = {
      mode: 'gp', // gp | single
      laps: DEFAULT_LAPS,
      gp: GRAND_PRIX[0].id, // どの グランプリ（カップ）を 走るか
      track: GRAND_PRIX[0].tracks[0], // 1レースだけ の ときの コース
      difficulty: 'normal',
      racers: RACERS, // 4 か 8。グランプリ中は かえられない
    };
    this.race = null;
    this.gp = null;
    this.timer = 0;
    this.seed = 1;
    this.dirty = true;
  }

  // -------------------------------------------------------------- プレイヤー

  join(conn, msg) {
    const name = sanitizeName(msg && msg.name);
    const id = 'p' + this.nextId++;
    const profile = this.store.get(name, pickFreeColor(this));
    // スマホに 保存してある ガレージ（おかね・買ったもの）を 引きつぐ
    if (msg && msg.garage && mergeProfile(profile, msg.garage)) {
      console.log(`[garage] ${name} の セーブデータを 引きつぎました (¥${Math.round(profile.money)})`);
      this.store.save();
    }
    if (msg && msg.color) profile.color = msg.color;
    const player = {
      id,
      conn,
      name,
      profile,
      ready: false,
      touch: !!(msg && msg.touch),
      host: false,
      ping: 0,
      pingSent: 0,
      inRace: false,
      points: 0,
      lastMoney: 0,
    };
    this.players.set(id, player);
    if (![...this.players.values()].some((p) => p.host)) player.host = true;
    console.log(`[room] ${name} が さんかしました (${conn.remote}) → ${this.players.size}人`);

    conn.sendJson({
      t: 'hello',
      id,
      proto: 3,
      tracks: trackList(),
      grandPrix: grandPrixList(),
      racerChoices: RACER_CHOICES,
      difficulties: NPC_DIFFICULTY,
      catalog: {
        upgrades: UPGRADES, cosmetics: COSMETICS, consumables: CONSUMABLES, cars: CAR_CATALOG,
      },
      colors: CAR_COLORS,
    });
    this.sendProfile(player);
    this.dirty = true;

    // レース中に来た人は「かんせん」から入る
    if (this.race && this.phase === 'race') {
      conn.sendJson(this.raceStartMessage());
    }
    return player;
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    console.log(`[room] ${p.name} が ぬけました → ${this.players.size}人`);
    // レース中なら NPC が かわりに 運転する
    if (this.race) {
      const car = this.race.byId.get(id);
      if (car && !car.finished) {
        car.kind = 'npc';
        car.name = car.name + '(AI)';
      }
    }
    if (p.host) {
      const next = this.players.values().next().value;
      if (next) next.host = true;
    }
    if (this.players.size === 0) {
      this.race = null;
      this.gp = null;
      this.phase = 'lobby';
    }
    this.dirty = true;
  }

  handle(player, msg) {
    switch (msg.t) {
      case 'i':
        if (this.race) this.race.setInput(player.id, { s: msg.s, a: msg.a, i: msg.it });
        break;
      case 'name':
        player.name = sanitizeName(msg.name);
        player.profile = this.store.get(player.name, player.profile.color);
        this.sendProfile(player);
        this.dirty = true;
        break;
      case 'settings':
        // グランプリが はじまったら 人数・つよさ・コースは かえられない
        if (!player.host || this.phase !== 'lobby') break;
        if (msg.mode === 'gp' || msg.mode === 'single') this.settings.mode = msg.mode;
        if (msg.laps) this.settings.laps = clamp(msg.laps | 0, 1, 5);
        if (msg.track) this.settings.track = msg.track;
        if (msg.gp && GRAND_PRIX.some((g) => g.id === msg.gp)) this.settings.gp = msg.gp;
        if (NPC_DIFFICULTY[msg.difficulty]) this.settings.difficulty = msg.difficulty;
        if (RACER_CHOICES.includes(msg.racers | 0)) this.settings.racers = msg.racers | 0;
        this.dirty = true;
        break;
      case 'start':
        if (!player.host) break;
        if (this.phase === 'lobby') this.startGrandPrix();
        break;
      case 'next':
        if (!player.host) break;
        if (this.phase === 'result') this.gotoShop();
        else if (this.phase === 'shop') this.nextRace();
        else if (this.phase === 'gpresult') this.backToLobby();
        break;
      case 'ready':
        player.ready = !!msg.v;
        this.dirty = true;
        break;
      case 'buy': {
        const r = buy(player.profile, msg.kind, msg.key);
        if (!r.ok) player.conn.sendJson({ t: 'toast', text: r.reason });
        else {
          this.store.save();
          player.conn.sendJson({ t: 'bought', kind: msg.kind, key: msg.key });
        }
        this.sendProfile(player);
        this.dirty = true;
        break;
      }
      case 'equip': {
        const kind = msg.kind;
        if ((COSMETICS[kind] || kind === 'car') && (player.profile.owned[kind] || []).includes(msg.key)) {
          player.profile[kind] = msg.key;
          this.store.save();
          this.sendProfile(player);
          this.dirty = true;
        }
        break;
      }
      case 'emote':
        this.broadcast({ t: 'emote', id: player.id, e: String(msg.e || '').slice(0, 4) });
        break;
      case 'pong':
        if (player.pingSent) player.ping = Math.round(Date.now() - player.pingSent);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ 進行

  startGrandPrix() {
    const cup = grandPrixById(this.settings.gp);
    const tracks = this.settings.mode === 'single' ? [this.settings.track] : cup.tracks.slice();
    // 人数・NPCのつよさは グランプリの あいだ ずっと 同じ（とちゅうで かえられない）
    this.gp = {
      cupId: cup.id,
      cupName: this.settings.mode === 'single' ? '1レースだけ' : cup.name,
      tracks,
      index: 0,
      racers: this.settings.racers,
      difficulty: this.settings.difficulty,
      standings: new Map(), // id -> {id,name,color,kind,points,money}
    };
    // NPC の顔ぶれは グランプリ中ずっと同じにする。
    // うでまえは NPC_MIXES の じゅんばん（へたが おおめ）で わりあてる。
    const names = NPC_NAMES.slice().sort(() => 0.5 - Math.random());
    const mix = NPC_MIXES[this.gp.difficulty] || NPC_MIXES.normal;
    this.npcPool = Array.from({ length: MAX_RACERS }, (_, i) => {
      const tier = NPC_TIERS[mix[i] || 'normal'];
      const pool = tier.carPool.filter((id) => CARS.some((c) => c.id === id));
      return {
        id: 'npc' + i,
        name: `${tier.badge}${names[i % names.length]}`,
        tier: tier.key,
        color: CAR_COLORS[(i * 3 + 2) % CAR_COLORS.length].key,
        car: pool[i % pool.length] || CARS[0].id,
      };
    });
    for (const p of this.players.values()) p.points = 0;
    this.startRace();
  }

  /** 人が足りない分を NPC でうめて、レースをはじめる */
  startRace() {
    const total = (this.gp && this.gp.racers) || this.settings.racers;
    const humans = [...this.players.values()].slice(0, total);

    // NPC の性能は 人の平均くらいにして、ずっと勝てない／勝ちすぎを防ぐ
    const levels = {};
    for (const key of Object.keys(UPGRADES)) {
      const vals = humans.map((p) => p.profile.upgrades[key] || 0);
      levels[key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    }

    const racers = humans.map((p) => {
      p.inRace = true;
      p.ready = false;
      p.lastMoney = p.profile.money;
      return {
        id: p.id,
        name: p.name,
        color: p.profile.color,
        car: p.profile.car,
        hat: p.profile.hat,
        trail: p.profile.trail,
        kind: 'human',
        profile: p.profile,
        consumables: consumeForRace(p.profile),
      };
    });
    const humanCount = racers.length;
    for (let i = humanCount; i < total; i++) {
      const npc = this.npcPool[i - humanCount];
      const tier = NPC_TIERS[npc.tier];
      const prof = newProfile(npc.name, npc.color);
      // へたな子は パーツも 1つ ひくい（つよくなりすぎない）
      prof.upgrades = {};
      for (const [k, v] of Object.entries(levels)) {
        prof.upgrades[k] = clamp(v + tier.levelBonus, 0, 3);
      }
      prof.car = npc.car; // へたな子は おそい クルマに のる
      racers.push({
        id: npc.id,
        name: npc.name,
        color: npc.color,
        hat: 'none',
        trail: 'none',
        kind: 'npc',
        tier: npc.tier,
        profile: prof,
        aiSkill: tier.skill,
      });
    }

    const trackId = this.gp.tracks[this.gp.index];
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    this.race = new Race({ trackId, laps: this.settings.laps, seed: this.seed, racers });
    this.phase = 'race';
    this.store.save();
    this.broadcast(this.raceStartMessage());
    this.dirty = true;
    console.log(
      `[room] レース${this.gp.index + 1} スタート: ${trackId} / ${total}台中 ${humans.length}人 + NPC${total - humans.length}台`,
    );
  }

  raceStartMessage() {
    return {
      t: 'racestart',
      trackId: this.race.trackId,
      laps: this.race.laps,
      race: this.gp.index + 1,
      total: this.gp.tracks.length,
      cup: this.gp.cupName,
      cars: this.race.cars.map((c) => ({
        id: c.id, name: c.name, color: c.color, model: c.model,
        hat: c.hat, trail: c.trail, kind: c.kind,
      })),
    };
  }

  endRace() {
    const results = this.race.results();
    // ポイントと おかねを 反映
    const points = pointsFor(this.gp.racers);
    for (const r of results) {
      const pts = points[Math.min(r.rank - 1, points.length - 1)] || 1;
      const cur = this.gp.standings.get(r.id) || {
        id: r.id, name: r.name, color: r.color, kind: r.kind, points: 0, money: 0,
      };
      cur.points += pts;
      cur.money += r.money;
      cur.name = r.name;
      this.gp.standings.set(r.id, cur);
      r.points = pts;

      const player = this.players.get(r.id);
      if (player) {
        player.profile.money += r.money;
        player.profile.totalEarned = (player.profile.totalEarned || 0) + r.money;
        player.points = cur.points;
        this.sendProfile(player);
      }
    }
    this.store.save();
    this.phase = 'result';
    this.timer = RESULT_SEC;
    for (const p of this.players.values()) p.ready = false;
    this.broadcast({
      t: 'raceresult',
      results,
      race: this.gp.index + 1,
      total: this.gp.tracks.length,
      standings: this.standings(),
    });
    this.dirty = true;
  }

  gotoShop() {
    const last = this.gp.index >= this.gp.tracks.length - 1;
    if (last) {
      this.phase = 'gpresult';
      this.broadcast({ t: 'gpresult', standings: this.standings() });
    } else {
      this.phase = 'shop';
      this.timer = 0;
      for (const p of this.players.values()) p.ready = false;
    }
    this.race = null;
    this.dirty = true;
  }

  nextRace() {
    this.gp.index++;
    if (this.gp.index >= this.gp.tracks.length) {
      this.phase = 'gpresult';
      this.broadcast({ t: 'gpresult', standings: this.standings() });
      this.dirty = true;
      return;
    }
    this.startRace();
  }

  backToLobby() {
    this.phase = 'lobby';
    this.race = null;
    this.gp = null;
    for (const p of this.players.values()) {
      p.ready = false;
      p.points = 0;
    }
    this.dirty = true;
  }

  standings() {
    return [...this.gp.standings.values()].sort((a, b) => b.points - a.points || b.money - a.money);
  }

  // ------------------------------------------------------------------ tick

  tick() {
    if (this.phase === 'race' && this.race) {
      this.race.step(DT);
      this.broadcast(Object.assign({ t: 'snap' }, this.race.snapshot()));
      if (this.race.phase === 'done') this.endRace();
      return;
    }
    if (this.phase === 'result') {
      this.timer -= DT;
      if (this.timer <= 0) this.gotoShop();
      return;
    }
    if (this.phase === 'shop') {
      // ぜんいん じゅんびOK なら つぎのレースへ
      const players = [...this.players.values()];
      if (players.length > 0 && players.every((p) => p.ready)) {
        this.timer += DT;
        if (this.timer > 1) this.nextRace();
      } else {
        this.timer = 0;
      }
    }
  }

  /** 1秒に数回、ロビー情報などを送る */
  sync() {
    if (!this.dirty) return;
    this.dirty = false;
    this.broadcast({ t: 'room', room: this.roomState() });
  }

  roomState() {
    return {
      phase: this.phase,
      settings: this.settings,
      racers: this.settings.racers,
      locked: this.phase !== 'lobby', // グランプリ中は ルールを かえられない
      players: [...this.players.values()].map((p, i) => ({
        id: p.id,
        name: p.name,
        color: p.profile.color,
        car: p.profile.car,
        hat: p.profile.hat,
        trail: p.profile.trail,
        host: p.host,
        ready: p.ready,
        ping: p.ping,
        money: Math.round(p.profile.money),
        points: p.points,
        spectator: i >= ((this.gp && this.gp.racers) || this.settings.racers),
        touch: p.touch,
      })),
      npcCount: this.npcCount(),
      npcTiers: Array.from({ length: this.npcCount() }, (_, i) => {
        const mix = NPC_MIXES[(this.gp && this.gp.difficulty) || this.settings.difficulty] || NPC_MIXES.normal;
        const key = (this.npcPool && this.npcPool[i] ? this.npcPool[i].tier : mix[i]) || 'normal';
        const t = NPC_TIERS[key];
        return { key: t.key, name: t.name, badge: t.badge };
      }),
      gp: this.gp
        ? {
          index: this.gp.index,
          total: this.gp.tracks.length,
          tracks: this.gp.tracks,
          cup: this.gp.cupName,
          racers: this.gp.racers,
          difficulty: this.gp.difficulty,
          standings: this.standings(),
        }
        : null,
    };
  }

  /** いま 何台の NPC が 入るか */
  npcCount() {
    const total = (this.gp && this.gp.racers) || this.settings.racers;
    return Math.max(0, total - this.players.size);
  }

  sendProfile(player) {
    player.conn.sendJson({ t: 'you', profile: player.profile, id: player.id });
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) p.conn.send(s);
  }

  pingAll() {
    for (const p of this.players.values()) {
      p.pingSent = Date.now();
      p.conn.sendJson({ t: 'ping' });
    }
  }
}

function sanitizeName(name) {
  const s = String(name == null ? '' : name).replace(/[ -<>]/g, '').trim();
  return (s || 'プレイヤー').slice(0, 10);
}

function pickFreeColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.profile.color));
  const free = CAR_COLORS.find((c) => !used.has(c.key));
  return (free || CAR_COLORS[0]).key;
}
