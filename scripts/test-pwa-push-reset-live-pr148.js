'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pushHtml = fs.readFileSync(path.join(repoRoot, 'public', 'push.html'), 'utf8');
const pushClient = fs.readFileSync(path.join(repoRoot, 'public', 'push-client.js'), 'utf8');
const combined = `${pushHtml}\n${pushClient}`;

assert(pushHtml.includes('id="resetPushButton"'), 'reset button exposes stable resetPushButton id');
assert(pushHtml.includes('id="resetHandlerStatus"'), 'push UI exposes a safe reset handler diagnostic field');
assert(pushClient.includes("const resetButton = $('resetPushButton');"), 'DOMContentLoaded explicitly finds resetPushButton');
assert(pushClient.includes("resetButton.addEventListener('click'"), 'reset click handler is explicitly bound');
assert(pushClient.includes("setResetHandlerStatus('reset handler: bound')"), 'binding writes visible reset handler bound marker');

const resetFunctionStart = pushClient.indexOf('async function resetPushSubscription()');
assert(resetFunctionStart !== -1, 'resetPushSubscription function exists');
const resetFunctionEnd = pushClient.indexOf('\nasync function sendTest()', resetFunctionStart);
assert(resetFunctionEnd > resetFunctionStart, 'resetPushSubscription function has expected boundary');
const resetSource = pushClient.slice(resetFunctionStart, resetFunctionEnd);

assert(resetSource.includes("writeResetResult('reset started')"), 'reset flow writes reset started immediately');
assert(resetSource.indexOf("writeResetResult('reset started')") < resetSource.indexOf("navigator.serviceWorker.getRegistration('/push/')"), 'reset started is shown before service worker lookup');
assert(resetSource.includes("navigator.serviceWorker.getRegistration('/push/')"), 'reset flow uses isolated /push/ service worker registration');
assert(resetSource.includes('service_worker_registration_missing'), 'reset flow handles missing registration visibly');
assert(resetSource.includes('push_manager_missing'), 'reset flow handles missing PushManager visibly');
assert(resetSource.includes('registration found'), 'reset flow reports registration found');
assert(resetSource.includes('existing subscription found'), 'reset flow reports an existing subscription');
assert(resetSource.includes('existing subscription not found'), 'reset flow reports missing subscription');
assert(resetSource.includes('no subscription found'), 'reset flow reports no subscription found');
assert(resetSource.includes('subscription.unsubscribe()'), 'reset flow calls subscription.unsubscribe() when a subscription exists');
assert(resetSource.includes("unsubscribe returned ${unsubscribed ? 'true' : 'false'}"), 'reset flow reports unsubscribe true/false result');
assert(resetSource.includes("unsubscribed ? 'subscription reset: yes' : 'subscription reset: no'"), 'reset flow handles unsubscribe false visibly');
assert(resetSource.includes('reset attempted but subscription still exists'), 'reset flow reports iOS case where subscription still exists after reset');
assert(resetSource.includes('reset failed: ${safeErrorMessage(error)}'), 'reset flow catches thrown errors with visible safe failure message');
assert((resetSource.match(/refreshStatus\(\)\.catch/g) || []).length >= 5, 'reset flow refreshes status after completion paths');
assert(resetSource.includes("writeResetResult('status refreshed')"), 'reset flow reports status refreshed');

assert(!combined.includes("navigator.serviceWorker.register('/sw.js'"), 'no root /sw.js registration is introduced');
assert(!combined.includes('Service-Worker-Allowed: /'), 'no widened Service-Worker-Allowed root scope is introduced');
assert(!combined.includes("scope: '/'"), 'no root service worker scope is introduced');

assert(pushClient.includes('const INVALID_SUBSCRIPTION_RESET_INSTRUCTION'), 'invalid_push_subscription recovery instruction is preserved');
assert(pushClient.includes('state.forceNewSubscriptionAfterInvalid = true'), 'invalid_push_subscription enables one-shot force-new subscribe recovery');
assert(pushClient.includes('existing browser subscription force-reset; unsubscribe returned true'), 'subscribe diagnostics report force-reset reuse behavior');
assert(pushClient.includes('existing browser subscription reused; force-reset not needed'), 'subscribe diagnostics report normal existing subscription reuse');
assert(pushClient.includes('JSON.stringify({ subscription: normalizedSubscription })'), 'normalized subscription payload shape is preserved');

for (const forbiddenVisible of [
  'raw subscription JSON',
  'VAPID private key',
  'PUSH_ADMIN_TOKEN value',
  'PUSH_SUBSCRIBE_TOKEN value',
  'PUSH_PAIRING_SECRET value',
  'raw maxUserId',
  'raw chatId',
  'raw channelId',
  'endpoint:',
  'p256dh:',
  'auth:'
]) {
  assert(!combined.includes(forbiddenVisible), `push UI/client must not expose ${forbiddenVisible}`);
}

const safeSecretPlaceholders = (combined.match(/PUSH_ADMIN_TOKEN|PUSH_SUBSCRIBE_TOKEN|PUSH_PAIRING_SECRET|WEB_PUSH_PRIVATE_KEY/g) || []);
assert(safeSecretPlaceholders.filter((item) => item === 'PUSH_PAIRING_SECRET' || item === 'WEB_PUSH_PRIVATE_KEY').length === 0, 'private/pairing secrets are not exposed in push UI/client');
assert((combined.match(/PUSH_ADMIN_TOKEN/g) || []).length <= 1, 'admin token appears only as safe placeholder text');
assert((combined.match(/PUSH_SUBSCRIBE_TOKEN/g) || []).length <= 2, 'subscribe token appears only as safe placeholder/error text');

console.log('pwa push reset live pr148 ok');
