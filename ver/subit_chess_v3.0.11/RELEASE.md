# SUBIT-CHESS v3.0.11 — release snapshot

Дата: 2026-11-21  
Тип: **measured engineering increment** з research-only theory addendum. Це **не** strength-реліз у сенсі зовнішньої оцінки, **не** заява про канонічну відповідність SUBIT-∞ і **не** прийняття нових теоретичних документів як обов'язкових.

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.11.html` | 463 277 B | `8267AEFA3BFFA9E52843F1D77411963E47A30D5D5753DF92EDBE1E427ED82BE5` |

Артефакт ідентичний `src/subit_chess_v3.0.11.html` та `index.html`. Збірку виконано в окремій тимчасовій копії через `node build/bundle.mjs`: 11 модулів вбудовано в один офлайн-HTML (452.4 kB). Попередній реліз: `ver/subit_chess_v3.0.10/` (454 420 B, SHA-256 `9A08F02F8AF4499813FE3167429A7A27D0A95071BA4A1C62EB60A9BB011C6581`) — його файли не змінено. Тег: `v3.0.11` (планований annotated tag); у цій підготовці коміт, тег і push не створювалися.

---

## Що в релізі

v3.0.11 фіксує виміряні робочі зміни після v3.0.10:

- **Gate 1 / harness.** `bench/match.mjs` звітує W/D/L за кожним дебютом і Elo-подібний 95% CI; `bench/fens/openings.epd` містить 24 тихі легальні позиції з контрольною сумою в `bench/fens/CHECKSUMS`. Матч-харнес тепер переносить стек повторів (`rep`/`repHi`/`repLimit`) разом із FEN, тому п'ятиразове повторення знову видиме для `status()`. На 100 іграх depth 4, seed 7: 57.5% ±8.9, 9/100 caps до ADR 0023 і 53.5% ±8.9, 5/100 caps після неї; обидва результати — калібрування харнесу, не сила.
- **A1 — тихі шахи на горизонті.** Quiet checks розглядаються при `qdepth === 0`, обмежені `params.search.qsearch.maxChecks`, проходять перевірку легальності/alta/beta та qdepth-капу. Геометричний префільтр відсіює кандидатів до make/unmake; є регресійний тест на тихий відкритий шах. Після вбивства структурного впорядкування (`results/gate3-a1-postkill-final.json`, 100 ігор, depth 4, seed 7): `base` **60.0% ±9.4**, CI **[50.6%, 69.4%]**, 58W/4D/38L, 0/100 caps, середня довжина 116 plies. Чиста перевірка d7: `noqchecks` ~173.0k nps, `base` ~174.6k nps — додаткового per-node штрафу немає; час зростає лише через більше дерево.
- **Gate 2 — depth.** Після виправлення помилки призначення глибини за кольором і повторного вимірювання на поточному коді (`results/gate2-depth-postkill-final.json`): `base@5` **79.0% ±7.5**, CI **[71.5%, 86.5%]**, 75W/8D/17L, 8/100 caps. Попередній результат 68.0% ±8.1 збережено лише як історичний.
- **Gate 3 — structural kill.** 200 ігор `base` vs `nostruct`: **47.5% ±6.2**, CI ≈ [41.3%, 53.7%], 74W/42D/84L, 25/200 caps; `noplans` дав ідентичний результат. На всіх 24 FEN кореневий хід однаковий, а `nostruct` і `noplans` node-ідентичні. ADR 0023 видалив `makePlanOrderer`, `structuralBonus` і context-ordering шлях. Плани лишаються описовим шаром для UI/uncertainty. `plain`, `nostruct`, `noplans` і `noctx` тепер порожні control-конфігурації.
- **Gate 7 — verification steering.** `bench/gate7.mjs` виконує три чисті проходи (base, uniform `depth+1`, driver-targeted) плюс deterministic wrong-driver control; на 24 дебютних FEN і 4 матових FEN: 9 targeted-only змін, 0 uniform-only, 0 wrong-driver-only, 5 змін під обома режимами, 10 без змін, 1 wrong-driver change і 0/4 змінених матів. Це bench-only інструмент перевірки, не зміна shipped move choice й не strength-результат.
- **Search hygiene / verification.** Видалено мертвий `contextBonus`, ранній вихід `hasLegalMove()` у horizon-stalemate probe, застосовано `plan.structuralEvalDepth`, бюджет невизначеності тепер зростає з uncertainty, а не ділиться на неї. Масштаб mate уніфіковано, `centerControl`/`openFiles`/`hanging` мають по одному SVF-власнику, додано виконувану перевірку `SVF-INV-007` з негативним контролем. `verifyMakeUnmake()` тепер перевіряє стек повторів і `repLimit` у тому ж циклі `pushRep`/`make`/`unmake`/`popRep`, що й пошук.
- **Research-only theory addendum.** Додано п'ять документів: `docs/theory/81-99/81_SUBIT_CHESS_SELF_REFLECTIVE_INTELLIGENCE_PROTOCOL.md` (v0.1, research/architecture specification), `docs/theory/81-99/82_SUBIT_CHESS_Cross_Disciplinary_Intelligence_Specification.md` (v0.1, Research & Architecture Specification), `docs/theory/81-99/83_SUBIT_CHESS_AUTONOMOUS_EXPERIMENTATION_FRAMEWORK.md` (v0.1, DRAFT — INITIAL FORMALIZATION), `docs/theory/article_04.md` і `docs/theory/article_05.md` (концептуальні дослідження). Вони не є ADR, не є стабільними специфікаціями, не додають conformance-вимог і не змінюють код. Їхні гіпотези, Stage/Phase/Tier плани, `SR-INV-*`, `V_SUBIT(S)` та автономні механізми залишаються research-only.

---

## SUBIT-статус (чесно)

### Реально присутнє в коді

- власне шахове ядро, генерація легальних ходів, FEN-валідатор, Zobrist;
- SVF `V(P)` і структурні відношення, генератор Structural Plans із Pareto-відбором (описовий, без ordering-бонусу);
- бюджетований alpha-beta пошук, TT, quiescence з обмеженими quiet checks, killer/history, null move, LMR;
- восьмикомпонентний `U(P)` і decision certificate з provenance/версією позиції; жодного scalar blend у score;
- Worker/Memory, офлайн self-play, topology/differential прототипи лише для аналізу;
- автоматичні правила нічиєї (75 ходів, п'ятиразове повторення, недостатність матеріалу) залишаються авторитетними; claimable draws лишаються грабельними.

Робоча `S₀` у коді — **4 × 4 × 4 = 64 стани**:
`I = QUIET/DEFENCE/ATTACK/PRESSURE`,
`Z = GLOBAL/QUEENSIDE/KING/CENTER`,
`Φ = OPENING/MIDDLEGAME/ENDGAME/TRANSITION`.
Історичний `docs/spec/SUBIT-CHESS-SPEC.md` описує 48 клітин; це documentation provenance, а не активна схема v3.

### Частково / відсутнє

- повний lifecycle ревізії планів, реальна реалізація `contextAdjust`, пороги meta-калібрувань, Level 3/4 формальна верифікація та W08 не завершені;
- uncertainty driver у shipped-шляху лише звітується; budget зростає з Uncertainty, але не вибирає компонент для цільового пошуку. Gate 7 є bench-only;
- ADR 0013 вилучив з v3 ρ_s, teacher, telemetry, diffusion і повний FOUR/Belnap-епістемічний шар. Порогові T/F/N у панелі SVF — мітки вираженості осей, не канонічний Belnap-шар;
- немає канонічного Ω-mapping, provenance/event contracts, гомології `H₁`, causal/opponent modeling чи online learning;
- канонічний репо `subit-subit` документує v2.2.0 як останню шахову версію; SUBIT-∞ v6.14.4 має статус **DRAFT / NOT STABLE**. Тому v3.0.11 **не** заявляє conformance до v6.14.x;
- нові theory drafts містять багато ABSENT/PART механізмів (reflective memory, counterfactual audit, bounded recursion, EvolutionCore, autonomous experimentation, Tier/Phase operator coupling) і **не** приймаються як обов'язкові.

### Прапорці

| Прапорець | Стан |
|---|---|
| `DEFINED` (SUBIT-derived v3 architecture) | ✅ |
| `AUDITED BY EXECUTION` (внутрішні executable regression suites) | ✅ |
| `SELF-PLAY MEASUREMENT REPORTED` | ✅ |
| `EXTERNAL STRENGTH SUPPORTED` | ⛔ |
| `IMPLEMENTED (canonical conformance)` | ⛔ |
| `FORMALLY VERIFIED LEVEL 3/4` | ⛔ |
| `RESEARCH THEORY BINDING` | ⛔ |
| `EXTERNAL STRENGTH CLAIMED` | ⛔ |

---

## Перевірка

```
npm test                       # exit 0; 17 test scripts
temp-copy npm run build        # 11 modules inlined; deterministic offline HTML
npm run test:audit309          # enters the full npm test chain
npm run test:tactics           # enters the full npm test chain
```

SHA-256 трьох ідентичних HTML-артефактів v3.0.11:
`8267AEFA3BFFA9E52843F1D77411963E47A30D5D5753DF92EDBE1E427ED82BE5`.

Поточні ADR-обмеження збережено: `TT_MAX_AGE = 0`, жодного scalar uncertainty blend, жодного structural/context move ordering, automatic draw rules залишаються авторитетними. Жоден research draft не скасовує ADR 0019, 0022 або 0023.

---

## Що лишилося поза цим релізом

- Gate 4: буквальне покриття всіх 194 binding invariant IDs; наразі лише 30 згадані в коді/тестах.
- Gate 5: зовнішня перевірка (`bm not found`, немає sparring engine або незалежного oracle).
- Gate 6: ціль d9-in-6s не досягнута незалежно від A1.
- W08: Browser/Worker stress testing (пам'ять, час, concurrency, lifecycle).
- Формальна верифікація Level 3/4, канонічний conformance uplift, повна spec compliance.
- Будь-яке прийняття нових theory drafts як ADR/контрактів; для цього потрібні окремі рішення й попередньо зареєстровані експерименти.

**Підсумок:** SUBIT-CHESS v3.0.11 — чесний виміряний інкремент із self-play доказами, research-only теорією, без зовнішньої strength-заяви й без заяви про канонічну SUBIT-conformance.
