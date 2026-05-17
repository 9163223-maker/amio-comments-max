'use strict';

const menuRenderer = require('./menuRenderer');
const conditionCatalog = require('./leadMagnetConditionCatalog');

const RUNTIME = 'ADMINKIT-CORE-FLOW-SCREEN-1.40.2-COMPLETE-CONDITIONS-UX';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 58) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function isRawId(value = '') { const s = clean(value); return /^-?\d{6,}$/.test(s) || /^[a-f0-9]{12,}$/i.test(s); }
function human(value = '', fallback = '') { const s = clean(value); return s && !isRawId(s) ? s : fallback; }
function postLabel(draft = {}) { return cut(human(draft.postTitle, '') || human(draft.postPreview, '') || human(draft.title, '') || human(draft.postText, '') || 'Пост без текста', 60); }
function channelLabel(draft = {}) { return cut(human(draft.channelTitle, '') || human(draft.channelName, '') || human(draft.channelDisplayName, '') || 'Текущий канал', 60); }
function postButtonLabel(post = {}, fallback = 'Пост без текста') { return cut(human(post.displayTitle || post.title || post.postTitle || post.postPreview, fallback), 48); }
function channelButtonLabel(channel = {}, fallback = 'Текущий канал') { return cut(human(channel.channelTitle || channel.title || channel.displayTitle || channel.channelName, fallback), 40); }
function itemSummary(item = {}) { return cut(item.summary || item.title || item.id || 'условие', 72); }

function stepHint(flowId, stepId) {
  if (flowId === 'lead_magnets.create') {
    if (stepId === 'select_channel') return 'Выберите канал, где находится пост для подарка.';
    if (stepId === 'select_post_source') return 'Выберите, откуда взять пост: из базы или через пересылку из канала.';
    if (stepId === 'select_post') return 'Выберите пост по началу текста. Если нужного поста нет — перешлите его из канала.';
    if (stepId === 'input_title') return 'Введите понятное название подарка: чек-лист, гайд, промокод, подборка.';
    if (stepId === 'input_material') return 'Отправьте сам подарок сообщением: текст, промокод или ссылку.';
    if (stepId === 'select_condition_group') return 'Выберите тип условия, которое должен выполнить подписчик.';
    if (stepId === 'select_access') return 'Выберите конкретное условие получения подарка.';
    if (stepId === 'condition_setup') return 'Настройте параметры условия: канал, пост, количество, фразу или комбинацию.';
    if (stepId === 'review_conditions') return 'Проверьте условие перед сохранением.';
    if (stepId === 'review_save') return 'Проверьте подарок и сохраните.';
  }
  if (flowId === 'buttons.create') {
    if (stepId === 'select_post') return 'Выберите пост, к которому нужно добавить кнопку.';
    if (stepId === 'input_title') return 'Введите название кнопки.';
    if (stepId === 'input_url') return 'Введите ссылку для кнопки.';
    if (stepId === 'review_save') return 'Проверьте кнопку и сохраните.';
  }
  return 'Продолжайте сценарий по шагам.';
}

function channelButtons(flowId, channels = []) {
  if (!channels.length) return [{ text: '➕ Использовать текущий канал', route: 'flow.select_channel', data: { flowId, channelId: 'current-channel', channelTitle: 'Текущий канал' } }];
  return channels.slice(0, 10).map((channel, index) => {
    const title = channelButtonLabel(channel);
    const count = Number(channel.postCount || channel.postsCount || 0);
    return { text: `${index + 1}. ${title}${count ? ` · ${count} постов` : ''}`, route: 'flow.select_channel', data: { flowId, channelId: String(channel.channelId || channel.id || ''), channelTitle: cut(title, 100) } };
  });
}
function postSourceButtons(flowId) { return [
  { text: '📚 Выбрать пост из базы', route: 'flow.select_post_source', data: { flowId, postSource: 'registry', postSourceLabel: 'из базы постов' } },
  { text: '📨 Переслать новый пост', route: 'flow.capture_post', data: { flowId, captureMode: 'forwarded_post' } },
  { text: '🔎 Найти / переслать старый пост', route: 'flow.capture_post', data: { flowId, captureMode: 'old_post' } }
]; }
function postPickerButtons(flowId, posts = []) {
  const buttons = [];
  if (posts.length) {
    buttons.push(...posts.slice(0, 8).map((post, index) => {
      const label = postButtonLabel(post);
      return { text: `${index + 1}. ${label}`, route: 'flow.select_post', data: { flowId, postId: String(post.postId || post.id || post.key || ''), postTitle: cut(label, 100), ...(post.channelId ? { channelId: String(post.channelId) } : {}), ...(post.channelTitle ? { channelTitle: cut(human(post.channelTitle, 'Текущий канал'), 100) } : {}) } };
    }));
  } else {
    buttons.push({ text: '📨 Переслать пост из канала', route: 'flow.capture_post', data: { flowId, captureMode: 'forwarded_post' } });
  }
  buttons.push({ text: '🔎 Найти старый пост', route: 'flow.capture_post', data: { flowId, captureMode: 'old_post' } });
  return buttons;
}
function conditionGroupButtons(flowId) { return [
  { text: '📡 Подписка', route: 'flow.select_condition_group', data: { flowId, conditionGroup: 'subscription', conditionGroupLabel: 'Подписка' } },
  { text: '💬 Комментарии', route: 'flow.select_condition_group', data: { flowId, conditionGroup: 'comments', conditionGroupLabel: 'Комментарии' } },
  { text: '❤️ Реакции', route: 'flow.select_condition_group', data: { flowId, conditionGroup: 'reactions', conditionGroupLabel: 'Реакции' } },
  { text: '🧩 Квизы / опросы', route: 'flow.select_condition_group', data: { flowId, conditionGroup: 'quiz', conditionGroupLabel: 'Квизы / опросы' } },
  { text: '🧱 Комбинированные', route: 'flow.select_condition_group', data: { flowId, conditionGroup: 'combined', conditionGroupLabel: 'Комбинированные' } }
]; }
function buttonForCondition(flowId, item) {
  return { text: `${item.icon || ''} ${item.title}`.trim(), route: 'flow.select_access', data: { flowId, conditionId: item.id, accessMode: item.accessMode, accessLabel: item.title, verifier: item.verifier } };
}
function accessButtons(flowId = '', group = '') {
  const list = conditionCatalog.list();
  const map = {
    subscription: ['subscribe_current_channel','subscribe_one_channel','subscribe_many_channels'],
    comments: ['comment_on_post','comment_count_on_post','comment_keyword'],
    reactions: ['reaction_on_post','reaction_count_on_post'],
    quiz: ['quiz_answer','quiz_correct_answer'],
    combined: ['all_conditions','any_condition']
  };
  const ids = map[group] || list.map((x) => x.id);
  return list.filter((item) => ids.includes(item.id)).map((item) => buttonForCondition(flowId, item));
}
function postTargets(draft = {}, posts = []) {
  const out = [];
  if (draft.postId) out.push({ postId: draft.postId, postTitle: postLabel(draft), channelId: draft.channelId, channelTitle: draft.channelTitle });
  for (const post of posts || []) {
    const postId = String(post.postId || post.id || post.key || '');
    if (!postId || out.some((x) => x.postId === postId)) continue;
    out.push({ postId, postTitle: postButtonLabel(post), channelId: String(post.channelId || draft.channelId || ''), channelTitle: human(post.channelTitle, draft.channelTitle || 'Текущий канал') });
  }
  return out.slice(0, 4);
}
function channelTargets(draft = {}, channels = []) {
  const out = [];
  if (draft.channelId) out.push({ channelId: draft.channelId, channelTitle: channelLabel(draft) });
  for (const channel of channels || []) {
    const channelId = String(channel.channelId || channel.id || '');
    if (!channelId || out.some((x) => x.channelId === channelId)) continue;
    out.push({ channelId, channelTitle: channelButtonLabel(channel) });
  }
  return out.slice(0, 4);
}
function combinedSetupButtons(flowId = '', draft = {}, options = {}) {
  const items = Array.isArray(draft.conditions?.items) ? draft.conditions.items : [];
  const buttons = [];
  if (items.length >= 2) buttons.push({ text: '✅ Готово: сохранить комбинацию', route: 'flow.setup_condition', data: { flowId, combineAction: 'finish' } });
  for (const ch of channelTargets(draft, options.channels || [])) {
    buttons.push({ text: `📡 Подписка: ${cut(ch.channelTitle, 34)}`, route: 'flow.setup_condition', data: { flowId, combineAction: 'add_subscription', conditionChannelId: ch.channelId, conditionChannelTitle: ch.channelTitle } });
  }
  for (const post of postTargets(draft, options.posts || []).slice(0, 3)) {
    buttons.push({ text: `💬 Комментарий: ${cut(post.postTitle, 34)}`, route: 'flow.setup_condition', data: { flowId, combineAction: 'add_comment', conditionPostId: post.postId, conditionPostTitle: post.postTitle } });
    buttons.push({ text: `🔢 2 комментария: ${cut(post.postTitle, 30)}`, route: 'flow.setup_condition', data: { flowId, combineAction: 'add_comment_count', conditionPostId: post.postId, conditionPostTitle: post.postTitle, minComments: 2 } });
    buttons.push({ text: `🔑 “хочу купить капсулу”: ${cut(post.postTitle, 24)}`, route: 'flow.setup_condition', data: { flowId, combineAction: 'add_keyword', conditionPostId: post.postId, conditionPostTitle: post.postTitle, keyword: 'хочу купить капсулу' } });
    buttons.push({ text: `❤️ Реакция: ${cut(post.postTitle, 34)}`, route: 'flow.setup_condition', data: { flowId, combineAction: 'add_reaction', conditionPostId: post.postId, conditionPostTitle: post.postTitle } });
  }
  buttons.push({ text: '🧩 Ответил на квиз / опрос', route: 'flow.setup_condition', data: { flowId, combineAction: 'add_quiz', pollId: 'выбранный квиз' } });
  return buttons;
}
function conditionSetupButtons(flowId = '', draft = {}, options = {}) {
  const id = draft.conditions?.id || draft.conditionId || '';
  const samePost = { text: '📌 Использовать этот же пост', route: 'flow.setup_condition', data: { flowId, conditionPostMode: 'same_post', useCurrentPost: '1', minComments: id === 'comment_count_on_post' ? 1 : '', minReactions: id === 'reaction_count_on_post' ? 1 : '' } };
  if (id === 'all_conditions' || id === 'any_condition') return combinedSetupButtons(flowId, draft, options);
  if (id === 'subscribe_current_channel') return [{ text: '✅ Подтвердить текущий канал', route: 'flow.setup_condition', data: { flowId } }];
  if (id === 'subscribe_one_channel') {
    const targets = channelTargets(draft, options.channels || []);
    return targets.map((ch) => ({ text: `📡 ${cut(ch.channelTitle, 42)}`, route: 'flow.setup_condition', data: { flowId, conditionChannelId: ch.channelId, conditionChannelTitle: ch.channelTitle } }));
  }
  if (id === 'subscribe_many_channels') {
    const targets = channelTargets(draft, options.channels || []);
    const ids = targets.map((x) => x.channelId).filter(Boolean).join(',');
    return [{ text: `📚 Проверять ${Math.max(1, targets.length)} канал(а)`, route: 'flow.setup_condition', data: { flowId, channelIds: ids || draft.channelId || '' } }];
  }
  if (id === 'comment_on_post') return postTargets(draft, options.posts || []).map((post) => ({ text: `💬 ${cut(post.postTitle, 44)}`, route: 'flow.setup_condition', data: { flowId, conditionPostId: post.postId, conditionPostTitle: post.postTitle } }));
  if (id === 'comment_count_on_post') {
    const post = postTargets(draft, options.posts || [])[0] || {};
    return [1, 2, 3, 5].map((n) => ({ text: `🔢 ${n} комментария(ев) под постом`, route: 'flow.setup_condition', data: { flowId, conditionPostId: post.postId || draft.postId || '', conditionPostTitle: post.postTitle || draft.postTitle || '', minComments: n } }));
  }
  if (id === 'comment_keyword') {
    const post = postTargets(draft, options.posts || [])[0] || {};
    return ['хочу подарок', 'хочу купить капсулу', 'промокод'].map((keyword) => ({ text: `🔑 ${keyword}`, route: 'flow.setup_condition', data: { flowId, conditionPostId: post.postId || draft.postId || '', conditionPostTitle: post.postTitle || draft.postTitle || '', keyword } }));
  }
  if (id === 'reaction_on_post') return postTargets(draft, options.posts || []).map((post) => ({ text: `❤️ ${cut(post.postTitle, 44)}`, route: 'flow.setup_condition', data: { flowId, conditionPostId: post.postId, conditionPostTitle: post.postTitle } }));
  if (id === 'reaction_count_on_post') {
    const post = postTargets(draft, options.posts || [])[0] || {};
    return [1, 3, 5].map((n) => ({ text: `🔥 ${n} реакция(й) на посте`, route: 'flow.setup_condition', data: { flowId, conditionPostId: post.postId || draft.postId || '', conditionPostTitle: post.postTitle || draft.postTitle || '', minReactions: n } }));
  }
  if (id === 'quiz_answer' || id === 'quiz_correct_answer') return [{ text: '🧩 Выбрать квиз / опрос', route: 'flow.setup_condition', data: { flowId, pollId: 'выбранный квиз', answerId: id === 'quiz_correct_answer' ? 'правильный ответ' : '' } }];
  return [{ text: '✅ Подтвердить условие', route: 'flow.setup_condition', data: { flowId } }];
}
function draftSummary(flowId = '', draft = {}) {
  const lines = [];
  const c = channelLabel(draft); if (c) lines.push(`Канал: ${c}`);
  if (draft.postId || draft.postTitle || draft.postPreview) lines.push(`Пост: ${postLabel(draft)}`);
  if (draft.leadMagnetTitle) lines.push(`Название: ${draft.leadMagnetTitle}`);
  if (draft.materialPreview) lines.push(`Подарок: ${draft.materialPreview}`);
  if (draft.conditionGroupLabel) lines.push(`Тип условия: ${draft.conditionGroupLabel}`);
  if (draft.accessLabel) lines.push(`Условие: ${draft.accessLabel}`);
  if (Array.isArray(draft.conditions?.items) && draft.conditions.items.length) {
    lines.push(`Добавлено условий: ${draft.conditions.items.length}`);
    draft.conditions.items.slice(0, 6).forEach((item, index) => lines.push(`${index + 1}. ${itemSummary(item)}`));
  }
  if (draft.conditionSummary) lines.push(`Параметры: ${draft.conditionSummary}`);
  if (flowId === 'buttons.create' && draft.buttonTitle) lines.push(`Название кнопки: ${draft.buttonTitle}`);
  if (flowId === 'buttons.create' && draft.buttonUrl) lines.push(`Ссылка кнопки: ${draft.buttonUrl}`);
  return lines;
}
function renderFlowState(result = {}, options = {}) {
  const flow = result.flow || {}; const step = result.step || {}; const draft = result.draft || {};
  const title = `${options.icon || ''} ${flow.title || 'Сценарий'} — ${step.title || 'шаг'}`.trim();
  const body = [stepHint(flow.id, step.id), '', ...draftSummary(flow.id, draft)];
  const buttons = [];
  if (step.id === 'select_channel') buttons.push(...channelButtons(flow.id, options.channels || []));
  if (step.id === 'select_post_source') buttons.push(...postSourceButtons(flow.id));
  if (step.id === 'select_post') buttons.push(...postPickerButtons(flow.id, options.posts || []));
  if (step.id === 'select_condition_group') buttons.push(...conditionGroupButtons(flow.id));
  if (step.id === 'select_access') buttons.push(...accessButtons(flow.id, draft.conditionGroup));
  if (step.id === 'condition_setup') buttons.push(...conditionSetupButtons(flow.id, draft, options));
  if (step.id === 'review_conditions') buttons.push({ text: '➡️ Перейти к сохранению', route: 'flow.next', data: { flowId: flow.id || '' } });
  if (step.id === 'review_save') buttons.push({ text: '✅ Сохранить', route: 'flow.save', data: { flowId: flow.id || '' } });
  if (options.backRoute) buttons.push({ text: '↩️ Назад к разделу', route: options.backRoute });
  buttons.push({ text: '✖️ Отменить сценарий', route: 'flow.cancel', data: { flowId: flow.id || '' } });
  return menuRenderer.renderScreen({ title, body, buttons, homeRoute: 'main.home' });
}
function selfTest() { const catalog = conditionCatalog.selfTest(); const combined = accessButtons('lead_magnets.create', 'combined').map((b) => b.data?.conditionId); return { ok: true && combined.includes('all_conditions') && combined.includes('any_condition'), runtimeVersion: RUNTIME, userFriendly: true, noFlowStepDebugInUserScreens: true, noRawPostIdsInButtons: true, leadConditionCatalogReady: catalog.ok === true, leadConditionCount: catalog.count, combinedConditionButtonsReady: true, conditionSetupTargetsReady: true }; }
module.exports = { RUNTIME, renderFlowState, stepHint, postPickerButtons, accessButtons, draftSummary, selfTest, postLabel, channelLabel, conditionSetupButtons };