'use strict';
const fs = require('fs');
const path = require('path');
const MARK = 'CC4.5-public-final';
function patchText(input) {
  let s = String(input || '');
  s = s.replace(/\n;\(\(\) => \{\n  if \(window\.__ADMINKIT_SP4057_CLEAR_CORE__\)[\s\S]*?\n\}\)\(\);\n?/g, '\n');
  s = s.replace(/function renderLeadMagnet\(growth\) \{[\s\S]*?\n\}\n\nfunction renderTrackedButtons/, 'function renderLeadMagnet(growth) {\n  if (!growthLeadCard) return;\n  growthLeadCard.innerHTML = "";\n  growthLeadCard.classList.add("hidden");\n  growthLeadCard.style.display = "none";\n}\n\nfunction renderTrackedButtons');
  if (s.includes('__AK_CC45_PUBLIC_FINAL__')) return s;
  return s + `\n;(() => {\n  if (window.__AK_CC45_PUBLIC_FINAL__) return;\n  window.__AK_CC45_PUBLIC_FINAL__ = true;\n  let closed = false;\n  function hideOld(){ document.querySelectorAll('#growthLeadCard,.growth-lead-card,.growth-card:not(#ak-cc45-cta),#ak-cc4-cta,#ak-cc3-floating-cta').forEach((e)=>{ if(e.id==='growthLeadCard'){e.innerHTML='';e.classList.add('hidden');e.style.display='none';} else e.remove(); }); }\n  function css(){ if(document.getElementById('ak-cc45-style')) return; const st=document.createElement('style'); st.id='ak-cc45-style'; st.textContent='#ak-cc45-cta{position:fixed;left:50%;bottom:calc(92px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 44px);padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid rgba(255,255,255,.78);box-shadow:0 10px 30px rgba(55,111,180,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font:750 13.5px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#2d6fc7;opacity:.94}.ak-cc45-x{width:22px;height:22px;border:0;border-radius:50%;background:rgba(226,232,240,.55);color:#64748b;font-size:15px}body.miniapp-start-mode #ak-cc45-cta{display:none!important}'; document.head.appendChild(st); }\n  function keyboard(){ const a=document.activeElement; const v=window.visualViewport; const o=v?Math.max(0,(window.innerHeight||0)-((v.height||0)+(v.offsetTop||0))):0; return !!(a&&/INPUT|TEXTAREA/.test(a.tagName||''))||o>40; }\n  function ready(){ try { if(closed||keyboard()||document.body.classList.contains('miniapp-start-mode')) return false; const c=document.getElementById('composerCard'), t=document.getElementById('postTitle'); if(!c||!t) return false; if(getComputedStyle(c).display==='none') return false; if(!(t.textContent||'').trim()) return false; return true; } catch { return false; } }\n  function draw(){ hideOld(); let el=document.getElementById('ak-cc45-cta'); if(!ready()){ if(el) el.remove(); return; } css(); if(!el){ el=document.createElement('div'); el.id='ak-cc45-cta'; el.innerHTML='🐋 <span>Подключить комментарии</span><button class="ak-cc45-x" type="button">×</button>'; el.onclick=(ev)=>{ if(ev.target&&ev.target.classList.contains('ak-cc45-x')){closed=true;el.remove();return;} location.href=(typeof state!=='undefined'&&state.adminkitLink)||'https://max.ru/id781310320690_bot?start=menu'; }; document.body.appendChild(el); } }\n  css(); hideOld(); setTimeout(draw,700); setInterval(draw,1000); document.addEventListener('focusin',draw,true); document.addEventListener('focusout',()=>setTimeout(draw,220),true); window.visualViewport?.addEventListener?.('resize',draw); window.visualViewport?.addEventListener?.('scroll',draw);\n})();\n`;
}
function install() {
  if (fs.__cc45PublicFinal) return;
  fs.__cc45PublicFinal = true;
  const old = fs.readFileSync.bind(fs);
  const appPath = path.resolve(__dirname, 'public', 'app.js');
  fs.readFileSync = function(file, options) {
    const data = old(file, options);
    const textMode = options === 'utf8' || options === 'utf-8' || (options && /utf-?8/i.test(String(options.encoding || '')));
    if (textMode && path.resolve(String(file || '')) === appPath) return patchText(String(data || ''));
    return data;
  };
  console.log('[' + MARK + '] installed after legacy wrappers');
}
install();
module.exports = { install, patchText };
