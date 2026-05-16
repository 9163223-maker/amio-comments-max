'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({
  id: 'moderation',
  title: 'Модерация',
  icon: '🛡️',
  order: 50,
  feature: 'moderation.enabled',
  description: 'Модерация будет перенесена в отдельный модуль: стоп-слова, ручная проверка, жалобы и действия с комментариями.'
});
