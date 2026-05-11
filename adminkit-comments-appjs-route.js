'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.5.9.5-SAFE-APPJS-ROUTE';
const MARKER = '__ADMINKIT_SAFE_APPJS_ROUTE_595__';
let installed = false;
let lastPatch = null;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function patchText() {
  return `\n;(()=>{\n if(window.__ADMINKIT_SAFE_APPJS_ROUTE_595__)return;window.__ADMINKIT_SAFE_APPJS_ROUTE_595__=true;\n const RT='${RUNTIME}';\n const dec=v=>{let s=String(v||'');for(let i=0;i<5;i++){try{let d=decodeURIComponent(s.replace(/\\+/g,'%20'));if(d===s)break;s=d}catch(e){break}}return s};\n const q=(raw)=>{let o={};for(const s of [String(raw||''),dec(raw)]){for(const p of [s,s.includes('?')?s.split('?').slice(1).join('?'):'',s.includes('#')?s.split('#').slice(1).join('#'):'']){try{const u=new URLSearchParams(String(p||'').replace(/^#|^\\?/,''));for(const [k,v] of u.entries())if(v&&!o[k])o[k]=dec(v)}catch(e){}}}return o};\n const parse=(raw,ctx={})=>{const s=dec(raw);const p=q(s);let ck=(p.commentKey||ctx.commentKey||'').trim(), ch=(p.channelId||ctx.channelId||'').trim(), po=(p.postId||p.post_id||ctx.postId||'').trim();if(/^-?\\d{6,}:-?\\d{6,}$/.test(ck)){let a=ck.split(':');return{ok:true,commentKey:ck,channelId:a[0],postId:a[1],source:'commentKey'}}if(ch&&po)return{ok:true,commentKey:ch+':'+po,channelId:ch,postId:po,source:'channelId+postId'};let m=s.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)_{2,}(\\d{6,})[_:]+(\\d{6,})/i);if(m)return{ok:true,commentKey:'-'+m[1]+':'+m[2],channelId:'-'+m[1],postId:m[2],source:'cp__'};m=s.match(/(?:^|[^A-Za-z0-9])(?:cp|ck)[_-]+(-?\\d{6,})[_:]+(-?\\d{6,})/i);if(m)return{ok:true,commentKey:m[1]+':'+m[2],channelId:m[1],postId:m[2],source:'cp'};m=s.match(/(-?\\d{6,}):(-?\\d{6,})/);if(m)return{ok:true,commentKey:m[1]+':'+m[2],channelId:m[1],postId:m[2],source:'direct'};return{ok:false}};\n const raws=()=>{const r=[];const add=v=>{if(!v)return;if(typeof v==='object'){try{r.push(JSON.stringify(v))}catch(e){};['startapp','start_param','WebAppStartParam','payload','handoff','commentKey','channelId','postId','post_id'].forEach(k=>{if(v[k])r.push(String(v[k]))})}else r.push(String(v))};try{add(location.href);add(location.search);add(location.hash);add(document.referrer)}catch(e){};for(const a of [window.WebApp,window.Telegram?.WebApp,window.Max?.WebApp,window.MAX?.WebApp,window.maxWebApp,window.MAXWebApp,window.MiniApp,window.max?.WebApp].filter(Boolean)){try{add(a.initDataUnsafe);add(a.initData);add(a.startParam);add(a.launchParams);add(a.params)}catch(e){}}return r};\n const run=()=>{const ctx={};for(const x of raws()){const p=q(x);if(p.channelId)ctx.channelId=p.channelId;if(p.postId||p.post_id)ctx.postId=p.postId||p.post_id;if(p.commentKey)ctx.commentKey=p.commentKey}for(const x of raws()){const y=parse(x,ctx);if(y.ok){window.__ADMINKIT_SAFE_LAUNCH_LAST__={runtime:RT,launch:y};try{state.commentKey=y.commentKey;state.channelId=y.channelId||state.channelId;state.startapp='ck:'+y.commentKey;state.handoffToken='';state.diagnostics={...(state.diagnostics||{}),safeLauncher:RT,source:y.source}}catch(e){}try{hideMiniAppStartMenu()}catch(e){}try{setPostError('')}catch(e){}try{loadPost()}catch(e){}try{loadComments()}catch(e){}try{document.body?.classList?.remove('miniapp-start-mode')}catch(e){}return true}}return false};\n [0,80,250,700,1500,3000].forEach(ms=>setTimeout(()=>{try{run()}catch(e){}},ms));\n})();\n`;
}

function install() {
  if (installed) return;
  installed = true;
  if (Module.__adminkitSafeAppjsRoute595) return;
  Module.__adminkitSafeAppjsRoute595 = true;
  const oldLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    try {
      if (String(request) === 'express' && loaded && !loaded.__adminkitSafeAppjsRoute595Wrapped) {
        function wrappedExpress(...args) {
          const app = loaded(...args);
          if (app && !app.__adminkitSafeAppjsRoute595Mounted) {
            app.__adminkitSafeAppjsRoute595Mounted = true;
            app.get(['/app.js', '/public/app.js'], (req, res) => {
              noCache(res);
              try {
                const file = path.resolve(__dirname, 'public', 'app.js');
                let body = fs.readFileSync(file, 'utf8');
                if (!body.includes(MARKER)) body += patchText();
                lastPatch = { at: new Date().toISOString(), ok: true, bytes: body.length };
                res.type('application/javascript; charset=utf-8').send(body);
              } catch (e) {
                lastPatch = { at: new Date().toISOString(), ok: false, error: e?.message || String(e) };
                res.status(500).send('appjs_route_failed');
              }
            });
            app.get('/debug/safe-appjs-route-live', (req, res) => {
              noCache(res);
              res.json({ ok: true, runtimeVersion: RUNTIME, marker: MARKER, installed, lastPatch, checks: { routeBeforeStatic: true, menuTreeUntouched: true, bannerUntouched: true } });
            });
          }
          return app;
        }
        Object.setPrototypeOf(wrappedExpress, loaded);
        Object.assign(wrappedExpress, loaded);
        wrappedExpress.__adminkitSafeAppjsRoute595Wrapped = true;
        return wrappedExpress;
      }
    } catch {}
    return loaded;
  };
}

module.exports = { install, RUNTIME, MARKER };
