// 開発用：NPC だけでレースを回して、コースがちゃんと走れるか／
// うでまえ（じょうず・ふつう・へた）に ちゃんと 差が ついているかを 確かめる
// 使い方: npm run simtest
import { Race } from '../shared/race.js';
import { TRACK_DEFS } from '../shared/tracks.js';
import { DT, DEFAULT_LAPS, NPC_TIERS, NPC_MIXES } from '../shared/constants.js';
import { newProfile } from '../shared/catalog.js';
import { timeStr } from '../shared/util.js';

let bad = 0;
const lapsByTier = { master: [], pro: [], normal: [], rookie: [] };

function runRace(trackId, tiers, seed) {
  const racers = tiers.map((tier, i) => {
    const def = NPC_TIERS[tier];
    const profile = newProfile(def.name, 'red');
    profile.car = def.carPool[i % def.carPool.length];
    return {
      id: 'npc' + i,
      name: `${def.badge}${def.name}${i}`,
      color: 'red',
      kind: 'npc',
      tier,
      profile,
    };
  });
  const race = new Race({ trackId, laps: DEFAULT_LAPS, seed, racers });
  let ticks = 0;
  while (race.phase !== 'done' && ticks < 30 * 400) {
    race.step(DT);
    race.drainEvents();
    ticks++;
  }
  return { race, ticks, results: race.results(), tiers };
}

// 1) 3コース × 「じつせんの ならび（へたが おおめ）」で 完走できるか
console.log('■ 12コースを 完走できるか（NPC 8台・じっさいの ならび）');
for (const def of TRACK_DEFS) {
  const { race, ticks, results } = runRace(def.id, NPC_MIXES.normal.slice(0, 8), 7);
  const ok = race.phase === 'done' && results.every((r) => r.time != null);
  if (!ok) bad++;
  console.log(`\n=== ${def.name} (${def.id}) ${ok ? 'OK' : '*** NG ***'}  ${ticks} ticks`);
  for (const r of results) {
    console.log(
      `  ${r.rank}い ${r.name.padEnd(10)} time=${timeStr(r.time)} best=${timeStr(r.bestLap)}` +
      ` coins=${String(r.coins).padStart(2)} money=¥${r.money}`,
    );
  }
}

// 2) うでまえの さ（同じコース・同じマシン条件で ならべて 走らせる）
console.log('\n■ うでまえの さ（3コースの ベストラップ 平均）');
for (const def of TRACK_DEFS) {
  const { results } = runRace(def.id, ['master', 'pro', 'normal', 'rookie'], 21);
  for (const r of results) {
    const key = ['master', 'pro', 'normal', 'rookie'].find((k) => r.name.includes(NPC_TIERS[k].name));
    if (r.bestLap && key) lapsByTier[key].push(r.bestLap);
  }
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const proAvg = avg(lapsByTier.pro);
for (const key of ['master', 'pro', 'normal', 'rookie']) {
  const v = avg(lapsByTier[key]);
  const pct = v && proAvg ? (v / proAvg - 1) * 100 : 0;
  const diff = v && proAvg ? `（じょうず比 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%）` : '';
  console.log(`  ${NPC_TIERS[key].badge}${NPC_TIERS[key].name.padEnd(5)} ベストラップ平均 ${timeStr(v)} ${diff}`);
}
// じょうず > ふつう > へた の じゅんに はやいこと
const ordered = avg(lapsByTier.master) < avg(lapsByTier.pro)
  && avg(lapsByTier.pro) < avg(lapsByTier.normal)
  && avg(lapsByTier.normal) < avg(lapsByTier.rookie);
if (!ordered) bad++;
console.log(ordered ? '  ✅ プロ → じょうず → ふつう → へた の じゅんに おそくなっています'
  : '  ❌ うでまえの じゅんばんが おかしいです');

// 3) ステージ限定アイテムが ちゃんと 出るか
console.log('\n■ ステージ限定アイテム');
for (const def of TRACK_DEFS) {
  if (!def.special) continue;
  const { race } = runRace(def.id, ['normal', 'normal', 'rookie', 'rookie'], 5);
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(race.rollItem(1 + (i % 4)));
  const ok = seen.has(def.special);
  if (!ok) bad++;
  console.log(`  ${ok ? '✅' : '❌'} ${def.name}: ${def.special} が 出る`);
}

console.log(bad === 0 ? '\nすべて OK 🎉' : `\n${bad} 件 問題あり`);
process.exit(bad === 0 ? 0 : 1);
