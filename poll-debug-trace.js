'use strict';

const LIMIT = 40;
function isOn(){ return process.env.ADMINKIT_POLL_TRACE === '1'; }
function state(){
  if(!global.__ADMINKIT_POLL_DEBUG_TRACE__) global.__ADMINKIT_POLL_DEBUG_TRACE__={seq:0,events:[]};
  return global.__ADMINKIT_POLL_DEBUG_TRACE__;
}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function mask(v){const s=clean(v);if(!s)return'';return s.length<=8?'***'+s.slice(-3):s.slice(0,3)+'…'+s.slice(-5);}
function safe(v,n=180){
  try{
    const s=typeof v==='string'?v:JSON.stringify(v);
    return String(s||'').slice(0,n);
  }catch{return'';}
}
function add(type,data={}){
  if(!isOn()) return null;
  try{
    const st=state();
    const e={seq:++st.seq,at:new Date().toISOString(),type:clean(type||'event'),runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'',...data};
    st.events.push(e);
    if(st.events.length>LIMIT) st.events.splice(0,st.events.length-LIMIT);
    return e;
  }catch{return null;}
}
function list(){return state().events.slice().reverse();}
function clear(){const st=state();st.seq=0;st.events=[];return true;}
function info(){const on=isOn();return{ok:true,enabled:on,mode:on?'poll-debug-trace-ring-buffer':'poll-debug-trace-off',limit:LIMIT,total:on?state().events.length:0,events:on?list():[],safe:true,noDatabaseRead:true,noMaxApiCall:true};}
module.exports={LIMIT,isOn,add,list,clear,info,mask,safe};
