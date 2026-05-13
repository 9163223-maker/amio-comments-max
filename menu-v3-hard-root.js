'use strict';

// HARD V3 current root.
// Five working sections: channels, comments, gifts, buttons, moderation.
// V26: deduplicated post picker + real per-post comments toggle.
// Preserved boundaries: Telegram-style comments UI remains intact, Postgres/store remain connected.
module.exports = require('./menu-v3-five-sections-v26');
