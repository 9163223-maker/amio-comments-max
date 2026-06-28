# АдминКИТ — текущий контекст и рабочие правила

Updated: 2026-06-28 06:43 UTC
Branch: runtime-status
Repo: 9163223-maker/amio-comments-max

## 1. Смысл проекта

АдминКИТ — система управления для MAX: бот, web/PWA и админские функции для владельцев каналов. Цель — удобная админка для MAX, похожая по простоте на Telegram-подход, но с собственными MAX UX-флоу.

Зоны продукта: каналы, комментарии под постами, кнопки под постами, подарки / лид-магниты, статистика, рекламные ссылки и кампании, push/PWA, опросы, выделение, редактор, архив, личный кабинет, настройки.

Пользовательский идеал: владелец канала нажимает раздел, видит понятный экран, выбирает пост/канал, настраивает функцию и может вернуться назад без пустых экранов, зависших flow и технического мусора.

## 2. Роли и ответственность

### Assistant / ChatGPT

Assistant — основной технический исполнитель. Он должен сам вести задачу максимально далеко: создать или найти PR, читать diff, читать GitHub Actions, разбирать красные jobs/logs, править PR-ветку, снова проверять CI и повторять цикл до зелёного статуса.

Если PR уже создан, Codex Cloud больше не является основным доработчиком. После появления PR assistant сам доводит ветку до зелёного GitHub Actions, если это технически возможно.

Assistant обращается к пользователю только при реальном ограничении: нужно действие в Codex Cloud UI, merge/approval, бизнес-решение или ручной MAX-тест.

### GitHub / GitHub Actions

GitHub — источник PR, diff, review comments и состояния merge. GitHub Actions — обязательный автоматический gate перед audit. Красный CI означает: assistant сам читает лог, исправляет и повторяет. Зелёный CI означает только готовность к audit, не production ready.

### Codex Cloud

Codex Cloud используется в двух режимах.

1. Создание PR: если assistant не может сам безопасно создать PR или задача слишком большая для прямого редактирования, assistant даёт пользователю одну задачу для Codex Cloud. Пользователь создаёт PR через Codex Cloud. После этого assistant сам ведёт PR до зелёного CI.

2. Audit only: после зелёного CI assistant даёт пользователю audit-only задачу. В audit-only Codex не должен менять файлы, пушить commits, создавать новый PR или merge. Он возвращает PASS или BLOCK. При BLOCK assistant сам исправляет PR, снова гонит CI до зелёного и снова даёт audit-only.

### Пользователь

Пользователь не является кнопкой `продолжить`. Он нужен только для действий, которые assistant физически не может сделать: создать задачу в Codex Cloud, вставить audit-only prompt, передать результат audit, подтвердить merge/approval, выполнить ручной MAX-тест, принять бизнес-решение.

## 3. Главный рабочий цикл

1. Задача понята.
2. Assistant пытается сам создать ветку/PR.
3. Если не может — даёт одну задачу для Codex Cloud на создание PR.
4. После появления PR assistant сам доводит его до зелёного GitHub Actions.
5. После зелёного CI assistant даёт Codex Cloud audit-only prompt.
6. При PASS — переход к merge stage.
7. При BLOCK — assistant исправляет PR, снова CI, снова audit-only.
8. После merge — live runtime verification.

Не писать пользователю пустые статусы вроде `принял`, `продолжаю`, `проверяю`. Нужен результат, audit prompt или настоящий blocker.

## 4. Production runtime contract

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

## 5. Каноническое root menu

Канонические верхние разделы: Каналы, Комментарии, Подарки / лид-магниты, Кнопки под постами, Статистика, Push-уведомления, Рекламные ссылки, Опросы, Выделение постов, Редактор постов, Архив постов, Личный кабинет, Настройки.

Источник меню:

```text
features/menu-v3/canonical-menu.js
```

Правило архитектуры: верхние разделы открываются через единый root-section standard. Не чинить отдельный раздел отдельным one-off renderer/fallback, если задача про общий root opening.

## 6. Текущая большая тема: Gifts root opening

Проблема: раздел `Подарки / лид-магниты` не открывался визуально в live MAX.

После PR249 установлено: `gifts:home` доходит до webhook edge, payload корректный, HTTP 200 возвращается, но экран не появляется. Значит проблема была не в payload и не в webhook edge. Live production path идёт через clean-wrapper chain, а не напрямую через тот участок `bot.js`, который раньше чинили.

Live wrapper chain:

```text
clean-entrypoint-1.53.10-pr89.js
→ clean-bot-campaign-attribution-cc8336.js
→ clean-bot-campaign-links-pr91.js
→ clean-bot-channel-first-post-picker-pr90.js
→ wrapped legacy bot.js
```

Правильная цель: `gifts:home`, `admin_section_gifts`, `gift_admin_open_menu` должны попадать в shared root-section path; stats/buttons/archive/editor/posts остаются на local clean handlers; decoded object payload сохраняется; trace показывает цепочку открытия.

## 7. Ошибки, которых избегать

Не считать предполагаемый handler production handler без проверки live path. Не чинить только `bot.js`, если live path перехватывает callback раньше. Не делать Gifts-only fallback. Не делегировать все root routes в legacy/wrapped handler. Не ломать stats/buttons/archive/editor ради Gifts. Не смягчать тесты так, чтобы они скрывали реальную проблему. Не считать HTTP 200 визуальным открытием. Не считать зелёный CI production readiness. Не писать diagnostics в main. Не менять start script, entrypoint, runtimeVersion/sourceMarker без отдельного решения.

## 8. PR history по Gifts/root standard

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
PR252 — текущий актуальный PR.

## 9. Текущий актуальный PR

```text
PR252
Title: Refine root-section bridging: route Gifts to legacy wrapper and tighten buttons/stats handling
Branch: codex/github-mention-pr250-bridge-clean-wrapper-root-callbacks-t
Base: main
Head: 96ebcadd058e69b37f5672d3be2dce2a0e4d29dd
State: draft, mergeable, CI green
GitHub Actions: PR regression tests run #417 — success
```

Changed files: `clean-bot-channel-first-post-picker-pr90.js`, `scripts/test-pr250-clean-wrapper-root-bridge.js`, `scripts/test-product-perfect-gifts-journey-pr142.js`, `scripts/smoke-test.js`.

CI зелёный, но это только готовность к Codex audit-only, не merge-safe само по себе.

## 10. Обязательные audit checks для PR252

Codex Cloud audit-only должен проверить: Gifts root идёт через shared root-section path; bridge eligibility узкий; stats/buttons/archive/editor/posts остаются local clean-owned; decoded object payload support сохранён; PR250 bridge regression включён в smoke/CI; смягчение gifts journey test не скрывает регрессию; stale gift/comment flow state при переходе из Gifts wizard в Stats/Buttons/Archive/Editor сбрасывается или audit должен BLOCK; не изменены start script, entrypoint, runtimeVersion/sourceMarker, canonical labels, diagnostic write targets.

Ожидаемый audit result:

```text
PASS — merge-safe
```

или

```text
BLOCK — with concrete files, line-level reasons, and required fixes
```

## 11. Что делать новому чату

1. Прочитать этот файл и текущий PR252.
2. Не спрашивать пользователя `продолжать?`.
3. Если пользователь принёс Codex audit PASS — проверить PR state, CI, changed files и готовить merge stage.
4. Если audit BLOCK — исправить PR252 самостоятельно, прогнать GitHub Actions до зелёного, затем дать новый audit-only prompt.
5. После merge проверить Northflank deploy и runtime-status.
6. После runtime ready попросить пользователя вручную открыть `Подарки / лид-магниты` в MAX.
7. Проверить trace: webhook reached, root resolved, render/delivery chain, no stale runtime.

## 12. Краткая формула

Assistant сначала делает всё возможное в GitHub сам. Если не может создать PR — пользователь создаёт задачу в Codex Cloud для создания PR. После появления PR assistant сам отвечает за CI/debug/fix до зелёного. Codex Cloud после этого — только audit-only. Пользователь нужен для Codex UI, merge/approval, бизнес-решений и ручного MAX-теста. Green CI != done. Merge != done. Live runtime verified + manual MAX scenario = done.
