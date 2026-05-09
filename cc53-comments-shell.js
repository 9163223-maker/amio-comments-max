'use strict';

/**
 * CC5.3 comments clean shell.
 * Owns /public/app.js before legacy media overlays so the comments window does not get double-patched.
 */

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC5.3';
const SOURCE = 'adminkit-CC5.3-comments-clean-shell';
const nativeReadFileSync = fs.readFileSync.bind(fs);
const publicAppPath = path.join(__dirname, 'public', 'app.js');
let cachedSource = null;
let cachedMtime = 0;

function noCache(res) {
  try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' }); } catch {}
}

function cleanShellPatch() {
  return `\n;(() => {\n  if (window.__AK_CC53_COMMENTS_SHELL__) return;\n  window.__AK_CC53_COMMENTS_SHELL__ = true;\n  const mark = (name) => { try { performance.mark('ak53:' + name); } catch (_) {} window.__AK_CC53_MARKS__ = window.__AK_CC53_MARKS__ || {}; window.__AK_CC53_MARKS__[name] = Date.now(); };\n  mark('appStart');\n  const css = '#ak53-shell{position:fixed;inset:0;z-index:2147482000;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2937}#ak53-shell .bar{height:44px;border-radius:20px;background:rgba(255,255,255,.74);box-shadow:0 12px 28px rgba(31,111,190,.10);margin-bottom:14px}#ak53-shell .post{height:132px;border-radius:26px;background:rgba(255,255,255,.86);box-shadow:0 18px 44px rgba(31,111,190,.12);margin-bottom:18px}#ak53-shell .label{height:18px;width:160px;border-radius:999px;background:rgba(91,141,205,.18);margin:0 0 12px 8px}#ak53-shell .bubble{height:48px;border-radius:22px;background:rgba(255,255,255,.82);box-shadow:0 10px 26px rgba(31,111,190,.08);margin:10px 46px 0 0}#ak53-shell .bubble.r{margin:10px 0 0 64px}#ak53-shell .composer{margin-top:auto;height:54px;border-radius:22px;background:rgba(255,255,255,.92);box-shadow:0 -10px 34px rgba(31,111,190,.10)}body.ak53-shell-active{background:#f4f9ff!important}body.ak53-shell-active #growthLeadCard,body.ak53-shell-active #trackedButtonsCard,body.ak53-shell-active #pollCard{display:none!important}';\n  const style = document.createElement('style'); style.id = 'ak53-shell-style'; style.textContent = css; (document.head || document.documentElement).appendChild(style);\n  function mount(){\n    if (document.getElementById('ak53-shell') || document.body?.classList?.contains('miniapp-start-mode')) return;\n    document.body?.classList?.add('ak53-shell-active');\n    const el = document.createElement('div'); el.id = 'ak53-shell'; el.setAttribute('aria-hidden','true');\n    el.innerHTML = '<div class="bar"></div><div class="post"></div><div class="label"></div><div class="bubble"></div><div class="bubble r"></div><div class="composer"></div>';\n    document.body.appendChild(el); mark('shellVisible');\n  }\n  function stable(){\n    const shell = document.getElementById('ak53-shell');\n    const hasPost = !!(document.getElementById('postTitle')?.textContent || '').trim();\n    const comments = document.getElementById('commentsList');\n    const visible = comments && getComputedStyle(comments).display !== 'none';\n    if (shell && (hasPost || visible || document.body?.classList?.contains('miniapp-start-mode'))) {\n      shell.remove(); document.body?.classList?.remove('ak53-shell-active'); mark('firstStablePaint');\n    }\n  }\n  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true }); else mount();\n  const timer = setInterval(stable, 120); setTimeout(() => { clearInterval(timer); stable(); const shell=document.getElementById('ak53-shell'); if(shell){shell.remove(); document.body?.classList?.remove('ak53-shell-active'); mark('shellTimeout');}}, 6500);\n  try { new MutationObserver(stable).observe(document.documentElement, { childList:true, subtree:true, characterData:true }); } catch (_) {}\n  window.__AK_CC53_COMMENTS_PERF__ = () => ({ runtime:'${RUNTIME}', sourceMarker:'${SOURCE}', marks: window.__AK_CC53_MARKS__ || {} });\n})();\n`;
}

function buildClientSource() {
  const stat = fs.statSync(publicAppPath);
  if (cachedSource && cachedMtime === Number(stat.mtimeMs || 0)) return cachedSource;
  let source = String(nativeReadFileSync(publicAppPath, 'utf8') || '');
  source = source.replace(/\n;\(\(\) => \{\n  if \(window\.__ADMINKIT_SP4057_CLEAR_CORE__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  source = source.replace(/\n;\(\(\) => \{\n if \(window\.__AK_SP39__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  source = cleanShellPatch() + '\n' + source;
  cachedMtime = Number(stat.mtimeMs || 0);
  cachedSource = source;
  return source;
}

function install(app) {
  if (!app || app.__cc53CommentsShell) return app;
  app.__cc53CommentsShell = true;
  app.get('/public/app.js', (req, res, next) => {
    try { noCache(res); res.type('application/javascript; charset=utf-8').send(buildClientSource()); }
    catch (error) { console.error('[CC5.3 comments shell]', error && error.message ? error.message : error); next(); }
  });
  app.get('/debug/comments-shell', (req, res) => {
    noCache(res);
    let size = 0;
    try { size = Buffer.byteLength(buildClientSource(), 'utf8'); } catch {}
    res.json({ ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, commentsShell: 'enabled', legacyClientPatch: 'stripped_from_app_js_route', appJsBytes: size, generatedAt: Date.now() });
  });
  return app;
}

module.exports = { RUNTIME, SOURCE, install, buildClientSource };
