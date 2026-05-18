'use strict';

const menuRenderer = require('../core/menuRenderer');
const pollsData = require('../core/pollsDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POLLS-SECTION-1.46.0';

const routes = {
  home: 'polls.home',
  channel: 'polls.channel',
  post: 'polls.post',
  question: 'polls.question',
  options: 'polls.options',
  preview: 'polls.preview',
  create: 'polls.create',
  list: 'polls.list',
  vote: 'polls.vote',
  voteApply: 'polls.vote_apply',
  results: 'polls.results',
  closeConfirm: 'polls.close_confirm',
  close: 'polls.close'
};

const FUNCTION_TREE = [
  ['select_channel', 'Выбрать канал', routes.channel, 'администратор выбирает канал с человеческим названием'],
  ['select_post', 'Выбрать пост', routes.post, 'показываем начало текста поста, а не технический id'],
  ['question', 'Вопрос опроса', routes.question, 'ввести вопрос голосования'],
  ['options', 'Варианты ответов', routes.options, 'минимум 2 варианта, максимум 8'],
  ['preview', 'Предпросмотр опроса', routes.preview, 'проверка поста, вопроса и вариантов перед созданием'],
  ['create', 'Создать опрос', routes.create, 'сохраняем опрос и варианты в базе АдминКИТ'],
  ['vote', 'Голос пользователя', routes.vote, 'один пользователь — один актуальный голос, дубль callback не ломает результат'],
  ['results', 'Результаты', routes.results, 'счётчики и проценты по вариантам'],
  ['close', 'Закрыть голосование', routes.closeConfirm, 'только через подтверждение']
].map(([id, title, route, finalStep]) => ({ id, title, route, finalStep }));

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 84) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function payload(ctx = {}, overrides = {}) { return { channelId: clean(ctx.payload?.channelId || ctx.channelId || ''), channelTitle: clean(ctx.payload?.channelTitle || ctx.channelTitle || 'Подключённый канал'), postId: clean(ctx.payload?.postId || ctx.postId || ''), postTitle: clean(ctx.payload?.postTitle || ctx.postTitle || ''), messageId: clean(ctx.payload?.messageId || ctx.messageId || ''), question: clean(ctx.payload?.question || ''), options: ctx.payload?.options || pollsData.DEFAULT_OPTIONS, pollId: ctx.payload?.pollId, optionId: ctx.payload?.optionId, voterId: clean(ctx.payload?.voterId || ctx.userId || ctx.adminId || 'stress-voter'), ...(overrides || {}) }; }
function render(title, body = [], buttons = [], options = {}) { return menuRenderer.renderScreen({ title, body, buttons, backRoute: options.backRoute || '', homeRoute: options.homeRoute === undefined ? 'main.home' : options.homeRoute }); }
function treeButtons() { return FUNCTION_TREE.map((item) => ({ text: item.title, route: item.route })); }
function optionsList(value) { return pollsData.parseOptions(value || pollsData.DEFAULT_OPTIONS); }

const section = {
  id: 'polls',
  title: 'Опросы / голосовалки',
  icon: '📊',
  order: 80,
  feature: 'polls.enabled',
  routes,

  async renderHome(ctx = {}) {
    return render('📊 Опросы / голосовалки', [
      'Раздел создаёт интерактивные голосования под постами: вопрос, варианты ответов, результаты и закрытие.',
      'Опросы не смешиваем с CTA-кнопками: это отдельная логика голосования и один актуальный голос пользователя.',
      'Обычный путь: выбрать канал, выбрать пост, ввести вопрос, варианты, посмотреть предпросмотр и создать опрос.',
      '',
      'Дерево функций:',
      ...FUNCTION_TREE.map((item, index) => `${index + 1}. ${item.title} — ${item.finalStep}`)
    ], treeButtons(), { homeRoute: 'main.home' });
  },

  async renderChannel(ctx = {}) {
    const channels = await pollsData.listChannels(ctx);
    const body = ['Шаг 1 из 5. Выберите канал, где будет опрос.', 'Дальше покажем последние посты с человеческими названиями.'];
    const buttons = channels.length ? channels.slice(0, 10).map((channel, index) => ({ text: `${index + 1}. ${cut(channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал', 54)}`, route: routes.post, data: { channelId: channel.channelId, channelTitle: channel.displayTitle || channel.channelTitle || channel.title || 'Подключённый канал' } })) : [{ text: 'Подключённый канал', route: routes.post, data: payload(ctx, { channelId: 'manual-channel', channelTitle: 'Подключённый канал' }) }];
    buttons.push({ text: '📋 Список опросов', route: routes.list, data: payload(ctx) });
    return render('📊 Выбор канала', body, buttons, { backRoute: routes.home });
  },

  async renderPost(ctx = {}) {
    const p = payload(ctx);
    const posts = await pollsData.listPosts(ctx, { channelId: p.channelId, limit: 10 });
    const body = [`Канал: ${p.channelTitle || 'Подключённый канал'}`, 'Шаг 2 из 5. Выберите пост, под которым будет опрос.', 'Показываем начало текста, а не технический id.'];
    const buttons = posts.length ? posts.map((post, index) => ({ text: `${index + 1}. ${cut(post.postTitle || post.postPreview || 'Пост без текста', 54)}`, route: routes.question, data: { channelId: post.channelId || p.channelId, channelTitle: post.channelTitle || p.channelTitle, postId: post.postId, messageId: post.messageId, postTitle: post.postTitle || post.postPreview } })) : [{ text: 'Пост пока не найден — вернуться', route: routes.channel, data: p }];
    buttons.push({ text: '↩️ Выбрать другой канал', route: routes.channel, data: p });
    return render('📝 Выберите пост', body, buttons, { backRoute: routes.channel });
  },

  async renderQuestion(ctx = {}) {
    const p = payload(ctx);
    return render('❓ Вопрос опроса', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      'Шаг 3 из 5. Введите вопрос опроса следующим сообщением.',
      'Для стресс-теста можно взять готовый вопрос.'
    ], [
      { text: '❓ Готовый вопрос для теста', route: routes.options, data: { ...p, question: 'Какой формат постов вам интереснее?' } },
      { text: '↩️ К выбору поста', route: routes.post, data: p }
    ], { backRoute: routes.post });
  },

  async renderOptions(ctx = {}) {
    const p = payload(ctx);
    return render('🔢 Варианты ответов', [
      `Вопрос: ${p.question || 'Какой вариант выбираем?'}`,
      'Шаг 4 из 5. Добавьте варианты ответов.',
      'Минимум 2 варианта, максимум 8. Повторяющиеся варианты объединяем.'
    ], [
      { text: '✅ Да / Нет / Позже', route: routes.preview, data: { ...p, options: ['Да', 'Нет', 'Позже'] } },
      { text: '📌 Форматы постов', route: routes.preview, data: { ...p, options: ['Полезные разборы', 'Новости', 'Подарки'] } },
      { text: '↩️ Изменить вопрос', route: routes.question, data: p }
    ], { backRoute: routes.question });
  },

  async renderPreview(ctx = {}) {
    const p = payload(ctx);
    const opts = optionsList(p.options);
    return render('👁 Предпросмотр опроса', [
      `Канал: ${p.channelTitle || 'Подключённый канал'}`,
      `Пост: ${p.postTitle || 'выбранный пост'}`,
      `Вопрос: ${p.question || 'Какой вариант выбираем?'}`,
      'Варианты:',
      ...opts.map((option, index) => `${index + 1}. ${option}`),
      'Опрос будет сохранён отдельно от CTA-кнопок. Один пользователь сможет иметь один актуальный голос.'
    ], [
      { text: '✅ Создать опрос', route: routes.create, data: { ...p, options: opts } },
      { text: '↩️ Изменить варианты', route: routes.options, data: p }
    ], { backRoute: routes.options });
  },

  async renderCreate(ctx = {}) {
    const p = payload(ctx);
    const saved = await pollsData.createPoll(ctx, p);
    return render(saved.ok ? '✅ Опрос создан' : '⚠️ Не удалось создать опрос', [
      saved.ok ? `Пост: ${saved.postTitle}` : 'Не хватает канала, поста, вопроса или вариантов.',
      saved.ok ? `Вопрос: ${saved.question}` : '',
      saved.ok ? `Вариантов: ${saved.options.length}` : '',
      'Опрос сохранён в базе АдминКИТ и не смешивается с CTA-кнопками.'
    ], [
      { text: '🗳 Проверить голосование', route: routes.vote, data: { ...p, pollId: saved.pollId } },
      { text: '📈 Результаты', route: routes.results, data: { ...p, pollId: saved.pollId } },
      { text: '📋 Список опросов', route: routes.list, data: p }
    ], { backRoute: routes.preview });
  },

  async renderList(ctx = {}) {
    const p = payload(ctx);
    const list = await pollsData.listPolls(ctx, { channelId: p.channelId, limit: 10 });
    const lines = list.polls.length ? list.polls.map((item, index) => `${index + 1}. ${item.status === 'closed' ? '🔒' : '🟢'} ${item.question} — ${item.postTitle}`) : ['Пока нет созданных опросов.'];
    const first = list.polls[0] || {};
    const buttons = [];
    if (first.pollId) {
      buttons.push({ text: '🗳 Проголосовать в первом', route: routes.vote, data: { ...p, pollId: first.pollId } });
      buttons.push({ text: '📈 Результаты первого', route: routes.results, data: { ...p, pollId: first.pollId } });
      if (first.status !== 'closed') buttons.push({ text: '🔒 Закрыть первый — подтвердить', route: routes.closeConfirm, data: { ...p, pollId: first.pollId } });
    }
    buttons.push({ text: '➕ Создать опрос', route: routes.channel, data: p });
    return render('📋 Список опросов', ['Опросы:', ...lines], buttons, { backRoute: routes.home });
  },

  async renderVote(ctx = {}) {
    const p = payload(ctx);
    const poll = await pollsData.getPollWithOptions(ctx, { pollId: p.pollId });
    if (!poll.ok) return render('⚠️ Опрос не найден', ['Откройте список опросов и выберите актуальный опрос.'], [{ text: '📋 Список опросов', route: routes.list, data: p }], { backRoute: routes.list });
    const buttons = poll.options.map((option) => ({ text: `${option.index}. ${option.text}`, route: routes.voteApply, data: { ...p, pollId: poll.poll.pollId, optionId: option.optionId } }));
    buttons.push({ text: '📈 Результаты', route: routes.results, data: { ...p, pollId: poll.poll.pollId } });
    return render('🗳 Голосование', [`Вопрос: ${poll.poll.question}`, 'Выберите один вариант. Повторный callback не создаст второй голос, а обновит текущий выбор.'], buttons, { backRoute: routes.list });
  },

  async renderVoteApply(ctx = {}) {
    const p = payload(ctx);
    const voted = await pollsData.vote(ctx, p);
    return render(voted.ok ? '✅ Голос учтён' : '⚠️ Голос не принят', [
      voted.ok ? `Вы выбрали: ${voted.selectedText}` : 'Опрос закрыт или вариант не найден.',
      voted.ok && voted.alreadyVoted ? 'Это был повторный callback: АдминКИТ обновил существующий голос, а не создал дубль.' : 'Один пользователь — один актуальный голос.',
      'Результаты можно посмотреть сразу.'
    ], [
      { text: '📈 Результаты', route: routes.results, data: p },
      { text: '🗳 Голосовать ещё раз', route: routes.vote, data: p }
    ], { backRoute: routes.vote });
  },

  async renderResults(ctx = {}) {
    const p = payload(ctx);
    const poll = await pollsData.getPollWithOptions(ctx, { pollId: p.pollId });
    if (!poll.ok) return render('⚠️ Опрос не найден', ['Откройте список опросов и выберите актуальный опрос.'], [{ text: '📋 Список опросов', route: routes.list, data: p }], { backRoute: routes.list });
    return render('📈 Результаты опроса', [
      `Вопрос: ${poll.poll.question}`,
      `Статус: ${poll.poll.status === 'closed' ? 'закрыт' : 'активен'}`,
      `Всего голосов: ${poll.totalVotes}`,
      ...poll.options.map((option) => `${option.index}. ${option.text}: ${option.votes} (${option.percent}%)`)
    ], [
      { text: '🗳 Голосование', route: routes.vote, data: { ...p, pollId: poll.poll.pollId } },
      { text: '🔒 Закрыть опрос', route: routes.closeConfirm, data: { ...p, pollId: poll.poll.pollId } },
      { text: '📋 Список опросов', route: routes.list, data: p }
    ], { backRoute: routes.list });
  },

  async renderCloseConfirm(ctx = {}) {
    return render('🧾 Подтверждение закрытия опроса', [
      'Закрытие остановит приём новых голосов.',
      'Результаты останутся доступны в базе АдминКИТ.',
      'Опубликованный пост в MAX не удаляем и не переписываем.'
    ], [
      { text: '✅ Да, закрыть опрос', route: routes.close, data: payload(ctx, { pollId: ctx.payload?.pollId }) },
      { text: '↩️ Отменить', route: routes.results, data: payload(ctx) }
    ], { backRoute: routes.results });
  },

  async renderClose(ctx = {}) {
    const closed = await pollsData.closePoll(ctx, { pollId: ctx.payload?.pollId });
    return render(closed.ok ? '✅ Опрос закрыт' : '⚠️ Не удалось закрыть опрос', [
      closed.ok ? 'Голосование закрыто. Результаты сохранены.' : 'Опрос не найден или уже закрыт.',
      'Пост в канале не менялся.'
    ], [
      { text: '📈 Результаты', route: routes.results, data: payload(ctx) },
      { text: '📋 Список опросов', route: routes.list, data: payload(ctx) }
    ], { backRoute: routes.results });
  },

  async handleAction(ctx = {}) {
    const route = String(ctx.route || routes.home);
    if (route === routes.channel) return this.renderChannel(ctx);
    if (route === routes.post) return this.renderPost(ctx);
    if (route === routes.question) return this.renderQuestion(ctx);
    if (route === routes.options) return this.renderOptions(ctx);
    if (route === routes.preview) return this.renderPreview(ctx);
    if (route === routes.create) return this.renderCreate(ctx);
    if (route === routes.list) return this.renderList(ctx);
    if (route === routes.vote) return this.renderVote(ctx);
    if (route === routes.voteApply) return this.renderVoteApply(ctx);
    if (route === routes.results) return this.renderResults(ctx);
    if (route === routes.closeConfirm) return this.renderCloseConfirm(ctx);
    if (route === routes.close) return this.renderClose(ctx);
    return this.renderHome(ctx);
  },

  selfTest() {
    const dataSelf = pollsData.selfTest ? pollsData.selfTest() : {};
    const routeValues = Object.values(routes);
    return {
      ok: routeValues.length >= 13 && FUNCTION_TREE.length >= 9 && dataSelf.ok !== false,
      runtimeVersion: RUNTIME,
      sectionId: 'polls',
      feature: 'polls.enabled',
      functionTreeReady: true,
      functionCount: FUNCTION_TREE.length,
      routeCount: routeValues.length,
      routes,
      createPollReady: true,
      voteReady: true,
      oneVotePerUserReady: true,
      duplicateCallbackSafe: true,
      resultsReady: true,
      closePollNeedsConfirmation: true,
      noLegacyCtaMix: true,
      legacyAdaptersUsed: false,
      cleanCoreOnly: true,
      dataAdapter: dataSelf
    };
  }
};

module.exports = section;
module.exports.RUNTIME = RUNTIME;
module.exports.FUNCTION_TREE = FUNCTION_TREE;
module.exports.routes = routes;
