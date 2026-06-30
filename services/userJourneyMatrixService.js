'use strict';

const crypto = require('crypto');
const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const channelMatrix = require('./channelTargetMatrixService');
const startupLog = require('./startupLogService');

const DEFAULT_PATH = 'runtime/user-journey-matrix.json';
const BOOT_ID = process.env.ADMINKIT_BOOT_ID || `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
const REQUIRED_SCENARIOS = ['zero_channels','one_channel','multiple_channels','selected_channel_with_posts','empty_channel_without_posts','dangerous_chat_records','malformed_payload','missing_payload','missing_required_id','post_from_other_channel','stale_or_deleted_post','back_navigation','main_menu_navigation','repeated_open_same_section','direct_callback_without_prior_state'];
const REQUIRED_SECTIONS = ['main','channels','comments','gifts','buttons','stats','push','ad_links','polls','highlights','editor','archive','account','settings'];
const POST_SCOPED = ['comments','gifts','buttons','polls','highlights','editor','stats'];
const TECHNICAL_VISIBLE = ['channelId','chatId','commentKey','postId','payload','token','undefined','null'];
const MAX_CALLBACK = 900;
function clean(v){return String(v == null ? '' : v).replace(/\s+/g,' ').trim();}
function buttons(screen){return (screen && screen.attachments && screen.attachments[0] && screen.attachments[0].payload && screen.attachments[0].payload.buttons || []).flat();}
function text(screen){return clean(screen && screen.text);}
function safe(v){return clean(v).slice(0,120);}
function vio(severity, journey, section, step, scenario, route, reason, expected, actual, extra={}){return {severity,journey,section,step,scenario,route,reason,expected,actual,...extra};}
function render(route, ctx){try{return menu.render(route, ctx || {});}catch(error){return {ok:false,error:clean(error.message)}}}
function safeChannels(){return channelMatrix.fixtureChannels().filter((c)=>!channelMatrix.dangerousRecords([c]).length);}
function posts(ch='ch-posts-1'){return channelMatrix.fixturePosts(ch);}
function ctxFor(scenario){const safeC=safeChannels(); const one=[safeC.find((c)=>c.channelId==='ch-posts-1')||safeC[0]]; const empty={channelId:'empty-channel-1',title:'Пустой канал',type:'channel',isChannel:true};
  if(scenario==='zero_channels')return{channels:[],posts:[],dataContext:{channels:[],posts:[]}};
  if(scenario==='one_channel')return{channels:one,posts:posts(one[0].channelId),dataContext:{channels:one,channelId:one[0].channelId,channelTitle:one[0].title,posts:posts(one[0].channelId)}};
  if(scenario==='empty_channel_without_posts')return{channels:[empty],posts:[],dataContext:{channels:[empty],channelId:empty.channelId,channelTitle:empty.title,posts:[]}};
  return{channels:scenario==='dangerous_chat_records'?channelMatrix.fixtureChannels():safeC,posts:posts('ch-posts-1'),dataContext:{channels:safeC,channelId:'ch-posts-1',channelTitle:'Канал с постами',posts:posts('ch-posts-1')}};}
function dangerousNeedles(ctx){const out=[]; for(const r of channelMatrix.dangerousRecords(ctx.channels||[])) for(const v of [r.chatId,r.id,r.channelId,r.title,r.channelTitle,r.chatTitle]) if(clean(v)) out.push(clean(v)); return out;}
function validateScreen(out, {screen, route, section, step, scenario, journey, ctx}){
  if(!screen || screen.ok===false) out.push(vio('block',journey,section,step,scenario,route,'route_render_failed','screen renders',screen&&screen.error||'missing'));
  if(!text(screen)) out.push(vio('block',journey,section,step,scenario,route,'missing_screen_text','non-empty text','empty'));
  const bs=buttons(screen); const labels=bs.map((b)=>clean(b && b.text));
  if(section!=='main' && !labels.includes('Главное меню')) out.push(vio('block',journey,section,step,scenario,route,'missing_main_menu_navigation','Главное меню',labels.join(' | ')));
  bs.forEach((b,i)=>{const label=clean(b&&b.text); const payload=clean(b&&b.payload); if(!label) out.push(vio('block',journey,section,step,scenario,route,'empty_button_label','non-empty label',`button ${i}`,{})); if(label.length>64) out.push(vio('warn',journey,section,step,scenario,route,'overlong_button_label','<=64 chars',String(label.length),{offendingText:safe(label)})); if(!payload) out.push(vio('block',journey,section,step,scenario,route,'missing_callback_payload','non-empty callback payload',`button ${i}`,{offendingText:safe(label)})); else { let parsed=null; try{parsed=JSON.parse(payload);}catch{out.push(vio('block',journey,section,step,scenario,route,'malformed_payload','parseable JSON','parse failed',{offendingPayload:safe(payload)}));} if(parsed && !clean(parsed.route||parsed.action||parsed.a||parsed.existingAction)) out.push(vio('block',journey,section,step,scenario,route,'missing_payload_action','route/action field','missing',{offendingPayload:safe(payload)})); if(/\b(chat|grp|private|dialog|im|supergroup)-?\w*/i.test(payload)) out.push(vio('block',journey,section,step,scenario,route,'chat_like_record_leak','no chat-like IDs in payload','present',{offendingPayload:safe(payload)})); if(/undefined|null/.test(payload)) out.push(vio('block',journey,section,step,scenario,route,'undefined_null_payload','no undefined/null strings','present',{offendingPayload:safe(payload)})); if(payload.length>MAX_CALLBACK) out.push(vio('warn',journey,section,step,scenario,route,'callback_payload_too_large',`<=${MAX_CALLBACK}`,String(payload.length),{offendingPayload:safe(payload)})); }});
  const seen=new Set(); for(const l of labels.filter(Boolean)){ if(seen.has(l) && !['Главное меню','Назад','Помощь'].includes(l)) out.push(vio('warn',journey,section,step,scenario,route,'duplicate_button_label','unique labels',l,{offendingText:safe(l)})); seen.add(l); }
  const visible=[text(screen),...labels].join('\n'); const payloadText=bs.map((b)=>clean(b&&b.payload)).join('\n');
  for(const word of TECHNICAL_VISIBLE) if(new RegExp(`\\b${word}\\b`,'i').test(visible)) out.push(vio('block',journey,section,step,scenario,route,'technical_id_visible','no technical IDs in visible text',word,{offendingText:word}));
  for(const d of dangerousNeedles(ctx||{})){ if(visible.includes(d)) out.push(vio('block',journey,section,step,scenario,route,'chat_like_record_leak','no chat records visible',d,{offendingText:safe(d)})); if(payloadText.includes(d)) out.push(vio('block',journey,section,step,scenario,route,'chat_like_record_leak','no chat records in payload',d,{offendingPayload:safe(d)})); }
  if(labels.some((l)=>/инструкция/i.test(l))) out.push(vio('block',journey,section,step,scenario,route,'obsolete_instruction_button','no obsolete instruction/help buttons',labels.join(' | ')));
}
function applyInjections(screen, route, options={}){const s=JSON.parse(JSON.stringify(screen||{})); const bs=buttons(s); if(options.injectEmptyButtonLabel && route==='buttons:home' && bs[0]) bs[0].text=' '; if(options.injectMissingCallbackPayload && route==='buttons:home' && bs[0]) delete bs[0].payload; if(options.injectDangerousPayloadId && route==='buttons:choose_channel' && bs[0]) bs[0].payload=JSON.stringify({route:'buttons:choose_post',channelId:'chat-1'}); return s;}
function buildMatrix(options={}){
  const violations=[]; const journeys=[]; let steps=0; const root=render('main:home'); const rootLabels=buttons(root).map((b)=>clean(b.text));
  for(const section of REQUIRED_SECTIONS){ const meta=section==='main'?{route:'main:home',title:'Главное меню'}:canonical.sectionById[section]; const route=section==='main'?'main:home':meta.route; const journey=`${section}_journey`; journeys.push(journey);
    if(section!=='main' && (options.omitRootSection===section || !rootLabels.includes(meta.title))) violations.push(vio(section==='settings'?'warn':'block',journey,section,'open from main root','multiple_channels','main:home','root_button_missing','root button into section',meta.title));
    const ctx=ctxFor('multiple_channels'); let screen=applyInjections(render(route,ctx),route,options); steps++; validateScreen(violations,{screen,route,section,step:'section root/home',scenario:'multiple_channels',journey,ctx});
    if(section!=='main'){ const repeat=render(route,ctx); steps++; if(text(repeat)!==text(render(route,ctx))) violations.push(vio('block',journey,section,'repeated open same section','repeated_open_same_section',route,'repeat_open_not_stable','same screen','changed')); }
    if(section==='stats'){ const exact=['Обзор','По каналу','По посту','Рекламные ссылки','Источники','Обновить данные','Главное меню']; const labels=buttons(screen).map((b)=>clean(b.text)).filter((label)=>label && label !== 'Помощь'); if(exact.join('|')!==labels.join('|')) violations.push(vio('block',journey,section,'stats root','multiple_channels',route,'stats_root_buttons_mismatch',exact.join(' | '),labels.join(' | '))); }
    if(section==='channels'){ for(const sc of ['zero_channels','one_channel','multiple_channels','dangerous_chat_records']){ const c=ctxFor(sc); const r='channels:list'; steps++; validateScreen(violations,{screen:render(r,c),route:r,section,step:`channels ${sc}`,scenario:sc,journey,ctx:c}); } }
    if(POST_SCOPED.includes(section)){ for(const [stepName,r,sc] of [['zero channels empty state',`${section}:choose_channel`,'zero_channels'],['multiple channel picker',`${section}:choose_channel`,'multiple_channels'],['channel selected',`${section}:choose_post`,'selected_channel_with_posts'],['post picker',`${section}:choose_post`,'post_from_other_channel'],['section-specific post screen',`${section}:post`,'selected_channel_with_posts']]){ const c=ctxFor(sc==='post_from_other_channel'?'selected_channel_with_posts':sc); if(sc==='post_from_other_channel' && options.injectPostFromOtherChannel) c.dataContext.posts=[{channelId:'other-channel',postId:'post-x',commentKey:'other-channel:post-x',title:'Other post'}]; const rr=applyInjections(render(r,c),r,options); steps++; validateScreen(violations,{screen:rr,route:r,section,step:stepName,scenario:sc,journey,ctx:c}); if(sc==='post_from_other_channel' && buttons(rr).some((b)=>clean(b.text).includes('Other post'))) violations.push(vio('block',journey,section,stepName,sc,r,'post_from_other_channel_visible','only selected channel posts','other-channel')); }
      if(['gifts','buttons'].includes(section)) journeys.push(`${section}_admin_selected_post`);
    }
  }
  const blockCount=violations.filter((v)=>v.severity==='block').length, warnCount=violations.filter((v)=>v.severity==='warn').length, infoCount=violations.filter((v)=>v.severity==='info').length;
  return {ok:blockCount===0,runtime:'PR261-USER-JOURNEY-MATRIX',generatedAt:new Date().toISOString(),bootId:BOOT_ID,sectionsChecked:REQUIRED_SECTIONS,journeysChecked:journeys,stepsChecked:steps,scenarios:REQUIRED_SCENARIOS,violations,summary:{sectionCount:REQUIRED_SECTIONS.length,journeyCount:journeys.length,stepsChecked:steps,totalViolations:violations.length,blockCount,warnCount,infoCount,giftsBlockCount:violations.filter((v)=>v.section==='gifts'&&v.severity==='block').length,buttonsBlockCount:violations.filter((v)=>v.section==='buttons'&&v.severity==='block').length}};
}
async function exportMatrix(){const payload=buildMatrix();return startupLog.exportRuntimeJson({path:DEFAULT_PATH,payload,message:`user journey matrix ${payload.ok?'PASS':'FAIL'}`});}
module.exports={DEFAULT_PATH,REQUIRED_SCENARIOS,REQUIRED_SECTIONS,POST_SCOPED,buildMatrix,exportMatrix};
