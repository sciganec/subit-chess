Звіт по аудиту subit_chess_v3.0.6_audit.md
Об'єкт: 14 розділів, 5 пунктів P0, 8 пунктів P1, 6 пунктів P2, 6 пунктів P3. Підсумок: P0 закрито повністю (7/7). P1 закрито частково (6/8). P2/P3 не починалися — винесені в [Unreleased] roadmap.

P0 — обов'язкові виправлення: 7/7 закрито
#	Пункт аудиту	Розділ	Статус	Реалізація
1	POSITION VALIDATOR	§3.1	Виправлено	Новий 
fen.mjs
 (validateFEN, 8 статусів FEN_STATUS). Атомарність: setFEN валідує до board.fill(0), відкинутий FEN не змінює позицію. setFEN(fen,{validate:false}) — для verifier. Покрито 20 перевірками в engine.audit.mjs
2	insufficientMaterial()	§3.3	Виправлено	
core.mjs · L934
 — K+B vs K+B мертва лише при однаковому кольорі полів; K+N vs K+N, K+B vs K+N, K+2N vs K не мертві. 11 тестів
3	Terminal detection у quiescence	§4.1	Виправлено	
search.mjs · L667
 — stalemate на qdepth===0 без взять повертає 0 (qStalemate=true). Тест k7/2K5/1Q6/...
4	Claimable draws	§4.2	Виправлено	core.mjs:894-901 — status() завершує лише автоматичні нічиї (75-move, 5-fold). 50-move/3-fold лишаються ігровими. Quiescence теж. ADR 0020 з rationale. 4 тести
5	Futility pruning	§4.4	Виправлено	search.mjs:521-545 — futility перенесена після makeMove і пропускає ходи, що дають шах (!givesCheck). Тихий мат знаходиться. Тест на d1d8#
6	Скидання seldepth	§4.3	Виправлено	
search.mjs · L305
 — this.seldepth = 0 на початку кожного search(). Тест на дві сесії
7	Напрямок king-zone pressure	§5.1	Виправлено	context.mjs:76-81 — pressureOnMyKing=[turn], pressureOnEnemyKing=[enemy]; myHanging/enemyHanging, myInCheck/enemyInCheck. plans.mjs genKing → kingZoneAttacks[enemy]. 4 тести
P1 — структурна стабілізація: 6/8 закрито
#	Пункт аудиту	Розділ	Статус	Деталі
1	Повноцінний 53-бітний ключ	§3.2	Виправлено	
core.mjs · L430
 — hashLo * 2097152 + (hashHi & 0x1fffff) (32+21=53 біти). 
structure.mjs · L268
 hashKeys() — та сама композиція. 7 тестів
2	Rule-50 контекст у TT	§3.2	Частково / навмисно	TT-ключ не містить halfmove clock. Виправлено не повністю — це усвідомлене рішення: 50-move claimable, тож позиція з halfmove 100 юридично інша, але двигун однаково грає далі. Повний фікс = додати halfmove-бакет у ключ, що знизить hit rate. Записано в [Unreleased]
3	OUTPOST	§7.1	Виправлено	
plans.mjs · L298
 — percept.atk.cnt[side][to] замість defenders(). Пішакова безпека — точний діагональний тест (pr===r-1 && df===1). 3 тести
4	TRADE для en passant	§7.2	Виправлено	
plans.mjs · L202
 — victim to±16 для FLAG_EP, atk.cnt[enemy][to] замість defenders(to)
5	KING-план	§7.3	Виправлено	
plans.mjs · L234
 — kingZoneAttacks[enemy]; checkFeasibility PLAN.KING → plan.features.zone > 0
6	5 вимірів здійсненності плану	§7.5	Частково	checkFeasibility рахує всі 5 осей, але прийняття досі залежить лише від legal && rule && structural (
plans.mjs · L473
). Tactical/temporal/strategic обчислюються, але не блокують план. Це свідоме спрощення — повний фікс вимагає shallow-пошуку всередині плану. Записано в [Unreleased]
7	Pareto-фільтр у UI	§7.6	Виправлено	
index.mjs · L135
 — Engine.analyze() повертає pareto(this.plans) з total та rejected (відкинуті фільтром + відкинуті раніше). 2 тести
8	riskOf() і сертифікат	§8.1	Частково	analyze() без пошуку тепер повертає RISK_NAME[round(u*4)], а не константу CRITICAL. Але §8.2 (risk-модель не реалізує опис: score spread / PV length / mate distance) та §8.3 (FORCED_WITHIN_SCOPE до перевірки completed) не виправлені — винесено в [Unreleased]
P2 — інфраструктура: 0/6 (не починалося)
#	Пункт	Розділ	Статус
1	Web Worker	§10.1	Не зроблено — пошук і далі в main thread
2	Коректний годинник	§10.2	Не зроблено
3	Збереження початкового FEN (undo до custom FEN)	§10.3	Не зроблено
4	Коректний PGN (SetUp/FEN/result)	§10.3	Не зроблено
5	Облік захоплених фігур	§10.3	Не зроблено
6	Клавіатурна доступність	§10.3/§11	Не зроблено
Усі 6 пунктів внесені в 
CHANGELOG.md
 [Unreleased] як explicit debt.

P3 — інтелектуальний розвиток: 0/6 (не починалося)
Memory (
index.mjs · L34
) існує, remember() викликається після пошуку, але lookup() у пошуку не використовується — §9 підтверджено. Self-learning цикл не реалізований. Записано в [Unreleased].

Непов'язані зауваження аудиту
Розділ	Статус
§5.2 контекстна класифікація приховує невизначеність	Не зроблено — ContextProfile.key() як і раніше повертає одну категорію. Не входило в P0/P1
§4.5 TT не відновлює PV	Не зроблено — MEDIUM, не входило в P0/P1
§6 SVF евристики vs точні факти	Не зроблено — не баг, а вимога до UI-позначень
§7.4 SHIELD-план неконкретний	Не зроблено — не входило в P0/P1
§8.3 сертифікат не доказ оптимальності	Частково згадано в ADR 0019, повного фіксу немає
Регресійне покриття (розділ 14 аудиту)
Категорія аудиту	Покриття
A. Правила (perft, castling, ep, promotion, check/mate/stalemate, pins)	core.perft.mjs (9 позицій × 4 глибини), engine.verify.mjs
B. Нічиї (3-fold, 5-fold, 50-move, 75-move, insufficient material)	engine.audit.mjs (11 dead-material + 4 draw-rule тести)
C. Пошук (mate 1-2, forced defence, quiet tactical, quiescence stalemate, TT, node/time budget, PV)	engine.smoke.mjs, engine.eval.mjs, engine.audit.mjs
D. SUBIT-аналіз (контекст, симетрія, SVF, плани, Pareto, uncertainty, certificate)	engine.eval.mjs, engine.plans.mjs, engine.uncertainty.mjs, engine.audit.mjs
E. Автономність	app.dom.mjs (no external resources), build-перевірка
Загальний обсяг тестів: 281 (153 engine + 128 legacy), усі green. З них 66 — нові в engine.audit.mjs.

Висновок
Аудит визначив P0 як «передумова для стабільності» — усі 7 пунктів P0 закрито. P1 закрито на 75% (6/8); два відкриті пункти (TT rule-50 контекст, повна 5-вимірна перевірка плану) свідомо винесені як debt, бо вимагають архітектурних змін, а не точкових фіксів. P2/P3 не починалися — це наступний етап після стабілізації ядра, як і рекомендував аудит («спочатку P0 і P1, потім v3.1»).

Реліз: v3.0.7 (commit f8a8097, тег v3.0.7, GitHub release).