'use strict';

const EXPECTED_STATS_ROOTS = new Set(['stats_home_pr229', 'stats_scope_selector_pr229', 'stats_scope_empty_pr229']);
const LEGACY_STATS_ROOTS = new Set(['stats_monitoring_home', 'stats_product_perfect_home_pr226', 'migrate_stats_cached_postgres_screen']);

function clean(value) { return String(value || '').trim(); }
function packageStartUnchanged() {
  const pkg = require('./package.json');
  return clean(pkg.scripts && pkg.scripts.start) === 'node -r ./pr178-push-pairing-bootstrap.js clean-entrypoint-1.53.10-pr89.js';
}
function activeEntrypointUnchanged(entrypoint = require('./clean-entrypoint-1.53.10-pr89.js')) {
  return entrypoint && typeof entrypoint.info === 'function' && clean(entrypoint.info().entrypoint) === 'clean-entrypoint-1.53.10-pr89.js';
}
function productionChainIncludesChannelFirst(entrypoint = require('./clean-entrypoint-1.53.10-pr89.js')) {
  const installState = entrypoint.installCleanBot();
  const routeModules = Array.isArray(installState.routeModules) ? installState.routeModules : [];
  return Boolean(installState.channelFirstPostPickerModule === 'clean-bot-channel-first-post-picker-pr90.js' || routeModules.includes('clean-bot-channel-first-post-picker-pr90.js'));
}
function patchMaxApi() {
  const max = require('./services/maxApi');
  max.answerCallback = async () => ({ ok: true });
  max.editMessage = async (payload = {}) => ({ ok: true, message: { body: { mid: payload.messageId || 'edited_mid' } }, payload });
  max.sendMessage = async (payload = {}) => ({ ok: true, message: { body: { mid: 'sent_mid' } }, payload });
}
function makeResponse() {
  return {
    statusCode: 0,
    body: null,
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return body; }
  };
}
async function runLiveContract() {
  patchMaxApi();
  const entrypoint = require('./clean-entrypoint-1.53.10-pr89.js');
  const chainIncludesChannelFirst = productionChainIncludesChannelFirst(entrypoint);
  const bot = require('./bot');
  const res = makeResponse();
  await bot.handleWebhook({ body: {
    update_type: 'message_callback',
    callback: { callback_id: 'cb_stats_live_pr228', payload: JSON.stringify({ action: 'admin_section_stats' }), user: { user_id: 'contract_user_pr228' } },
    message: { id: 'msg_stats_live_pr228', recipient: { chat_id: 'contract_user_pr228', chat_type: 'user' }, sender: { user_id: 'contract_user_pr228' }, body: { text: 'menu' } }
  } }, res, { botToken: 'test-token' });
  const screenId = clean(res.body && res.body.screenId);
  const statsMainMenuRoutesToCurrentStatsRoot = EXPECTED_STATS_ROOTS.has(screenId);
  const statsLegacyRootNotReturned = !LEGACY_STATS_ROOTS.has(screenId);
  const statsCallbackContractLiveOk = Boolean(chainIncludesChannelFirst && res.statusCode === 200 && res.body && res.body.module === 'clean-bot-channel-first-post-picker-pr90.js' && statsMainMenuRoutesToCurrentStatsRoot && statsLegacyRootNotReturned);
  return {
    ok: statsCallbackContractLiveOk,
    statsCallbackContractLiveOk,
    statsCallbackContractOk: statsCallbackContractLiveOk,
    statsMainMenuRoutesToCurrentStatsRoot,
    statsLegacyRootNotReturned,
    chainIncludesChannelFirst,
    screenId,
    response: res.body,
    packageStartUnchanged: packageStartUnchanged(),
    activeEntrypointUnchanged: activeEntrypointUnchanged(entrypoint)
  };
}
module.exports = { EXPECTED_STATS_ROOTS, LEGACY_STATS_ROOTS, runLiveContract, productionChainIncludesChannelFirst, packageStartUnchanged, activeEntrypointUnchanged };
