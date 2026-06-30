'use strict';
const assert = require('assert');
const matrix = require('../services/userJourneyMatrixService');
function blocks(m, reason){return m.violations.filter((v)=>v.severity==='block' && (!reason || v.reason===reason));}
function scenarioIsExercised(m, scenario){
  const covered = Array.isArray(m.scenarioCoverage) && m.scenarioCoverage.some((item)=>item.scenario===scenario && item.mode && item.mode !== 'listed_only');
  const explicit = m.violations.some((v)=>v.scenario===scenario && v.severity==='info' && v.reason==='not_supported');
  return covered || explicit;
}
const normal = matrix.buildMatrix();
assert.strictEqual(normal.ok, true, 'normal journey matrix ok true');
for (const section of matrix.REQUIRED_SECTIONS) assert(normal.sectionsChecked.includes(section), `section covered: ${section}`);
for (const scenario of matrix.REQUIRED_SCENARIOS) {
  assert(normal.scenarios.includes(scenario), `scenario listed: ${scenario}`);
  assert(scenarioIsExercised(normal, scenario), `scenario exercised or explicit info/not_supported: ${scenario}`);
}
assert(Array.isArray(normal.scenarioCoverage) && normal.scenarioCoverage.length >= matrix.REQUIRED_SCENARIOS.length, 'scenario coverage is reported');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='malformed_payload' && item.mode==='synthetic_detector' && item.detected===true), 'malformed payload detector exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='missing_payload' && item.mode==='synthetic_detector' && item.detected===true), 'missing payload detector exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='missing_required_id' && item.mode==='synthetic_detector' && item.detected===true), 'missing required id detector exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='stale_or_deleted_post'), 'stale/deleted post scenario exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='direct_callback_without_prior_state'), 'direct callback scenario exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='back_navigation'), 'back navigation scenario exercised');
assert(normal.scenarioCoverage.some((item)=>item.scenario==='main_menu_navigation'), 'main menu navigation scenario exercised');
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
