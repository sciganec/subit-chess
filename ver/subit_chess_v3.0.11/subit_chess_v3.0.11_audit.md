# SUBIT-CHESS v3.0.11 — Повний аудит версії

**Об'єкт аудиту:** `subit_chess_v3.0.11.html`  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Тип аудиту:** статичний forensic code review, архітектурний, алгоритмічний, логічний, шаховий, UI та інтеграційний аудит.

[SUBIT-CHESS v3.0.11 — HTML](https://github.com/sciganec/subit-chess/blob/ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98/ver/subit_chess_v3.0.11/subit_chess_v3.0.11.html?utm_source=chatgpt.com)

---

# 1. Загальний висновок

v3.0.11 є суттєво складнішою архітектурною версією SUBIT-CHESS. Це вже не лише шаховий рушій із функцією оцінювання, а комплексна система, яка об'єднує:

- шаховий стан та його трансформації;
- генерацію легальних ходів;
- позиційне оцінювання;
- пошук Negamax;
- Alpha-Beta;
- Principal Variation Search;
- Iterative Deepening;
- Transposition Table;
- Null-Move Pruning;
- Late Move Reduction;
- Futility Pruning;
- Quiescence Search;
- structural perception;
- structural relations;
- context profile;
- strategic plans;
- meta-controller;
- uncertainty profile;
- decision certificate;
- Worker-based execution;
- UI;
- PGN/FEN.

### Попередня оцінка

| Напрям | Статус |
|---|---|
| Архітектурна цілісність | 🟡 Частково підтверджена |
| Шахова логіка | 🟡 Потребує незалежної верифікації |
| Генерація ходів | 🟡 Потребує тестування |
| FEN validation | 🟡 Виявлено проблеми |
| Search | 🟡 Є потенційні алгоритмічні дефекти |
| Evaluation | 🟠 Виявлено концептуальні та числові проблеми |
| Structural perception | 🟠 Виявлено дефекти представлення |
| Context system | 🟡 Потребує перевірки семантики |
| Meta-controller | ⚪ Потребує окремого аудиту |
| Plans | ⚪ Потребує окремого аудиту |
| Worker | 🟡 Потребує runtime-перевірки |
| UI | 🟡 Є UX/accessibility проблеми |
| Release integrity | ⚪ Не перевірено виконання тестів |
| Загальна готовність | **AUDIT OPEN** |

Це результати аналізу вихідного коду, а не результат запуску тестів. Я не заявляю, що виконав `perft`, tactical suite, browser tests, self-play або benchmark.

---

# 2. Архітектура v3.0.11

У HTML-файл інтегровано практично весь рушій.

## 2.1. Engine Core

Основні структури:

- `Position`
- `AttackMap`
- `Percept`
- `Structure`
- `ContextProfile`
- `Evaluation`
- `Searcher`
- `TranspositionTable`
- `MoveOrder`
- `MetaController`
- `Memory`

Архітектурно це цікаво тим, що рушій працює не з одним монолітним score, а з кількома рівнями представлення позиції.

```text
CHESS POSITION
      │
      ▼
POSITION STATE
      │
      ▼
PERCEPT
      │
      ├── Material
      ├── Mobility
      ├── Attacks
      ├── Defences
      ├── King pressure
      ├── Pawn structure
      └── Tactical features
      │
      ▼
STRUCTURE Ω(P)
      │
      ├── Relations
      ├── Hyperrelations
      ├── Attributes
      ├── Criticality
      └── Fingerprint
      │
      ▼
CONTEXT
      │
      ├── Interaction
      ├── Spatial zone
      ├── Phase
      └── Tactical intensity
      │
      ▼
EVALUATION
      │
      ├── Fast evaluation
      ├── Structural evaluation
      └── Hybrid evaluation
      │
      ▼
SEARCH
      │
      ├── Negamax
      ├── Alpha-Beta
      ├── PVS
      ├── LMR
      ├── Null Move
      ├── Futility
      └── Quiescence
      │
      ▼
MOVE
      │
      ▼
DECISION / CERTIFICATE / UNCERTAINTY
```

### Архітектурна перевага

Система розділяє:

**Шахову реальність позиції**  
і

**Інтерпретацію цієї реальності.**

Це правильний напрямок для SUBIT-CHESS.

Проте в v3.0.11 деякі структурні компоненти ще не є незалежними, точними або достатньо узгодженими зі своїми математичними визначеннями.

---

# 3. AUDIT — FEN Validation

Модуль `validateFEN()` є одним із важливих компонентів безпеки стану.

Він перевіряє:

- кількість рангів;
- ширину рангу;
- допустимі символи;
- наявність обох королів;
- кількість королів;
- розташування пішаків;
- сусідство королів;
- сторону ходу;
- castling rights;
- en passant;
- counters;
- шах короля, який не має ходити.

## 3.1. Позитивні аспекти

Валідація відбувається до зміни позиції:

```js
const check = validateFEN(fen);
if (!check.ok) throw new Error(...);
```

Це дозволяє не завантажувати частково некоректний стан.

Важливо також, що числові поля перевіряються через:

```js
Number.isSafeInteger(value)
```

Це захищає від некоректної інтерпретації надто великих чисел.

---

## AUD-311-01 — FEN допускає шахово неможливі матеріальні конфігурації

### Severity: P1/P2 — залежно від використання

Validator перевіряє кількість королів, але не обмежує загальну кількість фігур відповідно до досяжного шахового стану.

Наприклад, теоретично можна сформувати FEN із:

- 30 білими фігурами;
- 25 чорними фігурами;
- 15 ферзями одного кольору;
- значно більше фігур, ніж можна отримати легальними перетвореннями.

Це має наслідки для внутрішніх структур.

У `Position`:

```js
this.listSq = [
  new Int16Array(40),
  new Int16Array(40)
];
```

Piece lists мають обмежену місткість.

Але validator не встановлює відповідної верхньої межі кількості фігур одного кольору.

`refreshPieces()` записує фігури у typed arrays:

```js
const i = cnt0[c]++;
if (c === 0) l0[i] = sq;
else l1[i] = sq;
```

У позиції, що перевищує місткість, piece list перестає бути повноцінним представленням шахової позиції.

### Наслідки

- пропущені фігури в evaluation;
- неправильна генерація ходів;
- неправильний матеріал;
- некоректна фаза;
- пошкодження derived-state;
- невідповідність board і piece lists.

### Рекомендація

Валідація має розрізняти:

1. FEN syntax;
2. structural validity;
3. шахову досяжність;
4. допустимість composed position.

Не обов'язково забороняти всі шахові композиції, але engine повинен мати явний режим:

```text
STRICT_REACHABLE_POSITION
COMPOSITION_POSITION
ANALYSIS_POSITION
```

І відповідні обмеження місткості.

---

## AUD-311-02 — FEN validator допускає нек canonical rank notation

### Severity: P3

Validator дозволяє деякі синтаксично нестандартні представлення рангів.

Наприклад, кілька adjacent digit tokens можуть утворювати правильну сумарну ширину рангу.

Сумарно 8 клітин може бути правильним, але запис:

```text
11111111
```

не є canonical FEN-представленням восьми пустих клітин.

### Наслідок

Не обов'язково створює шахову помилку, але:

- допускає нестандартний input;
- створює неоднозначність canonical representation;
- ускладнює validation;
- може призводити до відмінностей між FEN input та normalized FEN output.

### Рекомендація

Розділити:

```text
FEN ACCEPTANCE
```

і

```text
FEN CANONICALIZATION
```

---

# 4. AUDIT — Position Core

## 4.1. 0x88 representation

Рушій використовує 0x88 board.

Це добре підходить для:

- швидкого визначення off-board;
- ray traversal;
- knight movement;
- king movement;
- sliding attacks.

Основні компоненти:

```js
board = new Int8Array(128)
```

Індексація:

```js
rank * 16 + file
```

Переваги:

- прості boundary checks;
- відсутність необхідності постійно перевіряти `rank` та `file`;
- прості напрямки руху.

Архітектурно це адекватний вибір.

---

# 5. AUDIT — Legal Move Generation

Механізм побудований у два етапи.

## Pseudo-legal generation

```js
generateMoves()
```

## Legal filtering

```js
legalMoves()
```

Для кожного псевдолегального ходу:

1. виконати `makeMove`;
2. перевірити, чи король власного кольору залишився поза шахом;
3. відновити позицію через `unmakeMove`.

```js
const undo = this.makeMove(m);

if (!this.isAttacked(this.kingSq[us], opposite(us)))
    out.push(m);

this.unmakeMove(undo);
```

Це зрозуміла і надійна модель.

---

## AUD-311-03 — Незалежна перевірка move generator відсутня в рамках цього аудиту

### Severity: P1 — Verification Gap

Під час статичного аналізу не можна підтвердити, що генератор правильно обробляє всі шахові випадки.

Особливо необхідна перевірка:

- pinned pieces;
- discovered check;
- double check;
- en passant у ситуації pin;
- castling через атаковані клітини;
- promotion;
- promotion capture;
- king captures;
- stalemate;
- шахові контрходи;
- рокіровка з відповідними правами.

### Рекомендований незалежний контроль

Не використовувати зовнішній engine як компонент SUBIT-CHESS.

Для перевірки можна застосовувати незалежні математичні тестові позиції та відомі perft-вектори.

```text
MOVE GENERATION

Known position
      │
      ▼
SUBIT legalMoves()
      │
      ▼
Perft
      │
      ▼
Expected node count
      │
      ▼
PASS / FAIL
```

Для цього етапу необхідно фактично запускати:

```text
perft depth 1
perft depth 2
perft depth 3
perft depth 4
```

і перевіряти кожен результат.

---

# 6. AUDIT — Move Encoding

Хід зберігається у packed integer.

```text
bits 0–6    FROM
bits 7–13   TO
bits 14–16  PROMOTION
bits 17–21  FLAGS
```

Це ефективно для:

- move lists;
- TT;
- search;
- PV;
- UCI conversion.

Архітектура виглядає логічно.

Однак окремо потрібно перевірити:

- допустимість некоректних packed moves;
- promotion encoding;
- прапорці;
- restoration після capture;
- restoration після en passant;
- restoration після castle.

---

# 7. AUDIT — Make / Unmake

`makeMove()` підтримує:

- capture;
- en passant;
- promotion;
- castling;
- castling rights;
- en passant state;
- halfmove clock;
- fullmove clock;
- hash;
- king positions;
- repetition boundary.

`unmakeMove()` відновлює:

- board;
- turn;
- castling;
- en passant;
- clocks;
- king positions;
- hash;
- phase material;
- repetition boundary.

Це важлива частина engine, і її не можна оцінювати лише за зовнішньою відповідністю ходів.

---

## AUD-311-04 — Hash restoration потребує differential verification

### Severity: P1 — Verification Gap

У коді hash змінюється incremental:

```js
this.hashLo
this.hashHi
```

А restoration використовує значення із snapshot:

```js
this.hashLo = undo.hashLo;
this.hashHi = undo.hashHi;
```

Це правильний підхід.

Але необхідно перевірити інваріант:

```text
INCREMENTAL HASH
        =
FULL HASH RECOMPUTATION
```

Для кожного типу трансформації:

```text
NORMAL MOVE
CAPTURE
EN PASSANT
PROMOTION
CASTLING
NULL MOVE
UNMAKE
```

Рекомендований тест:

```text
Before move:
H₀ = hash

After move:
H₁ = incrementalHash
H₁' = recomputeHash

Require:
H₁ = H₁'

After unmake:
H₂ = hash
Require:
H₂ = H₀
```

Без такого тесту incremental hashing не можна вважати повністю verified.

---

# 8. AUDIT — Transposition Table

## 8.1. TT

```js
TranspositionTable
```

Містить:

- keys;
- scores;
- depths;
- flags;
- moves;
- ages;
- generations.

Підтримуються:

```text
EXACT
LOWER
UPPER
```

Також є mate-score normalization:

```js
toTT(score, ply)
fromTT(score, ply)
```

Це правильно необхідно для коректного збереження mate-distance scores.

---

## AUD-311-05 — TT key не забезпечує математично гарантованого розділення halfmove buckets

### Severity: P2

`Position.ttKey` комбінує:

- позиційний hash;
- halfmove bucket.

```js
return this.key + bucket * 1048576;
```

Ідея:

```text
0–79
80–99
100–149
150+
```

є правильним напрямком.

Проте additive mixing не гарантує уникнення колізій між buckets.

Це не криптографічна і не injective mapping.

### Проблема

Теоретично:

```text
Position A + bucket 0
```

може мати однаковий numeric key із:

```text
Position B + bucket 1
```

якщо різниця базових keys компенсує bucket offset.

### Наслідок

TT може використовувати score, отриманий у контексті іншого halfmove clock.

### Рекомендація

TT key має формуватися через чітке hash mixing:

```text
POSITION HASH
      │
      ├── Halfmove state
      │
      └── Repetition context
              │
              ▼
        CONTEXTUAL TT KEY
```

Найважливіше — не просто додати bucket, а забезпечити якісне mixing і перевірку контексту.

---

## AUD-311-06 — TT aging може блокувати повторне записування stale entry

### Severity: P2

У `store()`:

```js
if (this.keys[idx] !== key || this.depths[idx] <= depth) {
```

TT_MAX_AGE дорівнює:

```js
const TT_MAX_AGE = 0;
```

Старі entries не допускаються до використання.

Але якщо:

- key той самий;
- попередній entry має більшу depth;
- entry stale;

то `store()` може відмовитися записати новий entry меншої depth.

У такому випадку:

```text
OLD ENTRY
      │
      ▼
STALE
      │
      ▼
Rejected by probe()
      │
      ▼
Still retained by store()
```

### Наслідок

Старий entry може залишатися непридатним для probe, але блокувати актуальний запис.

Це переважно проблема ефективності search, але також може впливати на move ordering.

### Рекомендація

У replacement condition враховувати generation:

```text
Different key
OR
Stale generation
OR
New depth >= old depth
```

---

## AUD-311-07 — TT statistics мають неоднозначну семантику

### Severity: P3

У TT:

```js
this.tt.hits++;
```

виконується для entries, які можуть використовуватися як cutoff.

Але:

```js
this.tt.cutoffs++;
```

збільшується, коли знайдено entry з move, навіть якщо цей entry не виконав cutoff.

Таким чином, назва:

```text
ttCutoffs
```

не обов'язково відповідає реальній кількості cutoffs.

### Рекомендація

Розділити:

```text
TT_PROBE_HITS
TT_SCORE_CUTOFFS
TT_MOVE_ORDERING_HITS
TT_EXACT_HITS
TT_BOUND_HITS
```

Це необхідно для достовірного benchmark.

---

# 9. AUDIT — Search

Search містить:

- Iterative Deepening;
- Negamax;
- Alpha-Beta;
- PVS;
- TT;
- Move Ordering;
- Null-Move Pruning;
- LMR;
- Futility Pruning;
- Quiescence.

Це достатньо повноцінна архітектура класичного chess search.

---

## 9.1. Iterative Deepening

```js
for (let depth = 1; depth <= this.maxDepth; depth++)
```

Переваги:

- попередній best move;
- стабільний пошук;
- поступове збільшення глибини;
- можливість зупинки;
- PV.

Score, depth і PV зберігаються від completed iteration.

Це правильна концепція.

---

## 9.2. PVS

Перший move отримує full window:

```js
score = -this.negamax(...)
```

Наступні moves:

```js
score = -this.negamax(pos, depth - 1, -alpha - 1, -alpha)
```

Якщо move перевищує alpha:

```js
score = -this.negamax(pos, depth - 1, -beta, -alpha)
```

Це класична PVS структура.

---

# 10. AUDIT — Null-Move Pruning

Null move виконується через:

```js
makeNullMove()
```

Він:

- змінює turn;
- видаляє en passant;
- змінює hash;
- збільшує ply;
- не змінює halfmove clock;
- не додає repetition history.

Це правильно в тому сенсі, що null move не є реальною шаховою трансформацією.

---

## AUD-311-08 — Null-Move Pruning залишається heuristic-sensitive

### Severity: P2

Null-Move Pruning може давати false cutoff у позиціях:

- zugzwang;
- endgames;
- pawn-only positions;
- positions з обмеженою мобільністю;
- позиціях, де null move штучно змінює тактичний баланс.

Код виключає позиції, де немає non-pawn/non-king pieces:

```js
if (t !== PAWN && t !== KING)
    hasPiece = true;
```

Це позитивний захист.

Проте він не усуває всі zugzwang cases.

### Рекомендація

Провести спеціальний тестовий набір:

```text
NMP ENABLED
vs
NMP DISABLED
```

Порівнювати:

- best move;
- score;
- depth;
- tactical accuracy;
- forced win detection;
- zugzwang positions.

---

# 11. AUDIT — LMR

LMR:

```js
reduction = 1 + (i >= 6 ? 1 : 0);
```

Використовується для:

- quiet moves;
- не в check;
- non-checking moves;
- після певної depth;
- після певного move index.

Це класична heuristic reduction.

## Проблема

Reduction залежить від move ordering.

Якщо Move Ordering неправильно визначає пріоритети, LMR може:

- недооцінити критичний move;
- пропустити тихий стратегічний move;
- змінити результат search.

Особливо це важливо для SUBIT-CHESS, оскільки структурні критерії зараз не використовуються як основна move ordering система.

### Статус

**Не доведено дефект.**

Це зона високого ризику, яка потребує A/B validation.

---

# 12. AUDIT — Futility Pruning

Futility Pruning працює лише на frontier:

```js
depth <= futility.maxDepth
```

У конфігурації:

```js
maxDepth: 1
```

Це обмежує його ризик.

Після move evaluation:

```js
const staticScore = -this.ev.evaluate(pos, depth);
```

Negation зроблена правильно з урахуванням сторони, яка тепер ходить.

### Позитивний аспект

Futility pruning не застосовується:

- у PV node;
- при шаху;
- для checking move;
- для capture;
- для promotion.

Це значно обережніша реалізація.

### Статус

🟢 Архітектурно прийнятно.

Runtime verification необхідна.

---

# 13. AUDIT — Quiescence Search

Quiescence містить:

- stand-pat;
- captures;
- promotions;
- check evasions;
- stalemate detection;
- bounded quiet checks;
- delta pruning;
- qdepth limit.

Це досить розвинена структура.

---

## AUD-311-09 — Quiet checking castling може бути пропущено

### Severity: P2

У quiet-check search використовується геометричний prefilter:

```js
if (!targets[from] && !targets[to]) continue;
```

Для звичайного move:

- origin;
- destination

можуть бути достатніми для direct/discovered check.

Але при castling одночасно переміщуються:

- king;
- rook.

Check може бути створений переміщенням rook.

Позиція нового rook може давати шах, хоча:

```text
KING FROM
KING TO
```

не належать до `CHECK_TARGETS`.

У такому випадку checking castle може бути пропущений.

### Важливість

Це не помилка legal move generator.

Це потенційна помилка search horizon.

### Рекомендація

Для castling quiet-check prefilter додатково перевіряти:

```text
ROOK FROM
ROOK TO
```

або обробляти castling окремим geometry case.

---

## AUD-311-10 — Quiescence search є обмеженим, але його межа потребує tactical validation

### Severity: P2 — Verification Gap

```js
if (qdepth > 8)
```

При перевищенні межі:

- якщо позиція не в шаху — повертається stand-pat;
- якщо в шаху — виконується static evasion.

Це захищає від безмежної recursion.

Проте в tactical sequences можливі:

- checking cycles;
- repeated checking;
- sacrifices;
- promotions;
- sequences, які продовжуються після cap.

### Рекомендація

Перевірити tactical corpus із:

- mate sequences;
- perpetual check;
- exchange sequences;
- promotions;
- forced evasions;
- sacrifice;
- discovered attacks.

---

# 14. AUDIT — Fast Evaluation

Fast evaluation включає:

```text
Material
Piece-Square Tables
Mobility
Bishop Pair
Doubled Pawns
Isolated Pawns
Passed Pawns
Rook Open Files
Rook Semi-Open Files
King Shield
Tapered Midgame/Endgame
Tempo
```

Це хороший базовий набір.

---

## AUD-311-11 — Phase normalization не відповідає початковій конфігурації

### Severity: P1/P2 — Evaluation defect

В коді:

```js
const PHASE_TOTAL = 24;
```

Weights:

```js
PHASE_WEIGHT = [0, 1, 1, 1, 2, 4, 0];
```

Fast evaluation відокремлює pawns:

```js
const nonPawn = pos.phaseMaterial - pawns;
```

і потім:

```js
const phase = 1 - Math.min(1, nonPawn / PHASE_TOTAL);
```

На початковій позиції non-pawn phase material:

```text
N = 4
B = 4
R = 8
Q = 8

Total = 24?
```

Перерахунок з конфігурації:

- 4 knights × 1 = 4;
- 4 bishops × 1 = 4;
- 4 rooks × 2 = 8;
- 2 queens × 4 = 8.

**Total = 24.**

Після перевірки ваг:

```text
PHASE_TOTAL = 24
```

Відповідно, стартова позиція повинна давати:

```text
phase = 1 - 24 / 24 = 0
```

Отже, тут phase normalization арифметично узгоджена.

**AUD-311-11 знімається: false positive.**

Це важливо: первинна підозра на неправильний phase total не підтвердилася.

---

# 15. AUDIT — Evaluation Cache

## AUD-311-11 — TABLES cache залежить від object identity

### Severity: P2

У `tables()`:

```js
if (!TABLES || TABLES_VERSION !== params) {
    TABLES = buildPieceSquareTables(params);
    TABLES_VERSION = params;
}
```

Cache invalidation відбувається лише при зміні reference.

Якщо параметри змінюються всередині того самого об'єкта:

```js
params.material.Q = 1200;
```

то:

```js
TABLES_VERSION === params
```

залишається true.

PST/material tables не перебудовуються.

### Наслідки

- evaluator використовує старі material values;
- PST не відповідає актуальним параметрам;
- learning/parameter tuning може фактично не змінювати оцінювання;
- benchmark може показувати результати для неактуальної конфігурації.

### Severity

P2, якщо параметри можуть змінюватися динамічно.

P3, якщо параметри завжди immutable.

### Рекомендація

Замість reference-based cache:

```text
PARAMETER VERSION
```

або:

```text
PARAMETER HASH
```

---

# 16. AUDIT — Structural Evaluation

Основний вектор:

```text
V(P) = (M, K, A, D, C, T, Q, R, X)
```

Компоненти:

- M — Material;
- K — King Safety;
- A — Activity;
- D — Defence;
- C — Coordination;
- T — Tactical Potential;
- Q — Space;
- R — Relations;
- X — Transformation Potential.

Це одна з найбільш цікавих частин SUBIT-CHESS.

---

## AUD-311-12 — Structural Vertex Encoding має колізії

### Severity: P1 — Structural correctness defect

У `structuralDistance()`:

```js
set1.add(sq * 16 + pieceType(...) + 64);
```

Для black використовується offset:

```js
+64
```

А squares представлені 0x88-індексами:

```text
0–119
```

а не compact 0–63.

Тому offset 64 не є безпечним розділенням кольорів.

### Приклад

White piece:

```text
sq = 4
pieceType = 1

code = 4 × 16 + 1
code = 65
```

Black piece:

```text
sq = 0
pieceType = 1

code = 0 × 16 + 1 + 64
code = 65
```

Тобто різні вершини можуть отримати однаковий код.

### Наслідок

Structural vertex distance:

```text
Dv
```

може неправильно визначати:

- intersection;
- union;
- structural similarity;
- structural difference.

Це критично, якщо Dv використовується як частина подальших structural analyses.

### Рекомендація

Використовувати compact square index:

```text
square64 = rank × 8 + file
```

і окреме кодування:

```text
VERTEX = COLOR × 512 + SQUARE64 × 8 + PIECE_TYPE
```

Це забезпечує однозначне розділення.

---

# 17. AUDIT — Structural Relations

У `Structure` генеруються:

```text
ATTACK
DEFEND
SUPPORT
BLOCK
PIN
DISCOVER
RESTRICT
CONTROL
CONNECT
THREATEN
PROTECT
```

Це створює relation graph.

---

## AUD-311-13 — DISCOVER detection має обмежену дальність

### Severity: P2

У структурному модулі:

```js
const beyond = to + d;
```

Після знаходження першого власного blocker:

```js
```

перевіряється лише наступна клітина.

Таким чином, потенційний discovered attack розпізнається лише коли:

```text
SLIDER
   │
   ▼
OWN BLOCKER
   │
   ▼
ENEMY PIECE
```

розташовані безпосередньо на сусідніх клітинах.

Але типовий discovered attack може бути:

```text
SLIDER
   │
   │
OWN BLOCKER
   │
   │
   │
ENEMY PIECE
```

### Наслідок

Потенційні discovered relations не будуть повністю представлені.

### Рекомендація

Після blocker продовжити ray traversal:

```text
SLIDER
  │
  ▼
BLOCKER
  │
  ▼
CONTINUE RAY
  │
  ▼
TARGET
```

і перевірити, чи target відповідає slider geometry.

---

## AUD-311-14 — Fork hyperrelations можуть переоцінювати кількість forks

### Severity: P2/P3

Fork generation:

```js
if (attacked.length >= 2)
```

і створює hyperrelations для всіх targets.

Це означає, що при 3 targets:

- target A + B;
- target A + C;
- target B + A;
- target B + C;
- target C + A;
- target C + B.

Одна позиція може генерувати багато взаємопов'язаних fork records.

### Наслідок

```text
hyperCounts[FORK]
```

може не відповідати кількості незалежних fork situations.

Це може впливати на:

- tactical context;
- uncertainty;
- plans;
- risk.

### Рекомендація

Розрізняти:

```text
UNIQUE ATTACKER
UNIQUE TARGET SET
UNIQUE FORK EVENT
```

і нормалізувати hyperrelations.

---

# 18. AUDIT — Hanging Pieces

Hanging detection:

```js
if (defenders === 0 || cheapest < value)
```

Це heuristic.

Проблема полягає в тому, що:

```text
cheapest attacker < piece value
```

може визначити piece як hanging навіть тоді, коли defenders є.

### Приклад

```text
ATTACKER: pawn
TARGET: rook
DEFENDER: queen
```

Наявність дешевого attacker не означає автоматично, що rook hanging.

Так само:

```text
ATTACKER
DEFENDER
TARGET
```

може створювати exchange sequence, який heuristic не аналізує.

### Severity

P2 — evaluation accuracy.

### Рекомендація

Hanging detection має враховувати хоча б:

- attackers;
- defenders;
- relative piece values;
- exchange order;
- king recapture;
- defended target;
- legal capture availability.

---

# 19. AUDIT — Context Profile

Context dimensions:

```text
I — Interaction
Z — Spatial Zone
Φ — Phase
τ — Tactical Intensity
```

Context profile створює 64-vector:

```text
wI × wZ × wΦ
```

Це формальна структура.

---

## AUD-311-15 — Context не є нормалізованим probability distribution

### Severity: P3 / Conceptual

```js
to64()
```

формує:

```js
w[i] * z[z] * p[p]
```

Але:

- `w` не є probability distribution;
- `z` не є probability distribution;
- `p` не є probability distribution.

Сумарна маса 64-vector не обов'язково дорівнює 1.

Це не обов'язково помилка, якщо vector задуманий як activation field.

Але якщо його трактувати як probability або entropy space, виникає семантична помилка.

### Рекомендація

Зафіксувати один із двох статусів:

```text
CONTEXT ACTIVATION VECTOR
```

або:

```text
NORMALIZED CONTEXT DISTRIBUTION
```

Не змішувати.

---

# 20. AUDIT — Context Adjust

Функція:

```js
contextAdjust(ctx, weights)
```

зараз фактично повертає копію weights:

```js
for (...)
    out[i] = weights[i];
```

Context не змінює ваги.

### AUD-311-16 — ContextAdjust є no-op

**Severity: P2 — Functional / architectural discrepancy**

У системі функція існує, але не виконує заявленої функції context-dependent weight modulation.

Це важливо, тому що її назва та архітектурна роль створюють очікування:

```text
CONTEXT
    │
    ▼
WEIGHT ADAPTATION
```

А фактично:

```text
CONTEXT
    │
    ▼
COPY BASE WEIGHTS
```

### Статус

Якщо це навмисний stub — `DESIGN DEBT`.

Якщо очікується повноцінна функція — `FUNCTIONAL DEFECT`.

---

# 21. AUDIT — Structural Evaluation та Search Integration

Engine має три evaluation modes:

```text
fast
structural
hybrid
```

Hybrid:

```js
if (remainingDepth <= structuralDepth)
    return structural(pos).E;
```

В іншому випадку:

```js
return evaluateFast(pos);
```

Це цікава архітектура, оскільки:

- deep search використовує дешевший evaluation;
- near-horizon search використовує структурну оцінку;
- structural information не обов'язково нав'язується кожному node.

---

## AUD-311-17 — Hybrid evaluation може створювати discontinuity між search depth

### Severity: P2 — потрібно перевірити

На різних рівнях дерева evaluation може змінювати модель:

```text
DEEP NODE
    │
    ▼
FAST EVALUATION

NEAR HORIZON
    │
    ▼
STRUCTURAL EVALUATION
```

Fast evaluation і structural evaluation мають різні feature sets і scale.

Наприклад:

```text
FAST:
Material + PST + Mobility + Pawn Structure + King Shield

STRUCTURAL:
M + K + A + D + C + T + Q + R + X
```

Якщо масштаби оцінок не калібровані, переходи між ними можуть спричиняти:

- нестабільні score;
- evaluation jumps;
- неправильний root ranking;
- непрогнозовану поведінку при зміні depth.

### Рекомендація

Провести calibration experiment:

```text
SAME POSITION
       │
       ├── FAST EVAL
       │
       ├── STRUCTURAL EVAL
       │
       └── HYBRID SEARCH
```

Порівняти:

- score distributions;
- mean;
- variance;
- correlation;
- rank consistency.

---

# 22. AUDIT — Plans

Plans існують як окрема система:

```text
PROMOTE
RESTRICT
TRADE
KING
ACTIVATE
OUTPOST
SHIELD
```

Архітектурно plans створюються як стратегічні кандидати.

Це важливо для SUBIT-CHESS, але потрібно відокремити:

```text
PLAN GENERATION
```

від:

```text
PLAN EXECUTION
```

Наявність плану не означає, що search реально обирає moves, які реалізують план.

У поточній версії structural ordering був відключений.

Це означає, що plans, relations та context можуть бути представлені в UI, але не обов'язково безпосередньо впливають на move ordering.

### Статус

🟡 Descriptive strategic subsystem.

Потрібно перевірити окремо:

- чи plans generation працює коректно;
- чи plans мають legal realizations;
- чи plans оцінюються;
- чи plans змінюють root decision;
- чи план зберігається між ходами;
- чи відбувається планова трансформація позиції.

---

# 23. AUDIT — Meta-controller

Meta-controller повинен адаптувати:

```text
DEPTH
TIME
EVALUATION MODE
STRUCTURAL DEPTH
```

Заявлена логіка:

```text
POSITION COMPLEXITY
        │
        ▼
UNCERTAINTY
        │
        ▼
META DECISION
        │
        ├── SEARCH DEPTH
        ├── TIME BUDGET
        └── EVALUATION MODE
```

Але для повної оцінки потрібно окремо перевірити математичні формули:

- complexity;
- uncertainty;
- adaptiveDepth;
- risk;
- budget allocation;
- time management;
- correlation між параметрами.

Цей компонент не можна приймати лише за наявності класу `MetaController`.

---

# 24. AUDIT — Uncertainty

Система має 8-компонентний uncertainty profile.

Це концептуально сильніше, ніж один scalar:

```text
U(P) =
(
Us,
Ut,
Ue,
Ur,
Up,
Uh,
Um,
Uc
)
```

Однак uncertainty не є probability.

Тому:

```text
UNCERTAINTY
≠
PROBABILITY OF ERROR
```

і:

```text
HIGH UNCERTAINTY
≠
LOW CONFIDENCE MOVE
```

Це має бути чітко збережено в документації та UI.

### Рекомендація

Кожний uncertainty component повинен мати:

- definition;
- measurable inputs;
- normalization;
- interpretation;
- threshold;
- validation criterion.

---

# 25. AUDIT — Decision Certificate

Engine формує:

```text
DECISION CERTIFICATE
```

Включає:

- FEN;
- position version;
- move;
- SAN;
- legal validation;
- legal moves count;
- depth;
- completed;
- nodes;
- PV;
- score;
- uncertainty;
- algorithm version;
- parameter version.

Це дуже перспективний напрямок.

Але важливо:

> Certificate є доказом provenance та consistency, а не доказом шахової оптимальності.

Certificate не доводить:

```text
MOVE IS BEST
```

Він може доводити:

```text
MOVE WAS SELECTED
MOVE WAS LEGAL
SEARCH REACHED DEPTH
POSITION WAS IDENTIFIED
VERSION WAS RECORDED
```

Це різні типи доказу.

---

# 26. AUDIT — Worker

Engine може працювати у Web Worker.

```js
new Worker(url, { type: 'module' })
```

Worker отримує:

```text
id
fen
depth
timeMs
reset
```

Це правильна ідея для UI responsiveness.

---

## AUD-311-18 — Worker runtime не verified

### Severity: P1 — Verification Gap

Не перевірено фактично:

- worker startup;
- module compatibility;
- blob URL;
- worker initialization;
- browser CSP;
- worker failure;
- timeout;
- cancellation;
- stale message handling;
- repeated game reset;
- memory cleanup;
- race conditions.

---

## AUD-311-19 — Worker URL revocation timing потребує перевірки

### Severity: P3

```js
setTimeout(() => URL.revokeObjectURL(url), 5000);
```

Blob URL створюється для Worker.

Потрібно перевірити behavior на різних браузерах і environments.

Не можна припускати, що п'ять секунд є гарантовано безпечним інтервалом для всіх сценаріїв initialization.

Це не підтверджений runtime defect, а compatibility risk.

---

# 27. AUDIT — Worker / Main-thread fallback

У разі worker error:

```js
state.worker = null;
```

потім можливий fallback.

Це добре.

Однак необхідно перевірити:

- повторний worker creation;
- чи worker не залишається zombie;
- чи fallback search не виконується двічі;
- чи старі worker replies не змінюють state;
- чи правильно синхронізується `searchId`.

---

# 28. AUDIT — UI

UI містить:

- chessboard;
- drag and drop;
- click moves;
- keyboard navigation;
- legal move highlighting;
- promotion;
- clocks;
- analysis;
- plans;
- structural information;
- settings;
- FEN;
- PGN;
- Worker.

---

## AUD-311-20 — Modal backdrop не відновлює focus

### Severity: P3

Для кнопок закриття використовується:

```js
closeModal()
```

яка відновлює focus.

Але при закритті через backdrop:

```js
back.addEventListener('click', ...)
```

modal просто отримує:

```js
classList.remove('on')
```

без focus restoration.

### Наслідок

Keyboard users можуть залишитися у прихованому modal DOM.

### Рекомендація

Backdrop closure повинна викликати:

```text
closeModal(id)
```

а не безпосередньо видаляти `.on`.

---

## AUD-311-21 — Promotion interface потребує accessibility validation

### Severity: P3

Promotion interface використовує:

```html
<div class="promo-piece">
```

Потрібно перевірити:

- keyboard navigation;
- semantic role;
- accessibility labels;
- keyboard selection;
- screen reader behavior.

Promotion selection має бути доступним без mouse.

---

# 29. AUDIT — Game Lifecycle

Поточна структура:

```text
NEW GAME
   │
   ▼
SET FEN
   │
   ▼
RESET STATE
   │
   ▼
SEARCH
   │
   ▼
MOVE
   │
   ▼
UPDATE UI
```

Позитивні аспекти:

- search ID;
- reset;
- Worker reset;
- clock;
- FEN;
- history;
- undo.

---

## AUD-311-22 — Self-play не перевіряє terminal state до початку search

### Severity: P2

У `selfPlay()`:

```js
for (let i = 0; i < plies; i++) {
    const r = this.search(opts);
    line.push(r.uci);
    const played = this.play(r.uci);
```

Terminal status перевіряється після move.

Тобто initial position не перевіряється перед search.

Якщо початкова позиція вже terminal:

```text
NO LEGAL MOVES
```

або:

```text
AUTOMATIC DRAW
```

search може повернути:

```text
move = 0
```

а selfPlay потім спробує зіграти цей move.

Результат:

```text
illegal move from search
```

замість правильного terminal result.

### Рекомендація

Self-play loop повинен мати порядок:

```text
CHECK TERMINAL
      │
      ▼
IF TERMINAL → STOP
      │
      ▼
SEARCH
      │
      ▼
VALIDATE MOVE
      │
      ▼
PLAY
      │
      ▼
CHECK TERMINAL
```

---

# 30. AUDIT — PGN

PGN generation має підтримку:

- Date;
- Event;
- Site;
- White;
- Black;
- Result;
- SetUp;
- FEN;
- move numbering;
- custom start positions.

Це добре.

Але потрібна перевірка:

- custom FEN;
- black-to-move initial position;
- initial move number;
- result;
- resignation;
- checkmate;
- stalemate;
- draw;
- undo;
- export.

---

## AUD-311-23 — SAN promotion notation потребує стандартної перевірки

### Severity: P3

У `moveToSan()` promotion notation формує:

```js
'=q'
```

У стандартному SAN promotion piece зазвичай має uppercase:

```text
=Q
=R
=B
=N
```

Це не впливає на legal move, але може створювати несумісність із зовнішніми PGN/SAN parsers.

---

# 31. AUDIT — Material / Structural / Tactical consistency

Виявлена важлива архітектурна проблема:

```text
PERCEPT
STRUCTURE
CONTEXT
EVALUATION
SEARCH
```

не завжди використовують однакову семантику.

Наприклад:

- Hanging detection є heuristic.
- Fork detection є structural potential.
- Context tactical intensity залежить від hyperrelation counts.
- Evaluation використовує fork balance.
- Uncertainty використовує кількість hyperrelations.

Таким чином, один heuristic defect може поширюватися одночасно:

```text
FORK DETECTION
      │
      ├── Structural Evaluation
      ├── Context
      ├── Uncertainty
      ├── Risk
      └── Plans
```

Це створює dependency propagation.

### Рекомендація

Не виправляти кожний downstream component окремо.

Спочатку потрібно верифікувати базові primitives:

```text
ATTACK MAP
       │
       ▼
RELATIONS
       │
       ▼
HYPERRELATIONS
       │
       ▼
STRUCTURAL FEATURES
       │
       ▼
CONTEXT
       │
       ▼
EVALUATION
       │
       ▼
SEARCH
```

---

# 32. AUDIT REGISTRY v3.0.11

## Confirmed findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| AUD-311-01 | FEN не обмежує матеріальну конфігурацію до capacity piece lists | P1/P2 | CONFIRMED |
| AUD-311-02 | Non-canonical FEN rank notation приймається | P3 | CONFIRMED |
| AUD-311-03 | Move generator не пройшов незалежну runtime verification у цьому аудиті | P1 Verification Gap | OPEN |
| AUD-311-04 | Hash restoration не пройшла differential verification | P1 Verification Gap | OPEN |
| AUD-311-05 | TT key mixing може створювати collisions між halfmove buckets | P2 | CONFIRMED DESIGN RISK |
| AUD-311-06 | TT stale entries можуть блокувати replacement | P2 | CONFIRMED |
| AUD-311-07 | TT cutoffs metrics мають неоднозначну семантику | P3 | CONFIRMED |
| AUD-311-08 | Null-move heuristic needs zugzwang validation | P2 | OPEN |
| AUD-311-09 | Quiet checking castle може бути пропущений QSearch prefilter | P2 | CONFIRMED LOGIC RISK |
| AUD-311-10 | QSearch cap needs tactical verification | P2 | OPEN |
| AUD-311-11 | TABLES cache invalidation за reference identity | P2 | CONFIRMED |
| AUD-311-12 | Structural vertex encoding має колізії кольорів | P1 | CONFIRMED |
| AUD-311-13 | DISCOVER relation не продовжує ray після blocker | P2 | CONFIRMED |
| AUD-311-14 | Fork hyperrelations можуть overcount | P2/P3 | CONFIRMED |
| AUD-311-15 | Context vector не нормалізований як probability | P3 | DESIGN CLARIFICATION |
| AUD-311-16 | ContextAdjust — no-op | P2 | CONFIRMED |
| AUD-311-17 | Hybrid evaluation scale consistency не verified | P2 | OPEN |
| AUD-311-18 | Worker runtime не verified | P1 Verification Gap | OPEN |
| AUD-311-19 | Blob Worker revocation timing risk | P3 | OPEN |
| AUD-311-20 | Modal backdrop focus restoration defect | P3 | CONFIRMED |
| AUD-311-21 | Promotion accessibility не verified | P3 | OPEN |
| AUD-311-22 | SelfPlay не перевіряє terminal state до першого search | P2 | CONFIRMED |
| AUD-311-23 | SAN promotion notation needs standard validation | P3 | CONFIRMED |

---

# 33. Найважливіші 5 проблем

Якщо не розпорошуватися, я б виділив п'ять основних напрямів.

## №1 — Structural vertex collision

```text
structuralDistance()
```

Це найважливіший математичний defect structural layer.

---

## №2 — Piece-list capacity vs FEN acceptance

```text
validateFEN()
      ↓
Position.refreshPieces()
```

Validator і storage model не мають узгоджених обмежень.

---

## №3 — ContextAdjust no-op

Функція існує, але не виконує заявленої адаптації.

---

## №4 — Search horizon: quiet checking castling

Geometric prefilter може пропустити checking move, який виникає через rook transformation.

---

## №5 — TT replacement / stale entries

Stale entry може залишатися непридатним, але блокувати запис актуального entry.

---

# 34. Архітектурний ризик SUBIT-CHESS

Найважливіший висновок аудиту не полягає в кількості багів.

Він полягає у структурі dependency.

```text
               POSITION
                  │
                  ▼
             PERCEPTION
                  │
                  ▼
              STRUCTURE
                  │
       ┌──────────┼───────────┐
       ▼          ▼           ▼
   RELATIONS   HYPER       CRITICALITY
       │          │           │
       └──────────┼───────────┘
                  ▼
               CONTEXT
                  │
       ┌──────────┼───────────┐
       ▼          ▼           ▼
   EVALUATION  UNCERTAINTY  PLANS
       │          │           │
       └──────────┼───────────┘
                  ▼
                SEARCH
                  │
                  ▼
               DECISION
```

Якщо базова структурна функція неправильна, помилка може бути поширена на кілька рівнів.

Тому SUBIT-CHESS потрібно аудіювати не як:

```text
BUG → PATCH
```

а як:

```text
PRIMITIVE
    ↓
INVARIANT
    ↓
DEPENDENCIES
    ↓
DOWNSTREAM IMPACT
    ↓
VALIDATION
```

Це принципово відповідає SUBIT:

**DO NOT COLLAPSE — CONTEXTUALIZE.**

---

# 35. Рекомендований порядок наступного аудиту

Я не рекомендую одразу вносити зміни.

Правильний порядок:

### Phase A — Integrity

- HTML integrity;
- source consistency;
- embedded module consistency;
- version consistency;
- duplicate declarations;
- bundle consistency.

### Phase B — Chess Core

- FEN;
- board;
- piece lists;
- attacks;
- legal moves;
- castling;
- en passant;
- promotion.

### Phase C — State Invariants

- make/unmake;
- hash;
- repetition;
- clocks;
- phase;
- king positions.

### Phase D — Search

- Negamax;
- PVS;
- TT;
- null move;
- LMR;
- futility;
- quiescence;
- mate score;
- terminal state.

### Phase E — SUBIT Layer

- Percept;
- Structure;
- Relation;
- Hyperrelation;
- Context;
- Structural Evaluation;
- Plans;
- Meta-controller;
- Uncertainty.

### Phase F — UI / Worker

- interactions;
- keyboard;
- promotion;
- clocks;
- modal;
- Worker;
- fallback;
- stale requests;
- PGN.

### Phase G — Independent validation

- perft;
- differential state invariants;
- tactical tests;
- search regression;
- browser tests;
- benchmark;
- self-play.

---

# 36. Фінальний статус

## SUBIT-CHESS v3.0.11

```text
SOURCE REVIEW:           COMPLETED — INITIAL FULL PASS
ARCHITECTURE REVIEW:   COMPLETED — INITIAL PASS
CHESS CORE:             NOT FULLY VERIFIED
SEARCH:                 NOT FULLY VERIFIED
STRUCTURAL LAYER:       DEFECTS IDENTIFIED
CONTEXT LAYER:          DESIGN / FUNCTIONAL ISSUES IDENTIFIED
META-CONTROLLER:        REQUIRES DEEP AUDIT
PLANS:                  REQUIRES DEEP AUDIT
WORKER:                 RUNTIME UNVERIFIED
UI:                     PARTIAL AUDIT
TEST EXECUTION:          NOT PERFORMED
RELEASE VALIDATION:      NOT PERFORMED

AUDIT STATUS:            OPEN
RELEASE STATUS:          NOT CERTIFIED
```

**Моя оцінка:** v3.0.11 має значно цікавішу архітектуру, ніж просто стандартний chess engine із додатковими heuristics. Однак зараз найбільша загроза — не окрема помилка search, а **невідповідність між точністю шахового ядра, точністю структурних primitives і рівнем впевненості, який система демонструє через analysis, uncertainty та certificates**.

Найкращий наступний крок — **AUDIT A: повна перевірка Chess Core від FEN → Position → Move Generation → Make/Unmake → Hash → Repetition**, із конкретними тестовими позиціями, інваріантами та доказом PASS/FAIL, перш ніж переходити до Structural Layer.