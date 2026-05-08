'use strict';

const express = require('express');
const cors = require('cors');
const { healthCheck } = require('./db');
const { makeWebhookRouter } = require('./bot/webhook');
const { makePublicRouter } = require('./routes/public');
const { makeAdminRouter } = require('./routes/admin');
const { makeCommentsRouter } = require('./routes/comments');

function noCache(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store'
  });
  next();
}

function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimit }));

  app.get('/healthz', async (req, res) => {
    const db = await healthCheck().catch((error) => ({ ok: false, error: error.message }));
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, db });
  });

  app.get('/debug/clear-core-v1', noCache, async (req, res) => {
    const db = await healthCheck().catch((error) => ({ ok: false, error: error.message }));
    res.json({
      ok: true,
      runtimeVersion: config.runtimeVersion,
      sourceMarker: config.sourceMarker,
      generatedAt: Date.now(),
      storage: config.databaseUrl ? 'postgres' : 'not_configured',
      db,
      routes: ['/healthz', config.webhookPath, '/app', '/api/comments', '/api/admin']
    });
  });

  app.use('/api/comments', makeCommentsRouter(config));
  app.use('/api/admin', makeAdminRouter(config));
  app.use('/', makePublicRouter(config));
  app.use(config.webhookPath, makeWebhookRouter(config));

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'not_found', runtimeVersion: config.runtimeVersion });
  });

  app.use((error, req, res, next) => {
    console.error('[clear-core-v1] request error:', error);
    res.status(error.status || 500).json({ ok: false, error: error.message || 'internal_error', runtimeVersion: config.runtimeVersion });
  });

  return app;
}

module.exports = { createApp };
