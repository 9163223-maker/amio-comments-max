'use strict';

// Clean V3 menu bridge.
// This file is intentionally thin: the menu tree, titles, ordering, sessions and movement log
// live in clean-v3-menu-core-db.js and PostgreSQL tables ak_menu_nodes_v3 / ak_menu_events_v3.
// Comments/OpenApp launch logic is not handled here and must remain separate.

module.exports = require('./clean-v3-menu-core-db');
