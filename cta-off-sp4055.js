'use strict';
const http = require('http');
const { URL } = require('url');
const RUNTIME = 'SP40.5.5a';
const state = global.__ADMINKIT_CTA_OFF__ = { runtime: RUNTIME, blocked: 0 };
function reply(res, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store, no-cache, must-revalidate',
    'pragma': 'no-cache',
    'expires': '0',
    'x-adminkit-runtime': RUNTIME
  });
  res.end(body);
}
const oldCreateServer = http.createServer;
http.createServer = function(listener) {
  return oldCreateServer.call(this, function(req, res) {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch {}
    if (pathname === '/api/promo/cta' || pathname === '/api/cta' || pathname === '/api/floating-cta') {
      state.blocked++;
      return reply(res, { ok: true, enabled: false, active: false, hidden: true, runtimeVersion: RUNTIME });
    }
    return listener(req, res);
  });
};
console.log('[SP40.5.5a cta-off] loaded');
