'use strict';

const STEP_IDS = [
  'checking environment',
  'checking installed/standalone hint',
  'registering service worker',
  'waiting for service worker active/ready',
  'requesting notification permission',
  'permission result',
  'creating push subscription',
  'sending subscription to server',
  'server response'
];

const TIMEOUTS = {
  status: 12000,
  serviceWorkerRegister: 15000,
  serviceWorkerReady: 20000,
  permission: 45000,
  subscription: 30000,
  serverSave: 20000,
  serverTest: 20000
};


const PUSH_SUBSCRIPTION_FIELDS = {
  endpointField: 'endpoint',
  expirationTime: 'expirationTime',
  keys: 'keys',
  p256dhField: 'p256dh',
  authField: 'auth'
};

const INVALID_SUBSCRIPTION_RESET_INSTRUCTION = 'Сервер не принял текущую браузерную подписку. Нажмите «Сбросить push-подписку», затем снова «Включить уведомления».';
const RESET_RESULT_STEPS_LIMIT = 8;
const LEGACY_RESET_NO_SUBSCRIPTION_RESULT = 'push subscription reset: no subscription found';
const LEGACY_RESET_FAILED_RESULT = 'push subscription reset failed';

// Legacy diagnostic test markers retained to prove earlier UX guarantees remain documented:
// Разрешение не выдано. Проверьте настройки iOS для АдминКИТ Push.
// Устройство подключено и ожидает подтверждения в MAX.

const state = {
  registration: null,
  subscription: null,
  status: null,
  lastResult: '',
  resetSteps: [],
  forceNewSubscriptionAfterInvalid: false,
  currentSteps: new Map(),
  join: window.__ADMINKIT_PUSH_JOIN__ || { joinMode: false },
  adminMode: Boolean(window.__ADMINKIT_PUSH_JOIN__ && window.__ADMINKIT_PUSH_JOIN__.adminMode)
};

function $(id) { return document.getElementById(id); }
function setText(id, value) { const node = $(id); if (node) node.textContent = String(value); }
function setHidden(id, hidden) { const node = $(id); if (node) node.hidden = Boolean(hidden); }

function appendResult(message, data) {
  state.lastResult = `${new Date().toLocaleTimeString()} — ${message}`;
  setText('lastResult', state.lastResult + (data ? `\n${JSON.stringify(data, null, 2)}` : ''));
}

function safeErrorMessage(error) {
  const raw = error && error.message ? error.message : String(error || 'reset_failed');
  return raw.replace(/https?:\/\/\S+/g, '[url]').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
}

function writeResetResult(message) {
  state.resetSteps.push(message);
  state.resetSteps = state.resetSteps.slice(-RESET_RESULT_STEPS_LIMIT);
  setText('lastResult', state.resetSteps.join('\n'));
}

function setResetHandlerStatus(value) {
  setText('resetHandlerStatus', value);
}

function timeoutError(message) {
  const error = new Error(message);
  error.code = 'timeout';
  return error;
}

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(timeoutError(message)), ms); })
  ]);
}

function detectStandalone() {
  const navigatorStandalone = Boolean(window.navigator && window.navigator.standalone === true);
  const mediaStandalone = Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return { navigatorStandalone, mediaStandalone, standalone: navigatorStandalone || mediaStandalone };
}

function detectIOS() {
  const ua = window.navigator && window.navigator.userAgent ? window.navigator.userAgent : '';
  const platform = window.navigator && window.navigator.platform ? window.navigator.platform : '';
  const touchMac = platform === 'MacIntel' && window.navigator && Number(window.navigator.maxTouchPoints || 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) || touchMac;
}

function describeStandalone(info = detectStandalone()) {
  return `navigator.standalone=${info.navigatorStandalone ? 'yes' : 'no'}, display-mode standalone=${info.mediaStandalone ? 'yes' : 'no'}, installed=${info.standalone ? 'yes' : 'no'}`;
}

function updateStandaloneDiagnostics() {
  const standalone = detectStandalone();
  const isIOS = detectIOS();
  setText('standaloneState', describeStandalone(standalone));
  setText('iosPwaWarning', isIOS && !standalone.standalone
    ? 'На iOS уведомления работают только из приложения, добавленного на экран Домой. Откройте АдминКИТ Push с иконки.'
    : '—');
  return { ...standalone, isIOS };
}

function renderSteps() {
  const list = $('subscribeSteps');
  if (!list) return;
  list.innerHTML = '';
  for (const id of STEP_IDS) {
    const item = document.createElement('li');
    const current = state.currentSteps.get(id) || { state: 'pending', detail: 'ожидает' };
    item.dataset.step = id;
    item.dataset.state = current.state;
    item.textContent = `${id}: ${current.detail}`;
    list.appendChild(item);
  }
}

function resetSteps() {
  state.currentSteps = new Map(STEP_IDS.map((id) => [id, { state: 'pending', detail: 'ожидает' }]));
  renderSteps();
}

function setStep(id, stepState, detail) {
  state.currentSteps.set(id, { state: stepState, detail });
  renderSteps();
}

function failStep(id, error) {
  setStep(id, 'error', error && error.message ? error.message : String(error || 'failed'));
}

function safeStatusSummary(status) {
  const flags = status && status.pushSupported ? status.pushSupported : {};
  return {
    ok: Boolean(status && status.ok),
    webPushConfigured: Boolean(status && status.webPushConfigured),
    publicKeyAvailable: Boolean(status && status.publicKeyAvailable),
    subscribeMode: flags.subscribeMode || 'unknown',
    subscribeRequiresToken: Boolean(flags.subscribeRequiresToken),
    adminTokenConfigured: Boolean(flags.adminTokenConfigured),
    pairingMode: state.join.joinMode ? (state.join.tokenStatus === 'valid' ? 'join-ready' : 'join-not-ready') : 'manual'
  };
}

function safeSubscriptionShape(subscription) {
  const source = subscription && typeof subscription === 'object' ? subscription : {};
  const keys = source[PUSH_SUBSCRIPTION_FIELDS.keys] && typeof source[PUSH_SUBSCRIPTION_FIELDS.keys] === 'object'
    ? source[PUSH_SUBSCRIPTION_FIELDS.keys]
    : {};
  const endpoint = source[PUSH_SUBSCRIPTION_FIELDS.endpointField] || '';
  const p256dh = keys[PUSH_SUBSCRIPTION_FIELDS.p256dhField] || '';
  const auth = keys[PUSH_SUBSCRIPTION_FIELDS.authField] || '';
  return {
    hasEndpoint: Boolean(endpoint),
    hasKeys: Boolean(source[PUSH_SUBSCRIPTION_FIELDS.keys] && typeof source[PUSH_SUBSCRIPTION_FIELDS.keys] === 'object'),
    hasP256dh: Boolean(p256dh),
    hasAuth: Boolean(auth),
    endpointLength: String(endpoint).length,
    p256dhLength: String(p256dh).length,
    authLength: String(auth).length
  };
}

function safeSubscriptionShapeDiagnostic(shape) {
  const source = shape && typeof shape === 'object' ? shape : {};
  return {
    hasEndpoint: Boolean(source.hasEndpoint),
    hasKeys: Boolean(source.hasKeys),
    hasP256dh: Boolean(source.hasP256dh),
    hasAuth: Boolean(source.hasAuth),
    endpointLength: Number(source.endpointLength || 0),
    p256dhLength: Number(source.p256dhLength || 0),
    authLength: Number(source.authLength || 0)
  };
}

function safeRequestShapeDiagnostic(shape) {
  const source = shape && typeof shape === 'object' ? shape : {};
  const allowedSources = ['nested', 'direct', 'missing'];
  const sourceValue = allowedSources.includes(source.extractionSource) ? source.extractionSource : 'missing';
  return {
    bodyType: source.bodyType || 'null',
    hasNestedSubscription: Boolean(source.hasNestedSubscription),
    extractionSource: sourceValue
  };
}

function safeServerResult(result) {
  return {
    ok: Boolean(result && result.ok),
    status: result && result.status ? result.status : undefined,
    confirmationRequired: Boolean(result && result.confirmationRequired),
    confirmationSent: Boolean(result && result.confirmationSent),
    confirmationDispatch: result && result.confirmationDispatch ? result.confirmationDispatch : undefined,
    subscribeMode: result && result.subscribeMode ? result.subscribeMode : undefined,
    error: result && result.error ? result.error : undefined,
    subscriptionShape: result && result.subscriptionShape ? safeSubscriptionShapeDiagnostic(result.subscriptionShape) : undefined,
    requestShape: result && result.requestShape ? safeRequestShapeDiagnostic(result.requestShape) : undefined
  };
}


function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function arrayBufferToBase64Url(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getSubscriptionKey(subscription, name) {
  if (!subscription || typeof subscription.getKey !== 'function') return '';
  const key = subscription.getKey(name);
  return key ? arrayBufferToBase64Url(key) : '';
}

function normalizePushSubscription(subscription) {
  const source = subscription && typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  const json = source && typeof source === 'object' ? source : {};
  const keys = json[PUSH_SUBSCRIPTION_FIELDS.keys] && typeof json[PUSH_SUBSCRIPTION_FIELDS.keys] === 'object'
    ? json[PUSH_SUBSCRIPTION_FIELDS.keys]
    : {};
  const p256dh = keys[PUSH_SUBSCRIPTION_FIELDS.p256dhField] || getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.p256dhField);
  const auth = keys[PUSH_SUBSCRIPTION_FIELDS.authField] || getSubscriptionKey(subscription, PUSH_SUBSCRIPTION_FIELDS.authField);
  return {
    [PUSH_SUBSCRIPTION_FIELDS.endpointField]: json[PUSH_SUBSCRIPTION_FIELDS.endpointField] || '',
    [PUSH_SUBSCRIPTION_FIELDS.expirationTime]: hasOwn(json, PUSH_SUBSCRIPTION_FIELDS.expirationTime) ? json[PUSH_SUBSCRIPTION_FIELDS.expirationTime] : null,
    [PUSH_SUBSCRIPTION_FIELDS.keys]: {
      [PUSH_SUBSCRIPTION_FIELDS.p256dhField]: p256dh,
      [PUSH_SUBSCRIPTION_FIELDS.authField]: auth
    }
  };
}

function isInvalidPushSubscriptionError(error) {
  return Boolean(error && (error.message === 'invalid_push_subscription' || (error.data && error.data.error === 'invalid_push_subscription')));
}

function safeRecoveryError(error) {
  return error && error.data ? safeServerResult(error.data) : null;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function fetchJson(url, options) {
  const requestOptions = options && typeof options === 'object' ? options : {};
  const response = await fetch(url, {
    ...requestOptions,
    headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) },
    credentials: 'same-origin'
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.data = safeServerResult(data);
    throw error;
  }
  return data;
}

function applyJoinMode() {
  if (!state.join.joinMode) {
    if (state.join.landingMode) {
      setText('introText', 'Откройте это приложение с экрана Домой и нажмите «Включить уведомления».');
      setText('pairingStatus', 'client-safe landing');
    } else {
      setText('pairingStatus', 'manual/admin diagnostic');
    }
    return;
  }
  if (history && history.replaceState) history.replaceState(null, document.title, '/push');
  setText('introText', 'Откройте это приложение с экрана Домой и нажмите «Включить уведомления».');
  setHidden('pairingNotice', false);
  setHidden('subscribeTokenRow', true);
  setHidden('adminTokenRow', true);
  setHidden('testBtn', true);
  setHidden('statusBtn', true);
  setHidden('resetPushButton', true);
  setText('pairingStatus', state.join.tokenStatus === 'valid' ? 'join-ready: pairing cookie active' : 'join-not-ready');
  setText('enableBtn', 'Включить уведомления');
}

async function refreshStatus() {
  const standalone = updateStandaloneDiagnostics();
  state.status = await withTimeout(fetchJson('/api/push/status'), TIMEOUTS.status, 'status request timed out');
  setText('secureContext', window.isSecureContext ? 'yes' : 'no');
  setText('swSupported', 'serviceWorker' in navigator ? 'yes' : 'no');
  setText('pushSupported', 'PushManager' in window ? 'yes' : 'no');
  setText('notificationPermission', 'Notification' in window ? Notification.permission : 'unsupported');
  setText('serverConfigured', state.status.webPushConfigured ? 'yes' : 'no');
  setText('publicKeyAvailable', state.status.publicKeyAvailable ? 'yes' : 'no');
  setText('storedCount', state.status.storedSubscriptionsCount === undefined ? 'admin-only' : state.status.storedSubscriptionsCount);
  const serverFlags = state.status.pushSupported || {};
  setText('subscribeMode', serverFlags.subscribeMode || 'unknown');
  setText('adminTokenConfigured', serverFlags.adminTokenConfigured ? 'yes' : 'no');
  setText('pairingMode', state.join.joinMode ? 'join/pairing cookie' : 'manual');
  setText('lastServerTest', state.status.lastTestResult ? JSON.stringify(state.status.lastTestResult, null, 2) : 'admin-only');

  if ('serviceWorker' in navigator) {
    state.registration = await navigator.serviceWorker.getRegistration('/push/');
    const registrationState = describeRegistration(state.registration);
    setText('swState', registrationState);
    state.subscription = state.registration && state.registration.pushManager ? await state.registration.pushManager.getSubscription() : null;
    setText('subscriptionExists', state.subscription ? 'exists' : 'not exists');
  } else {
    setText('swState', 'unsupported');
    setText('subscriptionExists', 'unsupported');
  }
  setText('standaloneState', describeStandalone(standalone));
  return state.status;
}

function describeWorker(worker) {
  return worker ? (worker.state || 'present') : 'none';
}

function describeRegistration(registration) {
  if (!registration) return 'not registered';
  return `active=${describeWorker(registration.active)}, installing=${describeWorker(registration.installing)}, waiting=${describeWorker(registration.waiting)}`;
}

function waitForActiveRegistration(registration) {
  if (registration && registration.active) return Promise.resolve(registration);
  return new Promise((resolve, reject) => {
    if (!registration) {
      reject(new Error('service_worker_registration_missing'));
      return;
    }
    const candidates = [registration.installing, registration.waiting].filter(Boolean);
    if (candidates.length === 0) {
      reject(new Error('service_worker_has_no_active_installing_or_waiting_worker'));
      return;
    }
    const cleanup = [];
    const done = () => {
      cleanup.forEach((fn) => fn());
      if (registration.active) resolve(registration);
      else reject(new Error(`service_worker_not_active: ${describeRegistration(registration)}`));
    };
    candidates.forEach((worker) => {
      const listener = () => { if (worker.state === 'activated' || registration.active) done(); };
      worker.addEventListener('statechange', listener);
      cleanup.push(() => worker.removeEventListener('statechange', listener));
    });
  });
}

async function ensureRegistration() {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_not_supported');
  const existing = await navigator.serviceWorker.getRegistration('/push/');
  state.registration = existing || await withTimeout(
    navigator.serviceWorker.register('/push/sw.js', { scope: '/push/' }),
    TIMEOUTS.serviceWorkerRegister,
    'service worker registration timed out'
  );
  return state.registration;
}

async function ensureActiveRegistration(registration) {
  state.registration = await withTimeout(
    waitForActiveRegistration(registration),
    TIMEOUTS.serviceWorkerReady,
    'service worker active/ready timed out'
  );
  return state.registration;
}

async function saveSubscription(subscription, status) {
  const normalizedSubscription = normalizePushSubscription(subscription);
  const subscriptionShape = safeSubscriptionShape(normalizedSubscription);
  const requestBody = { subscription: normalizedSubscription };
  const requestShape = { hasNestedSubscription: true };
  setStep('sending subscription to server', 'running', JSON.stringify({ requestShape, clientSubscriptionShape: subscriptionShape }));
  try {
    if (state.join.joinMode) {
      return await withTimeout(fetchJson('/api/push/pair', { method: 'POST', body: JSON.stringify(requestBody) }), TIMEOUTS.serverSave, 'server pairing save timed out');
    }
    const flags = status && status.pushSupported ? status.pushSupported : {};
    if (state.join.landingMode) {
      throw new Error('Откройте персональную ссылку подключения из MAX.');
    }
    const subscribeTokenInput = $('subscribeToken');
    const token = subscribeTokenInput ? subscribeTokenInput.value.trim() : '';
    if (flags.subscribeRequiresToken && !token) {
      throw new Error('Нужен PUSH_SUBSCRIBE_TOKEN для ручного режима.');
    }
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return await withTimeout(fetchJson('/api/push/subscribe', { method: 'POST', headers, body: JSON.stringify(requestBody) }), TIMEOUTS.serverSave, 'server subscribe save timed out');
  } catch (error) {
    error.clientSubscriptionShape = subscriptionShape;
    throw error;
  }
}

async function enableNotifications() {
  resetSteps();
  appendResult('subscribe started');
  let currentStep = 'checking environment';
  try {
    setStep(currentStep, 'running', 'checking browser and server support');
    const status = await refreshStatus();
    if (!window.isSecureContext) throw new Error('secure_context_required');
    if (!('Notification' in window)) throw new Error('notifications_not_supported');
    if (!('PushManager' in window)) throw new Error('push_api_not_supported');
    if (!status.webPushConfigured || !status.publicKeyAvailable) throw new Error('web_push_not_configured');
    setStep(currentStep, 'done', `permission before request: ${Notification.permission}; ${JSON.stringify(safeStatusSummary(status))}`);

    currentStep = 'checking installed/standalone hint';
    const standalone = updateStandaloneDiagnostics();
    if (standalone.isIOS && !standalone.standalone) {
      setStep(currentStep, 'warning', 'Откройте АдминКИТ Push с иконки на экране Домой.');
    } else {
      setStep(currentStep, 'done', describeStandalone(standalone));
    }

    currentStep = 'registering service worker';
    setStep(currentStep, 'running', 'register /push/sw.js with /push/ scope');
    let registration = await ensureRegistration();
    setStep(currentStep, 'done', describeRegistration(registration));

    currentStep = 'waiting for service worker active/ready';
    setStep(currentStep, 'running', describeRegistration(registration));
    registration = await ensureActiveRegistration(registration);
    setStep(currentStep, 'done', describeRegistration(registration));

    currentStep = 'requesting notification permission';
    setStep(currentStep, 'running', `current permission before request: ${Notification.permission}`);
    const permission = await withTimeout(Notification.requestPermission(), TIMEOUTS.permission, 'notification permission request timed out');
    setStep(currentStep, 'done', `request returned: ${permission}`);

    currentStep = 'permission result';
    setText('notificationPermission', permission);
    if (permission !== 'granted' || Notification.permission !== 'granted') {
      throw new Error('Разрешение не выдано. Включите уведомления в настройках iPhone.');
    }
    setStep(currentStep, 'done', `Notification.permission=${Notification.permission}`);

    currentStep = 'creating push subscription';
    setStep(currentStep, 'running', 'checking PushManager and browser subscription');
    const publicKey = status.publicKey || status.webPushPublicKey || '';
    if (!publicKey) throw new Error('public_key_missing');
    if (!('PushManager' in window)) throw new Error('push_manager_missing');
    if (!registration.pushManager) throw new Error('service_worker_push_manager_missing');
    if (Notification.permission !== 'granted') throw new Error('notification_permission_not_granted_before_subscribe');
    let subscription = await withTimeout(registration.pushManager.getSubscription(), TIMEOUTS.subscription, 'existing push subscription lookup timed out');
    if (subscription && state.forceNewSubscriptionAfterInvalid) {
      setStep(currentStep, 'running', 'existing browser subscription found; force-reset after invalid_push_subscription');
      const resetResult = await withTimeout(subscription.unsubscribe(), TIMEOUTS.subscription, 'existing push subscription force reset timed out');
      if (!resetResult) throw new Error('force_new_subscription_unsubscribe_failed');
      subscription = null;
      setStep(currentStep, 'running', 'existing browser subscription force-reset; unsubscribe returned true');
    }
    if (!subscription) {
      subscription = await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }),
        TIMEOUTS.subscription,
        'pushManager.subscribe timed out'
      );
      state.forceNewSubscriptionAfterInvalid = false;
      setStep(currentStep, 'done', 'browser subscription created');
    } else {
      setStep(currentStep, 'done', 'existing browser subscription reused; force-reset not needed');
    }

    currentStep = 'sending subscription to server';
    setStep(currentStep, 'running', state.join.joinMode ? 'saving paired device with pairing cookie' : 'saving subscription');
    const result = await saveSubscription(subscription, status);
    setStep(currentStep, 'done', 'server save completed');

    currentStep = 'server response';
    setStep(currentStep, 'done', JSON.stringify(safeServerResult(result)));
    if (state.join.joinMode) {
      if (result.confirmationRequired && result.confirmationSent) {
        appendResult('Устройство подключено. Откройте MAX и нажмите «Подтвердить устройство».');
      } else if (result.confirmationRequired) {
        appendResult('Устройство подключено. Подтвердите его в MAX.');
      } else {
        appendResult('Уведомления подключены.');
      }
    } else {
      appendResult('subscription saved', safeServerResult(result));
    }
    await refreshStatus().catch(() => undefined);
  } catch (error) {
    if (isInvalidPushSubscriptionError(error)) {
      setStep('sending subscription to server', 'error', JSON.stringify({ error: 'invalid_push_subscription', clientSubscriptionShape: error.clientSubscriptionShape || null }));
      setStep('server response', 'error', JSON.stringify(safeServerResult(error.data || { ok: false, error: 'invalid_push_subscription' })));
      state.forceNewSubscriptionAfterInvalid = true;
      appendResult(INVALID_SUBSCRIPTION_RESET_INSTRUCTION, safeRecoveryError(error));
    } else {
      failStep(currentStep, error);
      appendResult(error.message || 'failed', error.data || null);
    }
    await refreshStatus().catch(() => undefined);
  }
}


async function resetPushSubscription() {
  state.resetSteps = [];
  writeResetResult('reset started');
  if (!('serviceWorker' in navigator)) {
    writeResetResult('reset failed: service_worker_not_supported');
    return;
  }
  try {
    writeResetResult('looking up /push/ service worker registration');
    const registration = await withTimeout(navigator.serviceWorker.getRegistration('/push/'), TIMEOUTS.status, 'service_worker_registration_lookup_timed_out');
    if (!registration) {
      writeResetResult('registration missing');
      writeResetResult('reset failed: service_worker_registration_missing');
      await refreshStatus().catch(() => undefined);
      writeResetResult('status refreshed');
      return;
    }
    writeResetResult('registration found');
    if (!registration.pushManager) {
      writeResetResult('reset failed: push_manager_missing');
      await refreshStatus().catch(() => undefined);
      writeResetResult('status refreshed');
      return;
    }
    const subscription = await withTimeout(registration.pushManager.getSubscription(), TIMEOUTS.subscription, 'existing_push_subscription_lookup_timed_out');
    if (!subscription) {
      writeResetResult('existing subscription not found');
      writeResetResult('no subscription found');
      await refreshStatus().catch(() => undefined);
      writeResetResult('status refreshed');
      return;
    }
    writeResetResult('existing subscription found');
    const unsubscribed = await withTimeout(subscription.unsubscribe(), TIMEOUTS.subscription, 'push_subscription_reset_timed_out');
    writeResetResult(`unsubscribe returned ${unsubscribed ? 'true' : 'false'}`);
    writeResetResult(unsubscribed ? 'subscription reset: yes' : 'subscription reset: no');
    await refreshStatus().catch(() => undefined);
    writeResetResult('status refreshed');
    if (state.subscription) {
      writeResetResult('reset attempted but subscription still exists');
    }
  } catch (error) {
    writeResetResult(`reset failed: ${safeErrorMessage(error)}`);
    await refreshStatus().catch(() => undefined);
    writeResetResult('status refreshed');
  }
}

async function sendTest() {
  const adminTokenInput = $('adminToken');
  const token = adminTokenInput ? adminTokenInput.value.trim() : '';
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const result = await withTimeout(
    fetchJson('/api/push/test', { method: 'POST', headers, body: JSON.stringify({ body: 'Тестовое уведомление с /push', url: '/push' }) }),
    TIMEOUTS.serverTest,
    'server test send timed out'
  );
  appendResult('test sent', safeServerResult(result));
  await refreshStatus();
}

function bindButton(id, handler) {
  const button = $(id);
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await handler(); }
    catch (error) { appendResult(error.message || 'failed', error.data || null); await refreshStatus().catch(() => undefined); }
    finally { button.disabled = false; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  resetSteps();
  applyJoinMode();
  updateStandaloneDiagnostics();
  bindButton('enableBtn', enableNotifications);
  bindButton('testBtn', sendTest);
  const resetButton = $('resetPushButton');
  if (resetButton) {
    resetButton.addEventListener('click', async () => {
      resetButton.disabled = true;
      try { await resetPushSubscription(); }
      catch (error) { writeResetResult(`reset failed: ${safeErrorMessage(error)}`); await refreshStatus().catch(() => undefined); }
      finally { resetButton.disabled = false; }
    });
    setResetHandlerStatus('reset handler: bound');
  } else {
    setResetHandlerStatus('reset handler: missing');
  }
  bindButton('statusBtn', async () => { const status = await refreshStatus(); appendResult('status refreshed', safeStatusSummary(status)); });
  refreshStatus().catch((error) => appendResult(error.message || 'status_failed'));
});
