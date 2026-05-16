'use strict';

const modules = [
  require('../modules/channels'),
  require('../modules/comments'),
  require('../modules/buttons'),
  require('../modules/leadMagnets'),
  require('../modules/moderation'),
  require('../modules/archive'),
  require('../modules/stats'),
  require('../modules/settings')
];

function listAll() {
  return modules.slice().sort((a, b) => Number(a.order || 100) - Number(b.order || 100));
}

function find(sectionId) {
  return listAll().find((section) => section.id === sectionId) || null;
}

function routeMap() {
  const map = new Map();
  for (const section of listAll()) {
    const routes = section.routes || {};
    Object.values(routes).forEach((route) => map.set(route, section));
  }
  return map;
}

module.exports = { listAll, find, routeMap };
