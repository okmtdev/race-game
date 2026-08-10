// ブラウザ側の保存（ひとりであそぶ ときの ガレージ／設定）
import { newProfile, normalizeProfile } from '../../shared/catalog.js';

const KEY_PROFILES = 'race:profiles';
const KEY_SETTINGS = 'race:settings';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* プライベートモードなどで保存できないときは あきらめる */
  }
}

/** shared/room.js の Room にわたす保存係（サーバの ProfileStore と同じ形） */
export class LocalProfileStore {
  constructor() {
    this.data = {};
    const obj = read(KEY_PROFILES, {});
    for (const [k, v] of Object.entries(obj)) this.data[k] = normalizeProfile(v);
  }

  key(name) {
    return String(name || '').trim().toLowerCase() || 'player';
  }

  get(name, color) {
    const k = this.key(name);
    if (!this.data[k]) this.data[k] = newProfile(name, color);
    this.data[k].name = name;
    return this.data[k];
  }

  save() {
    write(KEY_PROFILES, this.data);
  }

  reset(name) {
    delete this.data[this.key(name)];
    this.save();
  }
}

const defaults = {
  name: '',
  color: 'red',
  autoGas: false,
  sound: true,
  server: '',
};

export const settings = Object.assign({}, defaults, read(KEY_SETTINGS, {}));

export function saveSettings(patch) {
  Object.assign(settings, patch || {});
  write(KEY_SETTINGS, settings);
}
