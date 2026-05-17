'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'start_landing',
  title: 'Start / посадочная',
  icon: '🚀',
  order: 130,
  feature: 'start_landing.enabled',
  description: 'Первый экран администратора: что такое АдминКИТ, быстрый старт, подключение канала, тарифные подсказки и поддержка.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_accounts', 'ak_admin_channels'],
  nextStep: 'сделать onboardingFlow: приветствие, подключить канал, включить комментарии, проверить готовность',
  risks: ['не перегружать старт debug-информацией', 'не смешивать клиентский onboarding и внутреннюю диагностику'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
