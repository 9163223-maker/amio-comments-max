'use strict';
process.env.BUILD_VERSION = 'CC6.5.3';
process.env.RUNTIME_VERSION = 'CC6.5.3';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.3-comments-router-guard-logo-fit';
require('./cc653-qa-lite').install();
require('./cc653-comments-router-guard-logo').install();
require('./cc652-silent-callbacks').install();
require('./cc5-bootstrap-lite');
