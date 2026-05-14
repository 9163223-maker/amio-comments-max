'use strict';

// Source UI core for comments mini-app.
// This writes one deterministic client boot into public/app.js.
// Rules:
// - do not create a second banner row;
// - keep "Начало обсуждения" as static label;
// - only the second chip is dynamic: default "АдминКИТ" or user's configured button;
// - post title is hydrated from Postgres meta before the user sees stale "Загрузка...".

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.7.9-COMMENTS-SOURCE-UI-CORE';
const MARKER = '__ADMINKIT_COMMENTS_SOURCE_UI_CORE_679__';
let status = { installed: false, patched: false, error: '', at: '' };

function clientBoot() {
  return `;(() => {\ntry {\n  const MARKER='${MARKER}';\n  if (window[MARKER]) return;\n  window[MARKER]=true;\n  const RT='${RUNTIME}';\n  const clean=(v)=>String(v||'').replace(/\\s+/g,' ').trim();\n  const esc=(v)=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');\n  const bad=(v)=>{const s=clean(v); return !s || /^загрузка/i.test(s) || /^loading/i.test(s);};\n  function addEarlyCss(){\n    if(document.getElementById('adminkit-source-ui-core-style')) return;\n    const s=document.createElement('style');\n    s.id='adminkit-source-ui-core-style';\n    s.textContent='body:not(.adminkit-meta-ready) #postTitle{color:transparent!important;text-shadow:none!important} body:not(.adminkit-meta-ready) #adminkitDiscussionLink{visibility:hidden!important}.discussion-label-wrap{display:flex!important;gap:8px!important;align-items:center!important;justify-content:center!important;flex-wrap:wrap!important}';\n    document.head.appendChild(s);\n  }\n  addEarlyCss();\n  function decode(v){let s=String(v||''); for(let i=0;i<5;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20')); if(d===s) break; s=d;}catch(_){break;}} return s;}\n  function collect(){\n    const out={commentKey:'',channelId:'',postId:'',handoff:''};\n    const add=(k,v)=>{v=clean(decode(v)); if(!v) return; if(k==='commentKey'||k==='key') out.commentKey=out.commentKey||v; if(k==='channelId'||k==='channel') out.channelId=out.channelId||v; if(k==='postId'||k==='post_id'||k==='messageId') out.postId=out.postId||v; if(k==='handoff'||k==='startapp'||k==='start_param'||k==='WebAppStartParam') out.handoff=out.handoff||v;};\n    const raws=[];\n    try{raws.push(location.href,location.search,location.hash,document.referrer||'');}catch(_){}\n    try{ if(typeof state!=='undefined'){ add('commentKey',state.commentKey); add('channelId',state.channelId); add('handoff',state.handoffToken||state.startapp); } }catch(_){}\n    for(const app of [window.WebApp,window.Telegram&&window.Telegram.WebApp,window.Max&&window.Max.WebApp,window.MAX&&window.MAX.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max&&window.max.WebApp].filter(Boolean)){\n      try{raws.push(JSON.stringify(app.initDataUnsafe||{}),app.initData||'',app.startParam||'',app.launchParams||'',app.params||'');}catch(_){}\n    }\n    for(const raw of raws.filter(Boolean)){\n      const variants=[String(raw||''),decode(raw)];\n      for(const x of variants){\n        const parts=[x]; if(x.includes('?')) parts.push(x.split('?').slice(1).join('?')); if(x.includes('#')) parts.push(x.split('#').slice(1).join('#'));\n        for(const p of parts){ try{const q=new URLSearchParams(String(p||'').replace(/^#|^\\?/g,'')); for(const [k,v] of q.entries()) add(k,v);}catch(_){} }\n        const ck=x.match(/-?\\d{6,}:-?\\d{3,}/); if(ck) add('commentKey',ck[0]);\n        const h=x.match(/h_[A-Za-z0-9_-]{6,}/); if(h) add('handoff',h[0]);\n      }\n    }\n    return out;\n  }\n  function setText(el,text){ if(!el||!clean(text)) return false; el.textContent=clean(text); return true; }\n  function ensureBanner(meta){\n    const wrap=document.querySelector('.discussion-label-wrap') || (document.getElementById('discussionLabel')&&document.getElementById('discussionLabel').parentElement);\n    if(!wrap) return;\n    let label=document.getElementById('discussionLabel') || wrap.querySelector('.discussion-label');\n    let action=document.getElementById('adminkitDiscussionLink') || wrap.querySelector('a');\n    if(!label){label=document.createElement('span'); label.id='discussionLabel'; label.className='discussion-label'; wrap.prepend(label);}\n    setText(label,'Начало обсуждения');\n    if(!action){action=document.createElement('a'); action.id='adminkitDiscussionLink'; action.className='adminkit-discussion-link'; wrap.appendChild(action);}\n    const b=meta&&meta.banner?meta.banner:{};\n    const configuredText=clean(b.button || b.text || '');\n    const configuredLink=clean(b.link || '');\n    const hasCustom=(b.enabled!==false) && configuredText && configuredText.toLowerCase()!=='начало обсуждения';\n    action.textContent=hasCustom?configuredText:'🐋 АдминКИТ';\n    action.setAttribute('href',hasCustom?(configuredLink||'#'):'https://max.ru/id781310320690_bot?start=menu');\n    action.onclick=hasCustom&&!configuredLink?(e)=>{e.preventDefault();}:null;\n    action.style.visibility='visible';\n    [...wrap.children].forEach((n,i)=>{ if(i>1) n.remove(); });\n  }\n  function apply(meta){\n    if(!meta) return;\n    try{ if(typeof state!=='undefined'&&meta.commentKey){state.commentKey=meta.commentKey; state.channelId=meta.channelId||state.channelId;} }catch(_){}\n    const title=document.getElementById('postTitle');\n    if(title && clean(meta.postTitle) && (bad(title.textContent)||/^post\\s*\\d+$/i.test(clean(title.textContent)))) setText(title,meta.postTitle);\n    ensureBanner(meta);\n    document.body.classList.add('adminkit-meta-ready');\n    window.__ADMINKIT_SOURCE_UI_CORE_LAST__={ok:true,runtimeVersion:RT,meta,at:new Date().toISOString()};\n  }\n  async function hydrate(){\n    const c=collect();\n    const q=new URLSearchParams();\n    Object.entries(c).forEach(([k,v])=>{if(v) q.set(k,v)});\n    q.set('t',Date.now());\n    try{\n      const r=await fetch('/api/adminkit/post-meta?'+q.toString(),{cache:'no-store'});\n      const j=await r.json().catch(()=>({}));\n      if(j&&j.ok&&j.meta){apply(j.meta); return;}\n    }catch(e){window.__ADMINKIT_SOURCE_UI_CORE_LAST__={ok:false,runtimeVersion:RT,error:String(e&&e.message||e),at:new Date().toISOString()};}\n    document.body.classList.add('adminkit-meta-ready');\n    ensureBanner(null);\n  }\n  [0,80,220,600,1200].forEach(ms=>setTimeout(hydrate,ms));\n}catch(e){try{document.body.classList.add('adminkit-meta-ready')}catch(_){} window.__ADMINKIT_SOURCE_UI_CORE_LAST__={ok:false,runtimeVersion:'${RUNTIME}',error:String(e&&e.message||e),at:new Date().toISOString()};}\n})();\n`;
}

function patchAppJs() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(MARKER)) return false;
  fs.writeFileSync(file, clientBoot() + before, 'utf8');
  return true;
}

function install() {
  try {
    const patched = patchAppJs();
    status = { installed: true, patched, error: '', at: new Date().toISOString() };
  } catch (error) {
    status = { installed: false, patched: false, error: error?.message || String(error), at: new Date().toISOString() };
  }
  return selfTest();
}

function selfTest() {
  return { ok: status.installed, runtimeVersion: RUNTIME, marker: MARKER, status, policy: 'static_discussion_label_dynamic_second_chip_postgres_title_first' };
}

module.exports = { RUNTIME, MARKER, install, selfTest };
