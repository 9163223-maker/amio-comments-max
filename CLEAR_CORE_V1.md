# АдминКИТ clear-core-v1

Новая ветка для переписывания ядра АдминКИТ без legacy-слоёв.

## Цель

Сделать production-ready ядро на Postgres/Northflank без цепочки `server-sp* -> media-core*.txt -> bootstrap` и без monkey-patching.

## Стартовая архитектура

- `server.js` — единственная точка входа.
- `src/app.js` — Express app shell.
- `src/config.js` — env/config loader.
- `src/db/` — Postgres adapter + schema.
- `src/routes/comments.js` — API комментариев.
- `src/routes/admin.js` — API админки, включая модерацию `channel/post`.
- `src/routes/public.js` — стартовые публичные страницы `/` и `/app`.
- `src/bot/webhook.js` — чистая точка входа webhook, пока без legacy callback-router.

## Что запрещено переносить из legacy

- `server-sp*.js` как runtime entrypoint.
- `media-core*.txt` как JS-код.
- `sp37-bootstrap.js` как часть production chain.
- `Module._load` monkey-patch.
- `fs.readFileSync` monkey-patch для переписывания frontend на лету.
- `data/store.json` как основное хранилище.
- смешивание всех callback/menu flows в одном огромном `bot.js`.

## Что можно переносить аккуратно

- MAX API adapter из `services/maxApi.js`.
- бизнес-логику comments/reactions из `services/commentService.js`, но с Postgres repository.
- moderation rules из `services/moderationService.js`, но со scope `channel/post`.
- keyboard/CTA builder из `services/keyboardBuilderService.js`.
- post patching из `services/postPatcher.js`, но как единственный patcher.

## Первый MVP clear-core-v1

1. Подключение канала.
2. Сохранение поста в Postgres.
3. Комментарии под постом.
4. CTA/кнопки под постом.
5. Модерация с выбором области: весь канал или конкретный пост.
6. Debug endpoints без кэша.
7. Минимальная миграция/импорт из legacy store при необходимости.

## Текущее состояние ветки

Каркас создан. `npm start` запускает `server.js`, а не legacy цепочку.

Проверка:

```bash
GET /healthz
GET /debug/clear-core-v1
```
