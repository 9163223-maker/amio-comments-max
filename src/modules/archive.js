'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({
  id: 'archive',
  title: 'Архив',
  icon: '📦',
  order: 60,
  feature: 'archive.enabled',
  description: 'Архив будет делиться на Light и Pro: восстановление текста, настроек, кнопок и лид-магнитов; Pro — восстановление с медиа.'
});
