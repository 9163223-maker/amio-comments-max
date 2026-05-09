'use strict';
const fs = require('fs');
const path = require('path');
const RUNTIME = 'CC5.7';
const SOURCE = 'adminkit-CC5.7-comments-open-independent';
const appJs = path.join(__dirname, 'public', 'app.js');
const read = fs.readFileSync.bind(fs);
let cache = '';
let mtime = 0;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function norm(v){return String(v || '').replace(/\s+/g, ' ').trim();}
function clean(v){return norm(v).replace(/^ck:/i,'').replace(/^post:/i,'').replace(/^:+/,'').replace(/^['\"]+|['\"]+$/g,'');}
function splitKey(v){const key=clean(v);const i=key.indexOf(':');return i>0?{commentKey:key,channelId:key.slice(0,i),postId:key.slice(i+1)}:{commentKey:key,channelId:'',postId:''};}
function handoffKey(v){const raw=norm(v).replace(/^handoff[:=_-]?/i,'').replace(/^h_+/i,'').replace(/[^A-Za-z0-9_-]/g,'');return raw ? `h_${raw}` : '';}
function pickTitle(post, hand, postId){return norm(post?.originalText || post?.text || post?.caption || post?.title || hand?.title || hand?.originalText || postId || 'Пост').slice(0,160);}
async function resolveScope(input={}){
  const direct = splitKey(input.commentKey || input.key || '');
  if (direct.channelId && direct.postId) return {...direct,title:norm(input.title||'Пост')};
  const token = handoffKey(input.handoff || input.handoffToken || input.commentKey || '');
  if (!token) return {commentKey:clean(input.commentKey||''),channelId:'',postId:'',title:norm(input.title||'')};
  let hand = null, post = null;
  try {
    const store = require('./store');
    hand = store.getHandoff?.(token) || store.store?.handoffs?.[token] || null;
    if (!hand && store.findPostByAnyId) post = store.findPostByAnyId(token) || null;
    if (hand?.commentKey && store.getPost) post = store.getPost(hand.commentKey) || post;
  } catch (e) {
    return {commentKey:token,channelId:'',postId:'',title:norm(input.title||''),error:e?.message||String(e)};
  }
  const fromKey = splitKey(hand?.commentKey || post?.commentKey || '');
  const channelId = norm(fromKey.channelId || hand?.channelId || post?.channelId || '');
  const postId = norm(fromKey.postId || hand?.postId || hand?.messageId || post?.postId || post?.messageId || '');
  const commentKey = clean(fromKey.commentKey || (channelId && postId ? `${channelId}:${postId}` : token));
  return {commentKey,channelId,postId,title:pickTitle(post,hand,postId),handoff:token,hasHandoff:!!hand,hasPost:!!post};
}
async function registerScope(input={}){
  const scope = await resolveScope(input);
  if (!scope.channelId || !scope.postId || !String(scope.commentKey||'').includes(':')) return {ok:false,registered:0,reason:'background_scope_not_ready',...scope};
  try {
    const out = await require('./cc54-public-post-register').registerPublicPost({...scope,url:input.url||''});
    return {ok:!!out.ok, ...scope, register:out, registered:Number(out.registered||0)};
  } catch (e) {
    return {ok:false,registered:0,reason:'register_throw',error:e?.message||String(e),...scope};
  }
}
function clientPatch(){return `
;(() => {
  if (window.__AK_CC57_OPEN_INDEPENDENT__) return;
  window.__AK_CC57_OPEN_INDEPENDENT__ = true;
  const R = 'CC5.7';
  const startedAt = Date.now();
  const marks = window.__AK_CC57_MARKS__ = { clientLoadedAt: startedAt };
  const appState = () => { try { return typeof state !== 'undefined' ? state : (window.state || window.appState || {}); } catch { return {}; } };
  const txt = (el) => String(el && el.textContent || '').replace(/\\s+/g,' ').trim();
  const isH = (v) => /^h_[A-Za-z0-9_-]{6,}$/.test(String(v||'').trim());
  const scope = () => {
    const s = appState();
    let ck = String(s.commentKey || '').replace(/^ck:/i,'').replace(/^post:/i,'').trim();
    let ch = String(s.channelId || '').trim();
    let pid = '';
    if (ck.includes(':')) { const i = ck.indexOf(':'); ch = ch || ck.slice(0,i); pid = ck.slice(i+1); }
    const token = isH(ck) ? ck : (isH(s.handoffToken) ? String(s.handoffToken).trim() : '');
    return { commentKey: ck, channelId: ch, postId: pid, handoff: token, title: txt(document.getElementById('postTitle')) || document.title || '' };
  };
  const send = (eventType, payload = {}) => {
    const body = JSON.stringify({ eventType, payload: { ...payload, runtime: R, ts: Date.now() } });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/cc55/client-event', new Blob([body], {type:'application/json'}))) return; } catch {}
    try { fetch('/api/cc55/client-event', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', keepalive:true, body }); } catch {}
  };
  const hasShell = () => !!(document.getElementById('commentsList') || document.getElementById('commentInput') || document.getElementById('composerCard'));
  const hasVisibleContent = () => {
    const list = document.getElementById('commentsList');
    const input = document.getElementById('commentInput');
    return !!(input || (list && getComputedStyle(list).display !== 'none') || txt(document.getElementById('postTitle')));
  };
  function registerLater(reason) {
    const s = scope();
    send('comments_open_independent', { ok:true, reason, ...s });
    try {
      fetch('/api/cc57/register-background', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', keepalive:true, body:JSON.stringify({ ...s, reason, url:location.href }) })
        .then(r => r.json().catch(() => ({ok:false,error:'bad_json'})))
        .then(data => { window.__AK_CC57_LAST_REGISTER__ = data; send('public_post_register_result', { ...data, ...scope() }); })
        .catch(e => send('public_post_register_result', { ok:false, error:String(e && e.message ? e.message : e), ...scope() }));
    } catch (e) { send('public_post_register_result', { ok:false, error:String(e && e.message ? e.message : e), ...s }); }
  }
  let painted = false, registered = false;
  function tick(reason) {
    if (!painted && hasShell()) { painted = true; marks.shellAt = Date.now(); send('comments_shell_visible', { ok:true, ms:marks.shellAt-startedAt, ...scope() }); }
    if (!registered && hasVisibleContent()) { registered = true; marks.firstPaintAt = Date.now(); send('comments_first_stable_paint', { ok:true, ms:marks.firstPaintAt-startedAt, ...scope() }); setTimeout(() => registerLater(reason + ':after_paint'), 900); }
  }
  send('comments_client_loaded', { ok:true, ...scope() });
  let n = 0;
  const timer = setInterval(() => { n += 1; tick('poll'); if (registered || n > 120) clearInterval(timer); if (n === 120) send('comments_open_timeout', { ok:false, ...scope() }); }, 100);
  try { new MutationObserver(() => tick('mut')).observe(document.documentElement, { childList:true, subtree:true, characterData:true }); } catch {}
  window.__AK_CC57_COMMENTS_PERF__ = () => ({ runtime:R, marks, scope:scope(), register:window.__AK_CC57_LAST_REGISTER__ || null });
})();
`}
function build(){const s=fs.statSync(appJs);const mt=Number(s.mtimeMs||0);if(cache&&mtime===mt)return cache;mtime=mt;cache=String(read(appJs,'utf8')||'')+clientPatch();return cache;}
function install(app){
  if(!app || app.__cc57CommentsOpenIndependent) return app;
  app.__cc57CommentsOpenIndependent = true;
  try { app.use('/api/cc57/register-background', require('express').json({limit:'64kb'})); } catch {}
  app.post('/api/cc57/register-background', async (req,res) => { noCache(res); try { res.json({runtimeVersion:RUNTIME, ...(await registerScope(req.body||{})), generatedAt:Date.now()}); } catch(e) { res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e?.message||String(e)}); } });
  app.get('/api/cc57/resolve-scope', async (req,res) => { noCache(res); try { res.json({ok:true,runtimeVersion:RUNTIME, ...(await resolveScope(req.query||{})), generatedAt:Date.now()}); } catch(e) { res.status(500).json({ok:false,runtimeVersion:RUNTIME,error:e?.message||String(e)}); } });
  app.get('/public/app.js', (req,res,next) => { try { noCache(res); res.type('application/javascript; charset=utf-8').send(build()); } catch(e) { console.error('[CC5.7 comments open]', e?.message||e); next(); } });
  app.get('/debug/comments-shell', (req,res) => { noCache(res); res.json({ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,commentsShell:'open_first_independent',dbRegistration:'background_after_paint_only',blocksAppOpen:false,blocksPosting:false,redirects:false,appJsBytes:Buffer.byteLength(build(),'utf8'),generatedAt:Date.now()}); });
  return app;
}
module.exports={RUNTIME,SOURCE,install,buildClientSource:build,resolveScope,registerScope};
