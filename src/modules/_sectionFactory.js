'use strict';

const menuRenderer = require('../core/menuRenderer');

const RUNTIME = 'ADMINKIT-CORE-SECTION-FACTORY-1.1-READONLY-AUDIT';

function makeSection({
  id,
  title,
  shortTitle,
  icon,
  order,
  feature,
  description,
  status = 'read-only-placeholder',
  mode = 'read-only',
  cleanTables = [],
  nextStep = '',
  risks = [],
  writesEnabled = false,
  legacyAdaptersUsed = false,
  dangerousActionsDisabled = true
}) {
  return {
    id,
    title,
    shortTitle: shortTitle || title,
    icon,
    order,
    feature,
    routes: { home: `${id}.home` },
    async renderHome() {
      const body = [
        description || 'Раздел подключён к AdminKit Core. Функционал будет переноситься из legacy поэтапно.',
        '',
        `Core-режим: ${mode}`,
        `Статус: ${status}`,
        writesEnabled ? 'Write-действия: включены только через отдельный Core-flow.' : 'Write-действия: отключены на этом шаге.',
        legacyAdaptersUsed ? 'Внимание: legacy adapter обнаружен.' : 'Legacy adapters: не используются.',
        cleanTables.length ? `Чистые таблицы: ${cleanTables.join(', ')}` : '',
        nextStep ? `Следующий шаг: ${nextStep}` : ''
      ].filter(Boolean);

      return menuRenderer.renderScreen({
        title: `${icon || ''} ${shortTitle || title}`.trim(),
        body,
        buttons: [{ text: '🏠 Главное меню', route: 'main.home' }],
        homeRoute: ''
      });
    },
    async handleAction(ctx) {
      return this.renderHome(ctx);
    },
    selfTest() {
      return {
        ok: true,
        runtimeVersion: RUNTIME,
        sectionId: id,
        title,
        feature,
        status,
        mode,
        readOnlyRenderer: mode === 'read-only' || status.includes('read-only'),
        writesEnabled: writesEnabled === true,
        cleanTables,
        routes: { home: `${id}.home` },
        legacyAdaptersUsed: legacyAdaptersUsed === true,
        cleanCoreOnly: legacyAdaptersUsed !== true,
        dangerousActionsDisabled: dangerousActionsDisabled === true,
        oneActiveScreenReady: true,
        risks,
        nextStep
      };
    }
  };
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, factoryAddsSelfTest: true, defaultLegacyAdaptersUsed: false, defaultDangerousActionsDisabled: true };
}

module.exports = { RUNTIME, makeSection, selfTest };