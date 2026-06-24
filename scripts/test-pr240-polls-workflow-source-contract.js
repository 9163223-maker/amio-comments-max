'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const adapter = fs.readFileSync(path.join(root, 'v3-menu-actions-adapter.js'), 'utf8');
const canonical = fs.readFileSync(path.join(root, 'features/menu-v3/canonical-menu.js'), 'utf8');

assert(adapter.includes('CC6.6.10-V3-MENU-ACTIONS-POLLS-UNIFIED-WORKFLOW'), 'PR240 runtime marker must be present');
assert(adapter.includes("o === 'polls' ? 'polls:post'"), 'post picker must route polls to polls:post');
assert(adapter.includes('async function pollsPickChannel'), 'polls channel picker must exist');
assert(adapter.includes("cs.length === 1) return pickPost"), 'single channel must auto-open post picker');
assert(adapter.includes('async function pollsPostCard'), 'polls post card must exist');
assert(adapter.includes("'polls:question'"), 'polls post card must open question step');
assert(adapter.includes("'polls:options'"), 'polls question must open options step');
assert(adapter.includes("'polls:create_run'"), 'polls preview must create poll');
assert(adapter.includes('pollsData().createPoll'), 'poll creation must use polls data adapter');
assert(adapter.includes('pollsUnifiedWorkflowReady:true'), 'selfTest must expose polls workflow readiness');
assert(adapter.includes('pollsNotDevPlaceholder:true'), 'selfTest must expose non-dev placeholder readiness');

const pollsBlock = canonical.slice(canonical.indexOf("id: 'polls'"), canonical.indexOf("id: 'highlights'"));
assert(pollsBlock.includes("targetAction: 'polls:create'"), 'canonical polls.create emitted/root action must route to polls:create');
assert(pollsBlock.includes("targetAction: 'polls:results'"), 'canonical polls.results emitted/root action must route to polls:results');
assert(!pollsBlock.includes("targetAction: 'comments_select_post'"), 'canonical visible polls root must not target comments_select_post');
assert(!pollsBlock.includes("targetAction: 'poll_status'"), 'canonical visible polls root must not target poll_status');

console.log('PR240 polls workflow source contract ok');
