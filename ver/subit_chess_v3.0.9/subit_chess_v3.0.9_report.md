# Звіт по аудиту v3.0.9 → v3.0.10

**Джерело істини:** `ver/subit_chess_v3.0.9/subit_chess_v3.0.9_audit.md`, §17 — підсумковий реєстр дефектів; §20 — fix roadmap. Проміжні секції з суперечливим нумеруванням і текстом patch не використовувалися як керівництво до дії.

**Загальний статус:** усі **9/9** записів реєстру §17 закрито або верифіковано як невідтворювані.

**Коміти:**
- `e98d359` — W01–W05, основні виправлення v3.0.10.
- `be27fe4` — W06–W07, закриття AUD-07…AUD-09 та незалежний тактичний набір.

**Верифікація:**
- `npm test` — exit 0.
- `npm run build` — детермінований, `index.html` і versioned HTML мають однаковий SHA-256 після повторної збірки.
- `tests/engine.audit309.mjs` — 51 перевірка.
- `tests/engine.tactics.mjs` — 34 перевірки.

---

## 1. Статус дефектів за реєстром §17

| ID | Audit severity | Статус в аудиті | Поточний статус | Закриття |
|---|---:|---|---|---|
| AUD-309-01 | P1 | CONFIRMED | **CLOSED** | `e98d359`, W04 |
| AUD-309-02 | P1 | CONFIRMED | **CLOSED** | `e98d359`, W01 |
| AUD-309-03 | P1 | CONFIRMED | **CLOSED — NOT REPRODUCIBLE** | `e98d359`, W02 |
| AUD-309-04 | P1 | CONFIRMED DESIGN GAP | **CLOSED** | `e98d359`, W03 |
| AUD-309-05 | P2 | CONFIRMED GAP | **CLOSED** | `e98d359`, W05 |
| AUD-309-06 | P2 | CONFIRMED GAP | **CLOSED** | `e98d359`, W05 |
| AUD-07 | P1 | OPEN — RELEASE | **CLOSED** | `be27fe4`, W06 |
| AUD-08 | P2 | OPEN — RELEASE | **CLOSED** | `be27fe4`, W06 |
| AUD-09 | P2 | OPEN — RELEASE | **CLOSED** | `be27fe4`, W06 |

---

## 2. Що зроблено по кожному напряму

### W01 — AUD-309-02: null move × 75-move rule

**Проблема:** `halfmove = 149` + search-only null move давав штучний `150`, тобто псевдо-термінальний draw у рекурсивному пошуку.

**Виправлення:**
- `makeNullMove()` не змінює `halfmove`.
- Null move не потрапляє до repetition history.
- `unmakeNullMove()` відновлює повний стан: `turn`, `castling`, `ep`, `halfmove`, `fullmove`, `repLimit`, hash, king squares, `phaseMaterial`, `ply`.

**Регресія:** прямий тест на `halfmove = 149`, перевірка `status()` після null move, стану після unmake та рекурсивного пошуку зі stub evaluator.

---

### W02 — AUD-309-03: challenger не тестується чорними

**Результат:** не відтворено. Поточний `src/engine/learn.mjs` уже призначає challenger White на парних і Black на непарних іграх.

**Дія:** patch не застосовувався, оскільки текст аудиту був само суперечливим і явно позначав “Patch поки не застосовувати”. Замість цього семантика заблокована тестами:
- `pairColors()` для парних/непарних ігор.
- `compare()` — послідовність кольорів `wbwb`.
- `colorBalance.challengerWhite === 2`, `challengerBlack === 2`.

---

### W03 — AUD-309-04: незалежність self-play

**Проблема:** seed фактично не створював незалежні спостереження; відсутні повна звітність W/D/L і валідаційний split.

**Виправлення:**
- Seed обирає легальну стартову позицію через `makeStartFEN()`.
- Кожна гра звітує `seed` і `startFen`.
- Кольори challenger/champion збалансовані.
- W/D/L повністю враховані.
- Опційна validation-вибірка використовує окремий діапазон seed.
- ValidationReported, але **не впливає** на tuning-вердикт.

---

### W04 — AUD-309-01: package/release integrity

**Проблема:** `version`, `main`, `browser` і реальний HTML-артефакт розійшлися.

**Виправлення:**
- `package.json`: версія `3.0.10`, `main`/`browser` → `src/subit_chess_v3.0.10.html`.
- CI динамічно визначає `ENGINE_HTML` з `package.json`, а не з хардкоду v3.0.8.
- Engine `VERSION === pkg.version`.
- HTML перегенеровано збіркою.

---

### W05 — AUD-309-05 / AUD-309-06: FEN validator hardening

**AUD-309-05:** додано перевірку, що originsquare для en passant вільний; інакше FEN відхиляється як `INVALID_EN_PASSANT`.

**AUD-309-06:** halfmove/fullmove мають бути точними non-negative safe integers; `fullmove >= 1`. Oversized або rounded значення більше не змінюють draw detection і нумерацію ходів.

---

### W06 — AUD-07…AUD-09: search/state closure

#### AUD-07 — repetition history × null move
Закрито: null move не робить `pushRep()`, не змінює `rep`/`repHi` і не змінює `repLimit`. Тест із реальним пошуком підтверджує, що шлях null move справді виконується: `nullCalls=19`, а стан і історія після search ідентичні вихідним.

#### AUD-08 — dead material на горизонті
Закрито в `src/engine/search.mjs`:
- `negamax()` і `quiescence()` тепер повертають `0`, коли `insufficientMaterial()` істина.
-Terminal detector узгоджено з `automaticDrawReason()` і `Position.status()`.
- Додано `pos.refreshPieces()` перед похідною перевіркою матеріалу, бо piece cache лінивий і після capture може бути застарілим.
- Використано дешевий gate `phaseMaterial <= 2`: він покриває всі випадки мертвого матеріалу без повного сканування на звичайних вузлах.

**Ключова регресія:** позиція `Kr6/8/1k6/8/8/8/8/8 w - - 0 1` — єдина легальна відповідь `Kxb8`, після якої лишається K vs K. Пошук дає `score = 0` і на глибині 1, і на глибині 2, навіть зі stub evaluator `7777`.

#### AUD-09 — null-move state equivalence
Закрито: `makeNullMove()`/`unmakeNullMove()` мають повну симетрію стану. Тести перевіряють:
- повну JSON-ідентичність canonical snapshot після unmake;
- ідентичність після цілого search, що використовував null moves;
- guards `canNull()`: disabled, PV, in check, `minDepth`, pawn-only zugzwang.

---

### W07 — Independent tactical suite

Новий файл: `tests/engine.tactics.mjs`.

Покриття:
- 4 матові позиції в 4 конфігураціях: `default`, `no-null`, `no-tt`, `no-pruning`.
- Forced capture chain: `3r2k1/5ppp/8/Q7/7q/8/8/3R2K1 w - - 0 1`.
  - Пошук на горизонті знаходить `Rxd8+`, форсований `Qxd8` присутній у PV, оцінка mate-level.
- Усі конфігурації погоджуються на forcing move.
- Pawn-only zugzwang: null pruning не змінює результат і не викликає жодного null move у пошуку.
- TT reuse не приховує мат при повторному пошуку тієї самої позиції.

---

## 3. Що залишилось поза цим_correctness increment

Це **не**Optimization release. Жодної заяви про збільшення сили.

Не виконано або не завершено:

1. **W08 — Browser/Worker stress testing**  
   Памʼять, тайм-контроль, concurrency, lifecycle. Існують DOM/worker regression tests, але повного stress-прогону немає.

2. **P3.2–P3.6 — вимірювання сили й валідація**  
   Немає великої вибірки self-play match-ів, контрольованого порівняння версій, незалежного benchmark і Gate 1.

3. **Independent chess oracle tests**  
   Аудит був статичним; ми додали executable regressions, але зовнішній шаховий oracle не запускався.

4. **Перехід до v3.1.0 / сила-оптимізація**  
   Не починався, згідно з рекомендацією аудиту: спочатку correctness, потім strength work.

---

## 4. Фінальний висновок

Аудитний реєстр v3.0.9 повністю закрито в межах коректності:

- 6 findingів виправлено в `e98d359`;
- 3 search-related проблеми закрито в `be27fe4`;
- 1 з них (`AUD-309-03`) закрито як **non-reproducible**, а не хибним patch;
- усі знайдені дефекти мають executable regression coverage;
- оцінка, ваги, параметри pruning, legality і UI не змінювалися як strength-зміни;
- реліз залишається `3.0.10` без тегу й без release snapshot;
- working tree чистий, `main` синхронізований з `origin/main`.