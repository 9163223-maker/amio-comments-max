'use strict';
const base = require('./menu-v3-feature-adapter');
function selfTest(){
  const t = base.selfTest();
  const c = t.checks || {};
  const ok = c.safeCoreFreeze === true
    && c.touchesBoot === false
    && c.patchesExpress === false
    && c.patchesModuleLoad === false
    && c.patchesAppPost === false
    && c.touchesDebugStore === false
    && c.touchesDebugPing === false
    && c.rendererHasMain === true
    && c.commentsChoosePostOwnedByComments === true
    && c.editorChoosePostOwnedByEditor === true
    && c.moderationOwnedByCanonicalRouter === true
    && Number(c.routesChecked || 0) >= 12;
  return { ...t, ok, fixedSelfTest: true, adapterVersion: 'menu-v3-live-bridge-1.2' };
}
module.exports = { ...base, selfTest };
