'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({
  id: 'settings',
  title: 'Настройки',
  icon: '⚙️',
  order: 80,
  feature: 'settings.enabled',
  description: 'Настройки будут управлять тарифами, доступами, профилем канала и системными параметрами без legacy setupState.'
});
