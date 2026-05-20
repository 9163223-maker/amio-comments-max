'use strict';

// One active input flow guard.
// Poll custom wizard lives in Postgres ak_flow_state, while legacy CTA/buttons wizard lives in store.setupState.commentAdminFlow.
// This adapter routes text by the currently active owner, so text entered in «Кнопки» can never be consumed by stale poll flow.
const base = require('./clean-bot-1539');
const highlightAdapter = require('./clean-bot-highlight-1543');
const menu = require('./v3-menu-core-1539');
const max = require('./services/maxApi');
const polls = require('./poll-flow-15313');
const pollService = require('./services/pollService');
const db = require('./cc5-db-core');
const store = require('./store');
const pollTrace = require('./poll-debug-trace');

function find(o,p,d){ if(!o||d<0) return null; if(p(o)) return o; if(typeof o!=='object') return null; for(const v of (Array.isArray(o)?o:Object.values(o))){ const r=find(v,p,d-1); if(r) return r; } return null; }
function msg(u){ return u && (u.message || u.data?.message || u.callback?.message || u.data?.callback?.message || find(u,x=>x&&typeof x==='object'&&(x.body?.text||x.text)&&(x.recipient||x.sender||x.message_id||x.id),5)) || null; }
function cb(u){ return u && (u.callback || u.data?.callback || u.message?.callback || u.data?.message?.callback || find(u,x=>x&&typeof x==='object'&&(x.callback_id||x.callbackId||x.payload||x.callback_data||x.callbackData)&&!(x.body&&x.body.text),6)) || null; }
function text(m){ return String(m?.body?.text || m?.text || ''); }
function mid(m){ return String(m?.body?.mid || m?.body?.message_id || m?.message_id || m?.messageId || m?.id || '').trim(); }
function chat(m){ return String(m?.recipient?.chat_id || m?.recipient?.id || m?.chat_id || m?.chat?.id || '').trim(); }
function sender(m){ return String(m?.sender?.user_id || m?.sender?.id || m?.user_id || '').trim(); }
function clean(v){ return String(v||'').trim(); }
function userFrom(o){ if(!o||typeof o!=='object') return ''; return clean(o.user_id||o.userId||o.userID||o.sender_id||o.senderId||o.from_id||o.fromId||o.id||o.uid||userFrom(o.user)||userFrom(o.sender)||userFrom(o.from)||userFrom(o.author)); }
function uid(u,c,m){ return userFrom(c)||userFrom(u)||sender(m)||userFrom(find(u,x=>x&&typeof x==='object'&&(x.user_id||x.userId||x.sender_id||x.senderId||x.from_id||x.fromId),7)); }
function cbid(c){ return clean(c?.callback_id || c?.callbackId || c?.id); }
function pv(c){ return !c ? '' : c.payload!==undefined ? c.payload : c.data!==undefined ? c.data : c.value!==undefined ? c.value : c.callback_data!==undefined ? c.callback_data : c.callbackData!==undefined ? c.callbackData : ''; }
function rawPayload(c){ const v=pv(c); return !v ? '' : typeof v==='object' ? JSON.stringify(v) : String(v).trim(); }
function parse(c){ const v=pv(c); if(v&&typeof v==='object') return v; const s=String(v||'').trim(); if(!s) return {}; if(/^pv:/i.test(s)){ const p=s.split(':'); return {action:'poll_vote',pollId:p[1]||'',optionId:p.slice(2).join(':')||'',raw:s}; } if(/^pi:/i.test(s)){ const p=s.split(':'); return {action:'poll_info',pollId:p[1]||'',raw:s}; } try{return JSON.parse(s);}catch{return {action:s,raw:s};} }
function isHighlight(p){ const a=String(p?.action||''), s=String(p?.source||''); return a==='admin_section_highlights'||a==='highlight_status'||a==='highlight_apply'||a==='highlight_remove'||a==='highlight_info'||(a==='comments_select_post'&&s==='highlights')||(a==='comments_pick_post'&&s==='highlights'); }
function isPoll(p){ const a=String(p?.action||''), s=String(p?.source||''); return a==='poll_vote'||a==='poll_status'||a==='poll_create'||a==='poll_custom_start'||a==='poll_custom_cancel'||a==='poll_custom_edit_question'||a==='poll_custom_edit_options'||a==='poll_custom_run'||a==='admin_section_polls'||(a==='comments_select_post'&&s==='polls')||(a==='comments_pick_post'&&s==='polls'); }
function legacyFlow(userId){ try{ const st=store.getSetupState(String(userId||''))||{}; if(st.commentAdminFlow?.mode) return 'comment:'+String(st.commentAdminFlow.mode); if(st.giftFlow) return 'gift'; const k=String(st.activeAdminFlowKind||'').trim(); return k && k!=='poll' ? k : ''; }catch{return '';} }
async function getPollFlow(userId){ try{return await db.getFlow(String(userId||''));}catch{return null;} }
async function clearPollFlow(userId,reason){ try{ const f=await getPollFlow(userId); if(f?.type==='poll_custom'){ await db.clearFlow(String(userId||'')); pollTrace.add('poll_flow_cleared_by_guard',{reason:String(reason||''),step:String(f.step||''),userId:pollTrace.mask(userId)}); return true; } }catch(e){ pollTrace.add('poll_flow_guard_clear_error',{reason:String(reason||''),error:String(e?.message||e)}); } return false; }
async function ack(config,id,notification){ if(!id) return null; try{ const r=await max.answerCallback({botToken:config.botToken,callbackId:id,notification:notification||undefined}); pollTrace.add('ack_ok',{callbackId:pollTrace.mask(id),notification:pollTrace.safe(notification,80)}); return r; }catch(e){ pollTrace.add('ack_error',{callbackId:pollTrace.mask(id),error:String(e?.message||e),status:e?.status}); return null; } }
async function show(config,u,c,m,s,edit){ const id=mid(m); if(edit&&id){ try{ const r=await max.editMessage({botToken:config.botToken,messageId:id,text:s.text,attachments:s.attachments,notify:false}); pollTrace.add('screen_edit_ok',{screenId:s?.id,messageId:pollTrace.mask(id)}); return r; }catch(e){ pollTrace.add('screen_edit_error_fallback_send',{screenId:s?.id,error:String(e?.message||e),status:e?.status}); } } const chatId=chat(m), userId=uid(u,c,m)||sender(m); const r=await max.sendMessage({botToken:config.botToken,userId:chatId?'':userId,chatId,text:s.text,attachments:s.attachments,notify:false}); pollTrace.add('screen_send_ok',{screenId:s?.id,chatId:pollTrace.mask(chatId),userId:pollTrace.mask(userId)}); return r; }
function err(e){ return {id:'poll_custom_error',text:['⚠️ Ошибка сценария опроса','',String(e?.message||e||'unknown')].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')],[menu.button('🏠 Главное меню','admin_section_main')]])}; }
async function pollScreen(p,userId,config){ const a=String(p.action||''); if(a==='poll_custom_start')return polls.customStart(menu,{userId,commentKey:p.commentKey||''}); if(a==='poll_custom_cancel')return polls.customCancel(menu,{userId,commentKey:p.commentKey||''}); if(a==='poll_custom_edit_question')return polls.customEditQuestion(menu,{userId,commentKey:p.commentKey||''}); if(a==='poll_custom_edit_options')return polls.customEditOptions(menu,{userId,commentKey:p.commentKey||''}); if(a==='poll_custom_run')return polls.customRun(menu,{config,userId,commentKey:p.commentKey||''}); if(a==='poll_status')return polls.statusScreen(menu); return null; }
function fallbackVoter(c,m){ return uid(null,c,m) || (cbid(c)?'callback:'+cbid(c).slice(0,64):''); }
async function handleVote({config,c,m,p,userId}){ const voterId=fallbackVoter(c,m)||userId; pollTrace.add('poll_vote_start',{pollId:String(p.pollId||''),optionId:String(p.optionId||''),hasVoterId:!!voterId,callbackId:pollTrace.mask(cbid(c)),messageId:pollTrace.mask(mid(m))}); const vr=await pollService.vote({userId:voterId,pollId:p.pollId,optionId:p.optionId}); let patchError='', key=''; if(vr?.ok){ key=clean(p.commentKey)||clean(vr?.summary?.commentKey); if(key){ try{ await polls.patchPostWithPoll({config,commentKey:key,pollId:p.pollId}); }catch(e){ patchError=String(e?.message||e); } } } pollTrace.add('poll_vote_result',{ok:!!vr?.ok,error:vr?.error||'',pollId:String(p.pollId||''),optionId:String(p.optionId||''),summaryTotal:vr?.summary?.total,commentKeyFound:!!key,patchError}); await ack(config,cbid(c),vr?.ok?'Голос учтён':'Не удалось учесть голос'); return {vr,voterId,patchError}; }

function createCleanBot(legacy){
  const wrapped=base.createCleanBot(legacy);
  const highlightOnly=highlightAdapter.createCleanBot(legacy);
  return { handleWebhook: async function(req,res,config){
    const u=req.body||{}, c=cb(u), m=msg(u);
    try{
      if(c){
        const p=parse(c), a=String(p.action||''), userId=uid(u,c,m)||sender(m), raw=rawPayload(c);
        if(isHighlight(p)) return highlightOnly.handleWebhook(req,res,config);
        pollTrace.add('callback_received',{action:a,raw:pollTrace.safe(raw,160),rawLen:raw.length,callbackId:pollTrace.mask(cbid(c)),userId:pollTrace.mask(userId),pollId:String(p.pollId||''),optionId:String(p.optionId||'')});
        if(!isPoll(p)){ await clearPollFlow(userId,'non_poll_callback:'+a); pollTrace.add('delegate_legacy',{reason:'non_poll_callback',action:a}); return wrapped.handleWebhook(req,res,config); }
        if(a==='poll_vote'){ const out=await handleVote({config,c,m,p,userId}); return res.status(200).json({ok:true,handledBy:'clean-bot-flow-guard-1544',action:a,voted:!!out.vr?.ok,pollId:p.pollId||'',optionId:p.optionId||'',hasVoterId:!!out.voterId,patchError:out.patchError||'',error:out.vr?.error||''}); }
        let s=null; try{s=await pollScreen(p,userId,config);}catch(e){pollTrace.add('poll_screen_error',{action:a,error:String(e?.message||e)});s=err(e);} if(s){ await ack(config,cbid(c)); await show(config,u,c,m,s,true); return res.status(200).json({ok:true,handledBy:'clean-bot-flow-guard-1544',action:a,screenId:s.id}); }
      }
      if(m && text(m).trim() && !/^\/?start(?:\s|$)/i.test(text(m).trim())){
        const userId=sender(m)||uid(u,c,m), lf=legacyFlow(userId), pf=await getPollFlow(userId);
        if(lf){ if(pf?.type==='poll_custom') await clearPollFlow(userId,'legacy_text:'+lf); pollTrace.add('delegate_legacy',{reason:'legacy_active_text_flow',legacyKind:lf,userId:pollTrace.mask(userId)}); return wrapped.handleWebhook(req,res,config); }
        if(pf?.type==='poll_custom'){ const s=await polls.handleTextInput(menu,{config,userId,text:text(m)}); if(s){ pollTrace.add('poll_text_flow',{screenId:s.id,userId:pollTrace.mask(userId),textLen:text(m).length}); await show(config,u,c,m,s,false); return res.status(200).json({ok:true,handledBy:'clean-bot-flow-guard-1544',action:'poll_custom_text',screenId:s.id}); } }
      }
      return wrapped.handleWebhook(req,res,config);
    }catch(e){ pollTrace.add('flow_guard_error',{error:String(e?.message||e),stack:String(e?.stack||'').slice(0,400)}); if(!res.headersSent) return res.status(500).json({ok:false,error:e?.message||'flow_guard_failed',handledBy:'clean-bot-flow-guard-1544'}); return null; }
  }};
}
module.exports={createCleanBot};
