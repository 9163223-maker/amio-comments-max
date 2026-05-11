'use strict';

// SAFE COMMENTS BOOT CORE: protected layer for opening comments from MAX open_app payload.
// Feature modules must not edit this launch layer.
require('./adminkit-safe-comments-boot-core').install();

// SAFE CORE: physical app.js preboot kept for compatibility with already patched post buttons.
// Do not re-enable legacy appjs route/file patchers without a specific regression test.
require('./adminkit-comments-preboot-physical-patch').install();

// Menu / admin functions. These must not touch the comments app.js boot path.
require('./v3-silent-menu-callbacks').install();
require('./v3-repatch-comments-links').install();
require('./v3-register-post-debug').install();
require('./clean-v3-main-route-guard').install();
require('./clean-v3-menu-normalizer').install();
require('./clean-v3-comments-banner-action').install();
require('./clean-v3-comments-banner-router-fix').install();
require('./clean-v3-comments-function-points-v2').install();
require('./clean-v3-comments-banner-in-app-v3').install();
require('./clean-v3-menu-debug').install();
require('./clean-v3-menu-ok').install();
require('./production-menu-v3-renderer-v2').install();
require('./production-menu-map-v3-fixed-debug').install();
require('./cc6542-hotfix-router').install();
require('./v3-native-hints-cleanup').install();
require('./adminkit-post-zero-safe-layer').install();
require('./cc5-bootstrap-lite');
require('./v3-disable-growth-cta').install();
