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
function adminAllowed(req) {
  const allowedTokens = configuredAdminTokens();
  if (!allowedTokens.length) return true;
  const bearer = clean(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const token = clean(req.query?.token || req.query?.adminToken || req.get('x-admin-token') || bearer || '');
  return Boolean(token && allowedTokens.includes(token));
}

function cleanupMode(req) {
  if (!Object.prototype.hasOwnProperty.call(req.query || {}, 'cleanup')) return 'auto';
  return String(req.query?.cleanup || '') === '1';
}
function requestedCommentKey(req) {
  return clean(req.query?.commentKey || req.query?.key || '');
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
    const rows = tests.map((item) => `<tr><td>${item.status === 'pass' ? '✅' : '❌'}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.expected || '')}</td><td><pre>${safeJson(item.actual || item.details || {})}</pre></td></tr>`).join('');
    const warningRows = warnings.map((item) => `<tr><td>⚠️</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.message || '')}</td><td><pre>${safeJson(item.details || {})}</pre></td></tr>`).join('');
    const runtime = escapeHtml(report.runtimeVersion || RUNTIME);
    const backendClass = report.ok ? 'ok' : 'bad';
    const backendText = report.ok ? 'PASS' : 'FAIL';
    const warningsClass = warnings.length ? 'warn' : 'ok';
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>AdminKit comments selftest</title><style>body{font-family:system-ui;margin:24px;background:#f7fafc;color:#102030}table{border-collapse:collapse;width:100%;background:white;margin-bottom:24px}td,th{border:1px solid #d8e2ea;padding:8px;vertical-align:top}pre{white-space:pre-wrap;max-width:640px}.ok{color:#137333}.bad{color:#b3261e}.warn{color:#9a6700}</style><h1>AdminKit comments selftest</h1><p>Runtime: <b>${runtime}</b></p><p class="${backendClass}">Full self-test: ${backendText}</p><p class="${warningsClass}">UI warnings: ${Number(warnings.length) || 0}</p><p>Passed: ${Number(report.summary?.passed) || 0}; Failed: ${Number(report.summary?.failed) || 0}; Total: ${Number(report.summary?.total) || 0}</p><p>CommentKey: <code>${escapeHtml(report.commentKey || '')}</code></p><p>Fixtures preserved: <b>${report.fixtures?.preserved ? 'yes' : 'no'}</b></p><h2>Backend tests</h2><table><thead><tr><th>Status</th><th>Test</th><th>Expected</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><h2>UI stability warnings</h2><table><thead><tr><th>Status</th><th>Probe</th><th>Message</th><th>Details</th></tr></thead><tbody>${warningRows}</tbody></table><h2>Telemetry contract</h2><pre>${safeJson(report.telemetry || {})}</pre>`);
  });

  return app;
}

module.exports = { RUNTIME, install, adminAllowed, configuredAdminTokens, requestedCommentKey, escapeHtml };
