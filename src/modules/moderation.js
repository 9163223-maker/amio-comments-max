'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'moderation',
  title: 'Модерация',
  icon: '🛡️',
  order: 50,
  feature: 'moderation.enabled',
  description: 'Модерация подключена к Core как безопасный read-only раздел. На этом шаге она показывает будущую область правил, но не удаляет, не банит и не скрывает комментарии.',
  status: 'read-only-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_moderation_rules', 'ak_posts', 'ak_admin_channels'],
  nextStep: 'разделить модерацию на область канала и область поста, затем добавить clean moderationDataAdapter без destructive actions',
  risks: ['любые ban/delete/hide действия включать только после dry-run и отдельного подтверждения', 'не смешивать модерацию комментариев с legacy comment patchers'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});