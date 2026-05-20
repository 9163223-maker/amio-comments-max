'use strict';

// Постоянный безопасный trace для раздела «Выделение постов».
// Хранит только последние 6 событий в памяти процесса: не пишет в Postgres, не вызывает MAX API.
const LIMIT = 6;
function state(){
  if(!global.__ADMINKIT_HIGHLIGHT_DEBUG_TRACE__) global.__ADMINKIT_HIGHLIGHT_DEBUG_TRACE__={seq:0,events:[]};
  return global.__ADMINKIT_HIGHLIGHT_DEBUG_TRACE__;
}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function mask(v){const s=clean(v);if(!s)return'';return s.length<=8?'***'+s.slice(-3):s.slice(0,3)+'…'+s.slice(-5);}
function safe(v,n=140){
  try{const s=typeof v==='string'?v:JSON.stringify(v);return String(s||'').slice(0,n);}catch{return'';}
}
function compact(data={}){
  const out={};
  for(const [k,v] of Object.entries(data||{})){
    if(k==='stack')continue;
    if(k==='raw'||k==='payload')out[k]=safe(v,120);
    else if(k==='error'||k==='patchError')out[k]=safe(v,180);
    else out[k]=v;
  }
  return out;
}
function add(type,data={}){
  try{
    const st=state();
    const e={seq:++st.seq,at:new Date().toISOString(),type:clean(type||'event'),runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'',...compact(data)};
    st.events.push(e);
    if(st.events.length>LIMIT)st.events.splice(0,st.events.length-LIMIT);
    return e;
  }catch{return null;}
}
function list(){return state().events.slice().reverse();}
function clear(){const st=state();st.seq=0;st.events=[];return true;}
function info(){return{ok:true,enabled:true,mode:'highlight-debug-trace-last-6-always-on',limit:LIMIT,total:state().events.length,events:list(),safe:true,noDatabaseRead:true,noMaxApiCall:true,volatileMemory:true};}
module.exports={LIMIT,add,list,clear,info,mask,safe};
