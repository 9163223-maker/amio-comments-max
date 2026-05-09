'use strict';
process.env.BUILD_VERSION='CC5.7';
process.env.RUNTIME_VERSION='CC5.7';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.7-comments-open-independent';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
