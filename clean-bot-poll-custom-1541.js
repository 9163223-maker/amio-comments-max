'use strict';
const base=require('./clean-bot-1539');
const menu=require('./v3-menu-core-1539');
const max=require('./services/maxApi');
const polls=require('./poll-flow-15311');
function find(obj,pred,depth){if(!obj||depth<0)return null;if(pred(obj))return obj;if(typeof obj!=='object')return null;if(Array.isArray(obj)){for(const x of obj){const r=find(x,pred,depth-1);if(r)return r;}return null;}for(const k of Object.keys(obj)){const r=find(obj[k],pred,depth-1);if(r)return r;}return null;}
function msg(u){return u&&((u.message)||(u.data&&u.data.message)||(u.callback&&u.callback.message)||(u.data&&u.data.callback&&u.data.callback.message)||find(u,x=>x&&typeof x==='object'&&(x.body&&x.body.text||x.text)&&((x.recipient)||(x.sender)||(x.message_id)||(x.id)),4))||null}
function cb(u){return u&&((u.callback)||(u.data&&u.data.callback)||(u.message&&u.message.callback)||(u.data&&u.data.message&&u.data.message.callback)||find(u,x=>x&&typeof x==='object'&&(x.callback_id||x.payload||x.callback_data)&&!(x.body&&x.body.text),5))||null}
function txt(m){return String((m&&m.body&&m.body.text)||m&&m.text||'')}
function mid(m){return String((m&&m.body&&(m.body.mid||m.body.message_id))||m&&m.message_id||m&&m.id||'').trim()}
function chat(m){return String((m&&m.recipient&&(m.recipient.chat_id||m.recipient.id))||m&&m.chat_id||'').trim()}
function sender(m){return String((m&&m.sender&&(m.sender.user_id||m.sender.id))||m&&m.user_id||'').trim()}
function uid(u,c){return String((c&&c.user&&(c.user.user_id||c.user.id))||(c&&c.sender&&(c.sender.user_id||c.sender.id))||(u&&u.user&&(u.user.user_id||u.user.id))||(u&&u.sender&&(u.sender.user_id||u.sender.id))||'').trim()}
function cbid(c){return String((c&&(c.callback_id||c.id))||'').trim()}
function raw(c){return String((c&&(c.payload||c.data||c.value||c.callback_data))||'').trim()}
function parse(c){const r=raw(c);if(!r)return{};try{return JSON.parse(r)}catch{return{action:r,raw:r}}}
async function ack(config,id,text){if(!id)return null;try{return max.answerCallback({botToken:config.botToken,callbackId:id,notification:text||undefined})}catch{return null}}
async function show(config,u,c,m,screen,edit){const id=mid(m);if(edit&&id){try{return await max.editMessage({botToken:config.botToken,messageId:id,text:screen.text,attachments:screen.attachments,notify:false})}catch{}}
const chatId=chat(m), userId=uid(u,c)||sender(m);return max.sendMessage({botToken:config.botToken,userId:chatId?'':userId,chatId,text:screen.text,attachments:screen.attachments,notify:false});}
async function pollScreen(p,userId,config){const a=String(p.action||'');if(a==='poll_custom_start')return polls.customStart(menu,{userId,commentKey:p.commentKey||''});if(a==='poll_status')return polls.statusScreen(menu);return null;}
function createCleanBot(legacy){const wrapped=base.createCleanBot(legacy);return{handleWebhook:async function(req,res,config){const u=req.body||{},c=cb(u),m=msg(u);try{if(c){const p=parse(c),a=String(p.action||''),userId=uid(u,c)||sender(m);if(a==='poll_vote'){const vr=await polls.vote({config,userId,pollId:p.pollId,optionId:p.optionId,commentKey:p.commentKey||''});await ack(config,cbid(c),vr&&vr.ok?'Голос учтён':'Не удалось учесть голос');return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1541',action:a,voted:!!(vr&&vr.ok),patchError:vr&&vr.patchError||''});}const s=await pollScreen(p,userId,config);if(s){await ack(config,cbid(c));await show(config,u,c,m,s,true);return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1541',action:a,screenId:s.id});}}
if(m&&txt(m).trim()&&!/^\/?start(?:\s|$)/i.test(txt(m).trim())){const userId=sender(m)||uid(u,c);const s=await polls.handleTextInput(menu,{config,userId,text:txt(m)});if(s){await show(config,u,c,m,s,false);return res.status(200).json({ok:true,handledBy:'clean-bot-poll-custom-1541',action:'poll_custom_text',screenId:s.id});}}
return wrapped.handleWebhook(req,res,config);}catch(e){if(!res.headersSent)return res.status(500).json({ok:false,error:e&&e.message||'poll_custom_wrapper_failed',handledBy:'clean-bot-poll-custom-1541'});return null;}}};}
module.exports={createCleanBot};
