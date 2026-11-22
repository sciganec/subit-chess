# SUBIT-CHESS v3.0.10 — release snapshot

Дата: 2026-11-21  
Тип: **correctness release**. Це **не** strength-реліз і **не** заява про повну
відповідність канонічному SUBIT-∞.

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.10.html` | 454 420 B | `9A08F02F8AF4499813FE3167429A7A27D0A95071BA4A1C62EB60A9BB011C6581` |

Артефакт ідентичний `src/subit_chess_v3.0.10.html` та `index.html` (той самий бандл
`node build/bundle.mjs`: 11 модулів вбудовано в один офлайн-HTML із 15 модулів у
`src/engine/`, 443.8 kB). Попередній реліз: `ver/subit_chess_v3.0.9/`
(450 328 B, SHA-256 `704F4F5FC0EB0BDEB56D8481E82D0C429768618FA05F63B5F917AF518C510CF3`) —
його файли не змінено. Тег: `v3.0.10` (annotated).

---

## Що в релізі

v3.0.10 фіксує коректність інкремент після аудиту v3.0.9. Реєстр
`ver/subit_chess_v3.0.9/subit_chess_v3.0.9_audit.md` §17 закрито **9/9**:

- `e98d359` — W01–W05 (AUD-309-01…06);
- `be27fe4` — W06–W07 (AUD-07…AUD-09 та незалежний тактичний набір);
- AUD-309-03 закрито як **non-reproducible**: patch не застосовувався, семантику
  заблоковано тестами.

Ваги оцінки, параметри pruning, правила легальності та поведінка UI не змінювалися
заради сили гри. Інтерфейс лишається одним самодостатнім HTML-файлом без мережі.

### Виправлено

- **AUD-309-02 / AUD-07 / AUD-09** — null move не змінює halfmove, не потрапляє до
  repetition history і повністю відновлює канонічний стан; `canNull()`-guards
  покриті тестами.
- **AUD-309-04** — self-play має незалежні спостереження, збалансовані кольори,
  повний W/D/L і окремий validation-діапазон seed, який лише звітується.
- **AUD-309-01** — `version`, `main`, `browser`, двигун і CI вказують один і той самий
  артефакт v3.0.10.
- **AUD-309-05 / AUD-309-06** — FEN відхиляє зайнятий en-passant origin і небезпечні
  значення лічильників halfmove/fullmove.
- **AUD-08** — недостатній матеріал є термінальним і в середині дерева, і на горизонту;
  лінивий кеш фігур оновлюється перед похідною перевіркою.
- **W07** — новий `tests/engine.tactics.mjs` перевіряє мати, форсований ланцюг взять,
  pawn-only zugzwang і повторний пошук у чотирьох конфігураціях.

Повний опис — `subit_chess_v3.0.10_audit_closure.md` у цій теці.

---

## SUBIT-статус (чесно)

### Реально присутнє в коді

- власне шахове ядро, генерація легальних ходів, FEN-валідатор, Zobrist;
- SVF `V(P)` і структурні відношення, генератор структурних планів із Pareto-відбором;
- бюджетований alpha-beta пошук, TT, quiescence, killer/history, null move, LMR;
- восьмикомпонентний `U(P)` і decision certificate з provenance/версією позиції;
- Worker/Memory, офлайн self-play, topology/differential прототипи.

Робоча `S₀` у коді — **4 × 4 × 4 = 64 стани**:
`I = QUIET/DEFENCE/ATTACK/PRESSURE`,
`Z = GLOBAL/QUEENSIDE/KING/CENTER`,
`Φ = OPENING/MIDDLEGAME/ENDGAME/TRANSITION`.
Історичний `docs/spec/SUBIT-CHESS-SPEC.md` описує 48 клітин; це documentation
provenance, а не активна схема v3.

### Частково / відсутнє

- повний lifecycle ревізії планів, реальна реалізація `contextAdjust`, пороги
  meta-калібрувань, Level 3/4 формальна верифікація та W08 — не завершені;
- `U(P)` лише звітується; driver-targeted budget поки не споживається;
- ADR 0013 вилучив з v3 ρ_s, teacher, telemetry, diffusion і повний
  FOUR/Belnap-епістемічний шар. Порогові T/F/N у панелі SVF — мітки вираженості осей,
  не канонічний Belnap-шар;
- немає канонічного Ω-mapping, provenance/event contracts, гомології (doc 50),
  opponent modeling та online learning;
- канонічний репо `subit-subit` документує v2.2.0 як останню шахову версію;
  SUBIT-∞ v6.14.4 має статус **DRAFT / NOT STABLE**. Тому v3.0.10 **не** заявляє
  conformance до v6.14.x.

### Прапорці

| Прапорець | Стан |
|---|---|
| `DEFINED` (SUBIT-derived v3 architecture) | ✅ |
| `AUDITED BY EXECUTION` (внутрішні executable regression suites) | ✅ |
| `IMPLEMENTED (canonical conformance)` | ⛔ |
| `EMPIRICALLY SUPPORTED (strength)` | ⛔ |
| `FORMALLY VERIFIED LEVEL 3/4` | ⛔ |
| `STRENGTH IMPROVEMENT CLAIMED` | ⛔ |

---

## Перевірка

```
npm run build        # детерміновано; index.html == src/subit_chess_v3.0.10.html
npm test             # exit 0; 16 тестових файлів
npm run test:audit309 # 51 перевірка
npm run test:tactics  # 34 перевірки
```

SHA-256 обох поточних HTML-артефактів:
`9A08F02F8AF4499813FE3167429A7A27D0A95071BA4A1C62EB60A9BB011C6581`.

---

## Що лишилося поза цим релізом

- W08 — Browser/Worker stress testing (пам'ять, час, concurrency, lifecycle).
- Gate 1–7, незалежний chess oracle, ≥100-game A/B/C/D і статистика сили.
- Формальна верифікація Level 3/4 та повна spec compliance.
- v3.1.0 — SUBIT conformance uplift (ADR для 64/48, typed epistemic layer,
  Ω mapping, provenance/event contracts).
- v3.2.0+ — strength work. Жоден із цих пунктів не є блокером v3.0.10.

**Підсумок:** SUBIT-CHESS v3.0.10 — чесний correctness-інкремент із закритим
аудитним реєстром, без заяви про збільшення сили гри та без заяви про канонічну
SUBIT-conformance.
