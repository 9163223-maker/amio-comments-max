'use strict';
const clean=v=>String(v||'').replace(/^post:/i,'').replace(/^ck:/i,'').replace(/^:+/,'').replace(/^['\"]+|['\"]+$/g,'').trim();
const defaults=()=>({enabled:true,applyPresetCommon:true,blockLinks:false,blockInvites:true,customBlocklist:[]});
function firstChannel(mod,id=''){const list=mod.getChannelsList?.()||[];const w=String(id||'').trim();return list.find(c=>String(c.channelId||'')===w)||list[0]||{};}
function getPost(mod,k){try{return mod.getPost?.(clean(k))||null}catch{return null}}
function ruleKey(sc){return sc.scope==='post'&&sc.commentKey?`cc43:mod:post:${sc.commentKey}`:`cc43:mod:channel:${sc.channelId||'global'}`}
function readRules(mod,sc){let r=defaults();try{if(sc.scope==='post'){const cr=mod.getSetupState?.(`cc43:mod:channel:${sc.channelId||'global'}`)?.rules;if(cr&&typeof cr==='object')r={...r,...cr}}const own=mod.getSetupState?.(ruleKey(sc))?.rules;if(own&&typeof own==='object')r={...r,...own}}catch{}return r}
function writeRules(mod,sc,next){const rules={...defaults(),...(next||{}),scope:sc.scope,channelId:sc.channelId||'',commentKey:sc.commentKey||'',updatedAt:Date.now()};try{mod.setSetupState?.(ruleKey(sc),{rules,updatedAt:Date.now()})}catch{}return rules}
function postScope(mod,commentKey,next={}){const key=clean(commentKey);const ch=String(next.channelId||getPost(mod,key)?.channelId||(key.includes(':')?key.split(':')[0]:firstChannel(mod).channelId||'')).trim();return{scope:'post',channelId:ch,commentKey:key}}
function channelScope(mod,channelId=''){return{scope:'channel',channelId:String(channelId||firstChannel(mod).channelId||'').trim(),commentKey:''}}
function patchStore(mod){if(!mod||mod.__cc43Store)return mod;mod.__cc43Store=true;mod.getModerationSettings=(channelId='')=>readRules(mod,channelScope(mod,channelId));mod.saveModerationSettings=(channelId='',next={})=>writeRules(mod,channelScope(mod,channelId),next);mod.getPostModerationSettings=(commentKey='')=>readRules(mod,postScope(mod,commentKey));mod.savePostModerationSettings=(commentKey='',next={})=>writeRules(mod,postScope(mod,commentKey,next),next);mod.__cc43RuleKey=ruleKey;mod.__cc43ReadRules=(sc)=>readRules(mod,sc);mod.__cc43WriteRules=(sc,next)=>writeRules(mod,sc,next);return mod}
module.exports={patchStore,clean,defaults,ruleKey};
