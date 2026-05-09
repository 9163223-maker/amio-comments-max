'use strict';
process.env.BUILD_VERSION = 'CC6.5.5';
process.env.RUNTIME_VERSION = 'CC6.5.5';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.5-logo-assets';
require('./cc655-landing-logo-asset').install();
require('./cc653-qa-lite').install();
require('./cc653-comments-router-guard-logo').install();
require('./cc652-silent-callbacks').install();
require('./cc5-bootstrap-lite');
