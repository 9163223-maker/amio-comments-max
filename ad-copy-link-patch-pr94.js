'use strict';

const RUNTIME = 'CC8.3.26-ADS-CLCK-SHORT-LINKS';
const DEFAULT_CLCK_ENDPOINT = 'https://clck.ru/--';

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
function publicBase(ctx = {}) {
  return clean((ctx.config && (ctx.config.appBaseUrl || ctx.config.publicBaseUrl)) || process.env.ADMINKIT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');
}
function directUrl(ads, campaign) {
  return ads.campaignUrl ? ads.campaignUrl(campaign) : clean(campaign && (campaign.targetUrl || campaign.url));
}
function trackingUrl(ads, campaign, ctx = {}) {
  if (!campaign || !campaign.slug) return '';
  if (ads.trackingUrl) return clean(ads.trackingUrl(campaign, ctx.config || {}));
  const base = publicBase(ctx);
  return base ? `${base}/r/${encodeURIComponent(clean(campaign.slug))}` : '';
}
function now() { return Date.now(); }
function isClckUrl(value = '') { return /^https?:\/\/clck\.ru\/\S+/i.test(clean(value)); }
function clckEnabled() { return clean(process.env.ADMINKIT_CLCK_SHORT_LINKS_ENABLED || '1') !== '0'; }
function clckEndpoint() { return clean(process.env.ADMINKIT_CLCK_ENDPOINT || DEFAULT_CLCK_ENDPOINT); }
function shortErr(error) { return clean(error && error.message || error || 'clck_shortener_failed').slice(0, 220); }

async function createClckShortUrl(longUrl = {}) {
  const target = clean(longUrl);
  if (!target) throw new Error('tracking_url_missing');
  if (!clckEnabled()) throw new Error('clck_shortener_disabled');
  if (typeof fetch !== 'function') throw new Error('fetch_unavailable');
  const endpoint = clckEndpoint();
  const u = new URL(endpoint);
  u.searchParams.set('url', target);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = setTimeout(() => {
    try { if (controller) controller.abort(); } catch {}
  }, Math.max(1500, Math.min(12000, Number(process.env.ADMINKIT_CLCK_TIMEOUT_MS || 4500) || 4500)));
  try {
    const res = await fetch(u.toString(), {
      method: 'GET',
      signal: controller ? controller.signal : undefined,
      headers: { 'User-Agent': 'adminkit-clck-shortener' }
    });
    const text = clean(await res.text().catch(() => ''));
    if (!res.ok) throw new Error(`clck_http_${res.status}`);
    if (!isClckUrl(text)) throw new Error(text ? `clck_bad_response:${text.slice(0, 80)}` : 'clck_empty_response');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function patchCampaign(campaign = {}, patch = {}) {
  const store = require('./store');
  const channelId = clean(campaign.channelId);
  if (!channelId) return { ...campaign, ...patch };
  const settings = store.getGrowthSettings(channelId);
  const items = Array.isArray(settings.adCampaigns) ? settings.adCampaigns : [];
  let changed = false;
  const next = items.map((item) => {
    const same = (clean(campaign.id) && clean(item.id) === clean(campaign.id)) || (clean(campaign.slug) && clean(item.slug) === clean(campaign.slug));
    if (!same) return item;
    changed = true;
    return { ...item, ...patch, updatedAt: now() };
  });
  const merged = { ...campaign, ...patch, updatedAt: now() };
  if (!changed) return merged;
  store.saveGrowthSettings(channelId, { ...settings, adCampaigns: next });
  return merged;
}

async function ensureClckShortUrl(ads, campaign, ctx = {}) {
  if (!campaign) return campaign;
  const statUrl = trackingUrl(ads, campaign, ctx);
  if (!statUrl) return patchCampaign(campaign, {
    shortUrlError: 'tracking_url_missing',
    shortUrlProvider: 'clck.ru',
    shortUrlTarget: '',
    shortUrlRuntime: RUNTIME
  });
  if (clean(campaign.shortUrl) && clean(campaign.shortUrlTarget) === statUrl) return campaign;
  try {
    const shortUrl = await createClckShortUrl(statUrl);
    return patchCampaign(campaign, {
      shortUrl,
      shortUrlProvider: 'clck.ru',
      shortUrlTarget: statUrl,
      shortUrlCreatedAt: now(),
      shortUrlError: '',
      shortUrlRuntime: RUNTIME
    });
  } catch (error) {
    return patchCampaign(campaign, {
      shortUrl: clean(campaign.shortUrl),
      shortUrlProvider: 'clck.ru',
      shortUrlTarget: statUrl,
      shortUrlError: shortErr(error),
      shortUrlRuntime: RUNTIME
    });
  }
}

function addCopyButton(menu, screen, campaign) {
  if (!screen || !campaign) return screen;
  const url = directUrl(require('./services/adCampaignService'), campaign);
  if (!url) return screen;
  const row = [actionButton(menu, '📋 Показать ссылки для копирования', 'admin_stats_campaign_copy', { campaignId: campaign.id, slug: campaign.slug })];
  const keyboardAttachment = Array.isArray(screen.attachments) && screen.attachments.find((item) => item && item.type === 'inline_keyboard' && item.payload && Array.isArray(item.payload.buttons));
  if (!keyboardAttachment) return screen;
  const exists = keyboardAttachment.payload.buttons.some((buttonsRow) => Array.isArray(buttonsRow) && buttonsRow.some((btn) => clean(btn.text) === '📋 Показать ссылки для копирования' || clean(btn.text) === '📋 Показать ссылку для копирования'));
  if (!exists) keyboardAttachment.payload.buttons.splice(Math.min(1, keyboardAttachment.payload.buttons.length), 0, row);
  if (screen.text && !screen.text.includes('можно вывести отдельным сообщением')) {
    screen.text = screen.text.replace('URL не выводим текстом, чтобы не было превью. Открытие — кнопкой ниже.', 'URL скрыт от превью. Для копирования нажмите отдельную кнопку ниже.');
    screen.text += '\n\nСсылки можно вывести отдельным сообщением для копирования.';
  }
  return screen;
}

function copyScreen(menu, ads, campaign, ctx = {}) {
  if (!campaign) return { id: 'stats_campaign_copy_not_found', text: '📣 Рекламная ссылка\n\nКампания не найдена.', attachments: keyboard(menu, [[actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')], [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]]) };
  const maxUrl = directUrl(ads, campaign);
  if (!maxUrl) return { id: 'stats_campaign_copy_no_url', text: '📣 Ссылка для копирования\n\nУ кампании нет сохранённой MAX-ссылки. Создайте ссылку заново и укажите актуальный invite/public URL канала.', attachments: keyboard(menu, [[actionButton(menu, '➕ Создать ссылку', 'admin_stats_campaign_create')], [actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')], [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]]) };
  const statUrl = trackingUrl(ads, campaign, ctx);
  const shortUrl = clean(campaign.shortUrl);
  const shortUrlError = clean(campaign.shortUrlError);
  const isInvite = /max\.ru\/join\//i.test(maxUrl);
  const rows = [];
  if (shortUrl) rows.push([linkButton(menu, '🟡 Открыть короткую clck.ru', shortUrl)]);
  if (statUrl) rows.push([linkButton(menu, '📊 Открыть ссылку статистики', statUrl)]);
  rows.push([linkButton(menu, '🔒 Открыть прямую MAX-ссылку', maxUrl)]);
  rows.push([actionButton(menu, '⬅️ К кампании', 'admin_stats_campaign_view', { campaignId: campaign.id, slug: campaign.slug })], [actionButton(menu, '📣 Все кампании', 'admin_stats_campaigns')], [actionButton(menu, '🏠 Главное меню', 'admin_section_main')]);
  return {
    id: 'stats_campaign_copy_link',
    text: [
      shortUrl ? '✅ Рекламная ссылка создана' : '📋 Ссылки кампании',
      '',
      `Кампания: ${campaign.name}`,
      `Источник: ${campaign.source}`,
      `Канал: ${campaign.channelTitle}`,
      '',
      '🟡 Короткая ссылка clck.ru для клиента / рекламодателя:',
      shortUrl || 'Пока не создана.',
      shortUrl ? 'Это основная ссылка для размещения: короткая, без технического домена АдминКИТ.' : '',
      !shortUrl && shortUrlError ? `Причина: ${shortUrlError}` : '',
      '',
      statUrl ? '📊 Ссылка АдминКИТ для точной статистики:' : '',
      statUrl || '',
      statUrl ? 'Именно она уникальна для этой кампании. clck.ru ведёт на неё, а она уже фиксирует клик и переводит в MAX.' : '📊 Ссылка статистики пока недоступна: не задан публичный домен АдминКИТ.',
      '',
      '🔒 Прямая MAX-ссылка:',
      maxUrl,
      'Используйте как надёжный fallback. Точные клики по источнику по прямой MAX-ссылке не считаются.',
      '',
      isInvite ? '⚠️ Это invite-ссылка приватного канала. Если обновить её в MAX, старая MAX-ссылка перестанет работать; обновите её и в АдминКИТ.' : '',
      'MAX может показать превью у этого сообщения — это нормально, экран нужен именно для копирования.'
    ].filter(Boolean).join('\n'),
    attachments: keyboard(menu, rows)
  };
}

function install() {
  const statsFlow = require('./stats-flow-cc8');
  const ads = require('./services/adCampaignService');
  if (statsFlow.__adminkitAdCopyLinkPatchInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const oldScreen = statsFlow.screenForPayload;
  const oldText = statsFlow.handleTextInput;
  const oldSelftest = ads.selftest;
  ads.selftest = function selftestWithClckLinks(config = {}) {
    const base = oldSelftest ? oldSelftest(config) : { ok: true };
    const campaigns = ads.listCampaigns('').map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      source: c.source,
      channelTitle: c.channelTitle,
      url: directUrl(ads, c) || null,
      trackingUrl: trackingUrl(ads, c, { config }) || null,
      shortUrl: clean(c.shortUrl) || null,
      shortUrlProvider: clean(c.shortUrlProvider) || null,
      shortUrlTarget: clean(c.shortUrlTarget) || null,
      shortUrlError: clean(c.shortUrlError) || null
    }));
    return {
      ...base,
      runtimeVersion: RUNTIME,
      campaigns,
      trackingLinksSupported: true,
      trackingRedirectRoute: '/r/:slug',
      clckShortLinksSupported: true,
      clckEndpoint: clckEndpoint(),
      clckAutoCreate: clckEnabled(),
      copyScreenShowsClckTrackingAndDirect: true
    };
  };
  statsFlow.screenForPayload = async function patchedScreenForPayload(menu, payload = {}, ctx = {}) {
    const action = clean(payload.action);
    if (action === 'admin_stats_campaign_copy') {
      const campaign = await ensureClckShortUrl(ads, findCampaign(ads, payload), ctx);
      return copyScreen(menu, ads, campaign, ctx);
    }
    const screen = await oldScreen(menu, payload, ctx);
    if (action === 'admin_stats_campaign_view') {
      const campaign = await ensureClckShortUrl(ads, findCampaign(ads, payload), ctx);
      return addCopyButton(menu, screen, campaign);
    }
    return screen;
  };
  statsFlow.handleTextInput = async function patchedHandleTextInput(menu, ctx = {}) {
    const screen = oldText ? await oldText(menu, ctx) : null;
    if (screen && clean(screen.id) === 'stats_campaign_created') {
      const latest = ads.listCampaigns('').slice(0, 1)[0];
      const campaign = await ensureClckShortUrl(ads, latest, ctx);
      return copyScreen(menu, ads, campaign, ctx);
    }
    return screen;
  };
  statsFlow.__adminkitAdCopyLinkPatchInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME, trackingLinksSupported: true, clckShortLinksSupported: true };
}

module.exports = { RUNTIME, install, createClckShortUrl };
