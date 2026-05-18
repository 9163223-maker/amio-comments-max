'use strict';

const RUNTIME = 'CC7.5.34-CORE-1.49.1-START-LANDING-RASTER-ONLY';
const SOURCE = 'adminkit-cc7-5-34-core-1-49-1-start-landing-raster-only';
const MARKER = '__ADMINKIT_CC7_5_34_CORE_1_49_1_START_LANDING_RASTER_ONLY_LOADER__';
const CANONICAL_PUBLIC_BASE_URL = 'https://p01--amio-commnets-max--qkpwxnxqqrnw.code.run';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
  process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
}

if (!global[MARKER]) {
  global[MARKER] = true;
  require('./adminkit-one-loader-cc7533');
  process.env.BUILD_VERSION = RUNTIME;
  process.env.RUNTIME_VERSION = RUNTIME;
  process.env.BUILD_SOURCE_MARKER = SOURCE;
  if (!process.env.ADMINKIT_PUBLIC_BASE_URL || /amio-comments-max/i.test(String(process.env.ADMINKIT_PUBLIC_BASE_URL))) {
    process.env.ADMINKIT_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  }
}

module.exports = { RUNTIME, SOURCE, MARKER, CANONICAL_PUBLIC_BASE_URL };
