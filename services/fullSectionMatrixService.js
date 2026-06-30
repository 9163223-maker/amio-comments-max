'use strict';

const crypto = require('crypto');
const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const channelMatrix = require('./channelTargetMatrixService');
const startupLog = require('./startupLogService');

const DEFAULT_PATH = 'runtime/full-section-matrix.json';
const POST_SCOPED_SECTIONS = ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'editor', 'stats'];
const REQUIRED_SCENARIOS = ['zero_channels', 'one_channel', 'multiple_channels', 'dangerous_chat_records', 'empty_channel_without_posts', 'selected_channel_with_posts'];
const TECHNICAL_VISIBLE = ['channelId', 'chatId', 'commentKey', 'postId', 'token', 'payload', 'debug', 'trace'];
const CHAT_WORDS = ['Все свои MAX', 'Саша - сын Мамочки 🌸', 'Группа друзей', 'Личный диалог', 'Диалог MAX'];
const BOOT_ID = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function buttons(screen) { return (screen && screen.attachments && screen.attachments[0] && screen.attachments[0].payload && screen.attachments[0].payload.buttons || []).flat(); }
function buttonTexts(screen) { return buttons(screen).map((b) => clean(b.text)).filter(Boolean); }
function payloads(screen) { return buttons(screen).map((b) => clean(b.payload)).filter(Boolean); }
function visibleText(screen) { return clean(screen && screen.text); }
function safeOffender(value) { return clean(value).slice(0, 120); }
function violation(severity, route, section, scenario, reason, expected, actual, extra = {}) { return { severity, route, section, scenario, reason, expected, actual, ...extra }; }
function render(route, context) { return menu.render(route, context || {}); }
function safeChannels() { return channelMatrix.fixtureChannels().filter((c) => !channelMatrix.dangerousRecords([c]).length); }
function posts(channelId) { return channelMatrix.fixturePosts(channelId); }
function contexts() {
  const safe = safeChannels();
  const one = [safe.find((c) => c.channelId === 'ch-posts-1') || safe[0]];
  const empty = { channelId: 'empty-channel-1', title: 'Пустой канал', type: 'channel', isChannel: true };
  return {
    zero_channels: { channels: [], posts: [], dataContext: { channels: [], posts: [] } },
    one_channel: { channels: one, posts: posts(one[0].channelId || one[0].id), dataContext: { channels: one, channelId: one[0].channelId || one[0].id, channelTitle: clean(one[0].title), posts: posts(one[0].channelId || one[0].id) } },
    multiple_channels: { channels: safe, posts: posts('ch-posts-1'), dataContext: { channels: safe, channelId: 'ch-posts-1', channelTitle: 'Канал с постами', posts: posts('ch-posts-1') } },
    dangerous_chat_records: { channels: channelMatrix.fixtureChannels(), posts: posts('ch-posts-1'), dataContext: { channels: channelMatrix.fixtureChannels(), channelId: 'ch-posts-1', channelTitle: 'Канал с постами', posts: posts('ch-posts-1') } },
    empty_channel_without_posts: { channels: [empty], posts: [], dataContext: { channels: [empty], channelId: 'empty-channel-1', channelTitle: 'Пустой канал', posts: [] } },
    selected_channel_with_posts: { channels: safe, posts: posts('ch-posts-1'), dataContext: { channels: safe, channelId: 'ch-posts-1', channelTitle: 'Канал с постами', posts: posts('ch-posts-1') } }
  };
}
function addScreenChecks(out, screen, route, section, scenario) {
  const texts = buttonTexts(screen); const ps = payloads(screen); const text = visibleText(screen);
  if (!screen || screen.ok === false) out.push(violation('block', route, section, scenario, 'route_render_failed', 'screen ok', screen && screen.error || 'missing'));
  if (!text) out.push(violation('block', route, section, scenario, 'missing_screen_text', 'non-empty text', 'empty'));
  for (const t of texts) {
    if (!t) out.push(violation('block', route, section, scenario, 'missing_button_text', 'non-empty button text', 'empty'));
    if (t.length > 64) out.push(violation('warn', route, section, scenario, 'overlong_button_label', '<=64 chars', `${t.length}`, { offendingText: safeOffender(t) }));
  }
  for (const p of ps) { try { JSON.parse(p); } catch { out.push(violation('block', route, section, scenario, 'unparseable_payload', 'JSON callback payload', 'parse failed', { offendingPayload: safeOffender(p) })); } }
  const visible = [text, ...texts].join('\n');
  for (const word of TECHNICAL_VISIBLE) if (new RegExp(`\\b${word}\\b`, 'i').test(visible)) out.push(violation('block', route, section, scenario, 'technical_id_visible', 'no technical IDs in visible text', word, { offendingText: word }));
  for (const chat of CHAT_WORDS) if ((visible + '\n' + ps.join('\n')).includes(chat)) out.push(violation('block', route, section, scenario, 'chat_like_record_leak', 'chat-like fixtures hidden', chat, { offendingText: chat }));
  if (route !== 'main:home' && !texts.includes('Главное меню')) out.push(violation('block', route, section, scenario, 'missing_main_menu_navigation', 'Главное меню', texts.join(' | ')));
  if ((route.includes(':choose_') || route.endsWith(':post') || route.includes('channels:')) && !texts.some((t) => ['Назад', 'В начало раздела', 'Главное меню'].includes(t))) out.push(violation('warn', route, section, scenario, 'missing_back_navigation', 'back/section/main navigation', texts.join(' | ')));
  if (texts.filter((t) => /инструкция/i.test(t)).length) out.push(violation('block', route, section, scenario, 'obsolete_instruction_button', 'no obsolete instruction buttons', texts.join(' | ')));
}
function buildMatrix() {
  const violations = []; const ctxs = contexts();
  const rootRoutes = ['main:home', ...canonical.clientSections.map((s) => s.route)];
  const postRoutes = POST_SCOPED_SECTIONS.flatMap((s) => [`${s}:choose_channel`, `${s}:choose_post`, `${s}:post`]);
  const extraRoutes = ['channels:list', 'channels:connect', 'stats:home'];
  const routes = Array.from(new Set([...rootRoutes, ...postRoutes, ...extraRoutes]));
  for (const route of routes) {
    const section = route === 'main:home' ? 'main' : route.split(':')[0];
    for (const scenario of REQUIRED_SCENARIOS) {
      if (rootRoutes.includes(route) && scenario !== 'multiple_channels') continue;
      if (route.endsWith(':post') && scenario !== 'selected_channel_with_posts') continue;
      const ctx = route.endsWith(':post') ? { payload: { postTitle: 'Безопасный пост', channelId: 'ch-posts-1', postId: 'post-1', commentKey: 'ch-posts-1:post-1' } } : ctxs[scenario];
      const screen = render(route, ctx);
      addScreenChecks(violations, screen, route, section, scenario);
      const texts = buttonTexts(screen);
      if (route.endsWith(':choose_channel') && scenario === 'zero_channels' && !(texts.includes('Подключить канал') && texts.includes('Главное меню'))) violations.push(violation('block', route, section, scenario, 'zero_channels_empty_state_invalid', 'Подключить канал + Главное меню', texts.join(' | ')));
      if (route.endsWith(':choose_channel') && scenario === 'multiple_channels' && !texts.includes('Настоящий канал')) violations.push(violation('block', route, section, scenario, 'legitimate_channel_missing', 'safe channels visible', texts.join(' | ')));
      if (route.endsWith(':choose_post') && scenario === 'selected_channel_with_posts' && !texts.some((t) => t.includes('Безопасный пост'))) violations.push(violation('block', route, section, scenario, 'selected_channel_posts_missing', 'selected channel posts visible', texts.join(' | ')));
    }
  }
  const statsTexts = buttonTexts(render('stats:home'));
  for (const label of ['Обзор','По каналу','По посту','Рекламные ссылки','Источники','Обновить данные','Главное меню']) if (!statsTexts.includes(label)) violations.push(violation('block', 'stats:home', 'stats', 'multiple_channels', 'stats_root_missing_button', label, statsTexts.join(' | ')));
  const blockCount = violations.filter((v) => v.severity === 'block').length;
  const warnCount = violations.filter((v) => v.severity === 'warn').length;
  return { ok: blockCount === 0, runtime: 'PR260-FULL-SECTION-MATRIX', generatedAt: new Date().toISOString(), headSha: clean(process.env.GITHUB_SHA || process.env.GIT_COMMIT || process.env.COMMIT_SHA), bootId: BOOT_ID, sectionsChecked: ['main', ...canonical.clientSections.map((s) => s.id)], routesChecked: routes, scenarios: REQUIRED_SCENARIOS, violations, summary: { totalRoutes: routes.length, totalViolations: violations.length, blockCount, warnCount, chatLeakCount: violations.filter((v)=>v.reason==='chat_like_record_leak').length, navigationIssueCount: violations.filter((v)=>/navigation/.test(v.reason)).length, payloadIssueCount: violations.filter((v)=>/payload/.test(v.reason)).length, technicalLeakCount: violations.filter((v)=>v.reason==='technical_id_visible').length } };
}
async function exportMatrix() { const payload = buildMatrix(); return startupLog.exportRuntimeJson({ path: DEFAULT_PATH, payload, message: `full section matrix ${payload.ok ? 'PASS' : 'FAIL'}` }); }
module.exports = { DEFAULT_PATH, POST_SCOPED_SECTIONS, REQUIRED_SCENARIOS, buildMatrix, exportMatrix };
