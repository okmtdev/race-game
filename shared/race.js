// レースのシミュレーション本体。
// サーバ（みんなでプレイ）でも、ブラウザ（ひとりでプレイ）でも同じコードが動く。
// 固定ステップ（1/30秒）で step() を呼ぶだけ。
import {
  CAR_R, COUNTDOWN_SEC, DEFAULT_LAPS, FINISH_GRACE_SEC, ITEM_TABLE,
  MONEY, NPC_TIERS, PHYS, RACE_TIMEOUT_SEC, RESPAWN, SPECIAL_WEIGHT, SURFACES,
} from './constants.js';
import { statsFor } from './catalog.js';
import { getTrack, isOffroad, posAt, project } from './tracks.js';
import { clamp, makeRng, wrapAngle } from './util.js';

const OIL_TTL = 22;
const FIRE_TTL = 14;
const SHOT_SPEED = { shot: 640, snowball: 470 };
const SHOT_TTL = 8;
const BOX_R = 36;
const COIN_R = 28;
const PAD_R = 46;
const MAGNET_R = 190;

export class Race {
  /**
   * @param {object} opts
   *  trackId: コースID / laps: 周回数 / seed: 乱数の種
   *  racers: [{id,name,color,hat,trail,kind:'human'|'npc',profile,consumables,aiSkill}]
   */
  constructor(opts) {
    this.track = getTrack(opts.trackId);
    this.trackId = this.track.id;
    this.laps = opts.laps || DEFAULT_LAPS;
    this.rng = makeRng(opts.seed || 1);
    this.time = 0;
    this.phase = 'countdown'; // countdown -> racing -> done
    this.startedAt = null;
    this.firstFinishTime = null;
    this.events = [];
    this.oils = [];
    this.shots = []; // とんでいく アイテム（ミサイル・ゆきだま）
    this.finishOrder = [];
    this.lastCountdownStep = -1;

    const grid = this.track.startGrid;
    this.cars = opts.racers.slice(0, grid.length).map((r, i) => {
      const g = grid[i];
      const stats = statsFor(r.profile, { consumables: r.consumables || {} });
      // NPC の うでまえ（じょうず／ふつう／へた）。人のクルマには つかわない。
      const tier = NPC_TIERS[r.tier] || NPC_TIERS.pro;
      if (r.kind === 'npc') {
        const mul = tier.speedMul * (r.speedAdjust || 1);
        stats.maxSpeed *= mul;
        stats.accel *= Math.sqrt(mul);
      }
      const pr = project(this.track, g.x, g.y);
      return {
        id: r.id,
        idx: i,
        name: r.name,
        color: r.color || 'red',
        model: (r.profile && r.profile.car) || 'gt',
        hat: r.hat || 'none',
        trail: r.trail || 'none',
        kind: r.kind,
        stats,
        aiTier: tier,
        aiSkill: r.aiSkill != null ? r.aiSkill : tier.skill,
        x: g.x,
        y: g.y,
        angle: g.angle,
        vx: 0,
        vy: 0,
        hint: pr.i,
        arc: pr.arc,
        lateral: pr.lateral,
        lap: -1,
        progress: pr.arc - this.track.length,
        item: stats.spareItem ? this.rollItem(3) : null,
        shield: 0,
        boost: 0,
        spin: 0,
        spinDir: 1,
        slow: 0,
        magnet: 0,
        invuln: 0,
        ghost: 0,
        star: 0,
        bubble: 0,
        tripleLeft: 0,
        money: 0,
        coins: 0,
        driftTime: 0,
        drifting: false,
        offroad: false,
        wrongWay: false,
        lapTimes: [],
        lastLapAt: 0,
        finished: false,
        finishTime: null,
        rank: i + 1,
        prevRank: i + 1,
        input: { steer: 0, throttle: 0, item: false },
        itemHeld: false,
        holdStart: 0, // ロケットスタート用
        lastInputTime: -99, // そうさが とどいた 時間（とどかなくなったら AI が代走）
        autoDriven: false,
        ai: {
          line: g.lateral / this.track.halfWidth,
          timer: 0,
          jitter: this.rng.range(-0.2, 0.2),
          blunder: 0, // >0 のあいだ しっぱい中（ブレーキを ふまない・ふくらむ）
          blunderSide: 1,
        },
      };
    });

    this.byId = new Map(this.cars.map((c) => [c.id, c]));

    // コース上のアイテム類の状態（0 なら出ている、>0 なら復活待ちの秒数）
    this.coinTimer = new Float32Array(this.track.pickups.coins.length);
    this.boxTimer = new Float32Array(this.track.pickups.boxes.length);
    this.updateRanks();
  }

  setInput(id, input) {
    const car = this.byId.get(id);
    if (!car || car.kind !== 'human') return;
    car.lastInputTime = this.time;
    car.input.steer = clamp(input.s || 0, -1, 1);
    car.input.throttle = clamp(input.a || 0, -1, 1);
    car.input.item = !!input.i;
  }

  emit(type, extra) {
    this.events.push(Object.assign({ type }, extra));
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------------ 更新

  step(dt) {
    this.time += dt;

    if (this.phase === 'countdown') {
      const remain = COUNTDOWN_SEC - this.time;
      const stepNo = Math.ceil(remain);
      if (stepNo !== this.lastCountdownStep && stepNo >= 0) {
        this.lastCountdownStep = stepNo;
        this.emit('count', { n: stepNo });
      }
      // スタート直前にアクセルを押しっぱなしにしていたら「ロケットスタート」
      for (const c of this.cars) {
        const throttle = c.kind === 'human' ? c.input.throttle : (remain < 0.7 ? 1 : 0);
        if (throttle > 0.5) c.holdStart += dt;
        else c.holdStart = 0;
      }
      if (this.time >= COUNTDOWN_SEC) {
        this.phase = 'racing';
        this.startedAt = this.time;
        this.emit('go', {});
        for (const c of this.cars) {
          let boost = c.stats.startBoost;
          if (c.holdStart > 0.35) boost += 0.6; // ロケットスタート成功
          if (boost > 0) this.giveBoost(c, boost, 'start');
        }
      }
      return;
    }

    if (this.phase === 'done') return;

    const raceTime = this.time - this.startedAt;

    this.leaderProgress = Math.max(...this.cars.map((c) => c.progress));
    for (const c of this.cars) this.updateCar(c, dt);
    this.resolveCarCollisions();
    this.updatePickups(dt);
    this.updateOils(dt);
    this.updateShots(dt);
    this.updateRanks();

    // 終了判定
    const allDone = this.cars.every((c) => c.finished);
    const graceOver = this.firstFinishTime != null && raceTime - this.firstFinishTime > FINISH_GRACE_SEC;
    if (allDone || graceOver || raceTime > RACE_TIMEOUT_SEC) {
      // まだゴールしていないクルマも順位を確定させる
      for (const c of this.sortedCars()) {
        if (!c.finished) this.finishCar(c, raceTime, true);
      }
      this.phase = 'done';
      this.emit('raceover', {});
    }
  }

  updateCar(car, dt) {
    const track = this.track;
    const surface = SURFACES[track.surface] || SURFACES.grass;

    // タイマー類
    car.boost = Math.max(0, car.boost - dt);
    car.shield = Math.max(0, car.shield - dt);
    car.slow = Math.max(0, car.slow - dt);
    car.magnet = Math.max(0, car.magnet - dt);
    car.invuln = Math.max(0, car.invuln - dt);
    car.spin = Math.max(0, car.spin - dt);
    car.ghost = Math.max(0, car.ghost - dt);
    car.star = Math.max(0, car.star - dt);
    car.bubble = Math.max(0, car.bubble - dt);

    // 入力（NPC・ゴール後のクルマは AI が運転する）
    // スマホで ほかのアプリに いった／画面を 消した ときは そうさが とどかなくなるので、
    // 2秒 とどかなかったら AI が かわりに 運転して レースを 止めない。
    const idle = car.kind === 'human' && this.time - car.lastInputTime > 2;
    car.autoDriven = idle && !car.finished;
    let input = car.input;
    if (car.kind === 'npc' || car.finished || idle) input = npcInput(car, this);

    const spinning = car.spin > 0;
    const steer = spinning ? 0 : clamp(input.steer, -1, 1);
    let throttle = spinning ? 0 : clamp(input.throttle, -1, 1);

    // アイテム使用（押した瞬間だけ）
    if (!spinning && input.item && !car.itemHeld) this.useItem(car);
    car.itemHeld = !!input.item;

    const s = car.stats;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const nx = -fy;
    const ny = fx;
    let vLong = car.vx * fx + car.vy * fy;
    let vLat = car.vx * nx + car.vy * ny;

    // 速度の上限
    let cap = s.maxSpeed;
    if (car.offroad) cap *= s.offroadSpeedMul;
    if (car.slow > 0) cap *= 0.7;
    if (car.boost > 0) cap *= s.boostMul;
    if (car.star > 0) cap *= 1.18;
    // 1いが ゴールしたら、のこりの みんなは「ラストスパート」で はやくなる
    // （まちじかんを みじかくして、おそい子でも ちゃんと ゴールできるように）
    if (this.firstFinishTime != null && !car.finished) cap *= 1.3;

    // 前後の加速
    if (spinning) {
      vLong *= Math.exp(-2.2 * dt);
    } else if (throttle > 0) {
      vLong += s.accel * throttle * dt;
    } else if (throttle < 0) {
      if (vLong > 5) vLong -= PHYS.brake * dt;
      else vLong -= s.accel * 0.55 * dt;
    }
    const drag = car.offroad ? s.offroadDrag : PHYS.drag;
    vLong -= vLong * drag * dt;
    vLong = clamp(vLong, -PHYS.reverseSpeed, cap);

    // ハンドル
    if (!spinning) {
      const speedFactor = clamp(Math.abs(vLong) / 80, 0, 1) * (1 - 0.3 * clamp(Math.abs(vLong) / s.maxSpeed, 0, 1));
      const dir = vLong < -1 ? -1 : 1;
      const bubbleMul = car.bubble > 0 ? 0.45 : 1;
      car.angle += steer * s.turnRate * speedFactor * dir * bubbleMul * dt;
    } else {
      car.angle += car.spinDir * 9 * dt;
    }

    // 横滑り（グリップ）
    let gripK = s.grip * surface.gripMul;
    if (car.offroad) gripK *= 0.55;
    if (spinning) gripK *= 0.3;
    if (car.bubble > 0) gripK *= 0.35; // ふわふわして ハンドルが きかない
    vLat *= Math.exp(-gripK * dt);

    // ドリフト判定（おかねボーナス＆エフェクト用）
    car.drifting = !spinning && Math.abs(vLat) > 40 && Math.abs(vLong) > 120;
    if (car.drifting) {
      car.driftTime += dt;
      this.addMoney(car, MONEY.drift * dt, false);
    }

    const cfx = Math.cos(car.angle);
    const cfy = Math.sin(car.angle);
    car.vx = cfx * vLong + -cfy * vLat;
    car.vy = cfy * vLong + cfx * vLat;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // コース上の位置を更新
    const pr = project(track, car.x, car.y, car.hint);
    car.hint = pr.i;
    car.offroad = isOffroad(track, pr.lateral);

    // 壁（道の外側 60 ユニットでストップ）
    const wall = track.halfWidth + 60;
    if (Math.abs(pr.lateral) > wall) {
      const sign = Math.sign(pr.lateral);
      const p = posAt(track, pr.arc, sign * wall);
      car.x = p.x;
      car.y = p.y;
      // 壁に沿って滑らせる
      const seg = track.seg[pr.i];
      const along = car.vx * seg.dx + car.vy * seg.dy;
      car.vx = seg.dx * along * 0.85;
      car.vy = seg.dy * along * 0.85;
      if (Math.abs(along) > 200) this.emit('wall', { id: car.id, x: car.x, y: car.y });
      pr.lateral = sign * wall;
    }
    car.lateral = pr.lateral;

    // 周回のカウント
    const L = track.length;
    let d = pr.arc - car.arc;
    if (d < -L / 2) {
      d += L;
      car.lap += 1;
      this.onLap(car);
    } else if (d > L / 2) {
      d -= L;
      car.lap -= 1;
    }
    car.arc = pr.arc;
    car.progress = car.lap * L + pr.arc;

    // 逆走チェック
    const seg = track.seg[pr.i];
    const dot = cfx * seg.dx + cfy * seg.dy;
    car.wrongWay = !car.finished && dot < -0.35 && Math.abs(vLong) > 40;

    this.collectPickups(car);
    car.speed = Math.hypot(car.vx, car.vy);
  }

  onLap(car) {
    if (car.lap <= 0) return; // スタートラインを最初に通ったところ
    const raceTime = this.time - (this.startedAt || 0);
    car.lapTimes.push(raceTime - car.lastLapAt);
    car.lastLapAt = raceTime;
    if (car.lap >= this.laps) {
      this.finishCar(car, raceTime, false);
    } else {
      this.addMoney(car, MONEY.lap);
      this.emit('lap', { id: car.id, lap: car.lap + 1 });
    }
  }

  finishCar(car, raceTime, timedOut) {
    if (car.finished) return;
    car.finished = true;
    car.finishTime = timedOut ? null : raceTime;
    this.finishOrder.push(car.id);
    car.finishRank = this.finishOrder.length;
    if (this.firstFinishTime == null) this.firstFinishTime = raceTime;
    this.addMoney(car, MONEY.finish[Math.min(car.finishRank - 1, MONEY.finish.length - 1)]);
    this.emit('finish', { id: car.id, rank: car.finishRank, time: car.finishTime });
  }

  addMoney(car, amount, announce = true) {
    const mul = car.stats.moneyMul || 1;
    car.money += amount * mul;
    if (announce && amount >= 50) {
      this.emit('money', { id: car.id, amount: Math.round(amount * mul), x: car.x, y: car.y });
    }
  }

  // ---------------------------------------------------- コイン・アイテムなど

  collectPickups(car) {
    if (car.finished) return;
    const pk = this.track.pickups;
    const grab = car.magnet > 0 ? MAGNET_R : COIN_R;
    for (let i = 0; i < pk.coins.length; i++) {
      if (this.coinTimer[i] > 0) continue;
      const c = pk.coins[i];
      const dx = c.x - car.x;
      const dy = c.y - car.y;
      if (dx * dx + dy * dy < grab * grab) {
        this.coinTimer[i] = RESPAWN.coin;
        car.coins += 1;
        this.addMoney(car, MONEY.coin, false);
        this.emit('coin', { id: car.id, x: c.x, y: c.y });
      }
    }
    for (let i = 0; i < pk.boxes.length; i++) {
      if (this.boxTimer[i] > 0) continue;
      const b = pk.boxes[i];
      const dx = b.x - car.x;
      const dy = b.y - car.y;
      if (dx * dx + dy * dy < BOX_R * BOX_R) {
        this.boxTimer[i] = RESPAWN.box;
        this.addMoney(car, MONEY.itemBox, false);
        if (!car.item) {
          car.item = this.rollItem(car.rank);
          this.emit('getitem', { id: car.id, item: car.item });
        } else {
          this.emit('box', { id: car.id });
        }
      }
    }
    for (const p of this.track.pickups.pads) {
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      if (dx * dx + dy * dy < PAD_R * PAD_R) {
        // 進行方向がだいたい合っているときだけ効く
        if (Math.cos(car.angle - p.angle) > 0.3 && car.boost < 0.4) {
          this.giveBoost(car, 0.9, 'pad');
        }
      }
    }
  }

  /**
   * アイテム抽選。4人でも8人でも おなじ感じに なるように
   * 「前から何割の いち か」で 4つの バケツに わけている。
   */
  rollItem(rank) {
    const n = this.cars.length || 4;
    const bucket = clamp(Math.floor(((rank | 0) - 1) * 4 / n), 0, ITEM_TABLE.length - 1);
    const table = ITEM_TABLE[bucket].slice();
    // そのステージだけの とくべつアイテム
    if (this.track.special) table.push([this.track.special, SPECIAL_WEIGHT[bucket]]);
    let total = 0;
    for (const [, w] of table) total += w;
    let r = this.rng() * total;
    let picked = table[0][0];
    for (const [key, w] of table) {
      r -= w;
      if (r <= 0) {
        picked = key;
        break;
      }
    }
    // 1いは「いれかわり」を つかえないので べつの ものに する
    if (picked === 'swap' && rank <= 1) picked = 'rocket';
    return picked;
  }

  giveBoost(car, seconds, why) {
    const t = seconds * (car.stats.boostTime / PHYS.boostTime);
    car.boost = Math.max(car.boost, t);
    // 前向きにひと押し
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    car.vx += fx * car.stats.boostKick * 0.5;
    car.vy += fy * car.stats.boostKick * 0.5;
    car.slow = 0;
    this.emit('boost', { id: car.id, why: why || 'item' });
  }

  useItem(car) {
    const item = car.item;
    if (!item || car.finished) return;
    car.item = null;
    this.emit('useitem', { id: car.id, item });

    switch (item) {
      case 'rocket':
        this.giveBoost(car, car.stats.boostTime, 'item');
        break;
      case 'shield':
        car.shield = 10;
        break;
      case 'magnet':
        car.magnet = 6;
        break;
      case 'ghost':
        car.ghost = 5;
        break;
      case 'star':
        car.star = 8;
        car.shield = 0;
        break;
      case 'oil':
        this.dropHazard(car, 'oil', 60);
        break;
      case 'fireball':
        // うしろに ほのおを 3つ ならべて おく
        for (let i = 0; i < 3; i++) this.dropHazard(car, 'fire', 55 + i * 46);
        break;
      case 'shot':
      case 'snowball':
        this.spawnShot(car, item);
        break;
      case 'triple': {
        // 3かい ダッシュできる（つかいきるまで アイテムわくに のこる）
        if (car.tripleLeft <= 0) car.tripleLeft = 3;
        this.giveBoost(car, car.stats.boostTime * 0.8, 'item');
        car.tripleLeft -= 1;
        if (car.tripleLeft > 0) car.item = 'triple';
        break;
      }
      case 'thunder':
      case 'candy': {
        const strong = item === 'candy';
        let hits = 0;
        for (const other of this.cars) {
          if (other === car || other.finished) continue;
          if (other.progress > car.progress) {
            if (!this.tryHit(other, strong ? 'candy' : 'thunder')) continue;
            hits++;
          }
        }
        this.emit('thunder', { id: car.id, hits, item });
        break;
      }
      case 'bubble': {
        const target = this.carAhead(car);
        if (target && this.tryHit(target, 'bubble')) {
          this.emit('bubbled', { id: target.id, from: car.id });
        }
        break;
      }
      case 'vine': {
        // 1いを つかまえて とめる（じぶんが 1いなら 2いを ねらう）
        const leader = this.sortedCars().find((c) => !c.finished && c !== car);
        if (leader) this.tryHit(leader, 'vine');
        break;
      }
      case 'swap': {
        const target = this.carAhead(car);
        if (target) {
          this.swapCars(car, target);
          this.emit('swap', { id: car.id, other: target.id });
        } else {
          this.giveBoost(car, car.stats.boostTime, 'item');
        }
        break;
      }
      default:
        break;
    }
  }

  /** じぶんの すぐ前を 走っている クルマ */
  carAhead(car) {
    let best = null;
    for (const other of this.cars) {
      if (other === car || other.finished) continue;
      if (other.progress <= car.progress) continue;
      if (!best || other.progress < best.progress) best = other;
    }
    return best;
  }

  /** 位置を そっくり いれかえる */
  swapCars(a, b) {
    for (const k of ['x', 'y', 'angle', 'vx', 'vy', 'arc', 'lateral', 'lap', 'progress', 'hint']) {
      const tmp = a[k];
      a[k] = b[k];
      b[k] = tmp;
    }
    a.invuln = Math.max(a.invuln, 0.6);
    b.invuln = Math.max(b.invuln, 0.6);
  }

  /** うしろに オイル／ほのおを おく */
  dropHazard(car, kind, back) {
    this.oils.push({
      x: car.x - Math.cos(car.angle) * back,
      y: car.y - Math.sin(car.angle) * back,
      ttl: kind === 'fire' ? FIRE_TTL : OIL_TTL,
      owner: car.id,
      safe: 1.0,
      kind,
    });
  }

  /** とんでいく アイテムを 出す */
  spawnShot(car, kind) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const pr = project(this.track, car.x + fx * 50, car.y + fy * 50, car.hint);
    this.shots.push({
      x: car.x + fx * 50,
      y: car.y + fy * 50,
      angle: car.angle,
      kind,
      owner: car.id,
      ttl: SHOT_TTL,
      hint: pr.i,
      lateral: pr.lateral,
      size: kind === 'snowball' ? 16 : 13,
      safe: 0.25,
    });
  }

  /** とんでいく アイテムを うごかす（コースに そって 進む） */
  updateShots(dt) {
    const track = this.track;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.ttl -= dt;
      sh.safe = Math.max(0, sh.safe - dt);
      if (sh.ttl <= 0) {
        this.shots.splice(i, 1);
        continue;
      }
      // ゆきだまは ころがるほど 大きくなる
      if (sh.kind === 'snowball') sh.size = Math.min(34, sh.size + 2.4 * dt);

      const pr = project(track, sh.x, sh.y, sh.hint);
      sh.hint = pr.i;
      // 道の まんなか寄りを 走らせる
      const target = posAt(track, pr.arc + 90, clamp(sh.lateral, -track.halfWidth * 0.8, track.halfWidth * 0.8));
      const want = Math.atan2(target.y - sh.y, target.x - sh.x);
      sh.angle += wrapAngle(want - sh.angle) * Math.min(1, 7 * dt);
      const speed = SHOT_SPEED[sh.kind] || 600;
      sh.x += Math.cos(sh.angle) * speed * dt;
      sh.y += Math.sin(sh.angle) * speed * dt;

      let hit = false;
      for (const car of this.cars) {
        if (car.finished) continue;
        if (sh.safe > 0 && car.id === sh.owner) continue;
        const d = Math.hypot(car.x - sh.x, car.y - sh.y);
        if (d < sh.size + CAR_R) {
          this.tryHit(car, sh.kind);
          hit = true;
          break;
        }
      }
      if (hit) {
        this.emit('shothit', { x: sh.x, y: sh.y, kind: sh.kind });
        this.shots.splice(i, 1);
      }
    }
  }

  /** 攻撃が当たったときの処理。バリア・おばけ・スターで ふせがれたら false */
  tryHit(car, kind) {
    if (car.ghost > 0 || car.star > 0) return false;
    if (car.shield > 0) {
      car.shield = 0;
      this.emit('shieldbreak', { id: car.id });
      return false;
    }
    if (car.invuln > 0) return false;
    if (kind === 'thunder' || kind === 'candy') {
      car.slow = kind === 'candy' ? 3.5 : 2.4;
      car.invuln = 0.4;
      this.emit('slow', { id: car.id, kind });
    } else if (kind === 'bubble') {
      car.bubble = 4.5;
      car.invuln = 0.4;
      this.emit('bubble', { id: car.id });
    } else if (kind === 'vine') {
      car.spin = Math.max(car.spin, 1.6);
      car.spinDir = this.rng() < 0.5 ? -1 : 1;
      car.invuln = car.spin + 0.5;
      this.emit('spin', { id: car.id, kind });
    } else {
      car.spin = car.stats.spinTime;
      car.spinDir = this.rng() < 0.5 ? -1 : 1;
      car.invuln = car.spin + 0.5;
      // アイテムは落とさない（こどもにやさしく）
      this.emit('spin', { id: car.id, kind });
    }
    return true;
  }

  updatePickups(dt) {
    for (let i = 0; i < this.coinTimer.length; i++) {
      if (this.coinTimer[i] > 0) this.coinTimer[i] = Math.max(0, this.coinTimer[i] - dt);
    }
    for (let i = 0; i < this.boxTimer.length; i++) {
      if (this.boxTimer[i] > 0) this.boxTimer[i] = Math.max(0, this.boxTimer[i] - dt);
    }
  }

  updateOils(dt) {
    for (let i = this.oils.length - 1; i >= 0; i--) {
      const o = this.oils[i];
      o.ttl -= dt;
      o.safe = Math.max(0, o.safe - dt);
      if (o.ttl <= 0) {
        this.oils.splice(i, 1);
        continue;
      }
      for (const car of this.cars) {
        if (car.finished || car.spin > 0) continue;
        if (o.safe > 0 && car.id === o.owner) continue;
        const dx = car.x - o.x;
        const dy = car.y - o.y;
        const r = o.kind === 'fire' ? 28 : 30;
        if (dx * dx + dy * dy < r * r) {
          if (this.tryHit(car, o.kind === 'fire' ? 'fire' : 'oil')) {
            // ほのおは のこりつづける（オイルは 1回で 消える）
            if (o.kind !== 'fire') this.oils.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  resolveCarCollisions() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR_R * 2;
        if (d >= min || d < 1e-4) continue;
        // おばけは すりぬける
        if (a.ghost > 0 || b.ghost > 0) {
          if (a.star > 0) this.tryHit(b, 'star');
          else if (b.star > 0) this.tryHit(a, 'star');
          continue;
        }
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2 + 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        // すこし速度を交換して、ぶつかった感じを出す
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = rel * 0.6;
          a.vx += nx * imp;
          a.vy += ny * imp;
          b.vx -= nx * imp;
          b.vy -= ny * imp;
          this.emit('bump', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
        // スター中や ダッシュ中に 体当たりすると 相手を スピンさせられる
        const aFast = a.star > 0 || (a.boost > 0 && b.boost <= 0);
        const bFast = b.star > 0 || (b.boost > 0 && a.boost <= 0);
        if (aFast && !bFast) this.tryHit(b, 'bump');
        else if (bFast && !aFast) this.tryHit(a, 'bump');
      }
    }
  }

  sortedCars() {
    return this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishRank - b.finishRank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  updateRanks() {
    const sorted = this.sortedCars();
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      c.prevRank = c.rank;
      c.rank = i + 1;
      if (this.phase === 'racing' && c.rank < c.prevRank && !c.finished) {
        this.addMoney(c, MONEY.overtake, false);
        this.emit('overtake', { id: c.id, rank: c.rank });
      }
    }
  }

  // -------------------------------------------------------------- 送信データ

  /** ネットワークで送るための小さめのスナップショット */
  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      // tm は「レース開始からの 通しの 時間」。t は メッセージの しゅるいで
      // つかっているので、ここでは つかわない。
      tm: r2(this.time),
      ph: this.phase,
      sp: this.firstFinishTime != null ? 1 : 0, // ラストスパート中
      rt: r2(this.startedAt == null ? -(COUNTDOWN_SEC - this.time) : this.time - this.startedAt),
      cars: this.cars.map((c) => ({
        i: c.id,
        x: r1(c.x),
        y: r1(c.y),
        a: r2(c.angle),
        v: Math.round(c.speed || 0),
        lp: c.lap,
        rk: c.rank,
        it: c.item,
        sh: r1(c.shield),
        bo: r1(c.boost),
        sp: r1(c.spin),
        mg: r1(c.magnet),
        sl: r1(c.slow),
        gh: r1(c.ghost),
        st: r1(c.star),
        bu: r1(c.bubble),
        mn: Math.round(c.money),
        au: c.autoDriven ? 1 : 0,
        of: c.offroad ? 1 : 0,
        dr: c.drifting ? 1 : 0,
        ww: c.wrongWay ? 1 : 0,
        fin: c.finished ? 1 : 0,
      })),
      // 0/1 のならびで「出ているか」を送る
      co: Array.from(this.coinTimer, (v) => (v > 0 ? 0 : 1)).join(''),
      bx: Array.from(this.boxTimer, (v) => (v > 0 ? 0 : 1)).join(''),
      oil: this.oils.map((o) => [r1(o.x), r1(o.y), o.kind === 'fire' ? 1 : 0]),
      sht: this.shots.map((o) => [r1(o.x), r1(o.y), Math.round(o.size), o.kind === 'snowball' ? 1 : 0]),
      ev: this.drainEvents(),
    };
  }

  /** レース結果（順位・タイム・かせいだ おかね） */
  results() {
    return this.sortedCars().map((c, i) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      kind: c.kind,
      rank: i + 1,
      time: c.finishTime,
      laps: c.lapTimes.slice(),
      bestLap: c.lapTimes.length ? Math.min(...c.lapTimes) : null,
      money: Math.round(c.money),
      coins: c.coins,
      driftTime: Math.round(c.driftTime * 10) / 10,
    }));
  }
}

// --------------------------------------------------------------------- NPC

/**
 * NPC（コンピュータ）の運転。
 * コースの少し先を目標にハンドルを切り、カーブの手前ではブレーキを踏む。
 */
export function npcInput(car, race) {
  const track = race.track;
  const speed = Math.hypot(car.vx, car.vy);
  const skill = car.aiSkill;
  const tier = car.aiTier || NPC_TIERS.pro;

  car.ai.blunder = Math.max(0, car.ai.blunder - 1 / 30);
  car.ai.timer -= 1 / 30;
  if (car.ai.timer <= 0) {
    car.ai.timer = 0.35 + race.rng() * 0.4;
    // 走るラインをときどき変える（コインやアイテムをねらう）
    let target = car.ai.line * 0.5 + race.rng.range(-0.5, 0.5);
    const near = nearestGoodie(race, car);
    if (near) target = clamp(near / track.halfWidth, -0.85, 0.85);
    car.ai.line = clamp(target, -0.8, 0.8);
    // へたな子は ときどき しっぱいする（ブレーキを ふみわすれて ふくらむ）
    if (tier.mistake > 0 && race.rng() < tier.mistake) {
      car.ai.blunder = 0.7 + race.rng() * 1.0;
      car.ai.blunderSide = race.rng() < 0.5 ? -1 : 1;
    }
  }
  const blundering = car.ai.blunder > 0;

  // 目標地点（速いほど遠くを見る。へたな子は 近くしか 見ないので 曲がるのが おそい）
  const look = (110 + speed * 0.5) * tier.look;
  const aheadArc = car.arc + look;
  let lateralTarget = car.ai.line * track.halfWidth;
  if (blundering) {
    // しっぱい中は そとに ふくらむ
    lateralTarget = clamp(lateralTarget + car.ai.blunderSide * track.halfWidth * 0.9,
      -track.halfWidth * 1.1, track.halfWidth * 1.1);
  }

  // 前に詰まっていたら よこに ずらす
  for (const other of race.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > 110) continue;
    const fwd = (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / (d || 1);
    if (fwd > 0.4) {
      lateralTarget = clamp(other.lateral + (other.lateral > car.lateral ? -95 : 95), -track.halfWidth * 0.9, track.halfWidth * 0.9);
    }
  }

  const tp = posAt(track, aheadArc, lateralTarget);
  const want = Math.atan2(tp.y - car.y, tp.x - car.x);
  // steerGain が 小さいほど ハンドルが もたついて、カーブで ふくらむ
  let steer = clamp(wrapAngle(want - car.angle) * tier.steerGain, -1, 1);

  // カーブに合わせた速度
  // うしろに いるときは ちょっとだけ はやく（せっても はなれすぎないように）
  const gap = (race.leaderProgress || car.progress) - car.progress;
  const spurt = race.firstFinishTime != null && !car.finished ? 1.25 : 1;
  const catchUp = clamp(1 + gap / 12000, 0.95, tier.catchUpMax) * spurt;
  let limit =
    track.limit[(car.hint + Math.round(look / track.spacing)) % track.N] * (0.35 + skill * 0.7) * catchUp;
  if (blundering) limit *= 1.6; // ブレーキを ふみわすれる
  let throttle = 1;
  if (speed > limit * 1.06) throttle = -1;
  else if (speed > limit) throttle = 0;
  if (car.offroad) {
    // 道に戻る
    const back = posAt(track, car.arc + 90, 0);
    steer = clamp(wrapAngle(Math.atan2(back.y - car.y, back.x - car.x) - car.angle) * 2.6, -1, 1);
    throttle = 1;
  }
  if (speed < 30 && car.spin <= 0) throttle = 1;

  // アイテムを使う（へたな子は つかうのが へた）
  let useItem = false;
  if (car.item) {
    const straight = track.limit[car.hint] > 330;
    if (car.item === 'rocket') useItem = straight && !car.offroad;
    else if (car.item === 'magnet') useItem = true;
    else if (car.item === 'shield') useItem = someoneClose(race, car, 220);
    else if (car.item === 'oil') useItem = someoneBehind(race, car, 300);
    else if (car.item === 'thunder') useItem = car.rank > 1;
    if (tier.key !== 'pro' && race.rng() < 0.5) useItem = race.rng() < 0.25; // てきとうに つかう
    else if (useItem && race.rng() < 0.25) useItem = false; // ちょっと ぬける
  }

  return { steer: steer + car.ai.jitter * 0.08, throttle, item: useItem };
}

function nearestGoodie(race, car) {
  const pk = race.track.pickups;
  let best = null;
  let bestD = 340;
  for (let i = 0; i < pk.boxes.length; i++) {
    if (race.boxTimer[i] > 0 || car.item) continue;
    const b = pk.boxes[i];
    const d = Math.hypot(b.x - car.x, b.y - car.y);
    if (d < bestD && aheadOf(race, car, b)) {
      bestD = d;
      best = b;
    }
  }
  for (let i = 0; i < pk.coins.length; i++) {
    if (race.coinTimer[i] > 0) continue;
    const c = pk.coins[i];
    const d = Math.hypot(c.x - car.x, c.y - car.y);
    if (d < bestD && aheadOf(race, car, c)) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  const pr = project(race.track, best.x, best.y, car.hint);
  return pr.lateral;
}

function aheadOf(race, car, p) {
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  return dx * Math.cos(car.angle) + dy * Math.sin(car.angle) > 30;
}

function someoneClose(race, car, r) {
  return race.cars.some((o) => o !== car && Math.hypot(o.x - car.x, o.y - car.y) < r);
}

function someoneBehind(race, car, r) {
  return race.cars.some((o) => {
    if (o === car) return false;
    const d = Math.hypot(o.x - car.x, o.y - car.y);
    return d < r && o.progress < car.progress;
  });
}
