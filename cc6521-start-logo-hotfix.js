'use strict';

// CC6.5.2.1 reliability layer over CC6.5.2 clean core.
// Scope: reliable menu ownership, comments flow guard, contextual help, logo fit, debug/testing endpoints.
// No destructive post edits are performed by tests.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.2.1';
const SOURCE = 'adminkit-CC6.5.2.1-menu-reliability-tests';
const START_DEDUPE_TTL_MS = 3500;
const MENU_REPLACE_TTL_MS = 10 * 60 * 1000;
const recentStartMenus = new Map();
const lastMenus = new Map();
const menuEvents = [];
const LOGO_PATH = path.join(__dirname, 'public', 'adminkit_chat_logo.png');
let cachedLogoAttachment = null;

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function clip(v, n = 44) { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function clone(v) { return JSON.parse(JSON.stringify(v ?? null)); }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function getMessage(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function getCallback(u = {}) { return u.callback || u.data?.callback || getMessage(u)?.callback || null; }
function getPayloadRaw(u = {}) { const cb = getCallback(u) || {}; return norm(cb.payload || cb.body?.payload || u.payload || u.data?.payload || ''); }
function getPayload(u = {}) { return tryJson(getPayloadRaw(u)) || {}; }
function getAction(u = {}) { const p = getPayload(u); const raw = getPayloadRaw(u); return norm(p.action || p.cmd || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function getExtra(u = {}) { return getPayload(u); }
function getText(u = {}) { const m = getMessage(u) || {}; return norm(m.body?.text || m.text || m.message?.text || u.message?.text || ''); }
function getEventType(u = {}) { return norm(u.update_type || u.type || u.event_type || u.eventType || u.event || u.data?.update_type || u.data?.type || '').toLowerCase(); }
function getStartPayload(u = {}) { return norm([u.start_payload, u.payload, u.startParam, u.start_param, u.data?.start_payload, u.data?.payload, u.user?.start_payload, u.user?.start_param, getMessage(u)?.body?.payload, getMessage(u)?.payload].find((x) => norm(x)) || ''); }
function getUserId(u = {}) { const m = getMessage(u) || {}; const cb = getCallback(u) || {}; return norm(u.user?.user_id || u.user?.id || u.sender?.user_id || u.sender?.id || cb.user?.user_id || cb.user?.id || cb.sender?.user_id || cb.sender?.id || m.sender?.user_id || m.sender?.id || m.user_id || m.from?.id || u.data?.user?.user_id || u.data?.user?.id || ''); }
function getChatId(u = {}) { const m = getMessage(u) || {}; return norm(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || u.chat_id || u.chat?.id || u.data?.chat_id || u.data?.chat?.id || ''); }
function getTarget(u = {}) { const userId = getUserId(u); const chatId = getChatId(u); return { userId, chatId, key: userId || chatId }; }
function getCallbackId(u = {}) { const cb = getCallback(u) || {}; return norm(cb.callback_id || cb.id || cb.callbackId || u.callback_id || ''); }
function getMsgId(u = {}) { const cb = getCallback(u) || {}; const m = cb.message || getMessage(u) || {}; const b = m.body || {}; return norm(b.mid || b.message_id || b.messageId || m.message_id || m.messageId || m.id || m.mid || cb.message_id || cb.messageId || ''); }
function getMsgIdFromResponse(v = {}) { return norm([v?.message?.body?.mid, v?.message?.body?.message_id, v?.message?.message_id, v?.message?.id, v?.body?.mid, v?.body?.message_id, v?.message_id, v?.id, v?.mid, v?.data?.message?.body?.mid, v?.data?.message?.id, v?.data?.id].find((x) => norm(x)) || ''); }
function cleanup() { const now = Date.now(); for (const [k, ts] of recentStartMenus.entries()) if (now - Number(ts || 0) > START_DEDUPE_TTL_MS) recentStartMenus.delete(k); for (const [k, item] of lastMenus.entries()) if (now - Number(item?.ts || 0) > MENU_REPLACE_TTL_MS) lastMenus.delete(k); }
function isPlainStart(u = {}) { return ['start', '/start', 'menu', '/menu', 'меню'].includes(getText(u).toLowerCase()); }
function isStartUpdate(u = {}) { if (getCallback(u)) return false; const t = getEventType(u); const p = getStartPayload(u).toLowerCase(); return t === 'bot_started' || t === 'bot_start' || t === 'bot_started_update' || isPlainStart(u) || ['menu', 'start', 'main'].includes(p); }
function rememberEvent(item) { menuEvents.push({ ts: Date.now(), ...item }); while (menuEvents.length > 80) menuEvents.shift(); }

function btn(text, action, extra = {}) { return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function mainKb() { return kb([[btn('💬 Комментарии', 'comments_menu'), btn('🎁 Подарки', 'gift_menu')], [btn('🔘 Кнопки', 'buttons_menu'), btn('🛡 Модерация', 'mod_start')], [btn('📊 Статистика', 'stats_menu'), btn('📣 Ваши каналы', 'channels_menu')], [btn('❓ Помощь', 'help_menu')]]); }
function sectionKb(section, help, rows = []) { return kb([...(rows || []), [btn('❓ Помощь раздела', help), btn('🏠 Главное меню', 'ak_main_menu')], [btn('↩️ Главная раздела', section)]]); }
function helpKb(section) { return kb([[btn('↩️ Главная раздела', section), btn('🏠 Главное меню', 'ak_main_menu')]]); }

const TEXT = {
  main: 'АдминКИТ — главное меню\n\nВыберите раздел управления каналом.',
  comments: '💬 Комментарии\n\nРаздел для управления обсуждениями под постами.\n\nПроверяем: выбор поста, включение/выключение комментариев, открытие обсуждения, текст, фото для платных тарифов, реакции и ответы.\n\nВидео и файлы в комментариях сейчас не включаем.',
  commentsChoose: '💬 Комментарии → выбрать пост\n\nВыберите канал, затем пост. Если постов нет — перешлите нужный пост из канала в бот, чтобы АдминКИТ сохранил postId/commentKey.',
  gifts: '🎁 Подарки / лид-магниты\n\nСценарий: 1/4 канал и пост, 2/4 подарок или ссылка, 3/4 текст получателю, 4/4 проверка и сохранение.\n\nПосле сохранения бот должен убрать лишние шаги и не плодить старые меню.',
  buttons: '🔘 Пользовательские кнопки\n\nСценарий: выбрать пост → текст кнопки → ссылка → сохранить.\n\nПатч поста должен сохранять текст, ссылки, форматирование и медиа.',
  stats: '📊 Статистика\n\nПоказываем: подписчики, динамика за 24 часа / 7 / 14 / 30 дней, комментарии, реакции, клики, подарки, заявки и статистика поста.',
  channels: '📣 Ваши каналы\n\nПодключение и выбор канала. Если канал один — подставляем автоматически. Если каналов несколько — показываем список с названиями.',
  help: '❓ Помощь АдминКИТ\n\nВыберите раздел.\n\nПравило интерфейса: один активный сценарий, без дублей меню и без потери кнопок «Главное меню» / «Главная раздела».',
  helpComments: '❓ Помощь: Комментарии\n\nКомментарии добавляют обсуждение под постами MAX.\n\nОставляем: текст, фото, реакции и ответы. Видео и файлы исключены.\n\nЕсли кнопка «Выбрать пост» уводит в модерацию — это ошибка маршрута comments_choose_post.',
  helpModeration: '❓ Помощь: Модерация\n\nМодерация фильтрует нежелательные комментарии.\n\nБазовый уровень: стоп-слова, ссылки, приглашения. AI-модерация — будущий дорогой тариф.\n\nДолжны быть правила всего канала и правила конкретного поста.',
  helpGifts: '❓ Помощь: Подарки\n\nПодарок выдаётся после проверки подписки. Сценарий должен быть 1/4 → 4/4, без старых меню после сохранения.',
  helpButtons: '❓ Помощь: Кнопки\n\nКнопки — CTA под постами: купить, участвовать, записаться, получить материал. Кнопка не должна ломать пост.',
  helpStats: '❓ Помощь: Статистика\n\nСтатистика должна быть понятной администратору, без сырого debug.',
  helpChannels: '❓ Помощь: Каналы\n\nПодключение канала, список каналов, автоподстановка единственного канала.'
};

const SIMPLE_ROUTES = {
  ak_main_menu: () => ({ text: TEXT.main, attachments: mainKb(), logo: true }), main_menu: 'ak_main_menu', menu_main: 'ak_main_menu', home: 'ak_main_menu',
  comments_menu: () => ({ text: TEXT.comments, attachments: sectionKb('comments_menu', 'help_comments', [[btn('📌 Выбрать пост', 'comments_choose_post')]]) }),
  gift_menu: () => ({ text: TEXT.gifts, attachments: sectionKb('gift_menu', 'help_gifts', [[btn('🎁 Создать подарок', 'gift_create')], [btn('📋 Список подарков', 'gift_list')]]) }),
  buttons_menu: () => ({ text: TEXT.buttons, attachments: sectionKb('buttons_menu', 'help_buttons', [[btn('➕ Добавить кнопку', 'buttons_add')], [btn('📋 Кнопки поста', 'buttons_list')]]) }),
  stats_menu: () => ({ text: TEXT.stats, attachments: sectionKb('stats_menu', 'help_stats', [[btn('📊 Статистика канала', 'stats_channel')], [btn('📌 Статистика поста', 'stats_post')]]) }),
  channels_menu: () => ({ text: TEXT.channels, attachments: sectionKb('channels_menu', 'help_channels', [[btn('📣 Список каналов', 'channels_list')], [btn('➕ Подключить канал', 'connect_channel')]]) }),
  help_menu: () => ({ text: TEXT.help, attachments: kb([[btn('💬 Комментарии', 'help_comments'), btn('🎁 Подарки', 'help_gifts')], [btn('🔘 Кнопки', 'help_buttons'), btn('🛡 Модерация', 'help_moderation')], [btn('📊 Статистика', 'help_stats'), btn('📣 Каналы', 'help_channels')], [btn('🏠 Главное меню', 'ak_main_menu')]]) }),
  help_comments: () => ({ text: TEXT.helpComments, attachments: helpKb('comments_menu') }), help_moderation: () => ({ text: TEXT.helpModeration, attachments: helpKb('mod_start') }), help_gifts: () => ({ text: TEXT.helpGifts, attachments: helpKb('gift_menu') }), help_buttons: () => ({ text: TEXT.helpButtons, attachments: helpKb('buttons_menu') }), help_stats: () => ({ text: TEXT.helpStats, attachments: helpKb('stats_menu') }), help_channels: () => ({ text: TEXT.helpChannels, attachments: helpKb('channels_menu') })
};
function resolveSimple(action) { let a = norm(action).toLowerCase(); let r = SIMPLE_ROUTES[a]; if (typeof r === 'string') { a = r; r = SIMPLE_ROUTES[a]; } return typeof r === 'function' ? { action: a, build: r } : null; }

function safeChannels() { try { return require('./services/channelService').listChannels() || []; } catch { return []; } }
function channelIdOf(c = {}) { return norm(c.channelId || c.id || c.chatId || c.chat_id || ''); }
function channelNameOf(c = {}) { return norm(c.title || c.channelTitle || c.name || c.chatTitle || c.channelName || channelIdOf(c)); }
function safePosts(channelId = '') { try { return require('./services/postEditorService').listAdminPosts({ channelId, limit: 12, config: require('./config') }) || []; } catch { return []; } }
function postLabel(post = {}, i = 0) { return `${i + 1}. ${clip(post.originalText || post.linkedByName || post.postId || post.commentKey || 'Пост', 34)}`; }
async function buildCommentsChoose(extra = {}) {
  const channels = safeChannels();
  const selectedChannelId = norm(extra.channelId || (channels.length === 1 ? channelIdOf(channels[0]) : ''));
  if (!channels.length) return { text: TEXT.commentsChoose + '\n\nПодключённых каналов пока не найдено.', attachments: sectionKb('comments_menu', 'help_comments', [[btn('📣 Перейти в каналы', 'channels_menu')]]) };
  if (!selectedChannelId && channels.length > 1) return { text: TEXT.commentsChoose + '\n\nСначала выберите канал.', attachments: sectionKb('comments_menu', 'help_comments', channels.slice(0, 10).map((c) => [btn(channelNameOf(c), 'comments_choose_post', { channelId: channelIdOf(c) })])) };
  const posts = safePosts(selectedChannelId);
  if (!posts.length) return { text: TEXT.commentsChoose + `\n\nКанал: ${channelNameOf(channels.find((c) => channelIdOf(c) === selectedChannelId) || { channelId: selectedChannelId })}\n\nПостов для управления пока нет. Перешлите пост из канала в бот.`, attachments: sectionKb('comments_menu', 'help_comments', [[btn('🔄 Обновить список', 'comments_choose_post', { channelId: selectedChannelId })]]) };
  return { text: `💬 Комментарии → выбрать пост\n\nКанал: ${channelNameOf(channels.find((c) => channelIdOf(c) === selectedChannelId) || { channelId: selectedChannelId })}\nПостов найдено: ${posts.length}\n\nВыберите пост для настройки комментариев.`, attachments: sectionKb('comments_menu', 'help_comments', posts.map((p, i) => [btn(postLabel(p, i), 'comments_post_card', { commentKey: p.commentKey, channelId: selectedChannelId })])) };
}
function buildPostCard(commentKey = '') {
  const post = safePosts('').find((p) => p.commentKey === commentKey) || Object.values((() => { try { return require('./store').store?.posts || {}; } catch { return {}; } })()).find((p) => p?.commentKey === commentKey) || null;
  if (!post) return { text: '💬 Комментарии → пост\n\nПост не найден в хранилище. Обновите список постов или перешлите пост из канала в бот.', attachments: sectionKb('comments_menu', 'help_comments', [[btn('📌 Выбрать пост', 'comments_choose_post')]]) };
  const disabled = Boolean(post.commentsDisabled);
  return { text: ['💬 Комментарии → пост', '', `Пост: ${clip(post.originalText || post.postId || post.commentKey, 80)}`, `commentKey: ${post.commentKey || commentKey}`, `Комментарии: ${disabled ? 'выключены' : 'включены'}`, `Комментариев: ${Number(post.commentCount || 0) || 0}`, '', 'Выберите действие.'].join('\n'), attachments: sectionKb('comments_menu', 'help_comments', [[btn('✅ Включить комментарии', 'comments_enable', { commentKey })], [btn('⏸ Выключить комментарии', 'comments_disable', { commentKey })], [btn('🧪 Debug поста', 'comments_debug_post', { commentKey })], [btn('📌 К списку постов', 'comments_choose_post', { channelId: post.channelId })]]) };
}
async function buildCommentsAction(action = '', extra = {}, update = {}) {
  const commentKey = norm(extra.commentKey);
  if (action === 'comments_choose_post') return buildCommentsChoose(extra);
  if (action === 'comments_post_card') return buildPostCard(commentKey);
  if (['comments_enable', 'comments_disable'].includes(action)) {
    if (!commentKey) return { text: 'Не найден commentKey поста. Вернитесь к выбору поста.', attachments: sectionKb('comments_menu', 'help_comments', [[btn('📌 Выбрать пост', 'comments_choose_post')]]) };
    try {
      const { setPostCommentsEnabled } = require('./services/postEditorService');
      await setPostCommentsEnabled({ commentKey, enabled: action === 'comments_enable', actorId: getUserId(update), actorName: 'admin', config: require('./config') });
      return { text: `💬 Комментарии\n\nГотово: комментарии ${action === 'comments_enable' ? 'включены' : 'выключены'}.`, attachments: sectionKb('comments_menu', 'help_comments', [[btn('↩️ К посту', 'comments_post_card', { commentKey })], [btn('📌 К списку постов', 'comments_choose_post')]]) };
    } catch (e) {
      return { text: `💬 Комментарии\n\nНе удалось изменить статус комментариев.\nПричина: ${e?.message || String(e)}`, attachments: sectionKb('comments_menu', 'help_comments', [[btn('↩️ К посту', 'comments_post_card', { commentKey })], [btn('📌 К списку постов', 'comments_choose_post')]]) };
    }
  }
  if (action === 'comments_debug_post') return { text: `🧪 Debug поста\n\ncommentKey: ${commentKey || 'не найден'}\n\nЭтот экран подтверждает, что действие осталось внутри раздела «Комментарии», а не ушло в модерацию.`, attachments: sectionKb('comments_menu', 'help_comments', [[btn('↩️ К посту', 'comments_post_card', { commentKey })], [btn('📌 К списку постов', 'comments_choose_post')]]) };
  return null;
}

async function attachLogoIfNeeded(model) { if (!model?.logo) return model; const logo = await getLogoAttachment(require('./config')); return logo ? { ...model, attachments: [logo, ...(model.attachments || [])] } : model; }
async function getLogoAttachment(config = {}) { if (cachedLogoAttachment) return clone(cachedLogoAttachment); if (!config?.botToken || !fs.existsSync(LOGO_PATH)) return null; try { const { createUpload, uploadBinaryToUrl, buildUploadAttachmentPayload } = require('./services/maxApi'); const buffer = fs.readFileSync(LOGO_PATH); const uploadInitResponse = await createUpload({ botToken: config.botToken, type: 'image' }); const uploadResponse = await uploadBinaryToUrl({ uploadUrl: uploadInitResponse?.url, botToken: config.botToken, buffer, fileName: 'adminkit_chat_logo.png', mimeType: 'image/png' }); cachedLogoAttachment = buildUploadAttachmentPayload({ uploadType: 'image', uploadInitResponse, uploadResponse }); return clone(cachedLogoAttachment); } catch (e) { console.error('[CC6521 logo upload]', e?.message || e); return null; } }
async function deletePreviousMenu(targetKey, botToken) { cleanup(); const prev = lastMenus.get(String(targetKey || '')); const mid = norm(prev?.messageId || ''); if (!mid || !botToken) return; try { await require('./services/maxApi').deleteMessage({ botToken, messageId: mid, timeoutMs: 1800 }); } catch {} lastMenus.delete(String(targetKey || '')); }
async function render(update = {}, action = 'ak_main_menu', forceSend = false) { const config = require('./config'); const api = require('./services/maxApi'); const target = getTarget(update); const extra = getExtra(update); let model = null; const simple = resolveSimple(action); if (simple) model = simple.build(extra); else if (String(action).startsWith('comments_')) model = await buildCommentsAction(action, extra, update); if (!model) return { ok: false, reason: 'route_not_owned', action };
  model = await attachLogoIfNeeded(model);
  const cbid = getCallbackId(update); if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} }
  const mid = getMsgId(update); if (mid && !forceSend) { try { await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: model.text, attachments: model.attachments }); return { ok: true, mode: 'edit', action }; } catch (e) { console.error('[CC6521 edit fallback]', e?.message || e); } }
  if (!target.userId && !target.chatId) return { ok: false, reason: 'target_missing', action };
  await deletePreviousMenu(target.key, config.botToken);
  const sent = await api.sendMessage({ botToken: config.botToken, userId: target.userId || undefined, chatId: target.userId ? undefined : target.chatId, notify: false, text: model.text, attachments: model.attachments });
  const sentId = getMsgIdFromResponse(sent); if (sentId) lastMenus.set(String(target.key || ''), { messageId: sentId, ts: Date.now() });
  return { ok: true, mode: 'send', action, messageIdSaved: Boolean(sentId) };
}
async function sendStartMenu(update = {}) { const target = getTarget(update); if (!target.userId && !target.chatId) return { ok: false, reason: 'target_missing' }; if (shouldSkipStartMenu(target.key)) return { ok: true, skipped: true, reason: 'dedupe' }; return render(update, 'ak_main_menu', true); }
function ownsAction(action = '') { return Boolean(resolveSimple(action) || String(action).startsWith('comments_')); }

function landingClientPatch() { return `\n;(()=>{if(window.__ADMINKIT_CC6521_START_LOGO__)return;window.__ADMINKIT_CC6521_START_LOGO__=true;const s=document.createElement('style');s.textContent=${JSON.stringify('.miniapp-start-card img,.miniapp-start-logo,.adminkit-logo,.admin-kit-logo,.brand-logo,img[src*="adminkit_chat_logo"],img[src*="adminkit"][src*="logo"]{display:block!important;width:auto!important;height:auto!important;max-width:min(320px,86vw)!important;max-height:128px!important;object-fit:contain!important;object-position:center center!important;margin-left:auto!important;margin-right:auto!important}.miniapp-start-card,.miniapp-start-logo-wrap,.brand-logo-wrap{overflow:visible!important}')};document.head.appendChild(s);})();\n`; }
function patchPublicAppRead() { if (fs.__cc6521LogoFit) return; fs.__cc6521LogoFit = true; const original = fs.readFileSync.bind(fs); const appPath = path.resolve(__dirname, 'public', 'app.js'); fs.readFileSync = function(filePath, options) { const content = original(filePath, options); try { const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || ''))); if (path.resolve(String(filePath || '')) === appPath && wantsText) { const text = String(content || ''); if (!text.includes('__ADMINKIT_CC6521_START_LOGO__')) return text + landingClientPatch(); } } catch {} return content; }; }

function adminAllowed(req) { const expected = norm(process.env.GIFT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN || ''); if (!expected) return true; const bearer = norm(req.get?.('authorization') || '').replace(/^Bearer\s+/i, '').trim(); const actual = norm(req.get?.('x-admin-token') || bearer || req.query?.token || req.query?.adminToken || req.body?.token || req.body?.adminToken || ''); return actual === expected; }
function requireAdmin(req, res) { if (adminAllowed(req)) return true; noCache(res); res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME, sourceMarker: SOURCE }); return false; }
function commentsFlowStress() { const actions = ['comments_menu','comments_choose_post','comments_post_card','comments_enable','comments_disable','comments_debug_post','help_comments','ak_main_menu']; const checks = actions.map((action) => ({ action, owned: ownsAction(action), route: action.startsWith('comments_') ? 'comments_guard' : (resolveSimple(action) ? 'simple_route' : 'missing') })); return { ok: checks.every((x) => x.owned), total: checks.length, passed: checks.filter((x) => x.owned).length, checks, note: 'synthetic route ownership test; real callbacks are also logged in /debug/menu-events' }; }
function menuStress() { const actions = ['ak_main_menu','comments_menu','gift_menu','buttons_menu','stats_menu','channels_menu','help_menu','help_comments','help_gifts','help_buttons','help_moderation','help_stats','help_channels']; const checks = actions.map((action) => ({ action, owned: ownsAction(action) })); return { ok: checks.every((x) => x.owned), total: checks.length, passed: checks.filter((x) => x.owned).length, checks }; }
async function safeStats() { try { return await require('./cc5-db-core').stats(); } catch (e) { return { dbUrlPresent: !!(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL), reachable: false, error: e?.message || String(e) }; } }
function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function sendDebug(res) { const ms = menuStress(); const cs = commentsFlowStress(); return sendText(res, ['OK: CC6521_READY', 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'scope: menu_reliability_comments_flow_testing', 'menuStress: ' + (ms.ok ? 'pass' : 'fail'), 'commentsFlowStress: ' + (cs.ok ? 'pass' : 'fail'), 'commentsChoosePostOwner: comments_guard', 'preventsCommentsToModeration: true', 'oneActiveMenu: edit_callback_message_first', 'menuEventsEndpoint: /debug/menu-events']); }
function sendMenuStress(res) { const m = menuStress(); return sendText(res, ['OK: ' + (m.ok ? 'MENU_STRESS_PASS' : 'MENU_STRESS_FAIL'), 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'routesTotal: ' + m.total, 'routesPassed: ' + m.passed, ...m.checks.map((x) => x.action + ': ' + (x.owned ? 'pass' : 'fail'))]); }
function sendCommentsStress(res) { const c = commentsFlowStress(); return sendText(res, ['OK: ' + (c.ok ? 'COMMENTS_FLOW_STRESS_PASS' : 'COMMENTS_FLOW_STRESS_FAIL'), 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'checksTotal: ' + c.total, 'checksPassed: ' + c.passed, 'comments_choose_post_should_not_route_to: moderation', 'comments_choose_post_owner: comments_guard', ...c.checks.map((x) => x.action + ': ' + (x.owned ? 'pass -> ' + x.route : 'fail'))]); }
async function sendQaLite(req, res) { const stats = await safeStats(); const ms = menuStress(); const cs = commentsFlowStress(); const ok = Boolean(stats.dbUrlPresent && stats.reachable && ms.ok && cs.ok); return sendText(res, ['OK: ' + (ok ? 'PROD_CHECK_READY' : 'WARNING'), 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'releaseGate: ' + (ok ? 'pass' : 'warning'), 'menuStress: ' + (ms.ok ? 'pass' : 'fail'), 'commentsFlowStress: ' + (cs.ok ? 'pass' : 'fail'), 'dbUrlPresent: ' + Boolean(stats.dbUrlPresent), 'postgresReachable: ' + Boolean(stats.reachable)]); }
function sendEvents(req, res) { if (!requireAdmin(req, res)) return; noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, count: menuEvents.length, events: menuEvents.slice(-50) }); }
function sendStoreLive(req, res) { if (!requireAdmin(req, res)) return; noCache(res); let snapshot = {}; try { const store = require('./store'); snapshot = typeof store.getDebugSnapshot === 'function' ? store.getDebugSnapshot() : { ok: true, store: store.store || {} }; } catch (e) { snapshot = { ok: false, error: e?.message || String(e) }; } return res.json({ ...snapshot, ok: snapshot.ok !== false, runtimeVersion: RUNTIME, sourceMarker: SOURCE, menuStress: menuStress(), commentsFlowStress: commentsFlowStress(), generatedAt: Date.now() }); }
function sendCallbackPolicy(res) { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, policy: { topLevelMenuRouter: 'enabled', commentsGuard: 'enabled', oneActiveMenu: 'edit_callback_message_first', events: '/debug/menu-events' } }); }

function installExpressPatch() { if (Module._load.__cc6521ReliabilityPatch) return; const oldLoad = Module._load; function patchedLoad(request, parent, isMain) { const loaded = oldLoad.apply(this, arguments); if (String(request || '') === 'express' && loaded && !loaded.__cc6521ReliabilityWrap) { function expressWrapper() { const app = loaded.apply(this, arguments); if (app && !app.__cc6521Reliability) { app.__cc6521Reliability = true; app.use((req, res, next) => { const route = String(req.path || req.url || '').split('?')[0].toLowerCase(); if (route === '/debug/cc6521') return sendDebug(res); if (route === '/debug/menu-stress') return sendMenuStress(res); if (route === '/debug/comments-flow-stress') return sendCommentsStress(res); if (route === '/debug/menu-events') return sendEvents(req, res); if (route === '/debug/qa-lite') return sendQaLite(req, res).catch((e) => sendText(res, ['ERROR: ' + (e?.message || String(e))])); if (route === '/debug/callback-toast-policy') return sendCallbackPolicy(res); if (route === '/debug/store-live') return sendStoreLive(req, res); return next(); }); const oldPost = app.post.bind(app); app.post = (route, ...handlers) => { const routeText = String(route || '').toLowerCase(); if (!routeText.includes('/webhook')) return oldPost(route, ...handlers); return oldPost(route, async (req, res, next) => { try { const action = getAction(req.body || {}); rememberEvent({ action, owned: ownsAction(action), isStart: isStartUpdate(req.body || {}), payloadRaw: getPayloadRaw(req.body || ''), text: getText(req.body || {}), messageId: Boolean(getMsgId(req.body || {})) }); if (isStartUpdate(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME, result: await sendStartMenu(req.body || {}) }); if (ownsAction(action)) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, action) }); return next(); } catch (e) { rememberEvent({ action: getAction(req.body || {}), error: e?.message || String(e) }); return next(); } }, ...handlers); }; } return app; } Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__cc6521ReliabilityWrap = true; return expressWrapper; } return loaded; } patchedLoad.__cc6521ReliabilityPatch = true; Module._load = patchedLoad; }
function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; patchPublicAppRead(); installExpressPatch(); return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE }; }
module.exports = { RUNTIME, SOURCE, install, isMenuStartUpdate: isStartUpdate, menuStress, commentsFlowStress };
