;(() => {
  'use strict';
  const RUNTIME = 'PR96-PHOTO-FLOW-TIMING-DIAGNOSTICS';
  const MARKER = '__ADMINKIT_PR95_PHOTO_FLOW_EXPLICIT_UPLOAD__';
  if (window[MARKER]) return;
  window[MARKER] = true;

  function byId(id) { return document.getElementById(id); }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function now() { return Date.now(); }
  function duration(startedAt) { return Math.max(0, now() - (Number(startedAt || 0) || now())); }
  function escapeHtml(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  function escapeSelectorId(v) {
    const raw = String(v || '');
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(raw);
    return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  function state() {
    return window.__ADMINKIT_CC7_5_55_STATE__ || window.__ADMINKIT_CC7_5_53_STATE__ || window.__ADMINKIT_CC7_5_47_STATE__ || window.__ADMINKIT_CC7_5_6_STATE__ || window.__ADMINKIT_CC7_5_3_STATE__ || window.__ADMINKIT_CC7_2_STATE__ || null;
  }
  function safeStateField(name, fallback) {
    const s = state();
    return s && s[name] !== undefined ? s[name] : fallback;
  }
  function getPossibleWebApps() {
    return [window.WebApp, window.Telegram && window.Telegram.WebApp, window.Max && window.Max.WebApp, window.MAX && window.MAX.WebApp, window.maxWebApp, window.MAXWebApp, window.MiniApp, window.max && window.max.WebApp].filter(Boolean);
  }
  function bridgeUser() {
    for (const app of getPossibleWebApps()) {
      const user = (app && app.initDataUnsafe && app.initDataUnsafe.user) || (app && app.user);
      if (user) return user;
    }
    return null;
  }
  function userId() { const u = bridgeUser(); return clean((u && u.id) || safeStateField('currentUserId', '') || 'guest'); }
  function userName() {
    const u = bridgeUser();
    return clean((u && (u.first_name || u.username || u.last_name)) || safeStateField('currentUserName', '') || byId('nameInput')?.value || 'Гость');
  }
  function avatarUrl() { const u = bridgeUser(); return clean((u && u.photo_url) || safeStateField('currentUserAvatarUrl', '') || ''); }
  function commentKey() { return clean(safeStateField('commentKey', '')); }
  function replyToId() { return clean(safeStateField('replyToId', '')); }
  function setReplyToId(value) { const s = state(); if (s) s.replyToId = clean(value); }
  function setStatus(message, isError) {
    const el = byId('commentInlineStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
    el.classList.toggle('error', Boolean(isError && message));
  }
  function makeTiming(file) {
    const id = 'pt_' + now() + '_' + Math.random().toString(36).slice(2, 7);
    return {
      id,
      fileName: clean(file && file.name),
      originalSize: Number(file && file.size || 0) || 0,
