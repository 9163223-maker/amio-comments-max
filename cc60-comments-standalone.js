'use strict';

const RUNTIME = 'CC6.1';
const SOURCE = 'adminkit-CC6.1-comments-clean-boot-ui-preserved';
const express = require('express');

function noCache(res){
  try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}
}
function esc(v){return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(v){return String(v || '').replace(/\s+/g, ' ').trim();}
function clean(v){return norm(v).replace(/^ck:/i,'').replace(/^post:/i,'').replace(/^:+/,'').replace(/^['\"]+|['\"]+$/g,'');}
function splitKey(v){
  const key = clean(v);
  const i = key.indexOf(':');
  return i > 0 ? { commentKey:key, channelId:key.slice(0,i), postId:key.slice(i+1) } : { commentKey:key, channelId:'', postId:'' };
}
function handoffKey(v){
  const raw = norm(v).replace(/^handoff[:=_-]?/i,'').replace(/^h_+/i,'').replace(/[^A-Za-z0-9_-]/g,'');
  return raw ? `h_${raw}` : '';
}
function parseStartParam(req){
  const q = req.query || {};
  return clean(q.commentKey || q.startapp || q.start_param || q.WebAppStartParam || q.handoff || q.postId || '');
}
async function resolveScope(input = {}){
  const direct = splitKey(input.commentKey || input.key || '');
  if (direct.channelId && direct.postId) return { ok:true, ...direct, title:norm(input.title || 'Пост'), source:'direct' };
  const token = handoffKey(input.handoff || input.handoffToken || input.commentKey || input.key || '');
  if (!token) return { ok:false, reason:'empty_scope', commentKey:'', channelId:'', postId:'', title:norm(input.title || 'Пост'), source:'empty' };
  try{
    const store = require('./store');
    let hand = store.getHandoff?.(token) || store.store?.handoffs?.[token] || null;
    let post = null;
    if (!hand && store.findPostByAnyId) post = store.findPostByAnyId(token) || null;
    if (hand?.commentKey && store.getPost) post = store.getPost(hand.commentKey) || post;
    const fromKey = splitKey(hand?.commentKey || post?.commentKey || '');
    const channelId = norm(fromKey.channelId || hand?.channelId || post?.channelId || '');
    const postId = norm(fromKey.postId || hand?.postId || hand?.messageId || post?.postId || post?.messageId || '');
    const commentKey = clean(fromKey.commentKey || (channelId && postId ? `${channelId}:${postId}` : token));
    const title = norm(post?.originalText || post?.text || post?.caption || post?.title || hand?.title || hand?.originalText || input.title || 'Пост').slice(0,160);
    return { ok:true, commentKey, channelId, postId, title, handoff:token, hasHandoff:!!hand, hasPost:!!post, source:(channelId&&postId?'handoff_resolved':'handoff_local') };
  }catch(e){
    return { ok:false, reason:'resolve_store_error', error:e?.message||String(e), commentKey:token, channelId:'', postId:'', title:norm(input.title||'Пост'), source:'handoff_local' };
  }
}
function getStoreComments(key){
  try { return require('./store').getComments(key) || []; } catch { return []; }
}
function addStoreComment(key, item){
  try { return require('./store').addComment(key, item); } catch { return { id:`local_${Date.now()}`, createdAt:Date.now(), ...item }; }
}
async function registerDbBackground(scope, url){
  if (!scope || !scope.channelId || !scope.postId || !String(scope.commentKey||'').includes(':')) return { ok:false, registered:0, reason:'scope_not_db_ready', scope };
  try{
    const out = await require('./cc54-public-post-register').registerPublicPost({
      channelId: scope.channelId,
      postId: scope.postId,
      commentKey: scope.commentKey,
      title: scope.title || 'Пост',
      url: url || ''
    });
    return { ok:!!out.ok, registered:Number(out.registered || 0), scope, result:out };
  }catch(e){
    return { ok:false, registered:0, reason:'register_throw', error:e?.message||String(e), scope };
  }
}
function shellHtml(req){
  const start = parseStartParam(req);
  const title = norm(req.query?.title || req.query?.postTitle || 'Пост');
  const initialKey = clean(start || req.query?.commentKey || 'local');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#eaf5ff"><title>Комментарии</title>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111827;background:#eaf4ff}body{overflow:hidden;-webkit-user-select:none;user-select:none}.app{position:relative;height:100vh;height:100dvh;display:flex;flex-direction:column;background:linear-gradient(160deg,#f8fcff 0%,#eaf4ff 40%,#dcebff 100%)}.top{flex:0 0 auto;padding:20px 18px 6px}.nav{display:grid;grid-template-columns:56px 1fr 56px;gap:14px;align-items:center}.round{width:56px;height:56px;border-radius:50%;border:0;background:rgba(255,255,255,.88);display:grid;place-items:center;color:#0f172a;box-shadow:0 10px 30px rgba(31,93,160,.05);font-weight:800}.round.back{font-size:38px;line-height:1}.round.search{font-size:30px;line-height:1}.count{height:56px;border-radius:32px;background:rgba(255,255,255,.88);display:grid;place-items:center;font-size:22px;font-weight:900;letter-spacing:-.02em;color:#101827;box-shadow:0 10px 30px rgba(31,93,160,.05)}.post{margin-top:15px;border-radius:26px;background:rgba(255,255,255,.72);padding:17px 20px;font-size:24px;line-height:1.18;color:#5c6c80;min-height:62px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.chips{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:16px}.chip{border-radius:999px;background:rgba(255,255,255,.52);padding:10px 16px;font-size:18px;color:#60748f;font-weight:800;line-height:1;box-shadow:0 8px 24px rgba(31,93,160,.035)}.brand{color:#2f7ccb}.list{flex:1 1 auto;overflow:auto;padding:14px 18px 112px;-webkit-overflow-scrolling:touch}.empty{text-align:center;color:#7589a4;font-size:24px;line-height:1.25;padding-top:42px}.row{display:flex;margin:8px 0 10px}.row.mine{justify-content:flex-end}.bubble{max-width:72%;min-width:96px;border-radius:20px 20px 20px 7px;background:rgba(255,255,255,.9);padding:12px 14px 8px;box-shadow:0 8px 24px rgba(31,93,160,.045);font-size:20px;line-height:1.24;color:#182233;overflow:hidden}.mine .bubble{border-radius:20px 20px 7px 20px;background:#dff2ff}.bubble-line{display:flex;align-items:flex-end;gap:10px}.bubble-text{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}.bubble-time{flex:0 0 auto;font-size:13px;color:#7790a9;line-height:1.1;transform:translateY(-1px)}.bar{position:fixed;left:0;right:0;bottom:0;padding:10px max(12px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-right));display:grid;grid-template-columns:54px 42px 1fr 58px;gap:8px;align-items:center;background:linear-gradient(180deg,rgba(234,244,255,0),rgba(234,244,255,.98) 35%)}.clip,.send{height:54px;border:0;border-radius:50%;font-size:28px;display:grid;place-items:center}.clip{background:rgba(255,255,255,.96);color:#5b6f86}.send{height:58px;background:#3493ff;color:#fff;font-size:34px;font-weight:900;box-shadow:0 10px 26px rgba(52,147,255,.25)}.avatar{width:42px;height:42px;border-radius:50%;overflow:hidden;background:#fff;display:grid;place-items:center;align-self:center;box-shadow:0 4px 14px rgba(31,93,160,.12)}.avatar img{width:100%;height:100%;object-fit:cover;display:none}.avatar .fallback{font-size:18px;font-weight:800;color:#2f7ccb}.input{height:54px;border:0;border-radius:28px;background:rgba(255,255,255,.96);padding:0 18px;font-size:21px;outline:none;color:#162235;-webkit-user-select:text;user-select:text;min-width:0}.input::placeholder{color:#9aa8b8}.debug{position:fixed;left:6px;top:6px;font-size:9px;color:transparent;pointer-events:none}@media(max-width:360px){.top{padding-left:14px;padding-right:14px}.nav{grid-template-columns:52px 1fr 52px;gap:10px}.round{width:52px;height:52px}.count{font-size:20px}.post{font-size:22px}.chip{font-size:16px}.bar{grid-template-columns:50px 38px 1fr 54px}.avatar{width:38px;height:38px}.bubble{font-size:19px}}
</style></head><body><div class="app"><div class="debug">CC6.1</div><div class="top"><div class="nav"><button class="round back" id="back" aria-label="Назад">‹</button><div class="count" id="count">0 комментариев</div><button class="round search" id="search" aria-label="Поиск">⌕</button></div><div class="post" id="title">${esc(title)}</div><div class="chips"><div class="chip">Начало обсуждения</div><div class="chip brand">🐋 АдминКИТ</div></div></div><main class="list" id="list"><div class="empty">Комментарии загружаются…</div></main><form class="bar" id="form"><button class="clip" type="button" aria-label="Прикрепить">📎</button><div class="avatar"><img id="avatarImg" alt=""><div class="fallback" id="avatarFallback">Я</div></div><input class="input" id="input" autocomplete="off" placeholder="Комментарий"><button class="send" type="submit" aria-label="Отправить">›</button></form></div>
<script>
(() => {
  const R='CC6.1'; const START=${JSON.stringify(initialKey)}; const TITLE=${JSON.stringify(title)}; const t0=Date.now();
  const $=id=>document.getElementById(id); const list=$('list'), input=$('input'), count=$('count'), titleEl=$('title'), avatarImg=$('avatarImg'), avatarFallback=$('avatarFallback');
  const state={key:'',title:TITLE||'Пост',scope:{},comments:[]};
  function text(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function plural(n){n=Math.abs(Number(n)||0)%100;const n1=n%10;if(n>10&&n<20)return'комментариев';if(n1>1&&n1<5)return'комментария';if(n1===1)return'комментарий';return'комментариев';}
  function getApps(){return [window.WebApp,window.Telegram?.WebApp,window.Max?.WebApp,window.MAX?.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max?.WebApp].filter(Boolean)}
  function initBridge(){for(const app of getApps()){try{app.ready?.()}catch{} try{app.expand?.()}catch{} try{app.disableClosingConfirmation?.()}catch{} const u=app?.initDataUnsafe?.user||app?.user; if(u){if(u.photo_url){avatarImg.src=u.photo_url;avatarImg.style.display='block';avatarFallback.style.display='none'} else {avatarFallback.textContent=String(u.first_name||u.username||'Я').slice(0,1).toUpperCase()||'Я'} break;}}}
  function qs(){const u=new URL(location.href); const h=new URLSearchParams((location.hash||'').replace(/^#/,'')); const key=u.searchParams.get('commentKey')||u.searchParams.get('WebAppStartParam')||u.searchParams.get('start_param')||u.searchParams.get('handoff')||h.get('start_param')||START||'local'; const title=u.searchParams.get('title')||u.searchParams.get('postTitle')||TITLE||'Пост'; return {key,title};}
  function event(type,payload={}){const body=JSON.stringify({eventType:type,payload:{...payload,runtime:R,ts:Date.now(),key:state.key}});try{navigator.sendBeacon&&navigator.sendBeacon('/api/cc55/client-event',new Blob([body],{type:'application/json'}))}catch{} }
  function render(items){state.comments=Array.isArray(items)?items:[]; list.innerHTML=''; const n=state.comments.length; count.textContent=n+' '+plural(n); if(!n){list.innerHTML='<div class="empty">Комментариев пока нет</div>';return;} state.comments.forEach(c=>{const row=document.createElement('div');row.className='row '+(c.mine?'mine':'');const time=new Date(c.createdAt||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});row.innerHTML='<div class="bubble"><div class="bubble-line"><div class="bubble-text">'+text(c.text)+'</div><div class="bubble-time">'+text(time)+'</div></div></div>';list.appendChild(row)}); requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});}
  async function load(){event('cc61_shell_visible',{ok:true,ms:Date.now()-t0}); try{const r=await fetch('/api/cc60/comments?key='+encodeURIComponent(state.key)+'&title='+encodeURIComponent(state.title||''),{cache:'no-store'}); const d=await r.json(); state.scope=d.scope||{}; if(d.scope&&d.scope.title&&d.scope.title!=='Пост') {state.title=d.scope.title; titleEl.textContent=d.scope.title;} render(d.comments||[]); event('cc61_comments_loaded',{ok:true,ms:Date.now()-t0,count:(d.comments||[]).length,scope:state.scope}); setTimeout(registerBg,900);}catch(e){render([]);event('cc61_comments_loaded',{ok:false,error:String(e&&e.message?e.message:e),ms:Date.now()-t0});}}
  async function registerBg(){try{await fetch('/api/cc60/register-bg',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',keepalive:true,body:JSON.stringify({key:state.key,title:state.title,url:location.href})});}catch{}}
  $('form').addEventListener('submit',async e=>{e.preventDefault(); const val=input.value.trim(); if(!val)return; input.value=''; const temp={id:'tmp_'+Date.now(),text:val,mine:true,createdAt:Date.now()}; render([...(state.comments||[]),temp]); try{const r=await fetch('/api/cc60/comments',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({key:state.key,text:val,title:state.title})}); const d=await r.json(); render(d.comments&&d.comments.length?d.comments:state.comments); event('cc61_comment_sent',{ok:true,scope:d.scope||{}});}catch(err){event('cc61_comment_sent',{ok:false,error:String(err&&err.message?err.message:err)});} });
  $('back').onclick=()=>{try{getApps()[0]?.close?.()}catch{} try{history.back()}catch{}};
  initBridge(); Object.assign(state,qs()); if(!titleEl.textContent.trim()) titleEl.textContent=state.title||'Пост'; window.__AK_CC61_PERF__=()=>({runtime:R,ms:Date.now()-t0,state}); requestAnimationFrame(load);
})();
</script></body></html>`;
}
function install(app){
  if(!app || app.__cc60StandaloneComments) return app;
  app.__cc60StandaloneComments = true;
  const json = express.json({limit:'64kb'});
  app.get('/app', (req,res) => { noCache(res); res.type('html').send(shellHtml(req)); });
  app.get('/api/cc60/comments', async (req,res) => {
    noCache(res);
    const scope = await resolveScope({key:req.query.key, commentKey:req.query.commentKey, title:req.query.title});
    const key = scope.commentKey || clean(req.query.key || 'local');
    res.json({ok:true,runtimeVersion:RUNTIME,scope,comments:getStoreComments(key),generatedAt:Date.now()});
  });
  app.post('/api/cc60/comments', json, async (req,res) => {
    noCache(res);
    const scope = await resolveScope({key:req.body.key, commentKey:req.body.commentKey, title:req.body.title});
    const key = scope.commentKey || clean(req.body.key || 'local');
    const text = norm(req.body.text).slice(0,2000);
    if(text) addStoreComment(key,{userId:norm(req.body.userId||'webapp'),userName:norm(req.body.userName||'Вы'),text,attachments:[],replyToId:'',mine:true});
    res.json({ok:true,runtimeVersion:RUNTIME,scope,comments:getStoreComments(key),generatedAt:Date.now()});
  });
  app.post('/api/cc60/register-bg', json, async (req,res) => {
    noCache(res);
    const scope = await resolveScope({key:req.body.key, commentKey:req.body.commentKey, title:req.body.title});
    const result = await registerDbBackground(scope, req.body.url || '');
    res.json({ok:true,runtimeVersion:RUNTIME,scope,register:result,generatedAt:Date.now()});
  });
  app.get('/debug/comments-shell', (req,res) => {
    noCache(res);
    res.json({ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,commentsShell:'clean_boot_ui_preserved',route:'/app intercepted before legacy',usesLegacyAppJs:false,uiPolicy:'preserve_approved_telegram_like_layout',blocksAppOpen:false,blocksPosting:false,dbRegistration:'background_only',redirects:false,generatedAt:Date.now()});
  });
  return app;
}
module.exports = { RUNTIME, SOURCE, install, resolveScope, registerDbBackground };
