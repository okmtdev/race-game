// 開発テスト用の 小さな WebSocket クライアント（Node から サーバに つなぐ）
import net from 'node:net';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export class WsClient extends EventEmitter {
  constructor(url) {
    super();
    const u = new URL(url);
    this.key = crypto.randomBytes(16).toString('base64');
    this.buf = Buffer.alloc(0);
    this.handshaken = false;
    this.socket = net.connect(Number(u.port || 80), u.hostname, () => {
      this.socket.write(
        `GET ${u.pathname || '/'} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${this.key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    this.socket.on('data', (d) => this.onData(d));
    this.socket.on('error', (e) => this.emit('error', e));
    this.socket.on('close', () => this.emit('close'));
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (!this.handshaken) {
      const idx = this.buf.indexOf('\r\n\r\n');
      if (idx < 0) return;
      const head = this.buf.subarray(0, idx).toString();
      this.buf = this.buf.subarray(idx + 4);
      if (!/101/.test(head)) {
        this.emit('error', new Error('handshake failed: ' + head.split('\r\n')[0]));
        return;
      }
      this.handshaken = true;
      this.emit('open');
    }
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2));
        off = 10;
      }
      if (masked) off += 4;
      if (b.length < off + len) return;
      const payload = b.subarray(off, off + len);
      this.buf = b.subarray(off + len);
      if (opcode === 0x1) {
        let msg = null;
        try {
          msg = JSON.parse(payload.toString('utf8'));
        } catch { /* テキストじゃないものは むし */ }
        if (msg) this.emit('json', msg);
      } else if (opcode === 0x9) {
        this.frame(0xa, payload); // ping には pong
      } else if (opcode === 0x8) {
        this.socket.end();
      }
    }
  }

  frame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let head;
    if (len < 126) {
      head = Buffer.allocUnsafe(2);
      head[1] = 0x80 | len;
    } else if (len < 65536) {
      head = Buffer.allocUnsafe(4);
      head[1] = 0x80 | 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.allocUnsafe(10);
      head[1] = 0x80 | 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    head[0] = 0x80 | opcode;
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    this.socket.write(Buffer.concat([head, mask, body]));
  }

  sendJson(obj) {
    this.frame(0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
  }

  close() {
    try {
      this.frame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch { /* noop */ }
  }
}
