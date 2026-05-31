'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routes = require('../comments-selftest-routes-pr88');

function makeReq({ query = {}, headers = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    query,
    get(name) {
      return normalizedHeaders[String(name || '').toLowerCase()] || '';
    }
  };
}

const originalEnv = {
  SELFTEST_ADMIN_TOKEN: process.env.SELFTEST_ADMIN_TOKEN,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  DEBUG_EXPORT_TOKEN: process.env.DEBUG_EXPORT_TOKEN,
  GIFT_ADMIN_TOKEN: process.env.GIFT_ADMIN_TOKEN
};

try {
  process.env.SELFTEST_ADMIN_TOKEN = 'valid-selftest';
  delete process.env.ADMIN_TOKEN;
  delete process.env.DEBUG_EXPORT_TOKEN;
  delete process.env.GIFT_ADMIN_TOKEN;

  const mixedQueryReq = makeReq({ query: { token: 'stale-token', adminToken: 'valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(mixedQueryReq), true, 'a valid adminToken must not be shadowed by a stale token query param');
  assert.strictEqual(routes.matchingRequestToken(mixedQueryReq), 'valid-selftest', 'matching token resolver should choose the valid candidate');
  assert.strictEqual(routes.runnerHref(mixedQueryReq), '/debug/selftest/comments/runner?adminToken=valid-selftest', 'runner link should carry the matching adminToken value');

  const headerReq = makeReq({ query: { token: 'stale-token' }, headers: { 'x-admin-token': 'valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(headerReq), true, 'x-admin-token must still authorize when a stale query token is present');
  assert.strictEqual(routes.runnerHref(headerReq), '/debug/selftest/comments/runner?token=valid-selftest', 'runner link should preserve the matching header token for browser navigation');

  const refererReq = makeReq({ query: { token: 'stale-token' }, headers: { referer: 'https://example.test/debug/selftest/comments/report?adminToken=valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(refererReq), true, 'referer adminToken fallback must still authorize when query token is stale');

  const repeatedRefererReq = makeReq({ headers: { referer: 'https://example.test/debug/selftest/comments/report?token=stale-token&token=valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(repeatedRefererReq), true, 'referer token fallback should inspect repeated token query values');

  const repeatedQueryReq = makeReq({ query: { token: ['stale-token', 'valid-selftest'] } });
  assert.deepStrictEqual(routes.tokenValues(repeatedQueryReq.query.token), ['stale-token', 'valid-selftest'], 'tokenValues should preserve repeated query token params');
  assert.strictEqual(routes.adminAllowed(repeatedQueryReq), true, 'a valid repeated token query value must not be collapsed into an invalid comma-joined string');
  assert.strictEqual(routes.matchingRequestToken(repeatedQueryReq), 'valid-selftest', 'matching token resolver should inspect every repeated token candidate');
  assert.strictEqual(routes.runnerHref(repeatedQueryReq), '/debug/selftest/comments/runner?token=valid-selftest', 'runner link should carry the matching repeated token value');

  const browserRunner = fs.readFileSync(path.join(__dirname, '..', 'public', 'comments-selftest-runner-pr89.js'), 'utf8');
  assert.ok(browserRunner.includes('runnerParams.forEach((value, key)'), 'browser runner should preserve incoming token/adminToken URL order');
  assert.ok(browserRunner.includes("runnerTokenPairs.push({ key, value: text })"), 'browser runner should preserve every non-empty token/adminToken pair for protected URLs');

  console.log('comments selftest routes PR88 token smoke ok');
} finally {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}
