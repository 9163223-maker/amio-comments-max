# АдминКИТ Clean Core 8.0.0 — audit/reset plan

Версия-цель: `CC8.0.0-CLEAN-CONTROLLED-BASE`.

Текущий `main` после `CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE` считаем диагностической веткой, а не стабильной продуктовой базой. Эта ветка содержит полезные достижения, но также содержит цепочку hotfix-слоёв, которые нельзя дальше наращивать без аудита.

## 1. Правило остановки hotfix-цепочки

Не создаём новые PR для точечного лечения media/caption patch, webhook routing, Telegram-style UI или postPatcher до завершения clean audit.

Запрещено в audit PR:

- менять JS-код;
- менять UI комментариев;
- менять `services/postPatcher.js`;
- менять меню V3;
- менять подарки, CTA, реакции;
- добавлять новые debug-trace endpoints.

Разрешено:

- добавить этот документ;
- зафиксировать карту функций;
- зафиксировать стратегию Postgres/tenant/tariff/archive;
- подготовить план следующего PR.

## 2. Что сохраняем как продуктовые достижения

### 2.1 Меню V3

Сохраняем:

- one active screen;
- one active flow;
- cleanup pipeline;
- главное меню;
- разделы: Каналы, Посты, Комментарии, Подарки, Кнопки/CTA, Опросы, Модерация, Статистика, Архив, Личный кабинет, Помощь;
- отсутствие overlay/float-подсказок;
- fresh menu после `/start` и после очистки истории;
- back/root navigation.

### 2.2 Каналы

Сохраняем и переносим в Postgres:

- подключение MAX-канала;
- определение канала по пересланному посту;
- список каналов пользователя;
- readable channel title вместо показа голого ID;
- проверка прав бота;
- связь `owner_user_id -> channel_id`.

### 2.3 Посты

Сохраняем:

- `commentKey`;
- `stablePayload`;
- `handoffToken`;
- `channelId`;
- `postId`;
- `messageId`, если MAX его отдаёт;
- связь поста с комментариями;
- совместимость со старыми пропатченными постами;
- включение/выключение комментариев под конкретным постом;
- редактирование текста поста с сохранением медиа/кнопок.

Важно: media/caption patch не лечим вслепую. Сначала чистая архитектура маршрутизации и хранения.

### 2.4 Комментарии

Сохраняем:

- текстовые комментарии;
- фото в комментариях, только фото;
- реакции;
- ответы;
- Telegram-style направление UI;
- счётчик комментариев;
- optimistic insert;
- сохранение comment thread по `commentKey`.

Не переносим:

- видео в комментариях;
- файлы в комментариях;
- тяжёлый base64/debug мусор;
- хаотичные trace-слои как архитектуру.

### 2.5 Подарки / лид-магниты

Сохраняем:

- подарок за подписку;
- привязка подарка к посту;
- выдача в личные сообщения;
- проверка подписки;
- один подарок на один пост;
- замена подарка;
- удаление подарка;
- очистка промежуточных сообщений.

### 2.6 CTA-кнопки

Сохраняем:

- добавление пользовательской кнопки;
- редактирование;
- удаление;
- хранение row/button index;
- совместимость с кнопкой комментариев;
- единый keyboard builder.

### 2.7 Опросы

Переносим как согласованный раздел:

- создание опроса;
- варианты ответа;
- голос пользователя;
- защита от повторного голоса;
- результаты;
- восстановление из архива.

### 2.8 Модерация

Переносим:

- базовую модерацию;
- стоп-слова;
- блокировку ссылок;
- блокировку приглашений;
- будущий AI-слой как отдельный модуль.

### 2.9 Статистика

Переносим:

- статистику канала;
- статистику поста;
- комментарии;
- реакции;
- ответы;
- подарки;
- CTA-клики;
- голоса в опросах;
- подписчики;
- динамику 1/7/14/30 дней;
- снимки аудитории.

### 2.10 Debug/export

Сохраняем только чистый debug:

- `/debug/version`;
- `/version/debug`;
- `/debug/build`;
- `/debug/ping`;
- `/debug/store-lite`;
- ограниченный `/debug/store-live`;
- `/debug/export`;
- GitHub export `debug/latest.json` и `debug/latest-lite.json`;
- no-cache headers;
- единые `runtimeVersion`, `sourceMarker`, `buildVersion`, `activeEntrypoint`, `generatedAt`.

## 3. Новые обязательные разделы Clean Core 8.0.0

### 3.1 Личный кабинет пользователя

Добавляем раздел `Личный кабинет`.

Функции:

- текущий тариф;
- статус тарифа;
- срок действия;
- доступные функции;
- лимиты;
- подключённые каналы;
- использование комментариев;
- использование архива;
- реферальная ссылка;
- количество приглашённых;
- бонусы;
- история оплат;
- смена тарифа;
- поддержка.

### 3.2 Тарифы и доступы

Каждая функция должна проверять доступ через permission layer.

Базовые тарифы:

- `free`;
- `start`;
- `pro`;
- `business`;
- `agency`.

Feature codes:

- `comments_enabled`;
- `photo_comments_enabled`;
- `reactions_enabled`;
- `replies_enabled`;
- `gift_enabled`;
- `cta_buttons_enabled`;
- `polls_enabled`;
- `archive_enabled`;
- `advanced_stats_enabled`;
- `moderation_enabled`;
- `max_channels_count`;
- `posts_archive_limit`;
- `comments_per_month`.

### 3.3 Реферальная система

Функции:

- уникальный `referral_code`;
- реферальная ссылка;
- приглашённые пользователи;
- статус: `registered`, `activated`, `paid`;
- бонусы за приглашения.

### 3.4 Архив и восстановление

Добавляем раздел `Архив`.

Функции:

- архив постов;
- архив веток комментариев;
- архив подарков;
- архив CTA-кнопок;
- архив опросов;
- snapshot перед опасным действием;
- восстановление записи в АдминКИТ;
- восстановление comment thread;
- восстановление CTA/gift/poll;
- фильтр по каналу, дате, типу.

Важно различать:

- восстановление записи в АдминКИТ;
- восстановление физического поста в MAX, если API это позволяет.

## 4. Postgres как источник истины

Clean Core 8.0.0 строится вокруг Postgres.

In-memory/store допускается только как:

- cache;
- runtime state;
- короткий debug trace;
- временный compatibility layer.

Источник истины:

```text
Postgres
```

Каждая пользовательская сущность должна иметь:

```text
owner_user_id
tenant_id
```

## 5. Базовая схема таблиц

Минимальный набор таблиц для Clean Core:

- `ak_users`;
- `ak_tariffs`;
- `ak_feature_access`;
- `ak_subscriptions`;
- `ak_referrals`;
- `ak_channels`;
- `ak_posts`;
- `ak_comments`;
- `ak_comment_reactions`;
- `ak_post_buttons`;
- `ak_gift_campaigns`;
- `ak_gift_claims`;
- `ak_polls`;
- `ak_poll_votes`;
- `ak_archive_items`;
- `ak_audit_log`;
- `ak_debug_snapshots`.

## 6. Tenant model

На MVP этапе используем одну физическую Postgres DB и логическую изоляцию:

```text
tenant_id / owner_user_id
```

Позже можно расширить до:

- отдельных схем для enterprise;
- отдельных БД для крупных клиентов;
- sharding по tenant_id.

## 7. Permission layer

Любая функция должна отвечать на вопросы:

1. Кто пользователь?
2. Какой tenant?
3. Какой тариф?
4. Есть ли доступ к функции?
5. К каким данным пользователь имеет доступ?
6. Где это сохранено в Postgres?

Базовые функции ядра:

```text
getCurrentUser()
getTenant()
canUseFeature(userId, featureCode)
assertFeatureAccess(userId, featureCode)
```

## 8. Файлы, которые нужно аудировать

Обязательный audit list:

- `bot.js`;
- `index.js`;
- `services/postPatcher.js`;
- `services/commentService.js`;
- `services/maxApi.js`;
- `store.js`;
- `cc5-db-core.js`;
- `public/app-onepass.js`;
- `public/app.js`;
- `mini-app.html`;
- `buildInfo.js`;
- `build-info.json`;
- `package.json`.

Для каждого файла в следующем PR нужно указать:

1. назначение;
2. полезные функции;
3. что сохранить;
4. что временное/диагностическое;
5. что опасно трогать;
6. как перенести в clean module.

## 9. Целевая структура модулей

```text
/src
  /core
    auth.js
    permissions.js
    tenants.js
    runtime.js

  /db
    postgres.js
    migrations.js

  /modules
    /users
    /tariffs
    /channels
    /posts
    /comments
    /attachments
    /reactions
    /gifts
    /buttons
    /polls
    /moderation
    /stats
    /archive
    /referrals
    /debug

  /max
    maxApi.js
    webhookRouter.js
    messageMapper.js

  /ui
    adminMenu.js
    keyboards.js
    flows.js

/public
  app.js
  app-onepass.js
  mini-app.html
```

## 10. Этапы работ

### Этап 1 — Audit only

Создать документацию и карту загрязнений. Не менять JS-код.

### Этап 2 — Database foundation

Добавить migrations Postgres для users/tariffs/channels/posts/comments/archive/referrals/audit.

### Этап 3 — User/tariff/permission core

Добавить ядро `users`, `tenants`, `tariffs`, `permissions`.

### Этап 4 — Menu V3 binding

Подключить меню к user/tenant/tariff context.

### Этап 5 — Channels/posts Postgres migration

Перевести каналы и посты на Postgres как источник истины, сохранив compatibility layer.

### Этап 6 — Comments module

Перенести текст, фото, реакции, ответы.

### Этап 7 — Gifts/CTA/Polls

Отдельные модули, отдельные PR.

### Этап 8 — Archive

Snapshot/restore перед опасными действиями.

### Этап 9 — Личный кабинет

Тарифы, лимиты, рефералы, история.

### Этап 10 — Clean debug/export

Ограниченный debug и GitHub export без мусора.

## 11. Rollback strategy

Перед изменением JS-кода фиксируем контрольную точку:

```text
main @ CC7.5.64-DIRECT-MEDIA-POST-PATCH-TRACE
commit: a93afcedcebcb19fb6df5bcd9669a03c79dfd850
```

Если Clean Core ветка ломает текущий продукт, откатываемся к этой точке и не продолжаем hotfix-chain.

## 12. Правила PR после этого документа

- Один PR = один слой.
- Нельзя смешивать UI, DB, post patch и debug в одном PR.
- Любой новый feature должен иметь Postgres-привязку.
- Любой пользовательский feature должен иметь тарифную проверку.
- Любая опасная операция должна писать snapshot в архив.
- Debug не должен становиться продуктовой логикой.

## 13. Definition of Done для CC8.0.0

Clean Core 8.0.0 считается готовым, когда:

- есть пользовательская модель;
- есть tenant/owner привязка;
- есть тарифы и permission layer;
- ключевые данные пишутся в Postgres;
- меню V3 работает через user context;
- каналы, посты, комментарии, подарки, CTA, архив, личный кабинет имеют свои модули;
- старые commentKey/stablePayload/handoff не потеряны;
- debug чистый и ограниченный;
- есть понятный rollback checkpoint.
