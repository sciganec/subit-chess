/**
 * The single-file application is checked in a real DOM (jsdom): the shipped
 * HTML must parse, mount the board, render 32 pieces and make a move when the
 * user clicks two squares.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const HTML = path.join(root, 'src', 'subit_chess_v3.0.2.html');

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

if (!fs.existsSync(HTML)) {
  console.error(`missing ${path.relative(root, HTML)} — run: node build/bundle.mjs`);
  process.exit(1);
}

const raw = fs.readFileSync(HTML, 'utf8');
const match = raw.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) { console.error('no inline module script found'); process.exit(1); }

// jsdom does not execute ES modules: drop the export keywords (one shared
// scope, so nothing else changes) and run the result as a classic script.
const classic = match[1].replace(/^export\s+/gm, '');
const shell = raw.replace(match[0], `<script>${classic.replace(/<\/script>/g, '<\\/script>')}</script>`);

const errors = [];
const dom = new JSDOM(shell, { runScripts: 'dangerously', pretendToBeVisual: true });
dom.window.addEventListener('error', (e) => errors.push(e.message));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(80);

const doc = dom.window.document;
const board = doc.getElementById('board');
const S = dom.window.__subit;
const at = (sq) => board.querySelector(`.sq[data-sq="${sq}"]`);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

check('the bundle runs without throwing', errors.length === 0, errors.join('; '));
check('the board mounts 64 squares', board.querySelectorAll('.sq').length === 64,
  String(board.querySelectorAll('.sq').length));
check('the board is a light/dark checkerboard',
  board.querySelectorAll('.sq.light').length === 32 && board.querySelectorAll('.sq.dark').length === 32,
  `${board.querySelectorAll('.sq.light').length}/${board.querySelectorAll('.sq.dark').length}`);
check('32 pieces are rendered', board.querySelectorAll('.piece-img').length === 32,
  String(board.querySelectorAll('.piece-img').length));
check('the header carries the version', doc.querySelector('.logo h1').textContent.includes('v3.0.2'),
  doc.querySelector('.logo h1').textContent);
check('the status line names the side to move',
  doc.getElementById('status').textContent.includes('Ваш хід'),
  doc.getElementById('status').textContent.trim());
check('the morphological state is computed',
  doc.getElementById('s-key').textContent.startsWith('S = (') &&
  !doc.getElementById('s-key').textContent.includes('—'),
  doc.getElementById('s-key').textContent);
check('the evaluation panel is filled', doc.getElementById('eval-obj').textContent.trim().length > 0,
  doc.getElementById('eval-obj').textContent);
check('the SVF panel lists the components', doc.querySelectorAll('#svf-rows .subit-label').length >= 9,
  String(doc.querySelectorAll('#svf-rows .subit-label').length));
check('the plan panel rendered', doc.querySelectorAll('#plans .plan-item').length > 0,
  String(doc.querySelectorAll('#plans .plan-item').length));
check('the relation panel is filled', doc.querySelectorAll('#rel-stats .k').length >= 2,
  String(doc.querySelectorAll('#rel-stats .k').length));

/* click e2 then e4 */
const e2 = 100, e4 = 68;    // 0x88: e2 = 6*16+4, e4 = 4*16+4
click(at(e2));
check('selecting a pawn highlights its moves', board.querySelectorAll('.sq.legal').length === 2,
  String(board.querySelectorAll('.sq.legal').length));
check('the selected square is marked', board.querySelectorAll('.sq.sel').length === 1);
click(at(e4));

const fen = S.fen;
check('clicking a legal target plays the move', fen.includes(' b ') && fen.includes('4P3'), fen);
check('the move list shows 1.e4', doc.getElementById('moves-list').textContent.includes('e4'),
  doc.getElementById('moves-list').textContent.trim());
check('captured pieces are empty after 1.e4',
  doc.getElementById('captured-top-count').textContent === '',
  doc.getElementById('captured-top-count').textContent);

/* the engine answers on its own */
await wait(2500);
check('the engine replies', S.history.length >= 2, String(S.history.length));
check('the search panel is filled after the engine move',
  !doc.getElementById('search-stats').textContent.includes('—'),
  doc.getElementById('search-stats').textContent.trim().slice(0, 48));

/* an illegal move is ignored */
const before = S.history.length;
click(at(e4));
click(at(0));
check('an illegal move is ignored', S.history.length === before);

/* flip keeps the board consistent */
const pieces = board.querySelectorAll('.piece-img').length;
click(doc.getElementById('btn-flip'));
check('flip keeps every piece on the board', board.querySelectorAll('.piece-img').length === pieces);

/* undo takes back the engine move and the player move */
click(doc.getElementById('undo'));
check('undo rewinds the game', S.history.length < before, String(S.history.length));
check('undo restores the start position when everything is taken back',
  S.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'), S.fen);

/* new game resets */
click(doc.getElementById('new-game'));
check('new game restores the start position',
  S.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'), S.fen);
check('new game clears the move list',
  doc.getElementById('moves-list').textContent.includes('ходів ще немає'));

/* loading a FEN through the modal */
click(doc.getElementById('btn-fen'));
doc.getElementById('fen-input').value = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
click(doc.getElementById('fen-load'));
check('a FEN can be loaded', S.fen === '4k3/8/8/8/8/8/8/4K2R w K - 0 1', S.fen);
check('only three pieces are rendered after loading',
  board.querySelectorAll('.piece-img').length === 3, String(board.querySelectorAll('.piece-img').length));

/* settings */
click(doc.getElementById('btn-menu'));
doc.getElementById('coords-select').value = 'off';
doc.getElementById('coords-select').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('coordinates can be switched off', board.querySelectorAll('.coord').length === 0);
doc.getElementById('theme-select').value = 'wood';
doc.getElementById('theme-select').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('the board theme switches',
  doc.documentElement.style.getPropertyValue('--light-sq') === '#f0d9b5',
  doc.documentElement.style.getPropertyValue('--light-sq'));

check('no runtime errors were reported', errors.length === 0, errors.join('; '));

dom.window.close();
console.log(fails === 0 ? '\nAPP OK' : `\nAPP FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);