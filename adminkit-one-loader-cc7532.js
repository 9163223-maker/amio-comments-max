'use strict';

const RUNTIME = 'CC7.5.32-CORE-1.48.0-NAVIGATION-V3';
const SOURCE = 'adminkit-cc7-5-32-core-1-48-0-navigation-v3';
const MARKER = '__ADMINKIT_CC7_5_32_CORE_1_48_0_NAVIGATION_V3_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

if (!global[MARKER]) {
  global[MARKER] = true;
  require('./adminkit-one-loader-cc7531');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
