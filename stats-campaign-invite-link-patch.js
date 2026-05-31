'use strict';

const RUNTIME = 'CC8.3.22-ADS-INVITE-LINKS';

function clean(value) { return String(value || '').trim(); }
function channelTitle(channel = {}) {
  const title = clean(channel.title || channel.channelTitle || channel.name || channel.channelName || channel.chatTitle);
  return title && !/^-?\d{6,}$/.test(title) ? title : 'Канал без названия';
}
function button(menu, text, action, extra = {}) { return menu.button(text, action, extra); }
function screen(menu, id, title, lines) {
  return {
    id,
    text: [title, '', ...(lines || [])].filter(Boolean).join('\n'),
    attachments: menu.keyboard([
      [button(menu, '❌ Отменить', 'admin_stats_campaign_cancel')],
      [button(menu, '📣 В начало рекламы', 'admin_stats_campaigns')],
      [button(menu, '🏠 Главное меню', 'admin_section_main')]
    ])
  };
}

function install() {
  const store = require('./store');
  const statsFlow = require('./stats-flow-cc8');
  const ads = require('./services/adCampaignService');
  if (statsFlow.__adminkitInviteLinkPatchInstalled) return { ok: true, already: true, runtimeVersion: RUNTIME };
  const originalScreenForPayload = statsFlow.screenForPayload;
  const originalHandleTextInput = statsFlow.handleTextInput;

  statsFlow.screenForPayload = async function inviteAwareScreenForPayload(menu, payload = {}, ctx = {}) {
    const action = clean(payload.action);
    if (action === 'admin_stats_campaign_channel') {
      const channelId = clean(payload.channelId);
      const channel = store.getChannelsList().find((item) => clean(item.channelId) === channelId) || { channelId };
      const direct = ads.targetUrlForChannel(channel);
      if (!direct) {
        store.setSetupState(ctx.userId, {
          statsCampaignFlow: { step: 'registered_channel_url', channelId, channelTitle: channelTitle(channel), startedAt: Date.now() },
          activeAdminFlowKind: 'stats_campaign'
        });
        return screen(menu, 'stats_campaign_registered_invite_url', '📣 Нужна ссылка на канал', [
          `Канал: ${channelTitle(channel)}`,
          '',
          'У канала пока нет сохранённой публичной ссылки.',
          'Если канал приватный, пришлите ссылку-приглашение из MAX.',
          'Формат: https://max.ru/join/...',
          '',
          'Если канал публичный, можно прислать публичную ссылку/ник канала.'
        ]);
      }
      const result = await originalScreenForPayload(menu, payload, ctx);
      if (result && typeof result.text === 'string') {
        const isInvite = /max\.ru\/join\//i.test(direct);
        result.text = result.text
          .replace('Если прямой ссылки нет в данных канала, используем системную ссылку по ID канала.', 'Если ссылки нет в данных канала, бот попросит ссылку-приглашение. Технический ID не используем как ссылку.')
          .replace('Ссылка на канал будет собрана автоматически.', isInvite ? 'Будет использована сохранённая ссылка-приглашение MAX.' : 'Будет использована сохранённая публичная ссылка канала.');
      }
      return result;
    }
    if (action === 'admin_stats_campaign_create') {
      const result = await originalScreenForPayload(menu, payload, ctx);
      if (result && typeof result.text === 'string' && !result.text.includes('Если канал приватный')) {
        result.text += '\n\nЕсли канал приватный, для рекламы нужна ссылка-приглашение MAX формата https://max.ru/join/...';
      }
      return result;
    }
    return originalScreenForPayload(menu, payload, ctx);
  };

  statsFlow.handleTextInput = async function inviteAwareHandleTextInput(menu, ctx = {}) {
    const userId = clean(ctx.userId);
    const text = clean(ctx.text);
    const state = store.getSetupState(userId) || {};
    const flow = state.statsCampaignFlow || null;
    if (flow && clean(state.activeAdminFlowKind) === 'stats_campaign' && clean(flow.step) === 'registered_channel_url') {
      const direct = ads.normalizeDirectUrl(text);
      if (!direct) {
        return screen(menu, 'stats_campaign_bad_invite_url', '📣 Нужна ссылка на канал', [
          'Ссылка должна быть ссылкой MAX.',
          'Для приватного канала пришлите ссылку-приглашение вида https://max.ru/join/...',
          'Для публичного канала можно прислать публичную ссылку канала.'
        ]);
      }
      store.saveChannel(flow.channelId, {
        inviteLink: direct,
        joinUrl: direct,
        publicLink: direct,
        link: direct,
        title: flow.channelTitle || ''
      });
      store.setSetupState(userId, {
        statsCampaignFlow: { ...flow, step: 'name', targetUrl: direct },
        activeAdminFlowKind: 'stats_campaign'
      });
      return screen(menu, 'stats_campaign_name_after_invite', '📣 Создание рекламной ссылки', [
        `Канал: ${flow.channelTitle || 'выбранный канал'}`,
        'Ссылка на канал сохранена.',
        /max\.ru\/join\//i.test(direct) ? 'Тип ссылки: приглашение MAX.' : 'Тип ссылки: публичная ссылка канала.',
        '',
        'Теперь напишите название кампании.',
        'Например: Реклама у Маши / Посев июнь / Сторис блогера'
      ]);
    }
    return originalHandleTextInput ? originalHandleTextInput(menu, ctx) : null;
  };

  statsFlow.__adminkitInviteLinkPatchInstalled = true;
  return { ok: true, runtimeVersion: RUNTIME };
}

module.exports = { RUNTIME, install };
