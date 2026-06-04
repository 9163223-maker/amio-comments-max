'use strict';

const db = require('./cc5-db-core');
const store = require('./store');
const pollService = require('./services/pollService');
const max = require('./services/maxApi');
const { buildCustomKeyboardRows } = require('./services/keyboardBuilderService');
const { findGiftCampaignForPost } = require('./services/giftService');
const tenant = require('./tenant-scope');
const access = require('./services/clientAccessService');
const channelTitles = require('./human-channel-title-helper');

const RUNTIME = 'ADMINKIT-POLL-FLOW-1.4-EXACT-POLL-PATCH';

function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function sh(v,n=90){const s=clean(v||'Пост');return s.length<=n?s:s.slice(0,n-1).trim()+'…';}
function clone(v,fallback=null){try{return JSON.parse(JSON.stringify(v??fallback));}catch{return fallback;}}
function stripKeyboard(arr){return Array.isArray(arr)?clone(arr,[]).filter(x=>x&&x.type!=='inline_keyboard'):[];}
function channelAllowed(post={},userId=''){const id=clean(post&&post.channelId);if(!id||!clean(userId))return false;try{return (access.getClientChannels(userId)||[]).some(ch=>clean(ch.channelId||ch.id)===id);}catch{return false;}}
function postByKey(commentKey,userId=''){try{const post=store.getPost(commentKey)||null;if(!post)return null;if(!clean(userId))return post;const ctx=tenant.ensureTenantContext(userId);return channelAllowed(post,userId)||tenant.belongsToTenant(post,{...ctx,canReadLegacyUnscoped:false})?post:null;}catch{return null;}}
function hasMedia(post={}){const arr=v=>Array.isArray(v)?v:[];return arr(post.sourceAttachments||post.attachments||post.media||post.photos||post.files).length>0||Boolean(post.photo||post.image||post.video||post.document);}
function postPreview(post={},n=120){const text=clean(post.originalText||post.postText||post.text||post.caption||'');if(text)return sh(text,n);return hasMedia(post)?'Пост с медиа':'Пост без текста';}
function postTitle(post,key){return postPreview(post,120);}
function channelTitle(post={},userId=''){return channelTitles.resolveHumanChannelTitle(post.channelId||post.requiredChatId||'',userId,post);}
function visibleChannelIds(userId=''){return new Set(channelTitles.listTenantVisibleChannels(userId).map(ch=>clean(ch.channelId)).filter(Boolean));}
function listPosts(channelId='',userId=''){const ch=clean(channelId), ids=visibleChannelIds(userId), seen={};let posts=[];try{posts=store.getPostsList().filter(p=>{const k=clean(p&&(p.commentKey||((p.channelId||'')+':'+(p.postId||p.messageId||''))));const pc=clean(p&&p.channelId);if(!k||seen[k]||!pc)return false;if(ch&&pc!==ch)return false;if(clean(userId)&&!ids.has(pc))return false;if(clean(userId)&&!postByKey(k,userId))return false;seen[k]=1;return true;}).slice(0,8);}catch{}return posts;}
function targetRecord(post={},userId=''){const ctx=tenant.ensureTenantContext(userId);return tenant.stampRecord({channelId:clean(post.channelId),channelTitle:channelTitle(post,userId),postId:clean(post.postId),messageId:clean(post.messageId),commentKey:clean(post.commentKey),originalText:clean(post.originalText||post.postText||post.text||post.caption||''),sourceAttachments:Array.isArray(post.sourceAttachments||post.attachments)?(post.sourceAttachments||post.attachments):[],linkedAt:Date.now()},ctx,post);}
function bindTarget(userId='',post={}){const uid=clean(userId);if(!uid||!post||!post.commentKey)return null;const target=targetRecord(post,uid);try{const prev=store.getSetupState(uid)||{};store.setSetupState(uid,{...prev,pollTargetPost:target});}catch{}return target;}
function storedTarget(userId=''){try{const st=store.getSetupState(clean(userId))||{};const t=st.pollTargetPost||null;return t&&t.commentKey?postByKey(t.commentKey,userId):null;}catch{return null;}}
function selectedLines(post,userId=''){return ['Выбранный канал: '+channelTitle(post,userId),'Выбранный пост: '+postPreview(post,120)];}
function pollCardRequiredScreen(menu){return {id:'poll_card_required',text:['⚠️ Откройте карточку выбранного поста','','Создание опроса доступно только из карточки выбранного поста.'].join('\n'),attachments:menu.keyboard([[menu.button('Выбрать пост','comments_select_post',{source:'polls'})],[menu.button('В начало опросов','admin_section_polls')],[menu.button('Главное меню','admin_section_main')]])};}
function isPollCardSource(source=''){return clean(source)==='poll_card';}
async function setFlow(userId,flow){try{await db.setFlow(String(userId||''),flow);}catch{}}
async function getFlow(userId){try{return await db.getFlow(String(userId||''));}catch{return null;}}
async function clearFlow(userId){try{await db.clearFlow(String(userId||''));}catch{}}

function postRows(menu, source='polls', userId='', channelId=''){
  const posts=listPosts(channelId,userId);
  const rows=posts.map((p,i)=>[menu.button((i+1)+'. '+postPreview(p,54),'comments_pick_post',{source,commentKey:clean(p.commentKey)})]);
  if(!rows.length)rows.push([menu.button('В этом канале пока нет сохранённых постов.','admin_section_polls')]);
  rows.push([menu.button('📺 Выбрать другой канал','comments_select_post',{source})]);
  rows.push([menu.button('🗳 В начало опросов','admin_section_polls')]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return {posts,rows};
}
function channelPicker(menu,userId=''){
  const channels=channelTitles.listTenantVisibleChannels(userId);
  const rows=channels.map((ch,i)=>[menu.button((i+1)+'. '+sh(ch.title||channelTitles.UNTITLED_CHANNEL,52),'comments_select_post',{source:'polls',channelId:clean(ch.channelId)})]);
  if(!rows.length)rows.push([menu.button('Каналы не подключены','admin_section_polls')]);
  rows.push([menu.button('🗳 В начало опросов','admin_section_polls')]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return {id:'polls_channel_picker',text:['🗳 Опросы','','Выберите канал. После этого бот покажет сохранённые посты только этого канала.'].join('\n'),attachments:menu.keyboard(rows)};
}
function home(menu,userId=''){
  const target=storedTarget(userId);
  if(target){
    return {id:'polls_home',text:['🗳 Опросы','','Пост выбран. Действия ниже относятся только к этому посту.','',...selectedLines(target,userId)].join('\n'),attachments:menu.keyboard([[menu.button('Создать опрос к выбранному посту','comments_pick_post',{source:'polls',commentKey:clean(target.commentKey)})],[menu.button('Результаты опросов','poll_status')],[menu.button('Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  }
  return {id:'polls_home',text:['🗳 Опросы','','Пост не выбран. Сначала выберите канал, затем пост.','','Опрос создаётся только после явного выбора карточки поста.'].join('\n'),attachments:menu.keyboard([[menu.button('Создать опрос','comments_select_post',{source:'polls'})],[menu.button('Результаты опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function picker(menu,userId='',channelId=''){
  const requested=clean(channelId);
  if(!requested){const channels=channelTitles.listTenantVisibleChannels(userId);if(channels.length===1)return picker(menu,userId,channels[0].channelId);return channelPicker(menu,userId);}
  const channels=channelTitles.listTenantVisibleChannels(userId);
  const picked=channels.find(ch=>clean(ch.channelId)===requested);
  if(!picked)return channelPicker(menu,userId);
  const {posts,rows}=postRows(menu,'polls',userId,requested);
  const lines=['🗳 Опросы','','Канал: '+(picked.title||channelTitles.UNTITLED_CHANNEL),'',posts.length?'Выберите пост для создания опроса.':'В этом канале пока нет сохранённых постов.'];
  posts.forEach((post,i)=>lines.push((i+1)+'. '+postPreview(post,80)));
  return {id:'polls_post_picker',text:lines.join('\n'),attachments:menu.keyboard(rows)};
}
function picked(menu,commentKey,userId=''){
  const post=postByKey(commentKey,userId);
  if(!post)return {id:'poll_post_missing',text:['⚠️ Пост не найден','','Нужно выбрать пост из доступных сохранённых постов.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  bindTarget(userId,post);
  return {id:'polls_picked',text:['🗳 Карточка выбранного поста','','Канал: '+channelTitle(post,userId),'Пост: '+postPreview(post,120),'','Теперь можно создать быстрый опрос или настроить свой вопрос и ответы. Ответов — от 2 до 4.'].join('\n'),attachments:menu.keyboard([[menu.button('✍️ Свой вопрос и ответы','poll_custom_start',{commentKey,source:'poll_card'})],[menu.button('✅ Быстро: Да / Нет','poll_create',{commentKey,template:'yes_no',source:'poll_card'})],[menu.button('👍 Быстро: Нравится / Не нравится','poll_create',{commentKey,template:'like_dislike',source:'poll_card'})],[menu.button('1️⃣ 2️⃣ 3️⃣ Быстро: три варианта','poll_create',{commentKey,template:'three',source:'poll_card'})],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
async function customStart(menu,{userId='',commentKey='',source=''}={}){
  if(!isPollCardSource(source))return pollCardRequiredScreen(menu);
  const post=postByKey(commentKey,userId);
  if(!post)return {id:'poll_error',text:['⚠️ Пост не найден','','Нужно выбрать пост из сохранённых.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  await setFlow(userId,{type:'poll_custom',step:'question',commentKey,startedAt:Date.now()});
  return {id:'poll_custom_question',text:['✍️ Свой опрос','','Пост: '+postPreview(post,120),'','Напишите одним сообщением вопрос опроса.','','Пример:','Какой формат разобрать завтра?'].join('\n'),attachments:menu.keyboard([[menu.button('↩️ Отмена','comments_pick_post',{source:'polls',commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]])};
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

async function finishCreate(menu,{config,userId='',commentKey='',question='',options=[],template='custom',source=''}={}){
  if(!isPollCardSource(source))return pollCardRequiredScreen(menu);
  const post=postByKey(commentKey,userId);
  if(!post)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Пост недоступен.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const created=template==='custom'?await pollService.createPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey,question,options,template}):await pollService.createQuickPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey,postTitle:postPreview(post,120),template});
  if(!created.ok)return {id:'poll_error',text:['⚠️ Не удалось создать опрос','','Попробуйте позже или выберите пост заново.'].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  let patched={ok:false};
  try{patched=await patchPostWithPoll({config,commentKey,pollId:created.poll&&created.poll.id,userId});}catch(e){patched={ok:false,error:String(e&&e.message||e),status:e&&e.status,data:e&&e.data};}
  const lines=['✅ Опрос создан','','Канал: '+channelTitle(post,userId),'Пост: '+postPreview(post,120),'Вопрос: '+sh(created.poll&&created.poll.question||question,180),'Ответов: '+((created.poll&&created.poll.options&&created.poll.options.length)||options.length),'Результаты будут сохраняться автоматически.'];
  if(patched.ok)lines.push('','Кнопки опроса добавлены под постом.'); else lines.push('','Опрос сохранён, но кнопки под постом пока не обновились. Проверьте подключение канала и повторите позже.');
  return {id:'poll_created',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('📊 Статус опросов','poll_status')],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
async function createPoll(menu,{config,userId='',commentKey='',template='yes_no',source=''}={}){return finishCreate(menu,{config,userId,commentKey,template,source});}
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
    return finishCreate(menu,{config,userId,commentKey,question:flow.question,options,template:'custom',source:'poll_card'});
  }
  return null;
}
async function vote({config,userId='',pollId='',optionId='',commentKey=''}){
  const r=await pollService.vote({pollId,optionId,userId});
  const key=commentKey||clean(r&&r.summary&&r.summary.commentKey);
  if(r.ok&&key){try{await patchPostWithPoll({config,commentKey:key,pollId});}catch(e){return {ok:true,patchError:String(e&&e.message||e),summary:r.summary};}}
  return r;
}
function resultLines(summary){
  const opts=Array.isArray(summary&&summary.options)?summary.options:[];
  return ['Опрос','','Вопрос: '+sh(summary&&summary.question||'Опрос',180),'Ответы:',...opts.map((o,i)=>(i+1)+'. '+sh(o&&o.text||'',72)+' — '+Number(o&&o.votes||0)+' ('+Number(o&&o.percent||0)+'%)'),'','Результаты: '+Number(summary&&summary.total||0)];
}
async function visibleSummary(userId='',pollId=''){
  if(!clean(userId)) return null;
  const summary=await pollService.summary(pollId);
  if(!summary) return null;
  const post=postByKey(summary.commentKey,userId);
  if(!post||clean(post.channelId)!==clean(summary.channelId)||clean(post.postId)!==clean(summary.postId)) return null;
  return summary;
}
async function tenantVisibleActivePolls(userId='',limit=10){
  let polls=[]; try{polls=await pollService.listRecent({status:'active',limit:Math.max(10,limit*3)});}catch{}
  const out=[];
  for(const item of (Array.isArray(polls)?polls:[])){
    if(out.length>=limit) break;
    const summary=await visibleSummary(userId,item.pollId);
    if(summary&&clean(summary.status)==='active') out.push(summary);
  }
  return out;
}
async function statusScreen(menu,{userId=''}={}){
  try{
    const active=await tenantVisibleActivePolls(userId,50);
    const visibleVotes=active.reduce((sum,p)=>sum+Number(p&&p.total||0),0);
    const display=active.slice(0,8);
    const lines=['📊 Результаты','','Активных опросов: '+active.length,'Голосов в видимых опросах: '+visibleVotes,'','Активные опросы:',...(display.length?display.map((p,i)=>(i+1)+'. '+sh(p.question,90)):['Пока нет активных опросов.']),'','Опрос содержит вопрос, ответы и результаты.'];
    const rows=display.map((p,i)=>[menu.button('📊 Результаты '+(i+1),'poll_results',{pollId:p.pollId})]);
    rows.push([menu.button('📌 Выбрать пост для опроса','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]);
    return {id:'poll_status',text:lines.join('\n'),attachments:menu.keyboard(rows)};
  }catch(e){return {id:'poll_status_error',text:['⚠️ Результаты недоступны','','Попробуйте открыть раздел опросов ещё раз.'].join('\n'),attachments:menu.keyboard([[menu.button('🏠 Главное меню','admin_section_main')]])};}
}
async function resultsScreen(menu,{userId='',pollId=''}={}){
  const summary=await visibleSummary(userId,pollId);
  if(!summary) return {id:'poll_results_missing',text:['⚠️ Опрос не найден','','Откройте результаты из раздела опросов.'].join('\n'),attachments:menu.keyboard([[menu.button('Результаты опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const rows=[];
  if(clean(summary.status)==='active') rows.push([menu.button('Остановить опрос','poll_stop',{pollId:summary.pollId,source:'poll_card'})]);
  rows.push([menu.button('Результаты опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]);
  const post=postByKey(summary.commentKey,userId);const text=['📊 Карточка опроса','','Канал: '+channelTitle(post||{channelId:summary.channelId},userId),'Пост: '+postPreview(post||{},120),'',...resultLines(summary)].join('\n');return {id:'poll_results_card',text,attachments:menu.keyboard(rows)};
}
async function stopPoll(menu,{config,userId='',pollId='',source=''}={}){
  if(clean(source)!=='poll_card') return {id:'poll_stop_blocked',text:['⚠️ Опрос не остановлен','','Откройте карточку активного опроса и нажмите «Остановить опрос» там.'].join('\n'),attachments:menu.keyboard([[menu.button('Результаты опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const summary=await visibleSummary(userId,pollId);
  if(!summary||clean(summary.status)!=='active') return {id:'poll_stop_missing',text:['⚠️ Опрос не найден','','Откройте карточку активного опроса из раздела результатов.'].join('\n'),attachments:menu.keyboard([[menu.button('Результаты опросов','poll_status')],[menu.button('🏠 Главное меню','admin_section_main')]])};
  const closed=await pollService.closePoll({pollId:summary.pollId,channelId:summary.channelId,postId:summary.postId,commentKey:summary.commentKey});
  if(closed&&closed.ok){try{await patchPostWithPoll({config,commentKey:summary.commentKey,pollId:summary.pollId,userId});}catch{}}
  return {id:closed&&closed.ok?'poll_stopped':'poll_stop_missing',text:[closed&&closed.ok?'✅ Опрос остановлен':'⚠️ Опрос не остановлен','','Вопрос: '+sh(summary.question,180),'','Результаты сохранены.'].join('\n'),attachments:menu.keyboard([[menu.button('📊 Результаты','poll_results',{pollId:summary.pollId})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
module.exports={RUNTIME,home,picker,picked,customStart,createPoll,handleTextInput,vote,statusScreen,resultsScreen,stopPoll,patchPostWithPoll};
