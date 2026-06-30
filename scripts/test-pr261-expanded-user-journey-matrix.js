'use strict';
const assert = require('assert');
const matrix = require('../services/userJourneyMatrixService');
function blocks(m, reason){return m.violations.filter((v)=>v.severity==='block' && (!reason || v.reason===reason));}
const normal = matrix.buildMatrix();
assert.strictEqual(normal.ok, true, 'normal journey matrix ok true');
for (const section of matrix.REQUIRED_SECTIONS) assert(normal.sectionsChecked.includes(section), `section covered: ${section}`);
for (const scenario of matrix.REQUIRED_SCENARIOS) assert(normal.scenarios.includes(scenario), `scenario covered: ${scenario}`);
assert(normal.journeysChecked.some((j)=>j.includes('gifts')), 'gifts/lead-magnets journey exists');
assert(normal.journeysChecked.some((j)=>j.includes('buttons')), 'buttons journey exists');
assert.strictEqual(normal.summary.giftsBlockCount, 0, 'gifts journey has no block violations');
assert.strictEqual(normal.summary.buttonsBlockCount, 0, 'buttons journey has no block violations');
assert(blocks(matrix.buildMatrix({ injectDangerousPayloadId: true }), 'chat_like_record_leak').length > 0, 'dangerous payload ID fails matrix');
assert(blocks(matrix.buildMatrix({ injectEmptyButtonLabel: true }), 'empty_button_label').length > 0, 'empty label is block');
assert(blocks(matrix.buildMatrix({ injectMissingCallbackPayload: true }), 'missing_callback_payload').length > 0, 'missing callback payload is block');
assert(blocks(matrix.buildMatrix({ injectPostFromOtherChannel: true }), 'post_from_other_channel_visible').length > 0, 'post from other channel is block');
const missingRoot = matrix.buildMatrix({ omitRootSection: 'buttons' });
assert(missingRoot.violations.some((v)=>['block','warn'].includes(v.severity) && v.reason==='root_button_missing'), 'missing root button is reported');
console.log('PR261 expanded user journey matrix PASS');
