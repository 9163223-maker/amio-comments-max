'use strict';

const { createApp } = require('./src/app');
const { loadConfig } = require('./src/config');
const { initDatabase } = require('./src/db');

async function main() {
  const config = loadConfig();

  if (config.databaseUrl) {
    await initDatabase(config);
  } else {
    console.warn('[clear-core-v1] DATABASE_URL is not set. API will start, but persistent storage is unavailable.');
  }

  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`[clear-core-v1] АдминКИТ started on :${config.port}`);
    console.log(`[clear-core-v1] runtimeVersion=${config.runtimeVersion}`);
  });
}

main().catch((error) => {
  console.error('[clear-core-v1] fatal startup error:', error);
  process.exit(1);
});
