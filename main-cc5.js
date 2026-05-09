'use strict';
process.env.BUILD_VERSION='CC5.5';
process.env.RUNTIME_VERSION='CC5.5';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.5-hard-feature-gate';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
