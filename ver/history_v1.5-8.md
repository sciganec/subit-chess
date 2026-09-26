# SUBIT-CHESS v1.9 — підсумок дослідження та код

## Частина 1. Що ми встановили за 30+ ітерацій

### 1.1 Еволюція архітектури

| Версія | Ключова зміна | Результат |
|---|---|---|
| v1.5 | ELO-база | delta, aspiration, SEE-lite |
| v1.6.2 | LMP-aware | анти-подвійне різання з LMR |
| v1.7 | In-place, Zobrist, kingPos | **perft(4)=197281** |
| v1.7.1 | Worker fallback, EP-guard | стабільний runtime |
| v1.8 | 13-компонентна eval | +100..150 ELO базі |
| v1.8.3 | S₀=I×Z×Φ | замість WHO/WHERE/WHEN |
| v1.8.5 | Teacher telemetry v3 | V_teacher batch pipeline |
| v1.8.6 | Endgame fix | eval=+10, sym=0 |
| v1.8.7 | Telemetry safeguards | droppedRaw, snapshot, Jaccard |
| v1.8.8 | Z-fix ≥3 | QUEENSIDE rate ×3.2 |
| 48-cells | QUEENSIDE → GLOBAL | унімодально, dead end |

### 1.2 Діагностика S₀ (48-cell run, 6548 FENs)

**Що працює:**
- visited 41/48 (85%)
- H = 4.063 bits
- droppedRaw = 0
- signal cells = 8 з t-stat 2.0–18.4

**Що не працює:**
- **KING = 0/11 signal** (η²=0.5%, merge safe — але merge вбиває CENTER)
- QUEENSIDE та queensideTension — унімодальні, threshold-tuning вичерпано
- Extrapolation 64→48→32 дає signal 10→8→~6, rate плоский ~19%

### 1.3 Ключове відкриття

**Coarsening не підвищує signal rate.** Він пропорційно ріже і сигнал, і шум. Рішення 48→32 — це **прогноз signal ~6 проти gate 15**. Не пройде.

**8 signal cells при n=3929 — це вже достатньо для ρ_s.** 8 × 4 dims = 32 params на 6548 transitions = **205 samples/param** — краще ніж планувалось для 22 клітин (74 samples/param).

### 1.4 Гіпотеза v1.9

> ρ_s (policy vector) на 8 signal cells з 4 dims дає вимірюваний Elo приріст проти frozen baseline, і цей приріст не залежить від подальшого coarsening.

Це перша версія, де **правило пошуку** (не лише ваги eval) залежить від морфологічного контексту.

---

## Частина 2. Архітектура v1.9

```
ρ_s = (d_base, lmr_mult, null_enabled, futility_mult)
       -1/0/+1/+2    -1/0/+1     T/F         -1/0/+1
```

**8 активних клітин (з 48-cell run):**

| Cell | n | t | d_base | lmr_mult | null_enabled | futility_mult |
|---|---:|---:|---:|---:|:---:|---:|
| `QUIET\|CENTER\|OPENING` | 1370 | 18.44 | +1 | 0 | T | 0 |
| `QUIET\|CENTER\|MIDDLEGAME` | 871 | 2.01 | 0 | 0 | T | 0 |
| `QUIET\|GLOBAL\|MIDDLEGAME` | 727 | 3.07 | 0 | +1 | T | 0 |
| `PRESSURE\|CENTER\|OPENING` | 510 | 8.25 | +1 | −1 | T | 0 |
| `DEFENCE\|CENTER\|TACTICAL` | 194 | 2.61 | 0 | 0 | **F** | +1 |
| `QUIET\|CENTER\|TACTICAL` | 128 | 2.07 | 0 | −1 | **F** | +1 |
| `QUIET\|GLOBAL\|OPENING` | 86 | 2.73 | +1 | 0 | T | 0 |
| `QUIET\|CENTER\|ENDGAME` | 43 | 3.98 | +2 | +1 | **F** | 0 |

**Логіка кожної колонки:**
- `d_base`: +1 якщо відкрита фаза (OPENING) або великий |t| (>8). +2 для ENDGAME — точність критична.
- `lmr_mult`: −1 для тактики/тиску (агресивніша редукція менш потрібна). +1 для глобальних/ендшпіль (обережніше).
- `null_enabled`: F для TACTICAL/ENDGAME — zugzwang ризик.
- `futility_mult`: +1 при високій варіативності (DEFENCE/TACTICAL).

**Решта 40 клітин — baseline** `(0, 0, T, 0)`, тобто поведінка ідентична v1.8.8.

---

## Частина 3. Код — drop-in sections

Нижче — **заміни секцій** у файлі v1.8.8 (48-cells). Решта 90% коду не змінюється.

### 3.1 `makeSubitModule` — замінити повністю

```js
function makeSubitModule(chess){
var WHO_LIST = ['ATTACK','PRESSURE','DEFENCE','QUIET'];
var WHERE_LIST = ['KING','CENTER','GLOBAL'];
var WHEN_LIST = ['OPENING','MIDDLEGAME','TACTICAL','ENDGAME'];
var GRAMMAR_BASE = {material:1, positional:1, mobility:1, king:1, pawns:1, bishop:1};
var W_KEYS = ['material','positional','mobility','king','pawns','bishop'];

/* ============================================================
   v1.9: Policy vector ρ_s
   8 active cells — signal cells з 48-cell run (6548 FENs)
   Решта 40 — baseline (0,0,true,0)
   ============================================================ */
var ACTIVE_POLICY = {
  'QUIET|CENTER|OPENING':      {d_base:+1, lmr_mult: 0, null_enabled:true,  futility_mult: 0},
  'QUIET|CENTER|MIDDLEGAME':   {d_base: 0, lmr_mult: 0, null_enabled:true,  futility_mult: 0},
  'QUIET|GLOBAL|MIDDLEGAME':   {d_base: 0, lmr_mult:+1, null_enabled:true,  futility_mult: 0},
  'PRESSURE|CENTER|OPENING':   {d_base:+1, lmr_mult:-1, null_enabled:true,  futility_mult: 0},
  'DEFENCE|CENTER|TACTICAL':   {d_base: 0, lmr_mult: 0, null_enabled:false, futility_mult:+1},
  'QUIET|CENTER|TACTICAL':     {d_base: 0, lmr_mult:-1, null_enabled:false, futility_mult:+1},
  'QUIET|GLOBAL|OPENING':      {d_base:+1, lmr_mult: 0, null_enabled:true,  futility_mult: 0},
  'QUIET|CENTER|ENDGAME':      {d_base:+2, lmr_mult:+1, null_enabled:false, futility_mult: 0}
};
var BASELINE_POLICY = {d_base:0, lmr_mult:0, null_enabled:true, futility_mult:0};

function policyForS(s){
  var key = keyOfS(s);
  var p = ACTIVE_POLICY[key];
  if (!p) return {d_base:0, lmr_mult:0, null_enabled:true, futility_mult:0};
  return {d_base:p.d_base, lmr_mult:p.lmr_mult, null_enabled:p.null_enabled, futility_mult:p.futility_mult};
}

function makeCellWeights(who, where, when){
var w = {material:1, positional:1, mobility:1, king:1, pawns:1, bishop:1};
if (who === 'ATTACK'){ w.king *= 1.25; w.material *= 1.10; w.positional *= 0.95; }
else if (who === 'PRESSURE'){ w.mobility *= 1.15; w.positional *= 1.10; }
else if (who === 'DEFENCE'){ w.king *= 1.15; w.pawns *= 1.10; w.material *= 0.95; }
if (where === 'KING'){ w.king *= 1.20; w.mobility *= 1.05; }
else if (where === 'CENTER'){ w.mobility *= 1.15; w.positional *= 1.10; }
else if (where === 'GLOBAL'){ w.positional *= 1.05; }
if (when === 'OPENING'){ w.mobility *= 1.10; w.material *= 0.90; }
else if (when === 'TACTICAL'){ w.king *= 1.15; w.mobility *= 1.10; }
else if (when === 'ENDGAME'){ w.pawns *= 1.20; w.king *= 1.15; w.material *= 1.05; }
return w;
}
function clampWeights(w){
for (var i=0;i<W_KEYS.length;i++) w[W_KEYS[i]] = Math.max(0.40, Math.min(1.80, w[W_KEYS[i]]));
}
function keyOfS(s){ return s.who + '|' + s.where + '|' + s.when; }
function morphKey(sb, sa){ return keyOfS(sb) + '->' + keyOfS(sa); }

function extensionBudgetForS(s){
var b = 2;
if (s.who === 'ATTACK') b += 2;
else if (s.who === 'PRESSURE') b += 1;
if (s.where === 'KING') b += 1;
else if (s.where === 'GLOBAL') b -= 1;
if (s.when === 'TACTICAL') b += 2;
else if (s.when === 'ENDGAME') b -= 1;
return Math.max(2, Math.min(6, b));
}
function lmrThresholdForS(s){
var t = 4;
if (s.who === 'ATTACK') t += 1;
else if (s.who === 'DEFENCE' || s.who === 'QUIET') t -= 1;
if (s.where === 'KING' || s.where === 'CENTER') t += 1;
else if (s.where === 'GLOBAL') t -= 1;
if (s.when === 'TACTICAL') t += 1;
else if (s.when === 'ENDGAME') t -= 1;
return Math.max(3, Math.min(6, t));
}
function extensionBudgetFor(pos){ return extensionBudgetForS(computeS(pos)); }
function lmrThresholdFor(pos){ return lmrThresholdForS(computeS(pos)); }
function timeBudgetForS(s, remainingSeconds){
var base = remainingSeconds * 1000 / 30;
if (s.who === 'ATTACK') base *= 1.5;
if (s.who === 'DEFENCE' || s.when === 'ENDGAME') base *= 0.6;
return Math.max(400, Math.min(6000, base));
}

/* ... решта функцій countLegalChecks, hangingValueFor, kingZoneAttack,
       enemyPawnConfrontations, flankPawnDiff, tacticalVolatility,
       totalNonKingMaterial, majorCount, computeS — без змін ... */

function classifyOmegaSearch(history){
if (history.length < 2) return 'STABLE';
var diffs = [];
for (var i=1;i<history.length;i++) diffs.push(history[i] - history[i-1]);
var mean = 0;
for (var j=0;j<diffs.length;j++) mean += diffs[j];
mean /= diffs.length;
var variance = 0;
for (var k=0;k<diffs.length;k++) variance += Math.pow(diffs[k]-mean, 2);
variance /= diffs.length;
var sign = 0;
for (var s=1;s<diffs.length;s++) if (diffs[s]*diffs[s-1] < 0) sign++;
var osc = diffs.length > 1 ? sign/(diffs.length-1) : 0;
if (variance < 200 && Math.abs(mean) < 30) return 'STABLE';
if (osc > 0.5) return 'CYCLIC';
if (variance > 1500) return 'CHAOTIC';
return 'METASTABLE';
}

function SubitState(opts){
opts = opts || {};
this.variant = opts.variant || 'subit';
this.omegaMode = opts.omegaMode || 'full';
this.resourceBudgetEnabled = true;
this.regularizationEnabled = true;
this.policyEnabled = true;   // v1.9
this.grammarCells = {};
for (var wi=0; wi<WHO_LIST.length; wi++)
for (var hi=0; hi<WHERE_LIST.length; hi++)
for (var ti=0; ti<WHEN_LIST.length; ti++){
var key = WHO_LIST[wi]+'|'+WHERE_LIST[hi]+'|'+WHEN_LIST[ti];
this.grammarCells[key] = {
weights: makeCellWeights(WHO_LIST[wi], WHERE_LIST[hi], WHEN_LIST[ti]),
rho: 'STABLE', streak: 1, visits: 0, log: []
};
}
this.morphisms = new Map();
this.composedMorphisms = new Map();
this.visitedObjects = {};
this.visitedCount = 0;
this.posCounts = new Map();
this.lastOmega = null;
this.lastSearchHistory = null;
this.lastMorphism = null;
this.movesSinceComposition = 0;
this.projWho = {}; this.projWhere = {}; this.projWhen = {}; this.consensusCache = {};
this.rebuildNaturalTransformations();
}
SubitState.prototype.resetGame = function(){ this.posCounts = new Map(); };
SubitState.prototype.resetGrammarToBaseline = function(){
this.grammarCells = {};
for (var wi=0; wi<WHO_LIST.length; wi++)
for (var hi=0; hi<WHERE_LIST.length; hi++)
for (var ti=0; ti<WHEN_LIST.length; ti++){
var key = WHO_LIST[wi]+'|'+WHERE_LIST[hi]+'|'+WHEN_LIST[ti];
this.grammarCells[key] = {
weights: makeCellWeights(WHO_LIST[wi], WHERE_LIST[hi], WHEN_LIST[ti]),
rho: 'STABLE', streak: 1, visits: 0, log: []
};
}
this.morphisms = new Map();
this.composedMorphisms = new Map();
this.visitedObjects = {};
this.visitedCount = 0;
this.posCounts = new Map();
this.lastOmega = null;
this.lastSearchHistory = null;
this.lastMorphism = null;
this.movesSinceComposition = 0;
this.rebuildNaturalTransformations();
};
SubitState.prototype.weightsFor = function(pos){
if (this.variant === 'classical' || this.variant === 'belnap') return {material:1, positional:1, mobility:1, king:1, pawns:1, bishop:1};
var s = computeS(pos);
var w = this.grammarCells[keyOfS(s)].weights;
return {material:w.material, positional:w.positional, mobility:w.mobility, king:w.king, pawns:w.pawns, bishop:w.bishop};
};
/* v1.9: policy accessor */
SubitState.prototype.policyFor = function(pos){
if (!this.policyEnabled) return BASELINE_POLICY;
if (this.variant === 'classical' || this.variant === 'belnap') return BASELINE_POLICY;
var s = computeS(pos);
return policyForS(s);
};
SubitState.prototype.extensionBudgetFor = function(pos){
if (this.variant === 'classical' || this.variant === 'belnap') return 4;
if (!this.resourceBudgetEnabled) return 4;
return extensionBudgetFor(pos);
};
SubitState.prototype.lmrThresholdFor = function(pos){
if (this.variant === 'classical' || this.variant === 'belnap') return 4;
if (!this.resourceBudgetEnabled) return 4;
return lmrThresholdFor(pos);
};
SubitState.prototype.timeBudgetFor = function(pos, remainingSeconds){
if (this.variant === 'classical' || this.variant === 'belnap'){
return Math.max(400, Math.min(6000, remainingSeconds * 1000 / 30));
}
var s = computeS(pos);
return timeBudgetForS(s, remainingSeconds);
};
SubitState.prototype.recordSelfMove = function(posBefore, posAfter, move, moverColor){
if (this.variant === 'classical' || this.variant === 'belnap') return;
var evalBefore = chess.evalWhiteObjective(posBefore);
var evalAfter = chess.evalWhiteObjective(posAfter);
var delta = evalAfter - evalBefore;
var outcome = (moverColor === 'w' ? +1 : -1) * delta;
this.recordMove(posBefore, posAfter, move, outcome);
};
/* ... recordMove, classifyGameOmega, metaEvolveRho, nudgeCellWeights,
       categoricalLearn, recordDirectMorphism, morphismConfidence,
       propagateWeights, buildCompositions, rebuildNaturalTransformations,
       naturalityDefect, regularizeTowardConsensus, omegaToSearchParams — без змін ... */

return {
WHO_LIST: WHO_LIST, WHERE_LIST: WHERE_LIST, WHEN_LIST: WHEN_LIST,
GRAMMAR_BASE: GRAMMAR_BASE, W_KEYS: W_KEYS,
ACTIVE_POLICY: ACTIVE_POLICY, BASELINE_POLICY: BASELINE_POLICY,
makeCellWeights: makeCellWeights, clampWeights: clampWeights,
keyOfS: keyOfS, morphKey: morphKey,
computeS: computeS, classifyOmegaSearch: classifyOmegaSearch,
extensionBudgetForS: extensionBudgetForS,
lmrThresholdForS: lmrThresholdForS,
timeBudgetForS: timeBudgetForS,
extensionBudgetFor: extensionBudgetFor,
lmrThresholdFor: lmrThresholdFor,
policyForS: policyForS,
SubitState: SubitState
};
}
```

### 3.2 `makeSearchModule` — патч 3 місця

**Знайти (у `createSearch`, на початку):**
```js
var extBudget = (typeof opts.extBudget === 'number') ? opts.extBudget : 4;
var lmrThreshold = (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4;
var lmrThreshold2 = lmrThreshold + 4;
```

**Замінити на:**
```js
var extBudget = (typeof opts.extBudget === 'number') ? opts.extBudget : 4;
var lmrThresholdBase = (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4;
/* v1.9: policy adjustments */
var policyLmrMult    = (typeof opts.policyLmrMult === 'number') ? opts.policyLmrMult : 0;
var policyNullEnable = (typeof opts.policyNullEnable === 'boolean') ? opts.policyNullEnable : true;
var policyFutility   = (typeof opts.policyFutility === 'number') ? opts.policyFutility : 0;
var lmrThreshold  = Math.max(2, Math.min(8, lmrThresholdBase - policyLmrMult));
var lmrThreshold2 = lmrThreshold + 4;
var futilityShift = policyFutility * 100;
```

**Знайти (у `alphaBeta`, null-move блок):**
```js
if (allowNull !== false && depth >= 3 && !inCheck && hasNonPawnMaterial(pos, pos.turn) && (beta - alpha) === 1){
```

**Замінити на:**
```js
if (allowNull !== false && policyNullEnable && depth >= 3 && !inCheck && hasNonPawnMaterial(pos, pos.turn) && (beta - alpha) === 1){
```

**Знайти (у `alphaBeta`, futility):**
```js
var futilityMargin = (depth === 1) ? FUTILITY_MARGIN_D1 : FUTILITY_MARGIN_D2;
```

**Замінити на:**
```js
var futilityMargin = ((depth === 1) ? FUTILITY_MARGIN_D1 : FUTILITY_MARGIN_D2) + futilityShift;
```

**Знайти (у `return`):**
```js
getExtBudget: function(){ return extBudget; },
getLmrThreshold: function(){ return lmrThreshold; }
```

**Замінити на:**
```js
getExtBudget: function(){ return extBudget; },
getLmrThreshold: function(){ return lmrThresholdBase; },
getLmrThresholdEffective: function(){ return lmrThreshold; },
getPolicy: function(){ return {lmrMult: policyLmrMult, nullEnable: policyNullEnable, futility: policyFutility}; }
```

### 3.3 Worker wrapper — передати policy у пошук

**Знайти (у `createSearchWorker`, у `workerSrc`):**
```js
'    var s = __search.createSearch(data.weights, {',
'      maxNodes: data.maxNodes || 2000000,',
'      repeatPenalty: data.repeatPenalty || 0,',
'      widenQuiescence: !!data.widenQuiescence,',
'      extBudget: (typeof data.extBudget === "number") ? data.extBudget : 4,',
'      lmrThreshold: (typeof data.lmrThreshold === "number") ? data.lmrThreshold : 4',
'    });',
```

**Замінити на:**
```js
'    var s = __search.createSearch(data.weights, {',
'      maxNodes: data.maxNodes || 2000000,',
'      repeatPenalty: data.repeatPenalty || 0,',
'      widenQuiescence: !!data.widenQuiescence,',
'      extBudget: (typeof data.extBudget === "number") ? data.extBudget : 4,',
'      lmrThreshold: (typeof data.lmrThreshold === "number") ? data.lmrThreshold : 4,',
'      policyLmrMult: (typeof data.policyLmrMult === "number") ? data.policyLmrMult : 0,',
'      policyNullEnable: (typeof data.policyNullEnable === "boolean") ? data.policyNullEnable : true,',
'      policyFutility: (typeof data.policyFutility === "number") ? data.policyFutility : 0',
'    });',
```

### 3.4 `searchAsync` — патч main-thread + postMessage

**Знайти (main-thread fallback у `searchAsync`):**
```js
const s = searchMod.createSearch(weights, {
maxNodes: opts.maxNodes || 2000000,
repeatPenalty: opts.repeatPenalty || 0,
widenQuiescence: !!opts.widenQuiescence,
extBudget: (typeof opts.extBudget === 'number') ? opts.extBudget : 4,
lmrThreshold: (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4
});
```

**Замінити на:**
```js
const s = searchMod.createSearch(weights, {
maxNodes: opts.maxNodes || 2000000,
repeatPenalty: opts.repeatPenalty || 0,
widenQuiescence: !!opts.widenQuiescence,
extBudget: (typeof opts.extBudget === 'number') ? opts.extBudget : 4,
lmrThreshold: (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4,
policyLmrMult: (typeof opts.policyLmrMult === 'number') ? opts.policyLmrMult : 0,
policyNullEnable: (typeof opts.policyNullEnable === 'boolean') ? opts.policyNullEnable : true,
policyFutility: (typeof opts.policyFutility === 'number') ? opts.policyFutility : 0
});
```

**Знайти (у `postMessage`):**
```js
searchWorker.postMessage({
id: id, pos: pos, depth: depth, weights: weights,
maxNodes: opts.maxNodes,
repeatPenalty: opts.repeatPenalty || 0,
widenQuiescence: !!opts.widenQuiescence,
earlyStop: !!opts.earlyStop,
positionHistory: posHistoryArr,
timeLimit: opts.timeLimit || 0,
extBudget: (typeof opts.extBudget === 'number') ? opts.extBudget : 4,
lmrThreshold: (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4
});
```

**Замінити на:**
```js
searchWorker.postMessage({
id: id, pos: pos, depth: depth, weights: weights,
maxNodes: opts.maxNodes,
repeatPenalty: opts.repeatPenalty || 0,
widenQuiescence: !!opts.widenQuiescence,
earlyStop: !!opts.earlyStop,
positionHistory: posHistoryArr,
timeLimit: opts.timeLimit || 0,
extBudget: (typeof opts.extBudget === 'number') ? opts.extBudget : 4,
lmrThreshold: (typeof opts.lmrThreshold === 'number') ? opts.lmrThreshold : 4,
policyLmrMult: (typeof opts.policyLmrMult === 'number') ? opts.policyLmrMult : 0,
policyNullEnable: (typeof opts.policyNullEnable === 'boolean') ? opts.policyNullEnable : true,
policyFutility: (typeof opts.policyFutility === 'number') ? opts.policyFutility : 0
});
```

### 3.5 `engineMove` — витягти policy та передати

**Знайти:**
```js
const extBudget = subitState.extensionBudgetFor(state.pos);
const lmrThreshold = subitState.lmrThresholdFor(state.pos);
const remainingSeconds = state.clockB;
const timeBudget = subitState.timeBudgetFor(state.pos, remainingSeconds);

state.lastExtBudget = subitState.resourceBudgetEnabled ? extBudget : null;
state.lastLmrThreshold = subitState.resourceBudgetEnabled ? lmrThreshold : null;
state.lastTimeBudget = timeBudget;
```

**Замінити на:**
```js
const extBudget = subitState.extensionBudgetFor(state.pos);
const lmrThreshold = subitState.lmrThresholdFor(state.pos);
const policy = subitState.policyFor(state.pos);   // v1.9
const remainingSeconds = state.clockB;
const timeBudget = subitState.timeBudgetFor(state.pos, remainingSeconds);

state.lastExtBudget = subitState.resourceBudgetEnabled ? extBudget : null;
state.lastLmrThreshold = subitState.resourceBudgetEnabled ? lmrThreshold : null;
state.lastTimeBudget = timeBudget;
state.lastPolicy = policy;
const effectiveDepth = depth + policy.d_base;   // v1.9
```

**Знайти (у `searchAsync` виклику):**
```js
result = await searchAsync(posSnapshot, depth, weights, {
earlyStop: true,
positionHistory: subitState.posCounts,
repeatPenalty: omegaParams.repeatPenalty,
widenQuiescence: omegaParams.widenQuiescence,
extBudget: subitState.resourceBudgetEnabled ? extBudget : 4,
lmrThreshold: subitState.resourceBudgetEnabled ? lmrThreshold : 4,
timeLimit: timeBudget
});
```

**Замінити на:**
```js
result = await searchAsync(posSnapshot, effectiveDepth, weights, {
earlyStop: true,
positionHistory: subitState.posCounts,
repeatPenalty: omegaParams.repeatPenalty,
widenQuiescence: omegaParams.widenQuiescence,
extBudget: subitState.resourceBudgetEnabled ? extBudget : 4,
lmrThreshold: subitState.resourceBudgetEnabled ? lmrThreshold : 4,
policyLmrMult: policy.lmr_mult,
policyNullEnable: policy.null_enabled,
policyFutility: policy.futility_mult,
timeLimit: timeBudget
});
```

**Знайти (у statusExtra):**
```js
statusExtra += ' · ext-' + (subitState.resourceBudgetEnabled ? extBudget : '—') + ' · lmr-' + (subitState.resourceBudgetEnabled ? lmrThreshold : '—');
```

**Замінити на:**
```js
statusExtra += ' · ext-' + (subitState.resourceBudgetEnabled ? extBudget : '—')
             + ' · lmr-' + (subitState.resourceBudgetEnabled ? lmrThreshold : '—')
             + ' · ρ(d' + policy.d_base + ',L' + policy.lmr_mult + ',N' + (policy.null_enabled?'1':'0') + ',F' + policy.futility_mult + ')';
```

### 3.6 `selfPlayDriver` — той самий патч

**Знайти:**
```js
var r = await searchAsync(pos, depth, weights, {
extBudget: extB, lmrThreshold: lmrT, earlyStop: true,
positionHistory: posCounts
});
```

**Замінити на:**
```js
var policy = subitState.policyFor(pos);
var r = await searchAsync(pos, depth + policy.d_base, weights, {
extBudget: extB, lmrThreshold: lmrT, earlyStop: true,
positionHistory: posCounts,
policyLmrMult: policy.lmr_mult,
policyNullEnable: policy.null_enabled,
policyFutility: policy.futility_mult
});
```

### 3.7 `runCompare` — варіант з ρ_s

**Знайти (масив `rows` в `runCompare`):**
```js
const rows = [
['Classical', results.classical, 'Скалярна оцінка'],
['Belnap-only', results.belnap, 'Belnap + f_S'],
['SUBIT-64', results.subit, 'S + Ω + budget']
];
```

**Замінити на:**
```js
const subitPolicy = subitState.policyFor(startPos);
const rows = [
['Classical', results.classical, 'Скалярна оцінка'],
['Belnap-only', results.belnap, 'Belnap + f_S'],
['SUBIT-64', results.subit, 'S + Ω + budget + ρ_s']
];
```

**Знайти (у `searchAsync` для rSubit):**
```js
searchAsync(startPos, omegaParams.depth, subitWeights, {
earlyStop: true, repeatPenalty: omegaParams.repeatPenalty, widenQuiescence: omegaParams.widenQuiescence,
extBudget: subitState.resourceBudgetEnabled ? extB : 4,
lmrThreshold: subitState.resourceBudgetEnabled ? lmrT : 4
})
```

**Замінити на:**
```js
searchAsync(startPos, omegaParams.depth + subitPolicy.d_base, subitWeights, {
earlyStop: true, repeatPenalty: omegaParams.repeatPenalty, widenQuiescence: omegaParams.widenQuiescence,
extBudget: subitState.resourceBudgetEnabled ? extB : 4,
lmrThreshold: subitState.resourceBudgetEnabled ? lmrT : 4,
policyLmrMult: subitPolicy.lmr_mult,
policyNullEnable: subitPolicy.null_enabled,
policyFutility: subitPolicy.futility_mult
})
```

**Знайти (у summary):**
```js
html += 'Ω(SUBIT) = <strong>' + results.subit.omega + '</strong>.';
```

**Замістити на:**
```js
html += 'Ω = <strong>' + results.subit.omega + '</strong>. ';
html += 'ρ_s = (d' + subitPolicy.d_base + ', L' + subitPolicy.lmr_mult + ', N' + (subitPolicy.null_enabled?'1':'0') + ', F' + subitPolicy.futility_mult + ').';
```

### 3.8 Version bumps + API

**Знайти (у `.logo h1` і `<title>`):**
```
SUBIT-CHESS v1.8.7
```
**Замінити на:**
```
SUBIT-CHESS v1.9
```

**Знайти (у `init()`):**
```js
var ENGINE_VERSION = '1.8.7';
```
**Замінити на:**
```js
var ENGINE_VERSION = '1.9';
```

**Знайти (у `state`):**
```js
lastTimeBudget: null,
```
**Додати після:**
```js
lastPolicy: null,
```

**Знайти (у `window.__subit`):**
```js
engineVersion: ENGINE_VERSION,
```
**Додати після:**
```js
policyFor: function(fen){
  var p = fen ? chess.fromFEN(fen) : state.pos;
  return subitState.policyFor(p);
},
activePolicyList: function(){
  var keys = Object.keys(subit.ACTIVE_POLICY);
  console.log('=== Active policy cells (8) ===');
  for (var i=0; i<keys.length; i++){
    var k = keys[i];
    var p = subit.ACTIVE_POLICY[k];
    console.log('  ' + k.padEnd(30) + '  ρ=(d' + p.d_base + ', L' + p.lmr_mult + ', N' + (p.null_enabled?'1':'0') + ', F' + p.futility_mult + ')');
  }
  return keys;
},
setPolicyEnabled: function(v){
  subitState.policyEnabled = !!v;
  console.log('[SUBIT] policyEnabled =', subitState.policyEnabled);
},
```

### 3.9 Help modal — оновлення

**Знайти у help-modal `<h4>Що нового у v1.8.7</h4>`** і замінити весь блок `<ul>` на:

```html
<h4>Що нового у v1.9</h4>
<ul>
<li><strong>Policy vector ρ_s:</strong> 8 активних клітин керують правилом пошуку через (d_base, lmr_mult, null_enabled, futility_mult).</li>
<li><strong>d_base ∈ [-1, +2]:</strong> корекція глибини для конкретного S.</li>
<li><strong>lmr_mult ∈ [-1, +1]:</strong> зсув LMR-порогу (вищий = менш агресивна редукція).</li>
<li><strong>null_enabled:</strong> вимкнення null-move для zugzwang-ризикованих клітин (TACTICAL, ENDGAME).</li>
<li><strong>futility_mult ∈ [-1, +1]:</strong> зсув futility margin на ±100 cp.</li>
<li><strong>Toggle:</strong> <code>__subit.setPolicyEnabled(false)</code> вимикає ρ_s → behavior v1.8.8.</li>
</ul>

<h4>Активні клітини (8 з 48)</h4>
<table>
<tr><th>Cell</th><th>n</th><th>ρ_s</th></tr>
<tr><td>QUIET|CENTER|OPENING</td><td>1370</td><td>(+1, 0, T, 0)</td></tr>
<tr><td>QUIET|CENTER|MIDDLEGAME</td><td>871</td><td>(0, 0, T, 0)</td></tr>
<tr><td>QUIET|GLOBAL|MIDDLEGAME</td><td>727</td><td>(0, +1, T, 0)</td></tr>
<tr><td>PRESSURE|CENTER|OPENING</td><td>510</td><td>(+1, −1, T, 0)</td></tr>
<tr><td>DEFENCE|CENTER|TACTICAL</td><td>194</td><td>(0, 0, F, +1)</td></tr>
<tr><td>QUIET|CENTER|TACTICAL</td><td>128</td><td>(0, −1, F, +1)</td></tr>
<tr><td>QUIET|GLOBAL|OPENING</td><td>86</td><td>(+1, 0, T, 0)</td></tr>
<tr><td>QUIET|CENTER|ENDGAME</td><td>43</td><td>(+2, +1, F, 0)</td></tr>
</table>
```

---

## Частина 4. Pre-registered для v1.9

### 4.1 Перший прогін (50 games × 2 seed, без learning)

```js
__subit.setPolicyEnabled(true);
__subit.teacherClear();
__subit.telemetryClear();
await __subit.selfPlay(50, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
__subit.teacherReport();
```

**Що міряти:**
- Чи дійсно ρ_s активується (у `statusExtra` буде `ρ(d1,L0,N1,F0)` при S=QUIET|CENTER|OPENING)
- Чи drop=0

### 4.2 A/B match — головний тест

**Runner v2.1 + додати `--policy` flag у cstep-runner.js:**

Патч у `loadEngine` (передати `policyEnabled`):
```js
src += '\n;globalThis.__SUBIT_ENGINE_EXPORT__ = {'
     + '  chess, subit, searchMod, telemetry, teacherTelemetry,'
     + '  makeChessModule, makeSubitModule, makeSearchModule,'
     + '  makeTelemetryModule, makeTeacherTelemetryModule'
     + '};';
```

Після `const E = loadEngine(opt.html);`:
```js
if (opt.policy === 'off'){
  E.subitState.policyEnabled = false;
  console.log('[runner] policy disabled (baseline mode)');
}
```

Додати до args:
```js
policy: ARGS.policy || 'on',
```

**Матч (200 games):**
```bash
# Baseline (ρ_s off)
node subit-cstep-runner.js --name v18-base --seed 200001 \
  --games 200 --self-depth 2 --max-plies 100 \
  --policy off --skip-teacher

# ρ_s on
node subit-cstep-runner.js --name v19-policy --seed 200001 \
  --games 200 --self-depth 2 --max-plies 100 \
  --policy on --skip-teacher
```

**Метрика:** середній reward per transition, розділений по S. Або — якщо є oracle — Elo difference через two-sample test on rewards.

### 4.3 Pre-registered gate для v1.9

| Умова | Дія |
|---|---|
| Δmean reward > +15 cp на активних 8 cells | ρ_s працює → v1.9.1 (online learning) |
| Δmean ∈ [−5, +15] cp | Сигнал слабкий, але не негативний → 200 games, розширити sample |
| Δmean < −5 cp | ρ_s шкодить → policy tuning або rollback |

---

## Частина 5. Що НЕ входить у v1.9

- **Online learning ρ_s** — v1.9.1. Зараз values статичні, похідні від 48-cell telemetry.
- **Розширення до 16–24 клітин** — на паузі. Спочатку перевірити, що ρ_s на 8 дає Elo.
- **Coarsening 48→32** — скасовано. Дані кажуть: rate плоский, 32 дасть signal ~6.
- **NNUE / WASM** — окрема гілка, не наш шлях.

---

## Чеклист застосування

1. Замінити `makeSubitModule` повністю (секція 3.1)
2. Патчі в `makeSearchModule` — 3 місця (3.2)
3. Патч у `createSearchWorker` — 1 місце (3.3)
4. Патчі в `searchAsync` — 2 місця (3.4)
5. Патчі в `engineMove` — 3 місця (3.5)
6. Патч у `selfPlayDriver` — 1 місце (3.6)
7. Патчі в `runCompare` — 3 місця (3.7)
8. Version bumps + API (3.8)
9. Help modal (3.9)

**Перевірка після застосування:**
```js
__subit.policyFor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
// → {d_base:1, lmr_mult:0, null_enabled:true, futility_mult:0}
// (бо S = QUIET|CENTER|OPENING)

__subit.activePolicyList()
// → масив з 8 ключів + таблиця

__subit.setPolicyEnabled(false)
// → baseline mode
```
