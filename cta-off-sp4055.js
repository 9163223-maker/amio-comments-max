'use strict';
const http = require('http');
const { URL } = require('url');
const RUNTIME = 'SP40.5.5c';
const state = global.__ADMINKIT_CTA_OFF__ = { runtime: RUNTIME, compact: 0, patched: 0, errors: 0 };
function reply(res, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store, no-cache, must-revalidate',
    'pragma': 'no-cache',
    'expires': '0',
    'x-adminkit-runtime': RUNTIME
  });
  res.end(body);
}
function compactCta() {
  state.compact++;
  return {
    ok: true,
    enabled: true,
    active: true,
    type: 'link',
    icon: '🐋',
    title: 'АдминКИТ',
    text: 'Инструменты автора',
    buttonText: 'Открыть',
    button: 'Открыть',
    url: '',
    ui: { variant: 'compact', backgroundOpacity: 0.32, hideLegacyAuthorButtons: true }
  };
}
const cleanupStyle = '<style data-ak4055c="1">.old-cta,.center-cta,.legacy-cta,[data-old-cta],[data-center-cta],[data-legacy-cta]{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}</style>';
const cleanupScript = '<script data-ak4055c="1">(function(){if(window.__ak4055c)return;window.__ak4055c=1;function hide(){try{var bad=/Подарок автора|Услуги автора/;document.querySelectorAll("body *").forEach(function(e){var t=(e.innerText||e.textContent||"").trim();if(bad.test(t)){e.style.setProperty("display","none","important");e.style.setProperty("visibility","hidden","important");e.style.setProperty("pointer-events","none","important");e.style.setProperty("opacity","0","important");}})}catch(e){}}setInterval(hide,500);setTimeout(hide,80);setTimeout(hide,800);setTimeout(hide,1800);if(document.body)new MutationObserver(function(){clearTimeout(window.__ak4055ct);window.__ak4055ct=setTimeout(hide,80)}).observe(document.body,{childList:true,subtree:true,characterData:true});})();</script>';
function patchBody(buf, headers) {
  const ct = String(headers && (headers['content-type'] || headers['Content-Type']) || '').toLowerCase();
  if (!ct.includes('text/html') && !ct.includes('javascript') && !ct.includes('json')) return buf;
  let s = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
  const before = s;
  s = s.replace(/🎁\s*Подарок автора/g, '').replace(/Подарок автора/g, '').replace(/Услуги автора/g, '');
  if (ct.includes('text/html') && !s.includes('data-ak4055c')) s = s.replace(/<\/head>/i, cleanupStyle + '</head>').replace(/<\/body>/i, cleanupScript + '</body>');
  if (s !== before) state.patched++;
  return Buffer.from(s);
}
const oldCreateServer = http.createServer;
http.createServer = function(listener) {
  return oldCreateServer.call(this, function(req, res) {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch {}
    if (pathname === '/api/promo/cta' || pathname === '/api/cta' || pathname === '/api/floating-cta') return reply(res, compactCta());
    const ow = res.write, oe = res.end, oh = res.writeHead;
    let capture = false, status = 200, headers = {}, chunks = [];
    res.writeHead = function(code, h) {
      status = code || status;
      headers = Object.assign(headers, h || {});
      const ct = String((h && (h['content-type'] || h['Content-Type'])) || res.getHeader('content-type') || '');
      capture = /text\/html|javascript|json/.test(ct);
      if (capture) return res;
      return oh.apply(res, arguments);
    };
    res.write = function(chunk) {
      if (capture && chunk) { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))); return true; }
      return ow.apply(res, arguments);
    };
    res.end = function(chunk) {
      if (capture) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const b = patchBody(Buffer.concat(chunks), headers);
        headers['content-length'] = String(b.length);
        headers['x-adminkit-runtime'] = RUNTIME;
        oh.call(res, status, headers);
        return oe.call(res, b);
      }
      return oe.apply(res, arguments);
    };
    try { return listener(req, res); } catch (e) { state.errors++; throw e; }
  });
};
console.log('[SP40.5.5c compact CTA + legacy cleanup] loaded');
