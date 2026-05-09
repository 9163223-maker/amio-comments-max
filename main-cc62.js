'use strict';

// CC6.5 entrypoint.
// Bootstrap keeps approved legacy comments UI as /app owner and adds moderation DB truth/title repair.
process.env.BUILD_VERSION = 'CC6.5';
process.env.RUNTIME_VERSION = 'CC6.5';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5-moderation-title-repair';

require('./cc5-bootstrap-lite');
