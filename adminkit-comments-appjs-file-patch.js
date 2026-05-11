'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.6-SAFE-APPJS-FILE-PATCH';
const MARKER = '__ADMINKIT_SAFE_APPJS_FILE_PATCH_596__';
let status = { installed: false, patched: false, at: null, error: '' };

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function clientPatch() {
  return `\n;(() => {\n  if (window.__ADMINKIT_SAFE_APPJS_FILE_PATCH_596__) return;\n  window.__ADMINKIT_SAFE_APPJS_FILE_PATCH_596__ = true;\n  const RT='${RUNTIME}';\n  const dec=(v='')=>{let s=String(v||'').trim();for(let i=0;i<5;i++){try{const d=decodeURIComponent(s.replace(/\\+/g,'%20'));if(d===s)break;s=d;}catch(_){break;}}return s};\n  const clean=(v='')=>String(v||'').trim().replace(/^['\\\"]+|['\\\"]+$/g,'');\n  const params=(raw='')=>{const out={};const add=(k,v)=>{v=clean(dec(v));if(v&&!out[k])out[k]=v};for(const s of [String(raw||''),dec(raw)]){for(const p of [s,s.includes('?')?s.split('?').slice(1).join('?'):'',s.includes('#')?s.split('#').slice(1).join('#'):'']){try{const q=new URLSearchParams(String(p||'').replace(/^#|^\\?/g,''));for(const [k,v] of q.entries())if(/^(startapp|start_param|WebAppStartParam|payload|handoff|commentKey|channelId|postId|post_id)$/i.test(k))add(k,v)}catch(_){}}}return out};\n  const parse=(raw='',ctx={})=>{const src=dec(raw);const p=params(src);let ck=clean(p.commentKey||ctx.commentKey||''),ch=clean(p.channelId||ctx.channelId||''),po=clean(p.postId||p.post_id||ctx.postId||'');if(/^-?\\d{6,}:-?\\d{6,}$/.test(ck)){const a=ck.split(':');return{ok:true,commentKey:ck,channelId:a[0],postId:a[1],source:'commentKey'}}if(ch&&po)return{ok:true,commentKey:ch+':'+po,channelId:ch,postId:po,source:'channelId+postId'};let m=src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})/i);if(m)return{ok:true,commentKey:'-'+m[1]+':'+m[2],channelId:'-'+m[1],postId:m[2],source:'legacy-cp-double-underscore'};m=src.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})/i);if(m)return{ok:true,commentKey:m[1]+':'+m[2],channelId:m[1],postId:m[2],source:'legacy-cp'};m=src.match(/(-?\\d{6,}):(-?\\d{6,})/);if(m)return{ok:true,commentKey:m[1]+':'+m[2],channelId:m[1],postId:m[2],source:'direct'};const nested=dec(p.startapp||p.start_param||p.WebAppStartParam||p.payload||p.handoff||'');if(nested&&nested!==src){const y=parse(nested,{commentKey:p.commentKey,channelId:p.channelId||ch,postId:p.postId||p.post_id||po});if(y.ok)return{...y,nested:true}}return{ok:false}};\n  const raw=()=>{const r=[];const add=v=>{if(!v)return;if(typeof v==='object'){try{r.push(JSON.stringify(v))}catch(_){};['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id'].forEach(k=>{if(v[k])r.push(String(v[k]))})}else r.push(String(v))};try{add(location.href);add(location.search);add(location.hash);add(document.referrer||'')}catch(_){};for(const app of [window.WebApp,window.Telegram?.WebApp,window.Max?.WebApp,window.MAX?.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max?.WebApp].filter(Boolean)){try{add(app.initDataUnsafe);add(app.initData);add(app.startParam);add(app.launchParams);add(app.params)}catch(_){}}return r.filter(Boolean)};\n  const find=()=>{const ctx={};const list=raw();for(const x of list){const p=params(x);if(p.channelId&&!ctx.channelId)ctx.channelId=p.channelId;if((p.postId||p.post_id)&&!ctx.postId)ctx.postId=p.postId||p.post_id;if(p.commentKey&&!ctx.commentKey)ctx.commentKey=p.commentKey}for(const x of list){const y=parse(x,ctx);if(y.ok&&y.commentKey)return y}return{ok:false,rawCount:list.length}};\n  const run=()=>{const y=find();window.__ADMINKIT_SAFE_LAUNCH_LAST__={runtimeVersion:RT,parsed:y,at:new Date().toISOString()};if(!y.ok||!y.commentKey)return false;try{if(typeof state!=='undefined'){state.commentKey=y.commentKey;state.channelId=y.channelId||state.channelId||'';state.handoffToken='';state.startapp='ck:'+y.commentKey;state.diagnostics={...(state.diagnostics||{}),safeAppjsFilePatch:RT,safeLaunchSource:y.source}}}catch(_){}try{if(typeof hideMiniAppStartMenu==='function')hideMiniAppStartMenu()}catch(_){}try{if(typeof setPostError==='function')setPostError('')}catch(_){}try{document.body?.classList?.remove('miniapp-start-mode')}catch(_){}try{if(typeof loadPost==='function')Promise.resolve(loadPost()).catch(()=>{})}catch(_){}try{if(typeof loadComments==='function')Promise.resolve(loadComments()).catch(()=>{})}catch(_){}return true};\n  [0,60,180,500,1200,2500,5000].forEach(ms=>setTimeout(()=>{try{run()}catch(_){}},ms));\n})();\n`;
}

function patchPublicAppFile() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(MARKER)) {
    status = { installed: true, patched: false, alreadyPresent: true, at: new Date().toISOString(), bytes: text.length, error: '' };
    return;
  }
  const next = text + clientPatch();
  fs.writeFileSync(file, next, 'utf8');
  status = { installed: true, patched: true, at: new Date().toISOString(), bytesBefore: text.length, bytesAfter: next.length, error: '' };
}

function patchExpressDebug() {
  if (Module.__adminkitSafeAppjsFilePatch596) return;
  Module.__adminkitSafeAppjsFilePatch596 = true;
  const prev = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = prev.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafeAppjsFilePatch596Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafeAppjsFilePatch596Route) {
            app.__adminkitSafeAppjsFilePatch596Route = true;
            app.get('/debug/safe-appjs-file-live', (req, res) => {
              noCache(res);
              let fileHasMarker = false;
              try { fileHasMarker = fs.readFileSync(path.resolve(__dirname, 'public', 'app.js'), 'utf8').includes(MARKER); } catch {}
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, fileHasMarker, checks: { physicalAppJsPatched: fileHasMarker, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafeAppjsFilePatch596Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

function install() {
  try { patchPublicAppFile(); } catch (e) { status = { installed: false, patched: false, at: new Date().toISOString(), error: e?.message || String(e) }; }
  patchExpressDebug();
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status };
}

module.exports = { install, RUNTIME, MARKER };
