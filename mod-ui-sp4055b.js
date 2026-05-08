'use strict';
const Module = require('module');
const state = global.__AK_MOD_UI_4055B__ = { loaded: true, fixed: 0, last: null };
function parsePayload(v) { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; } }
function maybePostPayload(v) {
  const p = parsePayload(v);
  const ck = String(p.commentKey || p.comment_key || '');
  if (!p.channelId && ck.includes(':')) p.channelId = ck.split(':')[0];
  if (!p.postId && ck.includes(':')) p.postId = ck.split(':').slice(1).join(':');
  if (p.channelId || p.postId || p.commentKey) state.last = { channelId: p.channelId || '', postId: p.postId || '', commentKey: p.commentKey || ck };
  return p;
}
function fixText(s) {
  if (!s) return s;
  let out = String(s);
  if (/Модерация|🛡️/.test(out) && /Пост:\s*(?!не выбран)(?!global)(?!sp30-global)\S+/i.test(out)) {
    out = out.replace(/Область:\s*правила\s+всего\s+канала/gi, 'Область: правила этого поста');
    out = out.replace(/Область:\s*правила\s+канала/gi, 'Область: правила этого поста');
    if (!/Область:/i.test(out)) out = out.replace(/(Пост:[^\n]*\n)/i, '$1Область: правила этого поста\n');
  }
  if (out !== s) state.fixed++;
  return out;
}
function fixButton(b) {
  if (!b || typeof b !== 'object') return b;
  if (Array.isArray(b)) { b.forEach(fixButton); return b; }
  if (b.payload || b.data) maybePostPayload(b.payload || b.data);
  const txt = String(b.text || b.label || '');
  if (/Правила\s+всего\s+канала/i.test(txt)) {
    b.text = txt.replace(/Правила\s+всего\s+канала/i, 'Правила этого поста');
    state.fixed++;
  }
  if (/Стоп[-\s]?слово/i.test(txt) && /\+|➕|добав/i.test(txt)) {
    const p = maybePostPayload(b.payload || b.data || {});
    const last = state.last || {};
    p.action = 'ak_mod_post_stop_add';
    p.channelId = p.channelId || last.channelId || '';
    p.postId = p.postId || last.postId || '';
    p.commentKey = p.commentKey || last.commentKey || (p.channelId && p.postId ? p.channelId + ':' + p.postId : '');
    b.payload = JSON.stringify(p);
    state.fixed++;
  }
  Object.keys(b).forEach(k => fixButton(b[k]));
  return b;
}
function patchApi(api) {
  if (!api || api.__AK_MOD_UI_4055B__) return api;
  ['sendMessage', 'editMessage'].forEach(name => {
    const old = api[name];
    if (typeof old !== 'function') return;
    api[name] = function(args) {
      args = args || {};
      try {
        if (args.text) args.text = fixText(args.text);
        if (args.body) args.body = fixText(args.body);
        if (args.attachments) args.attachments = fixButton(args.attachments);
      } catch (e) { state.error = e.message || String(e); }
      return old.call(this, args);
    };
  });
  Object.defineProperty(api, '__AK_MOD_UI_4055B__', { value: true });
  return api;
}
const oldLoad = Module._load;
Module._load = function(req, parent, isMain) {
  const loaded = oldLoad.apply(this, arguments);
  try { if (String(req).includes('services/maxApi')) return patchApi(loaded); } catch (e) { state.error = e.message || String(e); }
  return loaded;
};
console.log('[SP40.5.5b mod-ui] loaded');
