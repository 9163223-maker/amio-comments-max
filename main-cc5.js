'use strict';
process.env.BUILD_VERSION='CC5.3';
process.env.RUNTIME_VERSION='CC5.3';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.3-comments-clean-shell';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
