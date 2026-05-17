'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'navigation',
  title: 'Меню и навигация',
  icon: '🧭',
  order: 120,
  feature: 'navigation.enabled',
  description: 'Контроль Core UX: главное меню, back/home, one active screen, one active flow, cleanup pipeline и проверка дублей.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_admin_sessions'],
  nextStep: 'добавить экран проверки активного flow, active_message_id и garbage_message_ids без ручного вмешательства в legacy',
  risks: ['не показывать raw debug обычному клиенту', 'не сбрасывать flow без явного действия администратора'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
