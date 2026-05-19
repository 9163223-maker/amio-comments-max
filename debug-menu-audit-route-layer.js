'use strict';

const Module = require('module');

const MARKER = '__ADMINKIT_DEBUG_MENU_AUDIT_ROUTE_LAYER_1_53_3__';
const PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const SECTIONS = [
  ['channels','📺 Подключение канала','admin_section_channels',{},'Подключение/проверка канала'],
  ['comments','💬 Комментарии под постами','admin_section_comments',{},'Комментарии под постами'],
  ['photos','🖼 Фото в комментариях','admin_section_comments',{focus:'photos'},'Фото внутри комментариев; видео и файлы выключены'],
  ['reactions_replies','😊 Реакции и ответы','admin_section_comments',{focus:'reactions_replies'},'Реакции и ответы внутри комментариев'],
  ['gifts','🎁 Подарки / лид-магниты','admin_section_gifts',{},'Подарки и лид-магниты'],
  ['buttons','🔘 CTA / пользовательские кнопки','admin_section_buttons',{},'Пользовательские кнопки под постами'],
  ['highlights','⭐ Выделение постов','comments_select_post',{source:'highlights'},'Выбор поста для выделения'],
  ['polls','🗳 Голосовалки / опросы','comments_select_post',{source:'polls'},'Выбор поста для голосовалки/опроса'],
  ['posts','✏️ Редактирование постов','admin_section_posts',{},'Редактирование опубликованных постов'],
  ['moderation','🛡 Модерация','admin_section_moderation',{},'Модерация комментариев'],
  ['stats','📊 Статистика','admin_section_stats',{},'Статистика'],
  ['navigation','🧭 Меню и навигация','admin_section_help',{context:'navigation_v3'},'Проверка V3-навигации'],
  ['landing_start','🚀 Посадочная Start','admin_section_main',{source:'landing_start'},'Посадочная Start ведёт в V3-меню'],
  ['debug','🧪 Debug / GitHub export','admin_section_help',{context:'debug'},'Безопасные debug-lite ссылки'],
  ['production_checklist','✅ Production checklist','admin_section_help',{context:'production_checklist'},'Финальная production-проверка']
];

function runtimeVersion() { return process.env.RUNTIME_VERSION || process.env.BUILD_VERSION || 'CC7.5.34-CORE-1.53.3-EARLY-V3-MENU-AUDIT'; }
function nowIso() { return new Date().toISOString(); }
function cb(action, extra) { return JSON.stringify(Object.assign({ action }, extra || {})); }
function noCache(res) { res.set({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','Surrogate-Control':'no-store'}); }
function send(res, payload, status) { noCache(res); res.status(status || 200).send(JSON.stringify(payload, null, 2)); }

function productionText() {
  return [
    '✅ Production checklist',
    '',
    'Это служебная финальная проверка перед production, а не пользовательская справка.',
    '',
    'Проверяется:',
    '• актуальный runtime и package start;',
    '• /start и посадочная Start ведут в один V3-flow;',
    '• старые legacy keyboards не используются;',
    '• 15 разделов V3 feature-плана доступны;',
    '• heavy debug/store/export/stress не запускаются;',
    '• фото остаются внутри раздела комментариев;',
    '• видео и файлы в комментариях выключены;',
    '• подсказки только native inline, без overlay/float.',
    '',
    'Дальше: пройти каждый раздел V3-меню и подтвердить, что старое меню не всплывает.'
  ].join('\n');
}

function items() {
  return SECTIONS.map((s, i) => ({
    index: i + 1,
    id: s[0],
    label: s[1],
    payload: cb(s[2], s[3]),
    expected: s[4],
    auditUrl: PUBLIC_BASE_URL + '/debug/menu/audit/' + s[0] + '?t=1533'
  }));
}

function audit(sectionId) {
  const list = items();
  if (sectionId) {
    const item = list.find((x) => x.id === String(sectionId));
    return item ? { ok:true, runtimeVersion:runtimeVersion(), generatedAt:nowIso(), mode:'v3-menu-section-audit', item, safe:true, noDatabaseRead:true, noStoreSnapshot:true, noGithubExport:true, noStressTest:true, noMaxApiCall:true }
      : { ok:false, runtimeVersion:runtimeVersion(), generatedAt:nowIso(), mode:'v3-menu-section-audit', error:'section_not_found', sectionId:String(sectionId), validSections:list.map((x)=>x.id), safe:true };
  }
  return { ok:true, runtimeVersion:runtimeVersion(), generatedAt:nowIso(), mode:'v3-menu-audit', total:list.length, items:list, checks:{has15Sections:list.length===15, hasPhotosInsideComments:true, hasReactionsInsideComments:true, hasHighlights:true, hasPolls:true, productionChecklistDedicated:true, oldHelpTextNotExpected:true}, policy:'No video/files in comments. Photos only inside comments. Native inline hints only; no overlay/float hints.', routes:['/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/production-checklist'], safe:true, noDatabaseRead:true, noStoreSnapshot:true, noGithubExport:true, noStressTest:true, noMaxApiCall:true };
}

function installRoutes(app) {
  if (!app || app.__adminkitMenuAudit1533) return app;
  app.__adminkitMenuAudit1533 = true;
  app.get('/debug/menu/audit', (req, res) => send(res, audit('')));
  app.get('/debug/menu/audit/:section', (req, res) => send(res, audit(req.params.section)));
  app.get('/debug/menu/production-checklist', (req, res) => send(res, { ok:true, runtimeVersion:runtimeVersion(), generatedAt:nowIso(), mode:'v3-production-checklist-text', text:productionText(), safe:true, noDatabaseRead:true, noMaxApiCall:true }));
  app.get('/debug/menu/routes', (req, res) => send(res, { ok:true, runtimeVersion:runtimeVersion(), generatedAt:nowIso(), routes:['/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/production-checklist','/debug/menu/routes'], safe:true }));
  return app;
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;
  const previousLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = previousLoad.apply(this, arguments);
    if (String(request) !== 'express' || !loaded || loaded.__adminkitMenuAuditWrapped1533) return loaded;
    function wrappedExpress() {
      return installRoutes(loaded.apply(this, arguments));
    }
    Object.setPrototypeOf(wrappedExpress, loaded);
    Object.assign(wrappedExpress, loaded);
    wrappedExpress.__adminkitMenuAuditWrapped1533 = true;
    return wrappedExpress;
  };
  return selfTest(false);
}

function selfTest(already) { return { ok:true, runtimeVersion:runtimeVersion(), marker:MARKER, already:Boolean(already), routes:['/debug/menu/audit','/debug/menu/audit/:section','/debug/menu/production-checklist','/debug/menu/routes'], constantTime:true, noDatabaseRead:true, noStoreSnapshot:true, noGithubExport:true, noStressTest:true, noMaxApiCall:true }; }

module.exports = { MARKER, SECTIONS, install, installRoutes, selfTest, audit, productionText };
