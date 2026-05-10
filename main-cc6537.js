'use strict';

// CC6.5.3.7 canonical core entrypoint.
// No visual patch stack. No production-test-ui override layer.
// Section owners are handled by their canonical routers inside cc5-bootstrap-lite / cc55 wrapper.

process.env.BUILD_VERSION = 'CC6.5.3.7';
process.env.RUNTIME_VERSION = 'CC6.5.3.7';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.3.7-canonical-core-entrypoint';

require('./cc5-bootstrap-lite');
