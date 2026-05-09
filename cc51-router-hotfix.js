'use strict';
const old=require('./cc51-router');
const db=require('./cc5-db-core');
const api=require('./services/maxApi');
const config=require('./config');
const RUNTIME='CC5.1.1';
const n=v=>String(v||'').replace(/\s+/g,' ').trim();
const btn=(text,action,extra={})=>({type:'callback',text,payload:JSON.stringify({action,...extra})});
const kb=rows=>[{type:'inline_keyboard',payload:{buttons:rows}}];
function p(u){return db.payload(u)}
function ad(u){return db.adminId(u)}
function mid(u){return db.messageId(u)}
function cbid(u){return db.callbackId(u)}
function chat(u){return db.chatId(u)}
function act(u){return n(db.action(u)).toLowerCase()}
function plVal(o,keys){for(const k of keys){if(o&&o[k]!=null&&n(o[k]))return n(o[k])}return''}
function sc(pl={}){let ch=plVal(pl,['channelId','channel_id','channel']);let post=plVal(pl,['postId','post_id','messageId','message_id','mid']);let ck=db.clean(plVal(pl,['commentKey','key','postKey']));if(!ch&&ck.includes(':'))ch=ck.split(':')[0];if(!post&&ck.includes(':'))post=ck.split(':').pop();return{channelId:ch,postId:post,commentKey:ck||(ch&&post?ch+':'+post:'')}}
function badTitle(t){const s=n(t).toLowerCase();return /модерац|выберите область|выберите пост|фильтр:|стоп-слова:|ручной список:|главное меню/.test(s)}
async function answer(u,t){const id=cbid(u);if(id)try{await api.answerCallback({botToken:config.botToken,callbackId:id,notification:t})}catch{}}
function rid(r){const m=JSON.stringify(r||{}).match(/"(?:message_id|messageId|id)"\s*:\s*"([^"{}]+)"/);return m?m[1]:''}
async function show(u,admin,pack){const m=mid(u);if(m)try{await api.editMessage({botToken:config.botToken,messageId:m,text:pack.text,attachments:pack.attachments||[],notify:false});await db.setMenu(admin,m);return}catch{}const args={botToken:config.botToken,text:pack.text,attachments:pack.attachments||[],notify:false,userId:admin};const r=await api.sendMessage(args);const id=rid(r);if(id)await db.setMenu(admin,id)}
async function chTitle(admin,ch){const cs=await db.getChannels(admin);return cs.find(x=>String(x.channelId)===String(ch))?.title||ch}
async function cleanPosts(admin,ch){return(await db.getPosts(admin,ch,50)).filter(x=>x.postId&&x.commentKey&&!badTitle(x.title||''))}
async function postPicker(u,admin,ch){const title=await chTitle(admin,ch);const posts=await cleanPosts(admin,ch);const rows=posts.map((x,i)=>[btn('🎯 Пост '+(i+1)+': '+db.cut(x.title||x.postId,36),'mod_post_rules',{channelId:ch,postId:x.postId,commentKey:x.commentKey,scopeType:'post'})]);rows.push([btn('🛡 Правила всего канала','mod_channel_rules',{channelId:ch,scopeType:'channel'})],[btn('📺 Другой канал','mod_choose_channel')],[btn('🏠 Главное меню','ak_main_menu')]);await show(u,admin,{text:'🛡 Модерация\n\nКанал: '+title+'\n\nВыберите ПОСТ для отдельных правил.\nКнопки ниже — только реальные посты, служебные меню скрыты.',attachments:kb(rows)})}
async function rules(u,admin,s){const title=await chTitle(admin,s.channelId);const posts=await cleanPosts(admin,s.channelId);const pt=posts.find(x=>String(x.postId)===String(s.postId))?.title||s.postId;const rule=await db.saveRules({adminId:admin,channelId:s.channelId,scopeType:'post',postId:s.postId,commentKey:s.commentKey},await db.getRules({adminId:admin,channelId:s.channelId,scopeType:'post',postId:s.postId}));const custom=Array.isArray(rule.customBlocklist)?rule.customBlocklist:[];const scope={adminId:admin,channelId:s.channelId,scopeType:'post',postId:s.postId,commentKey:s.commentKey};await show(u,admin,{text:['🛡 Модерация','',`Канал: ${title}`,`Пост: ${db.cut(pt,70)}`,'Область: правила этого поста',`Фильтр: ${rule.enabled===false?'выключен':'включён'}`,`Ручной список: ${custom.length?custom.join(', '):'пока пусто'}`,'','Выберите правило кнопками ниже.'].join('\n'),attachments:kb([[btn('🎯 Другой пост','mod_choose_post',{channelId:s.channelId})],[btn('🛡 Правила всего канала','mod_channel_rules',{channelId:s.channelId,scopeType:'channel'})],[btn(rule.enabled===false?'▶️ Включить фильтр':'⏸ Выключить фильтр','mod_toggle_enabled',scope)],[btn('➕ Стоп-слово','mod_add_stopword',scope),btn('🧹 Очистить ручные','mod_clear_stopwords',scope)],[btn('🏠 Главное меню','ak_main_menu')]])})}
async function handle(u={}){await db.init();const admin=ad(u);if(!admin)return false;const payload=p(u),s=sc(payload),a=act(u);if(a==='mod_choose_post'&&s.channelId){await answer(u,'Выберите пост');await postPicker(u,admin,s.channelId);return true}if((a==='mod_post_rules'||(s.channelId&&s.postId&&a))&&s.channelId&&s.postId){await answer(u,'Правила поста');await rules(u,admin,s);return true}if(db.cb(u)){const real=db.upsertFromUpdate;db.upsertFromUpdate=async()=>null;try{return await old.handle(u)}finally{db.upsertFromUpdate=real}}return old.handle(u)}
module.exports={RUNTIME,handle};
