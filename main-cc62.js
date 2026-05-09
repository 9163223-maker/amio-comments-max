'use strict';
process.env.BUILD_VERSION = 'CC6.2';
process.env.RUNTIME_VERSION = 'CC6.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.2-legacy-ui-clean-boot';

require('./cc52-db-guard').install();
require('./cc62-comments-legacy-ui-clean-boot');
require('./server-sp4058.js');
try { require('./cc45-public-final').install(); } catch (error) {}
