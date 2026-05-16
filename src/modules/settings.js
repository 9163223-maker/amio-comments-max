'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'settings',
  title: 'Настройки',
  icon: '⚙️',
  order: 80,
  feature: 'settings.enabled',
  description: 'Настройки подключены к Core как read-only/audit раздел. Профиль, тарифы и системные параметры будут переноситься без legacy setupState и без скрытых переписываний клиентских данных.',
  status: 'read-only-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_accounts', 'ak_account_admins', 'ak_admin_channels', 'ak_plan_events'],
  nextStep: 'добавить settingsDataAdapter с просмотром профиля, тарифа и доступов; изменения — только через отдельные confirm-flow',
  risks: ['не менять тариф без audit event', 'не хранить временное состояние в legacy setupState', 'не показывать лишние raw id в пользовательском UX'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});