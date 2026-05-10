'use strict';

// Production Menu Map V3 — fixed canonical contract.
// PRO test mode: all customer-facing functions are active; tariffGate is metadata only.

const VERSION = 'production-menu-map-v3';
const TEST_MODE = 'PRO_OPEN_ALL_FUNCTIONS';
const STATUS = { ACTIVE: 'active', INTERNAL: 'internal' };
const TARIFF = { FREE: 'free', START: 'start', PRO: 'pro', BUSINESS: 'business', INTERNAL: 'internal' };

const sections = [
  ['channels','📺 Каналы и доступ',true,10,null,'Подключение канала, проверка прав, доступы, восстановление после redeploy.'],
  ['comments','💬 Комментарии',true,20,null,'Обсуждения под постами MAX.'],
  ['comments_banner','🖼 Баннер в обсуждениях',false,21,'comments','Плавающий баннер внутри обсуждений. Не CTA-кнопка под постом.'],
  ['comments_photo','📷 Фото в комментариях',false,22,'comments','Фото в комментариях. Видео и файлы исключены.'],
  ['comments_reactions','❤️ Реакции и ответы',false,23,'comments','Реакции и ответы внутри обсуждений.'],
  ['moderation','🛡 Модерация',true,30,null,'Фильтрация комментариев по каналу и постам.'],
  ['editor','✏️ Редактор постов',true,40,null,'Редактирование постов без потери форматирования, ссылок, кнопок и медиа.'],
  ['buttons','⚪ Кнопки под постами',true,50,null,'CTA-кнопки под постом MAX. Не баннер в обсуждениях.'],
  ['gifts','🎁 Подарки / лид-магниты',true,60,null,'Подарки за подписку и лид-магниты.'],
  ['highlight','📌 Выделение постов',true,70,null,'Визуальное продвижение важного поста.'],
  ['polls','🗳 Голосования / опросы',true,80,null,'Голосования и опросы для вовлечения.'],
  ['stats','📊 Статистика',true,90,null,'Понятная статистика канала, постов и функций.'],
  ['billing','🧾 Покупка и тарифы',true,100,null,'Пробный период, подписка, токены и тариф.'],
  ['referrals','🤝 Реферальная программа',true,110,null,'Реферальная ссылка, приглашения и бонусы.'],
  ['help','❓ Помощь',true,120,null,'Контекстная помощь по разделам.'],
  ['debug','Debug',false,900,null,'Служебные проверки.',true],
  ['production_checklist','Production checklist',false,910,null,'Служебный production checklist.',true],
  ['stress_test','Stress-test',false,920,null,'Служебные stress-test сценарии.',true]
].map(([owner,title,main,order,parentOwner,description,internal]) => ({ owner,title,main,order,parentOwner: parentOwner || null,description,internal: !!internal }));

const sectionByOwner = Object.fromEntries(sections.map((s) => [s.owner, s]));
const mainMenu = sections.filter((s) => s.main && !s.internal).sort((a,b) => a.order - b.order).map((s) => `${s.owner}:home`);
const items = [];

function add(owner, route, title, options = {}) {
  const section = sectionByOwner[owner] || {};
  const isHome = route === `${owner}:home`;
  const item = {
    route,
    owner,
    title,
    tariffGate: options.tariffGate || (owner === 'channels' || owner === 'billing' || owner === 'referrals' || owner === 'help' ? TARIFF.FREE : owner === 'comments' || owner === 'comments_reactions' || owner === 'moderation' || owner === 'stats' ? TARIFF.START : TARIFF.PRO),
    status: options.status || (section.internal ? STATUS.INTERNAL : STATUS.ACTIVE),
    parent: options.parent === undefined ? (isHome ? (section.parentOwner ? `${section.parentOwner}:home` : null) : `${owner}:home`) : options.parent,
    level: options.level || (isHome && !section.parentOwner ? 1 : 2),
    visible: options.visible === undefined ? !section.internal : options.visible,
    postScoped: !!options.postScoped,
    sectionHome: options.sectionHome === undefined ? (isHome ? null : `${owner}:home`) : options.sectionHome,
    ui: options.ui || (isHome ? 'section_home' : 'button'),
    actionType: options.actionType || 'screen',
    description: options.description || ''
  };
  items.push(item);
  return item;
}
function home(owner, tariffGate) { return add(owner, `${owner}:home`, sectionByOwner[owner].title, { tariffGate, description: sectionByOwner[owner].description }); }
function nav(owner) {
  add(owner, `${owner}:help`, '❓ Помощь', { tariffGate:TARIFF.FREE, actionType:'help' });
  add(owner, `${owner}:section_home`, '↩️ Раздел', { tariffGate:TARIFF.FREE, actionType:'navigation' });
  add(owner, `${owner}:main_menu`, '🏠 Главное меню', { tariffGate:TARIFF.FREE, actionType:'navigation' });
}

home('channels', TARIFF.FREE);
add('channels','channels:list','📋 Мои каналы',{tariffGate:TARIFF.FREE});
add('channels','channels:connect','➕ Подключить канал',{tariffGate:TARIFF.FREE,actionType:'flow'});
add('channels','channels:select','🔁 Сменить активный канал',{tariffGate:TARIFF.FREE,actionType:'select'});
add('channels','channels:verify_access','✅ Проверить права бота',{tariffGate:TARIFF.FREE,actionType:'api_check'});
add('channels','channels:access','🔐 Доступы канала',{tariffGate:TARIFF.FREE});
add('channels','channels:admins','👥 Администраторы канала',{tariffGate:TARIFF.BUSINESS});
nav('channels');

home('comments', TARIFF.START);
add('comments','comments:auto_new','⚡ Авто для новых постов',{tariffGate:TARIFF.START,actionType:'toggle'});
add('comments','comments:old_post','📌 Подключить старый пост',{tariffGate:TARIFF.START,actionType:'flow'});
add('comments','comments:choose_post','📌 Выбрать пост',{tariffGate:TARIFF.START,postScoped:true,actionType:'post_select'});
add('comments','comments:post','Карточка поста комментариев',{tariffGate:TARIFF.START,parent:'comments:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('comments','comments:toggle','✅ / ⏸ Комментарии',{tariffGate:TARIFF.START,parent:'comments:post',postScoped:true,actionType:'toggle'});
add('comments','comments:preview','👀 Как это выглядит',{tariffGate:TARIFF.START});
add('comments','comments:settings','⚙️ Настройки комментариев',{tariffGate:TARIFF.START});
add('comments','comments:banner_link','🖼 Баннер в обсуждениях',{tariffGate:TARIFF.PRO,parent:'comments:home',sectionHome:'comments:home',actionType:'navigation'});
add('comments','comments:photo_link','📷 Фото в комментариях',{tariffGate:TARIFF.PRO,parent:'comments:home',sectionHome:'comments:home',actionType:'navigation'});
add('comments','comments:reactions_link','❤️ Реакции и ответы',{tariffGate:TARIFF.START,parent:'comments:home',sectionHome:'comments:home',actionType:'navigation'});
nav('comments');

home('comments_banner', TARIFF.PRO);
add('comments_banner','comments_banner:toggle','✅ / ⏸ Баннер',{actionType:'toggle'});
add('comments_banner','comments_banner:set_text','✏️ Текст баннера',{actionType:'flow'});
add('comments_banner','comments_banner:set_button','🔘 Текст кнопки баннера',{actionType:'flow'});
add('comments_banner','comments_banner:set_link','🔗 Ссылка / действие',{actionType:'flow'});
add('comments_banner','comments_banner:scope_all_posts','🌍 Показывать во всех обсуждениях',{actionType:'toggle'});
add('comments_banner','comments_banner:scope_one_post','📌 Показывать у конкретного поста',{postScoped:true,actionType:'post_select'});
add('comments_banner','comments_banner:preview','👀 Предпросмотр');
add('comments_banner','comments_banner:back_to_comments','↩️ В комментарии',{tariffGate:TARIFF.FREE,actionType:'navigation'});
add('comments_banner','comments_banner:main_menu','🏠 Главное меню',{tariffGate:TARIFF.FREE,actionType:'navigation'});

home('comments_photo', TARIFF.PRO);
add('comments_photo','comments_photo:toggle','✅ / ⏸ Фото',{actionType:'toggle'});
add('comments_photo','comments_photo:limits','📏 Лимиты фото');
add('comments_photo','comments_photo:moderation','🛡 Модерация фото');
add('comments_photo','comments_photo:back_to_comments','↩️ В комментарии',{tariffGate:TARIFF.FREE,actionType:'navigation'});
add('comments_photo','comments_photo:main_menu','🏠 Главное меню',{tariffGate:TARIFF.FREE,actionType:'navigation'});

home('comments_reactions', TARIFF.START);
add('comments_reactions','comments_reactions:toggle_reactions','✅ / ⏸ Реакции',{tariffGate:TARIFF.START,actionType:'toggle'});
add('comments_reactions','comments_reactions:toggle_replies','✅ / ⏸ Ответы',{tariffGate:TARIFF.START,actionType:'toggle'});
add('comments_reactions','comments_reactions:preview','👀 Предпросмотр',{tariffGate:TARIFF.START});
add('comments_reactions','comments_reactions:back_to_comments','↩️ В комментарии',{tariffGate:TARIFF.FREE,actionType:'navigation'});
add('comments_reactions','comments_reactions:main_menu','🏠 Главное меню',{tariffGate:TARIFF.FREE,actionType:'navigation'});

home('moderation', TARIFF.START);
add('moderation','moderation:channel','🛡 Правила всего канала',{tariffGate:TARIFF.START});
add('moderation','moderation:choose_post','🎯 Правила конкретного поста',{tariffGate:TARIFF.START,postScoped:true,actionType:'post_select'});
add('moderation','moderation:post','Карточка модерации поста',{tariffGate:TARIFF.START,parent:'moderation:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('moderation','moderation:toggle_filter','✅ / ⏸ Фильтр',{tariffGate:TARIFF.START,actionType:'toggle'});
add('moderation','moderation:base_words','🧱 Базовые стоп-слова',{tariffGate:TARIFF.START});
add('moderation','moderation:manual_words','📋 Ручной список',{tariffGate:TARIFF.START});
add('moderation','moderation:add_word','➕ Стоп-слово',{tariffGate:TARIFF.START,actionType:'flow'});
add('moderation','moderation:toggle_links','🔗 Ссылки: разрешить / запретить',{tariffGate:TARIFF.START,actionType:'toggle'});
add('moderation','moderation:toggle_invites','✉️ Инвайты: разрешить / запретить',{tariffGate:TARIFF.START,actionType:'toggle'});
add('moderation','moderation:toggle_ai','🤖 AI-модерация',{tariffGate:TARIFF.BUSINESS,actionType:'toggle'});
add('moderation','moderation:logs','📋 Журнал модерации',{tariffGate:TARIFF.PRO});
add('moderation','moderation:test_comment','🧪 Проверить комментарий',{tariffGate:TARIFF.START,actionType:'flow'});
nav('moderation');

home('editor', TARIFF.PRO);
add('editor','editor:choose_post','📌 Выбрать пост',{postScoped:true,actionType:'post_select'});
add('editor','editor:post','Карточка редактора поста',{parent:'editor:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('editor','editor:edit_text','✏️ Изменить текст',{parent:'editor:post',postScoped:true,actionType:'flow'});
add('editor','editor:preview','👀 Предпросмотр',{parent:'editor:post',postScoped:true});
add('editor','editor:save','💾 Сохранить изменения',{parent:'editor:post',postScoped:true,actionType:'save'});
add('editor','editor:restore_original','↩️ Восстановить оригинал',{parent:'editor:post',postScoped:true,actionType:'restore'});
add('editor','editor:history','🕘 История изменений');
nav('editor');

home('buttons', TARIFF.PRO);
add('buttons','buttons:add','➕ Добавить кнопку',{actionType:'flow'});
add('buttons','buttons:choose_post','📌 Выбрать пост для кнопки',{postScoped:true,actionType:'post_select'});
add('buttons','buttons:post','Карточка кнопок поста',{parent:'buttons:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('buttons','buttons:list','📋 Кнопки поста',{parent:'buttons:post',postScoped:true});
add('buttons','buttons:edit','✏️ Редактировать кнопку',{parent:'buttons:post',postScoped:true,actionType:'flow'});
add('buttons','buttons:delete','🗑 Удалить кнопку',{parent:'buttons:post',postScoped:true,actionType:'delete'});
add('buttons','buttons:preview','👀 Предпросмотр',{parent:'buttons:post',postScoped:true});
add('buttons','buttons:step_1_post','Шаг 1/3 — выбрать пост',{parent:'buttons:add',actionType:'flow'});
add('buttons','buttons:step_2_label','Шаг 2/3 — текст кнопки',{parent:'buttons:add',actionType:'flow'});
add('buttons','buttons:step_3_url','Шаг 3/3 — ссылка / действие',{parent:'buttons:add',actionType:'flow'});
add('buttons','buttons:save','💾 Сохранить',{parent:'buttons:add',actionType:'save'});
nav('buttons');

home('gifts', TARIFF.PRO);
add('gifts','gifts:create','🎁 Создать подарок',{actionType:'flow'});
add('gifts','gifts:choose_post','📌 Выбрать пост для подарка',{postScoped:true,actionType:'post_select'});
add('gifts','gifts:post','Карточка подарка поста',{parent:'gifts:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('gifts','gifts:list','📋 Список подарков');
add('gifts','gifts:edit','✏️ Редактировать подарок',{actionType:'flow'});
add('gifts','gifts:delete','🗑 Удалить подарок',{actionType:'delete'});
add('gifts','gifts:test_send','🧪 Тестовая выдача',{actionType:'api_check'});
add('gifts','gifts:check_subscription','🔐 Проверка подписки',{actionType:'api_check'});
add('gifts','gifts:recipient_message','💬 Сообщение получателю',{actionType:'flow'});
add('gifts','gifts:step_1_channel_post','Шаг 1/4 — канал и пост',{parent:'gifts:create',actionType:'flow'});
add('gifts','gifts:step_2_file_or_link','Шаг 2/4 — файл или ссылка подарка',{parent:'gifts:create',actionType:'flow'});
add('gifts','gifts:step_3_message','Шаг 3/4 — сообщение получателю',{parent:'gifts:create',actionType:'flow'});
add('gifts','gifts:step_4_confirm','Шаг 4/4 — подтверждение',{parent:'gifts:create',actionType:'flow'});
add('gifts','gifts:save','💾 Сохранить подарок',{parent:'gifts:create',actionType:'save'});
nav('gifts');

home('highlight', TARIFF.PRO);
add('highlight','highlight:choose_post','📌 Выбрать пост',{postScoped:true,actionType:'post_select'});
add('highlight','highlight:post','Карточка выделения поста',{parent:'highlight:choose_post',visible:false,postScoped:true,ui:'post_card'});
add('highlight','highlight:toggle','✅ / ⏸ Выделение',{parent:'highlight:post',postScoped:true,actionType:'toggle'});
add('highlight','highlight:set_text','✏️ Текст выделения',{parent:'highlight:post',postScoped:true,actionType:'flow'});
add('highlight','highlight:preview','👀 Предпросмотр',{parent:'highlight:post',postScoped:true});
add('highlight','highlight:stats','📊 Статистика выделения',{parent:'highlight:post',postScoped:true});
nav('highlight');

home('polls', TARIFF.PRO);
add('polls','polls:create','➕ Создать голосование',{actionType:'flow'});
add('polls','polls:attach_post','📌 Привязать к посту',{postScoped:true,actionType:'post_select'});
add('polls','polls:options','✏️ Варианты ответа',{actionType:'flow'});
add('polls','polls:toggle_multiple','✅ Один ответ / несколько ответов',{actionType:'toggle'});
add('polls','polls:results','📊 Результаты');
add('polls','polls:finish','⏸ Завершить голосование',{actionType:'toggle'});
add('polls','polls:preview','👀 Предпросмотр');
nav('polls');

home('stats', TARIFF.START);
add('stats','stats:channel','📊 Статистика канала',{tariffGate:TARIFF.START});
add('stats','stats:choose_post','📌 Статистика поста',{tariffGate:TARIFF.START,postScoped:true,actionType:'post_select'});
add('stats','stats:comments','💬 Комментарии',{tariffGate:TARIFF.START});
add('stats','stats:reactions','❤️ Реакции',{tariffGate:TARIFF.START});
add('stats','stats:button_clicks','🔘 Клики по кнопкам',{tariffGate:TARIFF.PRO});
add('stats','stats:gifts','🎁 Подарки и заявки',{tariffGate:TARIFF.PRO});
add('stats','stats:growth','📈 Прирост подписчиков',{tariffGate:TARIFF.START});
add('stats','stats:period_24h','24 часа',{tariffGate:TARIFF.START});
add('stats','stats:period_7d','7 дней',{tariffGate:TARIFF.START});
add('stats','stats:period_14d','14 дней',{tariffGate:TARIFF.PRO});
add('stats','stats:period_30d','30 дней',{tariffGate:TARIFF.PRO});
add('stats','stats:export','📤 Экспорт',{tariffGate:TARIFF.BUSINESS});
nav('stats');

home('billing', TARIFF.FREE);
add('billing','billing:my_plan','📋 Мой тариф',{tariffGate:TARIFF.FREE});
add('billing','billing:trial','🎁 Попробовать бесплатно',{tariffGate:TARIFF.FREE,actionType:'flow'});
add('billing','billing:buy','💳 Купить подписку',{tariffGate:TARIFF.FREE,actionType:'payment'});
add('billing','billing:upgrade','⬆️ Улучшить тариф',{tariffGate:TARIFF.FREE,actionType:'payment'});
add('billing','billing:activate_token','🔐 Активировать токен',{tariffGate:TARIFF.FREE,actionType:'flow'});
add('billing','billing:history','🧾 История оплат',{tariffGate:TARIFF.FREE});
add('billing','billing:channel_limits','📺 Каналы в тарифе',{tariffGate:TARIFF.FREE});
nav('billing');

home('referrals', TARIFF.FREE);
add('referrals','referrals:my_link','🔗 Моя реферальная ссылка',{tariffGate:TARIFF.FREE});
add('referrals','referrals:stats','📊 Мои приглашения',{tariffGate:TARIFF.FREE});
add('referrals','referrals:bonuses','🎁 Мои бонусы',{tariffGate:TARIFF.FREE});
add('referrals','referrals:terms','💸 Условия программы',{tariffGate:TARIFF.FREE});
add('referrals','referrals:share','📤 Поделиться',{tariffGate:TARIFF.FREE,actionType:'share'});
nav('referrals');

home('help', TARIFF.FREE);
['channels','comments','moderation','editor','buttons','gifts','highlight','polls','stats','billing','referrals'].forEach((owner) => add('help',`help:${owner}`,`Помощь: ${sectionByOwner[owner].title}`,{tariffGate:TARIFF.FREE,parent:'help:home',actionType:'help'}));
add('help','help:main_menu','🏠 Главное меню',{tariffGate:TARIFF.FREE,parent:'help:home',actionType:'navigation'});

add('debug','debug:runtime','Debug runtime',{tariffGate:TARIFF.INTERNAL,status:STATUS.INTERNAL,visible:false,parent:null,sectionHome:null});
add('debug','debug:production_menu_map_v3','Debug Production Menu Map V3',{tariffGate:TARIFF.INTERNAL,status:STATUS.INTERNAL,visible:false,parent:null,sectionHome:null});
add('production_checklist','production_checklist:home','Production checklist',{tariffGate:TARIFF.INTERNAL,status:STATUS.INTERNAL,visible:false,parent:null,sectionHome:null});
add('stress_test','stress_test:menu','Menu stress-test',{tariffGate:TARIFF.INTERNAL,status:STATUS.INTERNAL,visible:false,parent:null,sectionHome:null});

function validateMenuMapV3() {
  const errors = [], warnings = [];
  const owners = new Set(sections.map((s) => s.owner));
  const routes = new Set();
  for (const item of items) {
    if (!item.route) errors.push('route_missing');
    if (!item.owner) errors.push(`owner_missing:${item.route}`);
    if (!owners.has(item.owner)) errors.push(`unknown_owner:${item.route}:${item.owner}`);
    if (!item.title) errors.push(`title_missing:${item.route}`);
    if (!item.tariffGate) errors.push(`tariff_missing:${item.route}`);
    if (!item.status) errors.push(`status_missing:${item.route}`);
    if (routes.has(item.route)) errors.push(`duplicate_route:${item.route}`);
    routes.add(item.route);
    if (item.postScoped && item.route.includes('choose_post') && item.owner !== item.route.split(':')[0]) errors.push(`post_selection_owner_mismatch:${item.route}:${item.owner}`);
    if (item.route.startsWith('comments_banner:') && item.owner !== 'comments_banner') errors.push(`comments_banner_wrong_owner:${item.route}:${item.owner}`);
    if (item.owner === 'buttons' && /banner/i.test(item.route + item.title)) errors.push(`buttons_must_not_own_banner:${item.route}`);
    if (!item.status === STATUS.INTERNAL && /commentKey|postId|payload|route/i.test(item.title)) errors.push(`technical_title:${item.route}`);
  }
  for (const route of mainMenu) if (!routes.has(route)) errors.push(`main_route_missing:${route}`);
  for (const item of items) if (item.parent && !routes.has(item.parent)) warnings.push(`parent_missing:${item.route}->${item.parent}`);
  const count = (key) => items.reduce((acc, item) => { acc[item[key]] = (acc[item[key]] || 0) + 1; return acc; }, {});
  return {
    ok: errors.length === 0,
    version: VERSION,
    testMode: TEST_MODE,
    totalSections: sections.length,
    mainMenuRoutes: mainMenu.length,
    totalRoutes: items.length,
    visibleRoutes: items.filter((item) => item.visible !== false).length,
    errors,
    warnings,
    countsByOwner: count('owner'),
    countsByTariff: count('tariffGate'),
    countsByStatus: count('status'),
    rules: {
      everyRouteHasOwner: !errors.some((error) => error.startsWith('owner_missing')),
      everyRouteHasTariffGate: !errors.some((error) => error.startsWith('tariff_missing')),
      everyRouteHasStatus: !errors.some((error) => error.startsWith('status_missing')),
      postSelectionIsSectionOwned: !errors.some((error) => error.startsWith('post_selection_owner_mismatch')),
      commentsBannerBelongsToCommentsTree: !errors.some((error) => error.startsWith('comments_banner_wrong_owner')),
      buttonsArePostCtaOnly: !errors.some((error) => error.startsWith('buttons_must_not_own_banner')),
      noTechnicalTitles: !errors.some((error) => error.startsWith('technical_title'))
    }
  };
}
function getMenuMapV3() { return { version: VERSION, testMode: TEST_MODE, statusValues: Object.values(STATUS), tariffValues: Object.values(TARIFF), mainMenu, sections, items, validation: validateMenuMapV3() }; }
function getOwnerRoutes(owner) { return items.filter((item) => item.owner === owner); }
module.exports = { VERSION, TEST_MODE, STATUS, TARIFF, sections, mainMenu, items, validateMenuMapV3, getMenuMapV3, getOwnerRoutes };
