'use strict';
require('./cc6524-production-menu-map-debug').install();
require('./cc6523-clean-menu-router').install();
require('./cc6522-persistence-hotfix').install();
require('./cc652-silent-callbacks').install();
process.env.BUILD_VERSION='CC6.5.2.4';
process.env.RUNTIME_VERSION='CC6.5.2.4';
process.env.BUILD_SOURCE_MARKER='adminkit-CC6.5.2.4-production-menu-map';
require('./cc5-bootstrap-lite');
