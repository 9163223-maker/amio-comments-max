'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routes = require('../comments-selftest-routes-pr88');

function makeReq({ query = {}, headers = {}, originalUrl = '' } = {}) {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    query,
    originalUrl,
    url: originalUrl,
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

  const orderedQueryReq = makeReq({ query: { token: 'stale-token', adminToken: 'valid-selftest' }, originalUrl: '/debug/selftest/comments/report?adminToken=valid-selftest&token=stale-token' });
  assert.deepStrictEqual(routes.queryTokenEntries(orderedQueryReq), [{ key: 'adminToken', value: 'valid-selftest' }, { key: 'token', value: 'stale-token' }], 'query token entries should preserve URL parameter order across token keys');
  assert.strictEqual(routes.requestToken(orderedQueryReq), 'valid-selftest', 'requestToken fallback should use the first token-like query value in URL order');
  assert.strictEqual(routes.runnerHref(orderedQueryReq), '/debug/selftest/comments/runner?adminToken=valid-selftest', 'runner link should preserve the matched query token key in URL order');

  const queryFallbackReq = makeReq({ query: { adminToken: 'valid-selftest' }, originalUrl: '/debug/selftest/comments/report?unrelated=1' });
  assert.deepStrictEqual(routes.queryTokenEntries(queryFallbackReq), [{ key: 'adminToken', value: 'valid-selftest' }], 'query token entries should fall back to req.query when originalUrl has no token params');
  assert.strictEqual(routes.adminAllowed(queryFallbackReq), true, 'req.query token fallback must still authorize when originalUrl contains unrelated params');

  const headerReq = makeReq({ query: { token: 'stale-token' }, headers: { 'x-admin-token': 'valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(headerReq), true, 'x-admin-token must still authorize when a stale query token is present');
  assert.strictEqual(routes.runnerHref(headerReq), '/debug/selftest/comments/runner?token=valid-selftest', 'runner link should preserve the matching header token for browser navigation');

  const refererReq = makeReq({ query: { token: 'stale-token' }, headers: { referer: 'https://example.test/debug/selftest/comments/report?adminToken=valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(refererReq), true, 'referer adminToken fallback must still authorize when query token is stale');

  const repeatedRefererReq = makeReq({ headers: { referer: 'https://example.test/debug/selftest/comments/report?token=stale-token&token=valid-selftest' } });
  assert.strictEqual(routes.adminAllowed(repeatedRefererReq), true, 'referer token fallback should inspect repeated token query values');

  const orderedRefererReq = makeReq({ headers: { referer: 'https://example.test/debug/selftest/comments/report?adminToken=valid-selftest&token=stale-token' } });
  assert.deepStrictEqual(routes.tokenCandidates(orderedRefererReq), ['valid-selftest', 'stale-token'], 'referer token candidates should preserve URL parameter order across token keys');
  assert.strictEqual(routes.requestToken(orderedRefererReq), 'valid-selftest', 'referer requestToken fallback should use the first token-like value in URL order');

  const repeatedQueryReq = makeReq({ query: { token: ['stale-token', 'valid-selftest'] } });
  assert.deepStrictEqual(routes.tokenValues(repeatedQueryReq.query.token), ['stale-token', 'valid-selftest'], 'tokenValues should preserve repeated query token params');
  assert.strictEqual(routes.adminAllowed(repeatedQueryReq), true, 'a valid repeated token query value must not be collapsed into an invalid comma-joined string');
  assert.strictEqual(routes.matchingRequestToken(repeatedQueryReq), 'valid-selftest', 'matching token resolver should inspect every repeated token candidate');
  assert.strictEqual(routes.runnerHref(repeatedQueryReq), '/debug/selftest/comments/runner?token=valid-selftest', 'runner link should carry the matching repeated token value');

  assert.deepStrictEqual(routes.tokenCandidates({ query: { adminToken: 'valid-selftest' } }), ['valid-selftest'], 'token candidate helpers should tolerate request-like objects without req.get');

  const staleRunnerReq = makeReq({ query: { token: 'stale-token', adminToken: 'valid-selftest' }, originalUrl: '/debug/selftest/comments/runner?token=stale-token&adminToken=valid-selftest' });
  assert.strictEqual(routes.runnerCanonicalRedirect(staleRunnerReq), '/debug/selftest/comments/runner?adminToken=valid-selftest', 'runner route should redirect mixed/stale token URLs to the canonical matched token URL');
  const canonicalRunnerReq = makeReq({ query: { adminToken: 'valid-selftest' }, originalUrl: '/debug/selftest/comments/runner?adminToken=valid-selftest' });
  assert.strictEqual(routes.runnerCanonicalRedirect(canonicalRunnerReq), '', 'runner route should not redirect an already-canonical token URL');

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
