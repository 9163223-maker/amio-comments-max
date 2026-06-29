# АдминКИТ — текущий контекст и рабочие правила

Updated: 2026-06-29 07:55 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## 1. Смысл проекта

АдминКИТ — система управления для MAX: бот, web/PWA и админские функции для владельцев каналов. Цель — удобная админка для MAX, похожая по простоте на Telegram-подход, но с собственными MAX UX-флоу.

Зоны продукта: каналы, комментарии под постами, кнопки под постами, подарки / лид-магниты, статистика, рекламные ссылки и кампании, push/PWA, опросы, выделение, редактор, архив, личный кабинет, настройки.

Пользовательский идеал: владелец канала нажимает раздел, видит понятный экран, выбирает пост/канал, настраивает функцию и может вернуться назад без пустых экранов, зависших flow и технического мусора.

## 2. Роли и ответственность

Assistant — основной технический исполнитель. Он должен сам вести задачу максимально далеко: создать или найти PR, читать diff, читать GitHub Actions, разбирать красные jobs/logs, править PR-ветку, снова проверять CI и повторять цикл до зелёного статуса.

После появления PR Codex Cloud больше не является основным доработчиком: assistant сам доводит ветку до зелёного GitHub Actions, если это технически возможно.

Codex Cloud используется в двух режимах: создать PR, если assistant не может сам безопасно создать PR; audit only после зелёного CI. В audit-only Codex не должен менять файлы, пушить commits, создавать новый PR или merge.

Пользователь не является кнопкой `продолжить`. Он нужен только для действий, которые assistant физически не может сделать: создать задачу в Codex Cloud, вставить audit-only prompt, передать результат audit, подтвердить merge/approval, выполнить ручной MAX-тест, принять бизнес-решение.

## 3. Обязательный формат любых инструкций для Codex Cloud

Каждый prompt для Codex Cloud обязан явно указать:

```text
Тип: новая задача / follow-up / audit-only
Репозиторий: 9163223-maker/amio-comments-max
PR: номер актуального GitHub PR, если есть
Ветка: точное имя ветки, которую выбрать в Codex Cloud
Base: main или другая база
Что нажимать
Что НЕ нажимать
```

Нельзя давать Codex prompt без явного ответа: это новая задача или follow-up, и какую ветку выбрать.

## 4. Главный рабочий цикл

1. Задача понята.
2. Assistant пытается сам создать ветку/PR.
3. Если не может — даёт одну задачу для Codex Cloud на создание PR с явным указанием типа задачи и ветки.
4. После появления PR assistant сам доводит его до зелёного GitHub Actions.
5. После зелёного CI assistant даёт Codex Cloud audit-only prompt.
6. При PASS — переход к merge stage.
7. При BLOCK — assistant исправляет PR, снова CI, снова audit-only.
8. После merge — live runtime verification.

Не писать пользователю пустые статусы вроде `принял`, `продолжаю`, `проверяю`. Нужен результат, audit prompt или настоящий blocker.

## 5. Production runtime contract

Задача не завершена после CI или merge. После merge обязательно проверить live runtime.

Production start path должен оставаться:

```text
node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js
```

Активный entrypoint:

```text
clean-entrypoint-1.53.10-pr89.js
```

Диагностическая ветка:

```text
runtime-status
```

Главные runtime files:

```text
runtime/startup-log.json
runtime/root-menu-live-parity-trace.json
runtime/manual-ui-walkthrough-trace.json
runtime/ADMINKIT_CURRENT_CONTEXT.md
```

После merge проверять: package start script, active Northflank entrypoint, deployed SHA / githubMainHeadSha, runtimeVersion, sourceMarker, startupPath.ok, contractLiveOk, dataProviders.ok, finalRuntimeReadinessGate.ok, root-menu traces и ручной MAX сценарий.

Если live Northflank стартует старый entrypoint/runtime или startup-log не подтверждает deployed SHA, задача не завершена.

## 6. Каноническое root menu

Канонические верхние разделы: Каналы, Комментарии, Подарки / лид-магниты, Кнопки под постами, Статистика, Push-уведомления, Рекламные ссылки, Опросы, Выделение постов, Редактор постов, Архив постов, Личный кабинет, Настройки.

Источник меню:

```text
features/menu-v3/canonical-menu.js
```

Правило архитектуры: верхние разделы открываются через единый root-section standard. Не чинить отдельный раздел отдельным one-off renderer/fallback, если задача про общий root opening.

## 7. Текущий live факт после PR254

PR254 был смержен в main и deployed. Startup/runtime contract был зелёный: `githubMainHeadSha` указывал на merge commit PR254, startup path был правильный, `contractLiveOk=true`, `finalRuntimeReadinessGate.ok=true`.

Но ручной MAX-тест после PR254 показал: Gifts всё ещё не открываются. Свежий runtime trace от 2026-06-29 показывает:

```text
gifts:home count=16, lastResultKind=response_sent_500
buttons:home response_sent_200
stats:home response_sent_200
archive:home response_sent_200
ad_links:home response_sent_200
main:home response_sent_200
```

Для Gifts trace доказывает: callback доходит до webhook edge, payload корректный, route resolved as `gifts:home`, handler `bot.handleWebhook`, но результат `response_sent_500`. Это не deploy issue и не payload-recognition issue. Это live mismatch и архитектурный провал текущего split path.

## 8. Live wrapper chain

```text
clean-entrypoint-1.53.10-pr89.js
→ clean-bot-campaign-attribution-cc8336.js
→ clean-bot-campaign-links-pr91.js
→ clean-bot-channel-first-post-picker-pr90.js
→ wrapped legacy bot.js
```

PR254 был стабилизирующим шагом: Gifts bridge + local root cleanup. Он не решил основную архитектурную цель: один простой стандарт открытия всех top-level sections.

## 9. Ошибки, которых избегать

Не считать предполагаемый handler production handler без проверки live path. Не чинить только `bot.js`, если live path перехватывает callback раньше. Не делать Gifts-only fallback. Не делегировать все root routes в legacy/wrapped handler. Не ломать stats/buttons/archive/editor ради Gifts. Не смягчать тесты так, чтобы они скрывали реальную проблему. Не считать HTTP 200 визуальным открытием. Не считать зелёный CI production readiness. Не писать diagnostics в main. Не менять start script, entrypoint, runtimeVersion/sourceMarker без отдельного решения.

## 10. PR history по Gifts/root standard

PR241 — gifts root hardening / stats tenant contract.
PR242 — gifts root callback no-screen regression.
PR243 — gifts callback without message delivery / trace.
PR244 — gifts root before dedupe.
PR245 — первый root-section opening contract.
PR246 — live parity / manual walkthrough diagnostics.
PR247 — runtime-status trace для root menu live parity.
PR248 — попытка общего root-section opening standard.
PR249 — recovery PR248; deployed, но Gifts всё ещё не открывались.
PR250 — Codex Cloud task / issue name для clean-wrapper bridge.
PR251 — первый GitHub PR по clean-wrapper bridge; superseded.
PR252 — заменён последующими recovery PR.
PR253 — Codex создал на неправильную старую base branch; closed.
PR254 — merged/deployed, but live Gifts still fails with response_sent_500.
Issue #255 — текущая следующая задача: RootSectionDispatcher v2.

## 11. Текущая следующая задача: Issue #255

Issue #255: `RootSectionDispatcher v2: one live opening path for all top-level sections`.

Цель: реализовать единую живую точку открытия всех верхних разделов, чтобы clean-wrapper, generic root handler, local clean handlers и delivery/state cleanup не жили параллельно.

Нужен `RootSectionDispatcher v2`:

1. Parse callback payload once.
2. Resolve canonical root route once.
3. Reset/isolate competing flow state once.
4. Select section owner/provider once.
5. Render screen through selected provider.
6. Deliver through one common delivery path: ack -> render -> edit/send fallback.
7. Write one trace chain for every top-level section.
8. Return HTTP 200 for handled root callbacks; errors must be captured in trace with reason.

Разные разделы могут иметь разные screen providers, но вход, cleanup, delivery и trace должны быть общими.

## 12. Обязательное покрытие для RootSectionDispatcher v2

Матрица по всем canonical top-level sections:

- route-object payload `{ route: '<route>' }`
- action-object payload `{ action: '<route>' }`
- decoded object payload
- JSON string payload
- supported legacy aliases
- active Gifts wizard before click
- active Buttons wizard before click
- stale screen message IDs before click
- expected provider/owner
- visible render
- keyboard present
- delivery attempted
- full trace chain:
  - callback_received
  - root_resolved or legacy_compatibility_resolved
  - render_started
  - render_resolved
  - delivery_started
  - delivery_resolved or delivery_failed with explicit reason

Production-path clean-wrapper test must prove clean-entrypoint/wrapper callbacks go through RootSectionDispatcher v2, not a parallel Gifts bridge.

## 13. Что делать новому чату

1. Прочитать этот файл.
2. Не спрашивать пользователя `продолжать?`.
3. Ориентироваться на Issue #255, а не продолжать PR254.
4. Если assistant не может сам создать большой PR, дать пользователю новую задачу для Codex Cloud на создание PR от `main` по Issue #255.
5. После появления PR assistant сам ведёт CI/debug/fix до зелёного.
6. После зелёного CI — Codex audit-only.
7. После merge — Northflank/runtime-status/manual MAX verification.

## 14. Краткая формула

Green CI != done. Merge != done. Runtime contract != UX done. UX done только когда live MAX click открывает раздел и trace подтверждает правильный path.

Следующая цель: не ещё один Gifts fix, а RootSectionDispatcher v2 — один live opening path для всех top-level sections.
