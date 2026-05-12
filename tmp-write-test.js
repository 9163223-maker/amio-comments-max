'use strict';
const fs = require('fs');
function install(){
  const file='x.js';
  const before='a';
  const after=before.replace('a','b');
  if(after!==before) fs.writeFileSync(file, after, 'utf8');
  return { ok: true };
}
module.exports={install};
