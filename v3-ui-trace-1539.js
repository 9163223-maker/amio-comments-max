'use strict';

const LIMIT=300;
function state(){
  if(!global.__ADMINKIT_UI_TRACE_1539__) global.__ADMINKIT_UI_TRACE_1539__={seq:0,events:[]};
  return global.__ADMINKIT_UI_TRACE_1539__;
}
function mask(v){
  const s=String(v||'').trim();
  if(!s) return '';
  if(s.length<=6) return '***'+s.slice(-2);
  return s.slice(0,3)+'…'+s.slice(-4);
}
function lightPayload(p){
  p=p||{};
  const out={};
  ['action','source','focus','context','commentKey','channelId','postId','raw'].forEach((k)=>{if(p[k]!==undefined&&p[k]!==null&&String(p[k])!=='') out[k]=String(p[k]).slice(0,180);});
  return out;
}
function log(type,data){
  try{
    const st=state();
    const entry={
      seq:++st.seq,
      at:new Date().toISOString(),
      type:String(type||'event'),
      runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',
      ...(data||{})
    };
    st.events.push(entry);
    if(st.events.length>LIMIT) st.events.splice(0,st.events.length-LIMIT);
    try{console.log('ADMINKIT_UI_TRACE', JSON.stringify(entry));}catch(e){}
    return entry;
  }catch(e){return null;}
}
function list(){const st=state();return st.events.slice().reverse();}
function clear(){const st=state();st.events=[];st.seq=0;return true;}
module.exports={log,list,clear,mask,lightPayload,LIMIT};
