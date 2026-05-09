'use strict';
process.env.BUILD_VERSION='CC6.1';
process.env.RUNTIME_VERSION='CC6.1';
process.env.BUILD_SOURCE_MARKER='adminkit-CC6.1-comments-clean-boot-ui-preserved';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
