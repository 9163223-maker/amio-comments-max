'use strict';

/**
 * CC5.5 comments client telemetry + floating CTA + public post registration.
 * Debug must show real client results, not only loaded flags.
 */

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC5.5';
const SOURCE = 'adminkit-CC5.5-hard-feature-gate';
const nativeReadFileSync = fs.readFileSync.bind(fs);
const publicAppPath = path.join(__dirname, 'public', 'app.js');
let cachedSource = null;
let cachedMtime = 0;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function clientPatch() {
  return `\n;(() => {\n  if (window.__AK_CC55_COMMENTS_CLIENT__) return;\n  window.__AK_CC55_COMMENTS_CLIENT__ = true;\n  const mark = (name) => { try { performance.mark('ak55:' + name); } catch (_) {} window.__AK_CC55_MARKS__ = window.__AK_CC55_MARKS__ || {}; window.__AK_CC55_MARKS__[name] = Date.now(); };\n  const report = async (eventType, payload={}) => { try { await fetch('/api/cc55/client-event',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({eventType,payload:{...payload,href:location.href,ts:Date.now(),runtime:'${RUNTIME}'}})}); } catch (_) {} };\n  mark('appStart'); report('comments_client_loaded',{ok:true});\n  const css = '#ak53-shell{position:fixed;inset:0;z-index:2147482000;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937}#ak53-shell .bar{height:44px;border-radius:20px;background:rgba(255,255,255,.74);box-shadow:0 12px 28px rgba(31,111,190,.10);margin-bottom:14px}#ak53-shell .post{height:132px;border-radius:26px;background:rgba(255,255,255,.86);box-shadow:0 18px 44px rgba(31,111,190,.12);margin-bottom:18px}#ak53-shell .label{height:18px;width:160px;border-radius:999px;background:rgba(91,141,205,.18);margin:0 0 12px 8px}#ak53-shell .bubble{height:48px;border-radius:22px;background:rgba(255,255,255,.82);box-shadow:0 10px 26px rgba(31,111,190,.08);margin:10px 46px 0 0}#ak53-shell .bubble.r{margin:10px 0 0 64px}#ak53-shell .composer{margin-top:auto;height:54px;border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 -10px 34px rgba(31,111,190,.10)}body.ak53-shell-active{background:#f4f9ff!important}body.ak53-shell-active #growthLeadCard,body.ak53-shell-active #trackedButtonsCard,body.ak53-shell-active #pollCard{display:none!important}.ak54-float-cta{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:2147481000;display:flex;align-items:center;gap:8px;max-width:72vw;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.42);border:1px solid rgba(255,255,255,.72);box-shadow:0 14px 34px rgba(31,111,190,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:rgba(47,117,194,.78);font:700 15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;text-decoration:none;opacity:.72;transition:opacity .18s ease,transform .18s ease}.ak54-float-cta:active{opacity:.96;transform:translateX(-50%) scale(.98)}.ak54-float-cta .x{margin-left:3px;font-weight:800;color:rgba(86,111,140,.54)}.ak54-keyboard .ak54-float-cta{display:none!important}.miniapp-start-mode .ak54-float-cta{display:none!important}';\n  const style = document.createElement('style'); style.id = 'ak55-client-style'; style.textContent = css; (document.head || document.documentElement).appendChild(style);\n  function mountShell(){\n    if (document.getElementById('ak53-shell') || document.body?.classList?.contains('miniapp-start-mode')) return;\n    document.body?.classList?.add('ak53-shell-active');\n    const el = document.createElement('div'); el.id = 'ak53-shell'; el.setAttribute('aria-hidden','true');\n    el.innerHTML = '<div class="bar"></div><div class="post"></div><div class="label"></div><div class="bubble"></div><div class="bubble r"></div><div class="composer"></div>';\n    document.body.appendChild(el); mark('shellVisible'); report('comments_shell_visible',{ok:true});\n  }\n  function stable(){\n    const shell = document.getElementById('ak53-shell');\n    const hasPost = !!(document.getElementById('postTitle')?.textContent || document.querySelector('[data-post-title]')?.textContent || '').trim();\n    const comments = document.getElementById('commentsList');\n    const visible = comments && getComputedStyle(comments).display !== 'none';\n    if (shell && (hasPost || visible || document.body?.classList?.contains('miniapp-start-mode'))) {\n      shell.remove(); document.body?.classList?.remove('ak53-shell-active'); mark('firstStablePaint'); report('comments_first_stable_paint',{ok:true,hasPost,commentsVisible:!!visible});\n      ensureFloatingCta(); registerPublicPostSoon();\n    }\n  }\n  function getParam(names){ const sp=new URLSearchParams(location.search||''); for(const n of names){ const v=sp.get(n); if(v) return v; } return ''; }\n  function getState(){ try { return window.state || window.appState || window.__APP_STATE__ || {}; } catch { return {}; } }\n  function getCommentKey(){ const st=getState(); let v=getParam(['commentKey','key','postKey','ck']) || st.commentKey || st.key || ''; if(!v){ const decoded=decodeURIComponent(location.href); let m=decoded.match(/(?:commentKey|postKey|key|ck)=([^&#]+)/i); if(m) v=m[1]; if(!v){ m=decoded.match(/(?:startapp=|start=)(?:ck%3A|ck:)?([^&#]+)/i); if(m) v=m[1]; }} return String(v||'').replace(/^ck:/i,'').replace(/^post:/i,'').trim(); }\n  function splitKey(key){ const k=String(key||'').replace(/^ck:/i,'').replace(/^post:/i,'').trim(); const i=k.indexOf(':'); return i>0?{commentKey:k,channelId:k.slice(0,i),postId:k.slice(i+1)}:{commentKey:k,channelId:'',postId:''}; }\n  function getTitle(){ return (document.getElementById('postTitle')?.textContent || document.querySelector('[data-post-title]')?.textContent || document.querySelector('.post-title')?.textContent || document.title || '').replace(/\\s+/g,' ').trim(); }\n  async function registerPublicPost(){\n    const key=getCommentKey(); const scope=splitKey(key); report('public_post_register_attempt',{ok:!!(scope.channelId&&scope.postId),commentKey:key,channelId:scope.channelId,postId:scope.postId,title:getTitle()}); if(!scope.channelId||!scope.postId) return;\n    try {\n      const body={commentKey:scope.commentKey,channelId:scope.channelId,postId:scope.postId,title:getTitle(),url:location.href};\n      const r=await fetch('/api/cc54/register-public-post',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(body)});\n      window.__AK_CC55_LAST_POST_REGISTER__=await r.json().catch(()=>({ok:false})); mark('publicPostRegistered'); report('public_post_register_result',window.__AK_CC55_LAST_POST_REGISTER__);\n    } catch(e){ window.__AK_CC55_LAST_POST_REGISTER__={ok:false,error:String(e&&e.message?e.message:e)}; report('public_post_register_result',window.__AK_CC55_LAST_POST_REGISTER__); }\n  }\n  function registerPublicPostSoon(){ setTimeout(registerPublicPost,250); setTimeout(registerPublicPost,1200); }\n  function ensureFloatingCta(){\n    if(document.body?.classList?.contains('miniapp-start-mode')) return;\n    if(document.getElementById('ak54-float-cta')) return;\n    const a=document.createElement('a'); a.id='ak54-float-cta'; a.className='ak54-float-cta'; a.href='https://max.ru/id781310320690_bot'; a.innerHTML='<span>🐋</span><span>Подключить комментарии</span><span class="x">×</span>';\n    a.addEventListener('click',(e)=>{ if(e.target&&e.target.classList&&e.target.classList.contains('x')){e.preventDefault();a.remove();return;} });\n    document.body.appendChild(a); mark('floatingCtaVisible'); report('floating_cta_visible',{ok:true});\n  }\n  window.addEventListener('focusin',()=>document.body?.classList?.add('ak54-keyboard'),true);\n  window.addEventListener('focusout',()=>setTimeout(()=>document.body?.classList?.remove('ak54-keyboard'),160),true);\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountShell(); ensureFloatingCta(); registerPublicPostSoon(); }, { once:true }); else { mountShell(); ensureFloatingCta(); registerPublicPostSoon(); }\n  const timer = setInterval(stable, 120); setTimeout(() => { clearInterval(timer); stable(); const shell=document.getElementById('ak53-shell'); if(shell){shell.remove(); document.body?.classList?.remove('ak53-shell-active'); mark('shellTimeout'); report('comments_shell_timeout',{ok:false}); ensureFloatingCta(); registerPublicPostSoon();}}, 6500);\n  try { new MutationObserver(() => { stable(); ensureFloatingCta(); }).observe(document.documentElement, { childList:true, subtree:true, characterData:true }); } catch (_) {}\n  window.__AK_CC55_COMMENTS_PERF__ = () => ({ runtime:'${RUNTIME}', sourceMarker:'${SOURCE}', marks: window.__AK_CC55_MARKS__ || {}, postRegister: window.__AK_CC55_LAST_POST_REGISTER__ || null });\n})();\n`;
}

function buildClientSource() {
  const stat = fs.statSync(publicAppPath);
  if (cachedSource && cachedMtime === Number(stat.mtimeMs || 0)) return cachedSource;
  let source = String(nativeReadFileSync(publicAppPath, 'utf8') || '');
  source = source.replace(/\n;\(\(\) => \{\n  if \(window\.__ADMINKIT_SP4057_CLEAR_CORE__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  source = source.replace(/\n;\(\(\) => \{\n if \(window\.__AK_SP39__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  source = clientPatch() + '\n' + source;
  cachedMtime = Number(stat.mtimeMs || 0);
  cachedSource = source;
  return source;
}

function install(app) {
  if (!app || app.__cc53CommentsShell) return app;
  app.__cc53CommentsShell = true;
  app.get('/public/app.js', (req, res, next) => {
    try { noCache(res); res.type('application/javascript; charset=utf-8').send(buildClientSource()); }
    catch (error) { console.error('[CC5.5 comments shell]', error && error.message ? error.message : error); next(); }
  });
  app.get('/debug/comments-shell', (req, res) => {
    noCache(res);
    let size = 0;
    try { size = Buffer.byteLength(buildClientSource(), 'utf8'); } catch {}
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, commentsShell: 'enabled', floatingCta: 'telemetry_required', publicPostRegister: 'client_telemetry_enabled', legacyClientPatch: 'stripped_from_app_js_route', appJsBytes: size, generatedAt: Date.now() });
  });
  return app;
}

module.exports = { RUNTIME, SOURCE, install, buildClientSource };
