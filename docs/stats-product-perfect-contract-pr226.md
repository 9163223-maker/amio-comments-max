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
