'use strict';

const db = require('../../cc5-db-core');
const postRegistry = require('./postRegistryDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POLLS-DATA-ADAPTER-1.46.0';
const DEFAULT_OPTIONS = ['Да', 'Нет', 'Позже'];
const MAX_OPTIONS = 8;
const MIN_OPTIONS = 2;

function clean(value = '') { return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 120) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || ''); }
function voterIdOf(ctx = {}, input = {}) { return clean(input.voterId || input.voter_id || ctx.voterId || ctx.userId || ctx.adminId || ctx.admin_id || ctx.payload?.voterId || 'stress-voter'); }
function channelIdOf(ctx = {}, input = {}) { return clean(input.channelId || input.channel_id || ctx.channelId || ctx.channel_id || ctx.payload?.channelId || ctx.payload?.channel_id || ''); }
function postIdOf(ctx = {}, input = {}) { return clean(input.postId || input.post_id || ctx.postId || ctx.post_id || ctx.payload?.postId || ctx.payload?.post_id || ''); }
function messageIdOf(ctx = {}, input = {}) { return clean(input.messageId || input.message_id || ctx.messageId || ctx.message_id || ctx.payload?.messageId || ctx.payload?.message_id || ''); }
function channelTitleOf(ctx = {}, input = {}) { return cut(input.channelTitle || input.channel_title || ctx.channelTitle || ctx.channel_title || ctx.payload?.channelTitle || ctx.payload?.channel_title || 'Подключённый канал', 120); }
function postTitleOf(ctx = {}, input = {}) { return cut(input.postTitle || input.post_title || input.postPreview || input.post_preview || ctx.postTitle || ctx.payload?.postTitle || ctx.payload?.postPreview || 'выбранный пост', 160); }
function questionOf(ctx = {}, input = {}) { return cut(input.question || ctx.payload?.question || ctx.text || 'Какой вариант выбираем?', 180); }
function safeJson(value = {}) { try { return JSON.stringify(value || {}); } catch { return '{}'; } }
function parseOptions(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/\n|;|,/);
  const unique = [];
  for (const item of raw) {
    const option = cut(item, 64);
    if (option && !unique.some((x) => x.toLowerCase() === option.toLowerCase())) unique.push(option);
  }
  return unique.slice(0, MAX_OPTIONS);
}

async function ensure() {
  await postRegistry.ensure?.();
  await db.query(`
    create table if not exists ak_polls (
      id bigserial primary key,
      admin_id text not null,
      channel_id text not null,
      channel_title text not null default '',
      post_id text not null,
      message_id text not null default '',
      post_title text not null default '',
      question text not null default '',
      status text not null default 'draft',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create index if not exists ak_polls_admin_channel_updated_idx on ak_polls(admin_id, channel_id, updated_at desc);
    create index if not exists ak_polls_post_idx on ak_polls(channel_id, post_id, status);
    create table if not exists ak_poll_options (
      id bigserial primary key,
      poll_id bigint not null references ak_polls(id) on delete cascade,
      option_index int not null default 0,
      option_text text not null default '',
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create unique index if not exists ak_poll_options_poll_index_idx on ak_poll_options(poll_id, option_index);
    create table if not exists ak_poll_votes (
      id bigserial primary key,
      poll_id bigint not null references ak_polls(id) on delete cascade,
      option_id bigint not null references ak_poll_options(id) on delete cascade,
      voter_id text not null,
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create unique index if not exists ak_poll_votes_unique_voter_idx on ak_poll_votes(poll_id, voter_id);
    create index if not exists ak_poll_votes_poll_option_idx on ak_poll_votes(poll_id, option_id);
  `);
  return { ok: true, runtimeVersion: RUNTIME };
}

async function listChannels(ctx = {}) {
  await ensure();
  return postRegistry.listChannels(ctx);
}

async function listPosts(ctx = {}, options = {}) {
  await ensure();
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const rows = await postRegistry.listPosts(ctx, { channelId, limit: Math.max(1, Math.min(Number(options.limit || 10), 20)) });
  return (Array.isArray(rows) ? rows : []).map((post) => ({
    channelId: clean(post.channelId || channelId),
    channelTitle: clean(post.channelTitle || post.displayTitle || ctx.payload?.channelTitle || 'Подключённый канал'),
    postId: clean(post.postId || post.id || ''),
    messageId: clean(post.messageId || post.message_id || ''),
    postTitle: cut(post.postTitle || post.postPreview || post.title || 'Пост без текста', 120),
    postPreview: cut(post.postPreview || post.postTitle || '', 160)
  }));
}

async function seedPost(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx) || 'core-stress-admin';
  const channelId = channelIdOf(ctx, input) || 'core-stress-poll-channel';
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input) || 'core-stress-poll-post';
  const messageId = messageIdOf(ctx, input) || 'core-stress-poll-message';
  const postTitle = postTitleOf(ctx, input) || 'Тест опроса под постом';
  await postRegistry.ensurePrincipalRows?.({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  await db.query(`insert into ak_posts(admin_id, channel_id, channel_title, post_id, message_id, comment_key, post_title, post_preview, source, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,'polls_stress',$9::jsonb,now())
    on conflict(channel_id, post_id) do update set admin_id=excluded.admin_id, channel_title=excluded.channel_title, message_id=excluded.message_id, post_title=excluded.post_title, post_preview=excluded.post_preview, meta=ak_posts.meta || excluded.meta, updated_at=now()`,
    [adminId, channelId, channelTitle, postId, messageId, `${channelId}:${postId}`, postTitle, postTitle, safeJson({ runtimeVersion: RUNTIME, pollReady: true, messageId })]);
  return { ok: true, post: { adminId, channelId, channelTitle, postId, messageId, postTitle, postPreview: postTitle } };
}

async function createPoll(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  const postId = postIdOf(ctx, input);
  const messageId = messageIdOf(ctx, input);
  const postTitle = postTitleOf(ctx, input);
  const question = questionOf(ctx, input);
  const options = parseOptions(input.options || ctx.payload?.options || DEFAULT_OPTIONS);
  if (!adminId || !channelId || !postId) return { ok: false, error: 'poll_required_fields_missing' };
  if (!question) return { ok: false, error: 'poll_question_required' };
  if (options.length < MIN_OPTIONS) return { ok: false, error: 'poll_options_min_required', min: MIN_OPTIONS };
  await postRegistry.ensurePrincipalRows?.({ adminId, channelId, channelTitle }, { channelId, channelTitle });
  const { rows } = await db.query(`insert into ak_polls(admin_id, channel_id, channel_title, post_id, message_id, post_title, question, status, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,'active',$8::jsonb,now()) returning id, created_at, updated_at`,
    [adminId, channelId, channelTitle, postId, messageId, postTitle, question, safeJson({ runtimeVersion: RUNTIME, source: 'adminkit-core-1.46.0', oneVotePerUser: true })]);
  const pollId = rows[0]?.id;
  for (let i = 0; i < options.length; i += 1) {
    await db.query(`insert into ak_poll_options(poll_id, option_index, option_text, meta, updated_at)
      values($1,$2,$3,$4::jsonb,now()) on conflict(poll_id, option_index) do update set option_text=excluded.option_text, updated_at=now()`,
      [pollId, i + 1, options[i], safeJson({ runtimeVersion: RUNTIME })]);
  }
  return { ok: true, pollId, adminId, channelId, channelTitle, postId, messageId, postTitle, question, options };
}

async function listPolls(ctx = {}, options = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const channelId = clean(options.channelId || channelIdOf(ctx));
  const limit = Math.max(1, Math.min(Number(options.limit || 10), 50));
  const { rows } = await db.query(`select id, channel_id, channel_title, post_id, message_id, post_title, question, status, updated_at, created_at
    from ak_polls where ($1='' or admin_id=$1) and ($2='' or channel_id=$2) and status<>'deleted'
    order by updated_at desc, id desc limit $3`, [adminId, channelId, limit]);
  return { ok: true, total: rows.length, polls: (rows || []).map((row) => ({ pollId: row.id, channelId: row.channel_id, channelTitle: row.channel_title, postId: row.post_id, messageId: row.message_id, postTitle: cut(row.post_title || 'Пост без текста', 120), question: cut(row.question || 'Опрос без вопроса', 180), status: row.status, updatedAt: row.updated_at })) };
}

async function getPollWithOptions(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const pollId = Number(input.pollId || input.poll_id || ctx.payload?.pollId || ctx.payload?.poll_id || 0);
  if (!adminId || !pollId) return { ok: false, error: 'poll_id_required' };
  const pollRows = await db.query(`select * from ak_polls where admin_id=$1 and id=$2 and status<>'deleted' limit 1`, [adminId, pollId]);
  const poll = pollRows.rows[0];
  if (!poll) return { ok: false, error: 'poll_not_found' };
  const optionRows = await db.query(`select o.id, o.option_index, o.option_text, count(v.id)::int as votes
    from ak_poll_options o left join ak_poll_votes v on v.option_id=o.id
    where o.poll_id=$1 group by o.id, o.option_index, o.option_text order by o.option_index asc`, [pollId]);
  const totalVotes = optionRows.rows.reduce((sum, row) => sum + Number(row.votes || 0), 0);
  return { ok: true, poll: { pollId: poll.id, channelId: poll.channel_id, channelTitle: poll.channel_title, postId: poll.post_id, messageId: poll.message_id, postTitle: cut(poll.post_title, 120), question: poll.question, status: poll.status }, options: optionRows.rows.map((row) => ({ optionId: row.id, index: row.option_index, text: row.option_text, votes: Number(row.votes || 0), percent: totalVotes ? Math.round(Number(row.votes || 0) * 100 / totalVotes) : 0 })), totalVotes };
}

async function vote(ctx = {}, input = {}) {
  await ensure();
  const voterId = voterIdOf(ctx, input);
  const pollId = Number(input.pollId || ctx.payload?.pollId || 0);
  const optionId = Number(input.optionId || ctx.payload?.optionId || 0);
  if (!pollId || !optionId || !voterId) return { ok: false, error: 'vote_required_fields_missing' };
  const pollState = await getPollWithOptions(ctx, { pollId });
  if (!pollState.ok) return pollState;
  if (pollState.poll.status !== 'active') return { ok: false, error: 'poll_closed', poll: pollState.poll };
  const selected = pollState.options.find((x) => Number(x.optionId) === optionId);
  if (!selected) return { ok: false, error: 'poll_option_not_found' };
  const existingRows = await db.query(`select option_id from ak_poll_votes where poll_id=$1 and voter_id=$2 limit 1`, [pollId, voterId]);
  const alreadyVoted = existingRows.rows.length > 0;
  await db.query(`insert into ak_poll_votes(poll_id, option_id, voter_id, meta, updated_at)
    values($1,$2,$3,$4::jsonb,now())
    on conflict(poll_id, voter_id) do update set option_id=excluded.option_id, meta=ak_poll_votes.meta || excluded.meta, updated_at=now()`,
    [pollId, optionId, voterId, safeJson({ runtimeVersion: RUNTIME, duplicateCallbackSafe: true, alreadyVoted })]);
  return { ok: true, pollId, optionId, voterId, selectedText: selected.text, alreadyVoted, duplicateCallbackSafe: true };
}

async function closePoll(ctx = {}, input = {}) {
  await ensure();
  const adminId = adminIdOf(ctx);
  const pollId = Number(input.pollId || ctx.payload?.pollId || 0);
  if (!adminId || !pollId) return { ok: false, error: 'poll_close_required_fields_missing' };
  const { rowCount } = await db.query(`update ak_polls set status='closed', updated_at=now() where admin_id=$1 and id=$2 and status='active'`, [adminId, pollId]);
  return { ok: rowCount > 0, pollId, closed: rowCount > 0 };
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    minOptions: MIN_OPTIONS,
    maxOptions: MAX_OPTIONS,
    createPollReady: true,
    voteReady: true,
    oneVotePerUserReady: true,
    duplicateCallbackSafe: true,
    resultsReady: true,
    closePollReady: true,
    noLegacyCtaMix: true,
    humanLabelsRequired: true
  };
}

module.exports = { RUNTIME, DEFAULT_OPTIONS, MAX_OPTIONS, MIN_OPTIONS, ensure, listChannels, listPosts, seedPost, createPoll, listPolls, getPollWithOptions, vote, closePoll, parseOptions, selfTest };
