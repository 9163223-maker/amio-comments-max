'use strict';
const base=require('./clean-bot-1539');
const menu=require('./v3-menu-core-1539');
const max=require('./services/maxApi');
const polls=require('./poll-flow-15313');
function find(o,p,d){if(!o||d<0)return null;if(p(o))return o;if(typeof o!=='object')return null;for(const v of (Array.isArray(o)?o:Object.values(o))){const r=find(v,p,d-1);if(r)return r;}return null;}
function msg(u){return u&&(u.message||u.data&&u.data.message||u.callback&&u.callback.message||u.data&&u.data.callback&&u.data.callback.message||find(u,x=>x&&typeof x==='object'&&(x.body&&x.body.text||x.text)&&(x.recipient||x.sender||x.message_id||x.id),5))||null;}
function cb(u){return u&&(u.callback||u.data&&u.data.callback||u.message&&u.message.callback||u.data&&u.data.message&&u.data.message.callback||find(u,x=>x&&typeof x==='object'&&(x.callback_id||x.callbackId||x.payload||x.callback_data||x.callbackData)&&!(x.body&&x.body.text),6))||null;}
function text(m){return String(m&&m.body&&m.body.text||m&&m.text||'');}
function mid(m){return String(m&&m.body&&(m.body.mid||m.body.message_id)||m&&(m.message_id||m.messageId||m.id)||'').trim();}
function chat(m){return String(m&&m.recipient&&(m.recipient.chat_id||m.recipient.id)||m&&(m.chat_id||m.chat&&m.chat.id)||'').trim();}
function sender(m){return String(m&&m.sender&&(m.sender.user_id||m.sender.id)||m&&m.user_id||'').trim();}
function uid(u,c){return String(c&&c.user&&(c.user.user_id||c.user.id)||c&&c.sender&&(c.sender.user_id||c.sender.id)||u&&u.user&&(u.user.user_id||u.user.id)||u&&u.sender&&(u.sender.user_id||u.sender.id)||'').trim();}
function cbid(c){return String(c&&(c.callback_id||c.callbackId||c.id)||'').trim();}
function pv(c){return !c?'':c.payload!==undefined?c.payload:c.data!==undefined?c.data:c.value!==undefined?c.value:c.callback_data!==undefined?c.callback_data:c.callbackData!==undefined?c.callbackData:'';}
function parse(c){const v=pv(c);if(v&&typeof v==='object')return v;const s=String(v||'').trim();if(!s)return{};try{return JSON.parse(s)}catch{return{action:s,raw:s}}}
async function ack(config,id){if(!id)return null;try{return await max.answerCallback({botToken:config.botToken,callbackId:id});}catch{return null;}}
async function show(config,u,c,m,s,edit){const id=mid(m);if(edit&&id){try{return await max.editMessage({botToken:config.botToken,messageId:id,text:s.text,attachments:s.attachments,notify:false});}catch{}}
const chatId=chat(m), userId=uid(u,c)||sender(m);return max.sendMessage({botToken:config.botToken,userId:chatId?'':userId,chatId,text:s.text,attachments:s.attachments,notify:false});}
function err(e){return{id:'poll_custom_error',text:['⚠️ Ошибка сценария опроса','',String(e&&e.message||e||'unknown')].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')],[menu.button('🏠 Главное меню','admin_section_main')]])};}
async function pollScreen(p,userId,config){const a=String(p.action||'');if(a==='poll_custom_start')return polls.customStart(menu,{userId,commentKey:p.commentKey||''});if(a==='poll_custom_cancel')return polls.customCancel(menu,{userId,commentKey:p.commentKey||''});if(a==='poll_custom_edit_question')return polls.customEditQuestion(menu,{userId,commentKey:p.commentKey||''});if(a==='poll_custom_edit_options')return polls.customEditOptions(menu,{userId,commentKey:p.commentKey||''});if(a==='poll_custom_run')return polls.customRun(menu,{config,userId,commentKey:p.commentKey||''});if(a==='poll_status')return polls.statusScreen(menu);return null;}
function createCleanBot(legacy){const wrapped=base.createCleanBot(legacy);return{handleWebhook:async function(req,res,config){const u=req.body||{},c=cb(u),m=msg(u);try{if(c){const p=parse(c),a=String(p.action||''),userId=uid(u,c)||sender(m);if(a==='poll_vote'){const vr=await polls.vote({config,userId,pollId:p.pollId,optionId:p.optionId,commentKey:p.commentKey||''});await ack(config,cbid(c));return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1542',action:a,voted:!!(vr&&vr.ok)});}let s=null;try{s=await pollScreen(p,userId,config);}catch(e){s=err(e);}if(s){await ack(config,cbid(c));await show(config,u,c,m,s,true);return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1542',action:a,screenId:s.id});}}
if(m&&text(m).trim()&&!/^\/?start(?:\s|$)/i.test(text(m).trim())){const userId=sender(m)||uid(u,c);const s=await polls.handleTextInput(menu,{config,userId,text:text(m)});if(s){await show(config,u,c,m,s,false);return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1542',action:'poll_custom_text',screenId:s.id});}}
return wrapped.handleWebhook(req,res,config);}catch(e){if(!res.headersSent)return res.status(500).json({ok:false,error:e&&e.message||'poll_custom_wrapper_failed',handledBy:'clean-bot-poll-custom-1542'});return null;}}};}
module.exports={createCleanBot};
