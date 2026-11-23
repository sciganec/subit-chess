# SUBIT-CHESS v3.0.11
# DEEP AUDIT — PHASE A.1
## POSITION CORE · FEN VALIDATION · 0x88 REPRESENTATION · PIECE-LIST INTEGRITY

**Audit ID:** SUBIT-CHESS-A11-001  
**Target Version:** v3.0.11  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Audit Type:** Deep Structural & Correctness Audit  
**Phase:** A — Chess Core Integrity  
**Status:** OPEN  
**Mode:** Audit only — no patches

---

# 1. Мета аудиту

Цей етап переходить від загального аудиту v3.0.11 до фундаментального аналізу внутрішнього представлення шахової позиції.

Об'єктом дослідження є не пошуковий алгоритм і не оцінювання.

Ми перевіряємо найнижчий рівень, на якому шахова реальність перетворюється на структуру даних.

Основне питання:

> Чи може SUBIT-CHESS гарантовано зберігати, інтерпретувати та трансформувати шахову позицію без втрати інформації, неоднозначності або внутрішнього розходження станів?

У шаховому рушії позиція є джерелом істини.

Якщо її представлення неправильне, будь-який наступний результат стає потенційно недостовірним:

- Legal Move Generation.
- Attack Detection.
- Search.
- Evaluation.
- Structural Analysis.
- Contextual Analysis.
- Self-Play.
- Decision Certificate.

Тому аудит Position Core повинен проводитися до аудиту Search та SUBIT Structural Layer.

---

# 2. POSITION CORE — АРХІТЕКТУРНА МОДЕЛЬ

Шахова позиція не повинна розглядатися як просто масив із 64 клітин.

Вона являє собою комплексний стан.

Формально:

P = (B, S, C, E, H, F, K, L, Z)

де:

- B — board representation;
- S — side to move;
- C — castling rights;
- E — en passant state;
- H — halfmove clock;
- F — fullmove number;
- K — king positions;
- L — piece lists;
- Z — position hash.

У більш розвиненій архітектурі можна додатково включити:

- repetition history;
- search history;
- evaluation state;
- position provenance;
- contextual state.

Однак ці компоненти не повинні порушувати базову семантику шахової позиції.

---

## 2.1. Базовий інваріант позиції

Усі представлення позиції повинні відповідати одному стану.

```text
POSITION P
    │
    ├── Board
    ├── Piece Lists
    ├── King Squares
    ├── Hash
    ├── Side to Move
    ├── Castling Rights
    └── En Passant
```

Якщо одна з компонентів змінюється, залежні структури повинні бути синхронізовані.

Наприклад:

```text
Board[square] = WHITE_QUEEN
```

повинно узгоджуватися з:

```text
White piece list contains square
White queen count includes piece
King state remains correct
Hash includes corresponding piece-square key
```

Це не просто вимога зручності.

Це вимога цілісності стану.

---

# 3. AUDIT A.1.1 — 0x88 BOARD REPRESENTATION

## 3.1. Принцип 0x88

0x88 — це представлення шахової дошки в 128-комірковому адресному просторі.

Дошка 8×8 займає лише частину цього простору.

Кожна координата представлена двома компонентами:

- файл — 0..7;
- ранг — 0..7.

Координата:

sq = rank × 16 + file

або:

sq = (rank << 4) | file

---

## 3.2. Структура

```text
0x00  0x01  0x02  0x03  0x04  0x05  0x06  0x07
0x08  0x09  0x0A  0x0B  0x0C  0x0D  0x0E  0x0F
0x10  0x11  0x12  0x13  0x14  0x15  0x16  0x17
...
0x70  0x71  0x72  0x73  0x74  0x75  0x76  0x77
```

Кожен ранг починається з нового 16-байтового блока.

Клітини 0x08–0x0F не належать дошці.

Клітини 0x78–0x7F також не належать дошці.

---

## 3.3. Off-board detection

Основна властивість 0x88:

```js
(sq & 0x88) !== 0
```

означає, що координата перебуває за межами шахової дошки.

Це дозволяє перевіряти геометрію руху без окремої перевірки файлу та рангу.

Наприклад:

```text
a1 = 0x00
h1 = 0x07
a2 = 0x10
h8 = 0x77
```

Якщо переміщення створює:

```text
0x08
```

то:

```text
0x08 & 0x88 ≠ 0
```

і координата недопустима.

---

## 3.4. Переваги 0x88

- швидка перевірка меж;
- прості напрямки руху;
- ефективні ray traversal;
- невеликий memory footprint;
- зручне представлення координат;
- ефективна генерація ходів.

---

## 3.5. Критичний аудит

Необхідно перевірити, чи всі модулі використовують однакову координатну конвенцію.

Потенційні проблеми:

- одна функція використовує rank-first;
- інша file-first;
- одна використовує 0x88;
- інша — 0..63;
- Structural Layer використовує інше кодування;
- UI використовує іншу орієнтацію.

У результаті можливе відображення:

```text
Engine square
    ↓
Structural square
    ↓
UI square
```

із різними значеннями.

---

## 3.6. AUDIT TEST A11-001

### BOARD BOUNDS

| Test | Input | Expected |
|---|---|---|
| A11-001-01 | 0x00 | Valid |
| A11-001-02 | 0x07 | Valid |
| A11-001-03 | 0x70 | Valid |
| A11-001-04 | 0x77 | Valid |
| A11-001-05 | 0x08 | Invalid |
| A11-001-06 | 0x0F | Invalid |
| A11-001-07 | 0x78 | Invalid |
| A11-001-08 | 0x7F | Invalid |
| A11-001-09 | 0x88 | Invalid |
| A11-001-10 | 0xFF | Invalid |

**Acceptance Criterion:**

Усі допустимі координати повинні належати множині:

S = {sq | (sq & 0x88) = 0}

---

# 4. AUDIT A.1.2 — BOARD ARRAY INTEGRITY

## 4.1. Board as source of truth

Основний масив board повинен забезпечувати однозначне представлення кожної клітини.

Для кожної допустимої координати:

```text
board[sq] ∈
{
    EMPTY,
    WHITE_PAWN,
    WHITE_KNIGHT,
    WHITE_BISHOP,
    WHITE_ROOK,
    WHITE_QUEEN,
    WHITE_KING,
    BLACK_PAWN,
    BLACK_KNIGHT,
    BLACK_BISHOP,
    BLACK_ROOK,
    BLACK_QUEEN,
    BLACK_KING
}
```

---

## 4.2. Основні інваріанти

### INV-BOARD-01

Кожна допустима клітина має одне визначене значення.

### INV-BOARD-02

На одній клітині не можуть одночасно знаходитися дві фігури.

### INV-BOARD-03

Недопустимі координати не повинні містити шахових фігур.

### INV-BOARD-04

Board representation повинен відповідати Piece List.

### INV-BOARD-05

Board representation повинен відповідати King Square.

### INV-BOARD-06

Board representation повинен відповідати Zobrist Hash.

---

## 4.3. Перевірка невикористаних клітин 0x88

Якщо board array має 128 позицій, 64 клітини є недопустимими координатами.

Необхідно перевірити:

- чи вони залишаються EMPTY;
- чи не можуть бути модифіковані MakeMove;
- чи не використовуються Attack Detection;
- чи не включаються до Piece Lists;
- чи не потрапляють до Structural Layer.

### Тест

```text
For every square sq:

if sq & 0x88:
    board[sq] must be EMPTY
```

---

# 5. AUDIT A.1.3 — PIECE-LIST INTEGRITY

Цей компонент має особливе значення.

Piece Lists використовуються для оптимізації:

- генерації ходів;
- оцінювання;
- пошуку короля;
- material counting;
- mobility;
- structural analysis.

---

## 5.1. Board і Piece List

Board:

```text
board[square] = piece
```

Piece List:

```text
pieceList[color][index] = square
```

Обидва представлення описують одну позицію.

Тому:

```text
Board → Piece Lists
```

і:

```text
Piece Lists → Board
```

повинні бути взаємно узгодженими.

---

## 5.2. Основний інваріант

Для кожної фігури на board:

```text
board[sq] = piece
```

повинен існувати відповідний запис у Piece List.

І навпаки:

для кожного запису Piece List:

```text
pieceList[color][i] = sq
```

board повинен містити відповідну фігуру.

---

## 5.3. Формальна перевірка

Нехай:

B(c, t) — множина клітин, на яких board містить фігури кольору c та типу t.

L(c, t) — множина клітин, отримана через Piece Lists.

Тоді:

B(c, t) = L(c, t)

для всіх:

c ∈ {WHITE, BLACK}

t ∈ {PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING}

---

## 5.4. Потенційна проблема дублювання

Piece List може містити:

```text
[12, 28, 35, 35]
```

Тоді клітина 35 може бути включена двічі.

Це потенційно призводить до:

- подвійної генерації ходів;
- повторного оцінювання;
- неправильного підрахунку матеріалу;
- дублювання structural vertices.

---

## 5.5. Потенційна проблема пропущеної фігури

Board:

```text
WHITE_ROOK at 0x00
WHITE_ROOK at 0x07
```

Piece List:

```text
[0x00]
```

Тоді одна тура існує у board, але не існує в Piece List.

Можливі наслідки:

- тура не генерує ходи;
- матеріал обчислюється неправильно;
- структурний аналіз її не бачить.

---

## 5.6. AUDIT TEST A11-002

Для кожного кольору:

1. Побудувати множину фігур із board.
2. Побудувати множину фігур із Piece List.
3. Порівняти.
4. Виявити дублікати.
5. Виявити пропущені записи.
6. Виявити неправильний color/type.
7. Перевірити king square.

### PASS

```text
BOARD SET = PIECE LIST SET
DUPLICATES = 0
MISSING = 0
EXTRA = 0
```

---

# 6. AUDIT A.1.4 — PIECE-LIST CAPACITY

**Finding: A11-003**  
**Severity: P1/P2**  
**Status: Confirmed architectural mismatch**

Якщо внутрішні Piece Lists мають місткість 40 фігур на колір, необхідно визначити, чи FEN validator гарантує, що позиція не перевищує цю місткість.

Стандартна шахова позиція має максимум 16 фігур кожного кольору на початку партії.

Однак FEN не є автоматично гарантією того, що позиція походить із легальної шахової партії.

---

## 6.1. Сценарій

```text
FEN
    ↓
Validator accepts
    ↓
Position loader
    ↓
Piece List
    ↓
Capacity exceeded
```

Проблема виникає через розрив контракту.

---

## 6.2. Важливе уточнення

Максимальна кількість фігур у легальній шаховій позиції не дорівнює максимальній кількості фігур у довільно сформованому FEN.

Під час promotion кількість фігур не збільшується.

Пішак трансформується у фігуру.

Тому в стандартній легальній партії загальна кількість фігур одного кольору не може перевищувати 16.

Однак якщо система дозволяє композиційні позиції, вона може отримати FEN із більшою кількістю фігур.

Це необхідно враховувати.

---

## 6.3. Рекомендовані режими

### MODE 1 — LEGAL POSITION

Підтримуються лише позиції, які можуть відповідати легальному шаховому стану.

### MODE 2 — COMPOSITION POSITION

Підтримуються композиційні позиції.

### MODE 3 — RAW FEN

Приймаються FEN із мінімальною структурною перевіркою.

Для кожного режиму повинні бути визначені обмеження.

Не можна використовувати одну перевірку для всіх трьох режимів без явного контракту.

---

# 7. AUDIT A.1.5 — KING SQUARE SYNCHRONIZATION

King Square може бути збережений окремо для прискорення:

- Check Detection;
- Legal Move Generation;
- Evaluation;
- Search.

Однак це створює додатковий state.

---

## 7.1. Інваріант

```text
kingSq[WHITE]
    =
the square containing WHITE_KING

kingSq[BLACK]
    =
the square containing BLACK_KING
```

---

## 7.2. Потенційні помилки

### Помилка 1

Король переміщується.

Board оновлено.

King Square не оновлено.

### Помилка 2

Король захоплений у некоректній композиційній позиції.

King Square продовжує вказувати на стару клітину.

### Помилка 3

Unmake відновлює board, але не kingSq.

### Помилка 4

Castling переміщує короля, але King Square оновлюється лише для звичайних ходів.

---

## 7.3. Тест

Для кожної позиції:

```text
Find king on board
Compare with kingSq
```

Для кожної трансформації:

```text
MakeMove
Validate kingSq

UnmakeMove
Validate kingSq
```

### PASS

Обидва значення завжди відповідають board representation.

---

# 8. AUDIT A.1.6 — PIECE TYPE AND COLOR ENCODING

SUBIT-CHESS використовує внутрішнє кодування фігур.

Необхідно перевірити, чи всі модулі використовують однакову семантику.

---

## 8.1. Мінімальні вимоги

Для кожної фігури:

```text
Piece
    ├── Color
    ├── Type
    └── Square
```

Color і Type повинні бути незалежно визначені.

---

## 8.2. Ризики

- неправильний color extraction;
- неправильний type extraction;
- color collision;
- EMPTY інтерпретується як фігура;
- signed integer behavior;
- арифметичне змішування color і type;
- неправильна інтерпретація у Structural Layer.

---

## 8.3. Рекомендований тест

Для всіх допустимих значень:

```text
Decode(Encode(color, type))
=
(color, type)
```

Це має виконуватися для всіх 12 типів шахових фігур.

---

# 9. AUDIT A.1.7 — POSITION LOAD / POSITION RESET

Позиція повинна завантажуватися атомарно.

---

## 9.1. Небезпечна модель

```text
Load FEN
    ↓
Modify Board
    ↓
Update Piece Lists
    ↓
Error
```

Якщо помилка виникає після часткового оновлення, Position може залишитися у проміжному стані.

---

## 9.2. Правильна модель

```text
INPUT FEN
    ↓
PARSE
    ↓
VALIDATE
    ↓
BUILD TEMPORARY POSITION
    ↓
VERIFY INVARIANTS
    ↓
COMMIT
```

Якщо validation fails:

```text
ROLLBACK
```

Попередня позиція не повинна бути частково пошкоджена.

---

## 9.3. Тест

1. Завантажити коректну позицію.
2. Зберегти snapshot.
3. Спробувати завантажити некоректний FEN.
4. Перевірити результат.
5. Переконатися, що попередній state залишився незмінним або система перейшла до явно визначеного error state.

---

# 10. AUDIT A.1.8 — POSITION SERIALIZATION

FEN serializer повинен бути незалежним від внутрішнього представлення.

---

## 10.1. Round-trip invariant

Для позиції P:

```text
P
    ↓
Serialize FEN
    ↓
Parse FEN
    ↓
P'
```

Необхідно:

```text
P' ≡ P
```

Еквівалентність включає:

- board;
- side;
- castling;
- en passant;
- halfmove;
- fullmove.

---

## 10.2. Hash requirement

Якщо hash є позиційним hash:

```text
Hash(P') = Hash(P)
```

Якщо hash включає додатковий контекст, його семантика повинна бути визначена окремо.

---

# 11. AUDIT A.1.9 — POSITION HASH CONSISTENCY

Hash не є просто числом.

Він повинен бути функцією внутрішнього стану.

---

## 11.1. Основний інваріант

```text
IncrementalHash(P)
    =
RecomputedHash(P)
```

Для кожної трансформації.

---

## 11.2. Тест

```text
Initial Position
    ↓
Calculate Hash H₀

Move
    ↓
Incremental Hash H₁

Recompute Hash H₁'

    ↓

H₁ = H₁'
```

Після Unmake:

```text
H₀ = H₀'
```

---

## 11.3. Компоненти hash

Необхідно перевірити, чи hash коректно включає:

- piece-square;
- side to move;
- castling rights;
- en passant.

Необхідно також визначити, чи en passant включається лише тоді, коли він реально має значення для легальних ходів.

Це питання семантики hash.

---

# 12. AUDIT A.1.10 — POSITION IDENTITY

SUBIT-CHESS повинен мати чітке визначення того, що означає однакова позиція.

---

## 12.1. Board Identity

Однакове розташування фігур.

---

## 12.2. Chess Position Identity

Однакові:

- фігури;
- клітини;
- side to move;
- castling rights;
- en passant rights.

---

## 12.3. Search State Identity

Chess Position Identity плюс:

- repetition context;
- halfmove clock;
- інші фактори, які можуть впливати на результат пошуку.

---

## 12.4. SUBIT Context Identity

Search State плюс:

- структурна інформація;
- контекст;
- історія;
- параметри метаконтролера.

Ці рівні не повинні автоматично ототожнюватися.

---

# 13. POSITION CORE TEST REGISTRY

Нижче наведено базовий реєстр для A.1.

## GROUP A — BOARD GEOMETRY

| ID | Test | Expected |
|---|---|---|
| A11-001 | 0x88 valid squares | 64 |
| A11-002 | Invalid squares | 64 |
| A11-003 | Valid bounds | PASS |
| A11-004 | Invalid bounds | PASS |
| A11-005 | No pieces on invalid squares | PASS |

## GROUP B — BOARD STATE

| ID | Test | Expected |
|---|---|---|
| A11-010 | Empty square | EMPTY |
| A11-011 | Occupied square | Exactly one piece |
| A11-012 | Board consistency | PASS |
| A11-013 | Invalid square | Rejected |
| A11-014 | Board reset | PASS |

## GROUP C — PIECE LIST

| ID | Test | Expected |
|---|---|---|
| A11-020 | Board → Piece List | Exact match |
| A11-021 | Piece List → Board | Exact match |
| A11-022 | Duplicate detection | 0 duplicates |
| A11-023 | Missing piece detection | 0 missing |
| A11-024 | Piece color consistency | PASS |
| A11-025 | Piece type consistency | PASS |

## GROUP D — KING STATE

| ID | Test | Expected |
|---|---|---|
| A11-030 | White King | Exactly one |
| A11-031 | Black King | Exactly one |
| A11-032 | King Square consistency | PASS |
| A11-033 | King movement update | PASS |
| A11-034 | King unmake restoration | PASS |

## GROUP E — FEN

| ID | Test | Expected |
|---|---|---|
| A11-040 | Valid FEN | Accepted |
| A11-041 | Invalid rank count | Rejected |
| A11-042 | Invalid symbol | Rejected |
| A11-043 | Invalid field count | Rejected |
| A11-044 | Invalid castling | Rejected or normalized |
| A11-045 | Invalid en passant | Rejected or normalized |
| A11-046 | Invalid numeric fields | Rejected |
| A11-047 | Piece capacity overflow | Rejected |
| A11-048 | Noncanonical FEN | Defined behavior |

## GROUP F — POSITION ROUND-TRIP

| ID | Test | Expected |
|---|---|---|
| A11-050 | Position → FEN → Position | Equivalent |
| A11-051 | Hash preservation | PASS |
| A11-052 | Castling preservation | PASS |
| A11-053 | EP preservation | PASS |
| A11-054 | Clock preservation | PASS |

---

# 14. ACCEPTANCE CRITERIA A.1

Phase A.1 може бути прийнята лише після виконання таких умов.

### AC-A11-01

0x88 geometry correctness.

### AC-A11-02

Board representation consistency.

### AC-A11-03

Piece List consistency.

### AC-A11-04

King Square consistency.

### AC-A11-05

FEN capacity safety.

### AC-A11-06

FEN parser transactional safety.

### AC-A11-07

FEN serialization round-trip.

### AC-A11-08

Position hash consistency.

### AC-A11-09

Position identity semantics formally defined.

### AC-A11-10

Усі тестові сценарії мають реальні результати PASS/FAIL.

До цього моменту:

```text
PHASE A.1 STATUS = OPEN
```

---

# 15. AUDIT A.1 — РЕЄСТР ВИЯВЛЕНИХ РИЗИКІВ

| ID | Risk | Severity | Classification |
|---|---|---|---|
| A11-R01 | Board/0x88 inconsistency | P1 | Verification |
| A11-R02 | Board/PieceList mismatch | P1 | Verification |
| A11-R03 | PieceList capacity overflow | P1/P2 | Confirmed architectural mismatch |
| A11-R04 | King square desynchronization | P1 | Verification |
| A11-R05 | Partial FEN load | P1 | Verification |
| A11-R06 | Noncanonical FEN | P3 | Confirmed |
| A11-R07 | Position hash mismatch | P1 | Verification |
| A11-R08 | Serialization loss | P1 | Verification |
| A11-R09 | Position identity ambiguity | P2 | Design |
| A11-R10 | Structural square mapping divergence | P1 | Cross-module verification |

---

# 16. AUDIT A.1 — КЛЮЧОВА АРХІТЕКТУРНА РЕКОМЕНДАЦІЯ

Я рекомендую запровадити у SUBIT-CHESS незалежний механізм:

# POSITION INTEGRITY VALIDATOR

Це не пошуковий модуль.

Це не evaluation.

Це не structural intelligence.

Це незалежний механізм перевірки внутрішнього стану.

Його функція:

```text
ValidatePosition(P)
```

повинна перевіряти:

```text
BOARD
    ↕
PIECE LIST
    ↕
KING SQUARE
    ↕
HASH
    ↕
FEN STATE
    ↕
POSITION METADATA
```

---

## 16.1. Концептуальна реалізація

```text
POSITION INTEGRITY VALIDATOR

INPUT:
    Position P

CHECK:
    Board Geometry
    Piece Encoding
    Piece Lists
    King Squares
    Material Counts
    Castling State
    En Passant State
    Hash
    Position Metadata

OUTPUT:

    VALID
    INVALID
    or
    INVALID WITH DIAGNOSTIC REPORT
```

---

## 16.2. Diagnostic Report

```text
POSITION INTEGRITY REPORT

Position ID: 001

Board:
    PASS

Piece Lists:
    PASS

King Squares:
    PASS

Material:
    PASS

Castling:
    PASS

En Passant:
    PASS

Hash:
    PASS

FEN:
    PASS

Structural Mapping:
    PASS

FINAL:
    VALID
```

У разі помилки:

```text
POSITION INTEGRITY REPORT

Board:
    PASS

Piece Lists:
    FAIL

Detected:
    WHITE_ROOK at 0x04
    Missing from Piece List

Hash:
    FAIL

FINAL:
    INVALID
```

---

# 17. Чому це особливо важливо для SUBIT

У традиційному шаховому рушії позиція часто використовується переважно як основа для генерації ходів та оцінювання.

У SUBIT-CHESS позиція потенційно використовується одночасно для:

- шахової геометрії;
- матеріального аналізу;
- структурних графів;
- відношень;
- hyperrelations;
- contextual state;
- метаконтролера;
- decision certificate.

Тобто одна й та сама позиція може породжувати декілька різних представлень.

Тому необхідно гарантувати:

```text
ONE POSITION
    ↓
MULTIPLE REPRESENTATIONS
    ↓
ZERO SEMANTIC DIVERGENCE
```

Це один із фундаментальних принципів, який може стати основою SUBIT-CHESS.

---

# 18. FINAL STATUS — AUDIT A.1

## POSITION CORE

**STATUS: OPEN**

### 0x88 Geometry

Потребує повного незалежного тестування.

### Board Representation

Потребує перевірки всіх інваріантів.

### Piece Lists

Потребують differential validation.

### Piece Capacity

Виявлено невідповідність між можливостями validator і внутрішньою місткістю.

### King Squares

Потребують перевірки синхронізації.

### FEN

Потребує перевірки:

- strict validation;
- capacity;
- atomic loading;
- canonical serialization.

### Hash

Потребує differential verification.

### Position Identity

Потребує формального розділення рівнів ідентичності.

### Structural Mapping

Потребує гарантії відсутності колізій між шаховими координатами та структурними вершинами.

---

# 19. НАСТУПНИЙ ЕТАП

Після Position Core логічно перейти до:

# SUBIT-CHESS v3.0.11 — DEEP AUDIT A.2

## ATTACK GEOMETRY & MOVE GENERATION

Наступний аудит повинен охопити:

- Attack Maps;
- Sliding Attacks;
- Knight Geometry;
- Pawn Attack Semantics;
- King Attack Detection;
- Check Detection;
- Double Check;
- Pins;
- Pseudo-Legal Moves;
- Legal Moves;
- King Safety;
- Discovered Attacks;
- Special Move Geometry.

Особливу увагу необхідно приділити фундаментальному розмежуванню:

**ATTACK ≠ MOVE ≠ LEGAL MOVE**

Ці три поняття часто помилково зливаються в шахових реалізаціях, але вони мають різну семантику.

У SUBIT-CHESS їх правильне розділення стане фундаментом не лише шахового ядра, але й Structural Layer, оскільки структурні відношення повинні будуватися на реальній attack geometry, а не на спрощеному списку доступних ходів.

**AUDIT A.1 завершено на рівні формування поглибленої специфікації перевірки. Фактичне PASS/FAIL ще не встановлено.**