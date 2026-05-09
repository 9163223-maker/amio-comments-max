'use strict';

// CC6.2 entrypoint.
// Important: do not load server-sp4058.js directly here.
// cc5-bootstrap-lite installs the CC6.2 debug/API routes through the Express wrapper,
// then loads the legacy server so the approved comments UI remains the /app owner.
process.env.BUILD_VERSION = 'CC6.2';
process.env.RUNTIME_VERSION = 'CC6.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.2-legacy-ui-clean-boot';

require('./cc5-bootstrap-lite');
