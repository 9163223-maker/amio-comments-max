'use strict';

const base = require('./clean-bot-campaign-links-pr91');
const store = require('./store');
const growthService = require('./services/growthService');
const campaignAttribution = require('./campaign-attribution-cc8336');
const titleResolver = require('./channel-title-resolver-cc8340');
const botAudit = require('./admin-bot-audit-trace');

const RUNTIME = 'CC8.3.40-CHANNEL-TITLE-RESOLVER';

function clean(value) { return String(value || '').trim(); }
function audit(type, payload = {}) { try { botAudit.log(type, payload); } catch {} }
function find(value, predicate, depth = 6, seen = new Set()) {
  if (!value || depth < 0 || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (predicate(value)) return value;
  for (const item of (Array.isArray(value) ? value : Object.values(value))) {
    const found = find(item, predicate, depth - 1, seen);
    if (found) return found;
  }
  return null;
}
function firstValue(value, keys = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  const wanted = new Set((Array.isArray(keys) ? keys : [keys]).map((key) => clean(key).toLowerCase()));
  for (const [key, raw] of Object.entries(value)) {
    if (wanted.has(clean(key).toLowerCase())) {
      const normalized = clean(raw);
      if (normalized && normalized !== '[object Object]') return normalized;
    }
  }
  for (const raw of Object.values(value)) {
    const found = firstValue(raw, keys, seen);
    if (found) return found;
  }
  return '';
}
function updateType(update = {}) { return clean(update.update_type || update.type || update?.data?.update_type || update?.data?.type).toLowerCase(); }
function channelIdFromUpdate(update = {}) {
  return clean(firstValue(update, ['chat_id', 'chatId', 'channel_id', 'channelId'])) || clean(find(update, (x) => x && typeof x === 'object' && (x.chat_id || x.chatId || x.channel_id || x.channelId), 7)?.chat_id || '');
}
function userIdFromUpdate(update = {}) { return clean(firstValue(update, ['user_id', 'userId', 'sender_id', 'senderId', 'from_id', 'fromId'])); }
function userNameFromUpdate(update = {}) { return clean(firstValue(update, ['first_name', 'firstName', 'username', 'name'])); }
async function resolveChannelTitleFromUpdate(update = {}, config = {}) {
  const channelId = channelIdFromUpdate(update);
  if (!channelId || !/^-/i.test(channelId) || !config?.botToken) return null;
  const kind = updateType(update);
  const shouldResolve = ['bot_added', 'chat_title_changed', 'message_created', 'user_added', 'user_removed'].includes(kind) || clean(firstValue(update, ['is_channel', 'isChannel'])) === 'true';
  if (!shouldResolve) return null;
  const result = await titleResolver.resolveTitle({ botToken: config.botToken, channelId, tenantUserId: userIdFromUpdate(update), tenantName: userNameFromUpdate(update) });
  audit('channel_title_resolver.checked', { updateType: kind, channelId, title: result && result.title, source: result && result.source, error: result && result.error, runtimeVersion: RUNTIME });
  return result;
}

function createCleanBot(legacy) {
  campaignAttribution.install();
  const wrapped = base.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithCampaignAttribution(req, res, config) {
      try { await resolveChannelTitleFromUpdate(req.body || {}, config); }
      catch (error) { audit('channel_title_resolver.error', { error: String(error && error.message || error).slice(0, 220), runtimeVersion: RUNTIME }); }
      try { campaignAttribution.saveAudienceEventFromUpdate(store, growthService, req.body || {}, audit); }
      catch (error) { audit('campaign_attribution.error', { error: String(error && error.message || error).slice(0, 220), runtimeVersion: RUNTIME }); }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
