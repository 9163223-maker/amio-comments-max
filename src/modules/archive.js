'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'archive',
  title: 'Архив',
  icon: '📦',
  order: 60,
  feature: 'archive.enabled',
  description: 'Архив подключен к Core как безопасный read-only раздел. Восстановление, редактирование и откат пока не выполняются, чтобы не менять клиентские данные без отдельного dry-run.',
  status: 'read-only-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_posts', 'ak_post_buttons', 'ak_post_lead_magnets', 'ak_admin_sessions'],
  nextStep: 'спроектировать soft-archive model: archived_at, restored_at, archived_by, restore_preview без физического удаления строк',
  risks: ['никакого hard delete', 'restore только через preview + confirm', 'не восстанавливать legacy patches как рабочую архитектуру'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});