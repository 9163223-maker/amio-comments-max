'use strict';

const DEFAULT_LIMIT=20;
function enabled(){return String(process.env.ADMINKIT_UI_TRACE_DISABLED||'0').trim()!=='1';}
function consoleEnabled(){return String(process.env.ADMINKIT_UI_TRACE_CONSOLE||'0').trim()==='1';}
function limit(){const n=Number(process.env.ADMINKIT_UI_TRACE_LIMIT||DEFAULT_LIMIT);return Number.isFinite(n)&&n>0?Math.min(Math.floor(n),500):DEFAULT_LIMIT;}
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
function redacted(v){const s=String(v||''); if(!s) return ''; if(/AK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/i.test(s)) return '[activation-code-redacted]'; if(s.length>120) return s.slice(0,40)+'…'; return s;}
function sanitizeKey(k='',v){const key=String(k||'').toLowerCase(); if(/token|secret|authorization|cookie|raw|payload|code/.test(key)) return '[redacted]'; if(/userid|user_id|tenantid|tenant_id|channelid|channel_id|postid|post_id|commentkey|comment_key/.test(key)) return mask(v); return redacted(v);}
function sanitizeValue(value, key=''){ if(value===null||value===undefined) return value; if(typeof value==='string'||typeof value==='number'||typeof value==='boolean') return sanitizeKey(key,value); if(Array.isArray(value)) return value.slice(0,10).map((item)=>sanitizeValue(item,key)); if(typeof value==='object'){const out={}; Object.keys(value).slice(0,30).forEach((childKey)=>{out[childKey]=sanitizeValue(value[childKey],childKey);}); return out;} return ''; }
function sanitizeData(data={}){const out={}; Object.keys(data||{}).slice(0,40).forEach((key)=>{out[key]=sanitizeValue(data[key],key);}); return out;}
function lightPayload(p){
  p=p||{};
  const out={};
  ['action','source','focus','context','commentKey','channelId','postId','pollId','optionId'].forEach((k)=>{if(p[k]!==undefined&&p[k]!==null&&String(p[k])!=='') out[k]=sanitizeValue(p[k],k);});
  if(p.raw!==undefined&&p.raw!==null&&String(p.raw)!=='') out.raw='[redacted]';
  return out;
}
function log(type,data){
  try{
    if(!enabled()) return null;
    const st=state();
    const entry={seq:++st.seq,at:new Date().toISOString(),type:String(type||'event'),runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',...sanitizeData(data||{})};
    st.events.push(entry);
    const cap=limit();
    if(st.events.length>cap) st.events.splice(0,st.events.length-cap);
    if(consoleEnabled()) try{console.log('ADMINKIT_UI_TRACE', JSON.stringify(entry));}catch(e){}
    return entry;
  }catch(e){return null;}
}
function list(){const st=state();return st.events.slice().reverse();}
function clear(){const st=state();st.events=[];st.seq=0;return true;}
function info(){return{enabled:enabled(),console:consoleEnabled(),limit:limit(),events:state().events.length,runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',note:'global UI trace is a sanitized ring buffer; set ADMINKIT_UI_TRACE_DISABLED=1 to disable'};}
module.exports={log,list,clear,mask,lightPayload,enabled,info,limit,sanitizeData,LIMIT:DEFAULT_LIMIT};
