'use strict';
const Module=require('module');
const RUNTIME='CC4.3';
const SOURCE='adminkit-CC4.3-post-filter-store-hotfix';
process.env.BUILD_VERSION=RUNTIME;
process.env.RUNTIME_VERSION=RUNTIME;
process.env.BUILD_SOURCE_MARKER=SOURCE;
console.log('['+RUNTIME+'] store hotfix');
const clean=v=>String(v||'').replace(/^post:/i,'').replace(/^ck:/i,'').replace(/^:+/,'').replace(/^['\"]+|['\"]+$/g,'').trim();
const defaults=()=>({enabled:true,applyPresetCommon:true,blockLinks:false,blockInvites:true,customBlocklist:[]});
function getPost(mod,k){try{return mod.getPost?.(clean(k))||null}catch{return null}}
function channels(mod){try{return mod.getChannelsList?.()||[]}catch{return[]}}
function firstChannel(mod,id=''){const arr=channels(mod),w=String(id||'').trim();return arr.find(c=>String(c.channelId||'')===w)||arr[0]||null}
function ruleKey(sc){return sc.scope==='post'&&sc.commentKey?`cc43:mod:post:${sc.commentKey}`:`cc43:mod:channel:${sc.channelId||'global'}`}
function readRules(mod,sc){let base=defaults();try{if(sc.scope==='post'){const ch=mod.getSetupState?.(`cc43:mod:channel:${sc.channelId||'global'}`)?.rules;if(ch&&typeof ch==='object')base={...base,...ch}}const own=mod.getSetupState?.(ruleKey(sc))?.rules;if(own&&typeof own==='object')base={...base,...own}}catch{}return base}
function saveRules(mod,sc,next){const rules={...defaults(),...(next||{}),scope:sc.scope,channelId:sc.channelId||'',commentKey:sc.commentKey||'',updatedAt:Date.now()};try{mod.setSetupState?.(ruleKey(sc),{rules,updatedAt:Date.now()})}catch{}return rules}
function patchStore(mod){if(!mod||mod.__cc43Store)return mod;mod.__cc43Store=true;mod.getModerationSettings=(channelId='')=>readRules(mod,{scope:'channel',channelId:String(channelId||firstChannel(mod)?.channelId||'').trim(),commentKey:''});mod.saveModerationSettings=(channelId='',next={})=>saveRules(mod,{scope:'channel',channelId:String(channelId||firstChannel(mod)?.channelId||'').trim(),commentKey:''},next);mod.getPostModerationSettings=(commentKey='')=>{const key=clean(commentKey);const ch=String(getPost(mod,key)?.channelId||(key.includes(':')?key.split(':')[0]:firstChannel(mod)?.channelId||'')).trim();return readRules(mod,{scope:'post',channelId:ch,commentKey:key})};mod.savePostModerationSettings=(commentKey='',next={})=>{const key=clean(commentKey);const ch=String(next.channelId||getPost(mod,key)?.channelId||(key.includes(':')?key.split(':')[0]:firstChannel(mod)?.channelId||'')).trim();return saveRules(mod,{scope:'post',channelId:ch,commentKey:key},next)};return mod}
const oldLoad=Module._load;Module._load=function(request,parent,isMain){const loaded=oldLoad.apply(this,arguments);try{const r=String(request||'');if((r==='./store'||r.endsWith('/store')||r.endsWith('store.js'))&&loaded)return patchStore(loaded)}catch{}return loaded};
require('./server-cc42.js');
process.env.BUILD_VERSION=RUNTIME;
process.env.RUNTIME_VERSION=RUNTIME;
process.env.BUILD_SOURCE_MARKER=SOURCE;
