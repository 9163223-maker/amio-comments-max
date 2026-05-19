'use strict';
const menu=require('./v3-menu-core-1536');
const max=require('./services/maxApi');
function msg(u){return u&&((u.message)||(u.data&&u.data.message)||(u.callback&&u.callback.message)||(u.data&&u.data.callback&&u.data.callback.message))||null}
function cb(u){return u&&((u.callback)||(u.data&&u.data.callback)||(u.message&&u.message.callback))||null}
function txt(m){return String((m&&m.body&&m.body.text)||m&&m.text||'')}
function mid(m){return String((m&&m.body&&(m.body.mid||m.body.message_id))||m&&m.message_id||m&&m.id||'').trim()}
function chat(m){return String((m&&m.recipient&&(m.recipient.chat_id||m.recipient.id))||m&&m.chat_id||'').trim()}
function sender(m){return String((m&&m.sender&&(m.sender.user_id||m.sender.id))||m&&m.user_id||'').trim()}
function cbid(c){return String((c&&(c.callback_id||c.id))||'').trim()}
function uid(u,c){return String((c&&c.user&&(c.user.user_id||c.user.id))||(u&&u.user&&(u.user.user_id||u.user.id))||(u&&u.sender&&(u.sender.user_id||u.sender.id))||'').trim()}
function parse(c){var raw=String((c&&(c.payload||c.data||c.value||c.callback_data))||'').trim();if(!raw)return{};try{return JSON.parse(raw)}catch(e){return{raw:raw}}}
async function ack(config,id){if(!id)return null;try{return await max.answerCallback({botToken:config.botToken,callbackId:id})}catch(e){return null}}
async function show(config,u,c,m,s,edit){var id=mid(m);if(edit&&id){try{return await max.editMessage({botToken:config.botToken,messageId:id,text:s.text,attachments:s.attachments,notify:false})}catch(e){}}
var chatId=chat(m);var userId=uid(u,c)||sender(m);return max.sendMessage({botToken:config.botToken,userId:chatId?'':userId,chatId:chatId,text:s.text,attachments:s.attachments,notify:false})}
function createCleanBot(legacy){return{handleWebhook:async function(req,res,config){var u=req.body||{};var t=String(u.update_type||u.type||'');var c=cb(u);var m=msg(u);try{if(t==='message_callback'){var p=parse(c);var s=menu.screenForPayload(p);if(s){await ack(config,cbid(c));await show(config,u,c,m,s,true);return res.status(200).json({ok:true,handledBy:'clean-bot-1536',runtimeVersion:menu.runtimeVersion(),action:p.action||''})}return legacy.handleWebhook(req,res,config)}if(t==='bot_started'){var userId=uid(u,c);if(userId){var main=menu.mainScreen();await max.sendMessage({botToken:config.botToken,userId:userId,text:main.text,attachments:main.attachments,notify:false});return res.status(200).json({ok:true,handledBy:'clean-bot-1536',action:'bot_started_main_menu',runtimeVersion:menu.runtimeVersion()})}}if(m&&/^\/?start(?:\s|$)/i.test(txt(m).trim())){var sc=menu.mainScreen();await show(config,u,c,m,sc,false);return res.status(200).json({ok:true,handledBy:'clean-bot-1536',action:'start_main_menu',runtimeVersion:menu.runtimeVersion()})}return legacy.handleWebhook(req,res,config)}catch(e){console.error('CLEAN BOT 1536 ERROR:',e&&e.message||e);if(!res.headersSent)return res.status(500).json({ok:false,error:e&&e.message||'clean_bot_failed'});return null}}}}
module.exports={createCleanBot};
