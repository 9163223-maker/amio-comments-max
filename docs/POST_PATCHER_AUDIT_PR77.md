# PR77 Post Patcher Clean Core Audit

## Goal

Clean `services/postPatcher.js` without adding another wrapper or monkey-patch layer. Preserve the existing product contracts while reducing the slow/stale legacy work on the visible post patch path.

## Contracts to preserve

- Direct channel posts must keep full `originalText` for the comments mini-app.
- Forwarded/channel/media posts must not require `mid`; `messageId` must fall back to `postId/seq`.
- `sourceAttachments` must be preserved and the comments inline keyboard appended, not replace original media.
- `originalLink` and `originalFormat` must be preserved and sent to `editMessage` when present.
- Gifts, custom CTA buttons, poll rows, highlighted posts and comment-open-state must remain wired through the canonical patcher.
- Repatch coalescing and debug trace hooks must stay additive.

## Current debt removed/reduced

### 1. Live hydration was too eager

Old behavior treated empty attachments/link/format as missing and called MAX `getMessage` for ordinary text posts. This caused slow `patch.compute.enrich_live.end` even when the store snapshot already had the full text.

PR77 adds `shouldHydrateOriginalFromLive()` and snapshot-known flags. Live hydration is only allowed when the original snapshot is truly unknown, not merely because a text post has no attachments or link preview.

### 2. DB sync blocked visible patch

Old behavior performed Postgres/archive sync before `editMessage` during bootstrap and during compute. This delayed the comment button/counter even though MAX `editMessage` was fast.

PR77 keeps immediate store snapshot saves but schedules Postgres/archive sync asynchronously for `bootstrap` and `after_edit`. The visible path reaches `editMessage` first.

### 3. Poll rows were always queried

Old behavior queried poll rows on every patch even when no poll existed. PR77 adds a guarded poll lookup and short-lived empty cache so repeated comment-counter repatches can skip poll DB checks when no poll marker exists.

### 4. Fingerprint did not include link/format

Old fingerprint used only text and attachments. PR77 includes `originalLink`, `originalFormat`, `commentsDisabled`, and row counts so hyperlink/format changes are not silently skipped as already patched.

## Why this is not PR76

PR76 added a separate `postPatcherFast76.js` layer and monkey-patched `postPatcher` exports. That reintroduced layered complexity and caused initialization-order risks. PR77 changes the canonical `services/postPatcher.js` path directly instead.

## Expected live markers after deploy

- `patch.compute.enrich_live.end` should usually show `status: skipped_snapshot_ready` and reason `snapshot_ready_no_live_getMessage`.
- `patch.compute.db_sync.end` should show `status: deferred` with reason `async_after_edit`.
- `patch.db_sync_async.end` should appear after visible edit succeeds.
- `patch.compute.poll_rows.end` may show `skipped/no_poll_marker_cached_empty` on repeated repatch for posts without polls.
- `patch.edit_api.end` should remain the visible MAX edit operation.

## Manual checks

1. Direct text post: comments button appears; full text remains inside comments mini-app.
2. Post with hyperlink/format: link and formatting survive after patch/repatch.
3. Forwarded/channel post without `mid` but with `postId/seq`: not skipped; fallback messageId is used.
4. Media/photo post: original media remains and inline keyboard is appended.
5. Comment counter repatch: no live `getMessage` for snapshot-ready post; counter appears faster.
6. Gift + custom button post: gift and CTA rows remain after repatch.
7. Poll post: poll rows remain when poll marker/cache exists.
