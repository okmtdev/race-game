// 開発用：NPC だけでレースを回して、コースがちゃんと走れるか確かめる
// 使い方: npm run simtest
import { Race } from '../shared/race.js';
import { TRACK_DEFS } from '../shared/tracks.js';
import { DT, DEFAULT_LAPS } from '../shared/constants.js';
import { newProfile } from '../shared/catalog.js';
import { timeStr } from '../shared/util.js';

let bad = 0;

for (const def of TRACK_DEFS) {
  const racers = [0, 1, 2, 3].map((i) => ({
    id: 'npc' + i,
    name: 'NPC' + i,
    color: 'red',
    kind: 'npc',
    profile: newProfile(),
    aiSkill: 0.9 + i * 0.03,
  }));
  const race = new Race({ trackId: def.id, laps: DEFAULT_LAPS, seed: 7, racers });
  let ticks = 0;
  while (race.phase !== 'done' && ticks < 30 * 400) {
    race.step(DT);
    race.drainEvents();
    ticks++;
  }
  const res = race.results();
  const ok = race.phase === 'done' && res.every((r) => r.time != null);
  if (!ok) bad++;
  console.log(`\n=== ${def.name} (${def.id}) ${ok ? 'OK' : '*** NG ***'}  ${ticks} ticks`);
  for (const r of res) {
    console.log(
      `  ${r.rank}い ${r.name.padEnd(6)} time=${timeStr(r.time)} best=${timeStr(r.bestLap)}` +
      ` coins=${String(r.coins).padStart(2)} money=¥${r.money} drift=${r.driftTime}s`,
    );
  }
}

console.log(bad === 0 ? '\nすべてのコースを完走できました 🎉' : `\n${bad} コースで問題あり`);
process.exit(bad === 0 ? 0 : 1);
