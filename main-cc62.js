'use strict';

// CC6.5.2.1 entrypoint.
// Minimal hotfix over CC6.5.2 clean core: start/menu fallback + landing logo fit only.
process.env.BUILD_VERSION = 'CC6.5.2.1';
process.env.RUNTIME_VERSION = 'CC6.5.2.1';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2.1-minimal-start-logo-hotfix';

require('./cc6521-start-logo-hotfix').install();
require('./cc652-silent-callbacks').install();
require('./cc5-bootstrap-lite');
