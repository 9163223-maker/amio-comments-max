'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'post_editor',
  title: 'Редактирование постов',
  icon: '✏️',
  order: 90,
  feature: 'post_editor.enabled',
  description: 'Редактирование опубликованных постов: текст, форматирование, предпросмотр, управление кнопками и подарком перед применением.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_posts', 'ak_post_buttons', 'ak_post_lead_magnets', 'ak_post_edit_drafts'],
  nextStep: 'сделать postEditorFlow: выбрать пост, подготовить draft, preview, apply без потери медиа и форматирования',
  risks: ['не применять изменения без preview', 'не удалять медиа поста', 'не использовать legacy edit flow как рабочий слой'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
