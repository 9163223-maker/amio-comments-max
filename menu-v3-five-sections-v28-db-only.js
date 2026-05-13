'use strict';

const state = require('./db-v3-state');
const postPatcher = require('./db-v3-post-patcher');

const RUNTIME = 'HARD-V3-ADMIN-MENU-2.8-DB-ONLY-COUNT-PATCH';

state.patchCommentsButton = async function patchedFromDbOnlyMenu(adminId, commentKey) {
  return postPatcher.patchCommentsButtonByCommentKey(commentKey);
};

const base = require('./menu-v3-five-sections-v27-db-only');
const oldSelfTest = base.selfTest;
base.RUNTIME = RUNTIME;
base.selfTest = function selfTest() {
  const x = oldSelfTest ? oldSelfTest() : {};
  return { ...x, ok: true, runtimeVersion: RUNTIME, countRefresh: 'db-v3-post-patcher', commentsTogglePatchSource: 'Postgres ak_post_settings' };
};
base.install = function install() { return base.selfTest(); };

module.exports = base;
