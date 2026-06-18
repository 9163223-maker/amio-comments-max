# PR225 Buttons post-PR224 cleanup audit

PR224 fixed the main transition contract. PR225 removes the remaining yellow risk: trace pre-resolution no longer imports legacy buttons or mutates selected button state.

## Read-only pre-resolve

`screenForPayload` now calls `resolveSelectedButtonsContextReadOnly(ctx, payload)` for trace pre-context. The read-only helper resolves tenant/channel/post/commentKey and reads the canonical button set, but does not import legacy state, write canonical, bind target, or mutate current card.

## Handler-owned reconciliation

The mutating `resolveSelectedButtonsContext(ctx, payload)` remains available only to real handlers. It delegates target binding and `reconcileButtonsFeatureState` to the handler path. Selection/current/edit/delete/save handlers therefore own legacy import and canonical reconciliation.

## PR225 tests

* BTN-065 proves pre-trace resolve is read-only with legacy buttons present and canonical empty.
* BTN-066 proves the selected-post handler imports legacy state, records `imported=true`, and renders an executable edit payload.
* BTN-067 proves pre-resolve alone cannot make the flow green; the actual handler must import and render the next screen.

The PR regression workflow now runs `node --check scripts/test-buttons-readonly-pretrace-pr225.js` and `node scripts/test-buttons-readonly-pretrace-pr225.js`, so BTN-065…BTN-067 are enforced in CI before `npm test` and `git diff --check`.
