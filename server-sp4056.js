'use strict';
const RUNTIME = 'SP40.5.6b';
const SOURCE = 'adminkit-SP40.5.6b-no-old-cta-safe';
console.log('[' + RUNTIME + '] safe entry: bypass SP40 old CTA layer, load SP39 stable base');
process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;
require('./media-core-sp39.txt');
