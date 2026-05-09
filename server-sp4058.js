'use strict';

const RUNTIME = 'CC5.1-legacy-cut';
const SOURCE = 'adminkit-CC5.1-legacy-moderation-disabled';

console.log('[' + RUNTIME + '] legacy server-sp4058 disabled; delegating to clean base');
process.env.BUILD_VERSION = process.env.BUILD_VERSION || RUNTIME;
process.env.RUNTIME_VERSION = process.env.RUNTIME_VERSION || RUNTIME;
process.env.BUILD_SOURCE_MARKER = process.env.BUILD_SOURCE_MARKER || SOURCE;

// CC5.1 rule 2: do not patch broken legacy moderation. This file no longer installs any moderation handlers.
// The moderation section is handled only by cc5-moderation-router.js.
require('./server-sp4057.js');
