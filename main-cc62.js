'use strict';

// CC6.5.1 entrypoint.
// Bootstrap keeps approved legacy comments UI as /app owner and aligns DB truth debug runtime markers.
process.env.BUILD_VERSION = 'CC6.5.1';
process.env.RUNTIME_VERSION = 'CC6.5.1';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.1-debug-truth-alignment';

require('./cc5-bootstrap-lite');
