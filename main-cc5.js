'use strict';
process.env.BUILD_VERSION='CC5.6';
process.env.RUNTIME_VERSION='CC5.6';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.6-comments-fast-after-app';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
