'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({ id: 'leadMagnets', title: 'Подарки / Лид-магниты', shortTitle: 'Лид-магниты', icon: '🎁', order: 40, feature: 'lead_magnets.enabled', description: 'Лид-магниты будут перенесены на ak_post_lead_magnets и ak_lead_magnet_conditions. Условия будут проверяться через accessManager.' });
