# АдминКИТ — актуальный контекст проекта после PR235

Дата фиксации контекста: 2026-06-23  
Репозиторий: `9163223-maker/amio-comments-max`  
Production URL: `https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run`  
Diagnostic branch: `runtime-status`  
Diagnostic file: `runtime/startup-log.json`

---

## 0. Главное правило на следующий чат

Не откатываться в старые планы и старые ветки.

Актуальная точка проекта сейчас:

- PR234 уже смержен и дал post-merge live readiness workflow.
- PR235 уже смержен и починил stats callback readiness.
- Production после PR235 поднял свежий `main` SHA.
- Final runtime readiness сейчас зелёный.
- Следующий этап — не чинить readiness, а перейти к Product Perfect / canonical menu audit и сверке текущего меню с целевой 13-раздельной структурой.

Нельзя снова начинать с PR229/PR230/PR231 как будто они текущие. Они уже история.

---

## 1. Что такое АдминКИТ

АдминКИТ — система управления для MAX: бот + web/PWA + админ-функции для владельцев MAX-каналов.

Цель продукта: сделать удобную систему управления MAX-каналом, похожую по удобству на Telegram-инструменты, но с учётом ограничений MAX API.

Основные продуктовые зоны:

1. Каналы и подключение каналов.
2. Комментарии под постами.
3. Фото в комментариях.
4. Реакции и ответы.
5. Подарки / лид-магниты.
6. CTA / кнопки под постами.
7. Статистика.
8. Рекламные ссылки / источники.
9. Push-уведомления.
10. Опросы / голосования.
11. Выделение постов.
12. Редактор постов.
13. Архив постов.
14. Личный кабинет.
15. Настройки / доступ / debug / production readiness.

---

## 2. Runtime / production contract

Production startup path должен оставаться:

```text
node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js
```

Active entrypoint:

```text
clean-entrypoint-1.53.10-pr89.js
```

Текущий runtime после PR235:

```text
runtimeVersion: CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP
sourceMarker: adminkit-pr229-stats-scope-buttons-cleanup
githubMainHeadSha: d0d74c00b7acbdb7ed4758f4581250ee6a864374
```

После каждого merge обязательно проверять:

- `package.json` start script;
- active Northflank entrypoint;
- deployed SHA / current main;
- `runtimeVersion`;
- `sourceMarker`;
- `runtime/startup-log.json` в ветке `runtime-status`;
- `runtimeContract.contractLiveOk`;
- `startupPath.ok`;
- `dataProviders.ok`;
- отсутствие boot-loop/restarts;
- `finalRuntimeReadinessGate`;
- фактический импорт новой функциональности в production startup path.

Нельзя говорить “готово” после одного CI/merge. Готово только после live diagnostic verification.

---

## 3. Что уже сделано по PR229–PR235

### PR229 — Stats scope selector / buttons cleanup

PR #229: `PR229 — Stats scope selector, channel/chat split and buttons cleanup`

Runtime: `CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP`  
Source marker: `adminkit-pr229-stats-scope-buttons-cleanup`

Что дал:
- channel-first stats scope selector;
- разделение channel/chat логики для stats/buttons;
- buttons product-perfect cleanup;
- подготовка stats root к product-perfect структуре.

После PR229 оставался blocker:

```text
statsCallbackContractLiveOk: false
statsCallbackContractOk: false
statsMainMenuRoutesToCurrentStatsRoot: false
statsLegacyRootNotReturned: true
```

### PR230 — НЕ использовать

PR #230 был неправильным hotfix от старой базы. Не использовать, не мержить, не возвращаться к нему.

Проблемы PR230:
- мог обходить access gate;
- мутировал bot chain;
- сканировал старый stats root;
- не был привязан к live production startup path;
- не решал readiness корректно.

### PR231 — callback readiness contract attempt

PR #231: `Hotfix: PR229 callback readiness contract`

После merge случился production boot-loop:
- `installPersistentStore()` падал из-за Postgres connection timeout;
- сервер не доходил до `Server started`;
- startup-log не обновлялся.

### PR232 — Postgres timeout no-crash

PR #232: `Hotfix: prevent Postgres timeout from crashing startup`

Что сделал:
- `postgres-state-store.js` перестал бросать ошибку при `pg.Pool.connect()` timeout;
- `loadSnapshot()` / `saveSnapshot()` стали возвращать safe diagnostic object;
- boot-loop был остановлен;
- production снова стал стартовать и писать startup-log.

### PR233 — callback child no-db guard

PR #233: `Hotfix: isolate callback readiness child from live Postgres`

Что сделал:
- callback contract child перестал считать Postgres configured через:
  - `ADMINKIT_CALLBACK_CONTRACT_CHILD=1`
  - `ADMINKIT_CALLBACK_CONTRACT_NO_DB=1`

Что подтвердил:
- production fresh main deploy работает;
- startup path жив;
- Postgres boot-loop устранён;
- но stats callback readiness ещё не был зелёный.

### PR234 — post-merge live readiness workflow

PR #234: `PR234: post-merge live readiness checker`

Merge commit:

```text
b0b7c9cbc218960b56177073a1022409b569d674
```

Задача: автоматизировать проверку после merge в `main`.

Добавлены:
- `.github/workflows/post-merge-live-readiness.yml`
- `scripts/check-post-merge-live-readiness-pr234.js`
- `scripts/test-post-merge-live-readiness-pr234.js`
- подключение теста в `scripts/smoke-test.js`

Workflow:
- запускается на push в `main`;
- ждёт 5 минут;
- checkout exact `${{ github.sha }}`;
- запускает checker;
- permissions read-only.

Checker проверяет:
- deployed SHA;
- startup freshness;
- runtimeVersion;
- sourceMarker;
- entrypoint;
- runtimeContract;
- startupPath;
- dataProviders;
- staleEndpointDetected;
- boot-loop signal;
- final readiness gate progress.

Codex audit по PR234 сначала нашёл blocker:
- checker hardcoded `sourceMarker` и `entrypoint`.

Это было исправлено:
- `runtimeVersion`, `sourceMarker`, `entrypoint` теперь берутся из `package.json` через `packageMetadata()`;
- тест покрывает future sourceMarker / entrypoint override.

PR234 был смержен и live diagnostic branch подтвердил:
- `githubMainHeadSha: b0b7c9cbc218960b56177073a1022409b569d674`
- `runtimeContract.contractLiveOk: true`
- `startupPath.ok: true`
- `dataProviders.ok: true`

Но после PR234 stats callback readiness всё ещё был красный.

### PR235 — stats callback readiness child exit fix

PR #235: `PR235: fix stats callback readiness child exit`

Branch: `hotfix/pr235-stats-callback-readiness`  
Head перед merge: `9ab7f9ede0b1aeccfe28d493d03a36d418f80851`  
Merge commit: `d0d74c00b7acbdb7ed4758f4581250ee6a864374`

Что изменил:
- только `callback-contract-live-pr228.js`;
- `childEvalSource()` теперь после вывода `RESULT_MARKER + JSON.stringify(result)` явно завершает child process:
  - exit 0 если result ok;
  - exit 1 если result not ok.

Зачем:
- раньше callback contract child мог вывести marker, но не завершиться из-за production handles/timers;
- `spawnSync()` воспринимал это как timeout/result.error;
- readiness получал false до разбора stdout.

Codex audit по PR235:
- `AUDIT RESULT: PASS`
- P1 blockers: none
- P2 blockers: none
- Safe to mark Ready: yes
- Safe to merge: yes

PR235 был смержен.

---

## 4. Текущий live status после PR235

После PR235 production diagnostic branch уже проверен.

`runtime-status/runtime/startup-log.json` показывает:

```text
ok: true
updatedAt: 2026-06-23T18:16:58.719Z
startedAt: 2026-06-23T18:16:17.619Z
githubMainHeadSha: d0d74c00b7acbdb7ed4758f4581250ee6a864374
runtimeVersion: CC8.3.68-PR229-STATS-SCOPE-BUTTONS-CLEANUP
sourceMarker: adminkit-pr229-stats-scope-buttons-cleanup
entrypoint: clean-entrypoint-1.53.10-pr89.js
```

Runtime contract:
- `contractLiveOk: true`
- `startupPath.ok: true`
- `dataProviders.ok: true`
- `mismatches: []`

Stats callback readiness теперь зелёный:

```text
statsCallbackContractWired: true
statsCallbackContractLiveOk: true
statsCallbackContractOk: true
statsMainMenuRoutesToCurrentStatsRoot: true
statsLegacyRootNotReturned: true
```

Final runtime readiness gate:

```text
finalRuntimeReadinessGate.ok: true
missing: []
readyForManualMaxTest: true
```

Это важно: readiness не нужно чинить заново. Он уже зелёный после PR235.

---

## 5. Каноническое Product Perfect меню: целевая структура верхнего уровня

Последняя согласованная целевая структура верхнего меню АдминКИТ — 13 разделов.

Это не старая компактная версия на 8 пунктов. Компактная 8-пунктовая версия НЕ канон.

Каноническое верхнее меню:

1. Каналы
2. Комментарии
3. Подарки / лид-магниты
4. Кнопки под постами
5. Статистика
6. 🔔 Push-уведомления
7. Рекламные ссылки
8. Опросы / голосования
9. Выделение постов
10. Редактор постов
11. Архив постов
12. Личный кабинет
13. Настройки

Эту структуру нужно считать текущей продуктовой целью для верхнего уровня.

Важно:
- Push после PR172/PR173 стал отдельным видимым продуктовым разделом, поэтому меню именно 13 разделов.
- Видео и файлы в комментариях НЕ возвращаем. В комментариях остаются:
  - текст;
  - фото;
  - реакции;
  - ответы.
- Подарочные материалы НЕ должны торчать отдельными техническими пунктами в top-level меню. Тип материала выбирается внутри сценария «Создать подарок».
- Архив и Настройки могли содержать технические/placeholder-пункты — их нужно отдельно чистить.
- Текущее меню нужно сравнивать не только по наличию кнопок, а по реальному поведению:
  - куда ведёт каждый пункт;
  - нет ли legacy-экранов;
  - нет ли заглушек;
  - нет ли старых цепочек;
  - нет ли технических пунктов в client-visible menu.

---

## 6. Текущий канонический источник меню в коде

Кодовый single source of truth сейчас:

```text
features/menu-v3/canonical-menu.js
```

В файле есть комментарий:

```text
PR105 Production Menu Canonicalization.
Single source of truth for the client-visible production menu.
Legacy production-menu-map-v3-fixed.js and production-menu-v3-renderer.js are reference-only.
```

В этом файле `sections` сейчас включает 13 разделов:

1. `channels` — `Каналы`
2. `comments` — `Комментарии`
3. `gifts` — `Подарки / лид-магниты`
4. `buttons` — `Кнопки под постами`
5. `stats` — `Статистика`
6. `push` — в коде сейчас title `🔔 Уведомления`; продуктово нужно сверить с целевым `🔔 Push-уведомления`
7. `ad_links` — `Рекламные ссылки`
8. `polls` — `Опросы / голосования`
9. `highlights` — `Выделение постов`
10. `editor` — `Редактор постов`
11. `archive` — `Архив постов`
12. `account` — `Личный кабинет`
13. `settings` — `Настройки`

Важно для нового чата:
- Не считать кодовый title `🔔 Уведомления` финальным продуктовым названием без проверки. С пользователем согласовано `🔔 Push-уведомления`.
- Не путать stats root product-perfect view с internal canonical-menu stats actions. В `canonical-menu.js` могут быть старые stats actions типа `Обзор`, `Подписчики`, `Посты`, но user-facing stats home после PR229 должен вести на PR229 product-perfect stats root:
  - `📈 Рост`
  - `🎯 Источники`
  - `🧭 Воронка`
  - `📝 Контент`
  - `📤 Отчёт и качество данных`

---

## 7. Что уже Product Perfect / готово технически

После PR235 live readiness green. Это значит, что технический фундамент сейчас пригоден для следующего этапа.

Точно зелёные live gates:
- runtime snapshot ok;
- runtime identity matches expected build;
- runtime contract live ok;
- PR199 buttons wizard ok;
- PR202 buttons real show path ok;
- buttons physical route probe ok;
- URL link preview probe ok;
- buttons wizard physical inplace ready;
- plus sign wizard text supported;
- buttons save real callback ok;
- buttons save idempotent ok;
- buttons current reads canonical DB ok;
- buttons global nav first tap ok;
- buttons no stale current preview ok;
- stats callback contract wired;
- stats callback live ok;
- stats callback ok;
- stats main menu routes to current stats root;
- stats legacy root not returned.

Это означает:
- production startup path жив;
- post-merge verification workflow есть;
- stats callback readiness больше не blocker;
- можно переходить к Product Perfect menu audit.

---

## 8. Что осталось сделать

Следующий этап: Product Perfect / canonical menu audit.

Не начинать с coding. Сначала нужно зафиксировать текущую карту меню и сравнить с целевыми 13 разделами.

### Шаг 1. Снять фактическое меню из кода

Нужно собрать:
- верхнее меню из `features/menu-v3/canonical-menu.js`;
- фактические actions / routes каждого раздела;
- clientVisible / adminOnly / implemented / hiddenReason;
- какие пункты требуют channel/post;
- какие пункты доступны на каких тарифах;
- legacy aliases и fallback routes.

### Шаг 2. Снять фактическое меню из live bot / debug

Нужно проверить:
- что реально видит пользователь в MAX;
- что реально возвращает `/debug/menu/routes`;
- что возвращает menu V3 renderer;
- есть ли расхождение между canonical source и live rendering.

### Шаг 3. Сравнить с целевой 13-раздельной структурой

Для каждого раздела:
- есть ли в top-level;
- корректное название;
- корректная иконка/эмодзи;
- корректный order;
- ведёт ли в правильный flow;
- нет ли legacy/placeholder/technical пунктов;
- нет ли дублирования в других разделах;
- понятен ли CTA/UX.

### Шаг 4. Отделить “есть в коде” от “целевой продукт”

Для каждого раздела сформировать таблицу:

```text
Раздел
Целевой UX
Что уже есть в коде
Что работает в live
Что является legacy/placeholder
Что надо почистить
Что надо дописать
Приоритет
```

### Шаг 5. После аудита сделать PR на menu product-perfect cleanup

Не раньше, чем будет понятен diff.

---

## 9. Разделы и продуктовые ожидания

### 1. Каналы
Цель:
- подключить канал;
- показать мои каналы;
- выбрать канал для действий;
- без technical channelId в UI;
- channel-first picker должен показывать текстовые названия.

Уже было зафиксировано:
- после выбора канала посты должны быть только этого канала.

### 2. Комментарии
Цель:
- включить комментарии к посту;
- автокомментарии;
- фото в комментариях;
- ответы;
- реакции.

Не возвращать:
- видео в комментариях;
- файлы в комментариях.

### 3. Подарки / лид-магниты
Цель:
- создать подарок;
- текущий подарок;
- список подарков;
- замена/редактирование внутри сценариев, а не как техническая top-level кнопка.

Важно:
- тип материала выбирается внутри сценария «Создать подарок»;
- не плодить отдельные технические пункты для PDF/файла/ссылки в верхнем меню.

### 4. Кнопки под постами
Цель:
- добавить кнопку;
- текущие кнопки;
- удалить/изменить внутри карточки текущих кнопок;
- real show path / physical callback уже проверены.

Тариф:
- start/pro, не free.

### 5. Статистика
Цель user-facing stats root:
- `📈 Рост`
- `🎯 Источники`
- `🧭 Воронка`
- `📝 Контент`
- `📤 Отчёт и качество данных`

Не возвращаться к старому root:
- `Обзор`
- `Подписчики`
- `Посты`
- `Комментарии`
- `Реакции`
- `Подарки`
- `Кнопки под постам`
- `Источники подписч`
- `Обновить данные`

Эти старые пункты могут быть внутренними routes/actions, но не должны быть user-facing root.

### 6. 🔔 Push-уведомления
Цель:
- отдельный видимый продуктовый раздел;
- подключение/публикация приглашения;
- help/как работает;
- multi-chat handoff;
- device-scoped chat list.

Текущее кодовое название может быть `🔔 Уведомления`, но целевой продуктовый label — `🔔 Push-уведомления`.

### 7. Рекламные ссылки
Цель:
- создать рекламную ссылку;
- мои рекламные ссылки;
- отключение/статус внутри карточки ссылки;
- связка со статистикой/источниками.

### 8. Опросы / голосования
Цель:
- создать опрос;
- результаты;
- остановить внутри активного опроса;
- не превращать в comments placeholder.

### 9. Выделение постов
Цель:
- поставить выделение;
- снять выделение;
- работает через выбор канала/поста.

### 10. Редактор постов
Цель:
- выбрать пост;
- изменить/редактировать;
- история версий не должна торчать, если не готова.

### 11. Архив постов
Цель:
- сохранённые посты;
- восстановить внутри карточки;
- лимиты хранения;
- технический status не должен быть client-visible.

### 12. Личный кабинет
Цель:
- мой доступ;
- активировать код;
- оплата/продление;
- лимиты и функции;
- мои каналы;
- поддержка.

### 13. Настройки
Цель:
- очистить чат;
- уведомления — осторожно, чтобы не дублировать Push-раздел;
- язык/формат, если готово;
- помощь;
- privacy/terms;
- навигация не должна быть отдельным placeholder, если это global navigation.

---

## 10. Важные файлы для menu/product audit

Основные:

```text
features/menu-v3/canonical-menu.js
features/menu-v3/adapter.js
v3-menu-core-1539.js
v3-menu-routes-1539.js
```

Связанные flows:

```text
buttons-flow-cc8-clean.js
stats-flow-cc8.js
callback-contract-live-pr228.js
stats-scope-buttons-live-pr229.js
clean-bot-channel-first-post-picker-pr90.js
clean-bot-campaign-attribution-cc8336.js
clean-bot-live-chat-push-pr165.js
```

Readiness / diagnostics:

```text
services/runtimeContractService.js
services/liveVersionSnapshotService.js
services/startupLogService.js
scripts/check-post-merge-live-readiness-pr234.js
.github/workflows/post-merge-live-readiness.yml
```

Postgres / state:

```text
postgres-state-store.js
persistent-store-bootstrap.js
cc5-db-core.js
```

---

## 11. Ошибки, которые нельзя повторять

1. Не откатываться к старому 8-пунктовому меню.
2. Не считать `features/menu-v3/canonical-menu.js` “идеальным” без проверки поведения.
3. Не возвращать видео/файлы в комментариях.
4. Не превращать подарочные материалы в top-level technical menu.
5. Не считать stats old root целевым user-facing root.
6. Не смешивать menu product audit с runtime readiness fixes.
7. Не менять production startup path без отдельной причины.
8. Не считать PR завершённым без live diagnostic branch.
9. Не делать blind microfix, если нужен end-to-end product audit.
10. Не просить пользователя проверять GitHub/Northflank, если можно проверить инструментами.

---

## 12. Что делать в новом чате первым делом

Начать не с Codex и не с PR.

Первое действие:
1. Подтвердить, что `runtime-status/runtime/startup-log.json` после PR235 показывает:
   - `githubMainHeadSha: d0d74c00b7acbdb7ed4758f4581250ee6a864374`
   - `finalRuntimeReadinessGate.ok: true`
   - `readyForManualMaxTest: true`
2. Затем перейти к Product Perfect menu audit:
   - прочитать `features/menu-v3/canonical-menu.js`;
   - сформировать фактическое дерево меню;
   - сравнить с 13-раздельной целевой структурой;
   - разделить “есть в коде”, “работает в live”, “целевая продуктовая форма”, “надо чистить”.
3. После этого подготовить задачу Codex на menu product-perfect cleanup.

---

## 13. Текущий краткий итог

АдминКИТ после PR235:
- production redeploy работает;
- startup path зелёный;
- runtime contract зелёный;
- stats callback readiness зелёный;
- finalRuntimeReadinessGate зелёный;
- post-merge live readiness workflow добавлен;
- следующий этап — Product Perfect canonical menu audit и cleanup по 13-раздельной структуре.

Не возвращаться назад. Следующий фокус — меню и продуктовая чистка, а не readiness.
