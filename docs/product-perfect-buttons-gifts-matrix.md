# Product Perfect Buttons/Gifts Matrix — PR223

Runtime marker: `CC8.3.63-PR223-PRODUCT-PERFECT-MATRIX-AUDITOR`.
Source marker: `adminkit-pr223-product-perfect-matrix-auditor`.

## Canonical rule

Selected post identity is canonical and must be resolved as `admin/tenant/user → channel → post → post feature state → buttons/gifts → operation`. Draft/flow state stores only temporary input and never owns the selected post, channel title, current button list, or current gift state.

## Buttons matrix

States: P0 no post, P1 valid post, P2 stale/deleted, P3 old callback, P4 tenant mismatch. Button states: B0 none, B1 one, B2 two or more.

| ID | Condition/action | Expected result |
| --- | --- | --- |
| BTN-001 | P0 enter buttons | Shows “Кнопки под постами”, asks to choose a post, no direct add, has choose post/main menu. |
| BTN-002 | P1+B0 root | Selected post, channel/post title, “Текущие кнопки: пока нет кнопок”, add/choose/root/main. |
| BTN-003 | P1+B1 root | Shows one current button and add another/edit/delete/choose/root/main. |
| BTN-004 | P1+B2 root | Shows all current buttons and add another/edit/delete/choose/root/main. |
| BTN-005 | P0 choose channel | Shows only posts from selected channel with correct channel title. |
| BTN-006 | P0 select B0 post | Shows selected-post empty button state. |
| BTN-007 | P0 select B1 post | Shows selected-post with one button. |
| BTN-008 | P0 select B2 post | Shows selected-post with all buttons. |
| BTN-009 | Legacy show_current | Renders same canonical selected-post screen. |
| BTN-010 | P2 any selected action | Says “Пост не найден. Выберите пост заново.” and offers choose/root/main. |
| BTN-011..024 | Add/cancel/save | Add draft preserves canonical selected post; URL validates; save appends idempotently; cancel clears draft only. |
| BTN-025..035 | Edit | Single button opens edit actions; multi-button asks which; stale single-button callback safely uses only button; edits mutate canonical state; cancel preserves old button. |
| BTN-036..042 | Delete | Single button opens confirmation; multi-button asks which; stale single-button callback safely uses only button; confirm removes only selected button. |
| BTN-043..050 | Patch/error/navigation | Patch diagnostics are shown, tenant mismatch rejected, stale cards ignored without fake empty state, root/cancel/main behave canonically, help/reopen are safe. |

## Gifts matrix audit

Gifts are audited as GIFT-001..GIFT-025. PR223 does **not** claim full gifts canonical migration. Current audit result is `fullyCanonical: false`; selected post and gift state need the same single authoritative context layer as buttons before non-audit pass can be claimed for every scenario.
