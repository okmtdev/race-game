// 依存パッケージなしの最小 WebSocket サーバ実装（RFC 6455）
//
// npm の追加パッケージを入れずに動かしたいので、必要な部分だけ自分で書いている。
// テキストフレームの送受信・分割フレーム・ping/pong・close に対応。
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1 << 20; // 1MB

const OP = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

export class WebSocketServer extends EventEmitter {
  /**
   * @param {import('node:http').Server} server
   * @param {{path?: string}} opts
   */
  constructor(server, opts = {}) {
    super();
    this.path = opts.path || '/ws';
    this.clients = new Set();
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
    // 生きているか定期チェック
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (c.awaitingPong) {
          c.terminate();
          continue;
        }
        c.awaitingPong = true;
        c.ping();
      }
    }, 15000);
    this.heartbeat.unref?.();
  }

  handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== this.path) {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    const conn = new WebSocketConn(socket, req);
    this.clients.add(conn);
    conn.on('close', () => this.clients.delete(conn));
    if (head && head.length) conn.onData(head);
    this.emit('connection', conn, req);
  }

  broadcast(text, filter) {
    for (const c of this.clients) {
      if (filter && !filter(c)) continue;
      c.send(text);
    }
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.terminate();
  }
}

export class WebSocketConn extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.fragOp = 0;
    this.closed = false;
    this.awaitingPong = false;
    this.remote = (req.socket.remoteAddress || '').replace('::ffff:', '');
    socket.on('data', (d) => this.onData(d));
    socket.on('error', () => this.terminate());
    socket.on('close', () => this.finish());
    socket.on('end', () => this.finish());
  }

  onData(chunk) {
    if (this.closed) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    // 受け取ったバイト列からフレームを取り出せるだけ取り出す
    for (;;) {
      const frame = this.readFrame();
      if (!frame) break;
      this.handleFrame(frame);
      if (this.closed) return;
    }
  }

  readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < off + 2) return null;
      len = b.readUInt16BE(off);
      off += 2;
    } else if (len === 127) {
      if (b.length < off + 8) return null;
      const big = b.readBigUInt64BE(off);
      if (big > BigInt(MAX_MESSAGE)) {
        this.close(1009, 'too big');
        return null;
      }
      len = Number(big);
      off += 8;
    }
    let mask = null;
    if (masked) {
      if (b.length < off + 4) return null;
      mask = b.subarray(off, off + 4);
      off += 4;
    }
    if (b.length < off + len) return null;
    const payload = Buffer.from(b.subarray(off, off + len));
    if (mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    this.buf = b.subarray(off + len);
    return { fin, opcode, payload };
  }

  handleFrame(f) {
    if (f.opcode === OP.PING) {
      this.sendFrame(OP.PONG, f.payload);
      return;
    }
    if (f.opcode === OP.PONG) {
      this.awaitingPong = false;
      this.emit('pong');
      return;
    }
    if (f.opcode === OP.CLOSE) {
      this.sendFrame(OP.CLOSE, Buffer.alloc(0));
      this.terminate();
      return;
    }
    if (f.opcode === OP.TEXT || f.opcode === OP.BIN) {
      if (!f.fin) {
        this.fragOp = f.opcode;
        this.frags = [f.payload];
        return;
      }
      this.deliver(f.opcode, f.payload);
      return;
    }
    if (f.opcode === OP.CONT) {
      this.frags.push(f.payload);
      const total = this.frags.reduce((n, p) => n + p.length, 0);
      if (total > MAX_MESSAGE) {
        this.close(1009, 'too big');
        return;
      }
      if (f.fin) {
        const all = Buffer.concat(this.frags);
        this.frags = [];
        this.deliver(this.fragOp, all);
      }
    }
  }

  deliver(opcode, payload) {
    if (opcode === OP.TEXT) this.emit('message', payload.toString('utf8'));
    else this.emit('binary', payload);
  }

  sendFrame(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x80 | opcode;
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.terminate();
    }
  }

  send(text) {
    this.sendFrame(OP.TEXT, Buffer.from(String(text), 'utf8'));
  }

  sendJson(obj) {
    this.send(JSON.stringify(obj));
  }

  ping() {
    this.sendFrame(OP.PING, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.sendFrame(OP.CLOSE, body);
    this.terminate();
  }

  terminate() {
    if (this.closed) {
      this.socket.destroy();
      return;
    }
    this.finish();
    this.socket.destroy();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}
