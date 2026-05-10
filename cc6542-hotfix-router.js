'use strict';
const RUNTIME='CC6.5.5.1-HOTFIX-SHIM';
const SOURCE='adminkit-CC6.5.5.1-hotfix-shim';
function install(){return {ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,retired:true};}
function selfTest(){return install();}
async function handleUpdate(){return false;}
module.exports={RUNTIME,SOURCE,install,selfTest,handleUpdate};
