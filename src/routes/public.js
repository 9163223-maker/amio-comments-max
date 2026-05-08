'use strict';

const express = require('express');

function makePublicRouter(config) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>АдминКИТ clear-core-v1</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;margin:0;background:#eef6ff;color:#1e3550;display:grid;min-height:100vh;place-items:center;padding:24px}
    .card{max-width:560px;background:white;border-radius:28px;padding:28px;box-shadow:0 16px 40px rgba(30,70,120,.12)}
    h1{margin:0 0 10px;font-size:26px} p{line-height:1.45}.muted{color:#68809b;font-size:14px}
  </style>
</head>
<body><main class="card"><h1>АдминКИТ clear-core-v1</h1><p>Новая чистая сборка без legacy overlay. Комментарии, CTA и модерация будут подключаться через Postgres-ядро.</p><p class="muted">runtimeVersion: ${config.runtimeVersion}</p></main></body>
</html>`);
  });

  router.get('/app', (req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Комментарии</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#eaf4ff;color:#203850;padding:18px">
  <h2>Комментарии АдминКИТ</h2>
  <div id="root">clear-core-v1: экран комментариев подключён. Следующий шаг — полноценный Telegram-style UI на новом API.</div>
  <script>window.ADMINKIT_RUNTIME=${JSON.stringify(config.runtimeVersion)};</script>
</body></html>`);
  });

  return router;
}

module.exports = { makePublicRouter };
