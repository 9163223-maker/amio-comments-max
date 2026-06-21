'use strict';

const RUNTIME = 'PR228-LIVE-CALLBACK-CONTRACT';
const SOURCE = 'adminkit-pr228-live-callback-contract';
const ENTRYPOINT = 'clean-entrypoint-1.53.10-pr89.js';
const PRODUCTION_HANDLER = 'clean-bot-channel-first-post-picker-pr90 -> statsFlow.screenForPayload';
const EXPECTED_LABELS = ['📈 Рост', '🎯 Источники', '🧭 Воронка', '📝 Контент', '📤 Отчёт и качество данных'];
const LEGACY_LABELS = ['Обзор', 'Подписчики', 'Посты', 'Комментарии', 'Реакции', 'Подарки', 'Кнопки под постам', 'Источники подписч', 'Обновить данные'];

function clean(value) { return String(value || '').trim(); }
function preview(value, max = 700) { const text = clean(value).replace(/\s+/g, ' '); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
function parsePayload(raw) { if (raw && typeof raw === 'object') return raw; try { return JSON.parse(clean(raw)); } catch { return clean(raw) ? { action: clean(raw), raw: clean(raw) } : {}; } }
function buttonRows(screen = {}) { return (screen.attachments || []).flatMap((a) => a && a.payload && Array.isArray(a.payload.buttons) ? a.payload.buttons : []); }
function allButtons(screen = {}) { return buttonRows(screen).flatMap((row) => Array.isArray(row) ? row : [row]).filter(Boolean); }
function findStatsButton(screen = {}) { return allButtons(screen).find((button) => /Статистика/i.test(clean(button.text))); }
function labelsPresent(text = '', labels = []) { return labels.filter((label) => clean(text).includes(label)); }
function visibleButtonLabels(screen = {}) { return allButtons(screen).map((button) => clean(button.text)).filter(Boolean); }
function buttonLabelsPresent(labels = [], expected = []) { return expected.filter((label) => labels.some((buttonLabel) => clean(buttonLabel).includes(label))); }
let latestResult = null;
function remember(result = {}) { latestResult = { ...result, cachedAt: new Date().toISOString() }; return result; }
function latest() { return latestResult ? { ...latestResult } : null; }
function liveFlags() { const result = latest(); return { statsCallbackContractLiveOk: Boolean(result && result.ok), statsMainMenuButtonRoutesToPr226: Boolean(result && result.adminSectionStatsRoutesToPr226), statsLegacyRootNotReturned: Boolean(result && Array.isArray(result.legacyLabelsPresent) && result.legacyLabelsPresent.length === 0), callbackContractLastCheckedAt: result && result.checkedAt || '', callbackContractLastErrors: result && result.errors || [] }; }
function makeResponse() { const state = { statusCode: 200, body: null, headersSent: false }; return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; state.headersSent = true; return body; }, send(body) { state.body = body; state.headersSent = true; return body; }, type() { return this; }, set() { return this; } }; }
function privateCallbackUpdate(payload) { return { update_type: 'message_callback', callback: { callback_id: 'pr228-callback-id', payload, user: { user_id: 'pr228-admin-user' }, message: { id: 'pr228-message-id', body: { mid: 'pr228-message-id', text: '🐋 АдминКИТ' }, sender: { user_id: 'pr228-admin-user' }, recipient: { chat_id: 'pr228-admin-user', chat_type: 'private' } } } }; }

async function runLiveCallbackContract() {
  const errors = [];
  const captured = { answerCallback: [], editMessage: [], sendMessage: [] };
  const previousAdminIds = process.env.ADMINKIT_ADMIN_MAX_USER_IDS;
  const max = require('./services/maxApi');
  const previousMax = { answerCallback: max.answerCallback, editMessage: max.editMessage, sendMessage: max.sendMessage };
  try {
    process.env.ADMINKIT_ADMIN_MAX_USER_IDS = ['pr228-admin-user', previousAdminIds || ''].filter(Boolean).join(',');
    const menu = require('./v3-menu-core-1539');
    const adapter = require('./clean-bot-campaign-attribution-cc8336');
    const pushRuntime = require('./clean-bot-live-chat-push-pr165');
    const mainScreen = menu.mainScreen();
    const statsButton = findStatsButton(mainScreen);
    const mainMenuStatsPayload = statsButton ? parsePayload(statsButton.payload) : {};
    if (!statsButton) errors.push('main_menu_stats_button_missing');
    if (!mainMenuStatsPayload || !['admin_section_stats', 'stats:home'].includes(clean(mainMenuStatsPayload.action))) errors.push('main_menu_stats_payload_unexpected');
    max.answerCallback = async (args) => { captured.answerCallback.push(args); return { ok: true }; };
    max.editMessage = async (args) => { captured.editMessage.push(args); return { ok: true, transport: 'editMessage', message: { id: args.messageId } }; };
    max.sendMessage = async (args) => { captured.sendMessage.push(args); return { ok: true, transport: 'sendMessage', message: { id: 'pr228-sent-message' } }; };
    const legacy = { handleWebhook: async (req, res) => res.status(599).json({ ok: false, handledBy: 'legacy-stub', error: 'callback_contract_fell_through_to_legacy' }), getPushDispatchDiagnostics: () => ({ count: 0 }) };
    const bot = pushRuntime.createCleanBot(adapter.createCleanBot(legacy), legacy);
    const res = makeResponse();
    await bot.handleWebhook({ body: privateCallbackUpdate(statsButton && statsButton.payload), headers: {}, get: () => '' }, res, { botToken: 'pr228-no-real-token' });
    const rendered = captured.editMessage[captured.editMessage.length - 1] || captured.sendMessage[captured.sendMessage.length - 1] || {};
    const response = res.state.body || {};
    const screenText = clean(rendered.text);
    const renderedRootButtonLabels = visibleButtonLabels({ attachments: rendered.attachments || [] });
    const expectedLabelsPresent = buttonLabelsPresent(renderedRootButtonLabels, EXPECTED_LABELS);
    const legacyLabelsPresent = buttonLabelsPresent(renderedRootButtonLabels, LEGACY_LABELS);
    if (clean(response.handledBy) === 'legacy-stub' || res.state.statusCode === 599) errors.push('payload_fell_through_to_legacy_stub');
    if (!captured.editMessage.length && !captured.sendMessage.length) errors.push('no_screen_render_captured');
    if (expectedLabelsPresent.length !== EXPECTED_LABELS.length) errors.push('pr226_expected_labels_missing');
    if (legacyLabelsPresent.length) errors.push('legacy_stats_root_labels_returned');
    const adminSectionStatsRoutesToPr226 = expectedLabelsPresent.length === EXPECTED_LABELS.length && legacyLabelsPresent.length === 0 && clean(response.screenId).includes('pr226');
    if (!adminSectionStatsRoutesToPr226) errors.push('admin_section_stats_not_pr226_home');
    const buildInfo = (() => { try { return require('./buildInfo').getBuildInfo(); } catch { return {}; } })();
    return remember({ ok: errors.length === 0, runtimeVersion: process.env.RUNTIME_VERSION || buildInfo.runtimeVersion || menu.runtimeVersion(), sourceMarker: SOURCE, entrypoint: ENTRYPOINT, checkedAt: new Date().toISOString(), mainMenuRenderer: 'v3-menu-core-1539.mainScreen', mainMenuStatsButtonFound: Boolean(statsButton), mainMenuStatsPayload, resolvedHandler: clean(response.handler || response.handledBy || 'clean-bot-campaign-attribution-cc8336 -> clean-bot-channel-first-post-picker-pr90'), screenId: clean(response.screenId), screenTextPreview: preview(screenText), renderedRootButtonLabels, expectedLabelsPresent, legacyLabelsPresent, adminSectionStatsRoutesToPr226, errors });
  } catch (error) {
    errors.push(clean(error && error.message || error));
    const buildInfo = (() => { try { return require('./buildInfo').getBuildInfo(); } catch { return {}; } })();
    return remember({ ok: false, runtimeVersion: process.env.RUNTIME_VERSION || buildInfo.runtimeVersion || '', sourceMarker: SOURCE, entrypoint: ENTRYPOINT, checkedAt: new Date().toISOString(), mainMenuStatsButtonFound: false, mainMenuStatsPayload: {}, resolvedHandler: '', screenId: '', screenTextPreview: '', renderedRootButtonLabels: [], expectedLabelsPresent: [], legacyLabelsPresent: [], adminSectionStatsRoutesToPr226: false, errors });
  } finally {
    max.answerCallback = previousMax.answerCallback; max.editMessage = previousMax.editMessage; max.sendMessage = previousMax.sendMessage;
    if (previousAdminIds === undefined) delete process.env.ADMINKIT_ADMIN_MAX_USER_IDS; else process.env.ADMINKIT_ADMIN_MAX_USER_IDS = previousAdminIds;
  }
}

module.exports = { RUNTIME, SOURCE, ENTRYPOINT, PRODUCTION_HANDLER, EXPECTED_LABELS, LEGACY_LABELS, visibleButtonLabels, runLiveCallbackContract, latest, liveFlags };
