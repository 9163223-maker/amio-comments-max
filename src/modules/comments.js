'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'comments',
  title: 'Комментарии',
  icon: '💬',
  order: 20,
  feature: 'comments.enabled',
  description: 'Комментарии подключены к Core как read-only/audit раздел. Рабочую механику комментариев переносим отдельно и без повторного подключения старых monkeypatch-слоёв.',
  status: 'read-only-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_posts', 'ak_admin_channels', 'ak_admin_sessions'],
  nextStep: 'спроектировать clean commentsDataAdapter: список постов, счётчик комментариев, состояние обсуждения, без совместимости со старыми patched links как постоянного слоя',
  risks: ['не лечить старые пропатченные посты через новый слой совместимости', 'не возвращать видео/файлы в комментарии без явного запроса', 'не смешивать comment-open legacy resolver с будущим Core resolver'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});