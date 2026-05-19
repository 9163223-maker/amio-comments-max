'use strict';

const base = require('./clean-entrypoint-1.53.0');
const RUNTIME = 'CC7.5.34-CORE-1.53.1-V3-MENU-ROUTE-AUDIT';
const SOURCE = 'adminkit-cc7-5-34-core-1-53-1-v3-menu-route-audit';
const PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

const SECTIONS = [
  ['channels','Подключение канала','admin_section_channels',{},'connect channel'],
  ['comments','Комментарии под постами','admin_section_comments',{},'comments section'],
  ['photos','Фото в комментариях','admin_section_comments',{focus:'photos'},'photos in comments only'],
  ['reactions_replies','Реакции и ответы','admin_section_comments',{focus:'reactions_replies'},'comment reactions and replies'],
  ['gifts','Подарки / лид-магниты','admin_section_gifts',{},'lead magnet flow'],
  ['buttons','CTA / пользовательские кнопки','admin_section_buttons',{},'custom post buttons'],
  ['highlights','Выделение постов','comments_select_post',{source:'highlights'},'post highlights'],
  ['polls','Голосовалки / опросы','comments_select_post',{source:'polls'},'polls flow'],
  ['posts','Редактирование постов','admin_section_posts',{},'post editor'],
  ['moderation','Модерация','admin_section_moderation',{},'moderation'],
  ['stats','Статистика','admin_section_stats',{},'statistics'],
  ['navigation','Меню и навигация','admin_section_help',{context:'navigation_v3'},'V3 navigation help'],
  ['landing_start','Посадочная Start','admin_section_main',{source:'landing_start'},'same V3 menu as start'],
  ['debug','Debug / GitHub export','admin_section_help',{context:'debug'},'safe debug links only'],
  ['production_checklist','Production checklist','admin_section_help',{context:'production_checklist'},'production readiness checklist']
];

function payload(action, extra) { return JSON.stringify(Object.assign({ action }, extra || {})); }
function audit(sectionId) {
  const items = SECTIONS.map((s, i) => ({ index: i + 1, id: s[0], label: s[1], payload: payload(s[2], s[3]), expected: s[4], auditUrl: PUBLIC_BASE_URL + '/debug/menu/audit/' + s[0] + '?t=1531' }));
  if (sectionId) {
    const item = items.find((x) => x.id === sectionId);
    return item ? { ok: true, runtimeVersion: RUNTIME, item, safe: true, noDatabaseRead: true, noMaxApiCall: true } : { ok: false, runtimeVersion: RUNTIME, error: 'section_not_found', sectionId };
  }
  return { ok: true, runtimeVersion: RUNTIME, total: items.length, items, checks: { has15Sections: items.length === 15, hasHighlights: true, hasPolls: true, heavyDebugDisabled: true }, safe: true, noDatabaseRead: true, noMaxApiCall: true };
}

function installAuditRoutes() {
  if (global.__ADMINKIT_MENU_AUDIT_1531__) return;
  global.__ADMINKIT_MENU_AUDIT_1531__ = true;
  const express = require('express');
  const originalListen = express.application.listen;
  express.application.listen = function patchedListen() {
    if (!this.__ADMINKIT_MENU_AUDIT_ROUTES_1531__) {
      this.__ADMINKIT_MENU_AUDIT_ROUTES_1531__ = true;
      this.get('/debug/menu/audit', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(audit('')); });
      this.get('/debug/menu/audit/:section', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(audit(String(req.params.section || ''))); });
    }
    return originalListen.apply(this, arguments);
  };
}

function start() {
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  process.env.ADMINKIT_PUBLIC_BASE_URL = process.env.ADMINKIT_PUBLIC_BASE_URL || PUBLIC_BASE_URL;
  installAuditRoutes();
  return base.start();
}

if (require.main === module) start();
module.exports = Object.assign({}, base, { RUNTIME, SOURCE, SECTIONS, audit, installAuditRoutes, start });
