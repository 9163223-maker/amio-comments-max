'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'debug_diagnostics',
  title: 'Debug / диагностика',
  icon: '🧪',
  order: 140,
  feature: 'debug_diagnostics.enabled',
  description: 'Внутренняя диагностика Core: runtime, selfTest разделов, callback timings, store-live и GitHub export. Не для обычного клиентского UX.',
  status: 'scaffold-audit-ready-internal',
  mode: 'read-only',
  cleanTables: ['ak_core_schema_migrations', 'ak_admin_sessions'],
  nextStep: 'сделать внутренние кнопки на /debug/core, /debug/core-full, /debug/core-timings и /debug/store-live с no-cache',
  risks: ['не показывать debug обычному клиенту', 'не раскрывать токены', 'не превращать debug в основной UX'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
