'use strict';

const RUNTIME = 'ADMINKIT-CORE-MENU-RENDERER-1.41.0-HIDDEN-SECTIONS';

function safePayload(data = {}) { return JSON.stringify({ ...data }); }
function normalizeUrl(value = '') { const raw = String(value || '').trim(); if (!raw) return ''; if (/^https?:\/\//i.test(raw)) return raw; if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`; return raw; }
function btn(text, route, data = {}) { return { type: 'callback', text, payload: safePayload({ r: route, ...data }) }; }
function linkBtn(text, url, data = {}) { const normalized = normalizeUrl(url); return { type: 'link', text: String(text || 'Открыть ссылку').trim().slice(0, 80), url: normalized, meta: { source: 'adminkit-core', safeLink: /^https?:\/\//i.test(normalized), ...data } }; }
function inlineKeyboard(rows) { return [{ type: 'inline_keyboard', payload: { source: 'adminkit-core', version: 2, runtimeVersion: RUNTIME, buttons: rows } }]; }

function userLine(line = '') {
  const s = String(line || '').trim();
  if (!s) return '';
  if (/^(Flow|Step):/i.test(s)) return '';
  if (/^(Сценарий|Шаг):\s*[a-z0-9_.-]+/i.test(s)) return '';
  if (/^Проверка:\s*[a-z0-9_./-]+$/i.test(s)) return '';
  if (/\b(ak_[a-z0-9_]+|legacy adapters|legacy-хранилища|clean delivery-flow|clean-flow|read-only|debug-post|runtimeVersion)\b/i.test(s)) return '';
  if (/^(Core|Legacy|Production|Диагностика):/i.test(s)) return '';
  return s;
}
function userLines(lines = []) { return (Array.isArray(lines) ? lines : [String(lines || '')]).map(userLine).filter(Boolean); }

function renderScreen({ title, body = [], buttons = [], links = [], backRoute = '', homeRoute = 'main.home' }) {
  const lines = userLines(body);
  const rows = buttons.map((item) => [btn(item.text, item.route, item.data || {})]);
  const linkRows = (Array.isArray(links) ? links : []).map((item) => [linkBtn(item.text, item.url, item.data || {})]);
  const nav = [];
  if (backRoute) nav.push(btn('↩️ Назад', backRoute, { nav: 'back' }));
  if (homeRoute) nav.push(btn('🏠 Главное меню', homeRoute, { nav: 'home' }));
  return { text: [title, '', ...lines].filter(Boolean).join('\n'), attachments: inlineKeyboard([...rows, ...linkRows, ...(nav.length ? [nav] : [])]) };
}

function visibleSections(sections = []) { return (sections || []).filter((section) => section && section.hiddenInMain !== true && section.foldedIntoMain !== true); }

function renderMain(sections = []) {
  const rows = [];
  const visible = visibleSections(sections);
  for (let i = 0; i < visible.length; i += 2) {
    rows.push(visible.slice(i, i + 2).map((section) => {
      const title = `${section.icon || ''} ${section.title || section.id}${section.locked ? ' 🔒' : ''}`.trim();
      return btn(title, section.locked ? 'billing.locked' : (section.routes?.home || `${section.id}.home`), { sectionId: section.id, screen: 'main.home' });
    }));
  }
  return { text: ['🐋 АдминКИТ', '', 'Выберите раздел для управления каналом.'].join('\n'), attachments: inlineKeyboard(rows) };
}

function selfTest() {
  const kb = inlineKeyboard([[btn('Главное меню', 'main.home')], [linkBtn('Открыть', 'example.com')]]);
  const screen = renderScreen({ title: 'Тест', body: ['Flow: lead_magnets.create', 'Step: input', 'Проверка: max_channel_membership', 'Нормальная строка', 'Сохранено в чистую таблицу: ak_post_lead_magnets.'] });
  const main = renderMain([{ id: 'comments', title: 'Комментарии', routes: { home: 'comments.home' } }, { id: 'photo_comments', title: 'Фото в комментариях', hiddenInMain: true, routes: { home: 'photo_comments.home' } }]);
  const mainButtons = (((main.attachments || [])[0] || {}).payload || {}).buttons?.flat?.().map((b) => b.text) || [];
  return { ok: kb[0]?.payload?.version === 2 && kb[0]?.payload?.buttons?.[1]?.[0]?.type === 'link' && kb[0]?.payload?.buttons?.[1]?.[0]?.url === 'https://example.com' && !/Flow:|Step:|ak_post|1\.33|sectionRegistry/.test(screen.text + main.text) && mainButtons.length === 1 && /Комментарии/.test(mainButtons[0]), runtimeVersion: RUNTIME, payloadVersion: 2, userTextFilterReady: true, mainMenuUserFriendly: true, callbackPayloadHasRoute: true, hiddenSectionsReady: true };
}

module.exports = { RUNTIME, btn, linkBtn, inlineKeyboard, renderScreen, renderMain, visibleSections, selfTest, userLine, userLines };
