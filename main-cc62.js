'use strict';

// CC6.3 entrypoint.
// Bootstrap installs passive runtime audit/debug/API routes through the Express wrapper,
// then loads the legacy server so the approved comments UI remains the /app owner.
process.env.BUILD_VERSION = 'CC6.3';
process.env.RUNTIME_VERSION = 'CC6.3';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.3-comments-runtime-audit';

require('./cc5-bootstrap-lite');
