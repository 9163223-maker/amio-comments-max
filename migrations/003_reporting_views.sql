-- Amio for MAX
-- Reporting views for admin panel and ready dashboard widgets
-- Version: 14.12.4

begin;

set search_path to public;

drop view if exists v_reporting_channel_kpi_today cascade;
drop view if exists v_reporting_channel_overview_30d cascade;
drop view if exists v_reporting_channel_trends_30d cascade;
drop view if exists v_reporting_top_posts_30d cascade;
drop view if exists v_reporting_button_top_30d cascade;
drop view if exists v_reporting_poll_top cascade;
drop view if exists v_reporting_acquisition_top_30d cascade;
drop view if exists v_reporting_funnel_latest_30d cascade;
drop view if exists v_reporting_moderation_alerts_30d cascade;
drop view if exists v_reporting_retention_latest cascade;
drop view if exists v_reporting_channel_scoreboard cascade;
drop view if exists v_reporting_admin_home cascade;

create view v_reporting_channel_kpi_today as
select
  cds.channel_id,
  cds.metric_date,
  cds.post_count,
  cds.comments_count,
  cds.published_comments_count,
  cds.commenters_uniq,
  cds.reactions_count,
  cds.poll_votes_count,
  cds.button_clicks_count,
  cds.unique_visitors,
  cds.blocked_comments_count,
  cds.flagged_comments_count,
  cds.queued_comments_count,
  cds.leads_count,
  cds.upgrades_count,
  cds.migration_starts_count,
  cds.migration_paid_count,
  cds.revenue_amount,
  cds.comments_opened_count,
  cds.comment_created_events_count,
  cds.tracked_button_impressions_count,
  cds.tracked_button_ctr,
  cds.lead_magnet_viewed_count,
  cds.lead_magnet_clicked_count,
  cds.lead_magnet_ctr,
  cds.channel_connect_started_count,
  cds.channel_connect_completed_count,
  cds.upgrade_clicked_count,
  cds.upgrade_completed_count,
  cds.bot_started_count,
  cds.miniapp_opened_count,
  cds.profile_card_opened_count,
  cds.profile_connect_clicked_count
from mv_channel_daily_summary cds
where cds.metric_date = current_date;

create view v_reporting_channel_overview_30d as
select
  cds.channel_id,
  min(cds.metric_date) as period_start,
  max(cds.metric_date) as period_end,
  sum(cds.post_count)::integer as posts_30d,
  sum(cds.comments_count)::integer as comments_30d,
  sum(cds.published_comments_count)::integer as published_comments_30d,
  sum(cds.commenters_uniq)::integer as daily_commenters_total_30d,
  max(cds.commenters_uniq)::integer as peak_daily_commenters_30d,
  sum(cds.reactions_count)::integer as reactions_30d,
  sum(cds.poll_votes_count)::integer as poll_votes_30d,
  sum(cds.button_clicks_count)::integer as button_clicks_30d,
  sum(cds.unique_visitors)::integer as unique_visitors_30d,
  sum(cds.blocked_comments_count)::integer as blocked_comments_30d,
  sum(cds.flagged_comments_count)::integer as flagged_comments_30d,
  sum(cds.queued_comments_count)::integer as queued_comments_30d,
  sum(cds.leads_count)::integer as leads_30d,
  sum(cds.upgrades_count)::integer as upgrades_30d,
  sum(cds.migration_starts_count)::integer as migration_starts_30d,
  sum(cds.migration_paid_count)::integer as migration_paid_30d,
  sum(cds.revenue_amount)::numeric(14,2) as revenue_30d,
  sum(cds.tracked_button_impressions_count)::integer as tracked_button_impressions_30d,
  sum(cds.lead_magnet_viewed_count)::integer as lead_magnet_views_30d,
  sum(cds.lead_magnet_clicked_count)::integer as lead_magnet_clicks_30d,
  case when sum(cds.tracked_button_impressions_count) > 0 then round(sum(cds.button_clicks_count)::numeric / sum(cds.tracked_button_impressions_count), 4) else 0::numeric end as tracked_button_ctr_30d,
  case when sum(cds.lead_magnet_viewed_count) > 0 then round(sum(cds.lead_magnet_clicked_count)::numeric / sum(cds.lead_magnet_viewed_count), 4) else 0::numeric end as lead_magnet_ctr_30d,
  case when sum(cds.unique_visitors) > 0 then round(sum(cds.comments_opened_count)::numeric / sum(cds.unique_visitors), 4) else 0::numeric end as comments_open_rate_30d,
  case when sum(cds.comments_opened_count) > 0 then round(sum(cds.comment_created_events_count)::numeric / sum(cds.comments_opened_count), 4) else 0::numeric end as comment_create_rate_30d,
  case when sum(cds.channel_connect_started_count) > 0 then round(sum(cds.channel_connect_completed_count)::numeric / sum(cds.channel_connect_started_count), 4) else 0::numeric end as channel_connect_completion_rate_30d,
  case when sum(cds.upgrade_clicked_count) > 0 then round(sum(cds.upgrade_completed_count)::numeric / sum(cds.upgrade_clicked_count), 4) else 0::numeric end as upgrade_completion_rate_30d
from mv_channel_daily_summary cds
where cds.metric_date >= current_date - interval '29 day'
group by cds.channel_id;

create view v_reporting_channel_trends_30d as
select
  channel_id,
  metric_date,
  comments_count,
  reactions_count,
  button_clicks_count,
  unique_visitors,
  blocked_comments_count,
  leads_count,
  upgrades_count,
  revenue_amount,
  tracked_button_ctr,
  lead_magnet_ctr
from mv_channel_daily_summary
where metric_date >= current_date - interval '29 day';

create view v_reporting_top_posts_30d as
select
  cps.channel_id,
  cps.post_id,
  cps.comment_key,
  cps.message_id,
  cps.original_text,
  cps.comments_count,
  cps.published_comments_count,
  cps.commenters_uniq,
  cps.reactions_count,
  cps.poll_votes_count,
  cps.button_clicks_count,
  cps.unique_visitors,
  cps.blocked_comments_count,
  cps.flagged_comments_count,
  cps.leads_count,
  cps.upgrades_count,
  cps.revenue_amount,
  cps.comments_opened_count,
  cps.comment_created_events_count,
  cps.tracked_button_impressions_count,
  cps.tracked_button_ctr,
  cps.lead_magnet_viewed_count,
  cps.lead_magnet_clicked_count,
  cps.lead_magnet_ctr,
  cps.last_activity_at
from mv_channel_post_summary cps
where cps.last_activity_at >= now() - interval '30 day'
order by cps.comments_count desc, cps.button_clicks_count desc, cps.last_activity_at desc;

create view v_reporting_button_top_30d as
select
  bpd.channel_id,
  bpd.button_id,
  bpd.button_text,
  bpd.placement,
  min(bpd.metric_date) as period_start,
  max(bpd.metric_date) as period_end,
  sum(bpd.impressions_count)::integer as impressions_30d,
  sum(bpd.clicks_count)::integer as clicks_30d,
  sum(bpd.unique_users_count)::integer as unique_users_30d,
  sum(bpd.unique_sessions_count)::integer as unique_sessions_30d,
  case when sum(bpd.impressions_count) > 0 then round(sum(bpd.clicks_count)::numeric / sum(bpd.impressions_count), 4) else 0::numeric end as ctr_30d
from mv_button_performance_daily bpd
where bpd.metric_date >= current_date - interval '29 day'
group by bpd.channel_id, bpd.button_id, bpd.button_text, bpd.placement
order by clicks_30d desc, ctr_30d desc;

create view v_reporting_poll_top as
select
  pp.channel_id,
  pp.poll_id,
  pp.post_id,
  pp.title,
  pp.placement,
  pp.status,
  pp.votes_count,
  pp.voters_uniq,
  pp.last_vote_at
from mv_poll_performance pp
order by pp.votes_count desc, pp.last_vote_at desc nulls last;

create view v_reporting_acquisition_top_30d as
select
  channel_id,
  source,
  medium,
  campaign,
  content,
  creative_id,
  placement_id,
  influencer_id,
  referral_code,
  sum(sessions_count)::integer as sessions_30d,
  sum(users_count)::integer as users_30d,
  sum(bot_started_count)::integer as bot_started_30d,
  sum(miniapp_opened_count)::integer as miniapp_opened_30d,
  sum(lead_count)::integer as leads_30d,
  sum(upgrade_count)::integer as upgrades_30d,
  sum(migration_start_count)::integer as migration_starts_30d,
  sum(revenue_amount)::numeric(14,2) as revenue_30d,
  case when sum(sessions_count) > 0 then round(sum(miniapp_opened_count)::numeric / sum(sessions_count), 4) else 0::numeric end as miniapp_open_rate_30d,
  case when sum(miniapp_opened_count) > 0 then round(sum(lead_count)::numeric / sum(miniapp_opened_count), 4) else 0::numeric end as lead_rate_30d,
  case when sum(lead_count) > 0 then round(sum(upgrade_count)::numeric / sum(lead_count), 4) else 0::numeric end as lead_to_upgrade_rate_30d
from mv_acquisition_summary
where metric_date >= current_date - interval '29 day'
group by channel_id, source, medium, campaign, content, creative_id, placement_id, influencer_id, referral_code
order by revenue_30d desc, upgrades_30d desc, sessions_30d desc;

create view v_reporting_funnel_latest_30d as
select
  channel_id,
  min(metric_date) as period_start,
  max(metric_date) as period_end,
  sum(bot_started_count)::integer as bot_started_30d,
  sum(miniapp_opened_count)::integer as miniapp_opened_30d,
  sum(comments_opened_count)::integer as comments_opened_30d,
  sum(comment_created_count)::integer as comments_created_30d,
  sum(lead_magnet_viewed_count)::integer as lead_magnet_viewed_30d,
  sum(lead_magnet_clicked_count)::integer as lead_magnet_clicked_30d,
  sum(channel_connect_started_count)::integer as channel_connect_started_30d,
  sum(channel_connect_completed_count)::integer as channel_connect_completed_30d,
  sum(upgrade_clicked_count)::integer as upgrade_clicked_30d,
  sum(upgrade_completed_count)::integer as upgrade_completed_30d,
  case when sum(bot_started_count) > 0 then round(sum(miniapp_opened_count)::numeric / sum(bot_started_count), 4) else 0::numeric end as bot_to_miniapp_rate_30d,
  case when sum(miniapp_opened_count) > 0 then round(sum(comments_opened_count)::numeric / sum(miniapp_opened_count), 4) else 0::numeric end as miniapp_to_comments_rate_30d,
  case when sum(comments_opened_count) > 0 then round(sum(comment_created_count)::numeric / sum(comments_opened_count), 4) else 0::numeric end as comments_open_to_create_rate_30d,
  case when sum(lead_magnet_viewed_count) > 0 then round(sum(lead_magnet_clicked_count)::numeric / sum(lead_magnet_viewed_count), 4) else 0::numeric end as lead_magnet_ctr_30d,
  case when sum(channel_connect_started_count) > 0 then round(sum(channel_connect_completed_count)::numeric / sum(channel_connect_started_count), 4) else 0::numeric end as connect_completion_rate_30d,
  case when sum(upgrade_clicked_count) > 0 then round(sum(upgrade_completed_count)::numeric / sum(upgrade_clicked_count), 4) else 0::numeric end as upgrade_completion_rate_30d
from mv_funnel_daily_summary
where metric_date >= current_date - interval '29 day'
group by channel_id;

create view v_reporting_moderation_alerts_30d as
select
  mds.channel_id,
  min(mds.metric_date) as period_start,
  max(mds.metric_date) as period_end,
  sum(mds.moderation_checks_count)::integer as moderation_checks_30d,
  sum(mds.blocked_count)::integer as blocked_30d,
  sum(mds.flagged_count)::integer as flagged_30d,
  sum(mds.queued_count)::integer as queued_30d,
  round(avg(mds.avg_latency_ms)::numeric, 2) as avg_latency_ms_30d,
  case when sum(mds.moderation_checks_count) > 0 then round(sum(mds.blocked_count)::numeric / sum(mds.moderation_checks_count), 4) else 0::numeric end as blocked_rate_30d,
  case when sum(mds.moderation_checks_count) > 0 then round(sum(mds.flagged_count)::numeric / sum(mds.moderation_checks_count), 4) else 0::numeric end as flagged_rate_30d,
  case when sum(mds.moderation_checks_count) > 0 then round(sum(mds.queued_count)::numeric / sum(mds.moderation_checks_count), 4) else 0::numeric end as queued_rate_30d
from mv_moderation_daily_summary mds
where mds.metric_date >= current_date - interval '29 day'
group by mds.channel_id
order by blocked_30d desc, flagged_30d desc;

create view v_reporting_retention_latest as
select
  rc.channel_id,
  rc.cohort_date,
  rc.cohort_size,
  rc.day_1_users,
  rc.day_7_users,
  rc.day_14_users,
  rc.day_30_users,
  case when rc.cohort_size > 0 then round(rc.day_1_users::numeric / rc.cohort_size, 4) else 0::numeric end as retention_day_1,
  case when rc.cohort_size > 0 then round(rc.day_7_users::numeric / rc.cohort_size, 4) else 0::numeric end as retention_day_7,
  case when rc.cohort_size > 0 then round(rc.day_14_users::numeric / rc.cohort_size, 4) else 0::numeric end as retention_day_14,
  case when rc.cohort_size > 0 then round(rc.day_30_users::numeric / rc.cohort_size, 4) else 0::numeric end as retention_day_30
from mv_retention_cohorts rc
order by rc.cohort_date desc, rc.channel_id;

create view v_reporting_channel_scoreboard as
select
  o.channel_id,
  o.posts_30d,
  o.comments_30d,
  o.reactions_30d,
  o.button_clicks_30d,
  o.unique_visitors_30d,
  o.blocked_comments_30d,
  o.leads_30d,
  o.upgrades_30d,
  o.revenue_30d,
  o.tracked_button_ctr_30d,
  o.lead_magnet_ctr_30d,
  o.comment_create_rate_30d,
  o.channel_connect_completion_rate_30d,
  o.upgrade_completion_rate_30d,
  case when o.unique_visitors_30d > 0 then round((o.comments_30d + o.reactions_30d + o.poll_votes_30d + o.button_clicks_30d)::numeric / o.unique_visitors_30d, 4) else 0::numeric end as engagement_per_visitor_30d
from v_reporting_channel_overview_30d o;

create view v_reporting_admin_home as
select
  c.channel_id,
  c.title,
  c.username,
  c.plan_code,
  c.white_label_enabled,
  c.lead_magnet_enabled,
  c.agency_brand_name,
  s.posts_30d,
  s.comments_30d,
  s.reactions_30d,
  s.button_clicks_30d,
  s.unique_visitors_30d,
  s.blocked_comments_30d,
  s.leads_30d,
  s.upgrades_30d,
  s.revenue_30d,
  s.tracked_button_ctr_30d,
  s.lead_magnet_ctr_30d,
  s.comment_create_rate_30d,
  s.channel_connect_completion_rate_30d,
  s.upgrade_completion_rate_30d,
  s.engagement_per_visitor_30d
from channels c
left join v_reporting_channel_scoreboard s on s.channel_id = c.channel_id
order by c.updated_at desc nulls last, c.channel_id;

commit;
