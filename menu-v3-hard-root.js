'use strict';

// HARD V3 current root.
// Five working sections: channels, comments, gifts, buttons, moderation.
// Client-friendly output: no raw channel/post IDs in normal menu screens.
// Preserved boundaries: no patcher changes, no Telegram-style comments UI changes, Postgres/store remain connected.
module.exports = require('./menu-v3-five-sections-v23');
