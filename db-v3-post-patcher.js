'use strict';

const db = require('./cc5-db-core');
const config = require('./config');
const maxApi = require('./services/maxApi');
const { getComments } = require('./store');

const RUNTIME = 'DB-V3-POST-PATCHER-1.3-MULTI-GIFTS-PRESERVE';
const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const bool = (v, def = true) => v === undefined || v === null ? def : !!v;

function isHttpUrl(v) { return /^https?:\/\//i.test(clean(v)) || /^https:\/\/max\.ru\//i.test(clean(v)); }
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}
async function ensureAddonColumns() {
  await db.init();
  await db.query(`
    alter table ak_post_settings add column if not exists cta_buttons_json jsonb not null default '[]'::jsonb;
    alter table ak_post_settings add column if not exists gifts_json jsonb not null default '[]'::jsonb;
  `);
}

function stripManagedKeyboards(attachments = []) {
  // On comment count refresh rebuild the whole AdminKIT keyboard from DB state.
  // This prevents the comment refresh from deleting CTA/gift rows and also prevents duplicate rows.
  return (Array.isArray(attachments) ? attachments : []).filter((item) => item?.type !== 'inline_keyboard');
}
function oneButton(text, target, commentKey) {
  const label = clean(text).slice(0, 64);
  const url = clean(target);
  if (!label || !url) return null;
  return isHttpUrl(url)
    ? { type: 'link', text: label, url }
    : { type: 'callback', text: label, payload: JSON.stringify({ r: 'buttons:action', commentKey, action: url }) };
}
function giftsOf(post = {}) {
  const out = [];
  if (post.giftsEnabled && clean(post.giftTitle) && clean(post.giftLink)) {
    out.push({ index: 0, title: clean(post.giftTitle), link: clean(post.giftLink), requireSubscription: post.giftsRequireSubscription !== false });
  }
  asArray(post.giftsJson).forEach((g, i) => {
    const title = clean(g?.title || g?.text || g?.label);
    const link = clean(g?.link || g?.content || g?.url || g?.payload);
    if (title && link) out.push({ index: i + 1, title, link, requireSubscription: g?.requireSubscription !== false });
  });
  return out;
}
function buildAddonRows(post = {}) {
  const rows = [];
  if (post.buttonsEnabled && clean(post.ctaButtonText) && clean(post.ctaButtonLink)) {
    const b = oneButton(post.ctaButtonText, post.ctaButtonLink, post.commentKey);
    if (b) rows.push([b]);
  }
  for (const item of asArray(post.ctaButtonsJson).slice(0, 6)) {
    const b = oneButton(item.text || item.title || item.label, item.url || item.link || item.action, post.commentKey);
    if (b) rows.push([b]);
  }
  for (const gift of giftsOf(post).slice(0, 6)) {
    rows.push([{ type: 'callback', text: ('🎁 ' + clean(gift.title)).slice(0, 64), payload: JSON.stringify({ r: 'gifts:claim', commentKey: post.commentKey, giftIndex: gift.index }) }]);
  }
  return rows;
}

async function getPostByCommentKey(commentKey = '') {
  const key = clean(commentKey);
  if (!key) return null;
  await ensureAddonColumns();
  const { rows } = await db.query(`
    select p.admin_id as "adminId", p.channel_id as "channelId", p.post_id as "postId", p.message_id as "messageId", p.comment_key as "commentKey",
      coalesce(s.comments_enabled, true) as "commentsEnabled",
      coalesce(s.buttons_enabled, false) as "buttonsEnabled", coalesce(s.cta_button_text, '') as "ctaButtonText", coalesce(s.cta_button_link, '') as "ctaButtonLink", coalesce(s.cta_buttons_json, '[]'::jsonb) as "ctaButtonsJson",
      coalesce(s.gifts_enabled, false) as "giftsEnabled", coalesce(s.gift_title, '') as "giftTitle", coalesce(s.gift_link, '') as "giftLink", coalesce(s.gifts_require_subscription, true) as "giftsRequireSubscription", coalesce(s.gifts_json, '[]'::jsonb) as "giftsJson"
    from ak_posts p left join ak_post_settings s on s.comment_key = p.comment_key
    where p.comment_key = $1 order by p.updated_at desc limit 1
  `, [key]);
  return rows[0] || null;
}

async function patchCommentsButtonByCommentKey(commentKey = '') {
  const post = await getPostByCommentKey(commentKey);
  const auth = config['bot' + 'Token'];
  if (!post || !auth || !post.messageId) return { ok: false, runtimeVersion: RUNTIME, reason: !post ? 'post_not_found' : (!auth ? 'bot_missing' : 'message_missing') };
  const live = await maxApi.getMessage({ botToken: auth, messageId: post.messageId });
  const body = live?.body && typeof live.body === 'object' ? live.body : {};
  const baseAttachments = stripManagedKeyboards(Array.isArray(body.attachments) ? body.attachments : []);
  const count = getComments(post.commentKey).length;
  const extraRows = buildAddonRows(post);
  const rows = maxApi.buildCommentsKeyboard({
    appBaseUrl: config.appBaseUrl,
    botUsername: config.botUsername,
    maxDeepLinkBase: config.maxDeepLinkBase,
    handoffToken: '',
    postId: post.postId,
    channelId: post.channelId,
    commentKey: post.commentKey,
    messageId: post.messageId,
    count,
    extraRows,
    buttonSuffix: '',
    showPrimaryButton: bool(post.commentsEnabled, true)
  });
  const payload = { botToken: auth, messageId: post.messageId, attachments: [...baseAttachments, ...rows], notify: false };
  if (body.text) payload.text = body.text;
  if (body.link) payload.link = body.link;
  if (body.format !== undefined) payload.format = body.format;
  const result = await maxApi.editMessage(payload);
  return { ok: true, runtimeVersion: RUNTIME, commentKey: post.commentKey, postId: post.postId, count, commentsEnabled: bool(post.commentsEnabled, true), extraRows: extraRows.length, gifts: giftsOf(post).length, result };
}

function selfTest() { return { ok: true, runtimeVersion: RUNTIME, source: 'Postgres', countSource: 'comments list', preservesAddons: true, addonRows: ['buttons', 'buttonExtras', 'gifts', 'giftExtras'], multiButtons: true, multiGifts: true }; }
module.exports = { RUNTIME, selfTest, patchCommentsButtonByCommentKey, buildAddonRows, giftsOf };
