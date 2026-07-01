'use strict';
const assert = require('assert');
const fs = require('fs');
const gate = require('./check-post-merge-runtime-pickup');

(async () => {
  const sha = 'f63d7c900b6f38af6b10ad705b6c5663be31d0af';
  const fresh = new Date().toISOString();
  const expectedFiles = [...gate.REQUIRED_RUNTIME_FILES];
  const base = {
    startup: { latest: { githubMainHeadSha: sha, updatedAt: fresh } },
    diagnostic: { ok: true, generatedAt: fresh, expectedFiles, missingFiles: [] },
    northflank: { configured: true, startupSeen: true, startupLogShaSeen: true, expectedSha: sha }
  };
  assert.strictEqual((await gate.main({ expected_sha: sha, files: base, skipWait: true, noExit: true, output: '/tmp/pr266-pass.json' })).ok, true);

  const staleStartup = JSON.parse(JSON.stringify(base));
  staleStartup.startup.latest.updatedAt = '2020-01-01T00:00:00.000Z';
  assert.strictEqual((await gate.main({ expected_sha: sha, files: staleStartup, skipWait: true, noExit: true, output: '/tmp/pr266-stale.json' })).ok, false);

  const staleDiag = JSON.parse(JSON.stringify(base));
  staleDiag.diagnostic.generatedAt = '2020-01-01T00:00:00.000Z';
  assert.strictEqual((await gate.main({ expected_sha: sha, files: staleDiag, skipWait: true, noExit: true, output: '/tmp/pr266-diag.json' })).likely_reason, 'runtime_export_failed');

  const nfMissing = JSON.parse(JSON.stringify(base));
  nfMissing.northflank.configured = false;
  assert.strictEqual((await gate.main({ expected_sha: sha, files: nfMissing, skipWait: true, noExit: true, output: '/tmp/pr266-nf.json' })).likely_reason, 'northflank_observability_missing');

  const matrixMissing = JSON.parse(JSON.stringify(base));
  matrixMissing.diagnostic.missingFiles = ['runtime/full-section-matrix.json'];
  assert.strictEqual((await gate.main({ expected_sha: sha, files: matrixMissing, skipWait: true, noExit: true, output: '/tmp/pr266-missing.json' })).ok, false);

  const shortExpected = JSON.parse(JSON.stringify(base));
  shortExpected.diagnostic.expectedFiles = expectedFiles.filter((file) => file !== 'runtime/live-tenant-self-diagnostic-matrix.json');
  const shortResult = await gate.main({ expected_sha: sha, files: shortExpected, skipWait: true, noExit: true, output: '/tmp/pr266-short-expected.json' });
  assert.strictEqual(shortResult.ok, false, 'short expectedFiles must block');
  assert.strictEqual(shortResult.likely_reason, 'runtime_export_failed');
  assert(shortResult.diagnostic_undeclared_required_files.includes('runtime/live-tenant-self-diagnostic-matrix.json'), 'short expectedFiles names live tenant matrix as undeclared');

  assert(fs.existsSync('/tmp/pr266-pass.json'));
  console.log('PR266 post-merge runtime gate PASS');
})().catch((error) => { console.error(error); process.exit(1); });