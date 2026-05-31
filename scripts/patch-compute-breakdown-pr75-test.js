'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const postPatcher = fs.readFileSync(path.join(__dirname, '..', 'services', 'postPatcher.js'), 'utf8');
const appLoader = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.ok(/PATCH_COMPUTE_BREAKDOWN_RUNTIME\s*=\s*['\"]CC8\.1\.15-PATCH-COMPUTE-BREAKDOWN['\"]/.test(postPatcher), 'postPatcher must expose PR75 breakdown runtime');
assert.ok(postPatcher.includes('function emitPatchStep'), 'postPatcher must include emitPatchStep helper');
[
  'patch.compute.resolve_post.end',
  'patch.compute.enrich_live.end',
  'patch.compute.comments_count.end',
  'patch.compute.handoff_payload.end',
  'patch.compute.gift_rows.end',
  'patch.compute.custom_rows.end',
  'patch.compute.poll_rows.end',
  'patch.compute.db_sync.end',
  'patch.compute.keyboard_fingerprint.end',
  'patch.bootstrap.db_sync.end',
  'patch.bootstrap.total.end'
].forEach((marker) => assert.ok(postPatcher.includes(marker), `postPatcher must emit ${marker}`));
assert.ok(postPatcher.includes('PATCH_COMPUTE_BREAKDOWN_RUNTIME,'), 'postPatcher exports breakdown runtime');
assert.ok(postPatcher.includes('addPostPatchTraceHook'), 'PR75 must keep additive trace hooks from PR73');
assert.ok(postPatcher.includes('setPostPatchTraceHook'), 'PR75 must keep legacy set trace hook API');

assert.ok(appLoader.includes('CC8.1.15-PATCH-COMPUTE-BREAKDOWN'), 'app loader must expose PR75 performance runtime');
assert.ok(appLoader.includes("LEGACY_PR75_ASSET_VERSION = 'v7564-pr75'") || appLoader.includes("ASSET_VERSION = 'v7564-pr75'"), 'app loader must expose PR75 asset version compatibility');
assert.ok(appLoader.includes("postMiniTiming('loader.boot'"), 'app loader must keep loader.boot timing');
assert.ok(appLoader.includes("postMiniTiming('loader.script_appended'"), 'app loader must keep script appended timing');
assert.ok(appLoader.includes("postMiniTiming('loader.script_loaded'"), 'app loader must keep script loaded timing');
assert.ok(appLoader.includes("fetch('/api/debug/miniapp-timing'"), 'app loader should send JSON timing with fetch first');
assert.ok(appLoader.includes("new Blob([body], { type: 'application/json' })"), 'app loader must keep sendBeacon fallback');
assert.ok(appLoader.includes('/public/app-onepass.js?'), 'default direct app-onepass path must stay');
assert.ok(!appLoader.includes('app-fast-send-pr69'), 'PR75 must not reintroduce PR69 wrapper');

console.log('patch compute breakdown PR75 smoke ok');
