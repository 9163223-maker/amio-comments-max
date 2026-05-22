'use strict';

const store = require('./store');
const giftService = require('./services/giftService');

const RUNTIME = 'CC8.0.19-GIFTS-FLOW-HANDOFF-SILENT';
const MAX_POSTS = 8;

const CLEAN_GIFT_ACTIONS = [
  'admin_section_gifts',
  'gift_admin_recent_posts',
  'gift_admin_channel_pick',
  'gift_admin_select_post',
  'gift_admin_show_current',
  'gift_admin_start_create',
  'gift_admin_create_from_target',
  'gift_admin_pick_file'
];

function clean(value) { return String(value || '').trim(); }
function n(value) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function safeCall(fn, fallback) { try { return fn(); } catch { return fallback; } }
function short(value, max = 72) {
  const s = clean(value).replace(/\s+/g, ' ');
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trim() + '…';
}
function button(menu, text, action, extra) { return menu.button(text, action, extra || {}); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function footer(menu) { return [[button(menu, '🎁 В начало подарков', 'admin_section_gifts')], [button(menu, '🏠 Главное меню', 'admin_section_main')]]; }
function screen(menu, id, title, lines, rows) {
  return { id, text: [title, '', ...(lines || [])].filter(Boolean).join('\n'), attachments: keyboard(menu, rows || footer(menu)) };
}
function getSetup(userId = '') { return safeCall(() => store.getSetupState(clean(userId)), {}) || {}; }
function findPost(commentKey = '') {
  const key = clean(commentKey);
  if (!key) return null;
  return safeCall(() => store.getPost(key), null) || safeCall(() => array(store.getPostsList()).find((item) => clean(item && item.commentKey) === key), null) || null;
}
function channelTitle(post = {}) {
  return clean(post.channelTitle || post.channelName || post.chatTitle || post.title || post.name || post.channelId || 'Канал');
}
function postTitle(post = {}) {
  return short(post.originalText || post.postText || post.text || post.caption || post.postId || post.messageId || post.commentKey || 'Пост без текста', 58);
}
function postTime(post = {}) {
  const ts = n(post.updatedAt || post.createdAt || post.ts || 0);
  if (!ts) return '';
  try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); } catch { return ''; }
}
function targetRecord(post = {}) {
  return {
    channelId: clean(post.channelId),
    channelTitle: channelTitle(post),
    postId: clean(post.postId),
    messageId: clean(post.messageId),
    commentKey: clean(post.commentKey),
    originalText: clean(post.originalText || post.postText || post.text || ''),
    linkedAt: Date.now()
  };
}
function listAllPosts() {
  const seen = new Set();
  return safeCall(() => array(store.getPostsList()), [])
    .filter((post) => post && clean(post.commentKey) && clean(post.channelId) && clean(post.postId))
    .filter((post) => {
      const key = clean(post.commentKey) || [clean(post.channelId), clean(post.postId)].join(':');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => n(b.updatedAt || b.createdAt || b.ts) - n(a.updatedAt || a.createdAt || a.ts));
}
function listPosts(channelId = '') {
  const channel = clean(channelId);
  return listAllPosts().filter((post) => !channel || clean(post.channelId) === channel).slice(0, MAX_POSTS);
}
function listChannelsFromPosts() {
  const map = new Map();
  listAllPosts().forEach((post) => {
    const id = clean(post.channelId);
    if (!id || map.has(id)) return;
    map.set(id, channelTitle(post));
  });
  return Array.from(map.entries()).map(([channelId, title]) => ({ channelId, title }));
}
function getStoredTarget(userId = '') {
  const state = getSetup(userId);
  const target = state.giftTargetPost || state.commentTargetPost || null;
  const post = target && target.commentKey ? findPost(target.commentKey) : null;
  return post || target || null;
}
function bindTarget(userId = '', post = {}, options = {}) {
  const uid = clean(userId);
  const target = targetRecord(post);
  if (!uid || !target.commentKey) return target;
  safeCall(() => {
    const prev = getSetup(uid);
    const adminUi = {
      ...(prev.adminUi || {}),
      section: 'gifts',
      backAction: 'admin_section_gifts',
      rootAction: 'admin_section_gifts',
      selectMode: 'gifts'
    };
    const patch = {
      giftTargetPost: target,
      commentTargetPost: target,
      adminUi,
      activeAdminUi: adminUi
    };
    if (!options.keepFlow) {
      patch.giftFlow = null;
      patch.activeAdminFlowKind = '';
    }
    store.setSetupState(uid, patch);
  }, null);
  return target;
}
function getCampaignForTarget(targetPost = null) {
  if (!targetPost || (!targetPost.channelId && !targetPost.commentKey)) return null;
  return safeCall(() => giftService.findGiftCampaignForPost({
    channelId: clean(targetPost.channelId),
    postId: clean(targetPost.postId),
    commentKey: clean(targetPost.commentKey)
  }), null) || null;
}
function countCampaigns() { return safeCall(() => array(giftService.listGiftCampaigns()).length, 0); }
function campaignSummary(campaign = null) {
  if (!campaign) return 'Подарок для выбранного поста пока не создан.';
  const title = clean(campaign.title || campaign.id || 'Подарок');
  const delivery = campaign.giftAttachment ? 'файл/вложение' : (campaign.giftUrl ? 'ссылка' : 'не заполнено');
  const message = clean(campaign.giftMessage || 'по умолчанию');
  return [
    `Подарок: ${title}`,
    `Выдача: ${delivery}`,
    `Сообщение получателю: ${message}`,
    `Статус: ${campaign.enabled === false ? 'выключен' : 'включён'}`
  ].join('\n');
}
function flowSummary(flow = null) {
  if (!flow) return '';
  const draft = flow.draft || {};
  const step = flow.awaitingConfirmation ? '4/4 — подтверждение' : `${Number(flow.stepIndex || 0) + 2}/4`;
  const asset = draft.giftAttachment ? 'файл загружен' : (draft.giftUrl ? 'ссылка добавлена' : 'подарок ещё не добавлен');
  return [`Черновик: шаг ${step}`, `Материал: ${asset}`].join('\n');
}
function targetLines(targetPost = null) {
  if (!targetPost || !targetPost.commentKey) return ['Пост пока не выбран.'];
  return [
    `Канал: ${channelTitle(targetPost)}`,
    `Пост: ${postTitle(targetPost)}`,
    `Post ID: ${short(targetPost.postId || '—', 80)}`
  ];
}
function defaultSubscribeUrl(channelId = '') {
  const id = clean(channelId);
  return id ? `https://max.ru/${id}` : '';
}
function buildGiftFlowFromTarget(targetPost = null, previousFlow = null) {
  const target = targetRecord(targetPost || {});
  const previousDraft = previousFlow && typeof previousFlow === 'object' ? (previousFlow.draft || {}) : {};
  const id = clean(previousDraft.id) || `gift_${Date.now().toString(36)}`;
  const title = clean(previousDraft.title) || `Подарок к посту (${short(target.originalText || target.postId || 'пост', 48)})`;
  return {
    mode: 'gift_wizard',
    stepIndex: 0,
    awaitingConfirmation: false,
    targetPost: target,
    startedAt: Date.now(),
    runtimeVersion: RUNTIME,
    draft: {
      ...previousDraft,
      id,
      title,
      channelId: target.channelId,
      requiredChatId: target.channelId,
      postIds: target.postId ? [target.postId] : [],
      commentKey: target.commentKey,
      subscribeUrl: clean(previousDraft.subscribeUrl) || defaultSubscribeUrl(target.channelId),
      subscribeUrlAutoFilled: true,
      giftUrl: clean(previousDraft.giftUrl),
      giftAttachment: previousDraft.giftAttachment || null,
      giftMessage: clean(previousDraft.giftMessage),
      deliverToDm: true
    }
  };
}
function setGiftFlow(userId = '', flow = null) {
  const uid = clean(userId);
  if (!uid || !flow) return null;
  safeCall(() => {
    const prev = getSetup(uid);
    const adminUi = {
      ...(prev.adminUi || {}),
      section: 'gifts',
      backAction: 'admin_section_gifts',
      rootAction: 'admin_section_gifts',
      selectMode: 'gifts'
    };
    store.setSetupState(uid, {
      giftFlow: flow,
      commentAdminFlow: null,
      postEditFlow: null,
      activeAdminFlowKind: 'gift',
      adminUi,
      activeAdminUi: adminUi
    });
  }, null);
  return flow;
}
function startRows(menu, targetPost = null) {
  const key = clean(targetPost && targetPost.commentKey);
  return [
    [button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')],
    [button(menu, '❌ Отменить', 'gift_admin_cancel')],
    [button(menu, '📌 Выбрать другой пост', 'gift_admin_recent_posts', { page: 0 })],
    ...(key ? [[button(menu, '🎁 В начало подарков', 'admin_section_gifts')]] : []),
    [button(menu, '🏠 Главное меню', 'admin_section_main')]
  ];
}
function homeRows(menu, targetPost = null, flow = null) {
  const existing = getCampaignForTarget(targetPost);
  const rows = [];
  if (flow) {
    rows.push([button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')]);
    rows.push([button(menu, '❌ Отменить черновик', 'gift_admin_cancel')]);
  } else if (targetPost && targetPost.commentKey && existing) {
    rows.push([button(menu, '🔁 Заменить подарок', 'gift_admin_replace_existing')]);
    rows.push([button(menu, '🗑 Удалить подарок', 'gift_admin_delete_existing')]);
    rows.push([button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')]);
    rows.push([button(menu, '📌 Выбрать другой пост', 'gift_admin_recent_posts', { page: 0 })]);
  } else if (targetPost && targetPost.commentKey) {
    rows.push([button(menu, '🎁 Создать подарок', 'gift_admin_start_create')]);
    rows.push([button(menu, '📌 Выбрать другой пост', 'gift_admin_recent_posts', { page: 0 })]);
    rows.push([button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')]);
  } else {
    rows.push([button(menu, '📌 Выбрать пост для подарка', 'gift_admin_recent_posts', { page: 0 })]);
    rows.push([button(menu, '🧾 Текущий подарок', 'gift_admin_show_current')]);
  }
  rows.push([button(menu, '🏠 Главное меню', 'admin_section_main')]);
  return rows;
}
async function home(menu, payload = {}, ctx = {}) {
  const state = getSetup(ctx.userId);
  const target = getStoredTarget(ctx.userId);
  const flow = state.giftFlow || null;
  const existing = getCampaignForTarget(target);
  const lines = [
    'Быстрый Clean Core экран подарков / лид-магнитов. Он не запускает тяжёлый мастер и не перепатчивает пост при простом открытии.',
    '',
    ...targetLines(target),
    '',
    flow ? flowSummary(flow) : campaignSummary(existing),
    '',
    `Всего сохранённых подарков: ${countCampaigns()}`,
    '',
    'Создание, сохранение, замена и удаление подарка остаются в рабочем мастере. Этот экран быстро открывает раздел, выбирает пост, показывает состояние и теперь быстро стартует мастер.'
  ];
  if (payload.note) lines.unshift(clean(payload.note), '');
  return screen(menu, 'gifts_clean_home', '🎁 Подарки / лид-магниты', lines, homeRows(menu, target, flow));
}
async function channelPicker(menu, payload = {}, ctx = {}) {
  const channels = listChannelsFromPosts().slice(0, 12);
  const rows = channels.map((item, index) => [button(menu, `${index + 1}. ${short(item.title || item.channelId, 52)}`, 'gift_admin_channel_pick', { channelId: item.channelId })]);
  if (!rows.length) rows.push([button(menu, 'Пока нет каналов в памяти', 'admin_section_gifts')]);
  rows.push(...footer(menu));
  return screen(menu, 'gifts_clean_channel_picker', '📺 Канал для подарка', ['Выберите канал. После этого бот покажет последние посты этого канала.', '', 'Если нужного канала нет — перешлите боту любой пост из канала.'], rows);
}
async function picker(menu, payload = {}, ctx = {}) {
  const page = Math.max(0, Number(payload.page || 0));
  const channelId = clean(payload.channelId || '');
  if (!channelId && listChannelsFromPosts().length > 1 && clean(payload.skipChannels || '') !== '1') {
    return channelPicker(menu, payload, ctx);
  }
  const posts = listPosts(channelId);
  const rows = posts.map((post, index) => [button(menu, `${index + 1 + page * MAX_POSTS}. ${postTitle(post)}`, 'gift_admin_select_post', { commentKey: clean(post.commentKey), channelId })]);
  if (!rows.length) rows.push([button(menu, 'Пока нет постов в памяти', 'admin_section_gifts')]);
  rows.push(...footer(menu));
  const lines = [
    channelId ? `Канал: ${channelTitle(posts[0] || { channelId })}` : 'Выберите пост из последних сохранённых постов.',
    'Список строится из store/cache без live-запросов к MAX.'
  ];
  if (posts.length) {
    lines.push('');
    posts.forEach((post, index) => {
      const meta = [channelTitle(post), postTime(post)].filter(Boolean).join(' · ');
      lines.push(`${index + 1}. ${postTitle(post)}${meta ? '\n   ' + meta : ''}`);
    });
  } else {
    lines.push('', 'Пока нет сохранённых постов. Перешлите публикацию боту или подключите канал.');
  }
  return screen(menu, 'gifts_clean_picker', '📌 Выбор поста для подарка', lines, rows);
}
async function selectPost(menu, payload = {}, ctx = {}) {
  const post = findPost(payload.commentKey || '');
  if (!post || !post.commentKey) {
    return screen(menu, 'gifts_clean_not_found', '🎁 Подарки / лид-магниты', ['Пост не найден в store/cache.', 'Выберите другой пост или перешлите публикацию боту.'], [[button(menu, '📌 Выбрать пост', 'gift_admin_recent_posts', { page: 0 })], ...footer(menu)]);
  }
  bindTarget(ctx.userId, post);
  return home(menu, { note: 'Пост для подарка выбран.' }, ctx);
}
async function startCreate(menu, payload = {}, ctx = {}) {
  const state = getSetup(ctx.userId);
  const target = getStoredTarget(ctx.userId);
  if (!target || !target.commentKey || !target.channelId || !target.postId) {
    return picker(menu, { page: 0 }, ctx);
  }
  const existing = getCampaignForTarget(target);
  if (existing) {
    return home(menu, { note: 'Для этого поста уже сохранён подарок. Можно заменить или удалить его.' }, ctx);
  }
  const flow = buildGiftFlowFromTarget(target, state.giftFlow || null);
  bindTarget(ctx.userId, target, { keepFlow: true });
  setGiftFlow(ctx.userId, flow);
  return screen(menu, 'gifts_clean_start_create', '🎁 Создание подарка', [
    'Шаг 2/4. Пришлите файл подарка ИЛИ вставьте ссылку на подарок.',
    '',
    'Этот экран открыт через быстрый Clean Core. Дальше загрузка файла, ссылка, текст получателю и сохранение идут через существующий рабочий мастер, чтобы не потерять функционал.',
    '',
    ...targetLines(target),
    '',
    'После загрузки или ссылки бот сам перейдёт к следующему шагу.'
  ], startRows(menu, target));
}
async function showCurrent(menu, payload = {}, ctx = {}) {
  const state = getSetup(ctx.userId);
  const target = getStoredTarget(ctx.userId);
  const flow = state.giftFlow || null;
  const campaign = getCampaignForTarget(target);
  const lines = [];
  if (flow) {
    lines.push('Есть незавершённый черновик подарка.', '', ...targetLines(target), '', flowSummary(flow));
  } else if (campaign) {
    lines.push('Для выбранного поста уже сохранён подарок.', '', ...targetLines(target), '', campaignSummary(campaign));
  } else if (target && target.commentKey) {
    lines.push('Для выбранного поста ещё нет сохранённого подарка.', '', ...targetLines(target), '', 'Нажмите «Создать подарок», чтобы открыть рабочий мастер.');
  } else {
    lines.push('Пост для подарка пока не выбран.', '', 'Сначала выберите пост из списка.');
  }
  return screen(menu, 'gifts_clean_current', '🧾 Текущий подарок', lines, homeRows(menu, target, flow));
}
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = clean(payload.action);
  if (action === 'admin_section_gifts') return home(menu, payload, ctx);
  if (action === 'gift_admin_recent_posts') return picker(menu, payload, ctx);
  if (action === 'gift_admin_channel_pick') return picker(menu, { ...payload, skipChannels: '1' }, ctx);
  if (action === 'gift_admin_select_post') return selectPost(menu, payload, ctx);
  if (action === 'gift_admin_show_current') return showCurrent(menu, payload, ctx);
  if (action === 'gift_admin_start_create' || action === 'gift_admin_create_from_target' || action === 'gift_admin_pick_file') return startCreate(menu, payload, ctx);
  return null;
}
function isCleanGiftAction(action = '') { return CLEAN_GIFT_ACTIONS.includes(clean(action)); }

module.exports = { RUNTIME, CLEAN_GIFT_ACTIONS, isCleanGiftAction, screenForPayload, listPosts, findPost, bindTargetForLegacy: bindTarget };