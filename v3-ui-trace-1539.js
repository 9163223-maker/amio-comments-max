'use strict';

const liveIdentity = require('./services/liveIdentityService');

const DEFAULT_LIMIT=20;
const MAX_LIMIT=500;
function enabled(){return String(process.env.ADMINKIT_UI_TRACE_DISABLED||'0').trim()!=='1';}
function consoleEnabled(){return String(process.env.ADMINKIT_UI_TRACE_CONSOLE||'0').trim()==='1';}
function limit(){const n=Number(process.env.ADMINKIT_UI_TRACE_LIMIT||DEFAULT_LIMIT);return Number.isFinite(n)&&n>0?Math.min(Math.floor(n),MAX_LIMIT):DEFAULT_LIMIT;}
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
function redactText(v){return String(v||'').replace(/AK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/gi,'AK-****-****-****').slice(0,220);}
function safeValue(key,value){
  const k=String(key||'').toLowerCase();
  if(value===undefined||value===null||String(value)==='') return undefined;
  if(/token|secret|authorization|cookie|password|activationcode|rawcode|privatepayload/.test(k)) return undefined;
  if(k==='userid'||k==='user_id'||k==='maxuserid'||k==='max_user_id'||k==='adminid'||k==='tenantid'||k==='tenant_id'||k==='chatid'||k==='channelid') return mask(value);
  if(k==='actorrole') return /admin/i.test(String(value))?'admin':'client';
  if(k==='accountstate') return ['no_access','active','expired','admin'].includes(String(value))?String(value):redactText(value);
  if(k==='durationms'||k==='channelcount') { const n=Number(value); return Number.isFinite(n)?n:undefined; }
  if(typeof value==='boolean') return value;
  if(typeof value==='number') return Number.isFinite(value)?value:undefined;
  if(typeof value==='object') return sanitize(value,1);
  return redactText(value);
}
function sanitize(input,depth){
  if(!input||typeof input!=='object'||depth<0) return undefined;
  const out=Array.isArray(input)?[]:{};
  const allowed=['userId','maxUserId','actorRole','accountState','action','route','screenId','source','durationMs','tenantId','channelCount','accessDecision','gateReason','featureKey','reason','ok','allowed','type','kind','focus','context','commentKey','channelId','postId','pollId','optionId','status','error','screen'];
  for(const [k,v] of Object.entries(input)){
    if(k==='raw'||k==='rawPayload'||k==='payloadText'||k==='body'||k==='request'||k==='response') continue;
    if(depth===1&&!allowed.includes(k)&&!/^payload$/i.test(k)&&!/^timing$/i.test(k)&&!/^gate$/i.test(k)) continue;
    const safe=safeValue(k,v);
    if(safe!==undefined) out[k]=safe;
  }
  return out;
}
function lightPayload(p){
  p=p||{};
  const out={};
  ['action','source','focus','context','commentKey','channelId','postId','pollId','optionId'].forEach((k)=>{const safe=safeValue(k,p[k]);if(safe!==undefined) out[k]=safe;});
  return out;
}
function log(type,data){
  try{
    if(!enabled()) return null;
    const st=state();
    const entry={seq:++st.seq,at:new Date().toISOString(),type:String(type||'event'),runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',...(sanitize(data||{},2)||{}),liveIdentity:liveIdentity.fingerprint()};
    st.events.push(entry);
    const cap=limit();
    if(st.events.length>cap) st.events.splice(0,st.events.length-cap);
    if(consoleEnabled()) try{console.log('ADMINKIT_UI_TRACE', JSON.stringify(entry));}catch(e){}
    return entry;
  }catch(e){return null;}
}
function list(max){const st=state();const n=Number(max||0);const cap=Number.isFinite(n)&&n>0?Math.min(Math.floor(n),MAX_LIMIT):0;const events=st.events.slice().reverse();return cap?events.slice(0,cap):events;}
function clear(){const st=state();st.events=[];st.seq=0;return true;}
function info(){return{enabled:enabled(),console:consoleEnabled(),limit:limit(),maxLimit:MAX_LIMIT,events:state().events.length,runtimeVersion:process.env.RUNTIME_VERSION||process.env.BUILD_VERSION||'unknown',note:'global UI trace ring buffer supports up to 500 safe masked events; set ADMINKIT_UI_TRACE_LIMIT=500 for deep diagnostics'};}
module.exports={log,list,clear,mask,lightPayload,enabled,info,limit,LIMIT:DEFAULT_LIMIT,MAX_LIMIT};
