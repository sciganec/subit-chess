# SUBIT-CHESS v3.0.11
## DEEP AUDIT — PHASE A.3
### SPECIAL MOVE TRANSFORMATIONS
### Castling · En Passant · Promotion · State Integrity

**Target version:** SUBIT-CHESS v3.0.11  
**Target commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Audit domain:** Special-move transformations  
**Audit mode:** Architectural and source-review specification  
**Execution status:** NOT TESTED  
**Phase status:** OPEN

---

# 1. Мета PHASE A.3

PHASE A.1 досліджувала цілісність позиції.

PHASE A.2 досліджувала геометрію атак, генерацію ходів, легальність і безпеку короля.

PHASE A.3 переходить до іншого класу проблем:

> Чи здатний рушій правильно трансформувати позицію, коли хід змінює не лише положення фігури, а й декілька взаємозалежних компонентів стану?

Спеціальні шахові ходи мають особливу природу.

Звичайний хід переважно змінює:

- початкову клітинку;
- кінцеву клітинку;
- позицію фігури;
- позиційний hash;
- інформацію про останній хід.

Спеціальний хід може одночасно змінювати:

- дві або більше фігур;
- структуру матеріалу;
- доступність майбутніх ходів;
- права на рокіровку;
- en passant;
- стан короля;
- історію позиції;
- позиційний hash;
- evaluation;
- search context;
- можливість відновлення попереднього стану.

Тому спеціальні ходи потрібно розглядати не як окремі алгоритмічні винятки, а як **атомарні трансформації шахового стану**.

---

# 2. Модель атомарної трансформації

Для SUBIT-CHESS пропонується формалізувати спеціальний хід як:

**SpecialMove = Preconditions → Transformation → Postconditions → Reversibility**

Нехай позиція представлена:

P = (B, PL, K, C, CR, EP, HM, FM, H)

де:

- B — board;
- PL — piece lists;
- K — king locations;
- C — side to move;
- CR — castling rights;
- EP — en passant target;
- HM — halfmove clock;
- FM — fullmove number;
- H — hash / position identity.

Спеціальна трансформація:

Tₘ(P) → P′

має виконувати не просто переміщення фігури, а підтримувати одночасну узгодженість усіх компонентів.

## 2.1. Основний інваріант

Після будь-якого спеціального ходу:

**Board ≡ PieceLists ≡ KingLocations ≡ Hash ≡ MoveState**

Це означає:

- Board повинен відображати фактичне розташування фігур.
- Piece Lists повинні відповідати Board.
- King Locations повинні відповідати Board.
- Hash повинен відповідати новій позиції.
- Move State повинен правильно описувати права та спеціальні можливості.

Якщо хоча б один компонент не синхронізований, позиція може залишатися зовні правильною, але внутрішньо стати неконсистентною.

---

# 3. CASTLING — РОКІРОВКА

Рокіровка є подвійною трансформацією.

Вона переміщує:

- короля;
- туру.

При цьому має перевіряти:

- права на рокіровку;
- початкове розташування фігур;
- вільність проміжних клітин;
- шах королю;
- атаки на клітини проходження;
- кінцеву безпеку короля.

Рокіровка — не звичайний King Move.

---

## 3.1. Castling Preconditions

Перед виконанням рокіровки система повинна перевірити:

### C-01 — Castling Right

Відповідне право має існувати.

K — White Kingside  
Q — White Queenside  
k — Black Kingside  
q — Black Queenside

Сам факт того, що король і тура фізично перебувають на потрібних клітинах, не відновлює втраченого права.

---

### C-02 — King Position

Король повинен знаходитися на відповідній стартовій клітинці.

White:

- e1

Black:

- e8

---

### C-03 — Rook Position

Тура повинна перебувати на відповідній стартовій клітинці.

Kingside:

- h1;
- h8.

Queenside:

- a1;
- a8.

---

### C-04 — Empty Path

Проміжні клітини повинні бути вільними від інших фігур.

White Kingside:

f1, g1.

White Queenside:

b1, c1, d1.

Black Kingside:

f8, g8.

Black Queenside:

b8, c8, d8.

Для queenside клітина b1 або b8 повинна бути вільною, хоча король не проходить через неї.

---

### C-05 — King Not in Check

Рокіровка не може починатися, коли король перебуває під шахом.

---

### C-06 — Transit Square Safety

Клітина, через яку король проходить, не повинна атакуватися противником.

Kingside:

e1 → f1 → g1

Queenside:

e1 → d1 → c1

Аналогічно для чорного короля.

---

### C-07 — Destination Square Safety

Кінцева клітина короля не повинна перебувати під атакою.

Це важливо, оскільки перевірка безпеки кінцевої позиції не може бути замінена перевіркою лише проміжної клітини.

---

# 4. CASTLING — TRANSFORMATION

## 4.1. White Kingside

Початковий стан:

- King: e1
- Rook: h1

Кінцевий стан:

- King: g1
- Rook: f1

Трансформація:

e1 → g1  
h1 → f1

---

## 4.2. White Queenside

Початковий стан:

- King: e1
- Rook: a1

Кінцевий стан:

- King: c1
- Rook: d1

Трансформація:

e1 → c1  
a1 → d1

---

## 4.3. Black Kingside

e8 → g8  
h8 → f8

---

## 4.4. Black Queenside

e8 → c8  
a8 → d8

---

# 5. CASTLING — АТОМАРНІСТЬ

Рокіровка повинна виконуватися як одна логічна операція.

Небажана модель:

1. перемістити короля;
2. оновити Board;
3. оновити Hash;
4. перемістити туру;
5. оновити Piece List;
6. повторно оновити Hash;
7. перевірити позицію.

Такий порядок створює проміжні стани, які можуть бути невалідними.

Правильна концептуальна модель:

```text
BEGIN CASTLING

VALIDATE PRECONDITIONS

SAVE STATE

APPLY KING TRANSFORMATION
APPLY ROOK TRANSFORMATION

UPDATE:
    BOARD
    PIECE LISTS
    KING LOCATION
    CASTLING RIGHTS
    HASH
    HALF MOVE CLOCK
    SIDE TO MOVE

VALIDATE POSTCONDITIONS

COMMIT

END
```

Це не обов'язково означає використання database transaction.

Атомарність тут означає, що рушій не повинен використовувати частково трансформовану позицію як завершений стан.

---

# 6. CASTLING POSTCONDITIONS

Після рокіровки:

### CP-01

Король знаходиться на кінцевій клітинці.

### CP-02

Тура знаходиться на кінцевій клітинці.

### CP-03

Стартові клітини короля та тури більше не містять відповідних фігур.

### CP-04

King Location відповідає Board.

### CP-05

Castling rights відповідної сторони більше не існують.

### CP-06

Hash відповідає новій позиції.

### CP-07

Side to move змінений.

### CP-08

Halfmove clock збільшений, якщо рокіровка не є capture або pawn move, тобто стандартно на 1.

### CP-09

Рокіровка не повинна породжувати позицію з королем під шахом.

---

# 7. CASTLING — MAKE/UNMAKE

Особливо критичним є відновлення позиції.

Undo Castling повинен відновити:

- King;
- Rook;
- Board;
- Piece Lists;
- King Location;
- Castling Rights;
- Hash;
- Halfmove Clock;
- Side to Move;
- History.

Найнебезпечніша ситуація:

```text
Position A
    ↓
Castling
    ↓
Position B
    ↓
Search explores branches
    ↓
Undo
    ↓
Position A′
```

Необхідно довести:

**A′ ≡ A**

Не тільки візуально.

А за всіма внутрішніми параметрами.

---

# 8. CASTLING TEST MATRIX

## CM-01 — Standard White Kingside

Перевірити:

- право присутнє;
- король на e1;
- тура на h1;
- f1 та g1 вільні;
- рокіровка виконується.

---

## CM-02 — Standard White Queenside

Перевірити:

- право присутнє;
- король на e1;
- тура на a1;
- b1, c1, d1 вільні.

---

## CM-03 — Black Kingside

Аналогічна перевірка для чорних.

---

## CM-04 — Black Queenside

Аналогічна перевірка для чорних.

---

## CM-05 — King in Check

Рокіровка заборонена.

---

## CM-06 — Transit Square Attacked

Рокіровка заборонена.

---

## CM-07 — Destination Square Attacked

Рокіровка заборонена.

---

## CM-08 — Missing Rook

Право на рокіровку не повинно дозволяти переміщення неіснуючої тури.

---

## CM-09 — Missing King

Рокіровка не повинна виконуватися.

---

## CM-10 — Piece Blocking Path

Рокіровка заборонена.

---

## CM-11 — Castling Right Removed

Рокіровка повинна залишатися недоступною навіть після повернення короля на e1/e8.

---

## CM-12 — Undo

Після рокіровки та undo повинен відновитися повний попередній стан.

---

# 9. EN PASSANT

En passant є однією з найскладніших трансформацій у шаховому движку.

Причина:

Фігура переміщується на клітину, яка не є клітиною захопленої фігури.

Тому стандартна модель:

```text
FROM → TO
```

не є достатньою.

Необхідно розділити:

- Move Origin;
- Move Destination;
- Capture Square.

---

# 10. EN PASSANT — PRECONDITIONS

## EP-01 — Pawn Double Push

En passant повинен бути доступний лише після відповідного подвійного переміщення пешки противника з початкової позиції.

---

## EP-02 — Correct Target Square

EP target повинен відповідати клітині, через яку пройшла пешка.

---

## EP-03 — Adjacent Capturing Pawn

Пешка, яка виконує en passant, повинна знаходитися на сусідній вертикалі та правильному ранзі.

---

## EP-04 — Correct Color

Захоплення повинно виконуватися пешкою правильного кольору відповідно до Side to Move.

---

## EP-05 — Capture Pawn Exists

Пешка, що захоплюється, повинна фізично існувати на відповідній клітині.

---

## EP-06 — Legal King Safety

En passant повинен бути легальним з точки зору безпеки короля.

Це принципово.

En passant може відкривати горизонталь, вертикаль або діагональ.

---

# 11. EN PASSANT — TRANSFORMATION

Приклад:

White Pawn:

e5

Black Pawn:

d7 → d5

Black виконує подвійний хід.

En passant target:

d6

White може виконати:

e5 × d6

При цьому:

White Pawn:

e5 → d6

Black Pawn:

d5 → removed

Capture Square:

d5

Move Destination:

d6

Три координати:

```text
FROM      e5
TO        d6
CAPTURE   d5
```

Це фундаментальна відмінність від стандартного capture.

---

# 12. EN PASSANT — STRUCTURAL INTEGRITY

Після виконання en passant повинні бути узгоджені:

### Board

Пешка атакуючої сторони знаходиться на target square.

Пешка противника відсутня.

### Piece List

Захоплена пешка вилучена.

Переміщена пешка знаходиться в новій позиції.

### Hash

Hash повинен відображати:

- нове положення пешки;
- видалення захопленої пешки;
- зміну Side to Move;
- актуальне EP state.

### Position Identity

En passant state може змінювати можливі ходи.

Тому позиції, що геометрично виглядають однаково, можуть мати різну шахову ідентичність.

---

# 13. EN PASSANT — KING SAFETY

Це окрема категорія критичних тестів.

Розглянемо ситуацію, де en passant видаляє дві пешки з однієї горизонталі:

- власна пешка переміщується;
- пешка противника видаляється.

Внаслідок цього може відкритися лінія атаки на короля.

Тому:

**Pseudo-Legal En Passant ≠ Legal En Passant**

Генератор може створити геометрично допустимий хід.

Але після трансформації повинна бути перевірена безпека короля.

Неправильний порядок:

```text
Generate EP
→ Accept move
→ Search
```

Правильна логічна модель:

```text
Generate EP Candidate
→ Apply Transformation
→ Validate King Safety
→ Accept or Reject
```

---

# 14. EN PASSANT — STATE LIFECYCLE

EP target має дуже короткий життєвий цикл.

```text
Position A
    ↓
Opponent Pawn Double Push
    ↓
EP AVAILABLE
    ↓
Opponent Response
    ├── EP Capture
    └── Other Move
            ↓
      EP EXPIRED
```

Після будь-якого іншого ходу en passant state повинен бути очищений.

Неправильне збереження EP target може породжувати незаконні ходи.

---

# 15. EN PASSANT — HASHING

Позиційний hash повинен правильно відображати EP state.

Але тут є важлива методологічна проблема.

Не кожне формально встановлене EP поле FEN означає, що en passant реально доступний.

Залежно від реалізації, hash може враховувати:

- будь-який EP target;
- лише EP target, за якого існує потенційне захоплення;
- EP target, за якого існує хоча б один легальний en passant.

Ці підходи не є тотожними.

SUBIT-CHESS повинен визначити єдину модель Position Identity та використовувати її консистентно в:

- Hash;
- Transposition Table;
- repetition detection;
- Position comparison;
- Search context.

Це особливо важливо, оскільки некоректне визначення ідентичності позиції може впливати на пошук повторень та TT reuse.

---

# 16. EN PASSANT — TEST MATRIX

### EP-01

Нормальний en passant.

### EP-02

EP target існує, але захоплюючої пешки немає.

### EP-03

EP target некоректний.

### EP-04

Немає сусідньої пешки.

### EP-05

Неправильний Side to Move.

### EP-06

Пешка на неправильному ранзі.

### EP-07

En passant відкриває шах власному королю.

### EP-08

En passant усуває шах.

### EP-09

Hash до та після EP.

### EP-10

Undo EP.

### EP-11

EP state очищується після іншого ходу.

### EP-12

EP state правильно відновлюється при undo попереднього подвійного ходу.

---

# 17. PROMOTION

Promotion — трансформація типу фігури.

Пешка не просто переміщується.

Вона перестає бути пешкою та стає іншою фігурою.

Це означає:

```text
Pawn
    ↓
Pawn Move
    ↓
Promotion Transformation
    ↓
Queen / Rook / Bishop / Knight
```

Promotion змінює:

- матеріал;
- piece type;
- Piece List;
- Board;
- evaluation;
- mobility;
- attack geometry;
- hash;
- move generation;
- tactical state.

---

# 18. PROMOTION PRECONDITIONS

## P-01 — Promotion Rank

White Pawn:

Rank 8.

Black Pawn:

Rank 1.

---

## P-02 — Pawn Identity

Фігура повинна бути саме пешкою.

---

## P-03 — Legal Movement

Promotion повинен відбуватися через легальний pawn move.

---

## P-04 — Promotion Choice

Допустимі варіанти:

- Queen;
- Rook;
- Bishop;
- Knight.

Promotion до King заборонений.

Promotion до Pawn заборонений.

---

# 19. PROMOTION TRANSFORMATION

Приклад:

White Pawn:

e7

Move:

e7 → e8

Queen Promotion:

e7 → e8 = Q

Кінцевий стан:

- White Pawn removed;
- White Queen created;
- Board updated;
- Piece List updated;
- Material updated;
- Hash updated;
- King Location unaffected.

---

# 20. PROMOTION CAPTURE

Promotion може відбуватися як capture.

Наприклад:

e7 × f8 = Q

Трансформація повинна включати:

1. видалення захопленої фігури;
2. переміщення пешки;
3. видалення пешки зі списку пешок;
4. створення нової фігури;
5. додавання нової фігури до відповідного Piece List;
6. оновлення Board;
7. оновлення Hash;
8. оновлення матеріалу;
9. оновлення evaluation state.

Capture Promotion є складною комбінованою операцією.

Він не повинен реалізовуватися як:

```text
Capture
→ Normal Pawn Move
→ Promotion
```

як три незалежні операції, якщо проміжні стани можуть бути доступні іншим компонентам.

---

# 21. PROMOTION — PIECE LIST INTEGRITY

Особливу увагу необхідно приділити Piece Lists.

До Promotion:

```text
White Pawns:
    ...

White Queens:
    ...
```

Після Promotion:

```text
White Pawns:
    Pawn removed

White Queens:
    New Queen added
```

Якщо Piece Lists мають обмежену місткість, Promotion може збільшити кількість фігур конкретного типу.

Тому потрібно перевірити:

- capacity;
- insertion;
- removal;
- index management;
- duplicate entries;
- piece count;
- restoration after undo.

Особливо важливо перевірити, чи не використовуються різні механізми оновлення списків для:

- Normal Capture;
- Promotion;
- Capture Promotion;
- Undo Promotion.

---

# 22. PROMOTION — EVALUATION

Promotion повинен коректно відображатися в evaluation.

Наприклад:

Pawn → Queen

Має змінювати:

- material balance;
- mobility;
- attack potential;
- positional value;
- tactical evaluation.

Якщо evaluation використовує кешовані таблиці або матеріальні параметри, Promotion повинен синхронізуватися з ними.

Критичний ризик:

```text
Board = Queen
Piece List = Queen
Evaluation Cache = Pawn
```

Це створює структурно правильну позицію, але неправильну оцінку.

---

# 23. PROMOTION — SEARCH

Search повинен досліджувати всі доступні Promotion choices.

```text
Promotion Candidates:

Q
R
B
N
```

Не можна припускати, що Queen Promotion завжди є оптимальним.

Особливо:

- Knight Promotion може створити check;
- Rook Promotion може уникнути stalemate;
- Bishop Promotion може бути єдиним способом не створити draw;
- Underpromotion може бути критичною для позиції.

Promotion — не лише матеріальний вибір.

Це трансформація майбутнього простору можливих ходів.

---

# 24. PROMOTION — QUIESCENCE SEARCH

Promotion створює важливий зв'язок із QSearch.

Promotion може бути:

- тихим ходом;
- тактичним ходом;
- capture;
- check;
- безпосередньою загрозою.

Тому QSearch не повинен автоматично ігнорувати тихі Promotion.

Потрібно перевірити:

- Promotion без capture;
- Promotion з capture;
- Promotion з check;
- Underpromotion;
- Stalemate-related Promotion;
- mate-related Promotion.

Це особливо важливо для пошукової глибини, оскільки Promotion може різко змінити evaluation.

---

# 25. PROMOTION — UNMAKE

Undo Promotion є значно складнішим за Undo Normal Move.

Він повинен відновити:

- Pawn;
- Pawn List;
- promoted piece;
- promoted piece list;
- captured piece, якщо була;
- Board;
- Material;
- Hash;
- Evaluation state;
- History.

Тест:

```text
Position A
    ↓
Promotion
    ↓
Position B
    ↓
Search Branches
    ↓
Undo
    ↓
Position A′
```

Необхідно довести:

**A′ ≡ A**

---

# 26. SPECIAL MOVE CROSS-COMPONENT MATRIX

Спеціальні ходи повинні перевірятися не лише ізольовано.

| Transformation | Board | Piece Lists | King | Hash | Rights | Evaluation | Undo |
|---|---|---|---|---|---|---|
| Castling | Critical | Critical | Critical | Critical | Critical | Critical |
| En Passant | Critical | Critical | Critical | Critical | EP state | Critical |
| Promotion | Critical | Critical | — | — | Critical | Critical |
| Capture Promotion | Critical | Critical | — | — | Critical | Critical |

Ця матриця не є результатом виконаних тестів.

Вона визначає мінімальний обсяг перевірки.

---

# 27. SPECIAL MOVE TRANSACTION MODEL

Для SUBIT-CHESS рекомендовано ввести концептуальну модель:

## SM-Transaction

```text
SPECIAL MOVE TRANSACTION

1. IDENTIFY MOVE TYPE

2. VALIDATE PRECONDITIONS

3. CAPTURE PRE-STATE

4. APPLY TRANSFORMATION

5. UPDATE ALL POSITION COMPONENTS

6. VALIDATE POST-STATE

7. UPDATE HASH

8. UPDATE HISTORY

9. COMMIT POSITION

10. ENABLE SEARCH
```

Якщо виявлено помилку:

```text
ROLLBACK
```

Ця модель може бути використана як основа для:

- debugging;
- move verification;
- differential testing;
- search integrity;
- self-play integrity.

---

# 28. POSITION INTEGRITY CHECKPOINT

Після кожного спеціального ходу в тестовому режимі потрібно виконувати незалежну перевірку.

## CHECKPOINT-01 — Board

Кожна фігура повинна знаходитися на одній клітинці.

---

## CHECKPOINT-02 — Piece Lists

Piece Lists повинні точно відповідати Board.

---

## CHECKPOINT-03 — King Locations

Король кожної сторони повинен мати правильну позицію.

---

## CHECKPOINT-04 — Hash

Incremental Hash повинен відповідати незалежно обчисленому Hash.

---

## CHECKPOINT-05 — Move State

Castling Rights, EP Target, Side to Move та clocks повинні відповідати результату трансформації.

---

## CHECKPOINT-06 — Undo Integrity

Undo повинен повністю відновлювати попередню позицію.

---

# 29. TESTING PROTOCOL

Для спеціальних ходів необхідно розділити п'ять типів тестування.

## T1 — Deterministic Unit Tests

Окремі сценарії для:

- Castling;
- En Passant;
- Promotion.

---

## T2 — State Differential Tests

Порівняння:

```text
Incremental Position State
vs
Reconstructed Position State
```

---

## T3 — Make/Unmake Tests

```text
MAKE
→ VERIFY
→ UNMAKE
→ VERIFY ORIGINAL
```

---

## T4 — Randomized Legal Sequences

Генерувати легальні послідовності ходів.

Періодично виконувати:

- спеціальний хід;
- undo;
- position reconstruction;
- hash verification.

---

## T5 — Search Integration

Перевірити спеціальні ходи в контексті:

- Iterative Deepening;
- PVS;
- Null Move;
- LMR;
- QSearch;
- TT.

Тут важливо не лише правильне виконання ходу.

Необхідно перевірити, чи спеціальний хід не порушує пошуковий стан після повернення з рекурсивної гілки.

---

# 30. AUDIT FINDINGS — PHASE A.3

На цьому етапі результати слід розділити на дефекти, потенційні ризики та незакриті перевірки.

Без повторного точкового підтвердження кожного відповідного фрагмента коду не можна присвоювати статус Confirmed Source Defect.

### A3-001 — Castling State Atomicity

**Severity:** P1  
**Category:** Architecture / Integrity  
**Status:** OPEN — Verification Required

Потрібно перевірити, чи рокіровка синхронно оновлює всі компоненти позиції.

---

### A3-002 — Castling Transit Safety

**Severity:** P1  
**Category:** Move Legality  
**Status:** OPEN — Verification Required

Потрібно незалежно перевірити атаки на:

- стартову клітинку;
- transit square;
- destination square.

---

### A3-003 — Castling Undo Integrity

**Severity:** P1  
**Category:** State Restoration  
**Status:** OPEN — Verification Required

Потрібно перевірити повне відновлення стану після undo.

---

### A3-004 — En Passant Capture-Square Integrity

**Severity:** P1  
**Category:** Position Transformation  
**Status:** OPEN — Verification Required

Потрібно довести, що Capture Square не плутається з Move Destination.

---

### A3-005 — En Passant King Safety

**Severity:** P1  
**Category:** Legal Move Generation  
**Status:** OPEN — Verification Required

Потрібно перевірити відкриття attack rays після одночасного переміщення та видалення пешок.

---

### A3-006 — En Passant Hash Consistency

**Severity:** P1/P2  
**Category:** Position Identity  
**Status:** OPEN — Verification Required

Потрібно перевірити EP state та його вплив на hash і position identity.

---

### A3-007 — Promotion Piece List Integrity

**Severity:** P1  
**Category:** Position Representation  
**Status:** OPEN — Verification Required

Потрібно перевірити перетворення Pawn → promoted piece у Board та Piece Lists.

---

### A3-008 — Capture Promotion Atomicity

**Severity:** P1  
**Category:** State Transformation  
**Status:** OPEN — Verification Required

Потрібно перевірити одночасне виконання:

- capture;
- pawn relocation;
- pawn removal;
- promoted piece insertion.

---

### A3-009 — Promotion Evaluation Synchronization

**Severity:** P2  
**Category:** Evaluation

Потрібно перевірити синхронізацію Board, Material, Piece Lists та evaluation.

---

### A3-010 — Special Move Undo

**Severity:** P1  
**Category:** Search Integrity

Потрібно довести повне відновлення стану після:

- Castling;
- En Passant;
- Promotion;
- Capture Promotion.

---

# 31. PHASE A.3 — ACCEPTANCE CRITERIA

Фаза не може бути закрита, поки не виконані всі ключові умови.

## AC-01

Castling повністю відповідає правилам шахів.

## AC-02

En Passant правильно реалізований з окремим Capture Square.

## AC-03

Promotion підтримує Q/R/B/N.

## AC-04

Capture Promotion правильно синхронізує всі компоненти позиції.

## AC-05

Hash відповідає позиції після спеціального ходу.

## AC-06

Piece Lists відповідають Board.

## AC-07

King Locations відповідають Board.

## AC-08

Undo відновлює всі компоненти.

## AC-09

Спеціальні ходи не створюють illegal king states.

## AC-10

Special Move Integrity підтверджена тестами в ізоляції та в Search.

---

# 32. Критичний висновок PHASE A.3

Спеціальні ходи є одним із найбільш критичних вузлів шахового рушія.

Проблема полягає не в складності самих правил.

Проблема полягає в **синхронізації множини внутрішніх представлень позиції**.

Castling трансформує дві фігури.

En Passant переміщує одну фігуру та видаляє іншу з нетипової клітини.

Promotion змінює тип фігури, матеріал, структуру списків і потенційно весь тактичний простір.

Capture Promotion поєднує три трансформації в одній операції.

Тому для SUBIT-CHESS найбільш фундаментальним критерієм є не просто:

**Move Executed Correctly**

а:

**State Transformed Correctly → State Remains Internally Consistent → State Reversible → Search Remains Valid**

Саме тут принцип **DO NOT COLLAPSE — CONTEXTUALIZE** отримує інженерне значення: не зводити позицію до одного Board representation, а підтримувати контекстуальну узгодженість усіх її структур.

---

# PHASE A.3 STATUS

**CASTLING:** OPEN  
**EN PASSANT:** OPEN  
**PROMOTION:** OPEN  
**CAPTURE PROMOTION:** OPEN  
**SPECIAL MOVE HASH:** OPEN  
**SPECIAL MOVE UNDO:** OPEN  
**SEARCH INTEGRATION:** OPEN  
**INDEPENDENT TESTING:** NOT PERFORMED  
**ACCEPTANCE:** NOT GRANTED

---

## Наступний етап

# SUBIT-CHESS v3.0.11 — DEEP AUDIT PHASE A.4
### POSITION HISTORY, REPETITION, DRAW DETECTION & GAME TERMINATION

Наступна фаза досліджуватиме:

- Position History Architecture;
- Threefold Repetition;
- Position Identity;
- Hash-based repetition detection;
- Fifty-Move Rule;
- 75-Move Rule;
- Insufficient Material;
- Stalemate;
- Checkmate;
- Draw State;
- Search Terminal Nodes;
- Game Result Integrity;
- взаємозв'язок History ↔ Hash ↔ Search ↔ SelfPlay.

Це наступний фундаментальний рівень: **чи розуміє SUBIT-CHESS не лише поточний стан дошки, а й шахове значення історії, циклів, завершення та повторюваності позицій?**