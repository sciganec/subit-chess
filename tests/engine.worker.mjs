/**
 * The shipped HTML embeds the engine source as a string so a Web Worker can
 * search off the main thread (audit v3.0.6 P2.1). This test unpacks that string
 * from the built artefact, runs it as a module with a fake worker scope and
 * checks that a search request gets a reply.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const HTML = path.join(root, 'src', `subit_chess_v${pkg.version}.html`);

let fails = 0;
const check = (name, cond, extra = '') => {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

if (!fs.existsSync(HTML)) {
  console.error(`missing ${path.relative(root, HTML)} — run: node build/bundle.mjs`);
  process.exit(1);
}

const raw = fs.readFileSync(HTML, 'utf8');
const found = raw.match(/const ENGINE_SRC = (".*?");\r?\n/s);
check('the built page embeds the engine source', !!found);
if (!found) process.exit(1);

let src = '';
try {
  src = JSON.parse(found[1]);
} catch (err) {
  check('the embedded engine source is a valid string literal', false, String(err.message));
  process.exit(1);
}
check('the embedded engine is the real engine', src.includes('class Engine'), `${src.length} bytes`);
check('the embedded source cannot close the script tag', !src.includes('</script'));

// the same pump the shell appends before creating the blob worker
const pump = '\nvar workerEngine = null;\n' +
  'self.onmessage = function (e) {\n' +
  '  var d = e.data || {};\n' +
  '  try {\n' +
  '    if (!workerEngine) workerEngine = new Engine();\n' +
  '    if (d.reset) { workerEngine.memory.clear(); workerEngine.tt.clear(); }\n' +
  '    workerEngine.setFEN(d.fen);\n' +
  '    self.postMessage({ id: d.id, ok: true, result: workerEngine.search({ depth: d.depth, timeMs: d.timeMs }) });\n' +
  '  } catch (err) {\n' +
  '    self.postMessage({ id: d.id, ok: false, error: String((err && err.message) || err) });\n' +
  '  }\n' +
  '};\n';

const tmp = path.join(os.tmpdir(), `subit-worker-${Date.now()}.mjs`);
fs.writeFileSync(tmp, src + pump);

const replies = [];
globalThis.self = { postMessage: (data) => replies.push(data) };

await import('file://' + tmp.split(path.sep).join('/'));
fs.unlinkSync(tmp);

check('the worker scope exposes the message pump', typeof self.onmessage === 'function');

self.onmessage({
  data: { id: 7, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 4 }
});
const reply = replies[0];
check('the worker answers the search request', !!reply, String(replies.length));
check('the reply carries the request id', reply && reply.id === 7, reply && String(reply.id));
check('the reply is a successful search result',
  reply && reply.ok === true && reply.result && reply.result.move > 0,
  reply && (reply.ok ? reply.result.uci : reply.error));
check('the reply reports a depth and a node count',
  reply && reply.result && reply.result.depth > 0 && reply.result.nodes > 0,
  reply && reply.result ? `d${reply.result.depth} n=${reply.result.nodes}` : '');

/* one engine per worker: Memory/TT must survive across searches of one game
   (audit v3.0.6 P3.1 — Memory used to be written but never read) */
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
self.onmessage({ data: { id: 8, fen: START, depth: 3, reset: true } });
self.onmessage({ data: { id: 9, fen: START, depth: 3 } });
const again = replies.find((r) => r.id === 9);
check('a repeated position is served by the same worker engine',
  again && again.ok && again.result && again.result.nodes > 0,
  again && again.result ? `d${again.result.depth} n=${again.result.nodes}` : '');

console.log(fails === 0 ? '\nWORKER OK' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);