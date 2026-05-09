'use strict';
const fs=require('fs');
const path=require('path');
const RUNTIME='CC5.6';
const SOURCE='adminkit-CC5.6-comments-fast-after-app';
const appJs=path.join(__dirname,'public','app.js');
const read=fs.readFileSync.bind(fs);
let cache='',mtime=0;
function noCache(res){try{res.set({'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',Pragma:'no-cache',Expires:'0'});}catch{}}
function patch(){return `
;(() => {
 if (window.__AK_CC56_FAST__) return; window.__AK_CC56_FAST__ = true;
 const R='CC5.6'; const marks=window.__AK_CC56_MARKS__={};
 const mark=n=>{marks[n]=Date.now();try{performance.mark('ak56:'+n)}catch{}};
 const st=()=>{try{return typeof state!=='undefined'?state:(window.state||window.appState||{})}catch{return {}}};
 const text=e=>String(e&&e.textContent||'').replace(/\\s+/g,' ').trim();
 const scope=()=>{const s=st();let ck=String(s.commentKey||'').replace(/^ck:/i,'').replace(/^post:/i,'').trim();let ch=String(s.channelId||'').trim();let pid='';if(ck.includes(':')){const i=ck.indexOf(':');ch=ch||ck.slice(0,i);pid=ck.slice(i+1)}return {commentKey:ck,channelId:ch,postId:pid,title:text(document.getElementById('postTitle'))||document.title||''}};
 const send=(eventType,payload={})=>{const body=JSON.stringify({eventType,payload:{...payload,runtime:R,ts:Date.now()}});try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/cc55/client-event',new Blob([body],{type:'application/json'})))return}catch{}try{fetch('/api/cc55/client-event',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',keepalive:true,body})}catch{}};
 const ready=()=>{const s=scope();const list=document.getElementById('commentsList');return !document.body.classList.contains('miniapp-start-mode')&&(s.commentKey.includes(':')||text(document.getElementById('postTitle'))||(list&&getComputedStyle(list).display!=='none'))};
 const style=document.createElement('style');style.textContent='.ak56-float-cta{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:2147481000;display:flex;gap:8px;align-items:center;max-width:72vw;padding:8px 13px;border-radius:999px;background:rgba(255,255,255,.36);border:1px solid rgba(255,255,255,.70);box-shadow:0 12px 30px rgba(31,111,190,.10);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:rgba(47,117,194,.70);font:700 14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-decoration:none;opacity:.66}.ak56-keyboard .ak56-float-cta,.miniapp-start-mode .ak56-float-cta{display:none!important}.ak56-float-cta .x{color:rgba(86,111,140,.5);font-weight:800}';(document.head||document.documentElement).appendChild(style);
 let cta=false,reg=false,stable=false;
 function mountCta(){if(cta)return;cta=true;setTimeout(()=>{if(!ready()||document.getElementById('ak56-float-cta'))return;const a=document.createElement('a');a.id='ak56-float-cta';a.className='ak56-float-cta';a.href='/';a.innerHTML='<span>🐋</span><span>Подключить комментарии</span><span class="x">×</span>';a.onclick=e=>{if(e.target.classList.contains('x')){e.preventDefault();a.remove()}};document.body.appendChild(a);mark('floatingCtaVisible');send('floating_cta_visible',{ok:true,...scope()})},1400)}
 async function register(reason){if(reg)return;const s=scope();const ok=!!(s.channelId&&s.postId&&s.commentKey.includes(':'));send('public_post_register_attempt',{ok,reason,...s});if(!ok)return;reg=true;try{const r=await fetch('/api/cc54/register-public-post',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({...s,url:location.pathname})});const data=await r.json().catch(()=>({ok:false,error:'bad_json'}));window.__AK_CC56_LAST_POST_REGISTER__=data;send('public_post_register_result',{...data,...s})}catch(e){reg=false;send('public_post_register_result',{ok:false,error:String(e&&e.message?e.message:e),...s})}}
 function tick(reason){if(!ready())return;if(!stable){stable=true;mark('commentsReady');send('comments_first_stable_paint',{ok:true,...scope()});mountCta()}setTimeout(()=>register(reason+':250'),250);setTimeout(()=>register(reason+':1200'),1200)}
 document.addEventListener('focusin',()=>document.body.classList.add('ak56-keyboard'),true);document.addEventListener('focusout',()=>setTimeout(()=>document.body.classList.remove('ak56-keyboard'),160),true);
 mark('clientLoaded');send('comments_client_loaded',{ok:true,...scope()});let n=0;const t=setInterval(()=>{n++;tick('poll');if(reg||n>80)clearInterval(t);if(n===80)send('comments_ready_timeout',{ok:false,...scope()})},150);try{new MutationObserver(()=>tick('mut')).observe(document.documentElement,{childList:true,subtree:true,characterData:true})}catch{}
 window.__AK_CC56_COMMENTS_PERF__=()=>({runtime:R,marks,scope:scope(),registered:window.__AK_CC56_LAST_POST_REGISTER__||null});
})();
`}
function build(){const s=fs.statSync(appJs);if(cache&&mtime===Number(s.mtimeMs||0))return cache;mtime=Number(s.mtimeMs||0);cache=String(read(appJs,'utf8')||'')+patch();return cache;}
function install(app){if(!app||app.__cc56CommentsFast)return app;app.__cc56CommentsFast=true;app.get('/public/app.js',(req,res,next)=>{try{noCache(res);res.type('application/javascript; charset=utf-8').send(build())}catch(e){console.error('[CC5.6 comments fast]',e&&e.message?e.message:e);next()}});app.get('/debug/comments-shell',(req,res)=>{noCache(res);res.json({ok:true,runtimeVersion:RUNTIME,sourceMarker:SOURCE,commentsShell:'fast_after_app',fullscreenShell:'disabled',floatingCta:'delayed_after_comments_ready',publicPostRegister:'uses_app_state_after_handoff',appJsBytes:Buffer.byteLength(build(),'utf8'),generatedAt:Date.now()})});return app}
module.exports={RUNTIME,SOURCE,install,buildClientSource:build};
