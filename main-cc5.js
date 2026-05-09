'use strict';
process.env.BUILD_VERSION='CC6.0';
process.env.RUNTIME_VERSION='CC6.0';
process.env.BUILD_SOURCE_MARKER='adminkit-CC6.0-comments-standalone-clean-boot';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
