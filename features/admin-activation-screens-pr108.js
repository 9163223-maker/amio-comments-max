'use strict';

const access = require('../services/clientAccessService');
const tariffs = require('../services/tariffConfig');
const menu = require('../v3-menu-core-1539');

const ADMIN_RUNTIME = access.ADMIN_ACCESS_RUNTIME;

function clean(value) { return String(value || '').trim(); }
function button(text, action, extra = {}) { return menu.button(text, action, extra); }
function keyboard(rows) { return menu.keyboard(rows); }
function dateRu(value = '') { if (!value) return 'без даты'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'без даты' : d.toLocaleDateString('ru-RU', { timeZone: 'UTC' }); }
function denyScreen() {
  return { id: 'pr108_admin_denied', text: ['Недоступно', '', 'Админ-панель доступна только поддержке. Обратитесь к поддержке, если вам нужен доступ.'].join('\n'), attachments: keyboard([[button('Поддержка', 'account_support')]]) };
}
function manualDeferredScreen(maxUserId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  return { id: 'pr108_admin_manual_deferred', text: 'Ручной ввод будет добавлен позже. Создайте код через фиксированные варианты.', attachments: keyboard([[button('Создать код', 'admin_code_create')], [button('Админ-панель', 'admin_panel')]]) };
}
function assertAdmin(maxUserId = '') { return access.isAdmin(maxUserId); }
function adminPanel(maxUserId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  return { id: 'pr108_admin_panel', text: ['🛠 Админ-панель', '', 'Управление доступами АдминКИТ.'].join('\n'), attachments: keyboard([[button('Создать код', 'admin_code_create')], [button('Коды доступа', 'admin_codes_list')], [button('Клиенты / tenants', 'admin_tenants_list')], [button('Главное меню', 'admin_section_main')]]) };
}
function createPlanScreen(maxUserId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  return { id: 'pr108_admin_code_plan', text: ['Создать код', '', 'Выберите тариф/план.'].join('\n'), attachments: keyboard([[button('Trial / Free', 'admin_code_plan_free')], [button('Start', 'admin_code_plan_start')], [button('Pro', 'admin_code_plan_pro')], [button('Business', 'admin_code_plan_business')], [button('Отмена', 'admin_panel')]]) };
}
function createDurationScreen(maxUserId = '', planId = 'start') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const extra = { planId };
  return { id: 'pr108_admin_code_duration', text: ['Создать код', '', `Тариф: ${tariffs.getTariff(planId).name}`, 'Выберите срок действия.'].join('\n'), attachments: keyboard([[button('7 дней', 'admin_code_duration_7', extra), button('14 дней', 'admin_code_duration_14', extra)], [button('30 дней', 'admin_code_duration_30', extra), button('90 дней', 'admin_code_duration_90', extra)], [button('365 дней', 'admin_code_duration_365', extra)], [button('Назад', 'admin_code_create'), button('Отмена', 'admin_panel')]]) };
}
function createChannelsScreen(maxUserId = '', planId = 'start', durationDays = 30) {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const extra = { planId, durationDays };
  return { id: 'pr108_admin_code_channels', text: ['Создать код', '', `Тариф: ${tariffs.getTariff(planId).name}`, `Срок: ${durationDays} дней`, 'Выберите лимит каналов.'].join('\n'), attachments: keyboard([[button('1 канал', 'admin_code_channels_1', extra), button('3 канала', 'admin_code_channels_3', extra)], [button('5 каналов', 'admin_code_channels_5', extra), button('10 каналов', 'admin_code_channels_10', extra)], [button('Назад', 'admin_code_create'), button('Отмена', 'admin_panel')]]) };
}
function createBindScreen(maxUserId = '', planId = 'start', durationDays = 30, maxChannels = 1) {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const extra = { planId, durationDays, maxChannels };
  return { id: 'pr108_admin_code_bind', text: ['Создать код', '', 'Привязка к каналу необязательна.', 'Для production-safe минимального flow используйте «Без привязки к каналу».'].join('\n'), attachments: keyboard([[button('Без привязки к каналу', 'admin_code_bind_none', extra)], [button('Назад', 'admin_code_create'), button('Отмена', 'admin_panel')]]) };
}
function confirmScreen(maxUserId = '', opts = {}) {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const plan = tariffs.getTariff(opts.planId || 'start');
  const durationDays = Number(opts.durationDays || 30);
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  const maxChannels = Number(opts.maxChannels || plan.maxChannels || 1);
  const boundChannelId = clean(opts.boundChannelId || '');
  return { id: 'pr108_admin_code_confirm', text: ['Создать код', '', `Тариф: ${plan.name}`, `Срок: ${durationDays} дней`, `Лимит каналов: ${maxChannels}`, `Действует до: ${dateRu(expiresAt)}`, 'singleUse: да', boundChannelId ? `channelId: ${boundChannelId}` : 'Привязка к каналу: нет', '', 'Создать код?'].join('\n'), attachments: keyboard([[button('Создать код', 'admin_code_confirm_create', { planId: plan.id, durationDays, maxChannels, boundChannelId })], [button('Назад', 'admin_code_create'), button('Отмена', 'admin_panel')]]) };
}
function createdScreen(maxUserId = '', opts = {}) {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const created = access.createActivationCode({ planId: opts.planId || 'start', durationDays: Number(opts.durationDays || 30), maxChannels: Number(opts.maxChannels || 1), boundChannelId: opts.boundChannelId || '', createdByMaxUserId: maxUserId });
  return { id: 'pr108_admin_code_created', text: ['✅ Код создан', '', `Код создан: ${created.code}`, '', `Тариф: ${tariffs.getTariff(created.planId).name}`, `Действует до: ${dateRu(created.expiresAt)}`, `Лимит каналов: ${created.maxChannels}`, '', 'Передайте код клиенту. Клиент должен открыть бота и нажать «Активировать код».', '', 'Этот полный код больше не будет показан в списке или истории.'].join('\n'), attachments: keyboard([[button('Коды доступа', 'admin_codes_list')], [button('Создать ещё', 'admin_code_create')], [button('Главное меню', 'admin_section_main')]]) };
}
function codesListScreen(maxUserId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const codes = access.listActivationCodes({ limit: 10 });
  const lines = ['Коды доступа', ''];
  if (!codes.length) lines.push('Кодов пока нет.');
  codes.forEach((code, index) => lines.push(`${index + 1}. ${code.safeCodeLabel} · ${tariffs.getTariff(code.planId).name} · ${code.status} · до ${dateRu(code.expiresAt)}${code.usedAt ? ` · использован ${dateRu(code.usedAt)}` : ''}${code.usedByMaxUserId ? ` · user ${code.usedByMaxUserId}` : ''}`));
  const rows = codes.slice(0, 5).map((code, index) => [button(`Подробнее ${index + 1}`, 'admin_code_details', { codeHashOrSafeId: code.codeHashPrefix })]);
  rows.push([button('Создать код', 'admin_code_create')], [button('Назад', 'admin_panel')]);
  return { id: 'pr108_admin_codes_list', text: lines.join('\n'), attachments: keyboard(rows) };
}
function codeDetailsScreen(maxUserId = '', codeHashOrSafeId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const code = access.getActivationCodeInfo({ codeHashOrSafeId });
  if (!code) return { id: 'pr108_admin_code_not_found', text: 'Код не найден.', attachments: keyboard([[button('Коды доступа', 'admin_codes_list')]]) };
  const rows = [];
  if (code.status === 'active') rows.push([button('Отозвать', 'admin_code_revoke', { codeHashOrSafeId: code.codeHashPrefix })]);
  rows.push([button('Назад', 'admin_codes_list')]);
  return { id: 'pr108_admin_code_details', text: ['Код доступа', '', `Код: ${code.safeCodeLabel}`, `Тариф: ${tariffs.getTariff(code.planId).name}`, `Статус: ${code.status}`, `Создан: ${dateRu(code.createdAt)}`, `Действует до: ${dateRu(code.expiresAt)}`, code.usedAt ? `Использован: ${dateRu(code.usedAt)}` : '', code.usedByMaxUserId ? `Used by: ${code.usedByMaxUserId}` : '', code.tenantId ? `Tenant: ${code.tenantId}` : '', code.boundChannelId ? `Channel: ${code.boundChannelId}` : ''].filter(Boolean).join('\n'), attachments: keyboard(rows) };
}
function revokeScreen(maxUserId = '', codeHashOrSafeId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const code = access.revokeActivationCode({ codeHashOrSafeId, revokedByMaxUserId: maxUserId });
  return { id: 'pr108_admin_code_revoked', text: code ? `Код отозван: ${code.safeCodeLabel}` : 'Код не найден.', attachments: keyboard([[button('Коды доступа', 'admin_codes_list')], [button('Админ-панель', 'admin_panel')]]) };
}
function tenantsListScreen(maxUserId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const tenants = access.listTenants({ limit: 10 });
  const lines = ['Клиенты / tenants', ''];
  if (!tenants.length) lines.push('Клиентов пока нет.');
  tenants.forEach((tenant, index) => lines.push(`${index + 1}. ${tenant.shortTenantId} · owner ${tenant.ownerMaxUserId} · ${tenant.planId} · ${tenant.status} · до ${dateRu(tenant.expiresAt)} · channels ${tenant.channelsCount}/${tenant.maxChannels}`));
  const rows = tenants.slice(0, 5).map((tenant, index) => [button(`Tenant ${index + 1}`, 'admin_tenant_details', { tenantId: tenant.tenantId })]);
  rows.push([button('Назад', 'admin_panel')]);
  return { id: 'pr108_admin_tenants_list', text: lines.join('\n'), attachments: keyboard(rows) };
}
function tenantDetailsScreen(maxUserId = '', tenantId = '') {
  if (!assertAdmin(maxUserId)) return denyScreen();
  const tenant = access.getTenantInfo({ tenantId });
  if (!tenant) return { id: 'pr108_admin_tenant_not_found', text: 'Tenant не найден.', attachments: keyboard([[button('Клиенты / tenants', 'admin_tenants_list')]]) };
  const channels = access.listTenantChannels(tenant.tenantId);
  const events = access.listAccessEvents({ tenantId: tenant.tenantId, limit: 5 });
  return { id: 'pr108_admin_tenant_details', text: ['Tenant', '', `tenantId: ${tenant.tenantId}`, `owner: ${tenant.ownerMaxUserId}`, `plan: ${tenant.planId}`, `status: ${tenant.status}`, `expiresAt: ${dateRu(tenant.expiresAt)}`, `channels: ${channels.length}/${tenant.maxChannels}`, ...(channels.length ? channels.map((ch) => `• ${ch.channelTitle || ch.channelId} (${ch.status})`) : ['• Каналы пока не подключены']), '', 'Recent access events:', ...(events.length ? events.map((event) => `• ${event.eventType} · ${dateRu(event.createdAt)} · user ${event.maxUserId || '—'}`) : ['• событий пока нет'])].join('\n'), attachments: keyboard([[button('Клиенты / tenants', 'admin_tenants_list')], [button('Админ-панель', 'admin_panel')]]) };
}
function screenForAction(action = '', maxUserId = '', payload = {}) {
  const a = clean(action);
  if (a === 'admin_panel') return adminPanel(maxUserId);
  if (a === 'admin_code_duration_manual' || a === 'admin_code_channels_manual' || a === 'admin_code_bind_manual') return manualDeferredScreen(maxUserId);
  if (a === 'admin_code_create') return createPlanScreen(maxUserId);
  if (a.startsWith('admin_code_plan_')) return createDurationScreen(maxUserId, a.replace('admin_code_plan_', ''));
  if (a.startsWith('admin_code_duration_')) return createChannelsScreen(maxUserId, payload.planId || 'start', Number(a.replace('admin_code_duration_', '')) || Number(payload.durationDays || 30));
  if (a.startsWith('admin_code_channels_')) return createBindScreen(maxUserId, payload.planId || 'start', Number(payload.durationDays || 30), Number(a.replace('admin_code_channels_', '')) || Number(payload.maxChannels || 1));
  if (a === 'admin_code_bind_none') return confirmScreen(maxUserId, { ...payload, boundChannelId: '' });
  if (a === 'admin_code_confirm_create') return createdScreen(maxUserId, payload);
  if (a === 'admin_codes_list') return codesListScreen(maxUserId);
  if (a === 'admin_code_details') return codeDetailsScreen(maxUserId, payload.codeHashOrSafeId || '');
  if (a === 'admin_code_revoke') return revokeScreen(maxUserId, payload.codeHashOrSafeId || '');
  if (a === 'admin_tenants_list') return tenantsListScreen(maxUserId);
  if (a === 'admin_tenant_details') return tenantDetailsScreen(maxUserId, payload.tenantId || '');
  return null;
}

module.exports = { ADMIN_RUNTIME, denyScreen, manualDeferredScreen, adminPanel, screenForAction, createdScreen, codesListScreen, codeDetailsScreen, tenantsListScreen, tenantDetailsScreen };
