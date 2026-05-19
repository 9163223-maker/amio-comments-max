'use strict';
const base=require('./v3-menu-core-1538');
const RUNTIME='CC7.5.34-CORE-1.53.9-V3-CALLBACK-TRACE';
const SOURCE='adminkit-cc7-5-34-core-1-53-9-v3-callback-trace';
function runtimeVersion(){return process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||RUNTIME;}
module.exports={...base,RUNTIME,SOURCE,runtimeVersion};
