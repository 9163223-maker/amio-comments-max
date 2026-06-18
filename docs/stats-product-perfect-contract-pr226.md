# PR226 — Growth, Sources and Funnel Stats Contract

## Final menu tree

📊 Статистика

1. 📈 Рост
2. 🎯 Источники
3. 🧭 Воронка
4. 📝 Контент
5. 📤 Отчёт и качество данных
6. 🏠 Главное меню

## Removed duplicates

Buttons, gifts, comments, moderation, referral links, manual costs, and funnel-specific internals are not standalone duplicated stats roots. Comments are content engagement, CTA/button clicks are conversion actions, gifts are lead-magnet actions, and costs are source metrics.

## Metric classes

- **Exact:** `/r/:slug` tracking clicks, AdminKIT callback actions, `user_added`/`user_removed` events seen by the bot, and gifts claimed through AdminKIT.
- **Probable:** click then join inside the 24-hour attribution window when only defensible session/link correlation is available.
- **Snapshot:** MAX `Message.stat` counters such as views, forwards, shares, and reactions when returned by the API.
- **Unavailable:** who viewed a post, who shared a post, all reposts outside bot visibility, reach, every organic join source, and automatic ad spend without manual input or a real integration.

## MAX Message.stat snapshot policy

`detectMaxPostStatCapabilities(context)` resolves safe tenant/channel/post context, reads a MAX Message `stat` object or adapter stat, sanitizes the raw stat, detects available counters, stores a `post_stat_snapshot` stats event, and returns an unavailable status instead of breaking the stats UI when token/message/stat data is absent.

## Unsupported metrics policy

Unsupported metrics are not rendered as zero. If post views are missing, the content screen says: “Просмотры недоступны через текущий MAX API для этого поста.” Shares/forwards are hidden from the main content screen unless a capability snapshot confirms those counters.

## Attribution model

The default attribution window is 24 hours. A tracked click followed by `member_joined` for the same user creates `member_join_attributed`. Joins without a tracked click are counted as unattributed and shown as “Без метки”. If MAX does not provide enough identity/session evidence, the metric is unavailable unless a defensible probable correlation exists.

## Event model

Persistent stats events are normalized through `stats_events` with event id, type, tenant, owner, channel, post/message/comment key, user, UTM fields, link id, attribution id, confidence, timestamp, sanitized payload, and created time. Supported events include tracking link creation/click, member joined/left, attributed join, comments, CTA clicks, gift requests/claims, observed forwards, post stat snapshots, and manual cost mutations.

## User-facing examples

Growth shows joined, left, net, attributed, and “Без метки”. Sources show clicks, attributed joins, CTA, gifts, comments, and manual costs; when costs are absent it says “Расходы не внесены”. Funnel shows `tracking click → joined → action` with exact/probable/unattributed separation.

## Known limitations

Current MAX updates do not provide explicit post-viewed or post-shared webhook events, so view/share counters are snapshot metrics only when available from Message.stat. Automatic ad spend is not claimed without manual costs or an integration.

## Future work

Add configurable attribution windows, CSV streaming export, real MAX live probe wiring where bot token/channel/message are available, and external ad platform integrations only when credentials and API support exist.

## Follow-up audit fixes

The follow-up audit found that the first PR226 pass was too service-scaffold oriented. This update fixes the P1 blockers by proving product flows, not just helper functions:

- Period selectors now change actual event windows through `periodBounds()` and `eventInPeriod()`.
- Source, campaign, medium, content, term, link, channel, post, message, commentKey, and user filters are applied inside `loadStatsEvents()`.
- Tracking link creation from the real campaign UI writes `tracking_link_created`, reads it back, and only shows “Ссылка создана и подключена к статистике.” after verification.
- Manual costs have a real UI flow: source/campaign input, amount validation, canonical write, read-back verification, display in Sources, and delete read-back.
- `admin_stats_post` is a real selected-post handler with picker/recovery states and same-post dataset filtering.
- MAX `Message.stat` probing now has an adapter layer: local raw stat, injected adapter, or MAX `/messages` fetch when token and message id are available; errors return unavailable/max_api_error without breaking stats.
- Old duplicate stats actions are rerouted to PR226 funnel/content/recovery screens.

## Period filtering contract

Supported periods are `today`, `7d`, `30d`, and `all`. `today` uses UTC day start consistently. Invalid timestamps are ignored safely; future timestamps do not break the dataset.

## Source/campaign/link filtering contract

Filters apply to `source`, `campaign`, `medium`, `content`, `term`, `linkId`, `channelId`, `postId`, `messageId`, `commentKey`, and `userId`. In unfiltered growth, unattributed joins remain visible as “Без метки”. In source/campaign/link filtered views, unrelated unattributed joins are not counted as source conversions.

## Tracking link create canonical flow

The real UI flow is:

`admin_stats_campaign_create → channel/external target → campaign name → source → adCampaigns.createCampaign → createTrackingLink → verifyTrackingLinkCreated → success screen`.

If stats write/read-back cannot be verified, the UI must warn that the link was created but stats are not confirmed.

## Manual cost UX contract

The Sources screen contains “Расходы вручную”. The flow stores `statsManualCostFlow`, asks for `source / campaign`, asks for amount, defaults currency to RUB, writes `manual_cost_added`, reads the cost back, and only then shows success. CPA appears only when manual cost and attributed joins/actions exist.

## Post stats contract

`admin_stats_post` resolves tenant/channel/post/commentKey context, loads `loadStatsDataset()` for the same selected post, hides raw technical ids in normal UI, and renders comments, CTA clicks, gifts, observed forwards, views if available, and share/forward counters only when the snapshot capability confirms them. Missing context shows a picker; stale data shows “Пост не найден или данные устарели. Выберите пост заново.”

## Message.stat probe policy

`fetchMaxMessageStat(context, adapter)` first accepts local raw/adapted stats for tests and local adapters. If a bot token and message id are present, it calls MAX `/messages?message_ids=...`. If token/message id is missing or MAX returns an error, stats screens continue and the quality report marks the metric unavailable.

## Event producer wiring map

- Tracking click producer: `/r/:slug` redirect records `tracking_link_clicked` through `recordStatsTrackingClick()`.
- User added/removed producer: audience update adapters call `recordAudienceUpdate()` and persist `member_joined` / `member_left`.
- CTA click producer: `recordCtaClick()` is the canonical adapter for AdminKIT button/CTA click paths.
- Gift requested/claimed producer: `recordGiftRequested()` / `recordGiftClaimed()` are canonical adapters for gift request and delivery/claim paths.
- Comment created producer: `recordCommentCreated()` is the canonical adapter for comment creation paths.

## Debug log policy

`/debug/admin-action-log-live` remains debug-only and rolling. Statistics screens and exports read from the persistent `stats_events` dataset, never from the debug log.

## Merge-readiness fixes after review

- Export sanitization is recursive. Nested `growth`, `sources`, `funnel`, `content`, `postStats`, and `dataQuality` objects remain structured JSON; secret-like keys (`token`, `authorization`, `cookie`, `secret`, `stack`) are removed at every depth.
- Message.stat snapshots are scoped. A snapshot is not applied to the generic Content screen unless a selected `postId`, `commentKey`, or `messageId` exists; matching also respects tenant/owner/channel/post/comment context.
- Producer proof covers real paths: `/r/:slug` redirect, audience update adapters, clean button callbacks, gift claim callbacks, and real comment creation through `commentService.createComment()`.
