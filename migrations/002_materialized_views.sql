-- Amio for MAX
-- Ready materialized views for reporting and dashboard summaries
-- Version: 14.12.3

begin;

set search_path to public;

-- Re-runnable migration: rebuild derived reporting objects

drop materialized view if exists mv_retention_cohorts cascade;
drop materialized view if exists mv_funnel_daily_summary cascade;
drop materialized view if exists mv_moderation_label_summary cascade;
drop materialized view if exists mv_moderation_daily_summary cascade;
drop materialized view if exists mv_poll_performance cascade;
drop materialized view if exists mv_button_performance_daily cascade;
drop materialized view if exists mv_acquisition_summary cascade;
drop materialized view if exists mv_channel_post_summary cascade;
drop materialized view if exists mv_channel_weekly_summary cascade;
drop materialized view if exists mv_channel_daily_summary cascade;
drop function if exists refresh_analytics_materialized_views();

-- =====================================================
-- 1) Channel daily summary
-- =====================================================
create materialized view mv_channel_daily_summary as
with day_channel_base as (
  select distinct channel_id, (created_at at time zone 'UTC')::date as metric_date
  from posts
  where channel_id is not null

  union
  select distinct channel_id, (created_at at time zone 'UTC')::date as metric_date
  from comments
  where channel_id is not null

  union
  select distinct c.channel_id, (cr.created_at at time zone 'UTC')::date as metric_date
  from comment_reactions cr
  join comments c on c.comment_id = cr.comment_id
  where c.channel_id is not null

  union
  select distinct p.channel_id, (pv.voted_at at time zone 'UTC')::date as metric_date
  from poll_votes pv
  join polls p on p.poll_id = pv.poll_id
  where p.channel_id is not null

  union
  select distinct channel_id, (clicked_at at time zone 'UTC')::date as metric_date
  from tracked_button_clicks
  where channel_id is not null

  union
  select distinct channel_id, (first_touch_at at time zone 'UTC')::date as metric_date
  from sessions
  where channel_id is not null

  union
  select distinct channel_id, (created_at at time zone 'UTC')::date as metric_date
  from moderation_decisions
  where channel_id is not null

  union
  select distinct channel_id, (created_at at time zone 'UTC')::date as metric_date
  from conversions
  where channel_id is not null

  union
  select distinct channel_id, (occurred_at at time zone 'UTC')::date as metric_date
  from events
  where channel_id is not null
),
posts_daily as (
  select channel_id,
         (created_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as post_count
  from posts
  group by 1,2
),
comments_daily as (
  select channel_id,
         (created_at at time zone 'UTC')::date as metric_date,
         count(*) filter (where status in ('published','hidden','flagged','queued','blocked'))::integer as comments_count,
         count(*) filter (where status = 'published')::integer as published_comments_count,
         (count(distinct user_id) filter (where user_id is not null))::integer as commenters_uniq
  from comments
  group by 1,2
),
reactions_daily as (
  select c.channel_id,
         (cr.created_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as reactions_count,
         (count(distinct cr.user_id) filter (where cr.user_id is not null))::integer as reactors_uniq
  from comment_reactions cr
  join comments c on c.comment_id = cr.comment_id
  group by 1,2
),
poll_votes_daily as (
  select p.channel_id,
         (pv.voted_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as poll_votes_count,
         (count(distinct pv.user_id) filter (where pv.user_id is not null))::integer as poll_voters_uniq
  from poll_votes pv
  join polls p on p.poll_id = pv.poll_id
  group by 1,2
),
button_clicks_daily as (
  select channel_id,
         (clicked_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as button_clicks_count,
         count(*) filter (where is_unique_for_user)::integer as button_unique_users,
         count(*) filter (where is_unique_for_session)::integer as button_unique_sessions
  from tracked_button_clicks
  group by 1,2
),
sessions_daily as (
  select channel_id,
         (first_touch_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as sessions_count,
         (count(distinct user_id) filter (where user_id is not null))::integer as unique_visitors
  from sessions
  group by 1,2
),
moderation_daily as (
  select channel_id,
         (created_at at time zone 'UTC')::date as metric_date,
         count(*)::integer as moderation_checks_count,
         count(*) filter (where verdict = 'block')::integer as blocked_comments_count,
         count(*) filter (where verdict = 'flag')::integer as flagged_comments_count,
         count(*) filter (where verdict = 'queue')::integer as queued_comments_count,
         round(avg(latency_ms)::numeric, 2) as moderation_avg_latency_ms,
         round(avg(score)::numeric, 5) as moderation_avg_score
  from moderation_decisions
  group by 1,2
),
conversions_daily as (
  select channel_id,
         (created_at at time zone 'UTC')::date as metric_date,
         count(*) filter (where conversion_type = 'lead')::integer as leads_count,
         count(*) filter (where conversion_type = 'upgrade')::integer as upgrades_count,
         count(*) filter (where conversion_type = 'migration_start')::integer as migration_starts_count,
         count(*) filter (where conversion_type = 'migration_paid')::integer as migration_paid_count,
         coalesce(sum(value_amount) filter (where conversion_type in ('upgrade','migration_paid')), 0)::numeric(14,2) as revenue_amount
  from conversions
  group by 1,2
),
events_daily as (
  select channel_id,
         (occurred_at at time zone 'UTC')::date as metric_date,
         count(*) filter (where event_name = 'comments_opened')::integer as comments_opened_count,
         count(*) filter (where event_name = 'comment_created')::integer as comment_created_events_count,
         count(*) filter (where event_name = 'tracked_button_impression')::integer as tracked_button_impressions_count,
         count(*) filter (where event_name = 'lead_magnet_viewed')::integer as lead_magnet_viewed_count,
         count(*) filter (where event_name = 'lead_magnet_clicked')::integer as lead_magnet_clicked_count,
         count(*) filter (where event_name = 'channel_connect_started')::integer as channel_connect_started_count,
         count(*) filter (where event_name = 'channel_connect_completed')::integer as channel_connect_completed_count,
         count(*) filter (where event_name = 'upgrade_clicked')::integer as upgrade_clicked_count,
         count(*) filter (where event_name = 'upgrade_completed')::integer as upgrade_completed_count,
         count(*) filter (where event_name = 'bot_started')::integer as bot_started_count,
         count(*) filter (where event_name = 'miniapp_opened')::integer as miniapp_opened_count,
         count(*) filter (where event_name = 'profile_card_opened')::integer as profile_card_opened_count,
         count(*) filter (where event_name = 'profile_connect_clicked')::integer as profile_connect_clicked_count
  from events
  group by 1,2
)
select
  b.metric_date,
  b.channel_id,
  coalesce(pd.post_count, 0) as post_count,
  coalesce(cd.comments_count, 0) as comments_count,
  coalesce(cd.published_comments_count, 0) as published_comments_count,
  coalesce(cd.commenters_uniq, 0) as commenters_uniq,
  coalesce(rd.reactions_count, 0) as reactions_count,
  coalesce(rd.reactors_uniq, 0) as reactors_uniq,
  coalesce(pvd.poll_votes_count, 0) as poll_votes_count,
  coalesce(pvd.poll_voters_uniq, 0) as poll_voters_uniq,
  coalesce(bcd.button_clicks_count, 0) as button_clicks_count,
  coalesce(bcd.button_unique_users, 0) as button_unique_users,
  coalesce(bcd.button_unique_sessions, 0) as button_unique_sessions,
  coalesce(sd.sessions_count, 0) as sessions_count,
  coalesce(sd.unique_visitors, 0) as unique_visitors,
  coalesce(md.moderation_checks_count, 0) as moderation_checks_count,
  coalesce(md.blocked_comments_count, 0) as blocked_comments_count,
  coalesce(md.flagged_comments_count, 0) as flagged_comments_count,
  coalesce(md.queued_comments_count, 0) as queued_comments_count,
  coalesce(md.moderation_avg_latency_ms, 0)::numeric(14,2) as moderation_avg_latency_ms,
  coalesce(md.moderation_avg_score, 0)::numeric(14,5) as moderation_avg_score,
  coalesce(cv.leads_count, 0) as leads_count,
  coalesce(cv.upgrades_count, 0) as upgrades_count,
  coalesce(cv.migration_starts_count, 0) as migration_starts_count,
  coalesce(cv.migration_paid_count, 0) as migration_paid_count,
  coalesce(cv.revenue_amount, 0)::numeric(14,2) as revenue_amount,
  coalesce(ev.comments_opened_count, 0) as comments_opened_count,
  coalesce(ev.comment_created_events_count, 0) as comment_created_events_count,
  coalesce(ev.tracked_button_impressions_count, 0) as tracked_button_impressions_count,
  coalesce(ev.lead_magnet_viewed_count, 0) as lead_magnet_viewed_count,
  coalesce(ev.lead_magnet_clicked_count, 0) as lead_magnet_clicked_count,
  coalesce(ev.channel_connect_started_count, 0) as channel_connect_started_count,
  coalesce(ev.channel_connect_completed_count, 0) as channel_connect_completed_count,
  coalesce(ev.upgrade_clicked_count, 0) as upgrade_clicked_count,
  coalesce(ev.upgrade_completed_count, 0) as upgrade_completed_count,
  coalesce(ev.bot_started_count, 0) as bot_started_count,
  coalesce(ev.miniapp_opened_count, 0) as miniapp_opened_count,
  coalesce(ev.profile_card_opened_count, 0) as profile_card_opened_count,
  coalesce(ev.profile_connect_clicked_count, 0) as profile_connect_clicked_count,
  case when coalesce(ev.tracked_button_impressions_count, 0) > 0
       then round(coalesce(bcd.button_clicks_count, 0)::numeric / ev.tracked_button_impressions_count, 4)
       else 0::numeric
  end as tracked_button_ctr,
  case when coalesce(ev.lead_magnet_viewed_count, 0) > 0
       then round(coalesce(ev.lead_magnet_clicked_count, 0)::numeric / ev.lead_magnet_viewed_count, 4)
       else 0::numeric
  end as lead_magnet_ctr
from day_channel_base b
left join posts_daily pd on pd.channel_id = b.channel_id and pd.metric_date = b.metric_date
left join comments_daily cd on cd.channel_id = b.channel_id and cd.metric_date = b.metric_date
left join reactions_daily rd on rd.channel_id = b.channel_id and rd.metric_date = b.metric_date
left join poll_votes_daily pvd on pvd.channel_id = b.channel_id and pvd.metric_date = b.metric_date
left join button_clicks_daily bcd on bcd.channel_id = b.channel_id and bcd.metric_date = b.metric_date
left join sessions_daily sd on sd.channel_id = b.channel_id and sd.metric_date = b.metric_date
left join moderation_daily md on md.channel_id = b.channel_id and md.metric_date = b.metric_date
left join conversions_daily cv on cv.channel_id = b.channel_id and cv.metric_date = b.metric_date
left join events_daily ev on ev.channel_id = b.channel_id and ev.metric_date = b.metric_date;

create unique index mv_channel_daily_summary_uidx on mv_channel_daily_summary(metric_date, channel_id);
create index mv_channel_daily_summary_channel_idx on mv_channel_daily_summary(channel_id, metric_date desc);

-- =====================================================
-- 2) Channel weekly summary
-- =====================================================
create materialized view mv_channel_weekly_summary as
select
  date_trunc('week', metric_date::timestamp)::date as week_start,
  channel_id,
  sum(post_count)::integer as post_count,
  sum(comments_count)::integer as comments_count,
  sum(published_comments_count)::integer as published_comments_count,
  max(commenters_uniq)::integer as peak_daily_commenters_uniq,
  sum(reactions_count)::integer as reactions_count,
  sum(poll_votes_count)::integer as poll_votes_count,
  sum(button_clicks_count)::integer as button_clicks_count,
  sum(unique_visitors)::integer as unique_visitors,
  sum(blocked_comments_count)::integer as blocked_comments_count,
  sum(flagged_comments_count)::integer as flagged_comments_count,
  sum(queued_comments_count)::integer as queued_comments_count,
  round(avg(moderation_avg_latency_ms)::numeric, 2) as moderation_avg_latency_ms,
  sum(leads_count)::integer as leads_count,
  sum(upgrades_count)::integer as upgrades_count,
  sum(migration_starts_count)::integer as migration_starts_count,
  sum(migration_paid_count)::integer as migration_paid_count,
  sum(revenue_amount)::numeric(14,2) as revenue_amount,
  sum(comments_opened_count)::integer as comments_opened_count,
  sum(comment_created_events_count)::integer as comment_created_events_count,
  sum(tracked_button_impressions_count)::integer as tracked_button_impressions_count,
  sum(lead_magnet_viewed_count)::integer as lead_magnet_viewed_count,
  sum(lead_magnet_clicked_count)::integer as lead_magnet_clicked_count,
  sum(channel_connect_started_count)::integer as channel_connect_started_count,
  sum(channel_connect_completed_count)::integer as channel_connect_completed_count,
  sum(upgrade_clicked_count)::integer as upgrade_clicked_count,
  sum(upgrade_completed_count)::integer as upgrade_completed_count,
  case when sum(tracked_button_impressions_count) > 0
       then round(sum(button_clicks_count)::numeric / sum(tracked_button_impressions_count), 4)
       else 0::numeric
  end as tracked_button_ctr,
  case when sum(lead_magnet_viewed_count) > 0
       then round(sum(lead_magnet_clicked_count)::numeric / sum(lead_magnet_viewed_count), 4)
       else 0::numeric
  end as lead_magnet_ctr
from mv_channel_daily_summary
group by 1,2;

create unique index mv_channel_weekly_summary_uidx on mv_channel_weekly_summary(week_start, channel_id);
create index mv_channel_weekly_summary_channel_idx on mv_channel_weekly_summary(channel_id, week_start desc);

-- =====================================================
-- 3) Post summary
-- =====================================================
create materialized view mv_channel_post_summary as
with comments_agg as (
  select
    channel_id,
    post_id,
    count(*)::integer as comments_count,
    count(*) filter (where status = 'published')::integer as published_comments_count,
    (count(distinct user_id) filter (where user_id is not null))::integer as commenters_uniq,
    min(created_at) as first_comment_at,
    max(created_at) as last_comment_at
  from comments
  where channel_id is not null and post_id is not null
  group by 1,2
),
reactions_agg as (
  select
    c.channel_id,
    c.post_id,
    count(*)::integer as reactions_count,
    (count(distinct cr.user_id) filter (where cr.user_id is not null))::integer as reactors_uniq
  from comment_reactions cr
  join comments c on c.comment_id = cr.comment_id
  where c.channel_id is not null and c.post_id is not null
  group by 1,2
),
polls_agg as (
  select
    p.channel_id,
    p.post_id,
    count(distinct p.poll_id)::integer as polls_count,
    count(pv.vote_id)::integer as poll_votes_count,
    (count(distinct pv.user_id) filter (where pv.user_id is not null))::integer as poll_voters_uniq
  from polls p
  left join poll_votes pv on pv.poll_id = p.poll_id
  where p.channel_id is not null and p.post_id is not null
  group by 1,2
),
buttons_agg as (
  select
    channel_id,
    post_id,
    count(*)::integer as button_clicks_count,
    count(*) filter (where is_unique_for_user)::integer as button_unique_users,
    count(*) filter (where is_unique_for_session)::integer as button_unique_sessions
  from tracked_button_clicks
  where channel_id is not null and post_id is not null
  group by 1,2
),
open_agg as (
  select
    channel_id,
    post_id,
    count(*) filter (where event_name = 'comments_opened')::integer as comments_opened_count,
    count(*) filter (where event_name = 'tracked_button_impression')::integer as tracked_button_impressions_count
  from events
  where channel_id is not null and post_id is not null
  group by 1,2
)
select
  p.channel_id,
  p.post_id,
  p.message_id,
  p.comment_key,
  p.original_text,
  p.published_at,
  p.created_at,
  p.updated_at,
  coalesce(ca.comments_count, 0) as comments_count,
  coalesce(ca.published_comments_count, 0) as published_comments_count,
  coalesce(ca.commenters_uniq, 0) as commenters_uniq,
  coalesce(ra.reactions_count, 0) as reactions_count,
  coalesce(ra.reactors_uniq, 0) as reactors_uniq,
  coalesce(pa.polls_count, 0) as polls_count,
  coalesce(pa.poll_votes_count, 0) as poll_votes_count,
  coalesce(pa.poll_voters_uniq, 0) as poll_voters_uniq,
  coalesce(ba.button_clicks_count, 0) as button_clicks_count,
  coalesce(ba.button_unique_users, 0) as button_unique_users,
  coalesce(ba.button_unique_sessions, 0) as button_unique_sessions,
  coalesce(oa.comments_opened_count, 0) as comments_opened_count,
  coalesce(oa.tracked_button_impressions_count, 0) as tracked_button_impressions_count,
  case when coalesce(oa.tracked_button_impressions_count, 0) > 0
       then round(coalesce(ba.button_clicks_count, 0)::numeric / oa.tracked_button_impressions_count, 4)
       else 0::numeric
  end as tracked_button_ctr,
  ca.first_comment_at,
  ca.last_comment_at
from posts p
left join comments_agg ca on ca.channel_id = p.channel_id and ca.post_id = p.post_id
left join reactions_agg ra on ra.channel_id = p.channel_id and ra.post_id = p.post_id
left join polls_agg pa on pa.channel_id = p.channel_id and pa.post_id = p.post_id
left join buttons_agg ba on ba.channel_id = p.channel_id and ba.post_id = p.post_id
left join open_agg oa on oa.channel_id = p.channel_id and oa.post_id = p.post_id;

create unique index mv_channel_post_summary_uidx on mv_channel_post_summary(channel_id, post_id);
create index mv_channel_post_summary_comment_key_idx on mv_channel_post_summary(comment_key);
create index mv_channel_post_summary_activity_idx on mv_channel_post_summary(channel_id, last_comment_at desc nulls last);

-- =====================================================
-- 4) Acquisition summary
-- =====================================================
create materialized view mv_acquisition_summary as
with touches as (
  select
    channel_id,
    source,
    medium,
    campaign,
    content,
    creative_id,
    placement_id,
    referral_code,
    count(*)::integer as touches_count,
    count(distinct session_id)::integer as touch_sessions,
    (count(distinct user_id) filter (where user_id is not null))::integer as touch_users,
    min(touched_at) as first_touch_at,
    max(touched_at) as last_touch_at
  from acquisition_touches
  group by 1,2,3,4,5,6,7,8
),
session_rollup as (
  select
    at.channel_id,
    at.source,
    at.medium,
    at.campaign,
    at.content,
    at.creative_id,
    at.placement_id,
    at.referral_code,
    count(distinct s.session_id)::integer as sessions_count,
    (count(distinct s.user_id) filter (where s.user_id is not null))::integer as unique_users,
    (count(distinct e.session_id) filter (where e.event_name = 'bot_started' and e.session_id is not null))::integer as bot_started_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'miniapp_opened' and e.session_id is not null))::integer as miniapp_opened_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'comments_opened' and e.session_id is not null))::integer as comments_opened_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'comment_created' and e.session_id is not null))::integer as comment_created_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'lead_magnet_clicked' and e.session_id is not null))::integer as lead_magnet_clicked_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'channel_connect_completed' and e.session_id is not null))::integer as channel_connect_completed_sessions,
    (count(distinct e.session_id) filter (where e.event_name = 'upgrade_completed' and e.session_id is not null))::integer as upgrade_completed_sessions
  from acquisition_touches at
  left join sessions s on s.session_id = at.session_id
  left join events e on e.session_id = at.session_id
  group by 1,2,3,4,5,6,7,8
),
conversion_rollup as (
  select
    at.channel_id,
    at.source,
    at.medium,
    at.campaign,
    at.content,
    at.creative_id,
    at.placement_id,
    at.referral_code,
    count(c.conversion_id)::integer as conversions_count,
    count(*) filter (where c.conversion_type = 'lead')::integer as leads_count,
    count(*) filter (where c.conversion_type = 'upgrade')::integer as upgrades_count,
    count(*) filter (where c.conversion_type = 'migration_start')::integer as migration_starts_count,
    count(*) filter (where c.conversion_type = 'migration_paid')::integer as migration_paid_count,
    coalesce(sum(c.value_amount), 0)::numeric(14,2) as revenue_amount
  from acquisition_touches at
  left join conversions c on c.attributed_touch_id = at.touch_id
  group by 1,2,3,4,5,6,7,8
)
select
  t.channel_id,
  t.source,
  t.medium,
  t.campaign,
  t.content,
  t.creative_id,
  t.placement_id,
  t.referral_code,
  t.touches_count,
  t.touch_sessions,
  t.touch_users,
  coalesce(sr.sessions_count, 0) as sessions_count,
  coalesce(sr.unique_users, 0) as unique_users,
  coalesce(sr.bot_started_sessions, 0) as bot_started_sessions,
  coalesce(sr.miniapp_opened_sessions, 0) as miniapp_opened_sessions,
  coalesce(sr.comments_opened_sessions, 0) as comments_opened_sessions,
  coalesce(sr.comment_created_sessions, 0) as comment_created_sessions,
  coalesce(sr.lead_magnet_clicked_sessions, 0) as lead_magnet_clicked_sessions,
  coalesce(sr.channel_connect_completed_sessions, 0) as channel_connect_completed_sessions,
  coalesce(sr.upgrade_completed_sessions, 0) as upgrade_completed_sessions,
  coalesce(cr.conversions_count, 0) as conversions_count,
  coalesce(cr.leads_count, 0) as leads_count,
  coalesce(cr.upgrades_count, 0) as upgrades_count,
  coalesce(cr.migration_starts_count, 0) as migration_starts_count,
  coalesce(cr.migration_paid_count, 0) as migration_paid_count,
  coalesce(cr.revenue_amount, 0)::numeric(14,2) as revenue_amount,
  case when coalesce(sr.sessions_count, 0) > 0
       then round(coalesce(sr.comment_created_sessions, 0)::numeric / sr.sessions_count, 4)
       else 0::numeric
  end as session_to_comment_rate,
  case when coalesce(sr.sessions_count, 0) > 0
       then round(coalesce(cr.leads_count, 0)::numeric / sr.sessions_count, 4)
       else 0::numeric
  end as session_to_lead_rate,
  case when coalesce(sr.sessions_count, 0) > 0
       then round(coalesce(cr.upgrades_count, 0)::numeric / sr.sessions_count, 4)
       else 0::numeric
  end as session_to_upgrade_rate,
  case when coalesce(cr.upgrades_count, 0) > 0
       then round(coalesce(cr.revenue_amount, 0)::numeric / cr.upgrades_count, 2)
       else 0::numeric
  end as revenue_per_upgrade,
  t.first_touch_at,
  t.last_touch_at
from touches t
left join session_rollup sr using (channel_id, source, medium, campaign, content, creative_id, placement_id, referral_code)
left join conversion_rollup cr using (channel_id, source, medium, campaign, content, creative_id, placement_id, referral_code);

create index mv_acquisition_summary_channel_idx on mv_acquisition_summary(channel_id, source, medium);
create index mv_acquisition_summary_campaign_idx on mv_acquisition_summary(campaign, creative_id, placement_id);

-- =====================================================
-- 5) Tracked buttons daily performance
-- =====================================================
create materialized view mv_button_performance_daily as
with impressions as (
  select
    coalesce(channel_id, properties->>'channel_id') as channel_id,
    coalesce(post_id, properties->>'post_id') as post_id,
    properties->>'button_id' as button_id,
    coalesce(properties->>'placement', 'unknown') as placement,
    (occurred_at at time zone 'UTC')::date as metric_date,
    count(*)::integer as impressions_count,
    (count(distinct session_id) filter (where session_id is not null))::integer as impression_sessions,
    (count(distinct user_id) filter (where user_id is not null))::integer as impression_users
  from events
  where event_name = 'tracked_button_impression'
    and properties ? 'button_id'
  group by 1,2,3,4,5
),
clicks as (
  select
    channel_id,
    post_id,
    button_id,
    coalesce(placement, 'unknown') as placement,
    (clicked_at at time zone 'UTC')::date as metric_date,
    count(*)::integer as clicks_count,
    count(*) filter (where is_unique_for_session)::integer as unique_session_clicks,
    count(*) filter (where is_unique_for_user)::integer as unique_user_clicks,
    (count(distinct session_id) filter (where session_id is not null))::integer as click_sessions,
    (count(distinct user_id) filter (where user_id is not null))::integer as click_users
  from tracked_button_clicks
  group by 1,2,3,4,5
),
base as (
  select distinct channel_id, post_id, button_id, placement, metric_date from impressions
  union
  select distinct channel_id, post_id, button_id, placement, metric_date from clicks
)
select
  b.metric_date,
  b.channel_id,
  b.post_id,
  b.button_id,
  tb.button_text,
  coalesce(tb.placement, b.placement) as placement,
  tb.target_url,
  tb.target_action,
  tb.ab_variant,
  coalesce(i.impressions_count, 0) as impressions_count,
  coalesce(i.impression_sessions, 0) as impression_sessions,
  coalesce(i.impression_users, 0) as impression_users,
  coalesce(c.clicks_count, 0) as clicks_count,
  coalesce(c.unique_session_clicks, 0) as unique_session_clicks,
  coalesce(c.unique_user_clicks, 0) as unique_user_clicks,
  coalesce(c.click_sessions, 0) as click_sessions,
  coalesce(c.click_users, 0) as click_users,
  case when coalesce(i.impressions_count, 0) > 0
       then round(coalesce(c.clicks_count, 0)::numeric / i.impressions_count, 4)
       else 0::numeric
  end as ctr,
  case when coalesce(i.impression_users, 0) > 0
       then round(coalesce(c.unique_user_clicks, 0)::numeric / i.impression_users, 4)
       else 0::numeric
  end as unique_user_ctr
from base b
left join impressions i on i.channel_id is not distinct from b.channel_id and i.post_id is not distinct from b.post_id and i.button_id = b.button_id and i.placement = b.placement and i.metric_date = b.metric_date
left join clicks c on c.channel_id is not distinct from b.channel_id and c.post_id is not distinct from b.post_id and c.button_id = b.button_id and c.placement = b.placement and c.metric_date = b.metric_date
left join tracked_buttons tb on tb.button_id = b.button_id;

create unique index mv_button_performance_daily_uidx on mv_button_performance_daily(metric_date, button_id, (coalesce(channel_id, '')), (coalesce(post_id, '')), placement);
create index mv_button_performance_daily_channel_idx on mv_button_performance_daily(channel_id, metric_date desc);

-- =====================================================
-- 6) Poll performance summary
-- =====================================================
create materialized view mv_poll_performance as
with option_votes as (
  select
    p.channel_id,
    p.post_id,
    p.poll_id,
    p.title,
    p.placement,
    p.status,
    p.created_at,
    po.option_id,
    po.option_text,
    po.sort_order,
    count(pv.vote_id)::integer as votes_count,
    (count(distinct pv.user_id) filter (where pv.user_id is not null))::integer as voters_uniq
  from polls p
  join poll_options po on po.poll_id = p.poll_id
  left join poll_votes pv on pv.poll_id = p.poll_id and pv.option_id = po.option_id
  group by 1,2,3,4,5,6,7,8,9,10
),
poll_totals as (
  select
    channel_id,
    post_id,
    poll_id,
    title,
    placement,
    status,
    created_at,
    sum(votes_count)::integer as total_votes_count,
    sum(voters_uniq)::integer as total_voters_uniq
  from option_votes
  group by 1,2,3,4,5,6,7
),
ranked_options as (
  select
    ov.*,
    pt.total_votes_count,
    pt.total_voters_uniq,
    case when pt.total_votes_count > 0 then round(ov.votes_count::numeric / pt.total_votes_count, 4) else 0::numeric end as vote_share,
    row_number() over (partition by ov.poll_id order by ov.votes_count desc, ov.sort_order asc, ov.option_id asc) as rn
  from option_votes ov
  join poll_totals pt using (channel_id, post_id, poll_id, title, placement, status, created_at)
)
select
  pt.channel_id,
  pt.post_id,
  pt.poll_id,
  pt.title,
  pt.placement,
  pt.status,
  pt.created_at,
  pt.total_votes_count,
  pt.total_voters_uniq,
  ro.option_id as top_option_id,
  ro.option_text as top_option_text,
  ro.votes_count as top_option_votes_count,
  ro.vote_share as top_option_vote_share,
  (
    select jsonb_agg(
      jsonb_build_object(
        'option_id', x.option_id,
        'option_text', x.option_text,
        'sort_order', x.sort_order,
        'votes_count', x.votes_count,
        'voters_uniq', x.voters_uniq,
        'vote_share', x.vote_share
      ) order by x.sort_order asc
    )
    from ranked_options x
    where x.poll_id = pt.poll_id
  ) as options_breakdown
from poll_totals pt
left join ranked_options ro on ro.poll_id = pt.poll_id and ro.rn = 1;

create unique index mv_poll_performance_uidx on mv_poll_performance(poll_id);
create index mv_poll_performance_channel_idx on mv_poll_performance(channel_id, created_at desc);

-- =====================================================
-- 7) Moderation summaries
-- =====================================================
create materialized view mv_moderation_daily_summary as
select
  channel_id,
  (created_at at time zone 'UTC')::date as metric_date,
  mode,
  count(*)::integer as checks_count,
  count(*) filter (where verdict = 'allow')::integer as allow_count,
  count(*) filter (where verdict = 'block')::integer as block_count,
  count(*) filter (where verdict = 'flag')::integer as flag_count,
  count(*) filter (where verdict = 'queue')::integer as queue_count,
  round(avg(latency_ms)::numeric, 2) as avg_latency_ms,
  round(avg(score)::numeric, 5) as avg_score,
  count(*) filter (where array_length(matched_words, 1) > 0)::integer as matched_words_count,
  count(*) filter (where array_length(matched_regex, 1) > 0)::integer as matched_regex_count
from moderation_decisions
group by 1,2,3;

create unique index mv_moderation_daily_summary_uidx on mv_moderation_daily_summary(channel_id, metric_date, mode);
create index mv_moderation_daily_summary_metric_idx on mv_moderation_daily_summary(metric_date desc, channel_id, mode);

create materialized view mv_moderation_label_summary as
select
  md.channel_id,
  (md.created_at at time zone 'UTC')::date as metric_date,
  md.mode,
  lbl.label,
  count(*)::integer as label_hits,
  count(*) filter (where md.verdict = 'block')::integer as block_hits,
  count(*) filter (where md.verdict = 'flag')::integer as flag_hits,
  count(*) filter (where md.verdict = 'queue')::integer as queue_hits
from moderation_decisions md
cross join lateral unnest(coalesce(md.labels, array[]::text[])) as lbl(label)
group by 1,2,3,4;

create unique index mv_moderation_label_summary_uidx on mv_moderation_label_summary(channel_id, metric_date, mode, label);
create index mv_moderation_label_summary_metric_idx on mv_moderation_label_summary(metric_date desc, channel_id, label);

-- =====================================================
-- 8) Funnel summary
-- =====================================================
create materialized view mv_funnel_daily_summary as
with event_counts as (
  select
    channel_id,
    (occurred_at at time zone 'UTC')::date as metric_date,
    (count(distinct session_id) filter (where event_name = 'bot_started' and session_id is not null))::integer as bot_started_sessions,
    (count(distinct session_id) filter (where event_name = 'miniapp_opened' and session_id is not null))::integer as miniapp_opened_sessions,
    (count(distinct session_id) filter (where event_name = 'comments_opened' and session_id is not null))::integer as comments_opened_sessions,
    (count(distinct session_id) filter (where event_name = 'comment_created' and session_id is not null))::integer as comment_created_sessions,
    (count(distinct session_id) filter (where event_name = 'lead_magnet_clicked' and session_id is not null))::integer as lead_magnet_clicked_sessions,
    (count(distinct session_id) filter (where event_name = 'channel_connect_started' and session_id is not null))::integer as channel_connect_started_sessions,
    (count(distinct session_id) filter (where event_name = 'channel_connect_completed' and session_id is not null))::integer as channel_connect_completed_sessions,
    (count(distinct session_id) filter (where event_name = 'upgrade_clicked' and session_id is not null))::integer as upgrade_clicked_sessions,
    (count(distinct session_id) filter (where event_name = 'upgrade_completed' and session_id is not null))::integer as upgrade_completed_sessions
  from events
  group by 1,2
),
conversion_counts as (
  select
    channel_id,
    (created_at at time zone 'UTC')::date as metric_date,
    (count(distinct session_id) filter (where conversion_type = 'lead' and session_id is not null))::integer as lead_sessions,
    (count(distinct session_id) filter (where conversion_type = 'upgrade' and session_id is not null))::integer as paid_upgrade_sessions,
    (count(distinct session_id) filter (where conversion_type = 'migration_start' and session_id is not null))::integer as migration_start_sessions,
    (count(distinct session_id) filter (where conversion_type = 'migration_paid' and session_id is not null))::integer as migration_paid_sessions,
    coalesce(sum(value_amount) filter (where conversion_type in ('upgrade','migration_paid')), 0)::numeric(14,2) as revenue_amount
  from conversions
  group by 1,2
),
base as (
  select distinct channel_id, metric_date from event_counts
  union
  select distinct channel_id, metric_date from conversion_counts
)
select
  b.channel_id,
  b.metric_date,
  coalesce(ec.bot_started_sessions, 0) as bot_started_sessions,
  coalesce(ec.miniapp_opened_sessions, 0) as miniapp_opened_sessions,
  coalesce(ec.comments_opened_sessions, 0) as comments_opened_sessions,
  coalesce(ec.comment_created_sessions, 0) as comment_created_sessions,
  coalesce(ec.lead_magnet_clicked_sessions, 0) as lead_magnet_clicked_sessions,
  coalesce(ec.channel_connect_started_sessions, 0) as channel_connect_started_sessions,
  coalesce(ec.channel_connect_completed_sessions, 0) as channel_connect_completed_sessions,
  coalesce(ec.upgrade_clicked_sessions, 0) as upgrade_clicked_sessions,
  coalesce(ec.upgrade_completed_sessions, 0) as upgrade_completed_sessions,
  coalesce(cc.lead_sessions, 0) as lead_sessions,
  coalesce(cc.paid_upgrade_sessions, 0) as paid_upgrade_sessions,
  coalesce(cc.migration_start_sessions, 0) as migration_start_sessions,
  coalesce(cc.migration_paid_sessions, 0) as migration_paid_sessions,
  coalesce(cc.revenue_amount, 0)::numeric(14,2) as revenue_amount,
  case when coalesce(ec.bot_started_sessions, 0) > 0
       then round(coalesce(ec.miniapp_opened_sessions, 0)::numeric / ec.bot_started_sessions, 4)
       else 0::numeric
  end as bot_to_miniapp_rate,
  case when coalesce(ec.miniapp_opened_sessions, 0) > 0
       then round(coalesce(ec.comments_opened_sessions, 0)::numeric / ec.miniapp_opened_sessions, 4)
       else 0::numeric
  end as miniapp_to_comments_opened_rate,
  case when coalesce(ec.comments_opened_sessions, 0) > 0
       then round(coalesce(ec.comment_created_sessions, 0)::numeric / ec.comments_opened_sessions, 4)
       else 0::numeric
  end as comments_opened_to_comment_created_rate,
  case when coalesce(ec.comment_created_sessions, 0) > 0
       then round(coalesce(ec.channel_connect_completed_sessions, 0)::numeric / ec.comment_created_sessions, 4)
       else 0::numeric
  end as comment_created_to_channel_connect_rate,
  case when coalesce(ec.channel_connect_completed_sessions, 0) > 0
       then round(coalesce(ec.upgrade_completed_sessions, 0)::numeric / ec.channel_connect_completed_sessions, 4)
       else 0::numeric
  end as channel_connect_to_upgrade_rate
from base b
left join event_counts ec on ec.channel_id = b.channel_id and ec.metric_date = b.metric_date
left join conversion_counts cc on cc.channel_id = b.channel_id and cc.metric_date = b.metric_date;

create unique index mv_funnel_daily_summary_uidx on mv_funnel_daily_summary(channel_id, metric_date);
create index mv_funnel_daily_summary_metric_idx on mv_funnel_daily_summary(metric_date desc, channel_id);

-- =====================================================
-- 9) Retention cohorts
-- =====================================================
create materialized view mv_retention_cohorts as
with first_seen as (
  select
    user_id,
    min((first_touch_at at time zone 'UTC')::date) as cohort_date
  from sessions
  where user_id is not null
  group by 1
),
activity as (
  select distinct
    s.user_id,
    s.channel_id,
    fs.cohort_date,
    (s.last_touch_at at time zone 'UTC')::date as activity_date,
    ((s.last_touch_at at time zone 'UTC')::date - fs.cohort_date) as day_number
  from sessions s
  join first_seen fs on fs.user_id = s.user_id
  where s.user_id is not null
    and (s.last_touch_at at time zone 'UTC')::date >= fs.cohort_date
),
cohort_size as (
  select cohort_date, count(distinct user_id)::integer as cohort_users
  from first_seen
  group by 1
)
select
  a.cohort_date,
  a.channel_id,
  (count(distinct a.user_id) filter (where a.day_number = 0))::integer as d0_users,
  (count(distinct a.user_id) filter (where a.day_number = 1))::integer as d1_users,
  (count(distinct a.user_id) filter (where a.day_number = 3))::integer as d3_users,
  (count(distinct a.user_id) filter (where a.day_number = 7))::integer as d7_users,
  (count(distinct a.user_id) filter (where a.day_number = 14))::integer as d14_users,
  (count(distinct a.user_id) filter (where a.day_number = 30))::integer as d30_users,
  max(cs.cohort_users)::integer as cohort_users,
  case when max(cs.cohort_users) > 0 then round(count(distinct a.user_id) filter (where a.day_number = 1)::numeric / max(cs.cohort_users), 4) else 0::numeric end as d1_retention,
  case when max(cs.cohort_users) > 0 then round(count(distinct a.user_id) filter (where a.day_number = 7)::numeric / max(cs.cohort_users), 4) else 0::numeric end as d7_retention,
  case when max(cs.cohort_users) > 0 then round(count(distinct a.user_id) filter (where a.day_number = 30)::numeric / max(cs.cohort_users), 4) else 0::numeric end as d30_retention
from activity a
join cohort_size cs on cs.cohort_date = a.cohort_date
group by 1,2;

create unique index mv_retention_cohorts_uidx on mv_retention_cohorts(cohort_date, (coalesce(channel_id, '')));
create index mv_retention_cohorts_channel_idx on mv_retention_cohorts(channel_id, cohort_date desc);

-- =====================================================
-- 10) Refresh helper
-- =====================================================
create or replace function refresh_analytics_materialized_views()
returns void
language plpgsql
as $$
begin
  refresh materialized view mv_channel_daily_summary;
  refresh materialized view mv_channel_weekly_summary;
  refresh materialized view mv_channel_post_summary;
  refresh materialized view mv_acquisition_summary;
  refresh materialized view mv_button_performance_daily;
  refresh materialized view mv_poll_performance;
  refresh materialized view mv_moderation_daily_summary;
  refresh materialized view mv_moderation_label_summary;
  refresh materialized view mv_funnel_daily_summary;
  refresh materialized view mv_retention_cohorts;
end;
$$;

commit;
