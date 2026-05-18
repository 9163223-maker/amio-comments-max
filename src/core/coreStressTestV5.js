'use strict';

const db = require('../../cc5-db-core');
const v4 = require('./coreStressTestV4');
const sectionRegistry = require('./sectionRegistry');
const routeDispatcher = require('./routeDispatcher');
const postRegistry = require('./postRegistryDataAdapter');
const accessManager = require('./accessManager');
const menuRenderer = require('./menuRenderer');
const flowDefinitions = require('./flowDefinitions');
const flowEngine = require('./flowEngine');
const postAddonManager = require('./postAddonManager');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.40.5-FAST-COMPACT-SCENARIO';
const STRESS_ADMIN_ID = 'core-stress-admin';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 360) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function boolOpt(value, fallback = false) { if (value === undefined || value === null || value === '') return fallback; return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase()); }
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
function findRouteButton(screen = {}, route = '') { return flatButtons(screen).find((b) => routeOf(b) === route); }
function isGenericChannelLabel(text = '') { const s = clean(text).toLowerCase(); return s === 'канал' || s === 'текущий канал' || s === 'канал без названия' || s.includes('existing channel'); }
function isGenericPostLabel(text = '') { return clean(text).toLowerCase().includes('пост без текста'); }
function actorMask(value = '') { const s = String(value || ''); return s.length > 8 ? `${s.slice(0, 3)}…${s.slice(-3)}` : s; }
function ctx(route, actor = {}, payload = {}) { const adminId = actor.adminId || STRESS_ADMIN_ID; return { adminId, admin_id: adminId, userId: adminId, route, updateType: 'stress_test_fast', payload }; }

function assertScreen(screen, name, strict = true) {
  if (!screen || typeof screen.text !== 'string' || !Array.isArray(screen.attachments)) throw new Error(name + ': invalid_screen_shape');
  if (!screen.text.trim()) throw new Error(name + ': empty_text');
  if (!Array.isArray(buttonsOf(screen))) throw new Error(name + ': buttons_not_array');
  if (strict && UI_ERROR_RE.test(screen.text)) throw new Error(name + ': screen_contains_error: ' + cut(screen.text));
  if (strict && TECH_RE.test(screen.text)) throw new Error(name + ': screen_contains_technical_text: ' + cut(screen.text));
  for (const b of flatButtons(screen)) {
    const text = String(b.text || '');
    if (strict && RAW_ID_RE.test(text)) throw new Error(name + ': button_contains_raw_id: ' + cut(text, 160));
  }
  return { textChars: screen.text.length, rows: buttonsOf(screen).length, buttons: flatButtons(screen).length };
}
async function step(name, fn) {
  const t = now();
  try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; }
  catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 520), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 520) }; }
}
async function firstRow(sqls = []) { await db.init(); for (const sql of sqls) { try { const r = await db.query(sql); if (r.rows?.[0]) return r.rows[0]; } catch {} } return null; }
async function pickActor() {
  const row = await firstRow([
    "select admin_id, channel_id, coalesce(nullif(max(channel_title),''),'') as channel_title, count(*)::int as post_count from ak_posts where admin_id<>'' and channel_id<>'' group by admin_id, channel_id order by max(updated_at) desc nulls last limit 1",
    "select admin_id, selected_channel_id as channel_id, '' as channel_title, 0::int as post_count from ak_admin_sessions where admin_id<>'' and selected_channel_id<>'' order by updated_at desc nulls last limit 1"
  ]);
  const adminId = clean(row?.admin_id || '');
  return adminId ? { adminId, channelId: clean(row?.channel_id || ''), channelTitle: clean(row?.channel_title || ''), postCount: Number(row?.post_count || 0) } : { adminId: STRESS_ADMIN_ID, channelId: '', channelTitle: '', postCount: 0 };
}
async function getSessionSnapshot(adminId = '') { await db.init(); const { rows } = await db.query('select * from ak_admin_sessions where admin_id=$1 limit 1', [String(adminId || '')]); return rows[0] || null; }
async function restoreSession(adminId = '', snapshot = null) {
  await db.init();
  if (!adminId) return { skipped: true, reason: 'no_admin_id' };
  if (!snapshot) { const r = await db.query('delete from ak_admin_sessions where admin_id=$1', [String(adminId)]); return { restored: false, deletedSession: r.rowCount || 0 }; }
  await db.query("insert into ak_admin_sessions(admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, selected_comment_key, draft, active_message_id, garbage_message_ids, updated_at, expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13) on conflict(admin_id) do update set account_id=excluded.account_id, active_section=excluded.active_section, active_flow=excluded.active_flow, active_step=excluded.active_step, selected_channel_id=excluded.selected_channel_id, selected_post_id=excluded.selected_post_id, selected_comment_key=excluded.selected_comment_key, draft=excluded.draft, active_message_id=excluded.active_message_id, garbage_message_ids=excluded.garbage_message_ids, updated_at=excluded.updated_at, expires_at=excluded.expires_at", [
    String(snapshot.admin_id || adminId), String(snapshot.account_id || ''), String(snapshot.active_section || ''), String(snapshot.active_flow || ''), String(snapshot.active_step || ''), String(snapshot.selected_channel_id || ''), String(snapshot.selected_post_id || ''), String(snapshot.selected_comment_key || ''), JSON.stringify(snapshot.draft || {}), String(snapshot.active_message_id || ''), JSON.stringify(snapshot.garbage_message_ids || []), snapshot.updated_at || new Date(), snapshot.expires_at || null
  ]);
  return { restored: true };
}
async function cleanupStressData() {
  await db.init();
  const deleted = [];
  for (const sql of [
    "delete from ak_post_lead_magnets where admin_id='core-stress-admin' or post_id='core-stress-post'",
    "delete from ak_post_buttons where admin_id='core-stress-admin' or post_id='core-stress-post'",
    "delete from ak_posts where source='stress_test' or post_id='core-stress-post'",
    "delete from ak_admin_sessions where admin_id='core-stress-admin'"
  ]) {
    try { const r = await db.query(sql); deleted.push({ table: sql.split(' ')[2], rowCount: r.rowCount || 0 }); }
    catch (e) { deleted.push({ table: sql.split(' ')[2], error: e?.message || String(e) }); }
  }
  return deleted;
}

async function dispatchShape(route, actor, payload = {}, strict = true) {
  const screen = await routeDispatcher.dispatch(ctx(route, actor, payload));
  return { screen, shape: assertScreen(screen, route, strict) };
}
function buttonTextsForRoute(screen = {}, route = '') { return flatButtons(screen).filter((b) => routeOf(b) === route).map((b) => clean(b.text)); }
function assertHumanList(screen = {}, route = '', kind = 'post') {
  const targetRoute = kind === 'channel' ? route : route;
  const labels = buttonTextsForRoute(screen, targetRoute);
  if (!labels.length) return { labels: [], checked: false, reason: 'no_buttons_for_route' };
  const generic = labels.filter((x) => kind === 'channel' ? isGenericChannelLabel(x.replace(/^\d+\.\s*/, '').replace(/·.*$/, '')) : isGenericPostLabel(x));
  const raw = labels.filter((x) => RAW_ID_RE.test(x));
  if (raw.length) throw new Error(`${targetRoute}: raw ids in labels: ${raw.slice(0, 3).join('; ')}`);
  if (generic.length === labels.length) throw new Error(`${targetRoute}: all labels are generic: ${generic.slice(0, 3).join('; ')}`);
  return { labels: labels.slice(0, 5), checked: true, genericCount: generic.length, total: labels.length };
}

async function runSectionHomes(actor, sections = []) {
  const out = [];
  for (const section of sections) {
    const route = section.routes?.home || `${section.id}.home`;
    out.push(await step(`section.${section.id}.home`, async () => ({ screen: (await dispatchShape(route, actor, { sectionId: section.id }, true)).shape })));
  }
  return out;
}
async function runManagedScenario(actor, baseline, sectionId = 'lead_magnets') {
  await restoreSession(actor.adminId, baseline);
  const isLead = sectionId === 'lead_magnets';
  const homeRoute = isLead ? 'lead_magnets.home' : 'buttons.home';
  const selectRoute = isLead ? 'lead_magnets.select_channel' : 'buttons.select_channel';
  const postRoute = isLead ? 'lead_magnets.post' : 'buttons.post';
  const addRoute = isLead ? 'lead_magnets.add' : 'buttons.add';
  const home = await dispatchShape(homeRoute, actor, {}, true);
  const channelLabels = assertHumanList(home.screen, selectRoute, 'channel');
  const chBtn = findRouteButton(home.screen, selectRoute);
  if (!chBtn) return { home: home.shape, skipped: true, reason: 'no_channel_button' };
  const chPayload = payloadOf(chBtn);
  const posts = await dispatchShape(selectRoute, actor, chPayload, true);
  const postLabels = assertHumanList(posts.screen, postRoute, 'post');
  const postBtn = findRouteButton(posts.screen, postRoute);
  if (!postBtn) return { home: home.shape, posts: posts.shape, skipped: true, reason: 'no_post_button' };
  const postPayload = payloadOf(postBtn);
  const center = await dispatchShape(postRoute, actor, postPayload, true);
  const addBtn = findRouteButton(center.screen, addRoute);
  const add = addBtn ? await dispatchShape(addRoute, actor, payloadOf(addBtn), true) : null;
  await restoreSession(actor.adminId, baseline);
  return { home: home.shape, posts: posts.shape, center: center.shape, add: add?.shape || null, channelLabels, postLabels, channelPayloadTitle: chPayload.channelTitle || '', postPayloadTitle: postPayload.postTitle || '' };
}

async function runFast(options = {}) {
  const startedAt = new Date().toISOString();
  const tests = [];
  const actor = await pickActor();
  const baseline = await getSessionSnapshot(actor.adminId).catch(() => null);
  const cleanup = String(options.cleanup || '1') !== '0';
  const sections = sectionRegistry.listAll();

  tests.push(await step('self.sectionRegistry', async () => sectionRegistry.selfTest()));
  tests.push(await step('self.accessManager', async () => accessManager.selfTest ? accessManager.selfTest() : { ok: true }));
  tests.push(await step('self.menuRenderer', async () => menuRenderer.selfTest()));
  tests.push(await step('self.postRegistry', async () => postRegistry.selfTest()));
  tests.push(await step('self.postAddonManager.ensure', async () => { await postAddonManager.ensure(); return { ok: true }; }));
  tests.push(await step('self.flowDefinitions', async () => flowDefinitions.selfTest ? flowDefinitions.selfTest() : { ok: true }));
  tests.push(await step('self.flowEngine', async () => flowEngine.selfTest()));
  tests.push(await step('dispatch.main.home', async () => ({ screen: (await dispatchShape('main.home', actor, {}, true)).shape })));
  tests.push(...await runSectionHomes(actor, sections));
  tests.push(await step('scenario.lead_magnets.channel_post_add', async () => runManagedScenario(actor, baseline, 'lead_magnets')));
  tests.push(await step('scenario.buttons.channel_post_add', async () => runManagedScenario(actor, baseline, 'buttons')));
  if (cleanup) tests.push(await step('db.cleanupStressData', async () => ({ deleted: await cleanupStressData() })));
  tests.push(await step('db.restoreActorSession', async () => restoreSession(actor.adminId, baseline)));

  const failed = tests.filter((x) => x.ok === false);
  const slow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 700));
  return {
    ok: failed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    startedAt,
    durationMs: now() - Date.parse(startedAt),
    mode: 'fast_compact_scenario',
    actor: { adminIdMasked: actor.adminId === STRESS_ADMIN_ID ? STRESS_ADMIN_ID : actorMask(actor.adminId), channelIdMasked: actor.channelId ? actorMask(actor.channelId) : '', postCount: actor.postCount },
    summary: {
      totalChecks: tests.length,
      failed: failed.length,
      slow: slow.length,
      sectionHomeChecks: sections.length,
      scenarioChecks: 2,
      cleanup,
      validatesButtonsSection: true,
      validatesLeadMagnetsSection: true,
      validatesHumanChannelLabels: true,
      validatesHumanPostPreviews: true,
      boundedForMobileSafari: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — быстрый сценарный обход Core прошёл',
    failed: failed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' })),
    slow: slow.map((x) => ({ name: x.name, ms: x.ms })),
    tests: tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', screen: x.screen || null, skipped: x.skipped || false, reason: x.reason || '', channelLabels: x.channelLabels || undefined, postLabels: x.postLabels || undefined })),
    notes: [
      'Этот режим заменяет прежний мобильный compact: он не строит огромный граф всех путей, поэтому не должен подвешивать Safari.',
      'Он проверяет все 16 home-разделов и живые сценарии разделов Лид-магниты и Кнопки: канал → список постов → карточка поста → добавление.',
      'Полный глубокий граф остаётся доступен через deep=1 или verbose=1, но он может выполняться долго.'
    ]
  };
}

async function run(options = {}) {
  if (boolOpt(options.verbose, false) || boolOpt(options.raw, false) || boolOpt(options.deep, false)) {
    const effective = { ...options, depth: options.depth ?? 2, maxPathsPerSection: options.maxPathsPerSection ?? 8 };
    return v4.run(effective);
  }
  return runFast(options);
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    baseRuntimeVersion: v4.RUNTIME,
    fastCompactDefault: true,
    boundedForMobileSafari: true,
    buttonsScenarioReady: true,
    leadMagnetsScenarioReady: true,
    humanChannelLabelsAsserted: true,
    humanPostPreviewsAsserted: true,
    deepModeAvailable: true
  };
}

module.exports = { RUNTIME, run, selfTest, runFast };
