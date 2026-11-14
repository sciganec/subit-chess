'use strict';

const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

function parseInfo(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  const out = { raw: line, pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (['depth','seldepth','multipv','nodes','nps','time','hashfull','tbhits'].includes(t)) {
      const n = Number(tokens[++i]);
      if (Number.isFinite(n)) out[t] = n;
    } else if (t === 'score') {
      const kind = tokens[++i], value = Number(tokens[++i]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) out.score = { type: kind, value };
    } else if (t === 'lowerbound' || t === 'upperbound') {
      out.bound = t;
    } else if (t === 'pv') {
      out.pv = tokens.slice(i + 1);
      break;
    }
  }
  return out;
}

class UciEngine {
  constructor(command, args = [], options = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new TypeError('A UCI engine command is required.');
    this.command = command;
    this.args = args;
    this.options = options;
    this.child = null;
    this.decoder = new StringDecoder('utf8');
    this.buffer = '';
    this.waiters = [];
    this.info = [];
    this.bestMoveWaiter = null;
    this.closed = false;
    this.stderr = '';
  }

  _send(command) {
    if (!this.child || !this.child.stdin.writable) throw new Error('UCI engine stdin is not writable.');
    this.child.stdin.write(command + '\n');
  }

  _waitFor(predicate, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, label };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(x => x !== waiter);
        reject(new Error('Timed out waiting for UCI ' + label));
      }, timeoutMs);
      waiter.resolve = value => { clearTimeout(timer); resolve(value); };
      waiter.reject = error => { clearTimeout(timer); reject(error); };
      this.waiters.push(waiter);
    });
  }

  _line(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('info ')) {
      const parsed = parseInfo(trimmed);
      if (parsed) this.info.push(parsed);
    }
    for (const waiter of [...this.waiters]) {
      let matched = false;
      try { matched = waiter.predicate(trimmed); } catch (e) { waiter.reject(e); }
      if (matched) {
        this.waiters = this.waiters.filter(x => x !== waiter);
        waiter.resolve(trimmed);
      }
    }
    if (trimmed.startsWith('bestmove ' ) && this.bestMoveWaiter) {
      const parts = trimmed.split(/\s+/);
      const result = { bestmove: parts[1], ponder: parts[2] === 'ponder' ? parts[3] : null, info: this.info.slice(), raw: trimmed };
      const done = this.bestMoveWaiter;
      this.bestMoveWaiter = null;
      done.resolve(result);
    }
  }

  async start() {
    if (this.child) throw new Error('UCI engine already started.');
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd,
      env: this.options.env || process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child.stdout.on('data', chunk => {
      this.buffer += this.decoder.write(chunk);
      let n;
      while ((n = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, n).replace(/\r$/, '');
        this.buffer = this.buffer.slice(n + 1);
        this._line(line);
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-8192); });
    this.child.on('error', error => this._fail(error));
    this.child.on('exit', (code, signal) => {
      this.closed = true;
      this._fail(new Error('UCI engine exited (' + code + ', ' + signal + '). ' + this.stderr));
    });
    const timeout = this.options.handshakeTimeoutMs || 10000;
    const uciok = this._waitFor(x => x === 'uciok', timeout, 'uciok');
    this._send('uci');
    await uciok;
    const readyok = this._waitFor(x => x === 'readyok', timeout, 'readyok');
    this._send('isready');
    await readyok;
    return this;
  }

  _fail(error) {
    for (const w of this.waiters.splice(0)) w.reject(error);
    if (this.bestMoveWaiter) {
      this.bestMoveWaiter.reject(error);
      this.bestMoveWaiter = null;
    }
  }

  async setOption(name, value) {
    if (!this.child || this.closed) throw new Error('UCI engine is not running.');
    if (!/^[\w ]+$/.test(name)) throw new TypeError('Invalid UCI option name.');
    this._send('setoption name ' + name + ' value ' + String(value));
    const ready = this._waitFor(x => x === 'readyok', this.options.commandTimeoutMs || 5000, 'readyok after setoption');
    this._send('isready');
    await ready;
  }

  async analyze(fen, limits = {}) {
    if (!this.child || this.closed) throw new Error('UCI engine is not running.');
    if (this.bestMoveWaiter) throw new Error('A UCI search is already active.');
    if (typeof fen !== 'string' || fen.trim().split(/\s+/).length !== 6) throw new TypeError('A complete six-field FEN is required.');
    const multipv = Math.max(1, Math.floor(limits.multiPV || 1));
    await this.setOption('MultiPV', multipv);
    this.info = [];
    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { this._send('stop'); } catch (_) {}
        this.bestMoveWaiter = null;
        reject(new Error('Timed out waiting for UCI bestmove.'));
      }, limits.timeoutMs || this.options.searchTimeoutMs || 30000);
      this.bestMoveWaiter = {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); }
      };
    });
    this._send('position fen ' + fen.trim());
    const go = limits.nodes ? 'go nodes ' + Math.max(1, Math.floor(limits.nodes))
      : limits.mate ? 'go mate ' + Math.max(1, Math.floor(limits.mate))
      : limits.depth ? 'go depth ' + Math.max(1, Math.floor(limits.depth))
      : 'go movetime ' + Math.max(1, Math.floor(limits.moveTimeMs || 1000));
    this._send(go);
    return resultPromise;
  }

  async close() {
    if (!this.child || this.closed) return;
    try { this._send('quit'); } catch (_) {}
    const child = this.child;
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} resolve(); }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    this.closed = true;
    this._fail(new Error('UCI engine closed.'));
  }
}

module.exports = { UciEngine, parseInfo };
