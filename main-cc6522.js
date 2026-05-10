'use strict';

const cleanMenu = require('./cc6523-clean-menu-router');
const persistence = require('./cc6522-persistence-hotfix');
const silentCallbacks = require('./cc652-silent-callbacks');

cleanMenu.install();
persistence.install();
silentCallbacks.install();

process.env.BUILD_VERSION = 'CC6.5.2.3';
process.env.RUNTIME_VERSION = 'CC6.5.2.3';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2.3-clean-menu-router';

require('./cc5-bootstrap-lite');
