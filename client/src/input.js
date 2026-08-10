// キーボード・タッチ・ゲームパッドの そうさを ひとつにまとめる
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake',
  Space: 'item', ShiftLeft: 'item', ShiftRight: 'item', KeyJ: 'item',
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, item: false };
    this.autoGas = false;
    this.usedTouch = false;

    addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      this.keys.add(k);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys.delete(k);
    });
    addEventListener('blur', () => this.keys.clear());

    for (const el of document.querySelectorAll('#touch .tpad')) {
      const key = el.dataset.key;
      const on = (v) => (e) => {
        e.preventDefault();
        this.touch[key] = v;
        this.usedTouch = true;
        el.classList.toggle('on', v);
      };
      el.addEventListener('pointerdown', on(true));
      el.addEventListener('pointerup', on(false));
      el.addEventListener('pointercancel', on(false));
      el.addEventListener('pointerleave', on(false));
    }
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  /** 今のそうさを {s: ハンドル, a: アクセル, it: アイテム} で返す */
  read() {
    let s = 0;
    let a = 0;
    let it = false;
    const k = this.keys;
    const t = this.touch;
    if (k.has('left') || t.left) s -= 1;
    if (k.has('right') || t.right) s += 1;
    if (k.has('gas') || t.gas) a += 1;
    if (k.has('brake') || t.brake) a -= 1;
    if (k.has('item') || t.item) it = true;

    const pad = this.gamepad();
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.18) s += ax;
      if (pad.buttons[0] && pad.buttons[0].pressed) a += 1;
      if (pad.buttons[1] && pad.buttons[1].pressed) a -= 1;
      if ((pad.buttons[2] && pad.buttons[2].pressed) || (pad.buttons[5] && pad.buttons[5].pressed)) it = true;
    }

    // 「アクセルおまかせ」なら、ブレーキを踏んでいないときは いつも前進
    if (this.autoGas && a === 0) a = 1;
    return { s: Math.max(-1, Math.min(1, s)), a: Math.max(-1, Math.min(1, a)), it };
  }
}
