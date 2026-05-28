'use strict';

const { runFullCommentsSelftest, getLatestReport, RUNTIME } = require('./services/commentsSelftestPr88V2');

function noCache(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
}

function clean(value) { return String(value || '').trim(); }
function adminAllowed(req) {
  const configured = clean(process.env.GIFT_ADMIN_TOKEN || process.env.DEBUG_EXPORT_TOKEN || process.env.GITHUB_DEBUG_TOKEN || '');
  if (!configured) return true;
  const bearer = clean(String(req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  const token = clean(req.query?.token || req.query?.adminToken || req.get('x-admin-token') || bearer || '');
  return token === configured;
}

function install(app) {
  if (!app || app.__adminkitCommentsSelftestPr88) return app;
  app.__adminkitCommentsSelftestPr88 = true;

  app.get('/debug/selftest/comments/full', async (req, res) => {
    noCache(res);
    if (!adminAllowed(req)) return res.status(403).json({ ok: false, error: 'admin_forbidden', runtimeVersion: RUNTIME });
    try {
      const report = await runFullCommentsSelftest({ cleanup: String(req.query?.cleanup || '1') !== '0' });
      return res.status(report.ok ? 200 : 500).json(report);
    } catch (error) {
      return res.status(500).json({ ok: false, runtimeVersion: RUNTIME, error: error?.message || 'selftest_failed' });
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
    const rows = tests.map((item) => `<tr><td>${item.status === 'pass' ? '✅' : '❌'}</td><td>${item.id}</td><td>${item.expected || ''}</td><td><pre>${JSON.stringify(item.actual || item.details || {}, null, 2)}</pre></td></tr>`).join('');
    const warningRows = warnings.map((item) => `<tr><td>⚠️</td><td>${item.id}</td><td>${item.message || ''}</td><td><pre>${JSON.stringify(item.details || {}, null, 2)}</pre></td></tr>`).join('');
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>AdminKit comments selftest</title><style>body{font-family:system-ui;margin:24px;background:#f7fafc;color:#102030}table{border-collapse:collapse;width:100%;background:white;margin-bottom:24px}td,th{border:1px solid #d8e2ea;padding:8px;vertical-align:top}pre{white-space:pre-wrap;max-width:640px}.ok{color:#137333}.bad{color:#b3261e}.warn{color:#9a6700}</style><h1>AdminKit comments selftest</h1><p>Runtime: <b>${report.runtimeVersion || RUNTIME}</b></p><p class="${report.ok ? 'ok' : 'bad'}">Backend: ${report.ok ? 'PASS' : 'FAIL'}</p><p class="${warnings.length ? 'warn' : 'ok'}">UI warnings: ${warnings.length}</p><p>Passed: ${report.summary?.passed || 0}; Failed: ${report.summary?.failed || 0}; Total: ${report.summary?.total || 0}</p><p>CommentKey: <code>${report.commentKey || ''}</code></p><h2>Backend tests</h2><table><thead><tr><th>Status</th><th>Test</th><th>Expected</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><h2>UI stability warnings</h2><table><thead><tr><th>Status</th><th>Probe</th><th>Message</th><th>Details</th></tr></thead><tbody>${warningRows}</tbody></table><h2>Telemetry contract</h2><pre>${JSON.stringify(report.telemetry || {}, null, 2)}</pre>`);
  });

  return app;
}

module.exports = { RUNTIME, install };
