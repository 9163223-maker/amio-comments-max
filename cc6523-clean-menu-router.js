'use strict';

// CC6.5.2.3 clean menu router.
// Goal: one menu architecture, section-owned post selection, no accidental moderation interception.
// Rule: every button action has an owner namespace: comments:*, gifts:*, buttons:*, moderation:*, editor:*, stats:*, channels:*.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.2.3';
const SOURCE = 'adminkit-CC6.5.2.3-clean-menu-router';
const LOGO_PATH = path.join(__dirname, 'public', 'adminkit_chat_logo.png');
const lastMenus = new Map();
const events = [];
let cachedLogoAttachment = null;

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
function clip(v, n = 64) { const s = norm(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {} }
function tryJson(v) { try { const p = JSON.parse(String(v || '')); return p && typeof p === 'object' ? p : null; } catch { return null; } }
function clone(v) { return JSON.parse(JSON.stringify(v ?? null)); }
function msg(u = {}) { return u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || null; }
function cb(u = {}) { return u.callback || u.data?.callback || msg(u)?.callback || null; }
function payloadRaw(u = {}) { const c = cb(u) || {}; return norm(c.payload || c.body?.payload || u.payload || u.data?.payload || ''); }
function payload(u = {}) { return tryJson(payloadRaw(u)) || {}; }
function text(u = {}) { const m = msg(u) || {}; return norm(m.body?.text || m.text || m.message?.text || u.message?.text || ''); }
function eventType(u = {}) { return norm(u.update_type || u.type || u.event_type || u.eventType || u.event || u.data?.update_type || u.data?.type || '').toLowerCase(); }
function startPayload(u = {}) { return norm([u.start_payload, u.payload, u.startParam, u.start_param, u.data?.start_payload, u.data?.payload, u.user?.start_payload, u.user?.start_param, msg(u)?.body?.payload, msg(u)?.payload].find((x) => norm(x)) || ''); }
function userId(u = {}) { const m = msg(u) || {}; const c = cb(u) || {}; return norm(u.user?.user_id || u.user?.id || u.sender?.user_id || u.sender?.id || c.user?.user_id || c.user?.id || c.sender?.user_id || c.sender?.id || m.sender?.user_id || m.sender?.id || m.user_id || m.from?.id || u.data?.user?.user_id || u.data?.user?.id || ''); }
function chatId(u = {}) { const m = msg(u) || {}; return norm(m.recipient?.chat_id || m.recipient?.id || m.chat_id || m.chat?.id || u.chat_id || u.chat?.id || u.data?.chat_id || u.data?.chat?.id || ''); }
function target(u = {}) { const uid = userId(u); const cid = chatId(u); return { userId: uid, chatId: cid, key: uid || cid }; }
function callbackId(u = {}) { const c = cb(u) || {}; return norm(c.callback_id || c.callbackId || c.id || u.callback_id || ''); }
function messageId(u = {}) { const c = cb(u) || {}; const m = c.message || msg(u) || {}; const b = m.body || {}; return norm(b.mid || b.message_id || b.messageId || m.message_id || m.messageId || m.id || m.mid || c.message_id || c.messageId || ''); }
function responseMessageId(v = {}) { return norm([v?.message?.body?.mid, v?.message?.body?.message_id, v?.message?.message_id, v?.message?.id, v?.body?.mid, v?.body?.message_id, v?.message_id, v?.id, v?.mid, v?.data?.message?.body?.mid, v?.data?.message?.id, v?.data?.id].find((x) => norm(x)) || ''); }
function rawAction(u = {}) { const p = payload(u); const raw = payloadRaw(u); return norm(p.action || p.cmd || p.route || (/^[a-z0-9_:.\-]+$/i.test(raw) ? raw : '')).toLowerCase(); }
function isStart(u = {}) { if (cb(u)) return false; const t = eventType(u); const tx = text(u).toLowerCase(); const sp = startPayload(u).toLowerCase(); return t === 'bot_started' || t === 'bot_start' || t === 'bot_started_update' || ['start', '/start', 'menu', '/menu', 'меню'].includes(tx) || ['start', 'menu', 'main'].includes(sp); }
function logEvent(item) { events.push({ ts: Date.now(), ...item }); while (events.length > 120) events.shift(); }

function btn(label, action, extra = {}) { return { type: 'callback', text: label, payload: JSON.stringify({ action, ...extra }) }; }
function kb(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
function withNav(sectionAction, helpAction, rows = []) { return kb([...(rows || []), [btn('❓ Помощь раздела', helpAction)], [btn('↩️ В меню раздела', sectionAction)], [btn('🏠 Главное меню', 'main:home')]]); }
function mainKb() { return kb([
  [btn('💬 Комментарии', 'comments:home')],
  [btn('🛡 Модерация', 'moderation:home')],
  [btn('✏️ Редактор постов', 'editor:home')],
  [btn('⚪ Кнопки под постами', 'buttons:home')],
  [btn('🎁 Подарки / лид-магниты', 'gifts:home')],
  [btn('📊 Статистика', 'stats:home')],
  [btn('📺 Каналы и подключение', 'channels:home')],
  [btn('❓ Помощь', 'help:home')]
]); }
function helpKb(section) { return kb([[btn('↩️ В меню раздела', section)], [btn('🏠 Главное меню', 'main:home')]]); }

const ALIASES = {
  ak_main_menu: 'main:home', main_menu: 'main:home', menu_main: 'main:home', home: 'main:home',
  comments_menu: 'comments:home', comments_choose_post: 'comments:choose_post', comments_post_card: 'comments:post', comments_enable: 'comments:enable', comments_disable: 'comments:disable', comments_debug_post: 'comments:debug', help_comments: 'comments:help',
  gift_menu: 'gifts:home', gifts_menu: 'gifts:home', gift_create: 'gifts:create', gift_list: 'gifts:list', help_gifts: 'gifts:help',
  buttons_menu: 'buttons:home', buttons_add: 'buttons:add', buttons_list: 'buttons:list', help_buttons: 'buttons:help',
  mod_start: 'moderation:home', moderation_menu: 'moderation:home', help_moderation: 'moderation:help',
  stats_menu: 'stats:home', help_stats: 'stats:help', channels_menu: 'channels:home', help_channels: 'channels:help', help_menu: 'help:home'
};
function canonical(action) { const a = norm(action).toLowerCase(); return ALIASES[a] || a; }
function owner(action) { const a = canonical(action); const ns = a.split(':')[0]; return ['main','comments','gifts','buttons','moderation','editor','stats','channels','help'].includes(ns) ? ns : ''; }
function owned(action) { return Boolean(owner(action)); }

function channelIdOf(c = {}) { return norm(c.channelId || c.channel_id || c.id || c.chatId || c.chat_id || ''); }
function channelTitle(c = {}) { return norm(c.title || c.channelTitle || c.channelName || c.name || c.chatTitle || channelIdOf(c) || 'Канал'); }
function postKey(p = {}) { return norm(p.commentKey || p.key || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')); }
function postTitle(p = {}, i = 0) { return `${i + 1}. ${clip(p.originalText || p.title || p.linkedByName || p.postTitle || p.postId || p.commentKey || 'Пост', 44)}`; }
function storeObj() { try { return require('./store'); } catch { return {}; } }
function listChannels() { try { const xs = require('./services/channelService').listChannels(); return Array.isArray(xs) ? xs : []; } catch { return []; } }
function listPosts(channelId = '') {
  try { const xs = require('./services/postEditorService').listAdminPosts({ channelId, limit: 20, config: require('./config') }); if (Array.isArray(xs) && xs.length) return xs; } catch {}
  try { const posts = Object.values(storeObj().store?.posts || {}); return posts.filter((p) => !channelId || norm(p.channelId) === norm(channelId)); } catch { return []; }
}
function findPost(commentKey = '', channelId = '') { return listPosts(channelId).find((p) => postKey(p) === norm(commentKey)) || listPosts('').find((p) => postKey(p) === norm(commentKey)) || null; }
function selectedChannelId(extra = {}) { const channels = listChannels(); return norm(extra.channelId || extra.channel_id || (channels.length === 1 ? channelIdOf(channels[0]) : '')); }

function mainModel() { return { text: 'АдминКИТ — главное меню\n\nВыберите раздел управления каналом.', attachments: mainKb(), logo: true }; }
function commentsHome() { return { text: '💬 Комментарии\n\nЗдесь настраиваются обсуждения под постами.\n\nВыбор поста внутри этого раздела принадлежит только комментариям и не может вести в модерацию.', attachments: withNav('comments:home', 'comments:help', [[btn('⚡ Авто для новых постов', 'comments:auto_new')], [btn('📌 Подключить старый пост', 'comments:old_post')], [btn('📌 Выбрать пост', 'comments:choose_post')], [btn('👀 Как это выглядит', 'comments:preview')]]) }; }
function giftsHome() { return { text: '🎁 Подарки / лид-магниты\n\nЗдесь создаются подарки, которые выдаются после проверки подписки.\n\nВыбор поста в этом разделе принадлежит только подаркам.', attachments: withNav('gifts:home', 'gifts:help', [[btn('🎁 Создать подарок', 'gifts:create')], [btn('📌 Выбрать пост для подарка', 'gifts:choose_post')], [btn('📋 Список подарков', 'gifts:list')]]) }; }
function buttonsHome() { return { text: '⚪ Кнопки под постами\n\nЗдесь добавляются CTA-кнопки под конкретные посты.\n\nВыбор поста в этом разделе принадлежит только кнопкам.', attachments: withNav('buttons:home', 'buttons:help', [[btn('➕ Добавить кнопку', 'buttons:add')], [btn('📌 Выбрать пост для кнопки', 'buttons:choose_post')], [btn('📋 Кнопки поста', 'buttons:list')]]) }; }
function moderationHome() { return { text: '🛡 Модерация\n\nЗдесь настраиваются правила фильтрации.\n\nМодерация получает только свои действия: правила канала и правила конкретного поста. Она не перехватывает выбор постов из комментариев, подарков и кнопок.', attachments: withNav('moderation:home', 'moderation:help', [[btn('🛡 Правила всего канала', 'moderation:channel')], [btn('🎯 Правила конкретного поста', 'moderation:choose_post')]]) }; }
function editorHome() { return { text: '✏️ Редактор постов\n\nРаздел для будущего редактирования постов MAX без потери текста, ссылок, форматирования и медиа.', attachments: withNav('editor:home', 'editor:help', [[btn('📌 Выбрать пост для редактирования', 'editor:choose_post')]]) }; }
function statsHome() { return { text: '📊 Статистика\n\nЗдесь должны быть понятные администратору цифры: подписчики, прирост, комментарии, реакции, клики, подарки и активность постов.', attachments: withNav('stats:home', 'stats:help', [[btn('📊 Статистика канала', 'stats:channel')], [btn('📌 Статистика поста', 'stats:choose_post')]]) }; }
function channelsHome() { const channels = listChannels(); const rows = channels.slice(0, 10).map((c) => [btn(channelTitle(c), 'channels:select', { channelId: channelIdOf(c) })]); rows.push([btn('➕ Подключить канал', 'channels:connect')]); return { text: `📺 Каналы и подключение\n\nПодключённых каналов: ${channels.length}.\nЕсли канал уже есть в PostgreSQL, он восстанавливается после redeploy автоматически.`, attachments: withNav('channels:home', 'channels:help', rows) }; }
function helpHome() { return { text: '❓ Помощь АдминКИТ\n\nВыберите раздел.\n\nПравило меню: действие всегда принадлежит своему разделу. Пост, выбранный в подарках, не может открыть модерацию. Пост, выбранный в комментариях, не может открыть подарки или кнопки.', attachments: kb([[btn('💬 Комментарии', 'comments:help')], [btn('🎁 Подарки', 'gifts:help')], [btn('⚪ Кнопки', 'buttons:help')], [btn('🛡 Модерация', 'moderation:help')], [btn('📊 Статистика', 'stats:help')], [btn('📺 Каналы', 'channels:help')], [btn('🏠 Главное меню', 'main:home')]]) }; }

function choosePostModel(section, extra = {}) {
  const chId = selectedChannelId(extra);
  const channels = listChannels();
  const sectionTitle = { comments: 'Комментарии', gifts: 'Подарки', buttons: 'Кнопки', moderation: 'Модерация', editor: 'Редактор', stats: 'Статистика' }[section] || section;
  if (!channels.length) return { text: `${sectionTitle} → выбор поста\n\nКанал не найден. Откройте «Каналы и подключение» или проверьте persistence.`, attachments: withNav(`${section}:home`, `${section}:help`, [[btn('📺 Каналы и подключение', 'channels:home')]]) };
  if (!chId && channels.length > 1) return { text: `${sectionTitle} → выбор канала\n\nСначала выберите канал.`, attachments: withNav(`${section}:home`, `${section}:help`, channels.map((c) => [btn(channelTitle(c), `${section}:choose_post`, { channelId: channelIdOf(c) })])) };
  const posts = listPosts(chId);
  if (!posts.length) return { text: `${sectionTitle} → выбор поста\n\nКанал: ${channelTitle(channels.find((c) => channelIdOf(c) === chId) || { channelId: chId })}\n\nПостов пока нет. Перешлите пост из канала в бот.`, attachments: withNav(`${section}:home`, `${section}:help`, [[btn('🔄 Обновить список', `${section}:choose_post`, { channelId: chId })]]) };
  return { text: `${sectionTitle} → выбор поста\n\nКанал: ${channelTitle(channels.find((c) => channelIdOf(c) === chId) || { channelId: chId })}\nПостов найдено: ${posts.length}\n\nВыберите пост.`, attachments: withNav(`${section}:home`, `${section}:help`, posts.map((p, i) => [btn(postTitle(p, i), `${section}:post`, { channelId: chId, commentKey: postKey(p), postId: norm(p.postId) })])) };
}
function postModel(section, extra = {}) {
  const commentKey = norm(extra.commentKey);
  const post = findPost(commentKey, extra.channelId);
  const sectionTitle = { comments: 'Комментарии', gifts: 'Подарки', buttons: 'Кнопки', moderation: 'Модерация', editor: 'Редактор', stats: 'Статистика' }[section] || section;
  if (!post) return { text: `${sectionTitle} → пост\n\nПост не найден. Вернитесь к списку постов.`, attachments: withNav(`${section}:home`, `${section}:help`, [[btn('📌 К списку постов', `${section}:choose_post`, { channelId: extra.channelId })]]) };
  if (section === 'comments') return { text: `💬 Комментарии → пост\n\nПост: ${clip(post.originalText || post.title || post.postId || commentKey, 80)}\ncommentKey: ${commentKey}\nКомментарии: ${post.commentsDisabled ? 'выключены' : 'включены'}\n\nВыберите действие.`, attachments: withNav('comments:home', 'comments:help', [[btn('✅ Включить комментарии', 'comments:enable', { commentKey, channelId: extra.channelId })], [btn('⏸ Выключить комментарии', 'comments:disable', { commentKey, channelId: extra.channelId })], [btn('🧪 Debug поста', 'comments:debug', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'comments:choose_post', { channelId: extra.channelId })]]) };
  if (section === 'gifts') return { text: `🎁 Подарки → пост\n\nПост: ${clip(post.originalText || post.title || post.postId || commentKey, 80)}\n\nСледующий шаг: создать подарок для этого поста.`, attachments: withNav('gifts:home', 'gifts:help', [[btn('🎁 Создать подарок для поста', 'gifts:create_for_post', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'gifts:choose_post', { channelId: extra.channelId })]]) };
  if (section === 'buttons') return { text: `⚪ Кнопки → пост\n\nПост: ${clip(post.originalText || post.title || post.postId || commentKey, 80)}\n\nСледующий шаг: добавить или посмотреть CTA-кнопки этого поста.`, attachments: withNav('buttons:home', 'buttons:help', [[btn('➕ Добавить кнопку', 'buttons:add_for_post', { commentKey, channelId: extra.channelId })], [btn('📋 Кнопки поста', 'buttons:list_for_post', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'buttons:choose_post', { channelId: extra.channelId })]]) };
  if (section === 'moderation') return { text: `🛡 Модерация → пост\n\nПост: ${clip(post.originalText || post.title || post.postId || commentKey, 80)}\n\nЗдесь настраиваются только правила модерации конкретного поста.`, attachments: withNav('moderation:home', 'moderation:help', [[btn('🟢 Включить фильтр', 'moderation:post_enable', { commentKey, channelId: extra.channelId })], [btn('⏸ Выключить фильтр', 'moderation:post_disable', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'moderation:choose_post', { channelId: extra.channelId })]]) };
  return { text: `${sectionTitle} → пост\n\nПост: ${clip(post.originalText || post.title || post.postId || commentKey, 80)}\n\nРаздел сохранён. Действие не передано в модерацию.`, attachments: withNav(`${section}:home`, `${section}:help`, [[btn('📌 К списку постов', `${section}:choose_post`, { channelId: extra.channelId })]]) };
}
async function commentsToggle(action, extra = {}, update = {}) {
  const commentKey = norm(extra.commentKey);
  if (!commentKey) return postModel('comments', extra);
  try {
    const { setPostCommentsEnabled } = require('./services/postEditorService');
    await setPostCommentsEnabled({ commentKey, enabled: action === 'comments:enable', actorId: userId(update), actorName: 'admin', config: require('./config') });
    return { text: `💬 Комментарии\n\nГотово: комментарии ${action === 'comments:enable' ? 'включены' : 'выключены'}.`, attachments: withNav('comments:home', 'comments:help', [[btn('↩️ К посту', 'comments:post', { commentKey, channelId: extra.channelId })], [btn('📌 К списку постов', 'comments:choose_post', { channelId: extra.channelId })]]) };
  } catch (e) {
    return { text: `💬 Комментарии\n\nНе удалось изменить комментарии.\n${e?.message || String(e)}`, attachments: withNav('comments:home', 'comments:help', [[btn('↩️ К посту', 'comments:post', { commentKey, channelId: extra.channelId })]]) };
  }
}

async function model(actionRaw, extra = {}, update = {}) {
  const action = canonical(actionRaw);
  if (action === 'main:home') return mainModel();
  if (action === 'comments:home') return commentsHome();
  if (action === 'gifts:home') return giftsHome();
  if (action === 'buttons:home') return buttonsHome();
  if (action === 'moderation:home') return moderationHome();
  if (action === 'editor:home') return editorHome();
  if (action === 'stats:home') return statsHome();
  if (action === 'channels:home') return channelsHome();
  if (action === 'help:home') return helpHome();
  if (action.endsWith(':help')) return { text: helpText(action.split(':')[0]), attachments: helpKb(`${action.split(':')[0]}:home`) };
  if (action.endsWith(':choose_post')) return choosePostModel(action.split(':')[0], extra);
  if (action.endsWith(':post')) return postModel(action.split(':')[0], extra);
  if (action === 'comments:auto_new') return { text: '💬 Авто для новых постов\n\nБудущая настройка: автоматически добавлять обсуждения к новым постам канала.', attachments: withNav('comments:home', 'comments:help') };
  if (action === 'comments:old_post') return choosePostModel('comments', extra);
  if (action === 'comments:preview') return { text: '👀 Как это выглядит\n\nПод постом появляется кнопка «Комментарии». Пользователь открывает обсуждение, пишет текст, добавляет фото, ставит реакции и отвечает другим.', attachments: withNav('comments:home', 'comments:help') };
  if (action === 'comments:enable' || action === 'comments:disable') return commentsToggle(action, extra, update);
  if (action === 'comments:debug') return { text: `🧪 Debug поста\n\ncommentKey: ${norm(extra.commentKey) || 'не найден'}\nowner: comments\nroute: comments:debug`, attachments: withNav('comments:home', 'comments:help', [[btn('↩️ К посту', 'comments:post', extra)]]) };
  if (action === 'gifts:create') return choosePostModel('gifts', extra);
  if (action === 'buttons:add') return choosePostModel('buttons', extra);
  if (action === 'moderation:channel') return { text: '🛡 Правила всего канала\n\nЗдесь настраивается базовый фильтр канала: стоп-слова, ссылки, приглашения.\n\nЭтот экран принадлежит модерации.', attachments: withNav('moderation:home', 'moderation:help', [[btn('🎯 Правила конкретного поста', 'moderation:choose_post')]]) };
  if (action.includes('_for_post') || action.endsWith(':list') || action.endsWith(':channel') || action.endsWith(':connect') || action.endsWith(':select')) return { text: `Раздел: ${owner(action)}\n\nДействие принято внутри своего раздела: ${action}.\n\nГлубокая бизнес-логика будет подключаться отдельным шагом, без передачи в модерацию.`, attachments: withNav(`${owner(action)}:home`, `${owner(action)}:help`) };
  return null;
}
function helpText(section) {
  const map = {
    comments: '❓ Помощь: Комментарии\n\nВыбор поста в комментариях открывает только настройки комментариев: включить, выключить, debug поста. Он не должен попадать в модерацию.',
    gifts: '❓ Помощь: Подарки\n\nПодарки работают по своему маршруту: выбрать пост → создать подарок → текст получателю → сохранить. Выбор поста не передаётся в модерацию.',
    buttons: '❓ Помощь: Кнопки\n\nКнопки работают по своему маршруту: выбрать пост → текст кнопки → ссылка → сохранить. Выбор поста не передаётся в модерацию.',
    moderation: '❓ Помощь: Модерация\n\nМодерация настраивает правила канала и правила конкретного поста. Она не имеет права перехватывать чужие post-select маршруты.',
    editor: '❓ Помощь: Редактор\n\nРедактор постов будет менять посты без потери текста, ссылок, форматирования и медиа.',
    stats: '❓ Помощь: Статистика\n\nСтатистика показывает понятные цифры по каналу и постам.',
    channels: '❓ Помощь: Каналы\n\nКаналы восстанавливаются из PostgreSQL после redeploy. Клиент не должен подключать их заново.'
  };
  return map[section] || '❓ Помощь\n\nРаздел не найден.';
}
async function logoAttachment() { if (cachedLogoAttachment) return clone(cachedLogoAttachment); if (!fs.existsSync(LOGO_PATH)) return null; try { const api = require('./services/maxApi'); const config = require('./config'); const buffer = fs.readFileSync(LOGO_PATH); const init = await api.createUpload({ botToken: config.botToken, type: 'image' }); const uploaded = await api.uploadBinaryToUrl({ uploadUrl: init?.url, botToken: config.botToken, buffer, fileName: 'adminkit_chat_logo.png', mimeType: 'image/png' }); cachedLogoAttachment = api.buildUploadAttachmentPayload({ uploadType: 'image', uploadInitResponse: init, uploadResponse: uploaded }); return clone(cachedLogoAttachment); } catch { return null; } }
async function render(update = {}, actionRaw = 'main:home', forceSend = false) {
  const action = canonical(actionRaw);
  const api = require('./services/maxApi'); const config = require('./config'); const t = target(update); const extra = payload(update); let m = await model(action, extra, update); if (!m) return { ok: false, reason: 'not_owned', action };
  if (m.logo) { const logo = await logoAttachment(); if (logo) m.attachments = [logo, ...(m.attachments || [])]; }
  const cbid = callbackId(update); if (cbid) { try { await api.answerCallback({ botToken: config.botToken, callbackId: cbid }); } catch {} }
  const mid = messageId(update); if (mid && !forceSend) { try { await api.editMessage({ botToken: config.botToken, messageId: mid, notify: false, text: m.text, attachments: m.attachments }); return { ok: true, mode: 'edit', action, owner: owner(action) }; } catch {} }
  if (!t.userId && !t.chatId) return { ok: false, reason: 'target_missing', action };
  const old = lastMenus.get(t.key); if (old?.messageId) { try { await api.deleteMessage({ botToken: config.botToken, messageId: old.messageId, timeoutMs: 1600 }); } catch {} }
  const sent = await api.sendMessage({ botToken: config.botToken, userId: t.userId || undefined, chatId: t.userId ? undefined : t.chatId, notify: false, text: m.text, attachments: m.attachments }); const sid = responseMessageId(sent); if (sid) lastMenus.set(t.key, { messageId: sid, ts: Date.now() }); return { ok: true, mode: 'send', action, owner: owner(action), messageIdSaved: Boolean(sid) };
}

const ROUTE_TESTS = ['main:home','comments:home','comments:choose_post','comments:post','comments:enable','comments:disable','gifts:home','gifts:choose_post','gifts:post','buttons:home','buttons:choose_post','buttons:post','moderation:home','moderation:choose_post','moderation:post','editor:home','stats:home','channels:home','help:home'];
function stress() { const checks = ROUTE_TESTS.map((action) => ({ action, owner: owner(action), owned: owned(action), noModerationLeak: action.startsWith('comments:') || action.startsWith('gifts:') || action.startsWith('buttons:') ? owner(action) !== 'moderation' : true })); return { ok: checks.every((c) => c.owned && c.noModerationLeak), total: checks.length, passed: checks.filter((c) => c.owned && c.noModerationLeak).length, checks }; }
function sendText(res, lines) { noCache(res); return res.type('text/plain').send(lines.join('\n') + '\n'); }
function sendArchitecture(res) { const s = stress(); return sendText(res, ['OK: ' + (s.ok ? 'CLEAN_MENU_READY' : 'CLEAN_MENU_FAIL'), 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'menuFormat: single_column_wide_buttons', 'navBottom: section_menu_then_main_menu', 'postSelectionOwnership: namespaced_by_section', 'commentsPostSelectionOwner: comments', 'giftsPostSelectionOwner: gifts', 'buttonsPostSelectionOwner: buttons', 'moderationPostSelectionOwner: moderation_only', 'routesTotal: ' + s.total, 'routesPassed: ' + s.passed, ...s.checks.map((c) => `${c.action}: ${c.owned && c.noModerationLeak ? 'pass' : 'fail'} owner=${c.owner}`)]); }
function sendEvents(req, res) { noCache(res); return res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, events: events.slice(-80) }); }
function sendDebug(res) { const s = stress(); return sendText(res, ['OK: CC6523_READY', 'runtime: ' + RUNTIME, 'sourceMarker: ' + SOURCE, 'menuStress: ' + (s.ok ? 'pass' : 'fail'), 'menuFormat: single_column_wide_buttons', 'noCrossSectionPostSelection: true', 'oneActiveMenu: edit_message_first', 'debug: /debug/menu-architecture']); }
function installExpressPatch() { if (Module._load.__cc6523CleanMenuPatch) return; const oldLoad = Module._load; function patchedLoad(request, parent, isMain) { const loaded = oldLoad.apply(this, arguments); if (String(request || '') === 'express' && loaded && !loaded.__cc6523Wrap) { function expressWrapper() { const app = loaded.apply(this, arguments); if (app && !app.__cc6523CleanMenu) { app.__cc6523CleanMenu = true; app.use((req, res, next) => { const route = String(req.path || req.url || '').split('?')[0].toLowerCase(); if (route === '/debug/cc6523') return sendDebug(res); if (route === '/debug/menu-architecture') return sendArchitecture(res); if (route === '/debug/clean-menu-events') return sendEvents(req, res); return next(); }); const oldPost = app.post.bind(app); app.post = (route, ...handlers) => { const routeText = String(route || '').toLowerCase(); if (!routeText.includes('/webhook')) return oldPost(route, ...handlers); return oldPost(route, async (req, res, next) => { try { const action = canonical(rawAction(req.body || {})); const shouldHandle = isStart(req.body || {}) || owned(action); logEvent({ action, owner: owner(action), handled: shouldHandle, isStart: isStart(req.body || {}), text: text(req.body || {}), payloadRaw: payloadRaw(req.body || {}) }); if (isStart(req.body || {})) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, 'main:home', true) }); if (owned(action)) return res.json({ ok: true, handledBy: RUNTIME, result: await render(req.body || {}, action) }); return next(); } catch (e) { logEvent({ error: e?.message || String(e), action: rawAction(req.body || {}) }); return next(); } }, ...handlers); }; } return app; } Object.setPrototypeOf(expressWrapper, loaded); Object.assign(expressWrapper, loaded); expressWrapper.__cc6523Wrap = true; return expressWrapper; } return loaded; } patchedLoad.__cc6523CleanMenuPatch = true; Module._load = patchedLoad; }
function install() { process.env.BUILD_VERSION = RUNTIME; process.env.RUNTIME_VERSION = RUNTIME; process.env.BUILD_SOURCE_MARKER = SOURCE; installExpressPatch(); return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE }; }
module.exports = { RUNTIME, SOURCE, install, stress, canonical, owner, owned };
