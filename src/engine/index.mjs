/**
 * SUBIT-CHESS v3.0.0 — unified pipeline entry point
 *
 * Spec basis: docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART I §1-9
 *
 *   validator → rule engine → canonical state → legal moves / analyser
 *             → structural graph → relational layer → dynamics
 *             → context → tactics → evaluation → potentiality
 *             → plans → causal → search → memory → meta-control
 *
 * The pipeline is explicit and inspectable: every stage is a real object on
 * `Engine`, and `analyze()` returns the state of every stage at once.
 */

import {
  Position, moveToUci, moveToSan, squareName,
  WHITE, BLACK, pieceType, MATERIAL
} from './core.mjs';
import { Percept } from './percept.mjs';
import { Structure, structuralDelta, criticalityVector } from './structure.mjs';
import { computeContext } from './context.mjs';
import { Evaluation, DEFAULT_PARAMS, cloneParams, paramsFromJSON, SVF_COMPONENTS } from './evaluate.mjs';
import { Searcher, TranspositionTable, MoveOrder, MATE, searchBudget } from './search.mjs';
import { generatePlans, describePlans, makePlanOrderer, pareto, PLAN } from './plans.mjs';
import { MetaController, complexityOf, uncertaintyOf, adaptiveDepth, riskOf, RISK_NAME } from './meta.mjs';
import { computeProfile, buildCertificate, U_SYM, U_TYPES } from './uncertainty.mjs';

export const VERSION = '3.0.10';

/* ------------------------------------------------------------------ *
 * Memory — a small, bounded game/analysis history (doc 05 §21)
 * ------------------------------------------------------------------ */

export class Memory {
  constructor(limit = 256) {
    this.limit = limit;
    this.entries = new Map();     // 53-bit key -> { depth, score, move, age }
    this.age = 0;
    this.hits = 0;
    this.misses = 0;
  }

  remember(pos, { depth, score, move }) {
    this.entries.set(pos.ttKey, { depth, score, move, age: ++this.age });
    if (this.entries.size > this.limit) {
      // drop the oldest quarter (deterministic)
      const drop = [];
      for (const [k, v] of this.entries) if (v.age < this.age - this.limit * 0.75) drop.push(k);
      for (const k of drop) this.entries.delete(k);
    }
  }

  lookup(pos) {
    const e = this.entries.get(pos.ttKey);
    if (e) { this.hits++; return e; }
    this.misses++;
    return null;
  }

  clear() { this.entries.clear(); this.age = 0; this.hits = 0; this.misses = 0; }

  summary() {
    const total = this.hits + this.misses;
    return `entries=${this.entries.size} hitRate=${total ? (this.hits / total * 100).toFixed(1) : '0.0'}%`;
  }
}

/* ------------------------------------------------------------------ *
 * Engine
 * ------------------------------------------------------------------ */

export class Engine {
  constructor(params = DEFAULT_PARAMS, opts = {}) {
    this.params = params;
    this.pos = new Position();
    this.opts = Object.assign({
      ttBits: 18,
      usePlans: true,
      useMeta: true,
      evalMode: params.search ? params.search.evalMode : 'fast'
    }, opts);

    this.tt = new TranspositionTable(this.opts.ttBits);
    this.order = new MoveOrder(params);
    this.evaluation = new Evaluation(params, {
      mode: this.opts.evalMode,
      structuralDepth: params.search ? params.search.structuralEvalDepth : 0
    });
    this.searcher = new Searcher(this.evaluation, params, { tt: this.tt, order: this.order });
    this.meta = new MetaController(params);
    this.memory = new Memory();

    this.percept = null;
    this.structure = null;
    this.context = null;
    this.plans = [];
    this.lastAnalysis = null;
    this.lastSearch = null;   // { result, depth, risk } — the last completed search
    this.history = [];      // [{ fen, move, san, score, depth, nodes }]
    // position version for the decision certificate (doc 45 §20.2): every
    // setFEN/play() produces a new version, so a certificate can never be
    // mistaken for one that describes a different position
    this.version = 0;
  }

  /* ---------------- position ---------------- */

  setFEN(fen) {
    this.pos.setFEN(fen);
    this.version++;
    this.percept = new Percept(this.pos);
    this.structure = new Structure(this.pos, this.percept);
    this.context = computeContext(this.pos, this.percept, this.structure);
    this.plans = this.opts.usePlans
      ? generatePlans(this.pos, this.percept, this.structure, null)
      : [];
    return this;
  }

  get fen() { return this.pos.fen(); }

  legalMoves() { return this.pos.legalMoves(); }

  /* ---------------- analysis ---------------- */

  /** Full structural picture: SVF, context, relations, plans, criticality. */
  analyze() {
    if (!this.percept) this.setFEN(this.pos.fen());
    const ev = this.evaluation.structural(this.pos);
    const uncertainty = uncertaintyOf(ev, this.pos, this.percept, this.structure);
    // The panel is labelled Pareto, so it must show the Pareto set; the plans
    // dropped by the filter are reported next to the ones rejected earlier
    // (audit v3.0.6 §7.6)
    const allPlans = this.plans;
    const kept = pareto(allPlans);
    kept.rejected = (allPlans.rejected || []).concat(allPlans.filter((p) => !kept.includes(p)));
    kept.total = allPlans.total;
    const analysis = {
      fen: this.fen,
      turn: this.pos.turn === WHITE ? 'white' : 'black',
      eval: ev.E,
      white: ev.white,
      vector: Object.fromEntries(SVF_COMPONENTS.map((k, i) => [k, Number(ev.vector[i].toFixed(3))])),
      context: this.context.key(),
      tactical: Number(this.context.tactical.toFixed(3)),
      relations: this.structure.countsObject(),
      criticality: criticalityVector(this.structure)
        .slice(0, 8)
        .map((c) => ({ sq: squareName(c.sq), color: c.color === WHITE ? 'w' : 'b', q: Number(c.q.toFixed(3)) })),
      legalMoves: this.pos.legalMoves().length,
      plans: kept,
      // Without a search there is no move-quality risk; report the position's
      // own uncertainty instead of the constant CRITICAL that riskOf(null, 0)
      // returns (audit v3.0.6 §8.1)
      risk: this.lastSearch ? this.lastSearch.risk : RISK_NAME[Math.min(4, Math.round(uncertainty * 4))],
      complexity: complexityOf(this.pos, this.percept, this.structure, this.context),
      uncertainty,
      uncertaintyProfile: this.uncertaintyProfile(null, {}, ev.uncertainty)
    };
    this.lastAnalysis = analysis;
    return analysis;
  }

  /** Depth the meta-controller considers appropriate (no search yet). */
  budget({ clockMs = 0, baseDepth = 8, maxDepth = 24 } = {}) {
    if (!this.percept) this.setFEN(this.pos.fen());
    const ev = this.evaluation.structural(this.pos);
    return this.meta.plan({
      pos: this.pos, percept: this.percept, structure: this.structure, ctx: this.context,
      evaluation: this.evaluation, clockMs, baseDepth, maxDepth
    });
  }

  /** Eight-component uncertainty profile of the current position (doc 37 §5-§6). */
  uncertaintyProfile(result = null, requested = {}, evUncertainty) {
    return computeProfile({
      result, requested, evUncertainty,
      pos: this.pos, percept: this.percept, structure: this.structure,
      ctx: this.context, plans: this.plans,
      evaluation: this.evaluation, evalMode: this.evaluation.opts.mode || 'fast'
    });
  }

  /* ---------------- search ---------------- */

  /**
   * Search the current position. `opts` may carry depth / timeMs / nodes; when
   * omitted the meta-controller picks a budget.
   */
  search(opts = {}) {
    if (!this.percept) this.setFEN(this.pos.fen());
    let plan = null;
    if (this.opts.useMeta && opts.depth === undefined && opts.timeMs === undefined && opts.nodes === undefined) {
      plan = this.meta.plan({
        pos: this.pos, percept: this.percept, structure: this.structure, ctx: this.context,
        evaluation: this.evaluation, clockMs: opts.clockMs || 0,
        baseDepth: opts.baseDepth || 8, maxDepth: opts.maxDepth || 24
      });
    }

    const depth = opts.depth !== undefined ? opts.depth
      : plan ? plan.depth : 8;
    const timeMs = opts.timeMs !== undefined ? opts.timeMs
      : plan ? plan.timeMs : 0;

    // only the meta-controller picks a tier; an explicit user choice (setEvalMode,
    // or the UI writing evaluation.opts.mode) must survive the next search
    if (plan) {
      this.evaluation.opts.mode = plan.evalMode;
      // The plan's tier depth was returned but never applied: the structural
      // fallback kept the constructor value. Keep both fields in sync (Gate 4).
      if (typeof plan.structuralEvalDepth === 'number') {
        this.evaluation.opts.structuralDepth = plan.structuralEvalDepth;
      }
    }

    // The old contextBonus closure returned 0 in both branches while calling
    // ContextProfile.key() for every move of every node (including qsearch).
    // It is removed rather than "implemented": context still feeds scalarize()
    // and uncertainty, and a real ordering term must be measured first (Gate 3).
    this.searcher.contextBonus = null;
    if (this.opts.usePlans && this.plans.length) {
      this.searcher.structuralBonus = makePlanOrderer(this.plans, this.pos.turn);
    } else {
      this.searcher.structuralBonus = null;
    }

    this.searcher.setLimits({ depth, timeMs, nodes: opts.nodes || 0 });
    // Memory is not write-only: a remembered move and score for this position
    // seed the root ordering and the aspiration window (audit v3.0.6 P3.1)
    const remembered = this.memory.lookup(this.pos);
    // the searcher re-reads its limits from the options it is given, so the node
    // budget has to travel with them -- setLimits() alone is silently reset
    const result = this.searcher.search(this.pos, {
      depth, timeMs, nodes: opts.nodes || 0,
      prevBest: remembered ? remembered.move : 0,
      prevScore: remembered ? remembered.score : 0
    });

    const risk = riskOf(result, result.depth);
    this.memory.remember(this.pos, {
      depth: result.depth, score: result.score, move: result.move
    });
    if (plan) this.meta.record(plan, result);

    // uncertainty profile and decision certificate (doc 37 §6, doc 45 §16/§20.2).
    // The profile is reported *next to* the score, never folded into it
    // (UCT-INV-019); it describes what the search did not settle.
    const san = moveToSan(this.pos, result.move);
    const pvSan = this.pvToSan(result.pv);
    const legal = result.move !== 0 && this.pos.legalMoves().includes(result.move);
    const uncertainty = this.uncertaintyProfile(result, { depth });
    const certificate = buildCertificate({
      fen: this.fen, version: this.version, move: result.move, san, legal,
      legalCount: this.pos.legalMoves().length, depth: result.depth,
      completed: result.completed, nodes: result.nodes, pv: pvSan,
      score: result.score, profile: uncertainty,
      paramVersion: VERSION, algorithmVersion: VERSION
    });

    // the analysis panel reports the risk of the last search, not a constant:
    // riskOf(null, 0) is CRITICAL, so `analyze()` always said "critical"
    this.lastSearch = { result, depth, risk: RISK_NAME[risk] };

    return {
      move: result.move,
      uci: moveToUci(result.move),
      san,
      score: result.score,
      scoreSpread: result.scoreSpread,
      secondScore: result.secondScore,
      depth: result.depth,
      seldepth: result.seldepth,
      nodes: result.nodes,
      nps: result.nps,
      timeMs: result.timeMs,
      pv: result.pv.map(moveToUci),
      pvMoves: result.pv,
      pvSan,
      completed: result.completed,
      // bound flag of the iteration behind score/depth (SEARCH-INV-002);
      // 0 = exact, 1 = lower bound, 2 = upper bound
      flag: result.flag,
      risk: RISK_NAME[risk],
      plan: plan ? { depth: plan.depth, timeMs: plan.timeMs, complexity: plan.complexity, uncertainty: plan.uncertainty } : null,
      uncertaintyProfile: uncertainty,
      certificate,
      // sign follows the score: a negative mate score means we get mated
      mate: Math.abs(result.score) > MATE - 1000
        ? Math.sign(result.score) * Math.ceil((MATE - Math.abs(result.score)) / 2)
        : null
    };
  }

  /** SAN for every move of a PV — replayed along the line, not against the root. */
  pvToSan(pv) {
    const p = this.pos.clone();
    const out = [];
    for (const m of pv) {
      if (!p.legalMoves().includes(m)) break;
      out.push(moveToSan(p, m));
      p.makeMove(m);
    }
    return out;
  }

  /** Switch the evaluation tier (fast | structural | hybrid) and keep it. */
  setEvalMode(mode) {
    this.opts.evalMode = mode;
    this.evaluation.opts.mode = mode;
    return this;
  }

  bestMove(opts = {}) {
    const r = this.search(opts);
    return r.move;
  }

  /** Play a move given in UCI form; returns the SAN or null when illegal. */
  play(uci) {
    const target = typeof uci === 'number' ? uci : this.findMoveByUci(uci);
    if (!target || !this.pos.legalMoves().includes(target)) return null;
    const san = moveToSan(this.pos, target);
    const child = this.pos.clone();
    // record the position we are leaving before it changes: without this the
    // repetition stack of the game is empty and threefold can never be seen
    // (Engine.setFEN() rebuilds the position and clears `rep`)
    child.pushRep();
    child.makeMove(target);
    const parentStructure = this.structure;
    const rep = child.rep;
    const repHi = child.repHi;
    const repLimit = child.repLimit;
    this.pos = child;
    this.setFEN(this.fen);
    this.pos.rep = rep;
    this.pos.repHi = repHi;
    this.pos.repLimit = repLimit;
    const delta = parentStructure && this.structure
      ? structuralDelta(parentStructure, this.structure)
      : null;
    this.history.push({ fen: this.fen, uci: moveToUci(target), san, delta });
    return { san, uci: moveToUci(target), delta };
  }

  findMoveByUci(uci) {
    const s = String(uci).toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
    if (s.length < 4) return null;
    for (const m of this.pos.legalMoves()) {
      if (moveToUci(m) === s) return m;
    }
    return null;
  }

  /** Material count on the board (for reports). */
  material() {
    const out = { white: 0, black: 0 };
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = this.pos.board[sq];
      if (!p) continue;
      const t = pieceType(p);
      out[p >> 3 === WHITE ? 'white' : 'black'] += MATERIAL[t];
    }
    return out;
  }

  perft(depth) { return this.pos.perft(depth); }

  /* ---------------- self-play ---------------- */

  /** Play `plies` plies with both sides from the same engine. */
  selfPlay(plies = 40, opts = {}) {
    const line = [];
    const start = this.fen;
    let over = null;
    for (let i = 0; i < plies; i++) {
      const r = this.search(opts);
      line.push(r.uci);
      const played = this.play(r.uci);
      if (!played) { over = { reason: 'illegal move from search' }; break; }
      const st = this.pos.status();
      if (st && st.over) { over = st; break; }
    }
    return { start, line, over, fen: this.fen };
  }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseFenList(text) {
  return text.split('\n')
    .map((l) => l.trim().split(';')[0].trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

export function main(argv = process.argv.slice(2)) {
  const cmd = (argv[0] || 'help').toLowerCase();
  const args = argv.slice(1);
  const out = [];

  switch (cmd) {
    case 'version':
      out.push(`SUBIT-CHESS ${VERSION} (engine core)`);
      break;

    case 'perft': {
      const fen = args[0] || Position.start().fen();
      const depth = Number(args[1] || 4);
      const e = new Engine();
      e.setFEN(fen);
      for (let d = 1; d <= depth; d++) {
        const t0 = Date.now();
        const n = e.perft(d);
        out.push(`d${d}: ${n}  [${Date.now() - t0}ms]`);
      }
      break;
    }

    case 'eval': {
      const e = new Engine();
      e.setFEN(args[0] || Position.start().fen());
      const ev = e.evaluation.structural(e.pos);
      out.push(`E=${ev.E.toFixed(3)}  (white ${ev.white.toFixed(3)})  context=${e.context.key()}`);
      for (let i = 0; i < SVF_COMPONENTS.length; i++) {
        out.push(`  ${SVF_COMPONENTS[i]} = ${ev.vector[i].toFixed(3)}`);
      }
      break;
    }

    case 'analyze': {
      const e = new Engine();
      e.setFEN(args[0] || Position.start().fen());
      const a = e.analyze();
      out.push(`FEN     ${a.fen}`);
      out.push(`eval    ${a.eval.toFixed(3)}   context ${a.context}   tactical ${a.tactical}`);
      out.push(`legal   ${a.legalMoves} moves   complexity ${a.complexity.toFixed(3)}   uncertainty ${a.uncertainty.toFixed(3)}`);
      out.push(`U(P)    ${U_TYPES.map((k) => `${U_SYM[k]}=${a.uncertaintyProfile.vector[U_TYPES.indexOf(k)]}`).join(' ')}  driver ${U_SYM[a.uncertaintyProfile.driver]}`);
      out.push(`SVF     ${SVF_COMPONENTS.map((k) => `${k}=${a.vector[k]}`).join(' ')}`);
      out.push(`relations ${Object.entries(a.relations).map(([k, v]) => `${k}:${v}`).join(' ')}`);
      out.push(`criticality ${a.criticality.map((c) => `${c.sq}${c.color}:${c.q}`).join(' ')}`);
      out.push('plans:');
      out.push(describePlans(a.plans) || '  (none)');
      out.push(`pareto: ${pareto(a.plans).length} of ${a.plans.length}`);
      break;
    }

    case 'search': {
      const fen = args[0] || Position.start().fen();
      const e = new Engine();
      e.setFEN(fen);
      const opts = {};
      if (/^\d+$/.test(args[1] || '')) opts.depth = Number(args[1]);
      else if (args[1] && /^\d+m?$/.test(args[1])) opts.timeMs = parseInt(args[1], 10);
      if (args[2]) opts.nodes = Number(args[2]);
      const r = e.search(opts);
      out.push(`best ${r.uci} (${r.san})  score ${r.score}  depth ${r.depth}/${r.seldepth}  risk ${r.risk}`);
      out.push(`nodes ${r.nodes}  ${r.nps} nps  ${r.timeMs}ms  tt ${e.tt.hits} hits`);
      out.push(`pv  ${r.pvSan.join(' ')}`);
      out.push(`U(P) ${U_TYPES.map((k) => `${U_SYM[k]}=${r.uncertaintyProfile.vector[U_TYPES.indexOf(k)]}`).join(' ')}  driver ${U_SYM[r.uncertaintyProfile.driver]} (${r.uncertaintyProfile.driverValue})`);
      out.push(`cert [${r.certificate.validation_status}] v${r.certificate.position_version} ${r.certificate.legal_validation.legal_moves} legal`);
      if (r.plan) out.push(`plan depth=${r.plan.depth} time=${r.plan.timeMs}ms complexity=${r.plan.complexity.toFixed(3)} uncertainty=${r.plan.uncertainty.toFixed(3)}`);
      out.push(`plans: ${e.plans.length}  ${describePlans(e.plans).split('\n').length - 1} lines`);
      break;
    }

    case 'bench': {
      const e = new Engine();
      const depths = [6, 7, 8];
      const start = Position.start().fen();
      e.setFEN(start);
      let totalNodes = 0;
      const t0 = Date.now();
      for (const d of depths) {
        const r = e.search({ depth: d });
        totalNodes += r.nodes;
        out.push(`startpos d${d}: nodes=${r.nodes} score=${r.score} best=${r.uci}`);
      }
      const dt = Date.now() - t0;
      out.push(`total nodes ${totalNodes} in ${dt}ms -> ${Math.round(totalNodes * 1000 / Math.max(1, dt))} nps`);
      break;
    }

    case 'selfplay': {
      const e = new Engine();
      e.setFEN(args[0] || Position.start().fen());
      const plies = Number(args[1] || 20);
      const depth = Number(args[2] || 5);
      const t0 = Date.now();
      const g = e.selfPlay(plies, { depth });
      out.push(`start ${g.start}`);
      out.push(`line  ${g.line.join(' ')}`);
      out.push(`end   ${g.fen}`);
      out.push(`status ${g.over ? (g.over.reason || g.over.result) : 'ongoing'}  in ${Date.now() - t0}ms`);
      break;
    }

    case 'help':
    default:
      out.push(`SUBIT-CHESS ${VERSION}`);
      out.push('usage: node src/engine/index.mjs <command> [args]');
      out.push('  version');
      out.push('  perft <fen> <depth>');
      out.push('  eval <fen>');
      out.push('  analyze <fen>');
      out.push('  search <fen> [depth|timems] [nodes]');
      out.push('  bench');
      out.push('  selfplay <fen> [plies] [depth]');
      break;
  }

  console.log(out.join('\n'));
  return out;
}

// CLI entry: only when this module is the process entry point. In the browser
// bundle `process` does not exist and the UI drives the engine instead.
const isCli = typeof process !== 'undefined' && Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' && /index\.mjs$/.test(process.argv[1]);
if (isCli) main();
