'use strict';

const express = require('express');
const { handleUpdate } = require('./router');

function makeWebhookRouter(config) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    try {
      const result = await handleUpdate(config, req.body || {});
      res.json({ ok: true, runtimeVersion: config.runtimeVersion, ...result });
    } catch (error) {
      console.error('[clear-core-v1] webhook error:', error);
      res.status(500).json({ ok: false, runtimeVersion: config.runtimeVersion, error: error.message || 'webhook_error' });
    }
  });

  router.get('/', (req, res) => {
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, webhookPath: config.webhookPath });
  });

  return router;
}

module.exports = { makeWebhookRouter };
