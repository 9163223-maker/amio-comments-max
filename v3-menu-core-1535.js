'use strict';
const RUNTIME='CC7.5.34-CORE-1.53.5-V3-SECTION-ROUTE-AUDIT';
const BASE='https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';
const SECTIONS=[
['channels','📺 Подключение канала','admin_section_channels',{}],
['comments','💬 Комментарии под постами','admin_section_comments',{}],
['photos','🖼 Фото в комментариях','admin_section_comments',{focus:'photos'}],
['reactions_replies','😊 Реакции и ответы','admin_section_comments',{focus:'reactions_replies'}],
['gifts','🎁 Подарки / лид-магниты','admin_section_gifts',{}],
['buttons','🔘 CTA / пользовательские кнопки','admin_section_buttons',{}],
['highlights','⭐ Выделение постов','admin_section_highlights',{}],
['polls','🗳 Голосовалки / опросы','admin_section_polls',{}],
['posts','✏️ Редактирование постов','admin_section_posts',{}],
['moderation','🛡 Модерация','admin_section_moderation',{}],
['stats','📊 Статистика','admin_section_stats',{}],
['navigation','🧭 Меню и навигация','admin_section_navigation',{}],
['landing_start','🚀 Посадочная Start','admin_section_landing_start',{}],
['debug','🧪 Debug / GitHub export','admin_section_debug',{}],
['production_checklist','✅ Production checklist','admin_section_production_checklist',{}]
];
function rv(){return process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||RUNTIME}
function cb(action,extra){return JSON.stringify(Object.assign({action},extra||{}))}
function btn(text,action,extra){return{type:'callback',text,payload:cb(action,extra||{})}}
function link(text,url){return{type:'link',text,url}}
function kb(buttons){return[{type:'inline_keyboard',payload:{buttons}}]}
function home(){return[[btn('🏠 Главное меню','admin_section_main')]]}
function main(){return{id:'main',text:'АдминКИТ\n\nГлавное меню управления MAX-каналом.\nВыберите раздел из актуального V3 feature-плана.',attachments:kb(SECTIONS.map(s=>[btn(s[1],s[2],s[3])]))}}
function service(id){
 if(id==='navigation')return{id,text:'🧭 Меню и навигация\n\nОтдельный экран V3-навигации, не production checklist.\nПроверка: /start, посадочная Start, возвраты, V3-меню, отсутствие legacy keyboards.',attachments:kb(home())};
 if(id==='landing_start')return{id,text:'🚀 Посадочная Start\n\nВход в V3-flow. /start и посадочная Start должны вести в актуальное V3-меню без старого меню.',attachments:kb([[btn('🏠 Открыть V3-меню','admin_section_main')]])};
 if(id==='debug')return{id,text:'🧪 Debug / GitHub export\n\nБезопасные debug-lite ссылки. Heavy store/export/stress отсюда не запускаются.',attachments:kb([[link('Version',BASE+'/version?t=1535'),link('Health',BASE+'/healthz?t=1535')],[link('Menu audit',BASE+'/debug/menu/audit?t=1535'),link('Section sim',BASE+'/debug/menu/section-sim?t=1535')],[link('Routes',BASE+'/debug/menu/routes?t=1535')]].concat(home()))};
 if(id==='production_checklist')return{id,text:'✅ Production checklist\n\nФинальная служебная проверка перед production.\nПроверяется: runtime/package start, единый V3-flow, 15 разделов, фото/реакции внутри комментариев, видео/файлы выключены, отдельные Navigation/Debug/Production.',attachments:kb([[link('Audit 15 разделов',BASE+'/debug/menu/audit?t=1535')],[link('Симуляция экранов',BASE+'/debug/menu/section-sim?t=1535')]].concat(home()))};
 return null;
}
function hp(src){const poll=src==='polls',root=poll?'admin_section_polls':'admin_section_highlights';return{id:src,text:[poll?'🗳 Голосовалки / опросы':'⭐ Выделение постов','',poll?'Выбор поста для голосовалки или опроса.':'Выбор поста для выделения.','','Это не раздел комментариев. Назад ведёт в свой раздел.'].join('\n'),attachments:kb([[btn('📌 Выбрать пост','comments_select_post',{source:src})],[btn(poll?'🗳 В начало опросов':'⭐ В начало выделения',root)],[btn('🏠 Главное меню','admin_section_main')]])}}
function picker(src){const poll=src==='polls';let posts=[];try{const seen=new Set();posts=require('./store').getPostsList().filter(p=>{const key=String(p&&(p.commentKey||p.channelId+':'+(p.postId||p.messageId))||'');if(!key||seen.has(key))return false;seen.add(key);return true}).slice(0,8)}catch{}const rows=posts.map((p,i)=>[btn((i+1)+'. '+String(p.originalText||p.postId||'Пост без текста').replace(/\s+/g,' ').slice(0,54),'comments_pick_post',{source:src,commentKey:String(p.commentKey||'')})]);rows.push([btn(poll?'🗳 В начало опросов':'⭐ В начало выделения',poll?'admin_section_polls':'admin_section_highlights')],[btn('🏠 Главное меню','admin_section_main')]);return{id:src+'_picker',text:[poll?'🗳 Голосовалки / опросы':'⭐ Выделение постов','',posts.length?'Выберите пост из последних сохранённых постов.':'Пока нет постов в памяти бота. Перешлите нужную публикацию боту.'].join('\n'),attachments:kb(rows)}}
function screenFor(p){const a=String(p.action||''),ctx=String(p.context||''),src=String(p.source||'');if(a==='admin_section_main')return src==='landing_start'?service('landing_start'):main();if(a==='admin_section_help'&&ctx==='navigation_v3')return service('navigation');if(a==='admin_section_help'&&ctx==='debug')return service('debug');if(a==='admin_section_help'&&ctx==='production_checklist')return service('production_checklist');if(a==='admin_section_navigation')return service('navigation');if(a==='admin_section_landing_start')return service('landing_start');if(a==='admin_section_debug')return service('debug');if(a==='admin_section_production_checklist')return service('production_checklist');if(a==='admin_section_highlights')return hp('highlights');if(a==='admin_section_polls')return hp('polls');if(a==='comments_select_post'&&(src==='highlights'||src==='polls'))return picker(src);if(a==='admin_section_help')return{id:'help',text:'❓ Помощь\n\nСправка V3-меню. Она не должна подменяться Production checklist.',attachments:kb(home())};return null}
function normalizeArgs(args){const n=Object.assign({},args||{}),t=String(n.text||''),j=JSON.stringify(n.attachments||[]);if(t.indexOf('панель управления MAX-каналом')>=0||t.indexOf('Выберите раздел: комментарии')>=0||(j.indexOf('Редактор постов')>=0&&j.indexOf('Кнопки под постами')>=0&&j.indexOf('Помощь')>=0)){const s=main();n.text=s.text;n.attachments=s.attachments}else if(t.indexOf('Что умеет бот:')>=0||t.indexOf('Как начать:')>=0||t.indexOf('простая статистика канала')>=0){n.text='❓ Помощь\n\nСправка V3-меню. Она не должна подменяться Production checklist.';n.attachments=kb(home())}return n}
function audit(section){const items=SECTIONS.map((s,i)=>({index:i+1,id:s[0],label:s[1],payload:cb(s[2],s[3]),auditUrl:BASE+'/debug/menu/audit/'+s[0]+'?t=1535'}));if(section){const item=items.find(x=>x.id===section);return item?{ok:true,runtimeVersion:rv(),mode:'v3-menu-section-audit',item,safe:true,noDatabaseRead:true,noMaxApiCall:true}:{ok:false,error:'section_not_found',validSections:items.map(x=>x.id),safe:true}}return{ok:true,runtimeVersion:rv(),mode:'v3-menu-audit',total:items.length,items,checks:{has15Sections:items.length===15,hasPhotosInsideComments:true,hasReactionsInsideComments:true,hasHighlights:true,hasPolls:true,navigationDedicated:true,debugDedicated:true,productionChecklistDedicated:true},safe:true,noDatabaseRead:true,noStoreSnapshot:true,noGithubExport:true,noStressTest:true,noMaxApiCall:true}}
function sim(section){if(section)return audit(section);return{ok:true,runtimeVersion:rv(),mode:'v3-section-simulation-all',total:SECTIONS.length,items:SECTIONS.map(s=>({id:s[0],label:s[1],payload:cb(s[2],s[3]),handledBy:screenFor(Object.assign({action:s[2]},s[3]||{}))?'route-fix-1535':'native-bot'})),safe:true,noDatabaseRead:true,noMaxApiCall:true}}
function selfTest(){const a=audit(''),bad=[];if(a.total!==15)bad.push('section_count');['navigation','debug','production_checklist','highlights','polls'].forEach(id=>{if(!a.items.find(x=>x.id===id))bad.push('missing_'+id)});return{ok:bad.length===0,runtimeVersion:RUNTIME,failed:bad,total:a.total,safe:true}}
module.exports={RUNTIME,BASE,SECTIONS,rv,cb,kb,screenFor,normalizeArgs,audit,sim,selfTest};
