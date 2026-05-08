'use strict';

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function trim(value = '') {
  return String(value || '').trim();
}

function loadConfig() {
  const runtimeVersion = 'clear-core-v1.0.0';
  const appBaseUrl = trim(process.env.APP_BASE_URL).replace(/\/$/, '');
  const botToken = trim(process.env.BOT_TOKEN || process.env.MAX_BOT_TOKEN);
  const botUsername = trim(process.env.BOT_USERNAME || process.env.MAX_BOT_USERNAME || process.env.BOT_NAME || process.env.MAX_BOT_NAME).replace(/^@/, '');

  return {
    runtimeVersion,
    sourceMarker: `adminkit-${runtimeVersion}`,
    port: process.env.PORT || 3000,
    appBaseUrl,
    botToken,
    botUsername,
    webhookPath: trim(process.env.WEBHOOK_PATH || process.env.MAX_WEBHOOK_PATH || '/webhook/max') || '/webhook/max',
    webhookSecret: trim(process.env.WEBHOOK_SECRET),
    maxDeepLinkBase: trim(process.env.MAX_DEEP_LINK_BASE || process.env.BOT_DEEP_LINK_BASE || (botUsername ? `https://max.ru/${botUsername}` : '')).replace(/\/$/, ''),
    databaseUrl: trim(process.env.DATABASE_URL || process.env.POSTGRES_URL),
    databaseSsl: bool(process.env.DATABASE_SSL, true),
    adminToken: trim(process.env.ADMIN_TOKEN || process.env.GIFT_ADMIN_TOKEN || process.env.MODERATION_ADMIN_TOKEN),
    debugPublic: bool(process.env.DEBUG_EXPORT_ALLOW_PUBLIC, false),
    jsonBodyLimit: trim(process.env.JSON_BODY_LIMIT || '8mb'),
    uploadBodyLimit: trim(process.env.UPLOAD_BODY_LIMIT || '24mb'),
    requestTimeoutMs: int(process.env.REQUEST_TIMEOUT_MS, 12000)
  };
}

module.exports = { loadConfig };
