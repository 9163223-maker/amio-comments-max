'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'production_checklist',
  title: 'Production checklist',
  icon: '✅',
  order: 150,
  feature: 'production_checklist.enabled',
  description: 'Финальная проверка перед боевым включением: env, webhook, права бота, canary, debug, rollback и запрет случайного CANARY_ALL.',
  status: 'scaffold-audit-ready-internal',
  mode: 'read-only',
  cleanTables: ['ak_accounts', 'ak_admin_channels', 'ak_core_schema_migrations'],
  nextStep: 'сделать checklistEvaluator: env, webhook, bot rights, core send gate, canary admins, rollback plan',
  risks: ['не включать production из checklist без отдельного подтверждения', 'не включать ADMINKIT_CORE_CANARY_ALL=1 случайно'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
