'use strict';

const DEFAULT_LIMIT=40;
function enabled(){return String(process.env.ADMINKIT_UI_TRACE_FORCE||'0').trim()==='1';}
function consoleEnabled(){return String(process.env.ADMINKIT_UI_TRACE_CONSOLE||'0').trim()==='1';}
function limit(){const n=Number(process.env.ADMINKIT_UI_TRACE_LIMIT||DEFAULT_LIMIT);return Number.isFinite(n)&&n>0?Math.min(Math.floor(n),80):DEFAULT_LIMIT;}
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
  ['action','source','focus','context','commentKey','channelId','postId','pollId','optionId','raw'].forEach((k)=>{if(p[k]!==undefined&&p[k]!==null&&String(p[k])!=='') out[k]=String(p[k]).slice(0,100);});
  return out;
}
function log(type,data){
  try{
    if(!enabled()) return null;
    const st=state();
    const entry={seq:++st.seq,at:new Date().toISOString(),type:String(type||'event'),runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',...(data||{})};
    st.events.push(entry);
    const cap=limit();
    if(st.events.length>cap) st.events.splice(0,st.events.length-cap);
    if(consoleEnabled()) try{console.log('ADMINKIT_UI_TRACE', JSON.stringify(entry));}catch(e){}
    return entry;
  }catch(e){return null;}
}
function list(){const st=state();return st.events.slice().reverse();}
function clear(){const st=state();st.events=[];st.seq=0;return true;}
function info(){return{enabled:enabled(),console:consoleEnabled(),limit:limit(),events:state().events.length,runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',note:'trace is off by default; set ADMINKIT_UI_TRACE_FORCE=1 only for short diagnostics'};}
module.exports={log,list,clear,mask,lightPayload,enabled,info,LIMIT:DEFAULT_LIMIT};
