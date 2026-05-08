'use strict';
console.log('[SP40.5.6a] RED ALERT safe core: no proxy, no preload hooks, no postgres interception');
process.env.BUILD_VERSION = 'SP40.5.6a';
process.env.RUNTIME_VERSION = 'SP40.5.6a';
process.env.BUILD_SOURCE_MARKER = 'adminkit-SP40.5.6a-safe-core-no-hooks';
require('./media-core-sp4021.txt');
