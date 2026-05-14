'use strict';

// CC6.8.6: one-pass comments open root.
// Purpose: the comments mini-app must not first render default/loading chips and then repaint.
// It resolves DB meta before the app code can paint and locks the post title/chips to one stable shape.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.8.6-HARD-V3-COMMENTS-ONEPASS-ROOT';
const MARKER = '__ADMINKIT_COMMENTS_ONEPASS_ROOT_686__';
let status = { installed: false, patchedPhysicalApp: false, routeInstalled: false, error: '', at: '' };

function noCache(res) {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store'
    });
  } catch {}
}

function clientPrelude() {
  return `;(() => {\ntry {\n  const MARKER='${MARKER}';\n  if (window[MARKER]) return;\n  window[MARKER]=true;\n  const RT='${RUNTIME}';\n  const clean=(v)=>String(v||'').replace(/\\s+/g,' ').trim();\n  const dec=(v)=>{let s=String(v||''); for(let i=0;i<5;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20')); if(d===s) break; s=d;}catch(_){break;}} return s;};\n  const isLoading=(v)=>/^\\s*(загрузка|loading)\\b/i.test(String(v||''));\n  const isBadTitle=(v)=>{const s=clean(v); return !s || isLoading(s) || /^пост$/i.test(s) || /^[a-f0-9]{16,}$/i.test(s) || /^-?\\d{8,}$/.test(s);};\n\n  function addCss(){\n    if(document.getElementById('adminkit-onepass-686-style')) return;\n    const css=document.createElement('style');\n    css.id='adminkit-onepass-686-style';\n    css.textContent=[\n      '.discussion-label-wrap{display:flex!important;gap:8px!important;align-items:center!important;justify-content:center!important;flex-wrap:wrap!important}',\n      '.discussion-label-wrap:not(.adminkit-onepass-painted){visibility:hidden!important}',\n      '.discussion-label-wrap~.discussion-label-wrap{display:none!important}',\n      '.discussion-label-wrap.adminkit-onepass-duplicate{display:none!important}',\n      '#discussionLabel,#adminkitDiscussionLink{white-space:nowrap!important}',\n      '#postTitle.adminkit-onepass-title{color:inherit!important;text-shadow:inherit!important;visibility:visible!important}',\n      'html.adminkit-dbfirst-booting #postTitle,html.adminkit-dbfirst-booting #commentsWrap,html.adminkit-dbfirst-booting #commentsList,html.adminkit-dbfirst-booting .discussion-label-wrap{visibility:visible!important}'\n    ].join(' ');\n    (document.head||document.documentElement).appendChild(css);\n  }\n  addCss();\n\n  function addParam(out,k,v){\n    v=clean(dec(v)); if(!v) return;\n    const key=String(k||'');\n    if((key==='commentKey'||key==='key')&&!out.commentKey) out.commentKey=v;\n    if((key==='channelId'||key==='channel')&&!out.channelId) out.channelId=v;\n    if((key==='postId'||key==='post_id'||key==='messageId')&&!out.postId) out.postId=v;\n    if((key==='handoff'||key==='startapp'||key==='start_param'||key==='WebAppStartParam')&&!out.handoff) out.handoff=v;\n    if((key==='title'||key==='postTitle'||key==='postText')&&!isBadTitle(v)&&!out.title) out.title=v;\n  }\n  function scan(raw,out){\n    raw=String(raw||''); if(!raw) return;\n    for(const s0 of [raw,dec(raw)]){\n      const parts=[s0];\n      if(s0.includes('?')) parts.push(s0.split('?').slice(1).join('?'));\n      if(s0.includes('#')) parts.push(s0.split('#').slice(1).join('#'));\n      for(const part of parts){\n        try{const p=new URLSearchParams(String(part||'').replace(/^#|^\\?/g,'')); for(const [k,v] of p.entries()) addParam(out,k,v);}catch(_){}\n      }\n      const ck=s0.match(/-?\\d{6,}:-?\\d{3,}/); if(ck) addParam(out,'commentKey',ck[0]);\n      const h=s0.match(/h_[A-Za-z0-9_-]{6,}/); if(h) addParam(out,'handoff',h[0]);\n      const tagged=s0.match(/(?:postId|post_id|messageId)[:=](-?\\d{1,})/i); if(tagged) addParam(out,'postId',tagged[1]);\n      const title=s0.match(/\\b(Post\\s*new!!\\s*\\d+!|Post\\s*new\\s*\\d+|Post\\s*zero\\s*\\d+|Post\\s*\\d+|Пост\\s*\\d+)\\b/i); if(title) addParam(out,'title',title[1]);\n      const only=clean(s0).match(/^\\d{1,4}$/); if(only){ addParam(out,'postId',only[0]); addParam(out,'title','Post '+only[0]); }\n      const start=s0.match(/(?:startapp|start_param|WebAppStartParam)=(-?\\d{1,4})(?:$|[&#\\s])/i); if(start){ addParam(out,'postId',start[1]); addParam(out,'title','Post '+start[1]); }\n    }\n  }\n  function webApps(){return [window.WebApp,window.Telegram&&window.Telegram.WebApp,window.Max&&window.Max.WebApp,window.MAX&&window.MAX.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max&&window.max.WebApp].filter(Boolean);}\n  function collect(){\n    const out={commentKey:'',channelId:'',postId:'',handoff:'',title:''};\n    try{scan(location.href,out); scan(location.search,out); scan(location.hash,out); scan(document.referrer||'',out);}catch(_){}\n    for(const app of webApps()){\n      try{const u=app.initDataUnsafe||{}; ['start_param','startapp','postId','post_id','commentKey','channelId','title','postTitle'].forEach(k=>addParam(out,k,u[k])); scan(JSON.stringify(u),out); scan(app.initData||'',out); scan(app.startParam||'',out); scan(app.launchParams||'',out); scan(app.params||'',out);}catch(_){}\n    }\n    if(out.commentKey&&out.commentKey.includes(':')){const a=out.commentKey.split(':'); if(!out.channelId) out.channelId=a[0]||''; if(!out.postId) out.postId=a[1]||'';}\n    if(!out.title && /^\\d{1,4}$/.test(out.postId||'')) out.title='Post '+out.postId;\n    if(!out.title && /^\\d{1,4}$/.test(out.handoff||'')) out.title='Post '+out.handoff;\n    return out;\n  }\n\n  const PARAMS=collect();\n  function syncMeta(p){\n    try{\n      const q=new URLSearchParams();\n      Object.entries(p||{}).forEach(([k,v])=>{if(clean(v)) q.set(k,v);});\n      if(!q.toString()) return null;\n      q.set('onepass','1'); q.set('t',Date.now());\n      const xhr=new XMLHttpRequest();\n      xhr.open('GET','/api/adminkit/post-meta?'+q.toString(),false);\n      xhr.setRequestHeader('Cache-Control','no-store');\n      xhr.send(null);\n      if(xhr.status>=200&&xhr.status<400){ const j=JSON.parse(xhr.responseText||'{}'); if(j&&j.ok&&j.meta) return j.meta; }\n    }catch(e){ window.__ADMINKIT_ONEPASS_SYNC_ERROR__=String(e&&e.message||e); }\n    return null;\n  }\n  const META=syncMeta(PARAMS)||{};\n  window.__ADMINKIT_ONEPASS_META__=META;\n  window.__ADMINKIT_ONEPASS_PARAMS__=PARAMS;\n\n  function resolvedTitle(){return clean(META.postTitle||PARAMS.title||'');}\n  function resolvedBanner(){\n    const b=(META&&META.banner)||{};\n    const raw=clean(b.button||b.text||'');\n    const custom=(b.enabled!==false)&&raw&&raw.toLowerCase()!=='начало обсуждения';\n    return { custom, text: custom?raw:'🐋 АдминКИТ', link: custom?(clean(b.link)||'#'):'https://max.ru/id781310320690_bot?start=menu' };\n  }\n\n  const textDesc=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');\n  if(textDesc&&textDesc.configurable&&textDesc.set&&textDesc.get){\n    try{Object.defineProperty(Node.prototype,'textContent',{configurable:true,enumerable:textDesc.enumerable,get:function(){return textDesc.get.call(this);},set:function(v){try{if(this&&this.id==='postTitle'){const t=resolvedTitle(); if(t&&isLoading(v)) v=t;}}catch(_){} return textDesc.set.call(this,v);}});}catch(_){}\n  }\n\n  function chip(tag,id,cls,text){let el=document.getElementById(id); if(!el){el=document.createElement(tag); el.id=id;} el.className=cls; el.textContent=text; return el;}\n  function paint(){\n    try{document.documentElement.classList.remove('adminkit-dbfirst-booting'); document.body&&document.body.classList.add('adminkit-onepass-686');}catch(_){}\n    const title=resolvedTitle();\n    const titleEl=document.getElementById('postTitle');\n    if(titleEl&&title&&clean(titleEl.textContent)!==title){ titleEl.textContent=title; titleEl.classList.add('adminkit-onepass-title'); }\n    const wraps=[...document.querySelectorAll('.discussion-label-wrap')];\n    wraps.forEach((w,i)=>{ if(i>0){w.classList.add('adminkit-onepass-duplicate'); try{w.remove();}catch(_){}} });\n    let wrap=wraps[0]||document.querySelector('.discussion-label-wrap');\n    if(!wrap){ const anchor=document.getElementById('postCard')||document.querySelector('.post-card'); if(anchor&&anchor.parentNode){wrap=document.createElement('div'); wrap.className='discussion-label-wrap'; anchor.parentNode.insertBefore(wrap, anchor.nextSibling);} }\n    if(wrap){\n      const b=resolvedBanner();\n      const label=chip('span','discussionLabel','discussion-label','Начало обсуждения');\n      const action=chip('a','adminkitDiscussionLink','adminkit-discussion-link',b.text);\n      action.href=b.link; if(b.custom&&!clean(META.banner&&META.banner.link)) action.onclick=(e)=>e.preventDefault();\n      wrap.replaceChildren(label,action);\n      wrap.classList.add('adminkit-onepass-painted');\n      wrap.style.visibility='visible';\n    }\n    try{ if(typeof state!=='undefined'&&state){ if(META.commentKey) state.commentKey=META.commentKey; if(META.channelId) state.channelId=META.channelId; if(META.postId) state.postId=META.postId; if(title) state.postTitle=title; state.__adminkitOnepassMeta=META; }}catch(_){}\n  }\n\n  const run=()=>{addCss(); paint();};\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{capture:true,once:false});\n  [0,1,16,40,90,180,360,800,1600,3200].forEach(ms=>setTimeout(run,ms));\n  try{new MutationObserver(()=>{requestAnimationFrame(run);}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(_){}\n  window.__ADMINKIT_ONEPASS_LAST__={ok:true,runtimeVersion:RT,params:PARAMS,meta:META,title:resolvedTitle(),at:new Date().toISOString()};\n}catch(e){ window.__ADMINKIT_ONEPASS_LAST__={ok:false,runtimeVersion:'${RUNTIME}',error:String(e&&e.message||e),at:new Date().toISOString()}; }\n})();\n`;
}

function patchText(text) {
  const source = String(text || '');
  if (source.includes(MARKER)) return source;
  return clientPrelude() + source;
}

function patchPhysicalAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(MARKER)) return false;
  fs.writeFileSync(file, patchText(before), 'utf8');
  return true;
}

function installExpressRoute() {
  if (Module.__adminkitCommentsOnepassRoot686) return;
  Module.__adminkitCommentsOnepassRoot686 = true;
  const prev = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCommentsOnepassRoot686Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitCommentsOnepassRoot686Installed) {
            app.__adminkitCommentsOnepassRoot686Installed = true;
            app.get(['/public/app.js', '/app.js'], (req, res, next) => {
              try {
                noCache(res);
                const file = path.resolve(__dirname, 'public', 'app.js');
                res.type('application/javascript; charset=utf-8').send(patchText(fs.readFileSync(file, 'utf8')));
              } catch (error) { next(error); }
            });
            app.get('/debug/comments-onepass', (req, res) => {
              noCache(res);
              let appJs = { exists: false };
              try { const s = fs.readFileSync(path.resolve(__dirname, 'public', 'app.js'), 'utf8'); appJs = { exists: true, markerInPhysical: s.includes(MARKER), bytes: s.length }; } catch (e) { appJs = { exists: false, error: e?.message || String(e) }; }
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, appJs, policy: 'sync_db_meta_before_first_client_paint_static_first_chip_dynamic_second_chip_no_loading_title' });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCommentsOnepassRoot686Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  try {
    const patchedPhysicalApp = patchPhysicalAppJs();
    installExpressRoute();
    status = { installed: true, patchedPhysicalApp, routeInstalled: true, error: '', at: new Date().toISOString() };
  } catch (error) {
    status = { installed: false, patchedPhysicalApp: false, routeInstalled: false, error: error?.message || String(error), at: new Date().toISOString() };
  }
  return { ok: status.installed, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { RUNTIME, MARKER, install };
