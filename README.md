Version 14.9.0 full replacement

Version 14.6.12 stable

# AMIO Comments MAX V13

## ENV

- `BOT_TOKEN`
- `APP_BASE_URL`
- `BOT_USERNAME` (optional)
- `WEBHOOK_PATH` (optional, default `/webhook/max`)
- `WEBHOOK_SECRET` (optional, but recommended)

## What it does

- registers webhook on startup
- accepts forwarded channel posts in bot dialog
- stores post mapping in `data/store.json`
- tries to edit original channel post and add `Комментарии` button
- serves mini app and comment API

## Useful routes

- `/health`
- `/debug/store`
- `/debug/setup`
- `/mini-app`
- `/fallback`


V14.2 notes:
- `BOT_USERNAME`, `MAX_BOT_USERNAME`, `BOT_NAME`, `MAX_BOT_NAME` and `MAX_DEEP_LINK_BASE` are supported for MAX deep links.
- Check `/debug/config` after deploy to see which deep link base is active.


## V14.5.0
- Полная сборка на базе V14.2
- Исправлено сохранение media из message.body.attachments
- Исправлен патч постов: исходные media attachments сохраняются при добавлении кнопки
- Исправлен mini app: верхний пост умеет отображать изображения


## V14.9.0
- Full replacement archive based on the previous full repository structure.
- Fixed wrong-thread opening: comments button now launches Mini App with exact `commentKey`, `channelId`, and `postId`.
- Fixed "post not found" / "last post opened" bugs by removing latest-post fallback from Mini App loading.
- `open_app` button now prefers the direct Mini App URL instead of a bot deep link that carried only post id.
- Start payload can carry exact `commentKey` (`ck:channelId:postId`) for safer recovery inside Mini App.


V14.9.2: uses MAX bot deep link for open_app and exact commentKey in startapp without latest-post fallback.


## 14.9.5-handoff-token-post-resolve

This build keeps the stable 14.9.2 patch flow but switches the button to a MAX deep-link handoff token. The token is MAX-safe and resolves the exact post on the server.


## 14.11.0
- Добавлен модуль базовой и AI-модерации комментариев.
- Добавлена страница управления: /moderation?channelId=...
- Сохранён gift-модуль и gift API.
- В mini app добаван вывод причины блокировки комментария.


### Модерация
Страница управления: `/moderation?channelId=ID_КАНАЛА`
Если включён `GIFT_ADMIN_TOKEN` или `ADMIN_TOKEN`, откройте: `/moderation?channelId=ID_КАНАЛА&adminToken=ВАШ_ТОКЕН`


## 14.12.0
- Добавлен analytics dashboard `/dashboard`
- Добавлены tracked buttons и click-статистика
- Добавлен опрос в mini app и голосование
- Добавлены white-label / agency mode настройки
- Добавлен более явный free lead magnet в комментариях и под постом


## 14.15.1
- Admin UX refresh: main menu with buttons, recent-post picker, target-first gift creation
- Gift wizard no longer asks for chat_id or postId
- Fixed gift delivery fallback and direct in-channel callback delivery when a direct gift URL is available
- Fixed [object Object] in gift wizard

## 14.15.0
- Post Editor Pro: безопасное редактирование текста поста без потери комментариев/кнопок
- История версий и rollback
- Moderation Queue: approve/reject queued items
- Dashboard alerts для patch/moderation/edit window


## 14.15.3
- Fixed callback handler for admin and gift buttons.
- Added sectioned admin menu shown on start.
- Gift flow defaults to direct delivery inside MAX when possible.
- Added section navigation with a persistent main menu button.
