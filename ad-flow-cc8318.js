'use strict';

const statsFlow = require('./stats-flow-cc8');

const RUNTIME = 'CC8.3.18-ADS-TOP-LEVEL';

function clean(value) { return String(value || '').trim(); }
function rewrite(action = '') {
  const a = clean(action);
  if (a === 'admin_section_ads' || a === 'admin_section_advertising' || a === 'admin_section_campaigns') return 'admin_stats_campaigns';
  if (a === 'admin_ads_create' || a === 'admin_ad_create' || a === 'admin_campaign_create') return 'admin_stats_campaign_create';
  if (a === 'admin_ads_sources') return 'admin_stats_sources_cache';
  if (a === 'admin_ads_refresh') return 'admin_stats_refresh';
  if (a === 'admin_ads_campaign_view') return 'admin_stats_campaign_view';
  return a;
}
function isAdsAction(action = '') {
  const a = clean(action);
  return a === 'admin_section_ads' || a === 'admin_section_advertising' || a === 'admin_section_campaigns' ||
    a === 'admin_ads_create' || a === 'admin_ad_create' || a === 'admin_campaign_create' ||
    a === 'admin_ads_sources' || a === 'admin_ads_refresh' || a === 'admin_ads_campaign_view' ||
    a === 'admin_stats_campaigns' || a === 'admin_stats_campaign_create' || a === 'admin_stats_campaign_channel' ||
    a === 'admin_stats_campaign_cancel' || a === 'admin_stats_campaign_view';
}
async function screenForPayload(menu, payload = {}, ctx = {}) {
  const action = rewrite(payload.action);
  const nextPayload = { ...payload, action };
  const screen = await statsFlow.screenForPayload(menu, nextPayload, ctx);
  if (!screen) return null;
  if (screen.text) {
    screen.text = screen.text
      .replace(/^📊 Статистика\n\n/, '📣 Реклама\n\n')
      .replace(/^🔗 Рекламные ссылки\n\n/, '📣 Реклама / рекламные ссылки\n\n')
      .replace(/^🧭 Источники подписчиков\n\n/, '📣 Реклама / источники\n\n');
  }
  return screen;
}
async function handleTextInput(menu, ctx = {}) {
  return statsFlow.handleTextInput ? statsFlow.handleTextInput(menu, ctx) : null;
}
module.exports = { RUNTIME, isAdsAction, screenForPayload, handleTextInput };
