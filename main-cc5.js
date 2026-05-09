'use strict';
process.env.BUILD_VERSION='CC5.2';
process.env.RUNTIME_VERSION='CC5.2';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.2-clean-moderation-router';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
