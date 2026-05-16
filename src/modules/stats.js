'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'stats',
  title: 'Статистика',
  icon: '📊',
  order: 70,
  feature: 'stats.enabled',
  description: 'Статистика подключена к Core как безопасный read-only раздел. На этом шаге она не меняет данные и не запускает legacy-выгрузки.',
  status: 'read-only-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_posts', 'ak_post_buttons', 'ak_post_lead_magnets', 'ak_admin_channels'],
  nextStep: 'добавить чистый statsDataAdapter с агрегатами по каналам, постам, комментариям, кнопкам и лид-магнитам',
  risks: ['не показывать raw id в обычном UX', 'не делать тяжёлые запросы без лимитов и кэша'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});