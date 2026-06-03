'use strict';

const base = require('./poll-flow-15311');
const db = require('./cc5-db-core');
const store = require('./store');
const pollService = require('./services/pollService');
const tenant = require('./tenant-scope');
const access = require('./services/clientAccessService');

const RUNTIME = 'ADMINKIT-POLL-FLOW-1.2-STEPS-BACK-FINISH';
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function rawText(v){return String(v||'').replace(/\r\n?/g,'\n').trim();}
function sh(v,n=90){const s=clean(v||'Пост');return s.length<=n?s:s.slice(0,n-1).trim()+'…';}
function channelAllowed(post={},userId=''){const id=clean(post&&post.channelId);if(!id||!clean(userId))return false;try{return (access.getClientChannels(userId)||[]).some(ch=>clean(ch.channelId||ch.id)===id);}catch{return false;}}
function postByKey(key,userId=''){try{const post=store.getPost(key)||null;if(!post)return null;if(!clean(userId))return post;const ctx=tenant.ensureTenantContext(userId);return channelAllowed(post,userId)||tenant.belongsToTenant(post,{...ctx,canReadLegacyUnscoped:false})?post:null;}catch{return null;}}
function postTitle(post,key){return sh((post&&(post.originalText||post.postText||post.title||post.postId))||key||'Пост',120);}
async function setFlow(userId,flow){try{await db.setFlow(String(userId||''),flow);}catch{}}
async function getFlow(userId){try{return await db.getFlow(String(userId||''));}catch{return null;}}
async function clearFlow(userId){try{await db.clearFlow(String(userId||''));}catch{}}
function optionLines(options){return (Array.isArray(options)?options:[]).map((o,i)=>`${i+1}. ${clean(o&&o.text||o)}`).join('\n');}

function questionScreen(menu,commentKey,question='',userId=''){
  const post=postByKey(commentKey,userId);
  const lines=['✍️ Свой опрос — шаг 1 из 3','','Пост: '+postTitle(post,commentKey),'','Напишите одним сообщением вопрос опроса.'];
  if(question) lines.push('','Текущий вопрос: '+sh(question,180));
  lines.push('','Пример:','Какой формат разобрать завтра?');
  return {id:'poll_custom_question',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('⬅️ Назад к выбору типа','poll_custom_cancel',{commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function optionsScreen(menu,commentKey,question,options=[]){
  const lines=['✍️ Свой опрос — шаг 2 из 3','','Вопрос: '+sh(question,180),'','Напишите от 2 до 4 ответов. Каждый ответ — с новой строки.','','Пример:','Да','Нет','','Короткие ответы автоматически встанут по две кнопки в ряд.'];
  if(options&&options.length) lines.push('','Текущие ответы:',optionLines(options));
  return {id:'poll_custom_options',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('⬅️ Назад к вопросу','poll_custom_edit_question',{commentKey})],[menu.button('🚫 Отмена','poll_custom_cancel',{commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}
function reviewScreen(menu,flow){
  const commentKey=clean(flow.commentKey);
  return {id:'poll_custom_review',text:['✍️ Свой опрос — шаг 3 из 3','','Проверьте перед публикацией.','','Вопрос: '+sh(flow.question,220),'','Ответы:',optionLines(flow.options),'','После подтверждения кнопки опроса будут добавлены под выбранным постом.'].join('\n'),attachments:menu.keyboard([[menu.button('✅ Создать опрос','poll_custom_run',{commentKey})],[menu.button('✏️ Изменить вопрос','poll_custom_edit_question',{commentKey})],[menu.button('✏️ Изменить ответы','poll_custom_edit_options',{commentKey})],[menu.button('🚫 Отмена','poll_custom_cancel',{commentKey})]])};
}
async function customStart(menu,{userId='',commentKey=''}={}){
  if(!postByKey(commentKey,userId)) return {id:'poll_error',text:['⚠️ Пост не найден','','Нужно выбрать пост из сохранённых.'].join('\n'),attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  await setFlow(userId,{type:'poll_custom',step:'question',commentKey,startedAt:Date.now()});
  return questionScreen(menu,commentKey,'',userId);
}
async function customCancel(menu,{userId='',commentKey=''}={}){await clearFlow(userId);return base.picked(menu,commentKey,userId);}
async function customEditQuestion(menu,{userId='',commentKey=''}={}){
  const flow=await getFlow(userId)||{};const key=commentKey||flow.commentKey||'';
  await setFlow(userId,{...flow,type:'poll_custom',step:'question',commentKey:key,updatedAt:Date.now()});
  return questionScreen(menu,key,flow.question||'',userId);
}
async function customEditOptions(menu,{userId='',commentKey=''}={}){
  const flow=await getFlow(userId)||{};const key=commentKey||flow.commentKey||'';
  if(!flow.question)return customEditQuestion(menu,{userId,commentKey:key});
  await setFlow(userId,{...flow,type:'poll_custom',step:'options',commentKey:key,updatedAt:Date.now()});
  return optionsScreen(menu,key,flow.question,flow.options||[]);
}
async function handleTextInput(menu,{config,userId='',text=''}={}){
  const flow=await getFlow(userId);if(!flow||flow.type!=='poll_custom')return null;
  const key=clean(flow.commentKey), raw=rawText(text), value=clean(raw);if(!value)return null;
  if(flow.step==='question'){
    if(value.length<3)return {id:'poll_custom_question_error',text:['⚠️ Вопрос слишком короткий.','','Шаг 1 из 3: напишите вопрос опроса одним сообщением.'].join('\n'),attachments:menu.keyboard([[menu.button('⬅️ Назад к выбору типа','poll_custom_cancel',{commentKey:key})]])};
    await setFlow(userId,{...flow,step:'options',question:value,updatedAt:Date.now()});
    return optionsScreen(menu,key,value,flow.options||[]);
  }
  if(flow.step==='options'){
    const options=pollService.parseOptionsText(raw);
    if(options.length<2||options.length>4)return {id:'poll_custom_options_error',text:['⚠️ Нужно от 2 до 4 вариантов.','','Шаг 2 из 3: напишите каждый ответ с новой строки.','','Пример:','Да','Нет'].join('\n'),attachments:menu.keyboard([[menu.button('⬅️ Назад к вопросу','poll_custom_edit_question',{commentKey:key})],[menu.button('🚫 Отмена','poll_custom_cancel',{commentKey:key})]])};
    const next={...flow,step:'review',options,updatedAt:Date.now()};
    await setFlow(userId,next);return reviewScreen(menu,next);
  }
  if(flow.step==='review')return reviewScreen(menu,flow);
  return null;
}
async function customRun(menu,{config,userId='',commentKey=''}={}){
  const flow=await getFlow(userId);const key=commentKey||clean(flow&&flow.commentKey);
  if(!flow||flow.type!=='poll_custom'||!flow.question||!Array.isArray(flow.options)||flow.options.length<2){return {id:'poll_custom_missing',text:['⚠️ Опрос не готов','','Нужно пройти шаги: вопрос → ответы → подтверждение.'].join('\n'),attachments:menu.keyboard([[menu.button('🗳 В начало опросов','admin_section_polls')]])};}
  const post=postByKey(key,userId);
  if(!post)return {id:'poll_error',text:'⚠️ Пост не найден. Выберите пост заново.',attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'polls'})]])};
  const created=await pollService.createPoll({adminId:userId,channelId:post.channelId,postId:post.postId,commentKey:key,question:flow.question,options:flow.options,template:'custom'});
  if(!created.ok)return {id:'poll_error',text:'⚠️ Не удалось создать опрос: '+String(created.error||'unknown'),attachments:menu.keyboard([[menu.button('✏️ Изменить ответы','poll_custom_edit_options',{commentKey:key})],[menu.button('🏠 Главное меню','admin_section_main')]])};
  await clearFlow(userId);
  let patched={ok:false};try{patched=await base.patchPostWithPoll({config,commentKey:key});}catch(e){patched={ok:false,error:String(e&&e.message||e)};}
  const lines=['✅ Опрос создан','','Шаги завершены.','Вопрос: '+sh(flow.question,180),'Ответов: '+flow.options.length,'Голоса сохраняются в Postgres.'];
  lines.push('',patched.ok?'Кнопки опроса добавлены под постом.':'Опрос создан в базе, но пост пока не пропатчился: '+String(patched.error||'patch_failed'));
  return {id:'poll_created',text:lines.join('\n'),attachments:menu.keyboard([[menu.button('📊 Статус опросов','poll_status')],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'polls'})],[menu.button('🏠 Главное меню','admin_section_main')]])};
}

module.exports={...base,RUNTIME,customStart,customCancel,customEditQuestion,customEditOptions,customRun,handleTextInput};
