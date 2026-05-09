'use strict';

const RUNTIME = 'CC6.0';
const SOURCE = 'adminkit-CC6.0-comments-standalone-clean-boot';
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
*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#142033;background:#eaf4ff}body{overflow:hidden}.app{height:100vh;height:100dvh;display:flex;flex-direction:column;background:linear-gradient(160deg,#f7fbff 0%,#dcebff 50%,#eaf4ff 100%)}.top{flex:0 0 auto;padding:18px 18px 8px}.nav{display:grid;grid-template-columns:56px 1fr 56px;gap:10px;align-items:center}.round{width:52px;height:52px;border-radius:50%;border:0;background:rgba(255,255,255,.86);font-size:32px;display:grid;place-items:center;color:#142033}.count{height:52px;border-radius:28px;background:rgba(255,255,255,.86);display:grid;place-items:center;font-size:22px;font-weight:800;color:#142033}.post{margin-top:14px;border-radius:24px;background:rgba(255,255,255,.72);padding:16px 20px;font-size:24px;color:#5c6c80;min-height:58px}.chips{display:flex;justify-content:center;gap:10px;margin-top:16px}.chip{border-radius:999px;background:rgba(255,255,255,.55);padding:10px 18px;font-size:18px;color:#60748f;font-weight:700}.brand{color:#2f7ccb}.list{flex:1 1 auto;overflow:auto;padding:8px 18px 96px;-webkit-overflow-scrolling:touch}.empty{text-align:center;color:#7589a4;font-size:24px;padding-top:34px}.msg{max-width:78%;margin:10px 0;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.88);font-size:19px;line-height:1.28;box-shadow:0 8px 24px rgba(31,93,160,.05)}.mine{margin-left:auto;background:#dff0ff}.meta{margin-top:5px;font-size:13px;color:#7d91aa;text-align:right}.bar{position:fixed;left:0;right:0;bottom:0;padding:10px max(12px,env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-right));display:grid;grid-template-columns:52px 1fr 58px;gap:10px;align-items:center;background:linear-gradient(180deg,rgba(234,244,255,0),rgba(234,244,255,.96) 26%)}.clip,.send{height:52px;border:0;border-radius:50%;background:rgba(255,255,255,.92);font-size:28px}.send{background:#3493ff;color:white;font-weight:900}.input{height:52px;border:0;border-radius:26px;background:white;padding:0 18px;font-size:21px;outline:none}.debug{position:fixed;left:8px;top:8px;font-size:10px;color:transparent;pointer-events:none}@media(max-width:420px){.post{font-size:22px}.count{font-size:20px}.chip{font-size:17px}.msg{font-size:18px}}
</style></head><body><div class="app"><div class="debug">CC6.0</div><div class="top"><div class="nav"><button class="round" id="back">‹</button><div class="count" id="count">0 комментариев</div><button class="round" id="search">⌕</button></div><div class="post" id="title">${esc(title)}</div><div class="chips"><div class="chip">Начало обсуждения</div><div class="chip brand">🐋 АдминКИТ</div></div></div><main class="list" id="list"><div class="empty">Комментарии загружаются…</div></main><form class="bar" id="form"><button class="clip" type="button">📎</button><input class="input" id="input" autocomplete="off" placeholder="Комментарий"><button class="send" type="submit">›</button></form></div>
<script>
(() => {
  const R='CC6.0'; const START=${JSON.stringify(initialKey)}; const TITLE=${JSON.stringify(title)}; const t0=Date.now();
  const $=id=>document.getElementById(id); const list=$('list'), input=$('input'), count=$('count'), titleEl=$('title');
  function text(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function qs(){const u=new URL(location.href); const h=new URLSearchParams((location.hash||'').replace(/^#/,'')); return {key:u.searchParams.get('commentKey')||u.searchParams.get('WebAppStartParam')||u.searchParams.get('start_param')||u.searchParams.get('handoff')||h.get('start_param')||START||'local', title:u.searchParams.get('title')||TITLE||'Пост'};}
  const state=qs(); if(!titleEl.textContent.trim()||titleEl.textContent==='Пост') titleEl.textContent=state.title||'Пост';
  function event(type,payload={}){const body=JSON.stringify({eventType:type,payload:{...payload,runtime:R,ts:Date.now(),key:state.key}});try{navigator.sendBeacon&&navigator.sendBeacon('/api/cc55/client-event',new Blob([body],{type:'application/json'}))}catch{} }
  function render(items){list.innerHTML=''; count.textContent=(items.length||0)+' '+(items.length===1?'комментарий':'комментариев'); if(!items.length){list.innerHTML='<div class="empty">Комментариев пока нет</div>';return;} items.forEach(c=>{const div=document.createElement('div');div.className='msg '+(c.mine?'mine':'');div.innerHTML='<div>'+text(c.text)+'</div><div class="meta">'+new Date(c.createdAt||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'</div>';list.appendChild(div)}); list.scrollTop=list.scrollHeight;}
  async function load(){event('cc60_shell_visible',{ok:true,ms:Date.now()-t0}); try{const r=await fetch('/api/cc60/comments?key='+encodeURIComponent(state.key)+'&title='+encodeURIComponent(state.title||''),{cache:'no-store'}); const d=await r.json(); state.scope=d.scope||{}; render(d.comments||[]); event('cc60_comments_loaded',{ok:true,ms:Date.now()-t0,count:(d.comments||[]).length,scope:state.scope}); setTimeout(()=>registerBg(),900);}catch(e){render([]);event('cc60_comments_loaded',{ok:false,error:String(e&&e.message?e.message:e),ms:Date.now()-t0});}}
  async function registerBg(){try{await fetch('/api/cc60/register-bg',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',keepalive:true,body:JSON.stringify({key:state.key,title:state.title,url:location.href})});}catch{}}
  $('form').addEventListener('submit',async e=>{e.preventDefault(); const val=input.value.trim(); if(!val)return; input.value=''; const temp={id:'tmp'+Date.now(),text:val,mine:true,createdAt:Date.now()}; const existing=[...list.querySelectorAll('.msg')].length?null:null; try{const r=await fetch('/api/cc60/comments',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({key:state.key,text:val,title:state.title})}); const d=await r.json(); render(d.comments||[temp]); event('cc60_comment_sent',{ok:true,scope:d.scope||{}});}catch(err){render([temp]);event('cc60_comment_sent',{ok:false,error:String(err&&err.message?err.message:err)});} });
  $('back').onclick=()=>{try{window.Max?.WebApp?.close?.()}catch{} history.back();};
  window.__AK_CC60_PERF__=()=>({runtime:R,ms:Date.now()-t0,state});
  requestAnimationFrame(load);
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
    res.json({ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,commentsShell:'standalone_clean_route',route:'/app intercepted before legacy',usesLegacyAppJs:false,blocksAppOpen:false,blocksPosting:false,dbRegistration:'background_only',redirects:false,generatedAt:Date.now()});
  });
  return app;
}
module.exports = { RUNTIME, SOURCE, install, resolveScope, registerDbBackground };
