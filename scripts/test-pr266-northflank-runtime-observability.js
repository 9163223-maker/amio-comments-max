'use strict';
const assert = require('assert');
const nf = require('../services/northflankStartupLogService');

(async () => {
  const missing = nf.buildPayload({}, { env: {}, generatedAt: '2026-07-01T00:00:00.000Z' });
  assert.strictEqual(missing.configured, false);
  assert.strictEqual(missing.ok, false);
  assert(missing.missing.includes('NORTHFLANK_API_TOKEN'));

  const env = { NORTHFLANK_API_TOKEN: 'nf_secret_'.padEnd(60, 'x'), NORTHFLANK_PROJECT_ID: 'p', NORTHFLANK_SERVICE_ID: 's', NORTHFLANK_LOG_TAIL_LIMIT: '100' };
  const sha = 'f63d7c900b6f38af6b10ad705b6c5663be31d0af';
  const p = nf.buildPayload({ service: { status: 'running', currentDeploymentId: 'dep1' }, deployment: { status: 'deployed', buildId: 'build1' }, expectedSha: sha, logs: { lines: [`Authorization: Bearer ${'a'.repeat(80)}`, `startup clean-entrypoint ${sha}`, 'restart back-off detected'] } }, { env });
  assert.strictEqual(p.configured, true);
  assert.strictEqual(p.serviceStatus, 'running');
  assert.strictEqual(p.deploymentStatus, 'deployed');
  assert.strictEqual(p.startupSeen, true);
  assert.strictEqual(p.startupLogShaSeen, true);
  assert.strictEqual(p.crashLoopSuspected, true);
  assert(!p.lastLines.join('\n').includes('a'.repeat(80)), 'bearer token redacted');

  const stale = nf.buildPayload({ expectedSha: sha, logs: { lines: ['startup old sha f4f32c4fd2fdd6c12d034638c74861cb5f4ee55f'] } }, { env });
  assert.strictEqual(stale.staleRuntimeSuspected, true);
  const fetched = await nf.payload({ env, expectedSha: sha, client: async ({ apiPath }) => apiPath.includes('logs') ? { lines: [`server startup ${sha}`] } : { status: 'running' } });
  assert.strictEqual(fetched.configured, true);
  assert.strictEqual(fetched.startupSeen, true);
  console.log('PR266 Northflank runtime observability PASS');
})().catch((error) => { console.error(error); process.exit(1); });
