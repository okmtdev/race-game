// ガレージ（おかね・パーツ）の保存。名前をキーに JSON ファイルへ書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { newProfile, normalizeProfile } from '../shared/catalog.js';

export class ProfileStore {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) this.data[k] = normalizeProfile(v);
      console.log(`[garage] ${Object.keys(this.data).length}人のデータを よみこみました`);
    } catch {
      this.data = {};
    }
  }

  save() {
    // 書き込みが集中しないように 1 秒まとめる
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      } catch (e) {
        console.warn('[garage] 保存できませんでした:', e.message);
      }
    }, 1000);
    this.timer.unref?.();
  }

  key(name) {
    return String(name || '').trim().toLowerCase() || 'player';
  }

  get(name, color) {
    const k = this.key(name);
    if (!this.data[k]) this.data[k] = newProfile(name, color);
    const p = this.data[k];
    p.name = name;
    return p;
  }

  reset(name) {
    delete this.data[this.key(name)];
    this.save();
  }
}
