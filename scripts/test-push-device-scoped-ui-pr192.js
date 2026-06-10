'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'public/push-client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/push.html'), 'utf8');
const connected = fs.readFileSync(path.join(root, 'services/pushConnectedChatsService.js'), 'utf8');
const confirmation = fs.readFileSync(path.join(root, 'services/pushConfirmationService.js'), 'utf8');

assert(client.includes("title.textContent = 'Подключены на этом устройстве:'"));
assert(html.includes('На этом устройстве пока нет подключённых чатов.'));
assert(html.includes('Откройте ссылку подключения из нужного MAX-чата.'));
assert(client.includes("button.textContent = '×'"));
assert(client.includes("button.title = 'Отключить'"));
assert(client.includes('Отключить уведомления от чата'));
assert(client.includes("fetchJson('/api/push/unpair'"));
assert(!client.includes('knownForUser'));
assert(!client.includes('Другие доступные чаты'));
assert(!client.includes('чаты на другом устройстве'));
assert(!connected.includes('knownForUser'));
assert(!confirmation.includes('knownForUser'));
assert(!client.includes('name.textContent = chat.chatId'));
assert(!client.includes('textContent = chat.chatId'));
assert(connected.includes('listChatBindingsSnapshotForDevice'));

console.log('PR192 device-scoped PWA UI: OK');
