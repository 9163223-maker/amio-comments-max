'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'polls',
  title: 'Опросы / голосовалки',
  icon: '📊',
  order: 80,
  feature: 'polls.enabled',
  description: 'Интерактивные опросы под постами: варианты ответа, один голос пользователя, результаты и закрытие голосования.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_polls', 'ak_poll_votes', 'ak_posts'],
  nextStep: 'сделать pollsDataAdapter: создание вариантов, голос, результаты, закрытие, защита от повторного callback',
  risks: ['не давать повторный голос через дубль callback', 'не смешивать опросы с legacy CTA'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
