'use strict';
process.env.BUILD_VERSION='CC5.4';
process.env.RUNTIME_VERSION='CC5.4';
process.env.BUILD_SOURCE_MARKER='adminkit-CC5.4-comments-post-register-and-cta';
require('./cc52-db-guard').install();
require('./cc5-bootstrap-lite');
