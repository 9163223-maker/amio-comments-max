'use strict';

const state = {
  registration: null,
  subscription: null,
  status: null,
  lastResult: ''
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = String(value);
}

function appendResult(message, data) {
  state.lastResult = `${new Date().toLocaleTimeString()} — ${message}`;
  setText('lastResult', state.lastResult + (data ? `\n${JSON.stringify(data, null, 2)}` : ''));
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
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.data = data;
    throw error;
  }
  return data;
}

async function refreshStatus() {
  state.status = await fetchJson('/api/push/status');
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
  setText('lastServerTest', state.status.lastTestResult ? JSON.stringify(state.status.lastTestResult, null, 2) : 'admin-only');

  if ('serviceWorker' in navigator) {
    state.registration = await navigator.serviceWorker.getRegistration('/push/');
    setText('swState', state.registration ? (state.registration.active ? 'active' : 'registered') : 'not registered');
    state.subscription = state.registration ? await state.registration.pushManager.getSubscription() : null;
    setText('subscriptionExists', state.subscription ? 'exists' : 'not exists');
  } else {
    setText('swState', 'unsupported');
    setText('subscriptionExists', 'unsupported');
  }
  return state.status;
}

async function ensureRegistration() {
  if (!('serviceWorker' in navigator)) throw new Error('service_worker_not_supported');
  state.registration = await navigator.serviceWorker.register('/push/sw.js', { scope: '/push/' });
  await navigator.serviceWorker.ready;
  return state.registration;
}

async function enableNotifications() {
  const status = await refreshStatus();
  if (!window.isSecureContext) throw new Error('secure_context_required');
  if (!('Notification' in window)) throw new Error('notifications_not_supported');
  if (!('PushManager' in window)) throw new Error('push_api_not_supported');
  if (!status.webPushConfigured || !status.publicKeyAvailable) throw new Error('web_push_not_configured');

  const registration = await ensureRegistration();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(`notification_permission_${permission}`);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey || status.webPushPublicKey || '')
    });
  }
  const token = $('subscribeToken').value.trim();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  await fetchJson('/api/push/subscribe', { method: 'POST', headers, body: JSON.stringify(subscription) });
  appendResult('subscription saved');
  await refreshStatus();
}

async function sendTest() {
  const token = $('adminToken').value.trim();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const result = await fetchJson('/api/push/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: 'Тестовое уведомление с /push', url: '/push' })
  });
  appendResult('test sent', result);
  await refreshStatus();
}

function bindButton(id, handler) {
  $(id).addEventListener('click', async () => {
    try {
      appendResult('working...');
      await handler();
    } catch (error) {
      appendResult(error.message || 'failed', error.data || null);
      await refreshStatus().catch(() => undefined);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindButton('enableBtn', enableNotifications);
  bindButton('testBtn', sendTest);
  bindButton('statusBtn', async () => {
    const status = await refreshStatus();
    appendResult('status refreshed', status);
  });
  refreshStatus().catch((error) => appendResult(error.message || 'status_failed'));
});
