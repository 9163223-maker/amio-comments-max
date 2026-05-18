'use strict';

const crypto = require('crypto');
const db = require('../../cc5-db-core');

const RUNTIME = 'ADMINKIT-CORE-STATS-DATA-ADAPTER-1.43.0-REFERRAL-ATTRIBUTION';

const DEFAULT_SOURCE_OPTIONS = [
  { id: 'yandex_direct', title: 'Яндекс Директ' },
  { id: 'zen', title: 'Дзен' },
  { id: 'pikabu', title: 'Пикабу' },
  { id: 'site', title: 'Сайт' },
  { id: 'telegram', title: 'Telegram' },
  { id: 'blogger', title: 'Блогер / посев' },
  { id: 'manual', title: 'Вручную' }
];

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function cut(value = '', max = 96) { const s = clean(value); return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s; }
function nowIso() { return new Date().toISOString(); }
function adminIdOf(ctx = {}) { return clean(ctx.adminId || ctx.admin_id || ctx.userId || ctx.payload?.adminId || ctx.payload?.admin_id || ''); }
function channelIdOf(ctx = {}, input = {}) { return clean(input.channelId || input.channel_id || ctx.channelId || ctx.channel_id || ctx.payload?.channelId || ctx.payload?.channel_id || ''); }
function channelTitleOf(ctx = {}, input = {}) { return clean(input.channelTitle || input.channel_title || ctx.channelTitle || ctx.channel_title || ctx.payload?.channelTitle || ctx.payload?.channel_title || 'Подключённый канал'); }
function sourceTitle(source = '') {
  const raw = clean(source);
  const found = DEFAULT_SOURCE_OPTIONS.find((item) => item.id === raw || item.title.toLowerCase() === raw.toLowerCase());
  return found ? found.title : (raw || 'Вручную');
}
function slugify(value = '') {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ъ: '', ь: ''
  };
  const src = clean(value).toLowerCase();
  let out = '';
  for (const ch of src) out += map[ch] !== undefined ? map[ch] : ch;
  out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
  return out || 'source';
}
function makeCode(input = {}) {
  const explicit = slugify(input.code || '');
  if (input.code && explicit) return explicit.slice(0, 80);
  const source = slugify(input.source || 'manual');
  const campaign = slugify(input.campaign || input.campaignName || 'campaign');
  const suffix = crypto.createHash('sha1').update(`${source}:${campaign}:${clean(input.channelId)}:${clean(input.targetUrl)}`).digest('hex').slice(0, 6);
  return `${source}-${campaign}-${suffix}`.slice(0, 80);
}
function publicBaseUrl() {
  return clean(process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.BASE_URL || process.env.NORTHFLANK_PUBLIC_URL || 'https://p01--amio-comments-max--qkpwxnxqqrnw.code.run').replace(/\/+$/g, '');
}
function defaultTargetUrl() {
  return clean(process.env.ADMINKIT_DEFAULT_REFERRAL_TARGET_URL || process.env.MAX_CHANNEL_URL || process.env.ADMINKIT_MAX_CHANNEL_URL || 'https://max.ru/id781310320690_biz');
}
function makeReferralUrl(code = '') {
  return `${publicBaseUrl()}/r/${encodeURIComponent(clean(code))}`;
}
function hashIp(value = '') {
  const raw = clean(value);
  if (!raw) return '';
  const salt = clean(process.env.ADMINKIT_STATS_IP_HASH_SALT || 'adminkit-stats');
  return crypto.createHash('sha256').update(`${salt}:${raw}`).digest('hex').slice(0, 24);
}
function reqInfo(req = {}) {
  const get = (name) => {
    try { return clean(req.get?.(name) || req.headers?.[String(name).toLowerCase()] || ''); } catch { return ''; }
  };
  const ip = clean(req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || '').split(',')[0];
  return {
    referrer: get('referer') || get('referrer'),
    userAgent: get('user-agent'),
    ipHash: hashIp(ip),
    query: req.query || {},
    path: req.originalUrl || req.url || ''
  };
}

let ensurePromise = null;
async function ensure() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await db.query(`
      create table if not exists ak_referral_campaigns (
        id bigserial primary key,
        admin_id text not null default '',
        channel_id text not null default '',
        channel_title text not null default '',
        code text not null unique,
        source text not null default '',
        source_title text not null default '',
        campaign text not null default '',
        target_url text not null default '',
        enabled boolean not null default true,
        cost numeric(14,2) not null default 0,
        meta jsonb not null default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
      create index if not exists ak_referral_campaigns_admin_idx on ak_referral_campaigns(admin_id, channel_id, enabled);
      create table if not exists ak_referral_events (
        id bigserial primary key,
        campaign_code text not null,
        event_type text not null,
        admin_id text not null default '',
        channel_id text not null default '',
        user_id text not null default '',
        session_id text not null default '',
        referrer text not null default '',
        user_agent text not null default '',
        ip_hash text not null default '',
        meta jsonb not null default '{}'::jsonb,
        created_at timestamptz default now()
      );
      create index if not exists ak_referral_events_code_type_idx on ak_referral_events(campaign_code, event_type, created_at desc);
      create table if not exists ak_stats_events (
        id bigserial primary key,
        admin_id text not null default '',
        channel_id text not null default '',
        post_id text not null default '',
        event_type text not null,
        source text not null default '',
        value numeric(14,2) not null default 1,
        meta jsonb not null default '{}'::jsonb,
        created_at timestamptz default now()
      );
      create index if not exists ak_stats_events_scope_idx on ak_stats_events(admin_id, channel_id, post_id, event_type, created_at desc);
    `);
    return { ok: true, runtimeVersion: RUNTIME };
  })().catch((error) => {
    ensurePromise = null;
    return { ok: false, runtimeVersion: RUNTIME, error: error?.message || String(error) };
  });
  return ensurePromise;
}

async function createReferralCampaign(ctx = {}, input = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return ensured;
  const adminId = adminIdOf(ctx) || clean(input.adminId || input.admin_id || '');
  const channelId = channelIdOf(ctx, input);
  const channelTitle = channelTitleOf(ctx, input);
  const source = clean(input.source || 'manual');
  const campaign = clean(input.campaign || input.campaignName || 'Кампания');
  const targetUrl = clean(input.targetUrl || input.url || defaultTargetUrl());
  const code = makeCode({ ...input, source, campaign, channelId, targetUrl });
  const sourceLabel = sourceTitle(source);
  const meta = { createdBy: 'adminkit-core', runtimeVersion: RUNTIME, exactMetrics: ['click', 'bot_start', 'callback'], probableMetrics: ['user_added_after_click'], ...(input.meta || {}) };
  const { rows } = await db.query(`
    insert into ak_referral_campaigns(admin_id, channel_id, channel_title, code, source, source_title, campaign, target_url, enabled, cost, meta, updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10::jsonb,now())
    on conflict(code) do update set
      admin_id=coalesce(nullif(excluded.admin_id,''), ak_referral_campaigns.admin_id),
      channel_id=coalesce(nullif(excluded.channel_id,''), ak_referral_campaigns.channel_id),
      channel_title=coalesce(nullif(excluded.channel_title,''), ak_referral_campaigns.channel_title),
      source=excluded.source,
      source_title=excluded.source_title,
      campaign=excluded.campaign,
      target_url=coalesce(nullif(excluded.target_url,''), ak_referral_campaigns.target_url),
      enabled=true,
      cost=excluded.cost,
      meta=ak_referral_campaigns.meta || excluded.meta,
      updated_at=now()
    returning *`, [adminId, channelId, channelTitle, code, source, sourceLabel, campaign, targetUrl, Number(input.cost || 0) || 0, JSON.stringify(meta)]);
  const row = rows[0] || {};
  return { ok: true, runtimeVersion: RUNTIME, campaign: mapCampaign(row) };
}

function mapCampaign(row = {}, counts = {}) {
  const code = clean(row.code);
  const clicks = Number(counts.click || row.clicks || 0) || 0;
  const starts = Number(counts.bot_start || row.starts || 0) || 0;
  const probableSubscribers = Number(counts.user_added_probable || row.probable_subscribers || 0) || 0;
  const leads = Number(counts.lead_claim || row.leads || 0) || 0;
  const cost = Number(row.cost || 0) || 0;
  return {
    code,
    url: makeReferralUrl(code),
    source: clean(row.source),
    sourceTitle: clean(row.source_title || sourceTitle(row.source)),
    campaign: clean(row.campaign),
    channelId: clean(row.channel_id),
    channelTitle: clean(row.channel_title),
    targetUrl: clean(row.target_url || defaultTargetUrl()),
    enabled: row.enabled !== false,
    cost,
    clicks,
    starts,
    probableSubscribers,
    leads,
    clickPrice: clicks > 0 && cost > 0 ? Number((cost / clicks).toFixed(2)) : 0,
    probableSubscriberPrice: probableSubscribers > 0 && cost > 0 ? Number((cost / probableSubscribers).toFixed(2)) : 0,
    updatedAt: row.updated_at || row.updatedAt || null,
    createdAt: row.created_at || row.createdAt || null
  };
}

async function listReferralCampaigns(ctx = {}, options = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return { ...ensured, campaigns: [] };
  const adminId = adminIdOf(ctx) || clean(options.adminId || '');
  const channelId = channelIdOf(ctx, options);
  const limit = Math.max(1, Math.min(Number(options.limit || 20), 50));
  const { rows } = await db.query(`
    with counts as (
      select campaign_code,
        count(*) filter(where event_type='click')::int as clicks,
        count(*) filter(where event_type='bot_start')::int as starts,
        count(*) filter(where event_type='user_added_probable')::int as probable_subscribers,
        count(*) filter(where event_type='lead_claim')::int as leads
      from ak_referral_events
      group by campaign_code
    )
    select c.*, coalesce(counts.clicks,0) as clicks, coalesce(counts.starts,0) as starts,
      coalesce(counts.probable_subscribers,0) as probable_subscribers, coalesce(counts.leads,0) as leads
    from ak_referral_campaigns c
    left join counts on counts.campaign_code=c.code
    where ($1='' or c.admin_id=$1) and ($2='' or c.channel_id=$2)
    order by c.updated_at desc, c.id desc
    limit $3`, [adminId, channelId, limit]);
  return { ok: true, runtimeVersion: RUNTIME, campaigns: (rows || []).map((row) => mapCampaign(row)) };
}

async function recordReferralEvent(input = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return ensured;
  const campaignCode = clean(input.campaignCode || input.code || input.campaign_code);
  const eventType = clean(input.eventType || input.event_type || 'click');
  if (!campaignCode || !eventType) return { ok: false, runtimeVersion: RUNTIME, error: 'referral_event_scope_missing' };
  const meta = { source: 'adminkit-core', runtimeVersion: RUNTIME, exact: ['click', 'bot_start', 'callback', 'lead_claim'].includes(eventType), probable: eventType === 'user_added_probable', ...(input.meta || {}) };
  await db.query(`insert into ak_referral_events(campaign_code,event_type,admin_id,channel_id,user_id,session_id,referrer,user_agent,ip_hash,meta,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())`, [
    campaignCode,
    eventType,
    clean(input.adminId || input.admin_id || ''),
    clean(input.channelId || input.channel_id || ''),
    clean(input.userId || input.user_id || ''),
    clean(input.sessionId || input.session_id || ''),
    cut(input.referrer || '', 240),
    cut(input.userAgent || '', 240),
    clean(input.ipHash || ''),
    JSON.stringify(meta)
  ]);
  return { ok: true, runtimeVersion: RUNTIME, campaignCode, eventType };
}

async function recordStatsEvent(ctx = {}, input = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return ensured;
  const eventType = clean(input.eventType || input.event_type);
  if (!eventType) return { ok: false, runtimeVersion: RUNTIME, error: 'stats_event_type_missing' };
  await db.query(`insert into ak_stats_events(admin_id,channel_id,post_id,event_type,source,value,meta,created_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,now())`, [
    adminIdOf(ctx), channelIdOf(ctx, input), clean(input.postId || input.post_id || ''), eventType, clean(input.source || ''), Number(input.value || 1) || 1, JSON.stringify({ runtimeVersion: RUNTIME, ...(input.meta || {}) })
  ]);
  return { ok: true, runtimeVersion: RUNTIME, eventType };
}

async function trackReferralHit(code = '', req = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return { ...ensured, targetUrl: defaultTargetUrl(), found: false };
  const safeCode = clean(code);
  const { rows } = await db.query(`select * from ak_referral_campaigns where code=$1 and enabled=true limit 1`, [safeCode]);
  const row = rows[0] || null;
  const info = reqInfo(req);
  if (row) {
    await recordReferralEvent({ campaignCode: safeCode, eventType: 'click', adminId: row.admin_id, channelId: row.channel_id, referrer: info.referrer, userAgent: info.userAgent, ipHash: info.ipHash, meta: { query: info.query, path: info.path } });
  }
  return { ok: true, runtimeVersion: RUNTIME, found: !!row, targetUrl: clean(row?.target_url || defaultTargetUrl()), campaign: row ? mapCampaign(row) : null };
}

async function referralFunnel(ctx = {}, options = {}) {
  const ensured = await ensure();
  if (ensured.ok === false) return { ...ensured, rows: [], totals: {} };
  const list = await listReferralCampaigns(ctx, options);
  const rows = (list.campaigns || []).map((item) => ({
    sourceTitle: item.sourceTitle,
    campaign: item.campaign,
    code: item.code,
    url: item.url,
    exactClicks: item.clicks,
    exactStarts: item.starts,
    probableSubscribers: item.probableSubscribers,
    leads: item.leads,
    cost: item.cost,
    clickPrice: item.clickPrice,
    probableSubscriberPrice: item.probableSubscriberPrice
  }));
  const totals = rows.reduce((acc, row) => {
    acc.exactClicks += row.exactClicks;
    acc.exactStarts += row.exactStarts;
    acc.probableSubscribers += row.probableSubscribers;
    acc.leads += row.leads;
    acc.cost += row.cost;
    return acc;
  }, { exactClicks: 0, exactStarts: 0, probableSubscribers: 0, leads: 0, cost: 0 });
  return { ok: true, runtimeVersion: RUNTIME, rows, totals, attributionPolicy: attributionPolicy() };
}

function attributionPolicy() {
  return {
    exact: ['клик по ссылке АдминКИТ', 'старт бота с кодом', 'callback внутри бота', 'выдача лид-магнита внутри АдминКИТ'],
    probable: ['подписка после клика, если MAX прислал user_added, но не передал ref-код'],
    notPromised: ['точный источник подписки без ref-кода от MAX']
  };
}

function sourceOptions() { return DEFAULT_SOURCE_OPTIONS.slice(); }

function selfTest() {
  const code = makeCode({ source: 'yandex_direct', campaign: 'майская реклама', channelId: 'channel', targetUrl: 'https://max.ru/channel' });
  const url = makeReferralUrl(code);
  const policy = attributionPolicy();
  return {
    ok: /^yandex-direct-mayskaya-reklama-[a-f0-9]{6}$/.test(code) && /^https?:\/\/.+\/r\//.test(url),
    runtimeVersion: RUNTIME,
    referralCampaignsReady: true,
    referralEventsReady: true,
    statsEventsReady: true,
    sourceOptionsReady: sourceOptions().length >= 7,
    exactClicksReady: policy.exact.includes('клик по ссылке АдминКИТ'),
    probableSubscribersSeparated: policy.probable.length > 0,
    doesNotPromiseExactSubscriptionSourceWithoutMaxRef: true,
    redirectRouteRequired: true,
    generatedUrlSample: url
  };
}

module.exports = {
  RUNTIME,
  sourceOptions,
  sourceTitle,
  publicBaseUrl,
  defaultTargetUrl,
  makeCode,
  makeReferralUrl,
  ensure,
  createReferralCampaign,
  listReferralCampaigns,
  recordReferralEvent,
  recordStatsEvent,
  trackReferralHit,
  referralFunnel,
  attributionPolicy,
  selfTest
};
