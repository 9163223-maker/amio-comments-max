'use strict';

const REQUIRED_SECTIONS = ['main','channels','comments','gifts','buttons','stats','push','ad_links','polls','highlights','editor','archive','account','settings'];
const POST_SCOPED = ['comments','gifts','buttons','polls','highlights','editor'];
const LIFECYCLE_STEPS = ['start','select_context','create_or_open','edit','preview','save','result','disable/delete'];

function lifecycle(covered = []) {
  return Object.fromEntries(LIFECYCLE_STEPS.map((step) => [step, covered.includes(step)]));
}
function defaultStates(requiredContext = 'none') {
  const postScoped = String(requiredContext || '').includes('post');
  return {
    zero_channels: 'Show useful empty state and recovery action.',
    one_channel: 'Use the single channel when safe or show the channel context clearly.',
    multiple_channels: 'Ask the admin to choose a channel before post-scoped work.',
    ...(postScoped ? {
      zero_posts: 'Explain that no saved posts exist and offer forwarding/syncing/recovery.',
      selected_post_no_entity: 'Show the selected channel/post and allow create only after this context exists.',
      selected_post_with_entity: 'Show current entity, edit/preview/status actions, and safe navigation.'
    } : {})
  };
}
function base({ id, title, goal, rootMode='section_actions', requiredContext='none', allowed=[], forbidden=[], hidden=[], ready=false, covered=[], requiredLifecycle=null, states={}, placeholders=[] }) {
  const required = Array.isArray(requiredLifecycle) ? requiredLifecycle : covered;
  return {
    id, title, productGoal: goal, rootMode, requiredContext,
    rootActions: { allowed, forbiddenWithoutContext: forbidden, hiddenUntilContext: hidden },
    states: { ...defaultStates(requiredContext), ...states },
    lifecycle: lifecycle(covered),
    requiredLifecycle: required,
    emptyStateRules: ['Explain what is missing.', 'Offer the next useful action.', 'Keep navigation to main menu.'],
    semanticAssertions: ['Root actions must be meaningful without hidden context.', 'No placeholder-only section can be PASS.', 'No duplicate semantic text in one screen.', 'Post-scoped routes must render choose_channel, choose_post, and selected-post states safely.'],
    productReady: ready,
    allowedPlaceholders: placeholders
  };
}

const contracts = [
  base({ id:'main', title:'Главное меню', goal:'Route admins to the one canonical client-visible section list.', rootMode:'dashboard', allowed:['Каналы','Комментарии','Подарки / лид-магниты','Кнопки под постами','Статистика','🔔 Уведомления','Рекламные ссылки','Опросы / голосования','Выделение постов','Редактор постов','Архив постов','Личный кабинет','Настройки'], ready:true, covered:['start','result'] }),
  base({ id:'channels', title:'Каналы', goal:'Connect and inspect MAX channels.', rootMode:'section_actions', allowed:['Подключить канал','Мои каналы','Помощь','Главное меню'], ready:true, covered:['start','select_context','create_or_open','result'], states:{ zero_channels:'Invite admin to connect a channel.', selected_channel:'Show status/card for the selected real channel only.' } }),
  base({ id:'comments', title:'Комментарии', goal:'Enable and manage comments for channel posts.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Автокомментарии','Включить к посту','Фото','Ответы','Реакции','Помощь','Главное меню'], hidden:['Текущие комментарии'], ready:false, covered:['start','select_context','create_or_open'] }),
  base({ id:'gifts', title:'Подарки / лид-магниты', goal:'Create and manage a gift bound to a concrete channel post.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Выбрать пост','Все подарки','Помощь','Главное меню'], forbidden:['Текущий подарок','Создать подарок','Список подарков'], hidden:['Текущий подарок','Редактировать','Предпросмотр','Выключить','Включить','Удалить','Статистика'], ready:false, covered:['start','select_context','create_or_open','preview','result','disable/delete'], states:{ zero_channels:'Чтобы создать подарок, сначала подключите канал. Подарок привязывается к посту канала.', zero_posts:'Пока нет сохранённых постов. Сначала перешлите или синхронизируйте пост канала.', selected_post_no_entity:'Подарок ещё не создан; show create only now.', selected_post_with_entity:'Show current gift, edit, preview, toggle, delete and stats.' }, placeholders:['gift content input not_supported_yet'] }),
  base({ id:'buttons', title:'Кнопки под постами', goal:'Create and manage buttons under a selected channel post.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Выбрать пост','Помощь','Главное меню'], forbidden:['Текущие кнопки','Добавить кнопку'], hidden:['Текущие кнопки','Добавить кнопку','Удалить кнопку'], ready:false, covered:['start','select_context','create_or_open','preview','save','result'] }),
  base({ id:'stats', title:'Статистика', goal:'Show account, channel, post and campaign metrics honestly.', rootMode:'dashboard', requiredContext:'none/channel/post', allowed:['Обзор','По каналу','По посту','Рекламные ссылки','Источники','Обновить данные','Помощь','Главное меню'], ready:false, covered:['start','select_context','result'] }),
  base({ id:'push', title:'🔔 Уведомления', goal:'Publish PWA/push invite entrypoints.', rootMode:'section_actions', requiredContext:'external/pwa', allowed:['Опубликовать приглашение','Как это работает','Главное меню'], ready:true, covered:['start','create_or_open','result'] }),
  base({ id:'ad_links', title:'Рекламные ссылки', goal:'Create and list scoped ad links.', rootMode:'section_actions', requiredContext:'none/channel', allowed:['Создать ссылку','Мои ссылки','Помощь','Главное меню'], ready:false, covered:['start','create_or_open','result','disable/delete'], states:{ list_empty:'No links yet; offer create link.', selected_link:'Only selected link screens may show disable/stat details.' } }),
  base({ id:'polls', title:'Опросы / голосования', goal:'Create and review polls for selected posts.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Выбрать пост','Результаты опросов','Помощь','Главное меню'], forbidden:['Создать опрос'], hidden:['Создать опрос','Остановить опрос'], ready:false, covered:['start','select_context','create_or_open','result','disable/delete'] }),
  base({ id:'highlights', title:'Выделение постов', goal:'Apply/remove marks on selected posts.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Выбрать пост','Помощь','Главное меню'], forbidden:['Поставить метку','Снять метку'], hidden:['Поставить метку','Снять метку'], ready:false, covered:['start','select_context','edit','save','result'] }),
  base({ id:'editor', title:'Редактор постов', goal:'Safely edit selected post text.', rootMode:'context_gate', requiredContext:'channel + post', allowed:['Выбрать пост','Помощь','Главное меню'], ready:false, covered:['start','select_context','edit','preview','save','result'] }),
  base({ id:'archive', title:'Архив постов', goal:'Browse saved posts and storage limits.', rootMode:'section_actions', requiredContext:'account', allowed:['Сохранённые посты','Лимиты хранения','Помощь','Главное меню'], ready:false, covered:['start','create_or_open','result'], states:{ empty_archive:'Explain when saved posts appear.', selected_archived_post:'Restore/copy only after an archived post is selected.' } }),
  base({ id:'account', title:'Личный кабинет', goal:'Show access, payment/support and account limits.', rootMode:'account_panel', requiredContext:'account', allowed:['Мой доступ','Активировать код','Оплата / продление','Лимиты и функции','Мои каналы','Поддержка','Главное меню'], ready:true, covered:['start','create_or_open','result'] }),
  base({ id:'settings', title:'Настройки', goal:'Expose safe account and chat settings.', rootMode:'section_actions', requiredContext:'none/account', allowed:['Очистить чат','Privacy / Terms','Помощь','Главное меню'], ready:false, covered:['start','create_or_open','result'], placeholders:['notifications','language_format'] })
];

const contractById = Object.fromEntries(contracts.map((c) => [c.id, c]));
function getContracts() { return contracts.map((c) => ({ ...c, rootActions: { ...c.rootActions }, lifecycle: { ...c.lifecycle }, requiredLifecycle: [...(c.requiredLifecycle || [])], states: { ...c.states } })); }
function getContract(id) { return contractById[id] || null; }
module.exports = { REQUIRED_SECTIONS, POST_SCOPED, LIFECYCLE_STEPS, contracts, contractById, getContracts, getContract };
