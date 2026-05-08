'use strict';

const express = require('express');

function makeWebhookRouter(config) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    // clear-core-v1: пока только принимаем webhook без падения.
    // Следующий шаг — подключить router callbacks/messages по модульным handlers.
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, accepted: true });
  });

  router.get('/', (req, res) => {
    res.json({ ok: true, runtimeVersion: config.runtimeVersion, webhookPath: config.webhookPath });
  });

  return router;
}

module.exports = { makeWebhookRouter };
