'use strict';

const menuRenderer = require('../core/menuRenderer');

function makeSection({ id, title, shortTitle, icon, order, feature, description }) {
  return {
    id,
    title,
    shortTitle: shortTitle || title,
    icon,
    order,
    feature,
    routes: { home: `${id}.home` },
    async renderHome() {
      return menuRenderer.renderScreen({
        title: `${icon || ''} ${shortTitle || title}`.trim(),
        body: [description || 'Раздел подключён к AdminKit Core. Функционал будет переноситься из legacy поэтапно.'],
        buttons: [{ text: '🏠 Главное меню', route: 'main.home' }],
        homeRoute: ''
      });
    },
    async handleAction(ctx) {
      return this.renderHome(ctx);
    }
  };
}

module.exports = { makeSection };
