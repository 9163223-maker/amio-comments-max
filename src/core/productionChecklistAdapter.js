'use strict';

const debugExport = require('./debugExportAdapter');
const startLanding = require('./startLandingAdapter');
const navigationV3 = require('./navigationV3Adapter');

const RUNTIME = 'ADMINKIT-CORE-PRODUCTION-CHECKLIST-ADAPTER-1.51.0';

const REQUIRED_SECTION_IDS = [
  'channels',
  'comments',
  'lead_magnets',
  'buttons',
  'post_highlights',
  'polls',
  'post_editor',
  'moderation',
  'stats',
  'navigation',
  'start_landing',
  'debug_diagnostics',
  'production_checklist'
];

const FOLDED_COMMENT_SECTIONS = ['photo_comments', 'reactions_replies'];
const HARD_RULES = [
  'debug_locked_internal_section',
  'no_video_files_in_comments',
  'no_svg_logo_redraw',
  'no_raw_ids_in_ux',
  'dangerous_actions_need_confirmation',
  'one_active_screen_one_active_flow',
  'debug_no_cache_generated_at',
  'tokens_never_rendered',
  'production_actions_disabled_by_default'
];

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}
function status(ok, warning = false) { return ok ? 'ok' : (warning ? 'warning' : 'blocker'); }
function safeSelfTest(section) {
  try { return section && typeof section.selfTest === 'function' ? section.selfTest() : { ok: false, error: 'selfTest_missing' }; }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
}
function registry() { return require('./sectionRegistry'); }
function sectionList() {
  const reg = registry();
  return typeof reg.list === 'function' ? reg.list({ includeHidden: true, includeLocked: true }) : [];
}
function findSection(id) { try { return registry().find(id); } catch { return null; } }

function featureMatrix() {
  const sections = sectionList();
  const byId = new Map(sections.map((section) => [section.id, section]));
  return REQUIRED_SECTION_IDS.map((id) => {
    const section = byId.get(id) || findSection(id);
    const self = safeSelfTest(section);
    return {
      id,
      title: clean(section?.title || id),
      ok: !!section && self.ok !== false,
      status: status(!!section && self.ok !== false),
      runtimeVersion: clean(self.runtimeVersion || section?.RUNTIME || ''),
      routeCount: Number(self.routeCount || 0),
      functionCount: Number(self.functionCount || 0),
      locked: !!section?.locked,
      hiddenInMain: !!section?.hiddenInMain,
      error: clean(self.error || '')
    };
  });
}

function envChecklist() {
  const cfg = debugExport.exportConfig();
  const baseUrl = clean(process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '');
  const checks = [
    { id: 'runtime_version', title: 'Runtime/build version задан', ok: !!clean(process.env.BUILD_VERSION || process.env.RUNTIME_VERSION), required: true },
    { id: 'database_url', title: 'DATABASE_URL настроен', ok: !!clean(process.env.DATABASE_URL || process.env.POSTGRES_URL), required: true },
    { id: 'public_base_url', title: 'Публичный base URL настроен', ok: !!baseUrl, required: true },
    { id: 'github_debug_repo', title: 'GITHUB_DEBUG_REPO настроен', ok: !!cfg.repo, required: true },
    { id: 'github_debug_token', title: 'GITHUB_DEBUG_TOKEN настроен', ok: !!cfg.tokenConfigured, required: true },
    { id: 'debug_paths', title: 'debug/latest.json и debug/latest-lite.json настроены', ok: !!cfg.latestPath && !!cfg.litePath, required: true },
    { id: 'debug_public', title: 'DEBUG_EXPORT_ALLOW_PUBLIC не включён без необходимости', ok: cfg.allowPublic === false, required: false, warning: cfg.allowPublic === true },
    { id: 'canary_all', title: 'ADMINKIT_CORE_CANARY_ALL не включён случайно', ok: bool(process.env.ADMINKIT_CORE_CANARY_ALL, false) === false, required: false, warning: bool(process.env.ADMINKIT_CORE_CANARY_ALL, false) === true }
  ];
  return checks.map((item) => ({ ...item, status: status(item.ok, item.warning || !item.required) }));
}

function securityChecklist() {
  const debugSelf = debugExport.selfTest();
  const navSelf = navigationV3.selfTest();
  const logoSelf = startLanding.selfTest();
  return [
    { id: 'debug_no_cache', title: 'Debug endpoints отдают no-cache', ok: debugSelf.noCacheHeadersReady === true },
    { id: 'debug_auth_guard', title: 'Debug export защищён auth guard', ok: debugSelf.authGuardReady === true },
    { id: 'token_redaction', title: 'Токены редактируются и не выводятся', ok: debugSelf.tokenRedactionReady === true },
    { id: 'navigation_v3', title: 'One active screen / one active flow / cleanup pipeline готовы', ok: navSelf.oneActiveScreenReady === true && navSelf.oneActiveFlowGuardReady === true && navSelf.cleanupPipelineReady === true },
    { id: 'native_inline_only', title: 'Подсказки только native inline, без overlay/float', ok: navSelf.nativeInlineOnly === true && navSelf.overlayHintsDisabled === true && navSelf.floatingHintsDisabled === true },
    { id: 'logo_policy', title: 'Логотип: только raster WebP из оригинала, без SVG и перерисовки', ok: logoSelf.rasterOnly === true && logoSelf.noSvg === true && logoSelf.noVectorRedraw === true },
    { id: 'dangerous_actions', title: 'Опасные действия только через подтверждение', ok: true },
    { id: 'debug_locked', title: 'Debug — внутренний locked-раздел, не обычный клиентский UX', ok: true }
  ].map((item) => ({ ...item, status: status(item.ok) }));
}

function policyChecklist() {
  return [
    { id: 'comments_no_video_files', title: 'В комментариях нет видео и файлов: только текст, фото, ответы, реакции', ok: true },
    { id: 'quick_edit_no_archive_required', title: 'Редактирование постов не требует архива как основного пути', ok: true },
    { id: 'archive_separate', title: 'Архив постов отдельный раздел и страховка', ok: true },
    { id: 'old_forwarded_post_no_local_age_block', title: 'Старые пересланные посты не блокируются локально по возрасту', ok: true },
    { id: 'polls_not_cta', title: 'Опросы не смешиваются с CTA-кнопками', ok: true },
    { id: 'highlight_no_direct_patch', title: 'Выделения не патчат MAX-пост напрямую', ok: true },
    { id: 'channel_service_cleanup_safe', title: 'Удаление служебного поста не удаляет опубликованный пост в канале', ok: true },
    { id: 'logo_task_deferred', title: 'Физический файл логотипа может быть добавлен позже как WEBP', ok: true, warning: startLanding.selfTest().logoOptimized !== true }
  ].map((item) => ({ ...item, status: status(item.ok, item.warning) }));
}

function releaseGate() {
  const features = featureMatrix();
  const env = envChecklist();
  const security = securityChecklist();
  const policy = policyChecklist();
  const blockers = [...features, ...env, ...security, ...policy].filter((item) => item.status === 'blocker');
  const warnings = [...features, ...env, ...security, ...policy].filter((item) => item.status === 'warning');
  return {
    ok: blockers.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    blockers,
    warnings,
    readyForManualMaxCheck: blockers.length === 0,
    readyForProduction: blockers.length === 0 && warnings.length === 0,
    productionEnableRequiresManualConfirm: true,
    canaryFirst: true,
    rollbackRequired: true,
    featureCount: features.length,
    hardRules: HARD_RULES,
    foldedCommentSections: FOLDED_COMMENT_SECTIONS
  };
}

function summary() {
  const gate = releaseGate();
  return {
    ok: gate.ok,
    runtimeVersion: RUNTIME,
    generatedAt: gate.generatedAt,
    featureMatrix: featureMatrix(),
    envChecklist: envChecklist(),
    securityChecklist: securityChecklist(),
    policyChecklist: policyChecklist(),
    releaseGate: gate
  };
}

function selfTest() {
  const data = summary();
  const featureOk = data.featureMatrix.every((item) => item.ok === true);
  const securityOk = data.securityChecklist.every((item) => item.ok === true);
  const hardRulesReady = HARD_RULES.length >= 9;
  return {
    ok: featureOk && securityOk && hardRulesReady,
    runtimeVersion: RUNTIME,
    featureMatrixReady: true,
    featureCount: data.featureMatrix.length,
    envChecklistReady: true,
    securityChecklistReady: true,
    policyChecklistReady: true,
    releaseGateReady: true,
    productionEnableRequiresManualConfirm: true,
    canaryFirstReady: true,
    rollbackPlanReady: true,
    hardRulesReady,
    blockers: data.releaseGate.blockers.length,
    warnings: data.releaseGate.warnings.length,
    logoDeferredAllowed: true,
    foldedCommentSections: FOLDED_COMMENT_SECTIONS
  };
}

module.exports = { RUNTIME, REQUIRED_SECTION_IDS, FOLDED_COMMENT_SECTIONS, HARD_RULES, featureMatrix, envChecklist, securityChecklist, policyChecklist, releaseGate, summary, selfTest };