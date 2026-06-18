# PR225 Gifts canonical transition audit

## Previous risks

Before PR225, gifts could render from `setup.giftFlow`, `giftsCurrentCard`, or campaign lookup fallbacks without one proven canonical contract. This left yellow risks: a cancel/root callback could lose target context; channelId+postId fallback could masquerade as final truth; and a successful save message could appear before a canonical read-back and MAX patch proof.

## Canonical context

PR225 adds `resolveGiftContext(ctx, payload)` in `gifts-flow-cc812-bottom.js`. The resolver derives tenant/owner/user, channel, post, commentKey, post title/channel title, optional gift/campaign id, and selected post target. Draft/card state is fallback input only; the resolved context is tenant → channel → post/commentKey → gift feature state.

## Loading gift state

`loadGiftFeatureState(context)` reads in this order:

1. canonical gift state stamped for exact tenant/channel/post/commentKey;
2. post-bound/campaign state with exact commentKey;
3. migration fallback by channelId + postId;
4. empty.

Any fallback import is stamped into canonical state and reports `source`, `imported`, `sourceDiagnostics`, and `keyMatchOk`. After delete, the post-level `giftLegacyReimportBlocked` / `deletedGiftCanonicalKey` tombstone is checked before importing from `campaign_commentKey`, `migration_channel_post`, or legacy/current fallback sources; diagnostics include `legacy_reimport_blocked_by_delete_tombstone` when the tombstone blocks resurrection.

## Save / replace / delete contract

`commitGiftFeatureState(context, nextGiftState, options)` is now the only PR225 canonical write pipeline for save, replace, and delete. It performs canonical write, canonical read-back through `loadGiftFeatureState`, key/content/status verification, and only then calls MAX post patching through the canonical read-back path.

If write/read-back/key/content verification fails, PR225 does not patch MAX and renders: “Подарок не сохранён. Повторите действие.” with gifts root, choose another post, and main menu navigation. If MAX patch fails after canonical commit, canonical state remains saved and the screen reports: “Подарок сохранён, но пост не обновился: …”.

## Target loss policy

PR225 adds explicit helpers: `clearGiftDraftOnly`, `bindGiftTarget`, `getGiftTarget`, and `clearGiftTargetOnlyOnExplicitReset`. Cancel clears only the draft. Gifts root/current reuses a valid selected post. Target reset is limited to explicit reset.

## Trace policy

Gift actions are written through `admin-action-log-live` with `feature: "gifts"`, `screenId`, `canonicalKey`, resolved gift source/import diagnostics, commit verification fields, patch attempt/result, and contract violation flag. Sanitization avoids raw token/secret/cookie values.

## Anti-resurrection policy

PR225 uses a delete tombstone for Gifts, not only Buttons. Once a canonical gift is deleted for a tenant/channel/post/commentKey, stale matching legacy or migration campaigns are not imported again for that key. GIFT-035 covers a second matching stale source after delete, and GIFT-036 confirms fresh import still works when no tombstone exists.

## Known remaining limitations

The MAX post patcher still depends on live bot/channel availability. A patch failure after canonical commit is surfaced as partial success, but the saved canonical gift remains the source of truth for subsequent screens.
