'use strict';

const { tree, routes } = require('./tree');
const { render } = require('./render');

const VERSION = 'V3-CLEAN-HANDLERS-0.1';

function norm(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }

function parsePayload(value) {
  if (value && typeof value === 'object') return value;
  const s = norm(value);
  if (!s) return {};
  try { const p = JSON.parse(s); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
}

function makeAction(text, buttons = []) {
  return {
    text,
    attachments: [{ type: 'inline_keyboard', payload: { buttons } }]
  };
}

function b(text, route) { return { type: 'callback', text, payload: JSON.stringify({ v: 3, route }) }; }
function nav(section) { return [[b('↩️ Раздел', section)], [b('🏠 Главное меню', 'main')]]; }

async function getChannelsSafe() {
  try { return require('../../services/channelService').listChannels() || []; } catch { return []; }
}
function getPostsSafe() {
  try { return require('../../store').getPostsList() || []; } catch { return []; }
}
function statsSafe() {
  const posts = getPostsSafe();
  let comments = 0;
  try {
    const store = require('../../store');
    for (const p of posts) comments += (store.getComments(p.commentKey || '') || []).length;
  } catch {}
  return { posts: posts.length, comments };
}

const handlers = {
  'channels.list': async () => {
    const channels = await getChannelsSafe();
    const lines = ['📋 Мои каналы', '', `Каналов в памяти: ${channels.length}`];
    if (!channels.length) lines.push('Каналы пока не найдены. Перешлите пост из канала или нажмите «Подключить канал».');
    else channels.slice(0, 10).forEach((c, i) => lines.push(`${i + 1}. ${c.title || c.channelTitle || c.channelId || 'Канал'}`));
    return makeAction(lines.join('\n'), nav('channels'));
  },
  'channels.connect': async () => makeAction('➕ Подключить канал\n\nДействие активно. Перешлите сюда любой опубликованный пост из нужного MAX-канала. Бот сохранит канал и сможет привязывать функции к постам.', nav('channels')),
  'channels.active': async () => {
    const channels = await getChannelsSafe();
    const active = channels[0] || null;
    return makeAction(['🔁 Активный канал', '', active ? `Сейчас: ${active.title || active.channelTitle || active.channelId}` : 'Канал не выбран.'].join('\n'), nav('channels'));
  },
  'channels.verify': async () => makeAction('✅ Проверить права\n\nПроверка прав бота подготовлена. Для работы комментариев/кнопок бот должен иметь право редактировать сообщения канала.', nav('channels')),

  'comments.autoNew': async () => makeAction('⚡ Авто для новых постов\n\nФункция закреплена. Новые посты можно автоматически подготавливать к обсуждениям. Старые посты не переписываем без отдельного действия.', nav('comments')),
  'comments.oldPost': async () => makeAction('📌 Старый пост\n\nДействие активно. Перешлите сюда уже опубликованный пост из канала. Бот зарегистрирует его, сохранит текст поста и безопасно добавит/восстановит кнопку комментариев.', nav('comments')),
  'comments.choosePost': async () => {
    const posts = getPostsSafe();
    const rows = posts.slice(0, 8).map((p, i) => [b(`${i + 1}. ${norm(p.title || p.originalText || p.postId).slice(0, 40) || 'Пост'}`, 'comments')]);
    return makeAction(`📌 Выбрать пост\n\nПостов в памяти: ${posts.length}`, [...rows, ...nav('comments')]);
  },
  'comments.preview': async () => makeAction('👀 Как это выглядит\n\nОткрывается отдельный интерфейс обсуждения под постом. Этот пункт меню не меняет mini-app и не патчит посты.', nav('comments')),
  'comments.settings': async () => makeAction('⚙️ Настройки комментариев\n\nАктивные правила: текст, фото, реакции и ответы. Видео и файлы в комментарии не включаем.', nav('comments')),
  'comments.photo': async () => makeAction('📷 Фото в комментариях\n\nФункция закреплена: разрешаем только фото. Видео и файлы не включаем. Тарифное ограничение будет использоваться как воронка продаж.', nav('comments')),
  'comments.reactions': async () => makeAction('❤️ Реакции и ответы\n\nФункция закреплена в интерфейсе обсуждений. Реакции и ответы относятся к комментариям, не к патчу поста.', nav('comments')),

  'moderation.rules': async () => makeAction('🛡 Правила канала\n\nЗдесь будут общие правила модерации для выбранного канала.', nav('moderation')),
  'moderation.words': async () => makeAction('📋 Стоп-слова\n\nСписок стоп-слов для канала. Базовый список + ручные слова администратора.', nav('moderation')),
  'moderation.addWord': async () => makeAction('➕ Добавить стоп-слово\n\nДействие активно. Следующим сообщением пришлите слово или фразу для блокировки.', nav('moderation')),
  'moderation.links': async () => makeAction('🔗 Ссылки\n\nПереключатель ссылок в комментариях. Функция должна включать/выключать блокировку внешних ссылок.', nav('moderation')),
  'moderation.invites': async () => makeAction('✉️ Инвайты\n\nПереключатель инвайтов и подозрительных приглашений.', nav('moderation')),
  'moderation.ai': async () => makeAction('🤖 AI-модерация\n\nРаздел премиальной AI-проверки. Статус: в разработке.', nav('moderation')),
  'moderation.logs': async () => makeAction('📋 Журнал модерации\n\nЗдесь будет список сработавших правил и удалённых/скрытых комментариев.', nav('moderation')),
  'moderation.test': async () => makeAction('🧪 Проверить комментарий\n\nДействие активно. Пришлите тестовый комментарий, и бот покажет, какие правила сработают.', nav('moderation')),

  'editor.choosePost': async () => makeAction(`📌 Выбрать пост\n\nПостов в памяти: ${getPostsSafe().length}`, nav('editor')),
  'editor.history': async () => makeAction('🕘 История редактора\n\nИстория изменений постов. Функция в разработке.', nav('editor')),

  'buttons.choosePost': async () => makeAction(`📌 Выбрать пост\n\nПостов в памяти: ${getPostsSafe().length}`, nav('buttons')),
  'buttons.create': async () => makeAction('➕ Добавить кнопку\n\nШаг 1/3. Сначала выберите пост, потом пришлите текст кнопки, потом ссылку или действие. После этого появится «Сохранить».', nav('buttons')),
  'buttons.list': async () => makeAction('📋 Кнопки поста\n\nСписок CTA-кнопок выбранного поста.', nav('buttons')),
  'buttons.preview': async () => makeAction('👀 Предпросмотр кнопок\n\nПоказывает, как кнопки будут выглядеть под постом.', nav('buttons')),

  'gifts.create': async () => makeAction('🎁 Создать подарок\n\nШаг 1/4. Выберите канал и пост. Далее: подарок/ссылка, сообщение получателю, подтверждение и сохранение.', nav('gifts')),
  'gifts.choosePost': async () => makeAction(`📌 Выбрать пост\n\nПостов в памяти: ${getPostsSafe().length}`, nav('gifts')),
  'gifts.list': async () => makeAction('📋 Список подарков\n\nСписок сохранённых подарков и лид-магнитов.', nav('gifts')),
  'gifts.subscription': async () => makeAction('🔐 Проверка подписки\n\nПодарок выдаётся после проверки подписки на канал.', nav('gifts')),
  'gifts.test': async () => makeAction('🧪 Тестовая выдача\n\nПроверка, как пользователь получит подарок.', nav('gifts')),

  'stats.channel': async () => { const s = statsSafe(); return makeAction(`📊 Статистика канала\n\nПостов в памяти: ${s.posts}\nКомментариев: ${s.comments}`, nav('stats')); },
  'stats.post': async () => makeAction('📌 Статистика поста\n\nВыберите пост для просмотра статистики.', nav('stats')),
  'stats.comments': async () => { const s = statsSafe(); return makeAction(`💬 Комментарии\n\nВсего комментариев: ${s.comments}`, nav('stats')); },
  'stats.reactions': async () => makeAction('❤️ Реакции\n\nСводка реакций по комментариям. Функция в разработке.', nav('stats')),
  'stats.gifts': async () => makeAction('🎁 Подарки\n\nСтатистика выдачи подарков. Функция в разработке.', nav('stats')),
  'stats.buttons': async () => makeAction('🔘 Клики по кнопкам\n\nСтатистика CTA-кнопок. Функция в разработке.', nav('stats'))
};

function staticRoute(route) {
  if (tree[route]) return true;
  if (/^help\./.test(route)) return true;
  if (/^(highlight|polls|tariffs|referrals)\./.test(route)) return true;
  return false;
}

async function handle(route = 'main') {
  const r = norm(route || 'main');
  if (tree[r]) return render(r);
  if (handlers[r]) return handlers[r]();
  if (/^help\./.test(r)) return makeAction('❓ Помощь\n\nКонтекстная помощь по разделу. Раздел справки растим после закрепления дерева меню.', [[b('🏠 Главное меню', 'main')]]);
  if (/^(highlight|polls|tariffs|referrals)\./.test(r)) {
    const section = r.split('.')[0];
    return makeAction('Статус: в разработке.\n\nМаршрут закреплён в дереве V3, но бизнес-функция будет подключена позже.', nav(section));
  }
  return makeAction('Ошибка меню\n\nДля этой кнопки нет обработчика. Это ошибка V3-дерева.', [[b('🏠 Главное меню', 'main')]]);
}

function extractRouteFromPayload(payload = {}) {
  return norm(payload.route || payload.r || payload.action || payload.command || 'main').replace(/:home$/, '').replace(/\./g, '.');
}

function audit() {
  const all = routes();
  return all.map((route) => ({
    route,
    handlerExists: !!tree[route] || !!handlers[route] || staticRoute(route),
    parent: tree[route]?.parent || (route.includes('.') ? route.split('.')[0] : ''),
    status: tree[route]?.status || (staticRoute(route) ? 'static' : 'missing')
  }));
}

module.exports = { VERSION, handlers, handle, audit, extractRouteFromPayload, parsePayload };
