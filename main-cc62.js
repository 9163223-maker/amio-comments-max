'use strict';

// CC6.5.2 entrypoint.
// Keeps approved legacy comments UI and makes navigation callback ACKs silent.
process.env.BUILD_VERSION = 'CC6.5.2';
process.env.RUNTIME_VERSION = 'CC6.5.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2-silent-navigation-callbacks';

require('./cc652-silent-callbacks').install();
require('./cc5-bootstrap-lite');
