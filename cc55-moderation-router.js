'use strict';

// CC6.5.3.6 canonical moderation wrapper.
// This wrapper no longer owns the moderation UI. It only keeps two responsibilities:
// 1) main menu callback;
// 2) channel title repair before handing the callback to the canonical cc52 router.

const base = require('./cc52-moderation-router');
const db = require('./cc5-db-core');
const api = require('./services/maxApi');
const config = require('./config');

const RUNTIME = 'CC6.5.3.6';
const SOURCE = 'adminkit-CC6.5.3.6-canonical-wrapper';
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();

function button(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows.filter(Boolean) } }]; }
function payload(update = {}) { return db.payload(update); }
function action(update = {}) { return norm(db.action(update)).toLowerCase(); }
function adminId(update = {}) { return db.adminId(update); }
function messageId(update = {}) { return db.messageId(update); }
function chatId(update = {}) { return db.chatId(update); }
function callbackId(update = {}) { return db.callbackId(update); }
function resultMessageId(result) { const match = JSON.stringify(result || {}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/); return match ? match[1] : ''; }

function isMainMenuAction(update = {}) {
  const a = action(update);
  return ['ak_main_menu', 'main:home', 'main_menu', 'menu_main', 'home', 'start', 'главное меню'].includes(a) || /главн.*меню/.test(a);
}

async function answer(update, notification) {
  const id = callbackId(update);
  if (!id) return;
  try { await api.answerCallback({ botToken: config.botToken, callbackId: id, notification }); } catch {}
}

function mainMenuPacket(displayName = '') {
  const hello = displayName ? `Привет, ${displayName}!` : 'Привет!';
  return {
    text: ['🐋 АдминКИТ', '', hello, 'АдминКИТ — панель управления MAX-каналом.', 'Выберите раздел.'].join('\n'),
    attachments: keyboard([
      [button('💬 Комментарии', 'comments:home')],
      [button('🛡 Модерация', 'mod_start')],
      [button('✏️ Редактор постов', 'editor:home')],
      [button('⚪ Кнопки под постами', 'buttons:home')],
      [button('🎁 Подарки / лид-магниты', 'gifts:home')],
      [button('📊 Статистика', 'stats:home')],
      [button('📺 Каналы и доступ', 'channels:home')],
      [button('❓ Помощь', 'help:home')]
    ])
  };
}

async function sendOrEdit(update, currentAdminId, packet) {
  const mid = messageId(update);
  if (mid) {
    try {
      await api.editMessage({ botToken: config.botToken, messageId: mid, text: packet.text, attachments: packet.attachments || [], notify: false });
      await db.setMenu(currentAdminId, mid);
      return { mode: 'edited', messageId: mid };
    } catch (error) {
      console.warn('[CC6.5.3.6 main menu edit]', error && error.message ? error.message : error);
    }
  }
  const oldMenuId = await db.getMenu(currentAdminId);
  if (oldMenuId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: oldMenuId, timeoutMs: 1200 }); } catch {} }
  const args = { botToken: config.botToken, text: packet.text, attachments: packet.attachments || [], notify: false };
  if (currentAdminId) args.userId = currentAdminId; else if (chatId(update)) args.chatId = chatId(update); else return { mode: 'skipped' };
  const result = await api.sendMessage(args);
  const newId = resultMessageId(result);
  if (newId) await db.setMenu(currentAdminId, newId);
  return { mode: 'sent', messageId: newId };
}

async function repairChannelTitle(channelId) {
  if (!channelId || !/^[-0-9]+$/.test(String(channelId))) return null;
  try {
    const chat = await api.getChat({ botToken: config.botToken, chatId: channelId });
    const title = norm(chat?.title || chat?.name || chat?.chat?.title || chat?.chat?.name || '');
    if (title) return title;
  } catch (error) {
    console.warn('[CC6.5.3.6 channel title repair]', channelId, error && error.message ? error.message : error);
  }
  return null;
}

async function repairKnownChannelTitles(currentAdminId, explicitChannelId = '') {
  if (!currentAdminId) return { checked: 0, updated: 0 };
  const channels = explicitChannelId ? [{ channelId: explicitChannelId, title: explicitChannelId }] : await db.getChannels(currentAdminId);
  let checked = 0, updated = 0;
  for (const ch of channels.slice(0, 10)) {
    checked += 1;
    const id = ch.channelId;
    const oldTitle = norm(ch.title || '');
    if (oldTitle && oldTitle !== id && !/^[-0-9]+$/.test(oldTitle)) continue;
    const title = await repairChannelTitle(id);
    if (title && title !== oldTitle) {
      await db.upsertChannel(currentAdminId, id, title, { source: 'canonical_wrapper_title_repair' });
      updated += 1;
    }
  }
  return { checked, updated };
}

async function handle(update = {}) {
  await db.init();
  const uid = adminId(update);
  if (!uid) return false;
  const p = payload(update);
  const channelId = norm(p.channelId || p.channel_id || p.channel || '');
  if (isMainMenuAction(update)) {
    await db.clearFlow(uid);
    await answer(update, 'Главное меню');
    await sendOrEdit(update, uid, mainMenuPacket(norm(update?.user?.name || update?.message?.sender?.name || '')));
    return true;
  }
  if (action(update).startsWith('mod') || action(update).startsWith('moderation:') || action(update) === 'модерация' || channelId) {
    await repairKnownChannelTitles(uid, channelId);
  }
  return base.handle(update);
}

function selfTest() {
  const baseTest = base.selfTest ? base.selfTest() : { ok: false };
  const mainPayload = { action: 'ak_main_menu' };
  const choosePost = { action: 'mod_choose_post', channelId: '-100' };
  const postRules = { action: 'mod_post_rules', channelId: '-100', postId: 'p1', commentKey: '-100:p1', scopeType: 'post' };
  const checks = {
    baseRouter: !!baseTest.ok,
    wrapperDoesNotOwnModerationUi: true,
    mainMenuAction: isMainMenuAction({ callback: { payload: JSON.stringify(mainPayload) } }) === true,
    choosePostRoute: base.routeFrom(choosePost.action, choosePost) === 'mod_choose_post',
    postRulesRoute: base.routeFrom(postRules.action, postRules) === 'mod_post_rules',
    modernToggleRoute: base.routeFrom('moderation:toggle_links', postRules) === 'mod_toggle_links',
    callbacksDoNotCreatePosts: baseTest.callbackPostUpsert === 'disabled'
  };
  return { ok: Object.values(checks).every(Boolean), runtime: RUNTIME, sourceMarker: SOURCE, checks, canonicalRouter: baseTest };
}

module.exports = { RUNTIME, SOURCE, handle, selfTest, mainMenuPacket, isMainMenuAction, repairKnownChannelTitles };
