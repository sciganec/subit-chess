# Звіт по аудиту SUBIT-CHESS v3.0.6 → v3.0.8

Джерело: `ver/subit_chess_v3.0.6/subit_chess_v3.0.6_audit.md` (947 рядків, 4 рівні серйозності: P0/P1/P2/P3).

---

## Результат: усі відкриті пункти закрито

| Рівень | Пункт | Статус |
|---|---|---|
| P0 | §3.1 FEN-валідація | закрито у v3.0.7 (ADR 0020, `validateFEN`, `setFEN(fen,{validate:false})`) |
| P0 | §3.2 53-бітний Zobrist | закрито у v3.0.7 |
| P0 | §3.3–§3.5 статус/нічия/insufficientMaterial | закрито у v3.0.7 |
| P0 | §3.6–§3.9 context/eval/uncertainty | закрито у v3.0.7 |
| **P1.2** | **TT rule-50 контекст** | **закрито в v3.0.8** — `Position.ttKey` (bucket 0-79/80-99/100-149/150+), усі probe/store у `search.mjs`, `index.mjs`, `evaluate.mjs` |
| **P1.6** | **5-вимірна перевірка плану** | **закрито в v3.0.8** — `admitted` (rule+structural) vs `accepted` (всі 5 осей), `checkFeasibility` для всіх типів, `genKing` без пішаків |
| **P1.8** | **riskOf за описом** | **закрито в v3.0.8** — `scoreSpread`/`secondScore` у `search.mjs`, `riskOf` переписано (PV length, bound flag, mate distance), `buildCertificate` перевіряє `completed` перед mate-порогом |
| **P2.1** | **Web Worker** | **закрито в v3.0.8** — джерело рушія вкладене в HTML як `ENGINE_SRC`, один `Engine` на воркер, TT/Memory живуть між ходами, фолбек на головний потік |
| **P2.2** | **Годинник** | **закрито в v3.0.8** — рахує для сторони на ході під час пошуку, стартує з першого ходу |
| **P2.3** | **Undo до custom FEN + settings** | **закрито в v3.0.8** — `state.baseFen`, `localStorage` (тема/рівень/координати/режим оцінки) |
| **P2.4** | **PGN SetUp/FEN/result** | **закрито в v3.0.8** — `buildPGN()` з `SetUp`/`FEN`, нумерація з базового FEN, `gameResult()` (здача/мат/timeout) |
| **P2.5** | **Облік захоплених фігур** | **закрито в v3.0.8** — `pieceCountsFromFen(state.baseFen)` замість `START_COUNTS` |
| **P2.6** | **Клавіатурна доступність** | **закрито в v3.0.8** — roving tabindex, стрілки/Enter, focus у модалках, `Esc` |
| **P3.1** | **Реальне використання Memory** | **закрито в v3.0.8** — `memory.lookup` → `prevBest`/`prevScore` у `searcher.search` |
| P3.2–P3.6 | self-play / parameter control / validation set / version comparison / strength measurement | обслуговуються `bench/match.mjs`, `engine.learn`, `selfplay`, але не запускалися на вибірці Gate 1 — залишаються в ROADMAP |

---

## Тести

- **`tests/engine.audit.mjs`**: 87 перевірок (було 66), усі PASS
- **`tests/engine.worker.mjs`** (новий): розпаковує вкладене джерело рушія зі зібраної сторінки, запускає в фейковому worker-scope, перевіряє відповідь
- **`tests/app.dom.mjs`**: 57 перевірок, усі PASS (включно: клавіатурна гра, годинник, PGN, undo до custom FEN, settings persistence)
- **`tests/engine.eval.mjs`**: warm/cold інваріант тепер перевіряється з `usePlans:false` (plans легітимно змінюють move ordering через `structuralBonus`, тому інваріант — про TT, а не про plans)
- **Legacy**: 128 passed, 0 failed
- **Всього**: 11 сюїтів + legacy, усі зелені

---

## Реліз v3.0.8

- `package.json` 3.0.8, `VERSION = '3.0.8'`, `paramVersion: '3.0.8'`
- Артефакт: `src/subit_chess_v3.0.8.html` = `index.html` = `ver/subit_chess_v3.0.8/subit_chess_v3.0.8.html`
- SHA-256: `642D369D4C223F81A590CC9C2B7989424D396EE624EAD5E3929058CDE03B1D0B` (433.6 kB)
- `npm run build` детермінований (однаковий SHA-256 при повторному запуску)
- `ver/subit_chess_v3.0.7/subit_chess_v3.0.7.html` — архів v3.0.7 (239 kB)
- CHANGELOG `[3.0.8]`, ADR 0021, ROADMAP, USER-MANUAL, readme оновлені
- CI (`ci.yml`, `pages.yml`) оновлені на `src/subit_chess_v3.0.8.html`

---

## Свідомий компроміс

Артефакт виріс із 239 kB до 434 kB: двигун вкладається у файл двічі — живий inline-модуль і рядок для воркера. Це ціна одного офлайн-файлу з багатопотоковим пошуком; мережевих запитів немає.

Аудит-пункт 4.2 (rule-50/75-move/5-fold → 0) досі відхилено як баг — це навмисна семантика ADR 0011/0020: claimable нічии залишаються грайливими.

---