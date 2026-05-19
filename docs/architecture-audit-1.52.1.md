# АдминКИТ — архитектурный аудит 1.52.1

Цель этапа: перед ручной production-проверкой зафиксировать, где в проекте накопились временные надстройки, и начать чистку без риска для рабочего runtime.

## Текущее безопасное состояние

- Рабочая база остаётся на стабильной ветке CC7.5.34 / 1.51.1 Production Checklist Lite.
- Тяжёлые debug/stress endpoints должны оставаться закрытыми на 0.1 vCPU.
- Диагностика должна быть только segmented lite / constant-time.
- Домен должен оставаться canonical: `https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run` — именно `commnets`.
- Видео и файлы в комментариях не возвращаются. В комментариях остаются текст, фото, ответы, реакции.
- Подсказки только native inline. Overlay/float hints запрещены.

## Главный архитектурный долг

В проекте накопилась цепочка loader-файлов вида:

- `adminkit-one-loader-cc75342.js`
- `adminkit-one-loader-cc7534.js`
- `adminkit-one-loader-cc7533.js`
- `adminkit-one-loader-cc7532.js`
- `adminkit-one-loader-cc7531.js`
- далее старые loader-слои

Каждый верхний loader в основном делает одно и то же:

1. выставляет `BUILD_VERSION`, `RUNTIME_VERSION`, `BUILD_SOURCE_MARKER`;
2. нормализует `ADMINKIT_PUBLIC_BASE_URL`;
3. требует предыдущий loader;
4. ещё раз выставляет версию.

Это помогало быстро спасать рабочую сборку, но как финальная архитектура это плохо: версия размазывается по нескольким файлам, сложнее понять реальный entrypoint и выше риск stale build-info.

## Что нельзя делать резко

Нельзя одним коммитом удалить старые loader-файлы или сразу заменить entrypoint, потому что именно через эту цепочку сейчас поднимается рабочий сервер и уже проверенные разделы 1.41–1.48.

## Безопасный план чистки

### Шаг 1 — выполнено в 1.52.1

Добавлен `src/core/clean-core-scaffold-1.52.1.js`.

Он metadata-only и ничего не ломает:

- не стартует сервер;
- не импортирует старую loader-цепочку;
- не ставит `Module._load`;
- не читает DB/store/MAX/GitHub;
- не запускает stress-test;
- фиксирует правила будущего clean core.

### Шаг 2 — следующий безопасный шаг

Сделать `clean entrypoint` рядом со старым runtime, но не переключать production start автоматически.

Нужный принцип:

- старый entrypoint остаётся рабочим fallback;
- новый entrypoint сначала только диагностируется;
- переключение `package.json main/start` делать только после ручного подтверждения.

### Шаг 3 — после ручной проверки

Постепенно переносить функциональные деревья в нормальные модули:

- comments;
- moderation;
- stats;
- post editor/archive;
- post highlights;
- polls;
- channel connection;
- navigation v3;
- debug lite / production checklist.

## Что считать мусорными надстройками

- Loader-файлы, которые только прокидывают версию и require предыдущего loader.
- Старые heavy debug endpoints, которые могут читать store/DB/GitHub/MAX и подвешивать 0.1 vCPU.
- Временные emergency CPU rollback файлы, если они не используются как fallback.
- Дублирующие build-info/runtime маркеры, которые противоречат env-first runtime.
- Overlay/float hint-логика, если она где-то осталась.
- Любые заготовки под видео/файлы в комментариях, если они не нужны текущему плану.

## Что нельзя удалять до отдельной проверки

- Текущий production loader `adminkit-one-loader-cc75342.js`.
- Нижние loader-слои, пока не подтвержден новый clean entrypoint.
- Debug Lite route layer.
- Production Checklist Lite routes.
- Данные/миграции каналов, постов, комментариев, подарков, кнопок и статистики.

## Критерий готовности к ручной production-проверке

Проект можно отправлять в ручную проверку только когда:

- `/healthz` отвечает быстро;
- `/version` показывает ожидаемый runtime;
- `/debug/lite` отвечает быстро;
- `/debug/prod/overview`, `/runtime`, `/env`, `/features`, `/checklist` отвечают быстро;
- heavy endpoints не выполняются, а возвращают guard;
- CPU не уходит в 90–100% от простого открытия debug;
- приложение в MAX открывает меню и основные разделы без зависания.
