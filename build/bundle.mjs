/**
 * SUBIT-CHESS v3.0.0 — single-file bundler
 *
 * The engine is a set of plain ES modules under src/engine/. This script walks
 * the import graph from the entry point, orders the modules topologically and
 * concatenates them into ONE inline module script, so the shipped artefact is
 * still a single HTML file with no build step, no CDN and no network access.
 *
 *   node build/bundle.mjs            -> src/subit_chess_v3.0.0.html
 *
 * Rules (deliberately simple, the engine has no external dependencies):
 *   - `import ... from './x.mjs'` statements are removed (all modules end up in
 *     the same scope);
 *   - `export` keywords are kept: an inline <script type="module"> is a module,
 *     so export declarations are legal and harmless;
 *   - top-level names must be unique across modules (checked, hard error).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ENGINE = path.join(root, 'src', 'engine');
const ENTRY = path.join(ENGINE, 'index.mjs');
const SHELL = path.join(root, 'build', 'shell.html');
const OUT = path.join(root, 'src', 'subit_chess_v3.0.0.html');
// the repository entry point: opening the project root must serve the current
// app, not a stale copy of an older release
const PAGE = path.join(root, 'index.html');

const IMPORT_RE = /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?[ \t]*$/gm;
const DECL_RE = /^(?:export\s+)?(?:const|let|var|function|class|async\s+function)\s+([A-Za-z_$][\w$]*)/gm;

function resolveModule(fromFile, spec) {
  if (!spec.startsWith('.')) throw new Error(`external dependency not allowed: ${spec}`);
  return path.resolve(path.dirname(fromFile), spec);
}

function walk(file, order, seen, stack) {
  if (seen.has(file)) return;
  if (stack.has(file)) throw new Error(`import cycle: ${[...stack, file].join(' -> ')}`);
  stack.add(file);
  const src = fs.readFileSync(file, 'utf8');
  const deps = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) deps.push(resolveModule(file, m[1]));
  for (const dep of deps) walk(dep, order, seen, stack);
  stack.delete(file);
  seen.add(file);
  order.push(file);
}

function stripImports(src) {
  return src.replace(IMPORT_RE, '');
}

function main() {
  const order = [];
  walk(ENTRY, order, new Set(), new Set());

  const parts = [];
  const owners = new Map();
  const collisions = [];

  for (const file of order) {
    let src = stripImports(fs.readFileSync(file, 'utf8'));
    // drop the module doc comment header of every module but the first
    const rel = path.relative(root, file).replace(/\\/g, '/');
    src = src.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '');
    DECL_RE.lastIndex = 0;
    let d;
    while ((d = DECL_RE.exec(src)) !== null) {
      const name = d[1];
      if (owners.has(name) && owners.get(name) !== rel) collisions.push(`${name}: ${owners.get(name)} / ${rel}`);
      else owners.set(name, rel);
    }
    parts.push(`\n/* ===== ${rel} ===== */\n${src.trim()}\n`);
  }

  if (collisions.length) {
    console.error('top-level name collisions (rename before bundling):');
    for (const c of collisions) console.error('  ' + c);
    process.exit(1);
  }

  const bundle = parts.join('\n');
  const shell = fs.readFileSync(SHELL, 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const html = shell
    .split('/*__VERSION__*/').join(version)
    .replace('/*__MODULES__*/', () => bundle);

  fs.writeFileSync(OUT, html);
  fs.writeFileSync(PAGE, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`bundled ${order.length} modules -> ${path.relative(root, OUT)} (${kb} kB)`);
  console.log(`entry point -> ${path.relative(root, PAGE)} (same bundle)`);
  for (const f of order) console.log('  ' + path.relative(root, f).replace(/\\/g, '/'));
}

main();
