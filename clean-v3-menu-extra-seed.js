'use strict';
const db = require('./cc5-db-core');
const RUNTIME='CC6.5.7.5-CLEAN-V3-MENU-EXTRA-SEED';
const EXTRA_NODES=[
['moderation_rules','moderation',10,'moderation:rules','moderation','🛡 Правила канала','Правила модерации для выбранного канала.',true,'',false],
['moderation_words','moderation',20,'moderation:words','moderation','📋 Стоп-слова','Список стоп-слов канала.',true,'',false],
['moderation_add_word','moderation',30,'moderation:add_word','moderation','➕ Добавить слово','Добавить стоп-слово или фразу.',true,'',false],
['moderation_links','moderation',40,'moderation:links','moderation','🔗 Ссылки','Включить или отключить ссылки.',true,'',false],
['moderation_logs','moderation',50,'moderation:logs','moderation','📋 Журнал','Журнал модерации.',true,'',false],
['buttons_choose_post','buttons',10,'buttons:choose_post','buttons','📌 Выбрать пост','Выберите пост для кнопок.',true,'post_picker',false],
['buttons_create','buttons',20,'buttons:create','buttons','➕ Добавить кнопку','Шаг 1/3: пост, текст, ссылка, сохранить.',true,'',false],
['buttons_list','buttons',30,'buttons:list','buttons','📋 Кнопки поста','Список кнопок поста.',true,'',false],
['buttons_preview','buttons',40,'buttons:preview','buttons','👀 Предпросмотр','Предпросмотр кнопок.',true,'',false],
['gifts_create','gifts',10,'gifts:create','gifts','🎁 Создать подарок','Шаг 1/4: пост, подарок, сообщение, сохранить.',true,'',false],
['gifts_choose_post','gifts',20,'gifts:choose_post','gifts','📌 Выбрать пост','Выберите пост для подарка.',true,'post_picker',false],
['gifts_list','gifts',30,'gifts:list','gifts','📋 Список подарков','Список подарков.',true,'',false],
['gifts_subscription','gifts',40,'gifts:subscription','gifts','🔐 Проверка подписки','Проверка подписки.',true,'',false],
['gifts_test','gifts',50,'gifts:test','gifts','🧪 Тестовая выдача','Тестовая выдача.',true,'',false],
['stats_channel','stats',10,'stats:channel','stats','📊 Канал','Статистика канала.',true,'',false],
['stats_post','stats',20,'stats:post','stats','📌 Пост','Статистика поста.',true,'post_picker',false],
['stats_comments','stats',30,'stats:comments','stats','💬 Комментарии','Статистика комментариев.',true,'',false],
['stats_reactions','stats',40,'stats:reactions','stats','❤️ Реакции','Статистика реакций.',true,'',false],
['stats_gifts','stats',50,'stats:gifts','stats','🎁 Подарки','Статистика подарков.',true,'',false],
['stats_buttons','stats',60,'stats:buttons','stats','🔘 Клики','Статистика кликов.',true,'',false]
];
async function seed(){await db.init();for(const n of EXTRA_NODES){await db.query('insert into ak_menu_nodes_v3(node_key,parent_key,sort_order,route,owner,title,body,visible,dynamic_kind,delegate_to_legacy,meta,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now()) on conflict(node_key) do update set parent_key=excluded.parent_key,sort_order=excluded.sort_order,route=excluded.route,owner=excluded.owner,title=excluded.title,body=excluded.body,visible=excluded.visible,dynamic_kind=excluded.dynamic_kind,delegate_to_legacy=excluded.delegate_to_legacy,meta=ak_menu_nodes_v3.meta||excluded.meta,updated_at=now()',[...n,JSON.stringify({seedRuntime:RUNTIME})]);}return{ok:true,runtimeVersion:RUNTIME,seeded:EXTRA_NODES.length};}
module.exports={RUNTIME,seed,EXTRA_NODES};
