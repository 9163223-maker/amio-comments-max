# PR71: Comment client id plan

Goal: allow intentional repeated text comments while keeping safe retry handling.

Current PR70 behavior:
- Different text values send quickly.
- The same text value waits while the previous request for that text is still pending.

Desired behavior:
- Different text values send quickly.
- The same text value may be sent intentionally as separate comments.
- A repeated network retry for the same send attempt should return the already-created comment instead of creating another stored item.

Contract:
- Keep the default mini-app path direct: app.js loads app-onepass.js.
- Do not add wrappers.
- Keep photo sends conservative.
- Do not touch gifts, CTA/buttons, gift gatekeeper, comment-open-state, or skeleton opt-in behavior.
- Add a per-send clientCommentId from the client to /api/comments.
- Store clientCommentId on comments.
- If /api/comments receives an already stored clientCommentId for the same commentKey, return the stored comment and do not schedule another counter patch.
