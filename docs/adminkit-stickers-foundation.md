# AdminKit Sticker Pack v1 — foundation spec

Runtime target for the future implementation: `CC8.2.0-ADMINKIT-STICKERS-COMMENTS`.

This document is a safe preparation for a later PR after PR50 is merged and manually checked. It must not be merged into the active PR50 gifts/buttons tenant work.

## Goal

Add lightweight branded AdminKit whale stickers to the comments mini-app, visually similar to Telegram stickers, but implemented as a controlled in-app sticker pack.

The first pack is the prepared AdminKit whale set:

1. `adminkit_angry` — angry / determined whale.
2. `adminkit_ok` — thumbs-up whale.
3. `adminkit_party` — celebration / confetti whale.
4. `adminkit_sad` — sad / crying whale.
5. `adminkit_surprise` — surprise / exclamation whale.
6. `adminkit_idea` — thinking / lightbulb whale.
7. `adminkit_love` — hearts / affection whale.
8. `adminkit_playful` — playful / splash whale.

## Important product boundary

This is not a return of arbitrary video/file comments.

Allowed:
- text comments;
- photo comments according to the current product plan;
- reactions and replies;
- predefined static AdminKit stickers from a server-side allowlist.

Not allowed in this feature:
- user-uploaded sticker files;
- arbitrary external image URLs;
- video stickers;
- file attachments inside comments;
- tenant A seeing or using tenant B custom packs.

## Implementation model

Native MAX stickers are not assumed. The mini-app renders sticker messages itself.

A sticker comment should be stored as a lightweight message record:

```json
{
  "type": "sticker",
  "packId": "adminkit_whales_v1",
  "stickerId": "adminkit_ok",
  "tenantKey": "tenant:user:123",
  "channelId": "...",
  "postId": "...",
  "commentKey": "...",
  "authorUserId": "123",
  "createdAt": 1770000000000,
  "runtimeVersion": "CC8.2.0-ADMINKIT-STICKERS-COMMENTS"
}
```

The DB/store must not save full image payloads for sticker comments. It saves only `packId` + `stickerId` and normal comment ownership metadata.

## Asset storage

Recommended static asset path:

```text
public/stickers/adminkit/v1/
  angry.webp
  ok.webp
  party.webp
  sad.webp
  surprise.webp
  idea.webp
  love.webp
  playful.webp
  manifest.json
```

Preferred export:
- WebP with transparency, 512x512 master;
- optional PNG fallback with transparency;
- thumbnail around 128x128 for the picker if needed;
- each file ideally under 100–150 KB;
- no checkerboard baked into the image;
- white sticker outline can remain part of the artwork.

## Manifest

The manifest is the allowlist. UI and backend should only accept IDs present in this manifest.

Current draft manifest path:

```text
public/stickers/adminkit/v1/manifest.json
```

Every sticker entry should include:
- `id`;
- `title`;
- `emoji`;
- `file`;
- `alt`;
- `tags`.

## Future UI wiring

The comments mini-app input bar gets a small sticker button near the text input.

Flow:
1. User opens comments.
2. User taps sticker button.
3. Bottom inline panel opens with a grid of the 8 whale stickers.
4. User taps a sticker.
5. Client sends a sticker comment create request with `packId` and `stickerId`.
6. Server validates tenant, post, comment thread and sticker ID.
7. Comment list renders a sticker bubble, not an image upload attachment.

Rendering rule:
- own sticker comments follow the current own-message alignment;
- other-user sticker comments follow left alignment with avatar/name as currently designed;
- replies to sticker comments should show a small sticker preview or `Стикер` label.

## Tenant and tariff rules

Foundation pack can be global, but usage must still be tenant-aware:
- comment record must include `tenantKey` and `authorUserId`;
- server must validate that the comment target post belongs to the current tenant/channel context;
- future custom sticker packs must be scoped by tenant;
- Free plan can expose a small subset, paid plan can expose the full pack.

Suggested tariff flags:

```js
ADMINKIT_STICKERS_ENABLED=1
ADMINKIT_STICKERS_PACKS=adminkit_whales_v1
ADMINKIT_STICKERS_FREE_LIMIT=4
```

## Backend checks for future PR

The future PR must add:
- `services/stickerPackService.js` validation usage in the comment-create path;
- a debug/audit flag: `stickersFoundation:true`;
- no writes to legacy gift/button flows;
- no MAX overlay hints;
- no file upload path for sticker comments;
- tenant ownership validation before saving the sticker comment.

## Manual test plan for future PR

1. Open `/version`; expect the future runtime `CC8.2.0-ADMINKIT-STICKERS-COMMENTS`.
2. Open `/debug/menu/audit?t=820`; expect `stickersFoundation:true` and `stickersEnabled:true` when env is on.
3. Open comments for a post.
4. Tap sticker icon.
5. Pick `adminkit_ok`.
6. Sticker appears in the thread without opening file upload.
7. Refresh comments; sticker remains.
8. Reply to the sticker; reply preview is readable.
9. Try a fake `stickerId`; server rejects it.
10. Try stale/out-of-tenant post target; server rejects it.
11. Confirm photo comments still work and video/files are not added back.

## Non-goals for v1

- Animated stickers.
- User-uploaded sticker packs.
- Native MAX sticker API integration.
- Cross-tenant shared custom sticker marketplaces.
- Delivery of stickers into channel posts themselves.

## Suggested future PR name

`PR51: AdminKit branded stickers foundation for comments`
