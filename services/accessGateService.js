'use strict';

const access = require('./clientAccessService');

const ACCOUNT_ACTIONS = new Set(['admin_section_tariffs','billing_current_plan','billing_limits','billing_referral','billing_upgrade','account_home','account_my_access','account_activate_code','account_payment','account_limits','account_channels','account_support','account_capabilities']);
const PUBLIC_ACTIONS = new Set(['poll_vote','poll_info','gift_claim']);
const COMMAND_FEATURES = {
  '/channels': 'channels', '/comments': 'comments', '/gifts': 'gifts', '/buttons': 'buttons', '/highlight': 'highlights', '/polls': 'polls', '/posts': 'post_editor', '/archive': 'archive', '/moderation': 'moderation', '/stats': 'basic_stats', '/debug': 'debug'
};
const ROUTE_FEATURES = {
  channels: 'channels', comments: 'comments', gifts: 'gifts', buttons: 'buttons', stats: 'basic_stats', ad_links: 'ad_links', ads: 'ad_links', polls: 'polls', highlight: 'highlights', highlights: 'highlights', editor: 'post_editor', posts: 'post_editor', archive: 'archive', moderation: 'moderation', settings: 'settings'
};

function clean(value) { return String(value || '').trim(); }
function routeOwner(route = '') { return clean(route).split(/[:.]/)[0].toLowerCase(); }
function featureForSource(source = '') {
  const s = clean(source).toLowerCase();
  if (s === 'polls') return 'polls';
  if (s === 'highlights' || s === 'highlight') return 'highlights';
  if (s === 'buttons') return 'buttons';
  if (s === 'gifts') return 'gifts';
  if (s === 'stats') return 'basic_stats';
  if (s === 'posts' || s === 'editor') return 'post_editor';
  if (s === 'archive') return 'archive';
  return 'comments';
}
function featureForAction(action = '', payload = {}) {
  const a = clean(action || payload.action || payload.raw || payload.route || payload.r);
  const route = clean(payload.route || payload.r);
  if (!a && !route) return '';
  if (ACCOUNT_ACTIONS.has(a)) return 'account';
  if (PUBLIC_ACTIONS.has(a)) return 'public';
  if (a === 'admin_section_debug' || /^debug[:_]/i.test(a)) return 'debug';
  if (a === 'admin_section_main' || route === 'main.home') return 'main';
  if (a === 'admin_section_channels') return 'channels';
  if (a === 'admin_section_comments') return 'comments';
  if (a === 'admin_section_gifts' || /^gift_/i.test(a)) return 'gifts';
  if (a === 'admin_section_buttons' || /^button_/i.test(a)) return 'buttons';
  const statsSignal = clean([a, route].filter(Boolean).join(' ')).toLowerCase();
  if (/(^|[_.:-])export($|[_.:-])|export_/i.test(statsSignal)) return 'export';
  if (/admin_stats_campaign(?:s|_|$)|(^|[_.:-])campaign(s|_|[_.:-]|$)|ad[_-]?links?|referral(_create|s)?($|[_.:-])/i.test(statsSignal)) return 'ad_links';
  if (/(^|[_.:-])(source|sources|attribution|traffic|utm|funnel|costs?)($|[_.:-])/i.test(statsSignal)) return 'attribution';
  if (a === 'admin_section_stats') return 'basic_stats';
  if (/^admin_stats_(overview|overview_cache|subscribers|subscribers_day|subscribers_7|subscribers_14|subscribers_30|subscribers_trend|posts|posts_cache|post|views|views_cache|comments|comments_cache|reactions|reactions_cache|polls|polls_cache|gifts|gifts_cache|buttons|buttons_cache|archive|archive_cache|refresh|refresh_status)$/i.test(a)) return 'basic_stats';
  if (/^admin_stats_/i.test(a)) return 'basic_stats';
  if (a === 'admin_section_polls' || /^poll_/i.test(a)) return 'polls';
  if (a === 'admin_section_highlights' || /^highlight_/i.test(a)) return 'highlights';
  if (a === 'admin_section_posts' || /^admin_posts_/i.test(a)) return 'post_editor';
  if (a === 'admin_section_archive' || /^archive_/i.test(a)) return 'archive';
  if (a === 'comments_select_post' || a === 'comments_pick_post') return featureForSource(payload.source);
  const owner = routeOwner(route);
  return ROUTE_FEATURES[owner] || '';
}
function featureForCommand(command = '') { return COMMAND_FEATURES[clean(command).toLowerCase()] || ''; }
function featureForRoute(route = '') { return ROUTE_FEATURES[routeOwner(route)] || ''; }

function checkFeature(maxUserId, featureKey, { allowAccount = true } = {}) {
  const key = clean(featureKey);
  const state = access.getAccessState(maxUserId);
  if (state.admin) return { ok: true, allow: true, reason: 'admin_bypass', state, featureKey: key };
  if (key === 'public') return { ok: true, allow: true, reason: 'public_action', state, featureKey: key };
  if (key === 'account' && allowAccount) return { ok: true, allow: true, reason: 'account_allowed', state, featureKey: key };
  if (key === 'debug') return { ok: true, allow: false, reason: 'debug_admin_only', state, featureKey: key };
  if (key === 'main') {
    if (state.active) return { ok: true, allow: true, reason: 'active_main', state, featureKey: key };
    return { ok: true, allow: false, reason: state.status === 'expired' ? 'access_expired' : 'access_required', state, featureKey: key };
  }
  const feature = key || 'comments';
  const result = access.canUseFeature(maxUserId, feature);
  return { ok: true, allow: result.allowed, reason: result.reason, message: result.message, state: result.state, featureKey: feature };
}
function checkAction(maxUserId, payload = {}) { return checkFeature(maxUserId, featureForAction(payload.action || payload.raw, payload)); }
function checkCommand(maxUserId, command = '') {
  const cmd = clean(command).toLowerCase();
  if (cmd === '/account') return checkFeature(maxUserId, 'account');
  if (cmd === '/start' || cmd === '/menu' || cmd === '/clear') return checkFeature(maxUserId, 'main');
  return checkFeature(maxUserId, featureForCommand(cmd));
}
function checkRoute(maxUserId, route = '') { return checkFeature(maxUserId, featureForRoute(route)); }

module.exports = { ACCOUNT_ACTIONS, PUBLIC_ACTIONS, featureForAction, featureForCommand, featureForRoute, checkFeature, checkAction, checkCommand, checkRoute };
