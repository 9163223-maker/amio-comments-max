'use strict';

const RUNTIME = 'CC8.3.24-ADS-COPY-LINK';

function clean(value) { return String(value || '').trim(); }
function findCampaign(ads, payload = {}) {
  const slug = clean(payload.slug);
  const campaignId = clean(payload.campaignId);
  if (slug && ads.getCampaignBySlug) return ads.getCampaignBySlug(slug);
  return ads.listCampaigns('').find((item) => clean(item.id) === campaignId || clean(item.slug) === slug) || null;
}
function linkButton(menu, text, url) { return menu.link ? menu.link(text, url) : { type: 'link', text, url }; }
function actionButton(menu, text, action, data = {}) { return menu.button(text, action, data); }
function keyboard(menu, rows) { return menu.keyboard(rows); }
function campaignUrl(ads, campaign, ctx = {}) { return ads.campaignUrl ? ads.campaignUrl(campaign, ctx.config || {}) : clean(campaign && campaign.targetUrl); }
function addCopyButton(menu, screen, campaign) {
  if (!screen || !campaign) return screen;
  const url = campaignUrl(require('./services/adCampaignService'), campaign, {});
  if (!url) return screen;
  const row = [actionButton(menu, '📋 Показать ссылку для копирования', 'admin_stats_campaign_copy', { campaignId: campaign.id, slug: campaign.slug })];
  const keyboardAttachment = Array.isArray(screen.attachments) && screen.attachments.find((item) => item && item.type === 'inline_keyboard' && item.payload && Array.isArray(item.payload.buttons));
  if (!keyboardAttachment) return screen;
  const exists = keyboardAttachment.payload.buttons.some((buttonsRow) => Array.isArray(buttonsRow) && buttonsRow.some((btn) => clean(btn.text) === '📋 Показать ссылку для копирования'));
  if (!exists) keyboardAttachment.payload.buttons.splice(Math.min(1, keyboardAttachment.payload.buttons.length), 0, row);
  if (screen.text && !screen.text.includes('можно вывести отдельным сообщением')) {
    screen.text = screen.text.replace('URL не выводим текстом, чтобы не было превью. Открытие — кнопкой ниже.', 'URL скрыт от превью. Для копирования нажмите отдельную кнопку ниже.');
    screen.text += '\n\nСсылку можно вывести отдельным сообщением для копирования.';
  }
  return screen;
}
function copyScreen(menu, ads, campaign, ctx = {}) {
  if (!campaign) return { id: 'stats_campaign_copy_not_found', text: '📣 Рекламная ссылка\n\nКампания не найдена.', attachments: keyboard(menu, [[actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')], [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]]) };
  const url = campaignUrl(ads, campaign, ctx);
  if (!url) return { id: 'stats_campaign_copy_no_url', text: '📣 Ссылка для копирования\n\nУ кампании нет сохранённой ссылки. Создайте ссылку заново и укажите актуальный invite/public URL канала.', attachments: keyboard(menu, [[actionButton(menu, '➕ Создать ссылку', 'admin_stats_campaign_create')], [actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')], [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]]) };
  const isInvite = /max\.ru\/join\//i.test(url);
  return {
    id: 'stats_campaign_copy_link',
    text: [
      '📋 Ссылка для копирования',
      '',
      `Кампания: ${campaign.name}`,
      `Источник: ${campaign.source}`,
      `Канал: ${campaign.channelTitle}`,
      '',
      'Скопируйте строку ниже:',
      '',
      url,
      '',
      isInvite ? '⚠️ Это invite-ссылка приватного канала. Если обновить её в MAX, эта ссылка перестанет работать; замените её в АдминКИТ.' : '',
      'MAX может показать превью у этого сообщения — это нормально, экран нужен именно для копирования.'
    ].filter(Boolean).join('\n'),
    attachments: keyboard(menu, [
      [linkButton(menu, '🔗 Открыть ссылку', url)],
      [actionButton(menu, '⬅️ К кампании', 'admin_stats_campaign_view', { campaignId: campaign.id, slug: campaign.slug })],
      [actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')],
      [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]
    ])
  };
}
function install() {
  const statsFlow = require('./stats-flow-cc8');
  const ads = require('./services/adCampaignService');
  if (statsFlow.__adminkitAdCopyLinkPatchInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const oldScreen = statsFlow.screenForPayload;
  const oldText = statsFlow.handleTextInput;
  statsFlow.screenForPayload = async function patchedScreenForPayload(menu, payload = {}, ctx = {}) {
    const action = clean(payload.action);
    if (action === 'admin_stats_campaign_copy') return copyScreen(menu, ads, findCampaign(ads, payload), ctx);
    const screen = await oldScreen(menu, payload, ctx);
    if (action === 'admin_stats_campaign_view') return addCopyButton(menu, screen, findCampaign(ads, payload));
    return screen;
  };
  statsFlow.handleTextInput = async function patchedHandleTextInput(menu, ctx = {}) {
    const screen = oldText ? await oldText(menu, ctx) : null;
    if (screen && clean(screen.id) === 'stats_campaign_created') {
      const latest = ads.listCampaigns('').slice(0, 1)[0];
      return addCopyButton(menu, screen, latest);
    }
    return screen;
  };
  statsFlow.__adminkitAdCopyLinkPatchInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME };
}

module.exports = { RUNTIME, install };
