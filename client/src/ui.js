// メニュー画面（タイトル・ロビー・ショップ・けっか）の HTML を つくる
import { CAR_COLORS, EMOTES } from '../../shared/constants.js';
import { MAX_LEVEL } from '../../shared/catalog.js';
import { carById } from '../../shared/cars.js';
import { yen, timeStr } from '../../shared/util.js';
import { drawTrackThumb } from './render.js';
import { drawCarPreview } from './cars.js';

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const DIFF_LABEL = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

function carName(id) {
  return carById(id).name;
}

/** 画面を えがく。戻り値の HTML を #ui に入れる */
export function screenHtml(g) {
  switch (g.screen) {
    case 'title': return titleScreen(g);
    case 'connecting': return connectingScreen(g);
    case 'lobby': return g.uiTab === 'garage' ? garageScreen(g) : lobbyScreen(g);
    case 'result': return resultScreen(g);
    case 'shop': return garageScreen(g, true);
    case 'gpresult': return gpResultScreen(g);
    default: return '';
  }
}

// ------------------------------------------------------------------ タイトル

function titleScreen(g) {
  const colors = CAR_COLORS.map((c) => (
    `<div class="swatch${g.color === c.key ? ' on' : ''}" data-a="color:${c.key}" style="background:${c.hex}" title="${c.name}"></div>`
  )).join('');
  const httpsWarn = location.protocol === 'https:'
    ? `<div class="warn">この ページは <b>https</b> で ひらかれています。おうちの サーバ（http）には つなげないので、
       スマホでは <b>http://（サーバのIP）:8080/</b> を ひらいてね。</div>`
    : '';
  return `
  <div class="panel">
    <h1>🏁 こどもレーシング グランプリ</h1>
    <p class="sub">4人で バトル！ コインを あつめて クルマを つよくしよう</p>
    <div class="row">
      <div class="grow">
        <label>なまえ（10もじまで）</label>
        <input type="text" id="nameInput" maxlength="10" value="${esc(g.name)}" placeholder="なまえを いれてね">
      </div>
      <div class="grow">
        <label>クルマの いろ</label>
        <div class="colors">${colors}</div>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="row">
      <button class="go grow" data-a="join-local">🎮 ひとりで あそぶ</button>
      <button class="primary grow" data-a="join-online">📶 みんなで あそぶ</button>
    </div>
    <label>サーバの アドレス（みんなで あそぶ とき）</label>
    <div class="row">
      <input type="text" id="serverInput" class="grow" value="${esc(g.serverInput)}"
        placeholder="れい: 192.168.0.12:8080　（あきなら いま見ている サーバ）">
    </div>
    ${httpsWarn}
    <h2>あそびかた</h2>
    <div class="keys">
      <span><span class="kbd">←</span><span class="kbd">→</span> ハンドル</span>
      <span><span class="kbd">↑</span> アクセル</span>
      <span><span class="kbd">↓</span> ブレーキ</span>
      <span><span class="kbd">スペース</span> アイテム</span>
      <span>スマホは 画面の ボタン</span>
    </div>
    <p>コインを あつめると おかねが たまります。レースの あとの ショップで
      エンジンや タイヤを つよくして、つぎの レースで あそべます。</p>
    <p class="sub">スタートの カウントが「1」の あいだに アクセルを おしっぱなしにすると
      <b>ロケットスタート</b>！</p>
  </div>`;
}

function connectingScreen(g) {
  return `
  <div class="panel center">
    <h1>つないでいます…</h1>
    <p class="sub">${esc(g.statusText || '')}</p>
    <button class="ghost" data-a="to-title">やめる</button>
  </div>`;
}

// -------------------------------------------------------------------- ロビー

function lobbyScreen(g) {
  const room = g.room;
  if (!room) return connectingScreen(g);
  const me = g.myId;
  const isHost = g.isHost();
  const players = room.players.map((p) => playerCard(p, me)).join('');
  const npcs = Array.from({ length: room.npcCount }, (_, i) => (
    `<div class="pcard"><div class="dot" style="background:#9aa8c2"></div>
      <div class="nm">NPC ${i + 1}<br><span style="font-size:11px;color:#7b89a5">コンピュータ</span></div>
      <span class="tag npc">AI</span></div>`
  )).join('');

  const tracks = (g.tracks || []).map((t) => `
    <div class="tcard${room.settings.track === t.id ? ' on' : ''}" data-a="track:${t.id}">
      <canvas data-thumb="${t.id}"></canvas>
      <div class="tn">${esc(t.name)}</div>
      <div class="ts">${'★'.repeat(t.difficulty)}${'☆'.repeat(3 - t.difficulty)} ${esc(t.subtitle)}</div>
    </div>`).join('');

  const startBox = isHost
    ? '<button class="go" style="width:100%;margin-top:12px" data-a="start">🏁 レース スタート！</button>'
    : `<div class="note">ホスト（${esc((room.players.find((p) => p.host) || {}).name || '')}）が スタートするのを まっててね。
        そのあいだに ガレージで カスタマイズできます。</div>`;

  const hostBox = isHost ? `
    <h2>ルール（ホストが きめる）</h2>
    <div class="row">
      <button class="${room.settings.mode === 'gp' ? 'primary' : 'ghost'}" data-a="mode:gp">🏆 グランプリ（3コース）</button>
      <button class="${room.settings.mode === 'single' ? 'primary' : 'ghost'}" data-a="mode:single">🚗 1レースだけ</button>
    </div>
    <div class="row" style="margin-top:8px">
      <span>しゅうかいすう</span>
      ${[1, 2, 3, 4, 5].map((n) => `<button class="${room.settings.laps === n ? 'primary' : 'ghost'}" data-a="laps:${n}">${n}</button>`).join('')}
      <span style="margin-left:12px">NPCの つよさ</span>
      ${Object.keys(DIFF_LABEL).map((k) => `<button class="${room.settings.difficulty === k ? 'primary' : 'ghost'}" data-a="diff:${k}">${DIFF_LABEL[k]}</button>`).join('')}
    </div>
    ${room.settings.mode === 'single' ? `<h2>コースを えらぶ</h2><div class="tracks">${tracks}</div>` : `
      <h2>グランプリの コース</h2>
      <div class="tracks">${(g.tracks || []).map((t, i) => `
        <div class="tcard on">
          <canvas data-thumb="${t.id}"></canvas>
          <div class="tn">${i + 1}. ${esc(t.name)}</div>
          <div class="ts">${esc(t.subtitle)}</div>
        </div>`).join('')}</div>`}
  ` : '';

  const joinHint = g.mode === 'online' ? `
    <div class="note">スマホから さんかするには、おなじ Wi-Fi で
      <b>${esc(location.origin.replace(/^https?:\/\//, 'http://'))}</b> をひらいて、
      サーバの アドレスは そのままで「みんなで あそぶ」を おしてね。
      （ホストが localhost で ひらいている ときは、ターミナルに 出ている
      <b>192.168.x.x</b> の アドレスを つかいます）</div>` : '';

  return `
  <div class="panel">
    <h1>${g.mode === 'online' ? 'みんなの ロビー' : 'ひとりで れんしゅう'}</h1>
    <p class="sub">4だいで レースします。たりない ぶんは NPC が はいります</p>
    <div class="plist">${players}${npcs}</div>
    ${startBox}
    ${joinHint}
    <div class="row" style="margin-top:12px">
      <div class="big-money grow">おかね ${yen(g.profile ? g.profile.money : 0)}</div>
      <button class="primary" data-a="garage">🔧 ガレージ（カスタマイズ）</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="ghost" data-a="toggle-auto">アクセルおまかせ: ${g.autoGas ? 'ON' : 'OFF'}</button>
      <button class="ghost" data-a="toggle-touch">タッチそうさ: ${{ auto: 'じどう', on: 'ON', off: 'OFF' }[g.touchMode]}</button>
      <button class="ghost" data-a="toggle-sound">おと: ${g.sound ? 'ON' : 'OFF'}</button>
      <button class="ghost" data-a="to-title">やめる</button>
    </div>
    ${hostBox}
  </div>`;
}

function playerCard(p, meId) {
  const hex = (CAR_COLORS.find((c) => c.key === p.color) || CAR_COLORS[0]).hex;
  const tags = [];
  if (p.host) tags.push('<span class="tag">ホスト</span>');
  if (p.spectator) tags.push('<span class="tag">かんせん</span>');
  if (p.ready) tags.push('<span class="tag ok">じゅんびOK</span>');
  if (p.ping) tags.push(`<span class="tag">${p.ping}ms</span>`);
  return `<div class="pcard${p.id === meId ? ' me' : ''}">
    <div class="dot" style="background:${hex}"></div>
    <div class="nm">${esc(p.name)}<br><span style="font-size:11px;color:#7b89a5">${esc(carName(p.car))} / ${yen(p.money)}</span></div>
    ${tags.join('')}
  </div>`;
}

// -------------------------------------------------------------------- ガレージ

function garageScreen(g, isShopPhase = false) {
  const prof = g.profile;
  const cat = g.catalog;
  if (!prof || !cat) return '<div class="panel center"><h1>よみこみ中…</h1></div>';

  const ups = Object.entries(cat.upgrades).map(([key, def]) => {
    const lv = prof.upgrades[key] || 0;
    const cost = lv < MAX_LEVEL ? def.costs[lv] : null;
    const bars = Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="item">
      <div class="ic">${def.icon}</div>
      <div class="info">
        <div class="nm">${esc(def.name)} <span class="lv">Lv.${lv}</span></div>
        <div class="ds">${esc(def.desc)}</div>
        <div class="bars">${bars}</div>
      </div>
      ${cost == null
        ? '<span class="owned">MAX!</span>'
        : `<button class="${prof.money >= cost ? 'primary' : ''}" data-a="buy:upgrade:${key}" ${prof.money >= cost ? '' : 'disabled'}>${yen(cost)}</button>`}
    </div>`;
  }).join('');

  const cons = Object.entries(cat.consumables).map(([key, def]) => `
    <div class="item">
      <div class="ic">${def.icon}</div>
      <div class="info">
        <div class="nm">${esc(def.name)} <span class="lv">もっている数: ${prof.consumables[key] || 0}</span></div>
        <div class="ds">${esc(def.desc)}</div>
      </div>
      <button class="${prof.money >= def.cost ? 'primary' : ''}" data-a="buy:consumable:${key}" ${prof.money >= def.cost ? '' : 'disabled'}>${yen(def.cost)}</button>
    </div>`).join('');

  // クルマ（マシン）えらび
  const perkLabel = { money: '💰 おかね 1.15ばい', offroad: '🌿 みちの そとでも はやい', tough: '🛡️ スピンしにくい' };
  const cars = (cat.cars || []).map((c) => {
    const owned = (prof.owned.car || []).includes(c.key);
    const on = prof.car === c.key;
    const can = prof.money >= c.cost;
    const bars = (v) => {
      const n = Math.max(1, Math.min(5, Math.round((v - 0.85) * 12)));
      return '<span style="letter-spacing:1px">' + '●'.repeat(n) + '<span style="opacity:.25">' + '●'.repeat(5 - n) + '</span></span>';
    };
    return `<div class="carcard${on ? ' on' : ''}">
      <canvas data-car="${c.key}" data-color="${esc(prof.color)}"></canvas>
      <div class="cn">${esc(c.name)}</div>
      <div class="ct">${esc(c.type)}</div>
      <div class="cs">
        <span>スピード ${bars(c.stats.maxSpeed)}</span>
        <span>かそく ${bars(c.stats.accel)}</span>
        <span>グリップ ${bars(c.stats.grip)}</span>
      </div>
      <div class="ct">${esc(c.desc)}${c.perk ? '<br>' + perkLabel[c.perk] : ''}</div>
      ${owned
        ? `<button class="${on ? 'primary' : 'ghost'}" data-a="equip:car:${c.key}">${on ? '✅ これに のってる' : 'これに のる'}</button>`
        : `<button class="${can ? 'primary' : ''}" data-a="buy:car:${c.key}" ${can ? '' : 'disabled'}>${yen(c.cost)} で かう</button>`}
    </div>`;
  }).join('');

  const cosm = ['color', 'hat', 'trail'].map((kind) => {
    const def = cat.cosmetics[kind];
    const items = def.items.map((it) => {
      const owned = (prof.owned[kind] || []).includes(it.key);
      const on = prof[kind] === it.key;
      const label = kind === 'color'
        ? `<span class="swatch${on ? ' on' : ''}" style="background:${(CAR_COLORS.find((c) => c.key === it.key) || {}).hex};display:inline-block"></span>`
        : esc(it.name);
      const action = owned ? `equip:${kind}:${it.key}` : `buy:${kind}:${it.key}`;
      const price = owned ? (on ? 'つけている' : 'つける') : yen(it.cost);
      const cls = on ? 'primary' : owned ? 'ghost' : (prof.money >= it.cost ? '' : '');
      return `<button class="${cls}" data-a="${action}" ${!owned && prof.money < it.cost ? 'disabled' : ''}>
        ${label} <span style="font-size:12px">${price}</span></button>`;
    }).join('');
    return `<h2>${esc(def.name)}</h2><div class="row">${items}</div>`;
  }).join('');

  const readyBar = isShopPhase ? `
    <div class="row" style="margin-top:14px">
      <button class="${g.iAmReady() ? 'go' : 'primary'} grow" data-a="ready">
        ${g.iAmReady() ? '✅ じゅんび できた！（まってます）' : '👍 じゅんび できた！'}</button>
      ${g.isHost() ? '<button data-a="next">みんな まてない！つぎへ</button>' : ''}
    </div>
    <div class="plist" style="margin-top:10px">
      ${(g.room ? g.room.players : []).map((p) => playerCard(p, g.myId)).join('')}
    </div>` : `
    <div class="row" style="margin-top:14px">
      <button class="primary grow" data-a="back">もどる</button>
    </div>`;

  const gpInfo = isShopPhase && g.room && g.room.gp
    ? `<p class="sub">つぎは ${g.room.gp.index + 2}レースめ / ${g.room.gp.total}レース</p>` : '';

  return `
  <div class="panel">
    <h1>🔧 ガレージ</h1>
    ${gpInfo}
    <div class="big-money">もっている おかね ${yen(prof.money)}</div>
    <h2>🏎️ マシンを えらぶ</h2>
    <p class="sub">パーツの つよさは マシンの 性能に かけざんされます</p>
    <div class="cars">${cars}</div>
    <h2>パーツを つよくする</h2>
    <div class="shop">${ups}</div>
    <h2>1レースだけの アイテム</h2>
    <div class="shop">${cons}</div>
    ${cosm}
    ${readyBar}
  </div>`;
}

// -------------------------------------------------------------------- けっか

function resultScreen(g) {
  const res = g.results || [];
  const rows = res.map((r) => `
    <tr class="${r.id === g.myId ? 'me' : ''}">
      <td class="rank${r.rank}">${r.rank}い</td>
      <td>${esc(r.name)}${r.kind === 'npc' ? ' <span class="tag npc">AI</span>' : ''}</td>
      <td class="num">${timeStr(r.time)}</td>
      <td class="num">${timeStr(r.bestLap)}</td>
      <td class="num">${r.coins}まい</td>
      <td class="num">${yen(r.money)}</td>
      <td class="num">${r.points}pt</td>
    </tr>`).join('');
  const mine = res.find((r) => r.id === g.myId);
  return `
  <div class="panel">
    <h1>${g.raceInfo ? `レース ${g.raceInfo.race} / ${g.raceInfo.total}` : ''} けっか</h1>
    ${mine ? `<p class="sub">きみは <b>${mine.rank}い</b>！ ${yen(mine.money)} かせいだよ 🎉</p>` : ''}
    <table>
      <tr><th>じゅんい</th><th>なまえ</th><th class="num">タイム</th><th class="num">ベストラップ</th>
        <th class="num">コイン</th><th class="num">おかね</th><th class="num">ポイント</th></tr>
      ${rows}
    </table>
    ${standingsTable(g)}
    <div class="row center" style="margin-top:14px">
      ${g.isHost()
        ? '<button class="go" data-a="next">つぎへ すすむ</button>'
        : '<span class="pill">ホストを まっています…</span>'}
    </div>
  </div>`;
}

function standingsTable(g) {
  const st = g.standings;
  if (!st || !st.length) return '';
  return `<h2>グランプリ とくてん</h2>
    <table>
      <tr><th>じゅんい</th><th>なまえ</th><th class="num">ポイント</th><th class="num">かせいだ おかね</th></tr>
      ${st.map((s, i) => `<tr class="${s.id === g.myId ? 'me' : ''}">
        <td class="rank${i + 1}">${i + 1}い</td>
        <td>${esc(s.name)}${s.kind === 'npc' ? ' <span class="tag npc">AI</span>' : ''}</td>
        <td class="num">${s.points}pt</td>
        <td class="num">${yen(s.money)}</td></tr>`).join('')}
    </table>`;
}

function gpResultScreen(g) {
  const st = g.standings || [];
  const champ = st[0];
  const mine = st.find((s) => s.id === g.myId);
  return `
  <div class="panel center">
    <h1>🏆 グランプリ しゅうりょう！</h1>
    ${champ ? `<p style="font-size:26px">ゆうしょうは <b>${esc(champ.name)}</b> ！ ${'🎉'.repeat(3)}</p>` : ''}
    ${mine ? `<p class="sub">きみは ${st.indexOf(mine) + 1}い（${mine.points}ポイント）</p>` : ''}
    ${standingsTable(g)}
    <div class="row center" style="margin-top:16px">
      <button data-a="garage">🔧 ガレージ</button>
      ${g.isHost() ? '<button class="go" data-a="next">ロビーに もどる</button>' : '<span class="pill">ホストを まっています…</span>'}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ HUD など

export function emoteBarHtml() {
  return EMOTES.map((e) => `<button data-a="emote:${e}">${e}</button>`).join('');
}

export function drawThumbs(rootEl) {
  for (const c of rootEl.querySelectorAll('canvas[data-thumb]')) {
    try {
      drawTrackThumb(c, c.dataset.thumb);
    } catch { /* noop */ }
  }
  for (const c of rootEl.querySelectorAll('canvas[data-car]')) {
    try {
      drawCarPreview(c, c.dataset.car, c.dataset.color);
    } catch { /* noop */ }
  }
}
