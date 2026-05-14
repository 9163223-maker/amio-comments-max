'use strict';

// CC7.1 clean runtime bridge.
// Current entrypoint still wraps Express because legacy index.js owns the app instance.
// Important change in this step: comment-open-state is now registered from routes/commentOpenState.js,
// not duplicated inside the loader. UI is not redesigned.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const { registerCommentOpenStateRoutes } = require('./routes/commentOpenState');

const RUNTIME = 'CC7.1-CLEAN-RUNTIME-BRIDGE';
const SOURCE = 'adminkit-cc7-1-clean-route-connected';
const MARKER = '__ADMINKIT_CC7_1_CLEAN_RUNTIME_BRIDGE__';

process.env.BUILD_VERSION = RUNTIME;
process.env.RUNTIME_VERSION = RUNTIME;
process.env.BUILD_SOURCE_MARKER = SOURCE;

const loadedLayers = [];
let installedAt = '';

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

function loadLayer(pathName) {
  const item = { path: pathName, ok: false, at: new Date().toISOString(), error: '' };
  try {
    const mod = require(pathName);
    const result = mod && typeof mod.install === 'function' ? mod.install() : null;
    item.ok = result?.ok !== false;
    item.runtimeVersion = result?.runtimeVersion || mod?.RUNTIME || '';
    item.marker = result?.marker || mod?.MARKER || '';
    item.result = result || null;
  } catch (error) {
    item.ok = false;
    item.error = error?.message || String(error);
    console.warn('[cc7.1-clean-runtime] layer failed:', pathName, item.error);
  }
  loadedLayers.push(item);
  return item;
}

function clientBootstrap() {
  return `;(() => {\ntry {\n  const MARKER='${MARKER}';\n  if (window[MARKER]) return;\n  window[MARKER]=true;\n  const RT='${RUNTIME}';\n  const clean=(v)=>String(v||'').replace(/\\s+/g,' ').trim();\n  const dec=(v)=>{let s=String(v||''); for(let i=0;i<5;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20')); if(d===s) break; s=d;}catch(_){break;}} return s;};\n  const params={commentKey:'',handoff:'',channelId:'',postId:'',title:'',raw:''};\n  const add=(k,v)=>{v=clean(dec(v)); if(!v) return; if((k==='commentKey'||k==='key')&&!params.commentKey) params.commentKey=v; if((k==='handoff'||k==='startapp'||k==='start_param'||k==='WebAppStartParam')&&!params.handoff) params.handoff=v; if((k==='channelId'||k==='channel')&&!params.channelId) params.channelId=v; if((k==='postId'||k==='post_id'||k==='messageId')&&!params.postId) params.postId=v; if((k==='title'||k==='postTitle'||k==='postText')&&!params.title) params.title=v; };\n  const scan=(raw)=>{raw=String(raw||''); if(!raw) return; params.raw+=(params.raw?' ':'')+raw; for(const s0 of [raw,dec(raw)]){ const parts=[s0]; if(s0.includes('?')) parts.push(s0.split('?').slice(1).join('?')); if(s0.includes('#')) parts.push(s0.split('#').slice(1).join('#')); for(const part of parts){try{const p=new URLSearchParams(String(part||'').replace(/^#|^\\?/g,'')); for(const [k,v] of p.entries()) add(k,v);}catch(_){}} const ck=s0.match(/-?\\d{6,}:-?\\d{3,}/); if(ck) add('commentKey',ck[0]); const h=s0.match(/h_[A-Za-z0-9_-]{6,}/); if(h) add('handoff',h[0]); const post=s0.match(/(?:postId|post_id|messageId)[:=](-?\\d{1,})/i); if(post) add('postId',post[1]); const title=s0.match(/\\b(Post\\s*new!!\\s*\\d+!|Post\\s*new\\s*\\d+|Post\\s*zero\\s*\\d+|Post\\s*\\d+|Пост\\s*\\d+)\\b/i); if(title) add('title',title[1]); const n=clean(s0).match(/^\\d{1,4}$/); if(n&&!params.title) add('title','Post '+n[0]); }};\n  try{scan(location.href); scan(location.search); scan(location.hash); scan(document.referrer||'');}catch(_){}\n  const apps=[window.WebApp,window.Telegram&&window.Telegram.WebApp,window.Max&&window.Max.WebApp,window.MAX&&window.MAX.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max&&window.max.WebApp].filter(Boolean);\n  for(const app of apps){try{const u=app.initDataUnsafe||{}; ['start_param','startapp','postId','post_id','commentKey','channelId','title','postTitle'].forEach(k=>add(k,u[k])); scan(app.initData||''); scan(app.startParam||''); scan(app.launchParams||''); scan(app.params||'');}catch(_){}}\n  if(params.commentKey&&params.commentKey.includes(':')){const a=params.commentKey.split(':'); if(!params.channelId) params.channelId=a[0]||''; if(!params.postId) params.postId=a[1]||'';}\n  function sync(){try{const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{if(clean(v))q.set(k,v);}); q.set('t',Date.now()); const xhr=new XMLHttpRequest(); xhr.open('GET','/api/adminkit/comment-open-state?'+q.toString(),false); xhr.setRequestHeader('Cache-Control','no-store'); xhr.send(null); if(xhr.status>=200&&xhr.status<400){return JSON.parse(xhr.responseText||'{}');}}catch(e){return {ok:false,error:String(e&&e.message||e)}} return {ok:false,error:'empty_response'};}\n  const data=sync();\n  const meta=(data&&data.meta)||{};\n  const banner=(meta&&meta.banner)||{};\n  const ctaText=clean(banner.button||banner.text)||'🐋 АдминКИТ';\n  const ctaLink=clean(banner.link)||'https://max.ru/id781310320690_bot?start=menu';\n  window.__ADMINKIT_CC7_INITIAL__={ok:Boolean(data&&data.ok),runtimeVersion:RT,params,meta,comments:data&&data.comments||[],commentsCount:Number(data&&data.commentsCount||0),error:data&&data.error||'',at:new Date().toISOString()};\n  window.__ADMINKIT_CC7_TITLE__=clean(meta.postTitle||params.title);\n  window.__ADMINKIT_CC7_CTA_TEXT__=ctaText;\n  window.__ADMINKIT_CC7_CTA_LINK__=ctaLink;\n  window.__ADMINKIT_CC7_APPLY__=function(refs){try{refs=refs||{}; const st=refs.state; const m=(window.__ADMINKIT_CC7_INITIAL__||{}).meta||{}; if(st&&m){ if(m.commentKey) st.commentKey=m.commentKey; if(m.channelId) st.channelId=m.channelId; if(m.postId) st.postId=m.postId; if(m.postTitle) st.postTitle=m.postTitle; if(m.channelTitle) st.channelTitle=m.channelTitle; st.__adminkitCc7Initial=window.__ADMINKIT_CC7_INITIAL__; } if(refs.postTitle&&window.__ADMINKIT_CC7_TITLE__) refs.postTitle.textContent=window.__ADMINKIT_CC7_TITLE__; if(refs.discussionLabel) refs.discussionLabel.textContent='Начало обсуждения'; if(refs.adminkitDiscussionLink){ refs.adminkitDiscussionLink.textContent=window.__ADMINKIT_CC7_CTA_TEXT__||'🐋 АдминКИТ'; refs.adminkitDiscussionLink.href=window.__ADMINKIT_CC7_CTA_LINK__||'#'; } }catch(e){window.__ADMINKIT_CC7_APPLY_ERROR__=String(e&&e.message||e);}};\n}catch(e){window.__ADMINKIT_CC7_INITIAL__={ok:false,runtimeVersion:'${RUNTIME}',error:String(e&&e.message||e),at:new Date().toISOString()};}\n})();\n`;
}

function patchClientSource(source) {
  let out = String(source || '');
  if (!out.includes(MARKER)) out = clientBootstrap() + out;

  out = out.replace(
    /initBridgeUi\(\);/,
    `initBridgeUi();\ntry { window.__ADMINKIT_CC7_APPLY__ && window.__ADMINKIT_CC7_APPLY__({ state, postTitle, discussionLabel, adminkitDiscussionLink, commentsCountPill }); } catch (e) { window.__ADMINKIT_CC7_APPLY_ERROR__ = String(e && e.message || e); }`
  );

  out = out.replace(/postTitle\.textContent\s*=\s*([`'"])Загрузка\.\.\.\1\s*;/g, 'postTitle.textContent = window.__ADMINKIT_CC7_TITLE__ || "Загрузка...";');
  out = out.replace(/discussionLabel\.textContent\s*=\s*[^;]+;/g, 'discussionLabel.textContent = "Начало обсуждения";');
  out = out.replace(/adminkitDiscussionLink\.textContent\s*=\s*[^;]+;/g, 'adminkitDiscussionLink.textContent = window.__ADMINKIT_CC7_CTA_TEXT__ || "🐋 АдминКИТ";');
  out = out.replace(/adminkitDiscussionLink\.href\s*=\s*[^;]+;/g, 'adminkitDiscussionLink.href = window.__ADMINKIT_CC7_CTA_LINK__ || state.adminkitLink || "https://max.ru/id781310320690_bot?start=menu";');

  return out;
}

function installRoutes(app) {
  if (!app || app.__adminkitCc71CleanRuntimeRoutes) return app;
  app.__adminkitCc71CleanRuntimeRoutes = true;

  registerCommentOpenStateRoutes(app);

  app.get(['/public/app.js', '/app.js'], (req, res, next) => {
    try {
      noCache(res);
      const file = path.resolve(__dirname, 'public', 'app.js');
      res.type('application/javascript; charset=utf-8').send(patchClientSource(fs.readFileSync(file, 'utf8')));
    } catch (error) { next(error); }
  });

  app.get('/debug/cc7', (req, res) => {
    noCache(res);
    res.json({
      ok: true,
      runtimeVersion: RUNTIME,
      sourceMarker: SOURCE,
      marker: MARKER,
      installedAt,
      policy: 'comment_open_state_route_is_external_module_next_step_remove_client_patch',
      loadedLayers,
      commentOpenStateRoute: require('./routes/commentOpenState').selfTest()
    });
  });

  app.get(['/debug/ping', '/debug/version'], (req, res) => {
    noCache(res);
    res.json({ ok: true, service: 'amio-comments-max', runtimeVersion: RUNTIME, buildVersion: RUNTIME, displayVersion: 'CC7.1', sourceMarker: SOURCE, generatedAt: Date.now(), installedAt });
  });

  return app;
}

function installExpressWrap() {
  if (Module.__adminkitCc71CleanRuntimeExpressWrap) return;
  Module.__adminkitCc71CleanRuntimeExpressWrap = true;
  const prev = Module._load;
  Module._load = function adminkitCc71CleanRuntimeLoad(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitCc71CleanRuntimeWrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          return installRoutes(app);
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitCc71CleanRuntimeWrapped = true;
        return wrappedExpress;
      }
    } catch (error) {
      console.warn('[cc7.1-clean-runtime] express wrap skipped:', error?.message || error);
    }
    return loaded;
  };
}

function layerSummary() {
  const failed = loadedLayers.filter(x => !x.ok);
  return {
    runtimeVersion: RUNTIME,
    marker: MARKER,
    total: loadedLayers.length,
    failed: failed.length,
    failedLayers: failed.map(x => ({ path: x.path, error: x.error })),
    loadedLayers,
    uiRedesign: false,
    commentsOpenStateRoute: 'routes/commentOpenState.js',
    commentsMetaService: 'services/postMetaService.js',
    nextStep: 'connect routes directly inside index.js and remove Module._load bridge',
    policy: 'clean_route_connected_current_entrypoint_bridge'
  };
}

function boot() {
  if (global[MARKER]) return;
  global[MARKER] = true;
  installedAt = new Date().toISOString();
  installExpressWrap();

  // Backend-only layers kept temporarily. No old comments repaint/observer layers are loaded here.
  loadLayer('./db-v3-store-comment-guard');
  loadLayer('./db-v3-comment-guard');
  loadLayer('./hard-v3-menu-webhook-router');
  loadLayer('./clean-v3-menu-debug');

  require('./index');
}

boot();

module.exports = { RUNTIME, SOURCE, MARKER, layerSummary };
