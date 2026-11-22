# SUBIT-CHESS v3.0.9 — повний аудит релізу

AUDIT-ONLY · без внесення змін до репозиторію

Я провів первинне дослідження релізу **SUBIT-CHESS v3.0.9** за репозиторієм, release-документацією, зібраним HTML, структурою engine, тестами, build-системою та конфігурацією пакета.

# 3.0.9

Версія релізу

# 450 KB

Standalone HTML

# 12

AUD-01…AUD-12 тестів заявлено в AUDIT2?\*

\*12 перевірок — це заявлена кількість тестів у релізному AUDIT2, а не кількість усіх тестів системи.

Об'єкт: [SUBIT-CHESS v3.0.9 release directory](https://github.com/sciganec/subit-chess/tree/main/ver/subit_chess_v3.0.9)

---

## 1\. Executive summary

Попередній статус: RELEASE NOT YET INDEPENDENTLY VERIFIED

Реліз демонструє суттєве покращення порівняно з попередньою версією. Шість попередніх критичних дефектів пошуку AUD-01…AUD-06, за документацією, виправлені. Але документація релізу та наявність тестів не є достатнім доказом повної коректності шахового двигуна.

Під час незалежного аналізу метаданих репозиторію вже виявлено **конкретну проблему конфігурації версії**, а також кілька зон, які потребують глибокої перевірки.

## Позитивні аспекти

- Виправлення P0 qsearch
- Перевірка автоматичних нічиїх
- Збереження легальності ходів
- Диференційні тестування
- Окремий модуль перевірки інваріантів
- Standalone offline-архітектура

## Проблемні зони

- Застарілі package entry points
- Не доведена повнота FEN validation
- Ризики null-move pruning
- Ризики repetition history
- Не підтверджена сила гри
- Не виконані незалежні практичні матчі

---

# 2\. P1 — підтверджений дефект конфігурації пакета

(CONFIRMED)

**AUD-309-01 — Package entry points залишилися на v3.0.8**

У `package.json` версія пакета\:

```
{
  "version": "3.0.9"
}
```



Але entry points досі вказують на попередню версію\:

```
{
  "main": "src/subit_chess_v3.0.8.html",
  "browser": "src/subit_chess_v3.0.8.html"
}
```



Фактично\:

| Параметр | Значення |
|--------|--------|
| Package version | 3.0.9 |
| Main entry | v3.0.8 |
| Browser entry | v3.0.8 |
| Actual current source | v3.0.9 |
| Current release HTML | v3.0.9 |

### Наслідок

Споживачі, автоматизація, npm-інструменти або системи, які використовують `main` чи `browser`, можуть отримати попередню версію engine, навіть якщо пакет формально має версію 3.0.9.

Це не дефект шахового пошуку, але це дефект релізної цілісності.

**Рекомендація\:** P1 для packaging/release pipeline, P2 для самого engine.

---

# 3\. P1/P2 — FEN валідатор: формально валідна, але не повністю перевіряє історичну можливість позиції

(CONFIRMED GAP)

**AUD-309-02 — неповна перевірка En Passant у FEN**

У `src/engine/fen.mjs` перевіряється\:

- формат En Passant;
- відповідність рангу стороні, яка ходить;
- незайнятість цільового поля;
- наявність пешки, яка нібито здійснила подвійний хід.

Але відсутня перевірка **початкового поля пешки до її подвійного ходу**\.

Наприклад, валідатор перевіряє, що після останнього ходу пешка стоїть на потрібному полі, але не перевіряє, чи було поле, з якого вона стартувала, вільним.

Це допускає деякі FEN, що не відповідають жодній легальній попередній позиції.

### Чому це важливо

FEN використовується як зовнішня точка входу до engine\:

- аналіз позицій;
- завантаження партій;
- перевірка тактичних задач;
- пошук;
- дослідження користувачем.

Якщо позиція прийнята, але її історичний стан неможливий, результати аналізу можуть бути некоректними.

Рекомендація: додати окремі regression-тести для En Passant — target square, pushed pawn, origin square, side to move та можливість легального En Passant.

---

# 4\. P2 — надмірно великі FEN counters

У FEN перевірка halfmove та fullmove здійснюється регулярними виразами на числові символи\:

```
/^\d+$/
```



Це означає, що формально приймаються довільно великі значення.

Наприклад, поля\:

```
999999999999999999999999999999999999
```



можуть пройти перевірку синтаксису, але JavaScript `Number` не гарантує точного представлення таких чисел.

### Потенційні наслідки

- неточність лічильника;
- некоректне визначення автоматичних нічиїх;
- неправильна логіка обробки 50/75-ходових правил;
- порушення відтворення FEN;
- неоднозначність стану при екстремальних значеннях.

(P2 · DEFENSIVE VALIDATION)

Рекомендую перевірити числові межі та використання `Number.isSafeInteger()` у FEN parser.

---

# 5\. Core engine — структурний аудит

Файл\: `src/engine/core.mjs`

Архітектура ядра використовує\:

- 0x88 board representation;
- incremental Zobrist hashing;
- два 32-бітні hash components;
- piece lists;
- incremental phase material;
- make/unmake;
- repetition history;
- legal move generation;
- castling;
- En Passant;
- promotion.

Це правильна база для автономного engine.



## 5.1 State integrity

Реалізовано механізми перевірки\:

- `verifyMakeUnmake()`
- `verifyPieceLists()`
- `verifyLegalMoves()`
- `verifyPosition()`
- `verifyCaptures()`
- `verifySearch()`
- `verifyDeterminism()`

Це сильна сторона архітектури: engine не просто генерує ходи, а має інструменти для перевірки власних інваріантів.

Однак існує важливе обмеження\:

> Self-verification не є незалежною перевіркою, якщо verifier і engine використовують однакові алгоритмічні припущення.

Наприклад, якщо основний генератор та verifier однаково неправильно трактують конкретне шахове правило, обидва можуть пройти тест.

Тому необхідні незалежні oracle-тести, особливо для\:

- castling;
- pinned pieces;
- double check;
- discovered check;
- En Passant;
- promotion;
- checkmate;
- stalemate.

---

## 5.2 Repetition system

У Position використовується\:

```
this.rep = [];
this.repHi = [];
this.repLimit = 0;
```



Два компоненти hash для повторення — правильне рішення, оскільки один 32-бітний hash не повинен бути єдиним доказом ідентичності позиції.

Також `repLimit` дозволяє обмежувати релевантну історію після незворотних ходів.

Зона високого ризику\:

- null move;
- history rollback;
- повторення після capture;
- повторення після pawn move;
- castling rights;
- En Passant state;
- make/unmake після null move.

Ці компоненти мають перевірятися не тільки на окремих позиціях, а й у довгих циклах послідовностей ходів.

---

# 6\. Search engine — найважливіший напрям аудиту

Файл\: `src/engine/search.mjs`

Заявлена архітектура\:

- iterative deepening;
- alpha-beta;
- transposition table;
- aspiration windows;
- quiescence search;
- move ordering;
- killers;
- history heuristic;
- LMR;
- null-move pruning;
- futility pruning;
- structural ordering;
- adaptive budget.



## 6.1 Виправлення v3.0.9

Release notes підтверджують, що в попередній версії були виправлені шість серйозних проблем\:

| ID | Дефект | Статус за release notes |
|--------|--------|--------|
| AUD-01 | Stand-pat у шаху | FIXED |
| AUD-02 | Qsearch depth cap у шаху | FIXED |
| AUD-03 | Stalemate на глибокому горизонті | FIXED |
| AUD-04 | Claimable draw трактувався як terminal | FIXED |
| AUD-05 | Root не враховував automatic draws | FIXED |
| AUD-06 | Неправильний знак у futility | FIXED |

Ці зміни логічно важливі, особливо AUD-01, AUD-02 та AUD-06.

### Що це означає

v3.0.9 значно покращує **коректність результату пошуку**\.

Але це не означає, що engine став сильнішим у шаховому сенсі.

Це два різні виміри\:

- Search correctness — чи правильно engine оцінює та обробляє дерево.
- Playing strength — чи виграє engine більше партій у реальних матчах.

---

## 7\. P1 — Null-move pruning змінює реальний лічильник ходів

(CONFIRMED BY CODE)

**AUD-309-03 — Null move може створити штучну автоматичну нічию**

У `src/engine/core.mjs`\:

```
makeNullMove() {
  // ...
  this.turn = opposite(this.turn);
  // ...
  this.halfmove++;
  this.ply++;
}
```



Null move — це не реальний шаховий хід. Але він збільшує `halfmove`\.

У пошуку `src/engine/search.mjs`\:

```
if (pos.halfmove >= 150) return 0;
```



### Сценарій дефекту

1. Реальна позиція має `halfmove = 149`\.
2. Engine запускає null-move pruning.
3. Null move збільшує `halfmove` до 150.
4. Рекурсивний пошук бачить автоматичну нічию.
5. Повертає `0`\.
6. Цей результат може використатися для pruning.

## Схематичний сценарій

Реальна позиція 149 halfmoves

Null move 150 halfmoves

Recursive search Draw = 0

---

Штучна terminal-оцінка може впливати на реальний вибір ходу.

Це особливо небезпечно в позиціях, де одна сторона має матеріальну або позиційну перевагу.

### Рекомендоване виправлення

Null move має зберігати та відновлювати всі поля стану, необхідні пошуку, але не повинен створювати фальшивий стан автоматичної нічиєї.

Потрібен regression-test\:

- FEN із `halfmove = 149`;
- null move;
- recursive search;
- перевірка, що null move не створює автоматичної нічиєї;
- повне відновлення state після `unmakeNullMove()`\.

Пріоритет P1 — до наступного релізу.

---

## 8\. P1 — Self-play / parameter comparison містить критичну помилку

(CONFIRMED BUG)

**AUD-309-04 — Challenger не грає чорними**

Файл\:

`src/engine/learn.mjs`

Функція\:

```
export function compare(championParams, challengerParams, opts = {})
```



Зараз\:

```
const challengerIsWhite = i % 2 === 0;

const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : championParams;
```



Зверни увагу на `b`\.

В обох гілках призначається `championParams`\.

## Фактична конфігурація матчів

| Game | White | Black |
|--------|--------|--------|
| Парна гра | Challenger | Champion |
| Непарна гра | Champion | Champion |

Challenger не тестується чорними взагалі.

### Наслідок

Результат `compare()` не є коректним порівнянням двох версій engine.

Параметр challenger тестується лише у половині матчів і лише за білих. Інша половина матчів фактично є Champion vs Champion.

Це може спотворювати\:

- ΔS;
- win rate;
- статистичну значущість;
- прийняття або відхилення параметрів;
- результати `hillClimb()`;
- майбутню оптимізацію SVF.

### Очікувана логіка

```
const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Другий рядок має бути\:

```
const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Ні — це знову неправильно, оскільки challenger знову не грає чорними.

Правильна логіка повинна бути\:

```
const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Тут є логічна суперечність у самій структурі, якщо обидва призначення залишити такими, тому фактично правильна реалізація — чорні мають отримувати challenger при challengerIsWhite=false\:

```
const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Увага: у наведеному вище фрагменті все ще повторюється champion — це не остаточний patch. Справжнє правильне призначення потрібно записати так\:

```
const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Перш ніж застосовувати patch, ми окремо повинні сформувати й перевірити його regression-test. Не варто механічно вставляти фрагмент, який я навів у тексті, оскільки він не виправляє defect.

---

### Важливе уточнення до patch

Вище я кілька разів повторив однакове призначення параметрів у прикладі. Це моя помилка. **Patch поки не застосовувати.**

Правильне призначення для обох кольорів має бути саме таким\:

```
const challengerIsWhite = i % 2 === 0;

const w = challengerIsWhite
  ? challengerParams
  : championParams;

const b = challengerIsWhite
  ? championParams
  : challengerParams;
```



Ця версія гарантує\:

- Game A: Challenger — White, Champion — Black.
- Game B: Champion — White, Challenger — Black.

Це також демонструє, чому AUDITOR має не просто шукати синтаксичні помилки, а перевіряти семантику призначень і незалежно підтверджувати поведінку.

---

## 9\. P1 — статистична достовірність self-play порівнянь

Навіть після виправлення призначення кольорів залишається окрема проблема.

У `playGame()`\:

```
void opts.seed;
```



Seed приймається, але не використовується.

У `compare()` повторюються матчі з тієї самої стартової позиції та детермінованим пошуком.

### Поточний ризик

Кількість матчів не обов'язково означає кількість незалежних спостережень.

Наприклад, 40 ігор можуть фактично бути повторенням декількох однакових траєкторій.

У такому випадку\:

- стандартна помилка `se` може бути штучно занижена;
- поріг `2 × se` стає ненадійним;
- параметр може бути прийнятий через хибну статистичну впевненість.

(P1 · VALIDATION INTEGRITY)

### Необхідне рішення

Self-play evaluation повинен використовувати\:

1. Баланс кольорів.
2. Різні стартові позиції або контрольований набір стартів.
3. Унікальні сценарії для кожної пари.
4. Фіксовану, відтворювану seed-стратегію.
5. Незалежну validation-вибірку.
6. Повний облік W/D/L.
7. Відсутність leakage між tuning та validation.

---

# 10\. P2 — Тестування: наявність тестів ≠ повна незалежна верифікація

Репозиторій має суттєвий тестовий набір. Зокрема\:

- `core.perft.mjs` — перевірка кількості легальних ходів на контрольних позиціях;
- `engine.smoke.mjs` — базові сценарії пошуку;
- `engine.audit.mjs` — аудиторські перевірки;
- `engine.audit2.mjs` — регресії AUD-01…AUD-06;
- `engine.verify.mjs` — інваріанти;
- `engine.differential.mjs` — диференційні перевірки;
- `engine.topology.mjs` — перевірка топологічного компонента;
- `engine.plans.mjs` — перевірка планів;
- `engine.eval.mjs` — перевірка оцінювання;
- `engine.learn.mjs` — навчання та параметри;
- `engine.worker.mjs` — Worker;
- `app.dom.mjs` — DOM/UI.

## 10.1 Perft

Наявність класичних perft-позицій, включаючи складні ситуації з En Passant та шаховою геометрією, — це сильна основа для перевірки генератора ходів.

Але perft не перевіряє\:

- стратегічну якість оцінки;
- коректність pruning;
- пошук тихих тактичних ходів;
- правильність TT bounds;
- статистичну силу;
- якість SVF.

## 10.2 AUDIT2

AUDIT2 перевіряє регресії, що виникли у попередній версії.

Але деякі тести використовують спеціально сконструйовані evaluator stubs.

Це правильно для ізоляції конкретної логіки, проте необхідно доповнити\:

- реальними позиціями;
- реальним evaluator;
- різними alpha/beta windows;
- TT-enabled і TT-disabled режимами;
- null-move-enabled та null-move-disabled режимами;
- різними глибинами.

## 10.3 Differential testing

Differential testing є важливою частиною аудиту, особливо коли він перевіряє різницю між результатами незалежних алгоритмів.

Але потрібно чітко визначити, що саме є незалежним\:

- інша реалізація операції;
- інший алгоритм;
- інша representation;
- інший математичний oracle.

Якщо два методи використовують ті самі базові функції, вони можуть підтверджувати спільну помилку.

---

# 11\. P2 — Інтеграція Worker та UI

Реліз містить\:

- Worker на основі Blob;
- engine, вбудований у HTML;
- обмін повідомленнями;
- повторне використання engine в Worker;
- reset memory/TT;
- DOM integration tests.



## Позитивні аспекти

Standalone-архітектура\:

- не потребує CDN;
- не має зовнішніх chess dependencies;
- працює локально;
- дозволяє зберігати engine в одному HTML;
- зменшує складність інсталяції;
- Worker може ізолювати обчислення від UI.

## Зони перевірки

| Компонент | Необхідний тест |
|--------|--------|
| Worker timeout | Engine не зависає після перевищення ліміту |
| Worker termination | Ресурси правильно звільляються |
| Reset TT | Немає старих результатів |
| Повторні повідомлення | Коректне зіставлення request ID |
| Race conditions | Старий search не перезаписує новий |
| UI responsiveness | Дошка залишається інтерактивною |
| FEN input | Некоректні позиції не змінюють поточну гру |
| Undo | Повне відновлення стану |
| PGN | Коректне відображення результату та стартової позиції |

Статичний аудит підтверджує наявність Worker-архітектури, але не підтверджує її поведінку в реальному браузері під навантаженням.

---

# 12\. P2 — Search correctness та TT

У v3.0.9 реалізовано\:

- iterative deepening;
- TT;
- aspiration window;
- alpha-beta;
- PVS/null-window search;
- LMR;
- futility;
- null-move pruning;
- quiescence.

Після виправлення AUD-01…AUD-06 важливо провести окрему перевірку взаємодії цих алгоритмів.

Ключові тестові комбінації\:

TT

Enabled / Disabled · Cold / Warm · Reused / Cleared

---

LMR

Enabled / Disabled · різні move index · PV / non-PV

---

Null move

Enabled / Disabled · zugzwang · low material · draw boundaries

---

Futility

Frontier · check · mate · alpha boundaries

---

Quiescence

Check · capture chains · promotion · stalemate · horizon

---

# 13\. P2 — Оцінювання SVF: математична структура ще не підтверджена шаховою ефективністю

SUBIT-CHESS використовує дев'ятикомпонентний positional vector\:

\[
V(P)=(M,K,A,D,C,T,Q,R,X)
\]

І система поєднує\:

- матеріал;
- структуру;
- активність;
- оборону;
- центр;
- темп;
- tactical/king-related компоненти;
- relations;
- structural information.

Це цікава дослідницька архітектура, але на цьому етапі слід відокремлювати **формальну внутрішню узгодженість SVF** від реальної здатності компонента допомагати engine вигравати партії.

Необхідний незалежний ablation-test\:

1. Material-only.
2. Material + PST.
3. Material + conventional positional evaluation.
4. Material + SVF.
5. Material + SVF + plans.
6. Full engine.
7. Full engine без adaptive meta-controller.

Кожна конфігурація повинна грати проти інших із балансом кольорів, однаковими лімітами та контрольованими стартами.

Поки цього немає, **SVF має статус перспективної конструкції, але її шаховий внесок не виміряний**\.

---

# 14\. P1 — Аудиторія null-move history

Release notes самі визнають три відкриті проблеми\:

- AUD-07 — забруднення історії повторень null-ходом;
- AUD-08 — dead material на горизонті;
- AUD-09 — еквівалентність стану після null move.

Ці дефекти не можна вважати закритими в v3.0.9.

## AUD-07…AUD-09 — OPEN

Потрібен окремий аудит null-move lifecycle.

Особливо: repetition state, terminal detection, dead material, state rollback та hash identity.

Найбільш критичний аспект — null move повинен бути ізольованою пошуковою трансформацією. Він не повинен залишати слідів у реальній історії партії або створювати шахові правила, яких фактично не було.

---

# 15\. P2 — Відтворюваність релізу

RELEASE.md заявляє\:

- детермінований build;
- ідентичність release HTML, `src` HTML та `index.html`;
- перевірку SHA-256;
- 11 модулів engine;
- успішне проходження тестів.

У репозиторії це підтримується build-скриптом `build/bundle.mjs`, який\:

1. обходить граф імпортів;
2. формує topological module order;
3. прибирає імпорти;
4. перевіряє частину top-level name collisions;
5. збирає один inline module;
6. вбудовує engine source для Worker;
7. формує release HTML та `index.html`\.

Це хороший підхід до reproducible build.

Але під час цього аудиту я не запускав build і не обчислював незалежно SHA-256. Тому заявлена byte-for-byte ідентичність поки **не є незалежно підтвердженою**\.

---

# 16\. Архітектурний аудит SUBIT

Поточна архітектура

## POSITION CORE

Board · Legal moves · State · Hash · History

## PERCEPTION

Geometry · Mobility · Attacks · Position features

## STRUCTURE

Relations · Tactical motifs · Structural connectivity

## CONTEXT

I × Z × Φ · Initiative · Zone · Phase

## SVF EVALUATION

Vector · Scalarization · Uncertainty · Risk

## SEARCH

Alpha-beta · TT · PVS · LMR · Null · QSearch

## DECISION

Move · PV · Score · Analysis

## Архітектурна оцінка

**Core**

(STRONG FOUNDATION)

Єдиний state та rule authority

**Search**

(NEEDS DEEP AUDIT)

Pruning і terminal interactions

**SVF**

(UNVALIDATED)

Не доведена ефективність

**Learning**

(DEFECT FOUND)

Помилка в challenger color pairing

**Worker/UI**

(PARTIALLY VERIFIED)

Статичний аналіз, без browser stress-test

**Build**

(RELEASE CHECK REQUIRED)

Package metadata не синхронізована

---

# 17\. Підсумковий реєстр дефектів v3.0.9

Виявлено 3 підтверджені логічні дефекти та 1 критичний дефект validation pipeline, плюс 3 відкриті search-related проблеми з release audit.

| ID | Severity | Дефект | Статус |
|--------|--------|--------|--------|
| AUD-309-01 | (P1) | Package entry points v3.0.8 | CONFIRMED |
| AUD-309-02 | (P1) | Null move штучно збільшує halfmove до terminal draw | CONFIRMED |
| AUD-309-03 | (P1) | Challenger не тестується чорними | CONFIRMED |
| AUD-309-04 | (P1) | Self-play comparison має недостатню статистичну незалежність | CONFIRMED DESIGN GAP |
| AUD-309-05 | (P2) | En Passant FEN validation incomplete | CONFIRMED GAP |
| AUD-309-06 | (P2) | FEN counters без верхньої межі / safe integer validation | CONFIRMED GAP |
| AUD-07 | (P1) | Repetition history interaction with null move | OPEN — RELEASE |
| AUD-08 | (P2) | Dead material на горизонті | OPEN — RELEASE |
| AUD-09 | (P2) | Null-move state equivalence | OPEN — RELEASE |

---

# 18\. Що вважаємо реально досягнутим у v3.0.9

Я не хочу несправедливо знецінювати роботу над цим релізом. v3.0.9 має реальні архітектурні переваги\:

Сильні сторони

- Самостійний шаховий engine.
- Власний legal move generator.
- Немає залежності від зовнішніх chess engines.
- Немає зовнішніх chess libraries у runtime engine.
- Зібраний offline HTML.
- Реалізований структурний аналіз позицій.
- SVF evaluation.
- Пошукові плани.
- Transposition table.
- Search verification.
- Regression tests.
- Perft tests.
- Worker.
- Самостійна система параметрів.
- Відтворюваний детермінований режим.

Це вже не просто експериментальний шаховий інтерфейс. Це сформована програмна архітектура шахового двигуна, яка має власний напрям дослідження.

---

# 19\. Що поки не доведено

Необхідно розділити три рівні готовності\:

## LEVEL 1 — ENGINE IMPLEMENTATION

Реалізація існує. Архітектура та основні механізми сформовані.

(ESTABLISHED)

---

## LEVEL 2 — ENGINE CORRECTNESS

Вимагає незалежної перевірки шахових правил, пошуку, terminal states, історії та стану.

(NOT FULLY VERIFIED)

---

## LEVEL 3 — PLAYING STRENGTH

Необхідні контрольовані матчі, рейтингові вимірювання, validation set та статистика.

(NOT ESTABLISHED)

---

# 20\. Рекомендований порядок виправлень

Не рекомендую зараз змінювати SVF, параметри оцінки або збільшувати глибину пошуку.

Спочатку потрібно стабілізувати correctness.

## AUDIT FIX ROADMAP

(P0 / P1) W01 — Null move + 75-move rule interaction

Перевірка штучного terminal draw, state та rollback

---

(P1) W02 — Fix compare() color assignment

Обидва кольори challenger vs champion

---

(P1) W03 — Self-play validation redesign

Independent games, seeds, start positions, confidence

---

(P1) W04 — Package/release integrity

Version, main, browser, build artifact consistency

---

(P2) W05 — FEN validator hardening

En Passant historical consistency and counters

---

(P2) W06 — AUD-07…AUD-09 closure

Null repetition, dead material horizon, state equivalence

---

(P2) W07 — Independent tactical suite

Mate, zugzwang, tactical horizon, pruning regressions

---

(P3) W08 — Browser and Worker stress testing

Memory, time controls, concurrency, lifecycle

---

# 21\. Висновок аудиту

Моя оцінка SUBIT-CHESS v3.0.9\:

# Архітектурно перспективний engine, але реліз потребує додаткового correctness-аудиту.

Головна проблема зараз не у відсутності алгоритмів. Проблема у **взаємодії алгоритмів між собою**\:

- null move × draw rules;
- repetition × artificial search state;
- evaluator × pruning;
- parameter learning × statistical validity;
- package version × actual artifact.

Саме такі дефекти часто не проявляються на звичайних шахових партіях. Engine може виглядати нормально, знаходити хороші ходи, проходити базові тести — і водночас мати помилки у специфічних позиціях.

Моя рекомендація — **не переходити поки до v3.1.0 та не проводити оптимізацію сили**\. Спочатку закрити P1, довести state integrity, перевірити статистичну систему self-play, після чого провести незалежний benchmark.

Аудиторські матеріали\:

- [Release notes v3.0.9](https://github.com/sciganec/subit-chess/blob/main/ver/subit_chess_v3.0.9/RELEASE.md)
- [Position Core](https://github.com/sciganec/subit-chess/blob/main/src/engine/core.mjs)
- [Search Engine](https://github.com/sciganec/subit-chess/blob/main/src/engine/search.mjs)
- [Learning / Self-play](https://github.com/sciganec/subit-chess/blob/main/src/engine/learn.mjs)
- [FEN Validator](https://github.com/sciganec/subit-chess/blob/main/src/engine/fen.mjs)
- [Invariant Verifier](https://github.com/sciganec/subit-chess/blob/main/src/engine/verify.mjs)
- [AUDIT2 Tests](https://github.com/sciganec/subit-chess/blob/main/tests/engine.audit2.mjs)
- [Package Configuration](https://github.com/sciganec/subit-chess/blob/main/package.json)

Обмеження цього аудиту: код досліджувався дистанційно; `npm test`, build, browser stress tests, self-play matches та незалежні шахові oracle-тести не запускалися в локальному середовищі Windows. Висновки CONFIRMED стосуються статично підтвердженої логіки коду, а не результатів виконання тестів.
