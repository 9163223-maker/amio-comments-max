'use strict';

const defaults = () => ({ enabled: true, applyPresetCommon: true, blockLinks: false, blockInvites: true, customBlocklist: [], aiEnabled: false });
const clean = (v) => String(v || '').replace(/^post:/i, '').replace(/^ck:/i, '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();
const fp = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 96);

function getRoot(mod) {
  return (mod && typeof mod === 'object' && mod.store && typeof mod.store === 'object') ? mod.store : null;
}
function firstChannel(mod, id = '') {
  const list = mod.getChannelsList?.() || [];
  const wanted = String(id || '').trim();
  return list.find((c) => String(c.channelId || '') === wanted) || list[0] || {};
}
function getPost(mod, key) {
  try { return mod.getPost?.(clean(key)) || null; } catch { return null; }
}
function getPostTitle(mod, sc) {
  const p = sc && sc.commentKey ? getPost(mod, sc.commentKey) : null;
  return String(p?.originalText || p?.text || p?.caption || p?.postId || '').trim();
}
function postScope(mod, commentKey = '', next = {}) {
  const key = clean(commentKey || next.commentKey || next.key || '');
  const channelId = String(next.channelId || getPost(mod, key)?.channelId || (key.includes(':') ? key.split(':')[0] : firstChannel(mod).channelId || '')).trim();
  return { scope: 'post', channelId, commentKey: key };
}
function channelScope(mod, channelId = '') {
  return { scope: 'channel', channelId: String(channelId || firstChannel(mod).channelId || '').trim(), commentKey: '' };
}
function keys(sc, postTitle = '') {
  const channelKey = `cc46:mod:channel:${sc.channelId || 'global'}`;
  const out = { own: channelKey, legacyOwn: `cc43:mod:channel:${sc.channelId || 'global'}`, channel: channelKey, legacyChannel: `cc43:mod:channel:${sc.channelId || 'global'}`, aliases: [] };
  if (sc.scope === 'post' && sc.commentKey) {
    out.own = `cc46:mod:post:${sc.commentKey}`;
    out.legacyOwn = `cc43:mod:post:${sc.commentKey}`;
    const tail = clean(sc.commentKey).split(':').pop();
    if (tail) out.aliases.push(`cc46:mod:postId:${sc.channelId || 'global'}:${tail}`);
    const f = fp(postTitle);
    if (f) out.aliases.push(`cc46:mod:postTitle:${sc.channelId || 'global'}:${f}`);
  }
  return out;
}
function stateRules(mod, key) {
  try {
    const v = mod.getSetupState?.(key);
    if (v?.rules && typeof v.rules === 'object') return v.rules;
    if (v?.moderationRules && typeof v.moderationRules === 'object') return v.moderationRules;
  } catch {}
  return null;
}
function rootRules(mod, sc) {
  const root = getRoot(mod);
  if (!root) return null;
  root.moderation = root.moderation || {};
  if (sc.scope === 'post') {
    const byPost = root.moderation.byPost || root.moderation.byPostRules || {};
    return byPost[sc.commentKey] || null;
  }
  const byChannel = root.moderation.byChannel || {};
  return byChannel[sc.channelId] || null;
}
function normalizeRules(sc, value) {
  return { ...defaults(), ...(value || {}), scope: sc.scope, channelId: sc.channelId || '', commentKey: sc.commentKey || '' };
}
function isNonDefault(r) {
  if (!r || typeof r !== 'object') return false;
  return r.enabled === false || r.applyPresetCommon === false || r.blockLinks === true || r.blockInvites === false || (Array.isArray(r.customBlocklist) && r.customBlocklist.length > 0) || r.aiEnabled === true;
}
function readRules(mod, sc) {
  let out = defaults();
  const title = getPostTitle(mod, sc);
  const k = keys(sc, title);
  const channelRules = stateRules(mod, k.channel) || stateRules(mod, k.legacyChannel) || rootRules(mod, { scope: 'channel', channelId: sc.channelId, commentKey: '' });
  if (channelRules && typeof channelRules === 'object') out = { ...out, ...channelRules };
  let own = stateRules(mod, k.own) || stateRules(mod, k.legacyOwn) || rootRules(mod, sc);
  if (!own && sc.scope === 'post') {
    for (const aliasKey of k.aliases || []) {
      own = stateRules(mod, aliasKey);
      if (own) break;
    }
  }
  if (!own && sc.scope === 'post') {
    // Safety migration for current broken CC4.7/CC4.8 state: if the last saved post rules
    // are for this channel but the post was re-forwarded and got a new commentKey, copy them once.
    try {
      const last = mod.getSetupState?.('cc46:lastRulesWrite');
      const r = last?.rules;
      const sameChannel = String(last?.scope?.channelId || r?.channelId || '') === String(sc.channelId || '');
      if (sameChannel && String(last?.scope?.scope || r?.scope || '') === 'post' && isNonDefault(r)) {
        own = { ...r, migratedFromCommentKey: String(last?.scope?.commentKey || r.commentKey || '') };
        writeRules(mod, sc, own);
      }
    } catch {}
  }
  if (own && typeof own === 'object') out = { ...out, ...own };
  return normalizeRules(sc, out);
}
function writeState(mod, key, rules) {
  try { mod.setSetupState?.(key, { rules, moderationRules: rules, updatedAt: Date.now() }); } catch {}
}
function writeRoot(mod, sc, rules) {
  const root = getRoot(mod);
  if (!root) return;
  root.moderation = root.moderation || { byChannel: {}, byPost: {}, logs: [] };
  root.moderation.byChannel = root.moderation.byChannel || {};
  root.moderation.byPost = root.moderation.byPost || {};
  if (sc.scope === 'post') root.moderation.byPost[sc.commentKey] = rules;
  else root.moderation.byChannel[sc.channelId || 'global'] = rules;
}
function writeRules(mod, sc, next = {}) {
  const title = getPostTitle(mod, sc) || String(next.postTitle || '');
  const rules = normalizeRules(sc, { ...readRulesNoMigrate(mod, sc), ...next, postTitle: title || next.postTitle || '', updatedAt: Date.now() });
  const k = keys(sc, title);
  writeState(mod, k.own, rules);
  writeState(mod, k.legacyOwn, rules);
  for (const aliasKey of k.aliases || []) writeState(mod, aliasKey, rules);
  writeRoot(mod, sc, rules);
  try {
    const root = getRoot(mod);
    if (root) {
      root.moderation = root.moderation || { byChannel: {}, byPost: {}, logs: [] };
      root.moderation.logs = Array.isArray(root.moderation.logs) ? root.moderation.logs : [];
      root.moderation.logs.push({ at: Date.now(), type: 'cc49_rules_saved', scope: sc.scope, channelId: sc.channelId, commentKey: sc.commentKey, postTitle: title, enabled: rules.enabled, customBlocklist: rules.customBlocklist });
      root.moderation.logs = root.moderation.logs.slice(-500);
    }
    mod.setSetupState?.('cc46:lastRulesWrite', { rules, scope: sc, postTitle: title, updatedAt: Date.now() });
  } catch {}
  return rules;
}
function readRulesNoMigrate(mod, sc) {
  let out = defaults();
  const title = getPostTitle(mod, sc);
  const k = keys(sc, title);
  const channelRules = stateRules(mod, k.channel) || stateRules(mod, k.legacyChannel) || rootRules(mod, { scope: 'channel', channelId: sc.channelId, commentKey: '' });
  if (channelRules && typeof channelRules === 'object') out = { ...out, ...channelRules };
  let own = stateRules(mod, k.own) || stateRules(mod, k.legacyOwn) || rootRules(mod, sc);
  if (!own && sc.scope === 'post') for (const aliasKey of k.aliases || []) { own = stateRules(mod, aliasKey); if (own) break; }
  if (own && typeof own === 'object') out = { ...out, ...own };
  return normalizeRules(sc, out);
}
function inferChannels(mod, original) {
  const map = new Map();
  for (const c of Array.isArray(original) ? original : []) if (c?.channelId) map.set(String(c.channelId), c);
  try {
    for (const p of mod.getPostsList?.() || []) if (p?.channelId && !map.has(String(p.channelId))) map.set(String(p.channelId), { channelId: String(p.channelId), title: String(p.channelTitle || p.channelName || p.title || p.channelId) });
  } catch {}
  try {
    const last = mod.getSetupState?.('cc46:lastRulesWrite');
    const id = String(last?.scope?.channelId || last?.rules?.channelId || '');
    if (id && !map.has(id)) map.set(id, { channelId: id, title: id, inferred: true });
  } catch {}
  return [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function patchStore(mod) {
  if (!mod || typeof mod !== 'object') return mod;
  const originalGetChannelsList = typeof mod.getChannelsList === 'function' ? mod.getChannelsList.bind(mod) : null;
  mod.getChannelsList = () => inferChannels(mod, originalGetChannelsList ? originalGetChannelsList() : []);
  mod.getModerationSettings = (channelId = '') => readRules(mod, channelScope(mod, channelId));
  mod.saveModerationSettings = (channelId = '', next = {}) => writeRules(mod, channelScope(mod, channelId), next);
  mod.getPostModerationSettings = (commentKey = '') => readRules(mod, postScope(mod, commentKey));
  mod.savePostModerationSettings = (commentKey = '', next = {}) => writeRules(mod, postScope(mod, commentKey, next), next);
  mod.listModerationScopeOptions = (channelId = '', limit = 20) => {
    let posts = [];
    try { posts = mod.listPostsByChannel?.(channelId, Math.max(1, Math.min(Number(limit || 20), 100))) || []; } catch {}
    if (!posts.length) {
      try { posts = (mod.getPostsList?.() || []).filter((p) => !channelId || String(p.channelId || '') === String(channelId)).slice(0, Number(limit || 20)); } catch {}
    }
    posts = posts.map((p) => ({ ...p, commentKey: clean(p.commentKey || (p.channelId && p.postId ? `${p.channelId}:${p.postId}` : '')), title: String(p.originalText || p.text || p.caption || p.postId || p.messageId || 'Пост').trim() }));
    return { channels: mod.getChannelsList?.() || [], posts };
  };
  mod.__cc46HardRules = { readRules: (sc) => readRules(mod, sc), writeRules: (sc, next) => writeRules(mod, sc, next), keys };
  mod.__cc43Store = false;
  mod.__cc46Store = true;
  mod.__cc49Store = true;
  return mod;
}
module.exports = { patchStore, clean, defaults, readRules, writeRules, keys };
