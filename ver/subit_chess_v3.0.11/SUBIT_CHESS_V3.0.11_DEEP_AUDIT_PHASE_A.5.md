# SUBIT-CHESS v3.0.11
# DEEP AUDIT — PHASE A.5
## SEARCH ARCHITECTURE & RECURSIVE STATE INTEGRITY
### Negamax · Alpha-Beta · PVS · Iterative Deepening · TT · Pruning · Search Recovery

**Target:** SUBIT-CHESS v3.0.11  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Audit domain:** Search Architecture  
**Audit level:** Deep Architectural Audit  
**Status:** OPEN  
**Execution status:** Static audit framework; runtime testing not performed

---

# 1. МЕТА PHASE A.5

Попередні фази досліджували окремі компоненти шахового рушія:

- A.1 — Position Core;
- A.2 — Attack Geometry, Move Generation, Legality;
- A.3 — Special Move Transformations;
- A.4 — Position History, Repetition, Draw Detection, Game Termination.

PHASE A.5 переходить до центрального механізму шахового інтелекту:

**SEARCH.**

Пошук є не просто алгоритмом перебору ходів.

Він являє собою рекурсивну систему, яка:

- створює нові позиції;
- змінює стан;
- оцінює позиції;
- скорочує дерево;
- повертається до попередніх станів;
- використовує результати попередніх обчислень;
- переносить оцінки між рівнями;
- керує часом;
- може перериватися;
- повинна зберігати коректність навіть після interruption.

Тому головне питання цієї фази:

> Чи є результат Search математично та структурно достовірним, якщо всі рекурсивні трансформації, pruning, кешування, переривання та відновлення виконуються в одному взаємопов'язаному процесі?

---

# 2. SEARCH AS A STATE TRANSFORMATION PROCESS

Традиційне представлення пошуку:

```text
POSITION
    ↓
GENERATE MOVES
    ↓
SEARCH
    ↓
EVALUATE
    ↓
BEST MOVE
```

Для аудиту цього недостатньо.

Потрібно розглядати Search як трансформацію стану:

Sₙ → Sₙ₊₁

де Search State містить:

- Position;
- Search Depth;
- Alpha;
- Beta;
- Node Type;
- Current Ply;
- Search Path;
- TT Context;
- Move Ordering;
- Principal Variation;
- Time Budget;
- Node Budget;
- Abort State.

Таким чином:

**Search Node ≠ Chess Position**

Дві однакові шахові позиції можуть оброблятися по-різному залежно від:

- depth;
- alpha-beta window;
- історії;
- TT;
- search path;
- поточного root;
- pruning conditions.

---

# 3. SEARCH STATE MODEL

Для SUBIT-CHESS пропонується формалізувати вузол пошуку:

S = (P, d, α, β, ply, N, PV, C, T)

де:

- P — Position;
- d — Search Depth;
- α — Alpha Bound;
- β — Beta Bound;
- ply — distance from root;
- N — Node Type;
- PV — Principal Variation Context;
- C — Search Context;
- T — Time and Termination State.

Node Types:

- PV Node;
- Cut Node;
- All Node.

У сучасному Alpha-Beta Search ця класифікація може бути неявною, але її логіка залишається важливою для перевірки поведінки.

---

# 4. NEGAMAX

Negamax є симетричною формою Minimax.

Основний принцип:

Score для поточного гравця дорівнює негативному Score для противника в наступній позиції.

Формально:

Score(P) = max(−Score(P′))

де P′ — позиція після ходу.

Ця симетрія спрощує Search.

---

## 4.1. Negamax Invariant

Кожен рекурсивний рівень повинен правильно змінювати perspective.

```text
Current Player
    ↓
Move
    ↓
Opponent Position
    ↓
Search
    ↓
NEGATE SCORE
```

Ключовий інваріант:

**Score Perspective Must Match Side to Move**

---

## 4.2. Potential Failure

Якщо perspective змінюється неправильно:

- виграш може оцінюватися як програш;
- програш — як виграш;
- матеріальні переваги можуть інвертуватися;
- mate scores можуть бути неправильними;
- evaluation може працювати лише на root, але не в глибині.

---

## 4.3. Negamax Test

Для симетричних позицій необхідно перевірити:

```text
P
    ↓
Evaluate(P)

P′ = P after legal move

Search(P′)

Score(P) = −Score(P′)
```

Перевірка повинна включати:

- матеріально рівні позиції;
- матеріальну перевагу White;
- матеріальну перевагу Black;
- check;
- checkmate;
- stalemate;
- forced draw.

---

# 5. ALPHA-BETA WINDOW

Alpha-Beta Search використовує інтервал:

[α, β]

де:

- α — нижня межа;
- β — верхня межа.

Search досліджує ходи, поки результат може впливати на рішення.

Якщо:

Score ≥ β

можна виконати cutoff.

---

## 5.1. Alpha Update

Після кожного ходу:

α = max(α, Score)

---

## 5.2. Beta Cutoff

Якщо:

α ≥ β

подальше дослідження поточного вузла може бути непотрібним.

---

## 5.3. Critical Integrity

Alpha та Beta не повинні:

- змінюватися неконтрольовано між sibling nodes;
- переноситися в інший perspective;
- порушувати рекурсивну симетрію;
- використовуватися після invalid search state;
- втрачати правильне значення під час interruption.

---

# 6. SEARCH WINDOW CORRECTNESS

Найнебезпечніший тип помилки:

```text
Node A
    ↓
Alpha/Beta updated
    ↓
Node B
    ↓
Incorrectly inherits modified window
```

Кожен дочірній вузол повинен отримувати window, яке відповідає його search contract.

У Negamax:

```text
Child Window:

−β
−α
```

Тобто:

Search(child, depth − 1, −β, −α)

Якщо ця трансформація некоректна, рушій може:

- неправильно обрізати дерево;
- пропустити критичні ходи;
- повертати неправильні scores;
- демонструвати нестабільність між однаковими пошуками.

---

# 7. ALPHA-BETA BOUND SEMANTICS

Search Score не завжди є exact score.

Він може представляти:

### EXACT

Score точно визначений у межах завершеного пошуку.

### LOWERBOUND

Результат доводить, що Score не менший за певне значення.

### UPPERBOUND

Результат доводить, що Score не більший за певне значення.

Ці типи повинні правильно зберігатися в Transposition Table.

---

## 7.1. Bound Classification

Після завершення Search:

```text
Score ≤ Original Alpha
    → UPPERBOUND

Score ≥ Original Beta
    → LOWERBOUND

Otherwise
    → EXACT
```

Критично важливо використовувати:

**Original Alpha**

а не Alpha, яке було змінено в процесі Search.

Якщо bound classification використовує неправильні значення, TT може зберігати неправильний тип результату.

---

# 8. ITERATIVE DEEPENING

Iterative Deepening виконує Search послідовно:

```text
Depth 1
    ↓
Depth 2
    ↓
Depth 3
    ↓
Depth 4
    ↓
...
```

Це дозволяє:

- контролювати час;
- використовувати попередній PV;
- покращувати Move Ordering;
- отримувати стабільний root result;
- переривати пошук.

---

## 8.1. Iteration Integrity

Кожна завершена iteration повинна бути незалежним valid result.

```text
Iteration D
    ↓
COMPLETE
    ↓
SAVE RESULT

Iteration D+1
    ↓
INCOMPLETE
    ↓
DISCARD INCOMPLETE RESULT
```

Незавершена iteration не повинна автоматично замінювати результат попередньої завершеної iteration.

---

## 8.2. Root Best Move

Root best move повинен оновлюватися лише після отримання достатньо завершеного результату.

Небезпечна ситуація:

```text
Depth 5 COMPLETE
    ↓
Best Move = A

Depth 6 START
    ↓
Best Move temporarily = B
    ↓
Search ABORT
    ↓
Engine returns B
```

Якщо Depth 6 не завершився, B може не бути достовірним результатом Depth 6.

Тому необхідно розрізняти:

- Last Completed Best Move;
- Current Iteration Best Move;
- Current Search Candidate.

---

# 9. PRINCIPAL VARIATION

Principal Variation — основна лінія ходів, що формує найкращий знайдений результат.

PV:

```text
Root
  ↓
Best Move
  ↓
Best Reply
  ↓
Best Continuation
  ↓
...
```

PV має бути:

- легальною;
- послідовною;
- пов'язаною з відповідними позиціями;
- актуальною для завершеної iteration;
- незалежною від sibling branch corruption.

---

## 9.1. PV Integrity

Необхідно перевірити:

- PV не містить illegal moves;
- PV не містить moves з іншої branch;
- PV правильно очищується після terminal nodes;
- PV відновлюється після TT lookup;
- PV не пошкоджується після Search Abort;
- PV depth відповідає completed iteration.

---

## 9.2. TT and PV

TT move може використовуватися як PV candidate.

Однак TT Move не є автоматично Principal Variation.

Необхідно розрізняти:

- TT Best Move;
- PV Move;
- Search Best Move;
- Root Best Move.

Це чотири різні поняття.

---

# 10. PVS — PRINCIPAL VARIATION SEARCH

PVS оптимізує Alpha-Beta Search.

Перший move досліджується повним window.

Наступні moves можуть досліджуватися через вузьке window.

Концептуально:

```text
First Move
    ↓
Full Window Search

Remaining Moves
    ↓
Null Window Search
    ↓
Potential Improvement?
    ├── No → Continue
    └── Yes → Re-search
```

---

## 10.1. PVS Integrity

Критичні перевірки:

- перший move правильно визначений;
- move ordering стабільний;
- null-window search не пропускає потенційно кращий результат;
- re-search виконується при необхідності;
- re-search використовує правильне window;
- score perspective правильний;
- depth не змінюється неправильно.

---

## 10.2. PVS Failure Modes

Можливі проблеми:

- перший move не є найкращим candidate;
- null-window search повертає неправильний bound;
- re-search пропущений;
- re-search виконується з неправильним alpha;
- move score переноситься між positions;
- TT bound неправильно інтерпретується.

PVS повинен бути математично еквівалентним базовому Alpha-Beta Search за однакових умов повного пошуку.

---

# 11. MOVE ORDERING

Move Ordering визначає порядок дослідження ходів.

Типова структура:

1. TT Move;
2. PV Move;
3. Captures;
4. Promotions;
5. Killer Moves;
6. History Heuristic;
7. Quiet Moves.

Однак конкретна реалізація може використовувати іншу систему.

---

## 11.1. Move Ordering Is Not Evaluation

Move Ordering має допомагати швидше знаходити cutoffs.

Він не повинен змінювати шахову оцінку ходу.

Порядок ходів може впливати на efficiency.

Але в повністю завершеному exact search результат повинен залишатися математично еквівалентним.

Якщо зміна ordering змінює результат без відповідних обмежень search, це може свідчити про:

- pruning instability;
- incomplete search;
- неправильний TT reuse;
- evaluation inconsistency;
- state corruption.

---

# 12. TT MOVE VALIDITY

TT Move може бути застарілим або не відповідати поточній позиції.

Перед використанням TT Move потрібно гарантувати:

- move encoding valid;
- from square valid;
- to square valid;
- piece exists;
- move legal;
- promotion valid;
- castling valid;
- en passant valid.

TT Move не повинен bypass legal move generation.

---

# 13. NULL MOVE PRUNING

Null Move Pruning пропускає хід для оцінки того, чи позиція достатньо сильна для cutoff.

Концептуально:

```text
Current Position
    ↓
Null Move
    ↓
Reduced Search
    ↓
Cutoff?
```

---

## 13.1. Null Move State Integrity

Null Move — це не звичайний шаховий хід.

Він не повинен:

- переміщувати фігури;
- змінювати Piece Lists;
- змінювати King Locations.

Однак може змінювати:

- Side to Move;
- EP state;
- search state;
- відповідні hash components.

---

## 13.2. Null Move Reversibility

Після null move повинні бути відновлені:

- Side to Move;
- EP State;
- Hash;
- Search Context.

Null move не повинен залишати позицію у стані, який сприймається як реальна історична трансформація.

---

## 13.3. Zugzwang

Null Move може бути ненадійним у позиціях, де будь-який реальний хід погіршує позицію.

Особливо:

- endgames;
- zugzwang positions;
- low material;
- pawn-only structures;
- constrained king positions.

Тому Null Move Pruning потребує спеціальної валідації.

---

# 14. LMR — LATE MOVE REDUCTIONS

LMR зменшує глибину пошуку для ходів, які досліджуються пізніше.

```text
Move 1
    → Full Depth

Move 2
    → Reduced Depth

Move 3
    → Reduced Depth

Potentially Better Move
    → Re-search at Full Depth
```

Це оптимізація.

Але її правильність залежить від move ordering та re-search.

---

## 14.1. LMR Integrity

Потрібно перевірити:

- reduction calculation;
- minimum depth;
- move classification;
- PV exemption;
- tactical exemptions;
- check exemptions;
- promotion exemptions;
- re-search conditions;
- score propagation.

---

## 14.2. LMR Risk

Якщо reduction надмірний:

- tactical moves можуть бути недооцінені;
- quiet defense може бути пропущена;
- forcing sequences можуть втратити точність;
- evaluation instability може зростати.

LMR не повинен зменшувати глибину критичних ходів без відповідного повторного пошуку.

---

# 15. FUTILITY PRUNING

Futility Pruning використовує оцінку позиції та depth margin для пропуску ходів, які вважаються недостатньо перспективними.

Концептуально:

```text
Static Evaluation
    +
Depth Margin
    <
Alpha
    ↓
Potential Pruning
```

---

## 15.1. Integrity Requirements

Необхідно перевірити:

- pruning застосовується лише у відповідних вузлах;
- не застосовується некоректно в check;
- не пропускає критичні tactical moves;
- не порушує terminal-state handling;
- не конфліктує з mate scores;
- не використовується для неправильного node type.

---

# 16. QUIESCENCE SEARCH

QSearch призначений для продовження тактичного пошуку за межами nominal depth.

Він допомагає уникнути horizon effect.

Типова модель:

```text
Search Depth Reached
    ↓
Quiescence
    ↓
Captures / Tactical Moves
    ↓
Stable Position
    ↓
Evaluation
```

---

## 16.1. QSearch Invariants

QSearch повинен:

- правильно обробляти check;
- генерувати evasions, якщо король під шахом;
- не дозволяти illegal stand-pat у check;
- обробляти terminal states;
- правильно виконувати make/unmake;
- обмежувати recursion;
- не пропускати critical promotions;
- коректно враховувати captures.

---

## 16.2. QSearch Stability

Search повинна мати визначені правила завершення.

Небезпечні ситуації:

- нескінченна capture sequence;
- promotions;
- repeated checks;
- pathological tactical loops;
- excessive branching.

QSearch Limit не повинен перетворювати позицію на довільний static evaluation, якщо вона все ще перебуває у шаху.

---

# 17. SEARCH ABORT

Search може завершуватися через:

- time limit;
- node limit;
- user cancellation;
- worker termination;
- external interruption.

Abort — це не звичайний результат пошуку.

---

## 17.1. Abort State

Search Result повинен розрізняти:

```text
COMPLETE
ABORTED
INVALID
TERMINAL
```

Не можна автоматично трактувати ABORTED як COMPLETE.

---

## 17.2. Score Integrity

Якщо Search перерваний:

- неповний score не повинен зберігатися як exact;
- неповний PV не повинен замінювати completed PV;
- TT не повинен отримувати invalid bounds;
- root move повинен зберігати last completed result;
- Position повинна бути відновлена.

---

# 18. SEARCH STATE RESTORATION

Це один із найважливіших пунктів A.5.

У Search:

```text
Position A
    ↓
Move 1
    ↓
Position B
    ↓
Move 2
    ↓
Position C
    ↓
Search
    ↓
Undo Move 2
    ↓
Position B
    ↓
Undo Move 1
    ↓
Position A
```

Необхідно довести:

**Position A′ = Position A**

Після кожної рекурсивної branch.

---

## 18.1. Search Restoration State

Перевірити:

- Board;
- Piece Lists;
- King Locations;
- Hash;
- Side to Move;
- Castling Rights;
- EP;
- Halfmove Clock;
- History;
- Evaluation Cache;
- Search Stack;
- PV.

---

## 18.2. Recursive Isolation

Sibling branches повинні бути ізольованими.

```text
Root
├── Branch A
│   └── State A
│
├── Branch B
│   └── State B
│
└── Branch C
    └── State C
```

Branch A не повинна впливати на B або C через:

- shared mutable arrays;
- stale evaluation;
- incorrect history;
- TT context;
- PV memory;
- move buffers.

---

# 19. SEARCH STACK INTEGRITY

Рекурсивний Search може використовувати:

- shared move buffers;
- arrays by ply;
- stack frames;
- mutable search context.

Необхідно перевірити:

### Stack Depth

Чи не перевищується доступна capacity?

### Ply Index

Чи правильно індексуються arrays?

### Buffer Isolation

Чи не перезаписуються moves батьківського вузла?

### PV Isolation

Чи не перезаписує child PV parent PV?

### Undo Order

Чи undo виконується у зворотному порядку трансформацій?

---

# 20. MATE DISTANCE

Mate Score повинен враховувати відстань до завершення.

Це дозволяє:

- вибирати швидший mate;
- відкладати неминучий mate;
- правильно порівнювати terminal outcomes.

Однак mate score не повинен некоректно переноситися через TT.

---

## 20.1. Mate Score Normalization

Score, отриманий на одному ply, може потребувати нормалізації перед TT storage.

Приклад концептуальної проблеми:

```text
Node A
    Mate in 5

Node B
    Same Position
    Different Root Distance
```

Якщо mate score зберігається без нормалізації, результат може неправильно відображати відстань до mate після TT lookup.

---

## 20.2. Mate Score Integrity

Перевірити:

- score encoding;
- mate threshold;
- root-relative distance;
- ply-relative distance;
- TT storage;
- TT retrieval;
- negation;
- terminal propagation.

---

# 21. TIME MANAGEMENT

Search повинен керувати часом без пошкодження результату.

Time Management може включати:

- total time;
- increment;
- moves to go;
- soft time limit;
- hard time limit;
- iteration time;
- node count;
- stability.

---

## 21.1. Soft Limit

Soft limit:

- сигналізує про необхідність завершити пошук;
- може дозволити додаткову iteration, якщо результат нестабільний.

---

## 21.2. Hard Limit

Hard limit:

- зупиняє Search;
- не дозволяє продовжувати роботу понад визначений бюджет.

---

## 21.3. Time Integrity

Потрібно перевірити:

- clock monotonicity;
- time measurement precision;
- overshoot;
- Worker delay;
- timer granularity;
- abort latency.

---

# 22. NODE COUNT

Node Count — важливий інструмент вимірювання.

Однак потрібно розрізняти:

- Nodes;
- QNodes;
- TT Nodes;
- Evaluated Nodes;
- Pruned Nodes;
- Terminal Nodes.

Якщо всі вони об'єднані в одну величину, це може ускладнювати аналіз Search.

---

## 22.1. Node Counter Integrity

Node Count повинен:

- збільшуватися в визначених точках;
- не втрачатися під час recursion;
- не дублюватися після re-search;
- правильно обробляти abort;
- бути стабільним для повторних запусків за однакових умов.

---

# 23. SEARCH DETERMINISM

За однакових умов:

- Position;
- Parameters;
- Depth;
- Search Settings;
- Time Budget;
- TT State;

Search може демонструвати детермінованість.

Однак time-based search може змінювати результат через:

- різний час виконання;
- різну кількість завершених iterations;
- Worker scheduling;
- cache effects;
- node timing.

Для аудиту необхідно відокремити:

### Deterministic Fixed-Depth Search

від

### Time-Limited Search

Це різні режими тестування.

---

# 24. SEARCH QUALITY VS SEARCH CORRECTNESS

Один із фундаментальних принципів аудиту:

**Strong Move ≠ Correct Search**

І:

**Weak Move ≠ Search Bug**

Пошук може бути структурно правильним, але слабким через:

- evaluation;
- depth;
- move ordering;
- pruning;
- parameter settings.

І навпаки.

Рушій може демонструвати сильні ходи, але містити:

- state corruption;
- incorrect bounds;
- hash inconsistency;
- terminal-state errors;
- incomplete search.

Тому Search Quality та Search Correctness повинні оцінюватися окремо.

---

# 25. SEARCH AUDIT TEST MATRIX

## SA-01 — Negamax Perspective

Перевірити правильність Score Perspective.

---

## SA-02 — Alpha-Beta Window

Перевірити рекурсивне window transformation.

---

## SA-03 — Bound Classification

Перевірити EXACT, LOWERBOUND, UPPERBOUND.

---

## SA-04 — Iterative Deepening

Перевірити completed iteration isolation.

---

## SA-05 — Root Best Move

Перевірити збереження last completed result.

---

## SA-06 — PV Integrity

Перевірити legal та coherent PV.

---

## SA-07 — PVS Re-search

Перевірити null-window та full-window re-search.

---

## SA-08 — TT Move Validity

Перевірити legality TT move.

---

## SA-09 — Null Move Restoration

Перевірити повне відновлення після null move.

---

## SA-10 — Zugzwang Sensitivity

Перевірити null-move pruning у zugzwang-sensitive positions.

---

## SA-11 — LMR

Перевірити reduction та re-search.

---

## SA-12 — Futility

Перевірити pruning boundaries.

---

## SA-13 — QSearch

Перевірити tactical continuation та termination.

---

## SA-14 — Abort

Перевірити incomplete search handling.

---

## SA-15 — Position Restoration

Перевірити Position після recursion.

---

## SA-16 — Search Stack

Перевірити stack та buffers.

---

## SA-17 — Mate Distance

Перевірити score normalization.

---

## SA-18 — Time Management

Перевірити soft/hard limits.

---

## SA-19 — Node Counting

Перевірити counter integrity.

---

## SA-20 — Search Determinism

Перевірити fixed-depth repeatability.

---

# 26. AUDIT REGISTRY — PHASE A.5

| ID | Audit Target | Severity | Status |
|---|---|---|---|
| A5-001 | Negamax perspective | P1 | OPEN |
| A5-002 | Alpha-beta window integrity | P1 | OPEN |
| A5-003 | Bound classification | P1 | OPEN |
| A5-004 | Iterative deepening isolation | P1 | OPEN |
| A5-005 | Last completed root result | P1 | OPEN |
| A5-006 | PV integrity | P1 | OPEN |
| A5-007 | PVS re-search | P1 | OPEN |
| A5-008 | TT move legality | P1 | OPEN |
| A5-009 | Null-move state restoration | P1 | OPEN |
| A5-010 | Zugzwang sensitivity | P2 | OPEN |
| A5-011 | LMR reduction integrity | P1/P2 | OPEN |
| A5-012 | Futility pruning safety | P2 | OPEN |
| A5-013 | QSearch integrity | P1 | OPEN |
| A5-014 | Abort state integrity | P1 | OPEN |
| A5-015 | Position restoration | P1 | OPEN |
| A5-016 | Recursive stack integrity | P1 | OPEN |
| A5-017 | Mate-distance normalization | P1 | OPEN |
| A5-018 | Time management | P2 | OPEN |
| A5-019 | Node count integrity | P2 | OPEN |
| A5-020 | Search determinism | P2 | OPEN |

---

# 27. PHASE A.5 ACCEPTANCE CRITERIA

Search Architecture не може бути сертифікована лише на основі того, що рушій повертає ходи.

Необхідно підтвердити:

### AC-A5-01
Negamax perspective correctness.

### AC-A5-02
Alpha-beta bounds correctness.

### AC-A5-03
TT bound semantics.

### AC-A5-04
Iterative Deepening result isolation.

### AC-A5-05
Root result integrity under interruption.

### AC-A5-06
Principal Variation correctness.

### AC-A5-07
PVS correctness relative to baseline Alpha-Beta.

### AC-A5-08
TT move legality.

### AC-A5-09
Null Move rollback integrity.

### AC-A5-10
LMR re-search correctness.

### AC-A5-11
Futility pruning boundaries.

### AC-A5-12
QSearch termination and check handling.

### AC-A5-13
Search Abort integrity.

### AC-A5-14
Recursive state restoration.

### AC-A5-15
Search stack isolation.

### AC-A5-16
Mate-distance correctness.

### AC-A5-17
Time-budget correctness.

### AC-A5-18
Node-counter consistency.

### AC-A5-19
Deterministic fixed-depth repeatability.

### AC-A5-20
Search correctness independently verified from playing strength.

---

# 28. RECOMMENDED SEARCH AUDIT PROTOCOL

Для SUBIT-CHESS рекомендовано не тестувати всі механізми одночасно.

Послідовність повинна бути такою:

## Stage 1 — Baseline Search

Negamax без додаткових pruning mechanisms.

Мета:

- перевірити perspective;
- alpha-beta;
- terminal states;
- make/unmake;
- basic PV.

---

## Stage 2 — TT Integration

Додати TT.

Перевірити:

- exact;
- lowerbound;
- upperbound;
- depth;
- move;
- hash;
- context.

---

## Stage 3 — Iterative Deepening

Перевірити:

- completed iterations;
- root result;
- PV;
- interruption.

---

## Stage 4 — PVS

Порівняти з baseline за однакових умов.

---

## Stage 5 — Null Move

Перевірити окремо.

---

## Stage 6 — LMR

Перевірити окремо.

---

## Stage 7 — Futility

Перевірити pruning boundaries.

---

## Stage 8 — QSearch

Перевірити tactical stability.

---

## Stage 9 — Time Management

Перевірити abort та result preservation.

---

## Stage 10 — Full Search Integration

Лише після незалежного підтвердження компонентів.

---

# 29. SUBIT SEARCH INTEGRITY MODEL

На концептуальному рівні Search може бути представленим як система взаємозалежних трансформацій:

```text
POSITION
    ↓
CONTEXT
    ↓
SEARCH NODE
    ↓
MOVE GENERATION
    ↓
MOVE TRANSFORMATION
    ↓
STATE VALIDATION
    ↓
RECURSIVE SEARCH
    ↓
BOUND UPDATE
    ↓
PRUNING DECISION
    ↓
RETURN
    ↓
STATE RESTORATION
    ↓
RESULT INTEGRATION
```

Це важливо, оскільки результат Search залежить не лише від evaluation.

Він залежить від того, чи збережена правильність усіх переходів.

---

# 30. КРИТИЧНИЙ ВИСНОВОК PHASE A.5

У шаховому рушії Search — це не просто алгоритм пошуку найкращого ходу.

Це система керованих рекурсивних станів.

Кожен вузол:

- має власну позицію;
- власну глибину;
- власний search window;
- власний контекст;
- власний результат;
- власні обмеження;
- власний механізм повернення.

При цьому він існує у взаємозв'язку з parent node.

Тому фундаментальна вимога:

**SEARCH RESULT VALIDITY = POSITION INTEGRITY × RECURSIVE INTEGRITY × BOUND INTEGRITY × CONTEXT INTEGRITY**

Якщо один із компонентів порушений, результат може бути недостовірним навіть за наявності правильного Evaluation.

Для SUBIT-CHESS це означає:

> Не достатньо, щоб рушій знайшов хід. Необхідно довести, що цей хід був отриманий із коректного, завершеного та внутрішньо узгодженого процесу пошуку.

---

# PHASE A.5 — FINAL STATUS

**NEGAMAX:** OPEN  
**ALPHA-BETA:** OPEN  
**PVS:** OPEN  
**ITERATIVE DEEPENING:** OPEN  
**PV:** OPEN  
**TT INTEGRATION:** OPEN  
**NULL MOVE:** OPEN  
**LMR:** OPEN  
**FUTILITY:** OPEN  
**QSEARCH:** OPEN  
**SEARCH ABORT:** OPEN  
**STATE RESTORATION:** OPEN  
**MATE DISTANCE:** OPEN  
**TIME MANAGEMENT:** OPEN  
**NODE COUNT:** OPEN  
**DETERMINISM:** OPEN  
**RUNTIME TESTS:** NOT PERFORMED  
**ACCEPTANCE:** NOT GRANTED

---

# НАСТУПНИЙ ЕТАП

## SUBIT-CHESS v3.0.11 — DEEP AUDIT PHASE A.6

### EVALUATION ARCHITECTURE & POSITIONAL INTELLIGENCE

Наступна фаза переходить від процесу пошуку до механізму оцінювання позицій.

Вона охоплюватиме:

- Evaluation Architecture;
- Material Evaluation;
- Piece-Square Tables;
- Piece Mobility;
- King Safety;
- Pawn Structure;
- Passed Pawns;
- Doubled Pawns;
- Isolated Pawns;
- Backward Pawns;
- Bishop Pair;
- Rook Files;
- Outposts;
- Space;
- Initiative;
- Tempo;
- Evaluation Normalization;
- Fast Evaluation vs Structural Evaluation;
- Context-Dependent Evaluation;
- Evaluation Cache Integrity;
- Phase Transition;
- Search-Evaluation Interaction.

**Центральне питання A.6:**

> Чи здатний SUBIT-CHESS не просто оцінювати матеріальну та геометричну структуру позиції, а формувати внутрішньо узгоджену оцінку її динамічних, стратегічних, тактичних і контекстуальних можливостей — без втрати масштабу, стабільності та достовірності?

Це наступний рівень дослідження SUBIT-CHESS: **від правильності пошуку — до правильності шахового судження.**