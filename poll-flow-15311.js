'use strict';

const db = require('./cc5-db-core');
const store = require('./store');
const pollService = require('./services/pollService');
const max = require('./services/maxApi');
const { buildCustomKeyboardRows } = require('./services/keyboardBuilderService');
const { findGiftCampaignForPost } = require('./services/giftService');
const tenant = require('./tenant-scope');
const access = require('./services/clientAccessService');

const RUNTIME = 'ADMINKIT-POLL-FLOW-1.4-EXACT-POLL-PATCH';

function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function sh(v,n=90){const s=clean(v||'Пост');return s.length<=n?s:s.slice(0,n-1).trim()+'…';}
function clone(v,fallback=null){try{return JSON.parse(JSON.stringify(v??fallback));}catch{return fallback;}}
function stripKeyboard(arr){return Array.isArray(arr)?clone(arr,[]).filter(x=>x&&x.type!=='inline_keyboard'):[];}
function channelAllowed(post={},userId=''){const id=clean(post&&post.channelId);if(!id||!clean(userId))return false;try{return (access.getClientChannels(userId)||[]).some(ch=>clean(ch.channelId||ch.id)===id);}catch{return false;}}
function postByKey(commentKey,userId=''){try{const post=store.getPost(commentKey)||null;if(!post)return null;if(!clean(userId))return post;const ctx=tenant.ensureTenantContext(userId);return channelAllowed(post,userId)||tenant.belongsToTenant(post,{...ctx,canReadLegacyUnscoped:false})?post:null;}catch{return null;}}
function postTitle(post,key){return sh((post&&(post.originalText||post.postText||post.title||post.postId))||key||'Пост',120);}
async function setFlow(userId,flow){try{await db.setFlow(String(userId||''),flow);}catch{}}
async function getFlow(userId){try{return await db.getFlow(String(userId||''));}catch{return null;}}
async function clearFlow(userId){try{await db.clearFlow(String(userId||''));}catch{}}

function postRows(menu, source='polls', userId=''){
  let posts=[];
  try{const seen={};posts=store.getPostsList().filter(p=>{const k=clean(p&&(p.commentKey||((p.channelId||'')+':'+(p.postId||p.messageId||''))));if(!k||seen[k])return false;if(clean(userId)&&!postByKey(k,userId))return false;seen[k]=1;return true;}).slice(0,8);}catch{}
  const rows=posts.map((p,i)=>[menu.button((i+1)+'. '+sh(p.originalText||p.postText||p.postId,54),'comments_pick_post',{source,commentKey:clean(p.commentKey)})]);
  if(!rows.length)rows.push([menu.button('Пока нет постов','admin_section_polls')]);
  rows.push([menu.button('🗳 В начало опросов','admin_section_polls')]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return {posts,rows};
}

function home(menu){
  return {id:'polls_home',text:['🗳 Голосовалки / опросы','','Опросы создаются как кнопки под выбранным постом, голоса сохраняются в Postgres.','','Можно выбрать быстрый шаблон или создать свой вопрос и до 4 ответов.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост для опроса','comments_select_post',{source:'polls'})],[menu.button('📊 Статус опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function picker(menu,userId=''){
  const {posts,rows}=postRows(menu,'polls',userId);
  return {id:'polls_picker',text:['🗳 Голосовалки / опросы','',posts.length?'Выберите пост для создания опроса.':'Пока нет постов в памяти бота. Перешлите публикацию боту, чтобы он сохранил канал и пост в Postgres.'].join('\n'),attachments:menu.keyboard(rows)};
}
function picked(menu,commentKey,userId=''){
  const post=postByKey(commentKey,userId);
  return {id:'polls_picked',text:['🗳 Создание опроса','','Пост: '+postTitle(post,commentKey),'','Можно создать быстрый опрос или настроить свой вопрос и ответы. Ответов — от 2 до 4. Короткие варианты будут разложены по две кнопки в ряд.'].join('\n'),attachments:menu.keyboard([[menu.button('✍️ Свой вопрос и ответы','poll_custom_start',{commentKey})],[menu.button('✅ Быстро: Да / Нет','poll_create',{commentKey,template:'yes_no'})],[menu.button('👍 Быстро: Нравится / Не нравится','poll_create',{commentKey,template:'like_dislike'})],[menu.button('1️⃣ 2️⃣ 3️⃣ Быстро: три варианта','poll_create',{commentKey,template:'three'})],[menu.button('📌 Назад к выбору поста','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
async function customStart(menu,{userId='',commentKey=''}={}){
  const post=postByKey(commentKey,userId);
  if(!post)return {id:'poll_error',text:['⚠️ Пост не найден','','Нужно выбрать пост из сохранённых.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  await setFlow(userId,{type:'poll_custom',step:'question',commentKey,startedAt:Date.now()});
  return {id:'poll_custom_question',text:['✍️ Свой опрос','','Пост: '+postTitle(post,commentKey),'','Напишите одним сообщением вопрос опроса.','','Пример:','Какой формат разобрать завтра?'].join('\n'),attachments:menu.keyboard([[menu.button('↩️ Отмена','comments_pick_post',{source:'polls',commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function optionsPrompt(menu,commentKey,question){
  return {id:'poll_custom_options',text:['✍️ Варианты ответа','','Вопрос: '+sh(question,180),'','Напишите от 2 до 4 ответов. Каждый ответ — с новой строки.','','Пример:','Да','Нет','','Короткие ответы автоматически встанут по две кнопки в ряд.'].join('\n'),attachments:menu.keyboard([[menu.button('↩️ Отмена','comments_pick_post',{source:'polls',commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}

async function patchPostWithPoll({config,commentKey,pollId='',userId=''}){
  const post=postByKey(commentKey,userId);
  if(!post||!post.messageId)return {ok:false,error:'post_or_message_missing'};
  const commentCount=(store.getComments(commentKey)||[]).length;
  const originalAttachments=stripKeyboard(post.sourceAttachments||post.attachments||[]);
  const giftCampaign=findGiftCampaignForPost({channelId:post.channelId,postId:post.postId});
  const giftRows=giftCampaign?max.buildGiftKeyboardRows({campaign:giftCampaign,commentKey,channelId:post.channelId,postId:post.postId}):[];
  const customRows=buildCustomKeyboardRows({builder:post.customKeyboard||{},appBaseUrl:config.appBaseUrl,channelId:post.channelId,postId:post.postId,commentKey});
  const pollRows=await pollService.buildPollKeyboardRows({channelId:post.channelId,postId:post.postId,commentKey,pollId});
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
  store.savePost(commentKey,{lastPollPatchAt:Date.now(),lastPollRowsCount:pollRows.length,lastPollPatchError:null,lastPollPatchId:pollId||null});
  return {ok:true,result,pollRows:pollRows.length,pollId:pollId||null};
}

async function finishCreate(menu,{config,userId='',commentKey='',question='',options=[],template='custom'}={}){
  const post=postByKey(commentKey,userId);
  if(!post)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Пост не найден в памяти бота.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const created=template==='custom'?await pollService.createPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey,question,options,template}):await pollService.createQuickPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey,postTitle:postTitle(post,commentKey),template});
  if(!created.ok)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Ошибка: '+String(created.error||'unknown')].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  let patched={ok:false};
  try{patched=await patchPostWithPoll({config,commentKey,pollId:created.poll&&created.poll.id,userId});}catch(e){patched={ok:false,error:String(e&&e.message||e),status:e&&e.status,data:e&&e.data};}
  const lines=['✅ Опрос создан','','Пост: '+postTitle(post,commentKey),'Вопрос: '+sh(created.poll&&created.poll.question||question,180),'Ответов: '+((created.poll&&created.poll.options&&created.poll.options.length)||options.length),'Голоса будут сохраняться в Postgres.'];
  if(patched.ok)lines.push('','Кнопки опроса добавлены под постом.'); else lines.push('','Опрос создан в базе, но пост пока не пропатчился: '+String(patched.error||'patch_failed'));
  return {id:'poll_created',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('📊 Статус опросов','poll_status')],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
async function createPoll(menu,{config,userId='',commentKey='',template='yes_no'}={}){return finishCreate(menu,{config,userId,commentKey,template});}
async function handleTextInput(menu,{config,userId='',text=''}={}){
  const flow=await getFlow(userId);
  if(!flow||flow.type!=='poll_custom')return null;
  const value=clean(text);
  const commentKey=clean(flow.commentKey);
  if(!value)return null;
  if(flow.step==='question'){
    if(value.length<3)return {id:'poll_custom_question_error',text:'⚠️ Вопрос слишком короткий. Напишите вопрос опроса одним сообщением.',attachments:menu.keyboard([[menu.button('↩️ Отмена','comments_pick_post',{source:'polls',commentKey})]])};
    await setFlow(userId,{...flow,step:'options',question:value,updatedAt:Date.now()});
    return optionsPrompt(menu,commentKey,value);
  }
  if(flow.step==='options'){
    const options=pollService.parseOptionsText(value);
    if(options.length<2||options.length>4)return {id:'poll_custom_options_error',text:['⚠️ Нужно от 2 до 4 вариантов.','','Напишите каждый ответ с новой строки. Например:','Да','Нет'].join('\n'),attachments:menu.keyboard([[menu.button('↩️ Отмена','comments_pick_post',{source:'polls',commentKey})]])};
    await clearFlow(userId);
    return finishCreate(menu,{config,userId,commentKey,question:flow.question,options,template:'custom'});
  }
  return null;
}
async function vote({config,userId='',pollId='',optionId='',commentKey=''}){
  const r=await pollService.vote({pollId,optionId,userId});
  const key=commentKey||clean(r&&r.summary&&r.summary.commentKey);
  if(r.ok&&key){try{await patchPostWithPoll({config,commentKey:key,pollId});}catch(e){return {ok:true,patchError:String(e&&e.message||e),summary:r.summary};}}
  return r;
}
async function statusScreen(menu){
  try{const s=await pollService.status();return {id:'poll_status',text:['📊 Статус опросов','','Postgres: OK','Опросов: '+((s.counts&&s.counts.polls)||0),'Голосов: '+((s.counts&&s.counts.votes)||0),'','Есть быстрые шаблоны и пользовательские опросы: вопрос + 2–4 ответа.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост для опроса','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};}
  catch(e){return {id:'poll_status_error',text:['⚠️ Статус опросов недоступен','','Ошибка: '+String(e&&e.message||e)].join('\n'),attachments:menu.keyboard([[menu.button('🏠 Главное меню','admin_section_main')]])};}
}
module.exports={RUNTIME,home,picker,picked,customStart,createPoll,handleTextInput,vote,statusScreen,patchPostWithPoll};
