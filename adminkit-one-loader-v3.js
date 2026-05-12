'use strict';

// V3 wrapper: installs only two missing safe guards before the existing one-loader starts index.js.
// Existing one-loader remains the base; this wrapper is only an entrypoint shim.

process.env.BUILD_VERSION = 'CC6.6.6-SAFE-ONE-LOADER-V3';
process.env.RUNTIME_VERSION = 'CC6.6.6-SAFE-ONE-LOADER-V3';
process.env.BUILD_SOURCE_MARKER = 'adminkit-one-loader-v3-wrapper-title-and-clean-v3-menu';

try { require('./adminkit-v3-main-menu-hard-override').install(); }
catch (error) { console.warn('[adminkit-one-loader-v3] menu guard failed:', error?.message || error); }

try { require('./adminkit-comments-title-resolve-patch').install(); }
catch (error) { console.warn('[adminkit-one-loader-v3] title resolver failed:', error?.message || error); }

require('./adminkit-one-loader');
