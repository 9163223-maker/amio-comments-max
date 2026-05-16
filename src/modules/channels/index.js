'use strict';
const { makeSection } = require('../_sectionFactory');
module.exports = makeSection({ id: 'channels', title: 'Каналы', icon: '📺', order: 10, feature: 'channels.enabled', description: 'Подключение и выбор канала. Будет перенесено первым, потому что канал нужен всем разделам.' });
