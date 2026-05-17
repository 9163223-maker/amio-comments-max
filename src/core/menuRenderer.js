'use strict';

const RUNTIME = 'ADMINKIT-CORE-MENU-RENDERER-1.31-LINK-UX';

function safePayload(data = {}) {
  return JSON.stringify({ ...data });
}

function normalizeUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

function btn(text, route, data = {}) {
  return { type: 'callback', text, payload: safePayload({ r: route, ...data }) };
}

function linkBtn(text, url, data = {}) {
  const normalized = normalizeUrl(url);
  return { type: 'link', text: String(text || 'Открыть ссылку').trim().slice(0, 80), url: normalized, meta: { source: 'adminkit-core', safeLink: /^https?:\/\//i.test(normalized), ...data } };
}

function inlineKeyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { source: 'adminkit-core', version: 2, runtimeVersion: RUNTIME, buttons: rows } }];
}

function renderScreen({ title, body = [], buttons = [], links = [], backRoute = '', homeRoute = 'main.home' }) {
  const lines = Array.isArray(body) ? body : [String(body || '')];
  const rows = buttons.map((item) => [btn(item.text, item.route, item.data || {})]);
  const linkRows = (Array.isArray(links) ? links : []).map((item) => [linkBtn(item.text, item.url, item.data || {})]);
  const nav = [];
  if (backRoute) nav.push(btn('↩️ Назад', backRoute, { nav: 'back' }));
  if (homeRoute) nav.push(btn('🏠 Главное меню', homeRoute, { nav: 'home' }));
  return { text: [title, '', ...lines.filter(Boolean)].join('\n'), attachments: inlineKeyboard([...rows, ...linkRows, ...(nav.length ? [nav] : [])]) };
}

function renderMain(sections = []) {
  const rows = [];
  for (let i = 0; i < sections.length; i += 2) {
    rows.push(sections.slice(i, i + 2).map((section) => {
      const title = `${section.icon || ''} ${section.title || section.id}${section.locked ? ' 🔒' : ''}`.trim();
      return btn(title, section.locked ? 'billing.locked' : (section.routes?.home || `${section.id}.home`), { sectionId: section.id, screen: 'main.home' });
    }));
  }
  return {
    text: ['🐋 АдминКИТ Core', '', 'Главное меню собрано из sectionRegistry.', 'Режим 1.31: один активный экран, защита от дублей и аккуратные ссылки.'].join('\n'),
    attachments: inlineKeyboard(rows)
  };
}

function selfTest() {
  const kb = inlineKeyboard([[btn('Главное меню', 'main.home')], [linkBtn('Открыть', 'example.com')]]);
  return {
    ok: kb[0]?.payload?.version === 2 && kb[0]?.payload?.buttons?.[1]?.[0]?.type === 'link' && kb[0]?.payload?.buttons?.[1]?.[0]?.url === 'https://example.com',
    runtimeVersion: RUNTIME,
    payloadVersion: 2,
    linkUxReady: true,
    callbackPayloadHasRoute: true
  };
}

module.exports = { RUNTIME, btn, linkBtn, inlineKeyboard, renderScreen, renderMain, selfTest };
