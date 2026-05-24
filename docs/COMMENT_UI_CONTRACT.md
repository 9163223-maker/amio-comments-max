# Comment UI stability contract

This document protects the current AdminKit comments UI from accidental regressions while performance work continues.

## Non-negotiable rules

1. The default `/api/adminkit/comment-open-state` response must remain the legacy full payload unless an explicit opt-in flag is passed.
2. `skeleton=1`, `skeleton_first=1`, or `skeletonFirst=1` may enable the fast skeleton response, but skeleton mode must never become the default silently.
3. The legacy `runtimeVersion` emitted in the comment-open-state JSON payload must remain stable unless a deliberate migration PR updates all consumers.
4. The skeleton response must include a `hydrateUrl` pointing back to the same endpoint without any skeleton flag, so the full legacy payload remains available.
5. Performance PRs must be additive and reversible: instrumentation, optional fast paths, cache/coalescing, or guarded opt-in modes before replacing existing UI behavior.
6. Gifts, CTA/buttons, gift gatekeeper, and pending gift claim flows must not be modified by comment performance PRs unless explicitly scoped.

## Required smoke coverage

The smoke test must protect at least these contracts:

- comment-open-state module loads;
- `resolvePost` and `buildMeta` remain exported;
- `RUNTIME` remains the current legacy payload runtime;
- skeleton mode is opt-in only;
- `hydrateUrl` preserves identifiers and strips skeleton flags;
- skeleton payload keeps `meta`, `post`, `comments`, `commentsCount`, `count`, and `safe` keys;
- gift condition input screens keep scoped keyboards and do not reactivate stale menus.

## Rollout principle

Do not replace the working comment UI in one large PR. First add measurement, then opt-in fast paths, then connect a guarded consumer with fallback, then remove old paths only after measured stability.
