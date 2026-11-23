# SUBIT-CHESS v3.0.11
# DEEP AUDIT — PHASE A.4
## POSITION HISTORY, REPETITION, DRAW DETECTION & GAME TERMINATION

**Target:** SUBIT-CHESS v3.0.11  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Audit track:** Position State Integrity  
**Phase:** A.4  
**Status:** OPEN  
**Execution:** Static audit specification; runtime verification not performed

---

# 1. МЕТА ФАЗИ A.4

PHASE A.1 досліджувала внутрішню структуру позиції.

PHASE A.2 — геометрію атак, генерацію ходів і легальність.

PHASE A.3 — спеціальні трансформації позиції.

PHASE A.4 переходить до фундаментальної проблеми:

> Чи здатний шаховий рушій правильно розуміти позицію як результат історії трансформацій, а не лише як статичне розташування фігур на дошці?

Шахова позиція не завжди визначається лише розташуванням фігур.

Дві позиції можуть мати однакове розташування фігур, але різні права на рокіровку.

Вони можуть відрізнятися доступністю en passant.

Вони можуть мати різні halfmove clocks.

Вони можуть належати до різних історичних контекстів повторення.

Вони можуть бути геометрично ідентичними, але мати різне значення для пошуку.

Це означає, що:

**Board State ≠ Complete Chess State**

Аналогічно:

**Current Position ≠ Position History**

І:

**Position Identity ≠ Visual Board Identity**

---

# 2. POSITION AS A TEMPORAL STRUCTURE

Для SUBIT-CHESS необхідно розділити три рівні представлення.

## 2.1. Board State

Фізичне розташування фігур:

B = Board

Це базовий рівень.

Він визначає:

- square occupancy;
- piece placement;
- piece colors;
- piece types;
- king locations.

---

## 2.2. Position State

Повний шаховий стан:

P = (B, C, CR, EP, HM, FM)

де:

- B — Board;
- C — Side to Move;
- CR — Castling Rights;
- EP — En Passant State;
- HM — Halfmove Clock;
- FM — Fullmove Number.

---

## 2.3. Historical State

Історичний контекст:

H = (P₀, M₁, P₁, M₂, P₂, …, Mₙ, Pₙ)

де:

- P₀ — початкова позиція;
- Mᵢ — виконаний хід;
- Pᵢ — позиція після відповідного ходу.

Історія потрібна для визначення:

- повторення позицій;
- draw conditions;
- repetition-based evaluation;
- game termination;
- self-play result integrity.

Таким чином, рушій повинен мати можливість розрізняти:

**POSITION → HISTORY → GAME CONTEXT**

---

# 3. POSITION IDENTITY

## 3.1. Основна проблема

Розглянемо дві позиції з однаковим розташуванням фігур.

У першій позиції White має право на рокіровку.

У другій — такого права немає.

Візуально Board може бути однаковим.

Але шахові можливості різні.

Отже:

P₁ ≠ P₂

---

## 3.2. Position Identity Components

Для визначення шахової ідентичності позиції необхідно враховувати:

1. Piece Placement.
2. Side to Move.
3. Castling Rights.
4. En Passant Availability.

Halfmove Clock і історія повторення мають інше призначення.

Вони можуть впливати на правила завершення партії та пошук, але не повинні механічно включатися в основну шахову ідентичність для repetition detection.

Це розділення є критичним.

---

# 4. POSITION HASH VS POSITION IDENTITY

Hash — це представлення ідентичності, а не сама ідентичність.

SUBIT-CHESS повинен розрізняти:

**Position Identity**

та

**Position Hash**

Hash є компактним відображенням Position Identity.

Однак:

Hash Collision ≠ Position Equality

Тому алгоритмічні системи, які використовують hash для визначення повторення, повинні розуміти ризик колізій.

---

## 4.1. Zobrist Position Components

Типова архітектура позиційного hash може включати:

- piece-square keys;
- side-to-move key;
- castling-rights keys;
- en passant key.

Схематично:

H(P) = Hₚᵢₑcₑₛ ⊕ Hₛᵢdₑ ⊕ Hcₐₛₜₗᵢₙg ⊕ Hₑₚ

де XOR використовується як механізм комбінування компонентів.

Для SUBIT-CHESS критично не просто підтримувати hash.

Необхідно забезпечити:

**Hash Consistency Across State Transformations**

---

# 5. REPETITION DETECTION

Повторення позиції — це не повторення розташування фігур.

Повторення повинно визначатися відповідно до шахової ідентичності позиції.

Позиції повинні мати:

- однакове розташування фігур;
- однакову сторону, що ходить;
- однакові права на рокіровку;
- однакові актуальні en passant можливості.

---

## 5.1. Repetition Sequence

Приклад циклу:

```text
Position A
    ↓
White Move 1
    ↓
Position B
    ↓
Black Move 1
    ↓
Position C
    ↓
White Move 2
    ↓
Position D
    ↓
Black Move 2
    ↓
Position A′
```

Якщо A′ відповідає A за шаховою ідентичністю, це повторення позиції.

Однак повторення може бути:

- першим;
- другим;
- третім;
- четвертим або більше.

Тому система повинна не просто визначати:

`positionSeen`

а:

`repetitionCount(positionIdentity)`

---

# 6. THREEFOLD REPETITION

Правило триразового повторення дозволяє гравцеві вимагати нічию, коли одна й та сама позиція виникає втретє.

Важливо розрізняти:

### Claimable Draw

Нічия може бути заявлена гравцем відповідно до правил.

### Automatic Draw

Нічия автоматично встановлюється за умовами п'ятикратного повторення.

Це різні механізми.

Для engine architecture:

```text
REPETITION COUNT = 1
    → No repetition

REPETITION COUNT = 2
    → Repetition detected
    → Claimable condition may be approaching

REPETITION COUNT = 3
    → Threefold repetition claim condition

REPETITION COUNT = 5
    → Automatic draw condition
```

Точне трактування залежить від того, чи оцінюється вже поточна позиція, чи гравець може заявити нічию перед виконанням ходу, який створить повторення.

---

# 7. CLAIMABLE REPETITION VS ENGINE DECISION

Це один із найважливіших архітектурних аспектів.

Engine не повинен змішувати:

- факт наявності можливості заявити нічию;
- фактичне завершення партії;
- стратегічне рішення скористатися цією можливістю.

Виникають три рівні:

### Layer 1 — Rule Detection

Визначити, чи існує repetition condition.

### Layer 2 — Game Interface

Визначити, чи може гравець заявити draw.

### Layer 3 — Engine Strategy

Вирішити, чи варто приймати draw condition у конкретному контексті.

Для автономного SUBIT-CHESS третій рівень може бути особливо цікавим.

Наприклад, рушій може:

- прийняти нічию у програшній позиції;
- уникнути нічиєї у виграшній позиції;
- навмисно створити повторення;
- уникати повторення, якщо позиція має перспективу покращення.

Але це стратегічний шар.

Він не повинен змінювати правильність Rule Detection.

---

# 8. REPETITION SEARCH DETECTION

Repetition Detection у Search має специфічні вимоги.

Пошук створює дерево:

```text
ROOT
 ├── A
 │    ├── B
 │    │    ├── C
 │    │    └── D
 │    └── E
 └── F
      ├── G
      └── H
```

Одна позиція може повторитися:

- у поточній реальній історії;
- у поточній search path;
- у різних search branches.

Не всі ці повторення мають однаковий контекст.

---

## 8.1. Path Repetition

Позиція повторюється в поточній гілці пошуку.

Це особливо важливо для циклічних ходів.

---

## 8.2. Historical Repetition

Позиція повторюється в реальній історії партії до початку поточного пошуку.

---

## 8.3. Branch Isolation

Позиція, що виникла у sibling branch, не повинна автоматично трактуватися як повторення в іншій гілці.

Наприклад:

```text
ROOT
 ├── Branch A
 │     └── Position X
 │
 └── Branch B
       └── Position X
```

Сам факт, що X зустрічалася у Branch A, не означає repetition у Branch B.

Repetition detection повинна враховувати:

**CURRENT SEARCH PATH**

а не глобальний набір позицій, відвіданих під час пошуку.

---

# 9. REPETITION AND TRANSPOSITION TABLE

Transposition Table та repetition history виконують різні функції.

## TT

Призначена для повторного використання результатів пошуку.

## Repetition History

Призначена для визначення повторення в конкретному історичному або пошуковому контексті.

Проблема виникає, якщо TT повертає score позиції, яка в іншому контексті є repetition draw.

Тому:

**Same Position Hash ≠ Same Search Context**

Search result може залежати від:

- repetition history;
- halfmove clock;
- path-dependent conditions;
- draw claims;
- root context.

Це не означає, що TT потрібно відмовитися використовувати.

Це означає, що її результати повинні застосовуватися з правильними обмеженнями.

---

# 10. FIFTY-MOVE RULE

Правило 50 ходів визначає можливість заявити нічию, якщо протягом 50 ходів кожного гравця не було:

- pawn move;
- capture.

Відповідно, halfmove clock вимірює кількість півходів після останнього pawn move або capture.

---

## 10.1. Halfmove Clock

```text
Pawn Move
    → Halfmove Clock = 0

Capture
    → Halfmove Clock = 0

Other Move
    → Halfmove Clock += 1
```

Halfmove clock — це не fullmove number.

---

## 10.2. Claimable Draw

50 ходів кожного гравця без pawn move або capture:

100 plies.

---

## 10.3. Automatic Draw

75 ходів кожного гравця без pawn move або capture:

150 plies.

Виняток:

Якщо останній хід створив checkmate, checkmate має пріоритет над автоматичною нічиєю за 75-ходовим правилом.

---

# 11. HALFmove CLOCK — CRITICAL INTEGRITY

Halfmove clock повинен правильно оновлюватися після:

### Normal Move

+1

### Pawn Move

0

### Capture

0

### En Passant

0

### Promotion

0, оскільки це pawn move.

### Capture Promotion

0, оскільки одночасно pawn move і capture.

### Castling

+1

---

## 11.1. Undo Halfmove Clock

Undo повинен відновлювати попереднє значення.

Неправильний clock може спричинити:

- передчасну draw detection;
- пропущену draw detection;
- неправильний Search Score;
- помилкове завершення SelfPlay;
- неправильну оцінку партії.

---

# 12. FIFTY-MOVE RULE IN SEARCH

Halfmove clock має значення не лише на рівні Game Manager.

Він повинен бути доступний Search.

Розглянемо:

```text
Position A
Halfmove Clock = 98
```

Після quiet move:

```text
Position B
Halfmove Clock = 99
```

Після наступного quiet move:

```text
Position C
Halfmove Clock = 100
```

Position C може містити draw-claim condition.

Якщо Search не враховує clock, він може:

- оцінити позицію як виграшну;
- продовжувати пошук;
- ігнорувати доступну нічию.

Або, навпаки, неправильно трактувати позицію як автоматично завершену.

---

# 13. INSUFFICIENT MATERIAL

Insufficient Material — окрема категорія завершення партії.

Не можна зводити її до:

```text
PIECE COUNT <= X
```

Матеріальні конфігурації мають різну здатність створювати checkmate.

Необхідно перевірити правила для:

- King vs King;
- King + Bishop vs King;
- King + Knight vs King;
- King + Bishop vs King + Bishop;
- bishop-only configurations;
- positions where checkmate is impossible;
- positions where checkmate may be possible.

Важливо розрізняти:

**Insufficient Material Detection**

та

**Dead Position Detection**

Це не обов'язково одна й та сама функція.

---

# 14. DEAD POSITION

Dead Position — це позиція, в якій жоден гравець не може поставити checkmate за будь-якої допустимої послідовності ходів.

Це ширше поняття, ніж прості матеріальні правила.

Однак повне визначення Dead Position може бути обчислювально складним.

Тому engine architecture повинна розділяти:

### Exact Dead Position Detection

Позиція точно визначена як dead за правилами.

### Conservative Material Draw Detection

Engine розпізнає типові недостатні матеріальні конфігурації.

### Unknown

Позиція не може бути надійно класифікована.

Небезпечним є використання heuristic material shortcut як універсального доказу dead position.

---

# 15. STALEMATE

Stalemate виникає, коли:

- сторона має хід;
- король не перебуває під шахом;
- жодного легального ходу немає.

Формально:

LegalMoves(P) = ∅

і

KingNotInCheck(P)

---

## 15.1. Stalemate vs Checkmate

Checkmate:

```text
Legal Moves = 0
King in Check = TRUE
```

Stalemate:

```text
Legal Moves = 0
King in Check = FALSE
```

Це дві різні terminal states.

---

## 15.2. Search Implications

Якщо Search отримує:

```text
LegalMoves = 0
```

він повинен визначити, чи це:

- checkmate;
- stalemate.

Не можна повертати один універсальний terminal score.

---

# 16. CHECKMATE

Checkmate — найважливіший terminal state.

Умови:

- King in Check;
- Legal Moves = 0.

Terminal score повинен правильно враховувати відстань до mate.

Типова концепція:

```text
Mate Score − Search Ply
```

або

```text
−Mate Score + Search Ply
```

залежно від perspective та implementation.

Це дозволяє:

- швидше знаходити mate;
- віддавати перевагу коротшому mate;
- відкладати неминучий mate;
- коректно передавати mate score між Search Nodes.

---

# 17. TERMINAL STATE CLASSIFICATION

SUBIT-CHESS повинен мати чітку систему terminal-state класифікації.

Можлива модель:

```text
GAME STATE
│
├── ACTIVE
│
├── CHECKMATE
│
├── STALEMATE
│
├── DRAW
│   ├── THREEFOLD CLAIM
│   ├── FIVEFOLD AUTOMATIC
│   ├── FIFTY-MOVE CLAIM
│   ├── SEVENTY-FIVE-MOVE AUTOMATIC
│   ├── INSUFFICIENT MATERIAL
│   └── DEAD POSITION
│
└── INVALID POSITION
```

Важливо, щоб:

**INVALID POSITION ≠ DRAW**

Некоректна позиція не повинна автоматично перетворюватися на нічию.

---

# 18. TERMINAL STATE PRIORITY

У рушії необхідно визначити порядок перевірки terminal conditions.

Принципова проблема:

Якщо позиція одночасно задовольняє декілька умов, їхній порядок може змінити результат.

Наприклад:

- checkmate;
- 75-move automatic draw.

Checkmate повинен мати пріоритет.

Рекомендована концептуальна послідовність:

```text
1. Validate Position

2. Generate Legal Moves

3. If Legal Moves = 0
      ├── King in Check → CHECKMATE
      └── King not in Check → STALEMATE

4. Detect Automatic Draw Conditions
      ├── Fivefold Repetition
      ├── Seventy-Five Move Rule
      └── Dead Position

5. Detect Claimable Draw Conditions
      ├── Threefold Repetition
      └── Fifty Move Rule

6. Otherwise
      → ACTIVE
```

Це концептуальна схема.

Точна реалізація повинна відповідати правилам завершення партії та моделі claim handling.

---

# 19. GAME TERMINATION AND SEARCH

Search повинен правильно завершувати terminal nodes.

Неправильна архітектура:

```text
Search
    ↓
Evaluate Position
    ↓
Return Static Score
```

Якщо позиція terminal, static evaluation може бути неприйнятним.

Правильна концепція:

```text
Search Node
    ↓
Terminal State Detection
    ├── Checkmate
    ├── Stalemate
    ├── Automatic Draw
    ├── Dead Position
    └── Non-terminal
          ↓
      Search / Evaluation
```

Terminal State Detection повинна бути інтегрована в Search.

---

# 20. TERMINAL STATES AND QSEARCH

QSearch не може ігнорувати terminal states.

Наприклад, позиція може завершуватися:

- checkmate;
- stalemate;
- automatic draw.

Якщо QSearch повертає evaluation до перевірки terminal state, це може створити некоректні scores.

Особливо важливо:

- terminal state detection до stand-pat;
- check handling;
- no legal moves;
- stalemate detection;
- mate score propagation.

Цей пункт повинен перевірятися незалежно від основного Search.

---

# 21. SELFPLAY TERMINATION INTEGRITY

SelfPlay повинен мати незалежну систему завершення партії.

Можлива модель:

```text
SELFPLAY GAME
    ↓
INITIAL POSITION VALIDATION
    ↓
SEARCH
    ↓
MOVE
    ↓
POSITION UPDATE
    ↓
TERMINAL STATE DETECTION
    ├── CHECKMATE
    ├── STALEMATE
    ├── DRAW
    ├── INVALID
    └── CONTINUE
```

Критично важливо не дозволяти SelfPlay:

- продовжувати гру після checkmate;
- продовжувати гру після stalemate;
- неправильно завершувати гру через hash collision;
- плутати claimable draw з automatic draw;
- генерувати ходи в terminal state;
- записувати неправильний результат партії.

Це пов'язано з попереднім finding AUD-311-22 щодо початкової terminal-state перевірки SelfPlay.

---

# 22. HISTORY MODEL — RECOMMENDED ARCHITECTURE

Для SUBIT-CHESS рекомендована концептуальна модель історії:

```text
GAME HISTORY

Game Root
│
├── Initial Position
│
├── Move 1
│   ├── Move Data
│   ├── Position Hash
│   ├── Position State
│   └── Historical Metadata
│
├── Move 2
│   ├── Move Data
│   ├── Position Hash
│   ├── Position State
│   └── Historical Metadata
│
├── Move 3
│
└── Current Position
```

Не обов'язково зберігати повну копію Board після кожного ходу.

Можна використовувати:

- move history;
- incremental state;
- hashes;
- compact snapshots;
- reversible move records.

Але механізм історії повинен забезпечувати точне відновлення потрібного контексту.

---

# 23. SUBIT INTERPRETATION — POSITION / HISTORY / CONTEXT

Ця фаза має особливе значення для концепції SUBIT.

У шахах поточна позиція не є ізольованим об'єктом.

Вона є результатом послідовності трансформацій.

```text
INITIAL DISTINCTIONS
        ↓
LEGAL TRANSFORMATIONS
        ↓
POSITION
        ↓
HISTORY
        ↓
REPETITION
        ↓
GAME CONTEXT
        ↓
DECISION
```

У цьому сенсі Board представляє лише локальне відображення.

History формує часову структуру.

Context визначає, як поточний стан інтерпретується відносно минулого.

Це безпосередньо відповідає принципу:

**DO NOT COLLAPSE — CONTEXTUALIZE**

Не можна зводити:

- Position до Board;
- History до Hash;
- Draw до Evaluation;
- Terminal State до Score.

Ці компоненти взаємопов'язані, але не тотожні.

---

# 24. AUDIT REGISTRY — PHASE A.4

## A4-001 — Position Identity Definition

**Severity:** P1  
**Category:** Core State Architecture  
**Status:** OPEN — Specification Required

Необхідно формально визначити Position Identity.

---

## A4-002 — Repetition Hash Consistency

**Severity:** P1  
**Category:** Hash / History  
**Status:** OPEN — Verification Required

Потрібно перевірити відповідність repetition hash реальній шаховій ідентичності позиції.

---

## A4-003 — Historical Repetition Counting

**Severity:** P1  
**Category:** Game Rules  
**Status:** OPEN — Verification Required

Необхідно перевірити коректність підрахунку повторень у реальній історії.

---

## A4-004 — Search Path Repetition

**Severity:** P1  
**Category:** Search Integrity  
**Status:** OPEN — Verification Required

Необхідно перевірити ізоляцію repetition detection між search branches.

---

## A4-005 — Threefold Claim Semantics

**Severity:** P1/P2  
**Category:** Draw Rules  
**Status:** OPEN — Specification Required

Необхідно розділити claimable draw та автоматичне завершення.

---

## A4-006 — Fivefold Automatic Draw

**Severity:** P1  
**Category:** Game Termination  
**Status:** OPEN — Verification Required

---

## A4-007 — Halfmove Clock Integrity

**Severity:** P1  
**Category:** Position State  
**Status:** OPEN — Verification Required

Необхідно перевірити всі класи ходів та їхній вплив на clock.

---

## A4-008 — Fifty-Move Rule

**Severity:** P1  
**Category:** Draw Detection  
**Status:** OPEN — Verification Required

---

## A4-009 — Seventy-Five-Move Rule

**Severity:** P1  
**Category:** Automatic Termination  
**Status:** OPEN — Verification Required

---

## A4-010 — Insufficient Material Classification

**Severity:** P2  
**Category:** Draw Detection  
**Status:** OPEN — Verification Required

---

## A4-011 — Dead Position Detection

**Severity:** P2  
**Category:** Game Rules  
**Status:** OPEN — Specification Required

---

## A4-012 — Stalemate Detection

**Severity:** P1  
**Category:** Move Generation / Terminal State  
**Status:** OPEN — Verification Required

---

## A4-013 — Checkmate Detection

**Severity:** P1  
**Category:** Terminal State  
**Status:** OPEN — Verification Required

---

## A4-014 — Terminal State Priority

**Severity:** P1  
**Category:** Game Rules  
**Status:** OPEN — Specification Required

---

## A4-015 — Terminal Search Node

**Severity:** P1  
**Category:** Search Integrity  
**Status:** OPEN — Verification Required

---

## A4-016 — QSearch Terminal Handling

**Severity:** P1  
**Category:** Search  
**Status:** OPEN — Verification Required

---

## A4-017 — SelfPlay Termination

**Severity:** P1  
**Category:** Autonomous Engine Integrity  
**Status:** OPEN — Verification Required

---

## A4-018 — History Restoration

**Severity:** P1  
**Category:** State Reversibility  
**Status:** OPEN — Verification Required

---

# 25. PHASE A.4 ACCEPTANCE CRITERIA

Фаза може бути закрита лише після підтвердження:

### AC-A4-01

Position Identity формально визначена.

### AC-A4-02

Board Identity та Chess Position Identity розділені.

### AC-A4-03

Threefold Repetition коректно визначається.

### AC-A4-04

Fivefold Repetition автоматично завершує партію.

### AC-A4-05

Repetition detection не переноситься некоректно між search branches.

### AC-A4-06

Halfmove Clock коректно оновлюється.

### AC-A4-07

50-Move Claim Condition коректно визначається.

### AC-A4-08

75-Move Automatic Draw коректно визначається.

### AC-A4-09

Insufficient Material не використовується як необґрунтований universal shortcut.

### AC-A4-10

Stalemate та Checkmate розрізняються.

### AC-A4-11

Terminal State Priority формально визначений.

### AC-A4-12

QSearch правильно обробляє terminal states.

### AC-A4-13

SelfPlay завершується коректно.

### AC-A4-14

Undo відновлює Position та History.

### AC-A4-15

Terminal State Integrity підтверджена незалежними тестами.

---

# 26. PHASE A.4 — FINAL STATUS

| Component | Status |
|---|---|
| Position Identity | OPEN |
| Historical State | OPEN |
| Threefold Repetition | OPEN |
| Fivefold Repetition | OPEN |
| Repetition in Search | OPEN |
| TT Context Integrity | OPEN |
| Halfmove Clock | OPEN |
| Fifty-Move Rule | OPEN |
| Seventy-Five-Move Rule | OPEN |
| Insufficient Material | OPEN |
| Dead Position | OPEN |
| Stalemate | OPEN |
| Checkmate | OPEN |
| Terminal Priority | OPEN |
| QSearch Termination | OPEN |
| SelfPlay Termination | OPEN |
| Undo / History Integrity | OPEN |
| Runtime Tests | NOT PERFORMED |
| Acceptance | NOT GRANTED |

---

# 27. ПІДСУМОК A.4

Найважливіший висновок цієї фази:

**Шаховий рушій повинен розуміти не лише позицію, а й її історичну допустимість, часові обмеження та статус завершення.**

Board відповідає на питання:

> Де знаходяться фігури?

Position відповідає:

> Які шахові можливості існують зараз?

History відповідає:

> Як ця позиція виникла?

Game Context відповідає:

> Які правила завершення, повторення та історичні обмеження застосовуються зараз?

Search відповідає:

> Яке рішення найкраще в межах цього контексту?

Ці рівні не повинні зливатися в один score, один hash або один board representation.

---

# NEXT PHASE

## SUBIT-CHESS v3.0.11 — DEEP AUDIT PHASE A.5

### SEARCH ARCHITECTURE & RECURSIVE STATE INTEGRITY

Наступний аудит буде присвячений внутрішній логіці пошуку:

- Search Tree Integrity;
- Negamax;
- Alpha-Beta Window;
- Iterative Deepening;
- Principal Variation;
- PVS;
- TT Interaction;
- Move Ordering;
- Search Abort;
- Time Management;
- Node Counting;
- Search State Restoration;
- Recursive Context Isolation;
- Score Propagation;
- Mate Distance;
- Search Stability.

**Ключове питання A.5:**

> Чи може SUBIT-CHESS довіряти власному результату пошуку, якщо кожна рекурсивна гілка, pruning operation, TT lookup, interruption та rollback потенційно змінюють контекст, у якому цей результат був отриманий?

Це буде перехід від перевірки правильності позиції до перевірки правильності самого процесу мислення рушія.