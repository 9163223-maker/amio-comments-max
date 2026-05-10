const R='CC6.5.4.7-SAFE-BOOT'
exports.install=function(){process.env.RUNTIME_VERSION=R;process.env.BUILD_VERSION=R;return{ok:true,runtimeVersion:R,safeBoot:true}}
