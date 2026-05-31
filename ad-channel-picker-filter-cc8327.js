'use strict';

const RUNTIME = 'CC8.3.27-ADS-CHANNEL-PICKER-FILTER';

function clean(value) { return String(value || '').trim(); }
function arr(value) { return Array.isArray(value) ? value : []; }
function short(value = '', max = 52) {
  const s = clean(value).replace(/\s+/g, ' ');
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trim()}…`;
}
function button(menu, text, action, data = {}) { return menu.button(text, action, data); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function adFooter(menu) { return [[button(menu, '📣 В начало рекламы', 'admin_stats_campaigns')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) { return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: keyboard(menu, rows) }; }
function titleOf(ch = {}) {
  const title = clean(ch.title || ch.channelTitle || ch.name || ch.channelName || ch.chatTitle || ch.chat?.title || ch.recipient?.title);
  return title && !looksTechnicalId(title) ? title : 'Канал без названия';
}
function looksTechnicalId(value = '') {
  const s = clean(value);
  return /^-?\d{6,}$/.test(s) || /^id\d{6,}$/i.test(s);
}
function idOf(ch = {}) { return clean(ch.channelId || ch.id || ch.chatId || ch.chat_id || ch.recipient?.chat_id || ch.recipient?.id); }
function typeOf(ch = {}) { return clean(ch.chatType || ch.type || ch.kind || ch.recipient?.chat_type || ch.recipient?.type || ch.chat?.type).toLowerCase(); }
function directUrlOf(ch = {}) { return clean(ch.link || ch.url || ch.inviteLink || ch.joinUrl || ch.maxUrl || ch.publicLink || ch.channelUrl || ''); }
function isPrivateLike(ch = {}) {
  const type = typeOf(ch);
  const marker = clean(ch.source || ch.sourceKind || ch.recordType || '').toLowerCase();
  return ['user', 'private', 'dialog', 'direct', 'dm', 'admin'].includes(type) || ['user', 'private', 'dialog', 'direct', 'dm', 'admin'].includes(marker);
}
function isChannelLike(ch = {}, postChannelIds = new Set()) {
  const id = idOf(ch);
  if (!id || /^external_/i.test(id)) return false;
  if (isPrivateLike(ch)) return false;
  if (postChannelIds.has(id)) return true;
  if (/^-/.test(id)) return true;
  const type = typeOf(ch);
  if (['channel', 'chat', 'group', 'supergroup'].includes(type)) return true;
  if (ch.isMaxChannel === true || ch.isChannel === true || ch.channel === true) return true;
  if (directUrlOf(ch)) return true;
  return false;
}
function connectedAdChannels() {
  const store = require('./store');
  const posts = arr(store.getPostsList ? store.getPostsList() : []);
  const postChannelIds = new Set(posts.map((post) => clean(post && post.channelId)).filter(Boolean));
  const seen = new Set();
  return arr(store.getChannelsList ? store.getChannelsList() : [])
    .filter((ch) => isChannelLike(ch, postChannelIds))
    .filter((ch) => {
      const id = idOf(ch);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 12);
}
function chooseChannelScreen(menu) {
  const channels = connectedAdChannels();
  const rows = channels.map((ch, i) => [button(menu, `${i + 1}. ${short(titleOf(ch), 52)}`, 'admin_stats_campaign_channel', { channelId: idOf(ch) })]);
  rows.push([button(menu, '➕ Другой канал по ссылке', 'admin_stats_campaign_external')], ...adFooter(menu));
  return screen(menu, 'stats_campaign_choose_channel_filtered', '📣 Создание рекламной ссылки', channels.length ? [
    'Выберите канал, куда должна вести реклама.',
    '',
    'Показываем только MAX-каналы. Личные чаты и администраторы в этот список не попадают.',
    'Если канал приватный и ссылки ещё нет в АдминКИТ, бот попросит invite-ссылку MAX.'
  ] : [
    'Подключённых MAX-каналов пока не найдено.',
    'Можно создать ссылку вручную через «Другой канал по ссылке».',
    '',
    'Если вы только что добавили бота в новый канал и канал не появился, отправьте в канале тестовый пост или пришлите invite-ссылку вручную.'
  ], rows);
}
function invalidChannelScreen(menu) {
  return screen(menu, 'stats_campaign_channel_not_ad_channel', '📣 Создание рекламной ссылки', [
    'Эта запись не похожа на MAX-канал.',
    'В рекламной кампании нельзя выбирать личный чат или администратора.',
    '',
    'Выберите канал из списка или используйте «Другой канал по ссылке».'
  ], [[button(menu, '📺 Выбрать канал', 'admin_stats_campaign_create')], [button(menu, '➕ Другой канал по ссылке', 'admin_stats_campaign_external')], ...adFooter(menu)]);
}
function install() {
  const statsFlow = require('./stats-flow-cc8');
  const ads = require('./services/adCampaignService');
  if (statsFlow.__adminkitAdChannelPickerFilterInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const oldScreen = statsFlow.screenForPayload;
  const oldSelftest = ads.selftest;
  statsFlow.screenForPayload = async function adChannelFilteredScreenForPayload(menu, payload = {}, ctx = {}) {
    const action = clean(payload.action);
    if (action === 'admin_stats_campaign_create') return chooseChannelScreen(menu, ctx);
    if (action === 'admin_stats_campaign_channel') {
      const id = clean(payload.channelId);
      const allowed = connectedAdChannels().some((ch) => idOf(ch) === id);
      if (!allowed) return invalidChannelScreen(menu);
    }
    return oldScreen(menu, payload, ctx);
  };
  ads.selftest = function adChannelPickerFilterSelftest(config = {}) {
    const base = oldSelftest ? oldSelftest(config) : { ok: true };
    const store = require('./store');
    const all = arr(store.getChannelsList ? store.getChannelsList() : []);
    const eligible = connectedAdChannels();
    return {
      ...base,
      runtimeVersion: RUNTIME,
      adChannelPickerFilter: true,
      allStoredChannels: all.length,
      eligibleAdChannels: eligible.map((ch) => ({ channelId: idOf(ch), title: titleOf(ch), type: typeOf(ch) || null })),
      filteredOutStoredChannels: Math.max(0, all.length - eligible.length),
      noAdminUsersInAdChannelPicker: true
    };
  };
  statsFlow.__adminkitAdChannelPickerFilterInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME, adChannelPickerFilter: true };
}

module.exports = { RUNTIME, install, connectedAdChannels, isChannelLike };
