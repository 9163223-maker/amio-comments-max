'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const activeEntrypoint = fs.readFileSync(path.join(__dirname, '..', 'clean-entrypoint-1.53.9.js'), 'utf8');

assert.ok(activeEntrypoint.includes("require('./performance-debug-routes-pr73')"), 'active entrypoint must require PR73 performance routes');
assert.ok(activeEntrypoint.includes('performanceRoutes.install(app)'), 'active entrypoint must install PR73 performance routes');
assert.ok(activeEntrypoint.includes('performanceTraceEnabled:true'), 'active entrypoint info must expose performanceTraceEnabled');
assert.ok(activeEntrypoint.includes('performance-debug-routes-pr73.js'), 'active entrypoint info must expose performance route module');
assert.ok(activeEntrypoint.includes('express-wrapper-1539-ui20-channel-safe-pr73-performance-trace'), 'express wrapper mode must mention PR73 performance trace');

console.log('wire PR73 active entrypoint smoke ok');
