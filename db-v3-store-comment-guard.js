'use strict';

// DB-V3 STORE COMMENT GUARD
// Жёсткая защита на самом нижнем уровне: перед любой записью комментария в store.addComment.
// Никакой history/store как источник решения: читаем только Postgres.

const { execFileSync } = require('child_process');

const RUNTIME = 'DB-V3-STORE-COMMENT-GUARD-1.0-POSTGRES-BEFORE-ADD';
const MARKER = '__DB_V3_STORE_COMMENT_GUARD__';

function clean(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normText(value) {
  return clean(value).toLowerCase().replace(/ё/g, 'е');
}

function toList(value) {
  if (Array.isArray(value)) return value.map(normText).filter(Boolean);
  if (value && typeof value === 'object') {
    try { return toList(Object.values(value)); } catch { return []; }
  }
  return String(value || '')
    .split(/[\n,;]/g)
    .map(normText)
    .filter(Boolean);
}

function textFromComment(comment = {}) {
  if (!comment || typeof comment !== 'object') return '';
  return clean(comment.text || comment.comment || comment.message || comment.body?.text || comment.body || '');
}

function countLinks(text) {
  return (String(text || '').match(/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg|wa\.me|chat\.whatsapp\.com)/giu) || []).length;
}

const DB_POLICY_SCRIPT = `
const { Pool } = require('pg');
const key = String(process.argv[1] || '').trim();
const url = String(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '').trim();
if (!key || !url) { console.log('null'); process.exit(0); }
const pool = new Pool({ connectionString: url, ssl: /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 2500, idleTimeoutMillis: 1000 });
(async () => {
  const { rows } = await pool.query(
    'select p.channel_id as "channelId", p.post_id as "postId", p.comment_key as "commentKey", coalesce(s.comments_enabled,true) as "commentsEnabled", coalesce(r.enabled,false) as "moderationEnabled", coalesce(r.block_links,false) as "blockLinks", coalesce(r.block_invites,true) as "blockInvites", coalesce(r.custom_blocklist,\'[]\'::jsonb) as "customBlocklist" from ak_posts p left join ak_post_settings s on s.comment_key=p.comment_key left join lateral (select * from ak_moderation_rules r where r.channel_id=p.channel_id and r.scope_type=\'channel\' order by r.updated_at desc limit 1) r on true where p.comment_key=$1 order by p.updated_at desc limit 1',
    [key]
  );
  console.log(JSON.stringify(rows[0] || null));
  await pool.end();
})().catch(async () => { try { await pool.end(); } catch {} console.log('null'); });
`;

function readPolicy(commentKey = '') {
  const key = clean(commentKey);
  const dbUrl = clean(process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_URL || '');
  if (!key || !dbUrl) return null;
  try {
    const out = execFileSync(process.execPath, ['-e', DB_POLICY_SCRIPT, key], {
      env: process.env,
      timeout: 3500,
      maxBuffer: 128 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString('utf8').trim();
    if (!out || out === 'null') return null;
    const parsed = JSON.parse(out);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function makeBlock(code, message, data = {}) {
  const error = new Error(message);
  error.status = 403;
  error.code = code;
  error.publicMessage = message;
  error.data = { ...data, runtimeVersion: RUNTIME, source: 'Postgres' };
  return error;
}

function assertAllowed(commentKey = '', comment = {}) {
  const key = clean(commentKey);
  if (!key) return { ok: true, skipped: 'empty_comment_key' };

  const policy = readPolicy(key);
  // Если запись поста в Postgres ещё не найдена, не используем store/history как источник решения.
  // Для нового поста это означает: до появления ak_posts не применяем ложные правила.
  if (!policy) return { ok: true, skipped: 'policy_not_found_in_postgres' };

  if (policy.commentsEnabled === false) {
    throw makeBlock('comments_disabled', 'Комментарии к этому посту выключены.', { commentKey: key });
  }

  const text = textFromComment(comment);
  if (!text) return { ok: true, policy };

  if (policy.moderationEnabled === false) return { ok: true, policy };

  const lowered = normText(text);
  const words = toList(policy.customBlocklist);
  const matchedWords = words.filter((word) => word && lowered.includes(word));
  const reasons = [];
  if (matchedWords.length) reasons.push('stopwords_match');
  if (policy.blockLinks && countLinks(text) > 0) reasons.push('links_blocked');
  if (policy.blockInvites !== false && /(t\.me\/|telegram\.me\/|discord\.gg|chat\.whatsapp\.com|joinchat|invite)/iu.test(text)) reasons.push('invite_link');

  if (reasons.length) {
    throw makeBlock('moderation_blocked', 'Комментарий не опубликован: сработала модерация.', {
      commentKey: key,
      reasons,
      matchedWords
    });
  }

  return { ok: true, policy };
}

function install() {
  if (global[MARKER]) return selfTest(true);
  global[MARKER] = true;

  const store = require('./store');
  if (!store || typeof store.addComment !== 'function') return selfTest(false, 'store_addComment_missing');
  if (store.addComment.__dbV3StoreGuardWrapped) return selfTest(true);

  const originalAddComment = store.addComment.bind(store);
  function guardedAddComment(commentKey, comment) {
    assertAllowed(commentKey, comment);
    return originalAddComment(commentKey, comment);
  }
  guardedAddComment.__dbV3StoreGuardWrapped = true;
  store.addComment = guardedAddComment;

  return selfTest(false);
}

function selfTest(already = false, warning = '') {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    marker: MARKER,
    already,
    warning,
    databaseOnly: true,
    storeUsedAsDecisionSource: false,
    appliesBefore: 'store.addComment',
    blocks: ['comments_disabled', 'custom_stopwords', 'links', 'invites']
  };
}

module.exports = { RUNTIME, MARKER, install, selfTest, assertAllowed, readPolicy };
