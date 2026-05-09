'use strict';

const defaults = () => ({ enabled: true, applyPresetCommon: true, blockLinks: false, blockInvites: true, customBlocklist: [], aiEnabled: false });
const clean = (v) => String(v || '').replace(/^post:/i, '').replace(/^ck:/i, '').replace(/^:+/, '').replace(/^['\"]+|['\"]+$/g, '').trim();

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
function postScope(mod, commentKey = '', next = {}) {
  const key = clean(commentKey || next.commentKey || next.key || '');
  const channelId = String(next.channelId || getPost(mod, key)?.channelId || (key.includes(':') ? key.split(':')[0] : firstChannel(mod).channelId || '')).trim();
  return { scope: 'post', channelId, commentKey: key };
}
function channelScope(mod, channelId = '') {
  return { scope: 'channel', channelId: String(channelId || firstChannel(mod).channelId || '').trim(), commentKey: '' };
}
function keys(sc) {
  const channelKey = `cc46:mod:channel:${sc.channelId || 'global'}`;
  if (sc.scope === 'post' && sc.commentKey) {
    return {
      own: `cc46:mod:post:${sc.commentKey}`,
      legacyOwn: `cc43:mod:post:${sc.commentKey}`,
      channel: channelKey,
      legacyChannel: `cc43:mod:channel:${sc.channelId || 'global'}`
    };
  }
  return { own: channelKey, legacyOwn: `cc43:mod:channel:${sc.channelId || 'global'}`, channel: channelKey, legacyChannel: `cc43:mod:channel:${sc.channelId || 'global'}` };
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
function readRules(mod, sc) {
  let out = defaults();
  const k = keys(sc);
  const channelRules = stateRules(mod, k.channel) || stateRules(mod, k.legacyChannel) || rootRules(mod, { scope: 'channel', channelId: sc.channelId, commentKey: '' });
  if (channelRules && typeof channelRules === 'object') out = { ...out, ...channelRules };
  if (sc.scope === 'post') {
    const own = stateRules(mod, k.own) || stateRules(mod, k.legacyOwn) || rootRules(mod, sc);
    if (own && typeof own === 'object') out = { ...out, ...own };
  } else {
    const own = stateRules(mod, k.own) || stateRules(mod, k.legacyOwn) || rootRules(mod, sc);
    if (own && typeof own === 'object') out = { ...out, ...own };
  }
  return normalizeRules(sc, out);
}
function writeState(mod, key, rules) {
  try { mod.setSetupState?.(key, { rules, moderationRules: rules, updatedAt: Date.now() }); } catch {}
}
function writeRoot(mod, sc, rules) {
  const root = getRoot(mod);
  if (!root) return;
  root.moderation = root.moderation || { byChannel: {}, logs: [] };
  root.moderation.byChannel = root.moderation.byChannel || {};
  root.moderation.byPost = root.moderation.byPost || {};
  if (sc.scope === 'post') root.moderation.byPost[sc.commentKey] = rules;
  else root.moderation.byChannel[sc.channelId || 'global'] = rules;
}
function writeRules(mod, sc, next = {}) {
  const rules = normalizeRules(sc, { ...readRules(mod, sc), ...next, updatedAt: Date.now() });
  const k = keys(sc);
  writeState(mod, k.own, rules);
  writeState(mod, k.legacyOwn, rules);
  writeRoot(mod, sc, rules);
  try {
    const root = getRoot(mod);
    if (root && Array.isArray(root.moderation?.logs)) {
      root.moderation.logs.push({ at: Date.now(), type: 'cc46_rules_saved', scope: sc.scope, channelId: sc.channelId, commentKey: sc.commentKey, enabled: rules.enabled, customBlocklist: rules.customBlocklist });
      root.moderation.logs = root.moderation.logs.slice(-500);
      mod.setSetupState?.('cc46:lastRulesWrite', { rules, scope: sc, updatedAt: Date.now() });
    }
  } catch {}
  return rules;
}
function patchStore(mod) {
  if (!mod || typeof mod !== 'object') return mod;
  // hard override every time: old wrappers set flags, but we must own moderation reads/writes now
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
  return mod;
}
module.exports = { patchStore, clean, defaults, readRules, writeRules, keys };
