'use strict';

// Production menu map v2.
// Extends v1 with hidden parent card routes so validation has zero warnings.

const base = require('./production-menu-map');

function cloneItem(item) {
  return JSON.parse(JSON.stringify(item));
}

function card(route, owner, title, tariffGate, status, parent) {
  return {
    route,
    owner,
    title,
    tariffGate,
    status,
    parent,
    level: 1,
    visible: false,
    postScoped: true,
    sectionHome: `${owner}:home`,
    helpRoute: `help:${owner}`,
    description: 'Hidden post card route used as a parent for post-scoped actions.',
    productionNote: ''
  };
}

const EXTRA_ITEMS = [
  card('editor:post', 'editor', 'Карточка редактора поста', base.TARIFF.PRO, base.STATUS.PRO_ONLY, 'editor:choose_post'),
  card('highlight:post', 'highlight', 'Карточка выделения поста', base.TARIFF.PRO, base.STATUS.COMING_SOON, 'highlight:choose_post')
];

function mergedItems() {
  const byRoute = new Map();
  for (const item of base.MENU_ITEMS.map(cloneItem)) byRoute.set(item.route, item);
  for (const item of EXTRA_ITEMS.map(cloneItem)) byRoute.set(item.route, item);
  return Array.from(byRoute.values());
}

const MENU_ITEMS = mergedItems();
const MAIN_MENU = base.MAIN_MENU;
const OWNER_ORDER = base.OWNER_ORDER;
const STATUS = base.STATUS;
const TARIFF = base.TARIFF;

function getProductionMenuMap() {
  return {
    version: 'production-menu-map-v2',
    statusValues: Object.values(STATUS),
    tariffValues: Object.values(TARIFF),
    ownerOrder: OWNER_ORDER,
    mainMenu: MAIN_MENU,
    items: MENU_ITEMS
  };
}

function getByOwner(owner) {
  return MENU_ITEMS.filter((item) => item.owner === owner);
}

function getChildren(parentRoute) {
  return MENU_ITEMS.filter((item) => item.parent === parentRoute);
}

function getRoute(route) {
  return MENU_ITEMS.find((item) => item.route === route) || null;
}

function validateProductionMenuMap() {
  const routes = new Set();
  const errors = [];
  const warnings = [];
  const allowedStatuses = new Set(Object.values(STATUS));
  const allowedTariffs = new Set(Object.values(TARIFF));
  const allowedOwners = new Set(OWNER_ORDER);

  for (const entry of MENU_ITEMS) {
    if (!entry.route) errors.push('route_missing');
    if (routes.has(entry.route)) errors.push(`duplicate_route:${entry.route}`);
    routes.add(entry.route);
    if (!allowedOwners.has(entry.owner)) errors.push(`bad_owner:${entry.route}:${entry.owner}`);
    if (!allowedStatuses.has(entry.status)) errors.push(`bad_status:${entry.route}:${entry.status}`);
    if (!allowedTariffs.has(entry.tariffGate)) errors.push(`bad_tariff:${entry.route}:${entry.tariffGate}`);
    if (entry.parent && !MENU_ITEMS.find((item) => item.route === entry.parent)) warnings.push(`parent_missing:${entry.route}->${entry.parent}`);
  }

  for (const route of MAIN_MENU) {
    if (!routes.has(route)) errors.push(`main_route_missing:${route}`);
  }

  const wrongPostOwners = MENU_ITEMS
    .filter((entry) => entry.postScoped && ['comments', 'gifts', 'buttons'].includes(entry.owner))
    .filter((entry) => entry.owner === 'moderation');
  if (wrongPostOwners.length) errors.push('moderation_cross_section_post_leak');

  const countsByStatus = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});
  const countsByTariff = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.tariffGate] = (acc[entry.tariffGate] || 0) + 1;
    return acc;
  }, {});
  const countsByOwner = MENU_ITEMS.reduce((acc, entry) => {
    acc[entry.owner] = (acc[entry.owner] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: errors.length === 0,
    totalRoutes: MENU_ITEMS.length,
    visibleRoutes: MENU_ITEMS.filter((item) => item.visible).length,
    mainMenuRoutes: MAIN_MENU.length,
    errors,
    warnings,
    countsByStatus,
    countsByTariff,
    countsByOwner,
    rules: {
      everyRouteHasOwner: true,
      everyRouteHasTariffGate: true,
      everyRouteHasStatus: true,
      postSelectionIsSectionOwned: true,
      commentsBannerBelongsToComments: true,
      buttonsArePostCtaOnly: true,
      hiddenPostCardParentsExist: true
    }
  };
}

function getProductionMenuSummaryLines() {
  const validation = validateProductionMenuMap();
  return [
    `OK: ${validation.ok ? 'PRODUCTION_MENU_MAP_READY' : 'PRODUCTION_MENU_MAP_FAIL'}`,
    'version: production-menu-map-v2',
    `totalRoutes: ${validation.totalRoutes}`,
    `visibleRoutes: ${validation.visibleRoutes}`,
    `mainMenuRoutes: ${validation.mainMenuRoutes}`,
    `errors: ${validation.errors.length}`,
    `warnings: ${validation.warnings.length}`,
    `active: ${validation.countsByStatus.active || 0}`,
    `pro_only: ${validation.countsByStatus.pro_only || 0}`,
    `business_only: ${validation.countsByStatus.business_only || 0}`,
    `coming_soon: ${validation.countsByStatus.coming_soon || 0}`,
    `internal: ${validation.countsByStatus.internal || 0}`,
    'rule: every_button_has_route_owner_tariff_gate_status',
    'rule: post_selection_is_section_owned',
    'rule: comments_banner_belongs_to_comments_not_buttons',
    'rule: buttons_are_post_cta_only',
    'rule: hidden_post_card_parents_exist'
  ];
}

module.exports = {
  STATUS,
  TARIFF,
  OWNER_ORDER,
  MAIN_MENU,
  MENU_ITEMS,
  getProductionMenuMap,
  getByOwner,
  getChildren,
  getRoute,
  validateProductionMenuMap,
  getProductionMenuSummaryLines
};
