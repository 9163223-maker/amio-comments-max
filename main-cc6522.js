'use strict';

process.env.BUILD_VERSION = 'CC6.5.2.2';
process.env.RUNTIME_VERSION = 'CC6.5.2.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2.2-persistence-hotfix';

const persistence = require('./cc6522-persistence-hotfix');
const menuReliability = require('./cc6521-start-logo-hotfix');
const silentCallbacks = require('./cc652-silent-callbacks');

persistence.install();
menuReliability.install();
silentCallbacks.install();

require('./cc5-bootstrap-lite');
