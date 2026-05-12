'use strict';
function x(s){ return String(s||'').match(/(?:cp|ck)_{2,}(-?\d{6,})[_:]+(-?\d{6,})/i); }
module.exports={x};
