'use strict';

const store = require('./store');
const pollService = require('./services/pollService');
const max = require('./services/maxApi');
const { buildCustomKeyboardRows } = require('./services/keyboardBuilderService');
const { findGiftCampaignForPost } = require('./services/giftService');

const RUNTIME = 'ADMINKIT-POLL-FLOW-1.0';

function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function sh(v,n=90){const s=clean(v||'Пост');return s.length<=n?s:s.slice(0,n-1).trim()+'…';}
function clone(v,fallback=null){try{return JSON.parse(JSON.stringify(v??fallback));}catch{return fallback;}}
function stripKeyboard(arr){return Array.isArray(arr)?clone(arr,[]).filter(x=>x&&x.type!=='inline_keyboard'):[];}
function postByKey(commentKey){try{return store.getPost(commentKey)||null;}catch{return null;}}
function postTitle(post,key){return sh((post&&(post.originalText||post.postText||post.title||post.postId))||key||'Пост',120);}

function postRows(menu, source='polls'){
  let posts=[];
  try{const seen={};posts=store.getPostsList().filter(p=>{const k=clean(p&&(p.commentKey||((p.channelId||'')+':'+(p.postId||p.messageId||''))));if(!k||seen[k])return false;seen[k]=1;return true;}).slice(0,8);}catch{}
  const rows=posts.map((p,i)=>[menu.button((i+1)+'. '+sh(p.originalText||p.postText||p.postId,54),'comments_pick_post',{source,commentKey:clean(p.commentKey)})]);
  if(!rows.length)rows.push([menu.button('Пока нет постов','admin_section_polls')]);
  rows.push([menu.button('🗳 В начало опросов','admin_section_polls')]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return {posts,rows};
}

function home(menu){
  return {id:'polls_home',text:['🗳 Голосовалки / опросы','','Теперь это не заглушка. Опросы создаются как callback-кнопки под выбранным постом и голоса сохраняются в Postgres.','','Выберите пост из сохранённых или перешлите нужную публикацию боту.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост для опроса','comments_select_post',{source:'polls'})],[menu.button('📊 Статус опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function picker(menu){
  const {posts,rows}=postRows(menu,'polls');
  return {id:'polls_picker',text:['🗳 Голосовалки / опросы','',posts.length?'Выберите пост для создания опроса.':'Пока нет постов в памяти бота. Перешлите публикацию боту, чтобы он сохранил канал и пост в Postgres.'].join('\n'),attachments:menu.keyboard(rows)};
}
function picked(menu,commentKey){
  const post=postByKey(commentKey);
  return {id:'polls_picked',text:['🗳 Создание опроса','','Пост: '+postTitle(post,commentKey),'','Выберите быстрый шаблон. Сейчас храним все опросы и голоса в Postgres; тарифные лимиты включим позже.'].join('\n'),attachments:menu.keyboard([[menu.button('✅ Да / Нет','poll_create',{commentKey,template:'yes_no'})],[menu.button('👍 Нравится / Не нравится','poll_create',{commentKey,template:'like_dislike'})],[menu.button('1️⃣ 2️⃣ 3️⃣ Три варианта','poll_create',{commentKey,template:'three'})],[menu.button('📌 Назад к выбору поста','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}

async function patchPostWithPoll({config,commentKey}){
  const post=postByKey(commentKey);
  if(!post||!post.messageId)return {ok:false,error:'post_or_message_missing'};
  const commentCount=(store.getComments(commentKey)||[]).length;
  const originalAttachments=stripKeyboard(post.sourceAttachments||post.attachments||[]);
  const giftCampaign=findGiftCampaignForPost({channelId:post.channelId,postId:post.postId});
  const giftRows=giftCampaign?max.buildGiftKeyboardRows({campaign:giftCampaign,commentKey,channelId:post.channelId,postId:post.postId}):[];
  const customRows=buildCustomKeyboardRows({builder:post.customKeyboard||{},appBaseUrl:config.appBaseUrl,channelId:post.channelId,postId:post.postId,commentKey});
  const pollRows=await pollService.buildPollKeyboardRows({channelId:post.channelId,postId:post.postId,commentKey});
  const keyboard=max.buildCommentsKeyboard({
    appBaseUrl:config.appBaseUrl,botUsername:config.botUsername,maxDeepLinkBase:config.maxDeepLinkBase,
    handoffToken:post.handoffToken,postId:post.postId,channelId:post.channelId,commentKey,messageId:post.messageId||post.postId,
    count:commentCount,extraRows:[...customRows,...pollRows,...giftRows],primaryButtonText:clean(post.customKeyboard&&post.customKeyboard.commentButtonText),showPrimaryButton:!Boolean(post.commentsDisabled)
  });
  const payload={botToken:config.botToken,messageId:post.messageId,attachments:[...originalAttachments,...keyboard],notify:false};
  if(post.originalText)payload.text=String(post.originalText||'');
  if(post.originalLink)payload.link=clone(post.originalLink,null);
  if(post.originalFormat!==undefined&&post.originalFormat!==null)payload.format=post.originalFormat;
  const result=await max.editMessage(payload);
  store.savePost(commentKey,{lastPollPatchAt:Date.now(),lastPollRowsCount:pollRows.length,lastPollPatchError:null});
  return {ok:true,result,pollRows:pollRows.length};
}

async function createPoll(menu,{config,userId='',commentKey='',template='yes_no'}={}){
  const post=postByKey(commentKey);
  if(!post)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Пост не найден в памяти бота. Это как раз проверка: канал и пост должны сохраняться в Postgres после обновлений.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const created=await pollService.createQuickPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey,postTitle:postTitle(post,commentKey),template});
  if(!created.ok)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Ошибка: '+String(created.error||'unknown')].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  let patched={ok:false};
  try{patched=await patchPostWithPoll({config,commentKey});}catch(e){patched={ok:false,error:String(e&&e.message||e),status:e&&e.status,data:e&&e.data};}
  const lines=['✅ Опрос создан','','Пост: '+postTitle(post,commentKey),'Шаблон: '+template,'Голоса будут сохраняться в Postgres.'];
  if(patched.ok)lines.push('','Кнопки опроса добавлены под постом.'); else lines.push('','Опрос создан в базе, но пост пока не пропатчился: '+String(patched.error||'patch_failed'));
  return {id:'poll_created',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('📊 Статус опросов','poll_status')],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}

async function vote({config,userId='',pollId='',optionId='',commentKey=''}){
  const r=await pollService.vote({pollId,optionId,userId});
  if(r.ok&&commentKey){try{await patchPostWithPoll({config,commentKey});}catch(e){return {ok:true,patchError:String(e&&e.message||e),summary:r.summary};}}
  return r;
}
async function statusScreen(menu){
  try{const s=await pollService.status();return {id:'poll_status',text:['📊 Статус опросов','','Postgres: OK','Опросов: '+((s.counts&&s.counts.polls)||0),'Голосов: '+((s.counts&&s.counts.votes)||0),'','Раздел больше не заглушка: есть таблицы, создание быстрых опросов и голосование callback-кнопками.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост для опроса','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};}
  catch(e){return {id:'poll_status_error',text:['⚠️ Статус опросов недоступен','','Ошибка: '+String(e&&e.message||e)].join('\n'),attachments:menu.keyboard([[menu.button('🏠 Главное меню','admin_section_main')]])};}
}
module.exports={RUNTIME,home,picker,picked,createPoll,vote,statusScreen,patchPostWithPoll};
