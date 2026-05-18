'use strict';

const RUNTIME = 'CC7.5.31-CORE-1.47.1-CHANNEL-CONNECTION-SCHEMA-SAFE';
const SOURCE = 'adminkit-cc7-5-31-core-1-47-1-channel-connection-schema-safe';
const MARKER = '__ADMINKIT_CC7_5_31_CORE_1_47_1_CHANNEL_CONNECTION_SCHEMA_SAFE_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

if (!global[MARKER]) {
  global[MARKER] = true;
  require('./adminkit-one-loader-cc7530');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
