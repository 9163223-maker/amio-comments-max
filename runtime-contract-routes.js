'use strict';

const config = require('./config');
const runtimeContract = require('./services/runtimeContractService');

const RUNTIME = 'RUNTIME-CONTRACT-ROUTES-PR196';
const SOURCE = 'adminkit-runtime-contract-routes-pr196';
const ROUTES = ['/internal/runtime/contract'];

function clean(value, limit = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}
function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}
function headerToken(req) {
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return String(req.get('x-admin-token') || '').trim() || bearer;
}
function hasUnsafeTokenTransport(req) {
  return Boolean(clean(req.query && (req.query.adminToken || req.query.token || req.query.auth || req.query.authorization)) || clean(req.body && (req.body.adminToken || req.body.token || req.body.auth || req.body.authorization)));
}
function operatorAllowed(req) {
  return Boolean(config.giftAdminToken && headerToken(req) === config.giftAdminToken);
}
function send(res, payload, status = 200) {
  noCache(res);
  return res.status(status).type('application/json').send(JSON.stringify(payload, null, 2));
}
function guard(req, res) {
  if (hasUnsafeTokenTransport(req)) {
    send(res, { ok: false, error: 'token_must_be_header_only', allowed: ['Authorization: Bearer <token>', 'X-Admin-Token: <token>'] }, 400);
    return false;
  }
  if (!operatorAllowed(req)) {
    send(res, { ok: false, error: 'operator_token_required' }, 401);
    return false;
  }
  return true;
}
function payload() {
  const contract = runtimeContract.buildContract();
  return {
    ok: contract.contractLiveOk === true,
    diagnosticRuntime: RUNTIME,
    diagnosticSourceMarker: SOURCE,
    route: ROUTES[0],
    contract
  };
}
function install(app) {
  if (!app || app.__adminkitRuntimeContractRoutesInstalled) return { ok: true, alreadyInstalled: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, routes: ROUTES };
  app.get('/internal/runtime/contract', (req, res) => {
    if (!guard(req, res)) return;
    try { return send(res, payload(), 200); }
    catch (error) { return send(res, { ok: false, error: clean(error && error.message || error, 240), diagnosticRuntime: RUNTIME, diagnosticSourceMarker: SOURCE }, 500); }
  });
  app.__adminkitRuntimeContractRoutesInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, routes: ROUTES };
}

module.exports = { RUNTIME, SOURCE, ROUTES, install, payload, guard };
