# PR224 Buttons transition-contract audit

## 1. What PR223 proved

PR223 proved an ideal canonical edit/delete path: when the canonical `buttonSet` already had a button, synthetic edit/delete screens could operate on it. It did not prove save/read-back/transition behavior after real add/edit/delete mutations.

## 2. What PR223 failed to prove

PR223 failed to prove that a rendered selected-post action is executable by the next callback handler with the exact rendered payload. It also failed to prove that save/edit/delete writes canonical storage, reads back through the same resolver edit/delete use, verifies the key/count/content, and only then patches MAX.

## 3. Why manual live BTN-025 failed despite green CI

The live post/channel context was resolved and the edit handler ran, but the handler loaded zero buttons. CI stayed green because it seeded canonical state directly and did not exercise legacy/imported/patched sources, selected-screen-to-handler payload transitions, or canonical read-after-write verification.

## 4. Which source was missing from button state loading

The missing sources were post-bound feature state, legacy current-card/imported buttons, and previously patched post metadata outside `growth.byChannel[channelId].buttonSets[commentKey]`.

## 5. What PR224 now proves

PR224 now proves that rendered edit/delete actions are executable, legacy state can be imported into canonical storage, and add/edit/delete commits are read-back verified before success. The mutation contract is: canonical write, canonical read-back through the same resolver path, canonical key/count/content verification, MAX patch from `commitResult.readBackButtons`, and selected-post rendering from the same read-back buttons. The live action trace records the chain including resolved context, commit verification, patch result, and any contract violation.

## 6. Contract violation versus normal empty state

A real B0 empty state means canonical storage is empty, no legacy source exists, and the server has not just shown or claimed a button. If a button was visible in MAX or in a rendered server action but is absent from canonical and all server legacy sources, that is BV: `expected_button_missing_after_save_or_transition`, not normal behavior.

## 7. Recovery screen policy

The recovery/error screen protects the user after a contract violation or a genuine empty state. It is not a replacement for canonical persistence; user-facing success is only allowed after `commitButtonsFeatureState(...).ok === true`.

## 8. Remaining limitation

The live trace is still an in-memory rolling buffer, so it does not survive process restarts. Unknown third-party legacy button shapes may still need a targeted importer once a trace identifies them.
