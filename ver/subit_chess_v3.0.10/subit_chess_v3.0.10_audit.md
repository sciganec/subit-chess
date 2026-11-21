# SUBIT-CHESS v3.0.10
## Аналіз результатів аудиту та нового двигуна

**Audit scope:** Correctness · State Integrity · Search · Learning · Testing · Release Integrity

**Commit:** `b3a7931`

**Тип релізу:** Correctness release

**Статус:** AUDIT REVIEW — нові findings виявлено

---

## 1. Що фактично змінилося

У v3.0.10 відбулася не просто косметична модернізація. Це спроба закрити цикл, започаткований аудитом v3.0.9:

**Виявлення дефектів → формулювання гіпотез → виправлення → regression tests → перевірка → реліз.**

Звіт зафіксував закриття дев'яти записів попереднього аудиту, розділив correctness і strength та відмовився від передчасних заяв про підвищення шахової сили.

Це правильна зміна інженерного підходу.

### Основні зміни

- W01–W05 — виправлення основних дефектів.
- W06 — закриття AUD-07…AUD-09, пов'язаних із null move та terminal-state.
- W07 — незалежний тактичний набір.
- AUD-309-03 — заявлено як перевірений і закритий.
- Self-play — доповнений seed, W/D/L, кольоровим балансом та validation sample.
- Release — приведений до версії 3.0.10.
- Build — переведений на узгоджену версійну конфігурацію.

Релізні матеріали:

- [RELEASE.md v3.0.10](https://github.com/sciganec/subit-chess/blob/b3a7931aada188d4090bf4b39beba6eafec20e5b/ver/subit_chess_v3.0.10/RELEASE.md?utm_source=chatgpt.com)
- [Audit Closure Report](https://github.com/sciganec/subit-chess/blob/b3a7931aada188d4090bf4b/ver/subit_chess_v3.0.10/subit_chess_v3.0.10_audit_closure.md?utm_source=chatgpt.com)

---

# 2. Null-move system — значне покращення

Це, на мою думку, одна з найважливіших змін v3.0.10.

Попередня проблема полягала у взаємодії пошукового null move із правилами автоматичної нічиєї. Null move не є реальним шаховим ходом, але його стан міг впливати на halfmove clock і terminal detection.

У v3.0.10 заявлено, що null move:

- не змінює halfmove;
- не додається до repetition history;
- не змінює repetition limit;
- коректно змінює сторону, яка ходить, і hash;
- має симетричний make/unmake;
- відновлює канонічний стан позиції.

Це правильний напрямок.

## Що особливо цінно

AUD-09 перевіряється не тільки прямим викликом:

```js
makeNullMove()
```

та:

```js
unmakeNullMove()
```

А й через реальний пошуковий шлях, де null move дійсно виконується.

Тобто тест намагається підтвердити не просто наявність функції, а її участь у реальному search.

Це сильніше за звичайний unit test.

### Моя оцінка

**Null-move lifecycle: значно покращений.**

Але повна коректність null-move pruning все ще не доведена. Окремо необхідно досліджувати:

- zugzwang;
- null-move fail-high;
- verification search;
- граничні depth;
- взаємодію з TT;
- ситуації, коли null move не має шахового еквівалента.

---

# 3. FEN validator — правильне посилення

У v3.0.10 додано:

### En Passant

Перевірка вільності origin square пешки, яка здійснила double push.

### Counters

Перевірка:

- `Number.isSafeInteger()`;
- коректного halfmove;
- fullmove ≥ 1;
- відсутності небезпечних числових значень.

Це важливе посилення boundary validation.

FEN тепер розглядається не як безумовно довірений рядок, а як зовнішнє свідчення стану, яке повинно пройти перевірку перед передаванням у Position.

Цілком відповідає принципу:

> DO NOT COLLAPSE — CONTEXTUALIZE.

Водночас FEN validation не тотожна перевірці історичної досяжності позиції. Валідатор може підтвердити структурну та частину шахової коректності, не доводячи, що позиція реально могла виникнути з початкової позиції за легальною послідовністю ходів.

Це залишається окремим рівнем.

---

# 4. AUD-08 — Dead material на горизонті

Це також важливе виправлення.

У попередніх версіях terminal-state detection та search horizon могли давати різні результати для позицій із недостатнім матеріалом.

У v3.0.10 логіка dead material включена в:

- `negamax()`;
- `quiescence()`.

Додатково враховано проблему lazy piece cache.

Це важливо, тому що похідні характеристики позиції не повинні обчислюватися на застарілому cache.

Особливо позитивно оцінюю regression-сценарій:

- позиція перебуває в шаху;
- є лише одна легальна відповідь;
- ця відповідь призводить до K vs K;
- evaluator штучно повертає `7777`;
- search все одно повинен визначити draw.

Це хороший принцип тестування:

**Штучно погіршити evaluator, щоб перевірити, чи шахові правила мають вищий пріоритет.**

Rule authority повинна належати шаховому ядру, а не оцінювальній функції.

---

# 5. Критичне Finding: AUD-309-03 фактично не закрито

## P1 — CONFIRMED

### Challenger не отримує параметри під час гри чорними

У `src/engine/learn.mjs`:

```js
export function pairColors(championParams, challengerParams, gameIndex) {
  const challengerIsWhite = gameIndex % 2 === 0;

  return {
    white: challengerIsWhite ? challengerParams : championParams,
    black: challengerIsWhite ? championParams : championParams,
    challengerIsWhite
  };
}
```

Проблема знаходиться тут:

```js
black: challengerIsWhite
  ? championParams
  : championParams
```

В обох гілках `black` отримує `championParams`.

Отже, challenger фактично не отримує параметри для гри чорними.

### Фактична поведінка

| Game | White | Black | Challenger |
|---|---|---|---|
| 0 | Challenger | Champion | White |
| 1 | Champion | Champion | Заявлено Black |
| 2 | Challenger | Champion | White |
| 3 | Champion | Champion | Заявлено Black |

У парних іграх challenger отримує свої параметри.

У непарних — обидва engine використовують параметри champion.

Це означає, що баланс кольорів у статистиці формально існує, але **реального балансу участі challenger немає**.

---

## 5.1 Чому regression test пропустив дефект

У `tests/engine.audit309.mjs` є перевірка:

```js
const even = pairColors('C', 'N', 0);
const odd = pairColors('C', 'N', 1);
```

Далі перевіряється:

```js
odd.white === 'C'
odd.black === 'N'
```

Цей тест мав би виявити дефект.

Але фактична реалізація повертає:

```js
odd.black === 'C'
```

Тобто за представленим кодом ця перевірка повинна завершитися `FAIL`.

Це дуже важливий результат.

Якщо release-report стверджує:

```text
npm test — exit 0
```

і водночас поточний код містить зазначену реалізацію, виникає невідповідність між:

- source code;
- regression test;
- заявленим результатом тестування.

Можливі причини:

1. Тест фактично запускався на іншій версії файлу.
2. Тестовий результат отримано до останнього зміщення коду.
3. Snapshot не відповідає commit.
4. У репозиторій потрапили зміни, які не були протестовані після останнього commit.
5. Інша причина release integrity, яку потрібно встановити.

На даному етапі я не роблю припущення щодо того, яка саме причина відбулася.

**Сам defect у `pairColors()` підтверджений статичним аналізом.**

---

# 6. Це більше, ніж помилка self-play

Дефект впливає не тільки на функцію `compare()`.

Він зачіпає весь контур розвитку двигуна.

```text
PARAMETERS
    ↓
CHAMPION
    ↓
CHALLENGER
    ↓
SELF-PLAY
    ↓
ΔS
    ↓
SIGNIFICANCE
    ↓
ACCEPT / REJECT
    ↓
HILL CLIMB
```

Якщо Challenger фактично не грає чорними, результати експериментів можуть бути зміщені.

Особливо небезпечний сценарій:

- нові параметри змінюють поведінку engine;
- зміни оцінюються тільки на частині кольорових конфігурацій;
- результат приймається як значущий;
- параметри переходять до наступної ітерації;
- подальші результати накопичують bias.

Тому AUD-309-03 — не просто defect у тестовій функції.

Це **дефект експериментальної інфраструктури**.

---

# 7. Додатковий finding: тестування кольорів перевіряє metadata, а не фактичне виконання

У `compare()` є:

```js
const pair = pairColors(championParams, challengerParams, i);
```

Далі:

```js
const g = playGame(pair.white, pair.black, {
  depth,
  seed: (seed + i * step) >>> 0,
  maxPlies,
  startPlies
});
```

Тобто результат реального матчу повністю залежить від того, які параметри повернула `pairColors()`.

У результатах гри додатково записується:

```js
challengerColor: pair.challengerIsWhite ? 'w' : 'b'
```

Це metadata.

Вона не доводить, що challenger дійсно використовувався відповідним кольором.

### Архітектурна проблема

Система окремо має:

- **Identity claim** — хто нібито грає;
- **Parameter assignment** — які параметри реально передано;
- **Execution** — хто реально зробив хід;
- **Result attribution** — кому приписано результат.

AUDITOR повинен перевіряти всі чотири рівні.

В іншому випадку metadata можуть показувати правильну статистику, тоді як actual execution залишається неправильним.

---

# 8. Self-play independence — прогрес, але не повна статистична незалежність

У v3.0.10 self-play покращений:

- детермінований PRNG;
- seed;
- різні стартові FEN;
- tuning sample;
- validation sample;
- W/D/L;
- balanced colors;
- відтворюваність.

Це правильний крок.

Але я б не називав такі матчі автоматично статистично незалежними лише через різні seed.

Необхідно розрізняти:

**Reproducibility** — можна повторити експеримент.

**Diversity** — експерименти мають різні стартові умови.

**Independence** — результати мають достатню статистичну незалежність для обґрунтованих висновків.

**Validity** — експеримент вимірює саме те, що потрібно.

У v3.0.10 перші два компоненти значно покращено. Третій і четвертий потребують окремого протоколу.

---

# 9. Тактичний набір W07

Новий `tests/engine.tactics.mjs` — позитивна зміна.

Покриття:

- back-rank mate;
- smothered mate;
- quiet mate;
- ladder mate;
- forced capture chain;
- pawn-only zugzwang;
- TT reuse;
- pruning configurations.

Особливо важливо, що пошук порівнюється в кількох конфігураціях:

- default;
- no-null;
- no-TT;
- no-pruning.

Це дозволяє виявляти випадки, коли оптимізація пошуку приховує або знищує правильне тактичне рішення.

Але термін **independent tactical suite** потрібно використовувати обережно.

Тести незалежні від smoke fixtures, але не є незалежним шаховим oracle. У них engine тестується проти заздалегідь сформованих очікувань, а не проти незалежної реалізації шахових правил і пошуку.

Це хороший regression suite, але не завершена незалежна верифікація.

---

# 10. Release integrity

У v3.0.10 правильно приведено до єдиної версії:

- `package.json`;
- `main`;
- `browser`;
- Engine `VERSION`;
- build;
- release HTML;
- CI.

Також заявлено SHA-256:

```text
9A08F02F8AF4499813FE3167429A7A27D0A95071BA4A1C62EB60A9BB011C6581
```

Це добре.

Однак я не виконував локально:

```powershell
npm run build
npm test
```

Тому я не можу незалежно підтвердити:

- exit code 0;
- 51 audit check;
- 34 tactical check;
- детермінованість build;
- SHA-256;
- тотожність трьох HTML-файлів.

Ці результати поки мають статус **REPORTED — NOT INDEPENDENTLY EXECUTED BY THIS REVIEW**.

---

# 11. Найважливіший інженерний висновок

v3.0.10 демонструє, що проєкт перейшов до більш дисциплінованої моделі розвитку.

Однак аудит виявив проблему в самому механізмі контролю якості.

## Regression tests можуть містити правильну перевірку, але реліз все одно не повинен вважатися перевіреним, доки конкретний snapshot коду не пов'язаний з фактичним результатом виконання.

Це наступний рівень SUBIT-CHESS AUDITOR.

Не лише:

```text
Code
↓
Tests
↓
PASS
```

А:

```text
SOURCE COMMIT
      ↓
TEST VERSION
      ↓
TEST EXECUTION
      ↓
ACTUAL OUTPUT
      ↓
RESULT ASSERTION
      ↓
ARTIFACT HASH
      ↓
RELEASE IDENTITY
```

Тобто кожне твердження аудиту повинно мати provenance.

---

# 12. Оновлений реєстр findings

| ID | Severity | Finding | Статус |
|---|---|---|---|
| AUD-310-01 | P1 | `pairColors()` передає champion як Black у обох випадках | **CONFIRMED** |
| AUD-310-02 | P1 | Regression test і source не узгоджуються з заявленим PASS | **CONFIRMED INCONSISTENCY** |
| AUD-310-03 | P1 | Self-play color balance metadata не гарантує реального parameter balance | **CONFIRMED DESIGN DEFECT** |
| AUD-310-04 | P2 | Seed diversity не гарантує незалежність спостережень | **VALIDATION GAP** |
| AUD-310-05 | P2 | Незалежний chess oracle відсутній | **OPEN** |
| AUD-310-06 | P2 | Browser/Worker stress testing не виконано | **OPEN** |
| AUD-310-07 | P2 | Release hash та build не перевірені незалежним виконанням | **UNVERIFIED** |

---

# 13. Загальна оцінка v3.0.10

| Напрям | Оцінка |
|---|---|
| Chess core | 🟢 Хороша структурна основа |
| State integrity | 🟢 Значне покращення |
| Null-move lifecycle | 🟢 Значне покращення |
| FEN validation | 🟢 Посилено |
| Terminal detection | 🟢 Посилено |
| Search correctness | 🟡 Прогрес, але потрібні нові edge-case audits |
| Tactical regression | 🟢 Краще покриття |
| Self-play protocol | 🟡 Архітектура покращена, але є критичний дефект |
| Parameter learning | 🔴 Результати наразі ненадійні через AUD-310-01 |
| SUBIT architecture | 🟡 SUBIT-derived, canonical conformance не встановлено |
| Playing strength | ⚪ Не виміряна |
| Release integrity | 🟡 Заявлено, незалежно не перевірено |

---

# 14. Мій висновок

**v3.0.10 — значно зріліший correctness-реліз, ніж v3.0.9.**

У ньому видно правильні інженерні рішення:

- не змішувати correctness зі strength;
- не змінювати оцінювання без доказів;
- зберігати release snapshots;
- додавати regression tests;
- використовувати детерміновані експерименти;
- перевіряти state restoration;
- відокремлювати tuning і validation;
- документувати невирішені питання.

Проте знайдений дефект у `pairColors()` означає, що **audit closure 9/9 не можна приймати як остаточно підтверджене**.

Це не знецінює всю роботу. Навпаки, це саме той випадок, заради якого AUDITOR і створюється: він виявив проблему, яка пройшла через кілька рівнів документації, тестів і release claims.

### Поточний статус

> **SUBIT-CHESS v3.0.10 — CORRECTNESS IMPROVEMENTS VERIFIED BY SOURCE REVIEW, BUT AUDIT CLOSURE REQUIRES REOPENING.**
