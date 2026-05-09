'use strict';

// CC6.4 entrypoint.
// Bootstrap keeps approved legacy comments UI as /app owner and adds DB truth/debug routes.
process.env.BUILD_VERSION = 'CC6.4';
process.env.RUNTIME_VERSION = 'CC6.4';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.4-moderation-db-truth';

require('./cc5-bootstrap-lite');
