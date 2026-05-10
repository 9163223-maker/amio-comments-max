'use strict';

// CC6.5.2 clean core entrypoint.
// Restored after CC6.5.3-CC6.5.5 regression: no logo/runtime/router overlays here.
// Keeps approved legacy comments UI and makes navigation callback ACKs silent.
process.env.BUILD_VERSION = 'CC6.5.2';
process.env.RUNTIME_VERSION = 'CC6.5.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2-clean-core-restored';

require('./cc652-silent-callbacks').install();
require('./cc5-bootstrap-lite');
