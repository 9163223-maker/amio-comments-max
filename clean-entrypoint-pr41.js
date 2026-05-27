'use strict';

const nextEntrypoint = require('./clean-entrypoint-1.53.9');

module.exports = nextEntrypoint;

if (require.main === module) {
  nextEntrypoint.start().catch((error) => {
    console.error('adminkit legacy entrypoint delegate failed', error && error.stack || error);
    process.exitCode = 1;
  });
}
