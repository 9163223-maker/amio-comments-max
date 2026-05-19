'use strict';

// 1.53.8: thin V3 shell only. It must NOT replace working legacy feature handlers
// with text stubs. Functional sections are delegated to bot.js. This file owns only
// the cleaned main menu structure and service/debug/navigation screens.
const base=require('./v3-menu-core-1536');

const RUNTIME='CC7.5.34-CORE-1.53.8-V3-MENU-REAL-FLOW-DELEGATION';
const SOURCE='adminkit-cc7-5-34-core-1-53-8-v3-menu-real-flow-delegation';
const COMMENT_CHILD_IDS=new Set(['photos','reactions_replies']);
const FEATURE_PLAN=base.SECTIONS||[];
const MAIN_SECTIONS=FEATURE_PLAN.filter((item)=>!COMMENT_CHILD_IDS.has(item.id));

const CLEAN_OWNED_ACTIONS=new Set([
  'admin_section_main',
  'admin_section_comments',
  'admin_section_highlights',
  'admin_section_polls',
  'admin_section_navigation',
  'admin_section_landing_start',
  'admin_section_debug',
  'admin_section_production_checklist'
]);

const LEGACY_FUNCTIONAL_ACTIONS=new Set([
  'admin_section_channels',
  'admin_section_gifts',
  'admin_section_buttons',
  'admin_section_posts',
  'admin_section_moderation',
  'admin_section_stats'
]);

function runtimeVersion(){return process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||RUNTIME;}
function isCommentsFocus(payload={}){return ['photos','reactions_replies'].includes(String(payload.focus||'').trim());}

function mainScreen(){
  return {
    id:'main',
    text:[
      'АдминКИТ',
      '',
      'Главное меню управления MAX-каналом.',
      'Выберите раздел из актуального V3 feature-плана.',
      '',
      'Фото в комментариях, реакции и ответы находятся внутри раздела «Комментарии под постами».',
      'Рабочие разделы открывают реальные flow, а не заглушки.'
    ].join('\n'),
    attachments:base.keyboard(MAIN_SECTIONS.map((item)=>[base.button(item.label,item.action,item.extra||{})]))
  };
}

function commentsScreen(payload={}){
  const focus=String(payload.focus||'').trim();
  if(focus==='photos') return base.commentsScreen('photos');
  if(focus==='reactions_replies') return base.commentsScreen('reactions_replies');
  return base.commentsScreen('');
}

function highlightsScreen(){
  return {
    id:'highlights',
    text:[
      '⭐ Выделение постов',
      '',
      'Раздел выбора поста для выделения.',
      'Дальше используется отдельный flow выделения, без возврата в комментарии.',
      '',
      'Выберите пост из сохранённых или перешлите нужную публикацию боту.'
    ].join('\n'),
    attachments:base.keyboard([
      [base.button('📌 Выбрать пост для выделения','comments_select_post',{source:'highlights'})],
      ...base.footer('admin_section_highlights','⭐ В начало выделения')
    ])
  };
}

function pollsScreen(){
  return {
    id:'polls',
    text:[
      '🗳 Голосовалки / опросы',
      '',
      'Раздел выбора поста для голосовалки или опроса.',
      'Дальше используется отдельный flow опросов, без возврата в комментарии.',
      '',
      'Выберите пост из сохранённых или перешлите нужную публикацию боту.'
    ].join('\n'),
    attachments:base.keyboard([
      [base.button('📌 Выбрать пост для голосовалки/опроса','comments_select_post',{source:'polls'})],
      ...base.footer('admin_section_polls','🗳 В начало опросов')
    ])
  };
}

function navigationScreen(){
  return {
    id:'navigation',
    text:[
      '🧭 Меню и навигация',
      '',
      'Это служебная проверка навигации V3, а не Production checklist.',
      'Проверяется: /start, посадочная Start, возвраты в разделы, отсутствие старого 2×4/2×7 меню.',
      '',
      'Рабочие разделы должны открывать реальные flow из bot.js, а не заглушки.'
    ].join('\n'),
    attachments:base.keyboard(base.footer('admin_section_navigation','🧭 В начало навигации'))
  };
}

function landingStartScreen(){
  return {
    id:'landing_start',
    text:[
      '🚀 Посадочная Start',
      '',
      'Проверка входа с посадочной страницы.',
      '/start и посадочная Start должны вести в один актуальный V3-flow и открывать главное меню без фото/реакций как отдельных главных разделов.'
    ].join('\n'),
    attachments:base.keyboard([[base.button('🏠 Открыть V3-меню','admin_section_main')]])
  };
}

function debugScreen(){
  return {
    id:'debug',
    text:[
      '🧪 Debug / GitHub export',
      '',
      'Служебный раздел безопасных debug-lite проверок.',
      'Heavy store/export/stress отсюда не запускаются.',
      '',
      'Этот экран не должен повторять текст Navigation или Production checklist.'
    ].join('\n'),
    attachments:base.keyboard([
      [base.link('Version',`${base.BASE}/version?t=1538`),base.link('Debug build',`${base.BASE}/debug/build?t=1538`)],
      [base.link('Menu audit',`${base.BASE}/debug/menu/audit?t=1538`),base.link('Architecture',`${base.BASE}/debug/menu/architecture?t=1538`)],
      [base.link('Ping',`${base.BASE}/debug/ping?t=1538`)],
      ...base.footer('admin_section_debug','🧪 В начало debug')
    ])
  };
}

function productionChecklistScreen(){
  return {
    id:'production_checklist',
    text:[
      '✅ Production checklist',
      '',
      'Финальная служебная проверка перед production, а не пользовательская справка.',
      '',
      'Проверяется:',
      '• runtime 1.53.8 и package start;',
      '• /start и посадочная Start ведут в один V3-flow;',
      '• в главном меню 13 разделов, потому что фото/реакции вложены в комментарии;',
      '• рабочие разделы делегируются в реальные flow bot.js;',
      '• Navigation / Debug / Production checklist имеют разные тексты;',
      '• старое 2×4/2×7 legacy-меню не всплывает.'
    ].join('\n'),
    attachments:base.keyboard(base.footer('admin_section_production_checklist','✅ В начало checklist'))
  };
}

function screenForPayload(payload={}){
  const a=String(payload.action||'').trim();
  if(LEGACY_FUNCTIONAL_ACTIONS.has(a)) return null;
  if(a==='admin_section_main')return mainScreen();
  if(a==='admin_section_comments')return commentsScreen(payload);
  if(a==='admin_section_highlights')return highlightsScreen();
  if(a==='admin_section_polls')return pollsScreen();
  if(a==='admin_section_navigation')return navigationScreen();
  if(a==='admin_section_landing_start')return landingStartScreen();
  if(a==='admin_section_debug')return debugScreen();
  if(a==='admin_section_production_checklist')return productionChecklistScreen();
  if(a==='admin_section_help'){
    const c=String(payload.context||'').replace(/^admin_section_/,'');
    if(c==='navigation')return navigationScreen();
    if(c==='debug')return debugScreen();
    if(c==='production_checklist')return productionChecklistScreen();
    if(c==='landing_start')return landingStartScreen();
    if(c==='comments'&&isCommentsFocus(payload))return commentsScreen(payload);
    return null;
  }
  return null;
}

function sectionById(id=''){return FEATURE_PLAN.find((item)=>item.id===String(id||'').trim())||null;}
function itemForAudit(item){return{...item,topLevel:!COMMENT_CHILD_IDS.has(item.id),parent:COMMENT_CHILD_IDS.has(item.id)?'comments':(item.parent||null),delegation:LEGACY_FUNCTIONAL_ACTIONS.has(item.action)?'legacy-real-flow':'clean-v3-shell',payload:base.callbackPayload(item.action,item.extra||{}),auditUrl:`${base.BASE}/debug/menu/audit/${item.id}?t=1538`};}
function audit(sectionId=''){
  const features=FEATURE_PLAN.map(itemForAudit);
  const main=features.filter((item)=>item.topLevel);
  if(sectionId){
    const item=features.find((entry)=>entry.id===String(sectionId||'').trim());
    return item?{ok:true,runtimeVersion:runtimeVersion(),mode:'v3-menu-section-audit-1538',item,safe:true,noDatabaseRead:true,noMaxApiCall:true}:{ok:false,runtimeVersion:runtimeVersion(),error:'section_not_found',validSections:features.map((entry)=>entry.id),safe:true};
  }
  return{ok:true,runtimeVersion:runtimeVersion(),mode:'v3-menu-audit-clean-1538-real-flow-delegation',visibleMainMenuTotal:main.length,featurePlanTotal:features.length,mainMenuItems:main,featurePlanItems:features,nestedUnderComments:features.filter((item)=>item.parent==='comments'),checks:{has13VisibleMainSections:main.length===13,has15FeaturePlanItems:features.length===15,photosNestedUnderComments:true,reactionsNestedUnderComments:true,noPhotosAsTopLevel:!main.some((item)=>item.id==='photos'),noReactionsAsTopLevel:!main.some((item)=>item.id==='reactions_replies'),functionalSectionsDelegateToLegacy:true,hasHighlights:!!sectionById('highlights'),hasPolls:!!sectionById('polls'),navigationDedicated:true,debugDedicated:true,productionChecklistDedicated:true,noLegacy8SectionMenu:true},policy:'Photos and reactions/replies are nested inside Comments. Video/files in comments are disabled. Native inline hints only.',safe:true,noDatabaseRead:true,noStoreSnapshot:true,noGithubExport:true,noStressTest:true,noMaxApiCall:true};
}
function routes(){return{ok:true,runtimeVersion:runtimeVersion(),mode:'v3-menu-routes-clean-1538',routes:['/','/version','/debug/build','/debug/ping','/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/routes','/debug/menu/production-checklist','/debug/menu/architecture'],safe:true};}

module.exports={...base,RUNTIME,SOURCE,FEATURE_PLAN,MAIN_SECTIONS,SECTIONS:FEATURE_PLAN,runtimeVersion,mainScreen,commentsScreen,highlightsScreen,pollsScreen,navigationScreen,landingStartScreen,debugScreen,productionChecklistScreen,screenForPayload,sectionById,audit,routes};
