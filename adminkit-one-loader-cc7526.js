'use strict';

const RUNTIME = 'CC7.5.26-CORE-1.43.0-STATS-REFERRALS';
const SOURCE = 'adminkit-cc7-5-26-core-1-43-0-stats-referrals';
const MARKER = '__ADMINKIT_CC7_5_26_CORE_1_43_0_STATS_REFERRALS_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
// Referral links must use the реально работающий Northflank host. Some generic envs can
// contain the human-correct spelling "comments", while the deployed service host is
// "commnets". statsDataAdapter prefers ADMINKIT_PUBLIC_BASE_URL, so pin it here.
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

function safeInstallStatsReferralLayer() {
  try {
    const layer = require('./stats-referral-route-layer');
    return layer && typeof layer.install === 'function' ? layer.install() : { ok: false, error: 'stats_layer_install_missing' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

if (!global[MARKER]) {
  global[MARKER] = true;
  const statsLayer = safeInstallStatsReferralLayer();
  process.env.ADMINKIT_STATS_REFERRAL_LAYER_OK = statsLayer.ok !== false ? '1' : '0';
  process.env.ADMINKIT_STATS_REFERRAL_LAYER_RUNTIME = statsLayer.runtimeVersion || '';
  require('./adminkit-one-loader-cc7525');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
