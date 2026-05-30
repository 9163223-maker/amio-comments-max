'use strict';

const walkthroughTrace = require('./admin-walkthrough-trace');

const RUNTIME = 'CC8.3.1-POST-KEYBOARD-WALKTHROUGH-TRACE';

function countButtons(builder = {}) {
  const rows = Array.isArray(builder?.rows) ? builder.rows : [];
  return rows.reduce((sum, row) => sum + (Array.isArray(row?.buttons) ? row.buttons.length : 0), 0);
}

function install() {
  const servicePath = require.resolve('./services/postEditorService');
  const service = require(servicePath);
  if (!service || service.__adminkitPostEditorWalkthroughTrace) {
    return { ok: true, already: true, runtimeVersion: RUNTIME };
  }

  const originalSavePostKeyboard = service.savePostKeyboard;
  if (typeof originalSavePostKeyboard !== 'function') {
    return { ok: false, runtimeVersion: RUNTIME, reason: 'savePostKeyboard_missing' };
  }

  service.savePostKeyboard = async function tracedSavePostKeyboard(args = {}) {
    const startedAt = Date.now();
    const builder = args?.builder || {};
    walkthroughTrace.log('post_keyboard.save_start', {
      commentKey: args?.commentKey || '',
      actorId: args?.actorId || '',
      rowsCount: Array.isArray(builder?.rows) ? builder.rows.length : 0,
      buttonsCount: countButtons(builder)
    });
    try {
      const result = await originalSavePostKeyboard.apply(this, arguments);
      const post = result?.post || {};
      walkthroughTrace.log('post_keyboard.save_result', {
        commentKey: args?.commentKey || post.commentKey || '',
        ok: Boolean(result?.ok),
        patchOk: Boolean(result?.patch?.ok),
        patchReason: result?.patch?.reason || result?.patch?.error?.message || '',
        postId: post.postId || '',
        channelId: post.channelId || '',
        messageId: post.messageId || '',
        storedRowsCount: Array.isArray(post?.customKeyboard?.rows) ? post.customKeyboard.rows.length : 0,
        storedButtonsCount: countButtons(post?.customKeyboard || {}),
        durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      walkthroughTrace.log('post_keyboard.save_error', {
        commentKey: args?.commentKey || '',
        actorId: args?.actorId || '',
        rowsCount: Array.isArray(builder?.rows) ? builder.rows.length : 0,
        buttonsCount: countButtons(builder),
        error: error?.message || String(error),
        status: error?.status || '',
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  };

  service.__adminkitPostEditorWalkthroughTrace = true;
  return { ok: true, runtimeVersion: RUNTIME, mode: 'post-editor-service-trace-wrap' };
}

module.exports = { install, RUNTIME };
