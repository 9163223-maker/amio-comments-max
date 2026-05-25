'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'performance-debug-routes-pr73.js'), 'utf8');
const entrypoint = fs.readFileSync(path.join(__dirname, '..', 'clean-entrypoint-pr41.js'), 'utf8');

assert.ok(app.includes('CC8.1.14-PERFORMANCE-TRACE-PR73'), 'app loader must expose PR73 performance runtime');
assert.ok(app.includes("postMiniTiming('loader.boot'"), 'loader should emit boot timing');
assert.ok(app.includes("postMiniTiming('loader.script_appended'"), 'loader should emit script appended timing');
assert.ok(app.includes("postMiniTiming('loader.script_loaded'"), 'loader should emit script loaded timing');
assert.ok(app.includes('/api/debug/miniapp-timing'), 'loader should send miniapp timing to the debug ingest endpoint');
assert.ok(app.includes('/public/app-onepass.js?'), 'default miniapp path must remain app-onepass');
assert.ok(!app.includes('app-fast-send-pr69'), 'PR73 must not reintroduce the PR69 wrapper');

assert.ok(routes.includes("app.get('/debug/patch-timing'"), 'routes should expose patch timing endpoint');
assert.ok(routes.includes("app.get('/debug/miniapp-timing'"), 'routes should expose miniapp timing endpoint');
assert.ok(routes.includes("app.post('/api/debug/miniapp-timing'"), 'routes should expose miniapp timing ingest endpoint');
assert.ok(routes.includes('setPostPatchTraceHook'), 'routes should hook post patch trace events');
assert.ok(routes.includes('noDatabaseRead: true'), 'debug endpoints must stay no database read');
assert.ok(routes.includes('noMaxApiCall: true'), 'debug endpoints must stay no MAX API call');

assert.ok(entrypoint.includes("require('./performance-debug-routes-pr73')"), 'clean entrypoint should install PR73 performance routes');
assert.ok(entrypoint.includes('performanceRoutes.install(app)'), 'express wrapper should install performance routes');

console.log('performance trace PR73 smoke ok');
