# Оцінка ELO — SUBIT-CHESS v3.0.14

**Статус: no Elo gain claim / no accepted external anchor.**

v3.0.14 — correctness/measurement/search-safety реліз (adjudication/repetition self-play fixes, root check extension, qsearch mate-delta guard). Є поведінкові зміни пошуку/коректності, але контрольований зовнішній anchor та `learn.compare` >=2 seeds d4/64g для 67dfd2c до формалізації не запускались.

## Що це означає для ELO

- **Нового зовнішнього матчу не проводилось.** Історичні SF19 таблиці в `docs/EXTERNAL_ANCHOR_SF19_2026-11-22.md` належать v3.0.11/v3.0.12 і **не** є результатом v3.0.14.
- **Немає підтвердженого приросту ELO.** Перед strength claim потрібен rerun `learn.compare` >=2 seeds d4/64g та/або прийнятий external anchor.
- **Попередній зовнішній орієнтир (v3.0.12, не v3.0.14):** SF19 UCI_LimitStrength, 20g @200ms: 2000 Elo mean 0.50 SE 0.10; 2200 mean 0.40 SE 0.091; 2400 mean 0.375 SE 0.078. Шумний малий сигнал, не людський Elo.

## Умови для майбутнього claim

- `learn.compare` >=2 seeds d4/64g проти pre-fix baseline для 67dfd2c.
- Прийнятий зовнішній anchor (той самий протокол/суперник/контроль часу).
- Повторюваний виміряний приріст з прозорим CI/SE.
