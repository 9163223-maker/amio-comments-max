'use strict';
exports.install=function(){
  const id=require.resolve('./menu-v3-feature-adapter');
  require.cache[id]={id,filename:id,loaded:true,exports:require('./menu-v3-feature-adapter-fixed')};
  let hardRouter=null;
  try { hardRouter=require('./v3-menu-callback-hard-router').install(); } catch (error) { hardRouter={ok:false,error:error&&error.message?error.message:String(error)}; }
  return {ok:true,runtimeVersion:'CC6.6.7',sourceMarker:'adminkit-v3-fixed-cache-bridge-plus-hard-callback-router',hardRouter};
};
