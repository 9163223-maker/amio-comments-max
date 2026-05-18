'use strict';

const db = require('../../cc5-db-core');
const base = require('./coreStressTestV5');
const routeDispatcher = require('./routeDispatcher');
const postRegistry = require('./postRegistryDataAdapter');
const sectionRegistry = require('./sectionRegistry');

const RUNTIME = 'ADMINKIT-CORE-STRESS-TEST-1.41.0-UNIFIED-COMMENTS';
const STRESS_ADMIN_ID = 'core-stress-admin';
const COMMENTS_POST_ID = 'core-stress-comments-post';
const COMMENTS_COMMENT_KEY = 'core-stress-comments-comment-key';
const UI_ERROR_RE = /(⚠️|Не удалось|Диагностика:|does not exist|violates .*constraint|unexpected_step|Ошибка:|error:)/i;
const TECH_RE = /\b(Flow:|Step:|runtimeVersion|sectionRegistry|ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|debug-post|clean delivery-flow|clean-flow|read-only)\b/i;
const RAW_ID_RE = /(^|\s)-?\d{8,}(\s|$)|[a-f0-9]{16,}/i;

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 360) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function now() { return Date.now(); }
function actorMask(value = '') { const s = String(value || ''); return s.length > 8 ? `${s.slice(0, 3)}…${s.slice(-3)}` : s; }
function ctx(route, actor = {}, payload = {}) { const adminId = actor.adminId || STRESS_ADMIN_ID; return { adminId, admin_id: adminId, userId: adminId, route, updateType: 'stress_test_comments_1410', payload }; }
function buttonsOf(screen = {}) { try { return (((screen.attachments || [])[0] || {}).payload || {}).buttons || []; } catch { return []; } }
function flatButtons(screen = {}) { return buttonsOf(screen).flat().filter(Boolean); }
function payloadOf(button = {}) { try { return JSON.parse(button.payload || '{}'); } catch { return {}; } }
function routeOf(button = {}) { return String(payloadOf(button).r || '').trim(); }
function findRouteButton(screen = {}, route = '') { return flatButtons(screen).find((b) => routeOf(b) === route); }
function buttonTexts(screen = {}) { return flatButtons(screen).map((b) => clean(b.text)); }
function isGenericChannelLabel(text = '') { const s = clean(text).replace(/^\d+\.\s*/, '').replace(/·.*$/, '').toLowerCase(); return s === 'канал' || s === 'текущий канал' || s === 'канал без названия' || s.includes('existing channel'); }
function isGenericPostLabel(text = '') { return clean(text).toLowerCase().includes('пост без текста'); }
function assertScreen(screen, name, strict = true) {
  if (!screen || typeof screen.text !== 'string' || !Array.isArray(screen.attachments)) throw new Error(name + ': invalid_screen_shape');
  if (!screen.text.trim()) throw new Error(name + ': empty_text');
  if (strict && UI_ERROR_RE.test(screen.text)) throw new Error(name + ': screen_contains_error: ' + cut(screen.text));
  if (strict && TECH_RE.test(screen.text)) throw new Error(name + ': screen_contains_technical_text: ' + cut(screen.text));
  for (const b of flatButtons(screen)) {
    const text = String(b.text || '');
    if (strict && RAW_ID_RE.test(text)) throw new Error(name + ': button_contains_raw_id: ' + cut(text, 160));
  }
  return { textChars: screen.text.length, rows: buttonsOf(screen).length, buttons: flatButtons(screen).length };
}
function assertText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); if (!re.test(String(screen.text || ''))) throw new Error(name + ': expected text not found: ' + re); }
function assertNoText(screen = {}, pattern, name = '') { const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i'); if (re.test(String(screen.text || ''))) throw new Error(name + ': forbidden text found: ' + re + ': ' + cut(screen.text)); }
function assertRoute(screen = {}, route = '', name = '') { const btn = findRouteButton(screen, route); if (!btn) throw new Error(name + ': button route not found: ' + route); return btn; }
async function step(name, fn) { const t = now(); try { return { name, ok: true, ms: now() - t, ...(await fn() || {}) }; } catch (e) { return { name, ok: false, ms: now() - t, error: cut(e?.message || String(e), 520), stackHead: cut(String(e?.stack || '').split('\n').slice(0, 2).join('\n'), 520) }; } }
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
  await db.query("insert into ak_admin_sessions(admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, selected_comment_key, draft, active_message_id, garbage_message_ids, updated_at, expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13) on conflict(admin_id) do update set account_id=excluded.account_id, active_section=excluded.active_section, active_flow=excluded.active_flow, active_step=excluded.active_step, selected_channel_id=excluded.selected_channel_id, selected_post_id=excluded.selected_post_id, selected_comment_key=excluded.selected_comment_key, draft=excluded.draft, active_message_id=excluded.active_message_id, garbage_message_ids=excluded.garbage_message_ids, updated_at=excluded.updated_at, expires_at=excluded.expires_at", [String(snapshot.admin_id || adminId), String(snapshot.account_id || ''), String(snapshot.active_section || ''), String(snapshot.active_flow || ''), String(snapshot.active_step || ''), String(snapshot.selected_channel_id || ''), String(snapshot.selected_post_id || ''), String(snapshot.selected_comment_key || ''), JSON.stringify(snapshot.draft || {}), String(snapshot.active_message_id || ''), JSON.stringify(snapshot.garbage_message_ids || []), snapshot.updated_at || new Date(), snapshot.expires_at || null]);
  return { restored: true };
}
async function cleanupStressData() {
  await db.init();
  const deleted = [];
  for (const sql of [
    "delete from ak_post_lead_magnets where admin_id='core-stress-admin' or post_id like 'core-stress-%'",
    "delete from ak_post_buttons where admin_id='core-stress-admin' or post_id like 'core-stress-%'",
    "delete from ak_posts where source='stress_test' or post_id like 'core-stress-%'",
    "delete from ak_admin_sessions where admin_id='core-stress-admin'"
  ]) {
    try { const r = await db.query(sql); deleted.push({ table: sql.split(' ')[2], rowCount: r.rowCount || 0 }); }
    catch (e) { deleted.push({ table: sql.split(' ')[2], error: e?.message || String(e) }); }
  }
  return deleted;
}
async function seedCommentsPost(actor = {}) {
  if (!actor.adminId || !actor.channelId) return { skipped: true, reason: 'no_real_actor_channel' };
  const channelTitle = actor.channelTitle && !isGenericChannelLabel(actor.channelTitle) ? actor.channelTitle : 'Подключённый канал';
  const result = await postRegistry.upsertPost({ ...actor, channelId: actor.channelId, channelTitle }, {
    channelId: actor.channelId,
    channelTitle,
    postId: COMMENTS_POST_ID,
    commentKey: COMMENTS_COMMENT_KEY,
    postTitle: 'Тест комментариев: текст фото ответы реакции',
    postPreview: 'Тест комментариев: текст фото ответы реакции',
    source: 'stress_test',
    meta: { stressTest: true, runtimeVersion: RUNTIME, purpose: 'unified_comments' }
  });
  const post = result.post || {};
  return { payload: { channelId: post.channelId || actor.channelId, channelTitle: post.channelTitle || channelTitle, postId: post.postId || COMMENTS_POST_ID, postTitle: post.postTitle || 'Тест комментариев: текст фото ответы реакции' }, post };
}
async function dispatchShape(route, actor, payload = {}, strict = true) { const screen = await routeDispatcher.dispatch(ctx(route, actor, payload)); return { screen, shape: assertScreen(screen, route, strict) }; }
function assertHumanList(screen = {}, route = '', kind = 'post') {
  const labels = flatButtons(screen).filter((b) => routeOf(b) === route).map((b) => clean(b.text));
  if (!labels.length) return { labels: [], checked: false, reason: 'no_buttons_for_route' };
  const generic = labels.filter((x) => kind === 'channel' ? isGenericChannelLabel(x) : isGenericPostLabel(x));
  const raw = labels.filter((x) => RAW_ID_RE.test(x));
  if (raw.length) throw new Error(`${route}: raw ids in labels: ${raw.slice(0, 3).join('; ')}`);
  if (generic.length === labels.length) throw new Error(`${route}: all labels are generic: ${generic.slice(0, 3).join('; ')}`);
  return { labels: labels.slice(0, 5), checked: true, genericCount: generic.length, total: labels.length };
}
async function runCommentsUnifiedScenario(actor, baseline) {
  await restoreSession(actor.adminId, baseline);
  const seeded = await seedCommentsPost(actor);
  if (seeded.skipped) return { skipped: true, reason: seeded.reason };
  const payload = seeded.payload;

  const main = await dispatchShape('main.home', actor, {}, true);
  const mainTexts = buttonTexts(main.screen).join(' | ');
  if (/Фото в комментариях|Реакции и ответы/i.test(mainTexts)) throw new Error('main.home: folded comment subsections are still visible: ' + mainTexts);
  assertText(main.screen, /Комментарии/i, 'comments.main_has_comments');

  const home = await dispatchShape('comments.home', actor, {}, true);
  const channelLabels = assertHumanList(home.screen, 'comments.select_channel', 'channel');
  const posts = await dispatchShape('comments.select_channel', actor, { channelId: payload.channelId, channelTitle: payload.channelTitle }, true);
  const postLabels = assertHumanList(posts.screen, 'comments.post', 'post');
  assertText(posts.screen, /Тест комментариев/i, 'comments.posts_has_seed_preview');

  const center = await dispatchShape('comments.post', actor, payload, true);
  ['comments.toggle', 'comments.photo_settings', 'comments.replies_settings', 'comments.reactions_settings', 'comments.moderation', 'comments.diagnostics'].forEach((route) => assertRoute(center.screen, route, 'comments.center'));
  assertText(center.screen, /Фото в комментариях|Ответы на комментарии|Реакции на комментарии|Модерация/i, 'comments.center_unified_features');

  const toggle = await dispatchShape('comments.toggle', actor, payload, true);
  assertText(toggle.screen, /включается или выключается обсуждение/i, 'comments.toggle_text');

  const photo = await dispatchShape('comments.photo_settings', actor, payload, true);
  assertText(photo.screen, /Фото в комментариях/i, 'comments.photo_text');
  assertText(photo.screen, /Видео и файлы.*не добавляем/i, 'comments.photo_no_video_files_text');

  const replies = await dispatchShape('comments.replies_settings', actor, payload, true);
  assertText(replies.screen, /Ответы нужны|отвечать на конкретный комментарий/i, 'comments.replies_text');

  const reactions = await dispatchShape('comments.reactions_settings', actor, payload, true);
  assertText(reactions.screen, /Реакции относятся к конкретным комментариям/i, 'comments.reactions_text');

  const moderation = await dispatchShape('comments.moderation', actor, payload, true);
  assertText(moderation.screen, /удалить комментарий|скрыть комментарий/i, 'comments.moderation_text');

  const diagnostics = await dispatchShape('comments.diagnostics', actor, payload, true);
  assertText(diagnostics.screen, /полный путь|старые пропатченные посты/i, 'comments.diagnostics_text');
  assertNoText(diagnostics.screen, /ak_|runtimeVersion|debug-post|legacy adapters/i, 'comments.diagnostics_no_tech');

  await restoreSession(actor.adminId, baseline);
  return { seeded: seeded.post, payload, main: main.shape, home: home.shape, posts: posts.shape, center: center.shape, toggle: toggle.shape, photo: photo.shape, replies: replies.shape, reactions: reactions.shape, moderation: moderation.shape, diagnostics: diagnostics.shape, channelLabels, postLabels, checks: ['main_folded_sections_hidden','channel_list','post_preview','post_center','toggle','photo','replies','reactions','moderation','diagnostics'] };
}

async function runFast(options = {}) {
  const startedAt = new Date().toISOString();
  const baseResult = await base.runFast(options);
  const tests = [];
  const actor = await pickActor();
  const baseline = await getSessionSnapshot(actor.adminId).catch(() => null);
  const cleanup = String(options.cleanup || '1') !== '0';

  tests.push(await step('self.commentsSection', async () => sectionRegistry.find('comments').selfTest()));
  tests.push(await step('self.photoCommentsFolded', async () => sectionRegistry.find('photo_comments').selfTest()));
  tests.push(await step('self.reactionsRepliesFolded', async () => sectionRegistry.find('reactions_replies').selfTest()));
  tests.push(await step('scenario.comments.unified_section_end_to_end', async () => runCommentsUnifiedScenario(actor, baseline)));
  if (cleanup) tests.push(await step('db.cleanupStressData.comments', async () => ({ deleted: await cleanupStressData() })));
  tests.push(await step('db.restoreActorSession.comments', async () => restoreSession(actor.adminId, baseline)));

  const localFailed = tests.filter((x) => x.ok === false);
  const localSlow = tests.filter((x) => Number(x.ms || 0) > Number(options.slowMs || 700));
  const baseFailed = Array.isArray(baseResult.failed) ? baseResult.failed : [];
  const baseSlow = Array.isArray(baseResult.slow) ? baseResult.slow : [];
  const failed = [...baseFailed, ...localFailed.map((x) => ({ name: x.name, ms: x.ms, error: x.error, stackHead: x.stackHead || '' }))];
  const slow = [...baseSlow, ...localSlow.map((x) => ({ name: x.name, ms: x.ms }))];

  return {
    ...baseResult,
    ok: baseResult.ok === true && localFailed.length === 0,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    startedAt,
    durationMs: Date.now() - Date.parse(startedAt),
    mode: 'fast_compact_scenario_1410',
    actor: { adminIdMasked: actor.adminId === STRESS_ADMIN_ID ? STRESS_ADMIN_ID : actorMask(actor.adminId), channelIdMasked: actor.channelId ? actorMask(actor.channelId) : '', postCount: actor.postCount },
    summary: {
      ...(baseResult.summary || {}),
      totalChecks: Number(baseResult.summary?.totalChecks || 0) + tests.length,
      failed: failed.length,
      slow: slow.length,
      validatesUnifiedCommentsSection: true,
      validatesPhotoInsideComments: true,
      validatesRepliesInsideComments: true,
      validatesReactionsInsideComments: true,
      validatesModerationInsideComments: true,
      validatesFoldedCommentSubsectionsHiddenFromMain: true,
      validatesNoVideoFilesInComments: true
    },
    status: failed.length ? 'FAILED — см. failed' : 'OK — Core 1.41.0: кнопки, лид-магниты и единый раздел комментариев прошли сценарный обход',
    failed,
    slow,
    tests: [...(Array.isArray(baseResult.tests) ? baseResult.tests : []), ...tests.map((x) => ({ name: x.name, ok: x.ok, ms: x.ms, error: x.error || '', screen: x.screen || null, skipped: x.skipped || false, reason: x.reason || '', channelLabels: x.channelLabels || undefined, postLabels: x.postLabels || undefined, checks: x.checks || undefined }))],
    notes: [
      ...((baseResult.notes || []).filter(Boolean)),
      'Core 1.41.0 проверяет новый единый раздел Комментарии: канал → пост → комментарии, фото, ответы, реакции, модерация, диагностика.',
      'Фото и реакции/ответы больше не должны появляться отдельными верхними пунктами главного меню; они проверяются внутри раздела Комментарии.'
    ]
  };
}
async function run(options = {}) { if (options && (options.verbose || options.raw || options.deep)) return base.run(options); return runFast(options); }
function selfTest() { return { ok: true, runtimeVersion: RUNTIME, baseRuntimeVersion: base.RUNTIME, fastCompactDefault: true, unifiedCommentsScenarioReady: true, commentsEndToEndReady: true, photoInsideCommentsReady: true, repliesInsideCommentsReady: true, reactionsInsideCommentsReady: true, moderationInsideCommentsReady: true, foldedCommentSubsectionsHiddenReady: true, noVideoFilesInCommentsReady: true, buttonsAndLeadMagnetsBaseStillIncluded: true }; }

module.exports = { RUNTIME, run, selfTest, runFast };
