'use strict';

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: 'АдминКИТ Push', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'АдминКИТ Push';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/public/adminkit-push-icon-192.png',
    badge: payload.badge || '/public/favicon-32.png',
    tag: payload.tag || 'adminkit-push',
    data: payload.data || { url: payload.url || '/push' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/push';
  const target = new URL(targetUrl, self.location.origin).href;
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url === target && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(target);
    return undefined;
  })());
});
