# SUBIT-CHESS v3.0.11
# DEEP AUDIT — PHASE A.2
## ATTACK GEOMETRY · MOVE GENERATION · LEGALITY · KING SAFETY

**Audit ID:** SUBIT-CHESS-A11-002  
**Target:** v3.0.11  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Audit Domain:** Chess Core — Attack & Transformation Semantics  
**Audit Mode:** Static Logic Audit + Formal Test Specification  
**Status:** OPEN — NOT VERIFIED  
**Patch Status:** NONE

---

# 1. Мета Phase A.2

У Phase A.1 ми розглянули фундаментальне представлення шахової позиції:

- 0x88;
- Board;
- Piece Lists;
- King Squares;
- FEN;
- Position Identity;
- Hash;
- Position Integrity.

Phase A.2 переходить до наступного рівня — геометрії шахового простору та механізму визначення допустимих трансформацій.

Основне питання:

> Чи правильно SUBIT-CHESS визначає, які клітини атакуються, які ходи геометрично можливі, які ходи псевдолегальні, а які трансформації є повністю легальними?

Це критичний етап, оскільки пошуковий рушій не може компенсувати помилки генерації ходів.

Якщо шахова геометрія неправильна, Search може ефективно досліджувати неправильний простір.

---

# 2. Фундаментальне розмежування

У шаховому рушії необхідно розділяти три поняття.

## 2.1. ATTACK

Attack — це геометричне відношення між фігурою та клітиною, яку вона атакує відповідно до шахових правил.

Attack не обов'язково означає, що фігура може легально переміститися на цю клітину.

Наприклад, пішак атакує діагонально, навіть якщо відповідна клітина порожня.

Король атакує сусідні клітини, навіть якщо переміщення на деякі з них було б нелегальним через шах.

---

## 2.2. MOVE

Move — це потенційна трансформація фігури відповідно до її геометрії та правил переміщення.

Для генерації ходів враховуються:

- тип фігури;
- поточна позиція;
- зайнятість клітин;
- блокування;
- колір;
- спеціальні правила.

---

## 2.3. LEGAL MOVE

Legal Move — це хід, який не порушує шахових правил, зокрема не залишає власного короля під шахом.

Формально:

L(P) = {m ∈ M(P) | KingSafe(T(P,m))}

де:

- P — позиція;
- M(P) — множина псевдолегальних ходів;
- T(P,m) — результат трансформації позиції;
- KingSafe — умова безпеки власного короля.

Отже:

**ATTACK ≠ MOVE ≠ LEGAL MOVE**

Це розмежування повинно бути збережене в усіх модулях SUBIT-CHESS.

---

# 3. ATTACK ARCHITECTURE

Рекомендована концептуальна архітектура:

```text
POSITION
   │
   ▼
ATTACK GEOMETRY
   │
   ├── Pawn
   ├── Knight
   ├── Bishop
   ├── Rook
   ├── Queen
   └── King
   │
   ▼
ATTACK DETECTION
   │
   ▼
PSEUDO-LEGAL MOVE GENERATION
   │
   ▼
LEGALITY FILTER
   │
   ▼
LEGAL MOVE SET
```

Важливо, щоб Attack Detection не залежав від Legal Move Generation.

Інакше може виникнути циклічна залежність:

```text
Legal Moves
    ↓
Attack Detection
    ↓
Legal Moves
```

Це створює ризик рекурсивних помилок та неправильного визначення шаху.

Attack Detection повинна бути базовим механізмом геометрії.

---

# 4. AUDIT A.2.1 — PAWN ATTACK GEOMETRY

## 4.1. Семантика пішака

Пішак має асиметричну геометрію.

Його рух і атака не збігаються.

### White Pawn

Рух:

- вперед на одну клітину;
- вперед на дві клітини з початкового рангу, якщо обидві клітини вільні.

Атака:

- одна клітина по діагоналі вперед ліворуч;
- одна клітина по діагоналі вперед праворуч.

### Black Pawn

Геометрія дзеркальна.

---

## 4.2. Критичний інваріант

Пішак не атакує клітину перед собою.

Він атакує лише діагональні клітини.

Це означає, що:

```text
Pawn Movement ≠ Pawn Attack
```

---

## 4.3. Потенційний дефект

Якщо Attack Detection використовує генератор ходів пішака, виникає помилка.

Наприклад, король може стояти перед пішаком.

Пішак не має можливості рухатися вперед, якщо клітина зайнята.

Однак клітина перед пішаком не стає атакованою через блокування.

---

## 4.4. Тест A11-201 — Pawn Attack

| Сценарій | Expected |
|---|---|
| White pawn attacks forward-left | PASS |
| White pawn attacks forward-right | PASS |
| White pawn does not attack forward | PASS |
| Black pawn attacks forward-left relative to its direction | PASS |
| Black pawn attacks forward-right relative to its direction | PASS |
| Black pawn does not attack backward | PASS |
| Pawn attack independent of target occupancy | PASS |
| Pawn forward movement requires empty square | PASS |

### Особливий тест

Потрібно перевірити клітини, на яких:

- стоїть власна фігура;
- стоїть ворожа фігура;
- клітина порожня.

Attack semantics повинна бути правильною у всіх трьох випадках.

---

# 5. AUDIT A.2.2 — KNIGHT ATTACK GEOMETRY

## 5.1. Геометрія

Knight переміщується за шаблоном:

(±1, ±2)

або:

(±2, ±1)

Усього вісім потенційних напрямків.

У 0x88 representation ці напрямки можуть бути представлені константами.

---

## 5.2. Основні ризики

### RISK 1 — 0x88 boundary error

Клітина може бути поза дошкою.

### RISK 2 — File wraparound

Переміщення може помилково переходити з h-file на a-file.

### RISK 3 — Duplicate destination

Неправильна таблиця напрямків може генерувати повторні клітини.

### RISK 4 — Attack/Moves conflation

Knight attack geometry може неправильно залежати від зайнятості destination.

---

## 5.3. Тест A11-202

Для кожної клітини:

- перевірити вісім напрямків;
- перевірити off-board;
- перевірити edge squares;
- перевірити blocked destination;
- перевірити friendly destination;
- перевірити enemy destination.

### PASS

- максимум 8 геометричних напрямків;
- відсутність координат поза дошкою;
- відсутність wraparound;
- відсутність дубльованих напрямків.

---

# 6. AUDIT A.2.3 — BISHOP ATTACK RAYS

Bishop використовує чотири діагональні напрямки.

Його attack geometry визначається променями, які продовжуються до:

- межі дошки;
- першої фігури.

---

## 6.1. Ray Model

```text
BISHOP
   ↖  ↗
   ↙  ↘
```

Кожен ray повинен:

1. починатися з bishop;
2. переходити на наступну клітину;
3. перевіряти board bounds;
4. реєструвати attack;
5. перевіряти occupancy;
6. завершуватися після першої фігури.

---

## 6.2. Важливе розмежування

Якщо ray зустрічає власну фігуру:

- ця клітина може входити до attack map;
- bishop не може продовжувати ray за нею.

Якщо ray зустрічає ворожу фігуру:

- ця клітина атакована;
- bishop може захопити її;
- ray припиняється.

---

## 6.3. Тест A11-203

### BISHOP RAY

- Empty diagonal.
- Friendly blocker.
- Enemy blocker.
- Multiple blockers.
- Edge termination.
- Single-square diagonal.
- Long diagonal.
- Four simultaneous rays.

### PASS

Ray traversal припиняється на першій зайнятій клітині, але сама клітина включається до attack geometry.

---

# 7. AUDIT A.2.4 — ROOK ATTACK RAYS

Rook має чотири напрямки:

- north;
- south;
- east;
- west.

Його геометрія є базою для Queen.

---

## 7.1. Основна логіка

```text
ROOK
  ↑
← R →
  ↓
```

Кожен напрямок повинен:

- проходити до межі;
- враховувати blockers;
- включати blocker cell до attack map;
- припиняти ray після blocker.

---

## 7.2. Потенційна проблема

Неправильна обробка blocker може призвести до двох протилежних дефектів.

### Defect A

Ray припиняється до blocker.

Тоді attack на blocker не реєструється.

### Defect B

Ray продовжується після blocker.

Тоді rook може атакувати фігури крізь інші фігури.

Обидва випадки є фундаментальними порушеннями шахової геометрії.

---

## 7.3. Тест A11-204

- Horizontal ray.
- Vertical ray.
- Friendly blocker.
- Enemy blocker.
- Multiple blockers.
- Edge square.
- Rook capture.
- Rook defense.

---

# 8. AUDIT A.2.5 — QUEEN ATTACK GEOMETRY

Queen об'єднує:

- Bishop geometry;
- Rook geometry.

Формально:

AQueen(P, sq) = ABishop(P, sq) ∪ ARook(P, sq)

---

## 8.1. Основний ризик

Якщо Queen використовує окрему реалізацію, яка дублює bishop або rook logic, можливі розбіжності.

Наприклад:

- bishop ray працює правильно;
- rook ray працює правильно;
- queen ray використовує інший blocker logic.

Це створює неочевидну помилку.

---

## 8.2. Рекомендація

Queen geometry повинна використовувати ті самі фундаментальні ray traversal primitives.

Не створювати третю незалежну систему.

---

# 9. AUDIT A.2.6 — KING ATTACK GEOMETRY

King атакує всі сусідні клітини.

Геометрично:

Δrank ∈ {−1, 0, +1}

Δfile ∈ {−1, 0, +1}

за умови:

(Δrank, Δfile) ≠ (0,0)

---

## 9.1. Важливе розмежування

King Attack Map не повинна виключати клітини, які атакуються противником.

Король може геометрично атакувати таку клітину.

Однак він не може легально переміститися на неї.

Тобто:

```text
KING ATTACK
    ≠
KING LEGAL DESTINATION
```

---

## 9.2. Тест A11-206

- Eight directions.
- Board edges.
- Friendly occupancy.
- Enemy occupancy.
- Enemy king adjacency.
- Attacked destinations.

---

# 10. AUDIT A.2.7 — SLIDING ATTACKS

Bishop, Rook та Queen використовують ray-based geometry.

Цей компонент повинен бути незалежним від пошуку.

---

## 10.1. Sliding Attack Algorithm

```text
START
    ↓
INITIALIZE RAY
    ↓
NEXT SQUARE
    ↓
BOARD BOUNDS
    ├── OUT → STOP
    └── IN
          ↓
       REGISTER
          ↓
       OCCUPIED?
          ├── YES → STOP
          └── NO → CONTINUE
```

---

## 10.2. Основний інваріант

Для кожного ray:

```text
AttackSet =
    all reachable ray squares
    including first occupied square
```

Але не:

```text
AttackSet =
    all squares beyond blockers
```

---

## 10.3. Differential Testing

Для кожної sliding piece необхідно порівняти:

- attack map;
- legal move destinations;
- occupied squares;
- blocker positions.

Тестування повинно включати:

- відкриті rays;
- rays із blocker;
- кілька blockers;
- blockers різного кольору;
- крайові позиції.

---

# 11. AUDIT A.2.8 — ATTACK DETECTION

Attack Detection відповідає на питання:

> Чи атакує певна сторона задану клітину у поточній позиції?

Функціонально:

IsSquareAttacked(P, sq, color)

---

## 11.1. Важлива семантика

Attack Detection не повинна визначати атакованість через Legal Move Generation.

Це може створити рекурсію та неправильну семантику.

Наприклад, pinned piece може продовжувати атакувати клітини відповідно до геометрії, хоча його легальні ходи обмежені.

---

## 11.2. Pinned Piece

Pinned piece:

- не може переміщуватися у спосіб, що відкриває шах власному королю;
- але його attack geometry не зникає.

Це одна з найважливіших причин розділення Attack і Legal Moves.

---

## 11.3. Тест A11-208

Для кожного типу фігури:

- Attack Detection independent of Legal Move Generation.
- Pinned piece attacks.
- Friendly piece attacks.
- Enemy piece attacks.
- King adjacency.
- Sliding blockers.
- Pawn attack semantics.

---

# 12. AUDIT A.2.9 — CHECK DETECTION

Check — це стан, у якому король атакований.

Формально:

Check(P, c) = IsSquareAttacked(P, KingSquare(c), opponent(c))

---

## 12.1. Single Check

Король атакований однією фігурою.

---

## 12.2. Double Check

Король атакований двома фігурами.

У класичній шаховій логіці при double check єдиним способом усунення шаху зазвичай є переміщення короля.

---

## 12.3. Potential Defect

Якщо система визначає check лише через одну attacker, вона може неправильно обробляти:

- double check;
- simultaneous attacks;
- discovered check;
- check після special move.

---

## 12.4. Тест A11-209

- No check.
- Single check.
- Double check.
- Direct check.
- Discovered check.
- Pawn check.
- Knight check.
- Sliding check.
- King adjacency invalidity.

---

# 13. AUDIT A.2.10 — PSEUDO-LEGAL MOVE GENERATION

Pseudo-legal moves — це ходи, які відповідають геометрії фігур і базовим правилам переміщення, але ще не обов'язково гарантують безпеку власного короля.

---

## 13.1. Архітектура

```text
POSITION
    ↓
PIECE GEOMETRY
    ↓
OCCUPANCY
    ↓
BLOCKERS
    ↓
SPECIAL RULES
    ↓
PSEUDO-LEGAL MOVES
```

---

## 13.2. Move Encoding

Необхідно перевірити, чи Move Encoding зберігає всі необхідні поля:

- from;
- to;
- captured piece;
- promotion;
- special flags;
- castling;
- en passant.

Якщо move encoding використовує недостатню кількість бітів, можливі колізії.

---

## 13.3. Тест A11-210

Для кожного ходу:

- valid origin;
- valid destination;
- valid piece;
- valid color;
- valid capture;
- valid special flag;
- valid promotion.

---

# 14. AUDIT A.2.11 — LEGAL MOVE GENERATION

Legal Move Generation є критично важливим.

У найпростішій моделі:

```text
Generate Pseudo-Legal Moves
        ↓
Make Move
        ↓
Check Own King
        ↓
Unmake Move
        ↓
Keep / Reject
```

---

## 14.1. Основний інваріант

Для кожного легального ходу:

```text
AfterMove:
    OwnKing is not attacked
```

---

## 14.2. Важливі сценарії

### Pinned Piece

Фігура не може рухатися так, щоб відкривати лінію до власного короля.

### King Move

Король не може переходити на атаковану клітину.

### Capture

Після захоплення атакуючої фігури шах повинен бути усунутий.

### Blocking

Фігура повинна блокувати attack ray.

### Double Check

Потрібно коректно визначити допустимі відповіді.

---

# 15. AUDIT A.2.12 — PIN DETECTION

Pin — це обмеження трансформації фігури, що виникає через геометрію короля та атакуючої фігури.

---

## 15.1. Абсолютний pin

```text
Enemy Rook
    │
    │
Pinned Piece
    │
Own King
```

Pinned piece не може переміститися з лінії, якщо це відкриє шах.

---

## 15.2. Відносний pin

Фігура може бути обмежена через важливішу фігуру, але не через короля.

Це не абсолютна шахова нелегальність.

---

## 15.3. Ризик

Якщо pin detection використовується для pruning, але його логіка неправильна, система може:

- пропускати легальні ходи;
- генерувати нелегальні ходи;
- неправильно оцінювати мобільність;
- спотворювати structural relations.

---

## 15.4. Тест A11-212

- Absolute pin.
- Relative pin.
- Pin by rook.
- Pin by bishop.
- Pin by queen.
- Multiple pinned pieces.
- Pin removal.
- Pin creation after move.

---

# 16. AUDIT A.2.13 — KING SAFETY

King Safety не є лише перевіркою поточного шаху.

Вона включає:

- attacked squares;
- king mobility;
- escape squares;
- blockers;
- enemy attacks;
- adjacent enemy king;
- castling legality.

---

## 16.1. Ризик

Якщо King Safety використовується одночасно для:

- Legal Move Generation;
- Evaluation;
- Structural Analysis;

необхідно визначити, чи ці модулі використовують однакову attack semantics.

---

## 16.2. Рекомендація

Розділити:

```text
KING LEGALITY
```

та:

```text
KING EVALUATION
```

Legal King Safety повинна бути детермінованою та строгою.

Evaluation King Safety може використовувати:

- attacked zones;
- exposure;
- pawn shield;
- escape squares;
- mobility;
- king proximity.

Однак Evaluation не повинна змінювати Legal King Safety.

---

# 17. AUDIT A.2.14 — DISCOVERED ATTACK

Discovered Attack виникає, коли переміщення blocker відкриває attack ray іншої фігури.

---

## 17.1. Геометрія

```text
Attacker
    │
    │
Blocker
    │
    │
Target
```

Після переміщення blocker:

```text
Attacker
    │
    │
    │
    │
Target
```

---

## 17.2. Основні сценарії

- discovered check;
- discovered attack;
- discovered capture;
- double attack;
- discovered mate.

---

## 17.3. Ризик у v3.0.11

Попередній аудит виявив обмеження discover detection, пов'язане з перевіркою найближчої клітини після blocker.

Це може призвести до false negative.

---

## 17.4. Тест A11-214

Позиції повинні включати:

- blocker між rook та target;
- blocker між bishop та target;
- blocker між queen та target;
- blocker, що переміщується;
- blocker, що захоплює;
- multiple blockers;
- відкриття ray на різну дистанцію.

### PASS

Discover Detection повинна аналізувати повний ray, а не лише локальну сусідню клітину.

---

# 18. AUDIT A.2.15 — DOUBLE ATTACK

Double Attack — це ситуація, у якій один хід створює дві або більше загроз.

Це не обов'язково fork.

---

## 18.1. Розмежування

### Double Attack

Дві загрози.

### Fork

Атакуюча фігура атакує декілька цілей.

### Discovered Double Attack

Переміщення однієї фігури відкриває дві загрози.

### Double Check

Король атакований двома фігурами.

Ці поняття повинні мати різні семантичні представлення.

---

# 19. AUDIT A.2.16 — MOVE GENERATION COMPLETENESS

Критичний тест:

Чи генератор створює всі легальні ходи?

---

## 19.1. False Negative

Легальний хід не генерується.

Це особливо небезпечно.

Search не може дослідити хід, якого не існує у move list.

---

## 19.2. False Positive

Нелегальний хід генерується.

Якщо він потрапляє до Search без коректного legality filtering, рушій може прийняти неправильне рішення.

---

## 19.3. Основна метрика

Move Generation Correctness:

MG = CorrectMoves / ExpectedMoves

Для сертифікованого core:

MG = 1

Тобто:

- 100% legal moves;
- 0 missing;
- 0 illegal.

---

# 20. TEST REGISTRY — PHASE A.2

## GROUP A — PAWN

| ID | Test |
|---|---|
| A11-201-01 | Pawn attack forward-left |
| A11-201-02 | Pawn attack forward-right |
| A11-201-03 | Pawn non-attack forward |
| A11-201-04 | Pawn non-attack backward |
| A11-201-05 | Pawn attack independent of occupancy |
| A11-201-06 | Pawn blocked movement |

## GROUP B — KNIGHT

| ID | Test |
|---|---|
| A11-202-01 | Eight knight directions |
| A11-202-02 | Edge squares |
| A11-202-03 | Corner squares |
| A11-202-04 | No wraparound |
| A11-202-05 | No duplicates |

## GROUP C — SLIDING PIECES

| ID | Test |
|---|---|
| A11-203-01 | Bishop ray |
| A11-203-02 | Rook ray |
| A11-203-03 | Queen ray |
| A11-203-04 | Friendly blocker |
| A11-203-05 | Enemy blocker |
| A11-203-06 | Multiple blockers |
| A11-203-07 | Ray termination |

## GROUP D — KING

| ID | Test |
|---|---|
| A11-206-01 | King geometry |
| A11-206-02 | Edge |
| A11-206-03 | Enemy attacks |
| A11-206-04 | Friendly occupancy |
| A11-206-05 | King adjacency |

## GROUP E — ATTACK DETECTION

| ID | Test |
|---|---|
| A11-208-01 | Pawn attacks |
| A11-208-02 | Knight attacks |
| A11-208-03 | Bishop attacks |
| A11-208-04 | Rook attacks |
| A11-208-05 | Queen attacks |
| A11-208-06 | King attacks |
| A11-208-07 | Pinned-piece attack |
| A11-208-08 | Blocked-ray attack |

## GROUP F — CHECK

| ID | Test |
|---|---|
| A11-209-01 | No check |
| A11-209-02 | Single check |
| A11-209-03 | Double check |
| A11-209-04 | Discovered check |
| A11-209-05 | Pawn check |
| A11-209-06 | Knight check |
| A11-209-07 | Sliding check |

## GROUP G — LEGAL MOVES

| ID | Test |
|---|---|
| A11-210-01 | Legal move filtering |
| A11-210-02 | Pinned piece |
| A11-210-03 | King move safety |
| A11-210-04 | Capture resolves check |
| A11-210-05 | Blocking resolves check |
| A11-210-06 | Double check response |
| A11-210-07 | No illegal king exposure |

## GROUP H — DISCOVER

| ID | Test |
|---|---|
| A11-214-01 | Rook discover |
| A11-214-02 | Bishop discover |
| A11-214-03 | Queen discover |
| A11-214-04 | Long ray |
| A11-214-05 | Multiple blockers |
| A11-214-06 | Discovered check |

---

# 21. ACCEPTANCE CRITERIA A.2

Phase A.2 не може бути прийнята, якщо хоча б один із фундаментальних критеріїв не виконаний.

### AC-A2-01

Attack Detection незалежна від Legal Move Generation.

### AC-A2-02

Pawn attack semantics правильна.

### AC-A2-03

Knight geometry повністю відповідає шаховим правилам.

### AC-A2-04

Sliding rays коректно враховують blockers.

### AC-A2-05

King attack geometry не змішується з king legal destinations.

### AC-A2-06

Check Detection коректно обробляє single та double check.

### AC-A2-07

Legal Move Generation не допускає відкриття шаху власному королю.

### AC-A2-08

Pinned pieces обробляються правильно.

### AC-A2-09

Discover Detection аналізує повну геометрію ray.

### AC-A2-10

Move Generation не має false positives або false negatives у тестових наборах.

---

# 22. КРИТИЧНА МЕЖА МІЖ ШАХОВИМ ЯДРОМ І SUBIT

Тут необхідно сформулювати фундаментальний принцип майбутньої архітектури.

SUBIT-CHESS може мати власну інтерпретацію:

- attack relations;
- connectivity;
- vulnerability;
- potential;
- structure;
- context;
- transformation.

Однак ці інтерпретації не повинні змінювати базову шахову геометрію.

Правила шахів повинні залишатися незалежним invariant layer.

```text
CHESS REALITY
    │
    ├── Legal Geometry
    ├── Attack Semantics
    ├── Move Rules
    ├── King Safety
    └── Terminal Rules
            │
            ▼
       SUBIT ANALYSIS
            │
    ├── Structural
    ├── Contextual
    ├── Relational
    ├── Temporal
    └── Adaptive
            │
            ▼
        DECISION
```

Це означає, що SUBIT може змінювати те, **як рушій інтерпретує позицію**, але не те, **які ходи є легальними**.

---

# 23. PHASE A.2 — FINDINGS SUMMARY

На цьому етапі важливо не створювати хибне враження, що всі перелічені ризики вже є підтвердженими багами.

| Audit Area | Статус |
|---|---|
| Pawn attack semantics | Потребує незалежної перевірки |
| Knight geometry | Потребує тестування |
| Bishop rays | Потребує тестування |
| Rook rays | Потребує тестування |
| Queen rays | Потребує тестування |
| King attacks | Потребує тестування |
| Sliding blockers | Потребує тестування |
| Attack detection | Потребує диференційної перевірки |
| Check detection | Потребує перевірки |
| Double check | Потребує перевірки |
| Pseudo-legal generation | Потребує перевірки |
| Legal move generation | Потребує перевірки |
| Pin detection | Потребує перевірки |
| King safety | Потребує перевірки |
| Discover detection | Є раніше виявлене обмеження |
| Move completeness | Не підтверджена |

**Жоден із тестів цього етапу фактично не запускався.**

---

# 24. FINAL VERDICT — PHASE A.2

## ATTACK GEOMETRY

**OPEN — VERIFICATION REQUIRED**

## MOVE GENERATION

**OPEN — VERIFICATION REQUIRED**

## LEGALITY

**OPEN — VERIFICATION REQUIRED**

## KING SAFETY

**OPEN — VERIFICATION REQUIRED**

## DISCOVER DETECTION

**POTENTIAL DEFECT PREVIOUSLY IDENTIFIED**

## OVERALL

# A.2 — NOT CERTIFIED

---

# 25. Наступний етап

Наступним логічним кроком буде:

# SUBIT-CHESS v3.0.11 — DEEP AUDIT A.3
## SPECIAL MOVE TRANSFORMATIONS

### 1. CASTLING

- Castling rights;
- king movement;
- rook movement;
- occupancy;
- attacked transit square;
- attacked destination;
- castling through check;
- castling while in check;
- rook displacement;
- make/unmake.

### 2. EN PASSANT

- target square;
- captured pawn;
- legal generation;
- discovered attack;
- king safety;
- hash;
- FEN;
- make/unmake.

### 3. PROMOTION

- promotion piece selection;
- queen;
- rook;
- bishop;
- knight;
- capture promotion;
- move encoding;
- evaluation;
- SAN;
- make/unmake.

### 4. SPECIAL MOVE STATE

- rights persistence;
- irreversible transformations;
- state rollback;
- hash synchronization;
- history.

Цей етап буде особливо критичним, оскільки Castling, En Passant та Promotion — не просто додаткові ходи.

Вони змінюють структуру позиції за правилами, які мають бути інтегровані одночасно в Board, Piece Lists, Hash, King Safety, Move Generation та Search.

Саме тут ми зможемо перейти від перевірки звичайної шахової геометрії до повної перевірки **трансформаційної цілісності SUBIT-CHESS**.