'use strict';

// Safety wrapper for v25: some historical store builds export the runtime store as `store.store`,
// some builds expose the state object directly. v25 expects `store.store` for live moderation sync.
const store = require('./store');
if (!store.store) store.store = store;
module.exports = require('./menu-v3-five-sections-v25');
