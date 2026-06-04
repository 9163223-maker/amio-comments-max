'use strict';

const assert = require('assert');

process.env.ADMINKIT_TEST_MODE = '1';

const store = require('../store');
const access = require('../services/clientAccessService');
const postPatcher = require('../services/postPatcher');
const buttons = require('../buttons-flow-cc8-clean');
const gifts = require('../gifts-flow-cc8-fast');
const statsFlow = require('../stats-flow-cc8');
const adCampaigns = require('../services/adCampaignService');
const archive = require('../archive-clean-flow-cc8311');
const tenantScope = require('../tenant-scope');
const polls = require('../poll-flow-15313');
const highlights = require('../highlight-flow-15311');
const pollService = require('../services/pollService');
const maxApi = require('../services/maxApi');

const TENANT_A_USER = 'pr115-tenant-a';
const TENANT_B_USER = 'pr115-tenant-b';
const TENANT_A_CHANNEL = '-pr115-tenant-a-channel';
const TENANT_B_CHANNEL = '-pr115-tenant-b-channel';

const menu = {
  button(text, action, extra = {}) { return { type: 'callback', text, payload: { action, ...extra } }; },
  keyboard(rows) { return [{ type: 'inline_keyboard', payload: { buttons: rows } }]; }
};

function screenText(screen) {
  const buttonText = (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .map((button) => button?.text || '')
    .join('\n');
  return `${screen.text || ''}\n${buttonText}`;
}

function buttonLabels(screen) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .map((button) => button?.text || '')
    .filter(Boolean);
}

function assertTenantAScreen(screen, label) {
  const text = screenText(screen);
  assert.ok(/Tenant A Channel|Tenant A Public Post/.test(text), `${label} should include tenant A content`);
  assert.ok(!/Tenant B Channel|Tenant B Secret Post/.test(text), `${label} must not leak tenant B content`);
}

function assertNoButtonsCta(screen, label) {
  assert.ok(!/\bCTA\b/i.test(screenText(screen)), `${label} must not expose CTA wording`);
}

function assertNoStatsCta(screen, label) {
  assert.ok(!/\bCTA\b/i.test(screenText(screen)), `${label} must not expose CTA wording`);
}

function assertNoDelete(screen, label) {
  assert.ok(!buttonLabels(screen).some((text) => /Удалить последнюю кнопку/i.test(text)), `${label} must not expose delete`);
}

function assertHasDelete(screen, label) {
  assert.ok(buttonLabels(screen).some((text) => /Удалить последнюю кнопку/i.test(text)), `${label} must expose delete`);
}

function assertNoGiftDestructiveActions(screen, label) {
  const labels = buttonLabels(screen);
  assert.ok(!labels.some((text) => /Удалить подарок/i.test(text)), `${label} must not expose gift delete`);
  assert.ok(!labels.some((text) => /Заменить материал/i.test(text)), `${label} must not expose gift material replacement`);
}

function assertNoGiftRawTechnicalText(screen, label) {
  const visible = screenText(screen);
  assert.ok(!/Post ID/i.test(visible), `${label} must not expose raw Post ID`);
  assert.ok(!/\b(postId|channelId|commentKey|token|payload|trace)\b/i.test(visible), `${label} must not expose raw technical fields`);
  assert.ok(!/файл|вложение/i.test(visible), `${label} must not use confusing file wording`);
}

function assertNoAdLinkRawTechnicalText(screen, label) {
  const visible = screenText(screen);
  assert.ok(!/\b(postId|channelId|commentKey|token|payload|trace)\b/i.test(visible), `${label} must not expose raw technical fields`);
  assert.ok(!/ad_[a-z0-9_:-]+/i.test(visible), `${label} must not expose raw ad link ids`);
}

function assertNoAdLinkDisable(screen, label) {
  assert.ok(!buttonLabels(screen).some((text) => /Отключить ссылку/i.test(text)), `${label} must not expose ad link disable`);
}

function assertNoPollStop(screen, label) {
  assert.ok(!buttonLabels(screen).some((text) => /Остановить опрос/i.test(text)), `${label} must not expose poll stop`);
}

function assertHasPollStop(screen, label) {
  assert.ok(buttonLabels(screen).some((text) => /Остановить опрос/i.test(text)), `${label} must expose poll stop`);
}

function assertNoPollRawTechnicalText(screen, label) {
  const visible = screenText(screen);
  assert.ok(!/\b(postId|channelId|commentKey|token|payload|trace)\b/i.test(visible), `${label} must not expose raw technical fields`);
  assert.ok(!/poll_[a-z0-9_:-]+|-[a-z0-9-]+:post-/i.test(visible), `${label} must not expose raw poll or post ids`);
  assert.ok(!/\bCTA\b/i.test(visible), `${label} must not expose CTA wording`);
}

function assertNoHighlightRawTechnicalText(screen, label) {
  const visible = screenText(screen);
  assert.ok(!/\b(postId|channelId|commentKey|token|payload|trace)\b/i.test(visible), `${label} must not expose raw technical fields`);
  assert.ok(!/Legacy|debug|trace/i.test(visible), `${label} must not expose legacy/debug/trace wording`);
  assert.ok(!/\bCTA\b/i.test(visible), `${label} must not expose CTA wording`);
  assert.ok(!/видео|файл/i.test(visible), `${label} must not use video/files wording`);
}

function assertNoHighlightRemove(screen, label) {
  assert.ok(!buttonLabels(screen).some((text) => /Снять выделение/i.test(text)), `${label} must not expose highlight removal`);
}

function assertHasHighlightRemove(screen, label) {
  assert.ok(buttonLabels(screen).some((text) => /Снять выделение/i.test(text)), `${label} must expose highlight removal`);
}

function assertHasAdLinkDisable(screen, label) {
  assert.ok(buttonLabels(screen).some((text) => /Отключить ссылку/i.test(text)), `${label} must expose ad link disable`);
}

function assertNoGiftInternalWording(screen, label) {
  const visible = screenText(screen);
  assert.ok(!/Clean Core|clean[- ]flow|clean-save|clean-delete|Repatch|перепатч|низкоуровнев|low-level/i.test(visible), `${label} must not expose internal Gifts implementation wording`);
  assert.ok(!/\bstore\b|\bcache\b|store\/cache/i.test(visible), `${label} must not expose storage/cache wording`);
  assert.ok(!/tenant/.test(visible), `${label} must not expose tenant wording`);
}

function deletePayload(screen) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .find((button) => /Удалить последнюю кнопку/i.test(button?.text || ''))?.payload || null;
}

function callbackPayload(screen, pattern) {
  return (screen.attachments || [])
    .flatMap((attachment) => attachment?.payload?.buttons || [])
    .flat()
    .find((button) => pattern.test(button?.text || ''))?.payload || null;
}

function buttonSet(commentKey) {
  return store.store.growth?.byChannel?.[TENANT_A_CHANNEL]?.buttonSets?.[commentKey] || [];
}

function activateTenant(userId, name) {
  const code = access.createActivationCode({ planId: 'start', durationDays: 30, maxChannels: 1, createdByMaxUserId: 'pr115-admin' });
  const activated = access.activateCode({ maxUserId: userId, name, code: code.code });
  assert.strictEqual(activated.ok, true, `${name} activation succeeds`);
  return access.getTenantByMaxUserId(userId);
}

async function main() {
  access._resetForTests();
  store.store.posts = {};
  store.store.comments = {};
  store.store.likes = {};
  store.store.reactions = {};
  store.store.channels = {};
  store.store.setup = {};
  store.store.growth = { byChannel: {}, clicks: [], pollVotes: [], memberSnapshots: {} };
  store.store.gifts = { campaigns: {}, claims: {}, settings: {} };
  store.saveStore();
  postPatcher.patchStoredPost = async () => ({ ok: true, skipped: true });

  const tenantA = activateTenant(TENANT_A_USER, 'Tenant A');
  const tenantB = activateTenant(TENANT_B_USER, 'Tenant B');
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantA.tenantId, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', maxChannels: 1 }).ok, true);
  assert.strictEqual(access.bindTenantChannel({ tenantId: tenantB.tenantId, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', maxChannels: 1 }).ok, true);

  store.saveChannel(TENANT_A_CHANNEL, { channelId: TENANT_A_CHANNEL, title: 'Tenant A Channel', channelTitle: 'Tenant A Channel' });
  store.saveChannel(TENANT_B_CHANNEL, { channelId: TENANT_B_CHANNEL, title: 'Tenant B Channel', channelTitle: 'Tenant B Channel' });

  // Legacy unscoped posts are intentionally visible to the owner, but production
  // menus must still intersect them with the active client's tenant-visible channels.
  store.savePost(`${TENANT_A_CHANNEL}:post-a`, { channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a', originalText: 'Tenant A Public Post', createdAt: 1000, updatedAt: 1000 });
  store.savePost(`${TENANT_B_CHANNEL}:post-b`, { channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b', messageId: 'msg-b', originalText: 'Tenant B Secret Post', createdAt: 2000, updatedAt: 2000 });

  const adLinkA = adCampaigns.createCampaign({ channelId: TENANT_A_CHANNEL, name: 'Tenant A Summer', source: 'Tenant A Source', targetUrl: 'https://max.ru/tenant_a_public', channelTitleOverride: 'Tenant A Channel', createdByUserId: TENANT_A_USER, config: {} });
  const adLinkB = adCampaigns.createCampaign({ channelId: TENANT_B_CHANNEL, name: 'Tenant B Hidden Link', source: 'Tenant B Source', targetUrl: 'https://max.ru/tenant_b_secret', channelTitleOverride: 'Tenant B Channel', createdByUserId: TENANT_B_USER, config: {} });
  const settingsA = store.getGrowthSettings(TENANT_A_CHANNEL);
  store.saveGrowthSettings(TENANT_A_CHANNEL, { ...settingsA, adCampaigns: [
    ...(settingsA.adCampaigns || []),
    { id: 'ad_global_legacy', slug: 'global-legacy', channelId: TENANT_A_CHANNEL, channelTitle: 'Global Legacy Channel', name: 'Global Legacy Link postId channelId', source: 'payload trace token', targetUrl: 'https://max.ru/global_legacy', enabled: true, createdAt: 1, updatedAt: 1 }
  ] });

  const statsHome = await statsFlow.screenForPayload(menu, { action: 'admin_section_stats' }, { userId: TENANT_A_USER, config: {} });
  assertNoStatsCta(statsHome, 'admin_section_stats');
  const statsOverview = await statsFlow.screenForPayload(menu, { action: 'admin_stats_overview_cache' }, { userId: TENANT_A_USER, config: {} });
  assertNoStatsCta(statsOverview, 'admin_stats_overview_cache');

  const adHome = await statsFlow.screenForPayload(menu, { action: 'admin_stats_campaigns' }, { userId: TENANT_A_USER, config: {} });
  assertNoAdLinkDisable(adHome, 'ad_links home/root');
  assertNoAdLinkRawTechnicalText(adHome, 'ad_links home/root');
  assert.ok(/Tenant A Summer/.test(screenText(adHome)), 'ad_links home/root should show tenant A link');
  assert.ok(!/Tenant B Hidden Link|Tenant B Source|Global Legacy|payload trace token/.test(screenText(adHome)), 'ad_links home/root must not leak tenant B/global/legacy links');

  const adCard = await statsFlow.screenForPayload(menu, { action: 'admin_stats_campaign_view', campaignId: adLinkA.id, slug: adLinkA.slug }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(adCard.id, 'stats_campaign_view', 'tenant A ad link card should open');
  assertHasAdLinkDisable(adCard, 'tenant A ad link card');
  assertNoAdLinkRawTechnicalText(adCard, 'tenant A ad link card');
  assert.ok(/Рекламная ссылка/.test(screenText(adCard)) && /Источник/.test(screenText(adCard)) && /Статистика/.test(screenText(adCard)), 'ad link card must use product-safe wording');
  assert.ok(!/Tenant B Hidden Link|Global Legacy/.test(screenText(adCard)), 'tenant A ad link card must not leak other links');

  const missingLinkCard = await statsFlow.screenForPayload(menu, { action: 'admin_stats_campaign_view', campaignId: 'missing-link', slug: 'missing-link' }, { userId: TENANT_A_USER, config: {} });
  assertNoAdLinkDisable(missingLinkCard, 'missing ad link card');

  const rawDisable = await statsFlow.screenForPayload(menu, { action: 'admin_stats_campaign_disable', campaignId: adLinkA.id, slug: adLinkA.slug }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(adCampaigns.getCampaignBySlug(adLinkA.slug, { userId: TENANT_A_USER }).enabled, true, 'raw/stale ad link disable without card marker must not disable');
  assert.ok(/карточк[аи].*рекламн/i.test(screenText(rawDisable)), 'raw ad link disable should tell user to open link card');
  assertNoAdLinkDisable(rawDisable, 'raw ad link disable rejection');
  assertNoAdLinkRawTechnicalText(rawDisable, 'raw ad link disable rejection');

  const tenantBStaleDisable = await statsFlow.screenForPayload(menu, { action: 'admin_stats_campaign_disable', source: 'ad_link_card', campaignId: adLinkB.id, slug: adLinkB.slug }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(adCampaigns.getCampaignBySlug(adLinkB.slug, { userId: TENANT_B_USER }).enabled, true, 'tenant A card-marked disable must not disable tenant B link');
  assert.ok(/не найдена|недоступна/i.test(screenText(tenantBStaleDisable)), 'tenant B stale disable should be rejected for tenant A');
  assertNoAdLinkRawTechnicalText(tenantBStaleDisable, 'tenant B stale disable rejection');

  const disablePayload = callbackPayload(adCard, /Отключить ссылку/i);
  assert.deepStrictEqual(disablePayload, { action: 'admin_stats_campaign_disable', campaignId: adLinkA.id, slug: adLinkA.slug, source: 'ad_link_card' }, 'ad link disable button must carry ad link card marker');
  const disabledCard = await statsFlow.screenForPayload(menu, disablePayload, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(adCampaigns.getCampaignBySlug(adLinkA.slug, { userId: TENANT_A_USER }).enabled, false, 'card-marked ad link disable must disable selected tenant link');
  assert.strictEqual(adCampaigns.getCampaignBySlug(adLinkB.slug, { userId: TENANT_B_USER }).enabled, true, 'card-marked ad link disable must not disable tenant B link');
  assert.strictEqual(adCampaigns.getCampaignBySlug('global-legacy')?.enabled, true, 'card-marked ad link disable must not disable global legacy link');
  assert.ok(/Рекламная ссылка отключена/.test(screenText(disabledCard)), 'card-marked ad link disable should confirm removal');
  assertNoAdLinkDisable(disabledCard, 'ad_links after disable confirmation');
  assertNoAdLinkRawTechnicalText(disabledCard, 'ad_links after disable confirmation');

  store.setSetupState(TENANT_A_USER, {
    canReadLegacyUnscoped: true,
    buttonTargetPost: { commentKey: `${TENANT_B_CHANNEL}:post-b`, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b' },
    commentTargetPost: { commentKey: `${TENANT_B_CHANNEL}:post-b`, channelId: TENANT_B_CHANNEL, channelTitle: 'Tenant B Channel', postId: 'post-b' }
  });

  const buttonHomeWithoutTarget = await buttons.screenForPayload(menu, { action: 'admin_section_buttons' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonHomeWithoutTarget, 'buttons:home');
  assertNoDelete(buttonHomeWithoutTarget, 'buttons:home without target');

  const buttonStartAdd = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(buttonStartAdd, 'button_admin_start_add');
  assertNoButtonsCta(buttonStartAdd, 'button_admin_start_add');

  const commentKeyA = `${TENANT_A_CHANNEL}:post-a`;
  store.setSetupState(TENANT_A_USER, {
    buttonTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' },
    commentTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' }
  });
  const buttonCurrentEmpty = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertNoDelete(buttonCurrentEmpty, 'button_admin_show_current without existing buttons');


  maxApi.editMessage = async () => ({ ok: true, skipped: true });
  store.savePost(commentKeyA, { highlight: { enabled: true, badgeId: 'important', label: '⭐ Важно', updatedAt: 3000, mode: 'text_mark_no_button' } });
  store.savePost(`${TENANT_B_CHANNEL}:post-b`, { highlight: { enabled: true, badgeId: 'promo', label: '🔥 Акция', updatedAt: 3000, mode: 'text_mark_no_button' } });
  store.savePost('-global-legacy-highlight:post-x', { channelId: '-global-legacy-highlight', channelTitle: 'Global Legacy Highlight Channel', postId: 'post-x', messageId: 'msg-x', originalText: 'Global Legacy Highlight postId channelId payload trace token', highlight: { enabled: true, badgeId: 'new', label: '🆕 Новое', updatedAt: 3000, mode: 'text_mark_no_button' } });

  const highlightHome = highlights.home(menu);
  assertNoHighlightRemove(highlightHome, 'highlights home/root');
  assertNoHighlightRawTechnicalText(highlightHome, 'highlights home/root');

  const highlightPicker = highlights.picker(menu, TENANT_A_USER);
  assert.ok(/Tenant A Public Post/.test(screenText(highlightPicker)), 'highlights picker should show tenant A post');
  assert.ok(!/Tenant B Secret Post|Global Legacy Highlight|payload trace token/.test(screenText(highlightPicker)), 'highlights picker must not leak tenant B/global/legacy posts');
  assertNoHighlightRemove(highlightPicker, 'highlights picker');
  assertNoHighlightRawTechnicalText(highlightPicker, 'highlights picker');

  const highlightedCard = highlights.picked(menu, commentKeyA, TENANT_A_USER);
  assertHasHighlightRemove(highlightedCard, 'highlight card for selected highlighted post');
  assertNoHighlightRawTechnicalText(highlightedCard, 'highlight card for selected highlighted post');
  assert.ok(/Выделение поста/.test(screenText(highlightedCard)) && /Пост/.test(screenText(highlightedCard)) && /Тип метки/.test(screenText(highlightedCard)) && /Применить/.test(screenText(highlightedCard)) && /Снять выделение/.test(screenText(highlightedCard)), 'highlight card must use product-safe wording');

  const highlightInfo = highlights.info(menu, { commentKey: commentKeyA, userId: TENANT_A_USER });
  assert.ok(/Выделение поста/.test(screenText(highlightInfo)) && /Управлять выделением можно из карточки выбранного поста/.test(screenText(highlightInfo)), 'highlight_info must use product-safe wording');
  assertNoHighlightRawTechnicalText(highlightInfo, 'highlight_info');

  const removePayload = callbackPayload(highlightedCard, /Снять выделение/i);
  assert.deepStrictEqual(removePayload, { action: 'highlight_remove', commentKey: commentKeyA, source: 'highlight_card' }, 'highlight remove button must carry highlight-card marker');

  const rawHighlightRemove = await highlights.remove(menu, { commentKey: commentKeyA, userId: TENANT_A_USER, config: {} });
  assert.strictEqual(store.getPost(commentKeyA).highlight.enabled, true, 'raw/stale highlight_remove without highlight-card marker must not remove');
  assertNoHighlightRemove(rawHighlightRemove, 'raw/stale highlight remove rejection');
  assertNoHighlightRawTechnicalText(rawHighlightRemove, 'raw/stale highlight remove rejection');

  const tenantBHighlightRemove = await highlights.remove(menu, { commentKey: `${TENANT_B_CHANNEL}:post-b`, userId: TENANT_A_USER, source: 'highlight_card', config: {} });
  assert.strictEqual(store.getPost(`${TENANT_B_CHANNEL}:post-b`).highlight.enabled, true, 'tenant A card-marked remove must not remove tenant B highlight');
  assert.ok(/недоступен/i.test(screenText(tenantBHighlightRemove)), 'tenant B highlight remove rejection should be safe');
  assertNoHighlightRawTechnicalText(tenantBHighlightRemove, 'tenant B highlight remove rejection');

  const legacyHighlightRemove = await highlights.remove(menu, { commentKey: '-global-legacy-highlight:post-x', userId: TENANT_A_USER, source: 'highlight_card', config: {} });
  assert.strictEqual(store.getPost('-global-legacy-highlight:post-x').highlight.enabled, true, 'tenant A card-marked remove must not remove global legacy highlight');
  assertNoHighlightRawTechnicalText(legacyHighlightRemove, 'global legacy highlight remove rejection');

  const highlightStatus = highlights.statusScreen(menu, { userId: TENANT_A_USER });
  assert.ok(/Выделенных постов: 1/.test(screenText(highlightStatus)), 'highlight check must count only tenant A visible highlights');
  assert.ok(!/Tenant B Secret Post|Global Legacy Highlight|payload trace token/.test(screenText(highlightStatus)), 'highlight check must not leak tenant B/global/legacy highlights');
  assertNoHighlightRemove(highlightStatus, 'highlight check screen');
  assertNoHighlightRawTechnicalText(highlightStatus, 'highlight check screen');

  const applied = await highlights.apply(menu, { commentKey: commentKeyA, badgeId: 'promo', source: 'highlight_card', userId: TENANT_A_USER, config: {} });
  assert.strictEqual(store.getPost(commentKeyA).highlight.enabled, true, 'card-marked highlight apply must stay tied to selected tenant post');
  assert.strictEqual(store.getPost(commentKeyA).highlight.badgeId, 'promo', 'card-marked highlight apply must update selected tenant post marker');
  assertNoHighlightRawTechnicalText(applied, 'card-marked highlight apply confirmation');

  const removed = await highlights.remove(menu, { ...removePayload, userId: TENANT_A_USER, config: {} });
  assert.strictEqual(store.getPost(commentKeyA).highlight.enabled, false, 'card-marked highlight_remove must remove selected tenant highlight');
  assert.strictEqual(store.getPost(`${TENANT_B_CHANNEL}:post-b`).highlight.enabled, true, 'card-marked highlight_remove must not remove tenant B highlight');
  assert.strictEqual(store.getPost('-global-legacy-highlight:post-x').highlight.enabled, true, 'card-marked highlight_remove must not remove global legacy highlight');
  assert.ok(/Выделение снято/.test(screenText(removed)), 'card-marked highlight remove should confirm removal');
  assertNoHighlightRawTechnicalText(removed, 'card-marked highlight remove confirmation');

  const plainCard = highlights.picked(menu, commentKeyA, TENANT_A_USER);
  assertNoHighlightRemove(plainCard, 'highlight card for selected post without highlight');
  assertNoHighlightRawTechnicalText(plainCard, 'highlight card for selected post without highlight');
  store.store.growth.byChannel[TENANT_A_CHANNEL] = {
    channelId: TENANT_A_CHANNEL,
    buttonSets: {
      [commentKeyA]: [{ id: 'existing-button', text: 'Подробнее', url: 'https://example.com/a', tenantKey: tenantA.tenantKey, ownerUserId: TENANT_A_USER }]
    }
  };

  const buttonHomeWithTarget = await buttons.screenForPayload(menu, { action: 'admin_section_buttons' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonHomeWithTarget, 'buttons:home with target');
  assertNoDelete(buttonHomeWithTarget, 'buttons:home with existing buttons');

  const buttonCurrent = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(buttonCurrent, 'button_admin_show_current');
  assertHasDelete(buttonCurrent, 'button_admin_show_current with selected post buttons');

  const addLabel = await buttons.screenForPayload(menu, { action: 'button_admin_start_add' }, { userId: TENANT_A_USER, config: {} });
  assertNoButtonsCta(addLabel, 'button_admin_start_add selected post');
  assert.strictEqual(addLabel.id, 'buttons_clean_add_label', 'button_admin_start_add starts text entry for selected post');
  const addUrl = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'Купить', config: {} });
  assert.strictEqual(addUrl.id, 'buttons_clean_add_url', 'button text input should ask for URL next');
  const beforeUrlInputCount = buttonSet(commentKeyA).length;
  const preview = await buttons.handleTextInput(menu, { userId: TENANT_A_USER, text: 'https://example.com/buy', config: {} });
  assert.strictEqual(preview.id, 'buttons_clean_add_preview', 'URL input must show preview before save');
  assert.ok(/Купить/.test(screenText(preview)) && /https:\/\/example.com\/buy/.test(screenText(preview)), 'preview must show button text and link');
  assert.strictEqual(buttonSet(commentKeyA).length, beforeUrlInputCount, 'URL input must not save immediately');
  const saved = await buttons.screenForPayload(menu, { action: 'button_admin_save' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeUrlInputCount + 1, 'preview confirmation must save the draft button');
  assert.ok(/Кнопка сохранена/.test(screenText(saved)), 'preview confirmation should return saved state');

  const beforeRawDeleteCount = buttonSet(commentKeyA).length;
  const rawDelete = await buttons.screenForPayload(menu, { action: 'button_admin_delete' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeRawDeleteCount, 'raw button_admin_delete without card marker must not delete');
  assert.ok(/Текущие кнопки/.test(screenText(rawDelete)), 'raw delete should tell user to open current-buttons card');
  assertNoButtonsCta(rawDelete, 'raw delete rejection');

  const currentAfterSave = await buttons.screenForPayload(menu, { action: 'button_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertHasDelete(currentAfterSave, 'button_admin_show_current after save');
  assert.deepStrictEqual(deletePayload(currentAfterSave), { action: 'button_admin_delete', source: 'current_buttons_card' }, 'delete button must carry current-buttons card marker');
  const cardDelete = await buttons.screenForPayload(menu, deletePayload(currentAfterSave), { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(buttonSet(commentKeyA).length, beforeRawDeleteCount - 1, 'card-marked button_admin_delete must delete exactly one button');
  assert.ok(/Последняя кнопка удалена/.test(screenText(cardDelete)), 'card-marked delete should confirm removal');


  const originalPollMethods = {
    status: pollService.status,
    listRecent: pollService.listRecent,
    summary: pollService.summary,
    closePoll: pollService.closePoll,
    buildPollKeyboardRows: pollService.buildPollKeyboardRows,
    editMessage: maxApi.editMessage
  };
  const pollState = {
    a: { pollId: 101, question: 'Tenant A Product Question', commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, postId: 'post-a', status: 'active', total: 3, options: [{ text: 'Да', votes: 2, percent: 67 }, { text: 'Нет', votes: 1, percent: 33 }] },
    b: { pollId: 202, question: 'Tenant B Hidden Poll', commentKey: `${TENANT_B_CHANNEL}:post-b`, channelId: TENANT_B_CHANNEL, postId: 'post-b', status: 'active', total: 1, options: [{ text: 'Скрытый ответ', votes: 1, percent: 100 }, { text: 'Нет', votes: 0, percent: 0 }] },
    legacy: { pollId: 303, question: 'Global Legacy Poll postId channelId', commentKey: '-global-legacy:post-x', channelId: '-global-legacy', postId: 'post-x', status: 'active', total: 0, options: [{ text: 'payload trace token', votes: 0, percent: 0 }, { text: 'Нет', votes: 0, percent: 0 }] }
  };
  pollService.status = async () => { throw new Error('poll status screen must not read global poll totals'); };
  pollService.listRecent = async () => Object.values(pollState).map((item) => ({ pollId: item.pollId, question: item.question, status: item.status, commentKey: item.commentKey, channelId: item.channelId, postId: item.postId }));
  pollService.summary = async (pollId) => Object.values(pollState).find((item) => Number(item.pollId) === Number(pollId)) || null;
  pollService.closePoll = async ({ pollId, channelId, postId, commentKey }) => {
    const item = Object.values(pollState).find((candidate) => Number(candidate.pollId) === Number(pollId) && candidate.channelId === channelId && candidate.postId === postId && candidate.commentKey === commentKey && candidate.status === 'active');
    if (!item) return { ok: false, closed: false };
    item.status = 'closed';
    return { ok: true, closed: true, pollId: item.pollId };
  };
  pollService.buildPollKeyboardRows = async () => [];
  maxApi.editMessage = async () => ({ ok: true, skipped: true });

  const pollsHome = polls.home(menu);
  assertNoPollStop(pollsHome, 'polls home/root');
  assertNoPollRawTechnicalText(pollsHome, 'polls home/root');

  const pollsStatus = await polls.statusScreen(menu, { userId: TENANT_A_USER });
  assertNoPollStop(pollsStatus, 'polls results list');
  assertNoPollRawTechnicalText(pollsStatus, 'polls results list');
  assert.ok(/Активных опросов: 1/.test(screenText(pollsStatus)), 'polls results list must count only tenant A visible active poll');
  assert.ok(/Голосов в видимых опросах: 3/.test(screenText(pollsStatus)), 'polls results list must count votes only from visible polls');
  assert.ok(!/Опросов: 3|Голосов: 4/.test(screenText(pollsStatus)), 'polls results list must not show global poll totals');
  assert.ok(/Tenant A Product Question/.test(screenText(pollsStatus)), 'polls results list should show tenant A active poll');
  assert.ok(!/Tenant B Hidden Poll|Global Legacy Poll|payload trace token/.test(screenText(pollsStatus)), 'polls results list must not leak tenant B/global/legacy polls');

  const activePollCard = await polls.resultsScreen(menu, { userId: TENANT_A_USER, pollId: pollState.a.pollId });
  assertHasPollStop(activePollCard, 'active poll card');
  assertNoPollRawTechnicalText(activePollCard, 'active poll card');
  assert.ok(/Опрос/.test(screenText(activePollCard)) && /Вопрос/.test(screenText(activePollCard)) && /Ответы/.test(screenText(activePollCard)) && /Результаты/.test(screenText(activePollCard)), 'poll card must use product-safe wording');

  const rawStop = await polls.stopPoll(menu, { userId: TENANT_A_USER, pollId: pollState.a.pollId });
  assert.strictEqual(pollState.a.status, 'active', 'raw/stale poll stop without poll-card marker must not stop');
  assertNoPollStop(rawStop, 'raw poll stop rejection');
  assertNoPollRawTechnicalText(rawStop, 'raw poll stop rejection');

  const tenantBStop = await polls.stopPoll(menu, { userId: TENANT_A_USER, pollId: pollState.b.pollId, source: 'poll_card' });
  assert.strictEqual(pollState.b.status, 'active', 'tenant A card-marked stop must not stop tenant B poll');
  assert.ok(/не найден|активного опроса/i.test(screenText(tenantBStop)), 'tenant B stop rejection should be safe');
  assertNoPollRawTechnicalText(tenantBStop, 'tenant B poll stop rejection');

  const legacyStop = await polls.stopPoll(menu, { userId: TENANT_A_USER, pollId: pollState.legacy.pollId, source: 'poll_card' });
  assert.strictEqual(pollState.legacy.status, 'active', 'tenant A card-marked stop must not stop global legacy poll');
  assertNoPollRawTechnicalText(legacyStop, 'global legacy poll stop rejection');

  const stopPayload = callbackPayload(activePollCard, /Остановить опрос/i);
  assert.deepStrictEqual(stopPayload, { action: 'poll_stop', pollId: pollState.a.pollId, source: 'poll_card' }, 'poll stop button must carry poll-card marker');
  const stopped = await polls.stopPoll(menu, { userId: TENANT_A_USER, pollId: stopPayload.pollId, source: stopPayload.source, config: {} });
  assert.strictEqual(pollState.a.status, 'closed', 'card-marked poll stop must stop selected tenant poll');
  assert.strictEqual(pollState.b.status, 'active', 'card-marked poll stop must not stop tenant B poll');
  assert.strictEqual(pollState.legacy.status, 'active', 'card-marked poll stop must not stop global legacy poll');
  assert.ok(/Опрос остановлен/.test(screenText(stopped)), 'card-marked poll stop should confirm stop');
  assertNoPollRawTechnicalText(stopped, 'card-marked poll stop confirmation');

  const stoppedCard = await polls.resultsScreen(menu, { userId: TENANT_A_USER, pollId: pollState.a.pollId });
  assertNoPollStop(stoppedCard, 'closed poll results card');

  pollService.status = originalPollMethods.status;
  pollService.listRecent = originalPollMethods.listRecent;
  pollService.summary = originalPollMethods.summary;
  pollService.closePoll = originalPollMethods.closePoll;
  pollService.buildPollKeyboardRows = originalPollMethods.buildPollKeyboardRows;
  maxApi.editMessage = originalPollMethods.editMessage;


  store.setSetupState(TENANT_A_USER, {
    giftTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' },
    commentTargetPost: { commentKey: commentKeyA, channelId: TENANT_A_CHANNEL, channelTitle: 'Tenant A Channel', postId: 'post-a', messageId: 'msg-a' }
  });
  const tenantBCampaign = tenantScope.patchStoredGiftCampaign(store.saveGiftCampaign({
    id: 'gift-tenant-b-hidden',
    title: 'Tenant B Hidden Gift',
    channelId: TENANT_B_CHANNEL,
    requiredChatId: TENANT_B_CHANNEL,
    postIds: ['post-b'],
    commentKey: `${TENANT_B_CHANNEL}:post-b`,
    giftUrl: 'https://example.com/b',
    enabled: true
  }), tenantScope.ensureTenantContext(TENANT_B_USER));
  const giftCampaignA = tenantScope.patchStoredGiftCampaign(store.saveGiftCampaign({
    id: 'gift-tenant-a-visible',
    title: 'Tenant A Gift',
    channelId: TENANT_A_CHANNEL,
    requiredChatId: TENANT_A_CHANNEL,
    postIds: ['post-a'],
    commentKey: commentKeyA,
    giftUrl: 'https://example.com/a-material',
    enabled: true
  }), tenantScope.ensureTenantContext(TENANT_A_USER));
  assert.ok(tenantBCampaign && giftCampaignA, 'gift test campaigns should be created');

  const giftHomeWithExisting = await gifts.screenForPayload(menu, { action: 'admin_section_gifts' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(giftHomeWithExisting, 'gifts:home with existing gift');
  assertNoGiftDestructiveActions(giftHomeWithExisting, 'gifts:home with existing gift');
  assertNoGiftRawTechnicalText(giftHomeWithExisting, 'gifts:home with existing gift');
  assertNoGiftInternalWording(giftHomeWithExisting, 'gifts:home with existing gift');
  assert.ok(!/Tenant B Hidden Gift|Tenant B Secret Post|Tenant B Channel/.test(screenText(giftHomeWithExisting)), 'gifts:home must not leak tenant B/global/legacy gifts');

  const giftCurrent = await gifts.screenForPayload(menu, { action: 'gift_admin_show_current' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(giftCurrent, 'gift_admin_show_current with gift');
  assert.ok(buttonLabels(giftCurrent).some((text) => /Удалить подарок/i.test(text)), 'current gift card must expose delete when gift exists');
  assert.ok(buttonLabels(giftCurrent).some((text) => /Заменить материал/i.test(text)), 'current gift card must expose material replacement when gift exists');
  assertNoGiftRawTechnicalText(giftCurrent, 'gift_admin_show_current with gift');
  assertNoGiftInternalWording(giftCurrent, 'gift_admin_show_current with gift');

  const rawGiftDeleteCount = Object.keys(store.store.gifts.campaigns || {}).length;
  const rawGiftDelete = await gifts.screenForPayload(menu, { action: 'gift_admin_delete_existing' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(Object.keys(store.store.gifts.campaigns || {}).length, rawGiftDeleteCount, 'raw gift_admin_delete_existing without card marker must not delete');
  assert.ok(/карточк[аи].*подарк/i.test(screenText(rawGiftDelete)), 'raw gift delete should tell user to open gift card');
  assertNoGiftDestructiveActions(rawGiftDelete, 'raw gift_admin_delete_existing rejection');
  assertNoGiftInternalWording(rawGiftDelete, 'raw gift_admin_delete_existing rejection');
  const rawGiftConfirm = await gifts.screenForPayload(menu, { action: 'gift_admin_confirm_delete' }, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(Object.keys(store.store.gifts.campaigns || {}).length, rawGiftDeleteCount, 'raw gift_admin_confirm_delete without card marker must not delete');
  assert.ok(/карточк[аи].*подарк/i.test(screenText(rawGiftConfirm)), 'raw gift confirm delete should tell user to open gift card');
  assertNoGiftDestructiveActions(rawGiftConfirm, 'raw gift_admin_confirm_delete rejection');
  assertNoGiftInternalWording(rawGiftConfirm, 'raw gift_admin_confirm_delete rejection');

  const replacePayload = callbackPayload(giftCurrent, /Заменить материал/i);
  assert.deepStrictEqual(replacePayload, { action: 'gift_admin_replace_existing', source: 'gift_card' }, 'gift replace button must carry gift-card marker');
  const replaceStart = await gifts.screenForPayload(menu, replacePayload, { userId: TENANT_A_USER, config: {} });
  assert.strictEqual(replaceStart.id, 'gifts_clean_start_create', 'card-marked replace must start material replacement');
  assert.ok(/ссылку на материал подарка/i.test(screenText(replaceStart)), 'replace start should use safe material wording');
  assertNoGiftRawTechnicalText(replaceStart, 'card-marked gift replacement start');
  assertNoGiftInternalWording(replaceStart, 'card-marked gift replacement start');
  const replaceMessage = await gifts.handleTextInput(menu, { userId: TENANT_A_USER, text: 'https://example.com/replaced-material', config: {} });
  assertNoGiftInternalWording(replaceMessage, 'gift material link step');
  const replaceConditions = await gifts.screenForPayload(menu, { action: 'gift_admin_message_default' }, { userId: TENANT_A_USER, config: {} });
  assertNoGiftInternalWording(replaceConditions, 'gift conditions after material link');
  const replaceSaved = await gifts.screenForPayload(menu, { action: 'gift_admin_save' }, { userId: TENANT_A_USER, config: {} });
  assert.ok(/Пост будет обновлён после сохранения подарка/i.test(screenText(replaceSaved)), 'gift save note should use product update wording');
  assertNoGiftRawTechnicalText(replaceSaved, 'gift save note');
  assertNoGiftInternalWording(replaceSaved, 'gift save note');

  const deleteStartPayload = callbackPayload(giftCurrent, /Удалить подарок/i);
  assert.deepStrictEqual(deleteStartPayload, { action: 'gift_admin_delete_existing', source: 'gift_card' }, 'gift delete button must carry gift-card marker');
  const deleteConfirmScreen = await gifts.screenForPayload(menu, deleteStartPayload, { userId: TENANT_A_USER, config: {} });
  assert.ok(buttonLabels(deleteConfirmScreen).some((text) => /Да, удалить/i.test(text)), 'card-marked delete should show confirmation');
  assertNoGiftRawTechnicalText(deleteConfirmScreen, 'card-marked delete confirmation');
  assertNoGiftInternalWording(deleteConfirmScreen, 'card-marked delete confirmation');
  const confirmDeletePayload = callbackPayload(deleteConfirmScreen, /Да, удалить/i);
  assert.deepStrictEqual(confirmDeletePayload, { action: 'gift_admin_confirm_delete', source: 'gift_card' }, 'gift delete confirmation must carry gift-card marker');
  const afterCardDelete = await gifts.screenForPayload(menu, confirmDeletePayload, { userId: TENANT_A_USER, config: {} });
  assert.ok(!store.store.gifts.campaigns['gift-tenant-a-visible'], 'card-marked gift delete must delete selected gift');
  assert.ok(store.store.gifts.campaigns['gift-tenant-b-hidden'], 'card-marked gift delete must not delete tenant B gift');
  assert.ok(/Подарок удалён/.test(screenText(afterCardDelete)), 'card-marked gift delete should confirm removal');
  assertNoGiftDestructiveActions(afterCardDelete, 'gifts:home after card delete');
  assertNoGiftRawTechnicalText(afterCardDelete, 'gifts:home after card delete');
  assertNoGiftInternalWording(afterCardDelete, 'gifts:home after card delete');

  const giftRecentPosts = await gifts.screenForPayload(menu, { action: 'gift_admin_recent_posts' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(giftRecentPosts, 'gift_admin_recent_posts');
  assertNoGiftRawTechnicalText(giftRecentPosts, 'gift_admin_recent_posts');
  assertNoGiftInternalWording(giftRecentPosts, 'gift_admin_recent_posts');

  const archiveList = await archive.screenForPayload(menu, { action: 'archive_list' }, { userId: TENANT_A_USER, config: {} });
  assertTenantAScreen(archiveList, 'archive_list');

  console.log('PR115 menu flow matrix tenant filtering assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
