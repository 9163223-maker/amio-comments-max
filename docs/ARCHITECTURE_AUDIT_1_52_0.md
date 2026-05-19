# АдминКИТ — Architecture Audit 1.52.0 / CLEAN CORE PLAN

Дата: 2026-05-19
Статус: подготовительный аудит перед ручной проверкой MAX

## 1. Решение

До новой ручной проверки в MAX проект нельзя развивать как цепочку версионных loader-надстроек. Следующий технический этап — не новая feature-сборка, а архитектурная стабилизация:

- зафиксировать текущую рабочую базу как функциональный baseline;
- описать фактическую цепочку запуска;
- отделить рабочее ядро от временных safety/debug/stress-надстроек;
- подготовить чистый entrypoint без каскада `require(loader -> loader -> loader)`;
- сохранить все прошедшие разделы 1.41–1.48;
- оставить только лёгкую production-safe диагностику;
- не возвращать тяжёлые stress/debug/export маршруты в production.

## 2. Текущий baseline

Текущая рабочая production-safe база после отката тяжёлого debug/export слоя:

- display base: `CC7.5.34`;
- текущий production-checklist layer: `1.51.1`;
- package entrypoint: `adminkit-one-loader-cc75342.js`;
- debug-lite route layer: `debug-lite-route-layer.js`;
- canonical public base URL: `https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run`.

Важно: в домене историческая опечатка `commnets`, а не `comments`. Это рабочий canonical URL Northflank.

## 3. Главная архитектурная проблема

Сейчас запуск устроен как каскад исторических loader-файлов:

```text
package.json
  -> adminkit-one-loader-cc75342.js
    -> adminkit-one-loader-cc7534.js
      -> adminkit-one-loader-cc7533.js
        -> adminkit-one-loader-cc7532.js
          -> adminkit-one-loader-cc7531.js
            -> adminkit-one-loader-cc7530.js
              -> ... предыдущие слои
```

Это больше не должно считаться production-архитектурой. Такой подход был удобен для быстрых emergency-патчей, но теперь он мешает:

- трудно понять, где фактический источник истины;
- версии перезаписываются несколько раз;
- часть слоёв существует только ради исторической совместимости;
- debug и production-логика смешаны;
- риск CPU/зависаний выше из-за накопленных надстроек;
- ручная проверка MAX становится недостоверной, потому что непонятно, какой слой реально отвечает за поведение.

## 4. Что считается рабочим ядром

Функционально пройденные и сохраняемые разделы:

- `1.41 comments` — комментарии;
- `1.42 moderation` — модерация;
- `1.43 stats` — статистика;
- `1.44 post editor + archive` — редактирование постов и архив;
- `1.45 post highlights` — выделение постов;
- `1.46 polls` — опросы / голосовалки;
- `1.47 channel connection` — подключение канала;
- `1.48 navigation v3` — меню и навигация V3.

Текущие стабилизационные слои:

- `1.49` — emergency CPU rollback;
- `1.50` — debug-lite;
- `1.51` — segmented production checklist.

Эти стабилизационные слои полезны по смыслу, но должны быть превращены из monkeypatch-loader надстроек в нормальные модули.

## 5. Что нужно убрать из production-пути

Не удалять сразу из репозитория без отдельного diff, но вывести из runtime-пути:

- каскадные `adminkit-one-loader-cc75xx.js`, которые только прокидывают запуск дальше;
- stress-test entrypoints, которые генерируют большой JSON;
- тяжёлые debug endpoints, читающие store/DB/MAX/GitHub;
- временные route-layer monkeypatch через `Module._load`;
- дублирующиеся принудительные установки `process.env.BUILD_VERSION`, `RUNTIME_VERSION`, `BUILD_SOURCE_MARKER` в нескольких слоях.

## 6. Что нужно сохранить

Сохранить обязательно:

- рабочую бизнес-логику прошедших разделов 1.41–1.48;
- правильный canonical URL с `commnets`;
- лёгкие маршруты `/healthz`, `/version`, `/debug/lite/*`, `/debug/prod/*`;
- запрет тяжёлых endpoints в production;
- запрет видео/файлов в комментариях;
- фото в комментариях как разрешённый тип вложений;
- только native inline hints;
- запрет overlay/float hints;
- принцип one active screen / one active flow / cleanup pipeline.

## 7. Целевая архитектура после чистки

Целевой запуск:

```text
package.json
  -> server.js или app.js
    -> createApp()
    -> registerCoreRoutes(app)
    -> registerMaxWebhook(app)
    -> registerAdminKitFeatures(app)
    -> registerDebugLiteRoutes(app)
    -> startServer()
```

Диагностика должна подключаться явно:

```js
const { registerDebugLiteRoutes } = require('./src/diagnostics/debug-lite');
registerDebugLiteRoutes(app, { safe: true });
```

Запрещено в чистой версии:

```js
Module._load = ...
require('./previous-loader')
```

## 8. План работ

### 1.52.0 — Audit only

- создать этот audit-файл;
- зафиксировать проблему loader-chain;
- не менять runtime-поведение;
- не запускать ручной MAX smoke-test.

### 1.52.1 — Clean-core scaffold

- добавить новый чистый entrypoint;
- не удалять старые loader-файлы;
- подключить старое ядро через один контролируемый мост, если без этого нельзя;
- вынести debug-lite в явный модуль;
- сохранить `/healthz`, `/version`, `/debug/prod/*`;
- heavy endpoints должны возвращать короткий guarded JSON.

### 1.52.2 — Loader-chain removal from runtime

- переключить `package.json` на чистый entrypoint;
- убрать каскадный runtime путь;
- проверить, что версия одна и не перезаписывается в нескольких местах;
- проверить CPU на 0.1 vCPU.

### 1.52.3 — Manual smoke preparation

- подготовить короткий список ручных проверок;
- не использовать большой stress-test;
- проверять только segmented endpoints;
- после стабильности перейти к ручной проверке MAX.

## 9. Ручная проверка после архитектурной чистки

Проверять только после 1.52.2/1.52.3:

1. `/healthz` — быстро открывается;
2. `/version` — версия совпадает;
3. `/debug/prod/overview` — production-check доступен;
4. `/debug/prod/runtime` — CPU-safe, без DB/MAX/GitHub;
5. `/debug/prod/features` — список разделов 1.41–1.48 сохранён;
6. `/debug/prod/checklist` — финальный короткий checklist;
7. главная страница не зависает после открытия debug routes;
8. CPU не прыгает к 100% от одного debug endpoint.

## 10. Запреты на следующий этап

До завершения CLEAN CORE нельзя:

- добавлять новые features;
- возвращать большой `/debug/core-stress`;
- возвращать `/debug/store-live` как полный snapshot;
- делать SVG-перерисовку логотипа вместо реальной оптимизации raster-изображения;
- смешивать посадочную, debug, webhook и MAX-логику в одном loader-слое;
- запускать ручной MAX smoke-test как финальный, пока runtime всё ещё идёт через каскад loader-файлов.

## 11. Итог

Текущий проект функционально продвинулся до production-checklist lite, но архитектурно требует чистки. Следующий корректный шаг — не новая функциональность, а `1.52.1 CLEAN-CORE-SCAFFOLD` с явным entrypoint и без дальнейшего наращивания loader-слоёв.
