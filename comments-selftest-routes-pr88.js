'use strict';

const express = require('express');
const { runFullCommentsSelftest, getLatestReport, applyBrowserProbeResult, cleanupSelftestFixtures, RUNTIME } = require('./services/commentsSelftestPr88V2');

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}

function clean(value) { return String(value || '').trim(); }
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function safeJson(value) { return escapeHtml(JSON.stringify(value || {}, null, 2)); }
function configuredAdminTokens() {
  return [process.env.SELFTEST_ADMIN_TOKEN, process.env.ADMIN_TOKEN, process.env.DEBUG_EXPORT_TOKEN, process.env.GIFT_ADMIN_TOKEN]
    .map(clean)
    .filter(Boolean);
}
function refererToken(req) {
  try {
    const ref = clean(req.get('referer') || req.get('referrer') || '');
    if (!ref) return '';
    const parsed = new URL(ref, 'http://local');
    return clean(parsed.searchParams.get('token') || parsed.searchParams.get('adminToken') || '');
  } catch (_) {
    return '';
  }
}
function requestToken(req) {
  const bearer = clean(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  return clean(req.query?.token || req.query?.adminToken || req.get('x-admin-token') || bearer || refererToken(req) || '');
}
function adminAllowed(req) {
  const allowedTokens = configuredAdminTokens();
  if (!allowedTokens.length) return true;
  const token = requestToken(req);
  return Boolean(token && allowedTokens.includes(token));
}

function cleanupMode(req) {
  if (!Object.prototype.hasOwnProperty.call(req.query || {}, 'cleanup')) return 'auto';
  return String(req.query?.cleanup || '') === '1';
}
function requestedCommentKey(req) {
  return clean(req.query?.commentKey || req.query?.key || '');
}
function runnerHref(req) {
  const token = clean(req.query?.token || req.query?.adminToken || '');
  if (!token) return '/debug/selftest/comments/runner';
  const key = req.query?.adminToken ? 'adminToken' : 'token';
  return '/debug/selftest/comments/runner?' + key + '=' + encodeURIComponent(token);
}
function runnerPrebootPatch() {
  return '<script>(function(){window.__ADMINKIT_PR91_RUNNER_DIRECT_ONEPASS__=true;var original=URLSearchParams.prototype.set;URLSearchParams.prototype.set=function(k,v){if(window.__ADMINKIT_PR91_RUNNER_DIRECT_ONEPASS__&&(k===\'adminkitSkeleton\'||k===\'commentSkeleton\'||k===\'skeletonConsumer\'))v=\'0\';return original.call(this,k,v);};})();</script>';
}
function runnerHtml() {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>AdminKit comments browser selftest</title><link rel="stylesheet" href="/comments-selftest-runner-pr89.css"><main><h1>AdminKit comments one-click browser selftest</h1><section class="card"><div id="status"><span class="pill warn">Готов к запуску</span></div><p class="muted">Одна страница запускает backend self-test, выполняет browser DOM probes и отправляет результат в browser-result. Видео/файлы не проверяются и не возвращаются.</p><div class="actions"><button id="runBtn" type="button">Запустить полный browser self-test</button><a id="latestLink" class="button secondary" href="/debug/selftest/comments/latest">Latest JSON</a><a id="reportLink" class="button secondary" href="/debug/selftest/comments/report">HTML report</a><a id="cleanupLink" class="button danger" href="#" hidden>Очистить fixtures</a></div></section><section class="card"><h2>Итог</h2><div id="summary">Пока не запускали.</div></section><section class="card"><h2>Browser fixture</h2><div id="commentsFixture"><div id="commentsList"></div></div></section><section class="card"><h2>Шаги</h2><div id="log" class="log"></div></section><section class="card"><h2>Raw final report</h2><pre id="raw">{}</pre></section></main>' + runnerPrebootPatch() + '<script src="/comments-selftest-runner-pr89.js"></script>';
}

function install(app) {
  if (!app || app.__adminkitCommentsSelftestPr88) return app;
  app.__adminkitCommentsSelftestPr88 = true;

  app.get('/debug/selftest/comments/full', async (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    try {
      const cleanup = cleanupMode(req);
      const commentKey = requestedCommentKey(req);
      const report = cleanup === true && commentKey
        ? await cleanupSelftestFixtures({ commentKey })
        : await runFullCommentsSelftest({ cleanup, commentKey });
      return res.status(report.ok ? 200 : 500).json(report);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      return res.status(status).json({ ok: false, runtimeVersion: RUNTIME, error: error?.code || error?.message || 'selftest_failed', data: error?.data });
    }
  });

  app.get('/debug/selftest/comments/runner', (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).send('admin_forbidden');
    return res.type('html').send(runnerHtml());
  });

  app.get('/comments-selftest-runner-pr89.css', (req, res) => {
    noCache(res);
    return res.redirect(302, '/public/comments-selftest-runner-pr89.css');
  });

  app.get('/comments-selftest-runner-pr89.js', (req, res) => {
    noCache(res);
    return res.redirect(302, '/public/comments-selftest-runner-pr89.js');
  });

  app.post('/debug/selftest/comments/browser-result', express.json({ limit: '32kb' }), async (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    try {
      const report = await applyBrowserProbeResult(req.body || {});
      return res.status(report.ok ? 200 : 202).json(report);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      return res.status(status).json({ ok: false, runtimeVersion: RUNTIME, error: error?.code || error?.message || 'browser_probe_result_failed', data: error?.data });
    }
  });

  app.get('/debug/selftest/comments/latest', (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    return res.json(getLatestReport());
  });

  app.get('/debug/selftest/comments/report', (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).send('admin_forbidden');
    const report = getLatestReport();
    const tests = (report.backend?.tests || report.tests || []);
    const warnings = (report.uiStability?.warnings || []);
    const nonBlockingWarnings = (report.uiStability?.nonBlockingWarnings || report.nonBlockingWarnings || []);
    const rows = tests.map((item) => `<tr><td>${item.status === 'pass' ? '✅' : '❌'}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.expected || '')}</td><td><pre>${safeJson(item.actual || item.details || {})}</pre></td></tr>`).join('');
    const warningRows = warnings.map((item) => `<tr><td>⚠️</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.message || '')}</td><td><pre>${safeJson(item.details || {})}</pre></td></tr>`).join('');
    const nonBlockingRows = nonBlockingWarnings.map((item) => `<tr><td>ℹ️</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.message || '')}</td><td><pre>${safeJson(item.details || {})}</pre></td></tr>`).join('');
    const runtime = escapeHtml(report.runtimeVersion || RUNTIME);
    const backendClass = report.ok ? 'ok' : 'bad';
    const backendText = report.ok ? 'PASS' : 'FAIL';
    const warningsClass = warnings.length ? 'warn' : 'ok';
    const diagnosticsClass = nonBlockingWarnings.length ? 'warn' : 'ok';
    const runnerUrl = escapeHtml(runnerHref(req));
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>AdminKit comments selftest</title><style>body{font-family:system-ui;margin:24px;background:#f7fafc;color:#102030}table{border-collapse:collapse;width:100%;background:white;margin-bottom:24px}td,th{border:1px solid #d8e2ea;padding:8px;vertical-align:top}pre{white-space:pre-wrap;max-width:640px}.ok{color:#137333}.bad{color:#b3261e}.warn{color:#9a6700}</style><h1>AdminKit comments selftest</h1><p>Runtime: <b>${runtime}</b></p><p class="${backendClass}">Full self-test: ${backendText}</p><p class="${warningsClass}">UI warnings: ${Number(warnings.length) || 0}</p><p class="${diagnosticsClass}">Non-blocking diagnostics: ${Number(nonBlockingWarnings.length) || 0}</p><p>Passed: ${Number(report.summary?.passed) || 0}; Failed: ${Number(report.summary?.failed) || 0}; Total: ${Number(report.summary?.total) || 0}</p><p>CommentKey: <code>${escapeHtml(report.commentKey || '')}</code></p><p>Fixtures preserved: <b>${report.fixtures?.preserved ? 'yes' : 'no'}</b></p><p><a href="${runnerUrl}">Open one-click browser runner</a></p><h2>Backend tests</h2><table><thead><tr><th>Status</th><th>Test</th><th>Expected</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><h2>UI stability warnings</h2><table><thead><tr><th>Status</th><th>Probe</th><th>Message</th><th>Details</th></tr></thead><tbody>${warningRows}</tbody></table><h2>Non-blocking diagnostics</h2><table><thead><tr><th>Status</th><th>Probe</th><th>Message</th><th>Details</th></tr></thead><tbody>${nonBlockingRows}</tbody></table><h2>Telemetry contract</h2><pre>${safeJson(report.telemetry || {})}</pre>`);
  });

  return app;
}

module.exports = { RUNTIME, install, adminAllowed, configuredAdminTokens, requestedCommentKey, escapeHtml, runnerHtml };
