'use strict';

const base = require('./poll-flow-15312');
const db = require('./cc5-db-core');
const pollService = require('./services/pollService');

const RUNTIME = 'ADMINKIT-POLL-FLOW-1.3-SMART-OPTIONS';
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function rawText(v){return String(v||'').replace(/\r\n?/g,'\n').trim();}
function sh(v,n=180){const s=clean(v);return s.length<=n?s:s.slice(0,n-1).trim()+'…';}
async function getFlow(userId){try{return await db.getFlow(String(userId||''));}catch{return null;}}
async function setFlow(userId,flow){try{await db.setFlow(String(userId||''),flow);}catch{}}
function optionLines(options){return (Array.isArray(options)?options:[]).map((o,i)=>`${i+1}. ${clean(o&&o.text||o)}`).join('\n');}
function reviewScreen(menu,flow){
  const commentKey=clean(flow.commentKey);
  return {id:'poll_custom_review',text:['✍️ Свой опрос — шаг 3 из 3','','Проверьте перед публикацией.','','Вопрос: '+sh(flow.question,220),'','Ответы:',optionLines(flow.options),'','Нажмите «Создать опрос», чтобы завершить процесс.'].join('\n'),attachments:menu.keyboard([[menu.button('✅ Создать опрос','poll_custom_run',{commentKey})],[menu.button('✏️ Изменить вопрос','poll_custom_edit_question',{commentKey})],[menu.button('✏️ Изменить ответы','poll_custom_edit_options',{commentKey})],[menu.button('🚫 Отмена','poll_custom_cancel',{commentKey})]])};
}
function optionsError(menu,key){return {id:'poll_custom_options_error',text:['⚠️ Нужно от 2 до 4 вариантов.','','Шаг 2 из 3: напишите каждый ответ с новой строки. Если MAX склеит строки, короткие варианты можно писать через запятую или точку с запятой.','','Пример:','Да','Нет'].join('\n'),attachments:menu.keyboard([[menu.button('⬅️ Назад к вопросу','poll_custom_edit_question',{commentKey:key})],[menu.button('🚫 Отмена','poll_custom_cancel',{commentKey:key})]])};}
function splitOptionsSmart(raw){
  const text=rawText(raw);
  let opts=pollService.parseOptionsText(text);
  if(opts.length>=2&&opts.length<=4)return opts;
  const commaParts=text.split(/[,;|]+/).map(x=>x.trim()).filter(Boolean);
  if(commaParts.length>=2&&commaParts.length<=4)return pollService.normalizeOptions(commaParts);
  const words=clean(text).split(/\s+/).filter(Boolean);
  if(words.length>=2&&words.length<=4&&words.every(w=>w.length<=24))return pollService.normalizeOptions(words);
  return opts;
}
async function handleTextInput(menu,{config,userId='',text=''}={}){
  const flow=await getFlow(userId);
  if(!flow||flow.type!=='poll_custom')return null;
  if(flow.step!=='options')return base.handleTextInput(menu,{config,userId,text});
  const key=clean(flow.commentKey);
  const options=splitOptionsSmart(text);
  if(options.length<2||options.length>4)return optionsError(menu,key);
  const next={...flow,step:'review',options,updatedAt:Date.now()};
  await setFlow(userId,next);
  return reviewScreen(menu,next);
}
module.exports={...base,RUNTIME,handleTextInput};
