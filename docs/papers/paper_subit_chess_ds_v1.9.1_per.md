# Від шахового пошуку до морфологічного керування обчисленням: SUBIT як архітектура контекстно-залежної політики пошуку

## Анотація

Еволюція комп’ютерних шахів розвивалася вздовж кількох взаємопов’язаних ліній: удосконалення пошуку, поліпшення функцій оцінювання, селективного розподілу обчислювального ресурсу та навчання політик, що спрямовують пошук. Від ранніх програмних ідей Алана Тюрінга і Клода Шеннона через minimax та alpha-beta pruning до сучасних NNUE-рушіїв і policy/value-guided Monte Carlo Tree Search шаховий рушій перетворився на складну адаптивну обчислювальну систему.

Тому некоректно описувати сучасні шахові рушії як неадаптивні. Alpha-beta engines уже використовують move ordering, transposition tables, quiescence search, null-move pruning, late move reductions, futility pruning, extensions, history heuristics, aspiration windows та інші контекстно-залежні механізми. Нейромережеві системи також розподіляють ресурс через policy/value representations.

Ця стаття ставить інше питання: чи може контекст, який визначає спосіб пошуку, бути представлений як окремий, явний, інтерпретований та експериментально перевірюваний архітектурний рівень?

Для цього пропонується SUBIT — архітектура морфологічно-керованого пошуку:

P → S₀(P) → Ω(P, Search, V, H) → ρₛ → Search(P, ρₛ, V)

де P — шахова позиція; S₀(P) — її низьковимірна морфологічна проєкція; H — історія аналізу; Ω — режим динаміки пошуку; ρₛ — policy vector, що визначає спосіб витрачання ресурсу; V — функція оцінювання.

Формально:

SUBIT = (M, D, Π)

де:

M : P → S₀

D : S₀ × H → Ω

Π : S₀ × Ω → ρₛ

У поточній шаховій операціоналізації:

S₀ᶜʰᵉˢˢ = I × Z × Φ = 4 × 3 × 4 = 48

де I кодує режим ініціативи, Z — домінантну зону структурної напруги, а Φ — фазу або функціональний режим позиції. Додатковий динамічний шар:

Ω = {STABLE, METASTABLE, CYCLIC, CHAOTIC}

описує не цінність позиції, а поведінку її аналізу в процесі пошукового поглиблення.

Центральна гіпотеза SUBIT не полягає в заміні alpha-beta, NNUE або MCTS. Вона полягає в тому, що явно представлена морфологія позиції може містити інформацію, корисну для вибору того, як саме витрачати обчислювальний ресурс за фіксованого часу або node budget.

SUBIT тому розглядається не як доведена нова парадигма шахового програмування, а як фальсифікована архітектурна гіпотеза про morphology-conditioned control of computation.

**Ключові слова:** комп’ютерні шахи, alpha-beta, PVS, NNUE, MCTS, adaptive search, context-dependent search, resource allocation, SUBIT, Belnap FOUR, morphology-conditioned computation, search policy.

## 1. Вступ: від оцінювання позиції до керування обчисленням

Комп’ютерні шахи є класичним прикладом задачі прийняття рішень за обмеженого обчислювального ресурсу. Правила гри компактні й формально точні, але дерево можливих продовжень настільки велике, що повний перебір переважної більшості практичних позицій недосяжний.

Тому фундаментальне питання шахового рушія можна сформулювати так:

> Як розподілити обмежений обчислювальний ресурс так, щоб максимізувати надійність рішення?

Історично це питання розкладалося на три тісно пов’язані завдання:

1. **Evaluation:** як оцінити позицію?
2. **Search:** які продовження слід дослідити?
3. **Resource allocation:** скільки обчислення слід витратити на різні вузли, ходи або піддерева?

Перші два питання давно перебувають у центрі шахового програмування. Третє також не є новим: воно реалізується через selective search, reductions, extensions, pruning, move ordering та policy-guided tree search. Проте в традиційній архітектурі відповідні механізми часто розподілені між багатьма евристиками й не зведені до одного явного, інтерпретованого контекстного представлення.

SUBIT пропонує розглядати контекст пошуку як окремий control layer:

позиція → морфологія → динаміка аналізу → політика ресурсу → пошук

Це не твердження, що сучасні рушії неадаптивні. Це твердження, що адаптацію можна організувати як явний об’єкт моделювання, абляції, навчання та експериментальної перевірки.

## 2. Шахи як лабораторія adaptive computation

Шахи є особливо придатним середовищем для дослідження adaptive computation з трьох причин.

По-перше, правила гри формальні й дискретні. Позиція може бути представлена точно через розташування фігур, сторону ходу, права рокіровки, en passant, move counters та історію повторень.

По-друге, рішення можна оцінювати кількома незалежними способами:

- через результат партії;
- через matched engine games;
- через tactical suites;
- через best-move agreement із сильнішим teacher;
- через tablebase agreement в ендшпілях;
- через fixed-node або fixed-time comparisons.

По-третє, шахи дають змогу розділити evaluation quality і search efficiency. Рушій може не грати сильніше в абсолютному сенсі, але досягати тієї самої якості з меншими витратами nodes або часу. Саме цей другий тип ефекту є особливо важливим для SUBIT.

Шахи також історично демонструють, що формальна система може мати різні режими структурної організації. Сучасна гра є результатом тривалої трансформації — від чатуранґи через шатрандж до європейських шахів раннього модерного періоду. Цей історичний факт не є доказом SUBIT, але допомагає побачити шахи як систему, у якій змінюються не лише конкретні позиції, а й режими мобільності, форсованості, ризику та обчислювальної складності.

## 3. Від Шеннона до selective search

### 3.1. Shannon Type A і Type B

У 1950 році Клод Шеннон запропонував фундаментальне розрізнення між двома підходами до комп’ютерної гри в шахи.

**Type A** передбачає систематичний перебір дерева до заданої глибини.

**Type B** передбачає селективний пошук, у якому обчислення концентруються на продовженнях із вищою очікуваною релевантністю.

Для SUBIT це розрізнення принципове. Питання:

> Які частини дерева заслуговують на додатковий обчислювальний ресурс?

не є новим. Воно лежить у самій основі selective search. Потенційна новизна SUBIT можлива лише на іншому рівні:

> Чи можна організувати рішення про селективність через явну, низьковимірну та інтерпретовану морфологічну модель контексту?

### 3.2. Minimax і alpha-beta pruning

У класичній формі вибір ходу задається minimax схемою:

m* = arg maxₘ minₘ₁ maxₘ₂ … V(P ∘ m ∘ m₁ ∘ m₂ …)

Alpha-beta pruning використовує межі α і β, щоб не досліджувати гілки, які вже не можуть вплинути на minimax result.

За ідеального move ordering alpha-beta може зменшити ефективний обсяг пошуку від порядку:

O(bᵈ)

до порядку:

O(bᵈ⁄²)

де b — branching factor, а d — глибина. Це не скасовує експоненційного характеру задачі й не є worst-case гарантією. Проте саме selective pruning зробив практичний глибокий пошук можливим.

Сучасний alpha-beta engine не зводиться до однієї процедури. Зазвичай він поєднує:

- iterative deepening;
- transposition tables;
- principal variation search;
- move ordering;
- capture ordering;
- history heuristics;
- killer moves;
- quiescence search;
- null-move pruning;
- futility pruning;
- razoring;
- late move reductions;
- check, recapture і passed-pawn extensions;
- aspiration windows;
- evaluation corrections.

Отже, сучасний шаховий рушій уже є системою контекстно-залежного керування пошуком. SUBIT не заперечує цього факту, а намагається дослідити альтернативну архітектурну локалізацію частини такої адаптації.

## 4. Evaluation, search і resource policy

Для подальшого аналізу слід розділити три функції.

### 4.1. Evaluation

V(P)

відповідає на питання:

> Наскільки хороша позиція P?

У класичному рушії V може бути комбінацією матеріалу, piece-square tables, pawn structure, king safety, mobility, threats та інших features. У сучасних рушіях V може бути NNUE або іншою neural evaluation function.

### 4.2. Search

Search(P, V)

відповідає на питання:

> Які продовження потрібно дослідити, щоб обрати хід?

Search backend може бути minimax, alpha-beta, PVS, MCTS, hybrid neural search або іншою процедурою.

### 4.3. Resource allocation

ρₛ

відповідає на питання:

> Як витратити ресурс на дослідження цієї позиції?

Політика ρₛ може визначати:

- базову глибину або node budget;
- qsearch depth;
- selective extensions;
- LMR aggressiveness;
- null-move permission;
- null-move reduction;
- futility margins;
- aspiration-window width;
- draw або repetition policy;
- move-ordering emphasis;
- allocation між root candidates.

У традиційному рушії ці параметри можуть бути розподілені між багатьма механізмами. SUBIT пропонує зробити частину таких рішень функцією від явного контексту.

## 5. Deep Blue, Stockfish і NNUE

Deep Blue показав, наскільки далеко може зайти classical search architecture за поєднання спеціалізованого обладнання, великих search budgets і ручної evaluation function.

Подальший розвиток alpha-beta engines продемонстрував, що шахова сила залежить не тільки від nominal depth, а й від selective search quality. Stockfish став одним із найважливіших представників цієї лінії.

NNUE істотно посилила evaluation layer. У спрощеній формі сучасний NNUE alpha-beta engine можна подати так:

P → V_NNUE(P) → alpha-beta/PVS + selective heuristics → m*

NNUE переважно відповідає на питання:

> Якою є позиційна цінність P?

Search system відповідає на інше:

> Які продовження слід дослідити, у якому порядку й з якою глибиною?

SUBIT працює передусім із другим питанням. В ідеалі він не конкурує з NNUE як evaluator, а діє як controller над NNUE-based search:

P → (S₀(P), Ω(P, Search, V, H), V_NNUE(P)) → ρₛ → Search(P, ρₛ, V_NNUE)

## 6. AlphaZero, Lc0 і learned search allocation

AlphaZero продемонструвала іншу архітектурну лінію:

P → (πθ(P), vθ(P)) → MCTS → m*

Тут neural network дає не лише value estimate, а й policy prior, який спрямовує MCTS до ходів із вищою очікуваною корисністю. Leela Chess Zero продовжує цю парадигму у відкритому середовищі.

Це важливо для коректного позиціонування SUBIT. Adaptive resource allocation уже існує:

- у classical alpha-beta heuristics;
- у neural policy-guided MCTS;
- у learned move ordering;
- у value-guided selective search;
- у hybrid architectures.

Тому SUBIT не може претендувати на відкриття самого принципу adaptive search allocation.

Відмінність знаходиться на рівні representation:

AlphaZero/Lc0:

P → learned latent representation → policy/value → search

SUBIT:

P → explicit morphology → dynamic mode → resource policy → search

Отже, SUBIT ставить вузьке й перевірюване питання:

> Чи може мала, явна, інтерпретована морфологічна проєкція зберегти достатньо інформації для корисного керування пошуком?

## 7. SUBIT як архітектурна гіпотеза

Формально:

SUBIT = (M, D, Π)

де:

M : P → S₀

D : S₀ × H → Ω

Π : S₀ × Ω → ρₛ

Повна схема:

P → S₀(P) → Ω(P, Search, V, H) → ρₛ → Search(P, ρₛ, V)

Тут H може містити:

- iterative-deepening score history;
- зміни best move між depths;
- overlap top-k root moves;
- principal variation overlap;
- root-score margin;
- search volatility;
- branching factor;
- repetition information;
- transposition-table hit rate;
- локальну історію policy states.

SUBIT не є самим search algorithm. Він є control architecture, яка може керувати різними backends:

SUBIT controller → alpha-beta

SUBIT controller → PVS

SUBIT controller → MCTS

SUBIT controller → hybrid neural search

У формальній специфікації SUBIT розширений стан містить не лише s, а й правило ρ:

ŝ = (s, ρ)

а еволюція змінює і стан, і правило:

F(ŝ) = (fρ(s), g(ρ, s))

У шаховій інтерпретації ρ природно розуміється як вектор policy parameters пошуку, а g — як механізм його оновлення.

## 8. Морфологічний простір S₀ chess

У поточній шаховій операціоналізації:

S₀ chess = I × Z × Φ

де:

I = {ATTACK, PRESSURE, DEFENCE, QUIET}

Z = {KING, CENTER, GLOBAL}

Φ = {OPENING, MIDDLEGAME, TACTICAL, ENDGAME}

Отже:

|S₀ chess| = 4 × 3 × 4 = 48

Цей простір не є повним описом шахової позиції. Повний стан шахів містить усю дошку, сторону ходу, права рокіровки, en passant, move counters та історичну інформацію. Морфологічний стан є лише coarse-grained projection:

M(P) = s, where s ∈ S₀ chess

Мета проєкції не в реконструкції P. Її ціль — зберегти частину структурної інформації, релевантної саме для resource allocation.

Потрібно також чітко розвести:

S₀ SUBIT-64 ≠ S₀ chess

У загальній специфікації SUBIT-64 базовий простір має 64 стани як добуток трьох чотиризначних осей. Шаховий S₀ chess є domain-specific adaptation, а не механічною реплікою формальної базової нотації. У поточному прототипі він має 48 клітин, оскільки просторову вісь Z утворено трьома операційними категоріями.

## 9. Операціоналізація морфології

### 9.1. Initiative

Координата I описує не просто матеріальну перевагу, а режим форсованості й тиску:

I(P) = f(checks, captures, king pressure, hanging material, threats, forcing moves)

Практичні категорії:

- `ATTACK`: значний тиск на короля або форсована тактична загроза;
- `PRESSURE`: стабільна ініціатива без негайно форсованого виграшу;
- `DEFENCE`: сторона ходу перебуває під значним тиском;
- `QUIET`: відсутня висока локальна тактична форсованість.

Ці категорії не повинні ототожнюватися з evaluation sign. Позиція може бути виграшною, але quiet; або об’єктивно рівною, але chaotic.

### 9.2. Zone

Координата Z відповідає на питання:

> Де локалізована головна структурна напруга?

У поточній схемі:

- `KING`: основний конфлікт пов’язаний із king safety;
- `CENTER`: ключову роль відіграють central tension, pawn breaks або боротьба за центральні поля;
- `GLOBAL`: жодна локальна зона не домінує настільки, щоб визначити характер позиції.

Майбутні версії можуть додати `QUEENSIDE`, але збільшення кількості клітин підвищує expressivity ціною меншого sample count на cell. Таке розширення має бути емпірично виправданим.

### 9.3. Phase

Фаза Φ не є суто хронологічною шкалою. Вона описує функціональний режим:

- `OPENING`;
- `MIDDLEGAME`;
- `TACTICAL`;
- `ENDGAME`.

`TACTICAL` тут не означає “пізній етап партії”. Це режим пошукової складності, який може виникати в дебюті, мітельшпілі або ендшпілі.

Фаза може визначатися через:

- сумарний heavy material;
- кількість major/minor pieces;
- відкритість ліній;
- кількість checks і captures;
- tactical volatility;
- близькість passed pawns до promotion;
- king exposure.

Важливо не змішувати material balance з game phase. Зокрема, endgame detection має залежати від залишкового non-pawn material, а не від виразу на кшталт:

|material balance| < τ

оскільки стартова симетрична позиція також має material balance 0, але очевидно не є ендшпілем.

## 10. Динамічний режим Ω

### 10.1. Що класифікує Ω?

Морфологічний стан S₀ відповідає на питання:

> Якого структурного типу є позиція?

Ω відповідає на інше:

> Як поводиться її аналіз у процесі послідовного поглиблення пошуку?

У прикладній шаховій версії:

Ω = {STABLE, METASTABLE, CYCLIC, CHAOTIC}

Нехай:

e₁, e₂, …, e_d

— root scores на depths 1, 2, …, d. Тоді:

Δᵢ = eᵢ₊₁ − eᵢ

Операційні features для класифікації можуть включати:

- mean drift;
- score variance;
- amplitude score changes;
- best-move changes;
- overlap top-k root moves;
- principal variation overlap;
- root margin;
- tactical branching;
- repetition risk;
- history of policy states.

### 10.2. Ω не є абсолютною властивістю позиції

Принципово:

Ω = Ω(P, Search, V, H)

Інший search backend, evaluation function, depth schedule, node budget або set of heuristics можуть породити іншу trace of analysis і, відповідно, інший Ω.

Це не слабкість моделі. Це точний опис її предмета: SUBIT контролює не тільки позицію, а й процедуру її аналізу.

У формальній специфікації SUBIT Ω визначається для множин станів відносно оператора еволюції F. Шахова реалізація через iterative-deepening traces є прикладною операціоналізацією, а не буквальним ототожненням із формальним класифікатором F(P). Це розмежування має зберігатися в усіх теоретичних та емпіричних твердженнях.

### 10.3. Цикл Ω ↔ ρₛ і його розрив

У базовій схемі існує потенційна циклічна залежність:

Ω → ρₛ → Search → H → Ω

Якщо Ω залежить від history H, а H формується під політикою ρₛ, яка сама залежить від Ω, то виникає fixpoint problem.

Загалом можливі три підходи.

#### Часове розділення

Режим Ωₜ обчислюється з history попереднього циклу аналізу:

Ωₜ = D(S₀(Pₜ), Hₜ₋₁)

ρₜ = Π(S₀(Pₜ), Ωₜ)

Це найпростіший online варіант. Він інтерпретує Ω як delayed controller state.

#### Базова політика Π₀

Режим Ω обчислюється під фіксованою reference policy:

Ω₀ = D(S₀, H under Π₀)

після чого використовується:

ρₛ = Π(S₀, Ω₀)

Цей варіант розриває цикл і є найбільш зручним для контрольованих експериментів. Його ціна — припущення, що Ω, обчислена під Π₀, зберігає релевантність і для policy Π ≠ Π₀.

#### Спільна нерухома точка

Шукається пара:

(Ω*, ρ*) = (D(S₀, H under ρ*), Π(S₀, Ω*))

Це найбільш загальна, але й найбільш складна постановка. Вона потребує умов існування, стабільності або хоча б практичної ітеративної процедури збіжності.

У поточній експериментальній версії SUBIT-CHESS доцільно застосовувати перший або другий варіант. Для каузальної абляції найбільш чистим є обчислення Ω під фіксованою базовою policy Π₀, а вже потім застосування morphology-conditioned policy. Це робить об’єкт порівняння однозначнішим.

## 11. Belnap FOUR і Ω: ортогональні шари

SUBIT може використовувати ідеї чотиризначної логіки Белнапа:

𝔹₄ = {N, F, T, B}

де:

- N: neither;
- F: false;
- T: true;
- B: both.

Belnap FOUR описує структуру evidence: неповноту, підтвердження, заперечення або суперечність інформації.

Натомість:

Ω = {STABLE, METASTABLE, CYCLIC, CHAOTIC}

описує режим динаміки аналізу.

Отже:

𝔹₄ ≠ Ω

У багаторівневій архітектурі:

- Belnap описує evidence;
- V(P) дає scalar evaluation;
- S₀(P) задає morphology;
- Ω(P, Search, V, H) задає dynamics;
- ρₛ визначає resource policy;
- Search є базовою процедурою аналізу.

Ці рівні можуть взаємодіяти, але не повинні змішуватися в одну шкалу.

## 12. Policy vector ρₛ

Центральний об’єкт SUBIT — policy vector:

ρₛ = Π(S₀, Ω)

Він не повинен зводитися лише до множника для evaluation weights. У сильнішій версії:

ρₛ = (d, q, r_LMR, r_null, b_futility, e_check, e_recapture, e_passed-pawn, c_draw, π_ordering)

де:

- d — base depth або node budget;
- q — quiescence depth;
- r_LMR — aggressiveness late move reductions;
- r_null — null-move policy або reduction;
- b_futility — futility margin;
- e_check — check extension;
- e_recapture — recapture extension;
- e_passed-pawn — passed-pawn extension;
- c_draw — contempt або repetition preference;
- π_ordering — move-ordering policy.

Тоді одна й та сама базова search architecture може працювати по-різному для різних контекстів:

Search₁ = Search(P, ρₛ₁, V)

Search₂ = Search(P, ρₛ₂, V)

Алгоритм пошуку не обов’язково змінюється. Змінюється режим його селективності та allocation.

## 13. Побудова policy

Існують щонайменше три способи визначити ρₛ.

### 13.1. Manual policy

Експерт задає правила на кшталт:

TACTICAL + CHAOTIC  
→ більше forcing extensions  
→ слабші reductions  
→ ширший qsearch

QUIET + STABLE  
→ агресивніші reductions  
→ менше extensions  
→ дозволене раннє припинення пошуку

Перевага — висока інтерпретованість. Недолік — суб’єктивність і ризик overfitting експертної інтуїції.

### 13.2. Teacher-based policy

Для кожної морфологічної клітини c збирається reward signal:

μ_c = 𝔼[r | S₀ = c]

Teacher reward може визначатися через глибший search:

rₜ = clip(sign(mover) × (V_teacher(Pₜ₊₁) − V_teacher(Pₜ)), −R_max, R_max)

Це краще за прямий локальний reward:

ΔV_student = V_student(Pₜ₊₁) − V_student(Pₜ)

оскільки останній може підсилювати похибки тієї самої evaluation function, яку система намагається оптимізувати.

Проте teacher-based підхід має ризик engine-family bias. Якщо teacher є лише глибшою версією student search, policy може вчитися на distribution власних пріоритетів і blind spots. Тому потрібні незалежні validation suites, різні seeds, незалежні opening distributions, а в ідеалі — часткове маркування сильнішим зовнішнім teacher.

### 13.3. Learned policy

У загальнішій формі:

Πθ(S₀, Ω) → ρₛ

Параметри θ можуть навчатися з self-play, external games, teacher labels або contextual bandit signals.

Тут виникає класична проблема **credit assignment**. Одна партія проходить через багато морфологічних клітин:

S₀,₀ → S₀,₁ → … → S₀,ₙ

Якщо партія завершилася перемогою, не можна прямо приписати результат лише одному переходу або одній policy cell. Наприклад, незрозуміло, чи був успіх зумовлений policy у `QUIET|CENTER|OPENING`, у `PRESSURE|KING|TACTICAL`, чи їхньою композицією.

Поточна практична стратегія може використовувати локальний reward:

rₜ = sign(mover) × (V_teacher(Pₜ₊₁) − V_teacher(Pₜ))

або усереднений reward на клітину:

μ_c = mean(reward for all transitions where S₀ = c)

Але це лише наближення, а не строгий розв’язок long-horizon credit assignment. Воно може не враховувати delayed effects, sacrifice dynamics, preparatory moves або взаємодію кількох policy states.

Більш строгі майбутні варіанти можуть включати:

- temporal-difference learning;
- eligibility traces;
- counterfactual credit assignment;
- contextual bandits із delayed feedback;
- Shapley-like attribution для обмежених policy trajectories;
- value decomposition over state transitions.

Отже, learned ρₛ слід розглядати як окрему дослідницьку програму, а не як автоматичний наслідок наявності morphology cells.

## 14. Transition topology

Партія породжує trajectory:

S₀,₀ → S₀,₁ → … → S₀,ₙ

Тому S₀ не слід розглядати лише як набір ізольованих клітин. Можна визначити directed transition graph:

G = (S₀, E)

де:

(a, b) ∈ E

тоді й лише тоді, коли спостерігався перехід:

S₀,ₜ = a → S₀,ₜ₊₁ = b

Для кожного переходу можна зберігати:

mₐ→ᵦ = (N, mean ΔV, Var ΔV, ΔΩ, Δρ, outcome, provenance)

Це дозволяє аналізувати не тільки частоти станів, а й структуру трансформацій:

QUIET|CENTER|OPENING → PRESSURE|CENTER|MIDDLEGAME

або:

PRESSURE|KING|TACTICAL → QUIET|GLOBAL|ENDGAME

На цьому рівні SUBIT стає не лише класифікатором позицій, а моделлю trajectory-dependent control.

## 15. Основна та операційні гіпотези

Центральну тезу SUBIT можна сформулювати так:

> Позиція може містити інформацію не лише про свою оцінку, а й про те, який спосіб її обчислювального дослідження буде найефективнішим за обмеженого ресурсу.

Традиційна evaluation відповідає:

V(P) = «наскільки хороша P?»

SUBIT додає:

M(P) = «якого структурного типу P?»

D(P, H) = «як поводиться її аналіз?»

Π(M, D) = «як слід витратити ресурс?»

Ця теза має бути операціоналізована через три фальсифіковані гіпотези.

### H₁ᵃ — Efficiency

За однакової decision quality або playing strength SUBIT потребує статистично менше nodes або часу, ніж baseline:

Quality(SUBIT, B₁) ≈ Quality(Baseline, B₂)

але:

B₁ < B₂

Тут B — node budget або time budget.

### H₁ᵇ — Strength

За однакового node/time budget SUBIT демонструє статистично значуще підвищення playing strength:

Strength(SUBIT | B) > Strength(Baseline | B)

### H₁ᶜ — Robustness

Ефект зберігається:

- на незалежних позиціях;
- на окремому test distribution;
- при зміні opening distribution;
- при зміні random seed;
- за можливості — при перенесенні на інший search backend.

Нульова гіпотеза:

> Після контролю за raw features, search budget і базовими характеристиками пошуку морфологічна класифікація S₀ не містить додаткової інформації, корисної для оптимізації resource allocation.

## 16. Що SUBIT не винаходить

Для наукової точності необхідно зафіксувати межі претензії.

SUBIT не винаходить:

- minimax;
- alpha-beta pruning;
- principal variation search;
- selective search;
- move ordering;
- LMR;
- null-move pruning;
- futility pruning;
- quiescence search;
- MCTS;
- neural evaluation;
- policy-guided search;
- learned heuristics;
- context-dependent computation.

Тому твердження:

> SUBIT вводить adaptive chess search

було б надто широким.

Точніше:

> SUBIT пропонує явну, дискретну й інтерпретовану морфологічну модель контексту як проміжний control layer між станом задачі та політикою розподілу обчислювального ресурсу.

Саме це твердження є потенційно новим і потребує емпіричної перевірки.

## 17. Найважливіший baseline: raw-feature controller

Позитивний результат проти fixed policy не доводить специфічної цінності SUBIT. Він може означати лише те, що будь-яка context-sensitive adaptation краща за глобальні параметри.

Тому критично потрібен baseline:

Raw Context Controller

Він отримує ті самі або максимально подібні raw features:

- material;
- mobility;
- king danger;
- checks;
- captures;
- threats;
- phase;
- central tension;
- branching factor;
- tactical volatility;
- repetition indicators;
- root-score variance.

Але не використовує явне кодування:

P → S₀ → Ω → ρₛ

Тоді ключове порівняння стає:

raw-feature controller vs SUBIT controller

Лише якщо SUBIT стабільно перевершує raw-feature baseline за однакової кількості learnable parameters і однакового compute budget, можна стверджувати, що дискретна морфологічна організація додає щось понад звичайну feature conditioning.

## 18. Експериментальна матриця

Мінімальна каузальна абляція має включати:

- **A. Fixed baseline** — фіксована search policy.
- **B. S₀-only** — policy залежить лише від morphology.
- **C. Ω-only** — policy залежить лише від search dynamics.
- **D. S₀ + Ω** — контекстна policy без learned morphisms.
- **E. Full SUBIT** — S₀ + Ω + ρₛ із learned policy або morphisms.
- **F. Random policy** — такий самий distribution параметрів, але випадкове призначення.
- **G. Shuffled labels** — правильні S₀ labels перемішані між позиціями.
- **H. Raw-feature controller** — context controller без SUBIT representation.
- **I. Oracle upper bound** — post-hoc найкраща policy на незалежному validation set.

Найважливіші контроли:

- **Random:** чи будь-яка варіація policy створює apparent gain?
- **Shuffled:** чи важливий зв’язок policy з правильною morphology?
- **Raw-feature baseline:** чи важлива SUBIT organization, а не просто доступ до features?
- **Oracle:** чи є взагалі practical headroom для policy adaptation?

## 19. Train, validation і test

Policy не повинна навчатися і оцінюватися на тому самому distribution без чіткого розділення.

Мінімальна схема:

Training → policy fitting → Validation → hyperparameter selection → Test

Для self-play experiments необхідно контролювати:

- opening distribution;
- random seed;
- move limit;
- hardware;
- time control;
- node budget;
- threads;
- hash size;
- engine version;
- teacher depth;
- temperature;
- top-k selection;
- grammar initialization;
- persistence policy.

Особливо небезпечний teacher leakage. Якщо teacher генерує або розмічає позиції, статистично близькі до test distribution, позитивний результат може описувати не generalization, а близькість distributions.

Тому фінальний test set має містити:

- незалежні FEN suites;
- інші opening families;
- tactical suites;
- endgame suites;
- positions from external human games;
- seeds, не використані під час training;
- за можливості — positions from a different engine family.

## 20. Що потрібно вимірювати

Elo недостатньо. Потрібні щонайменше три класи метрик.

### Playing strength

- win rate;
- draw rate;
- match score;
- Elo difference;
- confidence interval;
- paired score difference;
- SPRT або Bayesian posterior за можливості.

### Search efficiency

- nodes;
- nodes per second;
- achieved depth;
- selective depth;
- qsearch nodes;
- transposition-table hit rate;
- alpha-beta cutoff rate;
- LMR count;
- null-move cutoffs;
- futility cutoffs;
- extensions;
- root move stability;
- node allocation by S₀ and Ω.

### Decision quality

- best-move agreement із teacher;
- tactical accuracy;
- mate detection;
- blunder rate;
- principal-variation stability;
- evaluation error against deeper teacher;
- tablebase agreement у релевантних ендшпілях.

Це розділяє:

strength gain

і:

efficiency gain

Другий результат не менш важливий для центральної гіпотези.

## 21. Найчистіший позитивний результат

Припустімо:

Baseline: 100 M nodes → quality E

SUBIT: 70 M nodes → quality E

Тоді SUBIT не обов’язково поліпшив evaluation function. Він поліпшив allocation:

search efficiency = decision quality / compute cost

Це є найбільш чистим експериментальним підтвердженням morphology-conditioned control.

## 22. Альтернативні пояснення позитивного результату

Навіть позитивний результат не доводить SUBIT автоматично. Він може виникнути через:

1. випадково кращий move ordering;
2. несиметричне збільшення effective depth;
3. зміну pruning aggressiveness;
4. прихований додатковий compute;
5. phase encoding, а не morphology як таку;
6. teacher leakage;
7. overfitting до self-play distribution;
8. ефект конкретного engine;
9. невдалий baseline;
10. variance короткого матчу.

Тому causal ablation не є додатковою опцією. Вона є центральною умовою коректної інтерпретації.

## 23. Robustness і cross-run stability

Для teacher-based signal недостатньо отримати багато signal cells у одному прогоні. Через автокореляцію ходів усередині партій і залежність self-play trajectories від random seed потрібно вимірювати стабільність.

Нехай:

A = signal cells у run₁

B = signal cells у run₂

Тоді Jaccard similarity:

J(A, B) = |A ∩ B| / |A ∪ B|

Практичний gate для переходу до policy-learning stage:

|A| ≥ 30

|B| ≥ 30

J(A, B) ≥ 0.60

Потрібні також інші constraints:

droppedRaw = 0

40 ≤ visitedCells ≤ 58

top5Share ≤ 0.60

3.5 ≤ H ≤ 4.5

Ці пороги не є теоретичними законами. Вони є engineering criteria, які запобігають переходу до policy learning на колапсованому, надто sparse або нестабільному state partition.

## 24. SUBIT і NNUE

Одна з найприродніших майбутніх конфігурацій:

V(P) = V_NNUE(P)

ρₛ = Π(S₀(P), Ω(P, Search, V, H), V_NNUE(P))

Тоді NNUE залишається evaluator, а SUBIT виконує роль controller.

NNUE asks:

> What is the position worth?

SUBIT asks:

> How should computation be spent investigating it?

Ці системи функціонально ортогональні. Але це не гарантує additive gain: сильний evaluator уже може зменшувати простір для додаткового controller improvement. Це має бути перевірено експериментально.

## 25. SUBIT і MCTS

SUBIT може бути інтегрований із MCTS:

P → S₀(P) → Ω(P, Search, V, H) → ρₛ → MCTS(P)

У такому випадку ρₛ може керувати:

- exploration coefficient;
- simulation budget;
- expansion threshold;
- root allocation;
- temperature;
- rollout або visit allocation;
- stopping criterion;
- policy-prior regularization.

Це породжує окреме питання:

> Чи може explicit morphology доповнити learned neural policy, не дублюючи її функцію?

## 26. Від дискретної морфології до hybrid representation

Поточний простір S₀ дискретний:

S₀ chess ∈ {1, …, 48}

Але загальна SUBIT architecture не вимагає повної дискретності. Можливий hybrid model:

z(P) ∈ ℝⁿ

M(P) = cluster(z(P)) ∈ S₀

Тоді система має два рівні:

1. continuous representation для capacity;
2. coarse-grained morphology для interpretability і policy control.

Такий дизайн потенційно поєднує сильні сторони neural representation і явних структурних режимів.

## 27. Обмеження

SUBIT має принципові обмеження.

### 27.1. Information loss

P → S₀

є грубою проєкцією. Багато різних позицій потрапляють у ту саму клітину.

### 27.2. Feature dependence

Якість S₀ залежить від того, наскільки вдало визначено I, Z та Φ.

### 27.3. Search dependence

Ω залежить від search backend, evaluation function, budget і trace analysis.

### 27.4. Policy overfitting

Клітини можуть отримати policy parameters, оптимальні лише для training distribution.

### 27.5. Engine dependence

Позитивний результат на одному engine не доводить перенесення на інший.

### 27.6. Diminishing returns

Чим сильніший evaluator і search implementation, тим менший простір може залишатися для додаткового controller gain.

### 27.7. Control overhead

Морфологічний controller сам споживає compute. Він потребує feature extraction, classification, history maintenance, policy lookup і, можливо, online updates.

Тому чесне порівняння має вимірювати:

total compute cost = search cost + controller cost

Інакше apparent efficiency gain може бути артефактом неповного compute accounting.

## 28. Висновок

Історію комп’ютерних шахів можна читати як історію дедалі точнішого розподілу обчислювального ресурсу:

- Шеннон поставив проблему селективності;
- minimax формалізував decision search;
- alpha-beta зробив перебір ефективнішим;
- selective heuristics навчили рушії нерівномірно досліджувати дерево;
- NNUE посилила evaluation;
- AlphaZero та Lc0 показали learned policy-guided search.

SUBIT додає вузьке питання:

> Чи може контекст, який визначає режим пошуку, бути представлений як окремий інтерпретований структурний об’єкт?

Запропонована схема:

P → S₀(P) → Ω(P, Search, V, H) → ρₛ → Search(P, ρₛ, V)

У ній:

- S₀ описує морфологічний тип позиції;
- Ω описує режим динаміки аналізу;
- ρₛ визначає policy resource allocation;
- V оцінює позиції;
- Search є базовою процедурою дослідження.

SUBIT не слід розглядати як доведену заміну Stockfish, NNUE, AlphaZero або MCTS. Його коректний статус — фальсифікована архітектурна гіпотеза:

explicit morphology-conditioned control

може поліпшувати якість або ефективність пошуку за фіксованого ресурсу.

Її перевірка потребує не тільки Elo matches, а й:

- causal ablations;
- shuffled labels;
- random policies;
- raw-feature baselines;
- independent test distributions;
- total compute accounting;
- cross-run stability;
- teacher-leakage controls;
- розділення train, validation і test.

Найкоротше ядро концепції:

Evaluation asks what the state is worth.  
Morphology asks what kind of state it is.  
Dynamics asks how its analysis behaves.  
Search policy asks how computation should be spent.

Отже:

SUBIT = explicit morphology-conditioned control of computation

## Глосарій

**Adaptive search** — пошук, параметри якого залежать від властивостей вузла, історії або контексту.

**Alpha-beta** — оптимізований minimax із pruning гілок, які не можуть змінити результат.

**Belnap FOUR** — чотиризначна логіка N, F, T, B для представлення неповної та суперечливої evidence.

**Context-conditioned search** — пошук, параметри якого залежать від опису поточного контексту.

**Credit assignment** — проблема приписування відкладеного outcome окремим діям, станам або policy decisions у довгій trajectory.

**LMR** — Late Move Reductions; зменшення depth для менш пріоритетних ходів.

**MCTS** — Monte Carlo Tree Search.

**Morphology-conditioned computation** — allocation обчислювального ресурсу відповідно до структурного типу поточного стану.

**NNUE** — Efficiently Updatable Neural Network для швидкої neural evaluation у шаховому search.

**Ω** — класифікатор режиму динаміки пошуку.

**ρₛ** — policy vector розподілу search resource.

**S₀** — низьковимірна морфологічна проєкція шахової позиції.

**SUBIT** — архітектура M, D, Π для morphology-conditioned control of computation.

## Література

Belnap, N. D. (1977). *A useful four-valued logic*. In *Modern Uses of Multiple-Valued Logic*. Springer.

Campbell, M., Hoane, A. J., & Hsu, F.-H. (2002). Deep Blue. *Artificial Intelligence, 134*(1–2), 57–83.

Kocsis, L., & Szepesvári, C. (2006). Bandit based Monte-Carlo planning. In *ECML 2006*, 282–293.

Knuth, D. E., & Moore, R. W. (1975). An analysis of alpha-beta pruning. *Artificial Intelligence, 6*(4), 293–326.

Leela Chess Zero Project. *Lc0 technical documentation and architecture*.

Schaeffer, J., & van den Herik, J. (2002). Games, computers, and artificial intelligence. *Artificial Intelligence, 134*(1–2), 1–7.

Shannon, C. E. (1950). Programming a computer for playing chess. *Philosophical Magazine, 41*(314), 256–275.

Silver, D., Hubert, T., Schrittwieser, J., et al. (2018). A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play. *Science, 362*(6419), 1140–1144.

Stockfish Project. *Stockfish documentation and NNUE architecture*.

Turing, A. M. (1953). Digital computers applied to games. In B. V. Bowden (Ed.), *Faster Than Thought* (pp. 286–310). Pitman.