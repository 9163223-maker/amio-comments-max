'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'post_highlights',
  title: 'Выделение постов',
  icon: '⭐',
  order: 70,
  feature: 'post_highlights.enabled',
  description: 'Выделение важных постов: бейджи, пометки Новое/Важно/Подарок/Акция и отдельный список выделенных публикаций.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_post_highlights', 'ak_posts'],
  nextStep: 'сделать postHighlightsDataAdapter: список бейджей, включение/снятие выделения, связь со статистикой',
  risks: ['не менять исходный пост без preview/apply flow', 'не патчить MAX-посты из audit-экрана'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
