# SUBIT-CHESS v3.0.11
## Розширений поглиблений технічний аудит (Deep Audit Report)

**Об’єкт:** SUBIT-CHESS v3.0.11  
**Версія:** 3.0.11  
**Commit:** `ffcc50b39134e41c1fe59ed5d5793cb4e6b92c98`  
**Артефакт:** автономний HTML chess engine  
**Режим аудиту:** статичний аналіз архітектури, логіки, алгоритмів, взаємозалежностей та потенційних дефектів.

Репозиторій:  
[SUBIT-CHESS GitHub](https://github.com/sciganec/subit-chess?utm_source=chatgpt.com)

---

# I. Executive Assessment

SUBIT-CHESS v3.0.11 являє собою вже не просто шаховий алгоритм, а комплексну систему, що об'єднує:

- шахове ядро;
- генератор легальних ходів;
- механізм трансформації позицій;
- систему оцінювання;
- пошуковий рушій;
- кешування;
- структурний аналіз шахової позиції;
- контекстну модель;
- метаконтролер;
- механізм самонавчання;
- Worker-архітектуру;
- інтерфейс користувача;
- систему документування та аудиту.

Це суттєвий перехід від традиційного шахового рушія, який оптимізує переважно пошук у дереві ходів, до системи, яка намагається інтегрувати кілька рівнів представлення шахової реальності.

Однак складність архітектури вже створює нову проблему.

**Чим більше рівнів аналізу додається до рушія, тим важливішим стає доказ того, що нижчі рівні залишаються математично, алгоритмічно та операційно правильними.**

На цьому етапі головний ризик SUBIT-CHESS полягає не в недостатній кількості інтелектуальних модулів.

Він полягає у можливій невідповідності між:

1. коректністю шахового стану;
2. коректністю трансформацій;
3. коректністю пошуку;
4. достовірністю структурної інтерпретації;
5. коректністю контекстного впливу;
6. фактичним поведінковим результатом рушія.

---

## 1.1. Загальний статус

| Напрям | Статус аудиту |
|---|---|
| Архітектура | Складна, функціонально інтегрована |
| Представлення позиції | Потребує посиленої верифікації |
| FEN | Виявлено ризики валідності та внутрішніх обмежень |
| Генерація ходів | Потребує незалежної перевірки |
| Легальність ходів | Потребує повного тестового покриття |
| Make/Unmake | Потребує диференційної верифікації |
| Zobrist Hash | Потребує перевірки інваріантів |
| Transposition Table | Виявлено ризики ключів, заміщення та інтерпретації |
| Search | Архітектурно розвинений, але не верифікований runtime |
| Quiescence Search | Виявлено потенційні тактичні прогалини |
| Evaluation | Потребує перевірки стабільності масштабу |
| Structural Layer | Виявлено критичний ризик кодування структурних вершин |
| Context Layer | Є проблема семантичної повноти контекстної модифікації |
| Meta-controller | Потребує перевірки причинного впливу на рішення |
| Self-play | Потребує перевірки завершення партій та достовірності циклу |
| Worker | Потребує браузерної runtime-верифікації |
| UI | Виявлено декілька проблем UX/accessibility |
| Загальна готовність | OPEN — RELEASE NOT CERTIFIED |

Ця таблиця відображає аудит вихідного коду, а не результати фактичного виконання тестів.

---

# II. AUDIT METHODOLOGY

Для цього аудиту необхідно розрізняти чотири типи висновків.

### CONFIRMED DEFECT

Дефект безпосередньо випливає з логіки вихідного коду.

### CONFIRMED DESIGN RISK

Архітектурне рішення може створювати некоректні результати за певних умов, навіть якщо конкретний runtime-дефект ще не продемонстровано.

### VERIFICATION GAP

Код містить відповідну функціональність, але її коректність не підтверджена незалежними тестами.

### DESIGN QUESTION

Наявна реалізація може бути допустимою, однак її семантика недостатньо чітко визначена.

Це розмежування принципове.

Наявність складного алгоритму не означає його неправильність.

Відсутність тесту не означає дефект.

Але відсутність тесту не дозволяє вважати функціональність доведено правильною.

---

# III. ARCHITECTURAL AUDIT

## 3.1. Архітектурна еволюція

SUBIT-CHESS v3.0.11 можна концептуально представити як багаторівневу систему:

```text
┌─────────────────────────────────────────┐
│             USER INTERFACE           │
├─────────────────────────────────────────┤
│           GAME CONTROLLER            │
├─────────────────────────────────────────┤
│         DECISION CERTIFICATE         │
├─────────────────────────────────────────┤
│           META-CONTROLLER            │
├─────────────────────────────────────────┤
│           CONTEXT LAYER              │
├─────────────────────────────────────────┤
│          STRUCTURAL LAYER            │
├─────────────────────────────────────────┤
│          SEARCH ENGINE               │
│ ID │ PVS │ LMR │ NMP │ QSEARCH      │
├─────────────────────────────────────────┤
│         EVALUATION ENGINE            │
├─────────────────────────────────────────┤
│        TRANSPOSITION TABLE           │
├─────────────────────────────────────────┤
│          POSITION CORE               │
│ Board │ Lists │ Hash │ History       │
├─────────────────────────────────────────┤
│          MOVE GENERATION             │
├─────────────────────────────────────────┤
│        LEGAL TRANSFORMATIONS         │
└─────────────────────────────────────────┘
```

Це концептуальна схема залежностей, а не буквальна схема викликів функцій.

### Основна архітектурна перевага

Система допускає незалежне розширення:

- пошукового алгоритму;
- структурної інтерпретації;
- контекстної моделі;
- параметрів оцінювання;
- механізму самонавчання.

### Основна архітектурна небезпека

Залежності між цими рівнями можуть створювати **каскадне поширення помилки**.

Наприклад:

```text
Неправильне представлення позиції
        ↓
Неправильна структурна графова модель
        ↓
Неправильний контекст
        ↓
Неправильна оцінка
        ↓
Неправильний пошуковий пріоритет
        ↓
Неправильний вибір ходу
```

Таким чином, помилка, яка виникає у структурному модулі, може бути інтерпретована пошуковим модулем як достовірний сигнал.

Це особливо важливо для SUBIT-CHESS, оскільки рушій прагне використовувати структурні характеристики позиції не лише як опис, але і як фактор прийняття рішення.

### Архітектурна рекомендація

Кожен модуль повинен мати:

- формально визначений input;
- формально визначений output;
- власні інваріанти;
- незалежні тести;
- контроль допустимого впливу на інші модулі;
- можливість відключення;
- можливість порівняння результату з базовою моделлю.

---

# IV. AUDIT-311-01
# FEN VALIDATION AND POSITION REPRESENTATION

**Severity: P1/P2**  
**Status: Confirmed source-level mismatch**

## 4.1. Виявлена проблема

Система використовує внутрішні списки фігур із обмеженою місткістю.

Зокрема, структура `listSq` передбачає масиви приблизно на 40 елементів для кожного кольору.

Водночас FEN-перевірка допускає конфігурації матеріалу, які не обов'язково відповідають цьому обмеженню.

Таким чином, виникає невідповідність між:

- зовнішньою допустимістю позиції;
- внутрішньою здатністю її зберігати.

---

## 4.2. Формальна проблема

Нехай:

- P(c) — кількість фігур кольору c;
- C — максимальна місткість внутрішнього списку;
- V(FEN) — результат перевірки FEN.

Потрібно забезпечити:

V(FEN) = true ⇒ P(c) ≤ C

для кожного кольору.

Якщо це не гарантовано, система може прийняти позицію, яку не здатна коректно представити.

---

## 4.3. Наслідки

Потенційно:

- переповнення списку;
- втрата фігур у внутрішній структурі;
- некоректні індекси;
- неправильна генерація ходів;
- некоректний матеріальний баланс;
- порушення hash;
- розбіжність між board representation та piece lists.

Особливо небезпечна ситуація, коли:

```text
board[square] ≠ pieceListRepresentation
```

Оскільки різні модулі можуть використовувати різні представлення, рушій ризикує отримати неоднакову позицію залежно від того, який модуль її аналізує.

---

## 4.4. Рекомендоване виправлення

Необхідно визначити єдиний контракт позиції.

FEN validator повинен перевіряти:

1. кількість полів;
2. структуру восьми горизонталей;
3. допустимі символи;
4. коректність розташування королів;
5. відсутність двох королів одного кольору;
6. матеріальні обмеження;
7. допустимість castling rights;
8. допустимість en passant;
9. коректність halfmove/fullmove;
10. сумісність із внутрішніми структурами.

Необхідно також визначити, чи підтримує рушій:

- лише легальні шахові позиції;
- позиції, що виникають у шахових композиціях;
- довільні FEN;
- частково некоректні позиції для діагностики.

Це чотири різні режими.

---

# V. AUDIT-311-02
# FEN CANONICALIZATION

**Severity: P3**  
**Status: Confirmed source-level issue**

## 5.1. Проблема

FEN може бути синтаксично прийнятий навіть у випадках, коли його запис не відповідає канонічному формату.

Наприклад, послідовне використання цифр для опису порожніх клітин може дозволити представити один і той самий ряд альтернативними способами.

Це створює проблему нормалізації.

---

## 5.2. Чому це важливо

FEN є зовнішнім форматом стану.

Якщо система приймає неконанонічні форми, вона повинна визначити:

- чи нормалізує їх;
- чи зберігає оригінал;
- чи використовує нормалізоване представлення для hash;
- чи однакові позиції мають однакові ключі.

Інакше може виникнути ситуація:

```text
FEN A
    ↓
Position X

FEN B
    ↓
Position X
```

але при цьому:

```text
Hash(A) ≠ Hash(B)
```

Це не завжди критично, якщо hash формується з внутрішньої позиції.

Проте нормалізація повинна бути визначена.

### Рекомендація

Розділити:

- FEN parser;
- FEN validator;
- canonical FEN serializer.

Parser може приймати допустимі альтернативні представлення.

Serializer повинен генерувати єдину канонічну форму.

---

# VI. AUDIT-311-03
# MOVE GENERATION

**Severity: P1 Verification Gap**  
**Status: Open**

Генератор ходів є фундаментальним компонентом.

Якщо він допускає помилку, всі вищі рівні стають недостовірними.

---

## 6.1. Критичні категорії

Необхідно незалежно перевірити:

### Pawn

- одноходовий рух;
- подвійний рух;
- блокування;
- взяття;
- en passant;
- promotion;
- promotion capture.

### Knight

- усі вісім потенційних напрямків;
- край дошки;
- блокування координатними межами.

### Bishop

- діагональні промені;
- блокування;
- взяття;
- обмеження board geometry.

### Rook

- горизонтальні;
- вертикальні;
- блокування;
- захоплення.

### Queen

- об'єднання bishop/rook geometry.

### King

- усі допустимі переміщення;
- захищені та атаковані клітини;
- castling;
- шах;
- шах після трансформації.

---

## 6.2. Найбільш небезпечний тип помилки

Генератор може створювати псевдолегальні ходи, які стають нелегальними після фактичного трансформування позиції.

Наприклад:

```text
Position P
    ↓
Move M appears legal
    ↓
MakeMove(P, M)
    ↓
King exposed
    ↓
M is illegal
```

Це особливо актуально для:

- pinned pieces;
- en passant;
- castling;
- discovered attacks;
- double check.

---

## 6.3. Необхідний інваріант

Для кожного легального ходу m:

```text
MakeMove(P, m)
    ↓
King(P') is not attacked
```

За винятком ситуації, коли позиція є спеціально визначеною terminal/composed position, що не відповідає стандартним умовам легальної шахової гри.

---

# VII. AUDIT-311-04
# MAKE / UNMAKE SYSTEM

**Severity: P1 Verification Gap**  
**Status: Open**

Make/unmake є одним із найбільш критичних механізмів пошукового рушія.

У процесі пошуку позиція трансформується багаторазово.

Якщо відновлення не є точним, рушій поступово накопичує пошкодження стану.

---

## 7.1. Основний принцип

Нехай:

P₀ — початкова позиція.

m — легальний хід.

P₁ = MakeMove(P₀, m)

Тоді:

UnmakeMove(P₁, m) = P₀

Це має бути точна рівність не лише шахового розташування фігур.

Необхідно відновити:

- board;
- side to move;
- castling rights;
- en passant;
- halfmove clock;
- fullmove number;
- hash;
- piece lists;
- king squares;
- evaluation state;
- repetition history;
- search-specific state.

---

## 7.2. Рекомендований тест

Для кожної позиції:

```text
Snapshot(P₀)

for each legal move m:
    MakeMove(m)
    Validate(P₁)
    UnmakeMove(m)
    Assert(P = P₀)
```

Порівнювати потрібно повний стан.

Не лише FEN.

Деякі внутрішні структури можуть залишатися некоректними, навіть якщо FEN виглядає правильно.

---

# VIII. AUDIT-311-05
# ZOBRIST HASH AND TRANSPOSITION CONTEXT

**Severity: P2**  
**Status: Confirmed design risk**

## 8.1. Ключ позиції

Hash використовується для:

- transposition table;
- повторів;
- кешування;
- ідентифікації позиції.

Водночас search context може включати:

- halfmove clock;
- історію повторів;
- інші параметри, які змінюють значення позиції.

У версії 3.0.11 ключ TT додатково модифікується через halfmove bucket.

Схематично:

K = H(position) + B(halfmove)

де:

- H — базовий hash;
- B — контекстна поправка.

---

## 8.2. Ризик

Адитивне комбінування не гарантує унікальності.

Тобто:

H₁ + B₁ = H₂ + B₂

може бути можливим навіть за різних базових позицій та контекстів.

Це не означає, що кожна така ситуація призводить до помилки.

Але система повинна гарантувати, що контекст не створює неконтрольованого змішування записів.

---

## 8.3. Рекомендована архітектура

Відокремити:

```text
POSITION HASH
    ├── Board
    ├── Side to move
    ├── Castling
    └── En passant

SEARCH CONTEXT
    ├── Halfmove bucket
    ├── Repetition context
    └── Search parameters
```

Використовувати незалежне комбінування полів або повноцінний hash контексту.

При цьому необхідно чітко визначити, які параметри:

- входять до ключа;
- впливають на оцінку;
- впливають на terminal state;
- не повинні впливати на hash.

---

# IX. AUDIT-311-06
# TRANSPOSITION TABLE REPLACEMENT

**Severity: P2**  
**Status: Confirmed design risk; runtime impact unverified**

Transposition Table є одним із ключових інструментів пошуку.

Однак її ефективність залежить не лише від коректності lookup, а й від політики заміщення.

---

## 9.1. Проблема

Старі записи можуть залишатися в таблиці, навіть коли вони вже не відповідають актуальному поколінню пошуку.

Якщо запис має достатню глибину, він потенційно може блокувати заміщення новим записом.

Водночас старий запис може бути визнаний непридатним для використання.

Це створює небажану ситуацію:

```text
TT slot occupied
       ↓
Entry stale
       ↓
Entry unusable
       ↓
New entry cannot replace
       ↓
Reduced effective TT capacity
```

---

## 9.2. Що потрібно перевірити

- generation handling;
- depth replacement;
- age replacement;
- exact score replacement;
- collision handling;
- entry validity;
- move ordering;
- memory bounds;
- повторне використання записів між партіями;
- очистка таблиці.

### Рекомендація

Політика заміщення повинна оцінювати не лише глибину.

Доцільно використовувати комбінований критерій:

```text
REPLACEMENT PRIORITY =
    DEPTH
  + AGE
  + ENTRY VALIDITY
  + EXACTNESS
  + SEARCH CONTEXT
```

Це не обов'язково має бути буквальна арифметична формула.

Це набір факторів, які повинні бути чітко визначені.

---

# X. AUDIT-311-07
# TRANSPOSITION TABLE STATISTICS

**Severity: P3**  
**Status: Confirmed source-level semantic issue**

Статистика TT повинна відповідати фактичній поведінці.

Необхідно розрізняти:

- probe;
- hit;
- usable hit;
- move hint;
- score cutoff;
- exact hit;
- lower bound;
- upper bound;
- replacement;
- collision.

Якщо статистика `cutoffs` збільшується при використанні move hint, навіть без фактичного score cutoff, це створює некоректне представлення ефективності таблиці.

---

## 10.1. Чому це критично для розробки

Статистика може використовуватися для:

- оптимізації;
- порівняння версій;
- самонавчання;
- визначення ефективності алгоритмів.

Якщо вона семантично неправильна, рішення щодо оптимізації можуть базуватися на хибних даних.

### Рекомендація

Створити окремі лічильники:

```text
TT_PROBES
TT_HITS
TT_USABLE_HITS
TT_MOVE_HINTS
TT_SCORE_CUTOFFS
TT_EXACT
TT_LOWER
TT_UPPER
TT_REPLACEMENTS
TT_COLLISIONS
TT_STALE_ENTRIES
```

---

# XI. AUDIT-311-08
# NULL-MOVE PRUNING

**Severity: P2**  
**Status: Verification Gap**

Null Move Pruning використовує припущення, що пасивна трансформація позиції дозволяє визначити, чи може сторона отримати достатню оцінку без виконання звичайного ходу.

Це може значно скоротити пошук.

Але шахи не є звичайною монотонною системою.

---

## 11.1. Проблема zugzwang

У деяких позиціях сторона не повинна пропускати хід.

Навіть якщо її позиція виглядає прийнятною, будь-який легальний хід може погіршити результат.

Тоді null move створює нереалістичну трансформацію.

```text
Real Position
    ↓
Forced Move
    ↓
Position worsens

Null Position
    ↓
No move
    ↓
Artificially preserved advantage
```

---

## 11.2. Рекомендовані тестові класи

- король і пішаки;
- ендшпілі;
- zugzwang;
- позиції з обмеженою кількістю легальних ходів;
- позиції з форсованими шахами;
- позиції з дуже малою мобільністю;
- позиції, де null move створює необґрунтований cutoff.

Необхідно визначити, коли null move:

- дозволений;
- заборонений;
- верифікується;
- не може використовуватися.

---

# XII. AUDIT-311-09
# QUIESCENCE SEARCH — QUIET CHECKING MOVES

**Severity: P2**  
**Status: Potential logic defect**

Quiescence Search має вирішувати проблему горизонту.

Він повинен продовжувати аналіз тактичних нестабільностей, а не завершувати пошук у момент, коли позиція ще містить критичні тактичні можливості.

---

## 12.1. Виявлений ризик

У логіці фільтрації quiet checking moves може бути недостатньо повно врахована геометрія трансформації castling.

Castling є особливим ходом.

Він переміщує:

- короля;
- туру.

Тому шах може виникнути не лише через зміну позиції короля, а й через зміну позиції тури.

---

## 12.2. Потенційний сценарій

```text
Initial position
       ↓
Castling
       ↓
King changes square
       ↓
Rook changes square
       ↓
Rook creates checking line
```

Якщо prefilter враховує тільки початкову та кінцеву позиції короля, але не нову геометрію тури, він може пропустити тихий шах.

### Рекомендація

Після кожної трансформації castling необхідно оцінювати повну attack geometry нової позиції.

Не використовувати часткову геометрію ходу для визначення шаху.

---

# XIII. AUDIT-311-10
# QUIESCENCE SEARCH DEPTH AND TACTICAL STABILITY

**Severity: P2**  
**Status: Verification Gap**

QSearch має обмеження.

Обмеження необхідні для захисту від:

- надмірного розширення дерева;
- нескінченних шахових послідовностей;
- explosion of tactical branches.

Але обмеження може призвести до завершення аналізу в нестабільній позиції.

---

## 13.1. Основна проблема

Якщо пошук зупиняється лише через cap, а не через досягнення тактичної стабільності, оцінка може бути некоректною.

```text
Tactical Position
       ↓
QSearch
       ↓
Depth/Node/Limit cap
       ↓
Evaluation
```

У цьому випадку оцінка може бути сформована:

- під час шаху;
- після незавершеної серії взяттів;
- до завершення форсованої тактики.

### Рекомендація

Розділити:

- normal qsearch termination;
- tactical termination;
- forced-check termination;
- cap termination.

І кожен тип завершення повинен мати окрему статистику.

---

# XIV. AUDIT-311-11
# EVALUATION TABLE CACHING

**Severity: P2**  
**Status: Confirmed source-level risk**

Evaluation parameters можуть містити:

- material weights;
- positional weights;
- piece-square tables;
- структурні параметри;
- контекстні коефіцієнти.

Якщо кешування залежить лише від reference identity об'єкта, виникає проблема.

---

## 14.1. Сценарій

```js
const params = {
    pieceValue: 100
};

buildTables(params);

params.pieceValue = 120;

buildTables(params);
```

Якщо система визначає, що параметри не змінилися, лише тому, що об'єкт має ту саму адресу в пам'яті, вона може повторно використати старі таблиці.

```text
Object Identity: unchanged
Parameter Values: changed
Cache: considered valid
```

Це може створити невідповідність між:

- конфігурацією;
- evaluation;
- фактичними таблицями.

---

## 14.2. Рекомендація

Використовувати:

- immutable parameters;
- version counter;
- параметричний fingerprint;
- явну invalidation.

Найбезпечніший принцип:

**Зміна параметрів повинна бути атомарною операцією, яка автоматично інвалідовує залежні кеші.**

---

# XV. AUDIT-311-12
# STRUCTURAL VERTEX ENCODING

**Severity: P1 — Critical structural correctness**  
**Status: Confirmed source-level defect**

Це один із найважливіших дефектів аудиту.

SUBIT-CHESS використовує структурне представлення шахової позиції, у якому вершини можуть кодуватися на основі:

- координати клітини;
- кольору;
- типу фігури.

Виявлено ризик колізії кодування.

---

## 15.1. Проблема

Якщо представлення формується шляхом арифметичного додавання:

```text
vertex = square + colorOffset + pieceType
```

то різні шахові сутності можуть отримати однаковий код.

Наприклад, при використанні 0x88 square encoding:

```text
White piece:
square = 4
type = 1

Black piece:
square = 0
type = 1

color offset = 64
```

Можливе отримання:

```text
White vertex = 4 + 1 = 5

Black vertex = 0 + 64 + 1 = 65
```

Для іншої комбінації координати та кольору арифметичне кодування може створити тотожне значення.

Зокрема, конструкції такого типу:

```text
square + colorOffset + pieceType
```

не гарантують унікальності, якщо компоненти не розділені за незалежними діапазонами.

---

## 15.2. Наслідки

Колізія структурних вершин може призводити до:

- злиття різних фігур;
- неправильних структурних зв'язків;
- хибних дистанцій;
- некоректних graph neighborhoods;
- неправильного визначення fork;
- неправильного визначення discover;
- некоректного structural score.

Це означає, що Structural Layer може аналізувати не фактичну шахову структуру, а її неоднозначне представлення.

---

## 15.3. Рекомендована модель

Вершина повинна бути незалежно ідентифікована.

Концептуально:

```text
Vertex =
{
    Square: 0..63,
    Color: WHITE | BLACK,
    PieceType: PAWN | KNIGHT | BISHOP | ROOK | QUEEN | KING
}
```

Або використовувати гарантовано injective encoding:

```text
vertexId =
    squareIndex
  + 64 × colorIndex
  + 128 × pieceTypeIndex
```

Це лише приклад.

Ключова вимога:

∀x ≠ y: Encode(x) ≠ Encode(y)

Тобто різні структурні сутності повинні отримувати різні коди.

---

# XVI. AUDIT-311-13
# DISCOVER RELATION DETECTION

**Severity: P2**  
**Status: Confirmed logic limitation**

Discover — одна з найважливіших шахових структур.

Її визначення пов'язане з:

- блокуванням лінії;
- переміщенням фігури;
- відкриттям attack ray;
- новим атакуючим елементом.

---

## 16.1. Виявлена проблема

Поточна логіка може обмежувати перевірку лише найближчою клітиною за блокером.

Але геометрія шахів вимагає аналізу всієї лінії.

```text
Attacker
    ↓
Blocker
    ↓
Square 1
    ↓
Square 2
    ↓
Target
```

Discover може виникнути, якщо:

- blocker переміщується;
- нова лінія відкривається;
- target розташований далі, ніж одна клітина.

---

## 16.2. Правильний принцип

Необхідно продовжувати ray traversal до:

- кінця дошки;
- іншої фігури;
- target;
- завершення допустимого attack ray.

Discover detection не повинна обмежуватися однією позицією після blocker.

---

# XVII. AUDIT-311-14
# FORK HYPERRELATION

**Severity: P2/P3**  
**Status: Confirmed semantic risk**

Fork є відношенням між:

- атакуючою фігурою;
- декількома атакованими об'єктами.

Однак форк не обов'язково повинен бути представлений як набір незалежних пар.

---

## 17.1. Проблема

Якщо attacker атакує три об'єкти:

```text
A → B
A → C
A → D
```

система може створити:

```text
(A, B)
(A, C)
(A, D)
```

Але це не три незалежні форки.

Це одна структурна подія:

```text
FORK(A, {B, C, D})
```

---

## 17.2. Чому це важливо

Якщо structural score використовує кількість відношень, форк може отримати непропорційно високий бал.

Таким чином, кількість атакованих об'єктів може бути помилково інтерпретована як кількість незалежних tactical structures.

### Рекомендація

Розділити:

- tactical event;
- pairwise relation;
- hyperrelation;
- tactical severity.

Використовувати fork як окрему багатосуб'єктну структуру.

---

# XVIII. AUDIT-311-15
# CONTEXT VECTOR SEMANTICS

**Severity: P3**  
**Status: Design clarification required**

Контекстна модель використовує вектор із 64 компонентів.

Це логічно пов'язано з SUBIT-64.

Однак необхідно визначити семантику цього вектора.

---

## 18.1. Можливі значення

64-компонентний вектор може бути:

### Activation vector

Кожна компонента показує активність певного стану.

### Probability distribution

Кожна компонента представляє ймовірність.

Тоді:

Σpᵢ = 1

### Relative weighting

Компоненти можуть містити ваги, які не зобов'язані сумуватися до 1.

### Contextual state

Вектор може представляти одночасно:

- активні контексти;
- взаємозалежності;
- часові характеристики;
- структурні зміни.

Ці інтерпретації не є еквівалентними.

---

## 18.2. Рекомендація

Зафіксувати тип контекстного вектора.

Наприклад:

```text
ContextVector64:
    type = ACTIVATION
    domain = SUBIT-64
    normalization = NONE
    interpretation = RELATIVE STATE ACTIVITY
```

Це дозволить уникнути неправильного використання нормалізації або probabilistic interpretation.

---

# XIX. AUDIT-311-16
# CONTEXT ADJUSTMENT

**Severity: P2**  
**Status: Confirmed source-level defect**

У функції `contextAdjust(ctx, weights)` логіка фактичної контекстної модифікації не реалізована повною мірою.

Функція повертає копію ваг, не здійснюючи очікуваної контекстної трансформації.

Схематично:

```text
Context
    +
Evaluation Weights
    ↓
Context Adjustment
    ↓
Modified Weights
```

Але фактична поведінка:

```text
Context
    +
Evaluation Weights
    ↓
Copy(weights)
```

---

## 19.1. Архітектурний наслідок

Якщо метаконтролер передає контекст до evaluation, але контекстна функція фактично не модифікує ваги, система може створювати враження контекстно адаптивної поведінки без реального контекстного впливу.

Це не означає, що весь SUBIT Context Layer не працює.

Це означає, що конкретний механізм адаптації ваг не виконує заявленої функції.

---

## 19.2. Рекомендований тест

Необхідно сформувати:

```text
Weights W
Context C₁
Context C₂
```

Після цього:

```text
W₁ = ContextAdjust(C₁, W)
W₂ = ContextAdjust(C₂, W)
```

І перевірити:

### Тест 1

C₁ ≠ C₂

### Тест 2

W₁ ≠ W₂

### Тест 3

Модифікація має пояснюваний причинний механізм.

### Тест 4

Контекст не створює нестабільних або неконтрольованих змін.

---

# XX. AUDIT-311-17
# HYBRID EVALUATION CONSISTENCY

**Severity: P2**  
**Status: Verification Gap**

SUBIT-CHESS використовує декілька рівнів оцінювання.

Це архітектурно перспективно.

Однак необхідно перевірити, чи вони мають сумісний масштаб.

---

## 20.1. Проблема

Fast Evaluation:

```text
Material
Position
Mobility
```

Structural Evaluation:

```text
Relations
Geometry
Connectivity
Tactical structures
```

Contextual Evaluation:

```text
State
History
Contextual modifiers
```

Якщо ці компоненти мають різні масштаби:

```text
Fast Eval = +120

Structural Eval = +800

Contextual Modifier = +250
```

Тоді навіть невелика зміна search depth може спричинити значну зміну оцінки.

---

## 20.2. Ризик

```text
Search depth 4
    ↓
Fast evaluation
    ↓
Move A selected

Search depth 5
    ↓
Hybrid evaluation
    ↓
Move B selected
```

Це не обов'язково помилка.

Але якщо зміна відбувається через некалібрований масштаб, а не через нову інформацію, пошук може бути нестабільним.

---

## 20.3. Рекомендація

Визначити:

- базову шкалу;
- material units;
- positional units;
- structural units;
- contextual units;
- normalization;
- saturation;
- допустимі межі.

Після цього виконати differential evaluation.

---

# XXI. AUDIT-311-18
# WORKER RUNTIME

**Severity: P1 Verification Gap**  
**Status: Open**

Worker є критичним компонентом UI architecture.

Його коректність не можна підтвердити лише статичним читанням.

---

## 21.1. Необхідні runtime-тести

- Worker creation;
- source loading;
- initialization;
- message protocol;
- search request;
- search result;
- error handling;
- timeout;
- cancellation;
- restart;
- memory behavior;
- termination.

---

## 21.2. Найважливіший сценарій

```text
UI
 ↓
Worker Request
 ↓
Search
 ↓
Result
 ↓
UI Update
```

Необхідно перевірити, що:

- UI не зависає;
- Worker не блокується;
- результат відповідає запиту;
- старі результати не перезаписують нові;
- завершення пошуку не залишає Worker у некоректному стані.

---

# XXII. AUDIT-311-19
# WORKER BLOB URL LIFECYCLE

**Severity: P3**  
**Status: Runtime verification required**

Використання Blob URL для Worker може бути допустимим.

Однак lifecycle URL повинен бути перевірений.

Особливо:

- чи Worker успішно завантажує source;
- чи URL не revoked до завершення initialization;
- чи можливий restart;
- чи не виникає race condition;
- чи підтримується механізм браузером у відповідному середовищі.

Це не підтверджений дефект.

Це ризик runtime compatibility.

---

# XXIII. AUDIT-311-20
# MODAL FOCUS RESTORATION

**Severity: P3**  
**Status: Confirmed source-level UX issue**

Modal повинен підтримувати не лише відкриття та закриття.

Він повинен забезпечувати коректний focus lifecycle.

---

## 23.1. Очікуваний lifecycle

```text
Focus on Trigger
      ↓
Open Modal
      ↓
Focus inside Modal
      ↓
Modal Interaction
      ↓
Close Modal
      ↓
Restore Focus to Trigger
```

У поточній логіці backdrop close може видаляти modal без повного проходження через `closeModal()`.

Це може порушити відновлення фокуса.

---

## 23.2. Наслідки

- focus lost;
- keyboard navigation interruption;
- accessibility degradation;
- непередбачувана взаємодія з screen readers.

### Рекомендація

Усі способи закриття modal повинні проходити через єдину lifecycle-функцію.

---

# XXIV. AUDIT-311-21
# PROMOTION ACCESSIBILITY

**Severity: P3**  
**Status: Verification Gap**

Promotion UI повинен підтримувати:

- keyboard navigation;
- Enter;
- Escape;
- focus management;
- screen readers;
- чітке визначення вибраної фігури.

Необхідно перевірити, чи promotion:

- не вимагає виключно mouse input;
- правильно повідомляє про доступні варіанти;
- не втрачає focus;
- правильно обробляє cancel;
- коректно працює для обох кольорів.

---

# XXV. AUDIT-311-22
# SELF-PLAY TERMINAL STATE

**Severity: P2**  
**Status: Confirmed source-level defect**

Self-play цикл повинен перевіряти terminal state до початку пошуку.

---

## 25.1. Поточний ризик

Можлива послідовність:

```text
Initial Position
      ↓
Search
      ↓
No Move
      ↓
Attempt Move
      ↓
Illegal Move / Error
```

Для terminal position правильна поведінка повинна бути іншою.

```text
Initial Position
      ↓
Terminal State Detection
      ↓
Game Result
      ↓
Stop
```

---

## 25.2. Необхідний порядок

```text
START GAME

    ↓

CHECK TERMINAL STATE

    ├── TERMINAL
    │      ↓
    │   RECORD RESULT
    │      ↓
    │   STOP
    │
    └── NON-TERMINAL
           ↓
        SEARCH
           ↓
        VALIDATE MOVE
           ↓
        APPLY MOVE
           ↓
        CHECK TERMINAL STATE
```

Це особливо важливо для self-play, оскільки terminal position не повинна трактуватися як пошуковий failure.

---

# XXVI. AUDIT-311-23
# SAN PROMOTION NOTATION

**Severity: P3**  
**Status: Confirmed canonical-format issue**

Promotion notation повинна використовувати канонічне представлення.

У поточному source-level implementation promotion SAN може використовувати lowercase notation.

Наприклад:

```text
e8=q
```

Замість канонічного:

```text
e8=Q
```

Це не змінює шахову легальність ходу.

Однак може створювати проблеми:

- interoperability;
- PGN parsing;
- canonical SAN;
- зовнішні аналізатори;
- regression tests.

### Рекомендація

SAN serializer повинен генерувати canonical SAN.

Parser може бути більш толерантним, але serializer повинен мати стабільний формат.

---

# XXVII. CROSS-MODULE AUDIT
# Міжмодульні ризики

Цей розділ важливіший за окремі функції.

---

## 27.1. Position Core → Structural Layer

### Ризик

Неправильна позиція стає неправильною графовою структурою.

### Необхідна перевірка

```text
Position Representation
        ↓
Structural Representation
        ↓
Reverse Mapping
        ↓
Original Position
```

Кожна фігура повинна зберігати:

- square;
- color;
- type;
- identity.

---

## 27.2. Structural Layer → Evaluation

### Ризик

Structural relations можуть бути:

- неповними;
- дубльованими;
- колізійними;
- неправильно класифікованими.

Вони можуть створювати непропорційний evaluation signal.

### Необхідна перевірка

Structural Layer не повинен впливати на evaluation, якщо структурний результат:

- некоректний;
- невалідний;
- неповний;
- невизначений.

---

## 27.3. Context → Search

### Ризик

Context може змінювати пріоритети пошуку.

Однак необхідно відрізняти:

```text
Context modifies move ordering
```

від:

```text
Context modifies position truth
```

Контекст може впливати на порядок дослідження.

Але він не повинен змінювати:

- легальність ходу;
- правила шахів;
- terminal state;
- шахову геометрію.

---

## 27.4. Meta-controller → Search

Метаконтролер повинен мати обмежений authority.

Він може:

- змінювати параметри;
- активувати модулі;
- модифікувати depth strategy;
- адаптувати evaluation.

Але не повинен:

- змінювати legal move set;
- обходити перевірку шаху;
- створювати нелегальні трансформації;
- змінювати terminal rules.

### Критичний принцип

**Adaptive intelligence must not modify game invariants.**

---

# XXVIII. PERFORMANCE AUDIT

Статичний аналіз не дозволяє встановити реальну швидкість рушія.

Однак архітектура містить кілька потенційних bottlenecks.

## 28.1. Основні точки навантаження

1. Move generation.
2. Make/unmake.
3. Attack detection.
4. Evaluation.
5. Structural analysis.
6. Context construction.
7. Graph relations.
8. Transposition Table.
9. QSearch.
10. Worker communication.

---

## 28.2. Найбільш потенційно дорогий компонент

Structural Layer.

Якщо структурний аналіз виконується на кожній позиції дерева пошуку, а не лише на позиціях, де його використання обґрунтоване, його обчислювальна вартість може істотно зростати.

---

## 28.3. Рекомендований принцип

```text
SEARCH
    ↓
FAST FILTER
    ↓
POSITION IMPORTANCE
    ↓
STRUCTURAL ANALYSIS
    ↓
CONTEXTUAL ANALYSIS
```

Не всі позиції повинні проходити повний структурний аналіз.

Важливо визначити:

- коли Structural Layer активується;
- коли результат кешується;
- коли результат інвалідовується;
- які позиції потребують повного аналізу;
- чи можна використовувати incremental updates.

---

# XXIX. MEMORY AUDIT

Окремо необхідно перевірити memory behavior.

Особливо:

- TT;
- evaluation cache;
- structural cache;
- context cache;
- search history;
- self-play history;
- Worker lifetime.

---

## 29.1. Ризик

```text
Search 1
    ↓
Cache

Search 2
    ↓
Cache reuse

Search 3
    ↓
More state
```

Якщо очищення або інвалідація недостатні, можливі:

- memory growth;
- stale entries;
- performance degradation;
- cross-game contamination.

---

## 29.2. Необхідні метрики

- memory before search;
- memory after search;
- memory after game;
- memory after 100 games;
- memory after Worker restart;
- cache hit ratio;
- cache invalidation count.

---

# XXX. SELF-PLAY AUDIT

Self-play є особливо важливим компонентом для автономного розвитку SUBIT-CHESS.

Але self-play сам по собі не є доказом покращення.

---

## 30.1. Проблема самопідтвердження

```text
Engine A
    ↓
Engine A plays itself
    ↓
Observed patterns
    ↓
Engine modifies itself
    ↓
Engine A plays itself
```

Якщо система навчається лише на власній поведінці, вона може посилювати:

- власні помилки;
- власні упередження;
- слабкі тактичні патерни;
- локальні оптимуми.

---

## 30.2. Необхідна архітектура

```text
SELF-PLAY
    ↓
DATA GENERATION
    ↓
PARAMETER UPDATE
    ↓
INDEPENDENT VALIDATION
    ↓
ACCEPT / REJECT
```

Потрібно розділяти:

### Training games

Партії, що використовуються для формування гіпотез.

### Validation games

Партії, які не використовуються для прямого оновлення параметрів.

### Regression tests

Позиції, що перевіряють, чи не погіршилася попередня поведінка.

### Stability tests

Перевірки, чи не виникають нові системні проблеми.

---

# XXXI. DECISION CERTIFICATE AUDIT

Decision Certificate є потенційно одним із найцікавіших компонентів SUBIT-CHESS.

Він може перетворити рішення рушія з непрозорого результату:

```text
Move = e4
```

на структурований процес:

```text
POSITION
    ↓
LEGAL MOVES
    ↓
SEARCH
    ↓
EVALUATION
    ↓
STRUCTURAL CONTEXT
    ↓
ALTERNATIVES
    ↓
SELECTED MOVE
    ↓
DECISION CERTIFICATE
```

Однак Decision Certificate має бути не просто декларативним текстом.

Він повинен відображати реальну причинну структуру рішення.

---

## 31.1. Необхідні поля

```text
Decision Certificate

Position ID
Search Depth
Nodes
Selected Move
Evaluation

Alternative Moves
Alternative Evaluations

Principal Tactical Factors
Principal Structural Factors
Context Factors

Search Confidence
Evaluation Stability
Decision Provenance
```

---

## 31.2. Критичний критерій

Certificate повинен відповідати фактичному search trace.

Не можна генерувати explanation після вибору ходу на основі загальної інтерпретації позиції, якщо ці фактори не впливали на рішення.

Інакше виникає проблема:

**Post-hoc explanation ≠ Decision provenance.**

---

# XXXII. SUBIT-CHESS: СИСТЕМНА ПРОБЛЕМА КОЛАПСУ

Це центральний концептуальний ризик поточної архітектури.

SUBIT використовує багатовимірне представлення стану.

Однак якщо різні структурні компоненти перетворюються на один числовий score, виникає небезпека колапсу інформації.

Наприклад:

```text
Material
+
Mobility
+
Structure
+
Context
+
Tactical relations
```

↓

```text
Single Evaluation Score
```

У цьому процесі різні характеристики можуть втратити свою автономну семантику.

Дві позиції можуть отримати однаковий score, але бути структурно принципово різними.

```text
Position A:
Material Advantage
Weak King
Low Mobility

Position B:
Material Equality
Strong King
High Mobility
```

Якщо:

Eval(A) = Eval(B)

це не означає:

Structure(A) = Structure(B)

---

## 32.1. Рекомендований принцип

Не знищувати структурну інформацію до моменту, коли її агрегування справді необхідне.

Замість:

```text
Position
    ↓
Single Score
```

Використовувати:

```text
Position
    ↓
Multi-dimensional State
    ├── Material
    ├── Tactical
    ├── Positional
    ├── Structural
    ├── Contextual
    └── Temporal
             ↓
       Decision Process
             ↓
        Final Choice
```

Це відповідає принципу:

**DO NOT COLLAPSE — CONTEXTUALIZE.**

---

# XXXIII. AUDIT PRIORITY MATRIX

## P0 — RELEASE BLOCKER

На цьому етапі не виявлено підтвердженого P0-дефекту, який без runtime-перевірки дозволяє однозначно заявити про повну непридатність системи.

Однак це не означає відсутності P0-ризиків.

P0 може виникнути, якщо буде підтверджено:

- генерацію нелегальних ходів;
- неправильне визначення шаху;
- пошкодження позиції після make/unmake;
- критичне порушення hash state;
- неправильне рішення в terminal position;
- систематичне пошкодження search state.

---

## P1 — CRITICAL

| ID | Проблема | Рівень |
|---|---|---|
| AUD-311-01 | FEN ↔ piece-list capacity mismatch | Critical |
| AUD-311-03 | Незалежна верифікація move generation | Critical verification |
| AUD-311-04 | Make/unmake state integrity | Critical verification |
| AUD-311-12 | Structural vertex encoding collision | Critical |
| AUD-311-18 | Worker runtime verification | Critical verification |

---

## P2 — HIGH

| ID | Проблема |
|---|---|
| AUD-311-05 | Hash/context mixing risk |
| AUD-311-06 | TT replacement and stale entries |
| AUD-311-08 | Null move / zugzwang |
| AUD-311-09 | QSearch checking move filtering |
| AUD-311-10 | QSearch tactical termination |
| AUD-311-11 | Evaluation cache invalidation |
| AUD-311-13 | Discover ray detection |
| AUD-311-14 | Fork hyperrelation semantics |
| AUD-311-16 | ContextAdjust incomplete |
| AUD-311-17 | Hybrid evaluation calibration |
| AUD-311-22 | Self-play terminal state |

---

## P3 — MEDIUM / LOW

| ID | Проблема |
|---|---|
| AUD-311-02 | FEN canonicalization |
| AUD-311-07 | TT metrics |
| AUD-311-15 | Context vector semantics |
| AUD-311-19 | Worker Blob URL lifecycle |
| AUD-311-20 | Modal focus restoration |
| AUD-311-21 | Promotion accessibility |
| AUD-311-23 | SAN promotion canonicalization |

---

# XXXIV. RECOMMENDED AUDIT ROADMAP

Не рекомендую зараз переходити до нових архітектурних модулів.

Найкращий напрям — послідовне закриття технічних невизначеностей.

## AUDIT PHASE A
### CHESS CORE INTEGRITY

Пріоритет: максимальний.

Перевірити:

1. FEN.
2. Position representation.
3. Piece lists.
4. Attack detection.
5. Pseudo-legal moves.
6. Legal moves.
7. Check.
8. Checkmate.
9. Stalemate.
10. Castling.
11. En passant.
12. Promotion.

Результат:

```text
CORE INTEGRITY REPORT
PASS / FAIL
```

---

## AUDIT PHASE B
### STATE REVERSIBILITY

Перевірити:

- MakeMove;
- UnmakeMove;
- board;
- piece lists;
- hash;
- king positions;
- castling rights;
- en passant;
- clocks;
- repetition.

Результат:

```text
STATE REVERSIBILITY
PASS / FAIL
```

---

## AUDIT PHASE C
### SEARCH CORRECTNESS

Перевірити:

- Iterative Deepening;
- PVS;
- Alpha-Beta;
- LMR;
- NMP;
- QSearch;
- TT;
- Mate scores;
- timeout;
- cancellation.

---

## AUDIT PHASE D
### EVALUATION CORRECTNESS

Перевірити:

- material;
- PST;
- mobility;
- king safety;
- phase;
- structural evaluation;
- contextual evaluation;
- score normalization.

---

## AUDIT PHASE E
### SUBIT STRUCTURAL VALIDITY

Перевірити:

- vertex encoding;
- edge encoding;
- relation semantics;
- hyperrelations;
- graph distances;
- discover;
- fork;
- pin;
- blockade;
- connectivity;
- structural stability.

---

## AUDIT PHASE F
### AUTONOMOUS ADAPTATION

Перевірити:

- Meta-controller;
- ContextAdjust;
- adaptive weights;
- self-play;
- parameter mutation;
- validation;
- regression;
- acceptance/rejection;
- rollback.

---

## AUDIT PHASE G
### RUNTIME / UI / WORKER

Перевірити:

- browser runtime;
- Worker;
- concurrency;
- timeout;
- restart;
- UI;
- modal;
- promotion;
- keyboard accessibility;
- memory.

---

# XXXV. FINAL VERDICT

## SUBIT-CHESS v3.0.11

### Архітектурна оцінка

**ADVANCED EXPERIMENTAL ENGINE**

### Шахове ядро

**NOT YET INDEPENDENTLY VERIFIED**

### Search Engine

**IMPLEMENTED — VALIDATION REQUIRED**

### Structural Intelligence

**PROMISING — STRUCTURAL CORRECTNESS ISSUES IDENTIFIED**

### Contextual Intelligence

**PARTIALLY IMPLEMENTED — SEMANTIC AND FUNCTIONAL VALIDATION REQUIRED**

### Autonomous Learning

**EXPERIMENTAL — INDEPENDENT VALIDATION REQUIRED**

### Runtime

**NOT VERIFIED**

### Release Status

# OPEN — NOT CERTIFIED

---

# XXXVI. Головний висновок

SUBIT-CHESS v3.0.11 перебуває на цікавому етапі розвитку.

Його головна цінність уже не лише у спробі побудувати шаховий рушій.

Він намагається створити архітектуру, в якій шахова позиція розглядається як багатовимірний стан, що включає геометрію, матеріал, тактичні відношення, структурну організацію, контекст і динаміку.

Це перспективний напрям.

Але саме зараз необхідно перейти від розширення функціональності до **верифікації фундаменту**.

Я б не рекомендував додавати нові рівні інтелекту до v3.0.11, поки не буде підтверджено, що:

- позиція представлена без втрат;
- кожна трансформація є коректною;
- генератор ходів не допускає помилок;
- пошук не спотворює шахову логіку;
- hash і TT не порушують цілісність стану;
- Structural Layer правильно відображає шахову геометрію;
- Context Layer реально впливає на рішення;
- Self-play не навчається на некоректних результатах.

**Найважливіша наступна дія — не PATCH, а AUDIT A: повна незалежна перевірка шахового ядра з формуванням конкретних тестів, інваріантів і критеріїв PASS/FAIL.**

Саме це створить фундамент, на якому SUBIT-CHESS зможе розвиватися як автономний рушій, а не просто як складна система з великою кількістю взаємопов'язаних модулів.

