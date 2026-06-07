'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }

(async () => {
  delete process.env.ADMINKIT_PUSH_PRIVATE_PREVIEWS;
  const payloads = fresh('../services/pushNotificationPayloadService');

  const group = payloads.buildGroupMessagePayload({ source: 'max_group', chatId: 'chat-1', chatTitle: 'Все свои MAX', senderName: 'Александр', messageText: '  Проверяем <b>подключение</b> уведомлений и длинный текст '.repeat(6), messageId: 'm1', timestamp: 1234567890 });
  assert.strictEqual(group.title, 'Все свои MAX', 'group notification title is chatTitle');
  assert(group.body.startsWith('Александр: Проверяем подключение уведомлений'), 'group body contains sender + preview');
  assert(group.body.length <= 160, 'long group preview is limited');
  assert.strictEqual(group.icon, '/public/adminkit-push-icon-192.png', 'group icon uses AdminKIT Push PNG');
  assert.strictEqual(group.badge, '/public/favicon-32.png', 'group badge uses favicon PNG');
  assert(group.tag.includes('adminkit:chat:chat-1:m1'), 'group tag is message-specific');
  assert.strictEqual(group.data.source, 'max_group', 'group data source is distinct');
  assert.strictEqual(group.data.url, '/push?chatId=chat-1', 'group data.url opens chat in PWA');

  const missingSender = payloads.buildGroupMessagePayload({ source: 'max_group', chatId: 'chat-2', chatTitle: 'Чат', messageText: 'Текст без отправителя', messageId: 'm2' });
  assert(missingSender.body.startsWith('Новое сообщение: Текст без отправителя'), 'missing sender uses Новое сообщение prefix');
  const photo = payloads.buildGroupMessagePayload({ chatId: 'chat-photo', chatTitle: 'Фото чат', attachments: [{ type: 'image' }], messageId: 'photo-1' });
  assert(photo.body.includes('Фото'), 'empty group text with photo creates media preview');

  const channel = payloads.buildChannelPostPayload({ source: 'max_channel', chatId: 'channel-chat', channelId: 'channel-1', channelTitle: 'Olga.style', postText: 'Почему красивые вещи не складываются в образ', postId: 'p1', timestamp: 2345678901 });
  assert.strictEqual(channel.title, 'Olga.style', 'channel notification title is channelTitle');
  assert(channel.body.startsWith('Новый пост: Почему красивые вещи'), 'channel body starts with Новый пост');
  assert(channel.tag.includes('adminkit:post:channel-chat:p1'), 'channel tag is post-specific');
  assert.strictEqual(channel.data.source, 'max_channel', 'channel data source is distinct');
  assert.strictEqual(channel.data.url, '/push?chatId=channel-chat', 'channel data.url opens channel chat');
  const channelMedia = payloads.buildChannelPostPayload({ channelId: 'channel-media', channelTitle: 'Канал', attachments: [{ mimeType: 'video/mp4' }] });
  assert.strictEqual(channelMedia.body, 'Новый пост: Видео', 'empty channel post with media creates safe media preview');

  const admin = payloads.buildAdminPayload({ body: 'Уведомления подключены для чата «Все свои MAX»', url: '/push?chatId=chat-1' });
  assert.strictEqual(admin.title, 'АдминКИТ Push', 'admin notification title defaults to АдминКИТ Push');
  assert.strictEqual(admin.data.source, 'admin', 'admin source is distinct');
  assert.strictEqual(admin.data.url, '/push?chatId=chat-1', 'admin url is preserved when safe');
  assert.strictEqual(payloads.buildAdminPayload({ title: 'X', body: 'Y', url: 'https://evil.example/path?x=1' }).data.url, '/path?x=1', 'absolute URLs are reduced to safe relative URLs');

  process.env.ADMINKIT_PUSH_PRIVATE_PREVIEWS = '1';
  const privatePayloads = fresh('../services/pushNotificationPayloadService');
  const privateGroup = privatePayloads.buildGroupMessagePayload({ chatId: 'private-chat', chatTitle: 'Личный чат', senderName: 'Секрет', messageText: 'Секретный текст' });
  assert.strictEqual(privateGroup.title, 'Личный чат', 'private mode keeps group title');
  assert.strictEqual(privateGroup.body, 'Новое сообщение', 'private mode hides sender and message text');
  const privateChannel = privatePayloads.buildChannelPostPayload({ channelId: 'private-channel', channelTitle: 'Канал', postText: 'Секретный пост' });
  assert.strictEqual(privateChannel.title, 'Канал', 'private mode keeps channel title');
  assert.strictEqual(privateChannel.body, 'Новый пост', 'private mode hides channel post text');
  delete process.env.ADMINKIT_PUSH_PRIVATE_PREVIEWS;

  const sw = fs.readFileSync(path.join(repoRoot, 'public', 'push-sw.js'), 'utf8');
  assert(sw.includes("event.data ? event.data.json() : {}") && sw.includes('catch (error)'), 'service worker catches malformed push payloads');
  assert(sw.includes("icon: payload.icon || '/public/adminkit-push-icon-192.png'"), 'service worker keeps AdminKIT icon default');
  assert(sw.includes("badge: payload.badge || '/public/favicon-32.png'"), 'service worker keeps badge default');
  assert(sw.includes('safeRelativeUrl(data.url || payload.url || \'/push\')'), 'service worker uses data.url and falls back to /push');
  assert(sw.includes('clients.matchAll') && sw.includes('clients.openWindow'), 'notificationclick opens/focuses the PWA');
  assert(!sw.includes('endpoint') && !sw.includes('p256dh') && !sw.includes('auth:'), 'service worker does not expose raw subscription keys');

  console.log('telegram style push payloads pr158 ok');
})().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
