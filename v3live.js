'use strict';
exports.install=function(){
  const id=require.resolve('./menu-v3-feature-adapter');
  require.cache[id]={id,filename:id,loaded:true,exports:require('./menu-v3-feature-adapter-fixed')};
  let hardRouter=null;
  let titleFallback=null;
  let menuActions=null;
  let stressTest=null;
  let stressSummary=null;
  let oneActiveMenu=null;
  try { oneActiveMenu=require('./v3-one-active-menu-edit').install(); } catch (error) { oneActiveMenu={ok:false,error:error&&error.message?error.message:String(error)}; }
  try { hardRouter=require('./v3-menu-callback-hard-router').install(); } catch (error) { hardRouter={ok:false,error:error&&error.message?error.message:String(error)}; }
  try { titleFallback=require('./v3-comments-title-db-fallback').install(); } catch (error) { titleFallback={ok:false,error:error&&error.message?error.message:String(error)}; }
  try { menuActions=require('./v3-menu-actions-adapter').install(); } catch (error) { menuActions={ok:false,error:error&&error.message?error.message:String(error)}; }
  try { stressTest=require('./v3-menu-stress-test').install(); } catch (error) { stressTest={ok:false,error:error&&error.message?error.message:String(error)}; }
  try { stressSummary=require('./v3-menu-stress-summary').install(); } catch (error) { stressSummary={ok:false,error:error&&error.message?error.message:String(error)}; }
  return {ok:true,runtimeVersion:'CC6.7.2',sourceMarker:'adminkit-v3-one-active-menu-edit-plus-stress-summary',oneActiveMenu,hardRouter,titleFallback,menuActions,stressTest,stressSummary};
};
