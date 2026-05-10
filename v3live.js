'use strict';
exports.install=function(){
  const id=require.resolve('./menu-v3-feature-adapter');
  require.cache[id]={id,filename:id,loaded:true,exports:require('./menu-v3-feature-adapter-fixed')};
  return {ok:true,runtimeVersion:'CC6.5.5.2',sourceMarker:'adminkit-v3-fixed-cache-bridge'};
};
