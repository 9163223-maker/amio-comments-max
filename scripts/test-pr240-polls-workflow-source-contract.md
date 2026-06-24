PR240 source contract note

Automated source contract JS was blocked by write guard. Manual/CI audit should verify:

- v3-menu-actions-adapter.js runtime marker CC6.6.10-V3-MENU-ACTIONS-POLLS-UNIFIED-WORKFLOW
- polls route no longer returns development placeholder
- polls:create opens channel picker or auto-opens post picker for one channel
- polls post picker routes to polls:post, not comments:post
- canonical polls.create targetAction is polls:create
- canonical polls block no longer uses comments_select_post
