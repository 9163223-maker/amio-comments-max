'use strict';

const db = require('./cc5-db-core');
const config = require('./config');
const { getMessage, editMessage, buildCommentsKeyboard } = require('./services/maxApi');

const RUNTIME = 'DB-V3-STATE-1.0';
const CHANNEL_TITLES = { '-73175958664622': 'АдминКИТ клуб' };
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const cut = (v, n = 80) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isTech = (v) => /^-?\d{8,}$/.test(clean(v)) || /^[a-f0-9]{16,}$/i.test(clean(v));
const isHuman = (v) => !!clean(v) && !isTech(v) && !/^(пост|канал|подключённый канал|не выбран)$/i.test(clean(v));
const bool = (v, def = true) => v === undefined || v === null ? def : !!v;
function channelTitle(id, title = '') { return isHuman(title) ? cut(title) : (CHANNEL_TITLES[clean(id)] || 'Подключённый канал'); }
function postTitle(p = {}) { const t = clean(p.title || p.raw?.title || p.raw?.originalText || p.raw?.text || ''); if (isHuman(t) && !/админкит|главное меню|выберите|статус:/i.test(t)) return cut(t, 38); return p.postId ? 'Пост' : 'Пост не выбран'; }

async function ensure() {
  await db.init();
  await db.query(`
    create table if not exists ak_post_settings (
      admin_id text not null,
      channel_id text not null,
      post_id text not null,
      comment_key text not null,
      title text,
      comments_enabled boolean not null default true,
      comments_photo boolean not null default true,
      comments_reactions boolean not null default true,
      comments_banner boolean not null default true,
      comments_banner_text text not null default '',
      comments_banner_button text not null default '',
      comments_banner_link text not null default '',
      gifts_enabled boolean not null default false,
      gift_title text not null default '',
      gift_link text not null default '',
      gift_message text not null default '',
      gifts_require_subscription boolean not null default true,
      buttons_enabled boolean not null default false,
      cta_button_text text not null default '',
      cta_button_link text not null default '',
      updated_at timestamptz default now(),
      primary key(admin_id, comment_key)
    );
    create index if not exists idx_ak_post_settings_comment_key on ak_post_settings(comment_key);
  `);
}

async function getFlow(adminId) { await ensure(); return (await db.getFlow(adminId)) || {}; }
async function setFlow(adminId, patch) { await ensure(); const old = await getFlow(adminId); const menuV3 = { ...(old.menuV3 || {}), ...patch, updatedAt: Date.now() }; await db.setFlow(adminId, { ...old, menuV3 }); return menuV3; }
async function getMenu(adminId) { await ensure(); return db.getMenu(adminId); }
async function setMenu(adminId, messageId) { await ensure(); return db.setMenu(adminId, messageId); }
async function listChannels(adminId) { await ensure(); const rows = await db.getChannels(adminId); return rows.map((c) => ({ ...c, title: channelTitle(c.channelId, c.title) })); }
async function activeChannel(adminId) { const flow = await getFlow(adminId); const s = flow.menuV3 || {}; const channels = await listChannels(adminId); const found = channels.find((c) => String(c.channelId) === String(s.activeChannelId)) || channels[0] || null; if (!found) return { channelId: '', title: 'Канал не выбран' }; return { channelId: found.channelId, title: channelTitle(found.channelId, found.title || s.activeChannelTitle) }; }

async function listPosts(adminId, channelId, limit = 30) {
  await ensure();
  if (!adminId || !channelId) return [];
  const { rows } = await db.query(`
    with ranked as (
      select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.raw, p.updated_at as "updatedAt", s.comments_enabled as "commentsEnabled", row_number() over (partition by lower(coalesce(nullif(p.title,''), p.post_id)) order by p.updated_at desc) as rn
      from ak_posts p left join ak_post_settings s on s.admin_id=p.admin_id and s.comment_key=p.comment_key
      where p.admin_id=$1 and p.channel_id=$2
    ) select * from ranked where rn=1 order by "updatedAt" desc limit $3
  `, [adminId, channelId, Math.max(1, Math.min(Number(limit || 30), 100))]);
  return rows.filter((p) => !/админкит|главное меню|выберите|статус:/i.test(clean(p.title))).map((p) => ({ ...p, title: postTitle(p), commentsEnabled: bool(p.commentsEnabled, true) }));
}

async function getPostByCommentKey(adminId, commentKey) {
  await ensure();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey", p.title, p.raw,
      s.comments_enabled as "commentsEnabled", s.comments_photo as "commentsPhoto", s.comments_reactions as "commentsReactions", s.comments_banner as "commentsBanner", s.comments_banner_text as "commentsBannerText", s.comments_banner_button as "commentsBannerButton", s.comments_banner_link as "commentsBannerLink",
      s.gifts_enabled as "giftsEnabled", s.gift_title as "giftTitle", s.gift_link as "giftLink", s.gift_message as "giftMessage", s.gifts_require_subscription as "giftsRequireSubscription", s.buttons_enabled as "buttonsEnabled", s.cta_button_text as "ctaButtonText", s.cta_button_link as "ctaButtonLink"
    from ak_posts p left join ak_post_settings s on s.admin_id=p.admin_id and s.comment_key=p.comment_key
    where p.admin_id=$1 and p.comment_key=$2 order by p.updated_at desc limit 1
  `, [adminId, commentKey]);
  return rows[0] || null;
}
async function ensurePostSettings(adminId, post) { await ensure(); if (!adminId || !post?.commentKey || !post?.channelId || !post?.postId) return null; await db.query(`insert into ak_post_settings(admin_id, channel_id, post_id, comment_key, title, updated_at) values($1,$2,$3,$4,$5,now()) on conflict(admin_id, comment_key) do update set channel_id=excluded.channel_id, post_id=excluded.post_id, title=coalesce(nullif(excluded.title,''), ak_post_settings.title), updated_at=now()`, [adminId, post.channelId, post.postId, post.commentKey, post.title || postTitle(post)]); return getPostByCommentKey(adminId, post.commentKey); }
async function savePostSetting(adminId, post, patch = {}) {
  const row = await ensurePostSettings(adminId, post);
  if (!row) return null;
  const allowed = { commentsEnabled:'comments_enabled', commentsPhoto:'comments_photo', commentsReactions:'comments_reactions', commentsBanner:'comments_banner', commentsBannerText:'comments_banner_text', commentsBannerButton:'comments_banner_button', commentsBannerLink:'comments_banner_link', giftsEnabled:'gifts_enabled', giftTitle:'gift_title', giftLink:'gift_link', giftMessage:'gift_message', giftsRequireSubscription:'gifts_require_subscription', buttonsEnabled:'buttons_enabled', ctaButtonText:'cta_button_text', ctaButtonLink:'cta_button_link' };
  const sets = []; const params = [adminId, row.commentKey];
  Object.entries(patch).forEach(([k, v]) => { if (!allowed[k]) return; params.push(v); sets.push(`${allowed[k]}=$${params.length}`); });
  if (!sets.length) return row;
  await db.query(`update ak_post_settings set ${sets.join(', ')}, updated_at=now() where admin_id=$1 and comment_key=$2`, params);
  return getPostByCommentKey(adminId, row.commentKey);
}

function isCommentButton(button = {}) { const text = clean(button.text || '').toLowerCase(); const payload = JSON.stringify(button.payload || button.data || ''); return text.includes('комментар') || payload.includes('comments') || payload.includes('commentKey'); }
function withoutCommentButtons(attachments = []) { return (Array.isArray(attachments) ? attachments : []).map((item) => { if (item?.type !== 'inline_keyboard') return item; const payload = item.payload && typeof item.payload === 'object' ? JSON.parse(JSON.stringify(item.payload)) : {}; const rows = Array.isArray(payload.buttons) ? payload.buttons : []; const nextRows = rows.map((row) => (Array.isArray(row) ? row : []).filter((b) => !isCommentButton(b))).filter((row) => row.length); if (!nextRows.length) return null; return { ...item, payload: { ...payload, buttons: nextRows } }; }).filter(Boolean); }
async function patchCommentsButton(adminId, commentKey) {
  await ensure();
  const post = await getPostByCommentKey(adminId, commentKey);
  if (!post) return { ok: false, reason: 'post_not_found' };
  if (!config.botToken) return { ok: false, reason: 'bot_token_missing' };
  if (!post.messageId) return { ok: false, reason: 'message_id_missing' };
  const live = await getMessage({ botToken: config.botToken, messageId: post.messageId });
  const body = live?.body && typeof live.body === 'object' ? live.body : {};
  const baseAttachments = withoutCommentButtons(Array.isArray(body.attachments) ? body.attachments : []);
  const rows = bool(post.commentsEnabled, true) ? buildCommentsKeyboard({ appBaseUrl: config.appBaseUrl, botUsername: config.botUsername, maxDeepLinkBase: config.maxDeepLinkBase, handoffToken: '', postId: post.postId, channelId: post.channelId, commentKey: post.commentKey, count: 0, extraRows: [], buttonSuffix: '', showPrimaryButton: true }) : [];
  const payload = { botToken: config.botToken, messageId: post.messageId, attachments: [...baseAttachments, ...rows], notify: false };
  if (body.text) payload.text = body.text;
  if (body.link) payload.link = body.link;
  if (body.format !== undefined) payload.format = body.format;
  const result = await editMessage(payload);
  return { ok: true, runtimeVersion: RUNTIME, commentsEnabled: bool(post.commentsEnabled, true), commentKey: post.commentKey, postId: post.postId, result };
}
async function saveModeration(adminId, channelId, values = {}) { await ensure(); const words = String(values.stopwords || '').split(/[\n,;]/g).map((x) => clean(x).toLowerCase()).filter(Boolean); return db.saveRules({ adminId, channelId, scopeType: 'channel' }, { enabled: values.enabled !== false, applyPresetCommon: false, blockLinks: values.blockLinks === true, blockInvites: values.blockInvites !== false, aiEnabled: !!values.aiEnabled, customBlocklist: [...new Set(words)] }); }
async function commentPolicy(commentKey = '') { await ensure(); const { rows } = await db.query(`select p.channel_id as "channelId", p.post_id as "postId", p.comment_key as "commentKey", coalesce(s.comments_enabled, true) as "commentsEnabled", r.enabled as "moderationEnabled", r.block_links as "blockLinks", r.block_invites as "blockInvites", r.custom_blocklist as "customBlocklist" from ak_posts p left join ak_post_settings s on s.comment_key=p.comment_key left join lateral (select * from ak_moderation_rules r where r.channel_id=p.channel_id and r.scope_type='channel' order by r.updated_at desc limit 1) r on true where p.comment_key=$1 order by p.updated_at desc limit 1`, [commentKey]); const row = rows[0] || null; if (!row) return { ok: true, commentsEnabled: true, moderationEnabled: false, customBlocklist: [] }; return { ok: true, ...row, customBlocklist: Array.isArray(row.customBlocklist) ? row.customBlocklist : [] }; }

module.exports = { RUNTIME, ensure, getFlow, setFlow, getMenu, setMenu, listChannels, activeChannel, listPosts, getPostByCommentKey, ensurePostSettings, savePostSetting, patchCommentsButton, saveModeration, commentPolicy, channelTitle, postTitle, bool };
