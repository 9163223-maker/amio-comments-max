# АдминКИТ — актуальный контекст после PR247 / задача PR248

Дата фиксации контекста: 2026-06-27
Репозиторий: `9163223-maker/amio-comments-max`
Production URL: `https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run`
Diagnostic branch: `runtime-status`

## 0. Главное правило

Не возвращаться к контексту PR237/PR240/PR235 как к текущему состоянию проекта. Они важны как история и регрессии, но текущая точка — после merge PR247 и работа PR248.

Нельзя делать Gifts-only fix. `Подарки / лид-магниты` должны открываться через один общий root-section opening contract, тот же самый, что и `Комментарии`, `Кнопки`, `Статистика`, `Опросы`, `Каналы`, `Настройки` и остальные верхние разделы.

## 1. Текущее состояние после PR247

PR247 смержен. Его цель — добавить durable runtime-status traces для реального ручного MAX пути:

```text
webhook_edge_received → callback_received → root_resolved/v3_resolved → render_started → render_resolved → delivery_started → delivery_resolved/delivery_failed → handler_returned
```

PR247 добавил диагностические файлы в ветку `runtime-status`:

- `runtime/root-menu-live-parity-trace.json`
- `runtime/manual-ui-walkthrough-trace.json`

Startup-log расположен здесь:

- `runtime/startup-log.json` в ветке `runtime-status`

## 2. Текущий live blocker

В реальном MAX все видимые top-level разделы открываются, кроме:

- `Подарки / лид-магниты` (`gifts:home`)

Известные live trace факты после PR247:

- `gifts:home` доходит до `webhook_edge_received`.
- `payloadShape` равен `object`.
- resolver — `payload.route`.
- `resolvedRootRoute` — `gifts:home`.
- `handler_returned` показывает `response_sent_200` / `handed_to_bot`.
- Но экран Gifts не становится видимым в MAX.
- Старого trace недостаточно: не всегда надежно видны internal render/delivery этапы.
- `trace_export_*` и 409/conflict noise не должны вытеснять реальные UI events из bounded traces.
- Runtime identity нужно сверять с реальным deployed/main SHA, а не с diagnostic/runtime-status commit.

## 3. PR248 — следующий шаг

PR248: `Finish unified root-section opening standard + fix Gifts through generic contract`.

Цель PR248:

- завершить единый root-section opening standard;
- доказать render и delivery, а не только webhook 200;
- исправить Gifts только через общий contract;
- de-noise trace export;
- уточнить runtime identity, чтобы startup-log и traces различали application main/deployed SHA и diagnostic export SHA.

## 4. Canonical top-level root menu

Все эти root routes должны открываться через один generic contract:

1. `channels:home` — Каналы
2. `comments:home` — Комментарии
3. `gifts:home` — Подарки / лид-магниты
4. `buttons:home` — Кнопки под постами
5. `stats:home` — Статистика
6. `push:home` — Уведомления / Push-уведомления
7. `ad_links:home` — Рекламные ссылки
8. `polls:home` — Опросы / голосования
9. `highlights:home` — Выделение постов
10. `editor:home` — Редактор постов
11. `archive:home` — Архив постов
12. `account:home` — Личный кабинет / доступ
13. `settings:home` — Настройки
14. `main:home` — Главное меню

Generic contract:

```text
callback payload
→ callback parser
→ canonical root route resolver
→ root-section contract
→ renderer
→ delivery/edit/send/fallback
→ visible MAX screen
→ trace records exact result
```

## 5. PR248 safety rules

Do not:

- change `package.json` start script;
- change production entrypoint or Northflank startup path;
- add invasive startup probes;
- delay server binding with production-route probes;
- mutate env/store/modules during startup diagnostics;
- change canonical top-level labels unless required by existing Product Perfect contract;
- regress PR240 polls workflow;
- regress PR245 root-section contract;
- regress PR247 redaction;
- expose raw user/chat/message/callback/channel/post IDs, secrets, or tokens in traces/UI;
- add a Gifts-specific route, alias, handler, fallback, product shortcut, or separate opening mechanism.

## 6. Post-deploy manual verification

After merge and Northflank redeploy, first inspect:

- `runtime-status/runtime/startup-log.json`
- `runtime-status/runtime/root-menu-live-parity-trace.json`
- `runtime-status/runtime/manual-ui-walkthrough-trace.json`

Then in real MAX click:

- Главное меню
- Каналы
- Комментарии
- Кнопки под постами
- Подарки / лид-магниты
- Статистика
- Опросы / голосования
- Рекламные ссылки

Ready only if:

- startup-log is fresh;
- startup-log identifies the actual deployed/main application SHA;
- `finalRuntimeReadinessGate.ok = true`;
- `readyForManualMaxTest = true`;
- Gifts visibly opens in MAX;
- neighboring sections still open;
- trace shows the full callback → resolver → render → delivery → result chain;
- no stale runtime / old entrypoint / runtime-status SHA confusion remains.
