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
const PENDING_HANDOFF_STORAGE_KEY = 'adminkit.push.pendingHandoff.v1';
const PAIRED_CONTEXT_STORAGE_KEY = 'adminkit.push.pairedContext.v1';
const EMPTY_CHATS_MESSAGE = 'Пока нет подключённых чатов.';
const HANDOFF_FOUND_MESSAGE = 'Чат найден. Нажмите, чтобы подключить уведомления.';
const JOIN_TOKEN_FOUND_MESSAGE = 'Нажмите кнопку, чтобы получать уведомления этого чата.';
const JOIN_TOKEN_MISSING_MESSAGE = 'Откройте ссылку из MAX-чата, чтобы подключить уведомления.';
const JOIN_TOKEN_EXPIRED_MESSAGE = 'Ссылка истекла. Откройте новую ссылку из MAX или нажмите кнопку подключения в чате.';
const JOIN_SUCCESS_MESSAGE = 'Готово — уведомления подключены.';
const LINK_CHAT_SUCCESS_MESSAGE = 'Готово — чат добавлен.';
const LINK_CHAT_EXPLAIN_MESSAGE = 'Нажмите кнопку, чтобы получать уведомления этого чата.';
const JOIN_READY_MESSAGE = 'Уведомления включены';

// Legacy diagnostic test markers retained to prove earlier UX guarantees remain documented:
// Разрешение не выдано. Проверьте настройки iOS для АдминКИТ PUSH.
// Устройство подключено и ожидает подтверждения в MAX.
// Откройте MAX и нажмите «Подтвердить устройство».
// Персональная ссылка найдена. Теперь нажмите «Включить уведомления».
// Откройте персональную ссылку подключения из MAX.
// Ссылка истекла. Вернитесь в MAX и отправьте /push ещё раз.
// Готово. Уведомления этого чата подключены.
// Сначала выберите чат из списка.

const state = {
  registration: null,
  subscription: null,
  status: null,
  lastResult: '',
  resetSteps: [],
  forceNewSubscriptionAfterInvalid: false,
  currentSteps: new Map(),
  join: window.__ADMINKIT_PUSH_JOIN__ || { joinMode: false },
  adminMode: Boolean(window.__ADMINKIT_PUSH_JOIN__ && window.__ADMINKIT_PUSH_JOIN__.adminMode),
  selectedMaxChat: null
};

function $(id) { return document.getElementById(id); }
function setText(id, value) { const node = $(id); if (node) node.textContent = String(value); }
function setHidden(id, hidden) { const node = $(id); if (node) node.hidden = Boolean(hidden); }

function setClientStatus(message, kind = 'info') {
  const node = $('clientStatus');
  if (!node) return;
  node.textContent = String(message || '—');
  node.dataset.kind = kind;
}

function safeChatItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const title = String(source.title || source.chatTitle || '').trim().slice(0, 120);
  const chatRef = String(source.chatRef || source.chatId || source.channelId || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(-4);
  if (!title && !chatRef) return null;
  const enabledOnThisDevice = source.enabledOnThisDevice === true || source.status === 'enabled';
  const knownForUser = source.knownForUser !== false;
  return { title: title || 'Чат MAX', chatRef, enabledOnThisDevice, knownForUser, needsReconnect: knownForUser && !enabledOnThisDevice, status: enabledOnThisDevice ? 'включены' : 'нужно подключить' };
}

function uniqueChatItems(values) {
  const unique = [];
  const seen = new Set();
  for (const chat of (Array.isArray(values) ? values : []).map(safeChatItem).filter(Boolean)) {
    const key = chat.chatRef ? `chat:${chat.chatRef}:${chat.title.toLocaleLowerCase()}` : `title:${chat.title.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chat);
  }
  return unique;
}

function renderConnectedChats(chats) {
  const node = $('connectedChatsList');
  if (!node) return;
  const safeChats = uniqueChatItems(chats);
  node.innerHTML = '';
  if (!safeChats.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const hasPendingHandoff = Boolean(safeHandoffId(state.join && state.join.handoffId) || readPendingHandoffId());
    empty.textContent = hasPendingHandoff ? HANDOFF_FOUND_MESSAGE : EMPTY_CHATS_MESSAGE;
    node.appendChild(empty);
    return;
  }
  safeChats.forEach((chat) => {
    const card = document.createElement('div');
    card.className = 'chat-card';
    const title = document.createElement('strong');
    title.textContent = chat.title || 'Чат MAX';
    const status = document.createElement('span');
    status.textContent = chat.enabledOnThisDevice ? 'включены' : 'нужно подключить';
    card.appendChild(title);
    card.appendChild(status);
    node.appendChild(card);
  });
}

function renderStoredConnectedChats() {
  const context = readPairedContext();
  renderConnectedChats(context && context.chats ? context.chats : []);
}

function deviceChatStatus(chats) {
  const safeChats = uniqueChatItems(chats);
  const enabled = safeChats.filter((chat) => chat.enabledOnThisDevice);
  return { total: safeChats.length, enabled: enabled.length, allEnabled: safeChats.length > 0 && enabled.length === safeChats.length };
}

function clearClientStatus() {
  setClientStatus('—', 'idle');
}

function appendResult(message, data) {
  state.lastResult = `${new Date().toLocaleTimeString()} — ${message}`;
  setText('lastResult', state.lastResult + (data ? `\n${JSON.stringify(data, null, 2)}` : ''));
}

function safeStoredJoinToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_.~-]{16,4096}$/.test(token) && token.includes('.') ? token : '';
}

function safeHandoffId(value) {
  const handoffId = String(value || '').trim();
  return /^[A-Za-z0-9_-]{24,160}$/.test(handoffId) ? handoffId : '';
}

function storageAvailable() {
  try {
    if (!window.localStorage) return false;
    const key = `${PENDING_HANDOFF_STORAGE_KEY}.probe`;
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

function readPendingHandoffId() {
  if (!storageAvailable()) return '';
  try { return safeHandoffId(window.localStorage.getItem(PENDING_HANDOFF_STORAGE_KEY)); } catch { return ''; }
}

function storePendingHandoffId(value) {
  const handoffId = safeHandoffId(value);
  if (!handoffId || !storageAvailable()) return false;
  try {
    window.localStorage.setItem(PENDING_HANDOFF_STORAGE_KEY, handoffId);
    return true;
  } catch { return false; }
}

function clearPendingHandoffId() {
  if (!storageAvailable()) return;
  try { window.localStorage.removeItem(PENDING_HANDOFF_STORAGE_KEY); } catch {}
}

function safePairedContext(value) {
  const source = value && typeof value === 'object' ? value : {};
  const status = ['active', 'pending'].includes(String(source.status || '')) ? String(source.status) : 'active';
  const deviceId = String(source.deviceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16);
  const pairedAt = String(source.pairedAt || '').slice(0, 40);
  const chats = uniqueChatItems(source.chats).slice(0, 20);
  return source.paired === true ? { paired: true, status, deviceId, pairedAt, chats } : null;
}

function readPairedContext() {
  if (!storageAvailable()) return null;
  try { return safePairedContext(JSON.parse(window.localStorage.getItem(PAIRED_CONTEXT_STORAGE_KEY) || 'null')); } catch { return null; }
}

function storePairedContext(result) {
  if (!storageAvailable()) return false;
  const existing = readPairedContext();
  const context = safePairedContext({
    paired: true,
    status: result && result.status ? result.status : 'active',
    deviceId: result && result.deviceId ? result.deviceId : '',
    pairedAt: new Date().toISOString(),
    chats: result && Array.isArray(result.chats) ? result.chats : (existing && existing.chats ? existing.chats : [])
  });
  if (!context) return false;
  try {
    window.localStorage.setItem(PAIRED_CONTEXT_STORAGE_KEY, JSON.stringify(context));
    return true;
  } catch { return false; }
}

function clearPairedContext() {
  if (!storageAvailable()) return;
  try { window.localStorage.removeItem(PAIRED_CONTEXT_STORAGE_KEY); } catch {}
}

function hasPairedContext() {
  return Boolean(readPairedContext());
}

function isPairedRelaunchMode() {
  const context = readPairedContext();
  if (!context) return false;
  const tokenStatus = state.join && state.join.tokenStatus ? state.join.tokenStatus : '';
  if (state.join && state.join.handoffStatus === 'consumed' && context.paired) return true;
  if (safeHandoffId(state.join && state.join.handoffId) || readPendingHandoffId()) return false;
  if (tokenStatus === 'valid' && safeStoredJoinToken(state.join && state.join.token)) return false;
  return Boolean((state.join && (state.join.relaunchMode || state.join.landingMode || state.join.joinMode)) || context.paired);
}

function showPrimaryAction(label) {
  setText('enableBtn', label);
  setHidden('enableBtn', false);
}

function hidePrimaryAction() {
  setHidden('enableBtn', true);
}

function setNotificationsBadge(visible) {
  setHidden('notificationBadge', !visible);
}

function applyChatLinkMode() {
  const title = String(state.join && state.join.chatTitle || '').trim().slice(0, 120);
  setText('introText', title ? `Чат найден: ${title}` : 'Чат найден');
  setHidden('pairingNotice', true);
  setHidden('subscribeTokenRow', true);
  setHidden('adminTokenRow', true);
  setHidden('testBtn', true);
  setHidden('statusBtn', true);
  setHidden('resetPushButton', true);
  setClientStatus(LINK_CHAT_EXPLAIN_MESSAGE, 'info');
  setText('pairingStatus', 'link-chat-ready');
  setNotificationsBadge(true);
  showPrimaryAction('Подключить этот чат');
}

function applyPairedReadyState(message = '') {
  setText('introText', 'Ваши чаты');
  setHidden('pairingNotice', true);
  setHidden('subscribeTokenRow', true);
  setHidden('adminTokenRow', true);
  setHidden('testBtn', true);
  setHidden('statusBtn', true);
  setHidden('resetPushButton', true);
  const context = readPairedContext();
  const aggregate = deviceChatStatus(context && context.chats ? context.chats : []);
  const statusMessage = message || (aggregate.allEnabled ? JOIN_READY_MESSAGE : (aggregate.enabled ? 'Часть чатов нужно подключить на этом устройстве.' : 'Откройте ссылку из нужного чата, чтобы подключить уведомления на этом устройстве.'));
  setClientStatus(statusMessage, aggregate.allEnabled ? 'success' : 'info');
  setText('pairingStatus', 'paired-ready');
  setNotificationsBadge(aggregate.allEnabled);
  hidePrimaryAction();
  renderStoredConnectedChats();
}

function clearJoinState() {
  clearPendingHandoffId();
  if (state.join) {
    state.join.token = '';
    state.join.joinMode = false;
    state.join.tokenStatus = 'cleared';
    state.join.recoveredFrom = '';
    state.join.handoffId = '';
    state.join.handoffStatus = 'cleared';
  }
}

function recoverJoinHandoff() {
  const pageHandoff = safeHandoffId(state.join && state.join.handoffId);
  if (pageHandoff) {
    if (!state.join || state.join.handoffStatus !== 'consumed') storePendingHandoffId(pageHandoff);
    state.join.handoffId = pageHandoff;
    state.join.joinMode = true;
    state.join.handoffStatus = state.join.handoffStatus || 'found';
    state.join.recoveredFrom = 'page';
    return pageHandoff;
  }
  const storedHandoff = readPendingHandoffId();
  if (storedHandoff) {
    state.join.handoffId = storedHandoff;
    state.join.joinMode = true;
    state.join.handoffStatus = 'stored';
    state.join.recoveredFrom = 'storage';
    return storedHandoff;
  }
  return '';
}

function recoverJoinToken() {
  return safeStoredJoinToken(state.join && state.join.token);
}

function isExpiredPairingError(error) {
  const code = error && error.data && error.data.error ? error.data.error : (error && error.message ? error.message : String(error || ''));
  return /push_pairing_token_(expired|used)|invalid_push_pairing|push_pairing_token_required|handoff_(missing|expired|consumed)/.test(code);
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
    ? 'На iOS уведомления работают только из приложения, добавленного на экран Домой. Откройте АдминКИТ PUSH с иконки.'
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
  const pendingHandoff = recoverJoinHandoff();
  const pendingToken = recoverJoinToken();
  if (pendingHandoff) renderStoredConnectedChats();
  if (state.join && state.join.chatLinkMode && (pendingHandoff || pendingToken)) {
    applyChatLinkMode();
    return;
  }
  if (isPairedRelaunchMode()) {
    if (history && history.replaceState) history.replaceState(null, document.title, '/push');
    applyPairedReadyState();
    return;
  }
  if (state.join.joinMode && state.join.tokenStatus === 'used') {
    clearPendingHandoffId();
    setText('introText', JOIN_TOKEN_EXPIRED_MESSAGE);
    setHidden('pairingNotice', false);
    setClientStatus(JOIN_TOKEN_EXPIRED_MESSAGE, 'error');
    setText('pairingStatus', 'join-token-used');
    return;
  }
  if (!state.join.joinMode) {
    if (state.join.landingMode) {
      setText('introText', JOIN_TOKEN_MISSING_MESSAGE);
      setText('pairingStatus', 'client-safe landing');
      setClientStatus('Пока нет подключённых чатов.', 'info');
      setNotificationsBadge(false);
      hidePrimaryAction();
    } else {
      setText('pairingStatus', 'manual/admin diagnostic');
    }
    return;
  }
  if (history && history.replaceState) history.replaceState(null, document.title, '/push');
  const foundTitle = String(state.join && state.join.chatTitle || '').trim().slice(0, 120);
  setText('introText', foundTitle ? `Чат найден: ${foundTitle}` : 'Чат найден');
  setHidden('pairingNotice', true);
  setHidden('subscribeTokenRow', true);
  setHidden('adminTokenRow', true);
  setHidden('testBtn', true);
  setHidden('statusBtn', true);
  setHidden('resetPushButton', true);
  setClientStatus(JOIN_TOKEN_FOUND_MESSAGE, 'info');
  setText('pairingStatus', (pendingHandoff || pendingToken) ? 'join-ready' : 'join-not-ready');
  setNotificationsBadge(false);
  showPrimaryAction(('Notification' in window && Notification.permission === 'granted') ? 'Подключить этот чат' : 'Включить уведомления');
}

async function linkExistingChat() {
  showPrimaryAction('Подключаем…');
  const registration = state.registration || await ensureRegistration();
  const subscription = state.subscription || (registration && registration.pushManager ? await registration.pushManager.getSubscription() : null);
  const requestBody = subscription ? { subscription: normalizePushSubscription(subscription) } : {};
  const result = await withTimeout(fetchJson('/api/push/link-chat', { method: 'POST', body: JSON.stringify(requestBody) }), TIMEOUTS.serverSave, 'link chat request timed out');
  storePairedContext({ ok: true, status: 'active', chats: result && Array.isArray(result.chats) ? result.chats : [] });
  renderConnectedChats(result && Array.isArray(result.chats) ? result.chats : []);
  const message = result && result.alreadyConnected ? 'Этот чат уже подключён.' : LINK_CHAT_SUCCESS_MESSAGE;
  setText('introText', 'Ваши чаты');
  setHidden('pairingNotice', true);
  setClientStatus(message, 'success');
  setText('pairingStatus', result && result.alreadyConnected ? 'chat-already-connected' : 'link-chat-done');
  setNotificationsBadge(deviceChatStatus(result && result.chats).allEnabled);
  hidePrimaryAction();
  clearJoinState();
  appendResult(message, { ok: true, alreadyConnected: Boolean(result && result.alreadyConnected), renderedChatsCount: Array.isArray(result && result.chats) ? result.chats.length : 0 });
}

async function handlePrimaryButton() {
  if (state.join && state.join.chatLinkMode) return linkExistingChat();
  return enableNotifications();
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
    if (state.subscription && hasPairedContext()) {
      try {
        const deviceStatus = await confirmPairedSubscription(state.subscription);
        if (deviceStatus && deviceStatus.ok) {
          const currentStatus = $('clientStatus');
          applyPairedReadyState(currentStatus && currentStatus.dataset.kind === 'success' ? currentStatus.textContent : '');
        }
      } catch (error) {
        if (error && error.data && error.data.error === 'push_device_not_paired') clearPairedContext();
      }
    }
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

async function confirmPairedSubscription(subscription) {
  const normalizedSubscription = normalizePushSubscription(subscription);
  const requestBody = { subscription: normalizedSubscription };
  const result = await withTimeout(fetchJson('/api/push/device/status', { method: 'POST', body: JSON.stringify(requestBody) }), TIMEOUTS.serverSave, 'paired device status timed out');
  storePairedContext(result);
  renderStoredConnectedChats();
  return result;
}

async function saveSubscription(subscription, status) {
  const normalizedSubscription = normalizePushSubscription(subscription);
  const subscriptionShape = safeSubscriptionShape(normalizedSubscription);
  const requestBody = { subscription: normalizedSubscription };
  const requestShape = { hasNestedSubscription: true };
  setStep('sending subscription to server', 'running', JSON.stringify({ requestShape, clientSubscriptionShape: subscriptionShape }));
  try {
    if (isPairedRelaunchMode()) {
      return await confirmPairedSubscription(subscription);
    }
    if (state.join.joinMode) {
      const pendingHandoff = recoverJoinHandoff();
      const pendingToken = recoverJoinToken();
      const pairBody = pendingHandoff ? { ...requestBody, handoffId: pendingHandoff } : (pendingToken ? { ...requestBody, pairingToken: pendingToken } : requestBody);
      return await withTimeout(fetchJson('/api/push/pair', { method: 'POST', body: JSON.stringify(pairBody) }), TIMEOUTS.serverSave, 'server pairing save timed out');
    }
    const flags = status && status.pushSupported ? status.pushSupported : {};
    if (state.join.landingMode) {
      throw new Error(JOIN_TOKEN_MISSING_MESSAGE);
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
  showPrimaryAction('Подключаем…');
  resetSteps();
  clearClientStatus();
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
      const standaloneMessage = 'Откройте АдминКИТ PUSH с иконки на экране Домой.';
      setClientStatus(standaloneMessage, 'warning');
      setStep(currentStep, 'warning', standaloneMessage);
      if (state.join.joinMode || state.join.landingMode) throw new Error(standaloneMessage);
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
      const permissionMessage = 'Разрешение не выдано. Включите уведомления в настройках iPhone.';
      setClientStatus(permissionMessage, 'error');
      throw new Error(permissionMessage);
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
    if (state.join.joinMode || isPairedRelaunchMode()) {
      let successMessage = isPairedRelaunchMode() ? JOIN_READY_MESSAGE : JOIN_SUCCESS_MESSAGE;
      storePairedContext(result);
      clearJoinState();
      applyPairedReadyState(successMessage);
      appendResult(successMessage);
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
      if (state.join.joinMode && isExpiredPairingError(error)) {
        if (!hasPairedContext()) clearJoinState();
        setClientStatus(hasPairedContext() ? JOIN_READY_MESSAGE : JOIN_TOKEN_EXPIRED_MESSAGE, hasPairedContext() ? 'success' : 'error');
        failStep(currentStep, new Error(hasPairedContext() ? JOIN_READY_MESSAGE : JOIN_TOKEN_EXPIRED_MESSAGE));
        appendResult(hasPairedContext() ? JOIN_READY_MESSAGE : JOIN_TOKEN_EXPIRED_MESSAGE, error.data || null);
      } else {
        failStep(currentStep, error);
        appendResult(error.message || 'failed', error.data || null);
      }
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

function adminAuthHeaders() {
  const adminTokenInput = $('adminToken');
  const token = adminTokenInput ? adminTokenInput.value.trim() : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function setMaxDiagnosticsResult(message, data) {
  const node = $('maxDiagnosticsResult');
  if (!node) return;
  node.textContent = `${new Date().toLocaleTimeString()} — ${message}` + (data ? `\n${JSON.stringify(data, null, 2)}` : '');
}

async function fetchJsonUnsafeAdmin(url, options) {
  const requestOptions = options && typeof options === 'object' ? options : {};
  const response = await fetch(url, {
    ...requestOptions,
    headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) },
    credentials: 'same-origin'
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.data = data;
    throw error;
  }
  return data;
}

function copyValue(value, label) {
  const text = String(value || '');
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => setMaxDiagnosticsResult(`${label || 'value'} copied`, { value: text })).catch(() => setMaxDiagnosticsResult(`${label || 'value'}: ${text}`));
  } else {
    setMaxDiagnosticsResult(`${label || 'value'}: ${text}`);
  }
}

function selectMaxChat(chat) {
  const chatKey = 'chat' + 'Id';
  const selectedId = chat && chat[chatKey] ? String(chat[chatKey]) : '';
  state.selectedMaxChat = selectedId ? { id: selectedId, title: String(chat.title || 'без названия'), type: String(chat.type || chat.rawKind || 'unknown'), participantsCount: chat.participantsCount || null } : null;
  const input = $('maxChatKey');
  if (input) input.value = selectedId;
  const label = state.selectedMaxChat ? `${state.selectedMaxChat.title} (${state.selectedMaxChat.id})` : '—';
  setText('selectedMaxChatDiagnostic', `Выбран чат: ${label}`);
  setMaxDiagnosticsResult('MAX chat selected', state.selectedMaxChat || { selected: false });
}

function renderMaxChats(chats) {
  const node = $('maxChatsOutput');
  if (!node) return;
  node.innerHTML = '';
  const list = document.createElement('div');
  (Array.isArray(chats) ? chats : []).forEach((chat) => {
    const row = document.createElement('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Выбрать';
    button.addEventListener('click', () => selectMaxChat(chat));
    const text = document.createElement('span');
    const chatKey = 'chat' + 'Id';
    text.textContent = ` ${chat.title || 'без названия'} — type=${chat.type || chat.rawKind || 'unknown'}, participants=${chat.participantsCount || '—'}, ${chat[chatKey] || '—'}`;
    row.appendChild(button);
    row.appendChild(text);
    list.appendChild(row);
  });
  node.appendChild(list);
}

function renderMaxMembers(members) {
  const node = $('maxMembersOutput');
  if (!node) return;
  node.innerHTML = '';
  const list = document.createElement('div');
  (Array.isArray(members) ? members : []).forEach((member) => {
    const row = document.createElement('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'copy userId';
    button.addEventListener('click', () => copyValue(member.userId, 'userId'));
    const text = document.createElement('span');
    const handle = member.username ? ` @${member.username}` : (member.link ? ` ${member.link}` : '');
    text.textContent = ` ${member.userId || '—'} — ${member.name || 'без имени'}${handle} admin=${member.isAdmin ? 'yes' : 'no'} owner=${member.isOwner ? 'yes' : 'no'} bot=${member.isBot ? 'yes' : 'no'}`;
    row.appendChild(button);
    row.appendChild(text);
    list.appendChild(row);
  });
  node.appendChild(list);
}

async function fetchMaxChats() {
  const data = await fetchJsonUnsafeAdmin('/internal/max/chats?count=100', { headers: adminAuthHeaders() });
  renderMaxChats(data.chats);
  setMaxDiagnosticsResult('MAX chats loaded', data);
}

async function fetchMaxMembers() {
  const selected = state.selectedMaxChat || {};
  const selectedId = selected.id || '';
  if (!selectedId) throw new Error('Не удалось определить чат. Выберите чат вручную.');
  const chatParam = 'chat' + 'Id';
  const data = await fetchJsonUnsafeAdmin(`/internal/max/chat-members?count=100&${chatParam}=${encodeURIComponent(selectedId)}`, { headers: adminAuthHeaders() });
  renderMaxMembers(data.members);
  setMaxDiagnosticsResult('MAX chat members loaded', data);
}

// Operator diagnostic only. Normal users publish through the verified MAX bot
// admin callback flow; /push strips the corresponding diagnostic controls.
async function publishMaxGroupPushInvite() {
  if (!state.adminMode) throw new Error('Публикация доступна только в диагностическом режиме администратора.');
  const selected = state.selectedMaxChat || {};
  const selectedId = selected.id || '';
  if (!selectedId) throw new Error('Не удалось определить чат. Выберите чат вручную.');
  const chatParam = 'chat' + 'Id';
  const data = await fetchJsonUnsafeAdmin('/internal/max/group-push-invite', {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ [chatParam]: selectedId, title: selected.title || '' })
  });
  setMaxDiagnosticsResult('MAX group push invite published', { ok: Boolean(data && data.ok), sent: Boolean(data && data.sent) });
  const status = $('maxInviteStatus');
  if (status) {
    status.className = 'admin-success';
    status.textContent = 'Приглашение опубликовано в чат.';
  }
}



function bindButton(id, handler) {
  const button = $(id);
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await handler(); }
    catch (error) {
      const inviteStatus = id === 'maxPublishInviteBtn' ? $('maxInviteStatus') : null;
      if (inviteStatus) { inviteStatus.className = 'admin-error'; inviteStatus.textContent = error.message || 'Не удалось выполнить действие.'; }
      appendResult(error.message || 'failed', error.data || null);
      await refreshStatus().catch(() => undefined);
    }
    finally { button.disabled = false; }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  resetSteps();
  renderStoredConnectedChats();
  applyJoinMode();
  updateStandaloneDiagnostics();
  bindButton('enableBtn', handlePrimaryButton);
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
  bindButton('maxChatsBtn', fetchMaxChats);
  bindButton('maxPublishInviteBtn', publishMaxGroupPushInvite);
  bindButton('maxMembersBtn', fetchMaxMembers);
  refreshStatus().catch((error) => appendResult(error.message || 'status_failed'));
});
