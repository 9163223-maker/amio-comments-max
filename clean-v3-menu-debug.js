'use strict';

const Module = require('module');
const hardRoot = require('./menu-v3-hard-root');

const RUNTIME = 'HARD-V3-MENU-DEBUG-1.38.3-CORE-STRESS-ROUTE';

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function htmlEscape(value = '') {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function maskId(id = '') {
  const s = String(id || '').trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function coreSendMenuHtml(req = {}) {
  const route = htmlEscape(req.query?.route || 'main.home');
  const token = htmlEscape(req.query?.token || 'admin');
  const adminId = htmlEscape(req.query?.adminId || req.query?.userId || '');
  const chatId = htmlEscape(req.query?.chatId || '');
  const messageId = htmlEscape(req.query?.messageId || '');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>АдминКИТ Core — отправить меню</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#f5f7fb; color:#111827; }
    .wrap { max-width:720px; margin:0 auto; padding:28px 18px; }
    .card { background:#fff; border-radius:22px; padding:22px; box-shadow:0 12px 36px rgba(15,23,42,.12); }
    h1 { margin:0 0 10px; font-size:24px; line-height:1.2; }
    p { color:#4b5563; line-height:1.5; }
    button { width:100%; border:0; border-radius:16px; padding:16px 18px; font-size:18px; font-weight:700; background:#0ea5e9; color:#fff; cursor:pointer; }
    button:disabled { opacity:.55; cursor:default; }
    .meta { margin:16px 0; padding:14px; border-radius:14px; background:#f1f5f9; font-size:14px; color:#334155; overflow-wrap:anywhere; }
    pre { margin:16px 0 0; padding:14px; border-radius:14px; background:#0f172a; color:#e5e7eb; overflow:auto; white-space:pre-wrap; font-size:13px; }
    .ok { color:#047857; font-weight:700; }
    .bad { color:#b91c1c; font-weight:700; }
    @media (prefers-color-scheme: dark) { body { background:#020617; color:#e5e7eb; } .card { background:#111827; box-shadow:none; } p { color:#cbd5e1; } .meta { background:#1f2937; color:#d1d5db; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <h1>🐋 АдминКИТ Core</h1>
      <p>Эта страница открывается через GET, но сама отправка меню выполняется только через <b>POST</b>. Поэтому повторная загрузка браузера не должна дублировать меню.</p>
      <div class="meta" id="meta">route=${route}${adminId ? ' · adminId=' + adminId : ' · adminId будет взят из canary fallback'}</div>
      <button id="sendBtn" type="button">Отправить Core menu в личку</button>
      <pre id="out">Нажмите кнопку один раз.</pre>
    </section>
  </main>
  <script>
    const payload = { token: '${token}', route: '${route}', adminId: '${adminId}', chatId: '${chatId}', messageId: '${messageId}', requestId: String(Date.now()) + '-' + Math.random().toString(16).slice(2) };
    const meta = document.getElementById('meta');
    const out = document.getElementById('out');
    const btn = document.getElementById('sendBtn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      out.textContent = 'Отправляю POST /debug/core-canary-send…';
      try {
        const res = await fetch('/debug/core-canary-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
        if (data && data.ok && data.sent !== false) meta.innerHTML = '<span class="ok">Готово: Core menu отправлено.</span>';
        else if (data && data.ok) meta.innerHTML = '<span class="ok">Запрос выполнен, но sent=false. Смотрите ответ ниже.</span>';
        else { meta.innerHTML = '<span class="bad">Ошибка отправки. Смотрите ответ ниже.</span>'; btn.disabled = false; }
      } catch (e) {
        meta.innerHTML = '<span class="bad">Ошибка запроса.</span>';
        out.textContent = String(e && e.message ? e.message : e);
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

async function safeRows(db, source, sql, params = []) {
  try {
    const { rows } = await db.query(sql, params);
    return (rows || []).map((row) => ({ ...row, source }));
  } catch (error) {
    return [{ source, error: error?.message || String(error), admin_id: '' }];
  }
}

async function adminCandidates() {
  const db = require('./cc5-db-core');
  const init = await db.init().catch((error) => ({ ok: false, error: error?.message || String(error) }));
  if (!init || init.ok === false) {
    return { ok: false, runtimeVersion: RUNTIME, error: init?.error || 'db_init_failed', dbUrlPresent: !!process.env.DATABASE_URL || !!process.env.POSTGRES_URL || !!process.env.POSTGRES_URI };
  }

  const chunks = [];
  chunks.push(...await safeRows(db, 'ak_admins', `select admin_id, display_name, updated_at, created_at from ak_admins order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_admin_sessions', `select admin_id, account_id, active_section, active_flow, active_step, selected_channel_id, selected_post_id, active_message_id, updated_at from ak_admin_sessions order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_admin_channels', `select admin_id, count(*)::int as channels_count, max(updated_at) as updated_at from ak_admin_channels group by admin_id order by max(updated_at) desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_posts', `select admin_id, count(*)::int as posts_count, max(updated_at) as updated_at from ak_posts group by admin_id order by max(updated_at) desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_menu_state', `select admin_id, message_id as active_menu_message_id, updated_at from ak_menu_state order by updated_at desc limit 25`));
  chunks.push(...await safeRows(db, 'ak_flow_state', `select admin_id, updated_at from ak_flow_state order by updated_at desc limit 25`));

  const map = new Map();
  for (const row of chunks) {
    const id = String(row.admin_id || row.adminId || '').trim();
    if (!id) continue;
    const item = map.get(id) || { adminId: id, maskedAdminId: maskId(id), sources: [], updatedAt: '', displayName: '', activeSection: '', activeFlow: '', activeStep: '', selectedChannelId: '', selectedPostId: '', activeMessageId: '', channelsCount: 0, postsCount: 0 };
    item.sources.push(row.source);
    if (row.display_name && !item.displayName) item.displayName = String(row.display_name);
    if (row.active_section) item.activeSection = String(row.active_section);
    if (row.active_flow) item.activeFlow = String(row.active_flow);
    if (row.active_step) item.activeStep = String(row.active_step);
    if (row.selected_channel_id) item.selectedChannelId = String(row.selected_channel_id);
    if (row.selected_post_id) item.selectedPostId = String(row.selected_post_id);
    if (row.active_message_id) item.activeMessageId = String(row.active_message_id);
    if (row.active_menu_message_id && !item.activeMessageId) item.activeMessageId = String(row.active_menu_message_id);
    if (row.channels_count) item.channelsCount = Math.max(item.channelsCount || 0, Number(row.channels_count) || 0);
    if (row.posts_count) item.postsCount = Math.max(item.postsCount || 0, Number(row.posts_count) || 0);
    const updated = String(row.updated_at || row.created_at || '');
    if (updated && (!item.updatedAt || updated > item.updatedAt)) item.updatedAt = updated;
    map.set(id, item);
  }

  const candidates = [...map.values()].map((item) => ({ ...item, sources: [...new Set(item.sources)] })).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 20);
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    generatedAt: new Date().toISOString(),
    candidates,
    recommendedCanaryAdminId: candidates[0]?.adminId || '',
    recommendedMasked: candidates[0]?.maskedAdminId || '',
    count: candidates.length,
    note: 'Для canary env используйте recommendedCanaryAdminId, если это ваш последний активный админ в MAX.'
  };
}

async function coreStress(req = {}) {
  const stress = require('./src/core/coreStressTest');
  return stress.run({
    seed: req.query?.seed ?? '1',
    cleanup: req.query?.cleanup ?? '1',
    slowMs: req.query?.slowMs ?? 700
  });
}

function install() {
  if (Module._load.__hardV3DebugOnly) return selfTest();
  const oldLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__hardV3DebugOnlyWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__hardV3DebugRoutes) {
          app.__hardV3DebugRoutes = true;
          app.get('/debug/menu-v3-hard', async (req, res) => {
            noCache(res);
            try {
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const asyncTest = hardRoot.selfTestAsync ? await hardRoot.selfTestAsync(adminId) : null;
              res.json({ ok: true, runtimeVersion: RUNTIME, hardRoot: hardRoot.selfTest(), asyncTest });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
          app.get('/debug/menu-v3-hard-render', async (req, res) => {
            noCache(res);
            try {
              const route = String(req.query?.route || 'main:home').trim() || 'main:home';
              const adminId = String(req.query?.adminId || req.query?.admin || '').trim();
              const screen = hardRoot.renderAsync ? await hardRoot.renderAsync(route, adminId, {}) : hardRoot.render(route);
              res.json({ ok: true, runtimeVersion: RUNTIME, route, screen });
            } catch (error) {
              res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error && error.message ? error.message : String(error) });
            }
          });
          app.get('/debug/admin-candidates', async (req, res) => {
            noCache(res);
            try { res.json(await adminCandidates()); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error) }); }
          });
          app.get('/debug/core-send-menu', (req, res) => {
            noCache(res);
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(coreSendMenuHtml(req));
          });
          app.get('/debug/core-stress', async (req, res) => {
            noCache(res);
            try { res.json(await coreStress(req)); }
            catch (error) { res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error), stack: String(error?.stack || '').split('\n').slice(0, 4) }); }
          });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__hardV3DebugOnlyWrap = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__hardV3DebugOnly = true;
  return selfTest();
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, adminCandidatesEndpoint: '/debug/admin-candidates', coreSendMenuPage: '/debug/core-send-menu', coreStressEndpoint: '/debug/core-stress', hardRoot: hardRoot.selfTest() }; }
module.exports = { RUNTIME, install, selfTest, adminCandidates, coreStress };
