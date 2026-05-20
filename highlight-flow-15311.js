'use strict';

const store = require('./store');
const max = require('./services/maxApi');
const pollService = require('./services/pollService');
const { buildCustomKeyboardRows } = require('./services/keyboardBuilderService');
const { findGiftCampaignForPost } = require('./services/giftService');
const highlightTrace = require('./highlight-debug-trace');

const RUNTIME = 'ADMINKIT-HIGHLIGHT-FLOW-1.1-TEXT-MARK-NO-BUTTON';

const BADGES = [
  { id: 'important', label: '⭐ Важно' },
  { id: 'new', label: '🆕 Новое' },
  { id: 'gift', label: '🎁 Подарок' },
  { id: 'promo', label: '🔥 Акция' }
];

function clean(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
function sh(v,n=90){ const s=clean(v || 'Пост'); return s.length<=n ? s : s.slice(0,n-1).trim()+'…'; }
function clone(v,fallback=null){ try { return JSON.parse(JSON.stringify(v ?? fallback)); } catch { return fallback; } }
function stripKeyboard(arr){ return Array.isArray(arr) ? clone(arr,[]).filter(x => x && x.type !== 'inline_keyboard') : []; }
function postByKey(commentKey){ try { return store.getPost(commentKey) || null; } catch { return null; } }
function postTitle(post,key){ return sh((post && (post.originalText || post.postText || post.title || post.postId)) || key || 'Пост', 120); }
function badgeById(id){ return BADGES.find(x => x.id === clean(id)) || BADGES[0]; }
function baseText(post){ return String(post && (post.originalText || post.postText || '') || ''); }
function highlightText(post){
  const txt = baseText(post);
  const h = post && post.highlight && post.highlight.enabled ? post.highlight : null;
  if(!h) return txt;
  const label = clean(h.label) || clean(badgeById(h.badgeId).label);
  // Выделение — это визуальная метка в тексте/подписи поста, а не кнопка.
  // Поэтому у пользователя нет ложного ожидания перехода, а пост нельзя заменить нажатием на бейдж.
  return label + (txt ? '\n\n' + txt : '');
}
function highlightRow(){ return []; }

function postRows(menu, source='highlights'){
  let posts=[];
  try{
    const seen={};
    posts=store.getPostsList().filter(p=>{
      const k=clean(p && (p.commentKey || ((p.channelId||'')+':'+(p.postId||p.messageId||''))));
      if(!k || seen[k]) return false;
      seen[k]=1;
      return true;
    }).slice(0,8);
  }catch(e){ highlightTrace.add('picker_store_error',{error:String(e&&e.message||e)}); }
  const rows=posts.map((p,i)=>[menu.button((i+1)+'. '+sh(p.originalText||p.postText||p.postId,54),'comments_pick_post',{source,commentKey:clean(p.commentKey)})]);
  if(!rows.length) rows.push([menu.button('Пока нет постов','admin_section_highlights')]);
  rows.push([menu.button('⭐ В начало выделения','admin_section_highlights')]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return { posts, rows };
}

function home(menu){
  highlightTrace.add('screen_home',{});
  return { id:'highlights_home', text:['⭐ Выделение постов','','Выберите пост и назначьте ему метку: важно, новое, подарок или акция.','','Метка добавляется в начало текста/подписи поста, а не отдельной кнопкой. Так пользователь не принимает выделение за переход или CTA.'].join('\n'), attachments:menu.keyboard([[menu.button('📌 Выбрать пост для выделения','comments_select_post',{source:'highlights'})],[menu.button('🧪 Статус выделения','highlight_status')],[menu.button('🏠 Главное меню','admin_section_main')]]) };
}

function picker(menu){
  const { posts, rows } = postRows(menu,'highlights');
  highlightTrace.add('screen_picker',{posts:posts.length});
  return { id:'highlights_picker', text:['⭐ Выделение постов','',posts.length?'Выберите пост из последних сохранённых постов.':'Пока нет постов в памяти бота. Перешлите нужную публикацию боту.','','Этот выбор относится к разделу «Выделение постов» и не должен уводить в комментарии.'].join('\n'), attachments:menu.keyboard(rows) };
}

function picked(menu,commentKey){
  const post=postByKey(commentKey);
  const current=post && post.highlight && post.highlight.enabled ? clean(post.highlight.label) : '';
  highlightTrace.add('screen_picked',{commentKey:highlightTrace.mask(commentKey),postFound:!!post,current:!!current});
  if(!post) return { id:'highlight_post_missing', text:['⚠️ Пост не найден','','Нужно выбрать пост из сохранённых.'].join('\n'), attachments:menu.keyboard([[menu.button('📌 Выбрать пост','comments_select_post',{source:'highlights'})],[menu.button('🏠 Главное меню','admin_section_main')]]) };
  const rows = BADGES.map(b => [menu.button(b.label,'highlight_apply',{commentKey,badgeId:b.id})]);
  if(current) rows.unshift([menu.button('🧹 Снять выделение','highlight_remove',{commentKey})]);
  rows.push([menu.button('📌 Выбрать другой пост','comments_select_post',{source:'highlights'})]);
  rows.push([menu.button('🏠 Главное меню','admin_section_main')]);
  return { id:'highlight_picked', text:['⭐ Выделение поста','','Пост: '+postTitle(post,commentKey),'',current?'Сейчас выделен: '+current:'Сейчас выделение не назначено.','','Выберите метку. Она появится в начале текста/подписи поста, не как кнопка.'].join('\n'), attachments:menu.keyboard(rows) };
}

async function patchPostWithHighlight({ config, commentKey }){
  const post=postByKey(commentKey);
  if(!post || !post.messageId) return { ok:false, error:'post_or_message_missing' };
  const commentCount=(store.getComments(commentKey)||[]).length;
  const originalAttachments=stripKeyboard(post.sourceAttachments || post.attachments || []);
  const giftCampaign=findGiftCampaignForPost({channelId:post.channelId,postId:post.postId});
  const giftRows=giftCampaign ? max.buildGiftKeyboardRows({campaign:giftCampaign,commentKey,channelId:post.channelId,postId:post.postId}) : [];
  const customRows=buildCustomKeyboardRows({builder:post.customKeyboard||{},appBaseUrl:config.appBaseUrl,channelId:post.channelId,postId:post.postId,commentKey});
  const pollRows=await pollService.buildPollKeyboardRows({channelId:post.channelId,postId:post.postId,commentKey});
  const hRows=highlightRow(post,commentKey);
  const keyboard=max.buildCommentsKeyboard({
    appBaseUrl:config.appBaseUrl,botUsername:config.botUsername,maxDeepLinkBase:config.maxDeepLinkBase,
    handoffToken:post.handoffToken,postId:post.postId,channelId:post.channelId,commentKey,messageId:post.messageId||post.postId,
    count:commentCount,extraRows:[...customRows,...hRows,...pollRows,...giftRows],primaryButtonText:clean(post.customKeyboard&&post.customKeyboard.commentButtonText),showPrimaryButton:!Boolean(post.commentsDisabled)
  });
  const payload={botToken:config.botToken,messageId:post.messageId,attachments:[...originalAttachments,...keyboard],notify:false};
  payload.text = highlightText(post);
  if(post.originalLink) payload.link=clone(post.originalLink,null);
  if(post.originalFormat!==undefined && post.originalFormat!==null) payload.format=post.originalFormat;
  const result=await max.editMessage(payload);
  store.savePost(commentKey,{lastHighlightPatchAt:Date.now(),lastHighlightPatchError:null,lastHighlightPatchMode:'text_mark_no_button'});
  return { ok:true, result, highlightRows:hRows.length, pollRows:pollRows.length, mode:'text_mark_no_button' };
}

async function apply(menu,{config,commentKey='',badgeId='important'}={}){
  const post=postByKey(commentKey);
  const badge=badgeById(badgeId);
  highlightTrace.add('apply_start',{commentKey:highlightTrace.mask(commentKey),badgeId:badge.id,postFound:!!post,mode:'text_mark_no_button'});
  if(!post) return picked(menu,commentKey);
  store.savePost(commentKey,{highlight:{enabled:true,badgeId:badge.id,label:badge.label,updatedAt:Date.now(),mode:'text_mark_no_button'}});
  let patched={ok:false};
  try{patched=await patchPostWithHighlight({config,commentKey});}catch(e){patched={ok:false,error:String(e&&e.message||e),status:e&&e.status};}
  highlightTrace.add('apply_result',{ok:!!patched.ok,commentKey:highlightTrace.mask(commentKey),badgeId:badge.id,mode:'text_mark_no_button',patchError:patched.error||'',status:patched.status||''});
  const lines=['✅ Выделение применено','','Пост: '+postTitle(post,commentKey),'Метка: '+badge.label];
  if(patched.ok) lines.push('','Метка добавлена в начало текста/подписи поста. Отдельной кнопки под постом больше нет.'); else lines.push('','Выделение сохранено, но пост пока не обновился: '+String(patched.error||'patch_failed'));
  return { id:'highlight_applied', text:lines.join('\n'), attachments:menu.keyboard([[menu.button('⭐ К посту','comments_pick_post',{source:'highlights',commentKey})],[menu.button('📌 Выбрать другой пост','comments_select_post',{source:'highlights'})],[menu.button('🏠 Главное меню','admin_section_main')]]) };
}

async function remove(menu,{config,commentKey=''}={}){
  const post=postByKey(commentKey);
  highlightTrace.add('remove_start',{commentKey:highlightTrace.mask(commentKey),postFound:!!post,mode:'text_mark_no_button'});
  if(!post) return picked(menu,commentKey);
  store.savePost(commentKey,{highlight:{enabled:false,updatedAt:Date.now(),mode:'text_mark_no_button'}});
  let patched={ok:false};
  try{patched=await patchPostWithHighlight({config,commentKey});}catch(e){patched={ok:false,error:String(e&&e.message||e),status:e&&e.status};}
  highlightTrace.add('remove_result',{ok:!!patched.ok,commentKey:highlightTrace.mask(commentKey),mode:'text_mark_no_button',patchError:patched.error||'',status:patched.status||''});
  return { id:'highlight_removed', text:['🧹 Выделение снято','','Пост: '+postTitle(post,commentKey),patched.ok?'Метка убрана из текста/подписи поста.':'Снятие сохранено, но пост пока не обновился: '+String(patched.error||'patch_failed')].join('\n'), attachments:menu.keyboard([[menu.button('⭐ К посту','comments_pick_post',{source:'highlights',commentKey})],[menu.button('🏠 Главное меню','admin_section_main')]]) };
}

function info(menu,{commentKey=''}={}){
  const post=postByKey(commentKey);
  const label=post && post.highlight && post.highlight.enabled ? clean(post.highlight.label) : 'Выделенный пост';
  highlightTrace.add('info_click_legacy_ack_only',{commentKey:highlightTrace.mask(commentKey),postFound:!!post,label});
  return { id:'highlight_info', text:['⭐ '+label,'','Legacy: кнопочный бейдж больше не используется.'].join('\n'), attachments:menu.keyboard([[menu.button('🏠 Главное меню','admin_section_main')]]) };
}

function statusScreen(menu){
  let posts=[];
  try{posts=store.getPostsList().filter(p=>p && p.highlight && p.highlight.enabled);}catch{}
  highlightTrace.add('status',{highlighted:posts.length,mode:'text_mark_no_button'});
  return { id:'highlight_status', text:['🧪 Статус выделения','','Выделенных постов в памяти/store: '+posts.length,'Режим: метка в тексте/подписи, без кнопки под постом.','Trace: последние 6 действий всегда доступны через /debug/highlight-trace.'].join('\n'), attachments:menu.keyboard([[menu.button('📌 Выбрать пост для выделения','comments_select_post',{source:'highlights'})],[menu.button('🏠 Главное меню','admin_section_main')]]) };
}

function simulate(step='full'){
  const sample={commentKey:'-73175958664622:116605994182147040',channelId:'-73175958664622',postId:'116605994182147040',messageId:'mid_sample',title:'Тестовый пост для выделения'};
  const screens={
    home:{id:'highlights_home',action:'admin_section_highlights',next:'picker'},
    picker:{id:'highlights_picker',action:'comments_select_post',source:'highlights',next:'picked'},
    picked:{id:'highlight_picked',action:'comments_pick_post',source:'highlights',commentKey:sample.commentKey,next:'apply'},
    apply:{id:'highlight_applied',action:'highlight_apply',commentKey:sample.commentKey,badgeId:'important',mode:'text_mark_no_button',next:'verify'},
    remove:{id:'highlight_removed',action:'highlight_remove',commentKey:sample.commentKey,mode:'text_mark_no_button',next:'verify'},
    verify:{id:'highlight_trace',url:'/debug/highlight-trace',expected:['webhook_in','callback_received','apply_start','apply_result']}
  };
  highlightTrace.add('simulate',{step,mode:'text_mark_no_button'});
  if(step && step!=='full') return {ok:true,runtimeVersion:RUNTIME,mode:'highlight-simulate-step',step,screen:screens[step]||null,sample,safe:true,noMaxApiCall:true};
  return {ok:true,runtimeVersion:RUNTIME,mode:'highlight-simulate-full-text-mark-no-button',algorithm:[screens.home,screens.picker,screens.picked,screens.apply,screens.verify],sample,links:{trace:'/debug/highlight-trace',clearTrace:'/debug/highlight-trace/clear',home:'/debug/highlights/simulate/home',picker:'/debug/highlights/simulate/picker',picked:'/debug/highlights/simulate/picked',apply:'/debug/highlights/simulate/apply',remove:'/debug/highlights/simulate/remove'},safe:true,noMaxApiCall:true};
}

module.exports={RUNTIME,BADGES,home,picker,picked,apply,remove,info,statusScreen,patchPostWithHighlight,simulate};
