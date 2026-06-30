# AdminKIT product flow contracts

This document is the human-readable companion to `services/productFlowContractService.js`. The canonical client-visible menu remains `features/menu-v3/canonical-menu.js`; these contracts define whether rendered flows are useful, context-bound, lifecycle-complete, and not dead ends.

Common navigation: deep screens should offer `Назад`, `В начало раздела`, and `Главное меню` when they are meaningful. Root screens always keep `Главное меню` except `main`; `Помощь` is allowed only when it adds non-duplicated guidance. Empty states must explain what is missing and show one next useful action.

## Section contracts

| section | product_goal | root_screen_purpose | required_context | allowed_root_actions | forbidden_root_actions | lifecycle | semantic PASS criteria | semantic BLOCK criteria |
|---|---|---|---|---|---|---|---|---|
| main | Route admins to the one canonical production section list. | Dashboard. | none | All client-visible section titles. | Debug/admin/legacy menu entries. | start → result. | Every visible section is reachable once. | Missing section, duplicate menu source, or technical/debug item. |
| channels | Connect and inspect MAX channels. | Section actions. | none | `Подключить канал`, `Мои каналы`, `Помощь`, `Главное меню`. | Post-scoped actions. | start → select_context → create_or_open → result. | Zero channels explains how to connect; list is scoped to account. | No recovery from empty channels or leaked chat/private records. |
| comments | Configure comments for channel posts. | Context gate plus safe overview. | channel + post | `Автокомментарии`, `Включить к посту`, `Фото`, `Ответы`, `Реакции`, nav. | Current post/entity actions without a selected post. | start → select_context → create_or_open; edit/save partial. | Manual post actions choose channel/post first. | Root implies a selected post/entity or dead-ends on empty posts. |
| gifts / lead-magnets | Create/manage a gift bound to a concrete channel post. | Context gate. | channel + post | `Выбрать пост`, `Все подарки`, `Помощь`, `Главное меню`. | `Текущий подарок`, direct root `Создать подарок`, ambiguous `Список подарков`. | start → select_context → create_or_open → preview → result → disable/delete; content input may be `not_supported_yet`. | Root is context-first; create appears only after post selection; all-gifts scope is explicit. | Current/create/list root action without post/gift context, duplicate picker text, fake success, or empty state with no recovery. |
| buttons | Add/current buttons for a selected post. | Context gate. | channel + post | Choose/add/current button actions only with context, nav. | Root current/delete actions without post. | start → select_context → create_or_open → preview → save → result. | Selected post card owns current/edit/delete. | Root shows current buttons or create flow without post gate. |
| stats | Show honest metrics by account/channel/post/campaign. | Dashboard. | none, channel, or post depending action | `Обзор`, `По каналу`, `По посту`, `Рекламные ссылки`, `Источники`, `Обновить данные`, nav. | Fake metrics or hidden account scope. | start → select_context → result. | Scope is stated before metric display. | Unclear scope or fabricated success metrics. |
| push | Publish push/PWA invitation flows. | Section actions. | external/pwa | `Опубликовать приглашение`, `Как это работает`, `Главное меню`. | Fake subscription success. | start → create_or_open → result. | Explains external/PWA dependency. | Claims delivery/subscription success without runtime proof. |
| ad_links | Create/list scoped advertising links. | Section actions. | none/channel as needed | `Создать ссылку`, `Мои ссылки`, nav. | Disable/current stats on root without selected link. | start → create_or_open → result → disable/delete. | List says account/channel scope. | Ambiguous list or disable action with no selected link. |
| polls | Create/review polls for posts. | Context gate. | channel + post | Root may guide to choose post and results; post card owns create. | Direct root create without post. | start → select_context → create_or_open → result → disable/delete. | No fake poll creation; stop is inside active poll. | Post-scoped create bypasses channel/post gate. |
| highlights | Apply/remove marks on posts. | Context gate. | channel + post | Choose post, nav. | Apply/remove without selected post. | start → select_context → edit → save → result. | Selected post card states current mark. | Root offers apply/remove without context. |
| editor | Edit selected post text safely. | Context gate. | channel + post | `Выбрать пост`, nav. | Save/history without post. | start → select_context → edit → preview → save → result. | Empty posts says how to forward/sync a post. | Edit/save root action without selected post. |
| archive | Browse saved posts and storage limits. | Section actions. | account | `Сохранённые посты`, `Лимиты хранения`, nav. | Restore without selected archived post. | start → create_or_open → result; restore partial. | Empty archive explains when saved posts appear. | Restore/delete root action without selected archived post. |
| account | Show access, tariff, limits, channels and support. | Account panel. | account | `Мой доступ`, `Активировать код`, `Оплата / продление`, `Лимиты и функции`, `Мои каналы`, `Поддержка`, nav. | Fake payment completion. | start → create_or_open → result. | Payment/support limitations are explicit. | Claims paid/renewed state without provider confirmation. |
| settings | Expose safe settings and documents. | Section actions. | none/account | `Очистить чат`, `Privacy / Terms`, nav. | Placeholder toggles counted as ready. | start → create_or_open → result; notification/language partial. | Unsupported settings say unavailable and do not fake saved preferences. | Placeholder-only screen counted as PASS. |

## Per-section state matrix

| section | zero_channels | one_channel | multiple_channels | zero_posts | selected_post_no_entity | selected_post_with_entity |
|---|---|---|---|---|---|---|
| main | Not applicable; main remains a dashboard. | Not applicable. | Not applicable. | Not applicable. | Not applicable. | Not applicable. |
| channels | Show `Подключить канал` and explain bot admin/forwarded-post requirement. | Show the single real channel/card or allow opening it clearly. | Show only real eligible channels, never chats/groups/private dialogs. | Not applicable. | Not applicable. | Not applicable. |
| comments | Show connect-channel recovery before post actions. | May skip or show selected channel clearly before post actions. | Choose channel first. | Explain no saved posts and tell admin to forward/sync a post. | Show comment enable/config actions only after post context. | Show current comment state/settings and safe toggle/edit actions. |
| gifts | Show `Чтобы создать подарок, сначала подключите канал.` plus `Подключить канал`. | May continue directly to post picker with visible channel title. | Choose channel first. | Show `Пока нет сохранённых постов.` once plus forward/sync/recovery actions. | Show `Подарок ещё не создан.` and only then `Создать подарок`. | Show current gift, edit, preview, enable/disable, delete, stats, and post reselection. |
| buttons | Show connect-channel recovery before button actions. | May continue directly to post picker with visible channel title. | Choose channel first. | Explain no saved posts and tell admin to forward/sync a post. | Show add-button action only after post context. | Show current buttons, edit/reorder/delete/preview/save actions. |
| stats | Account overview may still render without channels but must state empty metrics honestly. | Show channel scope before channel metrics. | Choose channel before channel-scoped metrics. | For post stats, explain no saved posts and provide recovery. | Show post stats only after selected post context. | Show available metrics and honest empty values. |
| push | External/PWA flow may use chat/channel picker but must not pretend subscription success. | Show the selected destination and publish invitation action. | Choose destination first. | Not applicable. | Not applicable. | Not applicable. |
| ad_links | Can create/list account-scoped links; if channel is needed, show connect recovery. | Show selected channel/campaign scope before creating scoped link. | Choose channel/campaign scope first when required. | Not applicable. | Not applicable. | Not applicable. |
| polls | Show connect-channel recovery before poll actions. | May continue directly to post picker with visible channel title. | Choose channel first. | Explain no saved posts and tell admin to forward/sync a post. | Show create poll only after post context. | Show current poll/results/stop inside selected-post context. |
| highlights | Show connect-channel recovery before highlight actions. | May continue directly to post picker with visible channel title. | Choose channel first. | Explain no saved posts and tell admin to forward/sync a post. | Show apply/remove only after post context. | Show current mark and safe apply/remove result. |
| editor | Show connect-channel recovery before edit actions. | May continue directly to post picker with visible channel title. | Choose channel first. | Explain no saved posts and tell admin to forward/sync a post. | Show edit action only after selected post context. | Show edit/preview/save/cancel result for selected post. |
| archive | Empty account archive must explain when saved posts appear. | Can filter archive by single channel. | Can filter archive by chosen channel. | If archive has no saved posts, show honest empty state. | Restore/copy only after archived post is selected. | Show restore/copy/delete only inside selected archived post card. |
| account | Account remains available even without channels. | Show account limits and channel count. | Show account limits and channel count/list. | Not applicable. | Not applicable. | Not applicable. |
| settings | Settings remain available even without channels. | Channel-specific settings must name selected channel. | Channel-specific settings choose channel first. | Not applicable. | Not applicable. | Not applicable. |

## Required semantic matrix coverage

The runtime `product-semantic-matrix` must render and record route coverage, not just root labels:

- every client-visible root route;
- for every post-scoped section: `zero_channels`, `multiple_channels`, `zero_posts`, and `selected_post` scenarios;
- for gifts: account-scoped `gifts:all` list scope;
- no root action may require a selected post/entity unless the route is explicitly a context gate;
- placeholders and partial sections must be surfaced as `PARTIAL`, `WARN`, or `BLOCK`, never hidden as a product PASS.

## Gifts lifecycle gate

`Подарки / лид-магниты` root states: zero channels shows `Чтобы создать подарок, сначала подключите канал.` and `Подарок привязывается к посту канала.` with `Подключить канал`; no posts shows `Пока нет сохранённых постов.` and `Сначала перешлите или синхронизируйте пост канала.` with recovery actions. The root cannot show `Текущий подарок`, direct `Создать подарок`, or ambiguous `Список подарков`. If content input is not implemented, the UI must say `not_supported_yet` / `будет доступно позже` and must not set `productReady: true`.
