'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({
  id: 'stats',
  title: 'Статистика',
  icon: '📊',
  order: 70,
  feature: 'stats.enabled',
  description: 'Статистика будет подключена к единому Core: базовые метрики для free/start и расширенные дашборды по тарифу Pro.'
});
