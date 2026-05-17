'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'photo_comments',
  title: 'Фото в комментариях',
  icon: '🖼',
  order: 30,
  feature: 'photo_comments.enabled',
  description: 'Тарифная функция: разрешаем только фото в комментариях. Видео и файлы не входят в Core-план без отдельного решения.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_comment_media', 'ak_comment_threads', 'ak_admin_sessions'],
  nextStep: 'сделать photoCommentsDataAdapter: лимиты, доступ по тарифу, предпросмотр и модерация фото',
  risks: ['не включать видео', 'не включать файлы', 'не использовать legacy attachment handlers как рабочий слой'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
