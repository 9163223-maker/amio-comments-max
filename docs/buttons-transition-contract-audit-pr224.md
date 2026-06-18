# PR224 Buttons transition-contract audit

## 1. What PR223 proved

PR223 proved the canonical happy path: when `buttonSet` already contains button records for the selected post, the selected-post screen, edit action, delete confirmation, save, and tenant isolation paths behave correctly for BTN-001 through BTN-050.

## 2. What PR223 failed to prove

PR223 did not prove the transition contract between a rendered selected-post action and the next callback handler. The tests called edit/delete after seeding canonical state, so they did not verify that the exact rendered `✏️ Изменить кнопку` or `🗑 Удалить кнопку` payload resolves the same post and the same button source in the following request.

## 3. Why manual live BTN-025 failed despite green CI

The live selected post was resolved, but the edit handler loaded an empty canonical button set. CI stayed green because it only exercised `canonical buttonSet has B1`; it did not exercise `canonical empty but legacy/imported/patched state has B1` or `UI rendered edit but next handler sees B0`.

## 4. Which source was missing from button state loading

The missing source was legacy/imported/post-bound button state outside the canonical `growth.byChannel[channelId].buttonSets[commentKey]` bucket. Existing post metadata, legacy current-card/imported buttons, and previously patched button metadata were not reconciled before edit/delete.

## 5. How PR224 prevents this class of error

PR224 adds `reconcileButtonsFeatureState(context)` and makes the selected-post renderer and callback handlers use it. Source order is canonical button set, post feature buttons, legacy current-card buttons, legacy imported buttons, patched post buttons, then empty. If canonical is empty and a legacy source has buttons, PR224 imports that source into canonical storage before rendering or handling the transition. Empty resolved posts now show a recovery screen instead of misleading “Кнопка для изменения не найдена.” or “Кнопка для удаления не найдена.” messages.

## 6. Which gaps remain

The action trace is in-memory and intentionally rolling, so it does not survive process restarts. Exporting it through runtime-status or persistent diagnostics can be added later. The reconciliation helper recognizes the known legacy field shapes in this repository; unknown third-party shapes would still require a targeted adapter once identified in live diagnostics.
