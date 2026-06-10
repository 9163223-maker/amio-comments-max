'use strict';

function safeText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function safeRelativeUrl(value) {
  const raw = String(value || '').trim() || '/push';
  try {
    const parsed = new URL(raw, self.location.origin);
    if (parsed.origin !== self.location.origin) return '/push';
    return `${parsed.pathname || '/push'}${parsed.search || ''}${parsed.hash || ''}`;
  } catch (error) {
    return '/push';
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    try {
      payload = { title: 'АдминКИТ PUSH', body: event.data ? event.data.text() : '' };
    } catch (_) {
      payload = { title: 'АдминКИТ PUSH', body: '' };
    }
  }
  if (!payload || typeof payload !== 'object') payload = {};

  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const title = safeText(payload.title, 'АдминКИТ PUSH');
  const options = {
    body: safeText(payload.body, ''),
    icon: payload.icon || '/public/adminkit-push-icon-192.png',
    badge: payload.badge || '/public/favicon-32.png',
    tag: payload.tag || 'adminkit-push',
    data: { ...data, url: safeRelativeUrl(data.url || payload.url || '/push') },
    timestamp: Number(payload.timestamp) || Date.now()
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = safeRelativeUrl(data.url || '/push');
  const target = new URL(targetUrl, self.location.origin).href;
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      try {
        const current = new URL(client.url);
        if (current.origin === self.location.origin && current.pathname === new URL(target).pathname && 'focus' in client) return client.focus();
      } catch (_) {}
    }
    if (clients.openWindow) return clients.openWindow(target);
    return undefined;
  })());
});
