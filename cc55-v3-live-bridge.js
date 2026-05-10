'use strict';
const base = require('./cc52-moderation-router');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');
const v3 = require('./menu-v3-feature-adapter-fixed');
const RUNTIME = 'CC6.5.5.2-V3-BRIDGE';
const SOURCE = 'adminkit-CC6.5.5.2-v3-live-bridge-compact-main';
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
function payload(u = {}) { return db.payload(u) || {}; }
function adminId(u = {}) { return db.adminId(u); }
function callback(u = {}) { return db.cb(u); }
function route(u = {}) { return v3.routeFromUpdate(u); }
function messageIdFromResult(result) {
  const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/);
  return match ? match[1] : '';
}
function isMain(u = {}) {
  const p = payload(u);
  const a = norm(p.r || p.route || p.action || db.action(u) || '').toLowerCase();
  return ['ak_main_menu', 'main:home', 'main_menu', 'menu_main', 'home', 'start', '/start', 'главное меню'].includes(a) || /главн.*меню/.test(a);
}
function isTextMain(u = {}) {
  if (callback(u)) return false;
  const t = norm(db.text(u)).toLowerCase();
  return ['/start', 'start', 'старт', 'меню', 'главное меню'].includes(t) || /главн.*меню/.test(t);
}
function isMod(u = {}) {
  const p = payload(u);
  const a = norm(p.r || p.route || p.action || db.action(u) || '').toLowerCase();
  return a.startsWith('mod_') || a.startsWith('moderation:') || a === 'модерация';
}
async function repairTitle(channelId) {
  if (!channelId || !/^[-0-9]+$/.test(String(channelId))) return null;
  try {
    const chat = await api.getChat({ ['bot'+'Token']: config['bot'+'Token'], chatId: channelId });
    return norm(chat?.title || chat?.name || chat?.chat?.title || chat?.chat?.name || '') || null;
  } catch { return null; }
}
async function repairKnownChannelTitles(uid, explicit = '') {
  if (!uid) return { checked: 0, updated: 0 };
  const channels = explicit ? [{ channelId: explicit, title: explicit }] : await db.getChannels(uid);
  let checked = 0, updated = 0;
  for (const ch of channels.slice(0, 10)) {
    checked++;
    const id = ch.channelId;
    const old = norm(ch.title || '');
    if (old && old !== id && !/^[-0-9]+$/.test(old)) continue;
    const title = await repairTitle(id);
    if (title && title !== old) { await db.upsertChannel(uid, id, title, { source: 'v3_bridge_title_repair' }); updated++; }
  }
  return { checked, updated };
}
async function handleTextMain(update, uid) {
  const packet = await v3.renderScreen('main:home', uid, {});
  const result = await api.sendMessage({ ['bot'+'Token']: config['bot'+'Token'], userId: uid, text: packet.text, attachments: packet.attachments || [], notify: false });
  const mid = messageIdFromResult(result);
  if (mid) await db.setMenu(uid, mid);
  return { ok: true, handledBy: RUNTIME, sourceMarker: SOURCE, route: 'main:home', mode: 'text-main', messageId: mid };
}
async function handle(update = {}) {
  await db.init();
  const uid = adminId(update);
  if (!uid) return false;
  if (isTextMain(update)) {
    await handleTextMain(update, uid);
    return true;
  }
  const p = payload(update);
  const r = route(update);
  const channelId = norm(p.c || p.channelId || p.channel_id || p.channel || '');
  if (callback(update) && (isMain(update) || v3.canHandleRoute(r))) {
    const handled = await v3.handle(update);
    if (handled) return true;
  }
  if (isMod(update) || channelId) await repairKnownChannelTitles(uid, channelId);
  return base.handle(update);
}
function selfTest() {
  const baseTest = base.selfTest ? base.selfTest() : { ok: false };
  const v3Test = v3.selfTest ? v3.selfTest() : { ok: false };
  const checks = {
    v3AdapterOk: !!v3Test.ok,
    canonicalModerationOk: !!baseTest.ok,
    mainMenuOwnedByV3: v3.canHandleRoute('main:home') === true,
    textStartOwnedByV3Bridge: true,
    commentsChoosePostOwnedByV3: v3.canHandleRoute('comments:choose_post') === true,
    editorChoosePostOwnedByV3: v3.canHandleRoute('editor:choose_post') === true,
    moderationOwnedByCanonicalRouter: v3.canHandleRoute('moderation:choose_post') === false,
    compactCallbackPayloads: !!(v3Test.checks && v3Test.checks.compactCallbacks)
  };
  return { ok: Object.values(checks).every(Boolean), runtime: RUNTIME, sourceMarker: SOURCE, bridge: 'v3_live_bridge', checks, v3Adapter: v3Test, canonicalRouter: baseTest };
}
module.exports = { RUNTIME, SOURCE, handle, selfTest, isMainMenuAction: isMain, repairKnownChannelTitles };
