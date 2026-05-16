'use strict';
const { makeSection } = require('../_sectionFactory');
module.exports = makeSection({ id: 'comments', title: 'Комментарии', icon: '💬', order: 20, feature: 'comments.enabled', description: 'Рабочее ядро комментариев переносим аккуратно.' });
