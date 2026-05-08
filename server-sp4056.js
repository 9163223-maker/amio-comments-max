'use strict';
console.log('[SP40.5.6] clean entry');
try { require('./pg-url-normalize-sp4054g.js'); } catch (e) { console.log('pg-url normalize skipped: ' + (e.message || e)); }
try { require('./pg-compat-sp4054e.js'); } catch (e) { console.log('pg compat skipped: ' + (e.message || e)); }
try { require('./store-postgres-sp405.js'); } catch (e) { console.log('pg store skipped: ' + (e.message || e)); }
require('./media-core-sp4021.txt');
