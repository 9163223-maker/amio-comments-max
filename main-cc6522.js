'use strict';

const menuReliability = require('./cc6521-start-logo-hotfix');
const silentCallbacks = require('./cc652-silent-callbacks');
const persistence = require('./cc6522-persistence-hotfix');

menuReliability.install();
silentCallbacks.install();
persistence.install();

process.env.BUILD_VERSION = 'CC6.5.2.2';
process.env.RUNTIME_VERSION = 'CC6.5.2.2';
process.env.BUILD_SOURCE_MARKER = 'adminkit-CC6.5.2.2-persistence-hotfix';

require('./cc5-bootstrap-lite');
